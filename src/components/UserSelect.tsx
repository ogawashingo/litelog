// メンバー検索機能付きユーザー選択（Combobox）コンポーネント
"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X, User as UserIcon } from "lucide-react";
import { User } from "@/types";
import { getUserInitials } from "./UserManageModal";

interface UserSelectProps {
  users: User[];
  value: number | string | null | undefined;
  onChange: (userId: number | null) => void;
  currentUserId?: number | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export default function UserSelect({
  users,
  value,
  onChange,
  currentUserId,
  placeholder = "未割当",
  disabled = false,
  className = "",
  size = "md",
}: UserSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 数値化された現在の選択ID
  const selectedId = value ? Number(value) : null;
  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedId) || null,
    [users, selectedId]
  );

  // 外側クリックでドロップダウンを閉じる
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  // ドロップダウンが開いたら検索欄に自動フォーカスし、クエリをリセット
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // 検索クエリによるインクリメンタル絞り込み（名前・ログインID・役割）
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase().trim();
    return users.filter((u) => {
      const matchName = u.name.toLowerCase().includes(q);
      const matchLogin = u.login_id ? u.login_id.toLowerCase().includes(q) : false;
      const matchRole = u.role ? u.role.toLowerCase().includes(q) : false;
      return matchName || matchLogin || matchRole;
    });
  }, [users, searchQuery]);

  const handleSelect = (userId: number | null) => {
    onChange(userId);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* 選択トリガーボタン */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 transition-all text-left ${
          size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-2 text-xs"
        } ${
          disabled
            ? "bg-slate-100 opacity-70 cursor-not-allowed"
            : "hover:border-indigo-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          {selectedUser ? (
            <>
              <span
                style={{ backgroundColor: selectedUser.color || "#4f46e5" }}
                className="w-4 h-4 rounded-full text-white flex items-center justify-center text-[9px] font-bold shrink-0"
              >
                {getUserInitials(selectedUser.name)}
              </span>
              <span className="truncate font-medium">{selectedUser.name}</span>
              {currentUserId === selectedUser.id && (
                <span className="text-[10px] text-slate-400 shrink-0">(自分)</span>
              )}
            </>
          ) : (
            <span className="text-slate-400 font-normal">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
            isOpen ? "rotate-180 text-indigo-600" : ""
          }`}
        />
      </button>

      {/* ドロップダウンメニュー */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 min-w-[220px] max-w-xs bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 text-xs animate-in fade-in zoom-in-95 duration-100">
          {/* 検索入力バー */}
          <div className="px-2 pb-1.5 border-b border-slate-100">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="メンバー名・IDで絞り込み..."
                className="w-full pl-7 pr-6 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 p-0.5 text-slate-400 hover:text-slate-600 rounded-sm cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* メンバーリスト */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-50 py-1">
            {/* 未割当オプション */}
            {!searchQuery && (
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors cursor-pointer ${
                  selectedId === null
                    ? "bg-indigo-50 text-indigo-700 font-bold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full border border-dashed border-slate-300 text-slate-400 flex items-center justify-center text-[10px]">
                    <UserIcon className="w-3 h-3" />
                  </div>
                  <span>{placeholder}</span>
                </div>
                {selectedId === null && <Check className="w-3.5 h-3.5 text-indigo-600" />}
              </button>
            )}

            {filteredUsers.length === 0 ? (
              <div className="px-3 py-3 text-center text-slate-400 text-[11px]">
                一致するメンバーがいません
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isSelected = selectedId === user.id;
                const isMe = currentUserId === user.id;

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelect(user.id)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-indigo-50 text-indigo-700 font-bold"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        style={{ backgroundColor: user.color || "#4f46e5" }}
                        className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[10px] font-bold shrink-0"
                      >
                        {getUserInitials(user.name)}
                      </span>
                      <div className="min-w-0 truncate">
                        <span className="truncate">{user.name}</span>
                        {isMe && <span className="ml-1 text-[10px] text-slate-400 font-normal">(自分)</span>}
                        {user.role && (
                          <span className="ml-1.5 text-[10px] text-slate-400 font-normal">
                            ({user.role})
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
