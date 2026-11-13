// 課題の遅延・停滞・未着手等のアラート検知ユーティリティ
import { Issue, SystemSettings } from "@/types";
import { getTodayDateString, parseDbTimestamp } from "./dateUtils";

// アラートの緊急度レベル
export type IssueAlertLevel = "critical" | "warning" | "caution";

// アラートの種類
export type IssueAlertType = "overdue" | "stalled" | "unstarted" | "unassigned";

// アラート判定結果
export interface IssueAlert {
  type: IssueAlertType;
  level: IssueAlertLevel;
  label: string;       // バッジ用短縮テキスト（例: "4日超過", "7日停滞"）
  description: string; // ツールチップ用詳細説明
  score: number;       // 重大度ソート用スコア（大きいほど最優先）
}

// アラート集計統計情報
export interface IssueAlertStats {
  totalAlertCount: number;
  overdueCount: number;
  stalledCount: number;
  unstartedCount: number;
  unassignedCount: number;
}

/**
 * 課題に対して発生している問題（期限切れ、停滞、未着手警告、担当未定）を判定し、
 * 最も深刻度の高いアラート情報を返します。問題がなければ null を返します。
 */
export function getIssueAlert(issue: Issue, settings?: SystemSettings): IssueAlert | null {
  // 完了済み（closed）の課題はアラート対象外
  if (issue.status === "closed") {
    return null;
  }

  const todayStr = getTodayDateString(settings);
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const today = new Date(ty, tm - 1, td);
  today.setHours(0, 0, 0, 0);

  // 1. 期限超過（Overdue）の判定
  if (issue.due_date) {
    const [y, m, d] = issue.due_date.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const overdueDays = Math.abs(diffDays);
      return {
        type: "overdue",
        level: "critical",
        label: `${overdueDays}日超過`,
        description: `期限日（${issue.due_date}）を ${overdueDays} 日超過しています。対応または期限のリスケが必要です。`,
        score: 1000 + overdueDays,
      };
    }

    // 2. 未着手警告（Unstarted）の判定: 期限が本日または明日なのにステータスが未対応（open）のまま
    if (issue.status === "open") {
      if (diffDays === 0) {
        return {
          type: "unstarted",
          level: "critical",
          label: "未着手(本日締切)",
          description: "本日が締切ですが、ステータスが「未対応」のまま着手されていません。",
          score: 800,
        };
      } else if (diffDays === 1) {
        return {
          type: "unstarted",
          level: "warning",
          label: "未着手(明日締切)",
          description: "明日が締切ですが、ステータスが「未対応」のまま着手されていません。",
          score: 700,
        };
      }
    }
  }

  // 3. 停滞・スタック（Stalled）の判定: 「処理中（in_progress）」のまま一定日数以上更新がない
  if (issue.status === "in_progress") {
    // 最終アクティビティ日時（コメント投稿日時または更新日時の新しい方）
    const lastActivityStr =
      issue.latest_comment_created_at &&
      new Date(issue.latest_comment_created_at).getTime() > new Date(issue.updated_at).getTime()
        ? issue.latest_comment_created_at
        : issue.updated_at;

    if (lastActivityStr) {
      const lastActivityDate = parseDbTimestamp(lastActivityStr);
      lastActivityDate.setHours(0, 0, 0, 0);
      const daysSinceActivity = Math.round(
        (today.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // 4日以上更新・コメントが止まっている場合は停滞とみなす
      if (daysSinceActivity >= 4) {
        return {
          type: "stalled",
          level: daysSinceActivity >= 7 ? "critical" : "warning",
          label: `${daysSinceActivity}日停滞`,
          description: `「処理中」のまま ${daysSinceActivity} 日間コメントや更新がありません。作業が止まっている可能性があります。`,
          score: 500 + daysSinceActivity,
        };
      }
    }
  }

  // 4. 担当者未定（Unassigned）の判定: 優先度高、または期限が設定されているのに担当者が空
  if (issue.assignee_id === null || issue.assignee_id === undefined) {
    if (issue.priority === "high" || issue.due_date) {
      return {
        type: "unassigned",
        level: "caution",
        label: "担当者未定",
        description: "重要または期限付きの課題ですが、担当者が割り当てられていません。",
        score: 300,
      };
    }
  }

  return null;
}

/**
 * 課題一覧からアラートの発生状況を集計します
 */
export function getIssueAlertStats(issues: Issue[], settings?: SystemSettings): IssueAlertStats {
  let overdueCount = 0;
  let stalledCount = 0;
  let unstartedCount = 0;
  let unassignedCount = 0;

  for (const issue of issues) {
    const alert = getIssueAlert(issue, settings);
    if (!alert) continue;

    switch (alert.type) {
      case "overdue":
        overdueCount++;
        break;
      case "stalled":
        stalledCount++;
        break;
      case "unstarted":
        unstartedCount++;
        break;
      case "unassigned":
        unassignedCount++;
        break;
    }
  }

  const totalAlertCount = overdueCount + stalledCount + unstartedCount + unassignedCount;

  return {
    totalAlertCount,
    overdueCount,
    stalledCount,
    unstartedCount,
    unassignedCount,
  };
}
