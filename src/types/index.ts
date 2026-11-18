// litelog の共通型定義

// ユーザーの3段階権限ロール種別
// - admin: システム管理者（ユーザー管理・システム設定・プロジェクト削除など全権限）
// - pmo: PMO / マネージャー（全課題の検収・完了、処理済みモーダルスキップが可能。システム設定やユーザー削除は不可）
// - member: 一般メンバー（通常の作業、自分が起票した課題のみ完了可能）
export type UserRoleType = "admin" | "pmo" | "member";

// ユーザー（チームメンバー）情報
export interface User {
  id: number;
  login_id: string;  // ログインID（例: 'yamada', 'sato', 'suzuki'）
  name: string;      // メンバー表示名（例: '山田 太郎'）
  role: string;      // 役割・肩書き（例: '管理者', 'PMO', 'エンジニア'）
  is_admin: number;  // 管理者権限フラグ（1: Admin管理者, 0: PMOまたは一般メンバー）
  role_type?: UserRoleType; // 権限ロール種別（'admin' | 'pmo' | 'member'）
  color: string;     // アバターカラー（16進数カラーコード）
  week_start?: WeekStartDay; // カレンダー週開始曜日（'monday' | 'sunday'）
  show_holidays?: boolean;   // 日本の祝日表示フラグ（true: 表示, false: 非表示）
  totp_enabled?: number;     // 2要素認証（TOTP）有効フラグ（1: 有効, 0: 未設定）
  created_at: string;
  issue_count?: number;      // 担当課題総数（集計時）
  open_issue_count?: number; // 未完了の担当課題数（集計時）
  projects?: { id: number; key: string; name: string; color: string; is_archived?: number }[]; // 所属プロジェクト一覧
  project_count?: number;    // 所属プロジェクト件数
}

/**
 * ユーザーの権限ロール（admin / pmo / member）を正規化して返します
 */
export function getUserRoleType(
  user?: { is_admin?: number; role_type?: string | null; role?: string | null } | null
): UserRoleType {
  if (!user) return "member";
  if (user.is_admin === 1 || user.role_type === "admin") return "admin";
  if (user.role_type === "pmo") return "pmo";
  return "member";
}

/**
 * システム管理者（Admin）かどうかを判定します
 */
export function isAdminUser(
  user?: { is_admin?: number; role_type?: string | null } | null
): boolean {
  if (!user) return false;
  return user.is_admin === 1 || user.role_type === "admin";
}

/**
 * PMO / マネージャーかどうかを判定します
 */
export function isPmoUser(
  user?: { is_admin?: number; role_type?: string | null; role?: string | null } | null
): boolean {
  return getUserRoleType(user) === "pmo";
}

/**
 * 課題の進行管理・検収権限（Admin または PMO）を持っているか判定します
 * （誰が起票した課題でも完了にでき、処理済み変更時のレビュー依頼モーダルもスキップ可能）
 */
export function canManageIssues(
  user?: { is_admin?: number; role_type?: string | null; role?: string | null } | null
): boolean {
  const rt = getUserRoleType(user);
  return rt === "admin" || rt === "pmo";
}

/**
 * 課題の削除権限（システム管理者 Admin または課題の作成者本人）を持っているか判定します
 */
export function canDeleteIssue(
  user?: { id?: number; is_admin?: number; role_type?: string | null } | null,
  issue?: { created_by?: number | null } | null
): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  if (issue?.created_by && user.id === issue.created_by) return true;
  return false;
}

// プロジェクト情報
export interface Project {
  id: number;
  key: string;       // プロジェクトキー（例: 'MYPRJ'）
  name: string;      // プロジェクト名
  color: string;     // テーマカラー（16進数カラーコード）
  is_archived?: number; // アーカイブ状態（1: アーカイブ済み・読み取り専用, 0: アクティブ）
  created_at: string;
  members?: User[];  // 参加メンバー一覧
  member_count?: number; // 参加メンバー総数
}

/**
 * プロジェクトまたは課題の所属プロジェクトがアーカイブ状態（読み取り専用）であるかを判定する共通ヘルパー
 * - is_archived フラグが 1 または true
 * - またはプロジェクト名・プロジェクトキーに「アーカイブ」や「archive」が含まれているものも対象
 */
export function isArchivedProject(
  target?: { is_archived?: number | boolean; name?: string; key?: string; project_name?: string; project_key?: string; project_is_archived?: number | boolean } | null
): boolean {
  if (!target) return false;
  if (Boolean(target.is_archived) || Boolean(target.project_is_archived)) return true;
  const name = (target.name || target.project_name || "").toLowerCase();
  const key = (target.key || target.project_key || "").toLowerCase();
  if (name.includes("アーカイブ") || name.includes("archive")) return true;
  if (key.includes("archive")) return true;
  return false;
}

// 課題の種別
export type IssueType = "task" | "bug" | "request" | "other";

// 課題のステータス
export type IssueStatus = "open" | "in_progress" | "resolved" | "closed";

// 課題の優先度
export type IssuePriority = "high" | "medium" | "low";

// 課題の完了理由（Resolution）
export type IssueResolution =
  | "fixed"             // 対応済み
  | "wont_fix"          // 対応しない
  | "invalid"           // 無効
  | "duplicated"        // 重複
  | "cannot_reproduce"; // 再現しない

// 完了理由の表示名マッピング
export const RESOLUTION_LABELS: Record<IssueResolution, string> = {
  fixed: "対応済み",
  wont_fix: "対応しない",
  invalid: "無効",
  duplicated: "重複",
  cannot_reproduce: "再現しない",
};

// 完了理由のセレクトボックス選択肢
export const RESOLUTION_OPTIONS: { value: IssueResolution; label: string }[] = [
  { value: "fixed", label: "対応済み" },
  { value: "wont_fix", label: "対応しない" },
  { value: "invalid", label: "無効" },
  { value: "duplicated", label: "重複" },
  { value: "cannot_reproduce", label: "再現しない" },
];

// 課題（タスク）情報
export interface Issue {
  id: number;
  project_id: number;
  parent_id: number | null;   // 親課題ID（親子関係用）
  assignee_id: number | null; // 担当者ユーザーID
  created_by?: number | null; // 作成者ユーザーID
  issue_key: string;      // 課題キー（例: 'MYPRJ-1'）
  issue_number: number;   // 連番
  title: string;          // 課題名・件名
  description: string;    // 詳細・メモ
  issue_type: IssueType;  // 種別
  status: IssueStatus;    // 状態
  priority: IssuePriority;// 優先度
  start_date: string | null; // 開始日 (YYYY-MM-DD)
  due_date: string | null;// 期限日 (YYYY-MM-DD)
  resolution?: IssueResolution | null; // 完了理由（対応済み・対応しない・無効・重複・再現しない等）
  created_at: string;
  updated_at: string;
  project_name?: string;  // 結合時のプロジェクト名
  project_key?: string;   // 結合時のプロジェクトキー（例: 'MYPRJ'）
  project_color?: string; // 結合時のプロジェクトカラー
  project_is_archived?: number; // 結合時のプロジェクトアーカイブ状態（1: アーカイブ済み）
  parent_issue_key?: string | null; // 結合時の親課題キー
  parent_title?: string | null;     // 結合時の親課題タイトル
  assignee_name?: string | null;    // 結合時の担当者名
  assignee_color?: string | null;   // 結合時の担当者カラー
  creator_name?: string | null;     // 結合時の作成者名
  comment_count?: number;           // コメント総数
  latest_comment_content?: string | null;   // 最新コメント本文
  latest_comment_created_at?: string | null;// 最新コメント投稿日時
  latest_comment_user_name?: string | null; // 最新コメント投稿者名
  latest_comment_user_color?: string | null;// 最新コメント投稿者カラー
  description_history_count?: number;       // 詳細説明の編集履歴件数
  title_history_count?: number;             // タイトルの変更履歴件数
  due_date_history_count?: number;          // 期限日の変更履歴件数
  start_date_history_count?: number;        // 開始日の変更履歴件数
  resolution_history_count?: number;        // 完了理由の変更履歴件数
  attachment_count?: number;                // 添付ファイル総数
  children?: Issue[];     // 親子ツリー時の子課題リスト
}

// コメントスタンプ（リアクション）種別（👍 いいね / ✅ 確認）
export type CommentStamp = "👍" | "✅";

// コメントスタンプ選択肢の定義（余計な文字は省き、シンプルに絵文字のみで直感操作）
export const COMMENT_STAMP_OPTIONS: {
  stamp: CommentStamp;
  label: string;
}[] = [
  { stamp: "👍", label: "いいね" },
  { stamp: "✅", label: "確認" },
];

// コメントリアクション（スタンプ）情報
export interface CommentReaction {
  id: number;
  comment_id: number;
  user_id: number;            // リアクションしたユーザーID
  user_name?: string | null;  // 結合時のユーザー名
  user_color?: string | null; // 結合時のユーザーカラー
  stamp: CommentStamp;        // スタンプ絵文字
  created_at: string;
}

// コメント情報
export interface Comment {
  id: number;
  issue_id: number;
  user_id?: number | null;    // 投稿者ユーザーID
  user_name?: string | null;  // 結合時の投稿者名
  user_color?: string | null; // 結合時の投稿者カラー
  content: string;
  created_at: string;
  updated_at?: string | null; // 最終更新日時
  history_count?: number;     // 編集履歴の件数
  reactions?: CommentReaction[]; // コメントに付与されたスタンプ一覧
}

// コメント編集履歴情報
export interface CommentHistory {
  id: number;
  comment_id: number;
  user_id?: number | null;    // 当時の投稿者/変更者ユーザーID
  user_name?: string | null;  // 結合時のユーザー名
  user_color?: string | null; // 結合時のユーザーカラー
  content: string;            // 変更前のコメント本文
  created_at: string;         // 履歴作成日時
}

// 課題変更履歴情報（タイトル・詳細説明・期日等の過去バージョン）
export interface IssueHistory {
  id: number;
  issue_id: number;
  user_id?: number | null;    // 変更者ユーザーID
  user_name?: string | null;  // 結合時の変更者名
  user_color?: string | null; // 結合時の変更者カラー
  field_name: "title" | "description" | "due_date" | "start_date" | string; // 変更されたフィールド名
  old_value?: string | null;  // 変更前の値
  created_at: string;         // 履歴保存日時
}

// アクティビティ（最近の更新）情報
export interface Activity {
  id: number;
  issue_id: number | null;
  comment_id?: number | null; // コメント追加時のコメントID
  user_id?: number | null;    // 操作者ユーザーID
  user_name?: string | null;  // 結合時の操作者名
  user_color?: string | null; // 結合時の操作者カラー
  action_type: "created" | "updated" | "status_changed" | "commented" | "deleted";
  content: string;
  created_at: string;
  issue_key?: string;
  issue_title?: string;
  issue_status?: IssueStatus;
  issue_type?: IssueType;
  project_id?: number | null;
  project_key?: string | null;
  project_name?: string | null;
  project_color?: string | null;
  reactions?: CommentReaction[]; // コメントに紐づくスタンプ一覧
}

// ダッシュボードに表示するサマリー統計
export interface DashboardSummary {
  totalIssues: number;
  openCount: number;
  inProgressCount: number;
  resolvedCount: number;
  closedCount: number;
  overdueCount: number;
  dueTodayCount: number;
}

// 日時フォーマット種別
export type DateTimeFormatType =
  | "slash_sec"      // YYYY/MM/DD HH:mm:ss
  | "slash_nosec"    // YYYY/MM/DD HH:mm
  | "hyphen_sec"     // YYYY-MM-DD HH:mm:ss
  | "hyphen_nosec"   // YYYY-MM-DD HH:mm
  | "jp_full";       // YYYY年MM月DD日 HH:mm:ss

// アクティビティの時刻表示スタイル
export type ActivityTimeStyle = "both" | "absolute" | "relative";

// デザインカラーテーマ識別子
export type ThemeId =
  | "cosmic"      // コズミック・グラデーション（デフォルト / 華やかグラデーション）
  | "monochrome"  // シック・モノクロ＆オレンジ（グラデなし・黒白オレンジミニマル）
  | "forest"      // 北欧フォレスト＆ミント（グラデなし・深緑＆ミント）
  | "navy"        // モダン・ネイビー＆シアン（グラデなし・端正な濃紺＆シアン）
  | "sunset"      // サンセット・コーラル＆アンバー（夕暮れウォームグラデーション）
  | "dark";       // ミッドナイト・サイバーダーク（ダークモード）

// カレンダーの週開始曜日（月曜始まり / 日曜始まり）
export type WeekStartDay = "monday" | "sunday";

// システム一言通知（アナウンスメント）の通知種別
export type AnnouncementType = "info" | "warning" | "alert" | "success";

// 一言通知の種別設定一覧
export const ANNOUNCEMENT_TYPE_OPTIONS: {
  value: AnnouncementType;
  label: string;
  badge: string;
  description: string;
}[] = [
  { value: "info", label: "お知らせ (Info)", badge: "お知らせ", description: "一般的な連絡・情報共有" },
  { value: "warning", label: "注意 (Warning)", badge: "注意", description: "メンテ予告や締切リマインド" },
  { value: "alert", label: "緊急 (Alert)", badge: "緊急", description: "システム障害や作業中注意喚起" },
  { value: "success", label: "完了 (Success)", badge: "完了", description: "リリース完了や目標達成" },
];

// システム時刻・表示設定（管理ページ設定）
export interface SystemSettings {
  timezone: string;                  // 例: 'Asia/Tokyo', 'UTC', 'local' 等
  datetimeFormat: DateTimeFormatType;// 日時表示フォーマット
  hour12: boolean;                   // true: 12時間表記, false: 24時間表記
  activityTimeStyle: ActivityTimeStyle; // 最近の更新の時刻表示形式
  timeOffsetMinutes: number;         // 手動時刻補正オフセット（分単位、デフォルト 0）
  theme: ThemeId;                    // デザインカラーテーマ
  weekStart: WeekStartDay;           // 週の開始曜日（カレンダー表示: "monday" | "sunday"）
  showHolidays: boolean;             // 日本の祝日表示（カレンダー赤字・祝日名表示）
  announcementEnabled?: boolean;     // ヘッダー一言通知の表示ON/OFF
  announcementMessage?: string;      // ヘッダー一言通知の本文
  announcementType?: AnnouncementType;// ヘッダー一言通知の種別
  announcementUpdatedAt?: string;    // ヘッダー一言通知の更新日時（既読リセット判定用）
}

// 通知種別
export type NotificationType =
  | "mention"    // @メンションされた時
  | "assigned"   // 担当者に設定（アサイン）された時
  | "commented"  // 作成課題・担当課題にコメントされた時
  | "updated"    // 作成課題・担当課題が更新された時
  | "notify"     // 通知先（参加者）チェックボックスで指定された時
  | "reaction";  // 自分のコメントにスタンプ（リアクション）された時

// 通知情報（メンション・自動通知・参加者通知等）
export interface Notification {
  id: number;
  user_id: number;           // 通知受信者ユーザーID
  sender_id: number | null;  // 通知送信者（操作者）ユーザーID
  sender_name?: string | null;  // 送信者名（結合時）
  sender_color?: string | null; // 送信者カラー（結合時）
  issue_id: number;          // 関連課題ID
  issue_key?: string;        // 関連課題キー（例: 'MYPRJ-1'）
  issue_title?: string;      // 関連課題タイトル
  project_name?: string;     // プロジェクト名
  project_color?: string;    // プロジェクトカラー
  comment_id: number | null; // コメントID（コメント経由の場合）
  type: NotificationType | string; // 通知種別
  content: string;           // 通知本文・抜粋
  is_read: number;           // 既読フラグ（0: 未読, 1: 既読）
  created_at: string;        // 作成日時
}

// 添付ファイル情報
export interface Attachment {
  id: number;
  issue_id: number | null;     // 紐づく課題ID
  comment_id: number | null;   // 紐づくコメントID
  user_id: number | null;      // アップロード者ユーザーID
  user_name?: string | null;   // アップロード者名（結合時）
  user_color?: string | null;  // アップロード者カラー（結合時）
  file_name: string;           // 元のファイル名（例: screenshot.png）
  stored_name: string;         // ディスク保存ファイル名
  file_size: number;           // ファイルサイズ（バイト）
  mime_type: string;           // MIMEタイプ（例: image/png）
  created_at: string;          // アップロード日時
  url?: string;                // 取得用エンドポイントURL (/api/attachments/[id])
}


