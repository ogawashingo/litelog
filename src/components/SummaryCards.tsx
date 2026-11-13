// ダッシュボード上部の至急対応課題ウィジェットおよび緊急度アラート
"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, Calendar, CheckCircle2, ChevronDown, ChevronUp, Flame, Sparkles } from "lucide-react";
import { Issue, IssueStatus } from "@/types";
import { TypeBadge } from "./IssueBadge";
import { getTodayDateString } from "@/lib/dateUtils";
import { useUser } from "./UserContext";

// 至急課題の分類種別
type UrgencyLevel = "overdue" | "today" | "upcoming" | "high_priority";

interface UrgentItem {
  issue: Issue;
  urgency: UrgencyLevel;
  diffDays: number | null; // 期限日と今日の差分日数（負: 超過, 0: 本日, 正: 残り日数）
  badgeText: string;
}

interface SummaryCardsProps {
  issues: Issue[];
  onSelectIssue: (issue: Issue) => void;
  onUpdateStatus?: (issueId: number, status: IssueStatus) => void;
}

export default function SummaryCards({
  issues,
  onSelectIssue,
  onUpdateStatus,
}: SummaryCardsProps) {
  const { settings } = useUser();
  const [isExpanded, setIsExpanded] = useState(false);

  // 本日の日付文字列
  const todayStr = getTodayDateString(settings);

  // 至急課題（期限切れ、本日期限、3日以内期限、優先度:高）の抽出と緊急度順ソート
  const urgentItems = useMemo<UrgentItem[]>(() => {
    const [ty, tm, td] = todayStr.split("-").map(Number);
    const today = new Date(ty, tm - 1, td);
    today.setHours(0, 0, 0, 0);

    const activeIssues = issues.filter((i) => i.status !== "closed");
    const items: UrgentItem[] = [];

    for (const issue of activeIssues) {
      let diffDays: number | null = null;
      if (issue.due_date) {
        const [y, m, d] = issue.due_date.split("-").map(Number);
        const target = new Date(y, m - 1, d);
        target.setHours(0, 0, 0, 0);
        diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }

      if (diffDays !== null && diffDays < 0) {
        // 期限切れ（最優先）
        items.push({
          issue,
          urgency: "overdue",
          diffDays,
          badgeText: `${Math.abs(diffDays)}日超過`,
        });
      } else if (diffDays !== null && diffDays === 0) {
        // 本日締切
        items.push({
          issue,
          urgency: "today",
          diffDays,
          badgeText: "本日締切",
        });
      } else if (issue.priority === "high") {
        // 優先度「高」
        items.push({
          issue,
          urgency: "high_priority",
          diffDays,
          badgeText: diffDays !== null ? `優先度:高 (残${diffDays}日)` : "優先度:高",
        });
      } else if (diffDays !== null && diffDays <= 3) {
        // 直近3日以内締切
        items.push({
          issue,
          urgency: "upcoming",
          diffDays,
          badgeText: diffDays === 1 ? "明日締切" : `残${diffDays}日`,
        });
      }
    }

    // 重複除外（1つの課題が複数条件に該当する場合、最も緊急度の高い条件が優先）
    const seen = new Set<number>();
    const uniqueItems: UrgentItem[] = [];
    for (const item of items) {
      if (!seen.has(item.issue.id)) {
        seen.add(item.issue.id);
        uniqueItems.push(item);
      }
    }

    // 緊急度順にソート（期限切れ -> 本日 -> 残り日数少ない順/優先度高）
    uniqueItems.sort((a, b) => {
      const urgencyRank: Record<UrgencyLevel, number> = {
        overdue: 1,
        today: 2,
        high_priority: 3,
        upcoming: 4,
      };
      if (urgencyRank[a.urgency] !== urgencyRank[b.urgency]) {
        return urgencyRank[a.urgency] - urgencyRank[b.urgency];
      }
      // 期限切れ同士は超過日数が大きい順
      if (a.urgency === "overdue" && b.urgency === "overdue") {
        return (a.diffDays ?? 0) - (b.diffDays ?? 0); // 負の数なので小さい（絶対値が大きい）方が前
      }
      // 残り日数がある場合は残り日数が少ない順
      if (a.diffDays !== null && b.diffDays !== null) {
        return a.diffDays - b.diffDays;
      }
      return 0;
    });

    return uniqueItems;
  }, [issues, todayStr]);

  // 初期表示件数（デフォルトは最大4件、展開時は全件）
  const visibleItems = isExpanded ? urgentItems : urgentItems.slice(0, 4);

  // 至急課題が0件の場合のクリーン表示
  if (urgentItems.length === 0) {
    return (
      <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-sky-50/60 border border-emerald-200/70 rounded-xl text-sm text-emerald-950 shadow-2xs">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold text-emerald-900">
            至急対応が必要な課題はありません。順調です！
          </span>
        </div>
        <span className="text-xs text-emerald-700/80 hidden sm:inline">
          期限切れ・本日期限・優先度高の課題はすべて対応済みです
        </span>
      </div>
    );
  }

  // 期限切れと本日期限の件数カウント
  const overdueCount = urgentItems.filter((i) => i.urgency === "overdue").length;
  const todayCount = urgentItems.filter((i) => i.urgency === "today").length;

  return (
    <div className="bg-white/95 backdrop-blur-xs rounded-xl shadow-xs border border-rose-200/90 overflow-hidden">
      {/* 至急タスクヘッダー */}
      <div className="p-3.5 bg-gradient-to-r from-rose-50/90 via-orange-50/60 to-amber-50/50 border-b border-rose-100 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-rose-600 animate-pulse shrink-0" />
          <h2 className="text-sm font-bold text-rose-950 flex items-center gap-2">
            <span>至急対応が必要な課題</span>
            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-extrabold text-xs shadow-2xs">
              {urgentItems.length} 件
            </span>
          </h2>
        </div>

        {/* 状態サマリーバッジ */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              期限切れ: {overdueCount} 件
            </span>
          )}
          {todayCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
              本日締切: {todayCount} 件
            </span>
          )}
        </div>
      </div>

      {/* 至急課題リスト */}
      <div className="divide-y divide-slate-100">
        {visibleItems.map(({ issue, urgency, badgeText }) => {
          // 緊急度に応じたバッジスタイル
          const badgeStyle =
            urgency === "overdue"
              ? "bg-rose-100 text-rose-800 border-rose-300 font-bold"
              : urgency === "today"
              ? "bg-amber-100 text-amber-900 border-amber-300 font-bold"
              : urgency === "high_priority"
              ? "bg-orange-50 text-orange-800 border-orange-200 font-semibold"
              : "bg-sky-50 text-sky-800 border-sky-200 font-medium";

          return (
            <div
              key={issue.id}
              className="p-3 sm:px-4 hover:bg-rose-50/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 group"
            >
              {/* 左側: 緊急度バッジ、種別、キー、タイトル */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {/* 緊急度バッジ */}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border shrink-0 ${badgeStyle}`}
                >
                  {urgency === "overdue" && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                  {urgency === "today" && <Calendar className="w-3 h-3 text-amber-600" />}
                  <span>{badgeText}</span>
                </span>

                {/* 種別バッジ */}
                <div className="shrink-0">
                  <TypeBadge type={issue.issue_type} showLabel={false} />
                </div>

                {/* 課題キー */}
                <span className="text-xs font-mono font-bold text-slate-500 shrink-0">
                  {issue.issue_key}
                </span>

                {/* 課題タイトル（クリックでモーダル表示） */}
                <button
                  type="button"
                  onClick={() => onSelectIssue(issue)}
                  className="font-bold text-sm text-slate-900 hover:text-indigo-600 truncate text-left cursor-pointer transition-colors"
                  title={issue.title}
                >
                  {issue.title}
                </button>
              </div>

              {/* 右側: 担当者情報 & クイックアクション */}
              <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                {/* 担当者 */}
                <span className="text-xs text-slate-500">
                  担当: <strong className="text-slate-700">{issue.assignee_name || "未割当"}</strong>
                </span>

                {/* ワンクリックで完了にするクイックボタン */}
                {onUpdateStatus && (
                  <button
                    type="button"
                    onClick={() => onUpdateStatus(issue.id, "closed")}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all cursor-pointer shadow-2xs"
                    title="この課題を完了（closed）にします"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>完了にする</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4件以上ある場合の開閉トグル */}
      {urgentItems.length > 4 && (
        <div className="p-2 bg-slate-50 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-indigo-600 cursor-pointer"
          >
            <span>
              {isExpanded
                ? "折りたたむ"
                : `他 ${urgentItems.length - 4} 件の至急課題をすべて表示`}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
