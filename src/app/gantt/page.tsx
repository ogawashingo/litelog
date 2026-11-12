// ガントチャート トップページ (/gantt)
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import GanttChart from "@/components/GanttChart";
import CreateIssueModal from "@/components/CreateIssueModal";
import BackupModal from "@/components/BackupModal";
import { Project, Issue } from "@/types";

export default function GanttIndexPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

        // プロジェクトが1件以上ある場合、先頭プロジェクトのURLへ遷移
        if (projData.length > 0) {
          router.replace(`/gantt/${encodeURIComponent(projData[0].key)}`);
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
    fetchData();
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-[#f4f5f7] flex flex-col font-sans">
      <Header
        projects={projects}
        selectedProjectId={null}
        onSelectProject={(id) => {
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
