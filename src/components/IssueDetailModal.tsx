// 課題詳細・編集・コメント追加モーダルコンポーネント
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { X, Edit2, Check, Trash2, Link as LinkIcon, ArrowLeft, Archive } from "lucide-react";
import { Issue, Comment, IssueStatus, IssueType, IssuePriority, IssueResolution, RESOLUTION_LABELS, Attachment, isArchivedProject, canManageIssues, canDeleteIssue, User } from "@/types";
import { TypeBadge, ResolutionBadge } from "./IssueBadge";
import { useUser } from "./UserContext";
import { createApiError } from "@/lib/clientError";
import { validateAttachmentBatchMeta } from "@/lib/attachmentPolicy";
import MentionText from "./MentionText";
import {
  ParentDueDateWarningInfo,
  isExceedingParentDueDate,
} from "./ParentDueDateConfirmModal";
import { notifyNotificationsUpdated, showToast } from "@/lib/clientEvents";
import { getSelectedEditParentInfo } from "./issue-detail/issueDetailUtils";
import { useIssueDetailActions } from "./issue-detail/useIssueDetailActions";
import IssueSummaryToolbar from "./issue-detail/IssueSummaryToolbar";
import IssueEditFormSection from "./issue-detail/IssueEditFormSection";
import IssueAttachmentsSection from "./issue-detail/IssueAttachmentsSection";
import IssueChildSection from "./issue-detail/IssueChildSection";
import IssueCommentsSection from "./issue-detail/IssueCommentsSection";
import IssueDetailModalsBundle from "./issue-detail/IssueDetailModalsBundle";
import CompleteIssueModal from "./CompleteIssueModal";

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
  const [historyModalCommentId, setHistoryModalCommentId] = useState<number | null>(null);
  const [isIssueHistoryOpen, setIsIssueHistoryOpen] = useState(false);
  const [issueHistoryTab, setIssueHistoryTab] = useState<"description" | "title" | "dates" | "all">("description");
  const [isEditing, setIsEditing] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  // 子課題の期限延長に伴う親課題期限延長の確認モーダル情報
  const [parentDueWarning, setParentDueWarning] = useState<ParentDueDateWarningInfo | null>(null);

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

  const activeIssueOrNull = currentIssue || issue;
  // 課題を削除できる権限判定（作成者または管理者のみ）
  const canDelete = canDeleteIssue(currentUser, activeIssueOrNull);

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
    activeIssue: activeIssueOrNull,
    currentUser,
    canDelete,
    setComments,
    onIssueSyncedFromComment: (updatedIssue) => {
      setCurrentIssue(updatedIssue);
      setEditStatus(updatedIssue.status);
      setEditResolution(updatedIssue.resolution || null);
    },
    onReloadIssueData: reloadIssueData,
    refreshUsers,
    onUpdated,
    onDeleteSuccess: () => {
      onDeleted();
      onClose();
    },
    getCopyUrl: (targetIssue) => `${window.location.origin}/issues/${targetIssue.issue_key}`,
  });

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

  // 編集フォームで選択中の親課題情報（期限日超過チェック用）
  const selectedEditParentInfo = getSelectedEditParentInfo(
    editParentId,
    availableParents,
    activeIssue
  );

  const isEditExceedingParentDue = isExceedingParentDueDate(
    selectedEditParentInfo?.dueDate,
    editDueDate || null
  );

  // 課題の更新を実際にAPI送信する
  const executeSaveEdit = async (extendParentDueDate: boolean) => {
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
          extendParentDueDate,
          actorId: currentUser?.id || null,
          notifyUserIds: editNotifyUserIds,
        }),
      });

      if (res.ok) {
        setIsEditing(false);
        setEditNotifyUserIds([]);
        notifyNotificationsUpdated();
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

  // 課題の更新を保存（親課題の期限を超過している場合は確認モーダルを表示）
  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;

    if (editStatus === "closed") {
      if (!canClose) {
        alert("課題を完了にできるのは、課題の作成者または管理者のみです。");
        return;
      }
      if (hasUnclosedChildren) {
        alert(`未完了の子課題が ${unclosedChildrenCount} 件存在するため、親課題を完了にすることはできません。`);
        return;
      }
    }

    // 期限日または親課題が変更され、かつ親課題の期限日を超過している場合に確認モーダルを表示
    const dueChanged = (editDueDate || null) !== (activeIssue?.due_date || null);
    const parentChanged = (editParentId ? Number(editParentId) : null) !== (activeIssue?.parent_id || null);
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
        childIssueKey: activeIssue?.issue_key,
      });
      return;
    }

    await executeSaveEdit(false);
  };

  // 完了確定処理（完了理由選択モーダルからの確定）
  const executeCloseWithResolution = async (resolution: IssueResolution | null) => {
    if (!issue) return;
    const targetIssueId = issue.id;
    const targetIssueKey = activeIssue.issue_key;
    const previousStatus = activeIssue.status;
    const previousResolution = activeIssue.resolution ?? null;

    try {
      setCurrentIssue((prev) =>
        prev
          ? {
              ...prev,
              status: "closed",
              resolution: resolution || null,
            }
          : null
      );
      setEditStatus("closed");
      setEditResolution(resolution || null);

      const res = await fetch(`/api/issues/${targetIssueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "closed",
          resolution: resolution || null,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        notifyNotificationsUpdated();
        await refreshUsers();
        onUpdated();

        // 完了トースト通知を表示（元に戻すアクション付き）
        const resolutionLabel = resolution ? RESOLUTION_LABELS[resolution] || resolution : "理由なし";
        showToast({
          message: `${targetIssueKey} を完了にしました（${resolutionLabel}）`,
          type: "success",
          action: {
            label: "元に戻す",
            onClick: async () => {
              try {
                const revertRes = await fetch(`/api/issues/${targetIssueId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    status: previousStatus,
                    resolution: previousResolution,
                    actorId: currentUser?.id || null,
                  }),
                });
                if (revertRes.ok) {
                  notifyNotificationsUpdated();
                  await refreshUsers();
                  onUpdated();
                  showToast({
                    message: `${targetIssueKey} の完了を取り消しました`,
                    type: "info",
                  });
                } else {
                  const errData = await revertRes.json().catch(() => ({}));
                  showToast({
                    message: errData.error || "完了の取り消しに失敗しました",
                    type: "error",
                  });
                }
              } catch (revertErr) {
                console.error("完了取り消しエラー:", revertErr);
                showToast({
                  message: "完了の取り消しに失敗しました",
                  type: "error",
                });
              }
            },
          },
        });
      } else {
        const data = await res.json().catch(() => ({}));
        showToast({
          message: data.error || "状態の変更に失敗しました",
          type: "error",
        });
        setCurrentIssue((prev) =>
          prev
            ? { ...prev, status: previousStatus, resolution: previousResolution }
            : null
        );
        setEditStatus(previousStatus);
        setEditResolution(previousResolution);
        onUpdated();
      }
    } catch (err) {
      console.error("完了処理エラー:", err);
      showToast({
        message: "完了処理中にエラーが発生しました",
        type: "error",
      });
      setCurrentIssue((prev) =>
        prev
          ? { ...prev, status: previousStatus, resolution: previousResolution }
          : null
      );
      setEditStatus(previousStatus);
      setEditResolution(previousResolution);
      onUpdated();
    }
  };

  // ステータス即時変更
  const handleQuickStatusChange = async (newStatus: IssueStatus) => {
    if (newStatus === "closed") {
      if (!canClose) {
        alert("課題を完了にできるのは、課題の作成者または管理者のみです。\n作業完了時は「処理済み」を選択してレビューを依頼してください。");
        return;
      }
      if (hasUnclosedChildren) {
        alert(`未完了の子課題が ${unclosedChildrenCount} 件存在するため、親課題を完了にすることはできません。`);
        return;
      }
      // 完了理由選択ダイアログを起動
      setIsCompleteModalOpen(true);
      return;
    }

    const previousStatus = activeIssue.status;
    const previousResolution = activeIssue.resolution ?? null;

    try {
      // 完了以外のステータスへの変更時は、完了理由をnullにクリア
      setCurrentIssue((prev) =>
        prev
          ? {
              ...prev,
              status: newStatus,
              resolution: null,
            }
          : null
      );
      setEditStatus(newStatus);
      setEditResolution(null);

      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          resolution: null,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        notifyNotificationsUpdated();
        await refreshUsers();
        onUpdated();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "状態の変更に失敗しました");
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
      throw await createApiError(res, "レビュー依頼の送信に失敗しました");
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
    notifyNotificationsUpdated();
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
        notifyNotificationsUpdated();
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

  // 添付ファイル直接追加
  const handleDirectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    // 送信前にクライアント側で件数・サイズ・拡張子・MIMEタイプを検証
    const preCheck = validateAttachmentBatchMeta(
      fileList.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
      }))
    );
    if (!preCheck.ok) {
      alert(preCheck.error);
      e.target.value = "";
      return;
    }

    try {
      const formData = new FormData();
      formData.append("issueId", String(activeIssue.id));
      for (const file of fileList) {
        formData.append("file", file);
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
        notifyNotificationsUpdated();
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
        notifyNotificationsUpdated();
        await refreshUsers();
        onUpdated();
      }
    } catch (err) {
      console.error("担当者変更エラー:", err);
    }
  };

  const currentAssignee = users.find((u) => u.id === Number(editAssigneeId));
  // 起票者表示名（結合済みの creator_name、なければ users リストから補完し IssueSummaryToolbar 内で「起票:」として表示）
  const creatorName =
    activeIssue.creator_name ||
    (activeIssue.created_by ? users.find((u) => u.id === Number(activeIssue.created_by))?.name : null) ||
    null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-black/50 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white sm:rounded-xl shadow-2xl border border-gray-200 w-full max-w-full sm:max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 h-full sm:h-auto sm:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー（スマホで絶対にはみ出さず、戻るボタン＆✕ボタンを常時確保） */}
        <div className="bg-gray-100 border-b border-gray-200 px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between shrink-0 gap-2 max-w-full overflow-hidden">
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
            {/* URLコピーボタン（弾性スプリング＆サクセスポップ） */}
            <button
              type="button"
              onClick={handleCopyLink}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2 sm:px-3 py-1 rounded-lg border transition-all cursor-pointer spring-bounce ${
                isCopiedUrl
                  ? "bg-emerald-600 border-emerald-600 text-white shadow-xs font-bold scale-[1.02]"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400"
              }`}
              title="課題の一意URLをコピー"
            >
              {isCopiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white shrink-0 stroke-[3] animate-check-pop" />
                  <span className="text-[11px] sm:text-xs">コピー完了！</span>
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
              この課題が属するプロジェクトは<strong>アーカイブ</strong>されています。読み取り専用のため、課題情報の修正や状態の変更、コメント投稿は行えません。
            </span>
          </div>
        )}

        {/* 常時固定の課題件名 ＆ 全属性ツールバー（コメント等をスクロールしても常に最上部に留まる） */}
        {!isEditing && (
          <IssueSummaryToolbar
            variant="modal"
            activeIssue={activeIssue}
            isProjectArchived={isProjectArchived}
            canClose={canClose}
            hasUnclosedChildren={hasUnclosedChildren}
            unclosedChildrenCount={unclosedChildrenCount}
            currentUser={currentUser}
            users={users}
            candidateUsers={candidateUsers}
            currentAssignee={currentAssignee}
            creatorName={creatorName}
            settings={settings}
            onSwitchParentIssue={(target) => handleSwitchIssue(target)}
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

        {/* コンテンツ本体 */}
        <div ref={contentScrollRef} className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden space-y-6 flex-1 max-w-full">
          {/* 編集モード時のフォーム */}
          {isEditing ? (
            <IssueEditFormSection
              variant="modal"
              issueId={issue.id}
              activeIssue={activeIssue}
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
              candidateUsers={candidateUsers}
              currentUser={currentUser}
              comments={comments}
              isSaving={isSaving}
              onCancelEdit={() => setIsEditing(false)}
              onSaveEdit={handleSaveEdit}
              onAttachmentUploaded={(att) => setAttachments((prev) => [...prev, att])}
            />
          ) : (
            <>
              {/* 詳細・メモ内容（モバイル表示時、詳細未入力なら非表示にしてコンパクト化） */}
              <div className={!activeIssue.description ? "hidden sm:block" : ""}>
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
                        title="クリックして詳細の変更履歴を確認"
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
                    <span className="text-gray-400 italic">詳細はありません</span>
                  )}
                </div>
              </div>

              {/* 添付ファイルセクション */}
              <IssueAttachmentsSection
                attachments={attachments}
                isProjectArchived={isProjectArchived}
                currentUser={currentUser}
                onDirectFileUpload={handleDirectFileUpload}
                onDeleteAttachment={handleDeleteAttachment}
              />

              {/* 子課題セクション */}
              <IssueChildSection
                variant="modal"
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
                assigneeCandidateUsers={candidateUsers}
                onSwitchIssue={handleSwitchIssue}
              />
            </>
          )}

          {/* コメントセクション */}
          <IssueCommentsSection
            variant="modal"
            issueId={activeIssue.id}
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
                prev.map((c) => (c.id === cid ? { ...c, reactions: nextReactions } : c))
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
            onAttachmentUploaded={(att) => setAttachments((prev) => [...prev, att])}
            onIssueClick={handleSwitchByIssueKey}
            onCloseModal={onClose}
          />
        </div>
      </div>

      {/* 各種履歴・レビュー依頼・親課題期限延長確認モーダル */}
      <IssueDetailModalsBundle
        issueId={issue.id}
        activeIssue={activeIssue}
        historyModalCommentId={historyModalCommentId}
        onCloseCommentHistory={() => setHistoryModalCommentId(null)}
        isIssueHistoryOpen={isIssueHistoryOpen}
        onCloseIssueHistory={() => setIsIssueHistoryOpen(false)}
        issueHistoryTab={issueHistoryTab}
        isReviewModalOpen={isReviewModalOpen}
        onCloseReviewModal={() => setIsReviewModalOpen(false)}
        onSubmitReviewRequest={handleReviewRequestSubmit}
        reviewCandidateUsers={candidateUsers}
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

      {/* 課題完了時の完了理由選択モーダル */}
      {isCompleteModalOpen && (
        <CompleteIssueModal
          isOpen={isCompleteModalOpen}
          issueKey={activeIssue.issue_key}
          issueTitle={activeIssue.title}
          onClose={() => setIsCompleteModalOpen(false)}
          onConfirm={async (resolution) => {
            setIsCompleteModalOpen(false);
            onClose(); // 課題完了理由を選択したら、課題詳細ウィンドウも自動で閉じる
            await executeCloseWithResolution(resolution);
          }}
        />
      )}
    </div>
  );
}
