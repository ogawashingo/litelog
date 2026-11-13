// アバター・テーマカラー選択用共通コンポーネント（豊富なカラーパターンとカスタムピッカー対応）
"use client";

import React, { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, Palette, Sliders } from "lucide-react";
import {
  AVATAR_COLORS,
  getAvatarColorLabel,
} from "@/lib/avatarColors";

interface AvatarColorPickerProps {
  selectedColor: string;
  onChange: (color: string) => void;
  size?: "sm" | "md";
  mode?: "inline" | "popover";
  showLabel?: boolean;
  showCustomPicker?: boolean;
  className?: string;
}

export default function AvatarColorPicker({
  selectedColor,
  onChange,
  size = "md",
  mode = "inline",
  showLabel = true,
  showCustomPicker = true,
  className = "",
}: AvatarColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // ポップオーバーモード時の外側クリック検知
  useEffect(() => {
    if (mode !== "popover" || !isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [mode, isOpen]);

  const circleSizeClass =
    size === "sm" ? "w-5 h-5 min-w-[20px]" : "w-6.5 h-6.5 min-w-[26px]";
  const checkIconSizeClass = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  // カラーグリッド描画部分
  const renderColorGrid = () => (
    <div className="space-y-2.5">
      {/* プリセットカラーパレット一覧 */}
      <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5 p-1">
        {AVATAR_COLORS.map((col) => {
          const isSelected =
            selectedColor?.toLowerCase() === col.value.toLowerCase();
          return (
            <button
              key={col.value}
              type="button"
              onClick={() => {
                onChange(col.value);
                if (mode === "popover") setIsOpen(false);
              }}
              style={{ backgroundColor: col.value }}
              className={`${circleSizeClass} rounded-full transition-transform cursor-pointer flex items-center justify-center shrink-0 shadow-xs ${
                isSelected
                  ? "scale-110 ring-2 ring-offset-2 ring-slate-800 z-10"
                  : "opacity-80 hover:opacity-100 hover:scale-110 hover:shadow-sm"
              }`}
              title={`${col.label} (${col.value}) - ${col.group}`}
              aria-label={`${col.label} (${col.value})`}
            >
              {isSelected && (
                <Check
                  className={`${checkIconSizeClass} text-white stroke-[3] drop-shadow-sm`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* フッター情報: 選択中カラー名 ＆ カスタムピッカー */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80 text-[11px]">
        {showLabel && (
          <div className="flex items-center gap-1.5 min-w-0 bg-white/70 px-2 py-0.5 rounded border border-slate-200/60 shadow-2xs">
            <span
              style={{ backgroundColor: selectedColor || "#4f46e5" }}
              className="w-3 h-3 rounded-full shrink-0 shadow-2xs border border-white/60"
            />
            <span className="font-semibold text-slate-700 truncate">
              {getAvatarColorLabel(selectedColor)}
            </span>
          </div>
        )}

        {showCustomPicker && (
          <label
            className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 hover:text-slate-900 cursor-pointer bg-white hover:bg-slate-50 px-2.5 py-1 rounded-md border border-slate-300 shadow-2xs transition-colors shrink-0"
            title="自由なカラーを選択"
          >
            <input
              type="color"
              value={selectedColor || "#4f46e5"}
              onChange={(e) => onChange(e.target.value)}
              className="w-4 h-4 rounded border-0 p-0 cursor-pointer bg-transparent"
            />
            <Sliders className="w-3 h-3 text-slate-500" />
            <span>カスタム色</span>
          </label>
        )}
      </div>
    </div>
  );

  // ポップオーバーモード
  if (mode === "popover") {
    return (
      <div className={`relative inline-block ${className}`} ref={popoverRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs transition-colors shadow-2xs cursor-pointer"
          title={`カラー選択: ${getAvatarColorLabel(selectedColor)}`}
        >
          <span
            style={{ backgroundColor: selectedColor || "#4f46e5" }}
            className="w-4 h-4 rounded-full shrink-0 shadow-2xs border border-white/50"
          />
          {showLabel && (
            <span className="text-[11px] font-semibold text-slate-800 max-w-[110px] truncate">
              {getAvatarColorLabel(selectedColor)}
            </span>
          )}
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>

        {isOpen && (
          <div className="absolute left-0 top-full mt-1.5 z-50 p-2.5 bg-white border border-slate-300 rounded-lg shadow-xl w-[280px] sm:w-[320px] animate-in fade-in zoom-in-95 duration-100">
            <div className="text-[11px] font-bold text-slate-600 mb-1.5 flex items-center gap-1.5 pb-1 border-b border-slate-100">
              <Palette className="w-3.5 h-3.5 text-indigo-600" />
              <span>アバターのカラーパターンを選択</span>
            </div>
            {renderColorGrid()}
          </div>
        )}
      </div>
    );
  }

  // インラインモード
  return <div className={className}>{renderColorGrid()}</div>;
}
