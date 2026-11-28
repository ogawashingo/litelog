// 課題一覧のスマホ・モバイル用カードリストビュー
"use client";

import React from "react";
import { ArrowUp, CornerDownRight, FolderTree, Paperclip, Pin } from "lucide-react";
import { Issue, SystemSettings } from "@/types";
import { TypeBadge } from "@/components/IssueBadge";
import CommentPreviewBadge from "@/components/CommentPreviewBadge";
import IssueAlertBadge from "@/components/IssueAlertBadge";
import { formatDueDateDisplay } from "@/lib/dateUtils";
import { buildIssueRowMeta, DisplayedIssueItem, QuickViewMode } from "./issueListUtils";
import IssueListEmptyState from "./IssueListEmptyState";

interface IssueListMobileViewProps {
  isLoading: boolean;
  quickView: QuickViewMode;
  totalDisplayedCount: number;
  paginatedIssues: DisplayedIssueItem[];
  issueById: Map<number, Issue>;
  childrenByParentId: Map<number, Issue[]>;
  settings: SystemSettings | null | undefined;
  onSelectIssue: (issue: Issue) => void;
  onTogglePin?: (issueId: number, nextPinned: boolean) => void;
}

export default function IssueListMobileView({
  isLoading,
  quickView,
  totalDisplayedCount,
  paginatedIssues,
  issueById,
  childrenByParentId,
  settings,
  onSelectIssue,
  onTogglePin,
}: IssueListMobileViewProps) {
  return (
    <div className="md:hidden divide-y divide-slate-100">
      {isLoading ? (
        <div className="py-12 text-center text-slate-400">
          <div className="flex flex-col items-center justify-center gap-2 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-200" />
            <div className="h-4 w-32 bg-slate-200 rounded" />
          </div>
        </div>
      ) : totalDisplayedCount === 0 ? (
        <div className="py-12 text-center text-slate-400">
          <IssueListEmptyState quickView={quickView} />
        </div>
      ) : (
        paginatedIssues.map(({ issue, depth }, index) => {
          const {
            dueInfo,
            isClosed,
            isPinned,
            issueAlert,
            nonOverdueAlert,
            isChild,
            isParent,
            childrenCount,
            hasUnclosedChildren,
            completedChildrenCount,
            parentIssue,
          } = buildIssueRowMeta(issue, depth, issueById, childrenByParentId, settings);

          // 左端ボーダーおよび行の背景色（左辺のみ色指定して上下区切り線への波及を防止）
          const borderClass = isClosed
            ? "border-l-4 border-l-transparent"
            : issueAlert?.level === "critical"
            ? "border-l-4 border-l-rose-500 bg-rose-50/20"
            : issueAlert?.level === "warning"
            ? "border-l-4 border-l-amber-500 bg-amber-50/20"
            : issueAlert?.level === "caution"
            ? "border-l-4 border-l-purple-500 bg-purple-50/15"
            : isPinned
            ? "border-l-4 border-l-amber-400 bg-amber-50/40"
            : hasUnclosedChildren
            ? "border-l-4 border-l-indigo-600 bg-indigo-50/30"
            : isChild
            ? "border-l-4 border-l-indigo-200/50 bg-white"
            : "border-l-4 border-l-transparent";

          return (
            <div
              key={`mobile-${issue.id}`}
              className={`p-3 transition-colors ${
                isClosed
                  ? "bg-slate-50/60 text-slate-400"
                  : isPinned && !issueAlert
                  ? "bg-amber-50/40"
                  : isParent && !issueAlert
                  ? "bg-indigo-50/30"
                  : isChild && !issueAlert
                  ? "bg-white"
                  : !issueAlert
                  ? "hover:bg-indigo-50/40"
                  : ""
              } ${borderClass} ${depth > 0 ? "pl-5" : ""}`}
            >
              {/* 上段メタ行 */}
              <div className="flex items-center gap-1.5 flex-wrap text-xs mb-1.5">
                {depth > 0 && (
                  <CornerDownRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                )}
                {isPinned && (
                  <Pin className="w-3.5 h-3.5 text-amber-500 fill-amber-400 rotate-[-15deg] shrink-0" />
                )}
                <span className="font-mono font-bold text-indigo-600">{issue.issue_key}</span>
                {parentIssue && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectIssue(parentIssue);
                    }}
                    className="text-[10px] text-slate-500 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 px-1 py-0.5 rounded font-mono cursor-pointer transition-colors"
                    title={`親課題: [${parentIssue.issue_key}] ${parentIssue.title}`}
                  >
                    親:{parentIssue.issue_key}
                  </span>
                )}
                <div className="shrink-0">
                  <TypeBadge type={issue.issue_type} showLabel={false} />
                </div>
                {nonOverdueAlert && (
                  <div className="shrink-0">
                    <IssueAlertBadge alert={nonOverdueAlert} size="sm" />
                  </div>
                )}
                {isParent && (
                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${
                      hasUnclosedChildren
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}
                    title={`子課題: ${completedChildrenCount}/${childrenCount} 完了`}
                  >
                    <FolderTree className="w-2.5 h-2.5" />
                    <span>
                      子 {completedChildrenCount}/{childrenCount}
                    </span>
                  </span>
                )}
                {issue.priority === "high" && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shrink-0"
                    title="優先度: 高"
                  >
                    <ArrowUp className="w-3 h-3 text-rose-600" />
                    <span>高</span>
                  </span>
                )}
                {issue.due_date && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-semibold shrink-0 ${
                      dueInfo.isOverdue && !isClosed
                        ? "bg-rose-100 text-rose-700 font-bold"
                        : dueInfo.isToday && !isClosed
                        ? "bg-amber-100 text-amber-800 font-bold"
                        : "text-slate-500 bg-slate-100"
                    }`}
                  >
                    {dueInfo.isOverdue && !isClosed
                      ? `期限超過 (${formatDueDateDisplay(issue.due_date)})`
                      : dueInfo.isToday && !isClosed
                      ? "本日締切"
                      : `期日: ${formatDueDateDisplay(issue.due_date)}`}
                  </span>
                )}
                {!isClosed && onTogglePin && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin(issue.id, !isPinned);
                    }}
                    title={isPinned ? "ピン留めを解除" : "上部にピン留め"}
                    aria-label={
                      isPinned
                        ? `${issue.issue_key}のピン留めを解除`
                        : `${issue.issue_key}を上部にピン留め`
                    }
                    aria-pressed={isPinned}
                    className={`ml-auto p-1 rounded-md transition-all cursor-pointer shrink-0 ${
                      isPinned
                        ? "text-amber-500 hover:text-amber-600 hover:bg-amber-100/70"
                        : "text-slate-300 hover:text-amber-500 hover:bg-amber-50"
                    }`}
                  >
                    <Pin
                      className={`w-3.5 h-3.5 transition-transform ${
                        isPinned ? "fill-amber-400 rotate-[-15deg] scale-110" : ""
                      }`}
                    />
                  </button>
                )}
              </div>

              {/* 中段: 件名タイトル */}
              <div className="w-full mb-1.5">
                <button
                  type="button"
                  onClick={() => onSelectIssue(issue)}
                  className={`text-left font-bold text-sm hover:text-indigo-600 transition-colors cursor-pointer w-full break-words break-all [overflow-wrap:anywhere] leading-snug ${
                    isClosed ? "text-slate-400 line-through" : "text-slate-900"
                  }`}
                >
                  {issue.title}
                </button>
              </div>

              {/* 下段: 担当者情報、コメント数バッジ、添付ファイルバッジ */}
              <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
                <span className="truncate">
                  担当:{" "}
                  <strong className="text-slate-700 font-medium">
                    {issue.assignee_name || "未割当"}
                  </strong>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {Boolean(issue.comment_count && issue.comment_count > 0) && (
                    <CommentPreviewBadge
                      issueId={issue.id}
                      commentCount={issue.comment_count}
                      latestCommentContent={issue.latest_comment_content}
                      latestCommentCreatedAt={issue.latest_comment_created_at}
                      latestCommentUserName={issue.latest_comment_user_name}
                      latestCommentUserColor={issue.latest_comment_user_color}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectIssue(issue);
                      }}
                      placement={index < 2 ? "bottom" : "top"}
                    />
                  )}
                  {Boolean(issue.attachment_count && issue.attachment_count > 0) && (
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                      title={`添付ファイル ${issue.attachment_count}件`}
                    >
                      <Paperclip className="w-3 h-3 text-slate-500" />
                      <span>{issue.attachment_count}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
