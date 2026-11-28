// 下書き保存・復元状態を表示し、必要に応じて下書きを破棄できるインジケーターコンポーネント
"use client";

import React from "react";
import { Check, Trash2, Clock } from "lucide-react";

interface DraftIndicatorProps {
  hasDraft: boolean;
  isRestored?: boolean;
  lastSavedAt?: number | null;
  onDiscard?: () => void;
  className?: string;
}

export default function DraftIndicator({
  hasDraft,
  isRestored = false,
  onDiscard,
  className = "",
}: DraftIndicatorProps) {
  if (!hasDraft) return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/80 animate-in fade-in duration-200 ${className}`}
      role="status"
    >
      {isRestored ? (
        <>
          <Clock className="w-3 h-3 text-amber-600 shrink-0" />
          <span>下書きを自動復元しました</span>
        </>
      ) : (
        <>
          <Check className="w-3 h-3 text-emerald-600 stroke-[2.5] shrink-0" />
          <span>下書き自動保存済み</span>
        </>
      )}

      {onDiscard && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.confirm("保存されている下書きを破棄して入力をクリアしますか？")) {
              onDiscard();
            }
          }}
          className="ml-1 text-slate-400 hover:text-rose-600 transition-colors flex items-center gap-0.5 cursor-pointer hover:underline"
          title="下書きを破棄してクリア"
        >
          <Trash2 className="w-3 h-3" />
          <span>破棄</span>
        </button>
      )}
    </div>
  );
}
