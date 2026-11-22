// 課題詳細（モーダル・個別ページ）共通の補助モーダル群（コメント履歴・課題変更履歴・レビュー依頼・親課題期限延長確認）
"use client";

import React from "react";
import { Issue, SystemSettings, User } from "@/types";
import CommentHistoryModal from "@/components/CommentHistoryModal";
import IssueHistoryModal from "@/components/IssueHistoryModal";
import ReviewRequestModal from "@/components/ReviewRequestModal";
import ParentDueDateConfirmModal, {
  ParentDueDateWarningInfo,
} from "@/components/ParentDueDateConfirmModal";

export type IssueHistoryTab = "description" | "title" | "dates" | "all";

interface IssueDetailModalsBundleProps {
  issueId: number | null;
  activeIssue: Issue | null;
  historyModalCommentId: number | null;
  onCloseCommentHistory: () => void;
  isIssueHistoryOpen: boolean;
  onCloseIssueHistory: () => void;
  issueHistoryTab: IssueHistoryTab;
  isReviewModalOpen: boolean;
  onCloseReviewModal: () => void;
  onSubmitReviewRequest: (data: {
    reviewerId: number;
    changeAssignee: boolean;
    comment: string;
  }) => Promise<void>;
  reviewCandidateUsers: User[];
  users: User[];
  currentUserId?: number | null;
  settings: SystemSettings;
  parentDueWarning: ParentDueDateWarningInfo | null;
  isSaving: boolean;
  onConfirmParentDue: (extendParentDueDate: boolean) => Promise<void>;
  onCancelParentDue: () => void;
}

export default function IssueDetailModalsBundle({
  issueId,
  activeIssue,
  historyModalCommentId,
  onCloseCommentHistory,
  isIssueHistoryOpen,
  onCloseIssueHistory,
  issueHistoryTab,
  isReviewModalOpen,
  onCloseReviewModal,
  onSubmitReviewRequest,
  reviewCandidateUsers,
  users,
  currentUserId,
  settings,
  parentDueWarning,
  isSaving,
  onConfirmParentDue,
  onCancelParentDue,
}: IssueDetailModalsBundleProps) {
  return (
    <>
      {/* コメント編集履歴モーダル */}
      {issueId !== null && (
        <CommentHistoryModal
          isOpen={historyModalCommentId !== null}
          onClose={onCloseCommentHistory}
          issueId={issueId}
          commentId={historyModalCommentId}
          settings={settings}
          users={users}
        />
      )}

      {/* 課題変更履歴モーダル */}
      {issueId !== null && (
        <IssueHistoryModal
          isOpen={isIssueHistoryOpen}
          onClose={onCloseIssueHistory}
          issueId={issueId}
          initialTab={issueHistoryTab}
          settings={settings}
          users={users}
        />
      )}

      {/* レビュー・確認依頼モーダル（処理済みへのステータス変更ガード） */}
      {activeIssue && (
        <ReviewRequestModal
          isOpen={isReviewModalOpen}
          issueKey={activeIssue.issue_key}
          issueTitle={activeIssue.title}
          reporterId={activeIssue.created_by}
          currentAssigneeId={activeIssue.assignee_id}
          users={reviewCandidateUsers}
          currentUserId={currentUserId ?? undefined}
          onClose={onCloseReviewModal}
          onSubmit={onSubmitReviewRequest}
        />
      )}

      {/* 子課題の期限延長に伴う親課題期限延長の確認モーダル */}
      <ParentDueDateConfirmModal
        info={parentDueWarning}
        isSubmitting={isSaving}
        onExtendBoth={async () => {
          await onConfirmParentDue(true);
        }}
        onChildOnly={async () => {
          await onConfirmParentDue(false);
        }}
        onCancel={onCancelParentDue}
      />
    </>
  );
}
