// Backlog風かんばんボード プロジェクト別ページ (/board/[projectKey])
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import BoardView from "@/components/BoardView";
import CreateIssueModal from "@/components/CreateIssueModal";
import BackupModal from "@/components/BackupModal";
import { Project, Issue, IssueStatus } from "@/types";

export default function ProjectBoardPage() {
  const params = useParams();
  const router = useRouter();
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
  const currentProject = projects.find(
    (p) => p.key.toLowerCase() === projectKey.toLowerCase()
  ) || null;

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
    const init = async () => {
      setIsLoading(true);
      const projs = await fetchProjects();
      const curr = projs.find(
        (p) => p.key.toLowerCase() === projectKey.toLowerCase()
      );
      if (curr) {
        await fetchIssues(curr.id);
      } else if (projs.length > 0) {
        // プロジェクトが見つからない場合、全課題または最初のプロジェクトを表示
        await fetchIssues();
      }
      setIsLoading(false);
    };
    init();
  }, [fetchProjects, fetchIssues, projectKey]);

  // 課題ステータスの更新処理（ドラッグ＆ドロップまたはモーダルから実行）
  const handleUpdateStatus = async (issueId: number, newStatus: IssueStatus) => {
    try {
      // 楽観的UI更新（画面上を即座に反映）
      setIssues((prev) =>
        prev.map((i) => (i.id === issueId ? { ...i, status: newStatus } : i))
      );

      const res = await fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        console.error("ステータス更新APIエラー");
        await refreshAll();
      }
    } catch (err) {
      console.error("ステータス更新失敗:", err);
      await refreshAll();
    }
  };

  // プロジェクト選択時のルーティング遷移
  const handleSelectProjectKey = (newKey: string) => {
    if (!newKey) {
      router.push("/board");
    } else {
      router.push(`/board/${encodeURIComponent(newKey)}`);
    }
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col font-sans">
      {/* グローバルヘッダー */}
      <Header
        projects={projects}
        selectedProjectId={currentProject?.id || null}
        onSelectProject={(id) => {
          if (!id) {
            router.push("/board");
          } else {
            const found = projects.find((p) => p.id === id);
            if (found) {
              router.push(`/board/${encodeURIComponent(found.key)}`);
            }
          }
        }}
        onOpenCreateIssue={() => setIsCreateIssueOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
      />

      {/* ボードメインエリア */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500 text-sm animate-pulse">
              かんばんボードを読み込み中...
            </div>
          </div>
        ) : (
          <BoardView
            projects={projects}
            currentProject={currentProject}
            issues={issues}
            onUpdateStatus={handleUpdateStatus}
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
