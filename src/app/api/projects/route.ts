// プロジェクト一覧取得・新規作成API
import { NextResponse } from "next/server";
import { getDb, getUserAccessibleProjectIds } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// プロジェクト一覧取得（課題件数およびメンバー情報の集計付き）
export async function GET(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    const { searchParams } = new URL(request.url);
    const forceAll = searchParams.get("all") === "1";

    const db = getDb();
    const isSpecialUser = sessionUser?.is_admin === 1 || sessionUser?.role_type === "pmo";

    // 一般メンバーの場合（かつ管理者/PMOの強制全件取得でない場合）は参加中プロジェクトに限定
    const limitToUser = !isSpecialUser && sessionUser && !forceAll ? sessionUser.id : null;

    let query = `
      SELECT 
        p.id,
        p.key,
        p.name,
        p.color,
        COALESCE(p.is_archived, 0) AS is_archived,
        p.created_at,
        COUNT(DISTINCT i.id) AS total_issues,
        SUM(CASE WHEN i.status != 'closed' THEN 1 ELSE 0 END) AS active_issues,
        COUNT(DISTINCT pm.user_id) AS member_count
      FROM projects p
      LEFT JOIN issues i ON p.id = i.project_id
      LEFT JOIN project_members pm ON p.id = pm.project_id
    `;

    const params: (number | string)[] = [];
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
      ORDER BY p.is_archived ASC, p.created_at ASC
    `;

    const rawProjects = db.prepare(query).all(...params) as {
      id: number;
      key: string;
      name: string;
      color: string;
      is_archived: number;
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

    // キーは大文字英数字に正規化
    const normalizedKey = String(key).trim().toUpperCase();
    if (!/^[A-Z0-9_]{1,15}$/.test(normalizedKey)) {
      return NextResponse.json(
        { error: "プロジェクトキーは半角英数字（1〜15文字）で指定してください" },
        { status: 400 }
      );
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
    const result = insert.run(normalizedKey, String(name).trim(), color || "#4f46e5");
    const newProjectId = Number(result.lastInsertRowid);

    // プロジェクト作成時にAdmin/PMOおよび指定メンバーを project_members に登録
    const targetUserIds = new Set<number>();
    targetUserIds.add(sessionUser.id);

    // Admin / PMO は自動的に追加
    const adminAndPmo = db
      .prepare("SELECT id FROM users WHERE is_admin = 1 OR role_type IN ('admin', 'pmo')")
      .all() as { id: number }[];
    for (const ap of adminAndPmo) {
      targetUserIds.add(ap.id);
    }

    // 指定メンバーがあれば追加
    if (Array.isArray(memberIds)) {
      for (const mid of memberIds) {
        if (Number(mid)) targetUserIds.add(Number(mid));
      }
    }

    const pmInsert = db.prepare("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)");
    for (const uid of targetUserIds) {
      pmInsert.run(newProjectId, uid);
    }

    const created = db.prepare("SELECT * FROM projects WHERE id = ?").get(newProjectId);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("プロジェクト作成エラー:", error);
    return NextResponse.json({ error: "プロジェクトの作成に失敗しました" }, { status: 500 });
  }
}
