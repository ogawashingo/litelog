// 課題一覧テーブルコンポーネント（チーム全体／自分の課題／担当者別フィルター対応）
"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Issue,
  IssueStatus,
  IssueType,
  IssuePriority,
  IssueResolution,
  canManageIssues,
} from "@/types";
import { useUser } from "./UserContext";
import { getTodayDateString } from "@/lib/dateUtils";
import { getIssueAlert } from "@/lib/issueAlerts";
import { calculateAssigneeCounts } from "@/lib/assigneeUtils";
import {
  buildDisplayedIssues,
  filterIssues,
  IssueSortBy,
  QuickViewMode,
} from "./issue-list/issueListUtils";
import IssueListHeader from "./issue-list/IssueListHeader";
import IssueListMobileView from "./issue-list/IssueListMobileView";
import IssueListTableView from "./issue-list/IssueListTableView";
import IssueListPagination from "./issue-list/IssueListPagination";

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
  onTogglePin?: (issueId: number, nextPinned: boolean) => void;
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
  onTogglePin,
  onDeleteIssue,
  isLoading = false,
}: IssueListProps) {
  const { users, currentUser, settings } = useUser();

  const [searchQuery, setSearchQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all"); // "all" | "me" | "unassigned" | userId文字列
  const [quickView, setQuickView] = useState<QuickViewMode>("none");
  const [typeFilter, setTypeFilter] = useState<IssueType | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | "all">("all");
  const [resolutionFilter, setResolutionFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<IssueSortBy>("due");
  const [withParentRelation, setWithParentRelation] = useState<boolean>(true);
  const [showClosed, setShowClosed] = useState(false);
  const [pageSize, setPageSize] = useState<number>(25);
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

  const isPmoOrAdmin = canManageIssues(currentUser);
  const isShowingClosed = selectedStatus === "closed" || showClosed;
  const todayStr = useMemo(() => getTodayDateString(settings), [settings]);

  // 行レンダリング高速化のための ID・親子ルックアップMapを事前構築
  const { issueById, childrenByParentId } = useMemo(() => {
    const byId = new Map<number, Issue>();
    const byParent = new Map<number, Issue[]>();
    for (const item of issues) {
      byId.set(item.id, item);
      if (item.parent_id) {
        const list = byParent.get(item.parent_id);
        if (list) {
          list.push(item);
        } else {
          byParent.set(item.parent_id, [item]);
        }
      }
    }
    return { issueById: byId, childrenByParentId: byParent };
  }, [issues]);

  // 各種クイックビュー用カウント集計
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

  const reviewIssuesCount = useMemo(
    () => issues.filter((i) => i.status === "resolved").length,
    [issues]
  );

  const stalledIssuesCount = useMemo(
    () =>
      issues.filter((i) => i.status !== "closed" && Boolean(getIssueAlert(i, settings))).length,
    [issues, settings]
  );

  const assigneeCounts = useMemo(() => {
    const baseIssues = issues.filter((issue) => {
      if (selectedStatus !== "all" && issue.status !== selectedStatus) return false;
      if (!isShowingClosed && issue.status === "closed") return false;
      return true;
    });
    return calculateAssigneeCounts(baseIssues, currentUser?.id);
  }, [issues, selectedStatus, isShowingClosed, currentUser?.id]);

  const myIssuesCount = useMemo(() => {
    if (!currentUser) return 0;
    return issues.filter(
      (i) =>
        i.assignee_id === currentUser.id &&
        (selectedStatus === "all" || i.status === selectedStatus) &&
        (isShowingClosed || i.status !== "closed")
    ).length;
  }, [issues, currentUser, selectedStatus, isShowingClosed]);

  // フィルタリング＆ソート・親子ツリー構築
  const filteredIssues = useMemo(
    () =>
      filterIssues(issues, {
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
      }),
    [
      issues,
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
    ]
  );

  const displayedIssues = useMemo(
    () =>
      buildDisplayedIssues(filteredIssues, {
        withParentRelation,
        sortBy,
        selectedStatus,
      }),
    [filteredIssues, withParentRelation, sortBy, selectedStatus]
  );

  // ページネーション計算
  const totalItems = displayedIssues.length;
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedIssues = useMemo(() => {
    if (pageSize === 0) return displayedIssues;
    const start = (currentPage - 1) * pageSize;
    return displayedIssues.slice(start, start + pageSize);
  }, [displayedIssues, currentPage, pageSize]);

  const startIndex = totalItems === 0 ? 0 : pageSize === 0 ? 1 : (currentPage - 1) * pageSize + 1;
  const endIndex = pageSize === 0 ? totalItems : Math.min(currentPage * pageSize, totalItems);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;
    setCurrentPage(newPage);
    listContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      ref={listContainerRef}
      className="bg-white/95 backdrop-blur-xs rounded-xl shadow-xs border border-indigo-100/80 overflow-hidden"
    >
      {/* リストヘッダー & フィルターコントロール */}
      <IssueListHeader
        currentUser={currentUser}
        users={users}
        isPmoOrAdmin={isPmoOrAdmin}
        quickView={quickView}
        onChangeQuickView={setQuickView}
        assigneeFilter={assigneeFilter}
        onChangeAssigneeFilter={setAssigneeFilter}
        selectedStatus={selectedStatus}
        onSelectStatus={onSelectStatus}
        typeFilter={typeFilter}
        onChangeTypeFilter={setTypeFilter}
        priorityFilter={priorityFilter}
        onChangePriorityFilter={setPriorityFilter}
        resolutionFilter={resolutionFilter}
        onChangeResolutionFilter={setResolutionFilter}
        sortBy={sortBy}
        onChangeSortBy={setSortBy}
        searchQuery={searchQuery}
        onChangeSearchQuery={setSearchQuery}
        withParentRelation={withParentRelation}
        onToggleParentRelation={() => setWithParentRelation((prev) => !prev)}
        isShowingClosed={isShowingClosed}
        onToggleShowClosed={() => {
          if (selectedStatus === "closed") {
            onSelectStatus?.("all");
            setShowClosed(false);
          } else {
            setShowClosed((prev) => !prev);
          }
        }}
        pageSize={pageSize}
        onChangePageSize={setPageSize}
        totalItems={totalItems}
        startIndex={startIndex}
        endIndex={endIndex}
        myIssuesCount={myIssuesCount}
        todayMyIssuesCount={todayMyIssuesCount}
        reviewIssuesCount={reviewIssuesCount}
        stalledIssuesCount={stalledIssuesCount}
        assigneeCounts={assigneeCounts}
      />

      {/* スマホ・iPhone用 課題一覧リスト */}
      <IssueListMobileView
        isLoading={isLoading}
        quickView={quickView}
        totalDisplayedCount={displayedIssues.length}
        paginatedIssues={paginatedIssues}
        issueById={issueById}
        childrenByParentId={childrenByParentId}
        settings={settings}
        onSelectIssue={onSelectIssue}
        onTogglePin={onTogglePin}
      />

      {/* PC・タブレット用 課題一覧テーブル */}
      <IssueListTableView
        isLoading={isLoading}
        isShowingClosed={isShowingClosed}
        quickView={quickView}
        totalDisplayedCount={displayedIssues.length}
        paginatedIssues={paginatedIssues}
        issueById={issueById}
        childrenByParentId={childrenByParentId}
        users={users}
        currentUser={currentUser}
        settings={settings}
        onSelectIssue={onSelectIssue}
        onUpdateType={onUpdateType}
        onUpdateStatus={onUpdateStatus}
        onUpdateAssignee={onUpdateAssignee}
        onUpdatePriority={onUpdatePriority}
        onUpdateResolution={onUpdateResolution}
        onUpdateDueDate={onUpdateDueDate}
        onTogglePin={onTogglePin}
        onDeleteIssue={onDeleteIssue}
      />

      {/* ページネーションフッターバー */}
      <IssueListPagination
        totalItems={totalItems}
        startIndex={startIndex}
        endIndex={endIndex}
        pageSize={pageSize}
        onChangePageSize={setPageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
