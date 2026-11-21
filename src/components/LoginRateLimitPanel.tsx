// 管理者専用：ログイン・2要素認証のロック状況確認および手動解除パネル
"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Unlock,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { SystemSettings } from "@/types";
import { formatTimestamp } from "@/lib/dateUtils";

interface RateLimitStatusItem {
  id: number;
  scope: "login" | "login_ip" | "2fa";
  scope_label: string;
  identifier: string;
  ip_address: string;
  failed_count: number;
  max_attempts: number;
  first_failed_at: string | null;
  last_failed_at: string | null;
  locked_until: string | null;
  is_locked: boolean;
  retry_after_sec: number;
  user_id: number | null;
  user_name: string | null;
  user_color: string | null;
  user_role: string | null;
}

interface LoginRateLimitPanelProps {
  settings: SystemSettings;
}

function formatRemainingTime(sec: number): string {
  if (sec <= 0) return "まもなく解除";
  if (sec < 60) return `あと ${sec} 秒`;
  const min = Math.ceil(sec / 60);
  return `あと約 ${min} 分`;
}

export default function LoginRateLimitPanel({ settings }: LoginRateLimitPanelProps) {
  const [items, setItems] = useState<RateLimitStatusItem[]>([]);
  const [lockedCount, setLockedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [unlockingId, setUnlockingId] = useState<number | null>(null);
  const [isUnlockingAll, setIsUnlockingAll] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [noticeMsg, setNoticeMsg] = useState("");

  const fetchRateLimits = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMsg("");
      const res = await fetch("/api/admin/rate-limits", { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "ログインロック状況の取得に失敗しました");
      }
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setLockedCount(Number(data.lockedCount) || 0);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "取得エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRateLimits();
  }, [fetchRateLimits]);

  const handleUnlockOne = async (item: RateLimitStatusItem) => {
    try {
      setUnlockingId(item.id);
      setErrorMsg("");
      setNoticeMsg("");
      const res = await fetch(`/api/admin/rate-limits?id=${item.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "ロック解除に失敗しました");
      }
      setNoticeMsg(
        `「${item.user_name ? `${item.user_name} (${item.identifier})` : item.identifier}」の制限を解除しました`
      );
      await fetchRateLimits();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "ロック解除に失敗しました");
    } finally {
      setUnlockingId(null);
    }
  };

  const handleUnlockAll = async () => {
    if (!window.confirm("すべてのログインロックおよび失敗カウントを一括解除しますか？")) {
      return;
    }
    try {
      setIsUnlockingAll(true);
      setErrorMsg("");
      setNoticeMsg("");
      const res = await fetch("/api/admin/rate-limits?all=true", {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "一括解除に失敗しました");
      }
      setNoticeMsg(data.message || "すべてのログイン制限を解除しました");
      await fetchRateLimits();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "一括解除に失敗しました");
    } finally {
      setIsUnlockingAll(false);
    }
  };

  return (
    <section className="bg-white rounded-xl shadow-xs border border-indigo-100/80 overflow-hidden">
      {/* セクションヘッダー */}
      <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {lockedCount > 0 ? (
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-slate-800 text-base sm:text-lg">
                ログイン試行レート制限・ロック管理
              </h2>
              {lockedCount > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
                  ロック中: {lockedCount}件
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ロック中なし
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              総当たり攻撃を防ぐため、短時間の連続失敗を自動で一時ロックします。誤入力でロックされたメンバーはここから即時解除できます。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleUnlockAll}
              disabled={isUnlockingAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isUnlockingAll ? "解除中..." : "すべて解除"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={fetchRateLimits}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>更新</span>
          </button>
        </div>
      </div>

      {/* 適用中のレート制限ポリシー説明 */}
      <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span className="font-semibold text-slate-700">適用中のしきい値:</span>
        <span className="px-2 py-0.5 rounded bg-white border border-slate-200">
          通常ログイン（ID×IP）: 15分以内に5回失敗 → 15分ロック
        </span>
        <span className="px-2 py-0.5 rounded bg-white border border-slate-200">
          2要素認証（2FA）: 5分以内に5回失敗 → 15分ロック
        </span>
        <span className="px-2 py-0.5 rounded bg-white border border-slate-200">
          同一IP大量試行: 15分以内に20回失敗 → 15分ロック
        </span>
      </div>

      {/* メッセージ表示 */}
      <div className="p-5 space-y-3">
        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {noticeMsg && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{noticeMsg}</span>
          </div>
        )}

        {isLoading && items.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">読み込み中...</div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center rounded-xl bg-slate-50/70 border border-dashed border-slate-200">
            <ShieldCheck className="w-7 h-7 text-emerald-500 mx-auto mb-1.5" />
            <p className="text-sm font-medium text-slate-700">
              現在ロック中のアカウントや直近の連続失敗はありません
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              ロック期限を過ぎたレコードは自動的にクリアされます
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  item.is_locked
                    ? "bg-rose-50/60 border-rose-200"
                    : "bg-amber-50/40 border-amber-200/80"
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.is_locked ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white">
                        ロック中
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        失敗監視中
                      </span>
                    )}
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                      {item.scope_label}
                    </span>
                    <span className="text-sm font-bold text-slate-800 truncate">
                      {item.scope === "login_ip" ? (
                        <>IP: <span className="font-mono">{item.ip_address}</span></>
                      ) : item.user_name ? (
                        <>
                          {item.user_name}{" "}
                          <span className="text-xs font-mono font-normal text-slate-500">
                            (@{item.identifier})
                          </span>
                        </>
                      ) : (
                        <>
                          未登録ID:{" "}
                          <span className="font-mono text-rose-700">{item.identifier}</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap text-xs text-slate-600">
                    <span>
                      失敗回数:{" "}
                      <strong className="font-mono text-slate-900">
                        {item.failed_count} / {item.max_attempts} 回
                      </strong>
                    </span>
                    <span>
                      送信元IP: <code className="font-mono text-slate-800">{item.ip_address}</code>
                    </span>
                    {item.last_failed_at && (
                      <span>
                        最終失敗: {formatTimestamp(item.last_failed_at, settings)}
                      </span>
                    )}
                    {item.is_locked && (
                      <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
                        <Clock className="w-3.5 h-3.5" />
                        {formatRemainingTime(item.retry_after_sec)}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleUnlockOne(item)}
                  disabled={unlockingId === item.id}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>
                    {unlockingId === item.id
                      ? "解除中..."
                      : item.is_locked
                      ? "ロック解除"
                      : "カウントリセット"}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
