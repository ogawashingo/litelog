// Backlog風グローバルヘッダー
"use client";

import React from "react";
import { Plus, Database, CheckCircle2, FolderGit2 } from "lucide-react";
import { Project } from "@/types";

interface HeaderProps {
  projects: Project[];
  selectedProjectId: number | null;
  onSelectProject: (id: number | null) => void;
  onOpenCreateIssue: () => void;
  onOpenBackup: () => void;
}

export default function Header({
  projects,
  selectedProjectId,
  onSelectProject,
  onOpenCreateIssue,
  onOpenBackup,
}: HeaderProps) {
  return (
    <header className="bg-[#2ca078] text-white shadow-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* 左側: ロゴとプロジェクト選択 */}
          <div className="flex items-center gap-6">
            {/* Backlog風ロゴ */}
            <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => onSelectProject(null)}>
              <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-xs flex items-center justify-center border border-white/30">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg leading-tight tracking-tight">Personal Backlog</span>
                <span className="text-[10px] text-emerald-100 font-normal">個人タスク・プロジェクト管理</span>
              </div>
            </div>

            {/* ナビゲーション */}
            <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-white/20">
              <button
                onClick={() => onSelectProject(null)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  selectedProjectId === null
                    ? "bg-white/20 text-white"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                ダッシュボード
              </button>

              {/* プロジェクト切り替えセレクトボックス */}
              <div className="relative flex items-center ml-2">
                <FolderGit2 className="w-4 h-4 text-white/70 absolute left-2.5 pointer-events-none" />
                <select
                  value={selectedProjectId || ""}
                  onChange={(e) => onSelectProject(e.target.value ? Number(e.target.value) : null)}
                  className="bg-emerald-800/60 text-white text-sm rounded-md pl-8 pr-4 py-1.5 border border-white/20 focus:outline-hidden focus:ring-2 focus:ring-white/40 cursor-pointer"
                >
                  <option value="" className="text-gray-900 bg-white">すべてのプロジェクト</option>
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id} className="text-gray-900 bg-white">
                      [{proj.key}] {proj.name}
                    </option>
                  ))}
                </select>
              </div>
            </nav>
          </div>

          {/* 右側: 課題の追加ボタン ＆ バックアップ ＆ ユーザー */}
          <div className="flex items-center gap-3">
            {/* 課題追加ボタン（Backlog伝統の目立つ追加ボタン） */}
            <button
              onClick={onOpenCreateIssue}
              className="flex items-center gap-1.5 bg-[#f39c12] hover:bg-[#e67e22] text-white px-3.5 py-1.5 rounded-md font-semibold text-sm shadow-sm transition-all transform active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>課題の追加</span>
            </button>

            {/* データバックアップ・復元ボタン */}
            <button
              onClick={onOpenBackup}
              title="データのバックアップ・復元"
              className="p-2 rounded-md hover:bg-white/10 text-white/90 hover:text-white transition-colors"
            >
              <Database className="w-5 h-5" />
            </button>

            {/* 個人ユーザーアバター（一人用） */}
            <div className="flex items-center gap-2 pl-2 border-l border-white/20">
              <div className="w-8 h-8 rounded-full bg-emerald-800 border-2 border-white/40 flex items-center justify-center font-bold text-xs text-white shadow-xs">
                私
              </div>
              <span className="hidden sm:inline text-xs text-white/90 font-medium">個人利用</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
