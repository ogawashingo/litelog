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
} from "lucide-react";
import Header from "@/components/Header";
import CreateIssueModal from "@/components/CreateIssueModal";
import BackupModal from "@/components/BackupModal";
import CommentHistoryModal from "@/components/CommentHistoryModal";
import IssueHistoryModal from "@/components/IssueHistoryModal";
import { TypeBadge, StatusBadge, PriorityBadge } from "@/components/IssueBadge";
import { DatePicker } from "@/components/DatePicker";
import { useUser } from "@/components/UserContext";
import { getUserInitials } from "@/components/UserManageModal";
import { formatTimestamp } from "@/lib/dateUtils";
import { Issue, Comment, IssueStatus, IssueType, IssuePriority, Project } from "@/types";
import { setStoredProjectId } from "@/lib/projectStorage";

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
  const [editType, setEditType] = useState<IssueType>("task");
  const [editAssigneeId, setEditAssigneeId] = useState<string>("");
  const [editParentId, setEditParentId] = useState<string>("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // URLコピー表示State
  const [isCopiedUrl, setIsCopiedUrl] = useState(false);

  // ヘッダー用モーダルState
  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
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
          issueType: editType,
          assigneeId: editAssigneeId ? Number(editAssigneeId) : null,
          parentId: editParentId ? Number(editParentId) : null,
          startDate: editStartDate || null,
          dueDate: editDueDate || null,
          actorId: currentUser?.id || null,
        }),
      });

      if (res.ok) {
        setIsEditing(false);
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
    try {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        setEditStatus(newStatus);
        setIssue((prev) => (prev ? { ...prev, status: newStatus } : null));
        await refreshUsers();
      }
    } catch (err) {
      console.error("ステータス変更エラー:", err);
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

  // コメントの投稿
  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue || !newComment.trim() || isPostingComment) return;
    try {
      setIsPostingComment(true);
      const res = await fetch(`/api/issues/${issue.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newComment.trim(),
          userId: currentUser?.id || null,
        }),
      });

      if (res.ok) {
        const addedComment = await res.json();
        setComments((prev) => [...prev, addedComment]);
        setNewComment("");
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

  const currentAssignee = users.find((u) => u.id === Number(editAssigneeId));

  // 該当プロジェクトのプロジェクトキー
  const currentProject = projects.find((p) => p.id === issue?.project_id);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
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
        onOpenCreateIssue={() => setIsCreateIssueOpen(true)}
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
            {/* 詳細カードヘッダー */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <TypeBadge type={isEditing ? editType : issue.issue_type} />
                <span className="font-bold text-slate-800 text-base font-mono tracking-wide">
                  {issue.issue_key}
                </span>
                {issue.project_name && (
                  <span className="text-xs bg-white border border-slate-200 px-2.5 py-1 rounded font-medium text-slate-700">
                    {issue.project_name}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
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

            {/* 詳細コンテンツ */}
            <div className="p-6 space-y-6">
              {/* タイトル */}
              {isEditing ? (
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
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-slate-900 leading-snug">{issue.title}</h1>
                  {Boolean(issue.title_history_count && issue.title_history_count > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setIssueHistoryTab("title");
                        setIsIssueHistoryOpen(true);
                      }}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer font-medium"
                      title="クリックしてタイトルの変更履歴を確認"
                    >
                      (変更履歴 · {issue.title_history_count}件)
                    </button>
                  )}
                </div>
              )}

              {/* メタ情報グリッド */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-xs">
                {/* 状態 */}
                <div>
                  <span className="block text-slate-500 mb-1 font-medium">状態</span>
                  {isEditing ? (
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as IssueStatus)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="open">未対応</option>
                      <option value="in_progress">処理中</option>
                      <option value="resolved">処理済み</option>
                      <option value="closed">完了</option>
                    </select>
                  ) : (
                    <select
                      value={issue.status}
                      onChange={(e) => handleQuickStatusChange(e.target.value as IssueStatus)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-medium cursor-pointer"
                    >
                      <option value="open">未対応</option>
                      <option value="in_progress">処理中</option>
                      <option value="resolved">処理済み</option>
                      <option value="closed">完了</option>
                    </select>
                  )}
                </div>

                {/* 優先度 */}
                <div>
                  <span className="block text-slate-500 mb-1 font-medium">優先度</span>
                  {isEditing ? (
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as IssuePriority)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="high">高</option>
                      <option value="medium">中</option>
                      <option value="low">低</option>
                    </select>
                  ) : (
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
                  )}
                </div>

                {/* 担当者 */}
                <div>
                  <span className="block text-slate-500 mb-1 font-medium">担当者</span>
                  {isEditing ? (
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
                  ) : (
                    <select
                      value={issue.assignee_id ? String(issue.assignee_id) : ""}
                      onChange={(e) => handleQuickAssigneeChange(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-medium cursor-pointer"
                    >
                      <option value="">未割当</option>
                      {users.map((u) => (
                        <option key={u.id} value={String(u.id)}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 種別 */}
                <div>
                  <span className="block text-slate-500 mb-1 font-medium">種別</span>
                  {isEditing ? (
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
                  ) : (
                    <TypeBadge type={issue.issue_type} />
                  )}
                </div>
              </div>

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
                  <textarea
                    rows={6}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    placeholder="課題の詳細や手順などを記入..."
                  />
                ) : (
                  <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/70 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed min-h-[80px]">
                    {issue.description ? (
                      issue.description
                    ) : (
                      <span className="text-slate-400 italic">詳細情報はありません。</span>
                    )}
                  </div>
                )}
              </div>

              {/* 子課題一覧 */}
              {childrenIssues.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
                    <span>子課題 ({childrenIssues.length})</span>
                  </h3>
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
                </div>
              )}

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
                              <textarea
                                rows={3}
                                value={editCommentContent}
                                onChange={(e) => setEditCommentContent(e.target.value)}
                                className="w-full bg-white border border-indigo-400 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                                placeholder="コメントを修正..."
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
                            <p className="text-slate-800 whitespace-pre-wrap pl-6 text-sm">
                              {c.content}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* コメント投稿フォーム */}
                <form onSubmit={handlePostComment} className="pt-2">
                  <div className="flex gap-2">
                    <textarea
                      rows={2}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="コメントを入力..."
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                    <button
                      type="submit"
                      disabled={!newComment.trim() || isPostingComment}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 self-end cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>送信</span>
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
        onClose={() => setIsCreateIssueOpen(false)}
        projects={projects}
        selectedProjectId={issue?.project_id || null}
        onCreated={() => {
          setIsCreateIssueOpen(false);
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
        />
      )}
    </div>
  );
}
