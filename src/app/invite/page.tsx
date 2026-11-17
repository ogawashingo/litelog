// src/app/invite/page.tsx
// 招待リンク受諾＆初回パスワード・2要素認証セットアップ画面
"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  QrCode,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserCheck,
} from "lucide-react";
import { useUser } from "@/components/UserContext";

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { setCurrentUser } = useUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<{
    user: {
      id: number;
      login_id: string;
      name: string;
      role: string;
      role_type: string;
      color: string;
    };
    projects: { id: number; key: string; name: string; color: string }[];
    totpSetup: { secret: string; uri: string; qrSvg: string };
  } | null>(null);

  // フォーム状態
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [enable2fa, setEnable2fa] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("招待トークンが見つかりません。招待リンクのURLをご確認ください。");
      setLoading(false);
      return;
    }

    async function verifyInvite() {
      try {
        const res = await fetch(`/api/invitations/${encodeURIComponent(token!)}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "招待リンクの検証に失敗しました");
          return;
        }
        setInviteData(data);
      } catch (err) {
        console.error("招待取得エラー:", err);
        setError("招待情報の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    }

    verifyInvite();
  }, [token]);

  const handleCopySecret = () => {
    if (!inviteData?.totpSetup.secret) return;
    navigator.clipboard.writeText(inviteData.totpSetup.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (password.length < 6) {
      setSubmitError("パスワードは6文字以上で設定してください");
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError("パスワードが一致しません");
      return;
    }

    if (enable2fa && (!totpCode || totpCode.trim().length !== 6)) {
      setSubmitError("認証アプリに表示されている6桁のコードを入力してください");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(token!)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          enable2fa,
          totpSecret: enable2fa ? inviteData?.totpSetup.secret : null,
          totpCode: enable2fa ? totpCode.trim() : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "セットアップに失敗しました");
        setSubmitting(false);
        return;
      }

      if (data.user) {
        setCurrentUser(data.user);
      }
      // ダッシュボードへ自動遷移
      router.push("/");
    } catch (err) {
      console.error("招待受諾エラー:", err);
      setSubmitError("セットアップ処理中にエラーが発生しました");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-600 font-medium text-sm">招待リンクを確認中...</p>
        </div>
      </div>
    );
  }

  if (error || !inviteData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-rose-100 p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">招待リンクが無効です</h2>
          <p className="text-sm text-slate-600 leading-relaxed">{error}</p>
          <div className="pt-2">
            <button
              onClick={() => router.push("/login")}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-xl transition"
            >
              ログイン画面へ戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { user, projects, totpSetup } = inviteData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/20 to-slate-100 flex items-center justify-center p-4 sm:p-6 py-12">
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-200/80 max-w-xl w-full overflow-hidden">
        {/* ヘッダーエリア */}
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 p-6 sm:p-8 text-white">
          <div className="flex items-center gap-2.5 mb-2 text-indigo-200 text-xs font-semibold tracking-wide uppercase">
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            Personal Backlog 初期セットアップ
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
            ようこそ、{user.name} さん！
          </h1>
          <p className="text-xs sm:text-sm text-indigo-100 leading-relaxed">
            招待リンクの認証が完了しました。あなた専用のパスワードを設定して利用を開始してください。
          </p>
        </div>

        {/* ユーザー情報＆所属案件プレビュー */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-sm"
                style={{ backgroundColor: user.color || "#4f46e5" }}
              >
                {user.name.slice(0, 2)}
              </div>
              <div>
                <div className="font-semibold text-slate-800 text-sm">{user.name}</div>
                <div className="text-xs text-slate-500 font-mono">
                  ログインID: <span className="font-bold text-slate-700">{user.login_id}</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200 font-medium">
              役割: {user.role} ({user.role_type === "admin" ? "Admin" : user.role_type === "pmo" ? "PMO" : "一般"})
            </div>
          </div>

          {projects.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-2">
                初期参加プロジェクト ({projects.length} 件):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {projects.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="font-mono font-bold text-[11px]">{p.key}</span> {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {submitError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500" />
              {submitError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* パスワード設定 */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-indigo-600" />
                1. パスワードの設定（必須）
              </h2>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  新しいパスワード (6文字以上)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="英数記号を含む安全なパスワード"
                    className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  パスワードの確認（再入力）
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="もう一度同じパスワードを入力"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
              </div>
            </div>

            {/* 2要素認証（TOTP）設定 */}
            <div className="pt-2 border-t border-slate-200">
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100">
                <input
                  type="checkbox"
                  id="enable2fa-check"
                  checked={enable2fa}
                  onChange={(e) => setEnable2fa(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="enable2fa-check" className="cursor-pointer select-none">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs sm:text-sm">
                    <Smartphone className="w-4 h-4 text-indigo-600" />
                    2要素認証（2FA）を有効にする
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                      推奨
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    スマートフォン認証アプリ（Google Authenticator、1Password、iPhone等）を使ってセキュリティを最高強度に高めます。
                  </div>
                </label>
              </div>

              {enable2fa && (
                <div className="mt-4 p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 animate-in fade-in duration-200">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-indigo-600" />
                    認証アプリでQRコードを読み取ってください
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
                    <div
                      className="w-44 h-44 flex items-center justify-center p-2 bg-white rounded-xl shadow-xs border border-slate-200 shrink-0"
                      dangerouslySetInnerHTML={{ __html: totpSetup.qrSvg }}
                    />
                    <div className="space-y-2 text-xs text-slate-600 flex-1">
                      <p className="leading-relaxed">
                        認証アプリ（Microsoft Authenticator, Google Authenticator 等）またはスマホのカメラで左のQRコードを読み取ってください。
                      </p>
                      <div className="pt-1">
                        <div className="text-[11px] text-slate-500 font-medium mb-1">
                          QRが読み取れない場合の秘密鍵コード:
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-lg font-mono text-[11px] text-slate-800 break-all select-all">
                          <span>{totpSetup.secret}</span>
                          <button
                            type="button"
                            onClick={handleCopySecret}
                            className="ml-auto p-1 hover:text-indigo-600 transition shrink-0"
                            title="秘密鍵をコピー"
                          >
                            {copiedSecret ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      スマホに表示された6桁の認証コードを入力してください
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="例: 123456"
                      className="w-full sm:w-48 px-3.5 py-2.5 text-center text-lg font-mono tracking-widest font-bold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-200 transition transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    セットアップ中...
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    設定を完了して利用を開始する
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <InviteContent />
    </Suspense>
  );
}
