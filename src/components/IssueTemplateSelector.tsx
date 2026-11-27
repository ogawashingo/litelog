"use client";

import React, { useState, useRef, useEffect } from "react";
import { FileText, ChevronDown, Check, Sparkles } from "lucide-react";

export interface IssueTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

export const ISSUE_TEMPLATES: IssueTemplate[] = [
  {
    id: "feature",
    name: "機能開発 / 改善",
    description: "一般的な機能追加や改修タスク",
    content: `### 目的・背景\n\n### 実装内容\n- [ ] \n\n### クローズ条件（最大2つまで）\n- [ ] PRがマージされステージング環境で動作確認が取れること`,
  },
  {
    id: "bug",
    name: "バグ報告 / 不具合調査",
    description: "不具合の再現手順と原因特定・修正",
    content: `### 不具合の概要\n\n### 再現手順\n1. \n2. \n\n### 期待する動作\n\n### 実際の結果\n\n### クローズ条件\n- [ ] 不具合が修正され、再現手順で正常に動作すること`,
  },
  {
    id: "onboarding",
    name: "新メンバー受入（オンボーディング）",
    description: "新入社員・業務委託のアカウント発行や初期設定",
    content: `### 受入メンバー\n- 氏名: \n- 役割: \n\n### オンボーディングチェックリスト\n- [ ] PCキッティング・初期OSセットアップ\n- [ ] GitHub / リポジトリ閲覧権限付与\n- [ ] Slack / チャットツール招待\n- [ ] 開発環境構築（README・Docker動作確認）\n- [ ] 初日1on1の実施`,
  },
  {
    id: "release",
    name: "本番リリース前チェック",
    description: "リリース前の確認項目とスモークテスト",
    content: `### リリース概要\n\n### チェックリスト\n- [ ] ステージング環境での動作確認完了\n- [ ] DBマイグレーションおよび環境変数確認\n- [ ] 本番デプロイ実施\n- [ ] 本番スモークテスト（15分）完了`,
  },
];

interface IssueTemplateSelectorProps {
  currentValue: string;
  onApplyTemplate: (newContent: string) => void;
  className?: string;
}

/**
 * 詳細メモ入力欄の右上に控えめに配置される「邪魔にならない」課題テンプレート選択コンポーネント
 */
export default function IssueTemplateSelector({
  currentValue,
  onApplyTemplate,
  className = "",
}: IssueTemplateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (template: IssueTemplate) => {
    setIsOpen(false);
    if (!currentValue || currentValue.trim() === "") {
      onApplyTemplate(template.content);
      return;
    }

    // 既に文字が入っている場合は事故防止で確認
    const confirmOverwrite = window.confirm(
      `入力中の詳細メモがあります。\n\n「OK」を押すとテンプレートで上書きします。\n「キャンセル」を押すと入力内容の末尾に追記します。`
    );

    if (confirmOverwrite) {
      onApplyTemplate(template.content);
    } else {
      onApplyTemplate(`${currentValue.trim()}\n\n---\n${template.content}`);
    }
  };

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200/80 px-2 py-0.5 rounded transition cursor-pointer"
        title="テンプレートから詳細メモを挿入"
      >
        <FileText className="w-3 h-3 text-slate-400 group-hover:text-indigo-500" />
        <span>テンプレート</span>
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>テンプレートを選択</span>
            <Sparkles className="w-3 h-3 text-indigo-400" />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {ISSUE_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => handleSelect(tmpl)}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50/70 transition flex flex-col gap-0.5 group cursor-pointer"
              >
                <div className="text-xs font-semibold text-slate-700 group-hover:text-indigo-600 flex items-center gap-1.5">
                  <Check className="w-3 h-3 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span>{tmpl.name}</span>
                </div>
                <div className="text-[10px] text-slate-400 pl-4.5 line-clamp-1">
                  {tmpl.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
