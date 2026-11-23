// コメント用スタンプ（リアクション）表示・追加バーコンポーネント
"use client";

import React, { useState, useRef, useEffect } from "react";
import { SmilePlus } from "lucide-react";
import {
  COMMENT_STAMP_OPTIONS,
  CommentReaction,
  CommentStamp,
} from "@/types";

// 楽観的UI更新用の一時リアクションID（実データと衝突しないよう負の連番で採番）
let optimisticReactionIdSeq = 0;
const nextOptimisticReactionId = (): number => {
  optimisticReactionIdSeq += 1;
  return -optimisticReactionIdSeq;
};

interface CommentReactionBarProps {
  issueId: number;
  commentId: number;
  reactions: CommentReaction[];
  currentUserId: number | null;
  currentUserName?: string | null;
  currentUserColor?: string | null;
  className?: string;
  disabled?: boolean;
  onReactionsUpdated: (commentId: number, nextReactions: CommentReaction[]) => void;
}

export default function CommentReactionBar({
  issueId,
  commentId,
  reactions = [],
  currentUserId,
  currentUserName,
  currentUserColor,
  className = "pl-6",
  disabled = false,
  onReactionsUpdated,
}: CommentReactionBarProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [togglingStamp, setTogglingStamp] = useState<CommentStamp | null>(null);
  const [lastPoppedStamp, setLastPoppedStamp] = useState<CommentStamp | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // ポップオーバー外側クリックで閉じる
  useEffect(() => {
    if (!isPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isPickerOpen]);

  // スタンプ種別ごとにリアクションを集計
  const groupedReactions = COMMENT_STAMP_OPTIONS.map((opt) => {
    const matched = reactions.filter((r) => r.stamp === opt.stamp);
    const hasReacted = Boolean(
      currentUserId && matched.some((r) => Number(r.user_id) === Number(currentUserId))
    );
    const userNames = matched.map((r) => r.user_name || "メンバー");
    return {
      ...opt,
      items: matched,
      count: matched.length,
      hasReacted,
      userNames,
    };
  }).filter((g) => g.count > 0);

  // 自分が既に押しているスタンプのセット（ピッカー内のハイライト用）
  const myReactedStamps = new Set<CommentStamp>(
    reactions
      .filter((r) => currentUserId && Number(r.user_id) === Number(currentUserId))
      .map((r) => r.stamp)
  );

  // スタンプのトグル処理（楽観的UI更新＋API通信）
  const handleToggleStamp = async (stamp: CommentStamp) => {
    if (!currentUserId || togglingStamp) return;

    setIsPickerOpen(false);
    setTogglingStamp(stamp);

    const prevReactions = [...reactions];
    const alreadyExists = prevReactions.some(
      (r) => Number(r.user_id) === Number(currentUserId) && r.stamp === stamp
    );

    // 楽観的UI更新
    if (!alreadyExists) {
      setLastPoppedStamp(stamp);
      setTimeout(() => setLastPoppedStamp(null), 600);
    }
    const optimisticReactions: CommentReaction[] = alreadyExists
      ? prevReactions.filter(
          (r) => !(Number(r.user_id) === Number(currentUserId) && r.stamp === stamp)
        )
      : [
          ...prevReactions,
          {
            id: nextOptimisticReactionId(),
            comment_id: commentId,
            user_id: currentUserId,
            user_name: currentUserName || "自分",
            user_color: currentUserColor || "#4f46e5",
            stamp,
            created_at: new Date().toISOString(),
          },
        ];

    onReactionsUpdated(commentId, optimisticReactions);

    try {
      const res = await fetch(
        `/api/issues/${issueId}/comments/${commentId}/reactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stamp }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.reactions)) {
          onReactionsUpdated(commentId, data.reactions);
        }
      } else {
        // エラー時はロールバック
        onReactionsUpdated(commentId, prevReactions);
      }
    } catch (err) {
      console.error("スタンプ通信エラー:", err);
      onReactionsUpdated(commentId, prevReactions);
    } finally {
      setTogglingStamp(null);
    }
  };

  return (
    <div className={`pt-1 flex items-center flex-wrap gap-1.5 ${className}`}>
      {/* 押されているスタンプバッジ一覧 */}
      {groupedReactions.map((group) => {
        const tooltipText = `${group.stamp} ${group.userNames.join("、")}`;
        const isJustPopped = lastPoppedStamp === group.stamp;
        return (
          <div key={group.stamp} className="relative group/badge">
            <button
              type="button"
              disabled={disabled || !currentUserId || togglingStamp === group.stamp}
              onClick={() => handleToggleStamp(group.stamp)}
              title={tooltipText}
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border transition-all select-none spring-bounce ${
                disabled ? "cursor-default opacity-85" : "cursor-pointer hover:scale-105 hover:shadow-2xs active:scale-95"
              } ${
                group.hasReacted
                  ? "bg-indigo-50/90 border-indigo-300 text-indigo-700 font-bold shadow-2xs"
                  : "bg-white border-slate-200/90 text-slate-600 font-medium hover:bg-slate-100 hover:border-slate-300"
              }`}
            >
              <span className={`text-sm leading-none transition-transform ${isJustPopped ? "animate-stamp-pop inline-block" : ""}`}>
                {group.stamp}
              </span>
              <span className={`text-[11px] leading-none transition-transform ${isJustPopped ? "scale-125 font-bold" : ""}`}>
                {group.count}
              </span>
            </button>

            {/* ホバー時のカスタムツールチップ（誰が押したかを表示） */}
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/badge:flex flex-col items-center z-30 w-max max-w-[240px]">
              <div className="bg-slate-900/95 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-lg leading-snug text-center">
                <div className="font-bold text-indigo-200 mb-0.5">
                  {group.stamp}
                </div>
                <div className="text-white/95 break-words">
                  {group.userNames.join("、")}
                </div>
              </div>
              <div className="w-2 h-2 bg-slate-900/95 rotate-45 -mt-1" />
            </div>
          </div>
        );
      })}

      {/* スタンプ追加ボタン＆ポップオーバー */}
      {!disabled && currentUserId && (
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setIsPickerOpen((prev) => !prev)}
            className={`inline-flex items-center justify-center p-1 rounded-full border transition-all cursor-pointer select-none spring-bounce ${
              isPickerOpen
                ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold scale-110"
                : "bg-white/80 border-slate-200/80 text-slate-400 hover:text-slate-700 hover:bg-white hover:border-slate-300 hover:scale-110"
            }`}
            title="リアクションを追加"
          >
            <SmilePlus className="w-3.5 h-3.5" />
          </button>

          {isPickerOpen && (
            <div className="absolute left-0 bottom-full mb-1.5 z-40 bg-white border border-slate-200 rounded-xl shadow-xl p-1 flex items-center gap-1 animate-in fade-in zoom-in-95 duration-100">
              {COMMENT_STAMP_OPTIONS.map((opt) => {
                const isSelected = myReactedStamps.has(opt.stamp);
                return (
                  <button
                    key={opt.stamp}
                    type="button"
                    onClick={() => handleToggleStamp(opt.stamp)}
                    title={opt.label}
                    className={`flex items-center justify-center w-8 h-8 rounded-lg text-lg transition-all cursor-pointer spring-bounce ${
                      isSelected
                        ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300 scale-110"
                        : "hover:bg-slate-100 hover:scale-125 active:scale-90"
                    }`}
                  >
                    <span>{opt.stamp}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
