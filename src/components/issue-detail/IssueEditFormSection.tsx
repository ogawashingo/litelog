// 課題詳細（モーダル・個別ページ）の編集モード入力フォームセクション
"use client";

import React from "react";
import { AlertTriangle, GitBranch } from "lucide-react";
import {
  Attachment,
  Comment,
  Issue,
  IssuePriority,
  IssueResolution,
  IssueStatus,
  IssueType,
  User,
} from "@/types";
import ResolutionSelect from "@/components/ResolutionSelect";
import UserSelect from "@/components/UserSelect";
import { DatePicker } from "@/components/DatePicker";
import MentionTextarea from "@/components/MentionTextarea";
import NotifyUserSelector from "@/components/NotifyUserSelector";
import { SelectedEditParentInfo } from "./issueDetailUtils";

interface IssueEditFormSectionProps {
  variant: "modal" | "page";
  issueId: number;
  activeIssue: Issue;
  editTitle: string;
  onChangeEditTitle: (val: string) => void;
  editType: IssueType;
  onChangeEditType: (val: IssueType) => void;
  editStatus: IssueStatus;
  onChangeEditStatus: (val: IssueStatus) => void;
  editResolution: IssueResolution | null;
  onChangeEditResolution: (val: IssueResolution | null) => void;
  editAssigneeId: string;
  onChangeEditAssigneeId: (val: string) => void;
  editPriority: IssuePriority;
  onChangeEditPriority: (val: IssuePriority) => void;
  editStartDate: string;
  onChangeEditStartDate: (val: string) => void;
  editDueDate: string;
  onChangeEditDueDate: (val: string) => void;
  editParentId: string;
  onChangeEditParentId: (val: string) => void;
  editDescription: string;
  onChangeEditDescription: (val: string) => void;
  editNotifyUserIds: number[];
  onChangeEditNotifyUserIds: (ids: number[]) => void;
  canClose: boolean;
  hasUnclosedChildren: boolean;
  unclosedChildrenCount: number;
  isEditExceedingParentDue: boolean;
  selectedEditParentInfo: SelectedEditParentInfo | null;
  availableParents: Issue[];
  users: User[];
  candidateUsers: User[];
  currentUser: User | null;
  comments: Comment[];
  isSaving: boolean;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onAttachmentUploaded?: (att: Attachment) => void;
}

export default function IssueEditFormSection({
  variant,
  issueId,
  activeIssue,
  editTitle,
  onChangeEditTitle,
  editType,
  onChangeEditType,
  editStatus,
  onChangeEditStatus,
  editResolution,
  onChangeEditResolution,
  editAssigneeId,
  onChangeEditAssigneeId,
  editPriority,
  onChangeEditPriority,
  editStartDate,
  onChangeEditStartDate,
  editDueDate,
  onChangeEditDueDate,
  editParentId,
  onChangeEditParentId,
  editDescription,
  onChangeEditDescription,
  editNotifyUserIds,
  onChangeEditNotifyUserIds,
  canClose,
  hasUnclosedChildren,
  unclosedChildrenCount,
  isEditExceedingParentDue,
  selectedEditParentInfo,
  availableParents,
  users,
  candidateUsers,
  currentUser,
  comments,
  isSaving,
  onCancelEdit,
  onSaveEdit,
  onAttachmentUploaded,
}: IssueEditFormSectionProps) {
  if (variant === "page") {
    return (
      <>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">件名 *</label>
          <input
            type="text"
            value={editTitle}
            onChange={(e) => onChangeEditTitle(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            placeholder="2〜3日で完了できるタスク名（例: 【決済】Safariで注文確定ボタンが押せない不具合の修正）"
          />
        </div>

        {/* 編集モード時のメタ情報グリッド */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-xs">
          {/* 状態 */}
          <div>
            <span className="block text-slate-500 mb-1 font-medium">状態</span>
            <select
              value={editStatus}
              onChange={(e) => {
                const nextSt = e.target.value as IssueStatus;
                onChangeEditStatus(nextSt);
                if (nextSt !== "closed") {
                  onChangeEditResolution(null);
                }
              }}
              className="w-full bg-white border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="open">未対応</option>
              <option value="in_progress">処理中</option>
              <option value="resolved">処理済み</option>
              <option value="closed" disabled={!canClose || hasUnclosedChildren}>
                完了
                {!canClose
                  ? " (起票者/管理者限定)"
                  : hasUnclosedChildren
                  ? " (未完了あり)"
                  : ""}
              </option>
            </select>
          </div>

          {/* 完了理由 */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-slate-500 font-medium">完了理由</span>
              {editStatus !== "closed" && (
                <span className="text-[9px] text-slate-400 font-normal">
                  (完了時のみ)
                </span>
              )}
            </div>
            <ResolutionSelect
              value={editStatus === "closed" ? editResolution : null}
              onChange={(nextRes) => onChangeEditResolution(nextRes)}
              disabled={editStatus !== "closed"}
              placeholder="-- （未設定）"
            />
          </div>

          {/* 優先度 */}
          <div>
            <span className="block text-slate-500 mb-1 font-medium">優先度</span>
            <select
              value={editPriority}
              onChange={(e) => onChangeEditPriority(e.target.value as IssuePriority)}
              className="w-full bg-white border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>

          {/* 担当者 */}
          <div>
            <span className="block text-slate-500 mb-1 font-medium">担当者</span>
            <select
              value={editAssigneeId}
              onChange={(e) => onChangeEditAssigneeId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">未割当</option>
              {users.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* 種別 */}
          <div>
            <span className="block text-slate-500 mb-1 font-medium">種別</span>
            <select
              value={editType}
              onChange={(e) => onChangeEditType(e.target.value as IssueType)}
              className="w-full bg-white border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="task">タスク</option>
              <option value="bug">バグ</option>
              <option value="request">要望</option>
              <option value="other">その他</option>
            </select>
          </div>
        </div>

        {/* 日程＆親課題設定 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-slate-100 pb-4 text-xs">
          {/* 開始日 */}
          <div>
            <span className="text-slate-500 font-medium block mb-1">開始日</span>
            <DatePicker
              value={editStartDate}
              onChange={(val) => onChangeEditStartDate(val || "")}
              placeholder="開始日を選択"
            />
          </div>

          {/* 期限日 */}
          <div>
            <span className="text-slate-500 font-medium block mb-1">期限日</span>
            <DatePicker
              value={editDueDate}
              onChange={(val) => onChangeEditDueDate(val || "")}
              placeholder="期限日を選択"
            />
            {isEditExceedingParentDue && selectedEditParentInfo?.dueDate && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                親課題の期限日 ({selectedEditParentInfo.dueDate}) を超えています
              </p>
            )}
          </div>

          {/* 親課題 */}
          <div>
            <span className="block text-slate-500 mb-1 font-medium">親課題</span>
            <select
              value={editParentId}
              onChange={(e) => onChangeEditParentId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">親課題なし</option>
              {availableParents.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  [{p.issue_key}] {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">件名</label>
        <input
          type="text"
          value={editTitle}
          onChange={(e) => onChangeEditTitle(e.target.value)}
          className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-base sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* 編集モード時の属性グリッド */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-x-5 gap-y-3.5 text-xs">
        <div className="min-w-0">
          <label className="block font-bold text-gray-700 mb-1">種別</label>
          <select
            value={editType}
            onChange={(e) => onChangeEditType(e.target.value as IssueType)}
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
              onChangeEditStatus(nextSt);
              if (nextSt !== "closed") {
                onChangeEditResolution(null);
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
            onChange={(nextRes) => onChangeEditResolution(nextRes)}
            disabled={editStatus !== "closed"}
            placeholder="-- （未設定）"
          />
        </div>

        <div className="min-w-0">
          <label className="block font-bold text-gray-700 mb-1">担当者</label>
          <UserSelect
            users={candidateUsers}
            value={editAssigneeId ? Number(editAssigneeId) : null}
            onChange={(val) => onChangeEditAssigneeId(val ? String(val) : "")}
            currentUserId={currentUser?.id}
            placeholder="未割当"
            className="w-full"
          />
        </div>

        <div className="min-w-0">
          <label className="block font-bold text-gray-700 mb-1">優先度</label>
          <select
            value={editPriority}
            onChange={(e) => onChangeEditPriority(e.target.value as IssuePriority)}
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
            onChange={(nextDate) => onChangeEditStartDate(nextDate || "")}
            placeholder="開始日を設定"
            fullWidth
          />
        </div>

        <div className="min-w-0">
          <label className="block font-bold text-gray-700 mb-1">期限日</label>
          <DatePicker
            value={editDueDate || null}
            onChange={(nextDate) => onChangeEditDueDate(nextDate || "")}
            placeholder="期限日を設定"
            fullWidth
          />
          {isEditExceedingParentDue && selectedEditParentInfo?.dueDate && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              親課題の期限日 ({selectedEditParentInfo.dueDate}) を超えています
            </p>
          )}
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
          onChange={(e) => onChangeEditParentId(e.target.value)}
          className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">親課題なし（単独課題）</option>
          {availableParents
            .filter((p) => !p.parent_id && p.id !== issueId)
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
          onChange={(val) => onChangeEditDescription(val)}
          users={users}
          issueId={activeIssue.id}
          onAttachmentUploaded={onAttachmentUploaded}
          placeholder={`【クローズ条件（完了基準は最大2つまで！）】\n- [ ] 例: PRがマージされステージングで確認できること\n\n【背景・手順メモ】\n※ 1週間以上かかりそうな大きなタスクは、複数チケットに分割しよう！ (@メンション・画像添付対応)`}
          className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-base sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* 編集時の通知先（参加者）チェックボックス選択 */}
      <NotifyUserSelector
        users={candidateUsers.length > 0 ? candidateUsers : users}
        currentUserId={currentUser?.id || null}
        selectedUserIds={editNotifyUserIds}
        onChange={onChangeEditNotifyUserIds}
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
          onClick={onCancelEdit}
          className="px-3 py-1.5 text-xs font-semibold rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={onSaveEdit}
          disabled={isSaving}
          className="px-4 py-1.5 text-xs font-bold rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 cursor-pointer"
        >
          {isSaving ? "保存中..." : "保存する"}
        </button>
      </div>
    </div>
  );
}
