// ブラウザ側で使う共通イベント関連のユーティリティ

/** 通知一覧の再取得を促すカスタムイベント名 */
export const NOTIFICATIONS_UPDATED_EVENT = "litelog:notifications-updated";

/** トースト通知を発行するカスタムイベント名 */
export const TOAST_EVENT = "litelog:show-toast";

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface ToastOptions {
  id?: string;
  message: string;
  subMessage?: string;
  type?: "success" | "info" | "warning" | "error";
  duration?: number; // ミリ秒（デフォルト 6000ms）
  action?: ToastAction;
}

/**
 * 通知一覧（ヘッダーの通知ドロップダウン等）に再取得を促すイベントを発火する。
 * サーバーサイドレンダリング中（window が存在しない環境）では何もしない。
 */
export function notifyNotificationsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}

/**
 * トースト通知を発火する。
 * サーバーサイドレンダリング中（window が存在しない環境）では何もしない。
 */
export function showToast(options: ToastOptions): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: options }));
}

