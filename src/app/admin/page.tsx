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
} from "@/types";
import {
  DEFAULT_SYSTEM_SETTINGS,
  TIMEZONE_OPTIONS,
  formatTimestamp,
  formatActivityTimestamp,
} from "@/lib/dateUtils";

export default function AdminPage() {
  const router = useRouter();
  const {
    users,
    currentUser,
    openUserManageModal,
    settings,
    updateSettings,
    refreshUsers,
  } = useUser();

  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);

  // 編集中の時刻設定ドラフトState
  const [draftSettings, setDraftSettings] = useState<SystemSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // リアルタイムプレビュー用の現在時刻
  const [nowDate, setNowDate] = useState<Date>(() => new Date());

  // コンテキストの設定が読み込まれたらドラフトに同期
  useEffect(() => {
    setDraftSettings(settings);
  }, [settings]);

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
    <div className="min-h-screen bg-[#f5f6f7] flex flex-col font-sans">
      <Header
        projects={projects}
        selectedProjectId={null}
        onSelectProject={(id) => {
          if (id) {
            router.push("/");
          }
        }}
        onOpenCreateIssue={() => setIsCreateIssueOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ページタイトルヘッダー */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-[#2ca078] flex items-center justify-center shrink-0">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">管理ページ・システム設定</h1>
              <p className="text-xs text-gray-500">
                タイムスタンプのタイムゾーン・時刻フォーマット設定や、メンバー・プロジェクト・バックアップを一元管理します
              </p>
            </div>
          </div>

          {currentUser && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg text-xs shrink-0">
              <div
                style={{ backgroundColor: currentUser.color || "#2ca078" }}
                className="w-6 h-6 rounded-full text-white flex items-center justify-center font-bold text-[10px]"
              >
                {getUserInitials(currentUser.name)}
              </div>
              <div>
                <div className="font-bold text-gray-800 flex items-center gap-1">
                  <span>{currentUser.name}</span>
                  {Boolean(currentUser.is_admin) && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded-full font-bold">
                      <Crown className="w-2.5 h-2.5 text-amber-600" />
                      Admin
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-gray-500">{currentUser.role}</span>
              </div>
            </div>
          )}
        </div>

        {/* 保存完了メッセージ */}
        {saveMessage && (
          <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl shadow-xs flex items-center gap-2.5 text-xs font-bold animate-in fade-in duration-150">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{saveMessage}</span>
          </div>
        )}

        {/* メインカード: 時刻・タイムゾーン設定 */}
        <form
          onSubmit={handleSaveSettings}
          className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden"
        >
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#2ca078]" />
              <h2 className="font-bold text-gray-800 text-base">時刻・タイムゾーン設定</h2>
            </div>
            <span className="text-xs text-gray-500">
              SQLiteのUTC記録時刻を指定タイムゾーンへ自動変換して表示します
            </span>
          </div>

          <div className="p-6 space-y-6">
            {/* リアルタイム時刻＆変換プレビューパネル */}
            <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white rounded-xl p-5 shadow-inner">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                {/* 現在の表示時刻 */}
                <div className="space-y-1">
                  <span className="text-[11px] text-emerald-200 font-semibold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    現在の表示時刻（リアルタイムプレビュー）
                  </span>
                  <div className="text-xl sm:text-2xl font-mono font-bold tracking-tight text-white">
                    {formattedNow}
                  </div>
                  <div className="text-[11px] text-emerald-200">
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
                  <div className="text-[11px] text-emerald-200 font-semibold">
                    DB内部タイムスタンプ (UTC) からの変換例
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-gray-300">
                    <span>UTC: 2026-11-12 03:53:22</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-amber-300">
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    <span>表示: {formattedSampleFixed}</span>
                  </div>
                  <div className="text-[10px] text-emerald-200/80 pt-0.5">
                    現在UTC時刻: <span className="font-mono">{utcSampleString}</span>
                  </div>
                </div>

                {/* アクティビティ表示プレビュー */}
                <div className="bg-black/25 rounded-lg p-3 space-y-1.5 border border-white/10 text-xs">
                  <div className="text-[11px] text-emerald-200 font-semibold">
                    「最近の更新」での表示プレビュー
                  </div>
                  <div className="bg-white/95 text-gray-800 rounded p-2 text-[11px] space-y-0.5 shadow-2xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-gray-900">山田 太郎</span>
                      <span className="text-[10px] text-gray-500">
                        {formattedActivityPreview}
                      </span>
                    </div>
                    <div className="text-gray-600 text-[10px] truncate">
                      課題 [MYPRJ-1] にコメントを追加しました
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 1. タイムゾーン選択 */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-emerald-600" />
                <span>1. 表示タイムゾーン</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                <div className="sm:col-span-7">
                  <select
                    value={draftSettings.timezone}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({ ...prev, timezone: e.target.value }))
                    }
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
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
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100"
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
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100"
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
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100"
                    }`}
                  >
                    ブラウザ自動
                  </button>
                </div>
              </div>
            </div>

            {/* 2. 日時表示フォーマット & 12/24時間制 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-gray-100">
              {/* 日時フォーマット */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-emerald-600" />
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
                            ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500"
                            : "border-gray-200 hover:bg-gray-50"
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
                            className="accent-[#2ca078]"
                          />
                          <div>
                            <div className="font-bold text-gray-800">{opt.desc}</div>
                            <div className="text-[11px] text-gray-500 font-mono">
                              {opt.label}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-[11px] bg-white border border-gray-200 px-2 py-0.5 rounded text-emerald-800 font-semibold">
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
                  <label className="block text-xs font-bold text-gray-800">
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
                          ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <div className="text-xs font-bold text-gray-800">24時間表記</div>
                      <div className="text-[11px] text-gray-500 font-mono mt-0.5">
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
                          ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <div className="text-xs font-bold text-gray-800">
                        12時間表記 (午前/午後)
                      </div>
                      <div className="text-[11px] text-gray-500 font-mono mt-0.5">
                        例: 午後 00:53:22
                      </div>
                    </button>
                  </div>
                </div>

                {/* 最近の更新（アクティビティ）の時刻表示方式 */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-800">
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
                              ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500"
                              : "border-gray-200 hover:bg-gray-50"
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
                            className="accent-[#2ca078]"
                          />
                          <div>
                            <div className="font-bold text-gray-800">{opt.label}</div>
                            <div className="text-[11px] text-gray-500">{opt.desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 5. 手動時刻オフセット補正 */}
            <div className="pt-4 border-t border-gray-100 space-y-2">
              <label className="block text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-emerald-600" />
                <span>5. 時刻の手動オフセット補正（分単位の微調整）</span>
              </label>
              <p className="text-[11px] text-gray-500">
                サーバー時計のズレを補正したい場合や、任意の時刻オフセットを加算・減算したい場合に設定します（通常は 0分 のままで問題ありません）。
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => adjustOffset(-60)}
                  className="px-2.5 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700"
                >
                  -1時間 (-60分)
                </button>
                <button
                  type="button"
                  onClick={() => adjustOffset(-10)}
                  className="px-2.5 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700"
                >
                  -10分
                </button>
                <button
                  type="button"
                  onClick={() => adjustOffset(-1)}
                  className="px-2.5 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700"
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
                    className="w-24 bg-white border border-gray-300 rounded-md px-2.5 py-1.5 text-center font-mono text-xs font-bold text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-semibold text-gray-600">分</span>
                </div>

                <button
                  type="button"
                  onClick={() => adjustOffset(1)}
                  className="px-2.5 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700"
                >
                  +1分
                </button>
                <button
                  type="button"
                  onClick={() => adjustOffset(10)}
                  className="px-2.5 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700"
                >
                  +10分
                </button>
                <button
                  type="button"
                  onClick={() => adjustOffset(60)}
                  className="px-2.5 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700"
                >
                  +1時間 (+60分)
                </button>

                {draftSettings.timeOffsetMinutes !== 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSettings((prev) => ({ ...prev, timeOffsetMinutes: 0 }))
                    }
                    className="px-2.5 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-600"
                  >
                    0分にリセット
                  </button>
                )}
              </div>
            </div>

            {/* 保存・リセットフッターボタン */}
            <div className="pt-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleResetDefault}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>日本標準時 (JST) の初期設定に戻す</span>
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-[#2ca078] hover:bg-[#238161] text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50"
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
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#2ca078]" />
                  <h3 className="font-bold text-gray-800 text-sm">
                    チームメンバー・権限管理 ({users.length}名)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={openUserManageModal}
                  className="text-xs font-bold text-[#2ca078] hover:underline"
                >
                  追加・編集を開く
                </button>
              </div>
              <p className="text-xs text-gray-500">
                メンバーの追加・編集・操作ユーザーの切り替えや、管理者（Admin）権限を確認できます。
              </p>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="px-3 py-2 flex items-center justify-between text-xs bg-white"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        style={{ backgroundColor: u.color || "#2ca078" }}
                        className="w-6 h-6 rounded-full text-white flex items-center justify-center font-bold text-[10px] shrink-0"
                      >
                        {getUserInitials(u.name)}
                      </div>
                      <span className="font-bold text-gray-800 truncate">{u.name}</span>
                      {Boolean(u.is_admin) && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded-full font-bold">
                          <Crown className="w-2.5 h-2.5 text-amber-600" />
                          Admin
                        </span>
                      )}
                    </div>
                    <span className="text-gray-500 text-[11px]">{u.role}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={openUserManageModal}
              className="w-full py-2 px-4 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <Users className="w-4 h-4" />
              <span>メンバー管理モーダルを開く</span>
            </button>
          </div>

          {/* プロジェクト ＆ バックアップ管理カード */}
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderGit2 className="w-5 h-5 text-[#2ca078]" />
                  <h3 className="font-bold text-gray-800 text-sm">
                    プロジェクト・データ管理 ({projects.length}件)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateProjectOpen(true)}
                  className="flex items-center gap-1 text-xs font-bold text-[#2ca078] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新規作成</span>
                </button>
              </div>
              <p className="text-xs text-gray-500">
                登録プロジェクトの確認・追加と、全データ（課題・メンバー・時刻設定含む）のJSONバックアップ・復元を行えます。
              </p>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className="px-3 py-2 flex items-center justify-between text-xs bg-white"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        style={{ backgroundColor: p.color || "#2ca078" }}
                        className="w-3 h-3 rounded-xs shrink-0"
                      />
                      <span className="font-mono font-bold text-gray-600">[{p.key}]</span>
                      <span className="font-semibold text-gray-800">{p.name}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {formatTimestamp(p.created_at, draftSettings, false)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsCreateProjectOpen(true)}
                className="py-2 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
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
                className="py-2 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Database className="w-4 h-4 text-emerald-700" />
                <span>バックアップ・復元</span>
              </button>
            </div>
          </div>
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
