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
        a.comment_id,
        COALESCE(a.user_id, i.assignee_id, i.created_by, du.id) AS user_id,
        COALESCE(u.name, iu.name, cu.name, du.name) AS user_name,
        COALESCE(u.color, iu.color, cu.color, du.color) AS user_color,
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
      LEFT JOIN users iu ON i.assignee_id = iu.id
      LEFT JOIN users cu ON i.created_by = cu.id
      LEFT JOIN users du ON du.id = (SELECT id FROM users ORDER BY is_admin DESC, id ASC LIMIT 1)
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (projectId) {
      sql += " AND i.project_id = ?";
      params.push(Number(projectId));
    }

    sql += " ORDER BY a.created_at DESC, a.id DESC LIMIT 50";

    const activities = db.prepare(sql).all(...params) as Record<string, unknown>[];

    // コメントに紐づくリアクション（スタンプ）を一括取得してマッピング
    const commentIds = activities
      .map((a) => (a.comment_id ? Number(a.comment_id) : null))
      .filter((id): id is number => id !== null && id > 0);

    if (commentIds.length > 0) {
      const placeholders = commentIds.map(() => "?").join(",");
      const allReactions = db
        .prepare(`
          SELECT
            cr.id,
            cr.comment_id,
            cr.user_id,
            cr.stamp,
            cr.created_at,
            u.name AS user_name,
            u.color AS user_color
          FROM comment_reactions cr
          LEFT JOIN users u ON cr.user_id = u.id
          WHERE cr.comment_id IN (${placeholders})
          ORDER BY cr.created_at ASC, cr.id ASC
        `)
        .all(...commentIds) as { comment_id: number }[];

      const mapByCommentId = new Map<number, unknown[]>();
      for (const r of allReactions) {
        const cid = Number(r.comment_id);
        const list = mapByCommentId.get(cid) || [];
        list.push(r);
        mapByCommentId.set(cid, list);
      }

      for (const act of activities) {
        if (act.comment_id) {
          act.reactions = mapByCommentId.get(Number(act.comment_id)) || [];
        }
      }
    }

    return NextResponse.json(activities);
  } catch (error) {
    console.error("アクティビティ取得エラー:", error);
    return NextResponse.json({ error: "アクティビティの取得に失敗しました" }, { status: 500 });
  }
}
