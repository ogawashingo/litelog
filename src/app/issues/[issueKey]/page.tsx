// 課題個別詳細パーマリンクページ (/issues/[issueKey])
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Kanban,
  Edit2,
  Check,
  Trash2,
  Link as LinkIcon,
  AlertCircle,
  LayoutDashboard,
  Archive,
} from "lucide-react";
import Header from "@/components/Header";
import CreateIssueModal from "@/components/CreateIssueModal";
import BackupModal from "@/components/BackupModal";
import { TypeBadge, ResolutionBadge } from "@/components/IssueBadge";
import { createApiError } from "@/lib/clientError";
import { useUser } from "@/components/UserContext";
import { Issue, Comment, IssueStatus, IssueType, IssuePriority, IssueResolution, Project, isArchivedProject, canManageIssues, canDeleteIssue } from "@/types";
import { setStoredProjectId } from "@/lib/projectStorage";
import MentionTextarea from "@/components/MentionTextarea";
import IssueTemplateSelector from "@/components/IssueTemplateSelector";
import MentionText from "@/components/MentionText";
import NotifyUserSelector from "@/components/NotifyUserSelector";
import {
  ParentDueDateWarningInfo,
  isExceedingParentDueDate,
} from "@/components/ParentDueDateConfirmModal";
import { notifyNotificationsUpdated } from "@/lib/clientEvents";
import { getSelectedEditParentInfo } from "@/components/issue-detail/issueDetailUtils";
import { useIssueDetailActions } from "@/components/issue-detail/useIssueDetailActions";
import IssueSummaryToolbar from "@/components/issue-detail/IssueSummaryToolbar";
import IssueEditFormSection from "@/components/issue-detail/IssueEditFormSection";
import IssueChildSection from "@/components/issue-detail/IssueChildSection";
import IssueCommentsSection from "@/components/issue-detail/IssueCommentsSection";
import IssueDetailModalsBundle from "@/components/issue-detail/IssueDetailModalsBundle";
import DraftIndicator from "@/components/DraftIndicator";
import { useIssueEditDraft } from "@/hooks/useIssueEditDraft";

export default function IssueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { users, currentUser, refreshUsers, settings } = useUser();
  const issueKeyParam = (params?.issueKey as string) || "";

  // 課題データState
  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [childrenIssues, setChildrenIssues] = useState<Issue[]>([]);
  const [availableParents, setAvailableParents] = useState<Issue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // 履歴・レビュー・親課題期限延長モーダルState
  const [historyModalCommentId, setHistoryModalCommentId] = useState<number | null>(null);
  const [isIssueHistoryOpen, setIsIssueHistoryOpen] = useState(false);
  // 子課題の期限延長に伴う親課題期限延長の確認モーダル情報
  const [parentDueWarning, setParentDueWarning] = useState<ParentDueDateWarningInfo | null>(null);
  const [issueHistoryTab, setIssueHistoryTab] = useState<"description" | "title" | "dates" | "all">("description");
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // 編集モードState
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<IssueStatus>("open");
  const [editPriority, setEditPriority] = useState<IssuePriority>("medium");
  const [editResolution, setEditResolution] = useState<IssueResolution | null>(null);
  const [editType, setEditType] = useState<IssueType>("task");
  const [editAssigneeId, setEditAssigneeId] = useState<string>("");
  const [editParentId, setEditParentId] = useState<string>("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editNotifyUserIds, setEditNotifyUserIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // ヘッダー用モーダルState
  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [createIssueDefaultParentId, setCreateIssueDefaultParentId] = useState<number | null>(null);
  const [isBackupOpen, setIsBackupOpen] = useState(false);

  // プロジェクト一覧取得
  useEffect(() => {
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setProjects(data))
      .catch((err) => console.error("プロジェクト取得失敗:", err));
  }, []);

  // 課題詳細および関連データの取得
  const fetchIssueDetail = useCallback(async () => {
    if (!issueKeyParam) return;
    try {
      setIsLoading(true);
      const res = await fetch(`/api/issues/${encodeURIComponent(issueKeyParam)}`);
      if (res.status === 404) {
        setNotFound(true);
        setIssue(null);
        return;
      }
      if (!res.ok) {
        throw new Error("課題取得に失敗しました");
      }

      const data = await res.json();
      const currentIssue: Issue = data.issue;
      setIssue(currentIssue);
      setComments(data.comments || []);
      setChildrenIssues(data.children || []);
      setNotFound(false);

      // 編集フォームの初期値を同期
      setEditTitle(currentIssue.title);
      setEditDescription(currentIssue.description || "");
      setEditStatus(currentIssue.status);
      setEditPriority(currentIssue.priority);
      setEditResolution(currentIssue.resolution || null);
      setEditType(currentIssue.issue_type);
      setEditAssigneeId(currentIssue.assignee_id ? String(currentIssue.assignee_id) : "");
      setEditParentId(currentIssue.parent_id ? String(currentIssue.parent_id) : "");
      setEditStartDate(currentIssue.start_date || "");
      setEditDueDate(currentIssue.due_date || "");

      // 同プロジェクト内の親課題候補一覧を取得
      if (currentIssue.project_id) {
        setStoredProjectId(currentIssue.project_id);
        fetch(`/api/issues?projectId=${currentIssue.project_id}`)
          .then((r) => (r.ok ? r.json() : []))
          .then((parentCandidates: Issue[]) => {
            if (Array.isArray(parentCandidates)) {
              setAvailableParents(parentCandidates.filter((item) => item.id !== currentIssue.id));
            }
          })
          .catch((err) => console.error("親課題候補取得エラー:", err));
      }
    } catch (err) {
      console.error("課題詳細ロードエラー:", err);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [issueKeyParam]);

  useEffect(() => {
    fetchIssueDetail();
  }, [fetchIssueDetail]);

  // 編集フォームで選択中の親課題情報（期限日超過チェック用）
  const selectedEditParentInfo = getSelectedEditParentInfo(
    editParentId,
    availableParents,
    issue
  );

  const isEditExceedingParentDue = isExceedingParentDueDate(
    selectedEditParentInfo?.dueDate,
    editDueDate || null
  );

  // 課題編集のAPI送信
  const executeSaveEdit = async (extendParentDueDate: boolean) => {
    if (!issue || !editTitle.trim()) return;
    try {
      setIsSaving(true);
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
          status: editStatus,
          priority: editPriority,
          resolution: editResolution || null,
          issueType: editType,
          assigneeId: editAssigneeId ? Number(editAssigneeId) : null,
          parentId: editParentId ? Number(editParentId) : null,
          startDate: editStartDate || null,
          dueDate: editDueDate || null,
          extendParentDueDate,
          actorId: currentUser?.id || null,
          notifyUserIds: editNotifyUserIds,
        }),
      });

      if (res.ok) {
        clearEditDraft();
        setIsEditing(false);
        setEditNotifyUserIds([]);
        notifyNotificationsUpdated();
        await refreshUsers();
        await fetchIssueDetail();
      }
    } catch (err) {
      console.error("更新エラー:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // 課題編集の保存（親課題の期限を超過している場合は確認モーダルを表示）
  const handleSaveEdit = async () => {
    if (!issue || !editTitle.trim()) return;

    const dueChanged = (editDueDate || null) !== (issue.due_date || null);
    const parentChanged = (editParentId ? Number(editParentId) : null) !== (issue.parent_id || null);
    if (
      (dueChanged || parentChanged) &&
      selectedEditParentInfo?.dueDate &&
      editDueDate &&
      isExceedingParentDueDate(selectedEditParentInfo.dueDate, editDueDate)
    ) {
      setParentDueWarning({
        parentIssueKey: selectedEditParentInfo.issueKey,
        parentTitle: selectedEditParentInfo.title,
        parentDueDate: selectedEditParentInfo.dueDate,
        newChildDueDate: editDueDate,
        childIssueKey: issue.issue_key,
      });
      return;
    }

    await executeSaveEdit(false);
  };

  // ステータス即時変更
  const handleQuickStatusChange = async (newStatus: IssueStatus) => {
    if (!issue) return;
    const isUnclosing = newStatus !== "closed";
    try {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          ...(isUnclosing ? { resolution: null } : {}),
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        setEditStatus(newStatus);
        if (isUnclosing) {
          setEditResolution(null);
        }
        setIssue((prev) =>
          prev
            ? {
                ...prev,
                status: newStatus,
                ...(isUnclosing ? { resolution: null } : {}),
              }
            : null
        );
        await refreshUsers();
      }
    } catch (err) {
      console.error("ステータス変更エラー:", err);
    }
  };

  // レビュー・確認依頼モーダル経由での処理済みステータス更新
  const handleReviewRequestSubmit = async (data: {
    reviewerId: number;
    changeAssignee: boolean;
    comment: string;
  }) => {
    if (!issue) return;
    const res = await fetch(`/api/issues/${issue.id}/comments`, {
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
      throw await createApiError(res, "レビュー依頼の送信に失敗しました");
    }
    // 課題詳細とコメント一覧を再取得
    await fetchIssueDetail();
    await refreshUsers();
    notifyNotificationsUpdated();
  };

  // 完了理由即時変更
  const handleQuickResolutionChange = async (newRes: IssueResolution | null) => {
    if (!issue) return;
    try {
      setIssue((prev) => (prev ? { ...prev, resolution: newRes } : null));
      setEditResolution(newRes);
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution: newRes,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        await refreshUsers();
      }
    } catch (err) {
      console.error("完了理由変更エラー:", err);
    }
  };

  // 種別即時変更
  const handleQuickTypeChange = async (newType: IssueType) => {
    if (!issue) return;
    const previousType = issue.issue_type;
    if (newType === previousType) return;
    try {
      setIssue((prev) => (prev ? { ...prev, issue_type: newType } : null));
      setEditType(newType);
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueType: newType,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        notifyNotificationsUpdated();
        await refreshUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "種別の変更に失敗しました");
        setIssue((prev) => (prev ? { ...prev, issue_type: previousType } : null));
        setEditType(previousType);
      }
    } catch (err) {
      console.error("種別変更エラー:", err);
      setIssue((prev) => (prev ? { ...prev, issue_type: previousType } : null));
      setEditType(previousType);
    }
  };

  // 優先度即時変更
  const handleQuickPriorityChange = async (newPriority: IssuePriority) => {
    if (!issue) return;
    try {
      setIssue((prev) => (prev ? { ...prev, priority: newPriority } : null));
      setEditPriority(newPriority);
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priority: newPriority,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        await refreshUsers();
      }
    } catch (err) {
      console.error("優先度変更エラー:", err);
    }
  };

  // 担当者即時変更
  const handleQuickAssigneeChange = async (newAssigneeIdStr: string) => {
    if (!issue) return;
    try {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeId: newAssigneeIdStr ? Number(newAssigneeIdStr) : null,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        setEditAssigneeId(newAssigneeIdStr);
        await refreshUsers();
        await fetchIssueDetail();
      }
    } catch (err) {
      console.error("担当者変更エラー:", err);
    }
  };

  // 未完了の子課題件数および存在判定
  const unclosedChildrenCount = childrenIssues.filter((c) => c.status !== "closed").length;
  const hasUnclosedChildren = unclosedChildrenCount > 0;

  // 課題を完了にできる権限判定（起票者・PMO・または管理者のみ）
  const canClose = Boolean(
    canManageIssues(currentUser) ||
    (issue?.created_by && currentUser?.id === issue.created_by)
  );
  // 課題を削除できる権限判定（作成者または管理者のみ）
  const canDelete = canDeleteIssue(currentUser, issue);

  // 課題編集（件名・詳細）の下書き自動保存・復元フック
  const {
    hasDraft: hasEditDraft,
    isDraftRestored: isEditDraftRestored,
    handleDiscardDraft: handleDiscardEditDraft,
    clearDraft: clearEditDraft,
  } = useIssueEditDraft({
    issueId: issue?.id,
    isEditing,
    currentTitle: issue?.title || "",
    currentDescription: issue?.description || "",
    editTitle,
    setEditTitle,
    editDescription,
    setEditDescription,
  });

  // コメント・子課題追加・課題削除・URLコピー共通アクション
  const {
    isCopiedUrl,
    isPostingSuccess,
    handleCopyLink,
    newComment,
    setNewComment,
    isPostingComment,
    hasCommentDraft,
    isCommentDraftRestored,
    handleDiscardCommentDraft,
    editingCommentId,
    editCommentContent,
    setEditCommentContent,
    isSavingComment,
    handlePostComment,
    handleStartEditComment,
    handleCancelEditComment,
    handleSaveEditComment,
    handleDeleteComment,
    handleDelete,
    isAddingChild,
    setIsAddingChild,
    childTitle,
    setChildTitle,
    childType,
    setChildType,
    childAssigneeId,
    setChildAssigneeId,
    isSubmittingChild,
    childError,
    setChildError,
    handleAddChildIssue,
  } = useIssueDetailActions({
    activeIssue: issue,
    currentUser,
    canDelete,
    setComments,
    onIssueSyncedFromComment: (updatedIssue) => {
      setIssue(updatedIssue);
      setEditStatus(updatedIssue.status);
      setEditResolution(updatedIssue.resolution || null);
    },
    onReloadIssueData: fetchIssueDetail,
    refreshUsers,
    onDeleteSuccess: () => router.push("/"),
    getCopyUrl: () => window.location.href,
  });

  const currentAssignee = users.find((u) => u.id === Number(editAssigneeId));
  // 起票者表示名（結合済みの creator_name、なければ users リストから補完し IssueSummaryToolbar 内で「起票:」として表示）
  const creatorName =
    issue?.creator_name ||
    (issue?.created_by ? users.find((u) => u.id === Number(issue.created_by))?.name : null) ||
    null;

  // 該当プロジェクトのプロジェクト情報およびアーカイブ状態判定（is_archivedフラグまたは名前に「アーカイブ」が含まれるか）
  const currentProject = projects.find((p) => p.id === issue?.project_id);
  const isProjectArchived = isArchivedProject(issue) || isArchivedProject(currentProject);

  return (
    <div className="min-h-screen bg-transparent flex flex-col font-sans">
      {/* 共通ヘッダー */}
      <Header
        projects={projects}
        selectedProjectId={issue?.project_id || null}
        onSelectProject={(id) => {
          setStoredProjectId(id);
          if (!id) {
            router.push("/");
          } else {
            const found = projects.find((p) => p.id === id);
            if (found) {
              router.push(`/board/${encodeURIComponent(found.key)}`);
            }
          }
        }}
        onOpenCreateIssue={() => {
          setCreateIssueDefaultParentId(null);
          setIsCreateIssueOpen(true);
        }}
        onOpenBackup={() => setIsBackupOpen(true)}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 space-y-4">
        {/* 上部ナビゲーション / パンくずリスト */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            {/* 統一された戻るボタン（直前のページ、または一覧へ戻る） */}
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) {
                  router.back();
                } else if (currentProject) {
                  router.push(`/board/${currentProject.key}`);
                } else {
                  router.push("/");
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              title="戻る"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>戻る</span>
            </button>

            {/* PC向けパンくずリスト */}
            <div className="hidden sm:flex items-center gap-1.5">
              <Link
                href="/"
                className="flex items-center gap-1 hover:text-indigo-600 font-medium transition-colors"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>ダッシュボード</span>
              </Link>
              <span>/</span>
              {currentProject ? (
                <Link
                  href={`/board/${currentProject.key}`}
                  className="flex items-center gap-1 hover:text-indigo-600 font-medium transition-colors"
                >
                  <Kanban className="w-3.5 h-3.5" />
                  <span>{currentProject.name}</span>
                </Link>
              ) : (
                <span>課題</span>
              )}
              <span>/</span>
              <span className="font-mono font-bold text-slate-800">
                {issueKeyParam.toUpperCase()}
              </span>
            </div>

            {/* モバイル向け課題キー表示 */}
            <span className="sm:hidden font-mono font-bold text-slate-800 text-xs">
              {issueKeyParam.toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* URLコピーボタン（弾性スプリング＆サクセスポップ） */}
            <button
              type="button"
              onClick={handleCopyLink}
              disabled={notFound || isLoading}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer spring-bounce ${
                isCopiedUrl
                  ? "bg-emerald-600 border-emerald-600 text-white shadow-xs font-bold scale-[1.02]"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400"
              }`}
              title="この課題のURLをコピーして共有"
            >
              {isCopiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white stroke-[3] animate-check-pop" />
                  <span>URLをコピーしました！</span>
                </>
              ) : (
                <>
                  <LinkIcon className="w-3.5 h-3.5 text-indigo-600" />
                  <span>URLをコピー</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* アーカイブ済みプロジェクトのリードオンリー注意バナー */}
        {!isLoading && issue && isProjectArchived && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-xl shadow-xs flex items-center gap-2.5 text-xs font-semibold animate-in fade-in duration-150">
            <Archive className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              この課題が属するプロジェクトは<strong>アーカイブ</strong>されています。読み取り専用のため、課題情報の修正や状態の変更、コメント投稿は行えません。
            </span>
          </div>
        )}

        {/* ローディング表示 */}
        {isLoading && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 shadow-xs">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-3"></div>
            <p className="text-sm font-medium">課題を読み込み中...</p>
          </div>
        )}

        {/* 404 Not Found 表示 */}
        {!isLoading && notFound && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-600 shadow-xs space-y-4">
            <div className="flex justify-center text-amber-500">
              <AlertCircle className="w-12 h-12" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">
              課題 [{issueKeyParam}] が見つかりませんでした
            </h2>
            <p className="text-sm text-slate-500">
              指定されたURLの課題は存在しないか、既に削除された可能性があります。
            </p>
            <div className="pt-2">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium text-xs hover:bg-indigo-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>ダッシュボードに戻る</span>
              </Link>
            </div>
          </div>
        )}

        {/* 課題詳細本体 */}
        {!isLoading && issue && (
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
            {/* 詳細カードヘッダー（スクロール時にも画面上部に追従固定） */}
            <div className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 shadow-2xs">
              {/* 上段: メタバッジ・キー・操作アクション */}
              <div className="px-4 sm:px-6 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200/60">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <TypeBadge
                    type={isEditing ? editType : issue.issue_type}
                    disabled={isProjectArchived}
                    onChange={(nextType) => {
                      if (isEditing) {
                        setEditType(nextType);
                      } else {
                        handleQuickTypeChange(nextType);
                      }
                    }}
                  />
                  <ResolutionBadge resolution={isEditing ? editResolution : issue.resolution} />
                  <span className="font-bold text-slate-800 text-sm sm:text-base font-mono tracking-wide whitespace-nowrap shrink-0">
                    {issue.issue_key}
                  </span>
                  {issue.project_name && (
                    <span className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded font-medium text-slate-700 truncate max-w-[180px] sm:max-w-none">
                      {issue.project_name}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isProjectArchived ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 border border-slate-300">
                      <Archive className="w-3.5 h-3.5" />
                      <span>アーカイブ（読み取り専用）</span>
                    </span>
                  ) : (
                    <>
                      {!isEditing ? (
                        <button
                          onClick={() => setIsEditing(true)}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>編集</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleSaveEdit}
                          disabled={isSaving}
                          className="flex items-center gap-1 text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isSaving ? "保存中..." : "保存"}</span>
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={handleDelete}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="課題を削除（作成者または管理者のみ）"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 下段（非編集時）: 常時固定の課題件名 ＆ 全属性ツールバー（状態・完了理由・担当者・優先度・期間・登録日時） */}
              {!isEditing && (
                <IssueSummaryToolbar
                  variant="page"
                  activeIssue={issue}
                  isProjectArchived={isProjectArchived}
                  canClose={canClose}
                  hasUnclosedChildren={hasUnclosedChildren}
                  unclosedChildrenCount={unclosedChildrenCount}
                  currentUser={currentUser}
                  users={users}
                  candidateUsers={users}
                  currentAssignee={currentAssignee}
                  creatorName={creatorName}
                  settings={settings}
                  onOpenHistory={(tab) => {
                    setIssueHistoryTab(tab);
                    setIsIssueHistoryOpen(true);
                  }}
                  onOpenReviewModal={() => setIsReviewModalOpen(true)}
                  onQuickStatusChange={handleQuickStatusChange}
                  onQuickResolutionChange={handleQuickResolutionChange}
                  onQuickAssigneeChange={handleQuickAssigneeChange}
                  onQuickPriorityChange={handleQuickPriorityChange}
                />
              )}
            </div>

            {/* 詳細コンテンツ */}
            <div className="p-6 space-y-6">
              {/* 編集モード時のみタイトル・メタ情報を表示 */}
              {isEditing && (
                <IssueEditFormSection
                  variant="page"
                  issueId={issue.id}
                  activeIssue={issue}
                  editTitle={editTitle}
                  onChangeEditTitle={setEditTitle}
                  editType={editType}
                  onChangeEditType={setEditType}
                  editStatus={editStatus}
                  onChangeEditStatus={setEditStatus}
                  editResolution={editResolution}
                  onChangeEditResolution={setEditResolution}
                  editAssigneeId={editAssigneeId}
                  onChangeEditAssigneeId={setEditAssigneeId}
                  editPriority={editPriority}
                  onChangeEditPriority={setEditPriority}
                  editStartDate={editStartDate}
                  onChangeEditStartDate={setEditStartDate}
                  editDueDate={editDueDate}
                  onChangeEditDueDate={setEditDueDate}
                  editParentId={editParentId}
                  onChangeEditParentId={setEditParentId}
                  editDescription={editDescription}
                  onChangeEditDescription={setEditDescription}
                  editNotifyUserIds={editNotifyUserIds}
                  onChangeEditNotifyUserIds={setEditNotifyUserIds}
                  canClose={canClose}
                  hasUnclosedChildren={hasUnclosedChildren}
                  unclosedChildrenCount={unclosedChildrenCount}
                  isEditExceedingParentDue={isEditExceedingParentDue}
                  selectedEditParentInfo={selectedEditParentInfo}
                  availableParents={availableParents}
                  users={users}
                  candidateUsers={users}
                  currentUser={currentUser}
                  comments={comments}
                  isSaving={isSaving}
                  hasDraft={hasEditDraft}
                  isDraftRestored={isEditDraftRestored}
                  onDiscardDraft={handleDiscardEditDraft}
                  onCancelEdit={() => setIsEditing(false)}
                  onSaveEdit={handleSaveEdit}
                />
              )}

              {/* 詳細説明（モバイル表示時、詳細未入力なら非表示にしてコンパクト化） */}
              <div className={!isEditing && !issue.description ? "hidden sm:block" : ""}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-700">詳細・メモ</h3>
                    {isEditing && (
                      <DraftIndicator
                        hasDraft={hasEditDraft}
                        isRestored={isEditDraftRestored}
                        onDiscard={handleDiscardEditDraft}
                      />
                    )}
                    {Boolean(issue.description_history_count && issue.description_history_count > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setIssueHistoryTab("description");
                          setIsIssueHistoryOpen(true);
                        }}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer font-medium"
                        title="クリックして詳細の変更履歴を確認"
                      >
                        (編集済み · {issue.description_history_count}件)
                      </button>
                    )}
                  </div>
                  {isEditing && (
                    <IssueTemplateSelector
                      projectId={issue.project_id}
                      currentValue={editDescription}
                      onApplyTemplate={(newContent) => setEditDescription(newContent)}
                    />
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-3">
                    <MentionTextarea
                      rows={6}
                      value={editDescription}
                      onChange={(val) => setEditDescription(val)}
                      users={users}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
                      placeholder={`※完了条件が記載されると良いです。\n※1週間以上かかりそうな大きな課題は、複数の課題に分割しましょう。`}
                    />
                    <NotifyUserSelector
                      users={users}
                      currentUserId={currentUser?.id || null}
                      selectedUserIds={editNotifyUserIds}
                      onChange={setEditNotifyUserIds}
                      autoNotifyUserIds={
                        [
                          issue.created_by ? Number(issue.created_by) : 0,
                          editAssigneeId ? Number(editAssigneeId) : 0,
                        ].filter(Boolean)
                      }
                      participantUserIds={
                        [
                          issue.created_by ? Number(issue.created_by) : 0,
                          issue.assignee_id ? Number(issue.assignee_id) : 0,
                          ...comments.map((c) => Number(c.user_id || 0)),
                        ].filter(Boolean)
                      }
                      label="この課題の更新を通知するメンバー"
                      compact
                    />
                  </div>
                ) : (
                  <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/70 text-sm text-slate-800 leading-relaxed min-h-[80px]">
                    {issue.description ? (
                      <MentionText text={issue.description} users={users} />
                    ) : (
                      <span className="text-slate-400 italic">詳細はありません。</span>
                    )}
                  </div>
                )}
              </div>

              {/* 子課題セクション */}
              <IssueChildSection
                variant="page"
                childrenIssues={childrenIssues}
                isProjectArchived={isProjectArchived}
                isAddingChild={isAddingChild}
                onStartAddChild={() => {
                  setIsAddingChild(true);
                  setChildError("");
                }}
                onCancelAddChild={() => {
                  setIsAddingChild(false);
                  setChildTitle("");
                  setChildError("");
                }}
                childTitle={childTitle}
                onChangeChildTitle={setChildTitle}
                childType={childType}
                onChangeChildType={setChildType}
                childAssigneeId={childAssigneeId}
                onChangeChildAssigneeId={setChildAssigneeId}
                isSubmittingChild={isSubmittingChild}
                childError={childError}
                onSubmitAddChild={handleAddChildIssue}
                assigneeCandidateUsers={users}
                onOpenDetailedChildCreate={() => {
                  setCreateIssueDefaultParentId(issue.id);
                  setIsCreateIssueOpen(true);
                }}
              />

              {/* コメントセクション */}
              <IssueCommentsSection
                variant="page"
                issueId={issue.id}
                comments={comments}
                users={users}
                currentUser={currentUser}
                settings={settings}
                isProjectArchived={isProjectArchived}
                editingCommentId={editingCommentId}
                editCommentContent={editCommentContent}
                onChangeEditCommentContent={setEditCommentContent}
                isSavingComment={isSavingComment}
                onStartEditComment={handleStartEditComment}
                onCancelEditComment={handleCancelEditComment}
                onSaveEditComment={handleSaveEditComment}
                onDeleteComment={handleDeleteComment}
                onOpenCommentHistory={(cid) => setHistoryModalCommentId(cid)}
                onReactionsUpdated={(cid, nextReactions) => {
                  setComments((prev) =>
                    prev.map((item) =>
                      item.id === cid ? { ...item, reactions: nextReactions } : item
                    )
                  );
                }}
                newComment={newComment}
                onChangeNewComment={setNewComment}
                isPostingComment={isPostingComment}
                isPostingSuccess={isPostingSuccess}
                hasDraft={hasCommentDraft}
                isDraftRestored={isCommentDraftRestored}
                onDiscardDraft={handleDiscardCommentDraft}
                onPostComment={handlePostComment}
              />
            </div>
          </div>
        )}
      </main>

      {/* 新規課題作成モーダル */}
      <CreateIssueModal
        isOpen={isCreateIssueOpen}
        onClose={() => {
          setIsCreateIssueOpen(false);
          setCreateIssueDefaultParentId(null);
        }}
        projects={projects}
        selectedProjectId={issue?.project_id || null}
        defaultParentId={createIssueDefaultParentId}
        onCreated={() => {
          setIsCreateIssueOpen(false);
          setCreateIssueDefaultParentId(null);
          fetchIssueDetail();
        }}
      />

      {/* バックアップモーダル */}
      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        onRestored={() => fetchIssueDetail()}
      />

      {/* 各種履歴・レビュー依頼・親課題期限延長確認モーダル */}
      <IssueDetailModalsBundle
        issueId={issue ? issue.id : null}
        activeIssue={issue}
        historyModalCommentId={historyModalCommentId}
        onCloseCommentHistory={() => setHistoryModalCommentId(null)}
        isIssueHistoryOpen={isIssueHistoryOpen}
        onCloseIssueHistory={() => setIsIssueHistoryOpen(false)}
        issueHistoryTab={issueHistoryTab}
        isReviewModalOpen={isReviewModalOpen}
        onCloseReviewModal={() => setIsReviewModalOpen(false)}
        onSubmitReviewRequest={handleReviewRequestSubmit}
        reviewCandidateUsers={users}
        users={users}
        currentUserId={currentUser?.id}
        settings={settings}
        parentDueWarning={parentDueWarning}
        isSaving={isSaving}
        onConfirmParentDue={async (extendParentDueDate) => {
          setParentDueWarning(null);
          await executeSaveEdit(extendParentDueDate);
        }}
        onCancelParentDue={() => setParentDueWarning(null)}
      />
    </div>
  );
}
