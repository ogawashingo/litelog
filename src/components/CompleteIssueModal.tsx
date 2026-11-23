// 課題完了時の「完了理由選択」ダイアログモーダルコンポーネント
"use client";

import React, { useEffect } from "react";
import { CheckCircle2, X, Ban, Copy, HelpCircle, Check, ArrowRight } from "lucide-react";
import { IssueResolution, RESOLUTION_LABELS } from "@/types";
import { fireConfetti } from "@/lib/confetti";

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
  badgeClass: string;
  buttonClass: string;
}[] = [
  {
    resolution: "fixed",
    label: "対応済み",
    description: "通常の作業・改修・実装が完了した場合（推奨）",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
    buttonClass: "border-emerald-300 bg-emerald-50/60 hover:bg-emerald-100/90 text-emerald-950 focus:ring-emerald-500",
  },
  {
    resolution: "wont_fix",
    label: "対応しない",
    description: "仕様変更・方針転換・優先度見送りなどで対応しない場合",
    icon: Ban,
    badgeClass: "bg-stone-100 text-stone-700 border-stone-300",
    buttonClass: "border-stone-300 bg-stone-50/60 hover:bg-stone-100/90 text-stone-900 focus:ring-stone-500",
  },
  {
    resolution: "invalid",
    label: "無効",
    description: "誤登録や機能対象外、不要になった場合",
    icon: X,
    badgeClass: "bg-zinc-200 text-zinc-700 border-zinc-300",
    buttonClass: "border-zinc-300 bg-zinc-50/60 hover:bg-zinc-100/90 text-zinc-900 focus:ring-zinc-500",
  },
  {
    resolution: "duplicated",
    label: "重複",
    description: "既に存在する別の課題と同一・重複している場合",
    icon: Copy,
    badgeClass: "bg-indigo-100 text-indigo-700 border-indigo-300",
    buttonClass: "border-indigo-300 bg-indigo-50/60 hover:bg-indigo-100/90 text-indigo-950 focus:ring-indigo-500",
  },
  {
    resolution: "cannot_reproduce",
    label: "再現しない",
    description: "報告された不具合や事象が再現せずクローズする場合",
    icon: HelpCircle,
    badgeClass: "bg-amber-100 text-amber-800 border-amber-300",
    buttonClass: "border-amber-300 bg-amber-50/60 hover:bg-amber-100/90 text-amber-950 focus:ring-amber-500",
  },
];

export default function CompleteIssueModal({
  isOpen,
  issueKey,
  issueTitle,
  onClose,
  onConfirm,
}: CompleteIssueModalProps) {
  // ESCキー押下で閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
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
              <h3 id="complete-issue-modal-title" className="text-base font-bold text-slate-800">
                課題を完了にする
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
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 完了理由選択ボタン一覧 */}
        <div className="p-5 space-y-2.5">
          <p className="text-xs font-semibold text-slate-600 mb-1">
            完了理由を選択してください（ボタンをクリックすると完了になります）:
          </p>

          <div className="space-y-2">
            {RESOLUTION_BUTTONS.map((btn) => {
              const Icon = btn.icon;
              return (
                <button
                  key={btn.resolution}
                  type="button"
                  onClick={(e) => {
                    fireConfetti(e.clientX, e.clientY);
                    onConfirm(btn.resolution);
                  }}
                  className={`w-full text-left p-3 rounded-xl border spring-bounce transition-all cursor-pointer flex items-center justify-between group focus:outline-hidden focus:ring-2 ${btn.buttonClass}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border shrink-0 ${btn.badgeClass}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{btn.label}</span>
                    </span>
                    <span className="text-xs text-slate-600 truncate">
                      {btn.description}
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                </button>
              );
            })}
          </div>
        </div>

        {/* フッター */}
        <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={(e) => {
              fireConfetti(e.clientX, e.clientY);
              onConfirm(null);
            }}
            className="text-slate-500 hover:text-slate-800 underline underline-offset-2 transition-colors cursor-pointer"
          >
            理由を指定せずに完了にする
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium transition-colors cursor-pointer"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
