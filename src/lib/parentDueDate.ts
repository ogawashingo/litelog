// 子課題の期限延長に伴い、親課題（および祖先課題）の期限日を連動延長するサーバー側ヘルパー
import { DatabaseSync } from "node:sqlite";

export interface ExtendedParentInfo {
  id: number;
  issue_key: string;
  old_due_date: string;
  new_due_date: string;
}

/**
 * 指定された親課題（さらに親がいれば祖先課題まで）の期限日が
 * 子課題の新しい期限日より前の場合、期限日を延長し、変更履歴・アクティビティを記録する。
 * ※呼び出し元のトランザクション内で実行すること。
 */
export function extendAncestorDueDatesIfNeeded(
  db: DatabaseSync,
  params: {
    startParentId: number | null;
    newDueDate: string | null;
    childIssueKey: string;
    actorId: number | null;
  }
): ExtendedParentInfo[] {
  const { startParentId, newDueDate, childIssueKey, actorId } = params;
  if (!startParentId || !newDueDate) {
    return [];
  }

  const extended: ExtendedParentInfo[] = [];
  const visited = new Set<number>();
  let cursorId: number | null = startParentId;

  const selectParentStmt = db.prepare(`
    SELECT id, project_id, parent_id, issue_key, due_date
    FROM issues
    WHERE id = ?
  `);
  const updateDueStmt = db.prepare(`
    UPDATE issues
    SET due_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const insertHistoryStmt = db.prepare(`
    INSERT INTO issue_histories (issue_id, user_id, field_name, old_value, created_at)
    VALUES (?, ?, 'due_date', ?, CURRENT_TIMESTAMP)
  `);
  const insertActivityStmt = db.prepare(`
    INSERT INTO activities (issue_id, user_id, action_type, content)
    VALUES (?, ?, 'updated', ?)
  `);

  let expectedProjectId: number | null = null;

  while (cursorId && !visited.has(cursorId)) {
    visited.add(cursorId);
    const parentRow = selectParentStmt.get(cursorId) as
      | {
          id: number;
          project_id: number;
          parent_id: number | null;
          issue_key: string;
          due_date: string | null;
        }
      | undefined;

    if (!parentRow) break;
    // 別プロジェクトへの意図しない波及を防止
    if (expectedProjectId === null) {
      expectedProjectId = parentRow.project_id;
    } else if (parentRow.project_id !== expectedProjectId) {
      break;
    }

    // 親課題に期限日が設定されており、子課題の新しい期限日より前の場合のみ延長する
    if (parentRow.due_date && parentRow.due_date < newDueDate) {
      updateDueStmt.run(newDueDate, parentRow.id);
      insertHistoryStmt.run(parentRow.id, actorId, parentRow.due_date);
      insertActivityStmt.run(
        parentRow.id,
        actorId,
        `子課題 [${childIssueKey}] の期限延長に伴い、親課題 [${parentRow.issue_key}] の期限日を「${parentRow.due_date}」から「${newDueDate}」に延長しました`
      );
      extended.push({
        id: parentRow.id,
        issue_key: parentRow.issue_key,
        old_due_date: parentRow.due_date,
        new_due_date: newDueDate,
      });
    }

    cursorId = parentRow.parent_id;
  }

  return extended;
}
