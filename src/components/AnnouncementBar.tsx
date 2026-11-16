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
} from "lucide-react";
import { useUser } from "./UserContext";
import { AnnouncementType } from "@/types";
import MentionText from "./MentionText";

// 通知種別ごとのスタイルおよびバッジ・アイコン定義
interface AnnouncementConfig {
  icon: React.ComponentType<{ className?: string }>;
  badgeText: string;
  containerClasses: string;
  badgeClasses: string;
  iconClasses: string;
  closeBtnClasses: string;
}

const CONFIG_MAP: Record<AnnouncementType, AnnouncementConfig> = {
  info: {
    icon: Megaphone,
    badgeText: "お知らせ",
    containerClasses: "bg-sky-950/95 border-b border-sky-500/30 text-sky-100",
    badgeClasses: "bg-sky-500/20 text-sky-300 border-sky-400/30",
    iconClasses: "text-sky-400",
    closeBtnClasses: "text-sky-300/80 hover:text-white hover:bg-sky-900/50",
  },
  warning: {
    icon: AlertTriangle,
    badgeText: "注意",
    containerClasses: "bg-amber-950/95 border-b border-amber-500/35 text-amber-100",
    badgeClasses: "bg-amber-500/20 text-amber-300 border-amber-400/30",
    iconClasses: "text-amber-400",
    closeBtnClasses: "text-amber-300/80 hover:text-white hover:bg-amber-900/50",
  },
  alert: {
    icon: AlertCircle,
    badgeText: "緊急",
    containerClasses: "bg-rose-950/95 border-b border-rose-500/40 text-rose-100",
    badgeClasses: "bg-rose-500/25 text-rose-200 border-rose-400/40",
    iconClasses: "text-rose-400",
    closeBtnClasses: "text-rose-300/80 hover:text-white hover:bg-rose-900/50",
  },
  success: {
    icon: CheckCircle2,
    badgeText: "完了",
    containerClasses: "bg-emerald-950/95 border-b border-emerald-500/35 text-emerald-100",
    badgeClasses: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
    iconClasses: "text-emerald-400",
    closeBtnClasses: "text-emerald-300/80 hover:text-white hover:bg-emerald-900/50",
  },
};

const STORAGE_KEY = "dismissed_announcement_updated_at";

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

  // ハイドレーションエラーを防止し、クライアント側でローカルストレージを確認
  useEffect(() => {
    setMounted(true);
    try {
      const dismissedTimestamp = localStorage.getItem(STORAGE_KEY);
      // 既に閉じており、かつ管理者のメッセージ更新日時以降であれば非表示状態を維持
      if (dismissedTimestamp && announcementUpdatedAt && dismissedTimestamp === announcementUpdatedAt) {
        setIsDismissed(true);
      } else {
        setIsDismissed(false);
      }
    } catch {
      // localStorageアクセス制限等の場合はそのまま表示
      setIsDismissed(false);
    }
  }, [announcementUpdatedAt]);

  // 非表示条件: マウント前、無効化中、本文が空、またはユーザーがすでに閉じた場合
  if (!mounted || !announcementEnabled || !announcementMessage.trim() || isDismissed) {
    return null;
  }

  const currentType: AnnouncementType = (announcementType in CONFIG_MAP)
    ? announcementType
    : "info";
  const config = CONFIG_MAP[currentType];
  const IconComponent = config.icon;

  // 閉じるボタン押下処理
  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      if (announcementUpdatedAt) {
        localStorage.setItem(STORAGE_KEY, announcementUpdatedAt);
      } else {
        localStorage.setItem(STORAGE_KEY, new Date().toISOString());
      }
    } catch {
      // エラー時はローカルステートのみで制御
    }
  };

  return (
    <aside
      aria-label="管理者からの一言通知"
      role="alert"
      className={`relative w-full text-xs transition-all duration-200 shadow-xs ${config.containerClasses}`}
    >
      <div className="max-w-[1800px] mx-auto px-3 sm:px-5 lg:px-6 py-2 flex items-center justify-between gap-3">
        {/* 左側: アイコン + バッジ + メッセージ */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* アイコン */}
          <div className="shrink-0 flex items-center justify-center">
            <IconComponent className={`w-4 h-4 ${config.iconClasses}`} />
          </div>

          {/* 種別バッジ */}
          <span
            className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold border ${config.badgeClasses}`}
          >
            {config.badgeText}
          </span>

          {/* メッセージ本文 */}
          <div className="min-w-0 flex-1 text-[12px] sm:text-[13px] leading-snug break-words font-medium">
            <MentionText text={announcementMessage} users={users} />
          </div>
        </div>

        {/* 右側操作: 管理者専用設定導線 ＆ 閉じるボタン */}
        <div className="flex items-center gap-1 shrink-0">
          {Boolean(currentUser?.is_admin) && (
            <Link
              href="/admin#announcement-section"
              title="一言通知の設定を変更（管理ページへ）"
              className={`p-1 rounded-md transition-colors ${config.closeBtnClasses}`}
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
            className={`p-1 rounded-md transition-colors cursor-pointer ${config.closeBtnClasses}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
