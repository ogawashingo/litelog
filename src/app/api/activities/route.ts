// 最近のアクティビティ取得API
import { NextResponse } from "next/server";
import { getDb, getUserAccessibleProjectIds } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const sessionUser = await getSessionUser();
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
      const pid = Number(projectId);
      // 削除済み課題のアクティビティ（issue_id が NULL）もプロジェクトキーから紐付けて取得する
      const projRow = db.prepare("SELECT key FROM projects WHERE id = ?").get(pid) as
        | { key: string }
        | undefined;
      if (projRow?.key) {
        sql += " AND (i.project_id = ? OR (a.issue_id IS NULL AND a.content LIKE ?))";
        params.push(pid, `%[${projRow.key}-%`);
      } else {
        sql += " AND i.project_id = ?";
        params.push(pid);
      }
    } else if (sessionUser) {
      const accessibleIds = getUserAccessibleProjectIds(
        db,
        sessionUser.id,
        sessionUser.role_type,
        sessionUser.is_admin
      );
      if (accessibleIds !== null) {
        if (accessibleIds.length === 0) {
          return NextResponse.json([]);
        }
        const placeholders = accessibleIds.map(() => "?").join(",");
        sql += ` AND i.project_id IN (${placeholders})`;
        params.push(...accessibleIds);
      }
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
