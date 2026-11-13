// Personal Backlog の共通型定義

// ユーザー（チームメンバー）情報
export interface User {
  id: number;
  login_id: string;  // ログインID（例: 'yamada', 'sato', 'suzuki'）
  name: string;      // メンバー表示名（例: '山田 太郎'）
  role: string;      // 役割・肩書き（例: '管理者', 'エンジニア'）
  is_admin: number;  // 管理者権限フラグ（1: Admin管理者, 0: 一般メンバー）
  color: string;     // アバターカラー（16進数カラーコード）
  created_at: string;
  issue_count?: number;      // 担当課題総数（集計時）
  open_issue_count?: number; // 未完了の担当課題数（集計時）
}

// プロジェクト情報
export interface Project {
  id: number;
  key: string;       // プロジェクトキー（例: 'MYPRJ'）
  name: string;      // プロジェクト名
  color: string;     // テーマカラー（16進数カラーコード）
  created_at: string;
}

// 課題の種別
export type IssueType = "task" | "bug" | "request" | "other";

// 課題のステータス
export type IssueStatus = "open" | "in_progress" | "resolved" | "closed";

// 課題の優先度
export type IssuePriority = "high" | "medium" | "low";

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
  created_at: string;
  updated_at: string;
  project_name?: string;  // 結合時のプロジェクト名
  project_color?: string; // 結合時のプロジェクトカラー
  parent_issue_key?: string | null; // 結合時の親課題キー
  parent_title?: string | null;     // 結合時の親課題タイトル
  assignee_name?: string | null;    // 結合時の担当者名
  assignee_color?: string | null;   // 結合時の担当者カラー
  creator_name?: string | null;     // 結合時の作成者名
  children?: Issue[];     // 親子ツリー時の子課題リスト
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
}

// アクティビティ（最近の更新）情報
export interface Activity {
  id: number;
  issue_id: number | null;
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

// システム時刻・表示設定（管理ページ設定）
export interface SystemSettings {
  timezone: string;                  // 例: 'Asia/Tokyo', 'UTC', 'local' 等
  datetimeFormat: DateTimeFormatType;// 日時表示フォーマット
  hour12: boolean;                   // true: 12時間表記, false: 24時間表記
  activityTimeStyle: ActivityTimeStyle; // 最近の更新の時刻表示形式
  timeOffsetMinutes: number;         // 手動時刻補正オフセット（分単位、デフォルト 0）
  theme: ThemeId;                    // デザインカラーテーマ
}

