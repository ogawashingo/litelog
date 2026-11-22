// ガントチャート上部ツールバー（フィルター・期間操作・スケール切替・ペイン開閉コントロール）
"use client";

import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Search,
  CheckCircle2,
  Maximize2,
  Minimize2,
  GitBranch,
  Archive,
} from "lucide-react";
import { Project, IssueStatus, IssueType, IssuePriority, User } from "@/types";
import { DatePicker } from "../DatePicker";
import { parseDateString, formatDateString } from "@/lib/dateUtils";
import { ViewScale, DEFAULT_LEFT_PANE_WIDTH } from "./ganttUtils";

interface GanttToolbarProps {
  currentProject: Project | null;
  isArchived: boolean;
  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  filterAssignee: string;
  onChangeFilterAssignee: (v: string) => void;
  currentUser: User | null;
  users: User[];
  filterType: IssueType | "all";
  onChangeFilterType: (v: IssueType | "all") => void;
  filterStatus: IssueStatus | "all";
  onChangeFilterStatus: (v: IssueStatus | "all") => void;
  filterPriority: IssuePriority | "all";
  onChangeFilterPriority: (v: IssuePriority | "all") => void;
  showClosed: boolean;
  onToggleShowClosed: () => void;
  onShiftPeriod: (monthsDelta: number) => void;
  onGoToToday: () => void;
  startDate: Date;
  onChangeStartDate: (nextD: Date) => void;
  span: number;
  onChangeSpan: (nextSpan: number) => void;
  scale: ViewScale;
  onChangeScale: (nextScale: ViewScale) => void;
  withParentRelation: boolean;
  onChangeWithParentRelation: (val: boolean) => void;
  isLeftPaneOpen: boolean;
  onToggleLeftPane: () => void;
  leftPaneWidth: number;
  onResetSplitter: () => void;
}

export default function GanttToolbar({
  currentProject,
  isArchived,
  searchQuery,
  onChangeSearchQuery,
  filterAssignee,
  onChangeFilterAssignee,
  currentUser,
  users,
  filterType,
  onChangeFilterType,
  filterStatus,
  onChangeFilterStatus,
  filterPriority,
  onChangeFilterPriority,
  showClosed,
  onToggleShowClosed,
  onShiftPeriod,
  onGoToToday,
  startDate,
  onChangeStartDate,
  span,
  onChangeSpan,
  scale,
  onChangeScale,
  withParentRelation,
  onChangeWithParentRelation,
  isLeftPaneOpen,
  onToggleLeftPane,
  leftPaneWidth,
  onResetSplitter,
}: GanttToolbarProps) {
  return (
    <div className="sticky top-[var(--app-header-height,56px)] z-20 bg-white/95 backdrop-blur-md rounded-xl shadow-sm border border-indigo-100/80 p-3 sm:p-4 transition-shadow">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* 左側: プロジェクト情報（タイトル・キー） */}
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
              {isArchived && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700 border border-slate-300">
                  <Archive className="w-3 h-3" />
                  <span>アーカイブ</span>
                </span>
              )}
            </h2>
          </div>
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
              onChange={(e) => onChangeSearchQuery(e.target.value)}
              className="w-full text-sm pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 担当者フィルター */}
          <select
            value={filterAssignee}
            onChange={(e) => onChangeFilterAssignee(e.target.value)}
            className="text-sm bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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
            onChange={(e) => onChangeFilterType(e.target.value as IssueType | "all")}
            className="text-sm bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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
            onChange={(e) => onChangeFilterStatus(e.target.value as IssueStatus | "all")}
            className="text-sm bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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
            onChange={(e) => onChangeFilterPriority(e.target.value as IssuePriority | "all")}
            className="text-sm bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">優先度: すべて</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>

          {/* 完了課題の表示トグル */}
          <button
            onClick={onToggleShowClosed}
            className={`flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
              showClosed
                ? "bg-indigo-50/70 text-indigo-800 border-indigo-200"
                : "bg-white text-slate-400 border-slate-200"
            }`}
            title="完了した課題の表示を切り替えます"
          >
            <CheckCircle2
              className={`w-3.5 h-3.5 ${showClosed ? "text-indigo-600" : "text-slate-400"}`}
            />
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
              onClick={() => onShiftPeriod(-1)}
              className="h-[30px] w-[30px] flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-300 transition-colors cursor-pointer"
              title="1ヶ月前へ移動"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onGoToToday}
              className="h-[30px] flex items-center gap-1 px-2.5 text-sm font-semibold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 rounded-lg transition-colors cursor-pointer"
              title="今日の日付へ移動"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-indigo-600" />
              <span>今日</span>
            </button>
            <button
              onClick={() => onShiftPeriod(1)}
              className="h-[30px] w-[30px] flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-300 transition-colors cursor-pointer"
              title="1ヶ月先へ移動"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 開始日指定（startDate） */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-slate-500 font-semibold">開始日:</span>
            <DatePicker
              value={formatDateString(startDate)}
              onChange={(nextStr) => {
                if (nextStr) {
                  const nextD = parseDateString(nextStr);
                  onChangeStartDate(nextD);
                }
              }}
              allowClear={false}
            />
          </div>

          {/* 表示スパン指定（span） */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-slate-500 font-semibold">表示期間:</span>
            <select
              value={span}
              onChange={(e) => {
                const nextSpan = Number(e.target.value);
                onChangeSpan(nextSpan);
              }}
              className="h-[30px] bg-white border border-slate-300 rounded-lg px-2 text-sm text-slate-700 font-semibold cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value={1}>1ヶ月</option>
              <option value={3}>3ヶ月</option>
              <option value={6}>6ヶ月</option>
              <option value={12}>1年</option>
            </select>
          </div>

          {/* スケール切替ボタングループ (scale=days/weeks/months) - 表示期間のすぐ隣に配置 */}
          <div className="h-[30px] flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-sm">
            {[
              { value: "days" as ViewScale, label: "日" },
              { value: "weeks" as ViewScale, label: "週" },
              { value: "months" as ViewScale, label: "月" },
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => onChangeScale(item.value)}
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
          <label className="h-[30px] flex items-center gap-1.5 text-sm font-semibold text-slate-700 cursor-pointer select-none bg-slate-50 hover:bg-slate-100 border border-slate-300 px-2.5 rounded-lg transition-colors">
            <input
              type="checkbox"
              checked={withParentRelation}
              onChange={(e) => onChangeWithParentRelation(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
            <span>親子課題を表示</span>
          </label>

          {/* 左側課題リストの開閉ボタン */}
          <button
            onClick={onToggleLeftPane}
            className="h-[30px] flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-300 px-2.5 rounded-lg transition-colors cursor-pointer"
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
              onClick={onResetSplitter}
              className="text-[11px] text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-1 rounded transition-colors cursor-pointer"
              title="一覧テーブルの幅を標準サイズに戻す"
            >
              幅リセット
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
