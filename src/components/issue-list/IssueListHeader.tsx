// 課題一覧ヘッダー＆フィルターツールバーコンポーネント
"use client";

import React from "react";
import {
  Search,
  UserCheck,
  Users,
  CheckCircle2,
  FolderTree,
  AlertTriangle,
  Flame,
  ClipboardCheck,
} from "lucide-react";
import { IssuePriority, IssueStatus, IssueType, User } from "@/types";
import { AssigneeCounts } from "@/lib/assigneeUtils";
import { IssueSortBy, QuickViewMode } from "./issueListUtils";

interface IssueListHeaderProps {
  currentUser: User | null;
  users: User[];
  isPmoOrAdmin: boolean;
  quickView: QuickViewMode;
  onChangeQuickView: (mode: QuickViewMode) => void;
  assigneeFilter: string;
  onChangeAssigneeFilter: (val: string) => void;
  selectedStatus: IssueStatus | "all";
  onSelectStatus?: (status: IssueStatus | "all") => void;
  typeFilter: IssueType | "all";
  onChangeTypeFilter: (val: IssueType | "all") => void;
  priorityFilter: IssuePriority | "all";
  onChangePriorityFilter: (val: IssuePriority | "all") => void;
  resolutionFilter: string;
  onChangeResolutionFilter: (val: string) => void;
  sortBy: IssueSortBy;
  onChangeSortBy: (val: IssueSortBy) => void;
  searchQuery: string;
  onChangeSearchQuery: (val: string) => void;
  withParentRelation: boolean;
  onToggleParentRelation: () => void;
  isShowingClosed: boolean;
  onToggleShowClosed: () => void;
  pageSize: number;
  onChangePageSize: (val: number) => void;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  myIssuesCount: number;
  todayMyIssuesCount: number;
  reviewIssuesCount: number;
  stalledIssuesCount: number;
  assigneeCounts: AssigneeCounts;
}

export default function IssueListHeader({
  currentUser,
  users,
  isPmoOrAdmin,
  quickView,
  onChangeQuickView,
  assigneeFilter,
  onChangeAssigneeFilter,
  selectedStatus,
  onSelectStatus,
  typeFilter,
  onChangeTypeFilter,
  priorityFilter,
  onChangePriorityFilter,
  resolutionFilter,
  onChangeResolutionFilter,
  sortBy,
  onChangeSortBy,
  searchQuery,
  onChangeSearchQuery,
  withParentRelation,
  onToggleParentRelation,
  isShowingClosed,
  onToggleShowClosed,
  pageSize,
  onChangePageSize,
  totalItems,
  startIndex,
  endIndex,
  myIssuesCount,
  todayMyIssuesCount,
  reviewIssuesCount,
  stalledIssuesCount,
  assigneeCounts,
}: IssueListHeaderProps) {
  return (
    <div className="issue-list-header p-4 border-b border-slate-200/80 bg-gradient-to-r from-indigo-50/40 via-white to-violet-50/40 flex flex-wrap items-center justify-between gap-3">
      {/* タイトル・クイック切替タブ */}
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
              遅延・本日締切・処理中
            </span>
          )}
          {quickView === "review" && (
            <span className="text-[11px] font-semibold text-violet-800 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">
              処理済み・検収待ち
            </span>
          )}
          {quickView === "stalled" && (
            <span className="text-[11px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              停滞・遅延・未対応
            </span>
          )}
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
            {pageSize === 0 || totalItems <= pageSize
              ? `${totalItems} 件`
              : `${startIndex} - ${endIndex} / ${totalItems} 件`}
          </span>
        </div>

        {/* ワンクリック切替ピル */}
        <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg text-xs flex-wrap gap-0.5">
          <button
            type="button"
            onClick={() => {
              onChangeAssigneeFilter("all");
              onChangeQuickView("none");
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
              onChangeAssigneeFilter("me");
              onChangeQuickView("none");
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
              onChangeAssigneeFilter("me");
              onChangeQuickView("today");
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
              quickView === "today"
                ? "bg-amber-500 text-white shadow-2xs"
                : "text-amber-700 hover:text-amber-900 hover:bg-amber-100/50"
            }`}
          >
            <Flame
              className={`w-3.5 h-3.5 ${
                quickView === "today" ? "fill-white text-white" : "fill-amber-500 text-amber-500"
              }`}
            />
            <span>今日のマイタスク ({todayMyIssuesCount})</span>
          </button>

          {/* PMO / Admin 限定ピル */}
          {isPmoOrAdmin && (
            <>
              <div className="w-px h-3.5 bg-slate-300 mx-0.5" />
              <button
                type="button"
                onClick={() => onChangeQuickView("review")}
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
                onClick={() => onChangeQuickView("stalled")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  quickView === "stalled"
                    ? "bg-rose-600 text-white shadow-2xs"
                    : "text-rose-700 hover:text-rose-900 hover:bg-rose-100/50"
                }`}
                title="停滞中・期限超過・未対応などのフォローが必要な課題"
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
            onChange={(e) => onChangeSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* 担当者フィルター */}
        <select
          value={assigneeFilter}
          onChange={(e) => {
            onChangeAssigneeFilter(e.target.value);
            onChangeQuickView("none");
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

        {/* 状態フィルター */}
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
          onChange={(e) => onChangeTypeFilter(e.target.value as IssueType | "all")}
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
          onChange={(e) => onChangePriorityFilter(e.target.value as IssuePriority | "all")}
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
            onChange={(e) => onChangeResolutionFilter(e.target.value)}
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
          onChange={(e) => onChangeSortBy(e.target.value as IssueSortBy)}
          className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        >
          <option value="due">ソート: 期限日順</option>
          <option value="updated">ソート: 更新順</option>
          <option value="priority">ソート: 優先度順</option>
        </select>

        {/* 親子階層表示トグル */}
        <button
          type="button"
          onClick={onToggleParentRelation}
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
          onClick={onToggleShowClosed}
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
          onChange={(e) => onChangePageSize(Number(e.target.value))}
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
  );
}
