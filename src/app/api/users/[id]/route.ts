// ユーザー（チームメンバー）更新・削除API
import { NextResponse } from "next/server";
import { getDb, getUserAccessibleProjectIds, setUserProjects } from "@/lib/db";
import { getSessionUser, hashPassword, verifyPassword } from "@/lib/auth";
import {
  MAX_LENGTHS,
  MIN_LENGTHS,
  validateHexColor,
  validateLoginId,
  validateMaxLength,
  validatePassword,
} from "@/lib/validation";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// メンバー情報の更新（Admin管理者は全メンバー編集可、一般ユーザーは自身の表示名・色・本人照合付きパスワードのみ変更可）
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id } = await params;
    const targetId = Number(id);
    if (!targetId || isNaN(targetId)) {
      return NextResponse.json({ error: "無効なメンバーIDです" }, { status: 400 });
    }

    const isAdmin = sessionUser.is_admin === 1;
    const isPmo = sessionUser.role_type === "pmo";
    const canManageMember = isAdmin || isPmo;
    const isSelf = sessionUser.id === targetId;

    if (!canManageMember && !isSelf) {
      return NextResponse.json(
        { error: "他のメンバーのアカウント情報は変更できません" },
        { status: 403 }
      );
    }

    const db = getDb();
    const body = await request.json();

    const targetUser = db.prepare("SELECT * FROM users WHERE id = ?").get(targetId) as {
      id: number;
      name: string;
      password: string;
      is_admin: number;
      role_type?: string;
    } | undefined;
    if (!targetUser) {
      return NextResponse.json({ error: "対象のメンバーが見つかりません" }, { status: 404 });
    }

    // PMOはシステム管理者（Admin）アカウントの編集や、Admin権限の付与は不可
    if (isPmo && !isAdmin) {
      if (targetUser.is_admin === 1 || targetUser.role_type === "admin") {
        return NextResponse.json(
          { error: "システム管理者（Admin）のアカウント情報は変更できません" },
          { status: 403 }
        );
      }
      if (body.isAdmin === true || body.isAdmin === 1 || body.roleType === "admin") {
        return NextResponse.json(
          { error: "システム管理者（Admin）権限の付与はAdminのみ実行できます" },
          { status: 403 }
        );
      }
    }

    // 一般ユーザーが権限(isAdmin/roleType)・ログインID・ロールを変更しようとした場合は拒否
    if (!canManageMember) {
      if (
        body.isAdmin !== undefined ||
        body.roleType !== undefined ||
        body.loginId !== undefined ||
        body.role !== undefined
      ) {
        return NextResponse.json(
          { error: "ログインID・役割・権限ロールの変更には管理者（Admin）またはPMO権限が必要です" },
          { status: 403 }
        );
      }
      // 一般ユーザーが currentPassword なしで直接 password を指定した場合も拒否
      if (body.password !== undefined && body.currentPassword === undefined) {
        return NextResponse.json(
          { error: "パスワードを変更する場合は現在のパスワードを入力してください" },
          { status: 400 }
        );
      }
    }

    // 本人によるパスワード変更（currentPassword / newPassword 指定時）は現在のパスワードをハッシュ照合
    let hashedPasswordToUpdate: string | null = null;
    if (body.currentPassword !== undefined || body.newPassword !== undefined) {
      if (!body.currentPassword || !verifyPassword(String(body.currentPassword), targetUser.password)) {
        return NextResponse.json(
          { error: "現在のパスワードが正しくありません" },
          { status: 400 }
        );
      }
      const nextPw = String(body.newPassword ?? body.password ?? "").trim();
      const pwErr = validatePassword(nextPw, MIN_LENGTHS.PASSWORD_DEFAULT, "新しいパスワード");
      if (pwErr) {
        return NextResponse.json({ error: pwErr }, { status: 400 });
      }
      if (verifyPassword(nextPw, targetUser.password)) {
        return NextResponse.json(
          { error: "新しいパスワードには現在のパスワードと異なるものを指定してください" },
          { status: 400 }
        );
      }
      hashedPasswordToUpdate = hashPassword(nextPw);
    } else if (canManageMember && body.password !== undefined && String(body.password).trim() !== "") {
      // AdminまたはPMOによるメンバー管理画面からのパスワード変更
      const nextAdminPw = String(body.password).trim();
      const pwErr = validatePassword(nextAdminPw, MIN_LENGTHS.PASSWORD_DEFAULT, "パスワード");
      if (pwErr) {
        return NextResponse.json({ error: pwErr }, { status: 400 });
      }
      hashedPasswordToUpdate = hashPassword(nextAdminPw);
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (canManageMember && body.loginId !== undefined) {
      const cleanLoginId = String(body.loginId).trim().toLowerCase();
      if (!cleanLoginId) {
        return NextResponse.json({ error: "ログインIDは空にできません" }, { status: 400 });
      }
      const loginIdErr = validateLoginId(cleanLoginId);
      if (loginIdErr) {
        return NextResponse.json({ error: loginIdErr }, { status: 400 });
      }
      const dup = db
        .prepare("SELECT id FROM users WHERE LOWER(login_id) = LOWER(?) AND id != ?")
        .get(cleanLoginId, targetId);
      if (dup) {
        return NextResponse.json(
          { error: `ログインID「${cleanLoginId}」は既に使用されています` },
          { status: 400 }
        );
      }
      updates.push("login_id = ?");
      values.push(cleanLoginId);
    }
    if (hashedPasswordToUpdate !== null) {
      updates.push("password = ?");
      values.push(hashedPasswordToUpdate);
    }
    if (body.name !== undefined) {
      const cleanName = String(body.name).trim();
      if (!cleanName) {
        return NextResponse.json({ error: "メンバー名は空にできません" }, { status: 400 });
      }
      const nameLengthErr = validateMaxLength(cleanName, MAX_LENGTHS.USER_NAME, "メンバー名");
      if (nameLengthErr) {
        return NextResponse.json({ error: nameLengthErr }, { status: 400 });
      }
      updates.push("name = ?");
      values.push(cleanName);
    }
    if (canManageMember && body.role !== undefined) {
      const cleanRole = String(body.role).trim() || "メンバー";
      const roleLengthErr = validateMaxLength(cleanRole, MAX_LENGTHS.USER_ROLE, "役割");
      if (roleLengthErr) {
        return NextResponse.json({ error: roleLengthErr }, { status: 400 });
      }
      updates.push("role = ?");
      values.push(cleanRole);
    }
    if (canManageMember && (body.roleType !== undefined || body.isAdmin !== undefined)) {
      let nextRoleType: string;
      let nextAdmin: number;
      if (body.roleType !== undefined) {
        nextRoleType =
          body.roleType === "admin"
            ? "admin"
            : body.roleType === "pmo"
            ? "pmo"
            : "member";
        nextAdmin = nextRoleType === "admin" ? 1 : 0;
      } else {
        nextAdmin = body.isAdmin ? 1 : 0;
        nextRoleType = nextAdmin === 1 ? "admin" : targetUser.role_type === "pmo" ? "pmo" : "member";
      }

      const isTargetAdmin = targetUser.is_admin === 1 || targetUser.role_type === "admin";
      if (isTargetAdmin && nextAdmin === 0) {
        const adminCountRow = db
          .prepare("SELECT COUNT(*) as count FROM users WHERE is_admin = 1 OR role_type = 'admin'")
          .get() as { count: number };
        if (adminCountRow.count <= 1) {
          return NextResponse.json(
            { error: "最低1名のシステム管理者（Admin）が必要なため、管理者権限を解除できません" },
            { status: 400 }
          );
        }
      }
      updates.push("is_admin = ?");
      values.push(nextAdmin);
      updates.push("role_type = ?");
      values.push(nextRoleType);
    }
    if (body.color !== undefined) {
      const cleanColor = String(body.color).trim();
      const colorErr = validateHexColor(cleanColor);
      if (colorErr) {
        return NextResponse.json({ error: colorErr }, { status: 400 });
      }
      updates.push("color = ?");
      values.push(cleanColor);
    }
    const incomingWeekStart = body.weekStart ?? body.week_start;
    if (incomingWeekStart !== undefined) {
      const cleanWeekStart = incomingWeekStart === "sunday" ? "sunday" : "monday";
      updates.push("week_start = ?");
      values.push(cleanWeekStart);
    }
    const incomingShowHolidays = body.showHolidays ?? body.show_holidays;
    if (incomingShowHolidays !== undefined) {
      updates.push("show_holidays = ?");
      values.push(incomingShowHolidays === false || incomingShowHolidays === 0 ? 0 : 1);
    }

    if (updates.length > 0) {
      values.push(targetId);
      db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }

    // 所属プロジェクトの更新（Adminは全プロジェクト同期可能。PMOは自身が参加しているプロジェクトの範囲内のみ変更可能）
    if (canManageMember && Array.isArray(body.projectIds)) {
      const requestedProjectIds: number[] = Array.from(
        new Set<number>(body.projectIds.map((pid: unknown) => Number(pid)))
      ).filter(Boolean);
      if (isAdmin) {
        setUserProjects(db, targetId, requestedProjectIds);
      } else {
        // PMO自身がアクセス可能なプロジェクトID一覧と、対象ユーザーの現在の所属プロジェクトを取得
        const pmoAccessibleIds = getUserAccessibleProjectIds(
          db,
          sessionUser.id,
          sessionUser.role_type,
          sessionUser.is_admin
        );
        const pmoAccessibleSet = new Set(pmoAccessibleIds || []);
        const currentTargetProjectIds = (
          db.prepare("SELECT project_id FROM project_members WHERE user_id = ?").all(targetId) as {
            project_id: number;
          }[]
        ).map((r) => Number(r.project_id));
        const currentTargetSet = new Set(currentTargetProjectIds);

        // PMOが参加していないプロジェクトへ新たに追加しようとした場合は拒否（権限昇格防止）
        const unauthorizedAddition = requestedProjectIds.find(
          (pid) => !pmoAccessibleSet.has(pid) && !currentTargetSet.has(pid)
        );
        if (unauthorizedAddition !== undefined) {
          return NextResponse.json(
            { error: "参加していないプロジェクトへメンバーを追加する権限はありません" },
            { status: 403 }
          );
        }

        // PMOから見えない既存の所属プロジェクトはそのまま保持し、PMO参加プロジェクト分のみ同期
        const preservedHiddenIds = currentTargetProjectIds.filter((pid) => !pmoAccessibleSet.has(pid));
        const allowedRequestedIds = requestedProjectIds.filter((pid) => pmoAccessibleSet.has(pid));
        setUserProjects(db, targetId, [...preservedHiddenIds, ...allowedRequestedIds]);
      }
    }

    const updated = db.prepare(`
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
      WHERE u.id = ?
      GROUP BY u.id
    `).get(targetId) as any;

    if (updated) {
      const accessibleIds = getUserAccessibleProjectIds(
        db,
        sessionUser.id,
        sessionUser.role_type,
        sessionUser.is_admin
      );
      const accessibleSet = accessibleIds === null ? null : new Set(accessibleIds);
      const allProjects = db.prepare(`
        SELECT p.id, p.key, p.name, p.color, COALESCE(p.is_archived, 0) AS is_archived
        FROM project_members pm
        JOIN projects p ON pm.project_id = p.id
        WHERE pm.user_id = ?
        ORDER BY p.is_archived ASC, p.id ASC
      `).all(targetId) as { id: number }[];
      updated.projects =
        accessibleSet === null
          ? allProjects
          : allProjects.filter((p) => accessibleSet.has(Number(p.id)));
      updated.project_count = updated.projects.length;
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("メンバー更新エラー:", error);
    return NextResponse.json({ error: "メンバー情報の更新に失敗しました" }, { status: 500 });
  }
}

// メンバーの削除（Admin管理者のみ実行可能）
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }
    if (sessionUser.is_admin !== 1) {
      return NextResponse.json(
        { error: "メンバーの削除には管理者（Admin）権限が必要です" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const targetId = Number(id);
    const db = getDb();

    const totalRow = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    if (totalRow.count <= 1) {
      return NextResponse.json({ error: "最低1名のメンバーが必要なため削除できません" }, { status: 400 });
    }

    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(targetId) as {
      id: number;
      is_admin: number;
      role_type?: string;
    } | undefined;
    if (!target) {
      return NextResponse.json({ error: "対象のメンバーが見つかりません" }, { status: 404 });
    }

    const isTargetAdmin = target.is_admin === 1 || target.role_type === "admin";
    if (isTargetAdmin) {
      const adminCountRow = db
        .prepare("SELECT COUNT(*) as count FROM users WHERE is_admin = 1 OR role_type = 'admin'")
        .get() as { count: number };
      if (adminCountRow.count <= 1) {
        return NextResponse.json(
          { error: "最後の管理者（Admin）は削除できません" },
          { status: 400 }
        );
      }
    }

    db.prepare("DELETE FROM users WHERE id = ?").run(targetId);
    return NextResponse.json({ success: true, message: "メンバーを削除しました" });
  } catch (error) {
    console.error("メンバー削除エラー:", error);
    return NextResponse.json({ error: "メンバーの削除に失敗しました" }, { status: 500 });
  }
}
