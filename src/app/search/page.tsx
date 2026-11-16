// プロジェクト横断 全体キーワード検索＆進捗マトリクス画面 (/search)
"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import CreateIssueModal from "@/components/CreateIssueModal";
import IssueDetailModal from "@/components/IssueDetailModal";
import BackupModal from "@/components/BackupModal";
import { useUser } from "@/components/UserContext";
import { Project, Issue, IssueStatus, IssueType, IssuePriority } from "@/types";
import { ISSUE_STATUS_CONFIG, TypeBadge, StatusBadge, PriorityBadge } from "@/components/IssueBadge";
import { getUserInitials } from "@/components/UserManageModal";
import { formatTimestamp, parseDbTimestamp, getTodayDateString } from "@/lib/dateUtils";
import { getStoredProjectId, setStoredProjectId } from "@/lib/projectStorage";
import {
  Search,
  Layers,
  ListFilter,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  Plus,
  ArrowRight,
  Filter,
  RefreshCw,
  FolderGit2,
  Sparkles,
  TableProperties,
  LayoutGrid,
  Check,
  Calendar,
  UserCheck,
  Paperclip,
  MessageSquare,
} from "lucide-react";

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const { currentUser, users, settings } = useUser();

  // プロジェクト一覧と課題一覧
  const [projects, setProjects] = useState<Project[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [currentQuery, setCurrentQuery] = useState(initialQuery);
  const [isLoading, setIsLoading] = useState(false);

  // 表示モード切替: 'matrix' (マトリクス) | 'list' (課題一覧リスト)
  const [viewMode, setViewMode] = useState<"matrix" | "list">("matrix");
  // マトリクス内表示形式: 'cards' (プロジェクト別カード) | 'grid' (ステータス×プロジェクト格子)
  const [matrixStyle, setMatrixStyle] = useState<"cards" | "grid">("cards");

  // 選択中プロジェクトID（ヘッダープルダウン・画面内フィルター・URLクエリ双方向同期）
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  // フィルター用ステート（リスト表示用）
  const [filterProjectId, setFilterProjectId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAssigneeId, setFilterAssigneeId] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updated" | "due" | "priority">("updated");

  // モーダル管理
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [createDefaultProjectId, setCreateDefaultProjectId] = useState<number | undefined>(undefined);
  const [createDefaultTitle, setCreateDefaultTitle] = useState<string>("");

  // プロジェクト一覧の取得
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data: Project[] = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error("プロジェクト一覧取得失敗:", err);
    }
  }, []);

  // 課題の検索取得
  const fetchSearchResults = useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const url = query.trim()
        ? `/api/issues?q=${encodeURIComponent(query.trim())}`
        : "/api/issues";
      const res = await fetch(url);
      if (res.ok) {
        const data: Issue[] = await res.json();
        setIssues(data);
      }
    } catch (err) {
      console.error("検索結果取得失敗:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初期ロードおよびURLクエリ変更時
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    const q = searchParams.get("q") || "";
    setCurrentQuery(q);
    fetchSearchResults(q);

    // URLクエリからprojectIdを同期（未指定時はnull＝全プロジェクト対象）
    const pParam = searchParams.get("projectId");
    if (pParam !== null) {
      const pid = Number(pParam);
      if (!isNaN(pid) && pid > 0) {
        setSelectedProjectId(pid);
        setFilterProjectId(String(pid));
        setStoredProjectId(pid);
        return;
      }
    }
    setSelectedProjectId(null);
    setFilterProjectId("all");
  }, [searchParams, fetchSearchResults]);

  // プロジェクト選択変更ハンドラ（ヘッダープルダウン連動）
  const handleSelectProject = useCallback(
    (id: number | null) => {
      setSelectedProjectId(id);
      setStoredProjectId(id);
      setFilterProjectId(id ? String(id) : "all");

      // URLクエリパラメータの同期
      const params = new URLSearchParams();
      if (currentQuery) params.set("q", currentQuery);
      if (id) params.set("projectId", String(id));
      const newQuery = params.toString();
      router.push(newQuery ? `/search?${newQuery}` : "/search");
    },
    [currentQuery, router]
  );

  // 画面内プロジェクトフィルター変更ハンドラ
  const handleFilterProjectChange = useCallback(
    (val: string) => {
      const id = val === "all" ? null : Number(val);
      handleSelectProject(id);
    },
    [handleSelectProject]
  );

  // 選択中のProjectオブジェクト
  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectId) || null;
  }, [projects, selectedProjectId]);

  // 課題選択ハンドラ（モーダル表示）
  const handleOpenIssueDetail = (issue: Issue) => {
    setSelectedIssue(issue);
    setIsDetailOpen(true);
  };

  // 特定プロジェクトへのクイック課題起票
  const handleQuickCreateForProject = (proj: Project) => {
    setCreateDefaultProjectId(proj.id);
    setCreateDefaultTitle(currentQuery ? `【${currentQuery}】` : "");
    setIsCreateOpen(true);
  };

  // プロジェクトごとの課題マッピング（マトリクス用：プロジェクト選択時は該当プロジェクトに絞り込み）
  const projectMatrixData = useMemo(() => {
    const targetProjects = selectedProjectId
      ? projects.filter((p) => p.id === selectedProjectId)
      : projects;

    return targetProjects.map((proj) => {
      const projIssues = issues.filter((i) => i.project_id === proj.id);
      const total = projIssues.length;
      const closed = projIssues.filter((i) => i.status === "closed").length;
      const inProgress = projIssues.filter((i) => i.status === "in_progress" || i.status === "resolved").length;
      const open = projIssues.filter((i) => i.status === "open").length;

      // プロジェクト全体のステータス判定
      let statusType: "none" | "completed" | "in_progress" | "open" = "none";
      if (total === 0) {
        statusType = "none"; // チケット未作成
      } else if (closed === total) {
        statusType = "completed"; // 全対応完了
      } else if (inProgress > 0 || closed > 0) {
        statusType = "in_progress"; // 進行中
      } else {
        statusType = "open"; // 未着手
      }

      return {
        project: proj,
        issues: projIssues,
        total,
        closed,
        inProgress,
        open,
        statusType,
        progressPercent: total > 0 ? Math.round((closed / total) * 100) : 0,
      };
    });
  }, [projects, issues]);

  // 課題リストのフィルタリングとソート（リスト表示用）
  const filteredIssues = useMemo(() => {
    return issues
      .filter((issue) => {
        if (filterProjectId !== "all" && issue.project_id !== Number(filterProjectId)) return false;
        if (filterStatus !== "all" && issue.status !== filterStatus) return false;
        if (filterType !== "all" && issue.issue_type !== filterType) return false;
        if (filterPriority !== "all" && issue.priority !== filterPriority) return false;
        if (filterAssigneeId !== "all") {
          if (filterAssigneeId === "unassigned" && issue.assignee_id !== null) return false;
          if (filterAssigneeId === "me" && issue.assignee_id !== currentUser?.id) return false;
          if (filterAssigneeId !== "unassigned" && filterAssigneeId !== "me" && issue.assignee_id !== Number(filterAssigneeId)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "due") {
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        }
        if (sortBy === "priority") {
          const pOrder = { high: 3, medium: 2, low: 1 };
          return pOrder[b.priority] - pOrder[a.priority];
        }
        return b.updated_at.localeCompare(a.updated_at);
      });
  }, [issues, filterProjectId, filterStatus, filterType, filterPriority, filterAssigneeId, sortBy, currentUser]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans transition-colors duration-150">
      {/* グローバルヘッダー（検索窓に現在のキーワードを同期） */}
      <Header
        activeNav="search"
        projects={projects}
        selectedProjectId={selectedProjectId}
        searchQuery={currentQuery}
        onSelectProject={handleSelectProject}
        onOpenCreateIssue={() => {
          setCreateDefaultProjectId(selectedProjectId || undefined);
          setCreateDefaultTitle("");
          setIsCreateOpen(true);
        }}
        onOpenBackup={() => setIsBackupOpen(true)}
        onSelectIssue={(key) => {
          const found = issues.find((i) => i.issue_key === key);
          if (found) {
            handleOpenIssueDetail(found);
          } else {
            router.push(`/search?q=${encodeURIComponent(key)}`);
          }
        }}
      />

      <main className="flex-1 max-w-[1800px] w-full mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-6 space-y-5">
        {/* 上部: 検索条件 ＆ 結果サマリー（ヘッダー検索窓へ一本化しスッキリ表示） */}
        <section className="bg-white rounded-xl shadow-xs border border-slate-200/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm text-slate-600">
          <div className="flex items-center gap-2 flex-wrap">
            <Search className="w-4 h-4 text-indigo-600 shrink-0" />
            <div>
              {currentQuery ? (
                <span>
                  {selectedProject && (
                    <span className="font-semibold text-slate-700 mr-1.5">
                      [{selectedProject.key}] {selectedProject.name} 内の
                    </span>
                  )}
                  キーワード「<strong className="text-slate-900 font-bold">{currentQuery}</strong>」の検索結果:{" "}
                  <strong className="text-indigo-600 font-bold">{filteredIssues.length}</strong> 件
                  {selectedProjectId && issues.length !== filteredIssues.length && (
                    <span className="text-slate-400 text-[11px] sm:text-xs ml-1">
                      （全プロジェクト計: {issues.length} 件）
                    </span>
                  )}
                </span>
              ) : (
                <span>
                  {selectedProject && (
                    <span className="font-semibold text-slate-700 mr-1.5">
                      [{selectedProject.key}] {selectedProject.name} の
                    </span>
                  )}
                  課題を表示中: <strong className="text-slate-900 font-bold">{filteredIssues.length}</strong> 件
                  {selectedProjectId && issues.length !== filteredIssues.length && (
                    <span className="text-slate-400 text-[11px] sm:text-xs ml-1">
                      （全プロジェクト計: {issues.length} 件）
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          {currentQuery && (
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams();
                if (selectedProjectId) params.set("projectId", String(selectedProjectId));
                const newQuery = params.toString();
                router.push(newQuery ? `/search?${newQuery}` : "/search");
              }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors w-fit flex items-center gap-1.5 cursor-pointer shrink-0"
              title="検索キーワードを解除して全件表示に戻す"
            >
              <span>検索条件をクリア</span>
            </button>
          )}
        </section>

        {/* ビュー切り替えタブ（マトリクス vs 課題一覧リスト） */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setViewMode("matrix")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === "matrix"
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>プロジェクト別マトリクス</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ListFilter className="w-4 h-4" />
              <span>課題一覧（{filteredIssues.length}件）</span>
            </button>
          </div>

          {/* マトリクス表示時のレイアウト切替（カード vs 表グリッド） */}
          {viewMode === "matrix" && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-500 text-[11px] font-medium mr-1">表示形式:</span>
              <button
                type="button"
                onClick={() => setMatrixStyle("cards")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                  matrixStyle === "cards"
                    ? "bg-white border-indigo-300 text-indigo-700 shadow-2xs font-bold"
                    : "bg-transparent border-slate-200 text-slate-600 hover:bg-white"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>案件カード形式</span>
              </button>
              <button
                type="button"
                onClick={() => setMatrixStyle("grid")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                  matrixStyle === "grid"
                    ? "bg-white border-indigo-300 text-indigo-700 shadow-2xs font-bold"
                    : "bg-transparent border-slate-200 text-slate-600 hover:bg-white"
                }`}
              >
                <TableProperties className="w-3.5 h-3.5" />
                <span>ステータスマトリクス表</span>
              </button>
            </div>
          )}
        </div>

        {/* ＝＝＝＝＝ ビュー1: プロジェクト別マトリクス ＝＝＝＝＝ */}
        {viewMode === "matrix" && (
          <div className="space-y-4">
            {matrixStyle === "cards" ? (
              // カード形式: 各プロジェクトの対応状況とチケットカード一覧
              <div className="grid grid-cols-1 gap-4">
                {projectMatrixData.map(({ project, issues: projIssues, total, closed, inProgress, open, statusType, progressPercent }) => {
                  return (
                    <div
                      key={project.id}
                      className={`bg-white rounded-2xl border transition-all shadow-xs overflow-hidden ${
                        statusType === "none"
                          ? "border-dashed border-rose-200 bg-rose-50/20"
                          : statusType === "completed"
                          ? "border-emerald-200/80 bg-white"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      {/* プロジェクトヘッダー */}
                      <div className="px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-50/70 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                            style={{ backgroundColor: project.color || "#4f46e5" }}
                          />
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-xs font-extrabold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                              {project.key}
                            </span>
                            <h3 className="font-bold text-sm sm:text-base text-slate-800">
                              {project.name}
                            </h3>
                          </div>

                          {/* 状況バッジ */}
                          {statusType === "completed" && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              対応完了 ({closed}/{total})
                            </span>
                          )}
                          {statusType === "in_progress" && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3 text-blue-600" />
                              進行中 ({closed}/{total} 完了)
                            </span>
                          )}
                          {statusType === "open" && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-full">
                              <AlertCircle className="w-3 h-3 text-amber-600" />
                              未着手 ({total} 件)
                            </span>
                          )}
                          {statusType === "none" && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-full">
                              <HelpCircle className="w-3 h-3 text-rose-600" />
                              チケット未起票
                            </span>
                          )}
                        </div>

                        {/* 右側アクション */}
                        <div className="flex items-center gap-3">
                          {/* クイック課題起票ボタン */}
                          <button
                            type="button"
                            onClick={() => handleQuickCreateForProject(project)}
                            className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-indigo-600 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>課題を追加</span>
                          </button>
                        </div>
                      </div>

                      {/* プロジェクトの該当課題一覧 */}
                      <div className="p-4 sm:p-5">
                        {projIssues.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {projIssues.map((issue) => (
                              <div
                                key={issue.id}
                                onClick={() => handleOpenIssueDetail(issue)}
                                className="group p-3 rounded-xl border border-slate-200/80 hover:border-indigo-400 bg-slate-50/50 hover:bg-white hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-2.5"
                              >
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-xs font-bold text-indigo-600 group-hover:underline">
                                      {issue.issue_key}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <StatusBadge status={issue.status} />
                                    </div>
                                  </div>
                                  <h4 className="text-xs sm:text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
                                    {issue.title}
                                  </h4>
                                </div>

                                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                                  <div className="flex items-center gap-1.5 truncate">
                                    {issue.assignee_name ? (
                                      <div className="flex items-center gap-1">
                                        <div
                                          style={{ backgroundColor: issue.assignee_color || "#4f46e5" }}
                                          className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                                        >
                                          {getUserInitials(issue.assignee_name)}
                                        </div>
                                        <span className="truncate">{issue.assignee_name}</span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 italic">未割当</span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {issue.due_date && (
                                      <span className="text-[10px] text-slate-500 font-mono">
                                        期日: {issue.due_date}
                                      </span>
                                    )}
                                    {Boolean(issue.comment_count) && (
                                      <span className="flex items-center gap-0.5 text-slate-400">
                                        <MessageSquare className="w-3 h-3" />
                                        <span>{issue.comment_count}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-3 px-4 text-center rounded-lg bg-slate-50/50 border border-dashed border-slate-200 text-xs text-slate-400">
                            該当する課題はありません
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // 表形式ステータスマトリクス（横: ステータス × 縦: プロジェクト）
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="p-3 w-56">プロジェクト</th>
                      <th className="p-3 w-36 text-center">対応状況</th>
                      <th className="p-3 bg-amber-50/50 text-amber-900 border-l border-slate-200">
                        未対応
                      </th>
                      <th className="p-3 bg-blue-50/50 text-blue-900 border-l border-slate-200">
                        進行中
                      </th>
                      <th className="p-3 bg-emerald-50/50 text-emerald-900 border-l border-slate-200">
                        完了
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {projectMatrixData.map(({ project, issues: projIssues, total, closed, inProgress, open, statusType }) => {
                      const openList = projIssues.filter((i) => i.status === "open");
                      const inProgressList = projIssues.filter((i) => i.status === "in_progress" || i.status === "resolved");
                      const closedList = projIssues.filter((i) => i.status === "closed");

                      return (
                        <tr key={project.id} className="hover:bg-slate-50/50 transition-colors">
                          {/* プロジェクト名 */}
                          <td className="p-3 align-top">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: project.color || "#4f46e5" }}
                              />
                              <div>
                                <span className="font-mono text-[10px] text-slate-400 block font-bold">
                                  {project.key}
                                </span>
                                <span className="font-bold text-slate-800 text-xs sm:text-sm">
                                  {project.name}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleQuickCreateForProject(project)}
                              className="mt-2 text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              <span>課題を起票</span>
                            </button>
                          </td>

                          {/* 対応状況 */}
                          <td className="p-3 align-top text-center whitespace-nowrap">
                            {statusType === "completed" && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2.5 py-1 rounded-full">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                対応完了 ({closed}/{total})
                              </span>
                            )}
                            {statusType === "in_progress" && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-100/70 px-2.5 py-1 rounded-full">
                                <Clock className="w-3 h-3 text-blue-600" />
                                進行中 ({closed}/{total})
                              </span>
                            )}
                            {statusType === "open" && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100/70 px-2.5 py-1 rounded-full">
                                <AlertCircle className="w-3 h-3 text-amber-600" />
                                未着手 ({total})
                              </span>
                            )}
                            {statusType === "none" && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100/80 px-2.5 py-1 rounded-full">
                                <HelpCircle className="w-3 h-3 text-rose-600" />
                                チケット未作成
                              </span>
                            )}
                          </td>

                          {/* 未対応セル */}
                          <td className="p-3 align-top border-l border-slate-100 bg-amber-50/20">
                            <div className="space-y-1.5">
                              {openList.map((issue) => (
                                <button
                                  key={issue.id}
                                  type="button"
                                  onClick={() => handleOpenIssueDetail(issue)}
                                  className="w-full p-2 bg-white rounded-lg border border-slate-200 hover:border-amber-400 hover:shadow-xs text-left transition-all cursor-pointer block"
                                >
                                  <div className="font-mono font-bold text-[10px] text-amber-700">
                                    {issue.issue_key}
                                  </div>
                                  <div className="text-xs font-medium text-slate-800 truncate">
                                    {issue.title}
                                  </div>
                                </button>
                              ))}
                              {openList.length === 0 && (
                                <span className="text-[11px] text-slate-400 block text-center py-2">-</span>
                              )}
                            </div>
                          </td>

                          {/* 進行中セル */}
                          <td className="p-3 align-top border-l border-slate-100 bg-blue-50/20">
                            <div className="space-y-1.5">
                              {inProgressList.map((issue) => (
                                <button
                                  key={issue.id}
                                  type="button"
                                  onClick={() => handleOpenIssueDetail(issue)}
                                  className="w-full p-2 bg-white rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-xs text-left transition-all cursor-pointer block"
                                >
                                  <div className="font-mono font-bold text-[10px] text-blue-700">
                                    {issue.issue_key}
                                  </div>
                                  <div className="text-xs font-medium text-slate-800 truncate">
                                    {issue.title}
                                  </div>
                                </button>
                              ))}
                              {inProgressList.length === 0 && (
                                <span className="text-[11px] text-slate-400 block text-center py-2">-</span>
                              )}
                            </div>
                          </td>

                          {/* 完了セル */}
                          <td className="p-3 align-top border-l border-slate-100 bg-emerald-50/20">
                            <div className="space-y-1.5">
                              {closedList.map((issue) => (
                                <button
                                  key={issue.id}
                                  type="button"
                                  onClick={() => handleOpenIssueDetail(issue)}
                                  className="w-full p-2 bg-white rounded-lg border border-slate-200 hover:border-emerald-400 hover:shadow-xs text-left transition-all cursor-pointer block opacity-85 hover:opacity-100"
                                >
                                  <div className="font-mono font-bold text-[10px] text-emerald-700">
                                    {issue.issue_key}
                                  </div>
                                  <div className="text-xs font-medium text-slate-600 line-through truncate">
                                    {issue.title}
                                  </div>
                                </button>
                              ))}
                              {closedList.length === 0 && (
                                <span className="text-[11px] text-slate-400 block text-center py-2">-</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ＝＝＝＝＝ ビュー2: 課題一覧（本家Backlogリスト表示） ＝＝＝＝＝ */}
        {viewMode === "list" && (
          <div className="space-y-4">
            {/* フィルター＆ソートコントロールバー */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3 sm:p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                {/* プロジェクト */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">プロジェクト</label>
                  <select
                    value={filterProjectId}
                    onChange={(e) => handleFilterProjectChange(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800"
                  >
                    <option value="all">すべてのプロジェクト</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.key}] {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 状態 */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">状態</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800"
                  >
                    <option value="all">すべての状態</option>
                    <option value="open">未対応</option>
                    <option value="in_progress">処理中</option>
                    <option value="resolved">処理済み</option>
                    <option value="closed">完了</option>
                  </select>
                </div>

                {/* 担当者 */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">担当者</label>
                  <select
                    value={filterAssigneeId}
                    onChange={(e) => setFilterAssigneeId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800"
                  >
                    <option value="all">全員</option>
                    <option value="me">自分の担当</option>
                    <option value="unassigned">未割当</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 種別 */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">種別</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800"
                  >
                    <option value="all">すべての種別</option>
                    <option value="task">タスク</option>
                    <option value="bug">バグ</option>
                    <option value="request">要望</option>
                    <option value="other">その他</option>
                  </select>
                </div>

                {/* 優先度 */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">優先度</label>
                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800"
                  >
                    <option value="all">すべての優先度</option>
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </div>

                {/* ソート順 */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">並び替え</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as "updated" | "due" | "priority")}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800"
                  >
                    <option value="updated">更新日順</option>
                    <option value="due">期限日順</option>
                    <option value="priority">優先度順</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 課題一覧テーブル */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
              {filteredIssues.length > 0 ? (
                <table className="w-full border-collapse text-left text-xs min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="p-3 w-36">プロジェクト</th>
                      <th className="p-3 w-28">課題キー</th>
                      <th className="p-3 w-20">種別</th>
                      <th className="p-3">件名</th>
                      <th className="p-3 w-24">状態</th>
                      <th className="p-3 w-20">優先度</th>
                      <th className="p-3 w-32">担当者</th>
                      <th className="p-3 w-28">期限日</th>
                      <th className="p-3 w-28">更新日時</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredIssues.map((issue) => (
                      <tr
                        key={issue.id}
                        onClick={() => handleOpenIssueDetail(issue)}
                        className="hover:bg-indigo-50/40 transition-colors cursor-pointer group"
                      >
                        {/* プロジェクト */}
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: issue.project_color || "#4f46e5" }}
                            />
                            <span className="font-bold text-slate-700 truncate max-w-[120px]">
                              {issue.project_name || "プロジェクト"}
                            </span>
                          </div>
                        </td>

                        {/* 課題キー */}
                        <td className="p-3 whitespace-nowrap font-mono font-bold text-indigo-600 group-hover:underline">
                          {issue.issue_key}
                        </td>

                        {/* 種別 */}
                        <td className="p-3 whitespace-nowrap">
                          <TypeBadge type={issue.issue_type} />
                        </td>

                        {/* 件名 */}
                        <td className="p-3 font-medium text-slate-900 group-hover:text-indigo-600 transition-colors">
                          <div className="flex items-center gap-2">
                            <span className="truncate">{issue.title}</span>
                            {Boolean(issue.comment_count) && (
                              <span className="flex items-center gap-0.5 text-[11px] text-slate-400 font-normal">
                                <MessageSquare className="w-3 h-3" />
                                {issue.comment_count}
                              </span>
                            )}
                            {Boolean(issue.attachment_count) && (
                              <span className="flex items-center gap-0.5 text-[11px] text-slate-400 font-normal">
                                <Paperclip className="w-3 h-3" />
                                {issue.attachment_count}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 状態 */}
                        <td className="p-3 whitespace-nowrap">
                          <StatusBadge status={issue.status} />
                        </td>

                        {/* 優先度 */}
                        <td className="p-3 whitespace-nowrap">
                          <PriorityBadge priority={issue.priority} />
                        </td>

                        {/* 担当者 */}
                        <td className="p-3 whitespace-nowrap">
                          {issue.assignee_name ? (
                            <div className="flex items-center gap-1.5">
                              <div
                                style={{ backgroundColor: issue.assignee_color || "#4f46e5" }}
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                              >
                                {getUserInitials(issue.assignee_name)}
                              </div>
                              <span className="truncate max-w-[100px]">{issue.assignee_name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">未割当</span>
                          )}
                        </td>

                        {/* 期限日 */}
                        <td className="p-3 whitespace-nowrap font-mono text-slate-600">
                          {issue.due_date || "-"}
                        </td>

                        {/* 更新日時 */}
                        <td className="p-3 whitespace-nowrap text-slate-400 text-[11px]">
                          {formatTimestamp(issue.updated_at, settings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-12 text-center text-slate-400 text-sm">
                  条件に一致する課題は見つかりませんでした
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* 課題追加モーダル */}
      <CreateIssueModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        projects={projects}
        selectedProjectId={createDefaultProjectId || null}
        defaultTitle={createDefaultTitle}
        onCreated={() => {
          setIsCreateOpen(false);
          fetchSearchResults(currentQuery);
        }}
      />

      {/* 課題詳細・編集モーダル */}
      <IssueDetailModal
        issue={selectedIssue}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedIssue(null);
        }}
        onUpdated={() => {
          fetchSearchResults(currentQuery);
        }}
        onDeleted={() => {
          setIsDetailOpen(false);
          setSelectedIssue(null);
          fetchSearchResults(currentQuery);
        }}
      />

      {/* バックアップモーダル */}
      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        onRestored={() => {
          setIsBackupOpen(false);
          fetchProjects();
          fetchSearchResults(currentQuery);
        }}
      />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
            <span>読み込み中...</span>
          </div>
        </div>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}
