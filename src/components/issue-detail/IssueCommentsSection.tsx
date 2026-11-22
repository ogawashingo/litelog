// 課題詳細（モーダル・個別ページ）共通のコメント一覧・インライン編集・投稿フォームセクション
"use client";

import React from "react";
import { MessageSquare, Edit2, Trash2, Send, ArrowLeft } from "lucide-react";
import {
  Attachment,
  Comment,
  CommentReaction,
  SystemSettings,
  User,
} from "@/types";
import { getUserInitials } from "@/components/UserManageModal";
import { formatTimestamp } from "@/lib/dateUtils";
import MentionTextarea from "@/components/MentionTextarea";
import MentionText from "@/components/MentionText";
import CommentReactionBar from "@/components/CommentReactionBar";

interface IssueCommentsSectionProps {
  variant: "modal" | "page";
  issueId: number;
  comments: Comment[];
  users: User[];
  currentUser: User | null;
  settings: SystemSettings;
  isProjectArchived: boolean;
  editingCommentId: number | null;
  editCommentContent: string;
  onChangeEditCommentContent: (val: string) => void;
  isSavingComment: boolean;
  onStartEditComment: (comment: Comment) => void;
  onCancelEditComment: () => void;
  onSaveEditComment: (commentId: number) => void;
  onDeleteComment: (commentId: number) => void;
  onOpenCommentHistory: (commentId: number) => void;
  onReactionsUpdated: (commentId: number, nextReactions: CommentReaction[]) => void;
  newComment: string;
  onChangeNewComment: (val: string) => void;
  isPostingComment: boolean;
  onPostComment: (e: React.FormEvent) => void;
  onAttachmentUploaded?: (att: Attachment) => void;
  onIssueClick?: (issueKey: string) => void;
  onCloseModal?: () => void;
}

export default function IssueCommentsSection({
  variant,
  issueId,
  comments,
  users,
  currentUser,
  settings,
  isProjectArchived,
  editingCommentId,
  editCommentContent,
  onChangeEditCommentContent,
  isSavingComment,
  onStartEditComment,
  onCancelEditComment,
  onSaveEditComment,
  onDeleteComment,
  onOpenCommentHistory,
  onReactionsUpdated,
  newComment,
  onChangeNewComment,
  isPostingComment,
  onPostComment,
  onAttachmentUploaded,
  onIssueClick,
  onCloseModal,
}: IssueCommentsSectionProps) {
  const isModal = variant === "modal";

  return (
    <div
      className={
        isModal
          ? "pt-4 border-t border-slate-200 space-y-4"
          : "space-y-4 pt-4 border-t border-slate-100"
      }
    >
      {isModal ? (
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
      ) : (
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-600" />
          <span>コメント ({comments.length})</span>
        </h3>
      )}

      {/* コメント一覧 */}
      <div className="space-y-3">
        {!isModal && comments.length === 0 ? (
          <p className="text-xs text-slate-400 italic">まだコメントはありません。</p>
        ) : (
          comments.map((comment) => {
            const authorName = comment.user_name || (isModal ? "メンバー" : "名無し");
            const authorInitialsSource = comment.user_name || (isModal ? "メンバー" : "名無");
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
              <div
                key={comment.id}
                className={
                  isModal
                    ? "bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2"
                    : "bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-xs space-y-2"
                }
              >
                <div className="flex items-center justify-between text-slate-500">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isModal ? (
                      <span
                        style={{ backgroundColor: authorColor }}
                        className="w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[10px]"
                      >
                        {getUserInitials(authorInitialsSource)}
                      </span>
                    ) : (
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ backgroundColor: authorColor }}
                      >
                        {getUserInitials(authorInitialsSource)}
                      </div>
                    )}
                    <span
                      className={
                        isModal
                          ? "font-semibold text-slate-800"
                          : "font-semibold text-slate-700"
                      }
                    >
                      {authorName}
                    </span>
                    {isEdited && (
                      <button
                        type="button"
                        onClick={() => onOpenCommentHistory(comment.id)}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer font-medium"
                        title="クリックして編集履歴を確認"
                      >
                        (編集済み{comment.history_count ? ` · ${comment.history_count}件` : ""})
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={isModal ? "text-[10px] text-slate-400" : "text-[11px] text-slate-400"}>
                      {formatTimestamp(comment.created_at, settings, true)}
                    </span>
                    {!isProjectArchived && canEdit && !isEditingThis && (
                      <button
                        type="button"
                        onClick={() => onStartEditComment(comment)}
                        className="text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 p-1 rounded transition-colors cursor-pointer"
                        title="コメントを編集"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!isProjectArchived && isAdmin && !isEditingThis && (
                      <button
                        type="button"
                        onClick={() => onDeleteComment(comment.id)}
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
                      onChange={onChangeEditCommentContent}
                      users={users}
                      issueId={isModal ? issueId : undefined}
                      onAttachmentUploaded={isModal ? onAttachmentUploaded : undefined}
                      className="w-full bg-white border border-indigo-400 rounded-lg p-2.5 text-base sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                      placeholder={
                        isModal
                          ? "コメントを修正... (@でメンバーをメンション、画像ペースト・添付対応)"
                          : "コメントを修正... (@でメンバーをメンション)"
                      }
                      disabled={isSavingComment}
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={onCancelEditComment}
                        disabled={isSavingComment}
                        className="px-2.5 py-1 text-slate-600 hover:bg-slate-200/70 rounded text-xs transition-colors"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={() => onSaveEditComment(comment.id)}
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
                      onIssueClick={isModal ? onIssueClick : undefined}
                      className="pl-6 text-sm text-slate-800"
                    />
                    <CommentReactionBar
                      issueId={issueId}
                      commentId={comment.id}
                      reactions={comment.reactions || []}
                      currentUserId={currentUser?.id || null}
                      currentUserName={currentUser?.name || null}
                      currentUserColor={currentUser?.color || null}
                      disabled={isProjectArchived}
                      onReactionsUpdated={onReactionsUpdated}
                    />
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* コメント投稿フォーム（アーカイブ時は読み取り専用案内を表示） */}
      {!isProjectArchived ? (
        <form onSubmit={onPostComment} className="space-y-2.5 pt-2">
          <MentionTextarea
            rows={5}
            placeholder={
              isModal
                ? "コメント・進捗を入力... (@でメンバーをメンション、画像ペースト・添付対応)"
                : "コメントを入力... (@でメンバーをメンション)"
            }
            value={newComment}
            onChange={onChangeNewComment}
            users={users}
            issueId={isModal ? issueId : undefined}
            onAttachmentUploaded={isModal ? onAttachmentUploaded : undefined}
            className={
              isModal
                ? "w-full bg-white border border-slate-300 rounded-lg p-3 text-base sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                : "w-full px-3 py-2 border border-slate-300 rounded-xl text-base sm:text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
            }
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!newComment.trim() || isPostingComment}
              className={
                isModal
                  ? "flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                  : "px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
              }
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isPostingComment ? "送信中..." : "コメントを投稿"}</span>
            </button>
          </div>
        </form>
      ) : (
        <div
          className={
            isModal
              ? "bg-slate-50 border border-slate-200/80 rounded-lg p-3 text-center text-xs text-slate-500 font-medium"
              : "bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-center text-xs text-slate-500 font-medium"
          }
        >
          このプロジェクトはアーカイブされているため、コメントの投稿は行えません（読み取り専用）。
        </div>
      )}

      {/* モバイル用最下部 戻るボタン（モーダル版のみ） */}
      {isModal && onCloseModal && (
        <div className="pt-4 border-t border-slate-200 flex justify-center sm:hidden">
          <button
            type="button"
            onClick={onCloseModal}
            className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>一覧へ戻る</span>
          </button>
        </div>
      )}
    </div>
  );
}
