// 課題詳細（モーダル・個別ページ）共通の件名・親課題リンク・全属性スリムツールバー
"use client";

import React from "react";
import Link from "next/link";
import { GitBranch, Calendar, Clock } from "lucide-react";
import {
  Issue,
  IssuePriority,
  IssueResolution,
  IssueStatus,
  SystemSettings,
  User,
  canManageIssues,
} from "@/types";
import { getUserInitials } from "@/components/UserManageModal";
import { formatTimestamp } from "@/lib/dateUtils";
import ResolutionSelect from "@/components/ResolutionSelect";
import UserSelect from "@/components/UserSelect";
import { IssueHistoryTab } from "./IssueDetailModalsBundle";

interface IssueSummaryToolbarProps {
  variant: "modal" | "page";
  activeIssue: Issue;
  isProjectArchived: boolean;
  canClose: boolean;
  hasUnclosedChildren: boolean;
  unclosedChildrenCount: number;
  currentUser: User | null;
  users: User[];
  candidateUsers: User[];
  currentAssignee?: User;
  creatorName: string | null;
  settings: SystemSettings;
  onSwitchParentIssue?: (target: { id: number; issue_key?: string | null }) => void;
  onOpenHistory: (tab: IssueHistoryTab) => void;
  onOpenReviewModal: () => void;
  onQuickStatusChange: (nextStatus: IssueStatus) => void;
  onQuickResolutionChange: (nextRes: IssueResolution | null) => void;
  onQuickAssigneeChange: (nextAssigneeIdStr: string) => void;
  onQuickPriorityChange: (nextPriority: IssuePriority) => void;
}

export default function IssueSummaryToolbar({
  variant,
  activeIssue,
  isProjectArchived,
  canClose,
  hasUnclosedChildren,
  unclosedChildrenCount,
  currentUser,
  users,
  candidateUsers,
  currentAssignee,
  creatorName,
  settings,
  onSwitchParentIssue,
  onOpenHistory,
  onOpenReviewModal,
  onQuickStatusChange,
  onQuickResolutionChange,
  onQuickAssigneeChange,
  onQuickPriorityChange,
}: IssueSummaryToolbarProps) {
  const isModal = variant === "modal";
  const pillBg = isModal ? "bg-white" : "bg-slate-50";

  return (
    <div
      className={
        isModal
          ? "bg-slate-50 border-b border-slate-200 px-3.5 sm:px-6 py-2.5 sm:py-3 shrink-0 shadow-2xs space-y-2"
          : "px-4 sm:px-6 py-2.5 sm:py-3 bg-white space-y-2"
      }
    >
      {/* 上段: 件名 ＆ 親課題リンク */}
      <div className="min-w-0">
        {activeIssue.parent_id && activeIssue.parent_issue_key && (
          isModal ? (
            <button
              type="button"
              onClick={() => {
                if (activeIssue.parent_id) {
                  onSwitchParentIssue?.({
                    id: activeIssue.parent_id,
                    issue_key: activeIssue.parent_issue_key,
                  });
                }
              }}
              className="mb-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[11px] text-slate-700 font-medium hover:bg-indigo-100 transition-colors cursor-pointer group truncate max-w-full"
              title={`親課題 [${activeIssue.parent_issue_key}] を開く`}
            >
              <GitBranch className="w-3 h-3 text-indigo-500 shrink-0" />
              <span className="text-slate-500">親:</span>
              <span className="font-bold text-indigo-700">[{activeIssue.parent_issue_key}]</span>
              <span className="truncate">{activeIssue.parent_title}</span>
            </button>
          ) : (
            <Link
              href={`/issues/${activeIssue.parent_issue_key}`}
              className="mb-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[11px] text-slate-700 font-medium hover:bg-indigo-100 transition-colors cursor-pointer group truncate max-w-full"
              title={`親課題 [${activeIssue.parent_issue_key}] を開く`}
            >
              <GitBranch className="w-3 h-3 text-indigo-500 shrink-0" />
              <span className="text-slate-500">親:</span>
              <span className="font-bold text-indigo-700">[{activeIssue.parent_issue_key}]</span>
              <span className="truncate">{activeIssue.parent_title}</span>
            </Link>
          )
        )}
        <div className="flex items-center gap-2">
          {isModal ? (
            <h2
              className="text-base sm:text-lg font-bold text-slate-900 leading-snug line-clamp-2"
              title={activeIssue.title}
            >
              {activeIssue.title}
            </h2>
          ) : (
            <h1
              className="text-base sm:text-lg font-bold text-slate-900 leading-snug line-clamp-2"
              title={activeIssue.title}
            >
              {activeIssue.title}
            </h1>
          )}
          {Boolean(activeIssue.title_history_count && activeIssue.title_history_count > 0) && (
            <button
              type="button"
              onClick={() => onOpenHistory("title")}
              className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer font-medium shrink-0"
              title={isModal ? "タイトルの変更履歴を確認" : "クリックしてタイトルの変更履歴を確認"}
            >
              (履歴 · {activeIssue.title_history_count}件)
            </button>
          )}
        </div>
      </div>

      {/* 下段: 全属性スリムツールバー（状態・完了理由・担当者・優先度・期間・登録日時） */}
      <div className="flex items-center gap-2 flex-wrap text-xs pt-0.5">
        {/* 状態セレクター */}
        <div className={`flex items-center gap-1 ${pillBg} border border-slate-300 rounded-lg px-2 py-1 shadow-2xs`}>
          <span className="text-[10px] text-slate-500 font-bold shrink-0">状態:</span>
          <select
            value={activeIssue.status}
            disabled={isProjectArchived}
            onChange={(e) => {
              const nextStatus = e.target.value as IssueStatus;
              if (nextStatus === activeIssue.status) return;
              if (nextStatus === "closed") {
                if (!canClose) {
                  alert(
                    "課題を完了にできるのは、課題の起票者・PMO・または管理者のみです。\n作業完了時は「処理済み」を選択してレビューを依頼してください。"
                  );
                  return;
                }
                if (hasUnclosedChildren) {
                  alert(
                    `未完了の子課題が ${unclosedChildrenCount} 件存在するため、親課題を完了にすることはできません。`
                  );
                  return;
                }
              }
              if (nextStatus === "resolved" && !canManageIssues(currentUser)) {
                onOpenReviewModal();
                return;
              }
              onQuickStatusChange(nextStatus);
            }}
            className={`bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden ${
              isProjectArchived ? "cursor-not-allowed opacity-70" : "cursor-pointer"
            }`}
          >
            <option value="open">未対応</option>
            <option value="in_progress">処理中</option>
            <option value="resolved">処理済み</option>
            <option
              value="closed"
              disabled={!canClose || hasUnclosedChildren}
              title={
                !canClose
                  ? "課題を完了にできるのは起票者・PMO・または管理者のみです"
                  : hasUnclosedChildren
                  ? `未完了の子課題が ${unclosedChildrenCount} 件あります`
                  : undefined
              }
            >
              完了
              {!canClose
                ? " (起票者/PMO/管理者限定)"
                : hasUnclosedChildren
                ? " (未完了あり)"
                : ""}
            </option>
          </select>
        </div>

        {/* 完了理由セレクター（完了時のみ活性、アーカイブ時は非活性） */}
        <div
          className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 transition-colors ${
            activeIssue.status === "closed" && !isProjectArchived
              ? `${pillBg} border border-slate-300 shadow-2xs`
              : "opacity-50"
          }`}
        >
          <span className="text-[10px] text-slate-500 font-medium shrink-0">完了理由:</span>
          <ResolutionSelect
            value={activeIssue.status === "closed" ? activeIssue.resolution : null}
            onChange={(nextRes) => onQuickResolutionChange(nextRes)}
            disabled={isProjectArchived || activeIssue.status !== "closed"}
            size="sm"
            placeholder="--"
          />
          {Boolean(
            activeIssue.resolution_history_count && activeIssue.resolution_history_count > 0
          ) && (
            <button
              type="button"
              onClick={() => onOpenHistory("all")}
              className="text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1 py-0.2 rounded cursor-pointer font-medium"
              title="クリックして完了理由の変更履歴を確認"
            >
              ({activeIssue.resolution_history_count})
            </button>
          )}
        </div>

        {/* 担当者セレクター */}
        {isModal ? (
          <div className="w-[140px] sm:w-[170px]">
            <UserSelect
              users={candidateUsers}
              value={activeIssue.assignee_id}
              disabled={isProjectArchived}
              onChange={(val) => onQuickAssigneeChange(val ? String(val) : "")}
              currentUserId={currentUser?.id}
              placeholder="未割当"
              size="sm"
              className="w-full"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 shadow-2xs max-w-[130px] sm:max-w-[160px]">
            <div
              style={{ backgroundColor: currentAssignee?.color || "#9ca3af" }}
              className="w-4 h-4 rounded-full text-white flex items-center justify-center text-[8px] font-bold shrink-0"
            >
              {getUserInitials(currentAssignee?.name)}
            </div>
            <select
              value={activeIssue.assignee_id ? String(activeIssue.assignee_id) : ""}
              disabled={isProjectArchived}
              onChange={(e) => onQuickAssigneeChange(e.target.value)}
              className={`bg-transparent text-xs font-medium text-slate-800 focus:outline-hidden truncate w-full ${
                isProjectArchived ? "cursor-not-allowed opacity-70" : "cursor-pointer"
              }`}
            >
              <option value="">未割当</option>
              {users.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 優先度セレクター */}
        <div className={`flex items-center gap-1 ${pillBg} border border-slate-300 rounded-lg px-2 py-1 shadow-2xs`}>
          <span className="text-[10px] text-slate-500 font-bold shrink-0">優先度:</span>
          <select
            value={activeIssue.priority}
            disabled={isProjectArchived}
            onChange={(e) => onQuickPriorityChange(e.target.value as IssuePriority)}
            className={`bg-transparent text-xs font-bold focus:outline-hidden ${
              isProjectArchived ? "cursor-not-allowed opacity-70" : "cursor-pointer"
            } ${
              activeIssue.priority === "high"
                ? "text-rose-600"
                : activeIssue.priority === "medium"
                ? "text-amber-600"
                : "text-slate-600"
            }`}
          >
            <option value="high">↑ 高</option>
            <option value="medium">→ 中</option>
            <option value="low">↓ 低</option>
          </select>
        </div>

        {/* 期限日（または期間） */}
        <div className={`flex items-center gap-1.5 ${pillBg} border border-slate-300 rounded-lg px-2.5 py-1 shadow-2xs`}>
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-[10px] text-slate-500 font-medium">期限:</span>
          <span
            className={`font-semibold ${
              activeIssue.due_date &&
              new Date(activeIssue.due_date) < new Date() &&
              activeIssue.status !== "closed"
                ? "text-rose-600 font-bold"
                : "text-slate-800"
            }`}
            title={
              activeIssue.start_date
                ? `開始: ${activeIssue.start_date} 〜 期限: ${activeIssue.due_date || "指定なし"}`
                : undefined
            }
          >
            {activeIssue.start_date ? `${activeIssue.start_date} 〜 ` : ""}
            {activeIssue.due_date || "指定なし"}
          </span>
          {Boolean(
            (activeIssue.due_date_history_count && activeIssue.due_date_history_count > 0) ||
              (activeIssue.start_date_history_count && activeIssue.start_date_history_count > 0)
          ) && (
            <button
              type="button"
              onClick={() => onOpenHistory("dates")}
              className="text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1 py-0.2 rounded cursor-pointer font-medium ml-0.5"
              title="日程の変更履歴を確認"
            >
              (履歴
              {(activeIssue.due_date_history_count || 0) +
                (activeIssue.start_date_history_count || 0)}
              件)
            </button>
          )}
        </div>

        {/* 登録日時・起票者 */}
        <div
          className="flex items-center gap-1 text-slate-500 text-[11px] px-1 py-1"
          title={`${creatorName ? `起票者: ${creatorName}\n` : ""}登録: ${formatTimestamp(
            activeIssue.created_at,
            settings,
            true
          )}\n更新: ${formatTimestamp(activeIssue.updated_at, settings, true)}`}
        >
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>
            登録: {formatTimestamp(activeIssue.created_at, settings, true)}
            {creatorName && (
              <span className="ml-1 text-slate-500">
                (起票: <span className="font-medium text-slate-600">{creatorName}</span>)
              </span>
            )}
          </span>
        </div>
      </div>

      {hasUnclosedChildren && (
        <span
          className="text-[10px] text-amber-600 block mt-1 leading-tight"
          title={`未完了の子課題が ${unclosedChildrenCount} 件存在するため、すべて完了するまで完了にできません`}
        >
          ※ 未完了の子課題が {unclosedChildrenCount} 件あるため、すべて完了するまで親課題を完了にできません
        </span>
      )}
    </div>
  );
}
