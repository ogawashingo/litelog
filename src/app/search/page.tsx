// プロジェクト横断 全体キーワード検索画面 (/search)
"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import CreateIssueModal from "@/components/CreateIssueModal";
import IssueDetailModal from "@/components/IssueDetailModal";
import BackupModal from "@/components/BackupModal";
import { useUser } from "@/components/UserContext";
import { Project, Issue } from "@/types";
import { TypeBadge, StatusBadge, PriorityBadge } from "@/components/IssueBadge";
import { getUserInitials } from "@/components/UserManageModal";
import { formatTimestamp, parseDbTimestamp, getTodayDateString, formatDueDateDisplay } from "@/lib/dateUtils";
import { setStoredProjectId } from "@/lib/projectStorage";
import {
  Search,
  RefreshCw,
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

  // 選択中プロジェクトID（ヘッダープルダウン・画面内フィルター・URLクエリ双方向同期）
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  // フィルター用ステート
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

  // 課題リストのフィルタリングとソート
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
      {/* グローバルヘッダー */}
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
      />

      {/* メインコンテンツ */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-5 space-y-5">
        {/* 検索キーワード・フィルター情報バナー */}
        <section className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
              <Search className="w-5 h-5" />
            </div>
            <div className="text-sm">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-slate-900 text-base">横断キーワード検索</h1>
                {isLoading && (
                  <span className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>検索中...</span>
                  </span>
                )}
              </div>
              <div className="text-slate-500 text-xs mt-0.5">
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
                <option value="all">すべての担当者</option>
                <option value="unassigned">未設定</option>
                {currentUser && <option value="me">自分 ({currentUser.name})</option>}
                {users
                  .filter((u) => u.id !== currentUser?.id)
                  .map((u) => (
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
                    <td className="p-3">
                      <div className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                        {issue.title}
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
                          <div className="w-5 h-5 rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 flex items-center justify-center shrink-0">
                            {getUserInitials(issue.assignee_name)}
                          </div>
                          <span className="text-slate-700 truncate max-w-[100px]">
                            {issue.assignee_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    {/* 期限日 */}
                    <td className="p-3 whitespace-nowrap">
                      {issue.due_date ? (
                        <span
                          className={`font-mono text-xs ${
                            issue.status !== "closed" && issue.due_date < getTodayDateString(settings)
                              ? "text-rose-600 font-bold"
                              : "text-slate-600"
                          }`}
                        >
                          {formatDueDateDisplay(issue.due_date)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    {/* 更新日時 */}
                    <td className="p-3 whitespace-nowrap font-mono text-[11px] text-slate-400">
                      {formatTimestamp(parseDbTimestamp(issue.updated_at), settings)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-slate-400 text-sm">
              該当する課題は見つかりませんでした
            </div>
          )}
        </div>
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
        onUpdated={async () => {
          fetchSearchResults(currentQuery);
          if (selectedIssue) {
            try {
              const res = await fetch(`/api/issues/${selectedIssue.id}`);
              if (res.ok) {
                const data = await res.json();
                if (data.issue) setSelectedIssue(data.issue);
              }
            } catch (err) {
              console.error(err);
            }
          }
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
