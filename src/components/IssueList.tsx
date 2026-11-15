// 課題一覧テーブルコンポーネント（チーム全体／自分の課題／担当者別フィルター対応）
"use client";

import React, { useState, useMemo } from "react";
import { Search, Filter, Trash2, UserCheck, Users, CheckCircle2, FolderTree, CornerDownRight, AlertTriangle, Paperclip } from "lucide-react";
import { Issue, IssueStatus, IssueType, IssuePriority, IssueResolution } from "@/types";
import { ISSUE_STATUS_CONFIG } from "./IssueBadge";
import { useUser } from "./UserContext";
import { getUserInitials } from "./UserManageModal";
import { parseDbTimestamp, getTodayDateString } from "@/lib/dateUtils";
import { DatePicker } from "./DatePicker";
import CommentPreviewBadge from "./CommentPreviewBadge";
import { getIssueAlert } from "@/lib/issueAlerts";
import IssueAlertBadge from "./IssueAlertBadge";
import CompleteIssueModal from "./CompleteIssueModal";

interface IssueListProps {
  issues: Issue[];
  selectedStatus: IssueStatus | "all";
  onSelectStatus?: (status: IssueStatus | "all") => void;
  onSelectIssue: (issue: Issue) => void;
  onUpdateType?: (issueId: number, type: IssueType) => void;
  onUpdateStatus: (issueId: number, status: IssueStatus, resolution?: IssueResolution | null) => void;
  onUpdateAssignee?: (issueId: number, assigneeId: number | null) => void;
  onUpdatePriority?: (issueId: number, priority: IssuePriority) => void;
  onUpdateResolution?: (issueId: number, resolution: IssueResolution | null) => void;
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
  onUpdateResolution,
  onUpdateDueDate,
  onDeleteIssue,
}: IssueListProps) {
  const { users, currentUser, settings } = useUser();

  const [searchQuery, setSearchQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all"); // "all" | "me" | "unassigned" | userId文字列
  const [typeFilter, setTypeFilter] = useState<IssueType | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | "all">("all");
  const [resolutionFilter, setResolutionFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"due" | "updated" | "priority">("due");
  // 完了ダイアログ対象の課題
  const [pendingCloseIssue, setPendingCloseIssue] = useState<Issue | null>(null);
  // 親子階層表示（ツリー構造）フラグ（デフォルトON）
  const [withParentRelation, setWithParentRelation] = useState<boolean>(true);
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
    // 完了理由フィルター（完了課題が表示されている時のみ有効）
    if (isShowingClosed && resolutionFilter !== "all") {
      if (resolutionFilter === "unspecified") {
        if (issue.resolution) return false;
      } else {
        if (issue.resolution !== resolutionFilter) return false;
      }
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

  // ソートおよび親子ツリー順の課題配列構築
  const displayedIssues = useMemo<{ issue: Issue; depth: number }[]>(() => {
    // 共通のソート比較関数
    const compareIssues = (a: Issue, b: Issue) => {
      // 完了は常に下部に配置（ただし完了タブ表示時は通常ソート）
      if (selectedStatus === "all") {
        if (a.status === "closed" && b.status !== "closed") return 1;
        if (a.status !== "closed" && b.status === "closed") return -1;
      }

      if (sortBy === "due") {
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
        return parseDbTimestamp(b.updated_at).getTime() - parseDbTimestamp(a.updated_at).getTime();
      }
    };

    if (!withParentRelation) {
      // フラット表示
      return [...filteredIssues].sort(compareIssues).map((issue) => ({
        issue,
        depth: 0,
      }));
    }

    // 親子関係ツリー順に整理して配置
    const filteredIdSet = new Set(filteredIssues.map((i) => i.id));
    const childrenMap = new Map<number, Issue[]>();

    filteredIssues.forEach((issue) => {
      if (issue.parent_id && filteredIdSet.has(issue.parent_id)) {
        const list = childrenMap.get(issue.parent_id) || [];
        list.push(issue);
        childrenMap.set(issue.parent_id, list);
      }
    });

    // ルート課題（親が存在しない、またはフィルター内に親が存在しない単独課題）
    const roots = filteredIssues
      .filter((i) => !i.parent_id || !filteredIdSet.has(i.parent_id))
      .sort(compareIssues);

    const result: { issue: Issue; depth: number }[] = [];
    roots.forEach((root) => {
      result.push({ issue: root, depth: 0 });
      const children = childrenMap.get(root.id) || [];
      // 子課題は課題番号（連番）順で整列
      children.sort((a, b) => a.issue_number - b.issue_number);
      children.forEach((child) => {
        result.push({ issue: child, depth: 1 });
      });
    });

    return result;
  }, [filteredIssues, withParentRelation, sortBy, selectedStatus]);

  return (
    <div className="bg-white/95 backdrop-blur-xs rounded-xl shadow-xs border border-indigo-100/80 overflow-hidden">
      {/* リストヘッダー & フィルターコントロール */}
      <div className="issue-list-header p-4 border-b border-slate-200/80 bg-gradient-to-r from-indigo-50/40 via-white to-violet-50/40 flex flex-wrap items-center justify-between gap-3">
        {/* タイトル・クイック切替タブ（すべて / 自分の担当） */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800 text-base">
              {assigneeFilter === "me" && currentUser
                ? `${currentUser.name} の担当課題`
                : "課題一覧"}
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
              {displayedIssues.length} 件
            </span>
          </div>

          {/* ワンクリック切替ピル（全員 / 自分の担当） */}
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
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* 担当者フィルター */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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

          {/* 状態（ステータス）フィルター */}
          <select
            value={selectedStatus}
            onChange={(e) => onSelectStatus?.(e.target.value as IssueStatus | "all")}
            className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">状態: すべて</option>
            <option value="open">状態: 未対応</option>
            <option value="in_progress">状態: 処理中</option>
            <option value="resolved">状態: 処理済み</option>
            <option value="closed">状態: 完了</option>
          </select>

          {/* 種別フィルター */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as IssueType | "all")}
            className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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
            className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">優先度: すべて</option>
            <option value="high">優先度: 高</option>
            <option value="medium">優先度: 中</option>
            <option value="low">優先度: 低</option>
          </select>

          {/* 完了理由フィルター（完了課題が表示されている時のみ表示） */}
          {isShowingClosed && (
            <select
              value={resolutionFilter}
              onChange={(e) => setResolutionFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 animate-fadeIn"
            >
              <option value="all">完了理由: すべて</option>
              <option value="unspecified">完了理由: 未設定</option>
              <option value="fixed">完了理由: 対応済み</option>
              <option value="wont_fix">完了理由: 対応しない</option>
              <option value="invalid">完了理由: 無効</option>
              <option value="duplicated">完了理由: 重複</option>
              <option value="cannot_reproduce">完了理由: 再現しない</option>
            </select>
          )}

          {/* ソート順 */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "due" | "updated" | "priority")}
            className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="due">ソート: 期限順</option>
            <option value="updated">ソート: 更新順</option>
            <option value="priority">ソート: 優先度順</option>
          </select>

          {/* 親子階層表示の切り替えトグル */}
          <button
            type="button"
            onClick={() => setWithParentRelation((prev) => !prev)}
            className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
              withParentRelation
                ? "bg-indigo-50/70 text-indigo-800 border-indigo-200 font-semibold"
                : "bg-white text-slate-500 border-slate-300 hover:bg-slate-50"
            }`}
            title="親課題と子課題を階層ツリー構造で整理して表示します"
          >
            <FolderTree
              className={`w-3.5 h-3.5 ${
                withParentRelation ? "text-indigo-600" : "text-slate-400"
              }`}
            />
            <span>親子階層表示</span>
          </button>

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
              {isShowingClosed && (
                <th className="py-2.5 px-3 w-28 whitespace-nowrap">完了理由</th>
              )}
              <th className="py-2.5 px-3 w-24 text-center whitespace-nowrap">優先度</th>
              <th className="py-2.5 px-3 w-52 whitespace-nowrap">期限日</th>
              <th className="py-2.5 px-2 w-10 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayedIssues.length === 0 ? (
              <tr>
                <td colSpan={isShowingClosed ? 9 : 8} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Filter className="w-8 h-8 text-slate-300" />
                    <p className="text-sm font-medium">該当する課題が見つかりません</p>
                    <p className="text-xs text-slate-400">フィルター条件を変更するか、「課題の追加」から新しいタスクを登録してください。</p>
                  </div>
                </td>
              </tr>
            ) : (
              displayedIssues.map(({ issue, depth }, index) => {
                const dueInfo = formatDueDate(issue.due_date);
                const isClosed = issue.status === "closed";
                const assigneeColor = issue.assignee_color || "#4f46e5";
                const issueAlert = getIssueAlert(issue, settings);

                // 親子判定
                const isChild = Boolean(issue.parent_id);
                const childrenOfThis = issues.filter((child) => child.parent_id === issue.id);
                const isParent = childrenOfThis.length > 0;
                const unclosedChildrenCount = childrenOfThis.filter((c) => c.status !== "closed").length;
                const hasUnclosedChildren = unclosedChildrenCount > 0;
                const completedChildrenCount = childrenOfThis.length - unclosedChildrenCount;

                // 左端ボーダーおよび行の背景色（重大な問題がある課題を最優先で視覚強調）
                const borderClass = isClosed
                  ? "border-l-4 border-transparent"
                  : issueAlert?.level === "critical"
                  ? "border-l-4 border-rose-500 bg-rose-50/20 hover:bg-rose-50/40"
                  : issueAlert?.level === "warning"
                  ? "border-l-4 border-amber-500 bg-amber-50/20 hover:bg-amber-50/40"
                  : issueAlert?.level === "caution"
                  ? "border-l-4 border-purple-500 bg-purple-50/15 hover:bg-purple-50/35"
                  : isParent
                  ? "border-l-4 border-indigo-600"
                  : isChild
                  ? "border-l-4 border-indigo-200/50"
                  : "border-l-4 border-transparent";

                return (
                  <tr
                    key={issue.id}
                    className={`transition-colors group ${
                      isClosed
                        ? "bg-slate-50/60 text-slate-400 hover:bg-slate-100/60"
                        : isParent && !issueAlert
                        ? "issue-parent-row bg-indigo-50/30 hover:bg-indigo-50/60"
                        : isChild && !issueAlert
                        ? "bg-white hover:bg-indigo-50/20"
                        : !issueAlert
                        ? "hover:bg-indigo-50/40"
                        : ""
                    } ${borderClass}`}
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

                    {/* キー（階層表示時は子課題にツリーアイコンを付与） */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {depth > 0 && (
                          <CornerDownRight className="w-3.5 h-3.5 text-indigo-500 shrink-0 ml-1" />
                        )}
                        <a
                          href={`/issues/${issue.issue_key}`}
                          onClick={(e) => {
                            if (!e.metaKey && !e.ctrlKey) {
                              e.preventDefault();
                              onSelectIssue(issue);
                            }
                          }}
                          className="font-bold text-indigo-600 hover:text-indigo-900 hover:underline text-sm font-mono cursor-pointer"
                        >
                          {issue.issue_key}
                        </a>
                      </div>
                    </td>

                    {/* 件名 */}
                    <td className="py-3 px-3 min-w-[240px]">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {/* 問題アラートバッジ（遅延・停滞・未着手警告等） */}
                        {issueAlert && (
                          <IssueAlertBadge alert={issueAlert} size="sm" />
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
                          className={`text-left hover:text-indigo-700 transition-colors max-w-full cursor-pointer ${
                            isClosed
                              ? "text-slate-500"
                              : isParent
                              ? "font-bold text-slate-900 text-sm"
                              : "font-medium text-slate-800 text-sm"
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
                        {/* コメント件数バッジ ＆ ホバープレビュー（全コメント表示対応） */}
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
                        {/* 添付ファイル件数バッジ */}
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
                    </td>

                    {/* 担当者（直接変更可能） */}
                    <td className="py-3 px-3 whitespace-nowrap">
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
                            if (onUpdateAssignee) {
                              onUpdateAssignee(issue.id, nextId);
                            }
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

                    {/* 状態（セレクトボックスで直接変更可能） */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <select
                        value={issue.status}
                        onChange={(e) => {
                          const nextStatus = e.target.value as IssueStatus;
                          if (nextStatus === "closed") {
                            if (hasUnclosedChildren) {
                              alert(`未完了の子課題が ${unclosedChildrenCount} 件存在するため、親課題を完了にすることはできません。`);
                              return;
                            }
                            // 完了理由選択ダイアログを開く
                            setPendingCloseIssue(issue);
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

                    {/* 完了理由（完了課題が表示されている時のみ列を表示） */}
                    {isShowingClosed && (
                      <td className="py-3 px-3 whitespace-nowrap">
                        <select
                          value={issue.resolution || ""}
                          onChange={async (e) => {
                            const nextVal = e.target.value ? (e.target.value as IssueResolution) : null;
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
                      </td>
                    )}

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
                    <td className="py-3 px-3 whitespace-nowrap text-sm">
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

      {/* 完了理由選択モーダル */}
      <CompleteIssueModal
        isOpen={Boolean(pendingCloseIssue)}
        issueKey={pendingCloseIssue?.issue_key || ""}
        issueTitle={pendingCloseIssue?.title || ""}
        onClose={() => setPendingCloseIssue(null)}
        onConfirm={(resolution) => {
          if (!pendingCloseIssue) return;
          const target = pendingCloseIssue;
          setPendingCloseIssue(null);
          onUpdateStatus(target.id, "closed", resolution);
        }}
      />
    </div>
  );
}
