// オリジナリティ溢れるコズミック・インディゴ＆コーラルアンバー グローバルヘッダー
"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Plus,
  FolderGit2,
  Folder,
  Kanban,
  LayoutDashboard,
  ChartGantt,
  Crown,
  Settings,
  Sparkles,
  Menu,
  X,
  Search,
  ArrowRight,
} from "lucide-react";
import { Project, Issue, isArchivedProject } from "@/types";
import { ISSUE_STATUS_CONFIG } from "./IssueBadge";
import { useUser } from "./UserContext";
import { getUserInitials } from "./UserManageModal";
import NotificationDropdown from "./NotificationDropdown";
import AnnouncementBar from "./AnnouncementBar";

interface HeaderProps {
  projects: Project[];
  selectedProjectId: number | null;
  onSelectProject: (id: number | null) => void;
  onOpenCreateIssue: () => void;
  onOpenBackup?: () => void;
  onSelectIssue?: (issueKey: string) => void;
  activeNav?: "dashboard" | "board" | "gantt" | "admin" | "search";
  searchQuery?: string;
}

export default function Header({
  projects,
  selectedProjectId,
  onSelectProject,
  onOpenCreateIssue,
  onSelectIssue,
  activeNav,
  searchQuery,
}: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isBoard = activeNav ? activeNav === "board" : Boolean(pathname?.startsWith("/board"));
  const isGantt = activeNav ? activeNav === "gantt" : Boolean(pathname?.startsWith("/gantt"));
  const isAdmin = activeNav ? activeNav === "admin" : Boolean(pathname?.startsWith("/admin"));
  const isSearch = activeNav ? activeNav === "search" : Boolean(pathname?.startsWith("/search"));
  const isDashboard = activeNav ? activeNav === "dashboard" : (pathname === "/" || (!isBoard && !isGantt && !isAdmin && !isSearch));

  const { currentUser, openPasswordChangeModal } = useUser();
  // モバイル用ナビゲーションメニューの開閉ステート
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // モバイル用検索バー展開ステート
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // 全体キーワード検索用ステート
  const [searchKeyword, setSearchKeyword] = useState(searchQuery || "");

  // 外部からの検索クエリ指定（/search画面との連動など）の同期
  useEffect(() => {
    if (searchQuery !== undefined) {
      setSearchKeyword(searchQuery);
    }
  }, [searchQuery]);
  const [searchSuggestions, setSearchSuggestions] = useState<Issue[]>([]);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // ヘッダーの高さを測定し、CSS変数 --app-header-height に反映（ボード・ガント等のstickyヘッダー連動用）
  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        const height = headerRef.current.offsetHeight;
        document.documentElement.style.setProperty("--app-header-height", `${height}px`);
      }
    };

    updateHeaderHeight();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && headerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateHeaderHeight();
      });
      resizeObserver.observe(headerRef.current);
    }

    window.addEventListener("resize", updateHeaderHeight);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener("resize", updateHeaderHeight);
    };
  }, []);

  // 選択中プロジェクトの特定と各画面への連動リンク生成
  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const projectKey = selectedProject ? encodeURIComponent(selectedProject.key) : "";

  const dashboardHref = selectedProjectId ? `/?projectId=${selectedProjectId}` : "/";
  const boardHref = projectKey ? `/board/${projectKey}` : "/board";
  const ganttHref = projectKey ? `/gantt/${projectKey}` : "/gantt";
  const searchHref = "/search";

  // キーボードショートカット（Cmd+K / Ctrl+K / '/' で全体検索入力へフォーカス）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === "Escape") {
        setIsSearchDropdownOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 検索ドロップダウン外クリック時の非表示処理
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 検索サジェスト取得（デバウンス）
  useEffect(() => {
    const trimmed = searchKeyword.trim();
    if (!trimmed) {
      setSearchSuggestions([]);
      setIsSearchingSuggestions(false);
      return;
    }

    setIsSearchingSuggestions(true);
    const timer = setTimeout(async () => {
      try {
        const url = selectedProjectId
          ? `/api/issues?q=${encodeURIComponent(trimmed)}&projectId=${selectedProjectId}`
          : `/api/issues?q=${encodeURIComponent(trimmed)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data: Issue[] = await res.json();
          setSearchSuggestions(data.slice(0, 6)); // 直近上位6件を表示
        }
      } catch (err) {
        console.error("サジェスト取得失敗:", err);
      } finally {
        setIsSearchingSuggestions(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [searchKeyword, selectedProjectId]);

  // 検索ページへ遷移（プロジェクト選択状態を反映）
  const executeSearch = (query: string) => {
    const targetQuery = query.trim();
    setIsSearchDropdownOpen(false);
    setIsMobileSearchOpen(false);
    const params = new URLSearchParams();
    if (targetQuery) params.set("q", targetQuery);
    if (selectedProjectId) params.set("projectId", String(selectedProjectId));
    const qs = params.toString();
    router.push(qs ? `/search?${qs}` : "/search");
  };

  // 進行中プロジェクトとクローズ済みプロジェクトの分離
  const activeProjects = React.useMemo(() => projects.filter((p) => !isArchivedProject(p)), [projects]);
  const archivedProjects = React.useMemo(() => projects.filter((p) => isArchivedProject(p)), [projects]);

  // 検索キーワードにマッチするプロジェクト候補（進行中を優先、上位4件）
  const matchingProjects = React.useMemo(() => {
    const trimmed = searchKeyword.trim().toLowerCase();
    if (!trimmed) return [];
    return projects
      .filter(
        (p) =>
          p.name.toLowerCase().includes(trimmed) ||
          p.key.toLowerCase().includes(trimmed)
      )
      .sort((a, b) => (isArchivedProject(a) ? 1 : 0) - (isArchivedProject(b) ? 1 : 0))
      .slice(0, 4);
  }, [projects, searchKeyword]);

  // プロジェクト選択ハンドラ（サジェストから直接選択時）
  const handleSelectSuggestedProject = (proj: Project) => {
    setIsSearchDropdownOpen(false);
    setIsMobileSearchOpen(false);
    setSearchKeyword("");
    onSelectProject(proj.id);
    if (isBoard) {
      router.push(`/board/${encodeURIComponent(proj.key)}`);
    } else if (isGantt) {
      router.push(`/gantt/${encodeURIComponent(proj.key)}`);
    } else {
      router.push(`/?projectId=${proj.id}`);
    }
  };

  // 課題選択ハンドラ
  const handleSelectSuggestedIssue = (issue: Issue) => {
    setIsSearchDropdownOpen(false);
    setIsMobileSearchOpen(false);
    if (onSelectIssue) {
      onSelectIssue(issue.issue_key);
    } else {
      router.push(`/search?q=${encodeURIComponent(issue.issue_key)}`);
    }
  };

  return (
    <header
      ref={headerRef}
      className="app-header text-white shadow-lg sticky top-0 z-30 transition-colors duration-150"
    >
      <div className="max-w-[1800px] mx-auto px-3 sm:px-5 lg:px-6">
        <div className="flex items-center justify-between h-14 gap-2 sm:gap-6">
          {/* 左側: オリジナルロゴとナビゲーション（ダッシュボード / ボード / ガント / 管理） */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            {/* オリジナルブランドロゴ */}
            <Link
              href="/"
              className="flex items-center gap-2 sm:gap-2.5 cursor-pointer select-none group whitespace-nowrap shrink-0"
            >
              <div className="w-8 h-8 rounded-xl app-logo-box p-[1.5px] shadow-md group-hover:scale-105 transition-transform">
                <div className="w-full h-full app-logo-inner rounded-[10px] flex items-center justify-center">
                  <Sparkles className="w-4 h-4 app-logo-icon" />
                </div>
              </div>
              <span className="font-extrabold text-sm sm:text-base tracking-tight app-logo-text bg-clip-text text-transparent truncate">
                Personal Backlog
              </span>
            </Link>

            {/* ナビゲーションメニュー (PC用) */}
            <nav className="hidden md:flex items-center gap-1 pl-3 border-l border-white/20">
              {/* ダッシュボードタブ */}
              <Link
                href={dashboardHref}
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
                href={boardHref}
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
                href={ganttHref}
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

              {/* プロジェクト切り替えセレクトボックス (PC用) */}
              <div className="relative flex items-center ml-2 mr-1 sm:mr-2">
                <FolderGit2 className="w-3.5 h-3.5 text-white/70 absolute left-2.5 pointer-events-none" />
                <select
                  value={selectedProjectId || ""}
                  onChange={(e) => onSelectProject(e.target.value ? Number(e.target.value) : null)}
                  className="app-header-select hover:bg-white/10 text-white text-xs rounded-lg pl-7 pr-3 py-1.5 max-w-[160px] lg:max-w-[200px] truncate focus:outline-hidden focus:ring-2 focus:ring-amber-400/50 transition-colors cursor-pointer"
                >
                  <option value="" className="text-slate-900 bg-white">
                    {isBoard || isGantt ? "すべてのプロジェクト" : "すべての課題"}
                  </option>
                  {activeProjects.map((proj) => (
                    <option key={proj.id} value={proj.id} className="text-slate-900 bg-white">
                      [{proj.key}] {proj.name}
                    </option>
                  ))}
                  {archivedProjects.length > 0 && (
                    <optgroup label="── アーカイブ ──" className="text-slate-500 bg-slate-100 font-semibold">
                      {archivedProjects.map((proj) => (
                        <option key={proj.id} value={proj.id} className="text-slate-600 bg-white">
                          [{proj.key}] {proj.name} (アーカイブ)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </nav>
          </div>

          {/* 右側: 全体キーワード検索バー ＆ 課題の追加ボタン ＆ 通知ベル ＆ 操作ユーザー表示 ＆ モバイル用メニューボタン */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 ml-auto">
            {/* 全体キーワード検索バー（本家Backlog風、Cmd+K対応、PC用） */}
            <div className="relative hidden lg:block" ref={searchContainerRef}>
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-white/60 absolute left-2.5 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => {
                    setSearchKeyword(e.target.value);
                    if (e.target.value.trim()) setIsSearchDropdownOpen(true);
                  }}
                  onFocus={() => {
                    if (searchKeyword.trim()) setIsSearchDropdownOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      // 日本語IMEなどの変換確定時のEnter押下では検索を実行しない（Modern Web Guidance: ime-safe-enter-submit）
                      if (e.nativeEvent.isComposing || e.keyCode === 229) {
                        return;
                      }
                      e.preventDefault();
                      executeSearch(searchKeyword);
                    }
                  }}
                  placeholder="検索... (⌘K)"
                  className="w-44 xl:w-60 bg-white/15 focus:bg-white focus:text-slate-900 text-white placeholder-white/60 focus:placeholder-slate-400 text-xs rounded-lg pl-8 pr-7 py-1.5 border border-white/20 focus:border-amber-400 focus:outline-hidden focus:ring-2 focus:ring-amber-400/40 transition-all shadow-inner"
                />
                {searchKeyword ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchKeyword("");
                      setSearchSuggestions([]);
                      setIsSearchDropdownOpen(false);
                      if (isSearch) {
                        executeSearch("");
                      }
                    }}
                    className="absolute right-2 text-white/60 hover:text-white p-0.5 rounded cursor-pointer"
                    title="検索キーワードをクリア"
                  >
                    <X className="w-3 h-3" />
                  </button>
                ) : (
                  <kbd className="hidden xl:inline-block absolute right-2 text-[10px] bg-black/25 text-white/60 px-1 py-0.5 rounded font-mono pointer-events-none select-none">
                    ⌘K
                  </kbd>
                )}
              </div>

              {/* クイックサジェストドロップダウンプレビュー */}
              {isSearchDropdownOpen && searchKeyword.trim() && (
                <div className="absolute right-0 top-full mt-1.5 bg-slate-900/95 backdrop-blur-md border border-white/15 rounded-xl shadow-2xl overflow-hidden z-50 text-slate-100 min-w-[360px] max-w-[440px] animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between text-[11px] text-white/60 font-medium">
                    <span>クイック候補</span>
                    {isSearchingSuggestions ? (
                      <span>検索中...</span>
                    ) : (
                      <span>
                        {matchingProjects.length > 0 && `${matchingProjects.length} PJ / `}
                        {searchSuggestions.length} 課題
                      </span>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-white/10 py-1">
                    {/* プロジェクト候補セクション */}
                    {matchingProjects.length > 0 && (
                      <div className="py-1">
                        <div className="px-3 py-1 text-[10px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1">
                          <Folder className="w-3 h-3" />
                          <span>プロジェクト</span>
                        </div>
                        {matchingProjects.map((proj) => (
                          <button
                            key={proj.id}
                            type="button"
                            onClick={() => handleSelectSuggestedProject(proj)}
                            className="w-full px-3 py-2 text-left hover:bg-white/10 transition-colors flex items-center gap-2 group cursor-pointer"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                              style={{ backgroundColor: proj.color || "#4f46e5" }}
                            />
                            <span className="font-mono text-xs font-bold text-amber-300 group-hover:underline shrink-0">
                              [{proj.key}]
                            </span>
                            <span className="text-xs text-white/95 truncate flex-1 font-medium">
                              {proj.name}
                            </span>
                            {isArchivedProject(proj) ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600 shrink-0">
                                アーカイブ
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 shrink-0">
                                開く
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 課題候補セクション */}
                    <div className="py-1">
                      {matchingProjects.length > 0 && searchSuggestions.length > 0 && (
                        <div className="px-3 py-1 text-[10px] font-bold text-white/50 uppercase tracking-wider">
                          課題
                        </div>
                      )}
                      {searchSuggestions.length > 0 ? (
                        searchSuggestions.map((issue) => (
                          <button
                            key={issue.id}
                            type="button"
                            onClick={() => handleSelectSuggestedIssue(issue)}
                            className="w-full px-3 py-2 text-left hover:bg-white/10 transition-colors flex items-center gap-2 group cursor-pointer"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: issue.project_color || "#3b82f6" }}
                            />
                            <span className="font-mono text-[11px] font-bold text-amber-300 group-hover:underline shrink-0">
                              {issue.issue_key}
                            </span>
                            <span className="text-xs text-white/90 truncate flex-1">
                              {issue.title}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70 shrink-0">
                              {ISSUE_STATUS_CONFIG[issue.status]?.label || issue.status}
                            </span>
                          </button>
                        ))
                      ) : matchingProjects.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-white/50">
                          該当するプロジェクトや課題が見つかりません
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => executeSearch(searchKeyword)}
                    className="w-full px-3 py-2.5 bg-white/5 hover:bg-amber-500/20 text-amber-300 border-t border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>「{searchKeyword}」の全体検索結果を開く</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* モバイル＆タブレット用 検索トグルボタン (lg:hidden) */}
            <button
              type="button"
              onClick={() => setIsMobileSearchOpen((prev) => !prev)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="キーワード検索"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* 課題追加ボタン（テーマ連動） */}
            <button
              onClick={onOpenCreateIssue}
              className="flex items-center gap-1 app-primary-btn px-2.5 sm:px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all transform active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3] shrink-0" />
              <span className="hidden sm:inline">課題の追加</span>
            </button>

            {/* メンション通知ベル */}
            <NotificationDropdown onSelectIssue={onSelectIssue} />

            {/* ログイン中ユーザー表示（クリックでマイアカウント設定・ログアウト） */}
            <div className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2.5 border-l border-white/20 shrink-0">
              {currentUser ? (
                <button
                  type="button"
                  onClick={openPasswordChangeModal}
                  title="クリックしてマイアカウント設定（アイコン色・パスワード変更・ログアウト）を開く"
                  className="flex items-center gap-2 px-1.5 sm:px-2 py-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer shrink-0 text-left group"
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
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-white text-indigo-900 text-xs font-bold hover:bg-indigo-50 transition-colors whitespace-nowrap shrink-0"
                >
                  ログイン
                </Link>
              )}
            </div>

            {/* モバイル用メニュー開閉ボタン (md:hidden) */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors focus:outline-hidden cursor-pointer"
              aria-label={isMobileMenuOpen ? "メニューを閉じる" : "メニューを開く"}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* モバイル用検索入力バー展開 (lg:hidden) */}
      {isMobileSearchOpen && (
        <div className="lg:hidden border-t border-white/15 bg-slate-900/95 px-3 py-2 animate-in slide-in-from-top-1 duration-150">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeSearch(searchKeyword);
            }}
            className="flex items-center gap-2 mb-2"
          >
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-white/60 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                ref={mobileSearchInputRef}
                autoFocus
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="プロジェクト名や課題を検索..."
                className="w-full bg-white/10 focus:bg-white focus:text-slate-900 text-white placeholder-white/60 text-xs rounded-lg pl-8 pr-3 py-1.5 border border-white/20 focus:outline-hidden"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 app-primary-btn rounded-lg text-xs font-bold shrink-0 cursor-pointer"
            >
              検索
            </button>
            <button
              type="button"
              onClick={() => setIsMobileSearchOpen(false)}
              className="p-1.5 text-white/60 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </form>

          {/* モバイル用サジェストリスト（プロジェクト＆課題） */}
          {searchKeyword.trim() && (
            <div className="max-h-60 overflow-y-auto divide-y divide-white/10 border-t border-white/10 pt-1 pb-1">
              {matchingProjects.length > 0 && (
                <div className="py-1">
                  <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider px-1 py-0.5 flex items-center gap-1">
                    <Folder className="w-3 h-3" />
                    <span>プロジェクト</span>
                  </div>
                  {matchingProjects.map((proj) => (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => handleSelectSuggestedProject(proj)}
                      className="w-full px-2 py-1.5 text-left hover:bg-white/10 transition-colors flex items-center gap-2 group cursor-pointer"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                        style={{ backgroundColor: proj.color || "#4f46e5" }}
                      />
                      <span className="font-mono text-xs font-bold text-amber-300">
                        [{proj.key}]
                      </span>
                      <span className="text-xs text-white/95 truncate flex-1 font-medium">
                        {proj.name}
                      </span>
                      {isArchivedProject(proj) && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600 shrink-0">
                          アーカイブ
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {searchSuggestions.length > 0 && (
                <div className="py-1">
                  <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider px-1 py-0.5">
                    課題
                  </div>
                  {searchSuggestions.slice(0, 4).map((issue) => (
                    <button
                      key={issue.id}
                      type="button"
                      onClick={() => handleSelectSuggestedIssue(issue)}
                      className="w-full px-2 py-1.5 text-left hover:bg-white/10 transition-colors flex items-center gap-2 group cursor-pointer"
                    >
                      <span className="font-mono text-[11px] font-bold text-amber-300 shrink-0">
                        {issue.issue_key}
                      </span>
                      <span className="text-xs text-white/90 truncate flex-1">
                        {issue.title}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* モバイル常時表示: プロジェクト切り替えバー (md:hidden) */}
      <div className="md:hidden border-t border-white/10 bg-black/15 px-3 py-1.5">
        <div className="relative flex items-center w-full">
          <FolderGit2 className="w-3.5 h-3.5 text-white/70 absolute left-2.5 pointer-events-none" />
          <select
            value={selectedProjectId || ""}
            onChange={(e) => onSelectProject(e.target.value ? Number(e.target.value) : null)}
            className="w-full app-header-select hover:bg-white/10 text-white text-[13px] rounded-lg pl-8 pr-3 py-1.5 truncate focus:outline-hidden focus:ring-2 focus:ring-amber-400/50 transition-colors cursor-pointer"
          >
            <option value="" className="text-slate-900 bg-white">
              {isBoard || isGantt ? "すべてのプロジェクト" : "すべての課題"}
            </option>
            {activeProjects.map((proj) => (
              <option key={proj.id} value={proj.id} className="text-slate-900 bg-white">
                [{proj.key}] {proj.name}
              </option>
            ))}
            {archivedProjects.length > 0 && (
              <optgroup label="── アーカイブ ──" className="text-slate-500 bg-slate-100 font-semibold">
                {archivedProjects.map((proj) => (
                  <option key={proj.id} value={proj.id} className="text-slate-600 bg-white">
                    [{proj.key}] {proj.name} (アーカイブ)
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {/* モバイル展開ナビゲーションメニュー (md:hidden) */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-white/15 bg-slate-950/90 backdrop-blur-md px-3 py-3 space-y-2 animate-in fade-in duration-150">
          <div className="text-[11px] font-semibold text-white/60 px-1 mb-1 tracking-wider uppercase">
            画面切り替え
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* ダッシュボード */}
            <Link
              href={dashboardHref}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                isDashboard
                  ? "app-nav-active text-white font-semibold shadow-xs"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 app-nav-indicator" />
              <span>ダッシュボード</span>
            </Link>

            {/* ボード */}
            <Link
              href={boardHref}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                isBoard
                  ? "app-nav-active text-white font-semibold shadow-xs"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Kanban className="w-4 h-4 app-nav-indicator" />
              <span>ボード</span>
            </Link>

            {/* ガントチャート */}
            <Link
              href={ganttHref}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                isGantt
                  ? "app-nav-active text-white font-semibold shadow-xs"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <ChartGantt className="w-4 h-4 app-nav-indicator" />
              <span>ガントチャート</span>
            </Link>


            {/* 管理ページ */}
            {Boolean(currentUser?.is_admin) && (
              <Link
                href="/admin"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isAdmin
                    ? "app-nav-active text-white font-semibold shadow-xs"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Settings className="w-4 h-4 app-nav-indicator" />
                <span>管理ページ</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ヘッダー直下 システム一言通知（アナウンスメント） */}
      <AnnouncementBar />
    </header>
  );
}
