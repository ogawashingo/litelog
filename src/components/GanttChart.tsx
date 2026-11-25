// Backlog仕様準拠 ガントチャートコンポーネント
// URLクエリパラメータ（span, scale, startDate, withParentRelation）との双方向同期および親子課題ツリー表示対応
"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { Archive, LayoutDashboard, Kanban } from "lucide-react";
import {
  Project,
  Issue,
  IssueStatus,
  IssueType,
  IssuePriority,
  isArchivedProject,
  canManageIssues,
} from "@/types";
import IssueDetailModal from "./IssueDetailModal";
import CreateIssueModal from "./CreateIssueModal";
import ReviewRequestModal from "./ReviewRequestModal";
import ParentDueDateConfirmModal, {
  ParentDueDateWarningInfo,
  isExceedingParentDueDate,
} from "./ParentDueDateConfirmModal";
import { useUser } from "./UserContext";
import {
  parseDateString,
  formatDateString,
  formatSlashDateString,
  addDays,
  addMonths,
  diffInDays,
  generateDateRange,
} from "@/lib/dateUtils";
import { notifyNotificationsUpdated } from "@/lib/clientEvents";
import {
  ViewScale,
  SCALE_CELL_WIDTH,
  DEFAULT_LEFT_PANE_WIDTH,
  MIN_LEFT_PANE_WIDTH,
  MAX_LEFT_PANE_WIDTH,
  DisplayRow,
  DragState,
  filterGanttIssues,
  buildDisplayRows,
  buildMonthGroups,
  buildWeekGroups,
  calculateDraggedDates,
} from "./gantt/ganttUtils";
import GanttToolbar from "./gantt/GanttToolbar";
import GanttLeftTable from "./gantt/GanttLeftTable";
import GanttTimeline from "./gantt/GanttTimeline";
import { calculateAssigneeCounts } from "@/lib/assigneeUtils";

interface GanttChartProps {
  projects: Project[];
  currentProject: Project | null;
  issues: Issue[];
  onRefresh: () => void;
  onSelectProjectKey?: (key: string) => void;
}

export default function GanttChart({
  projects,
  currentProject,
  issues,
  onRefresh,
}: GanttChartProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // 今日の日付（ローカル日付）
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const todayStr = useMemo(() => formatDateString(today), [today]);

  // URLクエリパラメータから初期値を取得
  const initialSpan = useMemo(() => {
    const raw = Number(searchParams?.get("span"));
    return [1, 3, 6, 12].includes(raw) ? raw : 3;
  }, [searchParams]);

  const initialScale = useMemo<ViewScale>(() => {
    const raw = searchParams?.get("scale");
    if (raw === "days" || raw === "weeks" || raw === "months") return raw;
    return "days";
  }, [searchParams]);

  const initialStartDate = useMemo<Date>(() => {
    const raw = searchParams?.get("startDate");
    if (raw) {
      return parseDateString(raw);
    }
    // デフォルトは今日の7日前
    return addDays(today, -7);
  }, [searchParams, today]);

  const initialWithParentRelation = useMemo<boolean>(() => {
    const raw = searchParams?.get("withParentRelation");
    if (raw === "false") return false;
    return true; // デフォルトはON
  }, [searchParams]);

  // コントロールState
  const [span, setSpan] = useState<number>(initialSpan);
  const [scale, setScale] = useState<ViewScale>(initialScale);
  const [startDate, setStartDate] = useState<Date>(initialStartDate);
  const [withParentRelation, setWithParentRelation] = useState<boolean>(
    initialWithParentRelation
  );
  // 子課題の期限延長に伴う親課題期限延長の確認モーダル保留ステート
  const [pendingDateUpdate, setPendingDateUpdate] = useState<{
    issueId: number;
    startDate: string | null;
    dueDate: string | null;
    warning: ParentDueDateWarningInfo;
  } | null>(null);
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);

  // ブラウザの戻る/進む操作（popstate）時にURLパラメータとStateを同期
  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const spSpan = Number(sp.get("span"));
      if ([1, 3, 6, 12].includes(spSpan)) setSpan(spSpan);

      const spScale = sp.get("scale");
      if (spScale === "days" || spScale === "weeks" || spScale === "months") {
        setScale(spScale);
      }

      const spStart = sp.get("startDate");
      if (spStart) setStartDate(parseDateString(spStart));

      const spParent = sp.get("withParentRelation");
      if (spParent === "true" || spParent === "false") {
        setWithParentRelation(spParent === "true");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // パラメータ変更時にURLクエリを更新する関数
  const updateUrlParams = useCallback(
    (next: {
      span?: number;
      scale?: ViewScale;
      startDate?: Date;
      withParentRelation?: boolean;
    }) => {
      const nextSpan = next.span ?? span;
      const nextScale = next.scale ?? scale;
      const nextStart = next.startDate ?? startDate;
      const nextParent = next.withParentRelation ?? withParentRelation;

      const params = new URLSearchParams();
      params.set("span", String(nextSpan));
      params.set("scale", nextScale);
      params.set("startDate", formatSlashDateString(nextStart));
      params.set("withParentRelation", String(nextParent));

      const newUrl = `${pathname}?${params.toString()}`;
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", newUrl);
      }
    },
    [pathname, span, scale, startDate, withParentRelation]
  );

  // 左ペイン（課題一覧テーブル）の開閉と横幅状態（ドラッグでリサイズ可能）
  const [isLeftPaneOpen, setIsLeftPaneOpen] = useState(true);
  const [leftPaneWidth, setLeftPaneWidth] = useState<number>(DEFAULT_LEFT_PANE_WIDTH);
  const [isResizingLeftPane, setIsResizingLeftPane] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // 初回マウント時に保存された左ペイン幅を復元
  useEffect(() => {
    try {
      const saved =
        localStorage.getItem("litelog-gantt-left-pane-width") ||
        localStorage.getItem("personal-backlog-gantt-left-pane-width");
      if (saved) {
        const parsed = Number(saved);
        if (parsed >= MIN_LEFT_PANE_WIDTH && parsed <= MAX_LEFT_PANE_WIDTH) {
          setLeftPaneWidth(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // 左ペイン幅リサイズ用マウスイベント
  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingLeftPane(true);
  };

  const handleResetSplitter = () => {
    setLeftPaneWidth(DEFAULT_LEFT_PANE_WIDTH);
    try {
      localStorage.setItem(
        "litelog-gantt-left-pane-width",
        String(DEFAULT_LEFT_PANE_WIDTH)
      );
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!isResizingLeftPane) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!chartContainerRef.current) return;
      const rect = chartContainerRef.current.getBoundingClientRect();
      const newWidth = Math.min(
        Math.max(e.clientX - rect.left, MIN_LEFT_PANE_WIDTH),
        MAX_LEFT_PANE_WIDTH
      );
      setLeftPaneWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingLeftPane(false);
      try {
        localStorage.setItem("litelog-gantt-left-pane-width", String(leftPaneWidth));
      } catch {
        // ignore
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingLeftPane, leftPaneWidth]);

  // 折りたたまれている親課題IDのSet
  const [collapsedParentIds, setCollapsedParentIds] = useState<Set<number>>(new Set());

  const { users, currentUser, settings, effectiveWeekStart, effectiveShowHolidays } =
    useUser();
  const [reviewTargetIssue, setReviewTargetIssue] = useState<Issue | null>(null);
  const weekStart = effectiveWeekStart || settings.weekStart || "monday";
  const showHolidays = effectiveShowHolidays;

  // フィルター用State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterType, setFilterType] = useState<IssueType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<IssueStatus | "all">("all");
  const [filterPriority, setFilterPriority] = useState<IssuePriority | "all">("all");
  const [showClosed, setShowClosed] = useState(true);

  // モーダル用State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDefaultParentId, setCreateDefaultParentId] = useState<number | null>(null);
  const [detailIssue, setDetailIssue] = useState<Issue | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // ホバー中の課題ID（左右ペイン同期用）
  const [hoveredIssueId, setHoveredIssueId] = useState<number | null>(null);

  // タイムラインの表示終了日（startDate + spanヶ月）と日付配列を生成
  const endDate = useMemo(() => addMonths(startDate, span), [startDate, span]);
  const dateRange = useMemo(
    () => generateDateRange(startDate, endDate),
    [startDate, endDate]
  );

  const cellWidth = SCALE_CELL_WIDTH[scale];
  const timelineStartDate = dateRange[0];

  // スクロール同期用Ref
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const leftTableScrollRef = useRef<HTMLDivElement>(null);

  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (leftTableScrollRef.current) {
      leftTableScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleLeftTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (timelineScrollRef.current) {
      timelineScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // 「今日」の位置へ移動＆スクロールする関数
  const handleGoToToday = () => {
    const todayOffsetStart = addDays(today, -7);
    // もし今日が現在の範囲外なら、開始日を今日の7日前に更新
    const diffFromStart = diffInDays(timelineStartDate, today);
    if (diffFromStart < 0 || diffFromStart >= dateRange.length) {
      setStartDate(todayOffsetStart);
      updateUrlParams({ startDate: todayOffsetStart });
      setTimeout(() => {
        if (timelineScrollRef.current) {
          timelineScrollRef.current.scrollTo({ left: 0, behavior: "smooth" });
        }
      }, 100);
    } else if (timelineScrollRef.current) {
      const targetLeft =
        diffFromStart * cellWidth - timelineScrollRef.current.clientWidth / 3;
      timelineScrollRef.current.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: "smooth",
      });
    }
  };

  // 期間前後シフト
  const handleShiftPeriod = (monthsDelta: number) => {
    const nextStart = addMonths(startDate, monthsDelta);
    setStartDate(nextStart);
    updateUrlParams({ startDate: nextStart });
  };

  // 担当者フィルター選択肢用の件数集計（完了表示トグルを反映したベース課題群から算出）
  const assigneeCounts = useMemo(() => {
    const baseIssues = showClosed ? issues : issues.filter((i) => i.status !== "closed");
    return calculateAssigneeCounts(baseIssues, currentUser?.id);
  }, [issues, showClosed, currentUser?.id]);

  // フィルター後の課題一覧
  const filteredIssues = useMemo(
    () =>
      filterGanttIssues(issues, {
        showClosed,
        filterAssignee,
        currentUser,
        filterType,
        filterStatus,
        filterPriority,
        searchQuery,
      }),
    [
      issues,
      showClosed,
      filterAssignee,
      currentUser,
      filterType,
      filterStatus,
      filterPriority,
      searchQuery,
    ]
  );

  // 親子関係ツリー構造の構築（withParentRelation に対応）
  const displayRows = useMemo<DisplayRow[]>(
    () => buildDisplayRows(filteredIssues, withParentRelation, collapsedParentIds),
    [filteredIssues, withParentRelation, collapsedParentIds]
  );

  // 親課題の展開/折りたたみ切り替え
  const toggleParentCollapse = (parentId: number) => {
    setCollapsedParentIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  // 課題の状態即時変更
  const handleQuickStatusChange = async (issueId: number, newStatus: IssueStatus) => {
    if (currentProject?.is_archived) return;
    const targetIssue = issues.find((i) => i.id === issueId);
    // 一般メンバーが「処理済み」に変更する場合はレビュー依頼モーダルを起動（Admin/PMOはスキップ許可）
    if (
      newStatus === "resolved" &&
      targetIssue &&
      targetIssue.status !== "resolved" &&
      !canManageIssues(currentUser)
    ) {
      setReviewTargetIssue(targetIssue);
      return;
    }
    if (newStatus === "closed") {
      const unclosedChildren = issues.filter(
        (i) => i.parent_id === issueId && i.status !== "closed"
      );
      if (unclosedChildren.length > 0) {
        alert(
          `未完了の子課題が ${unclosedChildren.length} 件存在するため、親課題を完了にすることはできません。`
        );
        return;
      }
    }

    try {
      const res = await fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, actorId: currentUser?.id || null }),
      });
      if (res.ok) {
        onRefresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "状態の変更に失敗しました");
        onRefresh();
      }
    } catch (err) {
      console.error("ステータス変更エラー:", err);
    }
  };

  // ドラッグ操作による日付変更 State
  const [dragState, setDragState] = useState<DragState | null>(null);

  // バーのドラッグ開始
  const handleBarMouseDown = (
    e: React.MouseEvent,
    issue: Issue,
    mode: "move" | "resize-start" | "resize-end"
  ) => {
    if (currentProject?.is_archived) return;
    e.stopPropagation();
    e.preventDefault();

    const startStr = issue.start_date || issue.due_date || todayStr;
    const dueStr = issue.due_date || issue.start_date || todayStr;

    setDragState({
      issueId: issue.id,
      mode,
      startX: e.clientX,
      initialStartDate: startStr,
      initialDueDate: dueStr,
      currentStartDate: startStr,
      currentDueDate: dueStr,
    });
  };

  // マウス移動（ドラッグ中のプレビュー計算）
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState) return;

      const deltaX = e.clientX - dragState.startX;
      const nextDates = calculateDraggedDates(dragState, deltaX, cellWidth, today);
      if (nextDates) {
        setDragState((prev) => (prev ? { ...prev, ...nextDates } : null));
      }
    },
    [dragState, cellWidth, today]
  );

  // ガントチャートからの期間更新API実行
  const executeDateUpdate = useCallback(
    async (
      issueId: number,
      nextStartDate: string | null,
      nextDueDate: string | null,
      extendParentDueDate = false
    ) => {
      try {
        setIsUpdatingDate(true);
        await fetch(`/api/issues/${issueId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startDate: nextStartDate,
            dueDate: nextDueDate,
            extendParentDueDate,
            actorId: currentUser?.id || null,
          }),
        });
        onRefresh();
      } catch (err) {
        console.error("ガントチャート期間更新エラー:", err);
      } finally {
        setIsUpdatingDate(false);
      }
    },
    [currentUser, onRefresh]
  );

  // 子課題の期限日が親課題の期限日を超える場合は確認モーダルを出し、そうでなければ即更新
  const requestDateUpdateWithParentCheck = useCallback(
    async (issueId: number, nextStartDate: string | null, nextDueDate: string | null) => {
      const targetIssue = issues.find((i) => i.id === issueId);
      if (targetIssue && targetIssue.parent_id && nextDueDate) {
        const parentIssue = issues.find((i) => i.id === targetIssue.parent_id);
        const parentDueDate = parentIssue?.due_date ?? targetIssue.parent_due_date ?? null;
        if (isExceedingParentDueDate(parentDueDate, nextDueDate)) {
          setPendingDateUpdate({
            issueId,
            startDate: nextStartDate,
            dueDate: nextDueDate,
            warning: {
              parentIssueKey: parentIssue?.issue_key ?? targetIssue.parent_issue_key,
              parentTitle: parentIssue?.title ?? targetIssue.parent_title,
              parentDueDate: parentDueDate!,
              newChildDueDate: nextDueDate,
              childIssueKey: targetIssue.issue_key,
            },
          });
          return;
        }
      }
      await executeDateUpdate(issueId, nextStartDate, nextDueDate, false);
    },
    [issues, executeDateUpdate]
  );

  // マウスアップ（ドラッグ終了時にAPIで日付保存）
  const handleMouseUp = useCallback(async () => {
    if (!dragState) return;

    const {
      issueId,
      currentStartDate,
      currentDueDate,
      initialStartDate,
      initialDueDate,
    } = dragState;
    setDragState(null);

    if (currentStartDate === initialStartDate && currentDueDate === initialDueDate) {
      return;
    }

    await requestDateUpdateWithParentCheck(issueId, currentStartDate, currentDueDate);
  }, [dragState, requestDateUpdateWithParentCheck]);

  useEffect(() => {
    if (dragState) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  // 日付未設定の行でクリックして設定
  const handleSetDefaultDates = async (issue: Issue) => {
    const targetStr = formatDateString(startDate > today ? startDate : today);
    await requestDateUpdateWithParentCheck(issue.id, targetStr, targetStr);
  };

  // 年・月ヘッダーのグループ化
  const monthGroups = useMemo(() => buildMonthGroups(dateRange), [dateRange]);

  // 週スケール用のグループ化（設定された週開始曜日、または先頭区切り）
  const weekGroups = useMemo(
    () => buildWeekGroups(dateRange, weekStart),
    [dateRange, weekStart]
  );

  const isArchived = isArchivedProject(currentProject);

  const dashboardHref = currentProject ? `/?projectId=${currentProject.id}` : "/";
  const boardHref = currentProject
    ? `/board/${encodeURIComponent(currentProject.key)}`
    : "/board";

  return (
    <div className="space-y-3">
      {/* スマートフォン幅（md未満）ではガントチャートは非表示とし、ダッシュボード・ボードへ誘導 */}
      <div className="md:hidden bg-white rounded-xl shadow-xs border border-slate-200 p-6 text-center space-y-4">
        <div className="space-y-1.5">
          <h2 className="text-base font-bold text-slate-800">
            ガントチャートはPC・タブレット専用です
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            スマートフォンの画面幅ではガントチャートは非表示となっています。課題の確認・コメント・ステータス更新はダッシュボードまたはボードをご利用ください。
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-1">
          <Link
            href={dashboardHref}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>ダッシュボードへ</span>
          </Link>
          <Link
            href={boardHref}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold transition-colors"
          >
            <Kanban className="w-3.5 h-3.5" />
            <span>ボードへ</span>
          </Link>
        </div>
      </div>

      {/* PC・タブレット（md以上）のみガントチャートを表示 */}
      <div className="hidden md:block space-y-3">
        {/* アーカイブ済みプロジェクトのリードオンリー注意バナー */}
        {isArchived && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2.5 rounded-xl shadow-xs flex items-center gap-2 text-xs font-semibold animate-in fade-in duration-150">
            <Archive className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              このプロジェクトは<strong>アーカイブ</strong>されています。読み取り専用のため、日程の変更や課題の追加は行えません。
            </span>
          </div>
        )}

        {/* ツールバー / フィルター・コントロールバー（画面スクロール時も常に上部に固定表示） */}
        <GanttToolbar
          currentProject={currentProject}
          isArchived={isArchived}
          searchQuery={searchQuery}
          onChangeSearchQuery={setSearchQuery}
          filterAssignee={filterAssignee}
          onChangeFilterAssignee={setFilterAssignee}
          currentUser={currentUser}
          users={users}
          assigneeCounts={assigneeCounts}
          filterType={filterType}
          onChangeFilterType={setFilterType}
          filterStatus={filterStatus}
          onChangeFilterStatus={setFilterStatus}
          filterPriority={filterPriority}
          onChangeFilterPriority={setFilterPriority}
          showClosed={showClosed}
          onToggleShowClosed={() => setShowClosed(!showClosed)}
          onShiftPeriod={handleShiftPeriod}
          onGoToToday={handleGoToToday}
          startDate={startDate}
          onChangeStartDate={(nextD) => {
            setStartDate(nextD);
            updateUrlParams({ startDate: nextD });
          }}
          span={span}
          onChangeSpan={(nextSpan) => {
            setSpan(nextSpan);
            updateUrlParams({ span: nextSpan });
          }}
          scale={scale}
          onChangeScale={(nextScale) => {
            setScale(nextScale);
            updateUrlParams({ scale: nextScale });
          }}
          withParentRelation={withParentRelation}
          onChangeWithParentRelation={(val) => {
            setWithParentRelation(val);
            updateUrlParams({ withParentRelation: val });
          }}
          isLeftPaneOpen={isLeftPaneOpen}
          onToggleLeftPane={() => setIsLeftPaneOpen(!isLeftPaneOpen)}
          leftPaneWidth={leftPaneWidth}
          onResetSplitter={handleResetSplitter}
        />

        {/* ガントチャート本体エリア（左右分割レイアウト） */}
        <div
          ref={chartContainerRef}
          className={`bg-white rounded-lg shadow-xs border border-gray-200 overflow-hidden flex relative ${
            isResizingLeftPane ? "select-none cursor-col-resize" : ""
          }`}
        >
          {/* ================= 左ペイン：課題一覧テーブル ================= */}
          {isLeftPaneOpen && (
            <GanttLeftTable
              leftPaneWidth={leftPaneWidth}
              leftTableScrollRef={leftTableScrollRef}
              onScroll={handleLeftTableScroll}
              displayRows={displayRows}
              hoveredIssueId={hoveredIssueId}
              onHoverIssue={setHoveredIssueId}
              todayStr={todayStr}
              collapsedParentIds={collapsedParentIds}
              onToggleParentCollapse={toggleParentCollapse}
              withParentRelation={withParentRelation}
              onOpenDetail={(issue) => {
                setDetailIssue(issue);
                setIsDetailOpen(true);
              }}
              onOpenCreateChild={(parentId) => {
                setCreateDefaultParentId(parentId);
                setIsCreateOpen(true);
              }}
              onQuickStatusChange={handleQuickStatusChange}
            />
          )}

          {/* 左ペインと右ペインの境界リサイザー（ドラッグで件名表示幅を自在に伸縮） */}
          {isLeftPaneOpen && (
            <div
              onMouseDown={handleSplitterMouseDown}
              onDoubleClick={handleResetSplitter}
              className={`w-1.5 hover:w-2 shrink-0 cursor-col-resize select-none relative z-30 transition-all flex items-center justify-center border-l border-r border-slate-200 ${
                isResizingLeftPane
                  ? "bg-indigo-600 border-indigo-600"
                  : "bg-slate-100 hover:bg-indigo-400 hover:border-indigo-400"
              }`}
              title="左右にドラッグして一覧テーブルの幅を変更（ダブルクリックで既定幅にリセット）"
            >
              <div className="w-0.5 h-6 bg-slate-400 rounded-full pointer-events-none" />
            </div>
          )}

          {/* ================= 右ペイン：ガントチャートタイムライン ================= */}
          <GanttTimeline
            timelineScrollRef={timelineScrollRef}
            onScroll={handleTimelineScroll}
            dateRange={dateRange}
            cellWidth={cellWidth}
            monthGroups={monthGroups}
            weekGroups={weekGroups}
            scale={scale}
            todayStr={todayStr}
            showHolidays={showHolidays}
            weekStart={weekStart}
            displayRows={displayRows}
            hoveredIssueId={hoveredIssueId}
            onHoverIssue={setHoveredIssueId}
            dragState={dragState}
            withParentRelation={withParentRelation}
            timelineStartDate={timelineStartDate}
            onOpenDetail={(issue) => {
              setDetailIssue(issue);
              setIsDetailOpen(true);
            }}
            onBarMouseDown={handleBarMouseDown}
            onSetDefaultDates={handleSetDefaultDates}
          />
        </div>
      </div>

      {/* 課題作成モーダル */}
      <CreateIssueModal
        isOpen={isCreateOpen}
        projects={projects}
        selectedProjectId={currentProject?.id || null}
        defaultParentId={createDefaultParentId}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateDefaultParentId(null);
        }}
        onCreated={() => {
          setIsCreateOpen(false);
          setCreateDefaultParentId(null);
          onRefresh();
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
        onUpdated={() => {
          onRefresh();
          if (detailIssue) {
            fetch(`/api/issues/${detailIssue.id}`)
              .then((res) => res.json())
              .then((data) => {
                if (data.issue) setDetailIssue(data.issue);
              })
              .catch((err) => console.error(err));
          }
        }}
        onDeleted={() => {
          setIsDetailOpen(false);
          setDetailIssue(null);
          onRefresh();
        }}
        onSelectIssue={(issue) => setDetailIssue(issue)}
      />

      {/* レビュー・確認依頼モーダル（ガントチャートから「処理済み」変更時） */}
      {reviewTargetIssue && (
        <ReviewRequestModal
          isOpen={true}
          issueKey={reviewTargetIssue.issue_key}
          issueTitle={reviewTargetIssue.title}
          reporterId={reviewTargetIssue.created_by}
          currentAssigneeId={reviewTargetIssue.assignee_id}
          users={users}
          currentUserId={currentUser?.id}
          onClose={() => setReviewTargetIssue(null)}
          onSubmit={async (data) => {
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
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || "レビュー依頼の送信に失敗しました");
            }
            setReviewTargetIssue(null);
            onRefresh();
            notifyNotificationsUpdated();
          }}
        />
      )}

      {/* 子課題の期限延長に伴う親課題期限延長の確認モーダル */}
      <ParentDueDateConfirmModal
        info={pendingDateUpdate?.warning || null}
        isSubmitting={isUpdatingDate}
        onExtendBoth={async () => {
          if (!pendingDateUpdate) return;
          const { issueId, startDate: s, dueDate: d } = pendingDateUpdate;
          setPendingDateUpdate(null);
          await executeDateUpdate(issueId, s, d, true);
        }}
        onChildOnly={async () => {
          if (!pendingDateUpdate) return;
          const { issueId, startDate: s, dueDate: d } = pendingDateUpdate;
          setPendingDateUpdate(null);
          await executeDateUpdate(issueId, s, d, false);
        }}
        onCancel={() => setPendingDateUpdate(null)}
      />
    </div>
  );
}
