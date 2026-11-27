// LocalStorage を利用した下書き（Draft）自動保存・復元・管理ユーティリティ

export interface IssueCreateDraft {
  title: string;
  description: string;
  updatedAt: number;
}

export interface IssueEditDraft {
  title: string;
  description: string;
  updatedAt: number;
}

export interface CommentDraft {
  content: string;
  updatedAt: number;
}

const STORAGE_PREFIX = "litelog_draft:";

/**
 * コメント下書き用ストレージキーを生成
 */
export function getCommentDraftKey(issueId: number): string {
  return `${STORAGE_PREFIX}comment:${issueId}`;
}

/**
 * 課題新規作成下書き用ストレージキーを生成
 */
export function getIssueCreateDraftKey(projectId?: number | null): string {
  const pId = projectId !== undefined && projectId !== null ? projectId : "default";
  return `${STORAGE_PREFIX}issue_create:${pId}`;
}

/**
 * 課題編集下書き用ストレージキーを生成
 */
export function getIssueEditDraftKey(issueId: number): string {
  return `${STORAGE_PREFIX}issue_edit:${issueId}`;
}

/**
 * LocalStorage から下書き文字列を取得（SSR・例外セーフ）
 */
export function getDraft(key: string): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    console.warn("下書き取得エラー (LocalStorage):", err);
    return null;
  }
}

/**
 * LocalStorage に下書き文字列を保存（空文字の場合は自動削除）
 */
export function setDraft(key: string, value: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    if (!value || value.trim() === "") {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch (err) {
    console.warn("下書き保存エラー (LocalStorage):", err);
  }
}

/**
 * LocalStorage から下書きを削除
 */
export function removeDraft(key: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    console.warn("下書き削除エラー (LocalStorage):", err);
  }
}

/**
 * LocalStorage から JSON 形式の下書きオブジェクトを取得
 */
export function getJSONDraft<T>(key: string): T | null {
  const raw = getDraft(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn("下書きJSONパースエラー:", err);
    return null;
  }
}

/**
 * LocalStorage に JSON 形式の下書きオブジェクトを保存
 */
export function setJSONDraft<T>(key: string, value: T | null): void {
  if (!value) {
    removeDraft(key);
    return;
  }
  try {
    setDraft(key, JSON.stringify(value));
  } catch (err) {
    console.warn("下書きJSONシリアライズエラー:", err);
  }
}
