// Personal Backlog の共通型定義

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
  parent_id: number | null; // 親課題ID（親子関係用）
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
  children?: Issue[];     // 親子ツリー時の子課題リスト
}

// コメント情報
export interface Comment {
  id: number;
  issue_id: number;
  content: string;
  created_at: string;
}

// アクティビティ（最近の更新）情報
export interface Activity {
  id: number;
  issue_id: number | null;
  action_type: "created" | "updated" | "status_changed" | "commented" | "deleted";
  content: string;
  created_at: string;
  issue_key?: string;
  issue_title?: string;
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
