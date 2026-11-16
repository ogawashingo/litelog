// 課題を「処理済み」に変更する際の「レビュー・確認依頼」必須モーダルコンポーネント
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Rocket,
  X,
  UserCheck,
  Code2,
  TestTube2,
  ClipboardCheck,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { User } from "@/types";

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

type TemplateType = "code" | "qa" | "general";

export default function ReviewRequestModal({
  isOpen,
  issueKey,
  issueTitle,
  reporterId,
  currentAssigneeId,
  users,
  currentUserId,
  onClose,
  onSubmit,
}: ReviewRequestModalProps) {
  // レビュアー選択State
  const [selectedReviewerId, setSelectedReviewerId] = useState<number | "">("");
  const [changeAssignee, setChangeAssignee] = useState(true);
  const [templateType, setTemplateType] = useState<TemplateType>("code");
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

      // 初期テンプレートを生成
      const reviewer = users.find((u) => u.id === initialReviewerId);
      const reviewerName = reviewer ? reviewer.name : "レビュアー";
      generateTemplate("code", reviewerName);
    }
  }, [isOpen, reporterId, currentUserId, candidateUsers, users]);

  // テンプレート本文を生成
  const generateTemplate = (type: TemplateType, reviewerName: string) => {
    setTemplateType(type);
    let templateText = "";
    if (type === "code") {
      templateText = `@${reviewerName}
実装作業が完了しましたので、コードレビューをお願いいたします！

【確認・レビューしてほしいポイント】
・

【PRリンク / ブランチ / 変更差分】
・

【動作確認手順・結果】
・`;
    } else if (type === "qa") {
      templateText = `@${reviewerName}
機能実装および検証環境への反映が完了しました。受入テスト・動作検証をお願いいたします！

【検証環境URL】
・

【テスト観点・確認項目】
・`;
    } else {
      templateText = `@${reviewerName}
担当作業が完了しましたので、内容をご確認いただけますでしょうか。

【作業概要・対応内容】
・

【確認事項】
・`;
    }
    setComment(templateText);
  };

  // レビュアー切り替え時にメンション名を自動更新
  const handleReviewerChange = (newReviewerId: number) => {
    setSelectedReviewerId(newReviewerId);
    const prevReviewer = users.find((u) => u.id === selectedReviewerId);
    const newReviewer = users.find((u) => u.id === newReviewerId);

    if (newReviewer) {
      if (prevReviewer && comment.includes(`@${prevReviewer.name}`)) {
        setComment((prev) => prev.replace(`@${prevReviewer.name}`, `@${newReviewer.name}`));
      } else if (!comment.startsWith("@")) {
        setComment((prev) => `@${newReviewer.name}\n${prev}`);
      }
    }
  };

  // テンプレートボタン切り替え
  const handleTemplateSwitch = (type: TemplateType) => {
    const reviewer = users.find((u) => u.id === selectedReviewerId);
    const reviewerName = reviewer ? reviewer.name : "レビュアー";
    generateTemplate(type, reviewerName);
  };

  // 送信ハンドラー
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReviewerId) {
      setErrorMessage("レビューをお願いする相手（レビュアー）を選択してください");
      return;
    }
    if (!comment.trim()) {
      setErrorMessage("レビュー依頼メッセージを入力してください（空送信はできません）");
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
      setErrorMessage(err instanceof Error ? err.message : "レビュー依頼の送信に失敗しました");
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

  const isFormValid = Boolean(selectedReviewerId && comment.trim() && !isSubmitting);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden transform transition-all animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-request-modal-title"
      >
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-6 py-4 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/15 rounded-xl backdrop-blur-xs">
              <Rocket className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <h2 id="review-request-modal-title" className="text-base font-bold tracking-tight">
                レビュー・確認依頼（ステータス: 処理済み）
              </h2>
              <p className="text-xs text-violet-100 font-medium">
                {issueKey} : {issueTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* フォーム本文 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* ガイドメッセージ */}
          <div className="p-3 bg-violet-50/70 border border-violet-200 rounded-xl flex items-start gap-2.5 text-xs text-violet-900 leading-relaxed">
            <UserCheck className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">作業完了お疲れ様でした！</span>  
              ステータスを「処理済み」にするには、確認者への引き継ぎメッセージ（メンション）の送信が必須です。「こっそり処理済みにして放置」を防ぎ、確実にバトンを渡しましょう。
            </div>
          </div>

          {/* エラーメッセージ表示 */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* レビュアー選択 ＆ 担当者変更チェック */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              確認者（レビュアー）の指定 <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <select
                value={selectedReviewerId}
                onChange={(e) => handleReviewerChange(Number(e.target.value))}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors font-medium cursor-pointer"
              >
                <option value="" disabled>
                  -- レビュアーを選択してください --
                </option>
                {candidateUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.role || "メンバー"}) {user.id === reporterId ? "★起票者" : ""}
                  </option>
                ))}
                {/* 自分が候補外になったが他に誰もいない場合のフォールバック */}
                {candidateUsers.length === 0 &&
                  users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role || "メンバー"})
                    </option>
                  ))}
              </select>
            </div>

            {/* 担当者自動切り替えチェックボックス */}
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1 select-none">
              <input
                type="checkbox"
                checked={changeAssignee}
                onChange={(e) => setChangeAssignee(e.target.checked)}
                disabled={isSubmitting}
                className="w-4 h-4 text-violet-600 rounded-md border-slate-300 focus:ring-violet-500 cursor-pointer"
              />
              <span>
                課題の担当者をこのレビュアーに変更する（
                <span className="text-violet-700 font-semibold">推奨：レビュアーの未処理一覧に表示されます</span>
                ）
              </span>
            </label>
          </div>

          {/* 依頼内容・テンプレート切り替え */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                レビュー依頼メッセージ <span className="text-rose-500">*</span>
              </label>
              {/* テンプレート切り替えボタン群 */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-400 mr-1 hidden sm:inline">テンプレート:</span>
                <button
                  type="button"
                  onClick={() => handleTemplateSwitch("code")}
                  disabled={isSubmitting}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                    templateType === "code"
                      ? "bg-violet-100 text-violet-700 border border-violet-300 font-bold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Code2 className="w-3 h-3" />
                  コード
                </button>
                <button
                  type="button"
                  onClick={() => handleTemplateSwitch("qa")}
                  disabled={isSubmitting}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                    templateType === "qa"
                      ? "bg-violet-100 text-violet-700 border border-violet-300 font-bold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <TestTube2 className="w-3 h-3" />
                  QA・受入
                </button>
                <button
                  type="button"
                  onClick={() => handleTemplateSwitch("general")}
                  disabled={isSubmitting}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                    templateType === "general"
                      ? "bg-violet-100 text-violet-700 border border-violet-300 font-bold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <ClipboardCheck className="w-3 h-3" />
                  一般確認
                </button>
              </div>
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isSubmitting}
              rows={7}
              placeholder="レビューを依頼する内容や確認観点、URLを入力してください"
              className="w-full px-3 py-2 text-xs sm:text-sm font-mono bg-white border border-slate-300 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors leading-relaxed"
            />
            <p className="text-[11px] text-slate-400 text-right">
              ※ 空文字のままステータスを変更することはできません
            </p>
          </div>

          {/* モーダルフッター */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!isFormValid}
              className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  送信中...
                </>
              ) : (
                <>
                  <Rocket className="w-3.5 h-3.5" />
                  レビューを依頼して処理済みにする
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
