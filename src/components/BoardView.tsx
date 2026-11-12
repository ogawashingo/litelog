// Backlog風かんばんボード（Board）コンポーネント
"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Filter,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  Columns3,
  Eye,
  EyeOff,
  FolderGit2,
  ChartGantt,
} from "lucide-react";
import { Project, Issue, IssueStatus, IssueType, IssuePriority } from "@/types";
import { TypeBadge, PriorityBadge, ISSUE_STATUS_CONFIG } from "./IssueBadge";
import CreateIssueModal from "./CreateIssueModal";
import IssueDetailModal from "./IssueDetailModal";

interface BoardViewProps {
  projects: Project[];
  currentProject: Project | null;
  issues: Issue[];
  onUpdateStatus: (issueId: number, newStatus: IssueStatus) => Promise<void>;
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
    badgeBg: "bg-teal-100",
    badgeText: "text-teal-700",
    headerBorder: "border-t-teal-500",
  },
  {
    status: "closed",
    title: "完了",
    badgeBg: "bg-gray-100",
    badgeText: "text-gray-600",
    headerBorder: "border-t-gray-400",
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
  // フィルター用State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<IssueType | "all">("all");
  const [filterPriority, setFilterPriority] = useState<IssuePriority | "all">("all");
  const [showClosed, setShowClosed] = useState(true);

  // ドラッグ＆ドロップ用State
  const [draggingIssueId, setDraggingIssueId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<IssueStatus | null>(null);

  // モーダル用State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInitialStatus, setCreateInitialStatus] = useState<IssueStatus>("open");
  const [detailIssue, setDetailIssue] = useState<Issue | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

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
    const issueIdStr = e.dataTransfer.getData("text/plain");
    const issueId = Number(issueIdStr) || draggingIssueId;

    if (!issueId) return;

    const targetIssue = issues.find((i) => i.id === issueId);
    if (!targetIssue || targetIssue.status === newStatus) {
      setDraggingIssueId(null);
      return;
    }

    setDraggingIssueId(null);
    await onUpdateStatus(issueId, newStatus);
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

    if (isClosed) {
      return { label: dueDateStr, color: "text-gray-500", isOverdue: false, isToday: false };
    }

    if (diffDays < 0) {
      return {
        label: `${dueDateStr} (${Math.abs(diffDays)}日超過)`,
        color: "text-red-600 font-semibold bg-red-50 px-1.5 py-0.5 rounded border border-red-200",
        isOverdue: true,
        isToday: false,
      };
    }
    if (diffDays === 0) {
      return {
        label: `${dueDateStr} (今日期限)`,
        color: "text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200",
        isOverdue: false,
        isToday: true,
      };
    }
    return {
      label: dueDateStr,
      color: "text-gray-600",
      isOverdue: false,
      isToday: false,
    };
  };

  // フィルター後の課題一覧
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      // 完了ステータスの非表示
      if (!showClosed && issue.status === "closed") return false;

      // 種別フィルター
      if (filterType !== "all" && issue.issue_type !== filterType) return false;

      // 優先度フィルター
      if (filterPriority !== "all" && issue.priority !== filterPriority) return false;

      // キーワード検索（課題キー、件名、説明文）
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const inKey = issue.issue_key.toLowerCase().includes(query);
        const inTitle = issue.title.toLowerCase().includes(query);
        const inDesc = (issue.description || "").toLowerCase().includes(query);
        if (!inKey && !inTitle && !inDesc) return false;
      }

      return true;
    });
  }, [issues, showClosed, filterType, filterPriority, searchQuery]);

  return (
    <div className="space-y-4">
      {/* ボードヘッダー / フィルターツールバー */}
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

            {/* ガントチャートへのリンク */}
            {currentProject && (
              <Link
                href={`/gantt/${encodeURIComponent(currentProject.key)}`}
                className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-md font-medium border border-gray-300 transition-colors"
                title="ガントチャートで確認"
              >
                <ChartGantt className="w-3.5 h-3.5 text-gray-500" />
                <span>ガントチャート</span>
              </Link>
            )}
          </div>

          {/* 右側: 検索・フィルター・課題追加 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 検索入力 */}
            <div className="relative min-w-[180px] max-w-xs">
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
              className="text-xs bg-white border border-gray-300 rounded-md px-2.5 py-1.5 text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
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
              className="text-xs bg-white border border-gray-300 rounded-md px-2.5 py-1.5 text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">優先度: すべて</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>

            {/* 完了タスクの表示切り替え */}
            <button
              onClick={() => setShowClosed(!showClosed)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                showClosed
                  ? "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 font-semibold"
              }`}
              title={showClosed ? "完了した課題を非表示にする" : "完了した課題を表示する"}
            >
              {showClosed ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{showClosed ? "完了を表示中" : "完了を非表示"}</span>
            </button>

            {/* 新規課題追加ボタン */}
            <button
              onClick={() => handleOpenCreateWithStatus("open")}
              className="flex items-center gap-1 bg-[#2ca078] hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-xs transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>課題の追加</span>
            </button>
          </div>
        </div>
      </div>

      {/* かんばんボード 4カラムレーン */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {BOARD_COLUMNS.map((col) => {
          if (!showClosed && col.status === "closed") {
            return null;
          }

          const columnIssues = filteredIssues.filter((i) => i.status === col.status);
          const isOver = dragOverColumn === col.status;

          return (
            <div
              key={col.status}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={(e) => handleDragLeave(e, col.status)}
              onDrop={(e) => handleDrop(e, col.status)}
              className={`flex flex-col bg-gray-50/80 rounded-lg border-t-4 border border-gray-200 min-h-[500px] transition-all duration-150 ${
                col.headerBorder
              } ${isOver ? "bg-emerald-50/60 ring-2 ring-emerald-500 border-emerald-400" : ""}`}
            >
              {/* レーンヘッダー */}
              <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-white rounded-t-sm">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-gray-800">{col.title}</span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.badgeBg} ${col.badgeText}`}
                  >
                    {columnIssues.length}
                  </span>
                </div>
                <button
                  onClick={() => handleOpenCreateWithStatus(col.status)}
                  title={`${col.title} に課題を追加`}
                  className="p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>

              {/* カード一覧 */}
              <div className="p-2.5 space-y-2.5 flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
                {columnIssues.length === 0 ? (
                  <div
                    className={`h-28 border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-3 text-center transition-colors ${
                      isOver
                        ? "border-emerald-400 bg-emerald-100/30 text-emerald-700"
                        : "border-gray-300 text-gray-400"
                    }`}
                  >
                    <p className="text-xs">
                      {isOver ? "ここにドロップして移動" : "課題はありません"}
                    </p>
                  </div>
                ) : (
                  columnIssues.map((issue) => {
                    const isDragging = draggingIssueId === issue.id;
                    const dueInfo = getDueInfo(issue.due_date, issue.status === "closed");

                    return (
                      <div
                        key={issue.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, issue.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => {
                          setDetailIssue(issue);
                          setIsDetailOpen(true);
                        }}
                        className={`bg-white rounded-lg p-3 border shadow-xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing border-gray-200 hover:border-emerald-400 group relative ${
                          isDragging ? "opacity-40 scale-95 border-emerald-500 shadow-lg" : ""
                        }`}
                      >
                        {/* カード上部: 種別バッジ＆課題キー */}
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <TypeBadge type={issue.issue_type} />
                            <span className="font-mono text-xs font-bold text-gray-500 group-hover:text-emerald-700 transition-colors">
                              {issue.issue_key}
                            </span>
                          </div>
                          <PriorityBadge priority={issue.priority} />
                        </div>

                        {/* カード件名 */}
                        <h4 className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug mb-2 group-hover:text-emerald-800 transition-colors">
                          {issue.title}
                        </h4>

                        {/* カード下部: 期限日・担当者アバター */}
                        <div className="flex items-center justify-between text-[11px] pt-2 border-t border-gray-100 text-gray-500">
                          {/* 期限日 */}
                          <div className="flex items-center gap-1">
                            {dueInfo ? (
                              <span className={`flex items-center gap-1 ${dueInfo.color}`}>
                                {dueInfo.isOverdue ? (
                                  <AlertCircle className="w-3 h-3 text-red-600" />
                                ) : dueInfo.isToday ? (
                                  <Clock className="w-3 h-3 text-amber-600" />
                                ) : (
                                  <Calendar className="w-3 h-3 text-gray-400" />
                                )}
                                <span>{dueInfo.label}</span>
                              </span>
                            ) : (
                              <span className="text-gray-400 text-[10px]">期日なし</span>
                            )}
                          </div>

                          {/* 担当者アイコン（個人利用） */}
                          <div
                            className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[9px] font-bold shadow-2xs"
                            title="担当者: 私"
                          >
                            私
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
          await onRefresh();
          setIsDetailOpen(false);
          setDetailIssue(null);
        }}
        onDeleted={async () => {
          await onRefresh();
          setIsDetailOpen(false);
          setDetailIssue(null);
        }}
      />
    </div>
  );
}
