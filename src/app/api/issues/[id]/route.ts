// 課題詳細取得・更新・削除API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 課題詳細の取得（コメント一覧含む）
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();

    const issue = db.prepare(`
      SELECT 
        i.*,
        p.name AS project_name,
        p.color AS project_color,
        parent.issue_key AS parent_issue_key,
        parent.title AS parent_title
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN issues parent ON i.parent_id = parent.id
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
        p.color AS project_color
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      WHERE i.parent_id = ?
      ORDER BY i.issue_number ASC
    `).all(Number(id));

    // コメント取得
    const comments = db.prepare(`
      SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at ASC
    `).all(Number(id));

    return NextResponse.json({ issue, children, comments });
  } catch (error) {
    console.error("課題詳細取得エラー:", error);
    return NextResponse.json({ error: "課題詳細の取得に失敗しました" }, { status: 500 });
  }
}

// 課題の更新
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const currentIssue = db.prepare("SELECT * FROM issues WHERE id = ?").get(Number(id)) as {
      id: number;
      issue_key: string;
      title: string;
      status: string;
      priority: string;
    } | undefined;

    if (!currentIssue) {
      return NextResponse.json({ error: "課題が見つかりません" }, { status: 404 });
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    const activityLogs: string[] = [];

    if (body.title !== undefined) {
      updates.push("title = ?");
      values.push(body.title.trim());
    }
    if (body.description !== undefined) {
      updates.push("description = ?");
      values.push(body.description.trim());
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
        activityLogs.push(`課題 [${currentIssue.issue_key}] の状態を「${prevLabel}」から「${newLabel}」に変更しました`);
      }
    }
    if (body.priority !== undefined) {
      updates.push("priority = ?");
      values.push(body.priority);
    }
    if (body.parentId !== undefined) {
      const targetParentId = body.parentId ? Number(body.parentId) : null;
      if (targetParentId === Number(id)) {
        return NextResponse.json({ error: "自分自身を親課題に設定することはできません" }, { status: 400 });
      }
      updates.push("parent_id = ?");
      values.push(targetParentId);
    }
    if (body.startDate !== undefined) {
      updates.push("start_date = ?");
      values.push(body.startDate || null);
    }
    if (body.dueDate !== undefined) {
      updates.push("due_date = ?");
      values.push(body.dueDate || null);
    }

    if (updates.length === 0) {
      return NextResponse.json({ message: "更新対象がありません" });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(Number(id));

    const sql = `UPDATE issues SET ${updates.join(", ")} WHERE id = ?`;
    db.prepare(sql).run(...values);

    // アクティビティ履歴の記録
    const insertActivity = db.prepare(`
      INSERT INTO activities (issue_id, action_type, content)
      VALUES (?, ?, ?)
    `);

    for (const log of activityLogs) {
      insertActivity.run(currentIssue.id, "status_changed", log);
    }

    if (activityLogs.length === 0 && (body.title !== undefined || body.description !== undefined)) {
      insertActivity.run(currentIssue.id, "updated", `課題 [${currentIssue.issue_key}] を更新しました`);
    }

    const updated = db.prepare(`
      SELECT 
        i.*, 
        p.name AS project_name, 
        p.color AS project_color,
        parent.issue_key AS parent_issue_key,
        parent.title AS parent_title
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN issues parent ON i.parent_id = parent.id
      WHERE i.id = ?
    `).get(Number(id));

    return NextResponse.json(updated);
  } catch (error) {
    console.error("課題更新エラー:", error);
    return NextResponse.json({ error: "課題の更新に失敗しました" }, { status: 500 });
  }
}

// 課題の削除
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();

    const currentIssue = db.prepare("SELECT * FROM issues WHERE id = ?").get(Number(id)) as {
      id: number;
      issue_key: string;
      title: string;
    } | undefined;

    if (!currentIssue) {
      return NextResponse.json({ error: "課題が見つかりません" }, { status: 404 });
    }

    db.prepare("DELETE FROM issues WHERE id = ?").run(Number(id));

    // 削除アクティビティを記録
    db.prepare(`
      INSERT INTO activities (action_type, content)
      VALUES ('deleted', ?)
    `).run(`課題 [${currentIssue.issue_key}] 「${currentIssue.title}」を削除しました`);

    return NextResponse.json({ success: true, message: "課題を削除しました" });
  } catch (error) {
    console.error("課題削除エラー:", error);
    return NextResponse.json({ error: "課題の削除に失敗しました" }, { status: 500 });
  }
}
