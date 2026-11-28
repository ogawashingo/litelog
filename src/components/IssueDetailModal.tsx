// 課題詳細・編集・コメント追加モーダルコンポーネント
"use client";

import React, { useState, useEffect } from "react";
import { X, Edit2, Check, Trash2, Link as LinkIcon, ArrowLeft, Archive, Pin } from "lucide-react";
import { Issue, isArchivedProject } from "@/types";
import { TypeBadge, ResolutionBadge } from "./IssueBadge";
import { useUser } from "./UserContext";
import MentionText from "./MentionText";
import { useIssueDetailController } from "./issue-detail/useIssueDetailController";
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

  // モーダルコンテンツ領域のスクロールRef（課題切り替え時に先頭へスクロール）
  const contentScrollRef = React.useRef<HTMLDivElement>(null);

  // 最新の onClose コールバックを保持
  const onCloseRef = React.useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // モーダルを開いた元の画面のURLを保持
  const originalUrlRef = React.useRef<string | null>(null);
  const issueKey = issue?.issue_key ?? null;

  // モーダルオープン時および課題切り替え時のURL同期（ブラウザアドレスバーを /issues/MYPRJ-30 に更新）
  useEffect(() => {
    if (!isOpen || !issueKey) {
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
    const targetUrl = `/issues/${issueKey}`;
    if (typeof window !== "undefined" && window.location.pathname !== targetUrl) {
      window.history.pushState(
        { modalIssueKey: issueKey, returnUrl: originalUrlRef.current },
        "",
        targetUrl
      );
    }
  }, [issueKey, isOpen]);

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

  const activeIssueOrNull = currentIssue || issue;

  const ctrl = useIssueDetailController({
    activeIssue: activeIssueOrNull,
    setActiveIssue: setCurrentIssue,
    users,
    currentUser,
    refreshUsers,
    onUpdated,
    onDeleteSuccess: () => {
      onDeleted();
      onClose();
    },
    getCopyUrl: (targetIssue) => `${window.location.origin}/issues/${targetIssue.issue_key}`,
  });

  const {
    syncEditFieldsFromIssue,
    loadProjectContext,
    applyIssueDetailPayload,
    setEditNotifyUserIds,
    setIsEditing,
    setIsAddingChild,
    setChildTitle,
    setChildError,
  } = ctrl;

  // 課題が切り替わったときに詳細・コメント・子課題・親候補・メンバーを取得し、編集状態を同期
  useEffect(() => {
    if (!issue || !isOpen) return;

    setCurrentIssue(issue);
    syncEditFieldsFromIssue(issue);
    setEditNotifyUserIds([]);
    setIsEditing(false);
    setIsAddingChild(false);
    setChildTitle("");
    setChildError("");

    fetch(`/api/issues/${issue.id}`)
      .then((res) => res.json())
      .then((data) => {
        applyIssueDetailPayload(data);
      })
      .catch((err) => console.error("詳細取得失敗:", err));

    loadProjectContext(issue.project_id, issue.id);
  }, [
    issue,
    isOpen,
    syncEditFieldsFromIssue,
    loadProjectContext,
    applyIssueDetailPayload,
    setEditNotifyUserIds,
    setIsEditing,
    setIsAddingChild,
    setChildTitle,
    setChildError,
  ]);

  // 子課題または親課題をクリックして表示課題を切り替える
  const handleSwitchIssue = async (target: Issue | { id: number; issue_key?: string | null }) => {
    setIsEditing(false);
    contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });

    const fetchKey = target.issue_key || target.id;

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
      return;
    }

    // 親のコールバックが渡されていない場合はローカル状態で課題詳細を取得・更新
    try {
      const res = await fetch(`/api/issues/${fetchKey}`);
      if (res.ok) {
        const data = await res.json();
        if (data.issue) {
          const nextIssue: Issue = data.issue;
          applyIssueDetailPayload(data, { syncAllEditFields: true, loadContext: true });

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
  };

  // 課題キー文字列からのモーダル内ダイレクト切り替え
  const handleSwitchByIssueKey = (targetKey: string) => {
    handleSwitchIssue({ id: 0, issue_key: targetKey });
  };

  if (!isOpen || !issue) return null;

  // 表示に使うアクティブな課題オブジェクト（ローカルで最新化されたものを優先）
  const activeIssue = currentIssue || issue;
  // 所属プロジェクトのアーカイブ状態判定
  const isProjectArchived = isArchivedProject(activeIssue);

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
              type={ctrl.isEditing ? ctrl.editType : activeIssue.issue_type}
              disabled={isProjectArchived}
              onChange={(nextType) => {
                if (ctrl.isEditing) {
                  ctrl.setEditType(nextType);
                } else {
                  ctrl.handleQuickTypeChange(nextType);
                }
              }}
            />
            <ResolutionBadge
              resolution={ctrl.isEditing ? ctrl.editResolution : activeIssue.resolution}
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
            {/* 個人ピン留めボタン（未完了課題のみ表示） */}
            {activeIssue.status !== "closed" && currentUser && (
              <button
                type="button"
                onClick={ctrl.handleTogglePin}
                disabled={ctrl.isTogglingPin}
                className={`flex items-center gap-1 text-xs font-semibold px-2 sm:px-2.5 py-1 rounded-lg border transition-all cursor-pointer spring-bounce disabled:opacity-50 ${
                  Boolean(activeIssue.is_pinned)
                    ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                    : "bg-white border-slate-300 text-slate-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700"
                }`}
                title={Boolean(activeIssue.is_pinned) ? "ピン留めを解除" : "一覧・ボードの上部にピン留め"}
                aria-pressed={Boolean(activeIssue.is_pinned)}
              >
                <Pin
                  className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                    Boolean(activeIssue.is_pinned)
                      ? "text-amber-500 fill-amber-400 rotate-[-15deg] scale-110"
                      : ""
                  }`}
                />
                <span className="hidden sm:inline">
                  {Boolean(activeIssue.is_pinned) ? "ピン中" : "ピン"}
                </span>
              </button>
            )}

            {/* URLコピーボタン */}
            <button
              type="button"
              onClick={ctrl.handleCopyLink}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2 sm:px-3 py-1 rounded-lg border transition-all cursor-pointer spring-bounce ${
                ctrl.isCopiedUrl
                  ? "bg-emerald-600 border-emerald-600 text-white shadow-xs font-bold scale-[1.02]"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400"
              }`}
              title="課題の一意URLをコピー"
            >
              {ctrl.isCopiedUrl ? (
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
                {!ctrl.isEditing ? (
                  <button
                    type="button"
                    onClick={() => ctrl.setIsEditing(true)}
                    className="flex items-center gap-1 text-xs font-semibold px-2 sm:px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">編集</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={ctrl.handleSaveEdit}
                    disabled={ctrl.isSaving}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 sm:px-3 py-1 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>{ctrl.isSaving ? "保存中" : "保存"}</span>
                  </button>
                )}

                {ctrl.canDelete && (
                  <button
                    type="button"
                    onClick={ctrl.handleDelete}
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

        {/* 常時固定の課題件名 ＆ 全属性ツールバー */}
        {!ctrl.isEditing && (
          <IssueSummaryToolbar
            variant="modal"
            activeIssue={activeIssue}
            isProjectArchived={isProjectArchived}
            canClose={ctrl.canClose}
            hasUnclosedChildren={ctrl.hasUnclosedChildren}
            unclosedChildrenCount={ctrl.unclosedChildrenCount}
            currentUser={currentUser}
            users={users}
            candidateUsers={ctrl.candidateUsers}
            currentAssignee={ctrl.currentAssignee}
            creatorName={ctrl.creatorName}
            settings={settings}
            onSwitchParentIssue={(target) => handleSwitchIssue(target)}
            onOpenHistory={(tab) => {
              ctrl.setIssueHistoryTab(tab);
              ctrl.setIsIssueHistoryOpen(true);
            }}
            onOpenReviewModal={() => ctrl.setIsReviewModalOpen(true)}
            onQuickStatusChange={ctrl.handleQuickStatusChange}
            onQuickResolutionChange={ctrl.handleQuickResolutionChange}
            onQuickAssigneeChange={ctrl.handleQuickAssigneeChange}
            onQuickPriorityChange={ctrl.handleQuickPriorityChange}
          />
        )}

        {/* コンテンツ本体 */}
        <div ref={contentScrollRef} className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden space-y-6 flex-1 max-w-full">
          {ctrl.isEditing ? (
            <IssueEditFormSection
              variant="modal"
              issueId={activeIssue.id}
              activeIssue={activeIssue}
              editTitle={ctrl.editTitle}
              onChangeEditTitle={ctrl.setEditTitle}
              editType={ctrl.editType}
              onChangeEditType={ctrl.setEditType}
              editStatus={ctrl.editStatus}
              onChangeEditStatus={ctrl.setEditStatus}
              editResolution={ctrl.editResolution}
              onChangeEditResolution={ctrl.setEditResolution}
              editAssigneeId={ctrl.editAssigneeId}
              onChangeEditAssigneeId={ctrl.setEditAssigneeId}
              editPriority={ctrl.editPriority}
              onChangeEditPriority={ctrl.setEditPriority}
              editStartDate={ctrl.editStartDate}
              onChangeEditStartDate={ctrl.setEditStartDate}
              editDueDate={ctrl.editDueDate}
              onChangeEditDueDate={ctrl.setEditDueDate}
              editParentId={ctrl.editParentId}
              onChangeEditParentId={ctrl.setEditParentId}
              editDescription={ctrl.editDescription}
              onChangeEditDescription={ctrl.setEditDescription}
              editNotifyUserIds={ctrl.editNotifyUserIds}
              onChangeEditNotifyUserIds={ctrl.setEditNotifyUserIds}
              canClose={ctrl.canClose}
              hasUnclosedChildren={ctrl.hasUnclosedChildren}
              unclosedChildrenCount={ctrl.unclosedChildrenCount}
              isEditExceedingParentDue={ctrl.isEditExceedingParentDue}
              selectedEditParentInfo={ctrl.selectedEditParentInfo}
              availableParents={ctrl.availableParents}
              users={users}
              candidateUsers={ctrl.candidateUsers}
              currentUser={currentUser}
              comments={ctrl.comments}
              isSaving={ctrl.isSaving}
              hasDraft={ctrl.hasEditDraft}
              isDraftRestored={ctrl.isEditDraftRestored}
              onDiscardDraft={ctrl.handleDiscardEditDraft}
              onCancelEdit={() => ctrl.setIsEditing(false)}
              onSaveEdit={ctrl.handleSaveEdit}
              onAttachmentUploaded={(att) => ctrl.setAttachments((prev) => [...prev, att])}
            />
          ) : (
            <>
              {/* 詳細・メモ内容 */}
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
                          ctrl.setIssueHistoryTab("description");
                          ctrl.setIsIssueHistoryOpen(true);
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
                attachments={ctrl.attachments}
                isProjectArchived={isProjectArchived}
                currentUser={currentUser}
                onDirectFileUpload={ctrl.handleDirectFileUpload}
                onDeleteAttachment={ctrl.handleDeleteAttachment}
              />

              {/* 子課題セクション */}
              <IssueChildSection
                variant="modal"
                childrenIssues={ctrl.childrenIssues}
                isProjectArchived={isProjectArchived}
                isAddingChild={ctrl.isAddingChild}
                onStartAddChild={() => {
                  ctrl.setIsAddingChild(true);
                  ctrl.setChildError("");
                }}
                onCancelAddChild={() => {
                  ctrl.setIsAddingChild(false);
                  ctrl.setChildTitle("");
                  ctrl.setChildError("");
                }}
                childTitle={ctrl.childTitle}
                onChangeChildTitle={ctrl.setChildTitle}
                childType={ctrl.childType}
                onChangeChildType={ctrl.setChildType}
                childAssigneeId={ctrl.childAssigneeId}
                onChangeChildAssigneeId={ctrl.setChildAssigneeId}
                isSubmittingChild={ctrl.isSubmittingChild}
                childError={ctrl.childError}
                onSubmitAddChild={ctrl.handleAddChildIssue}
                assigneeCandidateUsers={ctrl.candidateUsers}
                onSwitchIssue={handleSwitchIssue}
              />
            </>
          )}

          {/* コメントセクション */}
          <IssueCommentsSection
            variant="modal"
            issueId={activeIssue.id}
            comments={ctrl.comments}
            users={users}
            currentUser={currentUser}
            settings={settings}
            isProjectArchived={isProjectArchived}
            editingCommentId={ctrl.editingCommentId}
            editCommentContent={ctrl.editCommentContent}
            onChangeEditCommentContent={ctrl.setEditCommentContent}
            isSavingComment={ctrl.isSavingComment}
            onStartEditComment={ctrl.handleStartEditComment}
            onCancelEditComment={ctrl.handleCancelEditComment}
            onSaveEditComment={ctrl.handleSaveEditComment}
            onDeleteComment={ctrl.handleDeleteComment}
            onOpenCommentHistory={(cid) => ctrl.setHistoryModalCommentId(cid)}
            onReactionsUpdated={(cid, nextReactions) => {
              ctrl.setComments((prev) =>
                prev.map((c) => (c.id === cid ? { ...c, reactions: nextReactions } : c))
              );
            }}
            newComment={ctrl.newComment}
            onChangeNewComment={ctrl.setNewComment}
            isPostingComment={ctrl.isPostingComment}
            isPostingSuccess={ctrl.isPostingSuccess}
            hasDraft={ctrl.hasCommentDraft}
            isDraftRestored={ctrl.isCommentDraftRestored}
            onDiscardDraft={ctrl.handleDiscardCommentDraft}
            onPostComment={ctrl.handlePostComment}
            onAttachmentUploaded={(att) => ctrl.setAttachments((prev) => [...prev, att])}
            onIssueClick={handleSwitchByIssueKey}
            onCloseModal={onClose}
          />
        </div>
      </div>

      {/* 各種履歴・レビュー依頼・親課題期限延長確認モーダル */}
      <IssueDetailModalsBundle
        issueId={activeIssue.id}
        activeIssue={activeIssue}
        historyModalCommentId={ctrl.historyModalCommentId}
        onCloseCommentHistory={() => ctrl.setHistoryModalCommentId(null)}
        isIssueHistoryOpen={ctrl.isIssueHistoryOpen}
        onCloseIssueHistory={() => ctrl.setIsIssueHistoryOpen(false)}
        issueHistoryTab={ctrl.issueHistoryTab}
        isReviewModalOpen={ctrl.isReviewModalOpen}
        onCloseReviewModal={() => ctrl.setIsReviewModalOpen(false)}
        onSubmitReviewRequest={ctrl.handleReviewRequestSubmit}
        reviewCandidateUsers={ctrl.candidateUsers}
        users={users}
        currentUserId={currentUser?.id}
        settings={settings}
        parentDueWarning={ctrl.parentDueWarning}
        isSaving={ctrl.isSaving}
        onConfirmParentDue={async (extendParentDueDate) => {
          ctrl.setParentDueWarning(null);
          await ctrl.executeSaveEdit(extendParentDueDate);
        }}
        onCancelParentDue={() => ctrl.setParentDueWarning(null)}
      />

      {/* 課題完了時の完了理由選択モーダル */}
      {ctrl.isCompleteModalOpen && (
        <CompleteIssueModal
          isOpen={ctrl.isCompleteModalOpen}
          issueKey={activeIssue.issue_key}
          issueTitle={activeIssue.title}
          onClose={() => ctrl.setIsCompleteModalOpen(false)}
          onConfirm={async (resolution) => {
            ctrl.setIsCompleteModalOpen(false);
            onClose(); // 課題完了理由を選択したら、課題詳細ウィンドウも自動で閉じる
            await ctrl.executeCloseWithResolution(resolution);
          }}
        />
      )}
    </div>
  );
}
