// リッチテキストツールバー＆プレビュー切替＆メンションサジェスト機能付きエディタコンポーネント
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { User } from "@/types";
import { getUserInitials } from "./UserManageModal";
import MentionText from "./MentionText";
import {
  Crown,
  Bold,
  Italic,
  Strikethrough,
  Heading,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  FileCode,
  Link as LinkIcon,
  AtSign,
  Eye,
  Edit3,
  HelpCircle,
  X,
} from "lucide-react";

interface MentionTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  users: User[];
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  showToolbar?: boolean;
}

export default function MentionTextarea({
  value,
  onChange,
  users,
  placeholder,
  rows = 3,
  className = "",
  disabled = false,
  showToolbar = true,
  ...rest
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 表示モード（編集 vs プレビュー）
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  // ヘルプ表示状態
  const [showHelp, setShowHelp] = useState(false);

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

  // ツールバーのアクション適用関数（選択範囲の前後を囲む、または行頭に挿入）
  const applyFormat = useCallback(
    (prefix: string, suffix: string = "", defaultText: string = "", isBlock: boolean = false) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.slice(start, end);

      let insertText = "";
      let newSelectionStart = start;
      let newSelectionEnd = end;

      if (isBlock) {
        // 行頭挿入（見出し、リスト、引用など）
        const beforeSelection = value.slice(0, start);
        const lastNewline = beforeSelection.lastIndexOf("\n");
        const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;

        const linePrefix = value.slice(lineStart, start);
        const lineContent = linePrefix + (selected || defaultText);

        const newText = prefix + lineContent + suffix;
        const nextValue = value.slice(0, lineStart) + newText + value.slice(end);

        newSelectionStart = lineStart + prefix.length;
        newSelectionEnd = newSelectionStart + (selected || defaultText).length;

        onChange(nextValue);
      } else {
        // インライン装飾（太字、斜体、コード、リンク等）
        const textToWrap = selected || defaultText;
        insertText = `${prefix}${textToWrap}${suffix}`;

        const nextValue = value.slice(0, start) + insertText + value.slice(end);

        if (selected) {
          newSelectionStart = start + prefix.length;
          newSelectionEnd = newSelectionStart + selected.length;
        } else {
          // デフォルトテキストの場合はそれを選択状態に
          newSelectionStart = start + prefix.length;
          newSelectionEnd = newSelectionStart + defaultText.length;
        }

        onChange(nextValue);
      }

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newSelectionStart, newSelectionEnd);
        }
      }, 0);
    },
    [value, onChange]
  );

  // ツールバーボタンごとの処理
  const handleBold = () => applyFormat("**", "**", "太字");
  const handleItalic = () => applyFormat("*", "*", "斜体");
  const handleStrike = () => applyFormat("~~", "~~", "打ち消し");
  const handleHeading = () => applyFormat("### ", "", "見出し", true);
  const handleUnorderedList = () => applyFormat("- ", "", "リスト項目", true);
  const handleOrderedList = () => applyFormat("1. ", "", "番号付き項目", true);
  const handleTaskList = () => applyFormat("- [ ] ", "", "タスク項目", true);
  const handleQuote = () => applyFormat("> ", "", "引用文", true);
  const handleInlineCode = () => applyFormat("`", "`", "code");
  const handleCodeBlock = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const before = value.slice(0, start);
    const after = value.slice(end);

    const prefix = before.endsWith("\n") || before === "" ? "" : "\n";
    const suffix = after.startsWith("\n") || after === "" ? "" : "\n";
    const code = selected || "// コードをここに入力";
    const insert = `${prefix}\`\`\`\n${code}\n\`\`\`${suffix}`;

    const nextVal = before + insert + after;
    onChange(nextVal);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const cursor = before.length + prefix.length + 4;
        textareaRef.current.setSelectionRange(cursor, cursor + code.length);
      }
    }, 0);
  };
  const handleLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    applyFormat("[", "](https://)", selected || "リンクテキスト");
  };
  const handleTriggerMention = () => {
    applyFormat("@", "", "");
  };

  // キーボード操作（上下移動、決定、Escキャンセル、ショートカットキー）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ショートカットキー対応 (Cmd/Ctrl + B, I, K)
    if ((e.metaKey || e.ctrlKey) && !isOpen) {
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        handleBold();
        return;
      }
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        handleItalic();
        return;
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        handleLink();
        return;
      }
    }

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

  // 外側クリックでサジェストやヘルプを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowHelp(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full flex flex-col rounded-lg border border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-200 transition-all bg-white shadow-2xs">
      {/* ツールバー＆タブヘッダー */}
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-1 px-2.5 py-1.5 bg-slate-50 border-b border-slate-200 rounded-t-lg select-none">
          {/* 左側: 書式ツールバー（編集モード時のみ有効） */}
          <div className="flex flex-wrap items-center gap-0.5">
            {activeTab === "edit" ? (
              <>
                <button
                  type="button"
                  onClick={handleBold}
                  title="太字 (Cmd/Ctrl+B)"
                  disabled={disabled}
                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded transition-colors"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleItalic}
                  title="斜体 (Cmd/Ctrl+I)"
                  disabled={disabled}
                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded transition-colors"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleStrike}
                  title="取り消し線"
                  disabled={disabled}
                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded transition-colors"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>
                <div className="w-[1px] h-3.5 bg-slate-300 mx-1 self-center" />
                <button
                  type="button"
                  onClick={handleHeading}
                  title="見出し"
                  disabled={disabled}
                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded transition-colors"
                >
                  <Heading className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleUnorderedList}
                  title="箇条書きリスト"
                  disabled={disabled}
                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded transition-colors"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleOrderedList}
                  title="番号付きリスト"
                  disabled={disabled}
                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded transition-colors"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleTaskList}
                  title="タスク・チェックリスト"
                  disabled={disabled}
                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded transition-colors"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                </button>
                <div className="w-[1px] h-3.5 bg-slate-300 mx-1 self-center" />
                <button
                  type="button"
                  onClick={handleQuote}
                  title="引用"
                  disabled={disabled}
                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded transition-colors"
                >
                  <Quote className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleInlineCode}
                  title="インラインコード"
                  disabled={disabled}
                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded transition-colors"
                >
                  <Code className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleCodeBlock}
                  title="コードブロック"
                  disabled={disabled}
                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded transition-colors"
                >
                  <FileCode className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleLink}
                  title="リンク挿入 (Cmd/Ctrl+K)"
                  disabled={disabled}
                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded transition-colors"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleTriggerMention}
                  title="メンバーをメンション (@)"
                  disabled={disabled}
                  className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                >
                  <AtSign className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <span className="text-[11px] font-medium text-slate-500 py-0.5 px-1">
                プレビュー表示中（Markdownがレンダリングされています）
              </span>
            )}
          </div>

          {/* 右側: 編集 / プレビュー切替タブ & ヘルプ */}
          <div className="flex items-center gap-1 ml-auto">
            <div className="flex items-center bg-slate-200/70 p-0.5 rounded-md text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("edit")}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  activeTab === "edit"
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Edit3 className="w-3 h-3" />
                <span>編集</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  activeTab === "preview"
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>プレビュー</span>
              </button>
            </div>

            {/* 書式ヘルプボタン */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowHelp((prev) => !prev)}
                title="Markdown書式ガイド"
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/70 rounded transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>

              {/* ヘルプポップオーバー */}
              {showHelp && (
                <div className="absolute right-0 top-full mt-1.5 w-64 p-3 bg-slate-900 text-white rounded-lg shadow-xl text-xs z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-700">
                    <span className="font-semibold text-slate-200 text-[11px]">Markdown記法ガイド</span>
                    <button
                      type="button"
                      onClick={() => setShowHelp(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-1.5 font-mono text-[11px] text-slate-300">
                    <div className="flex justify-between">
                      <span>**太字**</span>
                      <span className="font-sans text-slate-400">太字</span>
                    </div>
                    <div className="flex justify-between">
                      <span>*斜体*</span>
                      <span className="font-sans text-slate-400">斜体</span>
                    </div>
                    <div className="flex justify-between">
                      <span>~~打ち消し~~</span>
                      <span className="font-sans text-slate-400">取り消し</span>
                    </div>
                    <div className="flex justify-between">
                      <span># 見出し</span>
                      <span className="font-sans text-slate-400">大見出し</span>
                    </div>
                    <div className="flex justify-between">
                      <span>- 箇条書き</span>
                      <span className="font-sans text-slate-400">リスト</span>
                    </div>
                    <div className="flex justify-between">
                      <span>- [ ] タスク</span>
                      <span className="font-sans text-slate-400">チェック</span>
                    </div>
                    <div className="flex justify-between">
                      <span>&gt; 引用</span>
                      <span className="font-sans text-slate-400">引用枠</span>
                    </div>
                    <div className="flex justify-between">
                      <span>`コード`</span>
                      <span className="font-sans text-slate-400">インライン</span>
                    </div>
                    <div className="flex justify-between">
                      <span>[表示名](URL)</span>
                      <span className="font-sans text-slate-400">リンク</span>
                    </div>
                    <div className="flex justify-between">
                      <span>@ユーザーID</span>
                      <span className="font-sans text-slate-400">メンション</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* エディタ本体（編集 vs プレビュー） */}
      {activeTab === "edit" ? (
        <div className="relative w-full">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
            className={`w-full p-2.5 bg-transparent border-0 outline-none text-slate-800 placeholder-slate-400 text-sm leading-relaxed resize-y ${className}`}
            {...rest}
          />
        </div>
      ) : (
        <div
          className={`w-full p-3 bg-white text-sm leading-relaxed overflow-y-auto ${className}`}
          style={{ minHeight: `${rows * 1.5 + 1}rem` }}
        >
          {value ? (
            <MentionText text={value} users={users} />
          ) : (
            <p className="text-slate-400 italic text-sm">（プレビューするテキストがありません）</p>
          )}
        </div>
      )}

      {/* メンション候補サジェストポップアップ */}
      {isOpen && filteredUsers.length > 0 && activeTab === "edit" && (
        <div className="absolute z-50 left-2 bottom-full mb-1 w-64 max-h-56 overflow-y-auto bg-white rounded-lg shadow-xl border border-slate-200 py-1 text-xs animate-in fade-in duration-100">
          <div className="px-2.5 py-1 text-[10px] font-semibold text-slate-400 border-b border-slate-100 flex items-center justify-between">
            <span>メンバーを選択 (@)</span>
            <span className="text-[9px] text-slate-400">↑↓で移動 / Enterで確定</span>
          </div>
          {filteredUsers.map((user, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => insertMention(user)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full px-2.5 py-1.5 flex items-center gap-2 text-left transition-colors ${
                  isSelected ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div
                  style={{ backgroundColor: user.color || "#4f46e5" }}
                  className="w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[10px] shrink-0 shadow-2xs"
                >
                  {getUserInitials(user.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold truncate">{user.name}</span>
                    {user.is_admin === 1 && (
                      <Crown className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">@{user.login_id}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
