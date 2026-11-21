// ユーザー（チームメンバー）一覧取得および新規追加API
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getDb, getUserAccessibleProjectIds, setUserProjects } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";
import {
  MAX_LENGTHS,
  MIN_LENGTHS,
  validateHexColor,
  validateLoginId,
  validateMaxLength,
  validatePassword,
} from "@/lib/validation";

// メンバー一覧の取得（要ログインセッション・担当課題数の集計および所属プロジェクト情報付き・パスワードは除外）
export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const db = getDb();
    const accessibleProjectIds = getUserAccessibleProjectIds(
      db,
      sessionUser.id,
      sessionUser.role_type,
      sessionUser.is_admin
    );
    const accessibleSet = accessibleProjectIds === null ? null : new Set(accessibleProjectIds);

    const rawUsers = db.prepare(`
      SELECT 
        u.id,
        u.login_id,
        u.name,
        u.role,
        u.is_admin,
        u.role_type,
        u.color,
        u.week_start,
        u.show_holidays,
        COALESCE(u.totp_enabled, 0) AS totp_enabled,
        u.created_at,
        COUNT(i.id) AS issue_count,
        SUM(CASE WHEN i.id IS NOT NULL AND i.status != 'closed' THEN 1 ELSE 0 END) AS open_issue_count
      FROM users u
      LEFT JOIN issues i ON u.id = i.assignee_id
      GROUP BY u.id
      ORDER BY u.id ASC
    `).all() as any[];

    // 各ユーザーの所属プロジェクト一覧を取得してマッピング（Admin以外は自身が閲覧可能なプロジェクトのみ公開）
    const userProjectsStmt = db.prepare(`
      SELECT p.id, p.key, p.name, p.color, COALESCE(p.is_archived, 0) AS is_archived
      FROM project_members pm
      JOIN projects p ON pm.project_id = p.id
      WHERE pm.user_id = ?
      ORDER BY p.is_archived ASC, p.id ASC
    `);

    const users = rawUsers.map((u) => {
      const allUserProjects = userProjectsStmt.all(u.id) as { id: number }[];
      const visibleProjects =
        accessibleSet === null
          ? allUserProjects
          : allUserProjects.filter((p) => accessibleSet.has(Number(p.id)));
      return {
        ...u,
        projects: visibleProjects,
        project_count: visibleProjects.length,
      };
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("ユーザー一覧取得エラー:", error);
    return NextResponse.json({ error: "メンバー一覧の取得に失敗しました" }, { status: 500 });
  }
}

// メンバーの新規登録（Admin管理者またはPMOが実行可能。ただしAdmin権限の付与はAdminのみ）
export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }
    const isAdmin = sessionUser.is_admin === 1;
    const isPmo = sessionUser.role_type === "pmo";
    if (!isAdmin && !isPmo) {
      return NextResponse.json(
        { error: "メンバーの追加には管理者（Admin）またはPMO権限が必要です" },
        { status: 403 }
      );
    }

    const db = getDb();
    const body = await request.json();
    const {
      loginId,
      password,
      name,
      role = "メンバー",
      isAdmin: reqIsAdmin = false,
      roleType,
      color = "#4f46e5",
      weekStart = "monday",
      showHolidays = true,
      projectIds,
    } = body;

    // PMOによるシステム管理者（Admin）権限付与は禁止
    if (!isAdmin && (roleType === "admin" || reqIsAdmin)) {
      return NextResponse.json(
        { error: "システム管理者（Admin）権限の付与はAdminのみ実行できます" },
        { status: 403 }
      );
    }

    // PMOが指定できる所属プロジェクトは、PMO自身が参加しているプロジェクトのみに制限
    if (!isAdmin && Array.isArray(projectIds) && projectIds.length > 0) {
      const accessibleIds = getUserAccessibleProjectIds(
        db,
        sessionUser.id,
        sessionUser.role_type,
        sessionUser.is_admin
      );
      const accessibleSet = new Set(accessibleIds || []);
      const unauthorizedProjectId = projectIds
        .map(Number)
        .filter(Boolean)
        .find((pid) => !accessibleSet.has(pid));
      if (unauthorizedProjectId !== undefined) {
        return NextResponse.json(
          { error: "参加していないプロジェクトへメンバーを追加する権限はありません" },
          { status: 403 }
        );
      }
    }

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "メンバー名は必須です" }, { status: 400 });
    }
    const cleanName = String(name).trim();
    const nameLengthErr = validateMaxLength(cleanName, MAX_LENGTHS.USER_NAME, "メンバー名");
    if (nameLengthErr) {
      return NextResponse.json({ error: nameLengthErr }, { status: 400 });
    }

    const cleanLoginId = loginId && String(loginId).trim()
      ? String(loginId).trim().toLowerCase()
      : `user_${Date.now()}`;
    const loginIdErr = validateLoginId(cleanLoginId);
    if (loginIdErr) {
      return NextResponse.json({ error: loginIdErr }, { status: 400 });
    }

    // ログインIDの重複チェック
    const existing = db
      .prepare("SELECT id FROM users WHERE LOWER(login_id) = LOWER(?)")
      .get(cleanLoginId);
    if (existing) {
      return NextResponse.json(
        { error: `ログインID「${cleanLoginId}」は既に使用されています` },
        { status: 400 }
      );
    }

    // パスワード省略時は推測不可能なランダムパスワードを自動生成（招待リンク受諾前の第三者ログインを防止）
    const hasExplicitPassword = password !== undefined && password !== null && String(password).trim() !== "";
    const rawPassword = hasExplicitPassword
      ? String(password).trim()
      : crypto.randomBytes(16).toString("base64url");
    if (hasExplicitPassword) {
      const passwordErr = validatePassword(rawPassword, MIN_LENGTHS.PASSWORD_DEFAULT);
      if (passwordErr) {
        return NextResponse.json({ error: passwordErr }, { status: 400 });
      }
    }
    const hashedPassword = hashPassword(rawPassword);

    const cleanColor = color ? String(color).trim() : "#4f46e5";
    const colorErr = validateHexColor(cleanColor);
    if (colorErr) {
      return NextResponse.json({ error: colorErr }, { status: 400 });
    }

    const cleanWeekStart = weekStart === "sunday" ? "sunday" : "monday";
    const cleanShowHolidays = showHolidays === false || showHolidays === 0 ? 0 : 1;

    // 3段階ロール（admin / pmo / member）の正規化
    const effectiveRoleType =
      roleType === "admin" || reqIsAdmin
        ? "admin"
        : roleType === "pmo"
        ? "pmo"
        : "member";
    const effectiveIsAdmin = effectiveRoleType === "admin" ? 1 : 0;
    const defaultRoleLabel =
      effectiveRoleType === "admin"
        ? "管理者"
        : effectiveRoleType === "pmo"
        ? "PMO"
        : "メンバー";

    const cleanRole = (role ? String(role) : defaultRoleLabel).trim() || defaultRoleLabel;
    const roleLengthErr = validateMaxLength(cleanRole, MAX_LENGTHS.USER_ROLE, "役割");
    if (roleLengthErr) {
      return NextResponse.json({ error: roleLengthErr }, { status: 400 });
    }

    const insert = db.prepare(`
      INSERT INTO users (login_id, password, name, role, is_admin, role_type, color, week_start, show_holidays)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insert.run(
      cleanLoginId,
      hashedPassword,
      cleanName,
      cleanRole,
      effectiveIsAdmin,
      effectiveRoleType,
      cleanColor,
      cleanWeekStart,
      cleanShowHolidays
    );

    const newUserId = Number(result.lastInsertRowid);

    // 所属プロジェクトの登録（実在するプロジェクトIDのみ安全に登録）
    if (Array.isArray(projectIds) && projectIds.length > 0) {
      setUserProjects(
        db,
        newUserId,
        projectIds.map(Number).filter(Boolean)
      );
    }

    const created = db.prepare(`
      SELECT 
        u.id,
        u.login_id,
        u.name,
        u.role,
        u.is_admin,
        u.role_type,
        u.color,
        u.week_start,
        u.show_holidays,
        COALESCE(u.totp_enabled, 0) AS totp_enabled,
        u.created_at,
        0 AS issue_count,
        0 AS open_issue_count
      FROM users u
      WHERE u.id = ?
    `).get(result.lastInsertRowid);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("ユーザー追加エラー:", error);
    return NextResponse.json({ error: "メンバーの追加に失敗しました" }, { status: 500 });
  }
}
