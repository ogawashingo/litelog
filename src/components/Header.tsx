// オリジナリティ溢れるコズミック・インディゴ＆コーラルアンバー グローバルヘッダー
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, FolderGit2, Kanban, LayoutDashboard, ChartGantt, Users, Crown, Settings, Sparkles } from "lucide-react";
import { Project } from "@/types";
import { useUser } from "./UserContext";
import { getUserInitials } from "./UserManageModal";

interface HeaderProps {
  projects: Project[];
  selectedProjectId: number | null;
  onSelectProject: (id: number | null) => void;
  onOpenCreateIssue: () => void;
  onOpenBackup?: () => void;
}

export default function Header({
  projects,
  selectedProjectId,
  onSelectProject,
  onOpenCreateIssue,
}: HeaderProps) {
  const pathname = usePathname();
  const isBoard = pathname?.startsWith("/board");
  const isGantt = pathname?.startsWith("/gantt");
  const isAdmin = pathname?.startsWith("/admin");
  const isDashboard = pathname === "/" || (!isBoard && !isGantt && !isAdmin);

  const { users, currentUser, openUserManageModal, openPasswordChangeModal } = useUser();

  return (
    <header className="app-header text-white shadow-lg sticky top-0 z-30 transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* 左側: オリジナルロゴとナビゲーション（ダッシュボード / ボード / ガント / 管理） */}
          <div className="flex items-center gap-4">
            {/* オリジナルブランドロゴ */}
            <Link
              href="/"
              className="flex items-center gap-2.5 cursor-pointer select-none group whitespace-nowrap"
            >
              <div className="w-8 h-8 rounded-xl app-logo-box p-[1.5px] shadow-md group-hover:scale-105 transition-transform">
                <div className="w-full h-full app-logo-inner rounded-[10px] flex items-center justify-center">
                  <Sparkles className="w-4 h-4 app-logo-icon" />
                </div>
              </div>
              <span className="font-extrabold text-base tracking-tight app-logo-text bg-clip-text text-transparent">
                Personal Backlog
              </span>
            </Link>

            {/* ナビゲーションメニュー */}
            <nav className="hidden md:flex items-center gap-1 pl-3 border-l border-white/20">
              {/* ダッシュボードタブ */}
              <Link
                href="/"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isDashboard
                    ? "app-nav-active text-white font-semibold shadow-2xs"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5 app-nav-indicator" />
                <span>ダッシュボード</span>
              </Link>

              {/* ボードタブ */}
              <Link
                href="/board"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isBoard
                    ? "app-nav-active text-white font-semibold shadow-2xs"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Kanban className="w-3.5 h-3.5 app-nav-indicator" />
                <span>ボード</span>
              </Link>

              {/* ガントチャートタブ */}
              <Link
                href="/gantt"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isGantt
                    ? "app-nav-active text-white font-semibold shadow-2xs"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <ChartGantt className="w-3.5 h-3.5 app-nav-indicator" />
                <span>ガントチャート</span>
              </Link>

              {/* 管理ページタブ（Admin権限のみ） */}
              {Boolean(currentUser?.is_admin) && (
                <Link
                  href="/admin"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                    isAdmin
                      ? "app-nav-active text-white font-semibold shadow-2xs"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Settings className="w-3.5 h-3.5 app-nav-indicator" />
                  <span>管理ページ</span>
                </Link>
              )}

              {/* プロジェクト切り替えセレクトボックス */}
              <div className="relative flex items-center ml-1.5">
                <FolderGit2 className="w-3.5 h-3.5 text-white/70 absolute left-2.5 pointer-events-none" />
                <select
                  value={selectedProjectId || ""}
                  onChange={(e) => onSelectProject(e.target.value ? Number(e.target.value) : null)}
                  className="app-header-select hover:bg-white/10 text-white text-xs rounded-lg pl-7 pr-3 py-1.5 max-w-[160px] lg:max-w-[200px] truncate focus:outline-hidden focus:ring-2 focus:ring-amber-400/50 transition-colors cursor-pointer"
                >
                  <option value="" className="text-slate-900 bg-white">
                    {isBoard || isGantt ? "すべてのプロジェクト" : "すべての課題"}
                  </option>
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id} className="text-slate-900 bg-white">
                      [{proj.key}] {proj.name}
                    </option>
                  ))}
                </select>
              </div>
            </nav>
          </div>

          {/* 右側: 課題の追加ボタン ＆ メンバー管理 ＆ 操作ユーザー表示 */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 課題追加ボタン（テーマ連動） */}
            <button
              onClick={onOpenCreateIssue}
              className="flex items-center gap-1 app-primary-btn px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all transform active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3] shrink-0" />
              <span className="hidden sm:inline">課題の追加</span>
            </button>

            {/* チームメンバー管理ボタン */}
            <button
              onClick={openUserManageModal}
              title="チームメンバーの追加・管理"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-white/80 shrink-0" />
              <span className="hidden lg:inline">メンバー ({users.length})</span>
            </button>

            {/* ログイン中ユーザー表示（クリックでマイアカウント設定・ログアウト） */}
            <div className="flex items-center gap-2 pl-2 border-l border-white/20 shrink-0">
              {currentUser ? (
                <button
                  type="button"
                  onClick={openPasswordChangeModal}
                  title="クリックしてマイアカウント設定（アイコン色・パスワード変更・ログアウト）を開く"
                  className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer shrink-0 text-left group"
                >
                  <div className="relative shrink-0">
                    <div
                      style={{ backgroundColor: currentUser.color || "#4f46e5" }}
                      className="w-7 h-7 rounded-full border-2 border-white/40 group-hover:border-amber-300 flex items-center justify-center font-bold text-[11px] text-white shadow-xs shrink-0 transition-colors"
                    >
                      {getUserInitials(currentUser.name)}
                    </div>
                    {Boolean(currentUser.is_admin) && (
                      <span
                        title="Admin（管理者権限）"
                        className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 text-amber-950 flex items-center justify-center shadow-2xs border border-white"
                      >
                        <Crown className="w-2.5 h-2.5 stroke-[2.5]" />
                      </span>
                    )}
                  </div>
                  <div className="hidden sm:flex flex-col leading-tight whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-white group-hover:text-amber-200 transition-colors whitespace-nowrap">
                        {currentUser.name}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                          currentUser.is_admin
                            ? "bg-amber-300 text-amber-950"
                            : "bg-white/20 text-white"
                        }`}
                      >
                        {currentUser.is_admin ? "Admin" : "一般"}
                      </span>
                    </div>
                    <span className="text-[10px] text-white/70 font-mono whitespace-nowrap">
                      ID: {currentUser.login_id}
                    </span>
                  </div>
                </button>
              ) : (
                <Link
                  href="/login"
                  className="px-3 py-1.5 rounded-lg bg-white text-indigo-900 text-xs font-bold hover:bg-indigo-50 transition-colors whitespace-nowrap shrink-0"
                >
                  ログイン
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
