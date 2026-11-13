// Backlog仕様準拠 ガントチャートコンポーネント
// URLクエリパラメータ（span, scale, startDate, withParentRelation）との双方向同期および親子課題ツリー表示対応
"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar as CalendarIcon,
  Search,
  CheckCircle2,
  Plus,
  Maximize2,
  Minimize2,
  Kanban,
  GitBranch,
  CornerDownRight,
} from "lucide-react";
import { Project, Issue, IssueStatus, IssueType, IssuePriority } from "@/types";
import { TypeBadge } from "./IssueBadge";
import IssueDetailModal from "./IssueDetailModal";
import CreateIssueModal from "./CreateIssueModal";
import { useUser } from "./UserContext";
import { DatePicker } from "./DatePicker";
import { getUserInitials } from "./UserManageModal";
import { getJapaneseHoliday } from "@/lib/holidayUtils";
import {
  parseDateString,
  formatDateString,
  formatSlashDateString,
  addDays,
  addMonths,
  diffInDays,
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

// Backlog準拠の表示スケール種別
type ViewScale = "days" | "weeks" | "months";

// スケールごとの1日あたりのセル幅（px）
const SCALE_CELL_WIDTH: Record<ViewScale, number> = {
  days: 34,
  weeks: 14,
  months: 5,
};

// 左ペイン（課題一覧テーブル）の幅設定定数（px）
const DEFAULT_LEFT_PANE_WIDTH = 540;
const MIN_LEFT_PANE_WIDTH = 340;
const MAX_LEFT_PANE_WIDTH = 900;

// ステータスに応じたバーの配色設定（緑を排除したオリジナルカラー）
const STATUS_BAR_STYLES: Record<
  IssueStatus,
  { bg: string; border: string; text: string }
> = {
  open: {
    bg: "bg-rose-500",
    border: "border-rose-600",
    text: "text-white",
  },
  in_progress: {
    bg: "bg-indigo-600",
    border: "border-indigo-700",
    text: "text-white",
  },
  resolved: {
    bg: "bg-violet-500",
    border: "border-violet-600",
    text: "text-white",
  },
  closed: {
    bg: "bg-slate-400",
    border: "border-slate-500",
    text: "text-white",
  },
};

// ツリー表示用の平坦化アイテム型
interface DisplayRow {
  issue: Issue;
  depth: number; // 0: 親または単独課題, 1: 子課題
  hasChildren: boolean;
  childrenIssues: Issue[];
}

export default function GanttChart({
  projects,
  currentProject,
  issues,
  onRefresh,
  onSelectProjectKey,
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
  const [withParentRelation, setWithParentRelation] = useState<boolean>(initialWithParentRelation);

  // ブラウザの戻る/進む操作（popstate）時にURLパラメータとStateを同期
  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const spSpan = Number(sp.get("span"));
      if ([1, 3, 6, 12].includes(spSpan)) setSpan(spSpan);

      const spScale = sp.get("scale");
      if (spScale === "days" || spScale === "weeks" || spScale === "months") setScale(spScale);

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
      const saved = localStorage.getItem("personal-backlog-gantt-left-pane-width");
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
      localStorage.setItem("personal-backlog-gantt-left-pane-width", String(DEFAULT_LEFT_PANE_WIDTH));
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
        localStorage.setItem("personal-backlog-gantt-left-pane-width", String(leftPaneWidth));
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

  const { users, currentUser, settings, effectiveWeekStart, effectiveShowHolidays } = useUser();
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
  const dateRange = useMemo(() => generateDateRange(startDate, endDate), [startDate, endDate]);

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

  // フィルター後の課題一覧
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (!showClosed && issue.status === "closed") return false;
      if (filterAssignee === "me") {
        if (!currentUser || issue.assignee_id !== currentUser.id) return false;
      } else if (filterAssignee === "unassigned") {
        if (issue.assignee_id !== null && issue.assignee_id !== undefined) return false;
      } else if (filterAssignee !== "all") {
        if (issue.assignee_id !== Number(filterAssignee)) return false;
      }
      if (filterType !== "all" && issue.issue_type !== filterType) return false;
      if (filterStatus !== "all" && issue.status !== filterStatus) return false;
      if (filterPriority !== "all" && issue.priority !== filterPriority) return false;
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
  }, [issues, showClosed, filterAssignee, currentUser, filterType, filterStatus, filterPriority, searchQuery]);

  // 親子関係ツリー構造の構築（withParentRelation に対応）
  const displayRows = useMemo<DisplayRow[]>(() => {
    if (!withParentRelation) {
      // フラット表示
      return filteredIssues.map((issue) => ({
        issue,
        depth: 0,
        hasChildren: false,
        childrenIssues: [],
      }));
    }

    // 親IDごとに子課題をグループ化
    const childrenMap = new Map<number, Issue[]>();
    const issueMap = new Map<number, Issue>();

    filteredIssues.forEach((issue) => {
      issueMap.set(issue.id, issue);
    });

    filteredIssues.forEach((issue) => {
      if (issue.parent_id && issueMap.has(issue.parent_id)) {
        const list = childrenMap.get(issue.parent_id) || [];
        list.push(issue);
        childrenMap.set(issue.parent_id, list);
      }
    });

    // ルート（親がいない、またはフィルター後の親が存在しない課題）を抽出
    const roots = filteredIssues.filter(
      (issue) => !issue.parent_id || !issueMap.has(issue.parent_id)
    );

    const rows: DisplayRow[] = [];
    roots.forEach((root) => {
      const children = childrenMap.get(root.id) || [];
      // 子課題は課題番号順にソート
      children.sort((a, b) => a.issue_number - b.issue_number);

      rows.push({
        issue: root,
        depth: 0,
        hasChildren: children.length > 0,
        childrenIssues: children,
      });

      // 折りたたまれていなければ子課題を展開
      if (children.length > 0 && !collapsedParentIds.has(root.id)) {
        children.forEach((child) => {
          rows.push({
            issue: child,
            depth: 1,
            hasChildren: false,
            childrenIssues: [],
          });
        });
      }
    });

    return rows;
  }, [filteredIssues, withParentRelation, collapsedParentIds]);

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
    if (newStatus === "closed") {
      const unclosedChildren = issues.filter(
        (i) => i.parent_id === issueId && i.status !== "closed"
      );
      if (unclosedChildren.length > 0) {
        alert(`未完了の子課題が ${unclosedChildren.length} 件存在するため、親課題を完了にすることはできません。`);
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
        alert(data.error || "ステータス変更に失敗しました");
        onRefresh();
      }
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

      const initStart = dragState.initialStartDate
        ? parseDateString(dragState.initialStartDate)
        : today;
      const initDue = dragState.initialDueDate
        ? parseDateString(dragState.initialDueDate)
        : today;

      if (dragState.mode === "move") {
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
          actorId: currentUser?.id || null,
        }),
      });
      onRefresh();
    } catch (err) {
      console.error("ガントチャート期間更新エラー:", err);
    }
  }, [dragState, onRefresh, currentUser]);

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
    try {
      const targetStr = formatDateString(startDate > today ? startDate : today);
      await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: targetStr,
          dueDate: targetStr,
          actorId: currentUser?.id || null,
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

  // 週スケール用のグループ化（設定された週開始曜日、または先頭区切り）
  const weekGroups = useMemo(() => {
    const groups: { label: string; daysCount: number; startDateStr: string }[] = [];
    dateRange.forEach((d, idx) => {
      const isStartDay = weekStart === "sunday" ? d.getDay() === 0 : d.getDay() === 1;
      if (idx === 0 || isStartDay) {
        groups.push({
          label: `${d.getMonth() + 1}/${d.getDate()}`,
          daysCount: 1,
          startDateStr: formatDateString(d),
        });
      } else {
        groups[groups.length - 1].daysCount++;
      }
    });
    return groups;
  }, [dateRange, weekStart]);

  // 行の高さ（ピクセル）
  const ROW_HEIGHT = 42;

  return (
    <div className="space-y-4">
      {/* ツールバー / フィルター・コントロールバー */}
      <div className="bg-white/95 backdrop-blur-xs rounded-xl shadow-xs border border-indigo-100/80 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* 左側: プロジェクト選択とタイトル */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className="w-3.5 h-7 rounded-sm"
                style={{ backgroundColor: currentProject?.color || "#4f46e5" }}
              />
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <span>{currentProject ? currentProject.name : "すべてのプロジェクト"}</span>
                {currentProject && (
                  <span className="text-sm font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
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
                  className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 cursor-pointer font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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
                className="inline-flex items-center gap-1 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg font-semibold border border-indigo-200 transition-colors"
                title="かんばんボードで確認"
              >
                <Kanban className="w-3.5 h-3.5 text-indigo-600" />
                <span>ボード</span>
              </Link>
            )}
          </div>

          {/* 右側: 検索・フィルター・課題追加 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 検索入力 */}
            <div className="relative min-w-[150px] max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="課題を検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 担当者フィルター */}
            <select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as IssueType | "all")}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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
              className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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
              className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">優先度: すべて</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>

            {/* 完了課題の表示トグル */}
            <button
              onClick={() => setShowClosed(!showClosed)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                showClosed
                  ? "bg-indigo-50/70 text-indigo-800 border-indigo-200"
                  : "bg-white text-slate-400 border-slate-200"
              }`}
              title="完了した課題の表示を切り替えます"
            >
              <CheckCircle2 className={`w-3.5 h-3.5 ${showClosed ? "text-indigo-600" : "text-slate-400"}`} />
              <span>完了を含む</span>
            </button>
          </div>
        </div>

        {/* ガントチャート専用コントローラー行（開始日 / スパン / スケール / 親子関係） */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-3 border-t border-slate-100">
          {/* 左側グループ：期間移動と開始日・表示期間・スケール切替（日・週・月） */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 前へ / 今日 / 次へ */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleShiftPeriod(-1)}
                className="h-[30px] w-[30px] flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-300 transition-colors cursor-pointer"
                title="1ヶ月前へ移動"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleGoToToday}
                className="h-[30px] flex items-center gap-1 px-2.5 text-xs font-semibold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 rounded-lg transition-colors cursor-pointer"
                title="今日の日付へ移動"
              >
                <CalendarIcon className="w-3.5 h-3.5 text-indigo-600" />
                <span>今日</span>
              </button>
              <button
                onClick={() => handleShiftPeriod(1)}
                className="h-[30px] w-[30px] flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-300 transition-colors cursor-pointer"
                title="1ヶ月先へ移動"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* 開始日指定（startDate） */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-semibold">開始日:</span>
              <DatePicker
                value={formatDateString(startDate)}
                onChange={(nextStr) => {
                  if (nextStr) {
                    const nextD = parseDateString(nextStr);
                    setStartDate(nextD);
                    updateUrlParams({ startDate: nextD });
                  }
                }}
                allowClear={false}
              />
            </div>

            {/* 表示スパン指定（span） */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-semibold">表示期間:</span>
              <select
                value={span}
                onChange={(e) => {
                  const nextSpan = Number(e.target.value);
                  setSpan(nextSpan);
                  updateUrlParams({ span: nextSpan });
                }}
                className="h-[30px] bg-white border border-slate-300 rounded-lg px-2 text-xs text-slate-700 font-semibold cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value={1}>1ヶ月</option>
                <option value={3}>3ヶ月</option>
                <option value={6}>6ヶ月</option>
                <option value={12}>1年</option>
              </select>
            </div>

            {/* スケール切替ボタングループ (scale=days/weeks/months) - 表示期間のすぐ隣に配置 */}
            <div className="h-[30px] flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              {[
                { value: "days" as ViewScale, label: "日" },
                { value: "weeks" as ViewScale, label: "週" },
                { value: "months" as ViewScale, label: "月" },
              ].map((item) => (
                <button
                  key={item.value}
                  onClick={() => {
                    setScale(item.value);
                    updateUrlParams({ scale: item.value });
                  }}
                  className={`h-[24px] px-2.5 flex items-center justify-center rounded-md font-semibold transition-all cursor-pointer ${
                    scale === item.value
                      ? "bg-white text-indigo-800 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 右側グループ：親子課題トグル(withParentRelation) ・ 一覧開閉 */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 親子課題関連の表示切り替え (withParentRelation) */}
            <label className="h-[30px] flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer select-none bg-slate-50 hover:bg-slate-100 border border-slate-300 px-2.5 rounded-lg transition-colors">
              <input
                type="checkbox"
                checked={withParentRelation}
                onChange={(e) => {
                  const val = e.target.checked;
                  setWithParentRelation(val);
                  updateUrlParams({ withParentRelation: val });
                }}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
              <span>親子課題を表示</span>
            </label>

            {/* 左側課題リストの開閉ボタン */}
            <button
              onClick={() => setIsLeftPaneOpen(!isLeftPaneOpen)}
              className="h-[30px] flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-300 px-2.5 rounded-lg transition-colors cursor-pointer"
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

            {/* 一覧幅が変更されている場合の幅リセットボタン */}
            {isLeftPaneOpen && leftPaneWidth !== DEFAULT_LEFT_PANE_WIDTH && (
              <button
                onClick={handleResetSplitter}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-1 rounded transition-colors cursor-pointer"
                title="一覧テーブルの幅を標準サイズに戻す"
              >
                幅リセット
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ガントチャート本体エリア（左右分割レイアウト） */}
      <div
        ref={chartContainerRef}
        className={`bg-white rounded-lg shadow-xs border border-gray-200 overflow-hidden flex relative ${
          isResizingLeftPane ? "select-none cursor-col-resize" : ""
        }`}
      >
        {/* ================= 左ペイン：課題一覧テーブル ================= */}
        {isLeftPaneOpen && (
          <div
            style={{ width: `${leftPaneWidth}px` }}
            className="shrink-0 flex flex-col bg-white select-none"
          >
            {/* テーブルヘッダー（高さ: 52px = 右側の2段ヘッダーと正確に一致） */}
            <div className="h-[52px] bg-gray-50 border-b border-gray-200 flex items-center px-3 text-xs font-bold text-gray-600">
              <div className="w-[100px] shrink-0">課題キー</div>
              <div className="flex-1 min-w-0 pr-2">件名</div>
              <div className="w-[34px] shrink-0 text-center">担当</div>
              <div className="w-[66px] shrink-0 text-center">状態</div>
              <div className="w-[58px] shrink-0 text-center">期限日</div>
            </div>

            {/* 課題一覧ボディ（タイムラインと連動して縦スクロール） */}
            <div
              ref={leftTableScrollRef}
              onScroll={handleLeftTableScroll}
              className="overflow-y-auto overflow-x-hidden max-h-[620px] divide-y divide-gray-100"
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
                  const isOverdue =
                    !isClosed && issue.due_date && issue.due_date < todayStr;
                  const isCollapsed = collapsedParentIds.has(issue.id);
                  const unclosedChildren = childrenIssues.filter((c) => c.status !== "closed");
                  const hasUnclosedChildren = unclosedChildren.length > 0;

                  return (
                    <div
                      key={issue.id}
                      onMouseEnter={() => setHoveredIssueId(issue.id)}
                      onMouseLeave={() => setHoveredIssueId(null)}
                      style={{ height: `${ROW_HEIGHT}px` }}
                      className={`group flex items-center px-3 text-xs transition-colors ${
                        hasChildren ? "bg-slate-50/70 font-semibold" : ""
                      } ${isHovered ? "bg-indigo-50/70" : "hover:bg-slate-50/80"}`}
                    >
                      {/* 課題キー ＆ 展開トグル/ツリーアイコン ＆ 種別アイコン */}
                      <div className="w-[100px] shrink-0 flex items-center gap-1">
                        {withParentRelation && depth > 0 && (
                          <CornerDownRight className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
                        )}
                        {withParentRelation && hasChildren && (
                          <button
                            onClick={() => toggleParentCollapse(issue.id)}
                            className="p-0.5 rounded hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer"
                            title={isCollapsed ? "子課題を展開" : "子課題を折りたたむ"}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                        <TypeBadge type={issue.issue_type} showLabel={false} />
                        <button
                          onClick={() => {
                            setDetailIssue(issue);
                            setIsDetailOpen(true);
                          }}
                          className="font-semibold text-indigo-700 hover:text-indigo-950 hover:underline truncate cursor-pointer font-mono"
                          title="詳細を開く"
                        >
                          {issue.issue_key}
                        </button>
                      </div>

                      {/* 課題名 ＆ クイック子課題追加ボタン */}
                      <div className="flex-1 min-w-0 pr-2 flex items-center justify-between gap-1">
                        <button
                          onClick={() => {
                            setDetailIssue(issue);
                            setIsDetailOpen(true);
                          }}
                          className={`text-left truncate flex-1 cursor-pointer ${
                            isClosed
                              ? "line-through text-slate-400"
                              : hasChildren
                              ? "font-bold text-slate-900 hover:text-indigo-700"
                              : "font-medium text-slate-800 hover:text-indigo-700"
                          }`}
                          title={issue.title}
                        >
                          {issue.title}
                        </button>

                        {/* 親課題の場合、子課題件数と＋ボタンを表示 */}
                        {withParentRelation && depth === 0 && (
                          <div className="flex items-center gap-1 shrink-0">
                            {hasChildren && (
                              <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full font-bold">
                                {childrenIssues.length}
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setCreateDefaultParentId(issue.id);
                                setIsCreateOpen(true);
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
                          className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[9px] font-bold"
                          title={issue.assignee_name ? `担当: ${issue.assignee_name}` : "担当: 未割当"}
                        >
                          {getUserInitials(issue.assignee_name)}
                        </div>
                      </div>

                      {/* 状態変更セレクター */}
                      <div className="w-[66px] shrink-0 text-center">
                        <select
                          value={issue.status}
                          onChange={(e) =>
                            handleQuickStatusChange(issue.id, e.target.value as IssueStatus)
                          }
                          className="w-full text-[11px] font-semibold bg-white border border-slate-300 rounded px-1 py-0.5 text-slate-700 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                          title={hasUnclosedChildren ? `未完了の子課題が ${unclosedChildren.length} 件あるため完了にできません` : undefined}
                        >
                          <option value="open">未対応</option>
                          <option value="in_progress">処理中</option>
                          <option value="resolved">処理済み</option>
                          <option value="closed" disabled={hasUnclosedChildren}>
                            完了{hasUnclosedChildren ? " (不可)" : ""}
                          </option>
                        </select>
                      </div>

                      {/* 期限日 */}
                      <div className="w-[58px] shrink-0 text-center font-medium text-[11px]">
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
              {/* ---------- タイムラインヘッダー（2段：年月 ＆ 日/週/月ラベル） ---------- */}
              <div className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200">
                {/* 1段目：年月グループ */}
                <div className="flex border-b border-gray-200 text-xs font-bold text-gray-700 h-[26px]">
                  {monthGroups.map((g, idx) => (
                    <div
                      key={idx}
                      style={{ width: `${g.daysCount * cellWidth}px` }}
                      className="px-2 flex items-center border-r border-gray-300 truncate bg-gray-100/90"
                    >
                      <span>
                        {g.year}年 {g.month}月
                      </span>
                    </div>
                  ))}
                </div>

                {/* 2段目：スケールに応じた目盛り */}
                {scale === "days" && (
                  <div className="flex text-[11px] h-[26px]">
                    {dateRange.map((d, idx) => {
                      const dateStr = formatDateString(d);
                      const isToday = dateStr === todayStr;
                      const weekend = getWeekendInfo(d);
                      const dayNum = d.getDate();
                      const weekday = getWeekdayJa(d);
                      const holidayName = showHolidays ? getJapaneseHoliday(d) : null;
                      const isHoliday = Boolean(holidayName);

                      let colBg = "bg-white";
                      let textColor = "text-gray-600";
                      if (weekend.isSaturday) {
                        colBg = "bg-blue-50/70";
                        textColor = "text-blue-600";
                      } else if (weekend.isSunday || isHoliday) {
                        colBg = "bg-rose-50/70";
                        textColor = "text-rose-600 font-bold";
                      }

                      const cellTooltip = holidayName
                        ? `${dateStr} (${weekday}・祝日: ${holidayName})`
                        : `${dateStr} (${weekday})`;

                      return (
                        <div
                          key={idx}
                          style={{ width: `${cellWidth}px` }}
                          className={`shrink-0 flex flex-col items-center justify-center border-r border-slate-200 ${colBg} ${
                            isToday ? "bg-indigo-100/80 font-bold" : ""
                          }`}
                          title={cellTooltip}
                        >
                          <span
                            className={`leading-none ${
                              isToday ? "text-indigo-900 font-extrabold" : textColor
                            }`}
                          >
                            {dayNum}
                          </span>
                          <span
                            className={`text-[9px] scale-90 leading-none ${
                              isToday ? "text-indigo-700 font-bold" : textColor
                            }`}
                          >
                            {weekday}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {scale === "weeks" && (
                  <div className="flex text-[10px] h-[26px]">
                    {weekGroups.map((wg, idx) => (
                      <div
                        key={idx}
                        style={{ width: `${wg.daysCount * cellWidth}px` }}
                        className="shrink-0 flex items-center px-1.5 border-r border-gray-300 bg-white text-gray-600 font-medium truncate"
                      >
                        {wg.label}〜
                      </div>
                    ))}
                  </div>
                )}

                {scale === "months" && (
                  <div className="flex text-[10px] h-[26px]">
                    {monthGroups.map((mg, idx) => (
                      <div
                        key={idx}
                        style={{ width: `${mg.daysCount * cellWidth}px` }}
                        className="shrink-0 flex items-center justify-around border-r border-gray-300 bg-white text-gray-500"
                      >
                        <span>上旬</span>
                        <span>中旬</span>
                        <span>下旬</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ---------- タイムライングリッド背景レイヤー（軽量化のため1回だけ描画） ---------- */}
              <div className="relative">
                {/* 背面グリッド縦線と週末色付け */}
                <div className="absolute inset-0 flex pointer-events-none z-0">
                  {dateRange.map((d, colIdx) => {
                    const weekend = getWeekendInfo(d);
                    const isHoliday = Boolean(showHolidays && getJapaneseHoliday(d));
                    const isWeekStartDay = weekStart === "sunday" ? d.getDay() === 0 : d.getDay() === 1;
                    const isWeekEndDay = weekStart === "sunday" ? d.getDay() === 6 : d.getDay() === 0;
                    const isFirstOfMonth = d.getDate() === 1;

                    let bg = "";
                    if (scale === "days") {
                      if (weekend.isSaturday) bg = "bg-blue-50/30";
                      else if (weekend.isSunday || isHoliday) bg = "bg-rose-50/30";
                    }

                    let borderClass = "border-r border-gray-100";
                    if (scale === "weeks" && isWeekEndDay) {
                      borderClass = "border-r border-gray-300";
                    } else if (scale === "months") {
                      borderClass = isFirstOfMonth ? "border-l border-gray-300" : "";
                    } else if (isWeekStartDay && scale === "days") {
                      borderClass = "border-r border-gray-100 border-l border-l-gray-200/70";
                    }

                    return (
                      <div
                        key={colIdx}
                        style={{ width: `${cellWidth}px` }}
                        className={`shrink-0 h-full ${borderClass} ${bg}`}
                      />
                    );
                  })}
                </div>

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

                {/* ---------- 各課題の行 ＆ タスクバー描画 ---------- */}
                <div className="relative divide-y divide-gray-100 z-10">
                  {displayRows.map((row) => {
                    const { issue, hasChildren, childrenIssues } = row;
                    const isHovered = hoveredIssueId === issue.id;
                    const isDraggingThis = dragState?.issueId === issue.id;

                    // 親課題かつ子課題が存在する場合：子課題の期間を包括するサマリー期間を計算
                    let summaryStartStr: string | null = null;
                    let summaryDueStr: string | null = null;

                    if (withParentRelation && hasChildren) {
                      const allDates: string[] = [];
                      if (issue.start_date) allDates.push(issue.start_date);
                      if (issue.due_date) allDates.push(issue.due_date);
                      childrenIssues.forEach((c) => {
                        if (c.start_date) allDates.push(c.start_date);
                        if (c.due_date) allDates.push(c.due_date);
                      });
                      if (allDates.length > 0) {
                        allDates.sort();
                        summaryStartStr = allDates[0];
                        summaryDueStr = allDates[allDates.length - 1];
                      }
                    }

                    // 実際にバー描画に使う開始日・期限日
                    const effectiveStartDate = isDraggingThis
                      ? dragState.currentStartDate
                      : summaryStartStr || issue.start_date || issue.due_date;
                    const effectiveDueDate = isDraggingThis
                      ? dragState.currentDueDate
                      : summaryDueStr || issue.due_date || issue.start_date;

                    let barLeft = 0;
                    let barWidth = 0;
                    let isBarVisible = false;

                    if (effectiveStartDate && effectiveDueDate) {
                      const startD = parseDateString(effectiveStartDate);
                      const dueD = parseDateString(effectiveDueDate);

                      const startOffset = diffInDays(timelineStartDate, startD);
                      const durationDays = Math.max(1, diffInDays(startD, dueD) + 1);

                      barLeft = startOffset * cellWidth;
                      barWidth = durationDays * cellWidth - 2;
                      isBarVisible = true;
                    }

                    const isClosed = issue.status === "closed";
                    const isOverdue =
                      !isClosed && issue.due_date && issue.due_date < todayStr;
                    const styleCfg = STATUS_BAR_STYLES[issue.status] || STATUS_BAR_STYLES.open;
                    const isSummaryBar = withParentRelation && hasChildren;

                    // 親バーの場合の子課題完了進捗率
                    const completedChildrenCount = childrenIssues.filter(
                      (c) => c.status === "closed"
                    ).length;
                    const progressPercent =
                      childrenIssues.length > 0
                        ? Math.round((completedChildrenCount / childrenIssues.length) * 100)
                        : 0;

                    return (
                      <div
                        key={issue.id}
                        onMouseEnter={() => setHoveredIssueId(issue.id)}
                        onMouseLeave={() => setHoveredIssueId(null)}
                        style={{ height: `${ROW_HEIGHT}px` }}
                        className={`relative flex items-center transition-colors ${
                          isHovered ? "bg-indigo-50/40" : ""
                        }`}
                      >
                        {isBarVisible ? (
                          isSummaryBar ? (
                            // 親課題用のサマリーバー（ブラケット風）
                            <>
                              <div
                                style={{
                                  left: `${barLeft + 1}px`,
                                  width: `${Math.max(16, barWidth)}px`,
                                  height: "20px",
                                }}
                                onClick={() => {
                                  setDetailIssue(issue);
                                  setIsDetailOpen(true);
                                }}
                                className="absolute flex flex-col justify-start cursor-pointer group/bar z-10"
                                title={`[親課題: ${issue.issue_key}] ${issue.title}\n全体期間: ${effectiveStartDate} 〜 ${effectiveDueDate}\n子課題進捗: ${completedChildrenCount}/${childrenIssues.length} (${progressPercent}%)`}
                              >
                                {/* 親バー本体 */}
                                <div className="w-full h-3.5 bg-indigo-950 rounded-t-sm relative overflow-hidden flex items-center px-1.5 shadow-xs">
                                  {/* 進捗ゲージ */}
                                  <div
                                    style={{ width: `${progressPercent}%` }}
                                    className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                                  />
                                  <span className="relative z-10 text-[9px] font-bold text-white truncate">
                                    {issue.issue_key} {issue.title} ({progressPercent}%)
                                  </span>
                                </div>
                                {/* 両端の下向き三角形ブラケット装飾 */}
                                <div className="flex justify-between w-full">
                                  <div className="w-0 h-0 border-t-[6px] border-t-indigo-950 border-r-[6px] border-r-transparent" />
                                  <div className="w-0 h-0 border-t-[6px] border-t-indigo-950 border-l-[6px] border-l-transparent" />
                                </div>
                              </div>
                              {/* 親バー幅が狭い場合、右外側に件名をインライン表示して全体を確認可能に */}
                              {barWidth < 180 && (
                                <div
                                  style={{
                                    left: `${barLeft + Math.max(16, barWidth) + 8}px`,
                                    maxWidth: "380px",
                                  }}
                                  className="absolute pointer-events-none flex items-center gap-1.5 text-[11px] text-slate-800 font-bold select-none whitespace-nowrap z-0"
                                >
                                  <span className="font-mono text-[10px] text-indigo-700">
                                    {issue.issue_key}
                                  </span>
                                  <span className="truncate">{issue.title}</span>
                                </div>
                              )}
                            </>
                          ) : (
                            // 通常課題／子課題用のドラッグ＆リサイズ可能バー
                            <>
                              <div
                                style={{
                                  left: `${barLeft + 1}px`,
                                  width: `${Math.max(14, barWidth)}px`,
                                  height: "24px",
                                }}
                                onMouseDown={(e) => handleBarMouseDown(e, issue, "move")}
                                onDoubleClick={() => {
                                  setDetailIssue(issue);
                                  setIsDetailOpen(true);
                                }}
                                className={`absolute flex items-center px-1.5 rounded-md shadow-xs cursor-move select-none border transition-all z-10 ${
                                  styleCfg.bg
                                } ${styleCfg.border} ${styleCfg.text} ${
                                  isOverdue
                                    ? "ring-2 ring-rose-500 ring-offset-1 border-rose-600"
                                    : ""
                                } ${
                                  isDraggingThis
                                    ? "opacity-80 scale-[1.02] shadow-md ring-2 ring-indigo-400 z-20"
                                    : "hover:brightness-105"
                                }`}
                                title={`[${issue.issue_key}] ${issue.title}\n期間: ${effectiveStartDate} 〜 ${effectiveDueDate}\nドラッグして日付移動、左右端でリサイズ`}
                              >
                                {/* 左端リサイズハンドル */}
                                <div
                                  onMouseDown={(e) => handleBarMouseDown(e, issue, "resize-start")}
                                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 rounded-l-md transition-colors"
                                  title="開始日を変更"
                                />

                                {/* バー内テキスト（幅が狭いときは隠れる） */}
                                {barWidth >= 40 && (
                                  <div className="flex-1 min-w-0 flex items-center gap-1 px-1 truncate pointer-events-none">
                                    <span className="text-[10px] font-bold opacity-90 shrink-0">
                                      {issue.issue_key}
                                    </span>
                                    <span className="text-[11px] font-medium truncate">
                                      {issue.title}
                                    </span>
                                  </div>
                                )}

                                {/* 右端リサイズハンドル */}
                                <div
                                  onMouseDown={(e) => handleBarMouseDown(e, issue, "resize-end")}
                                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 rounded-r-md transition-colors"
                                  title="期限日を変更"
                                />
                              </div>
                              {/* バー幅が狭い場合、右外側に件名をインライン表示して視認性を確保 */}
                              {barWidth < 160 && (
                                <div
                                  style={{
                                    left: `${barLeft + Math.max(14, barWidth) + 8}px`,
                                    maxWidth: "380px",
                                  }}
                                  className="absolute pointer-events-none flex items-center gap-1.5 text-[11px] text-slate-700 font-medium select-none whitespace-nowrap z-0"
                                >
                                  <span className="font-semibold text-slate-400 font-mono text-[10px]">
                                    {issue.issue_key}
                                  </span>
                                  <span className="truncate">{issue.title}</span>
                                </div>
                              )}
                            </>
                          )
                        ) : (
                          // 日付未設定の場合
                          <div className="px-3">
                            <button
                              onClick={() => handleSetDefaultDates(issue)}
                              className="text-[10px] text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-0.5 rounded border border-dashed border-slate-300 hover:border-indigo-400 flex items-center gap-1 transition-colors cursor-pointer"
                              title="クリックすると基準日で期間を設定します"
                            >
                              <Plus className="w-3 h-3" />
                              <span>期間未設定</span>
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
      />
    </div>
  );
}
