// コメントへのスタンプ（リアクション）付与・解除トグルAPI
import { NextResponse } from "next/server";
import { getDb, getCommentReactions } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { COMMENT_STAMP_OPTIONS, CommentStamp } from "@/types";

const VALID_STAMPS = new Map<CommentStamp, string>(
  COMMENT_STAMP_OPTIONS.map((opt) => [opt.stamp, opt.label])
);

interface RouteParams {
  params: Promise<{ id: string; commentId: string }>;
}

// スタンプ（リアクション）のトグル（追加 / 解除）
export async function POST(request: Request, { params }: RouteParams) {
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

    const body = await request.json().catch(() => ({}));
    const stamp = String(body.stamp || "").trim() as CommentStamp;

    if (!VALID_STAMPS.has(stamp)) {
      return NextResponse.json(
        { error: "無効なスタンプ種別です（👍, ✅ のみ使用可能）" },
        { status: 400 }
      );
    }

    const db = getDb();

    // 課題の存在確認
    const issue = db
      .prepare(`SELECT id FROM issues WHERE ${isNumericIssue ? "id = ?" : "issue_key = ?"}`)
      .get(isNumericIssue ? Number(id) : id) as { id: number } | undefined;

    if (!issue) {
      return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
    }

    // 対象コメントの取得
    const comment = db
      .prepare("SELECT id, issue_id, user_id, content FROM comments WHERE id = ? AND issue_id = ?")
      .get(commentIdNum, issue.id) as
      | { id: number; issue_id: number; user_id: number | null; content: string }
      | undefined;

    if (!comment) {
      return NextResponse.json({ error: "対象のコメントが見つかりません" }, { status: 404 });
    }

    // 既に同じスタンプを押しているか確認
    const existing = db
      .prepare(
        "SELECT id FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND stamp = ?"
      )
      .get(comment.id, sessionUser.id, stamp) as { id: number } | undefined;

    let action: "added" | "removed" = "added";

    // ※スタンプ操作時はベルマーク通知を送らない仕様（静かに既読・感謝を伝えるため）
    db.exec("BEGIN;");
    try {
      if (existing) {
        // 既に押されている場合は解除（削除）
        action = "removed";
        db.prepare("DELETE FROM comment_reactions WHERE id = ?").run(existing.id);
      } else {
        // 新規にスタンプを付与
        action = "added";
        db.prepare(
          "INSERT INTO comment_reactions (comment_id, user_id, stamp) VALUES (?, ?, ?)"
        ).run(comment.id, sessionUser.id, stamp);
      }
      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    const reactions = getCommentReactions(db, comment.id);
    return NextResponse.json({
      action,
      stamp,
      reactions,
    });
  } catch (error) {
    console.error("コメントリアクション操作エラー:", error);
    return NextResponse.json({ error: "スタンプの操作に失敗しました" }, { status: 500 });
  }
}
