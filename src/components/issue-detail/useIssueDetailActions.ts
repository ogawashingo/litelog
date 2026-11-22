// 課題詳細（モーダル・個別ページ）共通のコメント投稿・編集・削除・子課題クイック追加・課題削除・URLコピー管理フック
"use client";

import React, { useState } from "react";
import {
  Comment,
  Issue,
  IssueResolution,
  IssueStatus,
  IssueType,
  User,
} from "@/types";
import { createApiError, getSafeErrorMessage } from "@/lib/clientError";
import { notifyNotificationsUpdated } from "@/lib/clientEvents";

interface UseIssueDetailActionsOptions {
  /** 現在操作対象の課題（未ロード時は null） */
  activeIssue: Issue | null;
  /** ログイン中ユーザー */
  currentUser: User | null;
  /** 課題削除権限フラグ */
  canDelete: boolean;
  /** コメント一覧更新セッター */
  setComments: React.Dispatch<React.SetStateAction<Comment[]>>;
  /** コメント投稿等で課題自体（status / resolution）が更新された際の同期コールバック */
  onIssueSyncedFromComment: (updatedIssue: Issue) => void;
  /** 子課題追加後などの課題データ再取得コールバック */
  onReloadIssueData: () => Promise<void>;
  /** ユーザー一覧再取得コールバック */
  refreshUsers: () => Promise<void>;
  /** モーダル用の親一覧更新通知コールバック（任意） */
  onUpdated?: () => void;
  /** 課題削除成功時のコールバック */
  onDeleteSuccess: () => void;
  /** コピーするURL文字列を返す関数 */
  getCopyUrl: (issue: Issue) => string;
}

export function useIssueDetailActions({
  activeIssue,
  currentUser,
  canDelete,
  setComments,
  onIssueSyncedFromComment,
  onReloadIssueData,
  refreshUsers,
  onUpdated,
  onDeleteSuccess,
  getCopyUrl,
}: UseIssueDetailActionsOptions) {
  // URLコピー表示State
  const [isCopiedUrl, setIsCopiedUrl] = useState(false);

  // コメント投稿・編集State
  const [newComment, setNewComment] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentContent, setEditCommentContent] = useState("");
  const [isSavingComment, setIsSavingComment] = useState(false);

  // 子課題クイック追加State
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [childTitle, setChildTitle] = useState("");
  const [childType, setChildType] = useState<IssueType>("task");
  const [childAssigneeId, setChildAssigneeId] = useState<string>("");
  const [isSubmittingChild, setIsSubmittingChild] = useState(false);
  const [childError, setChildError] = useState("");

  // 課題URLをクリップボードにコピー
  const handleCopyLink = async () => {
    if (!activeIssue) return;
    try {
      const fullUrl = getCopyUrl(activeIssue);
      await navigator.clipboard.writeText(fullUrl);
      setIsCopiedUrl(true);
      setTimeout(() => setIsCopiedUrl(false), 2000);
    } catch (err) {
      console.error("URLコピー失敗:", err);
    }
  };

  // コメントの投稿
  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeIssue || isPostingComment || !newComment.trim()) return;

    try {
      setIsPostingComment(true);
      const res = await fetch(`/api/issues/${activeIssue.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newComment.trim(),
          userId: currentUser?.id || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.comment) {
          setComments((prev) => [...prev, data.comment]);
        }
        if (data.issue) {
          onIssueSyncedFromComment(data.issue);
        }
        setNewComment("");
        notifyNotificationsUpdated();
        await refreshUsers();
        onUpdated?.();
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
    if (!activeIssue || !editCommentContent.trim() || isSavingComment) return;

    try {
      setIsSavingComment(true);
      const res = await fetch(`/api/issues/${activeIssue.id}/comments/${commentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editCommentContent.trim() }),
      });

      if (res.ok) {
        const updated = await res.json();
        setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
        setEditingCommentId(null);
        setEditCommentContent("");
        onUpdated?.();
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
    if (!activeIssue) return;
    if (!confirm("このコメント（および編集履歴）を完全に削除しますか？\n※この操作は取り消せません。")) {
      return;
    }

    try {
      const res = await fetch(`/api/issues/${activeIssue.id}/comments/${commentId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        if (editingCommentId === commentId) {
          setEditingCommentId(null);
          setEditCommentContent("");
        }
        onUpdated?.();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "コメントの削除に失敗しました");
      }
    } catch (err) {
      console.error("コメント削除エラー:", err);
      alert("コメントの削除に失敗しました");
    }
  };

  // 課題の削除（作成者または管理者のみ実行可能）
  const handleDelete = async () => {
    if (!activeIssue) return;
    if (!canDelete) {
      alert("課題を削除できるのは、課題の作成者または管理者のみです。");
      return;
    }
    if (!confirm(`課題 [${activeIssue.issue_key}] 「${activeIssue.title}」を完全に削除しますか？`)) {
      return;
    }
    try {
      const actorQuery = currentUser?.id ? `?actorId=${currentUser.id}` : "";
      const res = await fetch(`/api/issues/${activeIssue.id}${actorQuery}`, { method: "DELETE" });
      if (res.ok) {
        await refreshUsers();
        onDeleteSuccess();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "課題の削除に失敗しました");
      }
    } catch (err) {
      console.error("削除エラー:", err);
      alert("課題の削除に失敗しました");
    }
  };

  // 子課題のクイック追加
  const handleAddChildIssue = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeIssue || !childTitle.trim() || isSubmittingChild) return;

    try {
      setIsSubmittingChild(true);
      setChildError("");
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: activeIssue.project_id,
          parentId: activeIssue.id,
          title: childTitle.trim(),
          issueType: childType,
          assigneeId: childAssigneeId ? Number(childAssigneeId) : null,
          actorId: currentUser?.id || null,
          status: "open" as IssueStatus,
          priority: "medium",
        }),
      });

      if (!res.ok) {
        throw await createApiError(res, "子課題の作成に失敗しました");
      }

      // 入力欄をクリアして子課題一覧・最新情報を同期
      setChildTitle("");
      await onReloadIssueData();
      await refreshUsers();
      onUpdated?.();
    } catch (err: unknown) {
      console.error("子課題作成エラー:", err);
      setChildError(getSafeErrorMessage(err, "子課題の作成に失敗しました"));
    } finally {
      setIsSubmittingChild(false);
    }
  };

  return {
    isCopiedUrl,
    handleCopyLink,
    newComment,
    setNewComment,
    isPostingComment,
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
  };
}

/** コメント投稿レスポンスから status / resolution を同期する型ヘルパー */
export type SyncIssueStatusFn = (
  nextIssue: Issue,
  setStatus: (s: IssueStatus) => void,
  setResolution: (r: IssueResolution | null) => void
) => void;
