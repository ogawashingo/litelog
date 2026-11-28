// 課題一覧のフィルタリング・ソート・親子ツリー構築・行メタ計算ユーティリティ
import { Issue, IssuePriority, IssueStatus, IssueType, SystemSettings, User } from "@/types";
import { parseDbTimestamp, getTodayDateString, formatDueDateDisplay } from "@/lib/dateUtils";
import { getIssueAlert, IssueAlert } from "@/lib/issueAlerts";

export type QuickViewMode = "none" | "today" | "review" | "stalled";
export type IssueSortBy = "due" | "updated" | "priority";

export interface DisplayedIssueItem {
  issue: Issue;
  depth: number;
}

export interface DueDateInfo {
  text: string;
  isOverdue: boolean;
  isToday: boolean;
  diffDays: number | null;
}

export interface IssueRowMeta {
  dueInfo: DueDateInfo;
  isClosed: boolean;
  isPinned: boolean;
  issueAlert: IssueAlert | null;
  nonOverdueAlert: IssueAlert | null;
  isChild: boolean;
  isParent: boolean;
  childrenCount: number;
  unclosedChildrenCount: number;
  hasUnclosedChildren: boolean;
  completedChildrenCount: number;
  parentIssue: Issue | undefined;
}

// 期限日の相対表現フォーマッター（設定タイムゾーン基準）
export function formatRelativeDueDate(
  dateStr: string | null,
  settings: SystemSettings | null | undefined
): DueDateInfo {
  if (!dateStr) return { text: "-", isOverdue: false, isToday: false, diffDays: null };

  const todayStr = getTodayDateString(settings ?? undefined);
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
  }
  if (diffDays === 0) {
    return {
      text: `${formattedDate} (本日)`,
      isOverdue: false,
      isToday: true,
      diffDays: 0,
    };
  }
  if (diffDays === 1) {
    return {
      text: `${formattedDate} (明日)`,
      isOverdue: false,
      isToday: false,
      diffDays: 1,
    };
  }
  return {
    text: `${formattedDate} (残${diffDays}日)`,
    isOverdue: false,
    isToday: false,
    diffDays,
  };
}

export interface FilterIssuesOptions {
  quickView: QuickViewMode;
  selectedStatus: IssueStatus | "all";
  isShowingClosed: boolean;
  assigneeFilter: string;
  typeFilter: IssueType | "all";
  priorityFilter: IssuePriority | "all";
  resolutionFilter: string;
  searchQuery: string;
  currentUser: User | null;
  todayStr: string;
  settings: SystemSettings | null | undefined;
}

// 課題一覧のフィルタリング処理
export function filterIssues(issues: Issue[], options: FilterIssuesOptions): Issue[] {
  const {
    quickView,
    selectedStatus,
    isShowingClosed,
    assigneeFilter,
    typeFilter,
    priorityFilter,
    resolutionFilter,
    searchQuery,
    currentUser,
    todayStr,
    settings,
  } = options;

  const trimmedQuery = searchQuery.trim().toLowerCase();

  return issues.filter((issue) => {
    if (quickView === "today") {
      if (!currentUser || issue.assignee_id !== currentUser.id) return false;
      if (issue.status === "closed") return false;
      const isUrgentDue = Boolean(issue.due_date && issue.due_date <= todayStr);
      const isInProgress = issue.status === "in_progress";
      if (!isUrgentDue && !isInProgress) return false;
    } else if (quickView === "review") {
      if (issue.status !== "resolved") return false;
    } else if (quickView === "stalled") {
      if (issue.status === "closed") return false;
      if (!getIssueAlert(issue, settings ?? undefined)) return false;
    } else {
      if (selectedStatus !== "all" && issue.status !== selectedStatus) {
        return false;
      }
      if (!isShowingClosed && issue.status === "closed") {
        return false;
      }
      if (assigneeFilter === "me") {
        if (!currentUser || issue.assignee_id !== currentUser.id) return false;
      } else if (assigneeFilter === "unassigned") {
        if (issue.assignee_id !== null && issue.assignee_id !== undefined) return false;
      } else if (assigneeFilter !== "all") {
        if (issue.assignee_id !== Number(assigneeFilter)) return false;
      }
    }

    if (typeFilter !== "all" && issue.issue_type !== typeFilter) {
      return false;
    }
    if (priorityFilter !== "all" && issue.priority !== priorityFilter) {
      return false;
    }
    if (isShowingClosed && resolutionFilter !== "all") {
      if (resolutionFilter === "unspecified") {
        if (issue.resolution) return false;
      } else if (issue.resolution !== resolutionFilter) {
        return false;
      }
    }
    if (trimmedQuery) {
      const matchKey = issue.issue_key.toLowerCase().includes(trimmedQuery);
      const matchTitle = issue.title.toLowerCase().includes(trimmedQuery);
      const matchDesc = issue.description.toLowerCase().includes(trimmedQuery);
      const matchAssignee = (issue.assignee_name || "").toLowerCase().includes(trimmedQuery);
      if (!matchKey && !matchTitle && !matchDesc && !matchAssignee) {
        return false;
      }
    }
    return true;
  });
}

// ソートおよび親子ツリー順の課題配列を構築
export function buildDisplayedIssues(
  filteredIssues: Issue[],
  options: {
    withParentRelation: boolean;
    sortBy: IssueSortBy;
    selectedStatus: IssueStatus | "all";
  }
): DisplayedIssueItem[] {
  const { withParentRelation, sortBy, selectedStatus } = options;

  const compareIssues = (a: Issue, b: Issue) => {
    // 完了は常に下部に配置（ただし完了タブ表示時は通常ソート）
    if (selectedStatus === "all") {
      if (a.status === "closed" && b.status !== "closed") return 1;
      if (a.status !== "closed" && b.status === "closed") return -1;
    }

    // 個人ピン留め課題（未完了のみ）を常に最上部に優先配置
    const aPinned = a.status !== "closed" && Boolean(a.is_pinned);
    const bPinned = b.status !== "closed" && Boolean(b.is_pinned);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;

    if (sortBy === "due") {
      if (!a.due_date && b.due_date) return 1;
      if (a.due_date && !b.due_date) return -1;
      if (a.due_date && b.due_date) {
        return a.due_date.localeCompare(b.due_date);
      }
      return b.id - a.id;
    }
    if (sortBy === "priority") {
      const priorityOrder: Record<IssuePriority, number> = { high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return parseDbTimestamp(b.updated_at).getTime() - parseDbTimestamp(a.updated_at).getTime();
  };

  if (!withParentRelation) {
    return [...filteredIssues].sort(compareIssues).map((issue) => ({
      issue,
      depth: 0,
    }));
  }

  // 親子関係ツリー順に整理して配置（ピン留め済み課題を最優先グループとして先頭にまとめる）
  const buildTreeGroup = (group: Issue[]): DisplayedIssueItem[] => {
    const groupIdSet = new Set(group.map((i) => i.id));
    const childrenMap = new Map<number, Issue[]>();

    group.forEach((issue) => {
      if (issue.parent_id && groupIdSet.has(issue.parent_id)) {
        const list = childrenMap.get(issue.parent_id) || [];
        list.push(issue);
        childrenMap.set(issue.parent_id, list);
      }
    });

    const roots = group
      .filter((i) => !i.parent_id || !groupIdSet.has(i.parent_id))
      .sort(compareIssues);

    const groupResult: DisplayedIssueItem[] = [];
    roots.forEach((root) => {
      groupResult.push({ issue: root, depth: 0 });
      const children = childrenMap.get(root.id) || [];
      children.sort((a, b) => a.issue_number - b.issue_number);
      children.forEach((child) => {
        groupResult.push({ issue: child, depth: 1 });
      });
    });

    return groupResult;
  };

  const pinnedGroup = filteredIssues.filter((i) => i.status !== "closed" && Boolean(i.is_pinned));
  const normalGroup = filteredIssues.filter((i) => i.status === "closed" || !Boolean(i.is_pinned));

  return [...buildTreeGroup(pinnedGroup), ...buildTreeGroup(normalGroup)];
}

// ページ番号ボタングループ生成
export function buildPageNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
    return pages;
  }

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
  return pages;
}

// 行ごとの親子・アラート・期日メタ情報を計算
export function buildIssueRowMeta(
  issue: Issue,
  depth: number,
  issueById: Map<number, Issue>,
  childrenByParentId: Map<number, Issue[]>,
  settings: SystemSettings | null | undefined
): IssueRowMeta {
  const dueInfo = formatRelativeDueDate(issue.due_date, settings);
  const isClosed = issue.status === "closed";
  const isPinned = !isClosed && Boolean(issue.is_pinned);
  const issueAlert = getIssueAlert(issue, settings ?? undefined);
  const nonOverdueAlert = issueAlert && issueAlert.type !== "overdue" ? issueAlert : null;

  const isChild = Boolean(issue.parent_id);
  const childrenOfThis = childrenByParentId.get(issue.id) || [];
  const isParent = childrenOfThis.length > 0;
  const unclosedChildrenCount = childrenOfThis.filter((c) => c.status !== "closed").length;
  const hasUnclosedChildren = unclosedChildrenCount > 0;
  const completedChildrenCount = childrenOfThis.length - unclosedChildrenCount;
  const parentIssue = depth > 0 && issue.parent_id ? issueById.get(issue.parent_id) : undefined;

  return {
    dueInfo,
    isClosed,
    isPinned,
    issueAlert,
    nonOverdueAlert,
    isChild,
    isParent,
    childrenCount: childrenOfThis.length,
    unclosedChildrenCount,
    hasUnclosedChildren,
    completedChildrenCount,
    parentIssue,
  };
}
