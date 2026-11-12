// Backlog風グローバルヘッダー
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Database, CheckCircle2, FolderGit2, Kanban, LayoutDashboard, ChartGantt, Users, Crown, Settings, LogOut } from "lucide-react";
import { Project } from "@/types";
import { useUser } from "./UserContext";
import { getUserInitials } from "./UserManageModal";

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
  const pathname = usePathname();
  const isBoard = pathname?.startsWith("/board");
  const isGantt = pathname?.startsWith("/gantt");
  const isAdmin = pathname?.startsWith("/admin");
  const isDashboard = pathname === "/" || (!isBoard && !isGantt && !isAdmin);

  const { users, currentUser, logout, openUserManageModal } = useUser();

  return (
    <header className="bg-[#2ca078] text-white shadow-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* 左側: ロゴとナビゲーション（ダッシュボード / ボード） */}
          <div className="flex items-center gap-6">
            {/* Backlog風ロゴ */}
            <Link
              href="/"
              className="flex items-center gap-2 cursor-pointer select-none group"
            >
              <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-xs flex items-center justify-center border border-white/30 group-hover:bg-white/30 transition-colors">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg leading-tight tracking-tight">Personal Backlog</span>
                <span className="text-[10px] text-emerald-100 font-normal">チーム＆個人タスク管理</span>
              </div>
            </Link>

            {/* ナビゲーションメニュー */}
            <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-white/20">
              {/* ダッシュボードタブ */}
              <Link
                href="/"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isDashboard
                    ? "bg-white/20 text-white font-semibold"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>ダッシュボード</span>
              </Link>

              {/* ボードタブ */}
              <Link
                href="/board"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isBoard
                    ? "bg-white/20 text-white font-semibold"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Kanban className="w-4 h-4" />
                <span>ボード</span>
              </Link>

              {/* ガントチャートタブ */}
              <Link
                href="/gantt"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isGantt
                    ? "bg-white/20 text-white font-semibold"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <ChartGantt className="w-4 h-4" />
                <span>ガントチャート</span>
              </Link>

              {/* 管理ページタブ（Admin権限のみ） */}
              {Boolean(currentUser?.is_admin) && (
                <Link
                  href="/admin"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isAdmin
                      ? "bg-white/20 text-white font-semibold"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>管理ページ</span>
                </Link>
              )}

              {/* プロジェクト切り替えセレクトボックス */}
              <div className="relative flex items-center ml-2">
                <FolderGit2 className="w-4 h-4 text-white/70 absolute left-2.5 pointer-events-none" />
                <select
                  value={selectedProjectId || ""}
                  onChange={(e) => onSelectProject(e.target.value ? Number(e.target.value) : null)}
                  className="bg-emerald-800/60 text-white text-sm rounded-md pl-8 pr-4 py-1.5 border border-white/20 focus:outline-hidden focus:ring-2 focus:ring-white/40 cursor-pointer"
                >
                  <option value="" className="text-gray-900 bg-white">
                    {isBoard || isGantt ? "すべてのプロジェクト" : "すべての課題"}
                  </option>
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id} className="text-gray-900 bg-white">
                      [{proj.key}] {proj.name}
                    </option>
                  ))}
                </select>
              </div>
            </nav>
          </div>

          {/* 右側: 課題の追加ボタン ＆ メンバー管理 ＆ バックアップ ＆ 操作ユーザー切替 */}
          <div className="flex items-center gap-2.5">
            {/* 課題追加ボタン（Backlog伝統の目立つ追加ボタン） */}
            <button
              onClick={onOpenCreateIssue}
              className="flex items-center gap-1.5 bg-[#f39c12] hover:bg-[#e67e22] text-white px-3.5 py-1.5 rounded-md font-semibold text-sm shadow-sm transition-all transform active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span className="hidden sm:inline">課題の追加</span>
            </button>

            {/* チームメンバー管理ボタン */}
            <button
              onClick={openUserManageModal}
              title="チームメンバーの追加・管理"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors"
            >
              <Users className="w-4 h-4" />
              <span className="hidden lg:inline">メンバー ({users.length})</span>
            </button>

            {/* データバックアップ・復元ボタン（Admin権限） */}
            <button
              onClick={() => {
                if (!currentUser?.is_admin) {
                  alert("データのバックアップ・復元は管理者（Admin権限: 山田 太郎など）のみ実行できます。");
                  return;
                }
                onOpenBackup();
              }}
              title={
                currentUser?.is_admin
                  ? "データのバックアップ・復元 (Admin)"
                  : "データのバックアップ・復元 (Admin権限が必要)"
              }
              className={`p-2 rounded-md transition-colors ${
                currentUser?.is_admin
                  ? "hover:bg-white/10 text-white/90 hover:text-white"
                  : "text-white/40 hover:bg-white/5 cursor-not-allowed"
              }`}
            >
              <Database className="w-5 h-5" />
            </button>

            {/* 管理ページ（時刻設定・システム管理）ショートカット（Admin権限のみ） */}
            {Boolean(currentUser?.is_admin) && (
              <Link
                href="/admin"
                title="管理ページ（時刻設定・タイムゾーン・システム管理）"
                className={`p-2 rounded-md transition-colors ${
                  isAdmin
                    ? "bg-white/25 text-white"
                    : "hover:bg-white/10 text-white/90 hover:text-white"
                }`}
              >
                <Settings className="w-5 h-5" />
              </Link>
            )}

            {/* ログイン中ユーザー表示 ＆ ログアウトボタン */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-white/20">
              {currentUser ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div
                        style={{ backgroundColor: currentUser.color || "#065f46" }}
                        className="w-7 h-7 rounded-full border-2 border-white/60 flex items-center justify-center font-bold text-[11px] text-white shadow-xs shrink-0"
                        title={`ログイン中: ${currentUser.name} (ID: ${currentUser.login_id})`}
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
                    <div className="hidden sm:flex flex-col leading-tight">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-white">
                          {currentUser.name}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                            currentUser.is_admin
                              ? "bg-amber-300 text-amber-950"
                              : "bg-white/20 text-white"
                          }`}
                        >
                          {currentUser.is_admin ? "Admin" : "一般"}
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-100 font-mono">
                        ID: {currentUser.login_id}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={logout}
                    title="ログアウトして別IDでログイン"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-950/40 hover:bg-emerald-950/70 border border-white/20 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">ログアウト</span>
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="px-3 py-1.5 rounded-md bg-white text-emerald-800 text-xs font-bold hover:bg-emerald-50 transition-colors"
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
