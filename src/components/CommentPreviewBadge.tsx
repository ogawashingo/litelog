// 課題コメント件数バッジ ＆ コメント履歴ホバープレビューコンポーネント（最前面ポータル表示＆全コメント閲覧対応）
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, ArrowRight, Loader2 } from "lucide-react";
import { getUserInitials } from "./UserManageModal";
import { useUser } from "./UserContext";
import { formatTimestamp } from "@/lib/dateUtils";
import { Comment } from "@/types";

interface CommentPreviewBadgeProps {
  /** 対象課題のID（指定されている場合はホバー時に全コメントを取得して一覧表示） */
  issueId?: number;
  commentCount?: number;
  latestCommentContent?: string | null;
  latestCommentCreatedAt?: string | null;
  latestCommentUserName?: string | null;
  latestCommentUserColor?: string | null;
  onClick?: (e: React.MouseEvent) => void;
  /** 配置優先位置（"top" = 上部に吹き出し, "bottom" = 下部に吹き出し） デフォルト "top" */
  placement?: "top" | "bottom";
}

export default function CommentPreviewBadge({
  issueId,
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
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    arrowLeft: number;
    placedBottom: boolean;
  } | null>(null);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // マウント状態の管理（SSRとポータルの安全な併用）
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // コメント全件の取得処理（キャッシュがあれば再取得しない）
  const fetchAllComments = useCallback(async () => {
    if (!issueId || comments !== null) return;
    try {
      setIsLoading(true);
      const res = await fetch(`/api/issues/${issueId}/comments`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setComments(data);
        }
      }
    } catch (err) {
      console.error("コメント取得エラー:", err);
    } finally {
      setIsLoading(false);
    }
  }, [issueId, comments]);

  // 画面位置（Viewport相対座標）の算出
  const updateCoordinates = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const tooltipWidth = 340; // 吹き出し幅（px）
    const tooltipEstimatedHeight = 260; // 吹き出し推定高さ

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // 配置方向の判定（基本は指定placementに従いつつ、画面外にはみ出る場合はスペースの広い方へ反転）
    let placedBottom = placement === "bottom";
    if (placedBottom && spaceBelow < tooltipEstimatedHeight && spaceAbove > spaceBelow) {
      placedBottom = false;
    } else if (!placedBottom && spaceAbove < tooltipEstimatedHeight && spaceBelow > spaceAbove) {
      placedBottom = true;
    }

    // 水平位置の調整（画面左右端からの安全マージン12px）
    const buttonCenter = rect.left + rect.width / 2;
    let left = buttonCenter - 32; // ボタン少し左から展開
    if (left + tooltipWidth > window.innerWidth - 12) {
      left = window.innerWidth - tooltipWidth - 12;
    }
    if (left < 12) {
      left = 12;
    }

    // 矢印（三角）の水平位置（ボタン中心に合わせる）
    const arrowLeft = Math.max(12, Math.min(tooltipWidth - 20, buttonCenter - left - 5));

    setCoords({
      top: placedBottom ? rect.bottom + 8 : rect.top - 8,
      left,
      arrowLeft,
      placedBottom,
    });
  }, [placement]);

  // ホバー開始（チラつき防止の微小遅延）
  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      updateCoordinates();
      setIsOpen(true);
      fetchAllComments();
    }, 120);
  };

  // ホバー終了（少し長めの猶予で吹き出し内へのマウス移動を許可）
  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 180);
  };

  // スクロールや画面リサイズ時の位置追従
  useEffect(() => {
    if (!isOpen) return;
    const handleScrollOrResize = () => {
      updateCoordinates();
    };
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, updateCoordinates]);

  // コメントが0件の場合は非表示
  if (!commentCount || commentCount <= 0) {
    return null;
  }

  // 表示するコメント一覧（取得済みコメント、またはフォールバックの最新コメント1件）
  const displayList: Array<{
    id: number | string;
    userName: string;
    userColor: string;
    createdAt: string;
    content: string;
  }> = comments && comments.length > 0
    ? comments.map((c) => ({
        id: c.id,
        userName: c.user_name || "メンバー",
        userColor: c.user_color || "#64748b",
        createdAt: c.created_at,
        content: c.content,
      }))
    : latestCommentContent
    ? [
        {
          id: "latest",
          userName: latestCommentUserName || "メンバー",
          userColor: latestCommentUserColor || "#64748b",
          createdAt: latestCommentCreatedAt || "",
          content: latestCommentContent,
        },
      ]
    : [];

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* コメント件数バッジ本体 */}
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick(e);
          }
        }}
        title={`コメント ${commentCount} 件（ホバーでコメント全体を表示）`}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200/90 hover:border-indigo-300 transition-colors shadow-2xs cursor-pointer select-none"
      >
        <MessageSquare className="w-3 h-3 text-slate-400 group-hover:text-indigo-500" />
        <span>{commentCount}</span>
      </button>

      {/* ホバーポップオーバー（最前面ポータル描画によりテーブルや親のoverflow境界で切れない） */}
      {isMounted &&
        isOpen &&
        coords &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => {
              if (onClick) {
                e.stopPropagation();
                onClick(e);
              }
            }}
            style={{
              position: "fixed",
              left: `${coords.left}px`,
              top: coords.placedBottom ? `${coords.top}px` : undefined,
              bottom: coords.placedBottom ? undefined : `${window.innerHeight - coords.top}px`,
              width: "340px",
              maxWidth: "calc(100vw - 24px)",
              zIndex: 9999,
            }}
            className="p-3 bg-white rounded-xl shadow-2xl border border-slate-200/95 text-left transition-all duration-150 animate-in fade-in zoom-in-95 cursor-pointer pointer-events-auto"
          >
            {/* 吹き出しの三角矢印 */}
            <div
              style={{ left: `${coords.arrowLeft}px` }}
              className={`absolute w-2.5 h-2.5 bg-white border-slate-200 transform rotate-45 pointer-events-none ${
                coords.placedBottom
                  ? "-top-1.5 border-t border-l"
                  : "-bottom-1.5 border-b border-r"
              }`}
            />

            {/* ヘッダー: 「コメント一覧」と件数バッジ */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 text-sm">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                コメント一覧
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                全 {commentCount} 件
              </span>
            </div>

            {/* コメントリスト（スクロール可能領域） */}
            <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1 text-xs">
              {isLoading && displayList.length === 0 ? (
                <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  <span className="text-xs">コメント読み込み中...</span>
                </div>
              ) : displayList.length === 0 ? (
                <div className="py-4 text-center text-slate-400 text-xs">
                  コメントはありません
                </div>
              ) : (
                displayList.map((item, idx) => {
                  const formattedDate = item.createdAt
                    ? formatTimestamp(item.createdAt, settings)
                    : "";
                  return (
                    <div
                      key={item.id}
                      className="rounded-lg bg-slate-50/90 border border-slate-200/70 p-2.5 hover:bg-slate-50 transition-colors"
                    >
                      {/* 投稿者情報 ＆ 投稿日時 */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div
                            style={{ backgroundColor: item.userColor }}
                            className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[9px] font-bold shrink-0 shadow-2xs"
                          >
                            {getUserInitials(item.userName)}
                          </div>
                          <span className="text-xs font-semibold text-slate-800 truncate">
                            {item.userName}
                          </span>
                        </div>
                        {formattedDate && (
                          <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                            #{idx + 1} · {formattedDate}
                          </span>
                        )}
                      </div>

                      {/* コメント本文（全文表示・折り返し対応） */}
                      <div className="text-xs text-slate-700 whitespace-pre-wrap break-words leading-relaxed pl-0.5">
                        {item.content || "（コメント内容なし）"}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* フッター: 詳細への誘導ガイド */}
            <div className="flex items-center justify-end pt-2 mt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-1 text-indigo-600 font-medium hover:underline">
                <span>クリックで詳細を開く</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
