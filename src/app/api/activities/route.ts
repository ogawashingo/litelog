// 最近のアクティビティ取得API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    let sql = `
      SELECT 
        a.id,
        a.issue_id,
        a.user_id,
        u.name AS user_name,
        u.color AS user_color,
        a.action_type,
        a.content,
        a.created_at,
        i.issue_key,
        i.title AS issue_title,
        i.status AS issue_status,
        i.issue_type AS issue_type,
        i.project_id AS project_id,
        p.key AS project_key,
        p.name AS project_name,
        p.color AS project_color
      FROM activities a
      LEFT JOIN issues i ON a.issue_id = i.id
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (projectId) {
      sql += " AND i.project_id = ?";
      params.push(Number(projectId));
    }

    sql += " ORDER BY a.created_at DESC, a.id DESC LIMIT 50";

    const activities = db.prepare(sql).all(...params);

    return NextResponse.json(activities);
  } catch (error) {
    console.error("アクティビティ取得エラー:", error);
    return NextResponse.json({ error: "アクティビティの取得に失敗しました" }, { status: 500 });
  }
}
