// アプリ共通のトースト通知コンポーネント（「元に戻す」アクション対応）
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, RotateCcw, Loader2 } from "lucide-react";
import { TOAST_EVENT, ToastOptions } from "@/lib/clientEvents";

interface ToastItem extends ToastOptions {
  id: string;
  isLeaving?: boolean;
}

export default function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  // トースト削除ハンドラー
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // アニメーション付きで閉じる
  const dismissToast = useCallback(
    (id: string) => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isLeaving: true } : t))
      );
      setTimeout(() => {
        removeToast(id);
      }, 250);
    },
    [removeToast]
  );

  // カスタムイベントのリッスン
  useEffect(() => {
    const handleShowToast = (event: Event) => {
      const customEvent = event as CustomEvent<ToastOptions>;
      if (!customEvent.detail) return;

      const newId = customEvent.detail.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = customEvent.detail.duration ?? 6000;

      const newItem: ToastItem = {
        ...customEvent.detail,
        id: newId,
        type: customEvent.detail.type || "success",
      };

      setToasts((prev) => {
        // 重複IDがあれば置き換え、なければ末尾に追加（最大3件まで表示）
        const filtered = prev.filter((t) => t.id !== newId);
        return [...filtered, newItem].slice(-3);
      });

      // 自動消去タイマー
      if (duration > 0) {
        setTimeout(() => {
          dismissToast(newId);
        }, duration);
      }
    };

    window.addEventListener(TOAST_EVENT, handleShowToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, handleShowToast);
    };
  }, [dismissToast]);

  // アクションボタン押下ハンドラー
  const handleAction = async (toast: ToastItem) => {
    if (!toast.action || loadingActionId) return;
    setLoadingActionId(toast.id);
    try {
      await toast.action.onClick();
      dismissToast(toast.id);
    } catch (err) {
      console.error("トーストアクション実行エラー:", err);
    } finally {
      setLoadingActionId(null);
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const isActionLoading = loadingActionId === toast.id;

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-xl border bg-slate-900/95 text-white border-slate-700/80 backdrop-blur-md transition-all duration-200 transform ${
              toast.isLeaving
                ? "opacity-0 translate-y-3 scale-95"
                : "opacity-100 translate-y-0 scale-100 animate-slideUp"
            }`}
          >
            {/* ステータスアイコン */}
            <div className="shrink-0 mt-0.5">
              {toast.type === "success" && (
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
              {toast.type === "error" && (
                <div className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4" />
                </div>
              )}
              {toast.type === "warning" && (
                <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              )}
              {toast.type === "info" && (
                <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center">
                  <Info className="w-4 h-4" />
                </div>
              )}
            </div>

            {/* 本文 */}
            <div className="flex-1 min-w-0 pr-1">
              <p className="text-xs font-semibold text-slate-100 leading-snug break-words">
                {toast.message}
              </p>
              {toast.subMessage && (
                <p className="text-[11px] text-slate-400 mt-0.5 break-words">
                  {toast.subMessage}
                </p>
              )}
            </div>

            {/* アクションボタン（「元に戻す」等） */}
            {toast.action && (
              <button
                type="button"
                onClick={() => handleAction(toast)}
                disabled={isActionLoading}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 active:bg-emerald-500/40 text-emerald-300 border border-emerald-500/40 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isActionLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RotateCcw className="w-3 h-3" />
                )}
                <span>{toast.action.label}</span>
              </button>
            )}

            {/* 閉じるボタン */}
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="閉じる"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
