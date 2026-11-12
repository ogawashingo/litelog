// Backlog風の課題一覧テーブルコンポーネント（チーム全体／自分の課題／担当者別フィルター対応）
"use client";

import React, { useState } from "react";
import { Search, Filter, Calendar, Trash2, UserCheck, Users } from "lucide-react";
import { Issue, IssueStatus, IssueType, IssuePriority } from "@/types";
import { TypeBadge, PriorityBadge, ISSUE_STATUS_CONFIG } from "./IssueBadge";
import { useUser } from "./UserContext";
import { getUserInitials } from "./UserManageModal";
import { parseDbTimestamp, getTodayDateString } from "@/lib/dateUtils";

interface IssueListProps {
  issues: Issue[];
  selectedStatus: IssueStatus | "all";
  onSelectIssue: (issue: Issue) => void;
  onUpdateStatus: (issueId: number, status: IssueStatus) => void;
  onUpdateAssignee?: (issueId: number, assigneeId: number | null) => void;
  onDeleteIssue: (issueId: number) => void;
}

export default function IssueList({
  issues,
  selectedStatus,
  onSelectIssue,
  onUpdateStatus,
  onUpdateAssignee,
  onDeleteIssue,
}: IssueListProps) {
  const { users, currentUser, settings } = useUser();

  const [searchQuery, setSearchQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all"); // "all" | "me" | "unassigned" | userId文字列
  const [typeFilter, setTypeFilter] = useState<IssueType | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | "all">("all");
  const [sortBy, setSortBy] = useState<"due" | "updated" | "priority">("due");

  // 期限日の相対表現フォーマッター（設定タイムゾーン基準）
  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return { text: "-", isOverdue: false, isToday: false };

    const todayStr = getTodayDateString(settings);
    const [ty, tm, td] = todayStr.split("-").map(Number);
    const today = new Date(ty, tm - 1, td);
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
    // 担当者フィルター
    if (assigneeFilter === "me") {
      if (!currentUser || issue.assignee_id !== currentUser.id) return false;
    } else if (assigneeFilter === "unassigned") {
      if (issue.assignee_id !== null && issue.assignee_id !== undefined) return false;
    } else if (assigneeFilter !== "all") {
      if (issue.assignee_id !== Number(assigneeFilter)) return false;
    }
    // 種別フィルター
    if (typeFilter !== "all" && issue.issue_type !== typeFilter) {
      return false;
    }
    // 優先度フィルター
    if (priorityFilter !== "all" && issue.priority !== priorityFilter) {
      return false;
    }
    // キーワード検索（件名、キー、詳細、担当者名）
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchKey = issue.issue_key.toLowerCase().includes(q);
      const matchTitle = issue.title.toLowerCase().includes(q);
      const matchDesc = issue.description.toLowerCase().includes(q);
      const matchAssignee = (issue.assignee_name || "").toLowerCase().includes(q);
      if (!matchKey && !matchTitle && !matchDesc && !matchAssignee) {
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
      // 更新日順（UTCタイムスタンプを正確にパースして比較）
      return parseDbTimestamp(b.updated_at).getTime() - parseDbTimestamp(a.updated_at).getTime();
    }
  });

  return (
    <div className="bg-white rounded-lg shadow-xs border border-gray-200 overflow-hidden">
      {/* リストヘッダー & フィルターコントロール */}
      <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex flex-wrap items-center justify-between gap-3">
        {/* タイトル・クイック切替タブ（すべて / 自分の担当） */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-800 text-base">
              {assigneeFilter === "me" && currentUser
                ? `${currentUser.name} の担当課題`
                : "課題一覧"}
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-200 text-gray-700">
              {sortedIssues.length} 件
            </span>
          </div>

          {/* ワンクリック切替ピル */}
          <div className="flex items-center bg-gray-200/70 p-0.5 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setAssigneeFilter("all")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all ${
                assigneeFilter === "all"
                  ? "bg-white text-emerald-800 shadow-2xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>全員</span>
            </button>
            <button
              type="button"
              onClick={() => setAssigneeFilter("me")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all ${
                assigneeFilter === "me"
                  ? "bg-white text-emerald-800 shadow-2xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>自分の担当 ({currentUser ? issues.filter((i) => i.assignee_id === currentUser.id).length : 0})</span>
            </button>
          </div>
        </div>

        {/* 検索・絞り込みフォーム */}
        <div className="flex flex-wrap items-center gap-2 text-sm w-full sm:w-auto">
          {/* キーワード検索 */}
          <div className="relative flex-1 sm:w-44">
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="課題を検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded-md text-xs focus:outline-hidden focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* 担当者フィルター */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="bg-white border border-gray-300 rounded-md px-2 py-1.5 text-xs text-gray-700 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">担当者: すべて</option>
            {currentUser && (
              <option value="me">担当者: 自分 ({currentUser.name})</option>
            )}
            <option value="unassigned">担当者: 未割当</option>
            {users.map((u) => (
              <option key={u.id} value={String(u.id)}>
                担当者: {u.name}
              </option>
            ))}
          </select>

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
              <th className="py-2.5 px-3 w-20 whitespace-nowrap">種別</th>
              <th className="py-2.5 px-3 w-24 whitespace-nowrap">キー</th>
              <th className="py-2.5 px-3 min-w-[240px]">件名</th>
              <th className="py-2.5 px-3 w-36 whitespace-nowrap">担当者</th>
              <th className="py-2.5 px-3 w-28 whitespace-nowrap">状態</th>
              <th className="py-2.5 px-3 w-16 text-center whitespace-nowrap">優先度</th>
              <th className="py-2.5 px-3 w-40 whitespace-nowrap">期限日</th>
              <th className="py-2.5 px-2 w-10 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedIssues.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-gray-400">
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
                const assigneeColor = issue.assignee_color || "#9ca3af";

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
                    <td className="py-3 px-3 min-w-[240px]">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <button
                          onClick={() => onSelectIssue(issue)}
                          title={issue.title}
                          className={`text-left font-medium hover:text-emerald-700 transition-colors max-w-full ${
                            isClosed ? "text-gray-500" : "text-gray-900"
                          }`}
                        >
                          <span
                            className={`line-clamp-2 break-words ${
                              isClosed ? "line-through" : ""
                            }`}
                          >
                            {issue.title}
                          </span>
                        </button>
                        {issue.project_name && (
                          <span
                            title={issue.project_name}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0 max-w-[160px] truncate"
                          >
                            {issue.project_name}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 担当者（直接変更可能） */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <div
                          style={{ backgroundColor: issue.assignee_id ? assigneeColor : "#cbd5e1" }}
                          className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[9px] font-bold shrink-0"
                          title={issue.assignee_name || "未割当"}
                        >
                          {getUserInitials(issue.assignee_name)}
                        </div>
                        <select
                          value={issue.assignee_id || ""}
                          onChange={(e) => {
                            const nextId = e.target.value ? Number(e.target.value) : null;
                            if (onUpdateAssignee) {
                              onUpdateAssignee(issue.id, nextId);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs bg-transparent hover:bg-gray-100 border border-transparent hover:border-gray-300 rounded px-1 py-0.5 text-gray-700 font-medium cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500 max-w-[110px] truncate"
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
