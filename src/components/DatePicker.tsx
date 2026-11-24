// 日付選択カレンダー（月曜始まり / 日曜始まり切替対応）コンポーネント
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
  RotateCcw,
} from "lucide-react";
import { useUser } from "./UserContext";
import {
  parseDateString,
  getCalendarMonthDays,
  getWeekdayLabels,
  getTodayDateString,
  formatDueDateDisplay,
} from "@/lib/dateUtils";
import { WeekStartDay } from "@/types";

export interface DatePickerProps {
  value: string | null;
  onChange: (nextDate: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  badge?: React.ReactNode;
  statusHighlight?: "overdue" | "today" | "normal" | "none";
  allowClear?: boolean;
  ariaLabel?: string;
  fullWidth?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "日付を設定",
  disabled = false,
  className = "",
  badge,
  statusHighlight = "none",
  allowClear = true,
  ariaLabel,
  fullWidth = false,
}: DatePickerProps) {
  const {
    settings,
    updateSettings,
    currentUser,
    updateUserWeekStart,
    effectiveWeekStart,
    effectiveShowHolidays,
    updateUserShowHolidays,
  } = useUser();
  const weekStart: WeekStartDay = effectiveWeekStart || "monday";
  const showHolidays = effectiveShowHolidays;

  // ポップアップの開閉状態
  const [isOpen, setIsOpen] = useState(false);

  // カレンダーの表示年月（1〜12）
  const [viewYear, setViewYear] = useState<number>(() => {
    if (value) {
      return parseDateString(value).getFullYear();
    }
    return new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    if (value) {
      return parseDateString(value).getMonth() + 1;
    }
    return new Date().getMonth() + 1;
  });

  // ポップアップの描画位置
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // 今日の日付文字列
  const todayStr = getTodayDateString(settings);

  // カレンダーを開く際に、選択中の日付（または今日）の年月に合わせる
  const handleOpen = () => {
    if (disabled) return;
    if (value) {
      const d = parseDateString(value);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth() + 1);
    } else {
      const now = new Date();
      setViewYear(now.getFullYear());
      setViewMonth(now.getMonth() + 1);
    }
    updatePopupPosition();
    setIsOpen(true);
  };

  // トリガー要素の位置からポップアップ位置を計算
  const updatePopupPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popupWidth = 280;
    const popupHeight = 360;

    let top = rect.bottom + 6;
    let left = rect.left;

    // 画面下端からはみ出す場合は上側に表示
    if (top + popupHeight > window.innerHeight && rect.top - popupHeight > 0) {
      top = rect.top - popupHeight - 6;
    }

    // 画面右端からはみ出す場合は左側に寄せる
    if (left + popupWidth > window.innerWidth) {
      left = Math.max(8, window.innerWidth - popupWidth - 12);
    }

    setPopupPos({ top, left });
  }, []);

  // 開いている間のリサイズ・スクロール連動
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowChange = () => {
      updatePopupPosition();
    };

    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [isOpen, updatePopupPosition]);

  // 外側クリックおよびESCキーでポップアップを閉じる
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        popupRef.current &&
        !popupRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // 前月へ移動
  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  // 次月へ移動
  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // 今月・今日へジャンプ
  const handleGoToToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth() + 1);
  };

  // 日付クリック時のハンドラ
  const handleSelectDate = (dateStr: string) => {
    onChange(dateStr);
    setIsOpen(false);
  };

  // クリアハンドラ
  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange(null);
    setIsOpen(false);
  };

  // 週開始曜日の切り替え（月曜始まり ⇔ 日曜始まり）
  const toggleWeekStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStart: WeekStartDay = weekStart === "monday" ? "sunday" : "monday";
    if (currentUser?.id) {
      await updateUserWeekStart(currentUser.id, nextStart);
    }
    await updateSettings({ weekStart: nextStart });
  };

  // 日本の祝日表示の切り替え（ON ⇔ OFF）
  const toggleShowHolidays = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextVal = !showHolidays;
    if (currentUser?.id) {
      await updateUserShowHolidays(currentUser.id, nextVal);
    }
    await updateSettings({ showHolidays: nextVal });
  };

  // カレンダーセル一覧と曜日ラベルを算出
  const weekdayLabels = getWeekdayLabels(weekStart);
  const calendarDays = getCalendarMonthDays(viewYear, viewMonth, weekStart, todayStr);

  // ステータスに応じた色設定
  const getTriggerStyle = () => {
    if (statusHighlight === "overdue") {
      return "border-rose-300 bg-rose-50/80 text-rose-700 font-bold hover:bg-rose-100/80";
    }
    if (statusHighlight === "today") {
      return "border-amber-300 bg-amber-50/80 text-amber-700 font-bold hover:bg-amber-100/80";
    }
    if (value) {
      return "border-slate-300 bg-white text-slate-800 hover:border-slate-400";
    }
    return "border-dashed border-slate-300 bg-slate-50/60 text-slate-400 hover:bg-white hover:border-slate-400";
  };

  return (
    <div
      className={`relative ${
        fullWidth ? "flex w-full" : "inline-flex"
      } items-center gap-1.5 ${className}`}
    >
      {/* 日付入力トリガーボタン */}
      <div
        ref={triggerRef}
        onClick={handleOpen}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel || placeholder}
        className={`flex items-center gap-1.5 text-sm py-1.5 px-3 border rounded-lg cursor-pointer transition-colors select-none ${
          fullWidth ? "w-full justify-between" : ""
        } ${getTriggerStyle()} ${
          disabled ? "opacity-60 cursor-not-allowed" : ""
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <CalendarIcon className="w-3.5 h-3.5 shrink-0 opacity-70" />
          <span className="font-mono truncate">{value ? formatDueDateDisplay(value) : placeholder}</span>
        </div>

        {/* クリアボタン（値が設定されており、disabledでない場合） */}
        {value && allowClear && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            title="日付を解除"
            className="text-slate-400 hover:text-rose-600 p-0.5 rounded hover:bg-slate-200/60 transition-colors ml-1 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 外部バッジ（残日数・超過日数など） */}
      {badge}

      {/* カレンダーポップアップ（React Portal で最前面に描画） */}
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popupRef}
            style={{
              position: "fixed",
              top: `${popupPos.top}px`,
              left: `${popupPos.left}px`,
              zIndex: 9999,
            }}
            className="w-[280px] bg-white rounded-xl shadow-2xl border border-slate-200 p-3 text-slate-700 select-none animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ポップアップヘッダー（年月・ナビゲーション・月曜/日曜始まり切替） */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  title="前月へ"
                  className="p-1 rounded-md hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-slate-800 px-1">
                  {viewYear}年 {viewMonth}月
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  title="次月へ"
                  className="p-1 rounded-md hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                {/* 祝日表示トグル（ON ⇔ OFF） */}
                <button
                  type="button"
                  onClick={toggleShowHolidays}
                  title={`日本の祝日表示: ${showHolidays ? "ON (赤字・祝日名表示)" : "OFF"}（クリックで切替）`}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer ${
                    showHolidays
                      ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                      : "bg-slate-50 text-slate-400 border-slate-200 hover:text-slate-600"
                  }`}
                >
                  祝{showHolidays ? "ON" : "OFF"}
                </button>

                {/* 週開始曜日トグル（月曜始まり ⇔ 日曜始まり） */}
                <button
                  type="button"
                  onClick={toggleWeekStart}
                  title={`現在: ${weekStart === "monday" ? "月曜始まり" : "日曜始まり"}（クリックで切替）`}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 text-slate-600 border-slate-200"
                >
                  <span>{weekStart === "monday" ? "月始" : "日始"}</span>
                  <RotateCcw className="w-2.5 h-2.5 opacity-60" />
                </button>
              </div>
            </div>

            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1 text-xs font-semibold">
              {weekdayLabels.map((lbl, idx) => (
                <div
                  key={idx}
                  className={`py-0.5 ${
                    lbl.isSunday
                      ? "text-rose-500 font-bold"
                      : lbl.isSaturday
                      ? "text-blue-500 font-bold"
                      : "text-slate-500"
                  }`}
                >
                  {lbl.name}
                </div>
              ))}
            </div>

            {/* 日付グリッド (42セル) */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarDays.map((cell, idx) => {
                const isSelected = cell.dateString === value;
                const isHoliday = Boolean(showHolidays && cell.holidayName);

                // セルの文字色・背景色決定
                let cellClass = "hover:bg-indigo-50 cursor-pointer";
                if (isSelected) {
                  cellClass = "bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-sm";
                } else if (!cell.isCurrentMonth) {
                  cellClass = "text-slate-300 hover:bg-slate-50 cursor-pointer";
                } else if (cell.isSunday || isHoliday) {
                  cellClass = "text-rose-600 font-medium hover:bg-rose-50";
                } else if (cell.isSaturday) {
                  cellClass = "text-blue-600 font-medium hover:bg-blue-50";
                } else {
                  cellClass = "text-slate-700 hover:bg-slate-100";
                }

                const tooltip =
                  cell.holidayName && showHolidays
                    ? `${cell.dateString} (${cell.holidayName})`
                    : cell.dateString;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectDate(cell.dateString)}
                    className={`h-7 w-7 mx-auto flex items-center justify-center rounded-md text-xs transition-colors relative ${cellClass} ${
                      cell.isToday && !isSelected
                        ? "ring-1 ring-indigo-500 font-bold"
                        : ""
                    }`}
                    title={tooltip}
                  >
                    <span>{cell.dayNumber}</span>
                    {isHoliday && cell.isCurrentMonth && !isSelected && (
                      <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-rose-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* ポップアップフッター（今日ボタン・クリア・閉じる） */}
            <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleGoToToday}
                  className="px-2 py-0.5 rounded text-indigo-600 hover:bg-indigo-50 font-semibold cursor-pointer transition-colors"
                >
                  今月へ
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectDate(todayStr)}
                  className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold cursor-pointer transition-colors"
                >
                  今日を選択
                </button>
              </div>

              <div className="flex items-center gap-1">
                {value && (
                  <button
                    type="button"
                    onClick={(e) => handleClear(e)}
                    className="px-1.5 py-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 font-semibold cursor-pointer transition-colors"
                  >
                    解除
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer transition-colors"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
