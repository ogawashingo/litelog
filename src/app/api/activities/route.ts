// 最近のアクティビティ取得API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const activities = db.prepare(`
      SELECT 
        a.id,
        a.issue_id,
        a.action_type,
        a.content,
        a.created_at,
        i.issue_key,
        i.title AS issue_title
      FROM activities a
      LEFT JOIN issues i ON a.issue_id = i.id
      ORDER BY a.created_at DESC
      LIMIT 30
    `).all();

    return NextResponse.json(activities);
  } catch (error) {
    console.error("アクティビティ取得エラー:", error);
    return NextResponse.json({ error: "アクティビティの取得に失敗しました" }, { status: 500 });
  }
}
