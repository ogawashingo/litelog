// 課題一覧の空状態（0件時）表示コンポーネント
"use client";

import React from "react";
import { CheckCircle2, Filter } from "lucide-react";
import { QuickViewMode } from "./issueListUtils";

interface IssueListEmptyStateProps {
  quickView: QuickViewMode;
}

export default function IssueListEmptyState({ quickView }: IssueListEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      {quickView === "today" ? (
        <>
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          <p className="text-sm font-semibold text-slate-700">今日のマイタスクはありません</p>
          <p className="text-xs text-slate-400">
            現在、至急対応が必要な課題や処理中の課題はありません。順調です！
          </p>
        </>
      ) : quickView === "review" ? (
        <>
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          <p className="text-sm font-semibold text-slate-700">レビュー待ちの課題はありません</p>
          <p className="text-xs text-slate-400">すべての作業完了レビューが完了しています！✨</p>
        </>
      ) : quickView === "stalled" ? (
        <>
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          <p className="text-sm font-semibold text-slate-700">要フォローの課題はありません</p>
          <p className="text-xs text-slate-400">
            停滞・遅延している課題はなく、プロジェクトは順調に進行しています！✨
          </p>
        </>
      ) : (
        <>
          <Filter className="w-8 h-8 text-slate-300" />
          <p className="text-sm font-medium">該当する課題が見つかりません</p>
          <p className="text-xs text-slate-400">
            フィルター条件を変更するか、「課題の追加」から新しい課題を登録してください。
          </p>
        </>
      )}
    </div>
  );
}
