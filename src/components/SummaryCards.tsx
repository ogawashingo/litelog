// ダッシュボード上部の遅延・停滞・期限間近課題アラートウィジェット
"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Flame,
  Sparkles,
  ArrowUp,
  Hourglass,
  Zap,
} from "lucide-react";
import { Issue } from "@/types";
import { TypeBadge } from "./IssueBadge";
import { getTodayDateString } from "@/lib/dateUtils";
import { useUser } from "./UserContext";
import { getIssueAlert, IssueAlert } from "@/lib/issueAlerts";
import IssueAlertBadge from "./IssueAlertBadge";

interface UrgentItem {
  issue: Issue;
  alert: IssueAlert | null;
  urgency: "overdue" | "stalled" | "unstarted" | "today" | "upcoming" | "unassigned";
  score: number;
  badgeText: string;
}

interface SummaryCardsProps {
  issues: Issue[];
  selectedProjectId?: number | null;
  onSelectIssue: (issue: Issue) => void;
}

export default function SummaryCards({
  issues,
  selectedProjectId,
  onSelectIssue,
}: SummaryCardsProps) {
  const { settings } = useUser();
  const [isExpanded, setIsExpanded] = useState(false);

  // プロジェクト名バッジを表示するか判定（全プロジェクト表示時、または複数プロジェクトの課題が混在している場合）
  const showProjectBadge = !selectedProjectId;

  // 本日の日付文字列
  const todayStr = getTodayDateString(settings);

  // 至急対応が必要な課題の抽出と重要度ソート
  const urgentItems = useMemo<UrgentItem[]>(() => {
    const [ty, tm, td] = todayStr.split("-").map(Number);
    const today = new Date(ty, tm - 1, td);
    today.setHours(0, 0, 0, 0);

    const activeIssues = issues.filter((i) => i.status !== "closed");
    const items: UrgentItem[] = [];

    for (const issue of activeIssues) {
      // 共通アラート判定（期限超過・停滞・未着手警告・担当未定）
      const alert = getIssueAlert(issue, settings);

      if (alert) {
        items.push({
          issue,
          alert,
          urgency: alert.type,
          score: alert.score,
          badgeText: alert.label,
        });
        continue;
      }

      // 期日に関する直近チェック（本日・直近3日以内）
      if (issue.due_date) {
        const [y, m, d] = issue.due_date.split("-").map(Number);
        const target = new Date(y, m - 1, d);
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          items.push({
            issue,
            alert: null,
            urgency: "today",
            score: 750,
            badgeText: "本日締切",
          });
        } else if (diffDays > 0 && diffDays <= 3) {
          items.push({
            issue,
            alert: null,
            urgency: "upcoming",
            score: 400 - diffDays * 10,
            badgeText: diffDays === 1 ? "明日締切" : `残${diffDays}日`,
          });
        }
      }
    }

    // 重複除外
    const seen = new Set<number>();
    const uniqueItems: UrgentItem[] = [];
    for (const item of items) {
      if (!seen.has(item.issue.id)) {
        seen.add(item.issue.id);
        uniqueItems.push(item);
      }
    }

    // 重大度スコア順にソート（大きい順）
    uniqueItems.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.issue.id - a.issue.id;
    });

    return uniqueItems;
  }, [issues, settings, todayStr]);

  // 初期表示件数（デフォルトは最大4件、展開時は全件）
  const visibleItems = isExpanded ? urgentItems : urgentItems.slice(0, 4);

  // 問題なし（0件）の場合のクリーン表示
  if (urgentItems.length === 0) {
    return (
      <div className="summary-cards-clean-header flex items-center justify-between p-3.5 bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-sky-50/60 border border-emerald-200/70 rounded-xl text-sm text-emerald-950 shadow-2xs">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold text-emerald-900">
            問題や遅延のある課題はありません。プロジェクトは順調です！
          </span>
        </div>
        <span className="text-xs text-emerald-700/80 hidden sm:inline">
          期限切れ・進行中の停滞・未着手警告はありません
        </span>
      </div>
    );
  }

  // アラート分類ごとのカウント
  const overdueCount = urgentItems.filter((i) => i.urgency === "overdue").length;
  const stalledCount = urgentItems.filter((i) => i.urgency === "stalled").length;
  const unstartedCount = urgentItems.filter((i) => i.urgency === "unstarted").length;
  const todayCount = urgentItems.filter((i) => i.urgency === "today").length;

  return (
    <div className="bg-white/95 backdrop-blur-xs rounded-xl shadow-xs border border-rose-200/90 overflow-hidden">
      {/* ヘッダー */}
      <div className="summary-cards-urgent-header p-3.5 bg-gradient-to-r from-rose-50/90 via-orange-50/60 to-amber-50/50 border-b border-rose-100 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-rose-600 animate-pulse shrink-0" />
          <h2 className="text-sm font-bold text-rose-950 flex items-center gap-2">
            <span>遅延・期限間近の課題</span>
            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-extrabold text-xs shadow-2xs">
              {urgentItems.length} 件
            </span>
          </h2>
        </div>

        {/* 状態シグナルサマリーバッジ */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              期限超過: {overdueCount}件
            </span>
          )}
          {stalledCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
              <Hourglass className="w-3.5 h-3.5 text-amber-600" />
              停滞中: {stalledCount}件
            </span>
          )}
          {unstartedCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-900 border border-orange-200">
              <Zap className="w-3.5 h-3.5 text-orange-600" />
              未着手警告: {unstartedCount}件
            </span>
          )}
          {todayCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-900 border border-yellow-200">
              <Calendar className="w-3.5 h-3.5 text-yellow-700" />
              本日締切: {todayCount}件
            </span>
          )}
        </div>
      </div>

      {/* 課題リスト */}
      <div className="divide-y divide-slate-100">
        {visibleItems.map(({ issue, alert, urgency, badgeText }) => {
          return (
            <div
              key={issue.id}
              className="p-3 sm:px-4 hover:bg-rose-50/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-2.5 group"
            >
              {/* 左側（メイン部）: スマホ表示時はメタ情報と件名を縦積みにして件名の可読領域を最大化 */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
                {/* メタ情報行: アラートバッジ、優先度、種別、プロジェクト名、課題キー */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                  {/* アラートバッジ */}
                  {alert ? (
                    <IssueAlertBadge alert={alert} size="sm" />
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border shrink-0 font-bold ${
                        urgency === "today"
                          ? "bg-amber-100 text-amber-900 border-amber-300"
                          : "bg-sky-50 text-sky-800 border-sky-200"
                      }`}
                    >
                      {urgency === "today" && <Calendar className="w-3 h-3 text-amber-600" />}
                      <span>{badgeText}</span>
                    </span>
                  )}

                  {/* 優先度高の場合は強調バッジ */}
                  {issue.priority === "high" && (
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shrink-0"
                      title="優先度: 高"
                    >
                      <ArrowUp className="w-3 h-3 text-rose-600" />
                      <span>高</span>
                    </span>
                  )}

                  {/* 種別バッジ */}
                  <div className="shrink-0">
                    <TypeBadge type={issue.issue_type} showLabel={false} />
                  </div>

                  {/* プロジェクト名バッジ（全プロジェクト表示時） */}
                  {showProjectBadge && issue.project_name && (
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100/90 text-slate-700 border border-slate-200/80 shrink-0 max-w-[120px] sm:max-w-[160px] truncate"
                      title={`プロジェクト: ${issue.project_name}`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
                        style={{ backgroundColor: issue.project_color || "#6366f1" }}
                      />
                      <span className="truncate">{issue.project_name}</span>
                    </span>
                  )}

                  {/* 課題キー */}
                  <span className="text-xs font-mono font-bold text-slate-500 shrink-0">
                    {issue.issue_key}
                  </span>
                </div>

                {/* 課題タイトル（スマホでは全幅・最大2行表示で件名全体を判読可能に） */}
                <button
                  type="button"
                  onClick={() => onSelectIssue(issue)}
                  className="font-bold text-sm text-slate-900 hover:text-indigo-600 line-clamp-2 sm:line-clamp-1 sm:truncate text-left cursor-pointer transition-colors w-full sm:w-auto flex-1 break-words sm:break-normal"
                  title={issue.title}
                >
                  {issue.title}
                </button>
              </div>

              {/* 右側: 担当者情報（スマホではタイトルの下段にすっきりと配置） */}
              <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto text-xs text-slate-500">
                <span>
                  担当: <strong className="text-slate-700">{issue.assignee_name || "未割当"}</strong>
                </span>
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
                : `他 ${urgentItems.length - 4} 件の課題をすべて表示`}
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
