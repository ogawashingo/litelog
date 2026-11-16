// 課題詳細取得・更新・削除API
import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getDb, ATTACHMENTS_DIR, attachReactionsToComments } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createIssueUpdatedNotifications } from "@/lib/notificationUtils";

const VALID_ISSUE_TYPES = new Set(["task", "bug", "request", "other"]);
const VALID_STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);
const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
const VALID_RESOLUTIONS = new Set(["fixed", "wont_fix", "invalid", "duplicated", "cannot_reproduce"]);

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 課題詳細の取得（コメント一覧含む、数値IDまたは課題キーに対応）
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();
    const isNumeric = /^\d+$/.test(id);

    const issue = db.prepare(`
      SELECT 
        i.*,
        p.name AS project_name,
        p.color AS project_color,
        p.is_archived AS project_is_archived,
        parent.issue_key AS parent_issue_key,
        parent.title AS parent_title,
        u.name AS assignee_name,
        u.color AS assignee_color,
        creator.name AS creator_name,
        (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'description') AS description_history_count,
        (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'title') AS title_history_count,
        (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'due_date') AS due_date_history_count,
        (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'start_date') AS start_date_history_count,
        (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'resolution') AS resolution_history_count,
        COALESCE(cmt_stat.comment_count, 0) AS comment_count,
        latest_c.content AS latest_comment_content,
        latest_c.created_at AS latest_comment_created_at,
        cu.name AS latest_comment_user_name,
        cu.color AS latest_comment_user_color
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN issues parent ON i.parent_id = parent.id
      LEFT JOIN users u ON i.assignee_id = u.id
      LEFT JOIN users creator ON i.created_by = creator.id
      LEFT JOIN (
        SELECT issue_id, COUNT(*) AS comment_count, MAX(id) AS latest_comment_id
        FROM comments
        GROUP BY issue_id
      ) cmt_stat ON cmt_stat.issue_id = i.id
      LEFT JOIN comments latest_c ON latest_c.id = cmt_stat.latest_comment_id
      LEFT JOIN users cu ON latest_c.user_id = cu.id
      WHERE ${isNumeric ? "i.id = ?" : "i.issue_key = ?"}
    `).get(isNumeric ? Number(id) : id) as Record<string, unknown> | undefined;

    if (!issue) {
      return NextResponse.json({ error: "課題が見つかりません" }, { status: 404 });
    }

    const targetIssueId = Number(issue.id);

    // 子課題一覧を取得
    const children = db.prepare(`
      SELECT 
        i.*,
        p.name AS project_name,
        p.color AS project_color,
        u.name AS assignee_name,
        u.color AS assignee_color,
        creator.name AS creator_name
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN users u ON i.assignee_id = u.id
      LEFT JOIN users creator ON i.created_by = creator.id
      WHERE i.parent_id = ?
      ORDER BY i.issue_number ASC
    `).all(targetIssueId);

    // コメント取得（投稿者情報・編集履歴件数・リアクション一覧も結合）
    const rawComments = db.prepare(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM comment_histories ch WHERE ch.comment_id = c.id) AS history_count,
        u.name AS user_name,
        u.color AS user_color
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.issue_id = ?
      ORDER BY c.created_at ASC
    `).all(targetIssueId) as { id: number }[];
    const comments = attachReactionsToComments(db, rawComments);

    // 添付ファイル取得（アップロード者情報も結合）
    const attachments = db.prepare(`
      SELECT 
        a.*,
        u.name AS user_name,
        u.color AS user_color
      FROM attachments a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.issue_id = ?
      ORDER BY a.created_at ASC, a.id ASC
    `).all(targetIssueId);

    return NextResponse.json({ issue, children, comments, attachments });
  } catch (error) {
    console.error("課題詳細取得エラー:", error);
    return NextResponse.json({ error: "課題詳細の取得に失敗しました" }, { status: 500 });
  }
}

// 課題の更新（要ログインセッション、数値IDまたは課題キーに対応）
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id } = await params;
    const isNumeric = /^\d+$/.test(id);
    const db = getDb();
    const body = await request.json();

    const currentIssue = db.prepare(`
      SELECT i.*, p.is_archived AS project_is_archived, p.name AS project_name
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      WHERE ${isNumeric ? "i.id = ?" : "i.issue_key = ?"}
    `).get(isNumeric ? Number(id) : id) as {
      id: number;
      issue_key: string;
      title: string;
      description: string | null;
      issue_type: string;
      status: string;
      priority: string;
      parent_id: number | null;
      assignee_id: number | null;
      created_by: number | null;
      start_date: string | null;
      due_date: string | null;
      resolution?: string | null;
      project_is_archived?: number;
      project_name?: string;
    } | undefined;

    if (!currentIssue) {
      return NextResponse.json({ error: "課題が見つかりません" }, { status: 404 });
    }

    // アーカイブされたプロジェクトの課題は読み取り専用のため、更新を禁止（is_archivedまたは名前にアーカイブ含む）
    const isArchived = Boolean(
      currentIssue.project_is_archived ||
      (currentIssue.project_name && (
        currentIssue.project_name.includes("アーカイブ") ||
        currentIssue.project_name.toLowerCase().includes("archive")
      ))
    );
    if (isArchived) {
      return NextResponse.json(
        { error: "この課題が属するプロジェクトはアーカイブされているため、編集・更新できません（読み取り専用）" },
        { status: 403 }
      );
    }

    const issueId = currentIssue.id;
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    const activityLogs: { type: string; msg: string }[] = [];
    const historiesToInsert: { field: string; oldValue: string }[] = [];
    const actorId =
      sessionUser.id ||
      (body.actorId ? Number(body.actorId) : null) ||
      currentIssue.assignee_id ||
      currentIssue.created_by ||
      null;

    if (body.title !== undefined) {
      const cleanTitle = String(body.title).trim();
      if (!cleanTitle) {
        return NextResponse.json({ error: "課題名は空にできません" }, { status: 400 });
      }
      updates.push("title = ?");
      values.push(cleanTitle);

      // タイトルが変更された場合、変更前のタイトルを履歴に退避
      if (cleanTitle !== currentIssue.title) {
        historiesToInsert.push({ field: "title", oldValue: currentIssue.title });
        activityLogs.push({
          type: "updated",
          msg: `課題 [${currentIssue.issue_key}] のタイトルを「${currentIssue.title}」から「${cleanTitle}」に変更しました`,
        });
      }
    }
    if (body.description !== undefined) {
      const cleanDesc = String(body.description).trim();
      const currentDesc = (currentIssue.description || "").trim();
      updates.push("description = ?");
      values.push(cleanDesc);

      // 詳細説明が変更された場合、変更前の説明文を履歴に退避
      if (cleanDesc !== currentDesc) {
        historiesToInsert.push({ field: "description", oldValue: currentIssue.description || "" });
        activityLogs.push({
          type: "updated",
          msg: `課題 [${currentIssue.issue_key}] の詳細説明を更新しました`,
        });
      }
    }
    if (body.issueType !== undefined) {
      if (!VALID_ISSUE_TYPES.has(String(body.issueType))) {
        return NextResponse.json({ error: "無効な課題種別です" }, { status: 400 });
      }
      updates.push("issue_type = ?");
      values.push(body.issueType);
      if (currentIssue.issue_type !== body.issueType) {
        const typeMap: Record<string, string> = {
          task: "タスク",
          bug: "バグ",
          request: "要望",
          other: "その他",
        };
        const prevTypeLabel = typeMap[currentIssue.issue_type] || currentIssue.issue_type;
        const newTypeLabel = typeMap[body.issueType] || body.issueType;
        activityLogs.push({
          type: "updated",
          msg: `課題 [${currentIssue.issue_key}] の種別を「${prevTypeLabel}」から「${newTypeLabel}」に変更しました`,
        });
      }
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.has(String(body.status))) {
        return NextResponse.json({ error: "無効なステータスです" }, { status: 400 });
      }

      // 課題を完了（closed）にできるのは、課題の起票者・PMO・または管理者のみ
      if (body.status === "closed" && currentIssue.status !== "closed") {
        const canClose = Boolean(
          sessionUser.is_admin ||
          sessionUser.role_type === "pmo" ||
          (currentIssue.created_by && sessionUser.id === currentIssue.created_by)
        );
        if (!canClose) {
          return NextResponse.json(
            { error: "課題を完了にできるのは、課題の起票者・PMO・または管理者のみです" },
            { status: 403 }
          );
        }
      }

      // 未完了の子課題が存在する場合、親課題を完了（closed）にできないバリデーション
      if (body.status === "closed") {
        const unclosedChildren = db
          .prepare("SELECT COUNT(*) AS count FROM issues WHERE parent_id = ? AND status != 'closed'")
          .get(issueId) as { count: number } | undefined;

        if (unclosedChildren && unclosedChildren.count > 0) {
          return NextResponse.json(
            { error: `未完了の子課題が ${unclosedChildren.count} 件存在するため、親課題を完了にすることはできません` },
            { status: 400 }
          );
        }
      }

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
    // 最終ステータスの判定
    const nextStatus = body.status !== undefined ? String(body.status) : currentIssue.status;

    if (body.priority !== undefined) {
      if (!VALID_PRIORITIES.has(String(body.priority))) {
        return NextResponse.json({ error: "無効な優先度です" }, { status: 400 });
      }
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

    // 完了理由（resolution）の整合性制御
    // 課題が完了（closed）以外の場合、完了理由は存在し得ないため自動的にNULLにクリアする
    if (nextStatus !== "closed") {
      if (currentIssue.resolution !== null || (body.resolution !== undefined && body.resolution !== null)) {
        updates.push("resolution = ?");
        values.push(null);
        if (currentIssue.resolution) {
          historiesToInsert.push({ field: "resolution", oldValue: currentIssue.resolution });
          activityLogs.push({
            type: "updated",
            msg: `課題 [${currentIssue.issue_key}] の状態が完了以外に変更されたため、完了理由を解除しました`,
          });
        }
      }
    } else if (body.resolution !== undefined) {
      // 完了（closed）状態の場合のみ完了理由の設定・変更を許可
      const cleanResolution =
        body.resolution && String(body.resolution).trim() !== ""
          ? String(body.resolution).trim()
          : null;
      if (cleanResolution && !VALID_RESOLUTIONS.has(cleanResolution)) {
        return NextResponse.json({ error: "無効な完了理由です" }, { status: 400 });
      }
      updates.push("resolution = ?");
      values.push(cleanResolution);

      const currentRes = currentIssue.resolution || null;
      if (cleanResolution !== currentRes) {
        historiesToInsert.push({ field: "resolution", oldValue: currentIssue.resolution || "" });
        const resLabels: Record<string, string> = {
          fixed: "対応済み",
          wont_fix: "対応しない",
          invalid: "無効",
          duplicated: "重複",
          cannot_reproduce: "再現しない",
        };
        const prevLabel = currentRes ? (resLabels[currentRes] || currentRes) : "未設定";
        const newLabel = cleanResolution ? (resLabels[cleanResolution] || cleanResolution) : "未設定";
        activityLogs.push({
          type: "updated",
          msg: `課題 [${currentIssue.issue_key}] の完了理由を「${prevLabel}」から「${newLabel}」に変更しました`,
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

      // 開始日が変更された場合、変更前の値を履歴に退避
      if ((currentIssue.start_date || null) !== nextStart) {
        historiesToInsert.push({ field: "start_date", oldValue: currentIssue.start_date || "" });
      }
    }
    if (body.dueDate !== undefined) {
      const nextDue = body.dueDate || null;
      updates.push("due_date = ?");
      values.push(nextDue);

      // 期限日が変更された場合、変更前の値を履歴に退避
      if ((currentIssue.due_date || null) !== nextDue) {
        historiesToInsert.push({ field: "due_date", oldValue: currentIssue.due_date || "" });
        const oldLabel = currentIssue.due_date || "未設定";
        const newLabel = nextDue || "未設定";
        activityLogs.push({
          type: "updated",
          msg: `課題 [${currentIssue.issue_key}] の期限日を「${oldLabel}」から「${newLabel}」に変更しました`,
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

      // 課題変更履歴（タイトル・詳細説明の変更前バージョン）の保存
      if (historiesToInsert.length > 0) {
        const insertHistory = db.prepare(`
          INSERT INTO issue_histories (issue_id, user_id, field_name, old_value, created_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        for (const h of historiesToInsert) {
          insertHistory.run(currentIssue.id, actorId, h.field, h.oldValue);
        }
      }

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

      // 本文中の添付ファイルURLをこの課題にバインド
      if (body.description !== undefined) {
        const descMatches = String(body.description).matchAll(/\/api\/attachments\/(\d+)/g);
        const updateAttStmt = db.prepare(`
          UPDATE attachments
          SET issue_id = ?
          WHERE id = ? AND (issue_id IS NULL OR issue_id = ?)
        `);
        for (const m of descMatches) {
          if (m[1]) updateAttStmt.run(issueId, Number(m[1]), issueId);
        }
      }

      // 実際にフィールド変更があったか、または通知先（参加者）が明示選択されている場合に通知を生成
      const resolvedNextAssigneeId =
        body.assigneeId !== undefined
          ? body.assigneeId
            ? Number(body.assigneeId)
            : null
          : currentIssue.assignee_id;

      const hasOtherChanges =
        (body.issueType !== undefined && body.issueType !== currentIssue.issue_type) ||
        (body.parentId !== undefined && (body.parentId ? Number(body.parentId) : null) !== (currentIssue.parent_id || null));

      const hasEffectiveChange =
        activityLogs.length > 0 ||
        historiesToInsert.length > 0 ||
        hasOtherChanges ||
        (Array.isArray(body.notifyUserIds) && body.notifyUserIds.length > 0);

      if (hasEffectiveChange) {
        const updateSummary =
          activityLogs.length > 0
            ? activityLogs.map((l) => l.msg).join(" / ")
            : `課題 [${currentIssue.issue_key}] を更新しました`;

        createIssueUpdatedNotifications(db, {
          issueId: currentIssue.id,
          senderId: sessionUser.id,
          issueKey: currentIssue.issue_key,
          createdBy: currentIssue.created_by,
          previousAssigneeId: currentIssue.assignee_id,
          newAssigneeId: resolvedNextAssigneeId,
          newDescription: body.description !== undefined ? String(body.description).trim() : undefined,
          existingDescription: currentIssue.description || "",
          updateSummary,
          notifyUserIds: Array.isArray(body.notifyUserIds) ? body.notifyUserIds : [],
        });
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
        creator.name AS creator_name,
        (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'description') AS description_history_count,
        (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'title') AS title_history_count,
        (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'due_date') AS due_date_history_count,
        (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'start_date') AS start_date_history_count
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

// 課題の削除（要ログインセッション、数値IDまたは課題キーに対応）
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id } = await params;
    const isNumeric = /^\d+$/.test(id);
    const db = getDb();
    const actorId = sessionUser.id;

    const currentIssue = db.prepare(`
      SELECT i.*, p.is_archived AS project_is_archived, p.name AS project_name
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      WHERE ${isNumeric ? "i.id = ?" : "i.issue_key = ?"}
    `).get(isNumeric ? Number(id) : id) as {
      id: number;
      issue_key: string;
      title: string;
      created_by: number | null;
      project_is_archived?: number;
      project_name?: string;
    } | undefined;

    if (!currentIssue) {
      return NextResponse.json({ error: "課題が見つかりません" }, { status: 404 });
    }

    // アーカイブされたプロジェクトの課題は読み取り専用のため、削除を禁止（is_archivedまたは名前にアーカイブ含む）
    const isArchived = Boolean(
      currentIssue.project_is_archived ||
      (currentIssue.project_name && (
        currentIssue.project_name.includes("アーカイブ") ||
        currentIssue.project_name.toLowerCase().includes("archive")
      ))
    );
    if (isArchived) {
      return NextResponse.json(
        { error: "この課題が属するプロジェクトはアーカイブされているため、削除できません（読み取り専用）" },
        { status: 403 }
      );
    }

    // 課題を削除できるのは、課題の作成者（起票者）または管理者（Admin）のみ
    const canDelete = Boolean(
      sessionUser.is_admin ||
      sessionUser.role_type === "admin" ||
      (currentIssue.created_by && sessionUser.id === currentIssue.created_by)
    );
    if (!canDelete) {
      return NextResponse.json(
        { error: "課題を削除できるのは、課題の作成者または管理者のみです" },
        { status: 403 }
      );
    }

    const issueId = currentIssue.id;

    // 削除前に関連する添付ファイルの保存ファイル名を取得
    const attachmentsToDelete = db
      .prepare("SELECT stored_name FROM attachments WHERE issue_id = ?")
      .all(issueId) as { stored_name: string }[];

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

    // ディスク上の実体ファイルをクリーンアップ
    for (const att of attachmentsToDelete) {
      try {
        const filePath = path.join(ATTACHMENTS_DIR, att.stored_name);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error("添付ファイル削除エラー:", err);
      }
    }

    return NextResponse.json({ success: true, message: "課題を削除しました" });
  } catch (error) {
    console.error("課題削除エラー:", error);
    return NextResponse.json({ error: "課題の削除に失敗しました" }, { status: 500 });
  }
}
