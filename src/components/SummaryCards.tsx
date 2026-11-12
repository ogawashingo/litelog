// ダッシュボード上部のステータス集計カウンターおよびアラート表示
"use client";

import React from "react";
import { AlertCircle, Calendar } from "lucide-react";
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
        <div className="flex flex-wrap items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 shadow-xs">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <span>期限アラート:</span>
          </div>
          {counts.overdue > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold text-xs">
              期限切れ: {counts.overdue} 件
            </span>
          )}
          {counts.dueToday > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-xs">
              <Calendar className="w-3.5 h-3.5" />
              本日が期限: {counts.dueToday} 件
            </span>
          )}
        </div>
      )}

      {/* Backlog風ステータス集計タブ */}
      <div className="bg-white rounded-lg shadow-xs border border-gray-200 p-2">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2 px-2">
          <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <span>自分の課題ステータス</span>
          </h2>
          <span className="text-xs text-gray-500">
            全 {counts.all} 件中、未完了 {counts.open + counts.in_progress + counts.resolved} 件
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {/* 未対応 */}
          <button
            onClick={() => onSelectStatus(currentStatus === "open" ? "all" : "open")}
            className={`flex flex-col p-2.5 rounded-lg border text-left transition-all ${
              currentStatus === "open"
                ? "bg-rose-50 border-rose-300 ring-2 ring-rose-200"
                : "bg-white border-gray-200 hover:border-rose-200 hover:bg-rose-50/40"
            }`}
          >
            <span className="text-xs font-semibold text-rose-600">未対応</span>
            <span className="text-2xl font-bold text-rose-700 mt-0.5">{counts.open}</span>
          </button>

          {/* 処理中 */}
          <button
            onClick={() => onSelectStatus(currentStatus === "in_progress" ? "all" : "in_progress")}
            className={`flex flex-col p-2.5 rounded-lg border text-left transition-all ${
              currentStatus === "in_progress"
                ? "bg-sky-50 border-sky-300 ring-2 ring-sky-200"
                : "bg-white border-gray-200 hover:border-sky-200 hover:bg-sky-50/40"
            }`}
          >
            <span className="text-xs font-semibold text-sky-600">処理中</span>
            <span className="text-2xl font-bold text-sky-700 mt-0.5">{counts.in_progress}</span>
          </button>

          {/* 処理済み */}
          <button
            onClick={() => onSelectStatus(currentStatus === "resolved" ? "all" : "resolved")}
            className={`flex flex-col p-2.5 rounded-lg border text-left transition-all ${
              currentStatus === "resolved"
                ? "bg-teal-50 border-teal-300 ring-2 ring-teal-200"
                : "bg-white border-gray-200 hover:border-teal-200 hover:bg-teal-50/40"
            }`}
          >
            <span className="text-xs font-semibold text-teal-600">処理済み</span>
            <span className="text-2xl font-bold text-teal-700 mt-0.5">{counts.resolved}</span>
          </button>

          {/* 完了 */}
          <button
            onClick={() => onSelectStatus(currentStatus === "closed" ? "all" : "closed")}
            className={`flex flex-col p-2.5 rounded-lg border text-left transition-all ${
              currentStatus === "closed"
                ? "bg-gray-100 border-gray-400 ring-2 ring-gray-200"
                : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <span className="text-xs font-semibold text-gray-500">完了</span>
            <span className="text-2xl font-bold text-gray-700 mt-0.5">{counts.closed}</span>
          </button>

          {/* すべて */}
          <button
            onClick={() => onSelectStatus("all")}
            className={`col-span-2 sm:col-span-1 flex flex-col p-2.5 rounded-lg border text-left transition-all ${
              currentStatus === "all"
                ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200"
                : "bg-white border-gray-200 hover:border-emerald-200 hover:bg-emerald-50/40"
            }`}
          >
            <span className="text-xs font-semibold text-emerald-700">すべて</span>
            <span className="text-2xl font-bold text-emerald-800 mt-0.5">{counts.all}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
