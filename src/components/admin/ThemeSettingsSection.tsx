// デザイン・カラーテーマ設定セクション
"use client";

import React, { useState, useEffect } from "react";
import { Palette, Eye, Check, RotateCcw } from "lucide-react";
import { User, SystemSettings, ThemeId } from "@/types";
import { THEME_LIST, getThemeConfig } from "@/lib/themeConfig";

interface ThemeSettingsSectionProps {
  currentUser: User | null;
  settings: SystemSettings;
  updateSettings: (next: Partial<SystemSettings>) => Promise<SystemSettings>;
  previewTheme: ThemeId | null;
  setPreviewTheme: (themeId: ThemeId | null) => void;
  onSaveMessage: (msg: string | null) => void;
}

export default function ThemeSettingsSection({
  currentUser,
  settings,
  updateSettings,
  previewTheme,
  setPreviewTheme,
  onSaveMessage,
}: ThemeSettingsSectionProps) {
  // デザイン・カラーテーマ選択用State
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>(settings.theme || "cosmic");
  const [isSavingTheme, setIsSavingTheme] = useState(false);

  // コンテキストの設定が読み込まれたらドラフトに同期
  useEffect(() => {
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
      onSaveMessage("デザインテーマの保存は管理者（Admin権限）のみ実行できます");
      return;
    }
    setIsSavingTheme(true);
    onSaveMessage(null);
    try {
      const updated = await updateSettings({ theme: selectedTheme });
      setPreviewTheme(null);
      const conf = getThemeConfig(updated.theme);
      onSaveMessage(`デザインテーマを「${conf.name}」に変更・保存しました！`);
      setTimeout(() => onSaveMessage(null), 5000);
    } catch {
      onSaveMessage("デザインテーマの保存に失敗しました");
    } finally {
      setIsSavingTheme(false);
    }
  };

  // 試着プレビューの解除（元に戻す）
  const handleResetThemePreview = () => {
    setSelectedTheme(settings.theme || "cosmic");
    setPreviewTheme(null);
  };

  return (
    <section className="bg-white rounded-xl shadow-xs border border-indigo-100/80 overflow-hidden">
      <div className="bg-slate-50/80 border-b border-indigo-100/60 px-6 py-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-indigo-600" />
          <h2 className="font-bold text-slate-800 text-base sm:text-lg">
            デザイン・カラーテーマ設定
          </h2>
        </div>
        <span className="text-xs sm:text-sm text-slate-500">
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
                        <span className="font-bold text-slate-900 text-base">{theme.name}</span>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                        )}
                      </div>
                      <span className="text-xs text-slate-400 font-mono">
                        {theme.englishName}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {theme.badge && (
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
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
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
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
                          className="w-4 h-4 rounded flex items-center justify-center text-[10px]"
                        >
                          ★
                        </div>
                        <span className="text-xs font-extrabold tracking-tight">
                          litelog
                        </span>
                      </div>
                      <div
                        style={{ background: theme.palette.primaryBtn }}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold shadow-2xs"
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
                      <span
                        className="text-xs text-slate-500 font-medium"
                        style={{ color: theme.id === "dark" ? "#94a3b8" : undefined }}
                      >
                        {theme.hasGradient ? "多層グラデーション" : "ソリッド（グラデなし）"}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed">
                    {theme.description}
                  </p>
                </div>

                {/* カード下部: 選択ボタン */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-indigo-600 font-semibold flex items-center gap-1">
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
            <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <span>選択中のテーマ:</span>
              <span className="text-indigo-600 font-extrabold">
                {getThemeConfig(selectedTheme).name}
              </span>
              {previewTheme && previewTheme !== settings.theme && (
                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold px-1.5 py-0.5 rounded-full">
                  試着プレビュー中
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              「このデザインを保存する」をクリックすると、ワークスペース全体の標準デザインとして反映されます。
            </p>
          </div>

          <div className="flex items-center gap-2">
            {previewTheme && (
              <button
                type="button"
                onClick={handleResetThemePreview}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-sm font-medium text-slate-700 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>試着を解除</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveTheme}
              disabled={isSavingTheme}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm shadow-xs transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{isSavingTheme ? "保存中..." : "このデザインを保存する"}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
