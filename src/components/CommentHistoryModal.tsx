"use client";

import { useEffect, useState } from "react";
import { X, History, Clock } from "lucide-react";
import { formatTimestamp } from "@/lib/dateUtils";
import { Comment, CommentHistory, SystemSettings, User } from "@/types";
import MentionText from "./MentionText";

interface CommentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  issueId: number | string;
  commentId: number | null;
  settings?: SystemSettings;
  users?: User[];
}

// ユーザー名の頭文字を取得するヘルパー
function getUserInitials(name?: string | null): string {
  if (!name) return "名";
  return name.trim().slice(0, 1);
}

// コメント編集履歴（変更ログ）モーダルコンポーネント
export default function CommentHistoryModal({
  isOpen,
  onClose,
  issueId,
  commentId,
  settings,
  users = [],
}: CommentHistoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentComment, setCurrentComment] = useState<Comment | null>(null);
  const [histories, setHistories] = useState<CommentHistory[]>([]);

  useEffect(() => {
    if (!isOpen || !commentId) {
      setCurrentComment(null);
      setHistories([]);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    // 編集履歴APIを呼び出し
    fetch(`/api/issues/${issueId}/comments/${commentId}/history`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "履歴の取得に失敗しました");
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setCurrentComment(data.comment || null);
          setHistories(data.histories || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "履歴の取得に失敗しました");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, issueId, commentId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">コメント編集履歴</h3>
              <p className="text-xs text-slate-500">
                過去の変更ログと修正前の内容を確認できます
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 本文エリア */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {loading && (
            <div className="py-12 text-center text-slate-500 text-xs">
              <div className="inline-block w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2" />
              <p>編集履歴を読み込み中...</p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="space-y-4">
              {/* 最新（現在）のコメント */}
              {currentComment && (
                <div className="relative pl-6 pb-2 border-l-2 border-emerald-500">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] font-bold ring-4 ring-white">
                    現
                  </div>
                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          style={{ backgroundColor: currentComment.user_color || "#4f46e5" }}
                          className="w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[10px]"
                        >
                          {getUserInitials(currentComment.user_name)}
                        </span>
                        <span className="font-semibold text-slate-800">
                          {currentComment.user_name || "メンバー"}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
                          最新版（現在）
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>
                          {formatTimestamp(
                            currentComment.updated_at || currentComment.created_at,
                            settings,
                            true
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="pt-1">
                      <MentionText text={currentComment.content} users={users} className="text-sm text-slate-800" />
                    </div>
                  </div>
                </div>
              )}

              {/* 過去の版一覧（新しい順） */}
              {histories.map((h, idx) => {
                const versionNumber = histories.length - idx;
                return (
                  <div key={h.id} className="relative pl-6 border-l-2 border-slate-200">
                    <div className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-slate-300 ring-4 ring-white" />
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span
                            style={{ backgroundColor: h.user_color || "#64748b" }}
                            className="w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[10px]"
                          >
                            {getUserInitials(h.user_name)}
                          </span>
                          <span className="font-semibold text-slate-700">
                            {h.user_name || "メンバー"}
                          </span>
                          <span className="text-slate-400 text-[10px]">が変更</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-600 font-medium">
                            Ver {versionNumber}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Clock className="w-3 h-3" />
                          <span>{formatTimestamp(h.created_at, settings, true)}</span>
                        </div>
                      </div>
                      <div className="pt-1">
                        <MentionText text={h.content} users={users} className="text-sm text-slate-600" />
                      </div>
                    </div>
                  </div>
                );
              })}

              {histories.length === 0 && (
                <div className="text-center py-6 text-slate-400 text-xs">
                  過去の編集履歴はありません（初回投稿のままです）。
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
