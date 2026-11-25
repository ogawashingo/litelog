// 課題詳細（モーダル・個別ページ）共通の子課題一覧＆クイック追加セクション
"use client";

import React from "react";
import Link from "next/link";
import { GitBranch, Plus } from "lucide-react";
import { Issue, IssueType, User } from "@/types";
import { TypeBadge, StatusBadge } from "@/components/IssueBadge";
import { formatDueDateDisplay } from "@/lib/dateUtils";

interface IssueChildSectionProps {
  variant: "modal" | "page";
  childrenIssues: Issue[];
  isProjectArchived: boolean;
  isAddingChild: boolean;
  onStartAddChild: () => void;
  onCancelAddChild: () => void;
  childTitle: string;
  onChangeChildTitle: (val: string) => void;
  childType: IssueType;
  onChangeChildType: (val: IssueType) => void;
  childAssigneeId: string;
  onChangeChildAssigneeId: (val: string) => void;
  isSubmittingChild: boolean;
  childError: string;
  onSubmitAddChild: (e: React.FormEvent) => void;
  assigneeCandidateUsers: User[];
  onSwitchIssue?: (child: Issue) => void;
  onOpenDetailedChildCreate?: () => void;
}

export default function IssueChildSection({
  variant,
  childrenIssues,
  isProjectArchived,
  isAddingChild,
  onStartAddChild,
  onCancelAddChild,
  childTitle,
  onChangeChildTitle,
  childType,
  onChangeChildType,
  childAssigneeId,
  onChangeChildAssigneeId,
  isSubmittingChild,
  childError,
  onSubmitAddChild,
  assigneeCandidateUsers,
  onSwitchIssue,
  onOpenDetailedChildCreate,
}: IssueChildSectionProps) {
  const isModal = variant === "modal";

  return (
    <div
      className={
        isModal
          ? `space-y-2 ${childrenIssues.length === 0 && !isAddingChild ? "hidden sm:block" : ""}`
          : `space-y-3 pt-3 border-t border-slate-100 ${childrenIssues.length === 0 && !isAddingChild ? "hidden sm:block" : ""}`
      }
    >
      <div className="flex items-center justify-between">
        {isModal ? (
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
            <span>子課題 ({childrenIssues.length})</span>
          </h4>
        ) : (
          <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
            <span>子課題 ({childrenIssues.length})</span>
          </h3>
        )}
        <div className="flex items-center gap-2">
          {isModal && childrenIssues.length > 0 && !isAddingChild && (
            <span className="text-[11px] text-slate-400">クリックで子課題を開く</span>
          )}
          {!isProjectArchived && !isAddingChild && (
            <button
              type="button"
              onClick={onStartAddChild}
              className={
                isModal
                  ? "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors cursor-pointer"
                  : "inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
              }
            >
              <Plus className={isModal ? "w-3 h-3" : "w-3.5 h-3.5"} />
              <span>子課題を追加</span>
            </button>
          )}
        </div>
      </div>

      {/* 子課題一覧 */}
      {childrenIssues.length > 0 && (
        isModal ? (
          <div className="bg-slate-50 border border-slate-200 rounded-lg divide-y divide-slate-200 overflow-hidden">
            {childrenIssues.map((child) => (
              <div
                key={child.id}
                role="button"
                tabIndex={0}
                onClick={() => onSwitchIssue?.(child)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSwitchIssue?.(child);
                  }
                }}
                className="px-3 py-2 flex items-center justify-between text-xs hover:bg-indigo-50/70 transition-colors cursor-pointer group select-none"
                title={`子課題 [${child.issue_key}] を開く`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <TypeBadge type={child.issue_type} showLabel={false} />
                  <a
                    href={`/issues/${child.issue_key}`}
                    onClick={(e) => {
                      if (!e.metaKey && !e.ctrlKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        onSwitchIssue?.(child);
                      }
                    }}
                    className="font-bold text-indigo-700 group-hover:text-indigo-900 group-hover:underline shrink-0"
                  >
                    {child.issue_key}
                  </a>
                  <span className="text-slate-800 group-hover:text-slate-900 truncate font-medium">
                    {child.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {child.assignee_name && (
                    <span className="text-[11px] text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                      {child.assignee_name}
                    </span>
                  )}
                  <StatusBadge status={child.status} />
                  {child.due_date && (
                    <span className="text-[11px] text-slate-500 font-mono">{formatDueDateDisplay(child.due_date)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
            {childrenIssues.map((child) => (
              <Link
                key={child.id}
                href={`/issues/${child.issue_key}`}
                className="p-3 bg-white hover:bg-indigo-50/60 flex items-center justify-between gap-3 transition-colors group cursor-pointer block"
                title={`子課題 [${child.issue_key}] を開く`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <TypeBadge type={child.issue_type} />
                  <span className="font-mono font-bold text-indigo-600 group-hover:underline shrink-0">
                    {child.issue_key}
                  </span>
                  <span className="text-slate-800 group-hover:text-indigo-600 font-medium truncate">
                    {child.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={child.status} />
                  {child.assignee_name && (
                    <span className="text-slate-500">
                      {child.assignee_name}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )
      )}

      {/* 子課題が0件でインラインフォームも閉じてる場合の案内 */}
      {childrenIssues.length === 0 && !isAddingChild && (
        <div
          className={
            isModal
              ? "bg-slate-50/70 border border-dashed border-slate-200 rounded-lg p-3 text-center text-xs text-slate-400"
              : "bg-slate-50/70 border border-dashed border-slate-200 rounded-xl p-4 text-center text-xs text-slate-400"
          }
        >
          子課題はまだ登録されていません
        </div>
      )}

      {/* 子課題インライン追加フォーム */}
      {isAddingChild && (
        <form
          onSubmit={onSubmitAddChild}
          className={
            isModal
              ? "p-3 bg-slate-50 border border-indigo-200 rounded-lg space-y-2.5 text-xs shadow-xs"
              : "p-3.5 bg-slate-50 border border-indigo-200 rounded-xl space-y-3 text-xs shadow-xs"
          }
        >
          <div className="font-semibold text-slate-700 flex items-center justify-between">
            <span className={`flex items-center ${isModal ? "gap-1" : "gap-1.5"} text-indigo-700`}>
              <Plus className="w-3.5 h-3.5" />
              子課題のクイック追加
            </span>
            {!isModal && onOpenDetailedChildCreate && (
              <button
                type="button"
                onClick={onOpenDetailedChildCreate}
                className="text-slate-500 hover:text-indigo-600 hover:underline text-[11px] font-normal cursor-pointer"
              >
                詳細を入力して作成...
              </button>
            )}
          </div>

          {childError && (
            <div className="p-2 bg-red-50 text-red-600 border border-red-200 rounded text-xs">
              {childError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={childType}
              onChange={(e) => onChangeChildType(e.target.value as IssueType)}
              className={
                isModal
                  ? "bg-white border border-slate-300 rounded-md px-2 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shrink-0"
                  : "bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shrink-0"
              }
            >
              <option value="task">タスク</option>
              <option value="bug">バグ</option>
              <option value="request">要望</option>
              <option value="other">その他</option>
            </select>

            <input
              type="text"
              value={childTitle}
              onChange={(e) => onChangeChildTitle(e.target.value)}
              placeholder="子課題の件名を入力... (Enterで追加)"
              autoFocus
              disabled={isSubmittingChild}
              className={
                isModal
                  ? "flex-1 bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  : "flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              }
            />

            <select
              value={childAssigneeId}
              onChange={(e) => onChangeChildAssigneeId(e.target.value)}
              className={
                isModal
                  ? "bg-white border border-slate-300 rounded-md px-2 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shrink-0"
                  : "bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shrink-0"
              }
            >
              <option value="">担当者なし</option>
              {assigneeCandidateUsers.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className={`flex items-center justify-end gap-2 ${isModal ? "pt-0.5" : "pt-1"}`}>
            <button
              type="button"
              onClick={onCancelAddChild}
              disabled={isSubmittingChild}
              className={
                isModal
                  ? "px-2.5 py-1 text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded transition-colors cursor-pointer"
                  : "px-3 py-1.5 text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
              }
            >
              閉じる
            </button>
            <button
              type="submit"
              disabled={isSubmittingChild || !childTitle.trim()}
              className={
                isModal
                  ? "px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                  : "px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              }
            >
              {isSubmittingChild ? "追加中..." : "追加"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
