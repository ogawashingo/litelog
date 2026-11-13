// 課題変更履歴（タイトル・詳細説明の過去バージョン一覧）API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 課題の変更履歴（タイトル・詳細説明の過去版）を取得
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id } = await params;
    const isNumeric = /^\d+$/.test(id);
    const db = getDb();

    // 課題の存在確認
    const issue = db.prepare(`
      SELECT 
        i.id,
        i.issue_key,
        i.title,
        i.description,
        i.created_at,
        i.updated_at,
        u.name AS assignee_name,
        u.color AS assignee_color
      FROM issues i
      LEFT JOIN users u ON i.assignee_id = u.id
      WHERE ${isNumeric ? "i.id = ?" : "i.issue_key = ?"}
    `).get(isNumeric ? Number(id) : id) as {
      id: number;
      issue_key: string;
      title: string;
      description: string | null;
      created_at: string;
      updated_at: string | null;
      assignee_name: string | null;
      assignee_color: string | null;
    } | undefined;

    if (!issue) {
      return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
    }

    // 課題変更履歴（過去版）を取得（新しい順）
    const histories = db.prepare(`
      SELECT 
        ih.id,
        ih.issue_id,
        ih.user_id,
        ih.field_name,
        ih.old_value,
        ih.created_at,
        u.name AS user_name,
        u.color AS user_color
      FROM issue_histories ih
      LEFT JOIN users u ON ih.user_id = u.id
      WHERE ih.issue_id = ?
      ORDER BY ih.id DESC
    `).all(issue.id);

    return NextResponse.json({
      issue,
      histories,
    });
  } catch (error) {
    console.error("課題変更履歴取得エラー:", error);
    return NextResponse.json({ error: "課題変更履歴の取得に失敗しました" }, { status: 500 });
  }
}
