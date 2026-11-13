// 課題コメント件数バッジ ＆ 最新コメントホバープレビューコンポーネント
"use client";

import React, { useState, useRef } from "react";
import { MessageSquare, ArrowRight } from "lucide-react";
import { getUserInitials } from "./UserManageModal";
import { useUser } from "./UserContext";
import { formatTimestamp } from "@/lib/dateUtils";

interface CommentPreviewBadgeProps {
  commentCount?: number;
  latestCommentContent?: string | null;
  latestCommentCreatedAt?: string | null;
  latestCommentUserName?: string | null;
  latestCommentUserColor?: string | null;
  onClick?: (e: React.MouseEvent) => void;
  /** 配置位置（"top" = 上部に吹き出し, "bottom" = 下部に吹き出し） デフォルト "top" */
  placement?: "top" | "bottom";
}

export default function CommentPreviewBadge({
  commentCount = 0,
  latestCommentContent,
  latestCommentCreatedAt,
  latestCommentUserName,
  latestCommentUserColor,
  onClick,
  placement = "top",
}: CommentPreviewBadgeProps) {
  const { settings } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // コメントが0件の場合は何も表示しない
  if (!commentCount || commentCount <= 0) {
    return null;
  }

  // ホバー開始（微小な遅延で意図しないチラつきを防止）
  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, 120);
  };

  // ホバー終了
  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  // フォーマット済みの日時
  const formattedDate = latestCommentCreatedAt
    ? formatTimestamp(latestCommentCreatedAt, settings)
    : "";

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* コメント件数バッジ本体 */}
      <button
        type="button"
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick(e);
          }
        }}
        title={`コメント ${commentCount} 件（ホバーで最新プレビュー）`}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200/90 hover:border-indigo-300 transition-colors shadow-2xs cursor-pointer select-none"
      >
        <MessageSquare className="w-3 h-3 text-slate-400 group-hover:text-indigo-500" />
        <span>{commentCount}</span>
      </button>

      {/* ホバーポップオーバー（最新コメントのプレビュー） */}
      {isOpen && (
        <div
          role="tooltip"
          onClick={(e) => {
            if (onClick) {
              e.stopPropagation();
              onClick(e);
            }
          }}
          className={`absolute z-50 w-72 sm:w-80 p-3 bg-white rounded-xl shadow-xl border border-slate-200 text-left transition-all duration-150 animate-in fade-in zoom-in-95 cursor-pointer ${
            placement === "bottom"
              ? "top-full mt-2 left-0 sm:left-auto"
              : "bottom-full mb-2 left-0 sm:left-auto"
          }`}
        >
          {/* 吹き出しの三角矢印 */}
          <div
            className={`absolute left-3 w-2.5 h-2.5 bg-white border-slate-200 transform rotate-45 ${
              placement === "bottom"
                ? "-top-1.5 border-t border-l"
                : "-bottom-1.5 border-b border-r"
            }`}
          />

          {/* ヘッダー: 「最新コメント」と「全N件」 */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
              最新コメント
            </span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
              全 {commentCount} 件
            </span>
          </div>

          {/* 投稿者情報 ＆ 投稿日時 */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                style={{
                  backgroundColor: latestCommentUserColor || "#64748b",
                }}
                className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[9px] font-bold shrink-0 shadow-2xs"
              >
                {getUserInitials(latestCommentUserName || "匿名")}
              </div>
              <span className="text-xs font-semibold text-slate-800 truncate">
                {latestCommentUserName || "メンバー"}
              </span>
            </div>
            {formattedDate && (
              <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                {formattedDate}
              </span>
            )}
          </div>

          {/* 最新コメント本文プレビュー */}
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-xs text-slate-700 line-clamp-4 whitespace-pre-wrap break-words leading-relaxed">
            {latestCommentContent || "（コメント内容なし）"}
          </div>

          {/* フッター: 詳細への誘導ガイド */}
          <div className="flex items-center justify-end gap-1 mt-2 pt-1.5 text-[10px] text-indigo-600 font-medium">
            <span>クリックで詳細を開く</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      )}
    </div>
  );
}
