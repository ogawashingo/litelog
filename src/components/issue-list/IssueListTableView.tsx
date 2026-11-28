// 課題一覧のPC・タブレット用テーブルビュー
"use client";

import React from "react";
import { CornerDownRight, FolderTree, Paperclip, Pin, Trash2 } from "lucide-react";
import {
  canDeleteIssue,
  Issue,
  IssuePriority,
  IssueResolution,
  IssueStatus,
  IssueType,
  SystemSettings,
  User,
} from "@/types";
import { ISSUE_STATUS_CONFIG } from "@/components/IssueBadge";
import { getUserInitials } from "@/components/UserManageModal";
import { DatePicker } from "@/components/DatePicker";
import CommentPreviewBadge from "@/components/CommentPreviewBadge";
import IssueAlertBadge from "@/components/IssueAlertBadge";
import { buildIssueRowMeta, DisplayedIssueItem, QuickViewMode } from "./issueListUtils";
import IssueListEmptyState from "./IssueListEmptyState";

interface IssueListTableViewProps {
  isLoading: boolean;
  isShowingClosed: boolean;
  quickView: QuickViewMode;
  totalDisplayedCount: number;
  paginatedIssues: DisplayedIssueItem[];
  issueById: Map<number, Issue>;
  childrenByParentId: Map<number, Issue[]>;
  users: User[];
  currentUser: User | null;
  settings: SystemSettings | null | undefined;
  onSelectIssue: (issue: Issue) => void;
  onUpdateType?: (issueId: number, type: IssueType) => void;
  onUpdateStatus: (issueId: number, status: IssueStatus) => void;
  onUpdateAssignee?: (issueId: number, assigneeId: number | null) => void;
  onUpdatePriority?: (issueId: number, priority: IssuePriority) => void;
  onUpdateResolution?: (issueId: number, resolution: IssueResolution | null) => void;
  onUpdateDueDate?: (issueId: number, dueDate: string | null) => void;
  onTogglePin?: (issueId: number, nextPinned: boolean) => void;
  onDeleteIssue: (issueId: number) => void;
}

export default function IssueListTableView({
  isLoading,
  isShowingClosed,
  quickView,
  totalDisplayedCount,
  paginatedIssues,
  issueById,
  childrenByParentId,
  users,
  currentUser,
  settings,
  onSelectIssue,
  onUpdateType,
  onUpdateStatus,
  onUpdateAssignee,
  onUpdatePriority,
  onUpdateResolution,
  onUpdateDueDate,
  onTogglePin,
  onDeleteIssue,
}: IssueListTableViewProps) {
  return (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider">
            <th className="py-2.5 px-3 w-24 whitespace-nowrap">種別</th>
            <th className="py-2.5 px-3 w-24 whitespace-nowrap">キー</th>
            <th className="py-2.5 px-3 min-w-[240px]">件名</th>
            <th className="py-2.5 px-3 w-36 whitespace-nowrap">担当者</th>
            <th className="py-2.5 px-3 w-28 whitespace-nowrap">状態</th>
            {isShowingClosed && (
              <th className="py-2.5 px-3 w-28 whitespace-nowrap">完了理由</th>
            )}
            <th className="py-2.5 px-3 w-24 text-center whitespace-nowrap">優先度</th>
            <th className="py-2.5 px-3 w-52 whitespace-nowrap">期限日</th>
            <th className="py-2.5 px-2 w-16 text-center"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {isLoading ? (
            <tr>
              <td colSpan={isShowingClosed ? 9 : 8} className="py-12 text-center text-slate-400">
                <div className="flex flex-col items-center justify-center gap-2 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-slate-200" />
                  <div className="h-4 w-32 bg-slate-200 rounded" />
                </div>
              </td>
            </tr>
          ) : totalDisplayedCount === 0 ? (
            <tr>
              <td colSpan={isShowingClosed ? 9 : 8} className="py-12 text-center text-slate-400">
                <IssueListEmptyState quickView={quickView} />
              </td>
            </tr>
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
                unclosedChildrenCount,
                hasUnclosedChildren,
                completedChildrenCount,
                parentIssue,
              } = buildIssueRowMeta(issue, depth, issueById, childrenByParentId, settings);

              const assigneeColor = issue.assignee_color || "#4f46e5";

              // 左端ボーダーおよび行の背景色
              const borderClass = isClosed
                ? "border-l-4 border-l-transparent"
                : issueAlert?.level === "critical"
                ? "border-l-4 border-l-rose-500 bg-rose-50/15 hover:bg-rose-50/35"
                : issueAlert?.level === "warning"
                ? "border-l-4 border-l-amber-500 bg-amber-50/15 hover:bg-amber-50/35"
                : issueAlert?.level === "caution"
                ? "border-l-4 border-l-purple-500 bg-purple-50/15 hover:bg-purple-50/35"
                : isPinned
                ? "border-l-4 border-l-amber-400 bg-amber-50/40 hover:bg-amber-50/70"
                : hasUnclosedChildren
                ? "border-l-4 border-l-indigo-600"
                : isChild
                ? "border-l-4 border-l-indigo-200/50"
                : "border-l-4 border-l-transparent";

              return (
                <tr
                  key={issue.id}
                  className={`transition-colors group ${
                    isClosed
                      ? "bg-slate-50/60 text-slate-400 hover:bg-slate-100/60"
                      : isPinned && !issueAlert
                      ? "bg-amber-50/40 hover:bg-amber-50/70"
                      : hasUnclosedChildren && !issueAlert
                      ? "issue-parent-row bg-indigo-50/30 hover:bg-indigo-50/60"
                      : isChild && !issueAlert
                      ? "bg-white hover:bg-indigo-50/20"
                      : !issueAlert
                      ? "hover:bg-indigo-50/40"
                      : ""
                  } ${borderClass}`}
                >
                  {/* 種別 */}
                  <td className="py-2 px-3 whitespace-nowrap">
                    <select
                      value={issue.issue_type}
                      onChange={(e) => {
                        onUpdateType?.(issue.id, e.target.value as IssueType);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-xs font-semibold rounded-md px-2 py-0.5 border cursor-pointer transition-colors focus:outline-hidden focus:ring-1 focus:ring-indigo-500 ${
                        issue.issue_type === "task"
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                          : issue.issue_type === "bug"
                          ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                          : issue.issue_type === "request"
                          ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                          : "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
                      }`}
                      title={`種別: ${
                        issue.issue_type === "task"
                          ? "タスク"
                          : issue.issue_type === "bug"
                          ? "バグ"
                          : issue.issue_type === "request"
                          ? "要望"
                          : "その他"
                      }`}
                    >
                      <option value="task">タスク</option>
                      <option value="bug">バグ</option>
                      <option value="request">要望</option>
                      <option value="other">その他</option>
                    </select>
                  </td>

                  {/* キー */}
                  <td className="py-2 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {depth > 0 && (
                        <CornerDownRight
                          className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-1"
                          aria-label={parentIssue ? `親課題: ${parentIssue.issue_key}` : "子課題"}
                        />
                      )}
                      <a
                        href={`/issues/${issue.issue_key}`}
                        onClick={(e) => {
                          if (!e.metaKey && !e.ctrlKey) {
                            e.preventDefault();
                            onSelectIssue(issue);
                          }
                        }}
                        title={
                          parentIssue
                            ? `親課題: [${parentIssue.issue_key}] ${parentIssue.title}`
                            : issue.issue_key
                        }
                        className="font-bold text-indigo-600 hover:text-indigo-900 hover:underline text-sm font-mono cursor-pointer"
                      >
                        {issue.issue_key}
                      </a>
                    </div>
                  </td>

                  {/* 件名 */}
                  <td className="py-2 px-3 min-w-[260px]">
                    <div className={`flex items-center gap-2 min-w-0 ${depth > 0 ? "pl-3" : ""}`}>
                      {depth > 0 && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-indigo-300 shrink-0"
                          title={
                            parentIssue
                              ? `親課題: [${parentIssue.issue_key}] ${parentIssue.title}`
                              : "子課題"
                          }
                        />
                      )}
                      <a
                        href={`/issues/${issue.issue_key}`}
                        onClick={(e) => {
                          if (!e.metaKey && !e.ctrlKey) {
                            e.preventDefault();
                            onSelectIssue(issue);
                          }
                        }}
                        title={issue.title}
                        className={`text-left hover:text-indigo-700 transition-colors min-w-0 flex-1 cursor-pointer ${
                          isClosed
                            ? "text-slate-500 text-sm"
                            : hasUnclosedChildren
                            ? "font-bold text-slate-900 text-sm"
                            : "font-medium text-slate-800 text-sm"
                        }`}
                      >
                        <span
                          className={`line-clamp-2 break-words leading-snug ${
                            isClosed ? "line-through" : ""
                          }`}
                        >
                          {issue.title}
                        </span>
                      </a>

                      {/* 右寄せメタバッジ群 */}
                      {(nonOverdueAlert ||
                        isParent ||
                        Boolean(issue.comment_count && issue.comment_count > 0) ||
                        Boolean(issue.attachment_count && issue.attachment_count > 0)) && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {nonOverdueAlert && (
                            <IssueAlertBadge alert={nonOverdueAlert} size="sm" />
                          )}
                          {isParent && (
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap ${
                                hasUnclosedChildren
                                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  : "bg-slate-100 text-slate-500 border-slate-200"
                              }`}
                              title={
                                hasUnclosedChildren
                                  ? `子課題: ${completedChildrenCount}/${childrenCount} 完了（未完了 ${unclosedChildrenCount}件）`
                                  : `子課題: ${completedChildrenCount}/${childrenCount} すべて完了`
                              }
                            >
                              <FolderTree className="w-3 h-3 shrink-0" />
                              <span>
                                {completedChildrenCount}/{childrenCount}
                              </span>
                            </span>
                          )}
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
                      )}
                    </div>
                  </td>

                  {/* 担当者 */}
                  <td className="hidden md:table-cell py-2 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <div
                        style={{ backgroundColor: issue.assignee_id ? assigneeColor : "#cbd5e1" }}
                        className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-bold shrink-0"
                        title={issue.assignee_name || "未割当"}
                      >
                        {getUserInitials(issue.assignee_name)}
                      </div>
                      <select
                        value={issue.assignee_id || ""}
                        onChange={(e) => {
                          const nextId = e.target.value ? Number(e.target.value) : null;
                          onUpdateAssignee?.(issue.id, nextId);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm bg-transparent hover:bg-slate-100 border border-transparent hover:border-slate-300 rounded px-1 py-0.5 text-slate-700 font-medium cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-indigo-500 max-w-[120px] truncate"
                      >
                        <option value="">未割当</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>

                  {/* 状態 */}
                  <td className="hidden md:table-cell py-2 px-3 whitespace-nowrap text-left">
                    <select
                      value={issue.status}
                      onChange={(e) => {
                        const nextStatus = e.target.value as IssueStatus;
                        if (nextStatus === "closed" && hasUnclosedChildren) {
                          alert(
                            `未完了の子課題が ${unclosedChildrenCount} 件存在するため、親課題を完了にすることはできません。`
                          );
                          return;
                        }
                        onUpdateStatus(issue.id, nextStatus);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-xs font-semibold rounded-full px-2 py-0.5 border cursor-pointer transition-colors ${
                        ISSUE_STATUS_CONFIG[issue.status].bg
                      } ${ISSUE_STATUS_CONFIG[issue.status].text} ${
                        ISSUE_STATUS_CONFIG[issue.status].border
                      } focus:outline-hidden focus:ring-1 focus:ring-indigo-500`}
                      title={
                        hasUnclosedChildren
                          ? `未完了の子課題が ${unclosedChildrenCount} 件あるため完了にできません`
                          : undefined
                      }
                    >
                      <option value="open">未対応</option>
                      <option value="in_progress">処理中</option>
                      <option value="resolved">処理済み</option>
                      <option
                        value="closed"
                        disabled={hasUnclosedChildren}
                        title={
                          hasUnclosedChildren
                            ? `未完了の子課題が ${unclosedChildrenCount} 件あるため完了にできません`
                            : undefined
                        }
                      >
                        完了
                      </option>
                    </select>
                  </td>

                  {/* 完了理由 */}
                  {isShowingClosed && (
                    <td className="hidden md:table-cell py-2 px-3 whitespace-nowrap">
                      {issue.status === "closed" ? (
                        <select
                          value={issue.resolution || ""}
                          onChange={async (e) => {
                            const nextVal = e.target.value
                              ? (e.target.value as IssueResolution)
                              : null;
                            if (onUpdateResolution) {
                              onUpdateResolution(issue.id, nextVal);
                            } else {
                              await fetch(`/api/issues/${issue.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ resolution: nextVal }),
                              });
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={`text-xs font-medium rounded px-2 py-0.5 border cursor-pointer transition-colors focus:outline-hidden focus:ring-1 focus:ring-emerald-500 ${
                            issue.resolution === "fixed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                              : issue.resolution === "wont_fix"
                              ? "bg-stone-50 text-stone-600 border-stone-300"
                              : issue.resolution === "invalid"
                              ? "bg-zinc-100 text-zinc-600 border-zinc-300"
                              : issue.resolution === "duplicated"
                              ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                              : issue.resolution === "cannot_reproduce"
                              ? "bg-amber-50 text-amber-700 border-amber-300"
                              : "bg-slate-50 text-slate-400 border-slate-200"
                          }`}
                          title={`完了理由: ${issue.resolution || "未設定"}`}
                        >
                          <option value="">--</option>
                          <option value="fixed">対応済み</option>
                          <option value="wont_fix">対応しない</option>
                          <option value="invalid">無効</option>
                          <option value="duplicated">重複</option>
                          <option value="cannot_reproduce">再現しない</option>
                        </select>
                      ) : (
                        <span
                          className="text-xs text-slate-300 px-2 py-0.5 select-none"
                          title="未完了の課題には完了理由はありません"
                        >
                          --
                        </span>
                      )}
                    </td>
                  )}

                  {/* 優先度 */}
                  <td className="hidden md:table-cell py-2 px-3 whitespace-nowrap text-center">
                    <select
                      value={issue.priority}
                      onChange={(e) => {
                        onUpdatePriority?.(issue.id, e.target.value as IssuePriority);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-xs font-semibold rounded-md px-1.5 py-0.5 border cursor-pointer transition-colors focus:outline-hidden focus:ring-1 focus:ring-indigo-500 ${
                        issue.priority === "high"
                          ? "text-rose-600 border-rose-300 bg-rose-50/80 hover:bg-rose-100"
                          : issue.priority === "medium"
                          ? "text-amber-600 border-amber-300 bg-amber-50/80 hover:bg-amber-100"
                          : "text-slate-600 border-slate-300 bg-slate-50/80 hover:bg-slate-100"
                      }`}
                      title={`優先度: ${
                        issue.priority === "high"
                          ? "高"
                          : issue.priority === "medium"
                          ? "中"
                          : "低"
                      }`}
                    >
                      <option value="high">↑ 高</option>
                      <option value="medium">→ 中</option>
                      <option value="low">↓ 低</option>
                    </select>
                  </td>

                  {/* 期限日 */}
                  <td className="hidden md:table-cell py-2 px-3 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <DatePicker
                        value={issue.due_date}
                        onChange={(nextDate) => {
                          onUpdateDueDate?.(issue.id, nextDate);
                        }}
                        placeholder="期限日未設定"
                        statusHighlight={
                          dueInfo.isOverdue && !isClosed
                            ? "overdue"
                            : dueInfo.isToday && !isClosed
                            ? "today"
                            : "normal"
                        }
                        badge={
                          issue.due_date ? (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                                dueInfo.isOverdue && !isClosed
                                  ? "bg-rose-100 text-rose-700 font-bold"
                                  : dueInfo.isToday && !isClosed
                                  ? "bg-amber-100 text-amber-700 font-bold"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {dueInfo.isOverdue
                                ? `${dueInfo.diffDays}日超過`
                                : dueInfo.isToday
                                ? "本日"
                                : dueInfo.diffDays === 1
                                ? "明日"
                                : `残${dueInfo.diffDays}日`}
                            </span>
                          ) : null
                        }
                      />
                    </div>
                  </td>

                  {/* 操作（ピン留め・削除） */}
                  <td className="hidden md:table-cell py-2 px-2 text-center whitespace-nowrap">
                    <div className="inline-flex items-center justify-center gap-0.5">
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
                          className={`p-1 rounded-md transition-all cursor-pointer spring-bounce hover:scale-115 active:scale-90 ${
                            isPinned
                              ? "text-amber-500 hover:text-amber-600 hover:bg-amber-100/70"
                              : "text-slate-400 opacity-70 group-hover:opacity-100 hover:text-amber-500 hover:bg-amber-50"
                          }`}
                        >
                          <Pin
                            className={`w-4 h-4 transition-transform ${
                              isPinned ? "fill-amber-400 rotate-[-15deg] scale-110" : ""
                            }`}
                          />
                        </button>
                      )}
                      {canDeleteIssue(currentUser, issue) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              confirm(
                                `課題 [${issue.issue_key}] 「${issue.title}」を削除してもよろしいですか？`
                              )
                            ) {
                              onDeleteIssue(issue.id);
                            }
                          }}
                          title="課題を削除（作成者または管理者のみ）"
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded transition-all cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
