// ガントチャート左ペイン（課題一覧テーブル・ツリー展開・状態変更・期限日表示）
"use client";

import React from "react";
import { ChevronRight, ChevronDown, CornerDownRight, Plus } from "lucide-react";
import { Issue, IssueStatus } from "@/types";
import { TypeBadge } from "../IssueBadge";
import { getUserInitials } from "../UserManageModal";
import { DisplayRow, ROW_HEIGHT } from "./ganttUtils";
import { formatDueDateDisplay } from "@/lib/dateUtils";

interface GanttLeftTableProps {
  leftPaneWidth: number;
  leftTableScrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  displayRows: DisplayRow[];
  hoveredIssueId: number | null;
  onHoverIssue: (id: number | null) => void;
  todayStr: string;
  collapsedParentIds: Set<number>;
  onToggleParentCollapse: (parentId: number) => void;
  withParentRelation: boolean;
  onOpenDetail: (issue: Issue) => void;
  onOpenCreateChild: (parentId: number) => void;
  onQuickStatusChange: (issueId: number, newStatus: IssueStatus) => void;
}

export default function GanttLeftTable({
  leftPaneWidth,
  leftTableScrollRef,
  onScroll,
  displayRows,
  hoveredIssueId,
  onHoverIssue,
  todayStr,
  collapsedParentIds,
  onToggleParentCollapse,
  withParentRelation,
  onOpenDetail,
  onOpenCreateChild,
  onQuickStatusChange,
}: GanttLeftTableProps) {
  return (
    <div
      style={{ width: `${leftPaneWidth}px` }}
      className="shrink-0 flex flex-col bg-white select-none"
    >
      {/* テーブルヘッダー（高さ: 52px = 右側の2段ヘッダーと正確に一致） */}
      <div className="h-[52px] bg-gray-50 border-b border-gray-200 flex items-center px-3 text-xs font-bold text-gray-600">
        <div className="flex-1 min-w-0 pr-2">件名</div>
        <div className="w-[34px] shrink-0 text-center">担当</div>
        <div className="w-[66px] shrink-0 text-center">状態</div>
        <div className="w-[84px] shrink-0 text-center">期限日</div>
      </div>

      {/* 課題一覧ボディ（タイムラインと連動して縦スクロール・ビューポート追従でフッターレス画面を最大活用） */}
      <div
        ref={leftTableScrollRef}
        onScroll={onScroll}
        className="overflow-y-auto overflow-x-hidden overscroll-contain max-h-[calc(100vh-var(--app-header-height,56px)-230px)] min-h-[300px] divide-y divide-gray-100"
      >
        {displayRows.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400">
            表示する課題がありません
          </div>
        ) : (
          displayRows.map((row) => {
            const { issue, depth, hasChildren, childrenIssues } = row;
            const isHovered = hoveredIssueId === issue.id;
            const isClosed = issue.status === "closed";
            const isOverdue = !isClosed && issue.due_date && issue.due_date < todayStr;
            const isCollapsed = collapsedParentIds.has(issue.id);
            const unclosedChildren = childrenIssues.filter((c) => c.status !== "closed");
            const hasUnclosedChildren = unclosedChildren.length > 0;

            return (
              <div
                key={issue.id}
                onMouseEnter={() => onHoverIssue(issue.id)}
                onMouseLeave={() => onHoverIssue(null)}
                style={{ height: `${ROW_HEIGHT}px` }}
                className={`group flex items-center px-3 text-sm transition-colors ${
                  hasChildren ? "bg-slate-50/70 font-semibold" : ""
                } ${isHovered ? "bg-indigo-50/70" : "hover:bg-slate-50/80"}`}
              >
                {/* 件名（ツリー展開・種別アイコン統合） ＆ クイック子課題追加ボタン */}
                <div className="flex-1 min-w-0 pr-2 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {/* 親子ツリー表示時のインデント・矢印・折りたたみトグル */}
                    {withParentRelation && (
                      <>
                        {depth > 0 ? (
                          <div className="flex items-center shrink-0 pl-3">
                            <CornerDownRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          </div>
                        ) : hasChildren ? (
                          <button
                            onClick={() => onToggleParentCollapse(issue.id)}
                            className="w-[18px] h-[18px] flex items-center justify-center p-0.5 rounded hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer shrink-0"
                            title={isCollapsed ? "子課題を展開" : "子課題を折りたたむ"}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="w-[18px] shrink-0" />
                        )}
                      </>
                    )}

                    {/* 種別アイコン */}
                    <div className="shrink-0 flex items-center">
                      <TypeBadge type={issue.issue_type} showLabel={false} />
                    </div>

                    {/* 課題名（ホバーでキー＋件名ツールチップ表示、クリックで詳細モーダル） */}
                    <button
                      onClick={() => onOpenDetail(issue)}
                      className={`text-left truncate flex-1 cursor-pointer ${
                        isClosed
                          ? "line-through text-slate-400"
                          : hasChildren
                          ? "font-bold text-slate-900 hover:text-indigo-700 text-sm"
                          : "font-medium text-slate-800 hover:text-indigo-700 text-sm"
                      }`}
                      title={`[${issue.issue_key}] ${issue.title}`}
                    >
                      {issue.title}
                    </button>
                  </div>

                  {/* 親課題の場合、子課題件数と＋ボタンを表示 */}
                  {withParentRelation && depth === 0 && (
                    <div className="flex items-center gap-1 shrink-0">
                      {hasChildren && (
                        <span className="text-xs bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full font-bold">
                          {childrenIssues.length}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCreateChild(issue.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-opacity cursor-pointer"
                        title="この課題の子課題を追加"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* 担当者アバター */}
                <div className="w-[34px] shrink-0 flex items-center justify-center">
                  <div
                    style={{
                      backgroundColor: issue.assignee_id
                        ? issue.assignee_color || "#4f46e5"
                        : "#cbd5e1",
                    }}
                    className="w-5.5 h-5.5 rounded-full text-white flex items-center justify-center text-[10px] font-bold"
                    title={
                      issue.assignee_name ? `担当: ${issue.assignee_name}` : "担当: 未割当"
                    }
                  >
                    {getUserInitials(issue.assignee_name)}
                  </div>
                </div>

                {/* 状態変更セレクター */}
                <div className="w-[66px] shrink-0 text-center">
                  <select
                    value={issue.status}
                    onChange={(e) =>
                      onQuickStatusChange(issue.id, e.target.value as IssueStatus)
                    }
                    className="w-full text-xs font-semibold bg-white border border-slate-300 rounded px-1 py-0.5 text-slate-700 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    title={
                      hasUnclosedChildren
                        ? `未完了の子課題が ${unclosedChildren.length} 件あるため完了にできません`
                        : undefined
                    }
                  >
                    <option value="open">未対応</option>
                    <option value="in_progress">処理中</option>
                    <option value="resolved">処理済み</option>
                    <option value="closed" disabled={hasUnclosedChildren}>
                      完了{hasUnclosedChildren ? " (不可)" : ""}
                    </option>
                  </select>
                </div>

                {/* 期限日（YYYY/MM/DD表記） */}
                <div className="w-[84px] shrink-0 text-center font-medium text-xs font-mono">
                  {issue.due_date ? (
                    <span
                      className={
                        isOverdue
                          ? "text-rose-600 font-bold"
                          : isClosed
                          ? "text-gray-400"
                          : "text-gray-700"
                      }
                      title={isOverdue ? "期限を過ぎています" : undefined}
                    >
                      {formatDueDateDisplay(issue.due_date)}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs font-sans">未設定</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
