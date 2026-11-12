// 課題コメントAPI
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// コメント一覧取得
export async function GET(_request: Request, { params }: RouteParams) {
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

// コメント追加（要ログインセッション）
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id } = await params;
    const issueId = Number(id);
    const db = getDb();
    const body = await request.json();
    const { content } = body;

    if (!content || !String(content).trim()) {
      return NextResponse.json({ error: "コメント内容は必須です" }, { status: 400 });
    }

    const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(issueId) as {
      id: number;
      issue_key: string;
    } | undefined;

    if (!issue) {
      return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
    }

    // 投稿者はサーバー側セッションユーザーを信頼源とする
    const resolvedUserId = sessionUser.id;
    const cleanContent = String(content).trim();
    let commentId: number | bigint = 0;

    db.exec("BEGIN;");
    try {
      const insert = db.prepare(`
        INSERT INTO comments (issue_id, user_id, content)
        VALUES (?, ?, ?)
      `);
      const result = insert.run(issueId, resolvedUserId, cleanContent);
      commentId = result.lastInsertRowid;

      // 課題の updated_at を更新
      db.prepare("UPDATE issues SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(issueId);

      // アクティビティに記録（実際のコメント内容を保存）
      db.prepare(`
        INSERT INTO activities (issue_id, user_id, action_type, content)
        VALUES (?, ?, 'commented', ?)
      `).run(issueId, resolvedUserId, cleanContent);

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    const created = db.prepare(`
      SELECT 
        c.*,
        u.name AS user_name,
        u.color AS user_color
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).get(commentId);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("コメント投稿エラー:", error);
    return NextResponse.json({ error: "コメントの投稿に失敗しました" }, { status: 500 });
  }
}
