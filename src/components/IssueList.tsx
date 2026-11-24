// 課題一覧テーブルコンポーネント（チーム全体／自分の課題／担当者別フィルター対応）
"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Search, Filter, Trash2, UserCheck, Users, CheckCircle2, FolderTree, CornerDownRight, AlertTriangle, Paperclip, ArrowUp, ChevronLeft, ChevronRight, Flame, ClipboardCheck } from "lucide-react";
import { Issue, IssueStatus, IssueType, IssuePriority, IssueResolution, canDeleteIssue, canManageIssues } from "@/types";
import { ISSUE_STATUS_CONFIG, TypeBadge } from "./IssueBadge";
import { useUser } from "./UserContext";
import { getUserInitials } from "./UserManageModal";
import { parseDbTimestamp, getTodayDateString, formatDueDateDisplay } from "@/lib/dateUtils";
import { DatePicker } from "./DatePicker";
import CommentPreviewBadge from "./CommentPreviewBadge";
import { getIssueAlert } from "@/lib/issueAlerts";
import IssueAlertBadge from "./IssueAlertBadge";
import { calculateAssigneeCounts } from "@/lib/assigneeUtils";

interface IssueListProps {
  issues: Issue[];
  selectedStatus: IssueStatus | "all";
  onSelectStatus?: (status: IssueStatus | "all") => void;
  onSelectIssue: (issue: Issue) => void;
  onUpdateType?: (issueId: number, type: IssueType) => void;
  onUpdateStatus: (issueId: number, status: IssueStatus) => void;
  onUpdateAssignee?: (issueId: number, assigneeId: number | null) => void;
  onUpdatePriority?: (issueId: number, priority: IssuePriority) => void;
  onUpdateResolution?: (issueId: number, resolution: IssueResolution | null) => void;
  onUpdateDueDate?: (issueId: number, dueDate: string | null) => void;
  onDeleteIssue: (issueId: number) => void;
  isLoading?: boolean;
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
  isLoading = false,
}: IssueListProps) {
  const { users, currentUser, settings } = useUser();

  const [searchQuery, setSearchQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all"); // "all" | "me" | "unassigned" | userId文字列
  // クイック表示モード（none: 通常, today: 今日のマイタスク, review: レビュー待ち, stalled: 要フォロー）
  const [quickView, setQuickView] = useState<"none" | "today" | "review" | "stalled">("none");
  const [typeFilter, setTypeFilter] = useState<IssueType | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | "all">("all");
  const [resolutionFilter, setResolutionFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"due" | "updated" | "priority">("due");
  // 親子階層表示（ツリー構造）フラグ（デフォルトON）
  const [withParentRelation, setWithParentRelation] = useState<boolean>(true);
  // ダッシュボードでは完了済み（closed）のタスクはデフォルトで非表示
  const [showClosed, setShowClosed] = useState(false);
  // 1ページの表示件数（デフォルト25件、0は全件）
  const [pageSize, setPageSize] = useState<number>(25);
  // 現在のページ番号（1始まり）
  const [currentPage, setCurrentPage] = useState<number>(1);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // フィルター・ソート条件またはページサイズが変更されたらページを1に戻す
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    assigneeFilter,
    quickView,
    typeFilter,
    priorityFilter,
    resolutionFilter,
    sortBy,
    withParentRelation,
    selectedStatus,
    showClosed,
    pageSize,
  ]);

  // PMO / Admin 権限判定（進行管理権限または管理者権限）
  const isPmoOrAdmin = canManageIssues(currentUser);

  // 「完了」ステータスカードが明示的に選択されている場合、または「完了を表示」トグルがONの場合は完了課題を表示
  const isShowingClosed = selectedStatus === "closed" || showClosed;

  // 今日の日付文字列（タイムゾーン考慮）
  const todayStr = useMemo(() => getTodayDateString(settings), [settings]);

  // 「今日のマイタスク」件数（未完了 × 進行中 or 今日以前締切・遅延）
  const todayMyIssuesCount = useMemo(() => {
    if (!currentUser) return 0;
    return issues.filter((i) => {
      if (i.assignee_id !== currentUser.id) return false;
      if (i.status === "closed") return false;
      const isUrgentDue = Boolean(i.due_date && i.due_date <= todayStr);
      const isInProgress = i.status === "in_progress";
      return isUrgentDue || isInProgress;
    }).length;
  }, [issues, currentUser, todayStr]);

  // 「レビュー待ち」件数（一般メンバーからのレビュー依頼＝処理済み課題）
  const reviewIssuesCount = useMemo(() => {
    return issues.filter((i) => i.status === "resolved").length;
  }, [issues]);

  // 「要フォロー」件数（停滞・遅延・未着手などのアラート対象課題）
  const stalledIssuesCount = useMemo(() => {
    return issues.filter((i) => {
      if (i.status === "closed") return false;
      return Boolean(getIssueAlert(i, settings));
    }).length;
  }, [issues, settings]);

  // 担当者フィルター選択肢用の件数集計（完了表示設定およびステータス選択を反映したベース課題群から算出）
  const assigneeCounts = useMemo(() => {
    const baseIssues = issues.filter((issue) => {
      if (selectedStatus !== "all" && issue.status !== selectedStatus) return false;
      if (!isShowingClosed && issue.status === "closed") return false;
      return true;
    });
    return calculateAssigneeCounts(baseIssues, currentUser?.id);
  }, [issues, selectedStatus, isShowingClosed, currentUser?.id]);

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
    const formattedDate = formatDueDateDisplay(dateStr);

    if (diffDays < 0) {
      return {
        text: `${formattedDate} (${Math.abs(diffDays)}日超過)`,
        isOverdue: true,
        isToday: false,
        diffDays: Math.abs(diffDays),
      };
    } else if (diffDays === 0) {
      return {
        text: `${formattedDate} (本日)`,
        isOverdue: false,
        isToday: true,
        diffDays: 0,
      };
    } else if (diffDays === 1) {
      return {
        text: `${formattedDate} (明日)`,
        isOverdue: false,
        isToday: false,
        diffDays: 1,
      };
    } else {
      return {
        text: `${formattedDate} (残${diffDays}日)`,
        isOverdue: false,
        isToday: false,
        diffDays: diffDays,
      };
    }
  };

  // フィルタリング処理
  const filteredIssues = issues.filter((issue) => {
    if (quickView === "today") {
      // 今日のマイタスク集中表示時：自分の担当 × 未完了 ×（期限切れ or 本日締切 or 進行中）に特化
      if (!currentUser || issue.assignee_id !== currentUser.id) return false;
      if (issue.status === "closed") return false;
      const isUrgentDue = Boolean(issue.due_date && issue.due_date <= todayStr);
      const isInProgress = issue.status === "in_progress";
      if (!isUrgentDue && !isInProgress) return false;
    } else if (quickView === "review") {
      // レビュー待ちモード（PMO/Admin用：一般メンバーからレビュー依頼が出ている処理済み課題）
      if (issue.status !== "resolved") return false;
    } else if (quickView === "stalled") {
      // 要フォローモード（PMO/Admin用：停滞・遅延・未着手などのアラート対象課題）
      if (issue.status === "closed") return false;
      if (!getIssueAlert(issue, settings)) return false;
    } else {
      // 通常時：ステータスフィルター
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

  // ページネーション計算
  const totalItems = displayedIssues.length;
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));

  // フィルター変更等で総ページ数が減った場合の自動補正
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // 現在のページに表示する課題のスライス
  const paginatedIssues = useMemo(() => {
    if (pageSize === 0) return displayedIssues;
    const startIndex = (currentPage - 1) * pageSize;
    return displayedIssues.slice(startIndex, startIndex + pageSize);
  }, [displayedIssues, currentPage, pageSize]);

  // 表示中範囲のインデックス
  const startIndex = totalItems === 0 ? 0 : pageSize === 0 ? 1 : (currentPage - 1) * pageSize + 1;
  const endIndex = pageSize === 0 ? totalItems : Math.min(currentPage * pageSize, totalItems);

  // ページ変更ハンドラー（スムーズスクロール対応）
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;
    setCurrentPage(newPage);
    listContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ページ番号ボタングループ生成
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) {
        pages.push("...");
      }
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) {
        pages.push("...");
      }
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div ref={listContainerRef} className="bg-white/95 backdrop-blur-xs rounded-xl shadow-xs border border-indigo-100/80 overflow-hidden">
      {/* リストヘッダー & フィルターコントロール */}
      <div className="issue-list-header p-4 border-b border-slate-200/80 bg-gradient-to-r from-indigo-50/40 via-white to-violet-50/40 flex flex-wrap items-center justify-between gap-3">
        {/* タイトル・クイック切替タブ（すべて / 自分の担当 / 今日のマイタスク / [PMO] レビュー待ち / [PMO] 要フォロー） */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-1.5">
              {quickView === "today" ? (
                <>
                  <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span>{currentUser ? `${currentUser.name} の今日のマイタスク` : "今日のマイタスク"}</span>
                </>
              ) : quickView === "review" ? (
                <>
                  <ClipboardCheck className="w-4 h-4 text-violet-600" />
                  <span>レビュー待ち課題（承認待ち）</span>
                </>
              ) : quickView === "stalled" ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <span>要フォロー・停滞課題</span>
                </>
              ) : assigneeFilter === "me" && currentUser ? (
                `${currentUser.name} の担当課題`
              ) : (
                "課題一覧"
              )}
            </h3>
            {quickView === "today" && (
              <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                遅延・本日締切・進行中
              </span>
            )}
            {quickView === "review" && (
              <span className="text-[11px] font-semibold text-violet-800 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">
                処理済み・検収待ち
              </span>
            )}
            {quickView === "stalled" && (
              <span className="text-[11px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                停滞・遅延・未着手
              </span>
            )}
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
              {pageSize === 0 || totalItems <= pageSize
                ? `${totalItems} 件`
                : `${startIndex} - ${endIndex} / ${totalItems} 件`}
            </span>
          </div>

          {/* ワンクリック切替ピル（全員 / 自分の担当 / 今日のマイタスク / [PMO限定] レビュー待ち / [PMO限定] 要フォロー） */}
          <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg text-xs flex-wrap gap-0.5">
            <button
              type="button"
              onClick={() => {
                setAssigneeFilter("all");
                setQuickView("none");
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                assigneeFilter === "all" && quickView === "none"
                  ? "bg-white text-indigo-800 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>全員</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAssigneeFilter("me");
                setQuickView("none");
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                assigneeFilter === "me" && quickView === "none"
                  ? "bg-white text-indigo-800 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>自分の担当 ({myIssuesCount})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAssigneeFilter("me");
                setQuickView("today");
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                quickView === "today"
                  ? "bg-amber-500 text-white shadow-2xs"
                  : "text-amber-700 hover:text-amber-900 hover:bg-amber-100/50"
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${quickView === "today" ? "fill-white text-white" : "fill-amber-500 text-amber-500"}`} />
              <span>今日のマイタスク ({todayMyIssuesCount})</span>
            </button>

            {/* PMO / Admin 限定ピル */}
            {isPmoOrAdmin && (
              <>
                <div className="w-px h-3.5 bg-slate-300 mx-0.5" />
                <button
                  type="button"
                  onClick={() => setQuickView("review")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    quickView === "review"
                      ? "bg-violet-600 text-white shadow-2xs"
                      : "text-violet-700 hover:text-violet-900 hover:bg-violet-100/50"
                  }`}
                  title="一般メンバーからレビュー依頼が出ている処理済み課題"
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  <span>レビュー待ち ({reviewIssuesCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQuickView("stalled")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    quickView === "stalled"
                      ? "bg-rose-600 text-white shadow-2xs"
                      : "text-rose-700 hover:text-rose-900 hover:bg-rose-100/50"
                  }`}
                  title="停滞中・期限超過・未着手などのフォローが必要な課題"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>要フォロー ({stalledIssuesCount})</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* 検索・絞り込みフォーム（スマートフォン幅では非表示） */}
        <div className="hidden md:flex flex-wrap items-center gap-2 text-sm w-full sm:w-auto">
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
            onChange={(e) => {
              setAssigneeFilter(e.target.value);
              setQuickView("none");
            }}
            className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">担当者: すべて ({assigneeCounts.totalCount}件)</option>
            {currentUser && (
              <option value="me">
                担当者: 自分 ({currentUser.name}) ({assigneeCounts.myCount}件)
              </option>
            )}
            <option value="unassigned">
              担当者: 未割当 ({assigneeCounts.unassignedCount}件)
            </option>
            {users.map((u) => (
              <option key={u.id} value={String(u.id)}>
                担当者: {u.name} ({assigneeCounts.userCountMap[u.id] || 0}件)
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

          {/* 完了済み課題の表示切り替えトグル（弾性スプリング＆チェックポップ） */}
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
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer spring-bounce ${
              isShowingClosed
                ? "bg-indigo-50 text-indigo-800 border-indigo-300 font-bold shadow-2xs scale-[1.02]"
                : "bg-white text-slate-500 border-slate-300 hover:bg-slate-50 hover:border-slate-400"
            }`}
            title="完了した課題の表示/非表示を切り替えます"
          >
            <CheckCircle2
              className={`w-3.5 h-3.5 transition-transform ${
                isShowingClosed ? "text-indigo-600 animate-check-pop" : "text-slate-400"
              }`}
            />
            <span>完了を含む</span>
          </button>

          {/* 1ページ表示件数セレクタ */}
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            title="1ページあたりの表示件数を切り替えます"
          >
            <option value={25}>25件 / 頁</option>
            <option value={50}>50件 / 頁</option>
            <option value={100}>100件 / 頁</option>
            <option value={0}>全件表示</option>
          </select>
        </div>
      </div>

      {/* スマホ・iPhone用 課題一覧リスト（SummaryCardsと同様のブロック構造ではみ出し・横スクロールを完全排除） */}
      <div className="md:hidden divide-y divide-slate-100">
        {isLoading ? (
          <div className="py-12 text-center text-slate-400">
            <div className="flex flex-col items-center justify-center gap-2 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-slate-200" />
              <div className="h-4 w-32 bg-slate-200 rounded" />
            </div>
          </div>
        ) : displayedIssues.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <div className="flex flex-col items-center justify-center gap-2">
              {quickView === "today" ? (
                <>
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p className="text-sm font-semibold text-slate-700">今日のマイタスクはありません</p>
                  <p className="text-xs text-slate-400">現在、至急対応が必要なタスクや進行中のタスクはありません。順調です！</p>
                </>
              ) : quickView === "review" ? (
                <>
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p className="text-sm font-semibold text-slate-700">レビュー待ちの課題はありません</p>
                  <p className="text-xs text-slate-400">すべての作業完了レビューが完了しています！✨</p>
                </>
              ) : quickView === "stalled" ? (
                <>
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p className="text-sm font-semibold text-slate-700">要フォローの課題はありません</p>
                  <p className="text-xs text-slate-400">停滞・遅延している課題はなく、プロジェクトは順調に進行しています！✨</p>
                </>
              ) : (
                <>
                  <Filter className="w-8 h-8 text-slate-300" />
                  <p className="text-sm font-medium">該当する課題が見つかりません</p>
                  <p className="text-xs text-slate-400">フィルター条件を変更するか、「課題の追加」から新しいタスクを登録してください。</p>
                </>
              )}
            </div>
          </div>
        ) : (
          paginatedIssues.map(({ issue, depth }, index) => {
            const dueInfo = formatDueDate(issue.due_date);
            const isClosed = issue.status === "closed";
            const issueAlert = getIssueAlert(issue, settings);

            // 親子判定
            const isChild = Boolean(issue.parent_id);
            const childrenOfThis = issues.filter((child) => child.parent_id === issue.id);
            const isParent = childrenOfThis.length > 0;

            // 左端ボーダーおよび行の背景色
            const borderClass = isClosed
              ? "border-l-4 border-transparent"
              : issueAlert?.level === "critical"
              ? "border-l-4 border-rose-500 bg-rose-50/20"
              : issueAlert?.level === "warning"
              ? "border-l-4 border-amber-500 bg-amber-50/20"
              : issueAlert?.level === "caution"
              ? "border-l-4 border-purple-500 bg-purple-50/15"
              : isParent
              ? "border-l-4 border-indigo-600 bg-indigo-50/30"
              : isChild
              ? "border-l-4 border-indigo-200/50 bg-white"
              : "border-l-4 border-transparent";

            return (
              <div
                key={`mobile-${issue.id}`}
                className={`p-3 transition-colors ${
                  isClosed
                    ? "bg-slate-50/60 text-slate-400"
                    : isParent && !issueAlert
                    ? "bg-indigo-50/30"
                    : isChild && !issueAlert
                    ? "bg-white"
                    : !issueAlert
                    ? "hover:bg-indigo-50/40"
                    : ""
                } ${borderClass} ${depth > 0 ? "pl-5" : ""}`}
              >
                {/* 上段メタ行: キー、子課題アイコン、種別、アラートバッジ、優先度高、期日 */}
                <div className="flex items-center gap-1.5 flex-wrap text-xs mb-1.5">
                  {depth > 0 && (
                    <CornerDownRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  )}
                  <span className="font-mono font-bold text-indigo-600">
                    {issue.issue_key}
                  </span>
                  {depth > 0 && issue.parent_id && (
                    (() => {
                      const parentIssue = issues.find((i) => i.id === issue.parent_id);
                      return parentIssue ? (
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
                      ) : null;
                    })()
                  )}
                  <div className="shrink-0">
                    <TypeBadge type={issue.issue_type} showLabel={false} />
                  </div>
                  {issueAlert && (
                    <div className="shrink-0">
                      <IssueAlertBadge alert={issueAlert} size="sm" />
                    </div>
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
                </div>

                {/* 中段: 件名タイトル（SummaryCardsと同様に枠幅100%を使い、枠幅の中で自然に美しく折り返し） */}
                <div className="w-full mb-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectIssue(issue)}
                    className={`text-left font-bold text-sm hover:text-indigo-600 transition-colors cursor-pointer w-full break-words break-all [overflow-wrap:anywhere] leading-snug ${
                      isClosed
                        ? "text-slate-400 line-through"
                        : "text-slate-900"
                    }`}
                  >
                    {issue.title}
                  </button>
                </div>

                {/* 下段: 担当者情報、コメント数バッジ、添付ファイルバッジ */}
                <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
                  <span className="truncate">
                    担当: <strong className="text-slate-700 font-medium">{issue.assignee_name || "未割当"}</strong>
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

      {/* PC・タブレット用 課題一覧テーブル */}
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
              <th className="py-2.5 px-2 w-10 text-center"></th>
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
            ) : displayedIssues.length === 0 ? (
              <tr>
                <td colSpan={isShowingClosed ? 9 : 8} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    {quickView === "today" ? (
                      <>
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        <p className="text-sm font-semibold text-slate-700">今日のマイタスクはありません</p>
                        <p className="text-xs text-slate-400">現在、至急対応が必要なタスクや進行中のタスクはありません。順調です！</p>
                      </>
                    ) : quickView === "review" ? (
                      <>
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        <p className="text-sm font-semibold text-slate-700">レビュー待ちの課題はありません</p>
                        <p className="text-xs text-slate-400">すべての作業完了レビューが完了しています！✨</p>
                      </>
                    ) : quickView === "stalled" ? (
                      <>
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        <p className="text-sm font-semibold text-slate-700">要フォローの課題はありません</p>
                        <p className="text-xs text-slate-400">停滞・遅延している課題はなく、プロジェクトは順調に進行しています！✨</p>
                      </>
                    ) : (
                      <>
                        <Filter className="w-8 h-8 text-slate-300" />
                        <p className="text-sm font-medium">該当する課題が見つかりません</p>
                        <p className="text-xs text-slate-400">フィルター条件を変更するか、「課題の追加」から新しいタスクを登録してください。</p>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedIssues.map(({ issue, depth }, index) => {
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
                    {/* 種別 */}
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
                        {depth > 0 && issue.parent_id && (
                          (() => {
                            const parentIssue = issues.find((i) => i.id === issue.parent_id);
                            return parentIssue ? (
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
                            ) : null;
                          })()
                        )}
                      </div>
                    </td>

                    {/* 件名 */}
                    <td className="py-2.5 md:py-3 px-3 min-w-[240px]">
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

                    {/* 担当者（PC・タブレットのみ表示） */}
                    <td className="hidden md:table-cell py-3 px-3 whitespace-nowrap">
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

                    {/* 状態（セレクトボックスで直接変更可能、スマホ・iPhoneでは件名表示を最大化するため非表示） */}
                    <td className="hidden md:table-cell py-3 px-3 whitespace-nowrap text-left">
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

                    {/* 完了理由（PC・タブレットで完了課題が表示されている時のみ列を表示） */}
                    {isShowingClosed && (
                      <td className="hidden md:table-cell py-3 px-3 whitespace-nowrap">
                        {issue.status === "closed" ? (
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

                    {/* 優先度（PC・タブレットのみ表示） */}
                    <td className="hidden md:table-cell py-3 px-3 whitespace-nowrap text-center">
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

                    {/* 期限日（PC・タブレットのみ独立列として表示） */}
                    <td className="hidden md:table-cell py-3 px-3 whitespace-nowrap text-sm">
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

                    {/* 操作（削除：PC・タブレットのみ表示、作成者または管理者のみ） */}
                    <td className="hidden md:table-cell py-3 px-2 text-center whitespace-nowrap">
                      {canDeleteIssue(currentUser, issue) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`課題 [${issue.issue_key}] 「${issue.title}」を削除してもよろしいですか？`)) {
                              onDeleteIssue(issue.id);
                            }
                          }}
                          title="課題を削除（作成者または管理者のみ）"
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded transition-all cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ページネーションフッターバー */}
      <div className="px-4 py-3 border-t border-slate-200/80 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
        {/* 件数表示 ＆ 1ページの件数セレクタ */}
        <div className="flex flex-wrap items-center gap-3 text-slate-600 text-xs sm:text-sm">
          <span>
            {totalItems === 0 ? (
              "0 件"
            ) : (
              <>
                <strong className="text-slate-800 font-semibold">{totalItems}</strong> 件中{" "}
                <strong className="text-slate-800 font-semibold">{startIndex}</strong> -{" "}
                <strong className="text-slate-800 font-semibold">{endIndex}</strong> 件を表示
              </>
            )}
          </span>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400">表示件数:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-700 font-medium focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value={25}>25件</option>
              <option value={50}>50件</option>
              <option value={100}>100件</option>
              <option value={0}>全件</option>
            </select>
          </div>
        </div>

        {/* ページネーションボタン群 */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => handlePageChange(currentPage - 1)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              title="前のページへ"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">前へ</span>
            </button>

            <div className="flex items-center gap-1">
              {getPageNumbers().map((p, idx) => {
                if (p === "...") {
                  return (
                    <span key={`ellipsis-${idx}`} className="px-1.5 py-1 text-xs text-slate-400 select-none">
                      …
                    </span>
                  );
                }
                const isCurrent = p === currentPage;
                return (
                  <button
                    key={`page-${p}`}
                    type="button"
                    onClick={() => handlePageChange(p)}
                    className={`min-w-[28px] h-7 px-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      isCurrent
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              title="次のページへ"
            >
              <span className="hidden sm:inline">次へ</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
