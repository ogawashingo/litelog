// 課題詳細（モーダル・パーマリンクページ）共通の状態管理・API操作コントローラーフック
"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Attachment,
  Comment,
  Issue,
  IssuePriority,
  IssueResolution,
  IssueStatus,
  IssueType,
  RESOLUTION_LABELS,
  User,
  canDeleteIssue,
  canManageIssues,
} from "@/types";
import { createApiError } from "@/lib/clientError";
import { validateAttachmentBatchMeta } from "@/lib/attachmentPolicy";
import { notifyNotificationsUpdated, showToast } from "@/lib/clientEvents";
import {
  ParentDueDateWarningInfo,
  isExceedingParentDueDate,
} from "@/components/ParentDueDateConfirmModal";
import { useIssueEditDraft } from "@/hooks/useIssueEditDraft";
import { getSelectedEditParentInfo } from "./issueDetailUtils";
import { useIssueDetailActions } from "./useIssueDetailActions";

export type IssueHistoryTab = "description" | "title" | "dates" | "all";

interface UseIssueDetailControllerOptions {
  /** 現在表示中の課題（未ロード時は null） */
  activeIssue: Issue | null;
  /** 課題状態の更新セッター */
  setActiveIssue: React.Dispatch<React.SetStateAction<Issue | null>>;
  /** 全ユーザー一覧 */
  users: User[];
  /** ログイン中ユーザー */
  currentUser: User | null;
  /** ユーザー一覧再取得コールバック */
  refreshUsers: () => Promise<void>;
  /** 親一覧等の更新通知コールバック（任意） */
  onUpdated?: () => void;
  /** 課題詳細の再取得コールバック（省略時は内部デフォルト再取得を使用） */
  onReloadIssueData?: () => Promise<void>;
  /** 課題削除成功時のコールバック */
  onDeleteSuccess: () => void;
  /** URLコピー時のコピー文字列生成関数 */
  getCopyUrl: (issue: Issue) => string;
}

export function useIssueDetailController({
  activeIssue,
  setActiveIssue,
  users,
  currentUser,
  refreshUsers,
  onUpdated,
  onReloadIssueData,
  onDeleteSuccess,
  getCopyUrl,
}: UseIssueDetailControllerOptions) {
  // 関連データState
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [childrenIssues, setChildrenIssues] = useState<Issue[]>([]);
  const [availableParents, setAvailableParents] = useState<Issue[]>([]);
  const [projectMembers, setProjectMembers] = useState<User[]>([]);

  // モーダル・履歴・操作中State
  const [historyModalCommentId, setHistoryModalCommentId] = useState<number | null>(null);
  const [isIssueHistoryOpen, setIsIssueHistoryOpen] = useState(false);
  const [issueHistoryTab, setIssueHistoryTab] = useState<IssueHistoryTab>("description");
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [parentDueWarning, setParentDueWarning] = useState<ParentDueDateWarningInfo | null>(null);
  const [isTogglingPin, setIsTogglingPin] = useState(false);

  // 編集モード・フォームState
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

  // 課題オブジェクトから編集フォームの各項目を初期化・同期
  const syncEditFieldsFromIssue = useCallback((target: Issue) => {
    setEditTitle(target.title);
    setEditDescription(target.description || "");
    setEditStatus(target.status);
    setEditPriority(target.priority);
    setEditResolution(target.resolution || null);
    setEditType(target.issue_type);
    setEditAssigneeId(target.assignee_id ? String(target.assignee_id) : "");
    setEditParentId(target.parent_id ? String(target.parent_id) : "");
    setEditStartDate(target.start_date || "");
    setEditDueDate(target.due_date || "");
  }, []);

  // 同プロジェクト内の親課題候補およびプロジェクト参加メンバー一覧を取得
  const loadProjectContext = useCallback((projectId: number, excludeIssueId: number) => {
    fetch(`/api/issues?projectId=${projectId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setAvailableParents(data.filter((item: Issue) => item.id !== excludeIssueId));
        }
      })
      .catch((err) => console.error("親課題候補取得失敗:", err));

    fetch(`/api/projects/${projectId}/members`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.members)) {
          setProjectMembers(data.members);
        } else {
          setProjectMembers([]);
        }
      })
      .catch((err) => console.error("プロジェクトメンバー取得エラー:", err));
  }, []);

  // APIレスポンス（issue / comments / attachments / children）を状態へ反映
  const applyIssueDetailPayload = useCallback(
    (
      data: {
        issue?: Issue;
        comments?: Comment[];
        attachments?: Attachment[];
        children?: Issue[];
      },
      options?: { syncAllEditFields?: boolean; loadContext?: boolean }
    ) => {
      if (data.issue) {
        setActiveIssue(data.issue);
        if (options?.syncAllEditFields) {
          syncEditFieldsFromIssue(data.issue);
        } else {
          setEditPriority(data.issue.priority);
          setEditStatus(data.issue.status);
          setEditResolution(data.issue.resolution || null);
          setEditAssigneeId(data.issue.assignee_id ? String(data.issue.assignee_id) : "");
        }
        if (options?.loadContext && data.issue.project_id) {
          loadProjectContext(data.issue.project_id, data.issue.id);
        }
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
    },
    [setActiveIssue, syncEditFieldsFromIssue, loadProjectContext]
  );

  // デフォルトの課題詳細再取得（外部から onReloadIssueData が指定されない場合に使用）
  const activeIssueId = activeIssue?.id ?? null;
  const defaultReloadIssueData = useCallback(async () => {
    if (!activeIssueId) return;
    try {
      const res = await fetch(`/api/issues/${activeIssueId}`);
      if (res.ok) {
        const data = await res.json();
        applyIssueDetailPayload(data);
      }
    } catch (err) {
      console.error("詳細再取得失敗:", err);
    }
  }, [activeIssueId, applyIssueDetailPayload]);

  const reloadIssueData = onReloadIssueData ?? defaultReloadIssueData;

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

  // 未完了の子課題件数および存在判定（親課題の完了制御用）
  const unclosedChildrenCount = useMemo(
    () => childrenIssues.filter((c) => c.status !== "closed").length,
    [childrenIssues]
  );
  const hasUnclosedChildren = unclosedChildrenCount > 0;

  // 権限判定
  const canClose = Boolean(
    canManageIssues(currentUser) ||
      (activeIssue?.created_by && currentUser?.id === activeIssue.created_by)
  );
  const canDelete = canDeleteIssue(currentUser, activeIssue);

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

  // 課題編集（件名・詳細）の下書き自動保存・復元フック
  const {
    hasDraft: hasEditDraft,
    isDraftRestored: isEditDraftRestored,
    handleDiscardDraft: handleDiscardEditDraft,
    clearDraft: clearEditDraft,
  } = useIssueEditDraft({
    issueId: activeIssue?.id,
    isEditing,
    currentTitle: activeIssue?.title || "",
    currentDescription: activeIssue?.description || "",
    editTitle,
    setEditTitle,
    editDescription,
    setEditDescription,
  });

  // コメント・子課題追加・課題削除・URLコピー共通アクション
  const actions = useIssueDetailActions({
    activeIssue,
    currentUser,
    canDelete,
    setComments,
    onIssueSyncedFromComment: (updatedIssue) => {
      setActiveIssue(updatedIssue);
      setEditStatus(updatedIssue.status);
      setEditResolution(updatedIssue.resolution || null);
    },
    onReloadIssueData: reloadIssueData,
    refreshUsers,
    onUpdated,
    onDeleteSuccess,
    getCopyUrl,
  });

  // 課題の更新を実際にAPI送信する
  const executeSaveEdit = async (extendParentDueDate: boolean) => {
    if (!activeIssue) return;
    const targetIssueId = activeIssue.id;
    try {
      setIsSaving(true);
      // 楽観的UI更新
      setActiveIssue((prev) =>
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

      const res = await fetch(`/api/issues/${targetIssueId}`, {
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
        await reloadIssueData();
        await refreshUsers();
        onUpdated?.();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "課題の更新に失敗しました");
        // 最新データを再取得してロールバック
        await reloadIssueData();
      }
    } catch (err) {
      console.error("更新エラー:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // 課題の更新を保存（権限・未完了子課題・親課題期限超過チェック付き）
  const handleSaveEdit = async () => {
    if (!activeIssue || !editTitle.trim()) return;

    if (editStatus === "closed") {
      if (!canClose) {
        alert("課題を完了にできるのは、課題の作成者または管理者のみです。");
        return;
      }
      if (hasUnclosedChildren) {
        alert(
          `未完了の子課題が ${unclosedChildrenCount} 件存在するため、親課題を完了にすることはできません。`
        );
        return;
      }
    }

    // 期限日または親課題が変更され、かつ親課題の期限日を超過している場合に確認モーダルを表示
    const dueChanged = (editDueDate || null) !== (activeIssue.due_date || null);
    const parentChanged =
      (editParentId ? Number(editParentId) : null) !== (activeIssue.parent_id || null);
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
        childIssueKey: activeIssue.issue_key,
      });
      return;
    }

    await executeSaveEdit(false);
  };

  // 完了確定処理（完了理由選択モーダルからの確定・取り消しトースト付き）
  const executeCloseWithResolution = async (resolution: IssueResolution | null) => {
    if (!activeIssue) return;
    const targetIssueId = activeIssue.id;
    const targetIssueKey = activeIssue.issue_key;
    const previousStatus = activeIssue.status;
    const previousResolution = activeIssue.resolution ?? null;

    try {
      setActiveIssue((prev) =>
        prev
          ? {
              ...prev,
              status: "closed",
              resolution: resolution || null,
              is_pinned: 0,
              pinned_at: null,
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
        onUpdated?.();

        // 完了トースト通知を表示（元に戻すアクション付き）
        const resolutionLabel = resolution
          ? RESOLUTION_LABELS[resolution] || resolution
          : "理由なし";
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
                  setActiveIssue((prev) =>
                    prev && prev.id === targetIssueId
                      ? { ...prev, status: previousStatus, resolution: previousResolution }
                      : prev
                  );
                  setEditStatus(previousStatus);
                  setEditResolution(previousResolution);
                  notifyNotificationsUpdated();
                  await refreshUsers();
                  onUpdated?.();
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
        setActiveIssue((prev) =>
          prev
            ? { ...prev, status: previousStatus, resolution: previousResolution }
            : null
        );
        setEditStatus(previousStatus);
        setEditResolution(previousResolution);
        onUpdated?.();
      }
    } catch (err) {
      console.error("完了処理エラー:", err);
      showToast({
        message: "完了処理中にエラーが発生しました",
        type: "error",
      });
      setActiveIssue((prev) =>
        prev
          ? { ...prev, status: previousStatus, resolution: previousResolution }
          : null
      );
      setEditStatus(previousStatus);
      setEditResolution(previousResolution);
      onUpdated?.();
    }
  };

  // ステータス即時変更
  const handleQuickStatusChange = async (newStatus: IssueStatus) => {
    if (!activeIssue) return;
    if (newStatus === "closed") {
      if (!canClose) {
        alert(
          "課題を完了にできるのは、課題の作成者または管理者のみです。\n作業完了時は「処理済み」を選択してレビューを依頼してください。"
        );
        return;
      }
      if (hasUnclosedChildren) {
        alert(
          `未完了の子課題が ${unclosedChildrenCount} 件存在するため、親課題を完了にすることはできません。`
        );
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
      setActiveIssue((prev) =>
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

      const res = await fetch(`/api/issues/${activeIssue.id}`, {
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
        onUpdated?.();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "状態の変更に失敗しました");
        setActiveIssue((prev) =>
          prev
            ? { ...prev, status: previousStatus, resolution: previousResolution }
            : null
        );
        setEditStatus(previousStatus);
        setEditResolution(previousResolution);
      }
    } catch (err) {
      console.error("ステータス変更エラー:", err);
      setActiveIssue((prev) =>
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
    if (!activeIssue) return;
    const res = await fetch(`/api/issues/${activeIssue.id}/comments`, {
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

    await reloadIssueData();
    await refreshUsers();
    onUpdated?.();
    notifyNotificationsUpdated();
  };

  // 完了理由即時変更
  const handleQuickResolutionChange = async (newResolution: IssueResolution | null) => {
    if (!activeIssue) return;
    const previousResolution = activeIssue.resolution || null;
    try {
      setActiveIssue((prev) => (prev ? { ...prev, resolution: newResolution } : null));
      setEditResolution(newResolution);
      const res = await fetch(`/api/issues/${activeIssue.id}`, {
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
        onUpdated?.();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "完了理由の変更に失敗しました");
        setActiveIssue((prev) => (prev ? { ...prev, resolution: previousResolution } : null));
        setEditResolution(previousResolution);
      }
    } catch (err) {
      console.error("完了理由変更エラー:", err);
      setActiveIssue((prev) => (prev ? { ...prev, resolution: previousResolution } : null));
      setEditResolution(previousResolution);
    }
  };

  // 添付ファイル直接追加
  const handleDirectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!activeIssue || !files || files.length === 0) return;

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
        onUpdated?.();
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
        onUpdated?.();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "添付ファイルの削除に失敗しました");
      }
    } catch (err) {
      console.error("添付ファイル削除エラー:", err);
      alert("通信エラーにより削除できませんでした");
    }
  };

  // 種別即時変更
  const handleQuickTypeChange = async (newType: IssueType) => {
    if (!activeIssue) return;
    const previousType = activeIssue.issue_type;
    if (newType === previousType) return;
    try {
      setActiveIssue((prev) => (prev ? { ...prev, issue_type: newType } : null));
      setEditType(newType);
      const res = await fetch(`/api/issues/${activeIssue.id}`, {
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
        onUpdated?.();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "種別の変更に失敗しました");
        setActiveIssue((prev) => (prev ? { ...prev, issue_type: previousType } : null));
        setEditType(previousType);
      }
    } catch (err) {
      console.error("種別変更エラー:", err);
      setActiveIssue((prev) => (prev ? { ...prev, issue_type: previousType } : null));
      setEditType(previousType);
    }
  };

  // 優先度即時変更
  const handleQuickPriorityChange = async (newPriority: IssuePriority) => {
    if (!activeIssue) return;
    try {
      setActiveIssue((prev) => (prev ? { ...prev, priority: newPriority } : null));
      setEditPriority(newPriority);
      const res = await fetch(`/api/issues/${activeIssue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priority: newPriority,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        await refreshUsers();
        onUpdated?.();
      }
    } catch (err) {
      console.error("優先度変更エラー:", err);
    }
  };

  // 担当者即時変更
  const handleQuickAssigneeChange = async (newAssigneeIdStr: string) => {
    if (!activeIssue) return;
    try {
      const targetAssigneeId = newAssigneeIdStr ? Number(newAssigneeIdStr) : null;
      setActiveIssue((prev) => (prev ? { ...prev, assignee_id: targetAssigneeId } : null));
      setEditAssigneeId(newAssigneeIdStr);
      const res = await fetch(`/api/issues/${activeIssue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeId: targetAssigneeId,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        await reloadIssueData();
        notifyNotificationsUpdated();
        await refreshUsers();
        onUpdated?.();
      }
    } catch (err) {
      console.error("担当者変更エラー:", err);
    }
  };

  // 個人ピン留めトグル処理
  const handleTogglePin = async () => {
    if (!currentUser || !activeIssue || activeIssue.status === "closed" || isTogglingPin) return;
    const nextPinned = !Boolean(activeIssue.is_pinned);
    const prevPinned = activeIssue.is_pinned;
    const prevPinnedAt = activeIssue.pinned_at;
    try {
      setIsTogglingPin(true);
      setActiveIssue((prev) =>
        prev
          ? {
              ...prev,
              is_pinned: nextPinned ? 1 : 0,
              pinned_at: nextPinned ? new Date().toISOString() : null,
            }
          : null
      );
      const res = await fetch(`/api/issues/${activeIssue.id}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: nextPinned }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveIssue((prev) =>
          prev ? { ...prev, is_pinned: data.is_pinned, pinned_at: data.pinned_at } : null
        );
        onUpdated?.();
      } else {
        const errData = await res.json().catch(() => ({}));
        setActiveIssue((prev) =>
          prev ? { ...prev, is_pinned: prevPinned, pinned_at: prevPinnedAt } : null
        );
        showToast({
          message: errData.error || "ピン留めの更新に失敗しました",
          type: "error",
        });
      }
    } catch (err) {
      console.error("ピン留め更新エラー:", err);
      setActiveIssue((prev) =>
        prev ? { ...prev, is_pinned: prevPinned, pinned_at: prevPinnedAt } : null
      );
    } finally {
      setIsTogglingPin(false);
    }
  };

  // 表示用の担当者・起票者名
  const currentAssignee = users.find((u) => u.id === Number(editAssigneeId));
  const creatorName =
    activeIssue?.creator_name ||
    (activeIssue?.created_by
      ? users.find((u) => u.id === Number(activeIssue.created_by))?.name
      : null) ||
    null;

  return {
    // 関連データ
    comments,
    setComments,
    attachments,
    setAttachments,
    childrenIssues,
    setChildrenIssues,
    availableParents,
    setAvailableParents,
    candidateUsers,
    // 履歴・モーダルState
    historyModalCommentId,
    setHistoryModalCommentId,
    isIssueHistoryOpen,
    setIsIssueHistoryOpen,
    issueHistoryTab,
    setIssueHistoryTab,
    isReviewModalOpen,
    setIsReviewModalOpen,
    isCompleteModalOpen,
    setIsCompleteModalOpen,
    parentDueWarning,
    setParentDueWarning,
    isTogglingPin,
    // 編集フォームState
    isEditing,
    setIsEditing,
    editTitle,
    setEditTitle,
    editDescription,
    setEditDescription,
    editStatus,
    setEditStatus,
    editPriority,
    setEditPriority,
    editResolution,
    setEditResolution,
    editType,
    setEditType,
    editAssigneeId,
    setEditAssigneeId,
    editParentId,
    setEditParentId,
    editStartDate,
    setEditStartDate,
    editDueDate,
    setEditDueDate,
    editNotifyUserIds,
    setEditNotifyUserIds,
    isSaving,
    hasEditDraft,
    isEditDraftRestored,
    handleDiscardEditDraft,
    // 派生値・権限
    unclosedChildrenCount,
    hasUnclosedChildren,
    canClose,
    canDelete,
    selectedEditParentInfo,
    isEditExceedingParentDue,
    currentAssignee,
    creatorName,
    // 同期・読み込みヘルパー
    syncEditFieldsFromIssue,
    loadProjectContext,
    applyIssueDetailPayload,
    reloadIssueData,
    // アクションハンドラ
    executeSaveEdit,
    handleSaveEdit,
    executeCloseWithResolution,
    handleQuickStatusChange,
    handleReviewRequestSubmit,
    handleQuickResolutionChange,
    handleDirectFileUpload,
    handleDeleteAttachment,
    handleQuickTypeChange,
    handleQuickPriorityChange,
    handleQuickAssigneeChange,
    handleTogglePin,
    // コメント・子課題・URLコピー・削除アクション
    ...actions,
  };
}
