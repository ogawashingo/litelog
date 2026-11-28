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
  Trash2,
  Link as LinkIcon,
  AlertCircle,
  LayoutDashboard,
  Archive,
  Pin,
} from "lucide-react";
import Header from "@/components/Header";
import CreateIssueModal from "@/components/CreateIssueModal";
import BackupModal from "@/components/BackupModal";
import CompleteIssueModal from "@/components/CompleteIssueModal";
import { TypeBadge, ResolutionBadge } from "@/components/IssueBadge";
import { useUser } from "@/components/UserContext";
import { Issue, Project, isArchivedProject } from "@/types";
import { setStoredProjectId } from "@/lib/projectStorage";
import MentionTextarea from "@/components/MentionTextarea";
import IssueTemplateSelector from "@/components/IssueTemplateSelector";
import MentionText from "@/components/MentionText";
import NotifyUserSelector from "@/components/NotifyUserSelector";
import DraftIndicator from "@/components/DraftIndicator";
import { useIssueDetailController } from "@/components/issue-detail/useIssueDetailController";
import IssueSummaryToolbar from "@/components/issue-detail/IssueSummaryToolbar";
import IssueEditFormSection from "@/components/issue-detail/IssueEditFormSection";
import IssueAttachmentsSection from "@/components/issue-detail/IssueAttachmentsSection";
import IssueChildSection from "@/components/issue-detail/IssueChildSection";
import IssueCommentsSection from "@/components/issue-detail/IssueCommentsSection";
import IssueDetailModalsBundle from "@/components/issue-detail/IssueDetailModalsBundle";

export default function IssueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { users, currentUser, refreshUsers, settings } = useUser();
  const issueKeyParam = (params?.issueKey as string) || "";

  // 課題・ページ固有State
  const [issue, setIssue] = useState<Issue | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ヘッダー用モーダルState
  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [createIssueDefaultParentId, setCreateIssueDefaultParentId] = useState<number | null>(null);
  const [isBackupOpen, setIsBackupOpen] = useState(false);

  // プロジェクト一覧取得
  useEffect(() => {
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setProjects(data))
      .catch((err) => console.error("プロジェクト取得失敗:", err));
  }, []);

  const ctrl = useIssueDetailController({
    activeIssue: issue,
    setActiveIssue: setIssue,
    users,
    currentUser,
    refreshUsers,
    onDeleteSuccess: () => router.push("/"),
    getCopyUrl: () => window.location.href,
  });

  const { applyIssueDetailPayload } = ctrl;

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
      setNotFound(false);
      applyIssueDetailPayload(data, { syncAllEditFields: true, loadContext: true });
      if (data.issue?.project_id) {
        setStoredProjectId(data.issue.project_id);
      }
    } catch (err) {
      console.error("課題詳細ロードエラー:", err);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [issueKeyParam, applyIssueDetailPayload]);

  useEffect(() => {
    fetchIssueDetail();
  }, [fetchIssueDetail]);

  // 該当プロジェクトのプロジェクト情報およびアーカイブ状態判定
  const currentProject = projects.find((p) => p.id === issue?.project_id);
  const isProjectArchived = isArchivedProject(issue) || isArchivedProject(currentProject);

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
              onClick={ctrl.handleCopyLink}
              disabled={notFound || isLoading}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer spring-bounce ${
                ctrl.isCopiedUrl
                  ? "bg-emerald-600 border-emerald-600 text-white shadow-xs font-bold scale-[1.02]"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400"
              }`}
              title="この課題のURLをコピーして共有"
            >
              {ctrl.isCopiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white stroke-[3] animate-check-pop" />
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

        {/* アーカイブ済みプロジェクトのリードオンリー注意バナー */}
        {!isLoading && issue && isProjectArchived && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-xl shadow-xs flex items-center gap-2.5 text-xs font-semibold animate-in fade-in duration-150">
            <Archive className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              この課題が属するプロジェクトは<strong>アーカイブ</strong>されています。読み取り専用のため、課題情報の修正や状態の変更、コメント投稿は行えません。
            </span>
          </div>
        )}

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
            <div className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 shadow-2xs">
              {/* 上段: メタバッジ・キー・操作アクション */}
              <div className="px-4 sm:px-6 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200/60">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <TypeBadge
                    type={ctrl.isEditing ? ctrl.editType : issue.issue_type}
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
                    resolution={ctrl.isEditing ? ctrl.editResolution : issue.resolution}
                  />
                  <span className="font-bold text-slate-800 text-sm sm:text-base font-mono tracking-wide whitespace-nowrap shrink-0">
                    {issue.issue_key}
                  </span>
                  {issue.project_name && (
                    <span className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded font-medium text-slate-700 truncate max-w-[180px] sm:max-w-none">
                      {issue.project_name}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* 個人ピン留めボタン（未完了課題のみ表示） */}
                  {issue.status !== "closed" && currentUser && (
                    <button
                      type="button"
                      onClick={ctrl.handleTogglePin}
                      disabled={ctrl.isTogglingPin}
                      className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer spring-bounce disabled:opacity-50 ${
                        Boolean(issue.is_pinned)
                          ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                          : "bg-white border-slate-300 text-slate-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700"
                      }`}
                      title={Boolean(issue.is_pinned) ? "ピン留めを解除" : "一覧・ボードの上部にピン留め"}
                      aria-pressed={Boolean(issue.is_pinned)}
                    >
                      <Pin
                        className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                          Boolean(issue.is_pinned)
                            ? "text-amber-500 fill-amber-400 rotate-[-15deg] scale-110"
                            : ""
                        }`}
                      />
                      <span>{Boolean(issue.is_pinned) ? "ピン中" : "ピン"}</span>
                    </button>
                  )}

                  {isProjectArchived ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 border border-slate-300">
                      <Archive className="w-3.5 h-3.5" />
                      <span>アーカイブ（読み取り専用）</span>
                    </span>
                  ) : (
                    <>
                      {!ctrl.isEditing ? (
                        <button
                          type="button"
                          onClick={() => ctrl.setIsEditing(true)}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>編集</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={ctrl.handleSaveEdit}
                          disabled={ctrl.isSaving}
                          className="flex items-center gap-1 text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{ctrl.isSaving ? "保存中..." : "保存"}</span>
                        </button>
                      )}
                      {ctrl.canDelete && (
                        <button
                          type="button"
                          onClick={ctrl.handleDelete}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="課題を削除（作成者または管理者のみ）"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 下段（非編集時）: 常時固定の課題件名 ＆ 全属性ツールバー */}
              {!ctrl.isEditing && (
                <IssueSummaryToolbar
                  variant="page"
                  activeIssue={issue}
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
            </div>

            {/* 詳細コンテンツ */}
            <div className="p-6 space-y-6">
              {/* 編集モード時のみタイトル・メタ情報を表示 */}
              {ctrl.isEditing && (
                <IssueEditFormSection
                  variant="page"
                  issueId={issue.id}
                  activeIssue={issue}
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
              )}

              {/* 詳細説明 */}
              <div className={!ctrl.isEditing && !issue.description ? "hidden sm:block" : ""}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-700">詳細・メモ</h3>
                    {ctrl.isEditing && (
                      <DraftIndicator
                        hasDraft={ctrl.hasEditDraft}
                        isRestored={ctrl.isEditDraftRestored}
                        onDiscard={ctrl.handleDiscardEditDraft}
                      />
                    )}
                    {Boolean(issue.description_history_count && issue.description_history_count > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          ctrl.setIssueHistoryTab("description");
                          ctrl.setIsIssueHistoryOpen(true);
                        }}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer font-medium"
                        title="クリックして詳細の変更履歴を確認"
                      >
                        (編集済み · {issue.description_history_count}件)
                      </button>
                    )}
                  </div>
                  {ctrl.isEditing && (
                    <IssueTemplateSelector
                      projectId={issue.project_id}
                      currentValue={ctrl.editDescription}
                      onApplyTemplate={(newContent) => ctrl.setEditDescription(newContent)}
                    />
                  )}
                </div>
                {ctrl.isEditing ? (
                  <div className="space-y-3">
                    <MentionTextarea
                      rows={6}
                      value={ctrl.editDescription}
                      onChange={(val) => ctrl.setEditDescription(val)}
                      users={users}
                      issueId={issue.id}
                      onAttachmentUploaded={(att) => ctrl.setAttachments((prev) => [...prev, att])}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
                      placeholder={`※完了条件が記載されると良いです。\n※1週間以上かかりそうな大きな課題は、複数の課題に分割しましょう。`}
                    />
                    <NotifyUserSelector
                      users={ctrl.candidateUsers}
                      currentUserId={currentUser?.id || null}
                      selectedUserIds={ctrl.editNotifyUserIds}
                      onChange={ctrl.setEditNotifyUserIds}
                      autoNotifyUserIds={
                        [
                          issue.created_by ? Number(issue.created_by) : 0,
                          ctrl.editAssigneeId ? Number(ctrl.editAssigneeId) : 0,
                        ].filter(Boolean)
                      }
                      participantUserIds={
                        [
                          issue.created_by ? Number(issue.created_by) : 0,
                          issue.assignee_id ? Number(issue.assignee_id) : 0,
                          ...ctrl.comments.map((c) => Number(c.user_id || 0)),
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
                      <span className="text-slate-400 italic">詳細はありません。</span>
                    )}
                  </div>
                )}
              </div>

              {/* 添付ファイルセクション */}
              {!ctrl.isEditing && (
                <IssueAttachmentsSection
                  attachments={ctrl.attachments}
                  isProjectArchived={isProjectArchived}
                  currentUser={currentUser}
                  onDirectFileUpload={ctrl.handleDirectFileUpload}
                  onDeleteAttachment={ctrl.handleDeleteAttachment}
                />
              )}

              {/* 子課題セクション */}
              <IssueChildSection
                variant="page"
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
                onOpenDetailedChildCreate={() => {
                  setCreateIssueDefaultParentId(issue.id);
                  setIsCreateIssueOpen(true);
                }}
              />

              {/* コメントセクション */}
              <IssueCommentsSection
                variant="page"
                issueId={issue.id}
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
                    prev.map((item) =>
                      item.id === cid ? { ...item, reactions: nextReactions } : item
                    )
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
              />
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

      {/* 各種履歴・レビュー依頼・親課題期限延長確認モーダル */}
      <IssueDetailModalsBundle
        issueId={issue ? issue.id : null}
        activeIssue={issue}
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
      {issue && ctrl.isCompleteModalOpen && (
        <CompleteIssueModal
          isOpen={ctrl.isCompleteModalOpen}
          issueKey={issue.issue_key}
          issueTitle={issue.title}
          onClose={() => ctrl.setIsCompleteModalOpen(false)}
          onConfirm={async (resolution) => {
            ctrl.setIsCompleteModalOpen(false);
            await ctrl.executeCloseWithResolution(resolution);
          }}
        />
      )}
    </div>
  );
}
