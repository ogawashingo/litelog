// 課題コメント個別操作（更新）API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createMentionNotifications } from "@/lib/notificationUtils";

interface RouteParams {
  params: Promise<{ id: string; commentId: string }>;
}

// コメントの更新（投稿者本人または管理者のみ可能、変更前の本文を comment_histories に保存）
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id, commentId } = await params;
    const isNumericIssue = /^\d+$/.test(id);
    const commentIdNum = Number(commentId);

    if (!commentIdNum || isNaN(commentIdNum)) {
      return NextResponse.json({ error: "不正なコメントIDです" }, { status: 400 });
    }

    const db = getDb();

    // 課題の存在確認
    const issue = db.prepare(
      `SELECT id FROM issues WHERE ${isNumericIssue ? "id = ?" : "issue_key = ?"}`
    ).get(isNumericIssue ? Number(id) : id) as { id: number } | undefined;

    if (!issue) {
      return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
    }

    // 対象コメントの取得
    const comment = db.prepare(`
      SELECT * FROM comments WHERE id = ? AND issue_id = ?
    `).get(commentIdNum, issue.id) as {
      id: number;
      issue_id: number;
      user_id: number | null;
      content: string;
      created_at: string;
      updated_at: string | null;
    } | undefined;

    if (!comment) {
      return NextResponse.json({ error: "対象のコメントが見つかりません" }, { status: 404 });
    }

    // 権限確認：コメント作成者本人、または管理者(is_admin=1)のみ編集可能
    const isAuthor = comment.user_id !== null && comment.user_id === sessionUser.id;
    const isAdmin = sessionUser.is_admin === 1;

    if (!isAuthor && !isAdmin) {
      return NextResponse.json(
        { error: "ご自身が投稿したコメントのみ編集できます（管理者は全コメント編集可能）" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { content } = body;

    if (!content || !String(content).trim()) {
      return NextResponse.json({ error: "コメント内容は必須です" }, { status: 400 });
    }

    const cleanContent = String(content).trim();

    // 内容に変更がない場合はそのまま返す
    if (cleanContent === comment.content) {
      const current = db.prepare(`
        SELECT 
          c.*,
          (SELECT COUNT(*) FROM comment_histories ch WHERE ch.comment_id = c.id) AS history_count,
          u.name AS user_name,
          u.color AS user_color
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.id = ?
      `).get(commentIdNum);
      return NextResponse.json(current);
    }

    // トランザクション処理：変更前の本文を履歴テーブルに保存し、コメントを更新
    db.exec("BEGIN;");
    try {
      // 1. 変更前の内容を履歴テーブルに保存（更新実行者のIDと、変更直前の内容を保持）
      db.prepare(`
        INSERT INTO comment_histories (comment_id, user_id, content, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `).run(comment.id, sessionUser.id, comment.content);

      // 2. コメント本文および updated_at を更新
      db.prepare(`
        UPDATE comments
        SET content = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(cleanContent, comment.id);

      // 3. 課題の updated_at を更新
      db.prepare(`
        UPDATE issues
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(issue.id);

      // 4. メンション通知の作成（編集前テキストと比較し、新規にメンションされたユーザーへ通知）
      createMentionNotifications(db, {
        issueId: issue.id,
        commentId: comment.id,
        senderId: sessionUser.id,
        text: cleanContent,
        existingText: comment.content,
      });

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    // 更新後のコメント情報を取得して返却
    const updated = db.prepare(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM comment_histories ch WHERE ch.comment_id = c.id) AS history_count,
        u.name AS user_name,
        u.color AS user_color
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).get(comment.id);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("コメント編集エラー:", error);
    return NextResponse.json({ error: "コメントの更新に失敗しました" }, { status: 500 });
  }
}

// コメントの削除（機密情報事故・誤爆対応用として、管理者(is_admin=1)のみ完全削除可能）
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    // 管理者（Admin権限）のみ削除を許可
    if (sessionUser.is_admin !== 1) {
      return NextResponse.json(
        { error: "コメントの削除は管理者（Admin権限）のみ実行できます" },
        { status: 403 }
      );
    }

    const { id, commentId } = await params;
    const isNumericIssue = /^\d+$/.test(id);
    const commentIdNum = Number(commentId);

    if (!commentIdNum || isNaN(commentIdNum)) {
      return NextResponse.json({ error: "不正なコメントIDです" }, { status: 400 });
    }

    const db = getDb();

    // 課題の存在確認
    const issue = db.prepare(
      `SELECT id, issue_key FROM issues WHERE ${isNumericIssue ? "id = ?" : "issue_key = ?"}`
    ).get(isNumericIssue ? Number(id) : id) as { id: number; issue_key: string } | undefined;

    if (!issue) {
      return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
    }

    // 対象コメントの存在確認
    const comment = db.prepare(`
      SELECT * FROM comments WHERE id = ? AND issue_id = ?
    `).get(commentIdNum, issue.id);

    if (!comment) {
      return NextResponse.json({ error: "対象のコメントが見つかりません" }, { status: 404 });
    }

    // トランザクション処理：コメント削除（外部キーにより紐づく comment_histories も自動カスケード削除）
    db.exec("BEGIN;");
    try {
      db.prepare("DELETE FROM comments WHERE id = ?").run(commentIdNum);

      // 課題の updated_at を更新
      db.prepare("UPDATE issues SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(issue.id);

      // アクティビティに削除ログを記録
      db.prepare(`
        INSERT INTO activities (issue_id, user_id, action_type, content)
        VALUES (?, ?, 'deleted', ?)
      `).run(issue.id, sessionUser.id, `課題 [${issue.issue_key}] のコメントを削除しました`);

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    return NextResponse.json({ success: true, message: "コメントを完全に削除しました" });
  } catch (error) {
    console.error("コメント削除エラー:", error);
    return NextResponse.json({ error: "コメントの削除に失敗しました" }, { status: 500 });
  }
}
