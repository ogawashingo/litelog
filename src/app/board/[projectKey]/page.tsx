// Backlog風かんばんボード プロジェクト別ページ (/board/[projectKey])
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import Header from "@/components/Header";
import BoardView from "@/components/BoardView";
import CreateIssueModal from "@/components/CreateIssueModal";
import BackupModal from "@/components/BackupModal";
import { useUser } from "@/components/UserContext";
import { Project, Issue, IssueStatus, IssueResolution } from "@/types";
import { setStoredProjectId } from "@/lib/projectStorage";

export default function ProjectBoardPage() {
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

  const currentUserId = currentUser?.id ?? null;

  // 初回読み込み
  useEffect(() => {
    if (!isAuthReady || !currentUserId) return;
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
        // プロジェクトが見つからない場合、全課題または最初のプロジェクトを表示
        await fetchIssues();
      }
      setIsLoading(false);
    };
    init();
  }, [isAuthReady, currentUserId, fetchProjects, fetchIssues, projectKey]);

  // 課題ステータスの更新処理（ドラッグ＆ドロップまたはモーダルから実行、完了理由の同時指定にも対応）
  const handleUpdateStatus = async (
    issueId: number,
    newStatus: IssueStatus,
    resolution?: IssueResolution | null
  ) => {
    try {
      // 楽観的UI更新（画面上を即座に反映）
      setIssues((prev) =>
        prev.map((i) =>
          i.id === issueId
            ? {
                ...i,
                status: newStatus,
                ...(resolution !== undefined ? { resolution } : {}),
                ...(newStatus === "closed" ? { is_pinned: 0, pinned_at: null } : {}),
              }
            : i
        )
      );

      const payload: Record<string, unknown> = {
        status: newStatus,
        actorId: currentUser?.id || null,
      };
      if (resolution !== undefined) {
        payload.resolution = resolution;
      }

      const res = await fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "状態の更新に失敗しました");
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
      setStoredProjectId(null);
      router.push("/board");
    } else {
      const found = projects.find((p) => p.key.toLowerCase() === newKey.toLowerCase());
      if (found) {
        setStoredProjectId(found.id);
      }
      router.push(`/board/${encodeURIComponent(newKey)}`);
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
        activeNav="board"
        projects={projects}
        selectedProjectId={currentProject?.id || null}
        onSelectProject={(id) => {
          setStoredProjectId(id);
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
      <main className="flex-1 max-w-[1800px] w-full mx-auto px-3 sm:px-5 lg:px-6 py-3 sm:py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500 text-sm animate-pulse">
              かんばんボードを読み込み中...
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
