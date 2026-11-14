// 課題コメントAPI
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createCommentNotifications } from "@/lib/notificationUtils";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// コメント一覧取得（数値IDまたは課題キーに対応）
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();
    const isNumeric = /^\d+$/.test(id);

    const issue = db.prepare(
      `SELECT id FROM issues WHERE ${isNumeric ? "id = ?" : "issue_key = ?"}`
    ).get(isNumeric ? Number(id) : id) as { id: number } | undefined;

    if (!issue) {
      return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
    }

    const comments = db.prepare(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM comment_histories ch WHERE ch.comment_id = c.id) AS history_count,
        u.name AS user_name,
        u.color AS user_color
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.issue_id = ?
      ORDER BY c.created_at ASC
    `).all(issue.id);
    return NextResponse.json(comments);
  } catch (error) {
    console.error("コメント取得エラー:", error);
    return NextResponse.json({ error: "コメントの取得に失敗しました" }, { status: 500 });
  }
}

// コメント追加（要ログインセッション、数値IDまたは課題キーに対応）
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id } = await params;
    const isNumeric = /^\d+$/.test(id);
    const db = getDb();
    const body = await request.json();
    const { content } = body;

    if (!content || !String(content).trim()) {
      return NextResponse.json({ error: "コメント内容は必須です" }, { status: 400 });
    }

    const issue = db.prepare(
      `SELECT * FROM issues WHERE ${isNumeric ? "id = ?" : "issue_key = ?"}`
    ).get(isNumeric ? Number(id) : id) as {
      id: number;
      issue_key: string;
      created_by: number | null;
      assignee_id: number | null;
    } | undefined;

    if (!issue) {
      return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
    }

    const issueId = issue.id;

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

      // コメント本文内の添付ファイルURLをこの課題およびコメントにバインド
      const commentMatches = cleanContent.matchAll(/\/api\/attachments\/(\d+)/g);
      const updateAttStmt = db.prepare(`
        UPDATE attachments
        SET issue_id = ?, comment_id = ?
        WHERE id = ? AND (issue_id IS NULL OR issue_id = ?)
      `);
      for (const m of commentMatches) {
        if (m[1]) updateAttStmt.run(issueId, commentId, Number(m[1]), issueId);
      }

      // 課題の updated_at を更新
      db.prepare("UPDATE issues SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(issueId);

      // アクティビティに記録（実際のコメント内容を保存）
      db.prepare(`
        INSERT INTO activities (issue_id, user_id, action_type, content)
        VALUES (?, ?, 'commented', ?)
      `).run(issueId, resolvedUserId, cleanContent);

      // コメント通知の一括作成（@メンション・通知先チェックボックス・課題の作成者/担当者への自動通知）
      createCommentNotifications(db, {
        issueId,
        commentId: Number(commentId),
        senderId: resolvedUserId,
        text: cleanContent,
        issueCreatedBy: issue.created_by,
        issueAssigneeId: issue.assignee_id,
        notifyUserIds: Array.isArray(body.notifyUserIds) ? body.notifyUserIds : [],
      });

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    const created = db.prepare(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM comment_histories ch WHERE ch.comment_id = c.id) AS history_count,
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
