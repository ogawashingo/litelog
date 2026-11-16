// プロジェクト一覧取得・新規作成API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// プロジェクト一覧取得（課題件数の集計付き）
export async function GET() {
  try {
    const db = getDb();
    const query = `
      SELECT 
        p.id,
        p.key,
        p.name,
        p.color,
        COALESCE(p.is_archived, 0) AS is_archived,
        p.created_at,
        COUNT(i.id) AS total_issues,
        SUM(CASE WHEN i.status != 'closed' THEN 1 ELSE 0 END) AS active_issues
      FROM projects p
      LEFT JOIN issues i ON p.id = i.project_id
      GROUP BY p.id
      ORDER BY p.is_archived ASC, p.created_at ASC
    `;
    const projects = db.prepare(query).all();
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
    const { key, name, color } = body;

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

    const created = db.prepare("SELECT * FROM projects WHERE id = ?").get(result.lastInsertRowid);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("プロジェクト作成エラー:", error);
    return NextResponse.json({ error: "プロジェクトの作成に失敗しました" }, { status: 500 });
  }
}
