// 課題コメント編集履歴取得API
import { NextResponse } from "next/server";
import { getDb, canUserAccessProject } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string; commentId: string }>;
}

// 指定したコメントの編集履歴（過去バージョン一覧）を取得
export async function GET(_request: Request, { params }: RouteParams) {
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
      `SELECT id, project_id FROM issues WHERE ${isNumericIssue ? "id = ?" : "issue_key = ?"}`
    ).get(isNumericIssue ? Number(id) : id) as { id: number; project_id: number } | undefined;

    if (!issue) {
      return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
    }

    // プロジェクトアクセス権チェック
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
        { error: "このコメントの履歴を閲覧する権限がありません（プロジェクトメンバーではありません）" },
        { status: 403 }
      );
    }

    // 対象コメントの取得（現在の最新版）
    const comment = db.prepare(`
      SELECT 
        c.*,
        u.name AS user_name,
        u.color AS user_color
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = ? AND c.issue_id = ?
    `).get(commentIdNum, issue.id) as {
      id: number;
      issue_id: number;
      user_id: number | null;
      content: string;
      created_at: string;
      updated_at: string | null;
      user_name: string | null;
      user_color: string | null;
    } | undefined;

    if (!comment) {
      return NextResponse.json({ error: "対象のコメントが見つかりません" }, { status: 404 });
    }

    // 編集履歴（過去版）を取得（新しい順）
    const histories = db.prepare(`
      SELECT 
        ch.id,
        ch.comment_id,
        ch.user_id,
        ch.content,
        ch.created_at,
        u.name AS user_name,
        u.color AS user_color
      FROM comment_histories ch
      LEFT JOIN users u ON ch.user_id = u.id
      WHERE ch.comment_id = ?
      ORDER BY ch.id DESC
    `).all(commentIdNum);

    return NextResponse.json({
      comment,
      histories,
    });
  } catch (error) {
    console.error("コメント履歴取得エラー:", error);
    return NextResponse.json({ error: "コメント履歴の取得に失敗しました" }, { status: 500 });
  }
}
