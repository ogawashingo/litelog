// メンションサジェスト機能付きテキストエリアコンポーネント
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { User } from "@/types";
import { getUserInitials } from "./UserManageModal";
import { Crown } from "lucide-react";

interface MentionTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  users: User[];
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
}

export default function MentionTextarea({
  value,
  onChange,
  users,
  placeholder,
  rows = 3,
  className = "",
  disabled = false,
  ...rest
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // サジェスト表示状態
  const [isOpen, setIsOpen] = useState(false);
  // サジェスト絞り込みクエリ
  const [query, setQuery] = useState("");
  // メンション開始インデックス（@ の位置）
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  // 選択中の候補インデックス
  const [selectedIndex, setSelectedIndex] = useState(0);

  // クエリによるユーザー候補の絞り込み
  const filteredUsers = React.useMemo(() => {
    if (!isOpen) return [];
    const q = query.toLowerCase();
    return users.filter(
      (u) =>
        u.login_id.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        (u.role && u.role.toLowerCase().includes(q))
    );
  }, [isOpen, query, users]);

  // 入力値変更時のメンション検知
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    onChange(newValue);

    // カーソル直前のテキストを解析して @ メンションの入力中かをチェック
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex !== -1) {
      // @ の直前が空白文字・改行または行頭であるか確認（メールアドレス等の途中での誤爆防止）
      const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : " ";
      const isWordBoundary = /[\s\n(]/.test(charBeforeAt);

      const potentialQuery = textBeforeCursor.slice(atIndex + 1);
      // スペースや改行が含まれていない場合はクエリとして認識
      if (isWordBoundary && !/\s/.test(potentialQuery)) {
        setMentionStartIndex(atIndex);
        setQuery(potentialQuery);
        setIsOpen(true);
        setSelectedIndex(0);
        return;
      }
    }

    setIsOpen(false);
  };

  // 候補選択時のテキスト挿入処理
  const insertMention = useCallback(
    (user: User) => {
      if (mentionStartIndex === -1 || !textareaRef.current) return;

      const textarea = textareaRef.current;
      const cursorPos = textarea.selectionStart || 0;
      const beforeMention = value.slice(0, mentionStartIndex);
      const afterCursor = value.slice(cursorPos);

      // @login_id の後に半角スペースを付与して挿入
      const insertedText = `@${user.login_id} `;
      const nextValue = beforeMention + insertedText + afterCursor;
      const nextCursorPos = beforeMention.length + insertedText.length;

      onChange(nextValue);
      setIsOpen(false);
      setMentionStartIndex(-1);

      // フォーカスとカーソル位置を更新
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(nextCursorPos, nextCursorPos);
        }
      }, 0);
    },
    [mentionStartIndex, value, onChange]
  );

  // キーボード操作（上下移動、決定、Escキャンセル）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen || filteredUsers.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredUsers.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredUsers.length) % filteredUsers.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const selectedUser = filteredUsers[selectedIndex];
      if (selectedUser) {
        insertMention(selectedUser);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  // 外側クリックでサジェストを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={className}
        {...rest}
      />

      {/* メンション候補ポップアップ */}
      {isOpen && filteredUsers.length > 0 && (
        <div className="absolute left-0 bottom-full mb-1.5 w-72 max-h-56 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-1.5 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 border-b border-slate-100 flex items-center justify-between">
            <span>メンバーを選択 (@で補完)</span>
            <span className="text-[10px]">↑↓で選択 / Enterで決定</span>
          </div>
          {filteredUsers.map((user, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <button
                type="button"
                key={user.id}
                onMouseDown={(e) => {
                  e.preventDefault(); // フォーカス外れを防止
                  insertMention(user);
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors cursor-pointer ${
                  isSelected ? "bg-indigo-50/90 text-indigo-950" : "hover:bg-slate-50 text-slate-700"
                }`}
              >
                {/* ユーザーアバター */}
                <div className="relative shrink-0">
                  <div
                    style={{ backgroundColor: user.color || "#4f46e5" }}
                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-2xs shrink-0"
                  >
                    {getUserInitials(user.name)}
                  </div>
                  {Boolean(user.is_admin) && (
                    <span
                      title="Admin"
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 text-amber-950 flex items-center justify-center shadow-2xs border border-white"
                    >
                      <Crown className="w-2 h-2 stroke-[2.5]" />
                    </span>
                  )}
                </div>

                {/* 名前・ログインID */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs truncate">{user.name}</span>
                    {user.role && (
                      <span className="text-[10px] text-slate-400 truncate">({user.role})</span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-indigo-600 truncate">
                    @{user.login_id}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
