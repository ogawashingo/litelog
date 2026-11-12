// 課題詳細・編集・コメント追加モーダルコンポーネント
"use client";

import React, { useState, useEffect } from "react";
import { X, Send, Calendar, Clock, Edit2, Check, MessageSquare, Trash2 } from "lucide-react";
import { Issue, Comment, IssueStatus, IssueType, IssuePriority } from "@/types";
import { TypeBadge, StatusBadge, PriorityBadge } from "./IssueBadge";

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
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // 編集用フォームState
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<IssueStatus>("open");
  const [editPriority, setEditPriority] = useState<IssuePriority>("medium");
  const [editType, setEditType] = useState<IssueType>("task");
  const [editStartDate, setEditStartDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // 課題が切り替わったときにコメント一覧を取得し、編集状態を同期
  useEffect(() => {
    if (!issue || !isOpen) return;

    setEditTitle(issue.title);
    setEditDescription(issue.description || "");
    setEditStatus(issue.status);
    setEditPriority(issue.priority);
    setEditType(issue.issue_type);
    setEditStartDate(issue.start_date || "");
    setEditDueDate(issue.due_date || "");
    setIsEditing(false);

    // コメント一覧の取得
    fetch(`/api/issues/${issue.id}/comments`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setComments(data);
        }
      })
      .catch((err) => console.error("コメント取得失敗:", err));
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
          startDate: editStartDate || null,
          dueDate: editDueDate || null,
        }),
      });

      if (res.ok) {
        setIsEditing(false);
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
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setEditStatus(newStatus);
        onUpdated();
      }
    } catch (err) {
      console.error("ステータス変更エラー:", err);
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
        body: JSON.stringify({ content: newComment.trim() }),
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
      const res = await fetch(`/api/issues/${issue.id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted();
        onClose();
      }
    } catch (err) {
      console.error("削除エラー:", err);
    }
  };

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
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>編集</span>
              </button>
            ) : (
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded bg-[#2ca078] text-white hover:bg-[#238161] transition-colors"
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
                <label className="block text-xs font-bold text-gray-700 mb-1">件名</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
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
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">期限日</label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">詳細</label>
                <textarea
                  rows={5}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="px-4 py-1.5 text-xs font-bold rounded bg-[#2ca078] text-white hover:bg-[#238161]"
                >
                  {isSaving ? "保存中..." : "保存する"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* タイトル */}
              <div>
                <h2 className="text-xl font-bold text-gray-900 leading-snug">
                  {issue.title}
                </h2>
              </div>

              {/* 属性グリッド（状態、優先度、開始日、期限日、登録日時） */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
                {/* 状態変更セレクター */}
                <div>
                  <span className="text-gray-500 block mb-1 font-medium">状態</span>
                  <select
                    value={issue.status}
                    onChange={(e) => handleQuickStatusChange(e.target.value as IssueStatus)}
                    className="bg-white border border-gray-300 rounded px-2 py-1 text-xs font-semibold cursor-pointer focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="open">未対応</option>
                    <option value="in_progress">処理中</option>
                    <option value="resolved">処理済み</option>
                    <option value="closed">完了</option>
                  </select>
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
                  <div className="flex items-center gap-1 text-gray-600">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span>{new Date(issue.created_at).toLocaleDateString("ja-JP")}</span>
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
            </>
          )}

          {/* コメントセクション */}
          <div className="pt-4 border-t border-gray-200 space-y-4">
            <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <span>コメント・作業メモ ({comments.length})</span>
            </h4>

            {/* コメント一覧 */}
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-[10px]">
                        私
                      </span>
                      <span className="font-semibold text-gray-700">自分</span>
                    </div>
                    <span className="text-[10px]">
                      {new Date(comment.created_at).toLocaleString("ja-JP")}
                    </span>
                  </div>
                  <p className="text-gray-800 whitespace-pre-wrap pl-6 text-sm">
                    {comment.content}
                  </p>
                </div>
              ))}
            </div>

            {/* コメント入力フォーム */}
            <form onSubmit={handlePostComment} className="space-y-2 pt-2">
              <textarea
                rows={2}
                placeholder="進捗や気づき、メモを残せます..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg p-3 text-sm text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!newComment.trim() || isPostingComment}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#2ca078] hover:bg-[#238161] text-white text-xs font-bold transition-all disabled:opacity-50"
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
