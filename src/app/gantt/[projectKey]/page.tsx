// Backlog風ガントチャート プロジェクト別ページ (/gantt/[projectKey])
"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import Header from "@/components/Header";
import GanttChart from "@/components/GanttChart";
import CreateIssueModal from "@/components/CreateIssueModal";
import BackupModal from "@/components/BackupModal";
import { Project, Issue } from "@/types";
import { useUser } from "@/components/UserContext";
import { setStoredProjectId } from "@/lib/projectStorage";

function ProjectGanttContent() {
  const params = useParams();
  const router = useRouter();
  const { currentUser, isAuthReady } = useUser();
  const projectKey = (params?.projectKey as string) || "";

  const [projects, setProjects] = useState<Project[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // モーダル用State
  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);

  // プロジェクト一覧取得
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data: Project[] = await res.json();
        setProjects(data);
        return data;
      }
    } catch (err) {
      console.error("プロジェクト一覧の取得に失敗しました:", err);
    }
    return [];
  }, []);

  // 現在のプロジェクト情報を取得
  const currentProject =
    projects.find((p) => p.key.toLowerCase() === projectKey.toLowerCase()) || null;

  // 課題一覧取得
  const fetchIssues = useCallback(async (projectId?: number) => {
    try {
      const url = projectId ? `/api/issues?projectId=${projectId}` : "/api/issues";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setIssues(data);
      }
    } catch (err) {
      console.error("課題一覧の取得に失敗しました:", err);
    }
  }, []);

  // 全体データのリロード
  const refreshAll = useCallback(async () => {
    const projs = await fetchProjects();
    const curr = projs.find(
      (p) => p.key.toLowerCase() === projectKey.toLowerCase()
    );
    if (curr) {
      await fetchIssues(curr.id);
    } else {
      await fetchIssues();
    }
  }, [fetchProjects, fetchIssues, projectKey]);

  // 初回読み込み
  useEffect(() => {
    if (!isAuthReady || !currentUser) return;
    const init = async () => {
      setIsLoading(true);
      const projs = await fetchProjects();
      const curr = projs.find(
        (p) => p.key.toLowerCase() === projectKey.toLowerCase()
      );
      if (curr) {
        setStoredProjectId(curr.id);
        await fetchIssues(curr.id);
      } else if (projs.length > 0) {
        await fetchIssues();
      }
      setIsLoading(false);
    };
    init();
  }, [isAuthReady, currentUser, fetchProjects, fetchIssues, projectKey]);

  // プロジェクト選択時のルーティング遷移（現在のクエリパラメータを保持）
  const handleSelectProjectKey = (newKey: string) => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    if (!newKey) {
      setStoredProjectId(null);
      router.push(`/gantt${search}`);
    } else {
      const found = projects.find((p) => p.key.toLowerCase() === newKey.toLowerCase());
      if (found) {
        setStoredProjectId(found.id);
      }
      router.push(`/gantt/${encodeURIComponent(newKey)}${search}`);
    }
  };

  // 認証確定待ち・未ログイン時は描画をスキップ
  if (!isAuthReady || !currentUser) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent flex flex-col font-sans">
      {/* グローバルヘッダー */}
      <Header
        activeNav="gantt"
        projects={projects}
        selectedProjectId={currentProject?.id || null}
        onSelectProject={(id) => {
          setStoredProjectId(id);
          const search = typeof window !== "undefined" ? window.location.search : "";
          if (!id) {
            router.push(`/gantt${search}`);
          } else {
            const found = projects.find((p) => p.id === id);
            if (found) {
              router.push(`/gantt/${encodeURIComponent(found.key)}${search}`);
            }
          }
        }}
        onOpenCreateIssue={() => setIsCreateIssueOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
      />

      {/* ガントチャートメインエリア */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto px-2 sm:px-5 lg:px-6 py-2 sm:py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500 text-sm animate-pulse">
              ガントチャートを読み込み中...
            </div>
          </div>
        ) : !currentProject ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-md mx-auto my-12 space-y-4 shadow-sm">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">アクセス権限がありません</h3>
              <p className="text-xs text-slate-500 mt-1">
                プロジェクト [{projectKey}] のメンバーではないか、プロジェクトが存在しません。
              </p>
            </div>
            <Link
              href="/"
              className="inline-block px-4 py-2 app-primary-btn text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
            >
              ダッシュボードへ戻る
            </Link>
          </div>
        ) : (
          <GanttChart
            projects={projects}
            currentProject={currentProject}
            issues={issues}
            onRefresh={refreshAll}
            onSelectProjectKey={handleSelectProjectKey}
          />
        )}
      </main>

      {/* 新規課題追加モーダル */}
      <CreateIssueModal
        isOpen={isCreateIssueOpen}
        projects={projects}
        selectedProjectId={currentProject?.id || null}
        onClose={() => setIsCreateIssueOpen(false)}
        onCreated={async () => {
          setIsCreateIssueOpen(false);
          await refreshAll();
        }}
      />

      {/* データバックアップモーダル */}
      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        onRestored={async () => {
          setIsBackupOpen(false);
          await refreshAll();
        }}
      />
    </div>
  );
}

export default function ProjectGanttPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-transparent flex items-center justify-center">
          <div className="text-slate-500 text-sm animate-pulse">読み込み中...</div>
        </div>
      }
    >
      <ProjectGanttContent />
    </Suspense>
  );
}
