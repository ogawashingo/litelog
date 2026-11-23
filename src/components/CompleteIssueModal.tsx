// 課題完了時の「完了理由選択」ダイアログモーダルコンポーネント
"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle2, X, Ban, Copy, HelpCircle, Check, ArrowRight, Sparkles } from "lucide-react";
import { IssueResolution } from "@/types";

interface CompleteIssueModalProps {
  isOpen: boolean;
  issueKey: string;
  issueTitle: string;
  onClose: () => void;
  onConfirm: (resolution: IssueResolution | null) => void | Promise<void>;
}

// 完了理由ごとの設定（アイコン・説明文・ボタンスタイル）
const RESOLUTION_BUTTONS: {
  resolution: IssueResolution;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isRecommended?: boolean;
  badgeClass: string;
  cardClass: string;
}[] = [
  {
    resolution: "fixed",
    label: "対応済み",
    description: "通常の作業・改修・実装が完了した場合",
    icon: CheckCircle2,
    isRecommended: true,
    badgeClass: "bg-emerald-600 text-white shadow-xs",
    cardClass:
      "border-emerald-300/80 bg-gradient-to-r from-emerald-50/80 via-emerald-50/40 to-white hover:from-emerald-100/90 hover:to-emerald-50 hover:border-emerald-500 hover:shadow-md text-emerald-950 btn-shimmer",
  },
  {
    resolution: "wont_fix",
    label: "対応しない",
    description: "仕様変更・方針転換・優先度見送りなどで対応しない場合",
    icon: Ban,
    badgeClass: "bg-stone-100 text-stone-700 border-stone-300",
    cardClass:
      "border-slate-200 bg-white hover:bg-stone-50/80 hover:border-stone-400 hover:shadow-sm text-stone-900",
  },
  {
    resolution: "invalid",
    label: "無効",
    description: "誤登録や機能対象外、不要になった場合",
    icon: X,
    badgeClass: "bg-zinc-100 text-zinc-700 border-zinc-300",
    cardClass:
      "border-slate-200 bg-white hover:bg-zinc-50/80 hover:border-zinc-400 hover:shadow-sm text-zinc-900",
  },
  {
    resolution: "duplicated",
    label: "重複",
    description: "既に存在する別の課題と同一・重複している場合",
    icon: Copy,
    badgeClass: "bg-indigo-100 text-indigo-700 border-indigo-300",
    cardClass:
      "border-slate-200 bg-white hover:bg-indigo-50/80 hover:border-indigo-400 hover:shadow-sm text-indigo-950",
  },
  {
    resolution: "cannot_reproduce",
    label: "再現しない",
    description: "報告された不具合や事象が再現せずクローズする場合",
    icon: HelpCircle,
    badgeClass: "bg-amber-100 text-amber-800 border-amber-300",
    cardClass:
      "border-slate-200 bg-white hover:bg-amber-50/80 hover:border-amber-400 hover:shadow-sm text-amber-950",
  },
];

export default function CompleteIssueModal({
  isOpen,
  issueKey,
  issueTitle,
  onClose,
  onConfirm,
}: CompleteIssueModalProps) {
  // 選択中の完了理由（押下時のサクセス確定演出用）
  const [selectedResolution, setSelectedResolution] = useState<IssueResolution | null | "none">(null);

  // ESCキー押下で閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedResolution === null) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, selectedResolution]);

  // モーダルオープン時に選択ステートをリセット
  useEffect(() => {
    if (isOpen) {
      setSelectedResolution(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 理由選択時のハンドラー（一瞬サクセス変化させてから完了実行）
  const handleSelect = async (res: IssueResolution | null) => {
    if (selectedResolution !== null) return;
    setSelectedResolution(res === null ? "none" : res);
    await new Promise((resolve) => setTimeout(resolve, 380));
    await onConfirm(res);
    setSelectedResolution(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn"
      onClick={() => {
        if (selectedResolution === null) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden transform transition-all animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-issue-modal-title"
      >
        {/* ヘッダー */}
        <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50/60 via-white to-slate-50/50 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Check className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 id="complete-issue-modal-title" className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span>課題を完了にする</span>
                <span className="text-xs font-normal text-emerald-700 bg-emerald-100/70 border border-emerald-200/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>理由を選択</span>
                </span>
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 truncate max-w-[340px]">
                <span className="font-mono font-bold text-indigo-600">{issueKey}</span>
                <span className="truncate">{issueTitle}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={selectedResolution !== null}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 完了理由選択ボタン一覧 */}
        <div className="p-5 space-y-2.5">
          <p className="text-xs font-semibold text-slate-600 mb-1 flex items-center justify-between">
            <span>完了理由を選択してください:</span>
            <span className="text-[11px] text-slate-400 font-normal">クリックして確定</span>
          </p>

          <div className="space-y-2">
            {RESOLUTION_BUTTONS.map((btn) => {
              const Icon = btn.icon;
              const isSelected = selectedResolution === btn.resolution;
              const isOtherSelected = selectedResolution !== null && !isSelected;

              return (
                <button
                  key={btn.resolution}
                  type="button"
                  disabled={selectedResolution !== null}
                  onClick={() => handleSelect(btn.resolution)}
                  className={`w-full text-left p-3 rounded-xl border spring-bounce transition-all cursor-pointer flex items-center justify-between group focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50 ${
                    isSelected
                      ? "bg-emerald-600 border-emerald-600 text-white shadow-md scale-[0.98]"
                      : isOtherSelected
                      ? "opacity-40 cursor-not-allowed"
                      : `${btn.cardClass} hover:-translate-y-0.5`
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border shrink-0 transition-transform ${
                        isSelected
                          ? "bg-white text-emerald-700 border-white"
                          : `${btn.badgeClass} group-hover:scale-105`
                      }`}
                    >
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 stroke-[3] animate-check-pop" />
                      ) : (
                        <Icon className="w-3.5 h-3.5" />
                      )}
                      <span>{btn.label}</span>
                    </span>

                    <span
                      className={`text-xs truncate transition-colors ${
                        isSelected ? "text-emerald-50 font-medium" : "text-slate-600"
                      }`}
                    >
                      {btn.description}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {btn.isRecommended && !isSelected && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-300/80 px-1.5 py-0.5 rounded-full shrink-0">
                        推奨
                      </span>
                    )}
                    {isSelected ? (
                      <span className="text-xs font-bold text-white flex items-center gap-1 animate-check-pop">
                        <span>完了！</span>
                      </span>
                    ) : (
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-700 group-hover:translate-x-1 transition-all" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* フッター */}
        <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs">
          <button
            type="button"
            disabled={selectedResolution !== null}
            onClick={() => handleSelect(null)}
            className={`text-slate-500 hover:text-slate-800 underline underline-offset-2 transition-colors cursor-pointer ${
              selectedResolution === "none" ? "font-bold text-emerald-600" : ""
            }`}
          >
            {selectedResolution === "none" ? "✓ 理由なしで完了中..." : "理由を指定せずに完了にする"}
          </button>
          <button
            type="button"
            disabled={selectedResolution !== null}
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
