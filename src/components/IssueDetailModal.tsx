// 課題詳細・編集・コメント追加モーダルコンポーネント
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { X, Send, Calendar, Clock, Edit2, Check, MessageSquare, Trash2, GitBranch, Link as LinkIcon, ArrowLeft, Plus } from "lucide-react";
import { Issue, Comment, IssueStatus, IssueType, IssuePriority } from "@/types";
import { TypeBadge, StatusBadge, PriorityBadge } from "./IssueBadge";
import { useUser } from "./UserContext";
import { getUserInitials } from "./UserManageModal";
import { formatTimestamp } from "@/lib/dateUtils";
import MentionTextarea from "./MentionTextarea";
import MentionText from "./MentionText";
import { DatePicker } from "./DatePicker";
import CommentHistoryModal from "./CommentHistoryModal";
import IssueHistoryModal from "./IssueHistoryModal";

interface IssueDetailModalProps {
  issue: Issue | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
  onSelectIssue?: (issue: Issue) => void; // 親コンポーネントの選択中課題も同期するコールバック
}

export default function IssueDetailModal({
  issue,
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
  onSelectIssue,
}: IssueDetailModalProps) {
  const { users, currentUser, refreshUsers, settings } = useUser();

  // モーダル内部で最新の課題状態を保持（保存・即時変更時に即座に反映）
  const [currentIssue, setCurrentIssue] = useState<Issue | null>(issue);
  const [comments, setComments] = useState<Comment[]>([]);
  const [childrenIssues, setChildrenIssues] = useState<Issue[]>([]);
  const [availableParents, setAvailableParents] = useState<Issue[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentContent, setEditCommentContent] = useState("");
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [historyModalCommentId, setHistoryModalCommentId] = useState<number | null>(null);
  const [isIssueHistoryOpen, setIsIssueHistoryOpen] = useState(false);
  const [issueHistoryTab, setIssueHistoryTab] = useState<"description" | "title" | "dates" | "all">("description");
  const [isEditing, setIsEditing] = useState(false);
  const [isCopiedUrl, setIsCopiedUrl] = useState(false);

  // 子課題クイック追加State
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [childTitle, setChildTitle] = useState("");
  const [childType, setChildType] = useState<IssueType>("task");
  const [childAssigneeId, setChildAssigneeId] = useState<string>("");
  const [isSubmittingChild, setIsSubmittingChild] = useState(false);
  const [childError, setChildError] = useState("");

  // モーダルコンテンツ領域のスクロールRef（課題切り替え時に先頭へスクロール）
  const contentScrollRef = React.useRef<HTMLDivElement>(null);

  // 最新の onClose コールバックを保持
  const onCloseRef = React.useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // モーダルを開いた元の画面のURLを保持
  const originalUrlRef = React.useRef<string | null>(null);

  // モーダルオープン時および課題切り替え時のURL同期（ブラウザアドレスバーを /issues/MYPRJ-30 に更新）
  useEffect(() => {
    if (!isOpen || !issue) {
      // モーダルが閉じたときにURLを元に戻す
      if (originalUrlRef.current) {
        const returnUrl = originalUrlRef.current;
        originalUrlRef.current = null;
        if (typeof window !== "undefined" && window.location.pathname.startsWith("/issues/")) {
          window.history.replaceState(null, "", returnUrl);
        }
      }
      return;
    }

    // 初回オープン時は元のURLを保存
    if (!originalUrlRef.current) {
      originalUrlRef.current = window.location.pathname + window.location.search;
    }

    // 現在表示中の課題キーに合わせてURLを更新
    const targetUrl = `/issues/${issue.issue_key}`;
    if (typeof window !== "undefined" && window.location.pathname !== targetUrl) {
      window.history.pushState(
        { modalIssueKey: issue.issue_key, returnUrl: originalUrlRef.current },
        "",
        targetUrl
      );
    }
  }, [issue?.issue_key, isOpen]);

  // ブラウザの戻る操作でモーダルを閉じる
  useEffect(() => {
    if (!isOpen) return;

    const handlePopState = () => {
      onCloseRef.current();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      // アンマウント時にもURLを安全に復元
      if (originalUrlRef.current) {
        const returnUrl = originalUrlRef.current;
        originalUrlRef.current = null;
        if (typeof window !== "undefined" && window.location.pathname.startsWith("/issues/")) {
          window.history.replaceState(null, "", returnUrl);
        }
      }
    };
  }, [isOpen]);

  // 子課題または親課題をクリックして表示課題を切り替える
  const handleSwitchIssue = async (target: Issue | { id: number; issue_key?: string | null }) => {
    setIsEditing(false);
    contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });

    // 親コンポーネントのコールバックがある場合
    if (onSelectIssue) {
      if ("title" in target && target.title) {
        onSelectIssue(target as Issue);
      } else {
        // 親課題バッジなどID情報のみの場合はAPIから完全な課題情報を取得して親に渡す
        try {
          const res = await fetch(`/api/issues/${target.id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.issue) {
              onSelectIssue(data.issue);
            }
          }
        } catch (err) {
          console.error("課題切り替えエラー:", err);
        }
      }
    } else {
      // 親のコールバックが渡されていない場合はローカル状態で課題詳細を取得・更新
      try {
        const res = await fetch(`/api/issues/${target.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.issue) {
            const nextIssue: Issue = data.issue;
            setCurrentIssue(nextIssue);
            setEditTitle(nextIssue.title);
            setEditDescription(nextIssue.description || "");
            setEditStatus(nextIssue.status);
            setEditPriority(nextIssue.priority);
            setEditType(nextIssue.issue_type);
            setEditAssigneeId(nextIssue.assignee_id ? String(nextIssue.assignee_id) : "");
            setEditParentId(nextIssue.parent_id ? String(nextIssue.parent_id) : "");
            setEditStartDate(nextIssue.start_date || "");
            setEditDueDate(nextIssue.due_date || "");
            setComments(Array.isArray(data.comments) ? data.comments : []);
            setChildrenIssues(Array.isArray(data.children) ? data.children : []);

            fetch(`/api/issues?projectId=${nextIssue.project_id}`)
              .then((r) => r.json())
              .then((parents) => {
                if (Array.isArray(parents)) {
                  setAvailableParents(parents.filter((item: Issue) => item.id !== nextIssue.id));
                }
              })
              .catch((err) => console.error("親課題候補取得失敗:", err));

            if (typeof window !== "undefined" && originalUrlRef.current) {
              const targetUrl = `/issues/${nextIssue.issue_key}`;
              if (window.location.pathname !== targetUrl) {
                window.history.pushState(
                  { modalIssueKey: nextIssue.issue_key, returnUrl: originalUrlRef.current },
                  "",
                  targetUrl
                );
              }
            }
          }
        }
      } catch (err) {
        console.error("課題切り替えエラー:", err);
      }
    }
  };

  // 課題URLをクリップボードにコピー
  const handleCopyLink = async () => {
    if (!issue) return;
    try {
      const fullUrl = `${window.location.origin}/issues/${issue.issue_key}`;
      await navigator.clipboard.writeText(fullUrl);
      setIsCopiedUrl(true);
      setTimeout(() => setIsCopiedUrl(false), 2000);
    } catch (err) {
      console.error("URLコピー失敗:", err);
    }
  };

  // 編集用フォームState
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

  // 課題が切り替わったときに詳細・コメント・子課題・親候補を取得し、編集状態を同期
  useEffect(() => {
    if (!issue || !isOpen) return;

    setCurrentIssue(issue);
    setEditTitle(issue.title);
    setEditDescription(issue.description || "");
    setEditStatus(issue.status);
    setEditPriority(issue.priority);
    setEditType(issue.issue_type);
    setEditAssigneeId(issue.assignee_id ? String(issue.assignee_id) : "");
    setEditParentId(issue.parent_id ? String(issue.parent_id) : "");
    setEditStartDate(issue.start_date || "");
    setEditDueDate(issue.due_date || "");
    setIsEditing(false);
    setIsAddingChild(false);
    setChildTitle("");
    setChildError("");

    // 課題詳細（コメントや子課題含む）の最新情報をAPIから取得して同期
    fetch(`/api/issues/${issue.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.issue) {
          setCurrentIssue(data.issue);
          setEditPriority(data.issue.priority);
          setEditStatus(data.issue.status);
        }
        if (Array.isArray(data.comments)) {
          setComments(data.comments);
        }
        if (Array.isArray(data.children)) {
          setChildrenIssues(data.children);
        }
      })
      .catch((err) => console.error("詳細取得失敗:", err));

    // 同プロジェクト内の親課題候補一覧を取得
    fetch(`/api/issues?projectId=${issue.project_id}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAvailableParents(data.filter((item: Issue) => item.id !== issue.id));
        }
      })
      .catch((err) => console.error("親課題候補取得失敗:", err));
  }, [issue, isOpen]);

  // 未完了の子課題件数および存在判定（親課題の完了制御用：早期リターンより前で宣言してRules of Hooksを遵守）
  const unclosedChildrenCount = useMemo(
    () => childrenIssues.filter((c) => c.status !== "closed").length,
    [childrenIssues]
  );
  const hasUnclosedChildren = unclosedChildrenCount > 0;

  if (!isOpen || !issue) return null;

  // 表示に使うアクティブな課題オブジェクト（ローカルで最新化されたものを優先）
  const activeIssue = currentIssue || issue;

  // 課題の更新を保存
  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;

    if (editStatus === "closed" && hasUnclosedChildren) {
      alert(`未完了の子課題が ${unclosedChildrenCount} 件存在するため、親課題を完了にすることはできません。`);
      return;
    }

    try {
      setIsSaving(true);
      // 楽観的UI更新
      setCurrentIssue((prev) =>
        prev
          ? {
              ...prev,
              title: editTitle.trim(),
              description: editDescription.trim(),
              status: editStatus,
              priority: editPriority,
              issue_type: editType,
              assignee_id: editAssigneeId ? Number(editAssigneeId) : null,
              parent_id: editParentId ? Number(editParentId) : null,
              start_date: editStartDate || null,
              due_date: editDueDate || null,
            }
          : null
      );

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
        // DB最新レコードで再同期
        const detailRes = await fetch(`/api/issues/${issue.id}`);
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          if (detailData.issue) setCurrentIssue(detailData.issue);
        }
        await refreshUsers();
        onUpdated();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "課題の更新に失敗しました");
        // 最新データを再取得してロールバック
        const detailRes = await fetch(`/api/issues/${issue.id}`);
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          if (detailData.issue) {
            setCurrentIssue(detailData.issue);
            setEditStatus(detailData.issue.status);
          }
        }
      }
    } catch (err) {
      console.error("更新エラー:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // ステータス即時変更
  const handleQuickStatusChange = async (newStatus: IssueStatus) => {
    if (newStatus === "closed" && hasUnclosedChildren) {
      alert(`未完了の子課題が ${unclosedChildrenCount} 件存在するため、親課題を完了にすることはできません。`);
      return;
    }

    const previousStatus = activeIssue.status;
    try {
      setCurrentIssue((prev) => (prev ? { ...prev, status: newStatus } : null));
      setEditStatus(newStatus);
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        await refreshUsers();
        onUpdated();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "ステータス変更に失敗しました");
        setCurrentIssue((prev) => (prev ? { ...prev, status: previousStatus } : null));
        setEditStatus(previousStatus);
      }
    } catch (err) {
      console.error("ステータス変更エラー:", err);
      setCurrentIssue((prev) => (prev ? { ...prev, status: previousStatus } : null));
      setEditStatus(previousStatus);
    }
  };

  // 優先度即時変更（モーダル上で直接変更可能）
  const handleQuickPriorityChange = async (newPriority: IssuePriority) => {
    try {
      // 楽観的UI即時反映
      setCurrentIssue((prev) => (prev ? { ...prev, priority: newPriority } : null));
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
        onUpdated();
      }
    } catch (err) {
      console.error("優先度変更エラー:", err);
    }
  };

  // 担当者即時変更
  const handleQuickAssigneeChange = async (newAssigneeIdStr: string) => {
    try {
      const targetAssigneeId = newAssigneeIdStr ? Number(newAssigneeIdStr) : null;
      setCurrentIssue((prev) => (prev ? { ...prev, assignee_id: targetAssigneeId } : null));
      setEditAssigneeId(newAssigneeIdStr);
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeId: targetAssigneeId,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        const detailRes = await fetch(`/api/issues/${issue.id}`);
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          if (detailData.issue) setCurrentIssue(detailData.issue);
        }
        await refreshUsers();
        onUpdated();
      }
    } catch (err) {
      console.error("担当者変更エラー:", err);
    }
  };

  // コメントの投稿
  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isPostingComment) return;

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
        onUpdated(); // アクティビティや更新日時の反映
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
    if (!editCommentContent.trim() || isSavingComment) return;

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
        onUpdated();
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
        onUpdated();
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
    if (!confirm(`課題 [${issue.issue_key}] 「${issue.title}」を完全に削除しますか？`)) {
      return;
    }
    try {
      const actorQuery = currentUser?.id ? `?actorId=${currentUser.id}` : "";
      const res = await fetch(`/api/issues/${issue.id}${actorQuery}`, { method: "DELETE" });
      if (res.ok) {
        await refreshUsers();
        onDeleted();
        onClose();
      }
    } catch (err) {
      console.error("削除エラー:", err);
    }
  };

  // 課題詳細（コメント・子課題・最新ステータス）を再取得
  const reloadIssueData = async () => {
    const targetIssueId = currentIssue?.id || issue?.id;
    if (!targetIssueId) return;
    try {
      const res = await fetch(`/api/issues/${targetIssueId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.issue) {
          setCurrentIssue(data.issue);
          setEditPriority(data.issue.priority);
          setEditStatus(data.issue.status);
        }
        if (Array.isArray(data.comments)) {
          setComments(data.comments);
        }
        if (Array.isArray(data.children)) {
          setChildrenIssues(data.children);
        }
      }
    } catch (err) {
      console.error("詳細再取得失敗:", err);
    }
  };

  // 子課題のクイック追加
  const handleAddChildIssue = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const activeIssue = currentIssue || issue;
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
          status: "open",
          priority: "medium",
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "子課題の作成に失敗しました");
      }

      // 入力欄をクリアして子課題一覧・最新情報を同期
      setChildTitle("");
      await reloadIssueData();
      await refreshUsers();
      onUpdated();
    } catch (err: unknown) {
      console.error("子課題作成エラー:", err);
      setChildError(err instanceof Error ? err.message : "子課題の作成に失敗しました");
    } finally {
      setIsSubmittingChild(false);
    }
  };

  const currentAssignee = users.find((u) => u.id === Number(editAssigneeId));

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white sm:rounded-xl shadow-2xl border border-gray-200 w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 h-full sm:h-auto sm:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー（スマホで絶対にはみ出さず、戻るボタン＆✕ボタンを常時確保） */}
        <div className="bg-gray-100 border-b border-gray-200 px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between shrink-0 gap-2">
          {/* 左側: モバイル用「戻る」ボタン ＆ 種別・キー・プロジェクト名 */}
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
            {/* モバイルで親指で確実に押せる「← 戻る」ボタン */}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-slate-700 hover:bg-gray-200 active:bg-gray-300 font-bold text-xs sm:hidden shrink-0 cursor-pointer"
              title="一覧へ戻る"
              aria-label="一覧へ戻る"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>戻る</span>
            </button>

            <TypeBadge type={isEditing ? editType : activeIssue.issue_type} />
            <span className="font-bold text-gray-800 text-xs sm:text-sm tracking-wide shrink-0">
              {activeIssue.issue_key}
            </span>
            {activeIssue.project_name && (
              <span className="text-[11px] sm:text-xs bg-white border border-gray-200 px-1.5 sm:px-2 py-0.5 rounded text-gray-600 truncate max-w-[90px] sm:max-w-none">
                {activeIssue.project_name}
              </span>
            )}
          </div>

          {/* 右側: 各種アクションボタン ＆ 閉じる✕ボタン */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* URLコピーボタン */}
            <button
              type="button"
              onClick={handleCopyLink}
              className={`flex items-center gap-1 text-xs font-semibold px-2 sm:px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                isCopiedUrl
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
              title="課題の一意URLをコピー"
            >
              {isCopiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="hidden sm:inline">コピー完了</span>
                </>
              ) : (
                <>
                  <LinkIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">URLコピー</span>
                </>
              )}
            </button>

            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 text-xs font-semibold px-2 sm:px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">編集</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 sm:px-3 py-1 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{isSaving ? "保存中" : "保存"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
              title="課題を削除"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors cursor-pointer shrink-0"
              title="閉じる"
              aria-label="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* コンテンツ本体 */}
        <div ref={contentScrollRef} className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* 編集モード時のフォーム */}
          {isEditing ? (
            <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">件名</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* 編集モード時の属性グリッド（担当者と優先度等の横隙間を十分に確保） */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-3.5 text-xs">
                <div className="min-w-0">
                  <label className="block font-bold text-gray-700 mb-1">種別</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as IssueType)}
                    className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-800"
                  >
                    <option value="task">タスク</option>
                    <option value="bug">バグ</option>
                    <option value="request">要望</option>
                    <option value="other">その他</option>
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="block font-bold text-gray-700 mb-1">状態</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as IssueStatus)}
                    className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-800"
                  >
                    <option value="open">未対応</option>
                    <option value="in_progress">処理中</option>
                    <option value="resolved">処理済み</option>
                    <option value="closed" disabled={hasUnclosedChildren} title={hasUnclosedChildren ? `未完了の子課題が ${unclosedChildrenCount} 件あります` : undefined}>
                      完了{hasUnclosedChildren ? " (未完了の子課題あり)" : ""}
                    </option>
                  </select>
                  {hasUnclosedChildren && (
                    <p className="text-[10px] text-amber-600 mt-1 leading-tight">
                      ※未完了の子課題あり（{unclosedChildrenCount}件）
                    </p>
                  )}
                </div>

                <div className="min-w-0">
                  <label className="block font-bold text-gray-700 mb-1">担当者</label>
                  <select
                    value={editAssigneeId}
                    onChange={(e) => setEditAssigneeId(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-800"
                  >
                    <option value="">未割当</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="block font-bold text-gray-700 mb-1">優先度</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as IssuePriority)}
                    className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-800"
                  >
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="block font-bold text-gray-700 mb-1">開始日</label>
                  <DatePicker
                    value={editStartDate || null}
                    onChange={(nextDate) => setEditStartDate(nextDate || "")}
                    placeholder="開始日を設定"
                    fullWidth
                  />
                </div>

                <div className="min-w-0">
                  <label className="block font-bold text-gray-700 mb-1">期限日</label>
                  <DatePicker
                    value={editDueDate || null}
                    onChange={(nextDate) => setEditDueDate(nextDate || "")}
                    placeholder="期限日を設定"
                    fullWidth
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  <span className="flex items-center gap-1">
                    <GitBranch className="w-3.5 h-3.5 text-gray-500" />
                    親課題（任意）
                  </span>
                </label>
                <select
                  value={editParentId}
                  onChange={(e) => setEditParentId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">親課題なし（単独課題）</option>
                  {availableParents
                    .filter((p) => !p.parent_id && p.id !== issue.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.issue_key}] {p.title}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  詳細 <span className="text-[11px] font-normal text-slate-500">(@でメンバーをメンション)</span>
                </label>
                <MentionTextarea
                  rows={5}
                  value={editDescription}
                  onChange={(val) => setEditDescription(val)}
                  users={users}
                  placeholder="課題の詳細・背景・補足メモを入力... (@でメンバー候補を表示)"
                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="px-4 py-1.5 text-xs font-bold rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 cursor-pointer"
                >
                  {isSaving ? "保存中..." : "保存する"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* タイトル ＆ 親課題バッジ */}
              <div>
                {activeIssue.parent_id && activeIssue.parent_issue_key && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeIssue.parent_id) {
                        handleSwitchIssue({ id: activeIssue.parent_id, issue_key: activeIssue.parent_issue_key });
                      }
                    }}
                    className="mb-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-xs text-slate-700 font-medium hover:bg-indigo-100 hover:border-indigo-300 transition-colors cursor-pointer group text-left"
                    title={`親課題 [${activeIssue.parent_issue_key}] を開く`}
                  >
                    <GitBranch className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="text-slate-500">親課題:</span>
                    <span className="font-bold text-indigo-700 group-hover:underline">[{activeIssue.parent_issue_key}]</span>
                    <span className="truncate max-w-sm group-hover:text-indigo-900">{activeIssue.parent_title}</span>
                  </button>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-slate-900 leading-snug">
                    {activeIssue.title}
                  </h2>
                  {Boolean(activeIssue.title_history_count && activeIssue.title_history_count > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setIssueHistoryTab("title");
                        setIsIssueHistoryOpen(true);
                      }}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer font-medium"
                      title="クリックしてタイトルの変更履歴を確認"
                    >
                      (変更履歴 · {activeIssue.title_history_count}件)
                    </button>
                  )}
                </div>
              </div>

              {/* 属性グリッド（状態、担当者、優先度、開始日、期限日、登録日時。担当者と優先度等に十分な隙間を確保） */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 sm:p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-3.5 text-xs">
                {/* 状態変更セレクター */}
                <div className="min-w-0">
                  <span className="text-slate-500 block mb-1 font-medium">状態</span>
                  <select
                    value={activeIssue.status}
                    onChange={(e) => handleQuickStatusChange(e.target.value as IssueStatus)}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold cursor-pointer focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="open">未対応</option>
                    <option value="in_progress">処理中</option>
                    <option value="resolved">処理済み</option>
                    <option value="closed" disabled={hasUnclosedChildren} title={hasUnclosedChildren ? `未完了の子課題が ${unclosedChildrenCount} 件あります` : undefined}>
                      完了{hasUnclosedChildren ? " (未完了あり)" : ""}
                    </option>
                  </select>
                  {hasUnclosedChildren && (
                    <span
                      className="text-[10px] text-amber-600 block mt-1 leading-tight"
                      title={`未完了の子課題が ${unclosedChildrenCount} 件存在するため、すべて完了するまで完了にできません`}
                    >
                      子課題未完了({unclosedChildrenCount})
                    </span>
                  )}
                </div>

                {/* 担当者即時変更セレクター */}
                <div className="min-w-0">
                  <span className="text-slate-500 block mb-1 font-medium">担当者</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div
                      style={{ backgroundColor: currentAssignee?.color || "#9ca3af" }}
                      className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[9px] font-bold shrink-0"
                    >
                      {getUserInitials(currentAssignee?.name)}
                    </div>
                    <select
                      value={activeIssue.assignee_id ? String(activeIssue.assignee_id) : ""}
                      onChange={(e) => handleQuickAssigneeChange(e.target.value)}
                      className="bg-white border border-slate-300 rounded px-1.5 py-1 text-xs font-medium text-slate-800 cursor-pointer focus:ring-1 focus:ring-indigo-500 min-w-0 w-full truncate"
                    >
                      <option value="">未割当</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 優先度即時変更セレクター */}
                <div className="min-w-0">
                  <span className="text-slate-500 block mb-1 font-medium">優先度</span>
                  <select
                    value={activeIssue.priority}
                    onChange={(e) => handleQuickPriorityChange(e.target.value as IssuePriority)}
                    className={`w-full bg-white border rounded px-1.5 py-1 text-xs font-semibold cursor-pointer focus:ring-1 focus:ring-indigo-500 transition-colors ${
                      activeIssue.priority === "high"
                        ? "text-rose-600 border-rose-300 bg-rose-50/80"
                        : activeIssue.priority === "medium"
                        ? "text-amber-600 border-amber-300 bg-amber-50/80"
                        : "text-slate-600 border-slate-300 bg-slate-50/80"
                    }`}
                  >
                    <option value="high">↑ 高</option>
                    <option value="medium">→ 中</option>
                    <option value="low">↓ 低</option>
                  </select>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-gray-500 font-medium">開始日</span>
                    {Boolean(activeIssue.start_date_history_count && activeIssue.start_date_history_count > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setIssueHistoryTab("dates");
                          setIsIssueHistoryOpen(true);
                        }}
                        className="text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1 py-0.2 rounded cursor-pointer font-medium"
                        title="クリックして開始日の変更履歴を確認"
                      >
                        (履歴{activeIssue.start_date_history_count}件)
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 font-medium text-gray-800">
                    <Calendar className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <span className="truncate">{activeIssue.start_date || "指定なし"}</span>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-gray-500 font-medium">期限日</span>
                    {Boolean(activeIssue.due_date_history_count && activeIssue.due_date_history_count > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setIssueHistoryTab("dates");
                          setIsIssueHistoryOpen(true);
                        }}
                        className="text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1 py-0.2 rounded cursor-pointer font-medium"
                        title="クリックして期限日の変更履歴（延期履歴）を確認"
                      >
                        (履歴{activeIssue.due_date_history_count}件)
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 font-medium text-gray-800">
                    <Calendar className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <span className={`truncate ${activeIssue.due_date && new Date(activeIssue.due_date) < new Date() && activeIssue.status !== "closed" ? "text-red-600 font-bold" : ""}`}>
                      {activeIssue.due_date || "指定なし"}
                    </span>
                  </div>
                </div>

                <div className="min-w-0">
                  <span className="text-gray-500 block mb-1 font-medium">登録日時</span>
                  <div
                    className="flex items-start gap-1 text-gray-600"
                    title={`登録: ${formatTimestamp(activeIssue.created_at, settings, true)}\n更新: ${formatTimestamp(activeIssue.updated_at, settings, true)}`}
                  >
                    <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] leading-tight whitespace-normal break-words">
                      {formatTimestamp(activeIssue.created_at, settings, true)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 詳細・メモ内容 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      詳細説明
                    </h4>
                    {Boolean(activeIssue.description_history_count && activeIssue.description_history_count > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setIssueHistoryTab("description");
                          setIsIssueHistoryOpen(true);
                        }}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer font-medium"
                        title="クリックして詳細説明の変更履歴を確認"
                      >
                        (編集済み · {activeIssue.description_history_count}件)
                      </button>
                    )}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-800 leading-relaxed min-h-[90px]">
                  {activeIssue.description ? (
                    <MentionText text={activeIssue.description} users={users} />
                  ) : (
                    <span className="text-gray-400 italic">詳細メモはありません</span>
                  )}
                </div>
              </div>

              {/* 子課題セクション */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
                    <span>子課題 ({childrenIssues.length})</span>
                  </h4>
                  <div className="flex items-center gap-2">
                    {childrenIssues.length > 0 && !isAddingChild && (
                      <span className="text-[11px] text-slate-400">クリックで子課題を開く</span>
                    )}
                    {!isAddingChild && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingChild(true);
                          setChildError("");
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>子課題を追加</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 子課題一覧 */}
                {childrenIssues.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg divide-y divide-slate-200 overflow-hidden">
                    {childrenIssues.map((child) => (
                      <div
                        key={child.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSwitchIssue(child)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSwitchIssue(child);
                          }
                        }}
                        className="px-3 py-2 flex items-center justify-between text-xs hover:bg-indigo-50/70 transition-colors cursor-pointer group select-none"
                        title={`子課題 [${child.issue_key}] を開く`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <TypeBadge type={child.issue_type} showLabel={false} />
                          <a
                            href={`/issues/${child.issue_key}`}
                            onClick={(e) => {
                              if (!e.metaKey && !e.ctrlKey) {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSwitchIssue(child);
                              }
                            }}
                            className="font-bold text-indigo-700 group-hover:text-indigo-900 group-hover:underline shrink-0"
                          >
                            {child.issue_key}
                          </a>
                          <span className="text-slate-800 group-hover:text-slate-900 truncate font-medium">
                            {child.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {child.assignee_name && (
                            <span className="text-[11px] text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                              {child.assignee_name}
                            </span>
                          )}
                          <StatusBadge status={child.status} />
                          {child.due_date && (
                            <span className="text-[11px] text-slate-500">{child.due_date}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 子課題が0件でインラインフォームも閉じてる場合の案内（重複する追加ボタンは置かずシンプルに表示） */}
                {childrenIssues.length === 0 && !isAddingChild && (
                  <div className="bg-slate-50/70 border border-dashed border-slate-200 rounded-lg p-3 text-center text-xs text-slate-400">
                    子課題はまだ登録されていません
                  </div>
                )}

                {/* 子課題インライン追加フォーム */}
                {isAddingChild && (
                  <form
                    onSubmit={handleAddChildIssue}
                    className="p-3 bg-slate-50 border border-indigo-200 rounded-lg space-y-2.5 text-xs shadow-xs"
                  >
                    <div className="font-semibold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-indigo-700">
                        <Plus className="w-3.5 h-3.5" />
                        子課題のクイック追加
                      </span>
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
                        className="bg-white border border-slate-300 rounded-md px-2 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shrink-0"
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
                        className="flex-1 bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />

                      <select
                        value={childAssigneeId}
                        onChange={(e) => setChildAssigneeId(e.target.value)}
                        className="bg-white border border-slate-300 rounded-md px-2 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shrink-0"
                      >
                        <option value="">担当者なし</option>
                        {users.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingChild(false);
                          setChildTitle("");
                          setChildError("");
                        }}
                        disabled={isSubmittingChild}
                        className="px-2.5 py-1 text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded transition-colors cursor-pointer"
                      >
                        閉じる
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingChild || !childTitle.trim()}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        {isSubmittingChild ? "追加中..." : "追加"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}

          {/* コメントセクション */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <span>コメント・作業メモ ({comments.length})</span>
              </h4>
              {currentUser && (
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  投稿者:
                  <strong className="text-slate-800">{currentUser.name}</strong>
                </span>
              )}
            </div>

            {/* コメント一覧 */}
            <div className="space-y-3">
              {comments.map((comment) => {
                const authorName = comment.user_name || "メンバー";
                const authorColor = comment.user_color || "#4f46e5";
                const isAdmin = currentUser?.is_admin === 1;
                const canEdit =
                  Boolean(currentUser) &&
                  (comment.user_id === currentUser?.id || isAdmin);
                const isEditingThis = editingCommentId === comment.id;
                const isEdited = Boolean(
                  comment.updated_at || (comment.history_count && comment.history_count > 0)
                );

                return (
                  <div key={comment.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between text-slate-500">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          style={{ backgroundColor: authorColor }}
                          className="w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[10px]"
                        >
                          {getUserInitials(authorName)}
                        </span>
                        <span className="font-semibold text-slate-800">{authorName}</span>
                        {isEdited && (
                          <button
                            type="button"
                            onClick={() => setHistoryModalCommentId(comment.id)}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer font-medium"
                            title="クリックして編集履歴を確認"
                          >
                            (編集済み{comment.history_count ? ` · ${comment.history_count}件` : ""})
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">
                          {formatTimestamp(comment.created_at, settings, true)}
                        </span>
                        {canEdit && !isEditingThis && (
                          <button
                            type="button"
                            onClick={() => handleStartEditComment(comment)}
                            className="text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 p-1 rounded transition-colors cursor-pointer"
                            title="コメントを編集"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isAdmin && !isEditingThis && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(comment.id)}
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
                          className="w-full bg-white border border-indigo-400 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
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
                            onClick={() => handleSaveEditComment(comment.id)}
                            disabled={isSavingComment || !editCommentContent.trim()}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium transition-colors shadow-2xs disabled:opacity-50"
                          >
                            {isSavingComment ? "保存中..." : "保存"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <MentionText text={comment.content} users={users} className="pl-6 text-sm text-slate-800" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* コメント入力フォーム */}
            <form onSubmit={handlePostComment} className="space-y-2 pt-2">
              <MentionTextarea
                rows={2}
                placeholder={
                  currentUser
                    ? `${currentUser.name} としてコメント・進捗を入力... (@でメンバーをメンション)`
                    : "進捗や気づき、メモを残せます... (@でメンバーをメンション)"
                }
                value={newComment}
                onChange={(val) => setNewComment(val)}
                users={users}
                className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!newComment.trim() || isPostingComment}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isPostingComment ? "投稿中..." : "コメントを投稿"}</span>
                </button>
              </div>
            </form>

            {/* モバイル用最下部 戻るボタン（最下部までスクロールした際にもワンタップで戻れる） */}
            <div className="pt-4 border-t border-slate-200 flex justify-center sm:hidden">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>一覧へ戻る</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* コメント編集履歴モーダル */}
      <CommentHistoryModal
        isOpen={historyModalCommentId !== null}
        onClose={() => setHistoryModalCommentId(null)}
        issueId={issue.id}
        commentId={historyModalCommentId}
        settings={settings}
        users={users}
      />

      {/* 課題変更履歴モーダル */}
      <IssueHistoryModal
        isOpen={isIssueHistoryOpen}
        onClose={() => setIsIssueHistoryOpen(false)}
        issueId={issue.id}
        initialTab={issueHistoryTab}
        settings={settings}
        users={users}
      />
    </div>
  );
}
