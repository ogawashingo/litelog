// ガントチャート トップページ (/gantt)
"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import GanttChart from "@/components/GanttChart";
import CreateIssueModal from "@/components/CreateIssueModal";
import BackupModal from "@/components/BackupModal";
import { Project, Issue } from "@/types";
import { getStoredProjectId, setStoredProjectId } from "@/lib/projectStorage";

function GanttIndexContent() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSelectedProjectId(getStoredProjectId());
  }, []);

  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);

  // データ取得
  const fetchData = useCallback(async () => {
    try {
      const [projRes, issueRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/issues"),
      ]);

      if (projRes.ok) {
        const projData: Project[] = await projRes.json();
        setProjects(projData);

        // プロジェクトが1件以上ある場合、選択中または先頭プロジェクトのURLへ遷移（クエリパラメータも引き継ぐ）
        if (projData.length > 0) {
          const storedId = getStoredProjectId();
          const target = (storedId && projData.find((p) => p.id === storedId)) || projData[0];
          const search = typeof window !== "undefined" ? window.location.search : "";
          router.replace(`/gantt/${encodeURIComponent(target.key)}${search}`);
          return;
        }
      }

      if (issueRes.ok) {
        const issueData: Issue[] = await issueRes.json();
        setIssues(issueData);
      }
    } catch (err) {
      console.error("ガントチャート初期データの取得に失敗しました:", err);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) {
        await fetchData();
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-transparent flex flex-col font-sans">
      <Header
        activeNav="gantt"
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={(id) => {
          setSelectedProjectId(id);
          setStoredProjectId(id);
          if (id) {
            const found = projects.find((p) => p.id === id);
            if (found) {
              router.push(`/gantt/${encodeURIComponent(found.key)}`);
            }
          }
        }}
        onOpenCreateIssue={() => setIsCreateIssueOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
      />

      <main className="flex-1 max-w-[1800px] w-full mx-auto px-2 sm:px-5 lg:px-6 py-2 sm:py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500 text-sm animate-pulse">
              ガントチャートを準備中...
            </div>
          </div>
        ) : (
          <GanttChart
            projects={projects}
            currentProject={null}
            issues={issues}
            onRefresh={async () => {
              const res = await fetch("/api/issues");
              if (res.ok) setIssues(await res.json());
            }}
            onSelectProjectKey={(key) => {
              if (key) router.push(`/gantt/${encodeURIComponent(key)}`);
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

export default function GanttIndexPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-transparent flex items-center justify-center">
          <div className="text-slate-500 text-sm animate-pulse">読み込み中...</div>
        </div>
      }
    >
      <GanttIndexContent />
    </Suspense>
  );
}
