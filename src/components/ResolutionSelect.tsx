// Backlog本家ライクな検索機能付き完了理由（Resolution）セレクターコンポーネント
"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";
import { IssueResolution, RESOLUTION_OPTIONS, RESOLUTION_LABELS } from "@/types";

interface ResolutionSelectProps {
  value?: IssueResolution | null | "";
  onChange: (value: IssueResolution | null) => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  showClear?: boolean;
  placeholder?: string;
}

export default function ResolutionSelect({
  value,
  onChange,
  disabled = false,
  className = "",
  size = "md",
  showClear = true,
  placeholder = "--",
}: ResolutionSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const currentLabel = value ? RESOLUTION_LABELS[value as IssueResolution] || value : placeholder;

  // 検索クエリに応じた候補の絞り込み
  const filteredOptions = RESOLUTION_OPTIONS.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  // ドロップダウンが開いた時に検索入力へ自動フォーカス
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // 外側クリックでドロップダウンを閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (val: IssueResolution | null) => {
    onChange(val);
    setIsOpen(false);
  };

  const isSmall = size === "sm";

  return (
    <div ref={containerRef} className={`relative inline-block text-left w-full ${className}`}>
      {/* トリガーボタン（本家Backlogライクなグリーン枠・薄クリーム背景・三角矢印） */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-1.5 rounded border border-emerald-600 bg-amber-50/40 hover:bg-amber-50/70 text-slate-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          isSmall ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-xs font-medium"
        } ${isOpen ? "ring-2 ring-emerald-500/30 border-emerald-700" : ""}`}
        title={`完了理由: ${currentLabel}`}
      >
        <span className={`truncate ${!value ? "text-slate-500" : "font-medium text-slate-800"}`}>
          {currentLabel}
        </span>
        <span className="shrink-0 flex items-center text-emerald-700">
          <ChevronDown
            className={`transition-transform duration-150 ${isSmall ? "w-3.5 h-3.5" : "w-4 h-4"} ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      {/* ポップアップドロップダウンメニュー */}
      {isOpen && (
        <div className="absolute z-50 left-0 mt-1 w-full min-w-[160px] bg-white rounded-md shadow-lg border border-slate-300 overflow-hidden text-xs py-1.5 animate-in fade-in-0 zoom-in-95">
          {/* 検索入力欄（虫眼鏡アイコン付き） */}
          <div className="px-2 pb-1.5 pt-0.5">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="検索..."
                className="w-full bg-slate-50 border border-slate-300 rounded pl-7 pr-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 focus:bg-white"
                onClick={(e) => e.stopPropagation()}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-1.5 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {/* 未設定（クリア）選択肢 */}
            {showClear && !searchQuery && (
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 transition-colors cursor-pointer ${
                  !value ? "bg-slate-50 text-slate-900 font-semibold" : "text-slate-500"
                }`}
              >
                <span>-- （未設定）</span>
                {!value && <Check className="w-3.5 h-3.5 text-emerald-600" />}
              </button>
            )}

            {/* 選択肢リスト */}
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-emerald-50/80 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-emerald-50 text-emerald-900 font-semibold"
                        : "text-slate-700"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-center text-slate-400 text-xs">
                該当する理由がありません
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
