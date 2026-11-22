// 課題詳細（モーダル・個別ページ）共通の純粋ヘルパー関数
import { Issue } from "@/types";

export interface SelectedEditParentInfo {
  issueKey: string | null;
  title: string | null;
  dueDate: string | null;
}

/**
 * 編集フォームで選択中の親課題情報（期限日超過チェック用）を取得する
 */
export function getSelectedEditParentInfo(
  editParentId: string,
  availableParents: Issue[],
  activeIssue: Issue | null
): SelectedEditParentInfo | null {
  if (!editParentId) return null;
  const pid = Number(editParentId);
  const found = availableParents.find((p) => p.id === pid);
  if (found) {
    return {
      issueKey: found.issue_key,
      title: found.title,
      dueDate: found.due_date,
    };
  }
  if (activeIssue && activeIssue.parent_id === pid) {
    return {
      issueKey: activeIssue.parent_issue_key ?? null,
      title: activeIssue.parent_title ?? null,
      dueDate: activeIssue.parent_due_date ?? null,
    };
  }
  return null;
}

/**
 * バイト数を人間が読みやすいファイルサイズ表記に変換する
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
