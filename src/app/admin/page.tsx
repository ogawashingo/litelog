// 管理ページ（時刻・タイムゾーン設定、メンバー管理、プロジェクト・バックアップ管理）
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Globe,
  Check,
  RotateCcw,
  Settings,
  Users,
  FolderGit2,
  Database,
  Crown,
  CheckCircle2,
  ArrowRight,
  Calendar,
  Sliders,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  X,
  Palette,
  Eye,
} from "lucide-react";
import Header from "@/components/Header";
import CreateIssueModal from "@/components/CreateIssueModal";
import CreateProjectModal from "@/components/CreateProjectModal";
import BackupModal from "@/components/BackupModal";
import { useUser } from "@/components/UserContext";
import { getUserInitials } from "@/components/UserManageModal";
import {
  Project,
  SystemSettings,
  DateTimeFormatType,
  ActivityTimeStyle,
  ThemeId,
} from "@/types";
import {
  DEFAULT_SYSTEM_SETTINGS,
  TIMEZONE_OPTIONS,
  formatTimestamp,
  formatActivityTimestamp,
} from "@/lib/dateUtils";
import { THEME_LIST, getThemeConfig } from "@/lib/themeConfig";
import versionData from "@/lib/version.json";
import { getStoredProjectId, setStoredProjectId } from "@/lib/projectStorage";

export default function AdminPage() {
  const router = useRouter();
  const {
    users,
    currentUser,
    isAuthReady,
    openUserManageModal,
    settings,
    updateSettings,
    refreshUsers,
    updateUserWeekStart,
    updateUserShowHolidays,
    previewTheme,
    setPreviewTheme,
  } = useUser();

  // 一般ユーザーがURL直打ちで /admin にアクセスした場合はダッシュボードへリダイレクト
  useEffect(() => {
    if (isAuthReady && currentUser && !currentUser.is_admin) {
      router.replace("/");
    }
  }, [isAuthReady, currentUser, router]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);

  // デザイン・カラーテーマ選択用State
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>(settings.theme || "cosmic");
  const [isSavingTheme, setIsSavingTheme] = useState(false);

  // プロジェクト名変更・削除用State（Admin専用）
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [projectErrorMsg, setProjectErrorMsg] = useState("");

  // 編集中の時刻設定ドラフトState
  const [draftSettings, setDraftSettings] = useState<SystemSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // リアルタイムプレビュー用の現在時刻
  const [nowDate, setNowDate] = useState<Date>(() => new Date());

  // コンテキストの設定が読み込まれたらドラフトに同期
  useEffect(() => {
    setDraftSettings(settings);
    setSelectedTheme(settings.theme || "cosmic");
  }, [settings]);

  // テーマカードクリック時のリアルタイム試着プレビュー
  const handleSelectTheme = (themeId: ThemeId) => {
    setSelectedTheme(themeId);
    setPreviewTheme(themeId);
  };

  // 選択中テーマのワークスペース全体への永続保存（Admin専用）
  const handleSaveTheme = async () => {
    if (!currentUser?.is_admin) {
      setSaveMessage("デザインテーマの保存は管理者（Admin権限）のみ実行できます");
      return;
    }
    setIsSavingTheme(true);
    setSaveMessage(null);
    try {
      const updated = await updateSettings({ theme: selectedTheme });
      setPreviewTheme(null);
      const conf = getThemeConfig(updated.theme);
      setSaveMessage(`デザインテーマを「${conf.name}」に変更・保存しました！`);
      setTimeout(() => setSaveMessage(null), 5000);
    } catch {
      setSaveMessage("デザインテーマの保存に失敗しました");
    } finally {
      setIsSavingTheme(false);
    }
  };

  // 試着プレビューの解除（元に戻す）
  const handleResetThemePreview = () => {
    setSelectedTheme(settings.theme || "cosmic");
    setPreviewTheme(null);
  };

  // 1秒ごとにプレビュー時計を更新
  useEffect(() => {
    const timer = setInterval(() => {
      setNowDate(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // プロジェクト一覧取得
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        setProjects(await res.json());
      }
    } catch (err) {
      console.error("プロジェクト一覧取得エラー:", err);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // プロジェクト名変更の開始（管理者のみ）
  const handleStartEditProject = (proj: Project) => {
    if (!currentUser?.is_admin) {
      alert("プロジェクト名の変更は管理者（Admin権限）のみ実行できます。");
      return;
    }
    setDeletingProjectId(null);
    setEditingProjectId(proj.id);
    setEditProjectName(proj.name);
    setProjectErrorMsg("");
  };

  // プロジェクト名変更の保存（管理者のみ）
  const handleSaveProjectName = async (e: React.FormEvent, projectId: number) => {
    e.preventDefault();
    if (!currentUser?.is_admin) {
      setProjectErrorMsg("プロジェクト名の変更は管理者（Admin権限）のみ実行できます");
      return;
    }
    if (!editProjectName.trim()) {
      setProjectErrorMsg("プロジェクト名を入力してください");
      return;
    }

    try {
      setIsUpdatingProject(true);
      setProjectErrorMsg("");
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editProjectName.trim(),
          actorId: currentUser.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "プロジェクト名の変更に失敗しました");
      }

      setEditingProjectId(null);
      setEditProjectName("");
      await fetchProjects();
      setSaveMessage(`プロジェクト名を「${editProjectName.trim()}」に変更しました！`);
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (err: unknown) {
      setProjectErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsUpdatingProject(false);
    }
  };

  // プロジェクト削除確認の開始（管理者のみ）
  const handleStartDeleteProject = (proj: Project) => {
    if (!currentUser?.is_admin) {
      alert("プロジェクトの削除は管理者（Admin権限）のみ実行できます。");
      return;
    }
    if (projects.length <= 1) {
      setProjectErrorMsg("最低1件のプロジェクトが必要なため削除できません");
      return;
    }
    setEditingProjectId(null);
    setDeletingProjectId(proj.id);
    setProjectErrorMsg("");
  };

  // プロジェクト削除の実行（管理者のみ）
  const handleDeleteProject = async (proj: Project) => {
    if (!currentUser?.is_admin) {
      setProjectErrorMsg("プロジェクトの削除は管理者（Admin権限）のみ実行できます");
      return;
    }

    try {
      setIsDeletingProject(true);
      setProjectErrorMsg("");
      const res = await fetch(
        `/api/projects/${proj.id}?actorId=${encodeURIComponent(String(currentUser.id))}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actorId: currentUser.id }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "プロジェクトの削除に失敗しました");
      }

      setDeletingProjectId(null);
      await fetchProjects();
      await refreshUsers();
      setSaveMessage(`プロジェクト [${proj.key}] 「${proj.name}」を削除しました！`);
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (err: unknown) {
      setProjectErrorMsg(err instanceof Error ? err.message : "削除エラーが発生しました");
    } finally {
      setIsDeletingProject(false);
    }
  };

  // 設定の保存処理
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);
    const ok = await updateSettings(draftSettings);
    setIsSaving(false);
    if (ok) {
      setSaveMessage("時刻・タイムゾーン設定を保存しました！全画面のタイムスタンプ表示に即時反映されています。");
      setTimeout(() => setSaveMessage(null), 5000);
    }
  };

  // デフォルト（日本標準時 JST）にリセット
  const handleResetDefault = async () => {
    setDraftSettings(DEFAULT_SYSTEM_SETTINGS);
    setIsSaving(true);
    const ok = await updateSettings(DEFAULT_SYSTEM_SETTINGS);
    setIsSaving(false);
    if (ok) {
      setSaveMessage("日本標準時 (JST / UTC+09:00) の標準設定にリセットしました。");
      setTimeout(() => setSaveMessage(null), 4000);
    }
  };

  // オフセット分数の加減算ヘルパー
  const adjustOffset = (deltaMinutes: number) => {
    setDraftSettings((prev) => ({
      ...prev,
      timeOffsetMinutes: Math.max(-1440, Math.min(1440, (prev.timeOffsetMinutes || 0) + deltaMinutes)),
    }));
  };

  const selectedTzInfo =
    TIMEZONE_OPTIONS.find((t) => t.value === draftSettings.timezone) || {
      value: draftSettings.timezone,
      label: draftSettings.timezone,
      offsetLabel: "",
    };

  const utcSampleString = nowDate.toISOString().replace("T", " ").slice(0, 19);
  const formattedNow = formatTimestamp(nowDate, draftSettings, true);
  const formattedSampleFixed = formatTimestamp("2026-11-12 03:53:22", draftSettings, true);
  const formattedActivityPreview = formatActivityTimestamp(
    new Date(nowDate.getTime() - 5 * 60 * 1000),
    draftSettings
  );

  const FORMAT_OPTIONS: {
    value: DateTimeFormatType;
    label: string;
    desc: string;
  }[] = [
    {
      value: "slash_sec",
      label: "YYYY/MM/DD HH:mm:ss",
      desc: "スラッシュ区切り・秒あり（標準）",
    },
    {
      value: "slash_nosec",
      label: "YYYY/MM/DD HH:mm",
      desc: "スラッシュ区切り・秒なし（シンプル）",
    },
    {
      value: "hyphen_sec",
      label: "YYYY-MM-DD HH:mm:ss",
      desc: "ハイフン区切り・秒あり（ISO風）",
    },
    {
      value: "hyphen_nosec",
      label: "YYYY-MM-DD HH:mm",
      desc: "ハイフン区切り・秒なし",
    },
    {
      value: "jp_full",
      label: "YYYY年MM月DD日 HH:mm:ss",
      desc: "日本語年月日表記",
    },
  ];

  const ACTIVITY_STYLE_OPTIONS: {
    value: ActivityTimeStyle;
    label: string;
    desc: string;
  }[] = [
    {
      value: "both",
      label: "相対時間 ＋ 日時を併記",
      desc: "例: 5分前 (2026/11/12 12:53:22)",
    },
    {
      value: "absolute",
      label: "日時（タイムスタンプ）のみ表示",
      desc: "例: 2026/11/12 12:53:22",
    },
    {
      value: "relative",
      label: "相対時間のみ表示",
      desc: "例: 5分前（※マウスホバーで日時を表示）",
    },
  ];

  return (
    <div className="min-h-screen bg-transparent flex flex-col font-sans">
      <Header
        activeNav="admin"
        projects={projects}
        selectedProjectId={getStoredProjectId()}
        onSelectProject={(id) => {
          setStoredProjectId(id);
          if (id) {
            router.push(`/?projectId=${id}`);
          } else {
            router.push("/");
          }
        }}
        onOpenCreateIssue={() => setIsCreateIssueOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ページタイトルヘッダー */}
        <div className="bg-white rounded-xl shadow-xs border border-indigo-100/80 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <h1 className="text-lg font-bold text-slate-900">管理ページ・システム設定</h1>
                <span className="text-[11px] text-slate-400 font-mono select-all">
                  {versionData.version}
                </span>
              </div>
            </div>
          </div>

          {currentUser && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs shrink-0">
              <div
                style={{ backgroundColor: currentUser.color || "#4f46e5" }}
                className="w-6 h-6 rounded-full text-white flex items-center justify-center font-bold text-[10px]"
              >
                {getUserInitials(currentUser.name)}
              </div>
              <div>
                <div className="font-bold text-slate-800 flex items-center gap-1">
                  <span>{currentUser.name}</span>
                  {Boolean(currentUser.is_admin) && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded-full font-bold">
                      <Crown className="w-2.5 h-2.5 text-amber-600" />
                      Admin
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500">{currentUser.role}</span>
              </div>
            </div>
          )}
        </div>

        {/* 保存完了メッセージ */}
        {saveMessage && (
          <div className="bg-indigo-50 border border-indigo-300 text-indigo-900 px-4 py-3 rounded-xl shadow-xs flex items-center gap-2.5 text-xs font-bold animate-in fade-in duration-150">
            <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0" />
            <span>{saveMessage}</span>
          </div>
        )}

        {/* デザイン・カラーテーマ設定カード */}
        <section className="bg-white rounded-xl shadow-xs border border-indigo-100/80 overflow-hidden">
          <div className="bg-slate-50/80 border-b border-indigo-100/60 px-6 py-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-indigo-600" />
              <h2 className="font-bold text-slate-800 text-base">デザイン・カラーテーマ設定</h2>
            </div>
            <span className="text-xs text-slate-500">
              カードをクリックすると画面全体がリアルタイムで試着プレビューされます
            </span>
          </div>

          <div className="p-6 space-y-6">
            {/* テーマ選択カード一覧 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {THEME_LIST.map((theme) => {
                const isSelected = selectedTheme === theme.id;
                const isCurrentSaved = settings.theme === theme.id;
                const isPreviewing = previewTheme === theme.id;

                return (
                  <div
                    key={theme.id}
                    onClick={() => handleSelectTheme(theme.id)}
                    className={`relative rounded-xl border-2 p-4 cursor-pointer transition-all duration-150 flex flex-col justify-between group hover:shadow-md ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/20 shadow-xs ring-2 ring-indigo-200"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    {/* カード上部: テーマ名 & バッジ */}
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-sm">{theme.name}</span>
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {theme.englishName}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {theme.badge && (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                                theme.id === "monochrome"
                                  ? "bg-orange-50 text-orange-700 border-orange-200"
                                  : theme.hasGradient
                                  ? "bg-violet-50 text-violet-700 border-violet-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              {theme.badge}
                            </span>
                          )}
                          {isCurrentSaved && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              現在保存中
                            </span>
                          )}
                        </div>
                      </div>

                      {/* ビジュアルプレビューボックス */}
                      <div
                        style={{ backgroundColor: theme.palette.background }}
                        className="rounded-lg p-2.5 mb-3 border border-slate-200/80 shadow-2xs space-y-2 select-none overflow-hidden"
                      >
                        {/* ミニヘッダー */}
                        <div
                          style={{
                            background: theme.palette.header,
                            borderBottom: `1px solid ${theme.palette.headerBorder}`,
                          }}
                          className="h-8 rounded-md px-2.5 flex items-center justify-between text-white shadow-2xs"
                        >
                          <div className="flex items-center gap-1.5">
                            <div
                              style={{ background: theme.palette.primaryBtn }}
                              className="w-4 h-4 rounded flex items-center justify-center text-[8px]"
                            >
                              ★
                            </div>
                            <span className="text-[10px] font-extrabold tracking-tight">
                              Backlog
                            </span>
                          </div>
                          <div
                            style={{ background: theme.palette.primaryBtn }}
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold shadow-2xs"
                          >
                            + 追加
                          </div>
                        </div>

                        {/* ミニカード＆パレットチップ */}
                        <div className="flex items-center justify-between gap-1 pt-0.5 px-0.5">
                          <div className="flex items-center gap-1">
                            <span
                              style={{ backgroundColor: theme.palette.accent }}
                              title="メインアクセント"
                              className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs"
                            />
                            <span
                              style={{ backgroundColor: theme.palette.subAccent }}
                              title="サブアクセント"
                              className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs"
                            />
                            <span
                              style={{ backgroundColor: theme.palette.background }}
                              title="背景色"
                              className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-2xs"
                            />
                          </div>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {theme.hasGradient ? "多層グラデーション" : "ソリッド（グラデなし）"}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">
                        {theme.description}
                      </p>
                    </div>

                    {/* カード下部: 選択ボタン */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-indigo-600 font-semibold flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" />
                        {isPreviewing ? "リアルタイム試着中" : "クリックで試着"}
                      </span>
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-md">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          選択中
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-slate-400 group-hover:text-slate-600">
                          選択する
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* テーマ保存・プレビュー操作フッター */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>選択中のテーマ:</span>
                  <span className="text-indigo-600 font-extrabold">
                    {getThemeConfig(selectedTheme).name}
                  </span>
                  {previewTheme && previewTheme !== settings.theme && (
                    <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                      試着プレビュー中
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  「このデザインを保存する」をクリックすると、ワークスペース全体の標準デザインとして反映されます。
                </p>
              </div>

              <div className="flex items-center gap-2">
                {previewTheme && (
                  <button
                    type="button"
                    onClick={handleResetThemePreview}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>試着を解除</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveTheme}
                  disabled={isSavingTheme}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>{isSavingTheme ? "保存中..." : "このデザインを保存する"}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* メインカード: 時刻・タイムゾーン設定 */}
        <form
          onSubmit={handleSaveSettings}
          className="bg-white rounded-xl shadow-xs border border-indigo-100/80 overflow-hidden"
        >
          <div className="bg-slate-50/80 border-b border-indigo-100/60 px-6 py-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              <h2 className="font-bold text-slate-800 text-base">時刻・タイムゾーン設定</h2>
            </div>
            <span className="text-xs text-slate-500">
              SQLiteのUTC記録時刻を指定タイムゾーンへ自動変換して表示します
            </span>
          </div>

          <div className="p-6 space-y-6">
            {/* リアルタイム時刻＆変換プレビューパネル */}
            <div className="app-header text-white rounded-xl p-5 shadow-inner">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                {/* 現在の表示時刻 */}
                <div className="space-y-1">
                  <span className="text-[11px] text-indigo-200 font-semibold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-300" />
                    現在の表示時刻（リアルタイムプレビュー）
                  </span>
                  <div className="text-xl sm:text-2xl font-mono font-bold tracking-tight text-white">
                    {formattedNow}
                  </div>
                  <div className="text-[11px] text-indigo-200">
                    タイムゾーン: <strong>{selectedTzInfo.label}</strong>{" "}
                    {draftSettings.timeOffsetMinutes !== 0 && (
                      <span className="ml-1 bg-amber-400/20 text-amber-200 px-1.5 py-0.5 rounded">
                        手動補正:{" "}
                        {draftSettings.timeOffsetMinutes > 0
                          ? `+${draftSettings.timeOffsetMinutes}分`
                          : `${draftSettings.timeOffsetMinutes}分`}
                      </span>
                    )}
                  </div>
                </div>

                {/* UTCからの変換比較 */}
                <div className="bg-black/25 rounded-lg p-3 space-y-1.5 border border-white/10 text-xs">
                  <div className="text-[11px] text-indigo-200 font-semibold">
                    DB内部タイムスタンプ (UTC) からの変換例
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-indigo-100/80">
                    <span>UTC: 2026-11-12 03:53:22</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-amber-300">
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    <span>表示: {formattedSampleFixed}</span>
                  </div>
                  <div className="text-[10px] text-indigo-200/80 pt-0.5">
                    現在UTC時刻: <span className="font-mono">{utcSampleString}</span>
                  </div>
                </div>

                {/* アクティビティ表示プレビュー */}
                <div className="bg-black/25 rounded-lg p-3 space-y-1.5 border border-white/10 text-xs">
                  <div className="text-[11px] text-indigo-200 font-semibold">
                    「最近の更新」での表示プレビュー
                  </div>
                  <div className="bg-white/95 text-slate-800 rounded p-2 text-[11px] space-y-0.5 shadow-2xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900">山田 太郎</span>
                      <span className="text-[10px] text-slate-500">
                        {formattedActivityPreview}
                      </span>
                    </div>
                    <div className="text-slate-600 text-[10px] truncate">
                      <span className="font-bold text-indigo-700">[MYPRJ-1]</span> ガントチャートは実装済
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 1. タイムゾーン選択 */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-indigo-600" />
                <span>1. 表示タイムゾーン</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                <div className="sm:col-span-7">
                  <select
                    value={draftSettings.timezone}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({ ...prev, timezone: e.target.value }))
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label} — {tz.offsetLabel}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSettings((prev) => ({ ...prev, timezone: "Asia/Tokyo" }))
                    }
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                      draftSettings.timezone === "Asia/Tokyo"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    日本標準時 (JST)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSettings((prev) => ({ ...prev, timezone: "UTC" }))
                    }
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                      draftSettings.timezone === "UTC"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    UTC (協定世界時)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSettings((prev) => ({ ...prev, timezone: "local" }))
                    }
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                      draftSettings.timezone === "local"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    ブラウザ自動
                  </button>
                </div>
              </div>
            </div>

            {/* 2. 日時表示フォーマット & 12/24時間制 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
              {/* 日時フォーマット */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span>2. 日時フォーマット</span>
                </label>
                <div className="space-y-2">
                  {FORMAT_OPTIONS.map((opt) => {
                    const isSelected = draftSettings.datetimeFormat === opt.value;
                    const sampleOut = formatTimestamp(
                      nowDate,
                      { ...draftSettings, datetimeFormat: opt.value },
                      true
                    );
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all text-xs ${
                          isSelected
                            ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="datetimeFormat"
                            value={opt.value}
                            checked={isSelected}
                            onChange={() =>
                              setDraftSettings((prev) => ({
                                ...prev,
                                datetimeFormat: opt.value,
                              }))
                            }
                            className="accent-[#4f46e5]"
                          />
                          <div>
                            <div className="font-bold text-slate-800">{opt.desc}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {opt.label}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-[11px] bg-white border border-slate-200 px-2 py-0.5 rounded text-indigo-800 font-semibold">
                          {sampleOut}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 24時間/12時間制 & アクティビティ表示スタイル */}
              <div className="space-y-5">
                {/* 24時間 / 12時間表記 */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    3. 時刻の24時間 / 12時間表記
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftSettings((prev) => ({ ...prev, hour12: false }))
                      }
                      className={`p-3 rounded-lg border text-left transition-all ${
                        !draftSettings.hour12
                          ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-800">24時間表記</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        例: 12:53:22 / 18:30:00
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setDraftSettings((prev) => ({ ...prev, hour12: true }))
                      }
                      className={`p-3 rounded-lg border text-left transition-all ${
                        draftSettings.hour12
                          ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-800">
                        12時間表記 (午前/午後)
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        例: 午後 00:53:22
                      </div>
                    </button>
                  </div>
                </div>

                {/* 最近の更新（アクティビティ）の時刻表示方式 */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    4. 「最近の更新」ウィジェットの時刻表示スタイル
                  </label>
                  <div className="space-y-2">
                    {ACTIVITY_STYLE_OPTIONS.map((opt) => {
                      const isSelected = draftSettings.activityTimeStyle === opt.value;
                      return (
                        <label
                          key={opt.value}
                          className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all text-xs ${
                            isSelected
                              ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                              : "border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="activityTimeStyle"
                            value={opt.value}
                            checked={isSelected}
                            onChange={() =>
                              setDraftSettings((prev) => ({
                                ...prev,
                                activityTimeStyle: opt.value,
                              }))
                            }
                            className="accent-[#4f46e5]"
                          />
                          <div>
                            <div className="font-bold text-slate-800">{opt.label}</div>
                            <div className="text-[11px] text-slate-500">{opt.desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 5. カレンダーの週開始曜日（期日・日付ピッカー表示） */}
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>5. カレンダーの週開始曜日（システム共通デフォルト設定）</span>
              </label>
              <p className="text-[11px] text-slate-500">
                期日・開始日選択カレンダーのシステム共通デフォルトです。各個人ごとの設定は、下部の「チームメンバー・権限管理」一覧の [月始 / 日始] または各個人のマイアカウント画面で個別に選べます。
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setDraftSettings((prev) => ({ ...prev, weekStart: "monday" }))
                  }
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    draftSettings.weekStart === "monday"
                      ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">月曜始まり（推奨）</span>
                    {draftSettings.weekStart === "monday" && (
                      <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-semibold">
                        選択中
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    平日（月〜金）が連続し、週末（土・日）が末尾にまとまるビジネス標準の配置です。
                  </div>
                  <div className="mt-2.5 flex items-center gap-1 font-mono text-[11px]">
                    {["月", "火", "水", "木", "金"].map((d) => (
                      <span
                        key={d}
                        className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-700"
                      >
                        {d}
                      </span>
                    ))}
                    <span className="w-6 h-6 flex items-center justify-center rounded bg-blue-50 border border-blue-200 text-blue-600 font-semibold">
                      土
                    </span>
                    <span className="w-6 h-6 flex items-center justify-center rounded bg-rose-50 border border-rose-200 text-rose-600 font-semibold">
                      日
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDraftSettings((prev) => ({ ...prev, weekStart: "sunday" }))
                  }
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    draftSettings.weekStart === "sunday"
                      ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">日曜始まり</span>
                    {draftSettings.weekStart === "sunday" && (
                      <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-semibold">
                        選択中
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    一般的な日本の紙のカレンダー等で馴染みのある配置です。
                  </div>
                  <div className="mt-2.5 flex items-center gap-1 font-mono text-[11px]">
                    <span className="w-6 h-6 flex items-center justify-center rounded bg-rose-50 border border-rose-200 text-rose-600 font-semibold">
                      日
                    </span>
                    {["月", "火", "水", "木", "金"].map((d) => (
                      <span
                        key={d}
                        className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-700"
                      >
                        {d}
                      </span>
                    ))}
                    <span className="w-6 h-6 flex items-center justify-center rounded bg-blue-50 border border-blue-200 text-blue-600 font-semibold">
                      土
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* 6. 日本の祝日表示（システム共通デフォルト設定） */}
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>6. 日本の祝日表示（システム共通デフォルト設定）</span>
              </label>
              <p className="text-[11px] text-slate-500">
                期日や開始日を選択するカレンダーおよびガントチャートで、日本の国民の祝日を赤字・祝日名ツールチップ付きで表示するかどうかのシステム共通デフォルトです。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setDraftSettings((prev) => ({ ...prev, showHolidays: true }))
                  }
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    draftSettings.showHolidays !== false
                      ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">祝日を表示する（推奨）</span>
                    {draftSettings.showHolidays !== false && (
                      <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-semibold">
                        選択中
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    元日、成人の日、ゴールデンウィーク、振替休日などを赤文字およびツールチップで表示します。
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDraftSettings((prev) => ({ ...prev, showHolidays: false }))
                  }
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    draftSettings.showHolidays === false
                      ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">祝日を表示しない</span>
                    {draftSettings.showHolidays === false && (
                      <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-semibold">
                        選択中
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    祝日の赤字判定を行わず、土日のみを休日の配色として扱います。
                  </div>
                </button>
              </div>
            </div>

            {/* 7. 手動時刻オフセット補正 */}
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <span>7. 時刻の手動オフセット補正（分単位の微調整）</span>
              </label>
              <p className="text-[11px] text-slate-500">
                サーバー時計のズレを補正したい場合や、任意の時刻オフセットを加算・減算したい場合に設定します（通常は 0分 のままで問題ありません）。
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => adjustOffset(-60)}
                  className="px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  -1時間 (-60分)
                </button>
                <button
                  type="button"
                  onClick={() => adjustOffset(-10)}
                  className="px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  -10分
                </button>
                <button
                  type="button"
                  onClick={() => adjustOffset(-1)}
                  className="px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  -1分
                </button>

                <div className="flex items-center gap-1.5 px-2">
                  <input
                    type="number"
                    min={-1440}
                    max={1440}
                    value={draftSettings.timeOffsetMinutes}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        timeOffsetMinutes: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-24 bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-center font-mono text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-semibold text-slate-600">分</span>
                </div>

                <button
                  type="button"
                  onClick={() => adjustOffset(1)}
                  className="px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  +1分
                </button>
                <button
                  type="button"
                  onClick={() => adjustOffset(10)}
                  className="px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  +10分
                </button>
                <button
                  type="button"
                  onClick={() => adjustOffset(60)}
                  className="px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  +1時間 (+60分)
                </button>

                {draftSettings.timeOffsetMinutes !== 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSettings((prev) => ({ ...prev, timeOffsetMinutes: 0 }))
                    }
                    className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-600"
                  >
                    0分にリセット
                  </button>
                )}
              </div>
            </div>

            {/* 保存・リセットフッターボタン */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleResetDefault}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>日本標準時 (JST) の初期設定に戻す</span>
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all disabled:opacity-50"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>{isSaving ? "保存中..." : "時刻設定を保存する"}</span>
              </button>
            </div>
          </div>
        </form>

        {/* 下部2カラム: メンバー・権限管理 ＆ プロジェクト・データバックアップ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* メンバー・権限管理カード */}
          <div className="bg-white rounded-xl shadow-xs border border-indigo-100/80 p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-800 text-sm">
                    チームメンバー・権限管理 ({users.length}名)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={openUserManageModal}
                  className="text-xs font-bold text-indigo-600 hover:underline"
                >
                  追加・編集を開く
                </button>
              </div>
              <p className="text-xs text-slate-500">
                メンバーの追加・編集・権限確認のほか、各個人の [月始 / 日始] および祝日 [祝ON / 祝OFF] 設定を直接変更できます。
              </p>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {users.map((u) => {
                  const userWeekStart = u.week_start || "monday";
                  const userShowHolidays = u.show_holidays !== undefined ? Boolean(u.show_holidays) : true;
                  return (
                    <div
                      key={u.id}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-xs bg-white hover:bg-slate-50/60 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          style={{ backgroundColor: u.color || "#4f46e5" }}
                          className="w-6 h-6 rounded-full text-white flex items-center justify-center font-bold text-[10px] shrink-0"
                        >
                          {getUserInitials(u.name)}
                        </div>
                        <span className="font-bold text-slate-800 truncate">{u.name}</span>
                        {Boolean(u.is_admin) && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded-full font-bold shrink-0">
                            <Crown className="w-2.5 h-2.5 text-amber-600" />
                            Admin
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-slate-500 text-[11px] hidden sm:inline mr-1">{u.role}</span>
                        {/* 祝日表示個人設定切替（ON / OFF） */}
                        <button
                          type="button"
                          onClick={() => updateUserShowHolidays(u.id, !userShowHolidays)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                            userShowHolidays
                              ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                              : "bg-slate-50 text-slate-400 border-slate-200 hover:text-slate-600"
                          }`}
                          title={`${u.name}さんの日本の祝日表示: ${userShowHolidays ? "ON (赤字・祝日名)" : "OFF"}（クリックで切替）`}
                        >
                          祝{userShowHolidays ? "ON" : "OFF"}
                        </button>
                        {/* カレンダー個人設定切替（月曜始まり / 日曜始まり） */}
                        <div className="inline-flex rounded border border-slate-200 bg-slate-50 p-0.5 text-[10px]">
                          <button
                            type="button"
                            onClick={() => updateUserWeekStart(u.id, "monday")}
                            className={`px-1.5 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                              userWeekStart === "monday"
                                ? "bg-indigo-600 text-white shadow-xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                            title={`${u.name}さんのカレンダーを月曜始まりに設定`}
                          >
                            月始
                          </button>
                          <button
                            type="button"
                            onClick={() => updateUserWeekStart(u.id, "sunday")}
                            className={`px-1.5 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                              userWeekStart === "sunday"
                                ? "bg-indigo-600 text-white shadow-xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                            title={`${u.name}さんのカレンダーを日曜始まりに設定`}
                          >
                            日始
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={openUserManageModal}
              className="w-full py-2 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <Users className="w-4 h-4" />
              <span>メンバー管理モーダルを開く</span>
            </button>
          </div>

          {/* プロジェクト ＆ バックアップ管理カード */}
          <div className="bg-white rounded-xl shadow-xs border border-indigo-100/80 p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderGit2 className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-800 text-sm">
                    プロジェクト・データ管理 ({projects.length}件)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!currentUser?.is_admin) {
                      alert("新規プロジェクトの作成は管理者（Admin権限）のみ実行できます。");
                      return;
                    }
                    setIsCreateProjectOpen(true);
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新規作成</span>
                </button>
              </div>
              <p className="text-xs text-slate-500">
                登録プロジェクトの確認・名称変更・削除（Admin専用）・追加と、全データのJSONバックアップ・復元を行えます。
              </p>
              {projectErrorMsg && (
                <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-medium">
                  {projectErrorMsg}
                </div>
              )}
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {projects.map((p) => {
                  const isEditingThis = editingProjectId === p.id;
                  const isDeletingThis = deletingProjectId === p.id;
                  return (
                    <div
                      key={p.id}
                      className="px-3 py-2 flex flex-col gap-2 text-xs bg-white"
                    >
                      {isEditingThis ? (
                        <form
                          onSubmit={(e) => handleSaveProjectName(e, p.id)}
                          className="flex items-center gap-1.5 w-full"
                        >
                          <span
                            style={{ backgroundColor: p.color || "#4f46e5" }}
                            className="w-3 h-3 rounded-xs shrink-0"
                          />
                          <span className="font-mono font-bold text-slate-600 shrink-0">
                            [{p.key}]
                          </span>
                          <input
                            type="text"
                            value={editProjectName}
                            onChange={(e) => setEditProjectName(e.target.value)}
                            placeholder="新しいプロジェクト名"
                            autoFocus
                            className="flex-1 min-w-0 bg-white border border-indigo-300 rounded px-2 py-1 text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            type="submit"
                            disabled={isUpdatingProject}
                            className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                          >
                            <Check className="w-3 h-3" />
                            <span>保存</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProjectId(null);
                              setEditProjectName("");
                              setProjectErrorMsg("");
                            }}
                            className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer shrink-0"
                            title="キャンセル"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between gap-2 w-full">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              style={{ backgroundColor: p.color || "#4f46e5" }}
                              className="w-3 h-3 rounded-xs shrink-0"
                            />
                            <span className="font-mono font-bold text-slate-600 shrink-0">
                              [{p.key}]
                            </span>
                            <span className="font-semibold text-slate-800 truncate">
                              {p.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-slate-400">
                              {formatTimestamp(p.created_at, draftSettings, false)}
                            </span>
                            {Boolean(currentUser?.is_admin) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditProject(p)}
                                  title="プロジェクト名を変更 (Admin専用)"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 font-semibold text-[11px] transition-colors cursor-pointer"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>名称変更</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStartDeleteProject(p)}
                                  title={
                                    projects.length > 1
                                      ? "プロジェクトを削除 (Admin専用)"
                                      : "最低1件のプロジェクトが必要なため削除できません"
                                  }
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-semibold text-[11px] transition-colors ${
                                    projects.length > 1
                                      ? "border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 cursor-pointer"
                                      : "border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed"
                                  }`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>削除</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* プロジェクト削除確認ボックス（Admin専用） */}
                      {isDeletingThis && (
                        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs space-y-2">
                          <div className="flex items-start gap-1.5 text-rose-800 font-semibold leading-snug">
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <span>
                              プロジェクト <strong>[{p.key}] {p.name}</strong> と紐づく全課題を完全に削除しますか？
                            </span>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingProjectId(null);
                                setProjectErrorMsg("");
                              }}
                              disabled={isDeletingProject}
                              className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                            >
                              キャンセル
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProject(p)}
                              disabled={isDeletingProject}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>{isDeletingProject ? "削除中..." : "削除する"}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!currentUser?.is_admin) {
                    alert("新規プロジェクトの作成は管理者（Admin権限）のみ実行できます。");
                    return;
                  }
                  setIsCreateProjectOpen(true);
                }}
                className="py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>プロジェクト追加</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!currentUser?.is_admin) {
                    alert("データのバックアップ・復元は管理者（Admin権限）のみ実行できます。");
                    return;
                  }
                  setIsBackupOpen(true);
                }}
                className="py-2 px-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Database className="w-4 h-4 text-indigo-700" />
                <span>バックアップ・復元</span>
              </button>
            </div>
          </div>
        </div>

        {/* ページ下部 バージョン表記 */}
        <div className="text-center pt-2 pb-4">
          <span className="text-[11px] text-slate-400 font-mono select-all">
            Personal Backlog • {versionData.version}
          </span>
        </div>
      </main>

      {/* 課題追加モーダル */}
      <CreateIssueModal
        isOpen={isCreateIssueOpen}
        projects={projects}
        selectedProjectId={null}
        onClose={() => setIsCreateIssueOpen(false)}
        onCreated={refreshUsers}
      />

      {/* プロジェクト作成モーダル */}
      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        onCreated={fetchProjects}
      />

      {/* バックアップ・復元モーダル */}
      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        onRestored={async () => {
          await fetchProjects();
          await refreshUsers();
        }}
      />
    </div>
  );
}
