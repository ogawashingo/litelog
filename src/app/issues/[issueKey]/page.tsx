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
  Calendar,
  Clock,
  Send,
  Trash2,
  GitBranch,
  Link as LinkIcon,
  AlertCircle,
  MessageSquare,
  LayoutDashboard,
  Plus,
} from "lucide-react";
import Header from "@/components/Header";
import CreateIssueModal from "@/components/CreateIssueModal";
import BackupModal from "@/components/BackupModal";
import CommentHistoryModal from "@/components/CommentHistoryModal";
import IssueHistoryModal from "@/components/IssueHistoryModal";
import { TypeBadge, StatusBadge, PriorityBadge, ResolutionBadge } from "@/components/IssueBadge";
import { DatePicker } from "@/components/DatePicker";
import { useUser } from "@/components/UserContext";
import { getUserInitials } from "@/components/UserManageModal";
import { formatTimestamp } from "@/lib/dateUtils";
import { Issue, Comment, IssueStatus, IssueType, IssuePriority, IssueResolution, Project } from "@/types";
import { setStoredProjectId } from "@/lib/projectStorage";
import MentionTextarea from "@/components/MentionTextarea";
import MentionText from "@/components/MentionText";
import NotifyUserSelector from "@/components/NotifyUserSelector";
import CommentReactionBar from "@/components/CommentReactionBar";
import ResolutionSelect from "@/components/ResolutionSelect";

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

  // コメント投稿State
  const [newComment, setNewComment] = useState("");
  const [commentNotifyUserIds, setCommentNotifyUserIds] = useState<number[]>([]);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentContent, setEditCommentContent] = useState("");
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [historyModalCommentId, setHistoryModalCommentId] = useState<number | null>(null);
  const [isIssueHistoryOpen, setIsIssueHistoryOpen] = useState(false);
  const [issueHistoryTab, setIssueHistoryTab] = useState<"description" | "title" | "dates" | "all">("description");

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

  // URLコピー表示State
  const [isCopiedUrl, setIsCopiedUrl] = useState(false);

  // ヘッダー用モーダルState
  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [createIssueDefaultParentId, setCreateIssueDefaultParentId] = useState<number | null>(null);
  const [isBackupOpen, setIsBackupOpen] = useState(false);

  // 子課題クイック追加State
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [childTitle, setChildTitle] = useState("");
  const [childType, setChildType] = useState<IssueType>("task");
  const [childAssigneeId, setChildAssigneeId] = useState<string>("");
  const [isSubmittingChild, setIsSubmittingChild] = useState(false);
  const [childError, setChildError] = useState("");

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

  // URLをクリップボードにコピー
  const handleCopyLink = async () => {
    if (!issue) return;
    try {
      const fullUrl = window.location.href;
      await navigator.clipboard.writeText(fullUrl);
      setIsCopiedUrl(true);
      setTimeout(() => setIsCopiedUrl(false), 2000);
    } catch (err) {
      console.error("URLコピー失敗:", err);
    }
  };

  // 課題編集の保存
  const handleSaveEdit = async () => {
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
          actorId: currentUser?.id || null,
          notifyUserIds: editNotifyUserIds,
        }),
      });

      if (res.ok) {
        setIsEditing(false);
        setEditNotifyUserIds([]);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("backlog:notifications-updated"));
        }
        await refreshUsers();
        await fetchIssueDetail();
      }
    } catch (err) {
      console.error("更新エラー:", err);
    } finally {
      setIsSaving(false);
    }
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

  // コメントの投稿
  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue || isPostingComment || !newComment.trim()) return;

    try {
      setIsPostingComment(true);
      const res = await fetch(`/api/issues/${issue.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newComment.trim(),
          userId: currentUser?.id || null,
          notifyUserIds: commentNotifyUserIds,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.comment) {
          setComments((prev) => [...prev, data.comment]);
        }
        if (data.issue) {
          setIssue(data.issue);
          setEditStatus(data.issue.status);
          setEditResolution(data.issue.resolution || null);
        }
        setNewComment("");
        setCommentNotifyUserIds([]);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("backlog:notifications-updated"));
        }
        await refreshUsers();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "コメントの投稿に失敗しました");
      }
    } catch (err) {
      console.error("コメント投稿失敗:", err);
    } finally {
      setIsPostingComment(false);
    }
  };

  // コメント編集開始
  const handleStartEditComment = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditCommentContent(comment.content);
  };

  // コメント編集キャンセル
  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditCommentContent("");
  };

  // コメント編集の保存
  const handleSaveEditComment = async (commentId: number) => {
    if (!issue || !editCommentContent.trim() || isSavingComment) return;

    try {
      setIsSavingComment(true);
      const res = await fetch(`/api/issues/${issue.id}/comments/${commentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editCommentContent.trim() }),
      });

      if (res.ok) {
        const updated = await res.json();
        setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
        setEditingCommentId(null);
        setEditCommentContent("");
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "コメントの更新に失敗しました");
      }
    } catch (err) {
      console.error("コメント更新エラー:", err);
      alert("コメントの更新に失敗しました");
    } finally {
      setIsSavingComment(false);
    }
  };

  // コメントの完全削除（管理者Adminのみ実行可能）
  const handleDeleteComment = async (commentId: number) => {
    if (!issue) return;
    if (!confirm("このコメント（および編集履歴）を完全に削除しますか？\n※この操作は取り消せません。")) {
      return;
    }

    try {
      const res = await fetch(`/api/issues/${issue.id}/comments/${commentId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        if (editingCommentId === commentId) {
          setEditingCommentId(null);
          setEditCommentContent("");
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "コメントの削除に失敗しました");
      }
    } catch (err) {
      console.error("コメント削除エラー:", err);
      alert("コメントの削除に失敗しました");
    }
  };

  // 課題の削除
  const handleDelete = async () => {
    if (!issue) return;
    if (!confirm(`課題 [${issue.issue_key}] 「${issue.title}」を完全に削除しますか？`)) {
      return;
    }
    try {
      const actorQuery = currentUser?.id ? `?actorId=${currentUser.id}` : "";
      const res = await fetch(`/api/issues/${issue.id}${actorQuery}`, { method: "DELETE" });
      if (res.ok) {
        await refreshUsers();
        router.push("/");
      }
    } catch (err) {
      console.error("削除エラー:", err);
    }
  };

  // 子課題のクイック追加
  const handleAddChildIssue = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!issue || !childTitle.trim() || isSubmittingChild) return;

    try {
      setIsSubmittingChild(true);
      setChildError("");
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: issue.project_id,
          parentId: issue.id,
          title: childTitle.trim(),
          issueType: childType,
          assigneeId: childAssigneeId ? Number(childAssigneeId) : null,
          actorId: currentUser?.id || null,
          status: "open",
          priority: "medium",
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "子課題の作成に失敗しました");
      }

      // 入力欄をクリアして子課題一覧を再取得（フォームは開いたままにして連続追加可能に）
      setChildTitle("");
      await fetchIssueDetail();
      await refreshUsers();
    } catch (err: unknown) {
      console.error("子課題作成エラー:", err);
      setChildError(err instanceof Error ? err.message : "子課題の作成に失敗しました");
    } finally {
      setIsSubmittingChild(false);
    }
  };

  const currentAssignee = users.find((u) => u.id === Number(editAssigneeId));

  // 該当プロジェクトのプロジェクトキー
  const currentProject = projects.find((p) => p.id === issue?.project_id);

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
            {/* URLコピーボタン */}
            <button
              type="button"
              onClick={handleCopyLink}
              disabled={notFound || isLoading}
              className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                isCopiedUrl
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
              title="この課題のURLをコピーして共有"
            >
              {isCopiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
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
            <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 shadow-2xs">
              {/* 上段: メタバッジ・キー・操作アクション */}
              <div className="px-4 sm:px-6 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200/60">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <TypeBadge type={isEditing ? editType : issue.issue_type} />
                  <ResolutionBadge resolution={isEditing ? editResolution : issue.resolution} />
                  <span className="font-bold text-slate-800 text-sm sm:text-base font-mono tracking-wide">
                    {issue.issue_key}
                  </span>
                  {issue.project_name && (
                    <span className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded font-medium text-slate-700">
                      {issue.project_name}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
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
                  <button
                    onClick={handleDelete}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    title="課題を削除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 下段（非編集時）: 常時固定の課題件名 ＆ クイック属性セレクター（状態・完了理由・担当者） */}
              {!isEditing && (
                <div className="px-4 sm:px-6 py-2.5 sm:py-3 bg-white">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                    {/* 件名 ＆ 親課題リンク */}
                    <div className="min-w-0 flex-1">
                      {issue.parent_id && issue.parent_issue_key && (
                        <Link
                          href={`/issues/${issue.parent_issue_key}`}
                          className="mb-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[11px] text-slate-700 font-medium hover:bg-indigo-100 transition-colors cursor-pointer group truncate max-w-full"
                          title={`親課題 [${issue.parent_issue_key}] を開く`}
                        >
                          <GitBranch className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span className="text-slate-500">親:</span>
                          <span className="font-bold text-indigo-700">[{issue.parent_issue_key}]</span>
                          <span className="truncate">{issue.parent_title}</span>
                        </Link>
                      )}
                      <div className="flex items-center gap-2">
                        <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-snug line-clamp-2" title={issue.title}>
                          {issue.title}
                        </h1>
                        {Boolean(issue.title_history_count && issue.title_history_count > 0) && (
                          <button
                            type="button"
                            onClick={() => {
                              setIssueHistoryTab("title");
                              setIsIssueHistoryOpen(true);
                            }}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer font-medium shrink-0"
                            title="クリックしてタイトルの変更履歴を確認"
                          >
                            (履歴 · {issue.title_history_count}件)
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 状態・完了理由・担当者の常時固定セレクター */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                      {/* 状態セレクター */}
                      <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 shadow-2xs">
                        <span className="text-[10px] text-slate-500 font-bold shrink-0">状態:</span>
                        <select
                          value={issue.status}
                          onChange={(e) => {
                            const nextStatus = e.target.value as IssueStatus;
                            if (nextStatus === "closed" && hasUnclosedChildren) {
                              alert(`未完了の子課題が ${unclosedChildrenCount} 件存在するため、親課題を完了にすることはできません。`);
                              return;
                            }
                            handleQuickStatusChange(nextStatus);
                          }}
                          className="bg-transparent text-xs font-bold text-slate-800 cursor-pointer focus:outline-hidden"
                        >
                          <option value="open">未対応</option>
                          <option value="in_progress">処理中</option>
                          <option value="resolved">処理済み</option>
                          <option value="closed" disabled={hasUnclosedChildren} title={hasUnclosedChildren ? `未完了の子課題が ${unclosedChildrenCount} 件あります` : undefined}>
                            完了{hasUnclosedChildren ? " (未完了あり)" : ""}
                          </option>
                        </select>
                      </div>

                      {/* 完了理由セレクター（完了時のみ活性） */}
                      <div className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 transition-colors ${
                        issue.status === "closed" ? "bg-slate-50 border border-slate-300 shadow-2xs" : "opacity-50"
                      }`}>
                        <span className="text-[10px] text-slate-500 font-medium shrink-0">完了理由:</span>
                        <ResolutionSelect
                          value={issue.status === "closed" ? issue.resolution : null}
                          onChange={(nextRes) => handleQuickResolutionChange(nextRes)}
                          disabled={issue.status !== "closed"}
                          size="sm"
                          placeholder="--"
                        />
                        {Boolean(issue.resolution_history_count && issue.resolution_history_count > 0) && (
                          <button
                            type="button"
                            onClick={() => {
                              setIssueHistoryTab("all");
                              setIsIssueHistoryOpen(true);
                            }}
                            className="text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1 py-0.2 rounded cursor-pointer font-medium"
                            title="クリックして完了理由の変更履歴を確認"
                          >
                            ({issue.resolution_history_count})
                          </button>
                        )}
                      </div>

                      {/* 担当者セレクター */}
                      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 shadow-2xs max-w-[130px] sm:max-w-[160px]">
                        <div
                          style={{ backgroundColor: currentAssignee?.color || "#9ca3af" }}
                          className="w-4 h-4 rounded-full text-white flex items-center justify-center text-[8px] font-bold shrink-0"
                        >
                          {getUserInitials(currentAssignee?.name)}
                        </div>
                        <select
                          value={issue.assignee_id ? String(issue.assignee_id) : ""}
                          onChange={(e) => handleQuickAssigneeChange(e.target.value)}
                          className="bg-transparent text-xs font-medium text-slate-800 cursor-pointer focus:outline-hidden truncate w-full"
                        >
                          <option value="">未割当</option>
                          {users.map((u) => (
                            <option key={u.id} value={String(u.id)}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  {hasUnclosedChildren && (
                    <span
                      className="text-[10px] text-amber-600 block mt-1 leading-tight"
                      title={`未完了の子課題が ${unclosedChildrenCount} 件存在するため、すべて完了するまで完了にできません`}
                    >
                      ※ 未完了の子課題が {unclosedChildrenCount} 件あるため、すべて完了するまで親課題を完了にできません
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 詳細コンテンツ */}
            <div className="p-6 space-y-6">
              {/* 編集モード時のタイトル入力欄 */}
              {isEditing && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">件名 *</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    placeholder="課題の件名を入力"
                  />
                </div>
              )}

              {/* メタ情報グリッド */}
              {isEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-xs">
                  {/* 状態 */}
                  <div>
                    <span className="block text-slate-500 mb-1 font-medium">状態</span>
                    <select
                      value={editStatus}
                      onChange={(e) => {
                        const nextSt = e.target.value as IssueStatus;
                        setEditStatus(nextSt);
                        if (nextSt !== "closed") {
                          setEditResolution(null);
                        }
                      }}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="open">未対応</option>
                      <option value="in_progress">処理中</option>
                      <option value="resolved">処理済み</option>
                      <option value="closed">完了</option>
                    </select>
                  </div>

                  {/* 完了理由 */}
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-slate-500 font-medium">完了理由</span>
                      {editStatus !== "closed" && (
                        <span className="text-[9px] text-slate-400 font-normal">
                          (完了時のみ)
                        </span>
                      )}
                    </div>
                    <ResolutionSelect
                      value={editStatus === "closed" ? editResolution : null}
                      onChange={(nextRes) => setEditResolution(nextRes)}
                      disabled={editStatus !== "closed"}
                      placeholder="-- （未設定）"
                    />
                  </div>

                  {/* 優先度 */}
                  <div>
                    <span className="block text-slate-500 mb-1 font-medium">優先度</span>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as IssuePriority)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="high">高</option>
                      <option value="medium">中</option>
                      <option value="low">低</option>
                    </select>
                  </div>

                  {/* 担当者 */}
                  <div>
                    <span className="block text-slate-500 mb-1 font-medium">担当者</span>
                    <select
                      value={editAssigneeId}
                      onChange={(e) => setEditAssigneeId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">未割当</option>
                      {users.map((u) => (
                        <option key={u.id} value={String(u.id)}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 種別 */}
                  <div>
                    <span className="block text-slate-500 mb-1 font-medium">種別</span>
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as IssueType)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="task">タスク</option>
                      <option value="bug">バグ</option>
                      <option value="request">要望</option>
                      <option value="other">その他</option>
                    </select>
                  </div>
                </div>
              ) : (
                /* 非編集時のサブ属性グリッド（優先度など）※件名・状態・完了理由・担当者は上部ヘッダーに常時固定 */
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200/80 text-xs">
                  {/* 優先度即時変更 */}
                  <div>
                    <span className="block text-slate-500 mb-1 font-medium">優先度</span>
                    <select
                      value={issue.priority}
                      onChange={(e) => handleQuickPriorityChange(e.target.value as IssuePriority)}
                      className={`w-full border rounded px-2 py-1 font-semibold text-xs cursor-pointer focus:ring-1 focus:ring-indigo-500 transition-colors ${
                        issue.priority === "high"
                          ? "text-rose-600 border-rose-300 bg-rose-50/80"
                          : issue.priority === "medium"
                          ? "text-amber-600 border-amber-300 bg-amber-50/80"
                          : "text-slate-600 border-slate-300 bg-slate-50/80"
                      }`}
                    >
                      <option value="high">↑ 高</option>
                      <option value="medium">→ 中</option>
                      <option value="low">↓ 低</option>
                    </select>
                  </div>
                  {/* 作成者 */}
                  <div>
                    <span className="block text-slate-500 mb-1 font-medium">登録者</span>
                    <span className="text-slate-800 font-medium">
                      {users.find((u) => u.id === issue.created_by)?.name || "不明"}
                    </span>
                  </div>
                  {/* 作成日時 */}
                  <div>
                    <span className="block text-slate-500 mb-1 font-medium">登録日時</span>
                    <span className="text-slate-700">
                      {issue.created_at ? formatTimestamp(issue.created_at) : "--"}
                    </span>
                  </div>
                  {/* 更新日時 */}
                  <div>
                    <span className="block text-slate-500 mb-1 font-medium">更新日時</span>
                    <span className="text-slate-700">
                      {issue.updated_at ? formatTimestamp(issue.updated_at) : "--"}
                    </span>
                  </div>
                </div>
              )}

              {/* 日程＆親課題設定 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-slate-100 pb-4 text-xs">
                {/* 開始日 */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-slate-500 font-medium">開始日</span>
                    {Boolean(issue.start_date_history_count && issue.start_date_history_count > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setIssueHistoryTab("dates");
                          setIsIssueHistoryOpen(true);
                        }}
                        className="text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1 py-0.2 rounded cursor-pointer font-medium"
                        title="クリックして開始日の変更履歴を確認"
                      >
                        (履歴{issue.start_date_history_count}件)
                      </button>
                    )}
                  </div>
                  {isEditing ? (
                    <DatePicker
                      value={editStartDate}
                      onChange={(val) => setEditStartDate(val || "")}
                      placeholder="開始日を選択"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5 text-slate-700 py-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{issue.start_date || "未設定"}</span>
                    </div>
                  )}
                </div>

                {/* 期限日 */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-slate-500 font-medium">期限日</span>
                    {Boolean(issue.due_date_history_count && issue.due_date_history_count > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setIssueHistoryTab("dates");
                          setIsIssueHistoryOpen(true);
                        }}
                        className="text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1 py-0.2 rounded cursor-pointer font-medium"
                        title="クリックして期限日の変更履歴（延期履歴）を確認"
                      >
                        (履歴{issue.due_date_history_count}件)
                      </button>
                    )}
                  </div>
                  {isEditing ? (
                    <DatePicker
                      value={editDueDate}
                      onChange={(val) => setEditDueDate(val || "")}
                      placeholder="期限日を選択"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5 text-slate-700 py-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{issue.due_date || "未設定"}</span>
                    </div>
                  )}
                </div>

                {/* 親課題 */}
                <div>
                  <span className="block text-slate-500 mb-1 font-medium">親課題</span>
                  {isEditing ? (
                    <select
                      value={editParentId}
                      onChange={(e) => setEditParentId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">親課題なし</option>
                      {availableParents.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          [{p.issue_key}] {p.title}
                        </option>
                      ))}
                    </select>
                  ) : issue.parent_issue_key ? (
                    <Link
                      href={`/issues/${issue.parent_issue_key}`}
                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium py-1"
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>[{issue.parent_issue_key}] {issue.parent_title}</span>
                    </Link>
                  ) : (
                    <span className="text-slate-400 py-1 block">なし</span>
                  )}
                </div>
              </div>

              {/* 詳細説明 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-700">詳細・メモ</h3>
                    {Boolean(issue.description_history_count && issue.description_history_count > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setIssueHistoryTab("description");
                          setIsIssueHistoryOpen(true);
                        }}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer font-medium"
                        title="クリックして詳細説明の変更履歴を確認"
                      >
                        (編集済み · {issue.description_history_count}件)
                      </button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className="space-y-3">
                    <MentionTextarea
                      rows={6}
                      value={editDescription}
                      onChange={(val) => setEditDescription(val)}
                      users={users}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
                      placeholder="課題の詳細や手順などを記入... (@でメンバーをメンション)"
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
                      <span className="text-slate-400 italic">詳細情報はありません。</span>
                    )}
                  </div>
                )}
              </div>

              {/* 子課題セクション */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
                    <span>子課題 ({childrenIssues.length})</span>
                  </h3>
                  {!isAddingChild && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingChild(true);
                        setChildError("");
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>子課題を追加</span>
                    </button>
                  )}
                </div>

                {/* 子課題一覧 */}
                {childrenIssues.length > 0 && (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                    {childrenIssues.map((child) => (
                      <Link
                        key={child.id}
                        href={`/issues/${child.issue_key}`}
                        className="p-3 bg-white hover:bg-indigo-50/60 flex items-center justify-between gap-3 transition-colors group cursor-pointer block"
                        title={`子課題 [${child.issue_key}] を開く`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <TypeBadge type={child.issue_type} />
                          <span className="font-mono font-bold text-indigo-600 group-hover:underline shrink-0">
                            {child.issue_key}
                          </span>
                          <span className="text-slate-800 group-hover:text-indigo-600 font-medium truncate">
                            {child.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={child.status} />
                          {child.assignee_name && (
                            <span className="text-slate-500">
                              {child.assignee_name}
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* 子課題が0件でインラインフォームも閉じてる場合の案内（重複する追加ボタンは置かずシンプルに表示） */}
                {childrenIssues.length === 0 && !isAddingChild && (
                  <div className="bg-slate-50/70 border border-dashed border-slate-200 rounded-xl p-4 text-center text-xs text-slate-400">
                    子課題はまだ登録されていません
                  </div>
                )}

                {/* 子課題インライン追加フォーム */}
                {isAddingChild && (
                  <form
                    onSubmit={handleAddChildIssue}
                    className="p-3.5 bg-slate-50 border border-indigo-200 rounded-xl space-y-3 text-xs shadow-xs"
                  >
                    <div className="font-semibold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-indigo-700">
                        <Plus className="w-3.5 h-3.5" />
                        子課題のクイック追加
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCreateIssueDefaultParentId(issue.id);
                          setIsCreateIssueOpen(true);
                        }}
                        className="text-slate-500 hover:text-indigo-600 hover:underline text-[11px] font-normal cursor-pointer"
                      >
                        詳細を入力して作成...
                      </button>
                    </div>

                    {childError && (
                      <div className="p-2 bg-red-50 text-red-600 border border-red-200 rounded text-xs">
                        {childError}
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={childType}
                        onChange={(e) => setChildType(e.target.value as IssueType)}
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shrink-0"
                      >
                        <option value="task">タスク</option>
                        <option value="bug">バグ</option>
                        <option value="request">要望</option>
                        <option value="other">その他</option>
                      </select>

                      <input
                        type="text"
                        value={childTitle}
                        onChange={(e) => setChildTitle(e.target.value)}
                        placeholder="子課題のタイトルを入力... (Enterで追加)"
                        autoFocus
                        disabled={isSubmittingChild}
                        className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />

                      <select
                        value={childAssigneeId}
                        onChange={(e) => setChildAssigneeId(e.target.value)}
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shrink-0"
                      >
                        <option value="">担当者なし</option>
                        {users.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingChild(false);
                          setChildTitle("");
                          setChildError("");
                        }}
                        disabled={isSubmittingChild}
                        className="px-3 py-1.5 text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                      >
                        閉じる
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingChild || !childTitle.trim()}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        {isSubmittingChild ? "追加中..." : "追加"}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* コメントセクション */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  <span>コメント ({comments.length})</span>
                </h3>

                {/* コメント一覧 */}
                <div className="space-y-3">
                  {comments.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">まだコメントはありません。</p>
                  ) : (
                    comments.map((c) => {
                      const isAdmin = currentUser?.is_admin === 1;
                      const canEdit =
                        Boolean(currentUser) &&
                        (c.user_id === currentUser?.id || isAdmin);
                      const isEditingThis = editingCommentId === c.id;
                      const isEdited = Boolean(
                        c.updated_at || (c.history_count && c.history_count > 0)
                      );

                      return (
                        <div
                          key={c.id}
                          className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between text-slate-500">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                style={{ backgroundColor: c.user_color || "#4f46e5" }}
                              >
                                {getUserInitials(c.user_name || "名無")}
                              </div>
                              <span className="font-semibold text-slate-700">
                                {c.user_name || "名無し"}
                              </span>
                              {isEdited && (
                                <button
                                  type="button"
                                  onClick={() => setHistoryModalCommentId(c.id)}
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer font-medium"
                                  title="クリックして編集履歴を確認"
                                >
                                  (編集済み{c.history_count ? ` · ${c.history_count}件` : ""})
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-400">
                                {formatTimestamp(c.created_at, settings, true)}
                              </span>
                              {canEdit && !isEditingThis && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditComment(c)}
                                  className="text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 p-1 rounded transition-colors cursor-pointer"
                                  title="コメントを編集"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {isAdmin && !isEditingThis && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteComment(c.id)}
                                  className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded transition-colors cursor-pointer"
                                  title="コメントを完全に削除（管理者のみ）"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {isEditingThis ? (
                            <div className="space-y-2 pt-1 pl-6">
                              <MentionTextarea
                                rows={3}
                                value={editCommentContent}
                                onChange={(val) => setEditCommentContent(val)}
                                users={users}
                                className="w-full bg-white border border-indigo-400 rounded-lg p-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                                placeholder="コメントを修正... (@でメンバーをメンション)"
                                disabled={isSavingComment}
                                autoFocus
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={handleCancelEditComment}
                                  disabled={isSavingComment}
                                  className="px-2.5 py-1 text-slate-600 hover:bg-slate-200/70 rounded text-xs transition-colors"
                                >
                                  キャンセル
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditComment(c.id)}
                                  disabled={isSavingComment || !editCommentContent.trim()}
                                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium transition-colors shadow-2xs disabled:opacity-50"
                                >
                                  {isSavingComment ? "保存中..." : "保存"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <MentionText text={c.content} users={users} className="pl-6 text-sm text-slate-800" />
                              <CommentReactionBar
                                issueId={issue.id}
                                commentId={c.id}
                                reactions={c.reactions || []}
                                currentUserId={currentUser?.id || null}
                                currentUserName={currentUser?.name || null}
                                currentUserColor={currentUser?.color || null}
                                onReactionsUpdated={(cid, nextReactions) => {
                                  setComments((prev) =>
                                    prev.map((item) =>
                                      item.id === cid ? { ...item, reactions: nextReactions } : item
                                    )
                                  );
                                }}
                              />
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* コメント投稿フォーム */}
                <form onSubmit={handlePostComment} className="pt-2 space-y-2.5">
                  <MentionTextarea
                    rows={2}
                    value={newComment}
                    onChange={(val) => setNewComment(val)}
                    users={users}
                    placeholder="コメントを入力... (@でメンバーをメンション)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                  <NotifyUserSelector
                    users={users}
                    currentUserId={currentUser?.id || null}
                    selectedUserIds={commentNotifyUserIds}
                    onChange={setCommentNotifyUserIds}
                    autoNotifyUserIds={
                      [
                        issue.created_by ? Number(issue.created_by) : 0,
                        issue.assignee_id ? Number(issue.assignee_id) : 0,
                      ].filter(Boolean)
                    }
                    participantUserIds={
                      [
                        issue.created_by ? Number(issue.created_by) : 0,
                        issue.assignee_id ? Number(issue.assignee_id) : 0,
                        ...comments.map((c) => Number(c.user_id || 0)),
                      ].filter(Boolean)
                    }
                    label="コメントを通知するメンバー（参加者）"
                    compact
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!newComment.trim() || isPostingComment}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isPostingComment ? "送信中..." : "コメントを投稿"}</span>
                    </button>
                  </div>
                </form>
              </div>
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

      {/* コメント編集履歴モーダル */}
      {issue && (
        <CommentHistoryModal
          isOpen={historyModalCommentId !== null}
          onClose={() => setHistoryModalCommentId(null)}
          issueId={issue.id}
          commentId={historyModalCommentId}
          settings={settings}
          users={users}
        />
      )}

      {/* 課題変更履歴モーダル */}
      {issue && (
        <IssueHistoryModal
          isOpen={isIssueHistoryOpen}
          onClose={() => setIsIssueHistoryOpen(false)}
          issueId={issue.id}
          initialTab={issueHistoryTab}
          settings={settings}
          users={users}
        />
      )}
    </div>
  );
}
