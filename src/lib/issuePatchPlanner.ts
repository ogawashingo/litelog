// 課題更新（PATCH）リクエストのバリデーションおよび更新計画（SQL句・履歴・アクティビティ）生成ヘルパー
import type { DatabaseSync } from "node:sqlite";
import { canUserAccessProject } from "@/lib/db";
import { MAX_LENGTHS, validateDateRange, validateMaxLength } from "@/lib/validation";
import type { IssueWithProjectRecord } from "@/lib/issueDetailQueries";

const VALID_ISSUE_TYPES = new Set(["task", "bug", "request", "other"]);
const VALID_STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);
const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
const VALID_RESOLUTIONS = new Set(["fixed", "wont_fix", "invalid", "duplicated", "cannot_reproduce"]);

const TYPE_LABELS: Record<string, string> = {
  task: "タスク",
  bug: "バグ",
  request: "要望",
  other: "その他",
};

const STATUS_LABELS: Record<string, string> = {
  open: "未対応",
  in_progress: "処理中",
  resolved: "処理済み",
  closed: "完了",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const RESOLUTION_LABELS: Record<string, string> = {
  fixed: "対応済み",
  wont_fix: "対応しない",
  invalid: "無効",
  duplicated: "重複",
  cannot_reproduce: "再現しない",
};

export interface PatchSessionUser {
  id: number;
  is_admin: number;
  role_type?: string;
}

export interface IssuePatchPlan {
  updates: string[];
  values: (string | number | null)[];
  activityLogs: { type: string; msg: string }[];
  historiesToInsert: { field: string; oldValue: string }[];
  nextStatus: string;
}

export type BuildIssuePatchPlanResult =
  | { ok: true; plan: IssuePatchPlan }
  | { ok: false; error: string; status: number };

// PATCH リクエストボディを検証し、SQL更新カラム・履歴・アクティビティの実行計画を構築
export function buildIssuePatchPlan(
  db: DatabaseSync,
  currentIssue: IssueWithProjectRecord,
  body: Record<string, unknown>,
  sessionUser: PatchSessionUser
): BuildIssuePatchPlanResult {
  const issueId = currentIssue.id;
  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  const activityLogs: { type: string; msg: string }[] = [];
  const historiesToInsert: { field: string; oldValue: string }[] = [];

  // 件名
  if (body.title !== undefined) {
    const cleanTitle = String(body.title).trim();
    if (!cleanTitle) {
      return { ok: false, error: "件名は空にできません", status: 400 };
    }
    const titleLengthErr = validateMaxLength(cleanTitle, MAX_LENGTHS.ISSUE_TITLE, "課題名");
    if (titleLengthErr) {
      return { ok: false, error: titleLengthErr, status: 400 };
    }
    updates.push("title = ?");
    values.push(cleanTitle);

    if (cleanTitle !== currentIssue.title) {
      historiesToInsert.push({ field: "title", oldValue: currentIssue.title });
      activityLogs.push({
        type: "updated",
        msg: `課題 [${currentIssue.issue_key}] のタイトルを「${currentIssue.title}」から「${cleanTitle}」に変更しました`,
      });
    }
  }

  // 詳細説明
  if (body.description !== undefined) {
    const cleanDesc = String(body.description).trim();
    const descLengthErr = validateMaxLength(cleanDesc, MAX_LENGTHS.ISSUE_DESCRIPTION, "詳細説明");
    if (descLengthErr) {
      return { ok: false, error: descLengthErr, status: 400 };
    }
    const currentDesc = (currentIssue.description || "").trim();
    updates.push("description = ?");
    values.push(cleanDesc);

    if (cleanDesc !== currentDesc) {
      historiesToInsert.push({ field: "description", oldValue: currentIssue.description || "" });
      activityLogs.push({
        type: "updated",
        msg: `課題 [${currentIssue.issue_key}] の詳細説明を更新しました`,
      });
    }
  }

  // 種別
  if (body.issueType !== undefined) {
    const nextType = String(body.issueType);
    if (!VALID_ISSUE_TYPES.has(nextType)) {
      return { ok: false, error: "無効な課題種別です", status: 400 };
    }
    updates.push("issue_type = ?");
    values.push(nextType);
    if (currentIssue.issue_type !== nextType) {
      const prevTypeLabel = TYPE_LABELS[currentIssue.issue_type] || currentIssue.issue_type;
      const newTypeLabel = TYPE_LABELS[nextType] || nextType;
      activityLogs.push({
        type: "updated",
        msg: `課題 [${currentIssue.issue_key}] の種別を「${prevTypeLabel}」から「${newTypeLabel}」に変更しました`,
      });
    }
  }

  // 状態
  if (body.status !== undefined) {
    const reqStatus = String(body.status);
    if (!VALID_STATUSES.has(reqStatus)) {
      return { ok: false, error: "無効な状態です", status: 400 };
    }

    // 一般メンバーがコメントなしで「処理済み」へ変更することを禁止（Admin/PMOはスキップ許可）
    const isManager = sessionUser.is_admin === 1 || sessionUser.role_type === "pmo";
    if (reqStatus === "resolved" && currentIssue.status !== "resolved" && !isManager) {
      return {
        ok: false,
        error: "「処理済み」に変更する際は、レビュー・確認依頼コメントを添えて更新してください",
        status: 400,
      };
    }

    // 課題を完了（closed）にできるのは、課題の起票者・PMO・または管理者のみ
    if (reqStatus === "closed" && currentIssue.status !== "closed") {
      const canClose = Boolean(
        sessionUser.is_admin ||
          sessionUser.role_type === "pmo" ||
          (currentIssue.created_by && sessionUser.id === currentIssue.created_by)
      );
      if (!canClose) {
        return {
          ok: false,
          error: "課題を完了にできるのは、課題の作成者・PMO・または管理者のみです",
          status: 403,
        };
      }
    }

    // 未完了の子課題が存在する場合、親課題を完了（closed）にできないバリデーション
    if (reqStatus === "closed") {
      const unclosedChildren = db
        .prepare("SELECT COUNT(*) AS count FROM issues WHERE parent_id = ? AND status != 'closed'")
        .get(issueId) as { count: number } | undefined;

      if (unclosedChildren && unclosedChildren.count > 0) {
        return {
          ok: false,
          error: `未完了の子課題が ${unclosedChildren.count} 件存在するため、親課題を完了にすることはできません`,
          status: 400,
        };
      }
    }

    updates.push("status = ?");
    values.push(reqStatus);

    if (currentIssue.status !== reqStatus) {
      const prevLabel = STATUS_LABELS[currentIssue.status] || currentIssue.status;
      const newLabel = STATUS_LABELS[reqStatus] || reqStatus;
      activityLogs.push({
        type: "status_changed",
        msg: `課題 [${currentIssue.issue_key}] の状態を「${prevLabel}」から「${newLabel}」に変更しました`,
      });
    }
  }

  const nextStatus = body.status !== undefined ? String(body.status) : currentIssue.status;

  // 優先度
  if (body.priority !== undefined) {
    const nextPriority = String(body.priority);
    if (!VALID_PRIORITIES.has(nextPriority)) {
      return { ok: false, error: "無効な優先度です", status: 400 };
    }
    updates.push("priority = ?");
    values.push(nextPriority);
    if (currentIssue.priority !== nextPriority) {
      const newPrio = PRIORITY_LABELS[nextPriority] || nextPriority;
      activityLogs.push({
        type: "updated",
        msg: `課題 [${currentIssue.issue_key}] の優先度を「${newPrio}」に変更しました`,
      });
    }
  }

  // 完了理由（resolution）の整合性制御
  if (nextStatus !== "closed") {
    if (
      currentIssue.resolution !== null ||
      (body.resolution !== undefined && body.resolution !== null)
    ) {
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
    const cleanResolution =
      body.resolution && String(body.resolution).trim() !== ""
        ? String(body.resolution).trim()
        : null;
    if (cleanResolution && !VALID_RESOLUTIONS.has(cleanResolution)) {
      return { ok: false, error: "無効な完了理由です", status: 400 };
    }
    updates.push("resolution = ?");
    values.push(cleanResolution);

    const currentRes = currentIssue.resolution || null;
    if (cleanResolution !== currentRes) {
      historiesToInsert.push({ field: "resolution", oldValue: currentIssue.resolution || "" });
      const prevLabel = currentRes ? RESOLUTION_LABELS[currentRes] || currentRes : "未設定";
      const newLabel = cleanResolution
        ? RESOLUTION_LABELS[cleanResolution] || cleanResolution
        : "未設定";
      activityLogs.push({
        type: "updated",
        msg: `課題 [${currentIssue.issue_key}] の完了理由を「${prevLabel}」から「${newLabel}」に変更しました`,
      });
    }
  }

  // 担当者
  if (body.assigneeId !== undefined) {
    const targetAssigneeId = body.assigneeId ? Number(body.assigneeId) : null;
    let targetAssigneeName = "不明";
    if (targetAssigneeId !== null) {
      if (!Number.isInteger(targetAssigneeId) || targetAssigneeId <= 0) {
        return { ok: false, error: "無効な担当者IDです", status: 400 };
      }
      const targetUser = db
        .prepare("SELECT id, name, role_type, is_admin FROM users WHERE id = ?")
        .get(targetAssigneeId) as
        | { id: number; name: string; role_type?: string; is_admin?: number }
        | undefined;
      if (!targetUser) {
        return { ok: false, error: "指定された担当者が見つかりません", status: 400 };
      }
      const canAssigneeAccess = canUserAccessProject(
        db,
        targetUser.id,
        Number(currentIssue.project_id),
        targetUser.role_type,
        targetUser.is_admin
      );
      if (!canAssigneeAccess) {
        return {
          ok: false,
          error: "指定された担当者はこのプロジェクトのメンバーではありません",
          status: 400,
        };
      }
      targetAssigneeName = targetUser.name;
    }
    updates.push("assignee_id = ?");
    values.push(targetAssigneeId);

    if (currentIssue.assignee_id !== targetAssigneeId) {
      if (targetAssigneeId) {
        activityLogs.push({
          type: "updated",
          msg: `課題 [${currentIssue.issue_key}] の担当者を「${targetAssigneeName}」に設定しました`,
        });
      } else {
        activityLogs.push({
          type: "updated",
          msg: `課題 [${currentIssue.issue_key}] の担当者を未割当にしました`,
        });
      }
    }
  }

  // 親課題
  if (body.parentId !== undefined) {
    const targetParentId = body.parentId ? Number(body.parentId) : null;
    if (targetParentId === issueId) {
      return { ok: false, error: "自分自身を親課題に設定することはできません", status: 400 };
    }
    if (targetParentId) {
      const targetParentRow = db
        .prepare("SELECT id, project_id FROM issues WHERE id = ?")
        .get(targetParentId) as { id: number; project_id: number } | undefined;
      if (!targetParentRow) {
        return { ok: false, error: "指定された親課題が見つかりません", status: 404 };
      }
      if (Number(targetParentRow.project_id) !== Number(currentIssue.project_id)) {
        return {
          ok: false,
          error: "異なるプロジェクトの課題を親課題に設定することはできません",
          status: 403,
        };
      }

      // 親子課題の循環参照チェック（A -> B -> A の防止）
      let cursorId: number | null = targetParentId;
      const visited = new Set<number>([issueId]);
      const getParentStmt = db.prepare("SELECT parent_id FROM issues WHERE id = ?");
      while (cursorId) {
        if (visited.has(cursorId)) {
          return {
            ok: false,
            error: "子孫課題を親課題に設定すること（循環参照）はできません",
            status: 400,
          };
        }
        visited.add(cursorId);
        const parentRow = getParentStmt.get(cursorId) as { parent_id: number | null } | undefined;
        cursorId = parentRow?.parent_id ?? null;
      }
    }
    updates.push("parent_id = ?");
    values.push(targetParentId);
  }

  // 開始日・期限日のフォーマットおよび前後関係チェック
  const nextStartDateForCheck =
    body.startDate !== undefined
      ? body.startDate
        ? String(body.startDate).trim()
        : null
      : currentIssue.start_date || null;
  const nextDueDateForCheck =
    body.dueDate !== undefined
      ? body.dueDate
        ? String(body.dueDate).trim()
        : null
      : currentIssue.due_date || null;
  if (body.startDate !== undefined || body.dueDate !== undefined) {
    const dateRangeErr = validateDateRange(nextStartDateForCheck, nextDueDateForCheck);
    if (dateRangeErr) {
      return { ok: false, error: dateRangeErr, status: 400 };
    }
  }

  if (body.startDate !== undefined) {
    updates.push("start_date = ?");
    values.push(nextStartDateForCheck);

    if ((currentIssue.start_date || null) !== nextStartDateForCheck) {
      historiesToInsert.push({ field: "start_date", oldValue: currentIssue.start_date || "" });
    }
  }

  if (body.dueDate !== undefined) {
    updates.push("due_date = ?");
    values.push(nextDueDateForCheck);

    if ((currentIssue.due_date || null) !== nextDueDateForCheck) {
      historiesToInsert.push({ field: "due_date", oldValue: currentIssue.due_date || "" });
      const oldLabel = currentIssue.due_date || "未設定";
      const newLabel = nextDueDateForCheck || "未設定";
      activityLogs.push({
        type: "updated",
        msg: `課題 [${currentIssue.issue_key}] の期限日を「${oldLabel}」から「${newLabel}」に変更しました`,
      });
    }
  }

  return {
    ok: true,
    plan: {
      updates,
      values,
      activityLogs,
      historiesToInsert,
      nextStatus,
    },
  };
}
