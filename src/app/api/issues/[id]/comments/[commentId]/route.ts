// 課題コメント個別操作（更新）API
import { NextResponse } from "next/server";
import { getDb, getCommentReactions, canUserAccessProject, deleteAttachmentFilesOnDisk } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createMentionNotifications } from "@/lib/notificationUtils";
import { MAX_LENGTHS, validateMaxLength } from "@/lib/validation";
import { isArchivedProject } from "@/types";

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

    // 課題の存在確認（プロジェクトの参加権限・アーカイブ状態も確認）
    const issue = db.prepare(`
      SELECT i.id, i.project_id, p.is_archived AS project_is_archived, p.name AS project_name, p.key AS project_key
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      WHERE ${isNumericIssue ? "i.id = ?" : "i.issue_key = ?"}
    `).get(isNumericIssue ? Number(id) : id) as {
      id: number;
      project_id: number;
      project_is_archived?: number;
      project_name?: string;
      project_key?: string;
    } | undefined;

    if (!issue) {
      return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
    }

    // プロジェクトアクセス権チェック（プロジェクト脱退後の編集を防止）
    if (
      !canUserAccessProject(
        db,
        sessionUser.id,
        Number(issue.project_id),
        sessionUser.role_type,
        sessionUser.is_admin
      )
    ) {
      return NextResponse.json(
        { error: "この課題のコメントを編集する権限がありません（プロジェクトメンバーではありません）" },
        { status: 403 }
      );
    }

    if (isArchivedProject(issue)) {
      return NextResponse.json(
        { error: "この課題が属するプロジェクトはアーカイブされているため、コメントを編集できません（読み取り専用）" },
        { status: 403 }
      );
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
    const contentLengthErr = validateMaxLength(cleanContent, MAX_LENGTHS.COMMENT_CONTENT, "コメント内容");
    if (contentLengthErr) {
      return NextResponse.json({ error: contentLengthErr }, { status: 400 });
    }

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
      `).get(commentIdNum) as Record<string, unknown> | undefined;
      return NextResponse.json({
        ...current,
        reactions: getCommentReactions(db, commentIdNum),
      });
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

      // コメント本文内の添付ファイルURLをバインド（他ユーザーの未紐付けファイル横取りを防止）
      const commentMatches = cleanContent.matchAll(/\/api\/attachments\/(\d+)/g);
      const updateAttStmt = db.prepare(`
        UPDATE attachments
        SET issue_id = ?, comment_id = ?
        WHERE id = ? AND ((issue_id IS NULL AND user_id = ?) OR issue_id = ?)
      `);
      for (const m of commentMatches) {
        if (m[1]) updateAttStmt.run(issue.id, comment.id, Number(m[1]), sessionUser.id, issue.id);
      }

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
    `).get(comment.id) as Record<string, unknown> | undefined;

    return NextResponse.json({
      ...updated,
      reactions: getCommentReactions(db, comment.id),
    });
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

    // 課題の存在確認（プロジェクトのアーカイブ状態も確認）
    const issue = db.prepare(`
      SELECT i.id, i.issue_key, p.is_archived AS project_is_archived, p.name AS project_name, p.key AS project_key
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      WHERE ${isNumericIssue ? "i.id = ?" : "i.issue_key = ?"}
    `).get(isNumericIssue ? Number(id) : id) as {
      id: number;
      issue_key: string;
      project_is_archived?: number;
      project_name?: string;
      project_key?: string;
    } | undefined;

    if (!issue) {
      return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
    }

    if (isArchivedProject(issue)) {
      return NextResponse.json(
        { error: "この課題が属するプロジェクトはアーカイブされているため、コメントを削除できません（読み取り専用）" },
        { status: 403 }
      );
    }

    // 対象コメントの存在確認
    const comment = db.prepare(`
      SELECT * FROM comments WHERE id = ? AND issue_id = ?
    `).get(commentIdNum, issue.id);

    if (!comment) {
      return NextResponse.json({ error: "対象のコメントが見つかりません" }, { status: 404 });
    }

    // 削除前にこのコメントに紐づく添付ファイル名を取得（ON DELETE CASCADEでDBから消える前に取得）
    const attachmentsToDelete = db
      .prepare("SELECT stored_name FROM attachments WHERE comment_id = ?")
      .all(commentIdNum) as { stored_name: string }[];

    // トランザクション処理：コメント削除（外部キーにより紐づく comment_histories や attachments も自動カスケード削除）
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

    // ディスク上の添付ファイル実体をクリーンアップ
    deleteAttachmentFilesOnDisk(attachmentsToDelete.map((a) => a.stored_name));

    return NextResponse.json({ success: true, message: "コメントを完全に削除しました" });
  } catch (error) {
    console.error("コメント削除エラー:", error);
    return NextResponse.json({ error: "コメントの削除に失敗しました" }, { status: 500 });
  }
}
