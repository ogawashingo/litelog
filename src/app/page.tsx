// Personal Backlog ダッシュボードメインページ
"use client";

import React, { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import SummaryCards from "@/components/SummaryCards";
import IssueList from "@/components/IssueList";
import ProjectList from "@/components/ProjectList";
import ActivityList from "@/components/ActivityList";
import CreateIssueModal from "@/components/CreateIssueModal";
import IssueDetailModal from "@/components/IssueDetailModal";
import CreateProjectModal from "@/components/CreateProjectModal";
import BackupModal from "@/components/BackupModal";
import { Project, Issue, Activity, IssueStatus } from "@/types";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<IssueStatus | "all">("all");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  // モーダル開閉ステート
  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // プロジェクト一覧取得
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error("プロジェクト取得失敗:", err);
    }
  }, []);

  // 課題一覧取得
  const fetchIssues = useCallback(async () => {
    try {
      const url = selectedProjectId ? `/api/issues?projectId=${selectedProjectId}` : "/api/issues";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setIssues(data);
      }
    } catch (err) {
      console.error("課題取得失敗:", err);
    }
  }, [selectedProjectId]);

  // アクティビティ履歴取得
  const fetchActivities = useCallback(async () => {
    try {
      const res = await fetch("/api/activities");
      if (res.ok) {
        const data = await res.json();
        setActivities(data);
      }
    } catch (err) {
      console.error("アクティビティ取得失敗:", err);
    }
  }, []);

  // 全体データのリロード
  const refreshAll = useCallback(async () => {
    await Promise.all([fetchProjects(), fetchIssues(), fetchActivities()]);
  }, [fetchProjects, fetchIssues, fetchActivities]);

  // 初回データ取得
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await refreshAll();
      setIsLoading(false);
    };
    init();
  }, [refreshAll]);

  // 課題のステータス即時変更
  const handleUpdateStatus = async (issueId: number, newStatus: IssueStatus) => {
    try {
      // 楽観的UI更新
      setIssues((prev) =>
        prev.map((i) => (i.id === issueId ? { ...i, status: newStatus } : i))
      );
      const res = await fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await refreshAll();
      }
    } catch (err) {
      console.error("ステータス変更エラー:", err);
      fetchIssues();
    }
  };

  // 課題削除
  const handleDeleteIssue = async (issueId: number) => {
    try {
      const res = await fetch(`/api/issues/${issueId}`, { method: "DELETE" });
      if (res.ok) {
        await refreshAll();
      }
    } catch (err) {
      console.error("課題削除エラー:", err);
    }
  };

  // 課題クリック時の詳細モーダル表示
  const handleSelectIssue = (issue: Issue) => {
    setSelectedIssue(issue);
    setIsDetailOpen(true);
  };

  // サマリー集計計算
  const todayStr = new Date().toISOString().split("T")[0];
  const counts = {
    all: issues.length,
    open: issues.filter((i) => i.status === "open").length,
    in_progress: issues.filter((i) => i.status === "in_progress").length,
    resolved: issues.filter((i) => i.status === "resolved").length,
    closed: issues.filter((i) => i.status === "closed").length,
    overdue: issues.filter((i) => i.status !== "closed" && i.due_date && i.due_date < todayStr).length,
    dueToday: issues.filter((i) => i.status !== "closed" && i.due_date === todayStr).length,
  };

  return (
    <div className="min-h-screen bg-[#f5f6f7] flex flex-col font-sans">
      {/* Backlogヘッダー */}
      <Header
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={(id) => setSelectedProjectId(id)}
        onOpenCreateIssue={() => setIsCreateIssueOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
      />

      {/* メインダッシュボードコンテンツ */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* サマリーカード・ステータス集計 */}
        <SummaryCards
          counts={counts}
          currentStatus={selectedStatus}
          onSelectStatus={(st) => setSelectedStatus(st)}
        />

        {/* 2カラムレイアウト: 左側「自分の課題」、右側「プロジェクト一覧」「最近の更新」 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* メインカラム: 課題一覧（幅 2/3） */}
          <div className="lg:col-span-2">
            <IssueList
              issues={issues}
              selectedStatus={selectedStatus}
              onSelectIssue={handleSelectIssue}
              onUpdateStatus={handleUpdateStatus}
              onDeleteIssue={handleDeleteIssue}
            />
          </div>

          {/* サイドカラム: プロジェクト一覧 ＆ 最近の更新（幅 1/3） */}
          <div className="space-y-6">
            <ProjectList
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelectProject={(id) => setSelectedProjectId(id)}
              onOpenCreateProject={() => setIsCreateProjectOpen(true)}
            />

            <ActivityList activities={activities} />
          </div>
        </div>
      </main>

      {/* フッター */}
      <footer className="bg-white border-t border-gray-200 py-4 text-center text-xs text-gray-500 mt-auto">
        <p>Personal Backlog - 一人用タスク・プロジェクト管理</p>
      </footer>

      {/* 課題追加モーダル */}
      <CreateIssueModal
        isOpen={isCreateIssueOpen}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onClose={() => setIsCreateIssueOpen(false)}
        onCreated={refreshAll}
      />

      {/* 課題詳細・編集モーダル */}
      <IssueDetailModal
        issue={selectedIssue}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedIssue(null);
        }}
        onUpdated={refreshAll}
        onDeleted={refreshAll}
      />

      {/* プロジェクト作成モーダル */}
      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        onCreated={refreshAll}
      />

      {/* バックアップ・復元モーダル */}
      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        onRestored={refreshAll}
      />
    </div>
  );
}
