// 子課題の期限日が親課題の期限日を超える場合の警告・連動延長確認モーダル
"use client";

import React, { useEffect } from "react";
import { AlertTriangle, Calendar, ArrowRight, X } from "lucide-react";
import { formatDueDateDisplay } from "@/lib/dateUtils";

export interface ParentDueDateWarningInfo {
  parentIssueKey?: string | null;
  parentTitle?: string | null;
  parentDueDate: string;
  newChildDueDate: string;
  childIssueKey?: string | null;
}

interface ParentDueDateConfirmModalProps {
  info: ParentDueDateWarningInfo | null;
  isSubmitting?: boolean;
  childOnlyLabel?: string;
  onExtendBoth: () => void;
  onChildOnly: () => void;
  onCancel: () => void;
}

/**
 * 子課題の新しい期限日が親課題の期限日を超過しているか判定する
 */
export function isExceedingParentDueDate(
  parentDueDate: string | null | undefined,
  nextChildDueDate: string | null | undefined
): boolean {
  if (!parentDueDate || !nextChildDueDate) return false;
  return nextChildDueDate > parentDueDate;
}

export default function ParentDueDateConfirmModal({
  info,
  isSubmitting = false,
  childOnlyLabel = "子課題のみ更新する",
  onExtendBoth,
  onChildOnly,
  onCancel,
}: ParentDueDateConfirmModalProps) {
  // ESCキーでキャンセル
  useEffect(() => {
    if (!info) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [info, isSubmitting, onCancel]);

  if (!info) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn"
      onClick={() => {
        if (!isSubmitting) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="parent-due-confirm-title"
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-amber-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 bg-amber-50/90 border-b border-amber-200/80">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-100 text-amber-700 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="parent-due-confirm-title"
                className="text-base font-bold text-slate-900"
              >
                親課題の期限日も延長しますか？
              </h3>
              <p className="text-xs text-amber-800 mt-0.5">
                子課題の期限日が親課題の期限日を超えています
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors disabled:opacity-50"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 本文 */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">
            {info.childIssueKey ? (
              <>
                子課題 <span className="font-mono font-semibold text-slate-900">[{info.childIssueKey}]</span>{" "}
                の期限日（<span className="font-semibold text-slate-900">{formatDueDateDisplay(info.newChildDueDate)}</span>）が、親課題の期限日を超えています。
              </>
            ) : (
              <>
                設定しようとしている子課題の期限日（<span className="font-semibold text-slate-900">{formatDueDateDisplay(info.newChildDueDate)}</span>）が、親課題の期限日を超えています。
              </>
            )}
            親課題の期限日も合わせて延長しますか？
          </p>

          {/* 親課題の期限比較ボックス */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
            <div className="text-xs font-medium text-slate-500">
              対象の親課題
            </div>
            <div className="text-sm font-semibold text-slate-800 truncate">
              {info.parentIssueKey && (
                <span className="font-mono text-xs px-1.5 py-0.5 mr-1.5 rounded bg-slate-200/80 text-slate-700">
                  {info.parentIssueKey}
                </span>
              )}
              {info.parentTitle || "親課題"}
            </div>
            <div className="flex items-center gap-2 pt-1 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-600 font-mono">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {formatDueDateDisplay(info.parentDueDate)}
              </span>
              <ArrowRight className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100/80 border border-amber-300 text-amber-900 font-mono font-semibold">
                <Calendar className="w-3.5 h-3.5 text-amber-700" />
                {formatDueDateDisplay(info.newChildDueDate)}
              </span>
            </div>
          </div>
        </div>

        {/* フッター（アクションボタン） */}
        <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-200 flex flex-col gap-2">
          <button
            type="button"
            onClick={onExtendBoth}
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? "更新中..." : `親課題も ${info.newChildDueDate} に延長する`}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onChildOnly}
              disabled={isSubmitting}
              className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
            >
              {childOnlyLabel}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="py-2 px-4 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
