// ダッシュボード上部の要フォロー・遅延・停滞課題アラートウィジェット
"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flame,
  MessageSquare,
  Sparkles,
  ArrowUp,
  Hourglass,
  Zap,
  ClipboardCopy,
  Check,
} from "lucide-react";
import { Issue, IssueStatus } from "@/types";
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
  projectName?: string;
  onSelectIssue: (issue: Issue) => void;
  onUpdateStatus?: (issueId: number, status: IssueStatus) => void;
}

export default function SummaryCards({
  issues,
  projectName,
  onSelectIssue,
  onUpdateStatus,
}: SummaryCardsProps) {
  const { settings } = useUser();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopiedReport, setIsCopiedReport] = useState(false);

  // 本日の日付文字列
  const todayStr = getTodayDateString(settings);

  // 要フォロー・至急課題の抽出と重要度ソート
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
      <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-sky-50/60 border border-emerald-200/70 rounded-xl text-sm text-emerald-950 shadow-2xs">
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

  // 週次報告用テキストの生成＆クリップボードコピー
  const handleCopyWeeklyReport = async () => {
    const lines: string[] = [];
    lines.push(`📋 【週次進捗・要フォロー課題サマリー】 (${todayStr})`);
    if (projectName) {
      lines.push(`プロジェクト: ${projectName}`);
    }
    lines.push("");
    lines.push(`■ 概況`);
    lines.push(`- 要フォロー課題: 計 ${urgentItems.length} 件`);
    if (overdueCount > 0) lines.push(`  - 🔴 期限超過: ${overdueCount}件`);
    if (stalledCount > 0) lines.push(`  - 🟡 停滞中(数日間沈黙): ${stalledCount}件`);
    if (unstartedCount > 0) lines.push(`  - 🟠 未着手警告: ${unstartedCount}件`);
    if (todayCount > 0) lines.push(`  - 📅 本日締切: ${todayCount}件`);
    lines.push("");
    lines.push(`■ 要確認・ボトルネック課題一覧`);

    urgentItems.forEach(({ issue, urgency, badgeText }, idx) => {
      const statusLabel =
        urgency === "overdue"
          ? `期限超過 (${badgeText})`
          : urgency === "stalled"
          ? `停滞中 (${badgeText})`
          : urgency === "unstarted"
          ? `未着手警告 (${badgeText})`
          : badgeText;

      const priorityLabel =
        issue.priority === "high" ? "高" : issue.priority === "medium" ? "中" : "低";

      lines.push(`${idx + 1}. [${issue.issue_key}] ${issue.title}`);
      lines.push(`   - 状態: ${statusLabel}${issue.due_date ? ` (期限: ${issue.due_date})` : ""}`);
      lines.push(`   - 担当: ${issue.assignee_name || "未割当"} / 優先度: ${priorityLabel}`);
      if (issue.latest_comment_content) {
        const commentSnippet = issue.latest_comment_content.replace(/\r?\n/g, " ").trim().slice(0, 80);
        lines.push(
          `   - 最新メモ (${issue.latest_comment_user_name || "メンバー"}): 「${commentSnippet}${
            issue.latest_comment_content.length > 80 ? "..." : ""
          }」`
        );
      }
    });

    lines.push("");
    lines.push(`---`);
    lines.push(`※ Personal Backlog より自動生成`);

    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setIsCopiedReport(true);
      setTimeout(() => setIsCopiedReport(false), 2500);
    } catch (err) {
      console.error("クリップボード書き込み失敗:", err);
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur-xs rounded-xl shadow-xs border border-rose-200/90 overflow-hidden">
      {/* 要フォローヘッダー */}
      <div className="p-3.5 bg-gradient-to-r from-rose-50/90 via-orange-50/60 to-amber-50/50 border-b border-rose-100 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-rose-600 animate-pulse shrink-0" />
          <h2 className="text-sm font-bold text-rose-950 flex items-center gap-2">
            <span>問題・要フォロー課題が発生しています</span>
            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-extrabold text-xs shadow-2xs">
              {urgentItems.length} 件
            </span>
          </h2>
          <span className="text-xs text-rose-700/80 hidden lg:inline">
            （遅延や停滞が発生しています。声かけやサポートに入りましょう）
          </span>
        </div>

        {/* 状態シグナルサマリーバッジ & 週次報告コピー */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <div className="flex flex-wrap items-center gap-1.5">
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

          {/* マネージャー・コンサル向け 週次報告サマリーコピーボタン */}
          <button
            type="button"
            onClick={handleCopyWeeklyReport}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-all cursor-pointer font-bold shadow-2xs ${
              isCopiedReport
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-rose-900 border-rose-300 hover:bg-rose-600 hover:text-white hover:border-rose-600"
            }`}
            title="Slackやメール・定例会議資料にそのまま貼れる週次サマリーテキストをコピーします"
          >
            {isCopiedReport ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>コピー完了！</span>
              </>
            ) : (
              <>
                <ClipboardCopy className="w-3.5 h-3.5 text-rose-600 group-hover:text-white" />
                <span>週次報告用にコピー</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 要フォロー課題リスト */}
      <div className="divide-y divide-slate-100">
        {visibleItems.map(({ issue, alert, urgency, badgeText }) => {
          return (
            <div
              key={issue.id}
              className="p-3 sm:px-4 hover:bg-rose-50/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 group"
            >
              {/* 左側: アラートバッジ、種別、キー、タイトル */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
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
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                {/* 担当者 */}
                <span className="text-xs text-slate-500 mr-1">
                  担当: <strong className="text-slate-700">{issue.assignee_name || "未割当"}</strong>
                </span>

                {/* 外部コンサルやメンバーが状況確認・声かけするためのクイックコメントボタン */}
                <button
                  type="button"
                  onClick={() => onSelectIssue(issue)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all cursor-pointer shadow-2xs"
                  title="課題詳細を開いてコメント・支援のアドバイスを入力します"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>声をかける</span>
                </button>

                {/* ワンクリックで完了にするクイックボタン */}
                {onUpdateStatus && (
                  <button
                    type="button"
                    onClick={() => onUpdateStatus(issue.id, "closed")}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all cursor-pointer shadow-2xs"
                    title="この課題を完了（closed）にします"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">完了</span>
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
                : `他 ${urgentItems.length - 4} 件の要フォロー課題をすべて表示`}
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
