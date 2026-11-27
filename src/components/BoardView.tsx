// Backlog風かんばんボード（Board）コンポーネント
"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Plus,
  Search,
  Calendar,
  AlertCircle,
  Clock,
  CornerDownRight,
  Paperclip,
  Archive,
  Pin,
} from "lucide-react";
import { Project, Issue, IssueStatus, IssueType, IssuePriority, IssueResolution, RESOLUTION_LABELS, isArchivedProject, canManageIssues } from "@/types";
import { createApiError } from "@/lib/clientError";
import { TypeBadge, PriorityBadge, ResolutionBadge } from "./IssueBadge";
import CreateIssueModal from "./CreateIssueModal";
import IssueDetailModal from "./IssueDetailModal";
import ReviewRequestModal from "./ReviewRequestModal";
import CompleteIssueModal from "./CompleteIssueModal";
import { useUser } from "./UserContext";
import { getUserInitials } from "./UserManageModal";
import CommentPreviewBadge from "./CommentPreviewBadge";
import { notifyNotificationsUpdated, showToast } from "@/lib/clientEvents";
import { calculateAssigneeCounts } from "@/lib/assigneeUtils";
import { formatDueDateDisplay } from "@/lib/dateUtils";

interface BoardViewProps {
  projects: Project[];
  currentProject: Project | null;
  issues: Issue[];
  onUpdateStatus: (issueId: number, newStatus: IssueStatus, resolution?: IssueResolution | null) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSelectProjectKey?: (key: string) => void;
}

// 4つのBacklog標準ステータス定義
const BOARD_COLUMNS: {
  status: IssueStatus;
  title: string;
  badgeBg: string;
  badgeText: string;
  headerBorder: string;
}[] = [
  {
    status: "open",
    title: "未対応",
    badgeBg: "bg-rose-100",
    badgeText: "text-rose-700",
    headerBorder: "border-t-rose-500",
  },
  {
    status: "in_progress",
    title: "処理中",
    badgeBg: "bg-sky-100",
    badgeText: "text-sky-700",
    headerBorder: "border-t-sky-500",
  },
  {
    status: "resolved",
    title: "処理済み",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
    headerBorder: "border-t-violet-500",
  },
  {
    status: "closed",
    title: "完了",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-600",
    headerBorder: "border-t-slate-400",
  },
];

export default function BoardView({
  projects,
  currentProject,
  issues,
  onUpdateStatus,
  onRefresh,
  onSelectProjectKey,
}: BoardViewProps) {
  const { users, currentUser } = useUser();

  // フィルター用State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterType, setFilterType] = useState<IssueType | "all">("all");
  const [filterPriority, setFilterPriority] = useState<IssuePriority | "all">("all");

  // 全課題における親・子の関連マップを事前構築
  const { parentMap, childrenMap } = useMemo(() => {
    const pMap = new Map<number, Issue>();
    const cMap = new Map<number, Issue[]>();
    issues.forEach((issue) => {
      pMap.set(issue.id, issue);
      if (issue.parent_id) {
        const list = cMap.get(issue.parent_id) || [];
        list.push(issue);
        cMap.set(issue.parent_id, list);
      }
    });
    return { parentMap: pMap, childrenMap: cMap };
  }, [issues]);

  // ドラッグ＆ドロップ用State
  const [draggingIssueId, setDraggingIssueId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<IssueStatus | null>(null);
  // ピン留め更新中の課題ID（連打防止）
  const [pinningIssueId, setPinningIssueId] = useState<number | null>(null);

  // 課題の個人別ピン留めトグル
  const handleTogglePin = async (e: React.MouseEvent, issue: Issue) => {
    e.stopPropagation();
    if (!currentUser || issue.status === "closed" || pinningIssueId !== null) return;
    const nextPinned = !Boolean(issue.is_pinned);
    try {
      setPinningIssueId(issue.id);
      const res = await fetch(`/api/issues/${issue.id}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: nextPinned }),
      });
      if (!res.ok) {
        throw await createApiError(res, "ピン留めの更新に失敗しました");
      }
      await onRefresh();
    } catch (err) {
      console.error("ピン留め更新エラー:", err);
      showToast({
        message: "ピン留めの更新に失敗しました",
        type: "error",
      });
    } finally {
      setPinningIssueId(null);
    }
  };

  // モーダル用State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInitialStatus, setCreateInitialStatus] = useState<IssueStatus>("open");
  const [detailIssue, setDetailIssue] = useState<Issue | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [reviewTargetIssue, setReviewTargetIssue] = useState<Issue | null>(null);
  const [completeTargetIssue, setCompleteTargetIssue] = useState<Issue | null>(null);

  // ツールバー高さを測定し、レーンヘッダーのsticky topやカード一覧のmax-hを動的調整
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(115);

  useEffect(() => {
    const updateHeight = () => {
      if (toolbarRef.current) {
        setToolbarHeight(toolbarRef.current.offsetHeight);
      }
    };
    updateHeight();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && toolbarRef.current) {
      ro = new ResizeObserver(updateHeight);
      ro.observe(toolbarRef.current);
    }
    window.addEventListener("resize", updateHeight);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  // 課題のドラッグ開始
  const handleDragStart = (e: React.DragEvent, issueId: number) => {
    e.dataTransfer.setData("text/plain", String(issueId));
    e.dataTransfer.effectAllowed = "move";
    setDraggingIssueId(issueId);
  };

  // ドラッグ終了
  const handleDragEnd = () => {
    setDraggingIssueId(null);
    setDragOverColumn(null);
  };

  // レーン上のドラッグ中
  const handleDragOver = (e: React.DragEvent, status: IssueStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  // レーンからドラッグが外れた
  const handleDragLeave = (e: React.DragEvent, status: IssueStatus) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (dragOverColumn === status) {
      setDragOverColumn(null);
    }
  };

  // ドロップ時のステータス更新
  const handleDrop = async (e: React.DragEvent, newStatus: IssueStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (isArchived) return;
    const issueIdStr = e.dataTransfer.getData("text/plain");
    const issueId = Number(issueIdStr) || draggingIssueId;

    if (!issueId) return;

    const targetIssue = issues.find((i) => i.id === issueId);
    if (!targetIssue || targetIssue.status === newStatus) {
      setDraggingIssueId(null);
      return;
    }

    // 完了レーンへ移動できるのは起票者・PMO・または管理者のみ（セルフ完了・クローズ防止）
    if (newStatus === "closed") {
      const canClose = Boolean(
        canManageIssues(currentUser) ||
        (targetIssue.created_by && currentUser?.id === targetIssue.created_by)
      );
      if (!canClose) {
        alert("課題を完了にできるのは、課題の作成者・PMO・または管理者のみです。\n作業が完了した場合は「処理済み」へ移動してレビューを依頼してください。");
        setDraggingIssueId(null);
        return;
      }

      // 未完了の子課題が存在する場合、親課題を完了レーンへ移動できないように制御
      const unclosedChildren = issues.filter(
        (i) => i.parent_id === issueId && i.status !== "closed"
      );
      if (unclosedChildren.length > 0) {
        alert(`未完了の子課題が ${unclosedChildren.length} 件存在するため、親課題を完了にすることはできません。`);
        setDraggingIssueId(null);
        return;
      }
    }

    // 処理済みレーンへの移動時は、こっそり処理済み放置を防ぐためレビュー依頼モーダルを起動（管理者AdminおよびPMOはスキップして即時更新）
    if (newStatus === "resolved" && !canManageIssues(currentUser)) {
      setReviewTargetIssue(targetIssue);
      setDraggingIssueId(null);
      return;
    }

    // 完了レーンへの移動時は、完了理由選択モーダルを起動
    if (newStatus === "closed") {
      setCompleteTargetIssue(targetIssue);
      setDraggingIssueId(null);
      return;
    }

    setDraggingIssueId(null);
    await onUpdateStatus(issueId, newStatus);
  };

  // レビュー・確認依頼モーダル経由での処理済みステータス更新
  const handleReviewRequestSubmit = async (data: {
    reviewerId: number;
    changeAssignee: boolean;
    comment: string;
  }) => {
    if (!reviewTargetIssue) return;
    const res = await fetch(`/api/issues/${reviewTargetIssue.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: data.comment,
        status: "resolved",
        resolution: null,
        ...(data.changeAssignee ? { assigneeId: data.reviewerId } : {}),
      }),
    });
    if (!res.ok) {
      throw await createApiError(res, "レビュー依頼の送信に失敗しました");
    }
    setReviewTargetIssue(null);
    await onRefresh();
    notifyNotificationsUpdated();
  };

  // 各ステータスレーンへの新規追加モーダル表示
  const handleOpenCreateWithStatus = (status: IssueStatus) => {
    setCreateInitialStatus(status);
    setIsCreateOpen(true);
  };

  // 期限日の判定関数
  const getDueInfo = (dueDateStr: string | null, isClosed: boolean) => {
    if (!dueDateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    // 期日の表記を YYYY/MM/DD 形式（例: 2026/11/24）に統一して表示
    const formattedDate = formatDueDateDisplay(dueDateStr);

    if (isClosed) {
      return {
        label: formattedDate,
        fullDate: formattedDate,
        color: "text-slate-500 whitespace-nowrap",
        isOverdue: false,
        isToday: false,
      };
    }

    if (diffDays < 0) {
      return {
        label: `${formattedDate} (${Math.abs(diffDays)}日超過)`,
        fullDate: `${formattedDate} (${Math.abs(diffDays)}日超過)`,
        color: "text-rose-600 font-semibold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 whitespace-nowrap",
        isOverdue: true,
        isToday: false,
      };
    }
    if (diffDays === 0) {
      return {
        label: `${formattedDate} (今日)`,
        fullDate: `${formattedDate} (今日期限)`,
        color: "text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 whitespace-nowrap",
        isOverdue: false,
        isToday: true,
      };
    }
    return {
      label: formattedDate,
      fullDate: formattedDate,
      color: "text-slate-600 whitespace-nowrap",
      isOverdue: false,
      isToday: false,
    };
  };

  // 担当者フィルター選択肢用の件数集計
  const assigneeCounts = useMemo(() => {
    return calculateAssigneeCounts(issues, currentUser?.id);
  }, [issues, currentUser?.id]);

  // フィルター後の課題一覧
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      // 担当者フィルター
      if (filterAssignee === "me") {
        if (!currentUser || issue.assignee_id !== currentUser.id) return false;
      } else if (filterAssignee === "unassigned") {
        if (issue.assignee_id !== null && issue.assignee_id !== undefined) return false;
      } else if (filterAssignee !== "all") {
        if (issue.assignee_id !== Number(filterAssignee)) return false;
      }

      // 種別フィルター
      if (filterType !== "all" && issue.issue_type !== filterType) return false;

      // 優先度フィルター
      if (filterPriority !== "all" && issue.priority !== filterPriority) return false;

      // キーワード検索（課題キー、件名、説明文、担当者名）
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const inKey = issue.issue_key.toLowerCase().includes(query);
        const inTitle = issue.title.toLowerCase().includes(query);
        const inDesc = (issue.description || "").toLowerCase().includes(query);
        const inAssignee = (issue.assignee_name || "").toLowerCase().includes(query);
        if (!inKey && !inTitle && !inDesc && !inAssignee) return false;
      }

      return true;
    });
  }, [
    issues,
    filterAssignee,
    currentUser,
    filterType,
    filterPriority,
    searchQuery,
  ]);

  // レーン列ごとに個人ピン留め優先 ＆ 親子関係を考慮して並べ替えた課題マップ（親課題の直下に同列内の子課題を連ねる）
  const columnIssuesMap = useMemo(() => {
    const map = new Map<IssueStatus, Issue[]>();
    BOARD_COLUMNS.forEach((col) => {
      const rawList = filteredIssues.filter((i) => i.status === col.status);
      // 未完了列では個人ピン留め課題を最優先で先頭に並べる
      const list =
        col.status === "closed"
          ? rawList
          : [...rawList].sort((a, b) => {
              const aPinned = Boolean(a.is_pinned);
              const bPinned = Boolean(b.is_pinned);
              if (aPinned && !bPinned) return -1;
              if (!aPinned && bPinned) return 1;
              return 0;
            });
      const listIdSet = new Set(list.map((i) => i.id));
      const result: Issue[] = [];
      const addedSet = new Set<number>();

      list.forEach((item) => {
        if (addedSet.has(item.id)) return;
        // 親課題、または親がこの列に不在の課題を先に追加
        if (!item.parent_id || !listIdSet.has(item.parent_id)) {
          result.push(item);
          addedSet.add(item.id);
          // 同じ列にある子課題を親の直下にピン留め優先・連番順で配置
          const children = (childrenMap.get(item.id) || []).filter((c) => listIdSet.has(c.id));
          children.sort((a, b) => {
            if (col.status !== "closed") {
              const aPinned = Boolean(a.is_pinned);
              const bPinned = Boolean(b.is_pinned);
              if (aPinned && !bPinned) return -1;
              if (!aPinned && bPinned) return 1;
            }
            return a.issue_number - b.issue_number;
          });
          children.forEach((c) => {
            if (!addedSet.has(c.id)) {
              result.push(c);
              addedSet.add(c.id);
            }
          });
        }
      });

      // 残りの課題（親子が複雑な場合等のフォールバック）を追加
      list.forEach((item) => {
        if (!addedSet.has(item.id)) {
          result.push(item);
          addedSet.add(item.id);
        }
      });

      map.set(col.status, result);
    });
    return map;
  }, [filteredIssues, childrenMap]);

  const isArchived = isArchivedProject(currentProject);

  return (
    <div className="space-y-3">
      {/* アーカイブ済みプロジェクトのリードオンリー注意バナー */}
      {isArchived && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2.5 rounded-xl shadow-xs flex items-center gap-2 text-xs font-semibold animate-in fade-in duration-150">
          <Archive className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            このプロジェクトは<strong>アーカイブ</strong>されています。読み取り専用のため、カードの移動や課題の追加は行えません。
          </span>
        </div>
      )}

      {/* ボードヘッダー / フィルターツールバー（PC・タブレットでは画面スクロール時も上部に固定表示） */}
      <div
        ref={toolbarRef}
        className="md:sticky md:top-[var(--app-header-height,56px)] z-20 bg-white/95 backdrop-blur-md rounded-xl shadow-sm border border-indigo-100/80 p-3 sm:p-4 transition-shadow"
      >
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* 左側: プロジェクト情報（カラー・タイトル・キー・アーカイブバッジ・件数） */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-3.5 h-6 rounded-sm shrink-0"
              style={{ backgroundColor: currentProject?.color || "#4f46e5" }}
            />
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2 min-w-0">
              <span className="truncate">{currentProject ? currentProject.name : "すべてのプロジェクト"}</span>
              {currentProject && (
                <span className="text-xs sm:text-sm font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 shrink-0">
                  {currentProject.key}
                </span>
              )}
              {isArchived && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700 border border-slate-300 shrink-0">
                  <Archive className="w-3 h-3" />
                  <span>アーカイブ</span>
                </span>
              )}
            </h2>
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap shrink-0 hidden sm:inline ml-1">
              ({filteredIssues.length}件)
            </span>
          </div>

          {/* 右側: 検索・フィルターツールバー（横1行にスマートに整列） */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* 検索入力 */}
            <div className="relative min-w-[130px] flex-1 sm:flex-none sm:w-40 lg:w-44 xl:w-48">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="課題を検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-sm pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 担当者フィルター */}
            <select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              className="text-sm bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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

            {/* 種別フィルター */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as IssueType | "all")}
              className="text-sm bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">種別: すべて</option>
              <option value="task">タスク</option>
              <option value="bug">バグ</option>
              <option value="request">要望</option>
              <option value="other">その他</option>
            </select>

            {/* 優先度フィルター */}
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value as IssuePriority | "all")}
              className="text-sm bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">優先度: すべて</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>
        </div>
      </div>

      {/* かんばんボード 4カラムレーン */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {BOARD_COLUMNS.map((col) => {
          const columnIssues = columnIssuesMap.get(col.status) || [];
          const isOver = dragOverColumn === col.status;

          return (
            <div
              key={col.status}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={(e) => handleDragLeave(e, col.status)}
              onDrop={(e) => handleDrop(e, col.status)}
              className={`flex flex-col bg-slate-50/90 rounded-xl border-t-4 border border-indigo-100/80 md:min-h-[300px] transition-all duration-150 ${
                col.headerBorder
              } ${isOver ? "bg-indigo-50/70 ring-2 ring-indigo-500 border-indigo-400" : ""}`}
            >
              {/* レーンヘッダー（スクロール時もツールバー直下に留まりカラム見出しが隠れるのを防止） */}
              <div
                className="flex items-center justify-between p-3 border-b border-slate-200/80 bg-white rounded-t-lg sticky z-10 shadow-2xs"
                style={{
                  top: `calc(var(--app-header-height, 56px) + ${toolbarHeight + 12}px)`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-slate-800">{col.title}</span>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${col.badgeBg} ${col.badgeText}`}
                  >
                    {columnIssues.length}
                  </span>
                </div>
                <button
                  onClick={() => handleOpenCreateWithStatus(col.status)}
                  title={`${col.title} に課題を追加`}
                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>

              {/* カード一覧（スマホでは画面全体で自然にスクロールできるよう内部スクロール封じ込めを解除、PC・タブレットでは列別スクロール） */}
              <div
                className="p-2.5 space-y-2.5 flex-1 md:overflow-y-auto md:overscroll-y-contain"
                style={{
                  maxHeight: `calc(100vh - var(--app-header-height, 56px) - ${toolbarHeight + 90}px)`,
                }}
              >
                {columnIssues.length === 0 ? (
                  <div
                    className={`h-28 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-3 text-center transition-colors ${
                      isOver
                        ? "border-indigo-400 bg-indigo-100/30 text-indigo-700"
                        : "border-slate-300 text-slate-400"
                    }`}
                  >
                    <p className="text-sm">
                      {isOver ? "ここにドロップして移動" : "課題はありません"}
                    </p>
                  </div>
                ) : (
                  columnIssues.map((issue) => {
                    const isDragging = draggingIssueId === issue.id;
                    const isClosed = issue.status === "closed";
                    const isPinned = !isClosed && Boolean(issue.is_pinned);
                    const isPinningThis = pinningIssueId === issue.id;
                    const dueInfo = getDueInfo(issue.due_date, isClosed);

                    // 親子関係の判定
                    const children = childrenMap.get(issue.id) || [];
                    const isParent = children.length > 0;
                    const isChild = Boolean(issue.parent_id);
                    const completedChildrenCount = children.filter((c) => c.status === "closed").length;
                    const parentIssue = issue.parent_id ? parentMap.get(issue.parent_id) : null;

                    return (
                      <div
                        key={issue.id}
                        draggable={!isArchived}
                        onDragStart={(e) => !isArchived && handleDragStart(e, issue.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => {
                          setDetailIssue(issue);
                          setIsDetailOpen(true);
                        }}
                        className={`rounded-xl p-3 border shadow-xs hover:shadow-md transition-all ${
                          isArchived ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
                        } hover:border-indigo-400 group relative ${
                          isPinned
                            ? isParent
                              ? "bg-amber-50/45 border-l-4 border-l-indigo-600 border-amber-300/90 ring-1 ring-amber-200/70"
                              : isChild
                              ? "bg-amber-50/45 border-l-4 border-l-indigo-300 border-amber-300/90 ring-1 ring-amber-200/70"
                              : "bg-amber-50/45 border-l-4 border-l-amber-400 border-amber-300/90"
                            : isParent
                            ? "bg-white border-l-4 border-l-indigo-600 border-indigo-100/90 shadow-indigo-50/50"
                            : isChild
                            ? "bg-white border-l-4 border-l-indigo-300 border-slate-200/90"
                            : "bg-white border-slate-200/90 border-l-4 border-l-transparent"
                        } ${isDragging ? "opacity-40 scale-95 border-indigo-500 shadow-lg" : ""}`}
                      >
                        {/* カード上部: 種別バッジ＆課題キー（子課題の場合は 自身のキー ↳ 親キー の順で表示） */}
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <TypeBadge type={issue.issue_type} />
                            <ResolutionBadge resolution={issue.resolution} />
                            <div className="flex items-center gap-1 min-w-0 flex-wrap">
                              {/* 自身の課題キー */}
                              <a
                                href={`/issues/${issue.issue_key}`}
                                onClick={(e) => {
                                  if (!e.metaKey && !e.ctrlKey) {
                                    e.preventDefault();
                                    setDetailIssue(issue);
                                    setIsDetailOpen(true);
                                  }
                                }}
                                title={
                                  isChild
                                    ? `親課題: ${issue.parent_issue_key || parentIssue?.issue_key || ""} ${issue.parent_title || parentIssue?.title || ""}`
                                    : undefined
                                }
                                className="font-mono text-xs font-bold text-slate-700 group-hover:text-indigo-600 transition-colors hover:underline cursor-pointer truncate"
                              >
                                {issue.issue_key}
                              </a>

                              {/* 子課題の場合: ↳ 親課題キー */}
                              {isChild && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const p = parentIssue || issues.find((i) => i.id === issue.parent_id);
                                    if (p) {
                                      setDetailIssue(p);
                                      setIsDetailOpen(true);
                                    }
                                  }}
                                  className="inline-flex items-center gap-0.5 font-mono text-xs font-semibold text-slate-400 hover:text-indigo-600 hover:underline cursor-pointer truncate max-w-[130px] shrink-0"
                                  title={`親課題: ${issue.parent_issue_key || parentIssue?.issue_key || ""} ${issue.parent_title || parentIssue?.title || ""}`}
                                >
                                  <CornerDownRight className="w-3 h-3 text-indigo-500 shrink-0" />
                                  <span className="truncate">{issue.parent_issue_key || parentIssue?.issue_key}</span>
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {!isClosed && currentUser && (
                              <button
                                type="button"
                                draggable={false}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => handleTogglePin(e, issue)}
                                disabled={pinningIssueId !== null}
                                title={isPinned ? "ピン留めを解除" : "この列の上部にピン留め"}
                                aria-label={isPinned ? `${issue.issue_key}のピン留めを解除` : `${issue.issue_key}を上部にピン留め`}
                                aria-pressed={isPinned}
                                className={`p-1 rounded-md transition-all cursor-pointer disabled:opacity-50 spring-bounce hover:scale-115 active:scale-90 ${
                                  isPinned
                                    ? "text-amber-500 hover:text-amber-600 hover:bg-amber-100/70"
                                    : "text-slate-300 opacity-50 group-hover:opacity-100 hover:text-amber-500 hover:bg-amber-50"
                                } ${isPinningThis ? "animate-pulse" : ""}`}
                              >
                                <Pin className={`w-3.5 h-3.5 transition-transform ${isPinned ? "fill-amber-400 rotate-[-15deg] scale-110" : ""}`} />
                              </button>
                            )}
                            <PriorityBadge priority={issue.priority} />
                          </div>
                        </div>

                        {/* カード件名 */}
                        <h4 className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug mb-2 group-hover:text-indigo-900 transition-colors">
                          {issue.title}
                        </h4>

                        {/* カード下部: 期限日・担当者アバター */}
                        <div className="flex items-center justify-between gap-1.5 text-xs pt-2 border-t border-slate-100 text-slate-500">
                          {/* 期限日 ＆ コメントバッジ */}
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            {dueInfo ? (
                              <span
                                className={`flex items-center gap-1 shrink-0 ${dueInfo.color}`}
                                title={dueInfo.fullDate}
                              >
                                {dueInfo.isOverdue ? (
                                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                ) : dueInfo.isToday ? (
                                  <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                ) : (
                                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                )}
                                <span className="whitespace-nowrap">{dueInfo.label}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs shrink-0 whitespace-nowrap">期限日なし</span>
                            )}

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
                                  setDetailIssue(issue);
                                  setIsDetailOpen(true);
                                }}
                                placement="top"
                              />
                            )}

                            {/* 添付ファイル件数バッジ */}
                            {Boolean(issue.attachment_count && issue.attachment_count > 0) && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0"
                                title={`添付ファイル ${issue.attachment_count}件`}
                              >
                                <Paperclip className="w-3 h-3 text-slate-500 shrink-0" />
                                <span>{issue.attachment_count}</span>
                              </span>
                            )}
                          </div>

                          {/* 担当者アイコン・表示名 */}
                          <div
                            className="flex items-center gap-1 shrink-0 ml-auto"
                            title={issue.assignee_name ? `担当者: ${issue.assignee_name}` : "担当者: 未割当"}
                          >
                            <div
                              style={{
                                backgroundColor: issue.assignee_id
                                  ? issue.assignee_color || "#4f46e5"
                                  : "#cbd5e1",
                              }}
                              className="w-5.5 h-5.5 rounded-full text-white flex items-center justify-center text-[10px] font-bold shadow-2xs shrink-0"
                            >
                              {getUserInitials(issue.assignee_name)}
                            </div>
                            <span className="text-xs text-slate-600 font-medium max-w-[65px] truncate hidden 2xl:inline">
                              {issue.assignee_name || "未割当"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 新規課題追加モーダル */}
      <CreateIssueModal
        isOpen={isCreateOpen}
        projects={projects}
        selectedProjectId={currentProject?.id || null}
        defaultStatus={createInitialStatus}
        onClose={() => setIsCreateOpen(false)}
        onCreated={async () => {
          setIsCreateOpen(false);
          await onRefresh();
        }}
      />

      {/* 課題詳細・編集モーダル */}
      <IssueDetailModal
        isOpen={isDetailOpen}
        issue={detailIssue}
        onClose={() => {
          setIsDetailOpen(false);
          setDetailIssue(null);
        }}
        onUpdated={async () => {
          // モーダルを閉じずにボードの最新状態および詳細課題を同期更新
          await onRefresh();
          if (detailIssue) {
            try {
              const res = await fetch(`/api/issues/${detailIssue.id}`);
              if (res.ok) {
                const data = await res.json();
                if (data.issue) setDetailIssue(data.issue);
              }
            } catch (err) {
              console.error(err);
            }
          }
        }}
        onDeleted={async () => {
          await onRefresh();
          setIsDetailOpen(false);
          setDetailIssue(null);
        }}
        onSelectIssue={(issue) => setDetailIssue(issue)}
      />

      {/* レビュー・確認依頼モーダル（処理済みへのドロップ時ガード） */}
      {reviewTargetIssue && (
        <ReviewRequestModal
          isOpen={reviewTargetIssue !== null}
          issueKey={reviewTargetIssue.issue_key}
          issueTitle={reviewTargetIssue.title}
          reporterId={reviewTargetIssue.created_by}
          currentAssigneeId={reviewTargetIssue.assignee_id}
          users={users}
          currentUserId={currentUser?.id}
          onClose={() => setReviewTargetIssue(null)}
          onSubmit={handleReviewRequestSubmit}
        />
      )}

      {/* 課題完了時の完了理由選択モーダル（完了へのドロップ時） */}
      {completeTargetIssue && (
        <CompleteIssueModal
          isOpen={completeTargetIssue !== null}
          issueKey={completeTargetIssue.issue_key}
          issueTitle={completeTargetIssue.title}
          onClose={() => setCompleteTargetIssue(null)}
          onConfirm={async (resolution) => {
            const target = completeTargetIssue;
            const previousStatus = target.status;
            const previousResolution = target.resolution ?? null;
            setCompleteTargetIssue(null);
            await onUpdateStatus(target.id, "closed", resolution);

            const resolutionLabel = resolution ? RESOLUTION_LABELS[resolution] || resolution : "理由なし";
            showToast({
              message: `${target.issue_key} を完了にしました（${resolutionLabel}）`,
              type: "success",
              action: {
                label: "元に戻す",
                onClick: async () => {
                  await onUpdateStatus(target.id, previousStatus, previousResolution);
                  showToast({
                    message: `${target.issue_key} の完了を取り消しました`,
                    type: "info",
                  });
                },
              },
            });
          }}
        />
      )}
    </div>
  );
}
