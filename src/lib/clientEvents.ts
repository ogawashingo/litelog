// ブラウザ側で使う共通イベント関連のユーティリティ

/** 通知一覧の再取得を促すカスタムイベント名 */
export const NOTIFICATIONS_UPDATED_EVENT = "litelog:notifications-updated";

/**
 * 通知一覧（ヘッダーの通知ドロップダウン等）に再取得を促すイベントを発火する。
 * サーバーサイドレンダリング中（window が存在しない環境）では何もしない。
 */
export function notifyNotificationsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}
