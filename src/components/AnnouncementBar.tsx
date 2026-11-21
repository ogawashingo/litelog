// グローバルヘッダー直下 システム一言通知（アナウンスメントバー）
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Megaphone,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  X,
  Settings,
  ExternalLink,
} from "lucide-react";
import { useUser } from "./UserContext";
import { AnnouncementType, User } from "@/types";
import { parseInline, InlineNode, isSafeUrl } from "@/lib/markdownUtils";

// 通知種別ごとのスタイルおよびバッジ・アイコン定義（鮮やかで高コントラストなグラデーション背景）
interface AnnouncementConfig {
  icon: React.ComponentType<{ className?: string }>;
  badgeText: string;
  containerClasses: string;
  badgeClasses: string;
  iconClasses: string;
  closeBtnClasses: string;
}

export const ANNOUNCEMENT_CONFIG_MAP: Record<AnnouncementType, AnnouncementConfig> = {
  info: {
    icon: Megaphone,
    badgeText: "お知らせ",
    containerClasses: "bg-gradient-to-r from-sky-600 via-sky-500 to-indigo-600 text-white border-b border-sky-400/30 shadow-xs",
    badgeClasses: "bg-white/20 text-white border-white/35",
    iconClasses: "text-white",
    closeBtnClasses: "text-white/80 hover:text-white hover:bg-white/20",
  },
  warning: {
    icon: AlertTriangle,
    badgeText: "注意",
    containerClasses: "bg-gradient-to-r from-amber-600 via-amber-500 to-orange-600 text-white border-b border-amber-300/40 shadow-xs",
    badgeClasses: "bg-white/25 text-white border-white/40",
    iconClasses: "text-white",
    closeBtnClasses: "text-white/80 hover:text-white hover:bg-white/20",
  },
  alert: {
    icon: AlertCircle,
    badgeText: "緊急",
    containerClasses: "bg-gradient-to-r from-rose-600 via-rose-500 to-red-600 text-white border-b border-rose-300/40 shadow-xs",
    badgeClasses: "bg-white/25 text-white border-white/40",
    iconClasses: "text-white",
    closeBtnClasses: "text-white/80 hover:text-white hover:bg-white/20",
  },
  success: {
    icon: CheckCircle2,
    badgeText: "完了",
    containerClasses: "bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-600 text-white border-b border-emerald-300/40 shadow-xs",
    badgeClasses: "bg-white/20 text-white border-white/35",
    iconClasses: "text-white",
    closeBtnClasses: "text-white/80 hover:text-white hover:bg-white/20",
  },
};

// ユーザーごとの通知既読（閉じる）管理用ローカルストレージキープレフィックス
const STORAGE_PREFIX = "dismissed_announcement_user_";
const OLD_GLOBAL_STORAGE_KEY = "dismissed_announcement_updated_at";

function getDismissedStorageKey(userId?: number | null): string {
  return userId ? `${STORAGE_PREFIX}${userId}` : `${STORAGE_PREFIX}guest`;
}

/**
 * お知らせメッセージ内のインラインMarkdown・リンク・課題キーを描画するヘルパー
 * （白文字の親スタイルを確実に継承し、背景と同化するのを防止）
 */
function renderAnnouncementInline(
  node: InlineNode,
  index: number
): React.ReactNode {
  switch (node.type) {
    case "text":
      return <span key={index}>{node.value}</span>;
    case "bold":
      return (
        <strong key={index} className="font-bold underline decoration-white/50">
          {node.children.map((c, i) => renderAnnouncementInline(c, i))}
        </strong>
      );
    case "italic":
      return (
        <em key={index} className="italic">
          {node.children.map((c, i) => renderAnnouncementInline(c, i))}
        </em>
      );
    case "strike":
      return (
        <del key={index} className="line-through opacity-75">
          {node.children.map((c, i) => renderAnnouncementInline(c, i))}
        </del>
      );
    case "code":
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-black/25 text-white font-mono text-[11px]"
        >
          {node.value}
        </code>
      );
    case "link": {
      // 危険なスキーム（javascript:, data: 等）を遮断してXSSを防止
      if (!isSafeUrl(node.url)) {
        return <span key={index}>{node.text}</span>;
      }
      const isExternal = /^https?:\/\//i.test(node.url);
      return (
        <a
          key={index}
          href={node.url}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          className="underline decoration-white/70 hover:decoration-white font-bold inline-flex items-center gap-0.5 hover:opacity-90 transition-opacity"
        >
          <span>{node.text}</span>
          {isExternal && <ExternalLink className="w-3 h-3 inline-block" />}
        </a>
      );
    }
    case "issue_key":
      return (
        <Link
          key={index}
          href={`/search?q=${encodeURIComponent(node.issueKey)}`}
          className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-white/25 hover:bg-white/35 text-white font-mono font-bold text-[11px] underline transition-colors"
        >
          {node.raw}
        </Link>
      );
    case "mention":
      return (
        <span
          key={index}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-white/25 text-white text-[11px] font-bold"
        >
          {node.raw}
        </span>
      );
    case "br":
      return <br key={index} />;
    default:
      return null;
  }
}

export default function AnnouncementBar() {
  const { settings, currentUser, users } = useUser();
  const [mounted, setMounted] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  const {
    announcementEnabled = false,
    announcementMessage = "",
    announcementType = "info",
    announcementUpdatedAt = "",
  } = settings;

  // ユーザーごと・更新日時ごとに非表示状態を判定（同一端末で別ユーザー切替時にも正しく表示）
  useEffect(() => {
    setMounted(true);
    try {
      // 古いブラウザ共通キーが残っている場合はクリーンアップ
      if (localStorage.getItem(OLD_GLOBAL_STORAGE_KEY)) {
        localStorage.removeItem(OLD_GLOBAL_STORAGE_KEY);
      }

      const userKey = getDismissedStorageKey(currentUser?.id);
      const dismissedTimestamp = localStorage.getItem(userKey);
      // ログイン中のユーザーが既に閉じており、かつ管理者のメッセージ更新日時と一致している場合のみ非表示
      if (dismissedTimestamp && announcementUpdatedAt && dismissedTimestamp === announcementUpdatedAt) {
        setIsDismissed(true);
      } else {
        setIsDismissed(false);
      }
    } catch {
      // localStorageアクセス制限等の場合はそのまま表示
      setIsDismissed(false);
    }
  }, [currentUser?.id, announcementUpdatedAt]);

  // 非表示条件: マウント前、無効化中、本文が空、またはログイン中ユーザーがすでに閉じた場合
  if (!mounted || !announcementEnabled || !announcementMessage.trim() || isDismissed) {
    return null;
  }

  const currentType: AnnouncementType = (announcementType in ANNOUNCEMENT_CONFIG_MAP)
    ? announcementType
    : "info";
  const config = ANNOUNCEMENT_CONFIG_MAP[currentType];
  const IconComponent = config.icon;

  // 閉じるボタン押下処理（ログイン中ユーザー専用キーに保存）
  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      const userKey = getDismissedStorageKey(currentUser?.id);
      if (announcementUpdatedAt) {
        localStorage.setItem(userKey, announcementUpdatedAt);
      } else {
        localStorage.setItem(userKey, new Date().toISOString());
      }
    } catch {
      // エラー時はローカルステートのみで制御
    }
  };

  // メッセージをインラインMarkdownパース
  const inlineNodes = parseInline(announcementMessage, users);

  return (
    <aside
      aria-label="管理者からの一言通知"
      role="alert"
      className={`relative w-full text-xs transition-all duration-200 ${config.containerClasses}`}
    >
      <div className="max-w-[1800px] mx-auto px-3 sm:px-5 lg:px-6 py-2.5 flex items-center justify-between gap-3">
        {/* 左側: アイコン + バッジ + メッセージ */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* アイコン */}
          <div className="shrink-0 flex items-center justify-center">
            <IconComponent className={`w-4 h-4 ${config.iconClasses}`} />
          </div>

          {/* 種別バッジ */}
          <span
            className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold border ${config.badgeClasses}`}
          >
            {config.badgeText}
          </span>

          {/* メッセージ本文（白文字で確実に視認可能・改行対応） */}
          <div className="min-w-0 flex-1 text-[12px] sm:text-[13px] leading-relaxed break-words font-medium text-white whitespace-pre-line">
            {inlineNodes.map((node, i) => renderAnnouncementInline(node, i))}
          </div>
        </div>

        {/* 右側操作: 管理者専用設定導線 ＆ 閉じるボタン */}
        <div className="flex items-center gap-1.5 shrink-0">
          {Boolean(currentUser?.is_admin) && (
            <Link
              href="/admin#announcement-section"
              title="一言通知の設定を変更（管理ページへ）"
              className={`p-1.5 rounded-md transition-colors ${config.closeBtnClasses}`}
              aria-label="一言通知の設定を変更"
            >
              <Settings className="w-3.5 h-3.5" />
            </Link>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            title="この通知を閉じる"
            aria-label="この通知を閉じる"
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${config.closeBtnClasses}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
