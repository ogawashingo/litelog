// 課題詳細API（GET / PATCH / DELETE）向けデータベースクエリ・共通判定ヘルパー
import type { DatabaseSync } from "node:sqlite";
import { attachReactionsToComments } from "@/lib/db";

export interface IssueWithProjectRecord {
  id: number;
  project_id: number;
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
}

// 所属プロジェクトがアーカイブ済み（読み取り専用）かを判定
export function isIssueProjectArchived(issue: {
  project_is_archived?: number;
  project_name?: string;
}): boolean {
  return Boolean(
    issue.project_is_archived ||
      (issue.project_name &&
        (issue.project_name.includes("アーカイブ") ||
          issue.project_name.toLowerCase().includes("archive")))
  );
}

// 数値IDまたは課題キーから課題＋プロジェクト情報を取得（PATCH / DELETE共通）
export function getIssueWithProjectByIdOrKey(
  db: DatabaseSync,
  idOrKey: string
): IssueWithProjectRecord | undefined {
  const isNumeric = /^\d+$/.test(idOrKey);
  return db
    .prepare(
      `
      SELECT i.*, p.is_archived AS project_is_archived, p.name AS project_name
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      WHERE ${isNumeric ? "i.id = ?" : "i.issue_key = ?"}
    `
    )
    .get(isNumeric ? Number(idOrKey) : idOrKey) as IssueWithProjectRecord | undefined;
}

// 数値IDまたは課題キーから課題詳細レコードを取得（GET用：履歴件数・ピン状態・最新コメント結合）
export function getIssueDetailRecord(
  db: DatabaseSync,
  idOrKey: string,
  sessionUserId: number
): Record<string, unknown> | undefined {
  const isNumeric = /^\d+$/.test(idOrKey);
  return db
    .prepare(
      `
      SELECT 
        i.*,
        p.name AS project_name,
        p.color AS project_color,
        p.is_archived AS project_is_archived,
        parent.issue_key AS parent_issue_key,
        parent.title AS parent_title,
        parent.due_date AS parent_due_date,
        u.name AS assignee_name,
        u.color AS assignee_color,
        creator.name AS creator_name,
        (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'description') AS description_history_count,
        (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'title') AS title_history_count,
        (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'due_date') AS due_date_history_count,
        (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'start_date') AS start_date_history_count,
        (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'resolution') AS resolution_history_count,
        COALESCE(cmt_stat.comment_count, 0) AS comment_count,
        CASE WHEN my_pin.issue_id IS NOT NULL AND i.status != 'closed' THEN 1 ELSE 0 END AS is_pinned,
        CASE WHEN i.status != 'closed' THEN my_pin.pinned_at ELSE NULL END AS pinned_at,
        latest_c.content AS latest_comment_content,
        latest_c.created_at AS latest_comment_created_at,
        cu.name AS latest_comment_user_name,
        cu.color AS latest_comment_user_color
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN issues parent ON i.parent_id = parent.id
      LEFT JOIN users u ON i.assignee_id = u.id
      LEFT JOIN users creator ON i.created_by = creator.id
      LEFT JOIN issue_pins my_pin ON my_pin.issue_id = i.id AND my_pin.user_id = ?
      LEFT JOIN (
        SELECT issue_id, COUNT(*) AS comment_count, MAX(id) AS latest_comment_id
        FROM comments
        GROUP BY issue_id
      ) cmt_stat ON cmt_stat.issue_id = i.id
      LEFT JOIN comments latest_c ON latest_c.id = cmt_stat.latest_comment_id
      LEFT JOIN users cu ON latest_c.user_id = cu.id
      WHERE ${isNumeric ? "i.id = ?" : "i.issue_key = ?"}
    `
    )
    .get(sessionUserId, isNumeric ? Number(idOrKey) : idOrKey) as
    | Record<string, unknown>
    | undefined;
}

// 課題に紐づく子課題・コメント（リアクション付き）・添付ファイルを取得
export function getIssueRelatedEntities(
  db: DatabaseSync,
  issueId: number,
  sessionUserId: number
) {
  const children = db
    .prepare(
      `
      SELECT 
        i.*,
        p.name AS project_name,
        p.color AS project_color,
        u.name AS assignee_name,
        u.color AS assignee_color,
        creator.name AS creator_name,
        CASE WHEN my_pin.issue_id IS NOT NULL AND i.status != 'closed' THEN 1 ELSE 0 END AS is_pinned,
        CASE WHEN i.status != 'closed' THEN my_pin.pinned_at ELSE NULL END AS pinned_at
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN users u ON i.assignee_id = u.id
      LEFT JOIN users creator ON i.created_by = creator.id
      LEFT JOIN issue_pins my_pin ON my_pin.issue_id = i.id AND my_pin.user_id = ?
      WHERE i.parent_id = ?
      ORDER BY i.issue_number ASC
    `
    )
    .all(sessionUserId, issueId);

  const rawComments = db
    .prepare(
      `
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM comment_histories ch WHERE ch.comment_id = c.id) AS history_count,
        u.name AS user_name,
        u.color AS user_color
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.issue_id = ?
      ORDER BY c.created_at ASC
    `
    )
    .all(issueId) as { id: number }[];
  const comments = attachReactionsToComments(db, rawComments);

  const attachments = db
    .prepare(
      `
      SELECT 
        a.*,
        u.name AS user_name,
        u.color AS user_color
      FROM attachments a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.issue_id = ?
      ORDER BY a.created_at ASC, a.id ASC
    `
    )
    .all(issueId);

  return { children, comments, attachments };
}

// PATCH 更新後の最新課題レコードを取得
export function getUpdatedIssueRecord(db: DatabaseSync, issueId: number) {
  return db
    .prepare(
      `
      SELECT 
        i.*, 
        p.name AS project_name, 
        p.color AS project_color,
        parent.issue_key AS parent_issue_key,
        parent.title AS parent_title,
        parent.due_date AS parent_due_date,
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
    `
    )
    .get(issueId);
}
