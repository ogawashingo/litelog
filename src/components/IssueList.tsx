// Backlog風の「自分の課題」一覧テーブルコンポーネント
"use client";

import React, { useState } from "react";
import { Search, Filter, Calendar, ChevronDown, Check, Trash2, ArrowUpDown } from "lucide-react";
import { Issue, IssueStatus, IssueType, IssuePriority } from "@/types";
import { TypeBadge, StatusBadge, PriorityBadge, ISSUE_STATUS_CONFIG } from "./IssueBadge";

interface IssueListProps {
  issues: Issue[];
  selectedStatus: IssueStatus | "all";
  onSelectIssue: (issue: Issue) => void;
  onUpdateStatus: (issueId: number, status: IssueStatus) => void;
  onDeleteIssue: (issueId: number) => void;
}

export default function IssueList({
  issues,
  selectedStatus,
  onSelectIssue,
  onUpdateStatus,
  onDeleteIssue,
}: IssueListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<IssueType | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | "all">("all");
  const [sortBy, setSortBy] = useState<"due" | "updated" | "priority">("due");

  // 期限日の相対表現フォーマッター
  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return { text: "-", isOverdue: false, isToday: false };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [year, month, day] = dateStr.split("-").map(Number);
    const targetDate = new Date(year, month - 1, day);
    targetDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        text: `${dateStr} (${Math.abs(diffDays)}日超過)`,
        isOverdue: true,
        isToday: false,
      };
    } else if (diffDays === 0) {
      return {
        text: `${dateStr} (本日)`,
        isOverdue: false,
        isToday: true,
      };
    } else if (diffDays === 1) {
      return {
        text: `${dateStr} (明日)`,
        isOverdue: false,
        isToday: false,
      };
    } else {
      return {
        text: `${dateStr} (残${diffDays}日)`,
        isOverdue: false,
        isToday: false,
      };
    }
  };

  // フィルタリング処理
  const filteredIssues = issues.filter((issue) => {
    // ステータスフィルター
    if (selectedStatus !== "all" && issue.status !== selectedStatus) {
      return false;
    }
    // 種別フィルター
    if (typeFilter !== "all" && issue.issue_type !== typeFilter) {
      return false;
    }
    // 優先度フィルター
    if (priorityFilter !== "all" && issue.priority !== priorityFilter) {
      return false;
    }
    // キーワード検索（件名、キー、詳細）
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchKey = issue.issue_key.toLowerCase().includes(q);
      const matchTitle = issue.title.toLowerCase().includes(q);
      const matchDesc = issue.description.toLowerCase().includes(q);
      if (!matchKey && !matchTitle && !matchDesc) {
        return false;
      }
    }
    return true;
  });

  // ソート処理
  const sortedIssues = [...filteredIssues].sort((a, b) => {
    // 完了は常に下部に配置（ただし完了タブ表示時は通常ソート）
    if (selectedStatus === "all") {
      if (a.status === "closed" && b.status !== "closed") return 1;
      if (a.status !== "closed" && b.status === "closed") return -1;
    }

    if (sortBy === "due") {
      // 期限日が設定されていないものは後ろ
      if (!a.due_date && b.due_date) return 1;
      if (a.due_date && !b.due_date) return -1;
      if (a.due_date && b.due_date) {
        return a.due_date.localeCompare(b.due_date);
      }
      return b.id - a.id;
    } else if (sortBy === "priority") {
      const priorityOrder: Record<IssuePriority, number> = { high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    } else {
      // 更新日順
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    }
  });

  return (
    <div className="bg-white rounded-lg shadow-xs border border-gray-200 overflow-hidden">
      {/* リストヘッダー & フィルターコントロール */}
      <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex flex-wrap items-center justify-between gap-3">
        {/* タイトルと件数 */}
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-gray-800 text-base">自分の課題</h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-200 text-gray-700">
            {sortedIssues.length} 件
          </span>
        </div>

        {/* 検索・絞り込みフォーム */}
        <div className="flex flex-wrap items-center gap-2 text-sm w-full sm:w-auto">
          {/* キーワード検索 */}
          <div className="relative flex-1 sm:w-48">
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="課題を検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded-md text-xs focus:outline-hidden focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* 種別フィルター */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as IssueType | "all")}
            className="bg-white border border-gray-300 rounded-md px-2 py-1.5 text-xs text-gray-700 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">種別: すべて</option>
            <option value="task">タスク</option>
            <option value="bug">バグ</option>
            <option value="request">要望</option>
            <option value="other">その他</option>
          </select>

          {/* 優先度フィルター */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as IssuePriority | "all")}
            className="bg-white border border-gray-300 rounded-md px-2 py-1.5 text-xs text-gray-700 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">優先度: すべて</option>
            <option value="high">優先度: 高</option>
            <option value="medium">優先度: 中</option>
            <option value="low">優先度: 低</option>
          </select>

          {/* ソート順 */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "due" | "updated" | "priority")}
            className="bg-white border border-gray-300 rounded-md px-2 py-1.5 text-xs text-gray-700 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          >
            <option value="due">ソート: 期限順</option>
            <option value="updated">ソート: 更新順</option>
            <option value="priority">ソート: 優先度順</option>
          </select>
        </div>
      </div>

      {/* 課題一覧テーブル */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100/70 border-b border-gray-200 text-gray-600 font-semibold text-xs uppercase tracking-wider">
              <th className="py-2.5 px-3 w-20">種別</th>
              <th className="py-2.5 px-3 w-28">キー</th>
              <th className="py-2.5 px-3">件名</th>
              <th className="py-2.5 px-3 w-32">状態</th>
              <th className="py-2.5 px-3 w-16 text-center">優先度</th>
              <th className="py-2.5 px-3 w-40">期限日</th>
              <th className="py-2.5 px-2 w-10 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedIssues.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Filter className="w-8 h-8 text-gray-300" />
                    <p className="text-sm font-medium">該当する課題が見つかりません</p>
                    <p className="text-xs text-gray-400">フィルター条件を変更するか、「課題の追加」から新しいタスクを登録してください。</p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedIssues.map((issue) => {
                const dueInfo = formatDueDate(issue.due_date);
                const isClosed = issue.status === "closed";

                return (
                  <tr
                    key={issue.id}
                    className={`hover:bg-emerald-50/30 transition-colors group ${
                      isClosed ? "bg-gray-50/60 text-gray-400" : ""
                    }`}
                  >
                    {/* 種別 */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <TypeBadge type={issue.issue_type} />
                    </td>

                    {/* キー */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <button
                        onClick={() => onSelectIssue(issue)}
                        className="font-bold text-emerald-700 hover:text-emerald-900 hover:underline text-xs"
                      >
                        {issue.issue_key}
                      </button>
                    </td>

                    {/* 件名 */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onSelectIssue(issue)}
                          className={`text-left font-medium hover:text-emerald-700 transition-colors line-clamp-1 ${
                            isClosed ? "line-through text-gray-500" : "text-gray-900"
                          }`}
                        >
                          {issue.title}
                        </button>
                        {issue.project_name && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                            {issue.project_name}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 状態（セレクトボックスで直接変更可能） */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <select
                        value={issue.status}
                        onChange={(e) => onUpdateStatus(issue.id, e.target.value as IssueStatus)}
                        onClick={(e) => e.stopPropagation()}
                        className={`text-xs font-semibold rounded-full px-2 py-0.5 border cursor-pointer transition-colors ${
                          ISSUE_STATUS_CONFIG[issue.status].bg
                        } ${ISSUE_STATUS_CONFIG[issue.status].text} ${
                          ISSUE_STATUS_CONFIG[issue.status].border
                        } focus:outline-hidden focus:ring-1 focus:ring-emerald-500`}
                      >
                        <option value="open">未対応</option>
                        <option value="in_progress">処理中</option>
                        <option value="resolved">処理済み</option>
                        <option value="closed">完了</option>
                      </select>
                    </td>

                    {/* 優先度 */}
                    <td className="py-3 px-3 whitespace-nowrap text-center">
                      <PriorityBadge priority={issue.priority} />
                    </td>

                    {/* 期限日 */}
                    <td className="py-3 px-3 whitespace-nowrap text-xs">
                      {issue.due_date ? (
                        <div
                          className={`flex items-center gap-1 font-medium ${
                            dueInfo.isOverdue && !isClosed
                              ? "text-red-600 font-bold"
                              : dueInfo.isToday && !isClosed
                              ? "text-amber-600 font-bold"
                              : "text-gray-600"
                          }`}
                        >
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span>{dueInfo.text}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* 操作（削除） */}
                    <td className="py-3 px-2 text-center whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`課題 [${issue.issue_key}] 「${issue.title}」を削除してもよろしいですか？`)) {
                            onDeleteIssue(issue.id);
                          }
                        }}
                        title="課題を削除"
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 rounded transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
