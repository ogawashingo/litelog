// 課題一覧テーブルコンポーネント（チーム全体／自分の課題／担当者別フィルター対応）
"use client";

import React, { useState } from "react";
import { Search, Filter, Trash2, UserCheck, Users, CheckCircle2 } from "lucide-react";
import { Issue, IssueStatus, IssueType, IssuePriority } from "@/types";
import { ISSUE_STATUS_CONFIG } from "./IssueBadge";
import { useUser } from "./UserContext";
import { getUserInitials } from "./UserManageModal";
import { parseDbTimestamp, getTodayDateString } from "@/lib/dateUtils";
import { DatePicker } from "./DatePicker";
import CommentPreviewBadge from "./CommentPreviewBadge";

interface IssueListProps {
  issues: Issue[];
  selectedStatus: IssueStatus | "all";
  onSelectStatus?: (status: IssueStatus | "all") => void;
  onSelectIssue: (issue: Issue) => void;
  onUpdateType?: (issueId: number, type: IssueType) => void;
  onUpdateStatus: (issueId: number, status: IssueStatus) => void;
  onUpdateAssignee?: (issueId: number, assigneeId: number | null) => void;
  onUpdatePriority?: (issueId: number, priority: IssuePriority) => void;
  onUpdateDueDate?: (issueId: number, dueDate: string | null) => void;
  onDeleteIssue: (issueId: number) => void;
}

export default function IssueList({
  issues,
  selectedStatus,
  onSelectStatus,
  onSelectIssue,
  onUpdateType,
  onUpdateStatus,
  onUpdateAssignee,
  onUpdatePriority,
  onUpdateDueDate,
  onDeleteIssue,
}: IssueListProps) {
  const { users, currentUser, settings } = useUser();

  const [searchQuery, setSearchQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all"); // "all" | "me" | "unassigned" | userId文字列
  const [typeFilter, setTypeFilter] = useState<IssueType | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | "all">("all");
  const [sortBy, setSortBy] = useState<"due" | "updated" | "priority">("due");
  // ダッシュボードでは完了済み（closed）のタスクはデフォルトで非表示
  const [showClosed, setShowClosed] = useState(false);

  // 「完了」ステータスカードが明示的に選択されている場合、または「完了を表示」トグルがONの場合は完了課題を表示
  const isShowingClosed = selectedStatus === "closed" || showClosed;

  // 期限日の相対表現フォーマッター（設定タイムゾーン基準）
  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return { text: "-", isOverdue: false, isToday: false, diffDays: null };

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
        diffDays: Math.abs(diffDays),
      };
    } else if (diffDays === 0) {
      return {
        text: `${dateStr} (本日)`,
        isOverdue: false,
        isToday: true,
        diffDays: 0,
      };
    } else if (diffDays === 1) {
      return {
        text: `${dateStr} (明日)`,
        isOverdue: false,
        isToday: false,
        diffDays: 1,
      };
    } else {
      return {
        text: `${dateStr} (残${diffDays}日)`,
        isOverdue: false,
        isToday: false,
        diffDays: diffDays,
      };
    }
  };

  // フィルタリング処理
  const filteredIssues = issues.filter((issue) => {
    // ステータスフィルター
    if (selectedStatus !== "all" && issue.status !== selectedStatus) {
      return false;
    }
    // 完了済み（closed）のタスクはデフォルトで非表示（「完了」カード選択時または「完了を含む」ON時は表示）
    if (!isShowingClosed && issue.status === "closed") {
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

  // 「自分の担当」バッジ件数（完了非表示設定に連動）
  const myIssuesCount = currentUser
    ? issues.filter(
        (i) =>
          i.assignee_id === currentUser.id &&
          (selectedStatus === "all" || i.status === selectedStatus) &&
          (isShowingClosed || i.status !== "closed")
      ).length
    : 0;

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
    <div className="bg-white/95 backdrop-blur-xs rounded-xl shadow-xs border border-indigo-100/80 overflow-hidden">
      {/* リストヘッダー & フィルターコントロール */}
      <div className="p-4 border-b border-slate-200/80 bg-gradient-to-r from-indigo-50/40 via-white to-violet-50/40 flex flex-wrap items-center justify-between gap-3">
        {/* タイトル・クイック切替タブ（すべて / 自分の担当） */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800 text-base">
              {assigneeFilter === "me" && currentUser
                ? `${currentUser.name} の担当課題`
                : "課題一覧"}
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
              {sortedIssues.length} 件
            </span>
          </div>

          {/* ワンクリック切替ピル */}
          <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setAssigneeFilter("all")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                assigneeFilter === "all"
                  ? "bg-white text-indigo-800 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>全員</span>
            </button>
            <button
              type="button"
              onClick={() => setAssigneeFilter("me")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                assigneeFilter === "me"
                  ? "bg-white text-indigo-800 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>自分の担当 ({myIssuesCount})</span>
            </button>
          </div>
        </div>

        {/* 検索・絞り込みフォーム */}
        <div className="flex flex-wrap items-center gap-2 text-sm w-full sm:w-auto">
          {/* キーワード検索 */}
          <div className="relative flex-1 sm:w-44">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="課題を検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* 担当者フィルター */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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
            className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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
            className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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
            className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="due">ソート: 期限順</option>
            <option value="updated">ソート: 更新順</option>
            <option value="priority">ソート: 優先度順</option>
          </select>

          {/* 完了済み課題の表示切り替えトグル */}
          <button
            type="button"
            onClick={() => {
              if (selectedStatus === "closed") {
                onSelectStatus?.("all");
                setShowClosed(false);
              } else {
                setShowClosed((prev) => !prev);
              }
            }}
            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
              isShowingClosed
                ? "bg-indigo-50/70 text-indigo-800 border-indigo-200 font-semibold"
                : "bg-white text-slate-500 border-slate-300 hover:bg-slate-50"
            }`}
            title="完了した課題の表示/非表示を切り替えます"
          >
            <CheckCircle2
              className={`w-3.5 h-3.5 ${
                isShowingClosed ? "text-indigo-600" : "text-slate-400"
              }`}
            />
            <span>完了を含む</span>
          </button>
        </div>
      </div>

      {/* 課題一覧テーブル */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider">
              <th className="py-2.5 px-3 w-24 whitespace-nowrap">種別</th>
              <th className="py-2.5 px-3 w-24 whitespace-nowrap">キー</th>
              <th className="py-2.5 px-3 min-w-[240px]">件名</th>
              <th className="py-2.5 px-3 w-36 whitespace-nowrap">担当者</th>
              <th className="py-2.5 px-3 w-28 whitespace-nowrap">状態</th>
              <th className="py-2.5 px-3 w-24 text-center whitespace-nowrap">優先度</th>
              <th className="py-2.5 px-3 w-52 whitespace-nowrap">期限日</th>
              <th className="py-2.5 px-2 w-10 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedIssues.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Filter className="w-8 h-8 text-slate-300" />
                    <p className="text-sm font-medium">該当する課題が見つかりません</p>
                    <p className="text-xs text-slate-400">フィルター条件を変更するか、「課題の追加」から新しいタスクを登録してください。</p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedIssues.map((issue, index) => {
                const dueInfo = formatDueDate(issue.due_date);
                const isClosed = issue.status === "closed";
                const assigneeColor = issue.assignee_color || "#4f46e5";
                // 未完了の子課題件数を判定
                const unclosedChildrenCount = issues.filter(
                  (child) => child.parent_id === issue.id && child.status !== "closed"
                ).length;
                const hasUnclosedChildren = unclosedChildrenCount > 0;

                return (
                  <tr
                    key={issue.id}
                    className={`hover:bg-indigo-50/40 transition-colors group ${
                      isClosed ? "bg-slate-50/60 text-slate-400" : ""
                    }`}
                  >
                    {/* 種別（セレクトボックスで直接変更可能） */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <select
                        value={issue.issue_type}
                        onChange={(e) => {
                          if (onUpdateType) {
                            onUpdateType(issue.id, e.target.value as IssueType);
                          }
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
                    <td className="py-3 px-3 whitespace-nowrap">
                      <a
                        href={`/issues/${issue.issue_key}`}
                        onClick={(e) => {
                          if (!e.metaKey && !e.ctrlKey) {
                            e.preventDefault();
                            onSelectIssue(issue);
                          }
                        }}
                        className="font-bold text-indigo-600 hover:text-indigo-900 hover:underline text-xs font-mono cursor-pointer"
                      >
                        {issue.issue_key}
                      </a>
                    </td>

                    {/* 件名 */}
                    <td className="py-3 px-3 min-w-[240px]">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <a
                          href={`/issues/${issue.issue_key}`}
                          onClick={(e) => {
                            if (!e.metaKey && !e.ctrlKey) {
                              e.preventDefault();
                              onSelectIssue(issue);
                            }
                          }}
                          title={issue.title}
                          className={`text-left font-medium hover:text-indigo-700 transition-colors max-w-full cursor-pointer ${
                            isClosed ? "text-slate-500" : "text-slate-900"
                          }`}
                        >
                          <span
                            className={`line-clamp-2 break-words ${
                              isClosed ? "line-through" : ""
                            }`}
                          >
                            {issue.title}
                          </span>
                        </a>
                        {issue.project_name && (
                          <span
                            title={issue.project_name}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0 max-w-[160px] truncate font-medium"
                          >
                            {issue.project_name}
                          </span>
                        )}
                        {/* コメント件数バッジ ＆ ホバープレビュー */}
                        {Boolean(issue.comment_count && issue.comment_count > 0) && (
                          <CommentPreviewBadge
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
                          className="text-xs bg-transparent hover:bg-slate-100 border border-transparent hover:border-slate-300 rounded px-1 py-0.5 text-slate-700 font-medium cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-indigo-500 max-w-[110px] truncate"
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
                        onChange={(e) => {
                          const nextStatus = e.target.value as IssueStatus;
                          if (nextStatus === "closed" && hasUnclosedChildren) {
                            alert(`未完了の子課題が ${unclosedChildrenCount} 件存在するため、親課題を完了にすることはできません。`);
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
                        title={hasUnclosedChildren ? `未完了の子課題が ${unclosedChildrenCount} 件あるため完了にできません` : undefined}
                      >
                        <option value="open">未対応</option>
                        <option value="in_progress">処理中</option>
                        <option value="resolved">処理済み</option>
                        <option value="closed" disabled={hasUnclosedChildren}>
                          完了{hasUnclosedChildren ? " (未完了あり)" : ""}
                        </option>
                      </select>
                    </td>

                    {/* 優先度（セレクトボックスで直接変更可能） */}
                    <td className="py-3 px-3 whitespace-nowrap text-center">
                      <select
                        value={issue.priority}
                        onChange={(e) => {
                          if (onUpdatePriority) {
                            onUpdatePriority(issue.id, e.target.value as IssuePriority);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`text-xs font-semibold rounded-md px-1.5 py-0.5 border cursor-pointer transition-colors focus:outline-hidden focus:ring-1 focus:ring-indigo-500 ${
                          issue.priority === "high"
                            ? "text-rose-600 border-rose-300 bg-rose-50/80 hover:bg-rose-100"
                            : issue.priority === "medium"
                            ? "text-amber-600 border-amber-300 bg-amber-50/80 hover:bg-amber-100"
                            : "text-slate-600 border-slate-300 bg-slate-50/80 hover:bg-slate-100"
                        }`}
                        title={`優先度: ${issue.priority === "high" ? "高" : issue.priority === "medium" ? "中" : "低"}`}
                      >
                        <option value="high">↑ 高</option>
                        <option value="medium">→ 中</option>
                        <option value="low">↓ 低</option>
                      </select>
                    </td>

                    {/* 期限日（カレンダー選択・月曜/日曜始まり対応・クリア可能） */}
                    <td className="py-3 px-3 whitespace-nowrap text-xs">
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <DatePicker
                          value={issue.due_date}
                          onChange={(nextDate) => {
                            if (onUpdateDueDate) {
                              onUpdateDueDate(issue.id, nextDate);
                            }
                          }}
                          placeholder="期日未設定"
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
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${
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
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded transition-all cursor-pointer"
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
