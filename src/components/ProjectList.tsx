// プロジェクト一覧ウィジェットコンポーネント
"use client";

import React from "react";
import Link from "next/link";
import { FolderPlus, Folder, ChevronRight, Kanban } from "lucide-react";
import { Project } from "@/types";

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
  return (
    <div className="bg-white rounded-lg shadow-xs border border-gray-200 p-4">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100">
        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
          <Folder className="w-4 h-4 text-emerald-600" />
          <span>プロジェクト一覧</span>
        </h3>
        <button
          onClick={onOpenCreateProject}
          title="新規プロジェクト作成"
          className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-semibold p-1 hover:bg-emerald-50 rounded transition-colors"
        >
          <FolderPlus className="w-4 h-4" />
          <span>追加</span>
        </button>
      </div>

      <div className="space-y-2">
        {/* 全プロジェクト表示ボタン */}
        <button
          onClick={() => onSelectProject(null)}
          className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between ${
            selectedProjectId === null
              ? "bg-emerald-50 border-emerald-300 font-bold text-emerald-900"
              : "border-gray-200 hover:bg-gray-50 text-gray-700"
          }`}
        >
          <span>すべての課題を表示</span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
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
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                isSelected
                  ? "bg-emerald-50/70 border-emerald-400 ring-1 ring-emerald-300"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/60"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: proj.color || "#2ca078" }}
                  />
                  <span className="font-bold text-xs text-gray-800">
                    [{proj.key}] {proj.name}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-gray-500">
                  {progressPercent}%
                </span>
              </div>

              {/* プログレスバー */}
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex justify-between items-center text-[11px] text-gray-500 pt-1">
                <span>未完了: <strong className="text-rose-600">{active}</strong> 件</span>
                <div className="flex items-center gap-2">
                  <span>完了: {completed} / 全 {total} 件</span>
                  <Link
                    href={`/board/${encodeURIComponent(proj.key)}`}
                    onClick={(e) => e.stopPropagation()}
                    title="このプロジェクトのボードを開く"
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded font-semibold transition-colors"
                  >
                    <Kanban className="w-3 h-3" />
                    <span>ボード</span>
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
