// リッチテキストツールバー＆プレビュー切替＆メンションサジェスト機能付きエディタコンポーネント
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { User, Attachment } from "@/types";
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
  Paperclip,
  Image as ImageIcon,
  Loader2,
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
  issueId?: number; // 紐づける課題ID（任意）
  onAttachmentUploaded?: (attachment: Attachment) => void; // アップロード完了時コールバック
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
  issueId,
  onAttachmentUploaded,
  ...rest
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ファイルアップロード状態
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

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

  // クエリによるユーザー候補の絞り込み＆関連度ソート（前方一致・ログインID優先）
  const filteredUsers = React.useMemo(() => {
    if (!isOpen) return [];
    const q = query.toLowerCase().trim();
    if (!q) {
      // クエリ未入力時は名前順
      return [...users].sort((a, b) => a.name.localeCompare(b.name, "ja"));
    }

    // 各ユーザーのスコアを計算（完全一致 > 前方一致 > 部分一致）
    const scored: { user: User; score: number }[] = [];
    for (const u of users) {
      const name = u.name.toLowerCase();
      const login = (u.login_id || "").toLowerCase();
      const role = (u.role || "").toLowerCase();

      let score = 0;
      if (login === q || name === q) {
        score = 100; // 完全一致
      } else if (login.startsWith(q)) {
        score = 80; // ログインID前方一致
      } else if (name.startsWith(q)) {
        score = 70; // 名前前方一致
      } else if (login.includes(q)) {
        score = 50; // ログインID部分一致
      } else if (name.includes(q)) {
        score = 40; // 名前部分一致
      } else if (role.includes(q)) {
        score = 20; // 役職部分一致
      }

      if (score > 0) {
        scored.push({ user: u, score });
      }
    }

    scored.sort((a, b) => b.score - a.score || a.user.name.localeCompare(b.user.name, "ja"));
    return scored.map((s) => s.user);
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

  // ファイルアップロード共通処理
  const uploadFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadError("");

    try {
      const formData = new FormData();
      if (issueId) {
        formData.append("issueId", String(issueId));
      }
      for (const file of files) {
        formData.append("file", file);
      }

      const res = await fetch("/api/attachments", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        setUploadError(err.error || "ファイルのアップロードに失敗しました");
        return;
      }

      const data = await res.json();
      const attachmentsList: Attachment[] = data.attachments || [data];

      // Markdown テキストをカーソル位置または末尾に挿入
      const markdownToInsert = attachmentsList
        .map((att) => {
          const isImg = att.mime_type.startsWith("image/");
          return isImg
            ? `\n![${att.file_name}](${att.url})\n`
            : `\n[${att.file_name}](${att.url})\n`;
        })
        .join("");

      if (textareaRef.current) {
        const ta = textareaRef.current;
        const start = ta.selectionStart || 0;
        const end = ta.selectionEnd || 0;
        const before = value.slice(0, start);
        const after = value.slice(end);
        const nextVal = before + markdownToInsert + after;
        onChange(nextVal);
        setTimeout(() => {
          ta.focus();
          const newPos = start + markdownToInsert.length;
          ta.setSelectionRange(newPos, newPos);
        }, 50);
      } else {
        onChange(value + (value ? "\n" : "") + markdownToInsert);
      }

      if (onAttachmentUploaded) {
        for (const att of attachmentsList) {
          onAttachmentUploaded(att);
        }
      }
    } catch (err) {
      console.error("アップロードエラー:", err);
      setUploadError("通信エラーによりアップロードに失敗しました");
    } finally {
      setIsUploading(false);
    }
  };

  // クリップボードからの画像ペースト検知 (Cmd/Ctrl + V)
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const filesToUpload: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          if (file.type.startsWith("image/") && (!file.name || file.name === "image.png")) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const namedFile = new File([file], `screenshot_${timestamp}.png`, { type: file.type });
            filesToUpload.push(namedFile);
          } else {
            filesToUpload.push(file);
          }
        }
      }
    }

    if (filesToUpload.length > 0) {
      e.preventDefault();
      uploadFiles(filesToUpload);
    }
  };

  // ドラッグ＆ドロップ検知
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      setIsDragging(false);
      uploadFiles(Array.from(e.dataTransfer.files));
    }
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
      // 日本語IMEなどの変換確定時のEnter押下ではメンション挿入を実行しない（Modern Web Guidance: ime-safe-enter-submit）
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        return;
      }
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
                <div className="w-[1px] h-3.5 bg-slate-300 mx-1 self-center" />
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      uploadFiles(Array.from(e.target.files));
                      e.target.value = "";
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="ファイル・画像を添付（ドラッグ＆ドロップ、Cmd+V貼り付け対応）"
                  disabled={disabled || isUploading}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                >
                  {isUploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  ) : (
                    <Paperclip className="w-3.5 h-3.5" />
                  )}
                  <span className="text-[11px] font-medium hidden sm:inline">添付</span>
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
                      <span>![代替テキスト](URL)</span>
                      <span className="font-sans text-slate-400">画像</span>
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
        <div
          className="relative w-full"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
            className={`w-full p-2.5 bg-transparent border-0 outline-none text-slate-800 placeholder-slate-400 text-base sm:text-sm leading-relaxed resize-y ${className}`}
            {...rest}
          />

          {/* ドラッグ中のドロップゾーンオーバーレイ */}
          {isDragging && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-indigo-50/95 border-2 border-dashed border-indigo-400 rounded-b-lg backdrop-blur-2xs pointer-events-none transition-all">
              <Paperclip className="w-6 h-6 text-indigo-600 animate-bounce mb-1" />
              <p className="text-xs font-semibold text-indigo-800">
                ここにファイルをドロップして添付
              </p>
              <p className="text-[11px] text-indigo-600">
                画像は自動的にMarkdownプレビューとして挿入されます
              </p>
            </div>
          )}

          {/* アップロード中インジケーター */}
          {isUploading && (
            <div className="absolute bottom-2 right-2 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/80 text-white text-xs shadow-md backdrop-blur-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span>ファイルをアップロード中...</span>
            </div>
          )}

          {/* アップロードエラー表示 */}
          {uploadError && (
            <div className="px-3 py-1 bg-rose-50 border-t border-rose-200 text-rose-700 text-xs flex items-center justify-between">
              <span>⚠️ {uploadError}</span>
              <button
                type="button"
                onClick={() => setUploadError("")}
                className="text-rose-500 hover:text-rose-700 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
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
      {isOpen && activeTab === "edit" && (
        <div className="absolute z-50 left-0 bottom-full mb-1.5 w-72 sm:w-80 max-h-64 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 py-1 text-xs animate-in fade-in zoom-in-95 duration-100 max-w-[calc(100vw-32px)]">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
            <span>
              メンバーを選択 (@)
              {filteredUsers.length > 0 && ` (${filteredUsers.length}名)`}
            </span>
            <span className="text-[9px] text-slate-400">↑↓で移動 / Enterで確定</span>
          </div>
          {filteredUsers.length === 0 ? (
            <div className="py-4 px-3 text-center text-slate-400 text-xs">
              「{query}」に一致するメンバーはいません
            </div>
          ) : (
            filteredUsers.map((user, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => insertMention(user)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full px-3 py-2 flex items-center gap-2.5 text-left transition-colors cursor-pointer ${
                    isSelected ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div
                    style={{ backgroundColor: user.color || "#4f46e5" }}
                    className="w-6 h-6 rounded-full text-white flex items-center justify-center font-bold text-[10px] shrink-0 shadow-2xs"
                  >
                    {getUserInitials(user.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`truncate ${isSelected ? "font-bold text-indigo-950" : "font-semibold text-slate-800"}`}>
                        {user.name}
                      </span>
                      {user.login_id && (
                        <span className="text-[10px] text-slate-400 truncate">
                          @{user.login_id}
                        </span>
                      )}
                      {user.is_admin === 1 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 font-bold">
                          Admin
                        </span>
                      )}
                    </div>
                    {user.role && (
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        {user.role}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
