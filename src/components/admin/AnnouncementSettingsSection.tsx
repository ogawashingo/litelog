// ヘッダー一言通知（アナウンスメント）設定セクション
"use client";

import React, { useState, useEffect } from "react";
import { Megaphone, Check, CheckCircle2 } from "lucide-react";
import { getSafeErrorMessage } from "@/lib/clientError";
import {
  User,
  SystemSettings,
  AnnouncementType,
  ANNOUNCEMENT_TYPE_OPTIONS,
} from "@/types";

interface AnnouncementSettingsSectionProps {
  currentUser: User | null;
  settings: SystemSettings;
  updateSettings: (next: Partial<SystemSettings>) => Promise<SystemSettings>;
}

export default function AnnouncementSettingsSection({
  currentUser,
  settings,
  updateSettings,
}: AnnouncementSettingsSectionProps) {
  // 一言通知（アナウンスメント）設定用State
  const [announcementEnabled, setAnnouncementEnabled] = useState(
    settings.announcementEnabled || false
  );
  const [announcementMessage, setAnnouncementMessage] = useState(
    settings.announcementMessage || ""
  );
  const [announcementType, setAnnouncementType] = useState<AnnouncementType>(
    settings.announcementType || "info"
  );
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
  const [announcementSaveMessage, setAnnouncementSaveMessage] = useState<string | null>(null);

  // コンテキストの設定が読み込まれたらドラフトに同期
  useEffect(() => {
    setAnnouncementEnabled(settings.announcementEnabled || false);
    setAnnouncementMessage(settings.announcementMessage || "");
    setAnnouncementType(settings.announcementType || "info");
  }, [settings]);

  // 一言通知設定の保存ハンドラー
  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.is_admin) {
      setAnnouncementSaveMessage("一言通知の変更は管理者（Admin権限）のみ実行できます");
      return;
    }
    setIsSavingAnnouncement(true);
    setAnnouncementSaveMessage(null);
    try {
      await updateSettings({
        announcementEnabled,
        announcementMessage: announcementMessage.trim(),
        announcementType,
      });
      setAnnouncementSaveMessage("一言通知を保存・更新しました！全メンバーへ表示されます");
      setTimeout(() => setAnnouncementSaveMessage(null), 5000);
    } catch (err: unknown) {
      setAnnouncementSaveMessage(getSafeErrorMessage(err, "保存に失敗しました"));
    } finally {
      setIsSavingAnnouncement(false);
    }
  };

  return (
    <section
      id="announcement-section"
      className="bg-white rounded-xl shadow-xs border border-indigo-100/80 overflow-hidden"
    >
      <div className="bg-slate-50/80 border-b border-indigo-100/60 px-6 py-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-indigo-600" />
          <h2 className="font-bold text-slate-800 text-base sm:text-lg">
            ヘッダー一言通知（アナウンスメント）設定
          </h2>
        </div>
        <span className="text-xs sm:text-sm text-slate-500">
          全画面のヘッダー直下に表示する全体連絡・作業告知を設定できます
        </span>
      </div>

      <form onSubmit={handleSaveAnnouncement} className="p-6 space-y-6">
        {/* 有効/無効 トグルスイッチ */}
        <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200/80 rounded-xl">
          <div>
            <div className="font-semibold text-slate-800 text-sm sm:text-base flex items-center gap-2">
              <span>一言通知を表示する</span>
              {announcementEnabled ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                  有効
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-600">
                  無効
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              スイッチをONにすると、ログイン中の全メンバーのヘッダー直下にメッセージが表示されます
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={announcementEnabled}
              onChange={(e) => setAnnouncementEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-hidden peer-focus:ring-2 peer-focus:ring-indigo-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {/* 通知種別（タイプ）選択 */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-slate-700">
            通知タイプ（スタイル）
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ANNOUNCEMENT_TYPE_OPTIONS.map((opt) => {
              const isSelected = announcementType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAnnouncementType(opt.value)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                    isSelected
                      ? "border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20 shadow-xs"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-800">{opt.badge}</span>
                    {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
                  </div>
                  <span className="text-xs text-slate-500 leading-normal">
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* メッセージ入力エリア */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-bold text-slate-700">
              通知メッセージ本文
            </label>
            <span className="text-xs text-slate-400">
              Markdown、URLリンク、課題キーに対応
            </span>
          </div>
          <textarea
            value={announcementMessage}
            onChange={(e) => setAnnouncementMessage(e.target.value)}
            rows={2}
            placeholder="例: 【メンテ告知】本日 18:00〜18:30 にバックアップおよびサーバー更新作業を実施します。"
            className="w-full text-sm rounded-xl border border-slate-300 px-3.5 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* リアルタイム表示プレビュー */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-slate-700">
            ヘッダー直下での表示プレビュー
          </label>
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-900 shadow-inner">
            {/* ヘッダー風のモックバー */}
            <div className="h-9 bg-slate-950 px-3.5 flex items-center justify-between border-b border-white/10 text-xs text-white/70">
              <span>litelog ヘッダー</span>
              <span className="text-xs">プレビュー</span>
            </div>
            {/* アナウンスメントバーのプレビュー */}
            {announcementEnabled && announcementMessage.trim() ? (
              <div className="p-0">
                <div
                  className={`px-3.5 py-2.5 text-sm flex items-center justify-between gap-3 ${
                    announcementType === "warning"
                      ? "bg-gradient-to-r from-amber-600 via-amber-500 to-orange-600 text-white"
                      : announcementType === "alert"
                      ? "bg-gradient-to-r from-rose-600 via-rose-500 to-red-600 text-white"
                      : announcementType === "success"
                      ? "bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-600 text-white"
                      : "bg-gradient-to-r from-sky-600 via-sky-500 to-indigo-600 text-white"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border bg-white/20 text-white border-white/35">
                      {ANNOUNCEMENT_TYPE_OPTIONS.find((o) => o.value === announcementType)
                        ?.badge || "お知らせ"}
                    </span>
                    <span className="truncate text-sm font-medium text-white">
                      {announcementMessage}
                    </span>
                  </div>
                  <div className="text-white/80 text-xs">× (閉じる)</div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-sm text-slate-400">
                通知が無効、またはメッセージが空のため、ヘッダー直下には何も表示されません。
              </div>
            )}
          </div>
        </div>

        {/* 保存・更新ボタン ＆ 保存完了メッセージ */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="text-xs sm:text-sm text-slate-500">
            保存すると、一度通知を閉じたメンバーにも新しい更新として再表示されます。
          </div>
          <div className="flex items-center gap-3">
            {announcementSaveMessage && (
              <span className="text-sm font-bold text-emerald-600 flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {announcementSaveMessage}
              </span>
            )}
            <button
              type="submit"
              disabled={isSavingAnnouncement}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isSavingAnnouncement ? "保存中..." : "一言通知を保存・更新"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
