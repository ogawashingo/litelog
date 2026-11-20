// かんばんボード トップページ (/board)
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import BoardView from "@/components/BoardView";
import CreateIssueModal from "@/components/CreateIssueModal";
import BackupModal from "@/components/BackupModal";
import { useUser } from "@/components/UserContext";
import { Project, Issue, IssueStatus, IssueResolution } from "@/types";
import { getStoredProjectId, setStoredProjectId } from "@/lib/projectStorage";

export default function BoardIndexPage() {
  const router = useRouter();
  const { currentUser } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSelectedProjectId(getStoredProjectId());
  }, []);

  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);

  // データ初期化
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [projRes, issueRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/issues"),
      ]);

      if (projRes.ok) {
        const projData: Project[] = await projRes.json();
        setProjects(projData);

        // 保存されている選択中プロジェクトがある場合はそのプロジェクトのボードURLへ遷移
        // 未選択（null＝すべてのプロジェクト）の場合はリダイレクトせず全プロジェクトのボードを表示
        if (projData.length > 0) {
          const storedId = getStoredProjectId();
          if (storedId) {
            const target = projData.find((p) => p.id === storedId);
            if (target) {
              router.replace(`/board/${encodeURIComponent(target.key)}`);
              return;
            }
          }
        }
      }

      if (issueRes.ok) {
        const issueData: Issue[] = await issueRes.json();
        setIssues(issueData);
      }
    } catch (err) {
      console.error("ボード初期データの取得に失敗しました:", err);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ステータス更新処理
  const handleUpdateStatus = async (
    issueId: number,
    newStatus: IssueStatus,
    resolution?: IssueResolution | null
  ) => {
    try {
      setIssues((prev) =>
        prev.map((i) =>
          i.id === issueId
            ? {
                ...i,
                status: newStatus,
                ...(resolution !== undefined ? { resolution } : {}),
              }
            : i
        )
      );
      const payload: Record<string, any> = {
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
        alert(data.error || "ステータスの更新に失敗しました");
      }
      const issueRes = await fetch("/api/issues");
      if (issueRes.ok) {
        setIssues(await issueRes.json());
      }
    } catch (err) {
      console.error("ステータス更新失敗:", err);
    }
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col font-sans">
      <Header
        activeNav="board"
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={(id) => {
          setSelectedProjectId(id);
          setStoredProjectId(id);
          if (id) {
            const found = projects.find((p) => p.id === id);
            if (found) {
              router.push(`/board/${encodeURIComponent(found.key)}`);
            }
          } else {
            router.push("/board");
          }
        }}
        onOpenCreateIssue={() => setIsCreateIssueOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
      />

      <main className="flex-1 max-w-[1800px] w-full mx-auto px-3 sm:px-5 lg:px-6 py-3 sm:py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500 text-sm animate-pulse">
              かんばんボードを準備中...
            </div>
          </div>
        ) : (
          <BoardView
            projects={projects}
            currentProject={null}
            issues={issues}
            onUpdateStatus={handleUpdateStatus}
            onRefresh={async () => {
              const res = await fetch("/api/issues");
              if (res.ok) setIssues(await res.json());
            }}
            onSelectProjectKey={(key) => {
              if (key) router.push(`/board/${encodeURIComponent(key)}`);
            }}
          />
        )}
      </main>

      <CreateIssueModal
        isOpen={isCreateIssueOpen}
        projects={projects}
        selectedProjectId={null}
        onClose={() => setIsCreateIssueOpen(false)}
        onCreated={fetchData}
      />

      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        onRestored={fetchData}
      />
    </div>
  );
}
