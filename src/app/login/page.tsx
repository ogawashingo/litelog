// Webログイン画面 (/login) および初回管理者セットアップ画面
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  LogIn,
  KeyRound,
  User as UserIcon,
  AlertCircle,
  ShieldCheck,
  Smartphone,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { useUser } from "@/components/UserContext";

export default function LoginPage() {
  const router = useRouter();
  const { login, verify2fa, setupAdmin } = useUser();

  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  // ログインステップ (通常 / 2要素認証コード入力)
  const [step, setStep] = useState<"credentials" | "2fa">("credentials");
  const [temp2faToken, setTemp2faToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");

  // フォーム状態
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 初回セットアップ要否の確認
  useEffect(() => {
    async function checkSetup() {
      try {
        const res = await fetch("/api/auth", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.needsSetup) {
            setNeedsSetup(true);
          }
        }
      } catch (err) {
        console.error("セットアップ状態確認エラー:", err);
      } finally {
        setIsCheckingSetup(false);
      }
    }
    checkSetup();
  }, []);

  // ログイン処理
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId.trim() || !password) {
      setErrorMsg("ログインIDとパスワードを入力してください");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg("");
      const result = await login(loginId.trim(), password);

      // 2要素認証が必要な場合
      if (result.requires2fa && result.tempToken) {
        setTemp2faToken(result.tempToken);
        setStep("2fa");
        setIsLoading(false);
        return;
      }

      if (!result.ok) {
        setErrorMsg(result.error || "ログインIDまたはパスワードが正しくありません");
        return;
      }
      router.push("/");
    } catch {
      setErrorMsg("ログイン通信中にエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  // 2要素認証コード検証処理
  const handleVerify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!temp2faToken || !totpCode.trim()) {
      setErrorMsg("6桁の認証コードを入力してください");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg("");
      const result = await verify2fa(temp2faToken, totpCode.trim());
      if (!result.ok) {
        setErrorMsg(result.error || "認証コードが正しくありません");
        return;
      }
      router.push("/");
    } catch {
      setErrorMsg("2要素認証の検証通信中にエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setStep("credentials");
    setTemp2faToken(null);
    setTotpCode("");
    setErrorMsg("");
  };

  // 初回管理者アカウント作成処理
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("お名前を入力してください");
      return;
    }
    if (!loginId.trim() || loginId.trim().length < 2) {
      setErrorMsg("ログインIDは2文字以上で入力してください");
      return;
    }
    if (!password || password.length < 4) {
      setErrorMsg("パスワードは4文字以上で入力してください");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg("");
      const result = await setupAdmin(name.trim(), loginId.trim(), password);
      if (!result.ok) {
        setErrorMsg(result.error || "管理者アカウントの作成に失敗しました");
        return;
      }
      router.push("/");
    } catch {
      setErrorMsg("管理者アカウント作成中にエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col justify-center items-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-indigo-100/80 overflow-hidden">
        {/* ヘッダーバナー（テーマ連動） */}
        <div className="app-header px-6 py-7 text-white text-center relative overflow-hidden">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500 via-amber-400 to-violet-500 p-[2px] mx-auto mb-3 shadow-lg shadow-rose-500/25">
            <div className="w-full h-full rounded-[14px] bg-[#1e1b4b]/90 flex items-center justify-center">
              {needsSetup ? (
                <ShieldCheck className="w-6 h-6 text-amber-300" />
              ) : (
                <Sparkles className="w-6 h-6 text-amber-300" />
              )}
            </div>
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">Personal Backlog</h1>
          {needsSetup && (
            <p className="text-xs text-indigo-200 mt-1">
              初期セットアップ: 最初の管理者アカウントを作成してください
            </p>
          )}
        </div>

        {/* 状態ロード中の表示 */}
        {isCheckingSetup ? (
          <div className="p-8 text-center text-sm text-slate-500">
            初期化状態を確認中...
          </div>
        ) : needsSetup ? (
          /* 初回セットアップフォーム（管理者登録） */
          <form onSubmit={handleSetup} className="p-6 space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                お名前 <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="お名前を入力"
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ログインID <span className="text-rose-500">*</span>（半角英数）
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="ログインIDを入力（半角英数）"
                  autoComplete="username"
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                管理者パスワード <span className="text-rose-500">*</span>（4文字以上）
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="パスワードを入力"
                  autoComplete="new-password"
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 app-primary-btn text-white font-bold text-sm rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isLoading ? "アカウント作成中..." : "管理者アカウントを作成して開始"}</span>
            </button>
          </form>
        ) : step === "2fa" ? (
          /* 2要素認証（TOTP）コード入力フォーム */
          <form onSubmit={handleVerify2fa} className="p-6 space-y-5">
            <div className="text-center space-y-1.5 pb-1">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto border border-indigo-100/80 shadow-xs">
                <Smartphone className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-slate-900">2要素認証コードの入力</h2>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                認証アプリ（Google Authenticator等）に表示されている6桁のコードを入力してください。
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 text-center">
                6桁の確認コード
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full text-center py-3 text-2xl font-mono tracking-widest font-bold bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || totpCode.length !== 6}
              className="w-full py-2.5 px-4 app-primary-btn text-white font-bold text-sm rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isLoading ? "検証中..." : "認証してログイン"}</span>
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={handleBackToLogin}
                className="text-xs text-slate-500 hover:text-slate-800 transition inline-flex items-center gap-1 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                別のログインIDでやり直す
              </button>
            </div>
          </form>
        ) : (
          /* 通常ログインフォーム */
          <form onSubmit={handleLogin} className="p-6 space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ログインID
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="ログインIDを入力"
                  autoComplete="username"
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                パスワード
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="パスワードを入力"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 app-primary-btn text-white font-bold text-sm rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>{isLoading ? "ログイン中..." : "ログインする"}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
