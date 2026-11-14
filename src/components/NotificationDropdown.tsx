// ヘッダー用通知ベル＆ドロップダウンコンポーネント
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Trash2, ExternalLink } from "lucide-react";
import { Notification } from "@/types";
import { getUserInitials } from "./UserManageModal";
import { useUser } from "./UserContext";
import { formatTimestamp } from "@/lib/dateUtils";

interface NotificationDropdownProps {
  onSelectIssue?: (issueKey: string) => void;
}

export default function NotificationDropdown({ onSelectIssue }: NotificationDropdownProps) {
  const router = useRouter();
  const { currentUser, settings } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 通知一覧・未読件数の取得
  const fetchNotifications = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await fetch("/api/notifications?limit=25");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error("通知の取得に失敗しました:", err);
    }
  }, [currentUser]);

  // 初回ロード・30秒間隔のポーリング・画面復帰時および更新イベント発火時の自動取得
  useEffect(() => {
    fetchNotifications();

    const interval = setInterval(fetchNotifications, 30000);

    const handleFocus = () => {
      fetchNotifications();
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("backlog:notifications-updated", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("backlog:notifications-updated", handleFocus);
    };
  }, [fetchNotifications]);

  // ドロップダウンを開いた時に最新状態を再取得
  const handleToggle = () => {
    if (!isOpen) {
      fetchNotifications();
    }
    setIsOpen(!isOpen);
  };

  // 外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // 単一通知のクリック（既読化 ＆ 該当課題を開く）
  const handleItemClick = async (notification: Notification) => {
    // 未読なら既読化APIを呼び出し
    if (notification.is_read === 0) {
      try {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: notification.id }),
        });
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, is_read: 1 } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error("通知既読化エラー:", err);
      }
    }

    setIsOpen(false);

    if (notification.issue_key) {
      if (onSelectIssue) {
        onSelectIssue(notification.issue_key);
      } else {
        router.push(`/issues/${encodeURIComponent(notification.issue_key)}`);
      }
    }
  };

  // すべて既読にする
  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0 || isLoading) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error("全件既読化エラー:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // 全通知の削除
  const handleDeleteAll = async () => {
    if (notifications.length === 0 || isLoading) return;
    if (!confirm("すべての通知を削除してもよろしいですか？")) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/notifications?all=true", {
        method: "DELETE",
      });
      if (res.ok) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (err) {
      console.error("通知削除エラー:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentUser) return null;

  return (
    <div ref={dropdownRef} className="relative shrink-0">
      {/* ベルアイコンボタン */}
      <button
        type="button"
        onClick={handleToggle}
        className={`relative p-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center ${
          isOpen ? "bg-white/20 text-white" : "text-white/80 hover:text-white hover:bg-white/10"
        }`}
        title="通知"
      >
        <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.2]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center border-2 border-slate-900 shadow-xs animate-in zoom-in-75">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* ドロップダウンメニュー */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200/90 z-50 text-slate-800 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
          {/* ヘッダー */}
          <div className="px-4 py-3 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-slate-900">通知</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">
                  未読 {unreadCount}件
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  disabled={isLoading}
                  className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-md transition-colors cursor-pointer"
                  title="すべて既読にする"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>すべて既読</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteAll}
                  disabled={isLoading}
                  className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded-md transition-colors cursor-pointer"
                  title="通知をすべてクリア"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 通知リスト本体 */}
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100 max-h-[460px]">
            {notifications.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                  <Bell className="w-5 h-5 opacity-60" />
                </div>
                <p className="text-xs font-bold text-slate-600">新しい通知はありません</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  担当アサイン・課題更新・コメント・メンション時に届きます
                </p>
              </div>
            ) : (
              notifications.map((n) => {
                const isUnread = n.is_read === 0;
                return (
                  <div
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={`px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer group ${
                      isUnread
                        ? "bg-indigo-50/40 hover:bg-indigo-50/80 font-medium"
                        : "hover:bg-slate-50/80 text-slate-600"
                    }`}
                  >
                    {/* 送信者アバター */}
                    <div className="relative shrink-0 mt-0.5">
                      <div
                        style={{ backgroundColor: n.sender_color || "#4f46e5" }}
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-2xs shrink-0"
                      >
                        {getUserInitials(n.sender_name || "メンバー")}
                      </div>
                      {isUnread && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-indigo-600 ring-2 ring-white" />
                      )}
                    </div>

                    {/* 通知内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {n.sender_name || "メンバー"}
                        </span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                          {formatTimestamp(n.created_at, settings)}
                        </span>
                      </div>

                      <div className="text-xs text-slate-700 leading-snug mb-1">
                        {n.type === "assigned" ? (
                          <span className="font-semibold text-emerald-700">
                            あなたを担当者に設定しました
                          </span>
                        ) : n.type === "commented" ? (
                          <span className="font-semibold text-sky-700">
                            あなたの課題にコメントしました
                          </span>
                        ) : n.type === "updated" ? (
                          <span className="font-semibold text-amber-700">
                            あなたの課題を更新しました
                          </span>
                        ) : n.type === "notify" ? (
                          <span className="font-semibold text-violet-700">
                            あなたを通知先に指定しました
                          </span>
                        ) : (
                          <span className="font-semibold text-indigo-700">
                            あなたをメンションしました
                          </span>
                        )}
                      </div>

                      {/* 課題タイトル */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-800 font-bold bg-white/70 px-2 py-1 rounded-md border border-slate-200/60 truncate group-hover:border-indigo-200">
                        <span
                          style={{ color: n.project_color || "#4f46e5" }}
                          className="font-mono text-[11px] shrink-0"
                        >
                          [{n.issue_key}]
                        </span>
                        <span className="truncate">{n.issue_title}</span>
                        <ExternalLink className="w-3 h-3 text-slate-400 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>

                      {/* メンション本文抜粋 */}
                      {n.content && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-1 break-words">
                          {n.content}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
