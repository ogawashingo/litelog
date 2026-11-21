// プロジェクト一覧取得・新規作成API
import { NextResponse } from "next/server";
import { getDb, setProjectMembers } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { MAX_LENGTHS, validateHexColor, validateMaxLength, validateProjectKey } from "@/lib/validation";

// プロジェクト一覧取得（課題件数およびメンバー情報の集計付き・要ログインセッション）
export async function GET(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const forceAll = searchParams.get("all") === "1";

    const db = getDb();
    // 管理者（Admin）のみ全件取得（all=1）を許可。PMOや一般メンバーはall=1が指定されても参加プロジェクトのみに限定
    const isAdmin = sessionUser.is_admin === 1 || sessionUser.role_type === "admin";
    const limitToUser = isAdmin && forceAll ? null : sessionUser.id;

    // ログインユーザーのピン留め情報を結合して取得し、ピン留め済みプロジェクトを先頭に並べる
    const currentUserId = sessionUser.id;
    const params: (number | string)[] = [];

    let query = `
      SELECT 
        p.id,
        p.key,
        p.name,
        p.color,
        COALESCE(p.is_archived, 0) AS is_archived,
        ${currentUserId !== null ? "MAX(COALESCE(my_pm.is_pinned, 0))" : "0"} AS is_pinned,
        ${currentUserId !== null ? "MAX(my_pm.pinned_at)" : "NULL"} AS pinned_at,
        p.created_at,
        COUNT(DISTINCT i.id) AS total_issues,
        -- project_membersとの結合による重複カウントを防ぐため、DISTINCTでユニーク課題IDを集計
        COUNT(DISTINCT CASE WHEN i.status != 'closed' THEN i.id END) AS active_issues,
        COUNT(DISTINCT pm.user_id) AS member_count
      FROM projects p
      LEFT JOIN issues i ON p.id = i.project_id
      LEFT JOIN project_members pm ON p.id = pm.project_id
    `;

    if (currentUserId !== null) {
      query += `
        LEFT JOIN project_members my_pm ON p.id = my_pm.project_id AND my_pm.user_id = ?
      `;
      params.push(currentUserId);
    }

    if (limitToUser) {
      query += `
        WHERE p.id IN (
          SELECT project_id FROM project_members WHERE user_id = ?
        )
      `;
      params.push(limitToUser);
    }

    query += `
      GROUP BY p.id
      ORDER BY p.is_archived ASC, is_pinned DESC, pinned_at ASC, p.created_at ASC
    `;

    const rawProjects = db.prepare(query).all(...params) as {
      id: number;
      key: string;
      name: string;
      color: string;
      is_archived: number;
      is_pinned: number;
      pinned_at: string | null;
      created_at: string;
      total_issues: number;
      active_issues: number;
      member_count: number;
    }[];

    // 各プロジェクトの参加メンバー情報（上位5名程度のアバター表示用）を付与
    const membersStmt = db.prepare(`
      SELECT u.id, u.name, u.login_id, u.color, u.role, u.role_type, u.is_admin
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = ?
      ORDER BY u.is_admin DESC, u.role_type = 'pmo' DESC, u.id ASC
    `);

    const projects = rawProjects.map((proj) => {
      const members = membersStmt.all(proj.id) as {
        id: number;
        name: string;
        login_id: string;
        color: string;
        role: string;
        role_type: string;
        is_admin: number;
      }[];
      return {
        ...proj,
        members,
        member_count: members.length,
      };
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error("プロジェクト取得エラー:", error);
    return NextResponse.json({ error: "プロジェクトの取得に失敗しました" }, { status: 500 });
  }
}

// プロジェクト新規作成（Admin管理者またはPMOが実行可能）
export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }
    if (sessionUser.is_admin !== 1 && sessionUser.role_type !== "pmo") {
      return NextResponse.json(
        { error: "新規プロジェクトの作成は管理者（Admin）またはPMOのみ実行できます" },
        { status: 403 }
      );
    }

    const db = getDb();
    const body = await request.json();
    const { key, name, color, memberIds } = body;

    if (!key || !name || !String(key).trim() || !String(name).trim()) {
      return NextResponse.json({ error: "プロジェクトキーと名称は必須です" }, { status: 400 });
    }

    const cleanName = String(name).trim();
    const nameLengthErr = validateMaxLength(cleanName, MAX_LENGTHS.PROJECT_NAME, "プロジェクト名");
    if (nameLengthErr) {
      return NextResponse.json({ error: nameLengthErr }, { status: 400 });
    }

    // キーは大文字英数字に正規化
    const normalizedKey = String(key).trim().toUpperCase();
    const keyErr = validateProjectKey(normalizedKey);
    if (keyErr) {
      return NextResponse.json({ error: keyErr }, { status: 400 });
    }

    const cleanColor = color ? String(color).trim() : "#4f46e5";
    const colorErr = validateHexColor(cleanColor);
    if (colorErr) {
      return NextResponse.json({ error: colorErr }, { status: 400 });
    }

    // 重複チェック
    const existing = db.prepare("SELECT id FROM projects WHERE key = ?").get(normalizedKey);
    if (existing) {
      return NextResponse.json({ error: "同じプロジェクトキーが既に存在します" }, { status: 409 });
    }

    const insert = db.prepare(`
      INSERT INTO projects (key, name, color)
      VALUES (?, ?, ?)
    `);
    const result = insert.run(normalizedKey, cleanName, cleanColor);
    const newProjectId = Number(result.lastInsertRowid);

    // プロジェクト作成時にAdminおよび指定メンバーを project_members に登録
    const targetUserIds = new Set<number>();
    targetUserIds.add(sessionUser.id);

    // Admin（管理者）は自動的に追加
    const admins = db
      .prepare("SELECT id FROM users WHERE is_admin = 1 OR role_type = 'admin'")
      .all() as { id: number }[];
    for (const adm of admins) {
      targetUserIds.add(adm.id);
    }

    // 指定メンバーがあれば追加
    if (Array.isArray(memberIds)) {
      for (const mid of memberIds) {
        if (Number(mid)) targetUserIds.add(Number(mid));
      }
    }

    // 実在するユーザーIDのみ安全に登録
    setProjectMembers(db, newProjectId, Array.from(targetUserIds));

    const created = db.prepare("SELECT * FROM projects WHERE id = ?").get(newProjectId);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("プロジェクト作成エラー:", error);
    return NextResponse.json({ error: "プロジェクトの作成に失敗しました" }, { status: 500 });
  }
}
