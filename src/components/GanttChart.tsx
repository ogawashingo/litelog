// Backlog風ガントチャートコンポーネント
"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Maximize2,
  Minimize2,
  Kanban,
  LayoutDashboard,
  ExternalLink,
} from "lucide-react";
import { Project, Issue, IssueStatus, IssueType, IssuePriority } from "@/types";
import { TypeBadge, StatusBadge, PriorityBadge } from "./IssueBadge";
import IssueDetailModal from "./IssueDetailModal";
import CreateIssueModal from "./CreateIssueModal";
import {
  parseDateString,
  formatDateString,
  addDays,
  diffInDays,
  isSameDay,
  getWeekendInfo,
  getWeekdayJa,
  generateDateRange,
} from "@/lib/dateUtils";

interface GanttChartProps {
  projects: Project[];
  currentProject: Project | null;
  issues: Issue[];
  onRefresh: () => void;
  onSelectProjectKey?: (key: string) => void;
}

// 表示スケール種別
type ViewScale = "day" | "week" | "month";

// 各スケールでの1日あたりのセル幅（px）
const SCALE_CELL_WIDTH: Record<ViewScale, number> = {
  day: 38,
  week: 20,
  month: 10,
};

// ステータスに応じたバーの配色設定
const STATUS_BAR_STYLES: Record<
  IssueStatus,
  { bg: string; border: string; text: string; barGradient: string }
> = {
  open: {
    bg: "bg-blue-500",
    border: "border-blue-600",
    text: "text-white",
    barGradient: "from-blue-500 to-blue-600",
  },
  in_progress: {
    bg: "bg-[#2ca078]",
    border: "border-[#238161]",
    text: "text-white",
    barGradient: "from-emerald-500 to-[#2ca078]",
  },
  resolved: {
    bg: "bg-teal-500",
    border: "border-teal-600",
    text: "text-white",
    barGradient: "from-teal-400 to-teal-600",
  },
  closed: {
    bg: "bg-gray-400",
    border: "border-gray-500",
    text: "text-white",
    barGradient: "from-gray-400 to-gray-500",
  },
};

export default function GanttChart({
  projects,
  currentProject,
  issues,
  onRefresh,
  onSelectProjectKey,
}: GanttChartProps) {
  // 表示スケール（日 / 週 / 月）
  const [scale, setScale] = useState<ViewScale>("day");

  // 左ペイン（課題一覧テーブル）の開閉
  const [isLeftPaneOpen, setIsLeftPaneOpen] = useState(true);

  // フィルター用State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<IssueType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<IssueStatus | "all">("all");
  const [filterPriority, setFilterPriority] = useState<IssuePriority | "all">("all");
  const [showClosed, setShowClosed] = useState(true);

  // モーダル用State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailIssue, setDetailIssue] = useState<Issue | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // ホバー中の課題ID（左右ペイン同期用）
  const [hoveredIssueId, setHoveredIssueId] = useState<number | null>(null);

  // タイムラインの基準日（現在のビューの中心付近）
  const [timelineBaseDate, setTimelineBaseDate] = useState<Date>(() => {
    const today = new Date();
    // 今月1日を開始基準にする
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  // タイムラインの表示日数（スケールに応じて調整）
  const daysCount = useMemo(() => {
    switch (scale) {
      case "day":
        return 60; // 約2ヶ月分
      case "week":
        return 90; // 約3ヶ月分
      case "month":
        return 180; // 約半年分
    }
  }, [scale]);

  // タイムラインの日付範囲を生成
  const dateRange = useMemo(() => {
    // 基準日の7日前から開始して余裕を持たせる
    const start = addDays(timelineBaseDate, -7);
    const end = addDays(start, daysCount);
    return generateDateRange(start, end);
  }, [timelineBaseDate, daysCount]);

  // 今日の日付
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => formatDateString(today), [today]);

  const cellWidth = SCALE_CELL_WIDTH[scale];
  const timelineStartDate = dateRange[0];
  const timelineEndDate = dateRange[dateRange.length - 1];

  // タイムラインコンテナへのRef（スクロール位置制御用）
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const leftTableScrollRef = useRef<HTMLDivElement>(null);

  // 左右ペインの縦スクロール同期
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

  // 「今日」の位置へスクロールする関数
  const scrollToToday = useCallback(() => {
    if (!timelineScrollRef.current || !timelineStartDate) return;
    const daysFromStart = diffInDays(timelineStartDate, today);
    if (daysFromStart >= 0 && daysFromStart <= daysCount) {
      const targetLeft = daysFromStart * cellWidth - timelineScrollRef.current.clientWidth / 2 + cellWidth / 2;
      timelineScrollRef.current.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: "smooth",
      });
    } else {
      // 範囲外なら基準日を今日の月初にリセットして再スクロール
      setTimelineBaseDate(new Date(today.getFullYear(), today.getMonth(), 1));
    }
  }, [timelineStartDate, today, daysCount, cellWidth]);

  // 初回表示時に今日へスクロール
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToToday();
    }, 150);
    return () => clearTimeout(timer);
  }, [scrollToToday]);

  // 月移動（前へ / 次へ）
  const handleShiftMonth = (months: number) => {
    setTimelineBaseDate((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + months, 1);
      return next;
    });
  };

  // フィルター後の課題一覧
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (!showClosed && issue.status === "closed") return false;
      if (filterType !== "all" && issue.issue_type !== filterType) return false;
      if (filterStatus !== "all" && issue.status !== filterStatus) return false;
      if (filterPriority !== "all" && issue.priority !== filterPriority) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const inKey = issue.issue_key.toLowerCase().includes(query);
        const inTitle = issue.title.toLowerCase().includes(query);
        const inDesc = (issue.description || "").toLowerCase().includes(query);
        if (!inKey && !inTitle && !inDesc) return false;
      }
      return true;
    });
  }, [issues, showClosed, filterType, filterStatus, filterPriority, searchQuery]);

  // 課題の状態即時変更
  const handleQuickStatusChange = async (issueId: number, newStatus: IssueStatus) => {
    try {
      await fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      onRefresh();
    } catch (err) {
      console.error("ステータス変更エラー:", err);
    }
  };

  // ドラッグ操作による日付変更 State
  interface DragState {
    issueId: number;
    mode: "move" | "resize-start" | "resize-end";
    startX: number;
    initialStartDate: string | null;
    initialDueDate: string | null;
    currentStartDate: string | null;
    currentDueDate: string | null;
  }
  const [dragState, setDragState] = useState<DragState | null>(null);

  // バーのドラッグ開始
  const handleBarMouseDown = (
    e: React.MouseEvent,
    issue: Issue,
    mode: "move" | "resize-start" | "resize-end"
  ) => {
    e.stopPropagation();
    e.preventDefault();

    // 日付が未設定の場合は今日をデフォルト基準にする
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
      const daysShift = Math.round(deltaX / cellWidth);

      if (daysShift === 0 && dragState.currentStartDate === dragState.initialStartDate) return;

      const initStart = dragState.initialStartDate ? parseDateString(dragState.initialStartDate) : today;
      const initDue = dragState.initialDueDate ? parseDateString(dragState.initialDueDate) : today;

      if (dragState.mode === "move") {
        // 全体を左右シフト
        const newStart = addDays(initStart, daysShift);
        const newDue = addDays(initDue, daysShift);
        setDragState((prev) =>
          prev
            ? {
                ...prev,
                currentStartDate: formatDateString(newStart),
                currentDueDate: formatDateString(newDue),
              }
            : null
        );
      } else if (dragState.mode === "resize-start") {
        // 開始日のみリサイズ（期限日を超えないように制御）
        const newStart = addDays(initStart, daysShift);
        if (newStart <= initDue) {
          setDragState((prev) =>
            prev
              ? {
                  ...prev,
                  currentStartDate: formatDateString(newStart),
                }
              : null
          );
        }
      } else if (dragState.mode === "resize-end") {
        // 期限日のみリサイズ（開始日を下回らないように制御）
        const newDue = addDays(initDue, daysShift);
        if (newDue >= initStart) {
          setDragState((prev) =>
            prev
              ? {
                  ...prev,
                  currentDueDate: formatDateString(newDue),
                }
              : null
          );
        }
      }
    },
    [dragState, cellWidth, today]
  );

  // マウスアップ（ドラッグ終了時にAPIで日付保存）
  const handleMouseUp = useCallback(async () => {
    if (!dragState) return;

    const { issueId, currentStartDate, currentDueDate, initialStartDate, initialDueDate } = dragState;
    setDragState(null);

    // 変更がない場合は何もしない
    if (currentStartDate === initialStartDate && currentDueDate === initialDueDate) {
      return;
    }

    try {
      await fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: currentStartDate,
          dueDate: currentDueDate,
        }),
      });
      onRefresh();
    } catch (err) {
      console.error("ガントチャート期間更新エラー:", err);
    }
  }, [dragState, onRefresh]);

  // グローバルマウスイベントのリスナー登録
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

  // 日付未設定のセルクリックで新規期間を設定
  const handleCellClick = async (issue: Issue, clickedDate: Date) => {
    const dateStr = formatDateString(clickedDate);
    try {
      await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: dateStr,
          dueDate: dateStr,
        }),
      });
      onRefresh();
    } catch (err) {
      console.error("日付設定エラー:", err);
    }
  };

  // 年・月ヘッダーのグループ化
  const monthGroups = useMemo(() => {
    const groups: { year: number; month: number; daysCount: number }[] = [];
    dateRange.forEach((d) => {
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const lastGroup = groups[groups.length - 1];

      if (lastGroup && lastGroup.year === year && lastGroup.month === month) {
        lastGroup.daysCount++;
      } else {
        groups.push({ year, month, daysCount: 1 });
      }
    });
    return groups;
  }, [dateRange]);

  // 行の高さ（ピクセル）
  const ROW_HEIGHT = 42;

  return (
    <div className="space-y-4">
      {/* ツールバー / フィルター・コントロールバー */}
      <div className="bg-white rounded-lg shadow-xs border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* 左側: プロジェクト選択とタイトル */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className="w-3.5 h-7 rounded-sm"
                style={{ backgroundColor: currentProject?.color || "#2ca078" }}
              />
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <span>{currentProject ? currentProject.name : "すべてのプロジェクト"}</span>
                {currentProject && (
                  <span className="text-sm font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                    {currentProject.key}
                  </span>
                )}
              </h2>
            </div>

            {/* プロジェクト切り替え */}
            {projects.length > 0 && (
              <div className="relative">
                <select
                  value={currentProject?.key || ""}
                  onChange={(e) => {
                    if (onSelectProjectKey) {
                      onSelectProjectKey(e.target.value);
                    }
                  }}
                  className="text-xs bg-gray-50 border border-gray-300 rounded-md px-2.5 py-1.5 text-gray-700 hover:bg-gray-100 cursor-pointer font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">すべてのプロジェクト</option>
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.key}>
                      [{proj.key}] {proj.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ボードへのクイック切り替えボタン */}
            {currentProject && (
              <Link
                href={`/board/${encodeURIComponent(currentProject.key)}`}
                className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-md font-medium border border-gray-300 transition-colors"
                title="かんばんボードで確認"
              >
                <Kanban className="w-3.5 h-3.5 text-gray-500" />
                <span>ボード</span>
              </Link>
            )}
          </div>

          {/* 右側: 検索・フィルター・課題追加 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 検索入力 */}
            <div className="relative min-w-[160px] max-w-xs">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="課題を検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 border border-gray-300 rounded-md bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* 種別フィルター */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as IssueType | "all")}
              className="text-xs bg-white border border-gray-300 rounded-md px-2 py-1.5 text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">種別: すべて</option>
              <option value="task">タスク</option>
              <option value="bug">バグ</option>
              <option value="request">要望</option>
              <option value="other">その他</option>
            </select>

            {/* 状態フィルター */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as IssueStatus | "all")}
              className="text-xs bg-white border border-gray-300 rounded-md px-2 py-1.5 text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">状態: すべて</option>
              <option value="open">未対応</option>
              <option value="in_progress">処理中</option>
              <option value="resolved">処理済み</option>
              <option value="closed">完了</option>
            </select>

            {/* 優先度フィルター */}
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value as IssuePriority | "all")}
              className="text-xs bg-white border border-gray-300 rounded-md px-2 py-1.5 text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">優先度: すべて</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>

            {/* 完了課題の表示トグル */}
            <button
              onClick={() => setShowClosed(!showClosed)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                showClosed
                  ? "bg-gray-100 text-gray-700 border-gray-300"
                  : "bg-white text-gray-400 border-gray-200"
              }`}
              title="完了した課題の表示を切り替えます"
            >
              <CheckCircle2 className={`w-3.5 h-3.5 ${showClosed ? "text-emerald-600" : "text-gray-400"}`} />
              <span>完了を含む</span>
            </button>

            {/* 課題追加ボタン */}
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-md bg-[#2ca078] hover:bg-[#238161] text-white shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>課題の追加</span>
            </button>
          </div>
        </div>

        {/* ガントチャート専用コントローラー行（期間ナビ・今日へ移動・スケール切替・左ペイン切替） */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-3 border-t border-gray-100">
          {/* 期間ナビゲーション */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleShiftMonth(-1)}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-600 border border-gray-300 transition-colors"
              title="前月へ移動"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={scrollToToday}
              className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded transition-colors"
              title="今日の日付へスクロール"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-emerald-600" />
              <span>今日</span>
            </button>
            <button
              onClick={() => handleShiftMonth(1)}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-600 border border-gray-300 transition-colors"
              title="次月へ移動"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="text-xs font-bold text-gray-700 ml-2">
              {timelineBaseDate.getFullYear()}年 {timelineBaseDate.getMonth() + 1}月
            </span>
          </div>

          {/* 右側：スケール切替と左ペイン開閉ボタン */}
          <div className="flex items-center gap-3">
            {/* スケール切替ラジオ風ボタングループ */}
            <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200 text-xs">
              <button
                onClick={() => setScale("day")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  scale === "day"
                    ? "bg-white text-emerald-800 shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                日
              </button>
              <button
                onClick={() => setScale("week")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  scale === "week"
                    ? "bg-white text-emerald-800 shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                週
              </button>
              <button
                onClick={() => setScale("month")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  scale === "month"
                    ? "bg-white text-emerald-800 shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                月
              </button>
            </div>

            {/* 左側課題リストの開閉ボタン */}
            <button
              onClick={() => setIsLeftPaneOpen(!isLeftPaneOpen)}
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-300 px-2.5 py-1 rounded transition-colors"
              title={isLeftPaneOpen ? "課題一覧テーブルを折りたたむ" : "課題一覧テーブルを展開する"}
            >
              {isLeftPaneOpen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">一覧を縮小</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">一覧を展開</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ガントチャート本体エリア（左右分割レイアウト） */}
      <div className="bg-white rounded-lg shadow-xs border border-gray-200 overflow-hidden flex">
        {/* ================= 左ペイン：課題一覧テーブル ================= */}
        {isLeftPaneOpen && (
          <div className="w-[360px] md:w-[420px] shrink-0 border-r border-gray-200 flex flex-col bg-white select-none">
            {/* テーブルヘッダー（高さ: 52px = 右側の2段ヘッダーと正確に一致） */}
            <div className="h-[52px] bg-gray-50 border-b border-gray-200 flex items-center px-3 text-xs font-bold text-gray-600">
              <div className="w-[105px] shrink-0">課題キー</div>
              <div className="flex-1 min-w-0 pr-2">件名</div>
              <div className="w-[72px] shrink-0 text-center">状態</div>
              <div className="w-[85px] shrink-0 text-center">期限日</div>
            </div>

            {/* 課題一覧ボディ（タイムラインと連動して縦スクロール） */}
            <div
              ref={leftTableScrollRef}
              onScroll={handleLeftTableScroll}
              className="overflow-y-auto overflow-x-hidden max-h-[620px] divide-y divide-gray-100"
            >
              {filteredIssues.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400">
                  表示する課題がありません
                </div>
              ) : (
                filteredIssues.map((issue) => {
                  const isHovered = hoveredIssueId === issue.id;
                  const isClosed = issue.status === "closed";
                  const isOverdue =
                    !isClosed && issue.due_date && issue.due_date < todayStr;

                  return (
                    <div
                      key={issue.id}
                      onMouseEnter={() => setHoveredIssueId(issue.id)}
                      onMouseLeave={() => setHoveredIssueId(null)}
                      style={{ height: `${ROW_HEIGHT}px` }}
                      className={`flex items-center px-3 text-xs transition-colors ${
                        isHovered ? "bg-emerald-50/60" : "hover:bg-gray-50/80"
                      }`}
                    >
                      {/* 課題キー ＆ 種別アイコン */}
                      <div className="w-[105px] shrink-0 flex items-center gap-1.5">
                        <TypeBadge type={issue.issue_type} showLabel={false} />
                        <button
                          onClick={() => {
                            setDetailIssue(issue);
                            setIsDetailOpen(true);
                          }}
                          className="font-semibold text-emerald-800 hover:text-emerald-950 hover:underline truncate"
                          title="詳細を開く"
                        >
                          {issue.issue_key}
                        </button>
                      </div>

                      {/* 課題名 */}
                      <div className="flex-1 min-w-0 pr-2">
                        <button
                          onClick={() => {
                            setDetailIssue(issue);
                            setIsDetailOpen(true);
                          }}
                          className={`text-left truncate w-full font-medium ${
                            isClosed
                              ? "line-through text-gray-400"
                              : "text-gray-800 hover:text-emerald-700"
                          }`}
                          title={issue.title}
                        >
                          {issue.title}
                        </button>
                      </div>

                      {/* 状態変更セレクター */}
                      <div className="w-[72px] shrink-0 text-center">
                        <select
                          value={issue.status}
                          onChange={(e) =>
                            handleQuickStatusChange(issue.id, e.target.value as IssueStatus)
                          }
                          className="w-full text-[11px] font-semibold bg-white border border-gray-300 rounded px-1 py-0.5 text-gray-700 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                        >
                          <option value="open">未対応</option>
                          <option value="in_progress">処理中</option>
                          <option value="resolved">処理済み</option>
                          <option value="closed">完了</option>
                        </select>
                      </div>

                      {/* 期限日 */}
                      <div className="w-[85px] shrink-0 text-center font-medium text-[11px]">
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
                            {issue.due_date.slice(5)}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-[10px]">未設定</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ================= 右ペイン：ガントチャートタイムライン ================= */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col bg-white">
          <div
            ref={timelineScrollRef}
            onScroll={handleTimelineScroll}
            className="overflow-x-auto overflow-y-auto max-h-[672px] relative select-none"
          >
            {/* タイムライン全体の幅を持つラッパー */}
            <div
              style={{ width: `${dateRange.length * cellWidth}px` }}
              className="relative min-w-full"
            >
              {/* ---------- タイムラインヘッダー（2段：年月 ＆ 日付曜日） ---------- */}
              <div className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200">
                {/* 1段目：年月グループ */}
                <div className="flex border-b border-gray-200 text-xs font-bold text-gray-700 h-[26px]">
                  {monthGroups.map((g, idx) => (
                    <div
                      key={idx}
                      style={{ width: `${g.daysCount * cellWidth}px` }}
                      className="px-2 flex items-center border-r border-gray-200 truncate bg-gray-100/80"
                    >
                      <span>
                        {g.year}年 {g.month}月
                      </span>
                    </div>
                  ))}
                </div>

                {/* 2段目：日 ＆ 曜日 */}
                <div className="flex text-[11px] h-[26px]">
                  {dateRange.map((d, idx) => {
                    const dateStr = formatDateString(d);
                    const isToday = dateStr === todayStr;
                    const weekend = getWeekendInfo(d);
                    const dayNum = d.getDate();
                    const weekday = getWeekdayJa(d);

                    let colBg = "bg-white";
                    let textColor = "text-gray-600";
                    if (weekend.isSaturday) {
                      colBg = "bg-blue-50/70";
                      textColor = "text-blue-600";
                    } else if (weekend.isSunday) {
                      colBg = "bg-rose-50/70";
                      textColor = "text-rose-600";
                    }

                    return (
                      <div
                        key={idx}
                        style={{ width: `${cellWidth}px` }}
                        className={`shrink-0 flex flex-col items-center justify-center border-r border-gray-200 ${colBg} ${
                          isToday ? "bg-emerald-100/70 font-bold" : ""
                        }`}
                        title={`${dateStr} (${weekday})`}
                      >
                        <span
                          className={`leading-none ${
                            isToday ? "text-emerald-800 font-extrabold" : textColor
                          }`}
                        >
                          {dayNum}
                        </span>
                        {scale === "day" && (
                          <span
                            className={`text-[9px] scale-90 leading-none ${
                              isToday ? "text-emerald-700 font-bold" : textColor
                            }`}
                          >
                            {weekday}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ---------- タイムライン行グリッド ＆ タスクバー描画 ---------- */}
              <div className="relative divide-y divide-gray-100">
                {/* 今日の赤い縦線（タイムライン全体を縦断） */}
                {(() => {
                  const todayIndex = dateRange.findIndex((d) => formatDateString(d) === todayStr);
                  if (todayIndex >= 0) {
                    const lineLeft = todayIndex * cellWidth + cellWidth / 2;
                    return (
                      <div
                        style={{ left: `${lineLeft}px` }}
                        className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10 pointer-events-none shadow-xs"
                      >
                        <div className="sticky top-[52px] -translate-x-1/2 bg-rose-500 text-white text-[9px] px-1 py-0.2 rounded font-bold uppercase tracking-wider">
                          Today
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* 各課題の行 */}
                {filteredIssues.map((issue) => {
                  const isHovered = hoveredIssueId === issue.id;
                  const isDraggingThis = dragState?.issueId === issue.id;

                  // 表示用の開始日・期限日（ドラッグ中の場合はドラッグプレビュー値を使用）
                  const effectiveStartDate = isDraggingThis
                    ? dragState.currentStartDate
                    : issue.start_date || issue.due_date;
                  const effectiveDueDate = isDraggingThis
                    ? dragState.currentDueDate
                    : issue.due_date || issue.start_date;

                  // 期間バーの描画座標計算
                  let barLeft = 0;
                  let barWidth = 0;
                  let isBarVisible = false;

                  if (effectiveStartDate && effectiveDueDate) {
                    const startD = parseDateString(effectiveStartDate);
                    const dueD = parseDateString(effectiveDueDate);

                    const startOffset = diffInDays(timelineStartDate, startD);
                    const durationDays = Math.max(1, diffInDays(startD, dueD) + 1);

                    barLeft = startOffset * cellWidth;
                    barWidth = durationDays * cellWidth - 4; // 少しマージンを空ける
                    isBarVisible = true;
                  }

                  const isClosed = issue.status === "closed";
                  const isOverdue =
                    !isClosed && issue.due_date && issue.due_date < todayStr;
                  const styleCfg = STATUS_BAR_STYLES[issue.status] || STATUS_BAR_STYLES.open;

                  return (
                    <div
                      key={issue.id}
                      onMouseEnter={() => setHoveredIssueId(issue.id)}
                      onMouseLeave={() => setHoveredIssueId(null)}
                      style={{ height: `${ROW_HEIGHT}px` }}
                      className={`relative flex items-center transition-colors ${
                        isHovered ? "bg-emerald-50/40" : "hover:bg-gray-50/50"
                      }`}
                    >
                      {/* 背景グリッド縦線（週末色付け） */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {dateRange.map((d, colIdx) => {
                          const weekend = getWeekendInfo(d);
                          let bg = "";
                          if (weekend.isSaturday) bg = "bg-blue-50/30";
                          else if (weekend.isSunday) bg = "bg-rose-50/30";

                          return (
                            <div
                              key={colIdx}
                              style={{ width: `${cellWidth}px` }}
                              className={`shrink-0 border-r border-gray-100 h-full ${bg}`}
                            />
                          );
                        })}
                      </div>

                      {/* タスクバーの描画 */}
                      {isBarVisible ? (
                        <div
                          style={{
                            left: `${Math.max(2, barLeft + 2)}px`,
                            width: `${Math.max(20, barWidth)}px`,
                            height: "26px",
                          }}
                          onMouseDown={(e) => handleBarMouseDown(e, issue, "move")}
                          onDoubleClick={() => {
                            setDetailIssue(issue);
                            setIsDetailOpen(true);
                          }}
                          className={`absolute z-10 flex items-center px-2 rounded-md shadow-xs cursor-move select-none border transition-all ${
                            styleCfg.bg
                          } ${styleCfg.border} ${styleCfg.text} ${
                            isOverdue
                              ? "ring-2 ring-rose-500 ring-offset-1 border-rose-600 animate-pulse"
                              : ""
                          } ${isDraggingThis ? "opacity-80 scale-[1.02] shadow-md ring-2 ring-emerald-400" : "hover:brightness-105"}`}
                          title={`[${issue.issue_key}] ${issue.title}\n期間: ${effectiveStartDate} 〜 ${effectiveDueDate}\nドラッグして期間移動、端をドラッグして伸縮`}
                        >
                          {/* 左端リサイズハンドル */}
                          <div
                            onMouseDown={(e) => handleBarMouseDown(e, issue, "resize-start")}
                            className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 rounded-l-md transition-colors flex items-center justify-center"
                            title="開始日を変更"
                          >
                            <span className="w-0.5 h-3 bg-white/60 rounded-full" />
                          </div>

                          {/* バー内コンテンツ（キー ＆ タイトル） */}
                          <div className="flex-1 min-w-0 flex items-center gap-1.5 px-1 truncate pointer-events-none">
                            <span className="text-[10px] font-bold opacity-90 shrink-0">
                              {issue.issue_key}
                            </span>
                            <span className="text-[11px] font-medium truncate">
                              {issue.title}
                            </span>
                          </div>

                          {/* 右端リサイズハンドル */}
                          <div
                            onMouseDown={(e) => handleBarMouseDown(e, issue, "resize-end")}
                            className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 rounded-r-md transition-colors flex items-center justify-center"
                            title="期限日を変更"
                          >
                            <span className="w-0.5 h-3 bg-white/60 rounded-full" />
                          </div>
                        </div>
                      ) : (
                        // 日付未設定の場合：行のセルをクリックして日付を設定できるようにガイド
                        <div className="absolute inset-0 flex items-center px-4">
                          <button
                            onClick={() => handleCellClick(issue, today)}
                            className="text-[11px] text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-0.5 rounded border border-dashed border-gray-300 hover:border-emerald-400 flex items-center gap-1 transition-colors"
                            title="クリックすると本日の日付で期間を設定します"
                          >
                            <Plus className="w-3 h-3" />
                            <span>期間未設定（クリックで今日を設定）</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 課題作成モーダル */}
      <CreateIssueModal
        isOpen={isCreateOpen}
        projects={projects}
        selectedProjectId={currentProject?.id || null}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => {
          setIsCreateOpen(false);
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
          // 更新後の最新課題情報を取得して反映
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
      />
    </div>
  );
}
