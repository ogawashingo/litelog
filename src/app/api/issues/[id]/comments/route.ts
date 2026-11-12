// 課題コメントAPI
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// コメント一覧取得
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();
    const comments = db.prepare(`
      SELECT 
        c.*,
        u.name AS user_name,
        u.color AS user_color
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.issue_id = ?
      ORDER BY c.created_at ASC
    `).all(Number(id));
    return NextResponse.json(comments);
  } catch (error) {
    console.error("コメント取得エラー:", error);
    return NextResponse.json({ error: "コメントの取得に失敗しました" }, { status: 500 });
  }
}

// コメント追加
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();
    const { content, userId = null } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: "コメント内容は必須です" }, { status: 400 });
    }

    const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(Number(id)) as {
      id: number;
      issue_key: string;
    } | undefined;

    if (!issue) {
      return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
    }

    const resolvedUserId = userId ? Number(userId) : null;

    const insert = db.prepare(`
      INSERT INTO comments (issue_id, user_id, content)
      VALUES (?, ?, ?)
    `);
    const result = insert.run(Number(id), resolvedUserId, content.trim());

    // 課題の updated_at を更新
    db.prepare("UPDATE issues SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(Number(id));

    // アクティビティに記録（実際のコメント内容を保存）
    db.prepare(`
      INSERT INTO activities (issue_id, user_id, action_type, content)
      VALUES (?, ?, 'commented', ?)
    `).run(Number(id), resolvedUserId, content.trim());

    const created = db.prepare(`
      SELECT 
        c.*,
        u.name AS user_name,
        u.color AS user_color
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).get(result.lastInsertRowid);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("コメント投稿エラー:", error);
    return NextResponse.json({ error: "コメントの投稿に失敗しました" }, { status: 500 });
  }
}
