// 課題詳細・編集・コメント追加モーダルコンポーネント
"use client";

import React, { useState, useEffect } from "react";
import { X, Send, Calendar, Clock, Edit2, Check, MessageSquare, Trash2, GitBranch } from "lucide-react";
import { Issue, Comment, IssueStatus, IssueType, IssuePriority } from "@/types";
import { TypeBadge, StatusBadge, PriorityBadge } from "./IssueBadge";
import { useUser } from "./UserContext";
import { getUserInitials } from "./UserManageModal";
import { formatTimestamp } from "@/lib/dateUtils";
import { DatePicker } from "./DatePicker";

interface IssueDetailModalProps {
  issue: Issue | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}

export default function IssueDetailModal({
  issue,
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
}: IssueDetailModalProps) {
  const { users, currentUser, refreshUsers, settings } = useUser();

  const [comments, setComments] = useState<Comment[]>([]);
  const [childrenIssues, setChildrenIssues] = useState<Issue[]>([]);
  const [availableParents, setAvailableParents] = useState<Issue[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

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

    // 課題詳細（コメントや子課題含む）の取得
    fetch(`/api/issues/${issue.id}`)
      .then((res) => res.json())
      .then((data) => {
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

  if (!isOpen || !issue) return null;

  // 課題の更新を保存
  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;

    try {
      setIsSaving(true);
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
        await refreshUsers();
        onUpdated();
      }
    } catch (err) {
      console.error("更新エラー:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // ステータス即時変更
  const handleQuickStatusChange = async (newStatus: IssueStatus) => {
    try {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        setEditStatus(newStatus);
        await refreshUsers();
        onUpdated();
      }
    } catch (err) {
      console.error("ステータス変更エラー:", err);
    }
  };

  // 担当者即時変更
  const handleQuickAssigneeChange = async (newAssigneeIdStr: string) => {
    try {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeId: newAssigneeIdStr ? Number(newAssigneeIdStr) : null,
          actorId: currentUser?.id || null,
        }),
      });
      if (res.ok) {
        setEditAssigneeId(newAssigneeIdStr);
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

  const currentAssignee = users.find((u) => u.id === Number(editAssigneeId));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* ヘッダー */}
        <div className="bg-gray-100 border-b border-gray-200 px-6 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <TypeBadge type={isEditing ? editType : issue.issue_type} />
            <span className="font-bold text-gray-800 text-sm tracking-wide">
              {issue.issue_key}
            </span>
            {issue.project_name && (
              <span className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded text-gray-600">
                {issue.project_name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>編集</span>
              </button>
            ) : (
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSaving ? "保存中..." : "保存"}</span>
              </button>
            )}
            <button
              onClick={handleDelete}
              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="課題を削除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* コンテンツ本体 */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
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

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs">
                <div>
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

                <div>
                  <label className="block font-bold text-gray-700 mb-1">状態</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as IssueStatus)}
                    className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-800"
                  >
                    <option value="open">未対応</option>
                    <option value="in_progress">処理中</option>
                    <option value="resolved">処理済み</option>
                    <option value="closed">完了</option>
                  </select>
                </div>

                <div>
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

                <div>
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

                <div>
                  <label className="block font-bold text-gray-700 mb-1">開始日</label>
                  <DatePicker
                    value={editStartDate || null}
                    onChange={(nextDate) => setEditStartDate(nextDate || "")}
                    placeholder="開始日を設定"
                    fullWidth
                  />
                </div>

                <div>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">詳細</label>
                <textarea
                  rows={5}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
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
                {issue.parent_id && issue.parent_issue_key && (
                  <div className="mb-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-xs text-slate-700 font-medium">
                    <GitBranch className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-slate-500">親課題:</span>
                    <span className="font-bold text-indigo-700">[{issue.parent_issue_key}]</span>
                    <span className="truncate max-w-sm">{issue.parent_title}</span>
                  </div>
                )}
                <h2 className="text-xl font-bold text-slate-900 leading-snug">
                  {issue.title}
                </h2>
              </div>

              {/* 属性グリッド（状態、担当者、優先度、開始日、期限日、登録日時） */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 text-xs">
                {/* 状態変更セレクター */}
                <div>
                  <span className="text-slate-500 block mb-1 font-medium">状態</span>
                  <select
                    value={editStatus}
                    onChange={(e) => handleQuickStatusChange(e.target.value as IssueStatus)}
                    className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold cursor-pointer focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="open">未対応</option>
                    <option value="in_progress">処理中</option>
                    <option value="resolved">処理済み</option>
                    <option value="closed">完了</option>
                  </select>
                </div>

                {/* 担当者即時変更セレクター */}
                <div>
                  <span className="text-slate-500 block mb-1 font-medium">担当者</span>
                  <div className="flex items-center gap-1.5">
                    <div
                      style={{ backgroundColor: currentAssignee?.color || "#9ca3af" }}
                      className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[9px] font-bold shrink-0"
                    >
                      {getUserInitials(currentAssignee?.name)}
                    </div>
                    <select
                      value={editAssigneeId}
                      onChange={(e) => handleQuickAssigneeChange(e.target.value)}
                      className="bg-white border border-slate-300 rounded px-1.5 py-1 text-xs font-medium text-slate-800 cursor-pointer focus:ring-1 focus:ring-indigo-500 max-w-[110px] truncate"
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

                <div>
                  <span className="text-gray-500 block mb-1 font-medium">優先度</span>
                  <PriorityBadge priority={issue.priority} />
                </div>

                <div>
                  <span className="text-gray-500 block mb-1 font-medium">開始日</span>
                  <div className="flex items-center gap-1 font-medium text-gray-800">
                    <Calendar className="w-3.5 h-3.5 text-gray-500" />
                    <span>{issue.start_date || "指定なし"}</span>
                  </div>
                </div>

                <div>
                  <span className="text-gray-500 block mb-1 font-medium">期限日</span>
                  <div className="flex items-center gap-1 font-medium text-gray-800">
                    <Calendar className="w-3.5 h-3.5 text-gray-500" />
                    <span>{issue.due_date || "指定なし"}</span>
                  </div>
                </div>

                <div>
                  <span className="text-gray-500 block mb-1 font-medium">登録日時</span>
                  <div
                    className="flex items-center gap-1 text-gray-600"
                    title={`登録: ${formatTimestamp(issue.created_at, settings, true)}\n更新: ${formatTimestamp(issue.updated_at, settings, true)}`}
                  >
                    <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{formatTimestamp(issue.created_at, settings, true)}</span>
                  </div>
                </div>
              </div>

              {/* 詳細・メモ内容 */}
              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  詳細説明
                </h4>
                <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed min-h-[90px]">
                  {issue.description ? (
                    issue.description
                  ) : (
                    <span className="text-gray-400 italic">詳細メモはありません</span>
                  )}
                </div>
              </div>

              {/* 子課題一覧（存在する場合のみ表示） */}
              {childrenIssues.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
                    <span>子課題 ({childrenIssues.length})</span>
                  </h4>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg divide-y divide-slate-200">
                    {childrenIssues.map((child) => (
                      <div key={child.id} className="px-3 py-2 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <TypeBadge type={child.issue_type} showLabel={false} />
                          <span className="font-bold text-indigo-800 shrink-0">{child.issue_key}</span>
                          <span className="text-slate-800 truncate">{child.title}</span>
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
                </div>
              )}
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

                return (
                  <div key={comment.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <span
                          style={{ backgroundColor: authorColor }}
                          className="w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[10px]"
                        >
                          {getUserInitials(authorName)}
                        </span>
                        <span className="font-semibold text-slate-800">{authorName}</span>
                      </div>
                      <span className="text-[10px]">
                        {formatTimestamp(comment.created_at, settings, true)}
                      </span>
                    </div>
                    <p className="text-slate-800 whitespace-pre-wrap pl-6 text-sm">
                      {comment.content}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* コメント入力フォーム */}
            <form onSubmit={handlePostComment} className="space-y-2 pt-2">
              <textarea
                rows={2}
                placeholder={
                  currentUser
                    ? `${currentUser.name} としてコメント・進捗を入力...`
                    : "進捗や気づき、メモを残せます..."
                }
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
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
          </div>
        </div>
      </div>
    </div>
  );
}
