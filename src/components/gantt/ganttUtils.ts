// ガントチャート用の定数・型・純粋計算ユーティリティ

import { Issue, IssueStatus, IssueType, IssuePriority, User } from "@/types";
import { parseDateString, formatDateString, addDays, diffInDays } from "@/lib/dateUtils";

// Backlog準拠の表示スケール種別
export type ViewScale = "days" | "weeks" | "months";

// スケールごとの1日あたりのセル幅（px）
export const SCALE_CELL_WIDTH: Record<ViewScale, number> = {
  days: 34,
  weeks: 14,
  months: 5,
};

// 左ペイン（課題一覧テーブル）の幅設定定数（px）
export const DEFAULT_LEFT_PANE_WIDTH = 440;
export const MIN_LEFT_PANE_WIDTH = 260;
export const MAX_LEFT_PANE_WIDTH = 800;

// 行の高さ（ピクセル）
export const ROW_HEIGHT = 42;

// ステータスに応じたバーの配色設定（緑を排除したオリジナルカラー）
export const STATUS_BAR_STYLES: Record<
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
export interface DisplayRow {
  issue: Issue;
  depth: number; // 0: 親または単独課題, 1: 子課題
  hasChildren: boolean;
  childrenIssues: Issue[];
}

// ドラッグ操作による日付変更 State
export interface DragState {
  issueId: number;
  mode: "move" | "resize-start" | "resize-end";
  startX: number;
  initialStartDate: string | null;
  initialDueDate: string | null;
  currentStartDate: string | null;
  currentDueDate: string | null;
}

// 年・月ヘッダーのグループ型
export interface MonthGroup {
  year: number;
  month: number;
  daysCount: number;
}

// 週スケール用のグループ型
export interface WeekGroup {
  label: string;
  daysCount: number;
  startDateStr: string;
}

// フィルターオプション型
export interface IssueFilterParams {
  showClosed?: boolean;
  filterAssignee: string;
  currentUser: User | null;
  filterType: IssueType | "all";
  filterStatus: IssueStatus | "all";
  filterPriority: IssuePriority | "all";
  searchQuery: string;
}

// 課題一覧のフィルタリング純関数
export function filterGanttIssues(issues: Issue[], params: IssueFilterParams): Issue[] {
  const {
    showClosed = true,
    filterAssignee,
    currentUser,
    filterType,
    filterStatus,
    filterPriority,
    searchQuery,
  } = params;

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
}

// 親子関係ツリー構造の構築（withParentRelation に対応）
export function buildDisplayRows(
  filteredIssues: Issue[],
  withParentRelation: boolean,
  collapsedParentIds: Set<number>
): DisplayRow[] {
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
}

// 年・月ヘッダーのグループ化
export function buildMonthGroups(dateRange: Date[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
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
}

// 週スケール用のグループ化（設定された週開始曜日、または先頭区切り）
export function buildWeekGroups(dateRange: Date[], weekStart: string): WeekGroup[] {
  const groups: WeekGroup[] = [];
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
}

// ドラッグ中の日付シフト計算
export function calculateDraggedDates(
  dragState: DragState,
  deltaX: number,
  cellWidth: number,
  today: Date
): { currentStartDate: string | null; currentDueDate: string | null } | null {
  const daysShift = Math.round(deltaX / cellWidth);

  if (daysShift === 0 && dragState.currentStartDate === dragState.initialStartDate) {
    return null;
  }

  const initStart = dragState.initialStartDate
    ? parseDateString(dragState.initialStartDate)
    : today;
  const initDue = dragState.initialDueDate
    ? parseDateString(dragState.initialDueDate)
    : today;

  if (dragState.mode === "move") {
    const newStart = addDays(initStart, daysShift);
    const newDue = addDays(initDue, daysShift);
    return {
      currentStartDate: formatDateString(newStart),
      currentDueDate: formatDateString(newDue),
    };
  } else if (dragState.mode === "resize-start") {
    const newStart = addDays(initStart, daysShift);
    if (newStart <= initDue) {
      return {
        currentStartDate: formatDateString(newStart),
        currentDueDate: dragState.currentDueDate,
      };
    }
  } else if (dragState.mode === "resize-end") {
    const newDue = addDays(initDue, daysShift);
    if (newDue >= initStart) {
      return {
        currentStartDate: dragState.currentStartDate,
        currentDueDate: formatDateString(newDue),
      };
    }
  }

  return null;
}

// 行のバー描画情報（親サマリー期間・座標・幅・進捗率）の計算
export interface BarLayoutInfo {
  effectiveStartDate: string | null | undefined;
  effectiveDueDate: string | null | undefined;
  barLeft: number;
  barWidth: number;
  isBarVisible: boolean;
  isSummaryBar: boolean;
  completedChildrenCount: number;
  progressPercent: number;
}

export function calculateRowBarLayout(
  row: DisplayRow,
  withParentRelation: boolean,
  dragState: DragState | null,
  timelineStartDate: Date,
  cellWidth: number
): BarLayoutInfo {
  const { issue, hasChildren, childrenIssues } = row;
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

  const isSummaryBar = withParentRelation && hasChildren;

  // 親バーの場合の子課題完了進捗率
  const completedChildrenCount = childrenIssues.filter((c) => c.status === "closed").length;
  const progressPercent =
    childrenIssues.length > 0
      ? Math.round((completedChildrenCount / childrenIssues.length) * 100)
      : 0;

  return {
    effectiveStartDate,
    effectiveDueDate,
    barLeft,
    barWidth,
    isBarVisible,
    isSummaryBar,
    completedChildrenCount,
    progressPercent,
  };
}
