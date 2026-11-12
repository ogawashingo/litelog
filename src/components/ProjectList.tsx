// プロジェクト一覧ウィジェットコンポーネント
"use client";

import React from "react";
import Link from "next/link";
import { FolderPlus, Folder, ChevronRight, Kanban, ChartGantt } from "lucide-react";
import { Project } from "@/types";
import { useUser } from "./UserContext";

interface ExtendedProject extends Project {
  total_issues?: number;
  active_issues?: number;
}

interface ProjectListProps {
  projects: ExtendedProject[];
  selectedProjectId: number | null;
  onSelectProject: (id: number | null) => void;
  onOpenCreateProject: () => void;
}

export default function ProjectList({
  projects,
  selectedProjectId,
  onSelectProject,
  onOpenCreateProject,
}: ProjectListProps) {
  const { currentUser } = useUser();

  return (
    <div className="bg-white/95 backdrop-blur-xs rounded-xl shadow-xs border border-indigo-100/80 p-4">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
          <Folder className="w-4 h-4 text-indigo-600" />
          <span>プロジェクト一覧</span>
        </h3>
        <button
          onClick={() => {
            if (!currentUser?.is_admin) {
              alert("新規プロジェクトの作成は管理者（Admin権限: 山田 太郎など）のみ実行できます。");
              return;
            }
            onOpenCreateProject();
          }}
          title={
            currentUser?.is_admin
              ? "新規プロジェクト作成 (Admin)"
              : "新規プロジェクト作成 (Admin権限が必要)"
          }
          className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-colors ${
            currentUser?.is_admin
              ? "text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 cursor-pointer"
              : "text-slate-400 cursor-not-allowed"
          }`}
        >
          <FolderPlus className="w-4 h-4" />
          <span>追加</span>
        </button>
      </div>

      <div className="space-y-2.5">
        {/* 全プロジェクト表示ボタン */}
        <button
          onClick={() => onSelectProject(null)}
          className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all flex items-center justify-between cursor-pointer ${
            selectedProjectId === null
              ? "bg-indigo-50/90 border-indigo-300 font-bold text-indigo-950 shadow-2xs"
              : "border-slate-200 hover:bg-slate-50 text-slate-700"
          }`}
        >
          <span>すべての課題を表示</span>
          <ChevronRight className="w-4 h-4 text-indigo-400" />
        </button>

        {/* 各プロジェクトカード */}
        {projects.map((proj) => {
          const total = proj.total_issues || 0;
          const active = proj.active_issues || 0;
          const completed = total - active;
          const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
          const isSelected = selectedProjectId === proj.id;

          return (
            <div
              key={proj.id}
              onClick={() => onSelectProject(proj.id)}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                isSelected
                  ? "bg-indigo-50/70 border-indigo-400 ring-1 ring-indigo-300 shadow-2xs"
                  : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50/70"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shadow-2xs"
                    style={{ backgroundColor: proj.color || "#4f46e5" }}
                  />
                  <span className="font-bold text-xs text-slate-800">
                    [{proj.key}] {proj.name}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-indigo-600">
                  {progressPercent}%
                </span>
              </div>

              {/* プログレスバー（インディゴ〜バイオレット〜ローズのグラデーション） */}
              <div className="w-full bg-slate-200/80 rounded-full h-1.5 mb-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 via-violet-500 to-rose-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
                <span>未完了: <strong className="text-rose-600">{active}</strong> 件</span>
                <div className="flex items-center gap-1.5">
                  <span>完了: {completed} / 全 {total} 件</span>
                  <Link
                    href={`/board/${encodeURIComponent(proj.key)}`}
                    onClick={(e) => e.stopPropagation()}
                    title="このプロジェクトのボードを開く"
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded-md font-semibold transition-colors"
                  >
                    <Kanban className="w-3 h-3" />
                    <span>ボード</span>
                  </Link>
                  <Link
                    href={`/gantt/${encodeURIComponent(proj.key)}`}
                    onClick={(e) => e.stopPropagation()}
                    title="このプロジェクトのガントチャートを開く"
                    className="inline-flex items-center gap-1 text-[11px] text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-1.5 py-0.5 rounded-md font-semibold transition-colors"
                  >
                    <ChartGantt className="w-3 h-3" />
                    <span>ガント</span>
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
