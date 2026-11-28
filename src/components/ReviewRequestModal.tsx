// 課題を「処理済み」に変更する際の「レビュー・確認依頼」モーダルコンポーネント
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Rocket,
  X,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { User } from "@/types";
import { getSafeErrorMessage } from "@/lib/clientError";

interface ReviewRequestModalProps {
  isOpen: boolean;
  issueKey: string;
  issueTitle: string;
  reporterId?: number | null;
  currentAssigneeId?: number | null;
  users: User[];
  currentUserId?: number;
  onClose: () => void;
  onSubmit: (data: {
    reviewerId: number;
    changeAssignee: boolean;
    comment: string;
  }) => Promise<void>;
}

export default function ReviewRequestModal({
  isOpen,
  issueKey,
  issueTitle,
  reporterId,
  users,
  currentUserId,
  onClose,
  onSubmit,
}: ReviewRequestModalProps) {
  // レビュアー選択State
  const [selectedReviewerId, setSelectedReviewerId] = useState<number | "">("");
  const [changeAssignee, setChangeAssignee] = useState(true);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // レビュアー候補リスト（自分以外のユーザーを優先、起票者を先頭に）
  const candidateUsers = useMemo(() => {
    return users.filter((u) => u.id !== currentUserId);
  }, [users, currentUserId]);

  // 初期レビュアーの自動選択（起票者、または候補の1人目）
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setIsSubmitting(false);

      let initialReviewerId: number | "" = "";
      if (reporterId && reporterId !== currentUserId) {
        initialReviewerId = reporterId;
      } else if (candidateUsers.length > 0) {
        initialReviewerId = candidateUsers[0].id;
      } else if (users.length > 0) {
        initialReviewerId = users[0].id;
      }
      setSelectedReviewerId(initialReviewerId);

      // 初期表示はメンションのみ（依頼文は自分で考えさせる）
      const reviewer = users.find((u) => u.id === initialReviewerId);
      const reviewerName = reviewer ? reviewer.name : "レビュアー";
      setComment(`@${reviewerName} `);
    }
  }, [isOpen, reporterId, currentUserId, candidateUsers, users]);

  // レビュアー切り替え時にメンション名を自動更新
  const handleReviewerChange = (newReviewerId: number) => {
    setSelectedReviewerId(newReviewerId);
    const prevReviewer = users.find((u) => u.id === selectedReviewerId);
    const newReviewer = users.find((u) => u.id === newReviewerId);

    if (newReviewer) {
      if (prevReviewer && comment.includes(`@${prevReviewer.name}`)) {
        setComment((prev) => prev.replace(`@${prevReviewer.name}`, `@${newReviewer.name}`));
      } else if (!comment.startsWith("@")) {
        setComment((prev) => `@${newReviewer.name} ${prev}`);
      }
    }
  };

  // メンションを除いた純粋な依頼メッセージ本文があるか判定
  const currentReviewer = users.find((u) => u.id === selectedReviewerId);
  const mentionPrefix = currentReviewer ? `@${currentReviewer.name}` : "";
  const bodyText = comment.replace(mentionPrefix, "").trim();
  const isFormValid = Boolean(selectedReviewerId && bodyText.length > 0 && !isSubmitting);

  // 送信ハンドラー
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReviewerId) {
      setErrorMessage("レビューをお願いする相手（レビュアー）を選択してください");
      return;
    }
    if (!bodyText) {
      setErrorMessage("相手に何を確認してほしいか、メッセージを入力してください（メンションのみは不可）");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await onSubmit({
        reviewerId: Number(selectedReviewerId),
        changeAssignee,
        comment: comment.trim(),
      });
      onClose();
    } catch (err: unknown) {
      setErrorMessage(getSafeErrorMessage(err, "送信に失敗しました"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ESCキーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden transform transition-all animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-request-modal-title"
      >
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3.5 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-white" />
            <h2 id="review-request-modal-title" className="text-sm font-bold tracking-tight">
              レビュー・確認を依頼（処理済み）
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* フォーム本文 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {/* 課題タイトル */}
          <div className="text-xs text-slate-500 font-medium">
            対象: <span className="font-bold text-slate-800">{issueKey}</span> {issueTitle}
          </div>

          {/* エラーメッセージ表示 */}
          {errorMessage && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* レビュアー選択 */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              誰に確認・レビューしてもらいますか？
            </label>
            <select
              value={selectedReviewerId}
              onChange={(e) => handleReviewerChange(Number(e.target.value))}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors font-medium cursor-pointer"
            >
              <option value="" disabled>
                -- レビュアーを選択 --
              </option>
              {candidateUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.role || "メンバー"}) {user.id === reporterId ? "★起票者" : ""}
                </option>
              ))}
              {candidateUsers.length === 0 &&
                users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.role || "メンバー"})
                  </option>
                ))}
            </select>

            {/* 担当者自動切り替えチェック */}
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer pt-0.5 select-none">
              <input
                type="checkbox"
                checked={changeAssignee}
                onChange={(e) => setChangeAssignee(e.target.checked)}
                disabled={isSubmitting}
                className="w-3.5 h-3.5 text-violet-600 rounded border-slate-300 focus:ring-violet-500 cursor-pointer"
              />
              <span>担当者をこの人に渡す（推奨）</span>
            </label>
          </div>

          {/* 依頼メッセージ入力欄 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                依頼メッセージ <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">
                ※ メンションに続けて要件を記入
              </span>
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isSubmitting}
              rows={3}
              placeholder="例: Stripe連携を実装しました。Webhookの疎通確認をお願いできますか？"
              className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors leading-relaxed resize-none"
            />
            {bodyText.length === 0 ? (
              <p className="text-[11px] text-amber-600 font-medium">
                相手に何を確認してほしいか、一言メッセージを入力してください
              </p>
            ) : (
              <p className="text-[11px] text-slate-400">
                相手に何を確認してほしいか、一言添えてバトンを渡しましょう
              </p>
            )}
          </div>

          {/* モーダルフッター */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!isFormValid}
              className="px-4 py-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  送信中...
                </>
              ) : (
                <>
                  <Rocket className="w-3.5 h-3.5" />
                  依頼して処理済みにする
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
