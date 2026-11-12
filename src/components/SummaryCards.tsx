// ダッシュボード上部のステータス集計カウンターおよびアラート表示
"use client";

import React from "react";
import { AlertCircle, Calendar, Sparkles } from "lucide-react";
import { IssueStatus } from "@/types";

interface SummaryCardsProps {
  counts: {
    all: number;
    open: number;
    in_progress: number;
    resolved: number;
    closed: number;
    overdue: number;
    dueToday: number;
  };
  currentStatus: IssueStatus | "all";
  onSelectStatus: (status: IssueStatus | "all") => void;
}

export default function SummaryCards({
  counts,
  currentStatus,
  onSelectStatus,
}: SummaryCardsProps) {
  return (
    <div className="space-y-3">
      {/* 期限警告バナー（期限切れまたは本日期限がある場合） */}
      {(counts.overdue > 0 || counts.dueToday > 0) && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-gradient-to-r from-amber-50 via-orange-50/70 to-rose-50/70 border border-amber-200/80 rounded-xl text-sm text-amber-950 shadow-xs">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
            <span>期限アラート:</span>
          </div>
          {counts.overdue > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-bold text-xs">
              期限切れ: {counts.overdue} 件
            </span>
          )}
          {counts.dueToday > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200 font-bold text-xs">
              <Calendar className="w-3.5 h-3.5" />
              本日が期限: {counts.dueToday} 件
            </span>
          )}
        </div>
      )}

      {/* オリジナルデザインのステータス集計カード */}
      <div className="bg-white/90 backdrop-blur-xs rounded-xl shadow-xs border border-indigo-100/80 p-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-2.5 px-1">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>ワークスペース課題ステータス</span>
          </h2>
          <span className="text-xs font-medium text-slate-500">
            全 {counts.all} 件中、アクティブ <strong className="text-indigo-700">{counts.open + counts.in_progress + counts.resolved}</strong> 件
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {/* 未対応 (ローズ) */}
          <button
            onClick={() => onSelectStatus(currentStatus === "open" ? "all" : "open")}
            className={`flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer ${
              currentStatus === "open"
                ? "bg-rose-50/90 border-rose-300 ring-2 ring-rose-200 shadow-xs"
                : "bg-white border-slate-200/80 hover:border-rose-200 hover:bg-rose-50/40"
            }`}
          >
            <span className="text-xs font-bold text-rose-600">未対応</span>
            <span className="text-2xl font-extrabold text-rose-700 mt-0.5">{counts.open}</span>
          </button>

          {/* 処理中 (スカイブルー) */}
          <button
            onClick={() => onSelectStatus(currentStatus === "in_progress" ? "all" : "in_progress")}
            className={`flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer ${
              currentStatus === "in_progress"
                ? "bg-sky-50/90 border-sky-300 ring-2 ring-sky-200 shadow-xs"
                : "bg-white border-slate-200/80 hover:border-sky-200 hover:bg-sky-50/40"
            }`}
          >
            <span className="text-xs font-bold text-sky-600">処理中</span>
            <span className="text-2xl font-extrabold text-sky-700 mt-0.5">{counts.in_progress}</span>
          </button>

          {/* 処理済み (バイオレット) */}
          <button
            onClick={() => onSelectStatus(currentStatus === "resolved" ? "all" : "resolved")}
            className={`flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer ${
              currentStatus === "resolved"
                ? "bg-violet-50/90 border-violet-300 ring-2 ring-violet-200 shadow-xs"
                : "bg-white border-slate-200/80 hover:border-violet-200 hover:bg-violet-50/40"
            }`}
          >
            <span className="text-xs font-bold text-violet-600">処理済み</span>
            <span className="text-2xl font-extrabold text-violet-700 mt-0.5">{counts.resolved}</span>
          </button>

          {/* 完了 (スレート) */}
          <button
            onClick={() => onSelectStatus(currentStatus === "closed" ? "all" : "closed")}
            className={`flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer ${
              currentStatus === "closed"
                ? "bg-slate-100 border-slate-400 ring-2 ring-slate-200 shadow-xs"
                : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <span className="text-xs font-bold text-slate-500">完了</span>
            <span className="text-2xl font-extrabold text-slate-700 mt-0.5">{counts.closed}</span>
          </button>

          {/* すべて (インディゴ) */}
          <button
            onClick={() => onSelectStatus("all")}
            className={`col-span-2 sm:col-span-1 flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer ${
              currentStatus === "all"
                ? "bg-indigo-50/90 border-indigo-300 ring-2 ring-indigo-200 shadow-xs"
                : "bg-white border-slate-200/80 hover:border-indigo-200 hover:bg-indigo-50/40"
            }`}
          >
            <span className="text-xs font-bold text-indigo-700">すべて</span>
            <span className="text-2xl font-extrabold text-indigo-900 mt-0.5">{counts.all}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
