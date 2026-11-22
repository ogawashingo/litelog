// litelog ダッシュボードメインページ
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import IssueList from "@/components/IssueList";
import ProjectList from "@/components/ProjectList";
import ActivityList from "@/components/ActivityList";
import CreateIssueModal from "@/components/CreateIssueModal";
import IssueDetailModal from "@/components/IssueDetailModal";
import CreateProjectModal from "@/components/CreateProjectModal";
import BackupModal from "@/components/BackupModal";
import ReviewRequestModal from "@/components/ReviewRequestModal";
import ParentDueDateConfirmModal, {
  ParentDueDateWarningInfo,
  isExceedingParentDueDate,
} from "@/components/ParentDueDateConfirmModal";
import { useUser } from "@/components/UserContext";
import { Project, Issue, Activity, IssueStatus, IssuePriority, IssueType, IssueResolution, canManageIssues } from "@/types";
import { getStoredProjectId, setStoredProjectId } from "@/lib/projectStorage";
import { notifyNotificationsUpdated } from "@/lib/clientEvents";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { users, currentUser, isAuthReady, refreshUsers } = useUser();

  const [projects, setProjects] = useState<Project[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(() => {
    const queryParam = searchParams.get("projectId");
    if (queryParam !== null) {
      const num = Number(queryParam);
      return !isNaN(num) && num > 0 ? num : null;
    }
    return null;
  });
  const activityReqIdRef = useRef(0);
  const [selectedStatus, setSelectedStatus] = useState<IssueStatus | "all">("all");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  // モーダル開閉ステート
  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [reviewTargetIssue, setReviewTargetIssue] = useState<Issue | null>(null);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [, setIsLoading] = useState(true);
  const [isLoadingIssues, setIsLoadingIssues] = useState(true);
  // 子課題の期限延長時に親課題の期限延長を確認するための保留ステート
  const [pendingDueUpdate, setPendingDueUpdate] = useState<{
    issueId: number;
    newDueDate: string;
    warning: ParentDueDateWarningInfo;
  } | null>(null);
  const [isUpdatingDueDate, setIsUpdatingDueDate] = useState(false);

  // プロジェクト一覧要素の高さ監視（「最近の更新」の高さをプロジェクト一覧と同期）
  const projectListRef = useRef<HTMLDivElement>(null);
  const [projectListHeight, setProjectListHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = projectListRef.current;
    if (!el) return;

    const updateHeight = () => {
      if (el) {
        setProjectListHeight(el.offsetHeight);
      }
    };

    const observer = new ResizeObserver(() => {
      updateHeight();
    });

    observer.observe(el);
    updateHeight();

    return () => observer.disconnect();
  }, [projects]);

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

  // 課題一覧取得（projectId引数が指定されていればそれを優先、なければselectedProjectIdを使用）
  const fetchIssues = useCallback(async (targetProjectId?: number | null) => {
    try {
      const pid = targetProjectId !== undefined ? targetProjectId : selectedProjectId;
      const url = pid ? `/api/issues?projectId=${pid}` : "/api/issues";
      const res = await fetch(url);
      if (res.ok) {
        const data: Issue[] = await res.json();
        setIssues(data);
        // モーダル表示中の課題があれば最新データで同期
        setSelectedIssue((prev) => {
          if (!prev) return null;
          const updated = data.find((i) => i.id === prev.id);
          return updated || prev;
        });
      }
    } catch (err) {
      console.error("課題取得失敗:", err);
    } finally {
      setIsLoadingIssues(false);
    }
  }, [selectedProjectId]);

  // アクティビティ履歴取得（projectId引数が指定されていればそれを優先、なければselectedProjectIdを使用）
  const fetchActivities = useCallback(async (targetProjectId?: number | null) => {
    const reqId = ++activityReqIdRef.current;
    try {
      const pid = targetProjectId !== undefined ? targetProjectId : selectedProjectId;
      const url = pid ? `/api/activities?projectId=${pid}` : "/api/activities";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        // 古いリクエストのレスポンスで最新状態を上書きしないようにガード
        if (reqId === activityReqIdRef.current) {
          setActivities(data);
        }
      }
    } catch (err) {
      console.error("アクティビティ取得失敗:", err);
    }
  }, [selectedProjectId]);

  // 全体データのリロード
  const refreshAll = useCallback(async () => {
    await Promise.all([fetchProjects(), fetchIssues(), fetchActivities(), refreshUsers()]);
  }, [fetchProjects, fetchIssues, fetchActivities, refreshUsers]);

  // URLパラメータ（?projectId=...）およびストレージから選択中プロジェクトを同期
  useEffect(() => {
    const queryParam = searchParams.get("projectId");
    if (queryParam !== null) {
      const num = Number(queryParam);
      const targetId = !isNaN(num) && num > 0 ? num : null;
      setSelectedProjectId(targetId);
      setStoredProjectId(targetId);
    } else {
      const stored = getStoredProjectId();
      setSelectedProjectId(stored);
    }
  }, [searchParams]);

  // selectedProjectIdが更新されたら対象プロジェクトの課題・アクティビティを取得
  useEffect(() => {
    if (!isAuthReady || !currentUser) return;
    setIsLoadingIssues(true);
    fetchIssues(selectedProjectId);
    fetchActivities(selectedProjectId);
  }, [isAuthReady, currentUser?.id, selectedProjectId, fetchIssues, fetchActivities]);

  // 初回データ取得（認証完了後にプロジェクト一覧を取得。refreshUsersはUserContext初期化で実行済みのためここでは呼ばない）
  useEffect(() => {
    if (!isAuthReady || !currentUser) return;
    const init = async () => {
      setIsLoading(true);
      await fetchProjects();
      setIsLoading(false);
    };
    init();
  }, [isAuthReady, currentUser?.id, fetchProjects]);

  // プロジェクト選択切り替え（ローカルストレージおよびURL同期）
  const handleSelectProject = useCallback(
    (id: number | null) => {
      setSelectedProjectId(id);
      setStoredProjectId(id);
      const url = id ? `/?projectId=${id}` : "/";
      router.push(url);
    },
    [router]
  );

  // 課題のステータス即時変更（完了理由の同時指定にも対応）
  const handleUpdateStatus = async (
    issueId: number,
    newStatus: IssueStatus,
    resolution?: IssueResolution | null
  ) => {
    const targetIssue = issues.find((i) => i.id === issueId);
    // 一般メンバーが「処理済み」に変更する場合はレビュー依頼モーダルを起動（Admin/PMOはスキップ許可）
    if (
      newStatus === "resolved" &&
      targetIssue &&
      targetIssue.status !== "resolved" &&
      !canManageIssues(currentUser)
    ) {
      setReviewTargetIssue(targetIssue);
      return;
    }

    try {
      // 楽観的UI更新
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
      if (res.ok) {
        await refreshAll();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "ステータス変更に失敗しました");
        fetchIssues();
      }
    } catch (err) {
      console.error("ステータス変更エラー:", err);
      fetchIssues();
    }
  };

  // 課題の種別即時変更
  const handleUpdateType = async (issueId: number, newType: IssueType) => {
    try {
      // 楽観的UI更新
      setIssues((prev) =>
        prev.map((i) => (i.id === issueId ? { ...i, issue_type: newType } : i))
      );
      const res = await fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueType: newType, actorId: currentUser?.id || null }),
      });
      if (res.ok) {
        await refreshAll();
      }
    } catch (err) {
      console.error("種別変更エラー:", err);
      fetchIssues();
    }
  };

  // 課題の担当者即時変更
  const handleUpdateAssignee = async (issueId: number, newAssigneeId: number | null) => {
    try {
      const res = await fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: newAssigneeId, actorId: currentUser?.id || null }),
      });
      if (res.ok) {
        await refreshAll();
      }
    } catch (err) {
      console.error("担当者変更エラー:", err);
      fetchIssues();
    }
  };

  // 課題の優先度即時変更
  const handleUpdatePriority = async (issueId: number, newPriority: IssuePriority) => {
    try {
      // 楽観的UI更新
      setIssues((prev) =>
        prev.map((i) => (i.id === issueId ? { ...i, priority: newPriority } : i))
      );
      const res = await fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority, actorId: currentUser?.id || null }),
      });
      if (res.ok) {
        await refreshAll();
      }
    } catch (err) {
      console.error("優先度変更エラー:", err);
      fetchIssues();
    }
  };

  // 課題の完了理由即時変更
  const handleUpdateResolution = async (issueId: number, newResolution: IssueResolution | null) => {
    try {
      // 楽観的UI更新
      setIssues((prev) =>
        prev.map((i) => (i.id === issueId ? { ...i, resolution: newResolution } : i))
      );
      const res = await fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: newResolution, actorId: currentUser?.id || null }),
      });
      if (res.ok) {
        await refreshAll();
      }
    } catch (err) {
      console.error("完了理由変更エラー:", err);
      fetchIssues();
    }
  };

  // 課題の期限日更新API実行
  const executeUpdateDueDate = async (
    issueId: number,
    newDueDate: string | null,
    extendParentDueDate = false
  ) => {
    try {
      setIsUpdatingDueDate(true);
      // 楽観的UI更新
      setIssues((prev) =>
        prev.map((i) => (i.id === issueId ? { ...i, due_date: newDueDate } : i))
      );
      const res = await fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dueDate: newDueDate,
          extendParentDueDate,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        await refreshAll();
      }
    } catch (err) {
      console.error("期限日変更エラー:", err);
      fetchIssues();
    } finally {
      setIsUpdatingDueDate(false);
    }
  };

  // 課題の期限日即時変更（子課題が親課題の期限を超える場合は確認ダイアログを表示）
  const handleUpdateDueDate = async (issueId: number, newDueDate: string | null) => {
    const targetIssue = issues.find((i) => i.id === issueId);
    if (targetIssue && targetIssue.parent_id && newDueDate) {
      const parentIssue = issues.find((i) => i.id === targetIssue.parent_id);
      const parentDueDate = parentIssue?.due_date ?? targetIssue.parent_due_date ?? null;
      if (isExceedingParentDueDate(parentDueDate, newDueDate)) {
        setPendingDueUpdate({
          issueId,
          newDueDate,
          warning: {
            parentIssueKey: parentIssue?.issue_key ?? targetIssue.parent_issue_key,
            parentTitle: parentIssue?.title ?? targetIssue.parent_title,
            parentDueDate: parentDueDate!,
            newChildDueDate: newDueDate,
            childIssueKey: targetIssue.issue_key,
          },
        });
        return;
      }
    }
    await executeUpdateDueDate(issueId, newDueDate, false);
  };

  // 課題削除（作成者または管理者のみ）
  const handleDeleteIssue = async (issueId: number) => {
    try {
      const actorQuery = currentUser?.id ? `?actorId=${currentUser.id}` : "";
      const res = await fetch(`/api/issues/${issueId}${actorQuery}`, { method: "DELETE" });
      if (res.ok) {
        await refreshAll();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "課題の削除に失敗しました");
      }
    } catch (err) {
      console.error("課題削除エラー:", err);
      alert("課題の削除に失敗しました");
    }
  };

  // 課題クリック時の詳細モーダル表示
  const handleSelectIssue = (issue: Issue) => {
    setSelectedIssue(issue);
    setIsDetailOpen(true);
  };

  // 通知等から課題キー指定で詳細モーダルを表示
  const handleSelectIssueByKey = async (issueKey: string) => {
    const existing = issues.find((i) => i.issue_key === issueKey);
    if (existing) {
      setSelectedIssue(existing);
      setIsDetailOpen(true);
      return;
    }
    try {
      const res = await fetch(`/api/issues/${encodeURIComponent(issueKey)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.issue) {
          setSelectedIssue(data.issue);
          setIsDetailOpen(true);
        }
      }
    } catch (err) {
      console.error("課題キーからの詳細取得失敗:", err);
    }
  };

  // 選択中プロジェクトによる厳密なフィルタリング（万が一のデータ不整合や混ざりを防止）
  const filteredIssues = useMemo(() => {
    if (!selectedProjectId) return issues;
    return issues.filter((i) => i.project_id === selectedProjectId);
  }, [issues, selectedProjectId]);

  // 詳細モーダルを閉じる
  const handleCloseDetail = useCallback(() => {
    setIsDetailOpen(false);
    setSelectedIssue(null);
  }, []);

  // 認証状態の確定待ち、または未ログイン時は不要な描画・APIコールを行わず待機
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
        activeNav="dashboard"
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={handleSelectProject}
        onOpenCreateIssue={() => setIsCreateIssueOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
        onSelectIssue={handleSelectIssueByKey}
      />

      {/* メインダッシュボードコンテンツ */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-5 space-y-5">
        {/* メインエリア: 課題一覧を全幅で表示し、件名や担当者の視認性を確保 */}
        <div>
          <IssueList
            issues={filteredIssues}
            selectedStatus={selectedStatus}
            onSelectStatus={(st) => setSelectedStatus(st)}
            onSelectIssue={handleSelectIssue}
            onUpdateType={handleUpdateType}
            onUpdateStatus={handleUpdateStatus}
            onUpdateAssignee={handleUpdateAssignee}
            onUpdatePriority={handleUpdatePriority}
            onUpdateResolution={handleUpdateResolution}
            onUpdateDueDate={handleUpdateDueDate}
            onDeleteIssue={handleDeleteIssue}
            isLoading={isLoadingIssues}
          />
        </div>

        {/* サブエリア: プロジェクト一覧 ＆ 最近の更新を2カラムで配置（スマホ・iPhone画面ではプロジェクト一覧を非表示にして縦長化を抑制） */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div ref={projectListRef} className="hidden md:block">
            <ProjectList
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelectProject={handleSelectProject}
              onOpenCreateProject={() => setIsCreateProjectOpen(true)}
              onUpdated={refreshAll}
            />
          </div>

          <ActivityList
            activities={activities}
            issues={filteredIssues}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectIssue={handleSelectIssue}
            targetHeight={projectListHeight}
          />
        </div>
      </main>

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
        onClose={handleCloseDetail}
        onUpdated={refreshAll}
        onDeleted={refreshAll}
        onSelectIssue={(issue) => setSelectedIssue(issue)}
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

      {/* レビュー・確認依頼モーダル（一覧から「処理済み」変更時） */}
      {reviewTargetIssue && (
        <ReviewRequestModal
          isOpen={true}
          issueKey={reviewTargetIssue.issue_key}
          issueTitle={reviewTargetIssue.title}
          reporterId={reviewTargetIssue.created_by}
          currentAssigneeId={reviewTargetIssue.assignee_id}
          users={users}
          currentUserId={currentUser?.id}
          onClose={() => setReviewTargetIssue(null)}
          onSubmit={async (data) => {
            const res = await fetch(`/api/issues/${reviewTargetIssue.id}/comments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: data.comment,
                status: "resolved",
                resolution: null,
                ...(data.changeAssignee ? { assigneeId: data.reviewerId } : {}),
              }),
            });
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || "レビュー依頼の送信に失敗しました");
            }
            setReviewTargetIssue(null);
            await refreshAll();
            notifyNotificationsUpdated();
          }}
        />
      )}

      {/* 子課題の期限延長に伴う親課題期限延長の確認モーダル */}
      <ParentDueDateConfirmModal
        info={pendingDueUpdate?.warning || null}
        isSubmitting={isUpdatingDueDate}
        onExtendBoth={async () => {
          if (!pendingDueUpdate) return;
          const { issueId, newDueDate } = pendingDueUpdate;
          setPendingDueUpdate(null);
          await executeUpdateDueDate(issueId, newDueDate, true);
        }}
        onChildOnly={async () => {
          if (!pendingDueUpdate) return;
          const { issueId, newDueDate } = pendingDueUpdate;
          setPendingDueUpdate(null);
          await executeUpdateDueDate(issueId, newDueDate, false);
        }}
        onCancel={() => setPendingDueUpdate(null)}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-transparent flex items-center justify-center">
          <div className="text-slate-500 text-sm animate-pulse">ダッシュボードを準備中...</div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
