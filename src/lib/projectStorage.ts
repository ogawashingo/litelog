// 選択中プロジェクトのローカルストレージ同期ユーティリティ
"use client";

const PROJECT_STORAGE_KEY = "litelog_selected_project_id";

/**
 * ローカルストレージに保存されている直近選択プロジェクトIDを取得
 */
export function getStoredProjectId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const val = localStorage.getItem(PROJECT_STORAGE_KEY) || localStorage.getItem("backlog_selected_project_id");
    if (!val) return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

/**
 * 選択中プロジェクトIDをローカルストレージへ保存（nullの場合は削除）
 */
export function setStoredProjectId(id: number | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id === null || id === undefined) {
      localStorage.removeItem(PROJECT_STORAGE_KEY);
      localStorage.removeItem("backlog_selected_project_id");
    } else {
      localStorage.setItem(PROJECT_STORAGE_KEY, String(id));
      localStorage.removeItem("backlog_selected_project_id");
    }
  } catch {
    // ローカルストレージが無効な環境では無視
  }
}
