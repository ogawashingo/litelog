// 時刻・タイムゾーン設定セクション
"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  Globe,
  Check,
  RotateCcw,
  ArrowRight,
  Calendar,
  Sliders,
} from "lucide-react";
import {
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

interface TimezoneSettingsSectionProps {
  settings: SystemSettings;
  updateSettings: (next: Partial<SystemSettings>) => Promise<SystemSettings>;
  mounted: boolean;
  onSaveMessage: (msg: string | null) => void;
}

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

export default function TimezoneSettingsSection({
  settings,
  updateSettings,
  mounted,
  onSaveMessage,
}: TimezoneSettingsSectionProps) {
  // 編集中の時刻設定ドラフトState
  const [draftSettings, setDraftSettings] = useState<SystemSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);

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

  // 設定の保存処理
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    onSaveMessage(null);
    const ok = await updateSettings(draftSettings);
    setIsSaving(false);
    if (ok) {
      onSaveMessage(
        "時刻・タイムゾーン設定を保存しました！全画面のタイムスタンプ表示に即時反映されています。"
      );
      setTimeout(() => onSaveMessage(null), 5000);
    }
  };

  // デフォルト（日本標準時 JST）にリセット
  const handleResetDefault = async () => {
    setDraftSettings(DEFAULT_SYSTEM_SETTINGS);
    setIsSaving(true);
    const ok = await updateSettings(DEFAULT_SYSTEM_SETTINGS);
    setIsSaving(false);
    if (ok) {
      onSaveMessage("日本標準時 (JST / UTC+09:00) の標準設定にリセットしました。");
      setTimeout(() => onSaveMessage(null), 4000);
    }
  };

  // オフセット分数の加減算ヘルパー
  const adjustOffset = (deltaMinutes: number) => {
    setDraftSettings((prev) => ({
      ...prev,
      timeOffsetMinutes: Math.max(
        -1440,
        Math.min(1440, (prev.timeOffsetMinutes || 0) + deltaMinutes)
      ),
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

  return (
    <form
      onSubmit={handleSaveSettings}
      className="bg-white rounded-xl shadow-xs border border-indigo-100/80 overflow-hidden"
    >
      <div className="bg-slate-50/80 border-b border-indigo-100/60 px-6 py-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-600" />
          <h2 className="font-bold text-slate-800 text-base sm:text-lg">
            時刻・タイムゾーン設定
          </h2>
        </div>
        <span className="text-xs sm:text-sm text-slate-500">
          SQLiteのUTC記録時刻を指定タイムゾーンへ自動変換して表示します
        </span>
      </div>

      <div className="p-6 space-y-6">
        {/* リアルタイム時刻＆変換プレビューパネル */}
        <div className="app-header text-white rounded-xl p-5 shadow-inner">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            {/* 現在の表示時刻 */}
            <div className="space-y-1">
              <span className="text-xs text-indigo-200 font-semibold flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-300" />
                現在の表示時刻（リアルタイムプレビュー）
              </span>
              <div
                className="text-2xl sm:text-3xl font-mono font-bold tracking-tight text-white"
                suppressHydrationWarning
              >
                {mounted ? formattedNow : "--:--:--"}
              </div>
              <div className="text-xs text-indigo-200">
                タイムゾーン: <strong>{selectedTzInfo.label}</strong>{" "}
                {draftSettings.timeOffsetMinutes !== 0 && (
                  <span className="ml-1 bg-amber-400/20 text-amber-200 px-1.5 py-0.5 rounded text-xs">
                    手動補正:{" "}
                    {draftSettings.timeOffsetMinutes > 0
                      ? `+${draftSettings.timeOffsetMinutes}分`
                      : `${draftSettings.timeOffsetMinutes}分`}
                  </span>
                )}
              </div>
            </div>

            {/* UTCからの変換比較 */}
            <div className="bg-black/25 rounded-lg p-3.5 space-y-1.5 border border-white/10 text-xs">
              <div className="text-xs text-indigo-200 font-semibold">
                DB内部タイムスタンプ (UTC) からの変換例
              </div>
              <div className="flex items-center gap-1.5 font-mono text-xs text-indigo-100/90">
                <span>UTC: 2026-11-12 03:53:22</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-amber-300">
                <ArrowRight className="w-4 h-4 shrink-0" />
                <span suppressHydrationWarning>{mounted ? formattedSampleFixed : "--"}</span>
              </div>
              <div className="text-xs text-indigo-200/90 pt-0.5">
                現在UTC時刻:{" "}
                <span className="font-mono" suppressHydrationWarning>
                  {mounted ? utcSampleString : "--"}
                </span>
              </div>
            </div>

            {/* アクティビティ表示プレビュー */}
            <div className="bg-black/25 rounded-lg p-3.5 space-y-1.5 border border-white/10 text-xs">
              <div className="text-xs text-indigo-200 font-semibold">
                「最近の更新」での表示プレビュー
              </div>
              <div className="bg-white/95 text-slate-800 rounded p-2.5 text-xs space-y-1 shadow-2xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-900 text-xs">山田 太郎</span>
                  <span className="text-xs text-slate-500" suppressHydrationWarning>
                    {mounted ? formattedActivityPreview : "--"}
                  </span>
                </div>
                <div className="text-slate-600 text-xs truncate">
                  <span className="font-bold text-indigo-700">[MYPRJ-1]</span> ガントチャートは実装済
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 1. タイムゾーン選択 */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-slate-800 flex items-center gap-1.5">
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
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
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
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
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
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
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
            <label className="block text-sm font-bold text-slate-800 flex items-center gap-1.5">
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
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all text-sm ${
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
                        <div className="text-xs text-slate-500 font-mono">{opt.label}</div>
                      </div>
                    </div>
                    <span
                      className="font-mono text-xs bg-white border border-slate-200 px-2 py-0.5 rounded text-indigo-800 font-semibold"
                      suppressHydrationWarning
                    >
                      {mounted ? sampleOut : "--"}
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
              <label className="block text-sm font-bold text-slate-800">
                3. 時刻の24時間 / 12時間表記
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDraftSettings((prev) => ({ ...prev, hour12: false }))}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    !draftSettings.hour12
                      ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="text-sm font-bold text-slate-800">24時間表記</div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    例: 12:53:22 / 18:30:00
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDraftSettings((prev) => ({ ...prev, hour12: true }))}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    draftSettings.hour12
                      ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="text-sm font-bold text-slate-800">
                    12時間表記 (午前/午後)
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    例: 午後 00:53:22
                  </div>
                </button>
              </div>
            </div>

            {/* 最近の更新（アクティビティ）の時刻表示方式 */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-800">
                4. 「最近の更新」ウィジェットの時刻表示スタイル
              </label>
              <div className="space-y-2">
                {ACTIVITY_STYLE_OPTIONS.map((opt) => {
                  const isSelected = draftSettings.activityTimeStyle === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all text-sm ${
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
                        <div className="text-xs text-slate-500">{opt.desc}</div>
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
          <label className="block text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>5. カレンダーの週開始曜日（システム共通デフォルト設定）</span>
          </label>
          <p className="text-xs sm:text-sm text-slate-500">
            期日・開始日選択カレンダーのシステム共通デフォルトです。各個人ごとの設定は、各個人のマイアカウント画面やメンバー編集モーダルで個別に選べます。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => setDraftSettings((prev) => ({ ...prev, weekStart: "monday" }))}
              className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                draftSettings.weekStart === "monday"
                  ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">月曜始まり（推奨）</span>
                {draftSettings.weekStart === "monday" && (
                  <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded font-semibold">
                    選択中
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                平日（月〜金）が連続し、週末（土・日）が末尾にまとまるビジネス標準の配置です。
              </div>
              <div className="mt-2.5 flex items-center gap-1 font-mono text-xs">
                {["月", "火", "水", "木", "金"].map((d) => (
                  <span
                    key={d}
                    className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-700 font-medium"
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
              onClick={() => setDraftSettings((prev) => ({ ...prev, weekStart: "sunday" }))}
              className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                draftSettings.weekStart === "sunday"
                  ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">日曜始まり</span>
                {draftSettings.weekStart === "sunday" && (
                  <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded font-semibold">
                    選択中
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                一般的な日本の紙のカレンダー等で馴染みのある配置です。
              </div>
              <div className="mt-2.5 flex items-center gap-1 font-mono text-xs">
                <span className="w-6 h-6 flex items-center justify-center rounded bg-rose-50 border border-rose-200 text-rose-600 font-semibold">
                  日
                </span>
                {["月", "火", "水", "木", "金"].map((d) => (
                  <span
                    key={d}
                    className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-700 font-medium"
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
          <label className="block text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>6. 日本の祝日表示（システム共通デフォルト設定）</span>
          </label>
          <p className="text-xs sm:text-sm text-slate-500">
            期日や開始日を選択するカレンダーおよびガントチャートで、日本の国民の祝日を赤字・祝日名ツールチップ付きで表示するかどうかのシステム共通デフォルトです。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() =>
                setDraftSettings((prev) => ({ ...prev, showHolidays: true }))
              }
              className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                draftSettings.showHolidays !== false
                  ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">祝日を表示する（推奨）</span>
                {draftSettings.showHolidays !== false && (
                  <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded font-semibold">
                    選択中
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                元日、成人の日、ゴールデンウィーク、振替休日などを赤文字およびツールチップで表示します。
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setDraftSettings((prev) => ({ ...prev, showHolidays: false }))
              }
              className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                draftSettings.showHolidays === false
                  ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">祝日を表示しない</span>
                {draftSettings.showHolidays === false && (
                  <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded font-semibold">
                    選択中
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                祝日の赤字判定を行わず、土日のみを休日の配色として扱います。
              </div>
            </button>
          </div>
        </div>

        {/* 7. 手動時刻オフセット補正 */}
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <label className="block text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <span>7. 時刻の手動オフセット補正（分単位の微調整）</span>
          </label>
          <p className="text-xs sm:text-sm text-slate-500">
            サーバー時計のズレを補正したい場合や、任意の時刻オフセットを加算・減算したい場合に設定します（通常は 0分 のままで問題ありません）。
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => adjustOffset(-60)}
              className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 cursor-pointer"
            >
              -1時間 (-60分)
            </button>
            <button
              type="button"
              onClick={() => adjustOffset(-10)}
              className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 cursor-pointer"
            >
              -10分
            </button>
            <button
              type="button"
              onClick={() => adjustOffset(-1)}
              className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 cursor-pointer"
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
                className="w-24 bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-center font-mono text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-slate-600">分</span>
            </div>

            <button
              type="button"
              onClick={() => adjustOffset(1)}
              className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 cursor-pointer"
            >
              +1分
            </button>
            <button
              type="button"
              onClick={() => adjustOffset(10)}
              className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 cursor-pointer"
            >
              +10分
            </button>
            <button
              type="button"
              onClick={() => adjustOffset(60)}
              className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 cursor-pointer"
            >
              +1時間 (+60分)
            </button>

            {draftSettings.timeOffsetMinutes !== 0 && (
              <button
                type="button"
                onClick={() =>
                  setDraftSettings((prev) => ({ ...prev, timeOffsetMinutes: 0 }))
                }
                className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-sm font-medium text-slate-600 cursor-pointer"
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
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>日本標準時 (JST) の初期設定に戻す</span>
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-semibold shadow-md shadow-indigo-500/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>{isSaving ? "保存中..." : "時刻設定を保存する"}</span>
          </button>
        </div>
      </div>
    </form>
  );
}
