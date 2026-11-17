// 課題詳細・編集・コメント追加モーダルコンポーネント
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { X, Send, Calendar, Clock, Edit2, Check, MessageSquare, Trash2, GitBranch, Link as LinkIcon, ArrowLeft, Plus, Paperclip, Download, FileText, Image as ImageIcon, Archive } from "lucide-react";
import { Issue, Comment, IssueStatus, IssueType, IssuePriority, IssueResolution, Attachment, isArchivedProject, canManageIssues, canDeleteIssue, User } from "@/types";
import { TypeBadge, StatusBadge, PriorityBadge, ResolutionBadge } from "./IssueBadge";
import { useUser } from "./UserContext";
import { getUserInitials } from "./UserManageModal";
import { formatTimestamp } from "@/lib/dateUtils";
import MentionTextarea from "./MentionTextarea";
import MentionText from "./MentionText";
import { DatePicker } from "./DatePicker";
import CommentHistoryModal from "./CommentHistoryModal";
import IssueHistoryModal from "./IssueHistoryModal";
import NotifyUserSelector from "./NotifyUserSelector";
import CommentReactionBar from "./CommentReactionBar";
import ResolutionSelect from "./ResolutionSelect";
import ReviewRequestModal from "./ReviewRequestModal";
import UserSelect from "./UserSelect";

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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [childrenIssues, setChildrenIssues] = useState<Issue[]>([]);
  const [availableParents, setAvailableParents] = useState<Issue[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentNotifyUserIds, setCommentNotifyUserIds] = useState<number[]>([]);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentContent, setEditCommentContent] = useState("");
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [historyModalCommentId, setHistoryModalCommentId] = useState<number | null>(null);
  const [isIssueHistoryOpen, setIsIssueHistoryOpen] = useState(false);
  const [issueHistoryTab, setIssueHistoryTab] = useState<"description" | "title" | "dates" | "all">("description");
  const [isEditing, setIsEditing] = useState(false);
  const [isCopiedUrl, setIsCopiedUrl] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // 子課題クイック追加State
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [childTitle, setChildTitle] = useState("");
  const [childType, setChildType] = useState<IssueType>("task");
  const [childAssigneeId, setChildAssigneeId] = useState<string>("");
  const [isSubmittingChild, setIsSubmittingChild] = useState(false);
  const [childError, setChildError] = useState("");

  // プロジェクト参加メンバー一覧State
  const [projectMembers, setProjectMembers] = useState<User[]>([]);

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

    const fetchKey = target.issue_key || target.id;

    // 親コンポーネントのコールバックがある場合
    if (onSelectIssue) {
      if ("title" in target && target.title) {
        onSelectIssue(target as Issue);
      } else {
        // 親課題バッジなどID情報のみの場合はAPIから完全な課題情報を取得して親に渡す
        try {
          const res = await fetch(`/api/issues/${fetchKey}`);
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
        const res = await fetch(`/api/issues/${fetchKey}`);
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
            setAttachments(Array.isArray(data.attachments) ? data.attachments : []);
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

  // 課題キー文字列からのモーダル内ダイレクト切り替え
  const handleSwitchByIssueKey = (issueKey: string) => {
    handleSwitchIssue({ id: 0, issue_key: issueKey });
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
  const [editResolution, setEditResolution] = useState<IssueResolution | null>(null);
  const [editType, setEditType] = useState<IssueType>("task");
  const [editAssigneeId, setEditAssigneeId] = useState<string>("");
  const [editParentId, setEditParentId] = useState<string>("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editNotifyUserIds, setEditNotifyUserIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // 課題が切り替わったときに詳細・コメント・子課題・親候補を取得し、編集状態を同期
  useEffect(() => {
    if (!issue || !isOpen) return;

    setCurrentIssue(issue);
    setEditTitle(issue.title);
    setEditDescription(issue.description || "");
    setEditStatus(issue.status);
    setEditPriority(issue.priority);
    setEditResolution(issue.resolution || null);
    setEditType(issue.issue_type);
    setEditAssigneeId(issue.assignee_id ? String(issue.assignee_id) : "");
    setEditParentId(issue.parent_id ? String(issue.parent_id) : "");
    setEditStartDate(issue.start_date || "");
    setEditDueDate(issue.due_date || "");
    setEditNotifyUserIds([]);
    setCommentNotifyUserIds([]);
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
          setEditResolution(data.issue.resolution || null);
        }
        if (Array.isArray(data.comments)) {
          setComments(data.comments);
        }
        if (Array.isArray(data.attachments)) {
          setAttachments(data.attachments);
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
    // プロジェクト参加メンバー一覧を取得
    fetch(`/api/projects/${issue.project_id}/members`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.members)) {
          setProjectMembers(data.members);
        }
      })
      .catch((err) => console.error("プロジェクトメンバー取得エラー:", err));
  }, [issue, isOpen]);

  // プロジェクト参加メンバー候補（参加者＋Admin/PMO）
  const candidateUsers = useMemo(() => {
    if (projectMembers.length > 0) {
      const memberIds = new Set(projectMembers.map((m) => m.id));
      return users.filter(
        (u) =>
          memberIds.has(u.id) ||
          u.is_admin === 1 ||
          u.role_type === "admin" ||
          u.role_type === "pmo"
      );
    }
    return users;
  }, [projectMembers, users]);

  // 未完了の子課題件数および存在判定（親課題の完了制御用：早期リターンより前で宣言してRules of Hooksを遵守）
  const unclosedChildrenCount = useMemo(
    () => childrenIssues.filter((c) => c.status !== "closed").length,
    [childrenIssues]
  );
  const hasUnclosedChildren = unclosedChildrenCount > 0;

  if (!isOpen || !issue) return null;

  // 表示に使うアクティブな課題オブジェクト（ローカルで最新化されたものを優先）
  const activeIssue = currentIssue || issue;
  // 所属プロジェクトのアーカイブ状態判定（is_archivedフラグまたは名前に「アーカイブ」が含まれるか）
  const isProjectArchived = isArchivedProject(activeIssue);
  // 課題を完了にできる権限判定（起票者・PMO・または管理者のみ）
  const canClose = Boolean(
    canManageIssues(currentUser) ||
    (activeIssue.created_by && currentUser?.id === activeIssue.created_by)
  );
  // 課題を削除できる権限判定（作成者または管理者のみ）
  const canDelete = canDeleteIssue(currentUser, activeIssue);

  // 課題の更新を保存
  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;

    if (editStatus === "closed") {
      if (!canClose) {
        alert("課題を完了にできるのは、課題の起票者または管理者のみです。");
        return;
      }
      if (hasUnclosedChildren) {
        alert(`未完了の子課題が ${unclosedChildrenCount} 件存在するため、親課題を完了にすることはできません。`);
        return;
      }
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
              resolution: editResolution || null,
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
    if (newStatus === "closed") {
      if (!canClose) {
        alert("課題を完了にできるのは、課題の起票者または管理者のみです。\n作業完了時は「処理済み」を選択してレビューを依頼してください。");
        return;
      }
      if (hasUnclosedChildren) {
        alert(`未完了の子課題が ${unclosedChildrenCount} 件存在するため、親課題を完了にすることはできません。`);
        return;
      }
    }

    const previousStatus = activeIssue.status;
    const previousResolution = activeIssue.resolution ?? null;
    const isUnclosing = newStatus !== "closed";

    try {
      // 完了以外に戻す場合は、完了理由も即時nullにクリア
      setCurrentIssue((prev) =>
        prev
          ? {
              ...prev,
              status: newStatus,
              ...(isUnclosing ? { resolution: null } : {}),
            }
          : null
      );
      setEditStatus(newStatus);
      if (isUnclosing) {
        setEditResolution(null);
      }

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
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("backlog:notifications-updated"));
        }
        await refreshUsers();
        onUpdated();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "ステータス変更に失敗しました");
        setCurrentIssue((prev) =>
          prev
            ? { ...prev, status: previousStatus, resolution: previousResolution }
            : null
        );
        setEditStatus(previousStatus);
        setEditResolution(previousResolution);
      }
    } catch (err) {
      console.error("ステータス変更エラー:", err);
      setCurrentIssue((prev) =>
        prev
          ? { ...prev, status: previousStatus, resolution: previousResolution }
          : null
      );
      setEditStatus(previousStatus);
      setEditResolution(previousResolution);
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
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "レビュー依頼の送信に失敗しました");
    }

    // 課題詳細とコメントを再取得
    try {
      const detailRes = await fetch(`/api/issues/${issue.id}`);
      if (detailRes.ok) {
        const detailData = await detailRes.json();
        if (detailData.issue) {
          setCurrentIssue(detailData.issue);
          setEditStatus(detailData.issue.status);
          setEditResolution(detailData.issue.resolution || null);
          setEditAssigneeId(detailData.issue.assignee_id ? String(detailData.issue.assignee_id) : "");
        }
        if (Array.isArray(detailData.comments)) {
          setComments(detailData.comments);
        }
      }
    } catch (e) {
      console.error("更新後の再取得エラー:", e);
    }

    await refreshUsers();
    onUpdated();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("backlog:notifications-updated"));
    }
  };

  // 完了理由即時変更
  const handleQuickResolutionChange = async (newResolution: IssueResolution | null) => {
    const previousResolution = activeIssue.resolution || null;
    try {
      setCurrentIssue((prev) => (prev ? { ...prev, resolution: newResolution } : null));
      setEditResolution(newResolution);
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution: newResolution,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("backlog:notifications-updated"));
        }
        await refreshUsers();
        onUpdated();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "完了理由の変更に失敗しました");
        setCurrentIssue((prev) => (prev ? { ...prev, resolution: previousResolution } : null));
        setEditResolution(previousResolution);
      }
    } catch (err) {
      console.error("完了理由変更エラー:", err);
      setCurrentIssue((prev) => (prev ? { ...prev, resolution: previousResolution } : null));
      setEditResolution(previousResolution);
    }
  };

  // ファイルサイズフォーマット
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 添付ファイル直接追加
  const handleDirectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const formData = new FormData();
      formData.append("issueId", String(activeIssue.id));
      for (let i = 0; i < files.length; i++) {
        formData.append("file", files[i]);
      }

      const res = await fetch("/api/attachments", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const newAtts: Attachment[] = data.attachments || [data];
        setAttachments((prev) => [...prev, ...newAtts]);
        onUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "ファイルのアップロードに失敗しました");
      }
    } catch (err) {
      console.error("添付ファイルアップロードエラー:", err);
      alert("通信エラーによりアップロードに失敗しました");
    } finally {
      e.target.value = "";
    }
  };

  // 添付ファイル削除
  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!confirm("この添付ファイルを削除しますか？")) return;
    try {
      const res = await fetch(`/api/attachments/${attachmentId}`, { method: "DELETE" });
      if (res.ok) {
        setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
        onUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "添付ファイルの削除に失敗しました");
      }
    } catch (err) {
      console.error("添付ファイル削除エラー:", err);
      alert("通信エラーにより削除できませんでした");
    }
  };

  // 種別即時変更（モーダル上で直接変更可能）
  const handleQuickTypeChange = async (newType: IssueType) => {
    const previousType = activeIssue.issue_type;
    if (newType === previousType) return;
    try {
      setCurrentIssue((prev) => (prev ? { ...prev, issue_type: newType } : null));
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
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("backlog:notifications-updated"));
        }
        await refreshUsers();
        onUpdated();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "種別の変更に失敗しました");
        setCurrentIssue((prev) => (prev ? { ...prev, issue_type: previousType } : null));
        setEditType(previousType);
      }
    } catch (err) {
      console.error("種別変更エラー:", err);
      setCurrentIssue((prev) => (prev ? { ...prev, issue_type: previousType } : null));
      setEditType(previousType);
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
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("backlog:notifications-updated"));
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
    if (isPostingComment || !newComment.trim()) return;

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
          setCurrentIssue(data.issue);
          setEditStatus(data.issue.status);
          setEditResolution(data.issue.resolution || null);
        }
        setNewComment("");
        setCommentNotifyUserIds([]);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("backlog:notifications-updated"));
        }
        await refreshUsers();
        onUpdated(); // アクティビティや親一覧の反映
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

  // 課題の削除（作成者または管理者のみ実行可能）
  const handleDelete = async () => {
    if (!canDelete) {
      alert("課題を削除できるのは、課題の作成者または管理者のみです。");
      return;
    }
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
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "課題の削除に失敗しました");
      }
    } catch (err) {
      console.error("削除エラー:", err);
      alert("課題の削除に失敗しました");
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
          setEditResolution(data.issue.resolution || null);
        }
        if (Array.isArray(data.comments)) {
          setComments(data.comments);
        }
        if (Array.isArray(data.attachments)) {
          setAttachments(data.attachments);
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
  // 起票者表示名（結合済みの creator_name、なければ users リストから補完）
  const creatorName =
    activeIssue.creator_name ||
    (activeIssue.created_by ? users.find((u) => u.id === Number(activeIssue.created_by))?.name : null) ||
    null;

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

            <TypeBadge
              type={isEditing ? editType : activeIssue.issue_type}
              disabled={isProjectArchived}
              onChange={(nextType) => {
                if (isEditing) {
                  setEditType(nextType);
                } else {
                  handleQuickTypeChange(nextType);
                }
              }}
            />
            <ResolutionBadge
              resolution={isEditing ? editResolution : activeIssue.resolution}
              className="hidden sm:inline-flex"
            />
            <span className="font-bold text-gray-800 text-xs sm:text-sm tracking-wide shrink-0 whitespace-nowrap">
              {activeIssue.issue_key}
            </span>
            {activeIssue.project_name && (
              <span className="hidden sm:inline-block text-xs bg-white border border-gray-200 px-2 py-0.5 rounded text-gray-600 truncate max-w-[160px] md:max-w-none">
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

            {isProjectArchived ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 sm:px-2.5 py-1 rounded bg-slate-200 text-slate-700 border border-slate-300 shrink-0">
                <Archive className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">アーカイブ（読み取り専用）</span>
              </span>
            ) : (
              <>
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

                {canDelete && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                    title="課題を削除（作成者または管理者のみ）"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </>
            )}

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

        {/* アーカイブ済みプロジェクトのリードオンリー注意バナー */}
        {isProjectArchived && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 flex items-center gap-2 text-xs font-semibold shrink-0">
            <Archive className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              この課題が属するプロジェクトは<strong>アーカイブ</strong>されています。読み取り専用のため、課題情報の修正やステータス変更、コメント投稿は行えません。
            </span>
          </div>
        )}

        {/* 常時固定の課題件名 ＆ 全属性ツールバー（コメント等をスクロールしても常に最上部に留まる） */}
        {!isEditing && (
          <div className="bg-slate-50 border-b border-slate-200 px-3.5 sm:px-6 py-2.5 sm:py-3 shrink-0 shadow-2xs space-y-2">
            {/* 上段: 件名 ＆ 親課題リンク */}
            <div className="min-w-0">
              {activeIssue.parent_id && activeIssue.parent_issue_key && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeIssue.parent_id) {
                      handleSwitchIssue({ id: activeIssue.parent_id, issue_key: activeIssue.parent_issue_key });
                    }
                  }}
                  className="mb-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[11px] text-slate-700 font-medium hover:bg-indigo-100 transition-colors cursor-pointer group truncate max-w-full"
                  title={`親課題 [${activeIssue.parent_issue_key}] を開く`}
                >
                  <GitBranch className="w-3 h-3 text-indigo-500 shrink-0" />
                  <span className="text-slate-500">親:</span>
                  <span className="font-bold text-indigo-700">[{activeIssue.parent_issue_key}]</span>
                  <span className="truncate">{activeIssue.parent_title}</span>
                </button>
              )}
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug line-clamp-2" title={activeIssue.title}>
                  {activeIssue.title}
                </h2>
                {Boolean(activeIssue.title_history_count && activeIssue.title_history_count > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIssueHistoryTab("title");
                      setIsIssueHistoryOpen(true);
                    }}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer font-medium shrink-0"
                    title="タイトルの変更履歴を確認"
                  >
                    (履歴 · {activeIssue.title_history_count}件)
                  </button>
                )}
              </div>
            </div>

            {/* 下段: 全属性スリムツールバー（状態・完了理由・担当者・優先度・期間・登録日時） */}
            <div className="flex items-center gap-2 flex-wrap text-xs pt-0.5">
              {/* 状態セレクター */}
              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold shrink-0">状態:</span>
                <select
                  value={activeIssue.status}
                  disabled={isProjectArchived}
                  onChange={(e) => {
                    const nextStatus = e.target.value as IssueStatus;
                    if (nextStatus === activeIssue.status) return;
                    if (nextStatus === "closed") {
                      if (!canClose) {
                        alert("課題を完了にできるのは、課題の起票者・PMO・または管理者のみです。\n作業完了時は「処理済み」を選択してレビューを依頼してください。");
                        return;
                      }
                      if (hasUnclosedChildren) {
                        alert(`未完了の子課題が ${unclosedChildrenCount} 件存在するため、親課題を完了にすることはできません。`);
                        return;
                      }
                    }
                    if (nextStatus === "resolved" && !canManageIssues(currentUser)) {
                      setIsReviewModalOpen(true);
                      return;
                    }
                    handleQuickStatusChange(nextStatus);
                  }}
                  className={`bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden ${
                    isProjectArchived ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                  }`}
                >
                  <option value="open">未対応</option>
                  <option value="in_progress">処理中</option>
                  <option value="resolved">処理済み</option>
                  <option
                    value="closed"
                    disabled={!canClose || hasUnclosedChildren}
                    title={
                      !canClose
                        ? "課題を完了にできるのは起票者・PMO・または管理者のみです"
                        : hasUnclosedChildren
                        ? `未完了の子課題が ${unclosedChildrenCount} 件あります`
                        : undefined
                    }
                  >
                    完了
                    {!canClose
                      ? " (起票者/PMO/管理者限定)"
                      : hasUnclosedChildren
                      ? " (未完了あり)"
                      : ""}
                  </option>
                </select>
              </div>

              {/* 完了理由セレクター（完了時のみ活性、アーカイブ時は非活性） */}
              <div className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 transition-colors ${
                activeIssue.status === "closed" && !isProjectArchived ? "bg-white border border-slate-300 shadow-2xs" : "opacity-50"
              }`}>
                <span className="text-[10px] text-slate-500 font-medium shrink-0">完了理由:</span>
                <ResolutionSelect
                  value={activeIssue.status === "closed" ? activeIssue.resolution : null}
                  onChange={(nextRes) => handleQuickResolutionChange(nextRes)}
                  disabled={isProjectArchived || activeIssue.status !== "closed"}
                  size="sm"
                  placeholder="--"
                />
                {Boolean(activeIssue.resolution_history_count && activeIssue.resolution_history_count > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIssueHistoryTab("all");
                      setIsIssueHistoryOpen(true);
                    }}
                    className="text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1 py-0.2 rounded cursor-pointer font-medium"
                    title="クリックして完了理由の変更履歴を確認"
                  >
                    ({activeIssue.resolution_history_count})
                  </button>
                )}
              </div>

              {/* 担当者セレクター */}
              <div className="w-[140px] sm:w-[170px]">
                <UserSelect
                  users={candidateUsers}
                  value={activeIssue.assignee_id}
                  disabled={isProjectArchived}
                  onChange={(val) => handleQuickAssigneeChange(val ? String(val) : "")}
                  currentUserId={currentUser?.id}
                  placeholder="未割当"
                  size="sm"
                  className="w-full"
                />
              </div>

              {/* 優先度セレクター */}
              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold shrink-0">優先度:</span>
                <select
                  value={activeIssue.priority}
                  disabled={isProjectArchived}
                  onChange={(e) => handleQuickPriorityChange(e.target.value as IssuePriority)}
                  className={`bg-transparent text-xs font-bold focus:outline-hidden ${
                    isProjectArchived ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                  } ${
                    activeIssue.priority === "high"
                      ? "text-rose-600"
                      : activeIssue.priority === "medium"
                      ? "text-amber-600"
                      : "text-slate-600"
                  }`}
                >
                  <option value="high">↑ 高</option>
                  <option value="medium">→ 中</option>
                  <option value="low">↓ 低</option>
                </select>
              </div>

              {/* 期限日（または期間） */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1 shadow-2xs">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-[10px] text-slate-500 font-medium">期限:</span>
                <span
                  className={`font-semibold ${
                    activeIssue.due_date && new Date(activeIssue.due_date) < new Date() && activeIssue.status !== "closed"
                      ? "text-rose-600 font-bold"
                      : "text-slate-800"
                  }`}
                  title={
                    activeIssue.start_date
                      ? `開始: ${activeIssue.start_date} 〜 期限: ${activeIssue.due_date || "指定なし"}`
                      : undefined
                  }
                >
                  {activeIssue.start_date ? `${activeIssue.start_date} 〜 ` : ""}
                  {activeIssue.due_date || "指定なし"}
                </span>
                {Boolean(
                  (activeIssue.due_date_history_count && activeIssue.due_date_history_count > 0) ||
                  (activeIssue.start_date_history_count && activeIssue.start_date_history_count > 0)
                ) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIssueHistoryTab("dates");
                      setIsIssueHistoryOpen(true);
                    }}
                    className="text-[9px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1 py-0.2 rounded cursor-pointer font-medium ml-0.5"
                    title="日程の変更履歴を確認"
                  >
                    (履歴{(activeIssue.due_date_history_count || 0) + (activeIssue.start_date_history_count || 0)}件)
                  </button>
                )}
              </div>

              {/* 登録日時・起票者（枠を増やさず控えめなメタテキストとして一体表示） */}
              <div
                className="flex items-center gap-1 text-slate-500 text-[11px] px-1 py-1"
                title={`${creatorName ? `起票者: ${creatorName}\n` : ""}登録: ${formatTimestamp(activeIssue.created_at, settings, true)}\n更新: ${formatTimestamp(activeIssue.updated_at, settings, true)}`}
              >
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  登録: {formatTimestamp(activeIssue.created_at, settings, true)}
                  {creatorName && (
                    <span className="ml-1 text-slate-500">
                      (起票: <span className="font-medium text-slate-600">{creatorName}</span>)
                    </span>
                  )}
                </span>
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-x-5 gap-y-3.5 text-xs">
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
                    onChange={(e) => {
                      const nextSt = e.target.value as IssueStatus;
                      setEditStatus(nextSt);
                      if (nextSt !== "closed") {
                        setEditResolution(null);
                      }
                    }}
                    className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-800"
                  >
                    <option value="open">未対応</option>
                    <option value="in_progress">処理中</option>
                    <option value="resolved">処理済み</option>
                    <option
                      value="closed"
                      disabled={!canClose || hasUnclosedChildren}
                      title={
                        !canClose
                          ? "課題を完了にできるのは起票者または管理者のみです"
                          : hasUnclosedChildren
                          ? `未完了の子課題が ${unclosedChildrenCount} 件あります`
                          : undefined
                      }
                    >
                      完了
                      {!canClose
                        ? " (起票者/管理者限定)"
                        : hasUnclosedChildren
                        ? " (未完了の子課題あり)"
                        : ""}
                    </option>
                  </select>
                  {hasUnclosedChildren && (
                    <p className="text-[10px] text-amber-600 mt-1 leading-tight">
                      ※未完了の子課題あり（{unclosedChildrenCount}件）
                    </p>
                  )}
                </div>

                <div className="min-w-0">
                  <label className="block font-bold text-gray-700 mb-1">
                    完了理由
                    {editStatus !== "closed" && (
                      <span className="text-[9px] font-normal text-slate-400 ml-1">
                        (完了時のみ)
                      </span>
                    )}
                  </label>
                  <ResolutionSelect
                    value={editStatus === "closed" ? editResolution : null}
                    onChange={(nextRes) => setEditResolution(nextRes)}
                    disabled={editStatus !== "closed"}
                    placeholder="-- （未設定）"
                  />
                </div>

                <div className="min-w-0">
                  <label className="block font-bold text-gray-700 mb-1">担当者</label>
                  <UserSelect
                    users={candidateUsers}
                    value={editAssigneeId ? Number(editAssigneeId) : null}
                    onChange={(val) => setEditAssigneeId(val ? String(val) : "")}
                    currentUserId={currentUser?.id}
                    placeholder="未割当"
                    className="w-full"
                  />
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
                  issueId={activeIssue.id}
                  onAttachmentUploaded={(att) => setAttachments((prev) => [...prev, att])}
                  placeholder="課題の詳細・背景・補足メモを入力... (@でメンバー候補を表示、画像ペースト・添付対応)"
                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* 編集時の通知先（参加者）チェックボックス選択 */}
              <NotifyUserSelector
                users={users}
                currentUserId={currentUser?.id || null}
                selectedUserIds={editNotifyUserIds}
                onChange={setEditNotifyUserIds}
                autoNotifyUserIds={
                  [
                    activeIssue.created_by ? Number(activeIssue.created_by) : 0,
                    editAssigneeId ? Number(editAssigneeId) : 0,
                  ].filter(Boolean)
                }
                participantUserIds={
                  [
                    activeIssue.created_by ? Number(activeIssue.created_by) : 0,
                    activeIssue.assignee_id ? Number(activeIssue.assignee_id) : 0,
                    ...comments.map((c) => Number(c.user_id || 0)),
                  ].filter(Boolean)
                }
                label="この課題の更新を通知するメンバー"
                compact
              />

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
              {/* 詳細・メモ内容（属性は上部固定ヘッダーに集約） */}
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
                    <MentionText
                      text={activeIssue.description}
                      users={users}
                      onIssueClick={handleSwitchByIssueKey}
                    />
                  ) : (
                    <span className="text-gray-400 italic">詳細メモはありません</span>
                  )}
                </div>
              </div>

              {/* 添付ファイルセクション */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
                    <span>添付ファイル ({attachments.length})</span>
                  </h4>
                  {!isProjectArchived && (
                    <label className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors cursor-pointer">
                      <Plus className="w-3 h-3" />
                      <span>ファイルを追加</span>
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        onChange={handleDirectFileUpload}
                      />
                    </label>
                  )}
                </div>

                {attachments.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {attachments.map((att) => {
                      const isImg = att.mime_type.startsWith("image/");
                      const canDelete =
                        currentUser?.is_admin === 1 || att.user_id === currentUser?.id;
                      const fileUrl = att.url || `/api/attachments/${att.id}`;

                      return (
                        <div
                          key={att.id}
                          className="group relative flex items-center gap-2.5 p-2 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 shadow-2xs hover:shadow-xs transition-all"
                        >
                          {isImg ? (
                            <a
                              href={fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-12 h-12 rounded bg-slate-100 border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center hover:opacity-90 transition-opacity"
                              title={`${att.file_name} を表示`}
                            >
                              <img
                                src={fileUrl}
                                alt={att.file_name}
                                className="w-full h-full object-cover"
                              />
                            </a>
                          ) : (
                            <div className="w-12 h-12 rounded bg-indigo-50 border border-indigo-100 text-indigo-600 shrink-0 flex items-center justify-center font-bold text-xs">
                              <FileText className="w-6 h-6" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <a
                              href={fileUrl}
                              download={att.file_name}
                              className="block text-xs font-semibold text-slate-800 hover:text-indigo-600 truncate transition-colors"
                              title={`${att.file_name} をダウンロード`}
                            >
                              {att.file_name}
                            </a>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                              <span>{formatFileSize(att.file_size)}</span>
                              {att.user_name && <span>· {att.user_name}</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            <a
                              href={fileUrl}
                              download={att.file_name}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                              title="ダウンロード"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                            {!isProjectArchived && canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDeleteAttachment(att.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                title="添付ファイルを削除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic bg-slate-50/70 border border-dashed border-slate-200 rounded-lg p-3 text-center">
                    添付ファイルはありません（詳細やコメント欄で画像ペーストやドラッグ＆ドロップでも追加できます）
                  </div>
                )}
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
                    {!isProjectArchived && !isAddingChild && (
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
                        {candidateUsers.map((u) => (
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
                        {!isProjectArchived && canEdit && !isEditingThis && (
                          <button
                            type="button"
                            onClick={() => handleStartEditComment(comment)}
                            className="text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 p-1 rounded transition-colors cursor-pointer"
                            title="コメントを編集"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!isProjectArchived && isAdmin && !isEditingThis && (
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
                          rows={4}
                          value={editCommentContent}
                          onChange={(val) => setEditCommentContent(val)}
                          users={users}
                          issueId={activeIssue.id}
                          onAttachmentUploaded={(att) => setAttachments((prev) => [...prev, att])}
                          className="w-full bg-white border border-indigo-400 rounded-lg p-2.5 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                          placeholder="コメントを修正... (@でメンバーをメンション、画像ペースト・添付対応)"
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
                      <>
                        <MentionText
                          text={comment.content}
                          users={users}
                          onIssueClick={handleSwitchByIssueKey}
                          className="pl-6 text-sm text-slate-800"
                        />
                        <CommentReactionBar
                          issueId={activeIssue.id}
                          commentId={comment.id}
                          reactions={comment.reactions || []}
                          currentUserId={currentUser?.id || null}
                          currentUserName={currentUser?.name || null}
                          currentUserColor={currentUser?.color || null}
                          disabled={isProjectArchived}
                          onReactionsUpdated={(cid, nextReactions) => {
                            setComments((prev) =>
                              prev.map((c) => (c.id === cid ? { ...c, reactions: nextReactions } : c))
                            );
                          }}
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* コメント入力フォーム（アーカイブ時は読み取り専用案内を表示） */}
            {!isProjectArchived ? (
              <form onSubmit={handlePostComment} className="space-y-2.5 pt-2">
                <MentionTextarea
                  rows={5}
                  placeholder={
                    currentUser
                      ? `${currentUser.name} としてコメント・進捗を入力... (@でメンバーをメンション、画像ペースト・添付対応)`
                      : "進捗や気づき、メモを残せます... (@でメンバーをメンション、画像ペースト・添付対応)"
                  }
                  value={newComment}
                  onChange={(val) => setNewComment(val)}
                  users={users}
                  issueId={activeIssue.id}
                  onAttachmentUploaded={(att) => setAttachments((prev) => [...prev, att])}
                  className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />

                {/* コメント投稿時の通知先（参加者）チェックボックス選択 */}
                <NotifyUserSelector
                  users={users}
                  currentUserId={currentUser?.id || null}
                  selectedUserIds={commentNotifyUserIds}
                  onChange={setCommentNotifyUserIds}
                  autoNotifyUserIds={
                    [
                      activeIssue.created_by ? Number(activeIssue.created_by) : 0,
                      activeIssue.assignee_id ? Number(activeIssue.assignee_id) : 0,
                    ].filter(Boolean)
                  }
                  participantUserIds={
                    [
                      activeIssue.created_by ? Number(activeIssue.created_by) : 0,
                      activeIssue.assignee_id ? Number(activeIssue.assignee_id) : 0,
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
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isPostingComment ? "送信中..." : "コメントを投稿"}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 text-center text-xs text-slate-500 font-medium">
                このプロジェクトはアーカイブされているため、コメントの投稿は行えません（読み取り専用）。
              </div>
            )}

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

      {/* レビュー・確認依頼モーダル（処理済みへのステータス変更ガード） */}
      {activeIssue && (
        <ReviewRequestModal
          isOpen={isReviewModalOpen}
          issueKey={activeIssue.issue_key}
          issueTitle={activeIssue.title}
          reporterId={activeIssue.created_by}
          currentAssigneeId={activeIssue.assignee_id}
          users={candidateUsers}
          currentUserId={currentUser?.id}
          onClose={() => setIsReviewModalOpen(false)}
          onSubmit={handleReviewRequestSubmit}
        />
      )}
    </div>
  );
}
