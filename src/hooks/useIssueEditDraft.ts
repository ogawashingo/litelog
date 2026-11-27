// 課題編集（件名・詳細）の下書き自動保存・復元・管理カスタムフック
"use client";

import { useState, useEffect, useRef } from "react";
import {
  getIssueEditDraftKey,
  getJSONDraft,
  setJSONDraft,
  removeDraft,
  IssueEditDraft,
} from "@/lib/draftStorage";

interface UseIssueEditDraftOptions {
  issueId: number | null | undefined;
  isEditing: boolean;
  currentTitle: string;
  currentDescription: string;
  editTitle: string;
  setEditTitle: (val: string) => void;
  editDescription: string;
  setEditDescription: (val: string) => void;
}

export function useIssueEditDraft({
  issueId,
  isEditing,
  currentTitle,
  currentDescription,
  editTitle,
  setEditTitle,
  editDescription,
  setEditDescription,
}: UseIssueEditDraftOptions) {
  const [hasDraft, setHasDraft] = useState(false);
  const [isDraftRestored, setIsDraftRestored] = useState(false);

  // 編集開始時に下書きが存在し、現在の保存済みデータと異なる場合は自動復元
  const prevIsEditingRef = useRef(false);
  useEffect(() => {
    if (!issueId) return;
    if (isEditing && !prevIsEditingRef.current) {
      const draft = getJSONDraft<IssueEditDraft>(getIssueEditDraftKey(issueId));
      if (
        draft &&
        (draft.title !== currentTitle || draft.description !== currentDescription) &&
        (draft.title || draft.description)
      ) {
        if (draft.title !== undefined) setEditTitle(draft.title);
        if (draft.description !== undefined) setEditDescription(draft.description);
        setHasDraft(true);
        setIsDraftRestored(true);
      } else {
        setHasDraft(false);
        setIsDraftRestored(false);
      }
    }
    prevIsEditingRef.current = isEditing;
  }, [isEditing, issueId, currentTitle, currentDescription, setEditTitle, setEditDescription]);

  // 編集中に入力内容が変更されたらLocalStorageへ自動保存
  useEffect(() => {
    if (!isEditing || !issueId) return;

    const isModified = editTitle !== currentTitle || editDescription !== currentDescription;
    const key = getIssueEditDraftKey(issueId);

    if (isModified && (editTitle.trim() || editDescription.trim())) {
      setJSONDraft<IssueEditDraft>(key, {
        title: editTitle,
        description: editDescription,
        updatedAt: Date.now(),
      });
      setHasDraft(true);
    } else {
      removeDraft(key);
      setHasDraft(false);
      setIsDraftRestored(false);
    }
  }, [isEditing, issueId, editTitle, editDescription, currentTitle, currentDescription]);

  // 入力中の誤閉じ・リロード防止（beforeunloadガード）
  useEffect(() => {
    if (!isEditing || !issueId) return;
    const isModified = editTitle !== currentTitle || editDescription !== currentDescription;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isModified) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isEditing, issueId, editTitle, editDescription, currentTitle, currentDescription]);

  // 下書き破棄処理（元データに戻してLocalStorage削除）
  const handleDiscardDraft = () => {
    if (!issueId) return;
    removeDraft(getIssueEditDraftKey(issueId));
    setEditTitle(currentTitle);
    setEditDescription(currentDescription);
    setHasDraft(false);
    setIsDraftRestored(false);
  };

  // 保存完了時の下書き削除
  const clearDraft = () => {
    if (!issueId) return;
    removeDraft(getIssueEditDraftKey(issueId));
    setHasDraft(false);
    setIsDraftRestored(false);
  };

  return {
    hasDraft,
    isDraftRestored,
    handleDiscardDraft,
    clearDraft,
  };
}
