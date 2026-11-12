// 課題詳細取得・更新・削除API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 課題詳細の取得（コメント一覧含む）
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();

    const issue = db.prepare(`
      SELECT 
        i.*,
        p.name AS project_name,
        p.color AS project_color,
        parent.issue_key AS parent_issue_key,
        parent.title AS parent_title,
        u.name AS assignee_name,
        u.color AS assignee_color,
        creator.name AS creator_name
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN issues parent ON i.parent_id = parent.id
      LEFT JOIN users u ON i.assignee_id = u.id
      LEFT JOIN users creator ON i.created_by = creator.id
      WHERE i.id = ?
    `).get(Number(id));

    if (!issue) {
      return NextResponse.json({ error: "課題が見つかりません" }, { status: 404 });
    }

    // 子課題一覧を取得
    const children = db.prepare(`
      SELECT 
        i.*,
        p.name AS project_name,
        p.color AS project_color,
        u.name AS assignee_name,
        u.color AS assignee_color
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN users u ON i.assignee_id = u.id
      WHERE i.parent_id = ?
      ORDER BY i.issue_number ASC
    `).all(Number(id));

    // コメント取得（投稿者情報も結合）
    const comments = db.prepare(`
      SELECT 
        c.*,
        u.name AS user_name,
        u.color AS user_color
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.issue_id = ?
      ORDER BY c.created_at ASC
    `).all(Number(id));

    return NextResponse.json({ issue, children, comments });
  } catch (error) {
    console.error("課題詳細取得エラー:", error);
    return NextResponse.json({ error: "課題詳細の取得に失敗しました" }, { status: 500 });
  }
}

// 課題の更新（要ログインセッション）
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id } = await params;
    const issueId = Number(id);
    const db = getDb();
    const body = await request.json();

    const currentIssue = db.prepare("SELECT * FROM issues WHERE id = ?").get(issueId) as {
      id: number;
      issue_key: string;
      title: string;
      status: string;
      priority: string;
      assignee_id: number | null;
      start_date: string | null;
      due_date: string | null;
    } | undefined;

    if (!currentIssue) {
      return NextResponse.json({ error: "課題が見つかりません" }, { status: 404 });
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    const activityLogs: { type: string; msg: string }[] = [];
    const actorId = sessionUser.id;

    if (body.title !== undefined) {
      if (!String(body.title).trim()) {
        return NextResponse.json({ error: "課題名は空にできません" }, { status: 400 });
      }
      updates.push("title = ?");
      values.push(String(body.title).trim());
    }
    if (body.description !== undefined) {
      updates.push("description = ?");
      values.push(String(body.description).trim());
    }
    if (body.issueType !== undefined) {
      updates.push("issue_type = ?");
      values.push(body.issueType);
    }
    if (body.status !== undefined) {
      updates.push("status = ?");
      values.push(body.status);

      if (currentIssue.status !== body.status) {
        const statusMap: Record<string, string> = {
          open: "未対応",
          in_progress: "処理中",
          resolved: "処理済み",
          closed: "完了",
        };
        const prevLabel = statusMap[currentIssue.status] || currentIssue.status;
        const newLabel = statusMap[body.status] || body.status;
        activityLogs.push({
          type: "status_changed",
          msg: `課題 [${currentIssue.issue_key}] の状態を「${prevLabel}」から「${newLabel}」に変更しました`,
        });
      }
    }
    if (body.priority !== undefined) {
      updates.push("priority = ?");
      values.push(body.priority);
      if (currentIssue.priority !== body.priority) {
        const prioMap: Record<string, string> = { high: "高", medium: "中", low: "低" };
        const newPrio = prioMap[body.priority] || body.priority;
        activityLogs.push({
          type: "updated",
          msg: `課題 [${currentIssue.issue_key}] の優先度を「${newPrio}」に変更しました`,
        });
      }
    }
    if (body.assigneeId !== undefined) {
      const targetAssigneeId = body.assigneeId ? Number(body.assigneeId) : null;
      updates.push("assignee_id = ?");
      values.push(targetAssigneeId);

      if (currentIssue.assignee_id !== targetAssigneeId) {
        if (targetAssigneeId) {
          const targetUser = db.prepare("SELECT name FROM users WHERE id = ?").get(targetAssigneeId) as { name: string } | undefined;
          const targetName = targetUser?.name || "不明";
          activityLogs.push({
            type: "updated",
            msg: `課題 [${currentIssue.issue_key}] の担当者を「${targetName}」に設定しました`,
          });
        } else {
          activityLogs.push({
            type: "updated",
            msg: `課題 [${currentIssue.issue_key}] の担当者を未割当にしました`,
          });
        }
      }
    }
    if (body.parentId !== undefined) {
      const targetParentId = body.parentId ? Number(body.parentId) : null;
      if (targetParentId === issueId) {
        return NextResponse.json({ error: "自分自身を親課題に設定することはできません" }, { status: 400 });
      }
      // 親子課題の循環参照チェック（A -> B -> A の防止）
      if (targetParentId) {
        let cursorId: number | null = targetParentId;
        const visited = new Set<number>([issueId]);
        const getParentStmt = db.prepare("SELECT parent_id FROM issues WHERE id = ?");
        while (cursorId) {
          if (visited.has(cursorId)) {
            return NextResponse.json(
              { error: "子孫課題を親課題に設定すること（循環参照）はできません" },
              { status: 400 }
            );
          }
          visited.add(cursorId);
          const parentRow = getParentStmt.get(cursorId) as { parent_id: number | null } | undefined;
          cursorId = parentRow?.parent_id ?? null;
        }
      }
      updates.push("parent_id = ?");
      values.push(targetParentId);
    }
    if (body.startDate !== undefined) {
      const nextStart = body.startDate || null;
      updates.push("start_date = ?");
      values.push(nextStart);
    }
    if (body.dueDate !== undefined) {
      const nextDue = body.dueDate || null;
      updates.push("due_date = ?");
      values.push(nextDue);
      if ((currentIssue.due_date || null) !== nextDue) {
        activityLogs.push({
          type: "updated",
          msg: nextDue
            ? `課題 [${currentIssue.issue_key}] の期限日を「${nextDue}」に設定しました`
            : `課題 [${currentIssue.issue_key}] の期限日を未設定にしました`,
        });
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ message: "更新対象がありません" });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(issueId);

    db.exec("BEGIN;");
    try {
      const sql = `UPDATE issues SET ${updates.join(", ")} WHERE id = ?`;
      db.prepare(sql).run(...values);

      // アクティビティ履歴の記録
      const insertActivity = db.prepare(`
        INSERT INTO activities (issue_id, user_id, action_type, content)
        VALUES (?, ?, ?, ?)
      `);

      for (const log of activityLogs) {
        insertActivity.run(currentIssue.id, actorId, log.type, log.msg);
      }

      if (activityLogs.length === 0 && (body.title !== undefined || body.description !== undefined)) {
        insertActivity.run(currentIssue.id, actorId, "updated", `課題 [${currentIssue.issue_key}] を更新しました`);
      }

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    const updated = db.prepare(`
      SELECT 
        i.*, 
        p.name AS project_name, 
        p.color AS project_color,
        parent.issue_key AS parent_issue_key,
        parent.title AS parent_title,
        u.name AS assignee_name,
        u.color AS assignee_color,
        creator.name AS creator_name
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN issues parent ON i.parent_id = parent.id
      LEFT JOIN users u ON i.assignee_id = u.id
      LEFT JOIN users creator ON i.created_by = creator.id
      WHERE i.id = ?
    `).get(issueId);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("課題更新エラー:", error);
    return NextResponse.json({ error: "課題の更新に失敗しました" }, { status: 500 });
  }
}

// 課題の削除（要ログインセッション）
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id } = await params;
    const issueId = Number(id);
    const db = getDb();
    const actorId = sessionUser.id;

    const currentIssue = db.prepare("SELECT * FROM issues WHERE id = ?").get(issueId) as {
      id: number;
      issue_key: string;
      title: string;
    } | undefined;

    if (!currentIssue) {
      return NextResponse.json({ error: "課題が見つかりません" }, { status: 404 });
    }

    db.exec("BEGIN;");
    try {
      db.prepare("DELETE FROM issues WHERE id = ?").run(issueId);

      // 削除アクティビティを記録
      db.prepare(`
        INSERT INTO activities (user_id, action_type, content)
        VALUES (?, 'deleted', ?)
      `).run(actorId, `課題 [${currentIssue.issue_key}] 「${currentIssue.title}」を削除しました`);

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    return NextResponse.json({ success: true, message: "課題を削除しました" });
  } catch (error) {
    console.error("課題削除エラー:", error);
    return NextResponse.json({ error: "課題の削除に失敗しました" }, { status: 500 });
  }
}
