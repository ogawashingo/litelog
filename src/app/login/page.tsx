// Webログイン画面 (/login)
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, LogIn, KeyRound, User as UserIcon, Crown, Shield, AlertCircle } from "lucide-react";
import { useUser } from "@/components/UserContext";
import { getUserInitials } from "@/components/UserManageModal";

// 初期登録メンバーのログイン案内リスト
const QUICK_ACCOUNTS = [
  {
    loginId: "yamada",
    password: "yamada123",
    name: "山田 太郎",
    role: "管理者 (Admin権限)",
    isAdmin: true,
    color: "#4f46e5",
  },
  {
    loginId: "sato",
    password: "sato123",
    name: "佐藤 花子",
    role: "エンジニア (一般ユーザー)",
    isAdmin: false,
    color: "#3b82f6",
  },
  {
    loginId: "suzuki",
    password: "suzuki123",
    name: "鈴木 一郎",
    role: "デザイナー (一般ユーザー)",
    isAdmin: false,
    color: "#8b5cf6",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useUser();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId.trim() || !password) {
      setErrorMsg("ログインIDとパスワードを入力してください");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg("");
      const result = await login(loginId.trim(), password);
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

  // デモ・確認用のアカウント入力補助
  const handleSelectQuickAccount = (acc: (typeof QUICK_ACCOUNTS)[number]) => {
    setLoginId(acc.loginId);
    setPassword(acc.password);
    setErrorMsg("");
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col justify-center items-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-indigo-100/80 overflow-hidden">
        {/* ヘッダーバナー（Cosmic Indigo ＆ Coral-Amber テーマ） */}
        <div className="bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4c1d95] px-6 py-7 text-white text-center relative overflow-hidden">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500 via-amber-400 to-violet-500 p-[2px] mx-auto mb-3 shadow-lg shadow-rose-500/25">
            <div className="w-full h-full rounded-[14px] bg-[#1e1b4b]/90 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-amber-300" />
            </div>
          </div>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-300/90 block mb-0.5">
            Twilight Studio
          </span>
          <h1 className="text-xl font-extrabold tracking-tight">Personal Backlog</h1>
          <p className="text-xs text-indigo-200 mt-1">
            クリエイティブ・プロジェクト＆タスク管理 Webログイン
          </p>
        </div>

        {/* ログインフォーム */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                placeholder="例: yamada / sato / suzuki"
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
            className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm rounded-lg shadow-md shadow-indigo-500/20 hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>{isLoading ? "ログイン中..." : "ログインする"}</span>
          </button>
        </form>

        {/* 初期登録メンバーのID・権限案内（ワンクリックでフォームに入力可能） */}
        <div className="px-6 pb-6 pt-2 border-t border-slate-100 bg-slate-50/60">
          <p className="text-[11px] font-bold text-slate-500 mb-2.5">
            登録アカウント一覧（クリックでID・パスワードを自動セット）:
          </p>
          <div className="space-y-2">
            {QUICK_ACCOUNTS.map((acc) => (
              <button
                key={acc.loginId}
                type="button"
                onClick={() => handleSelectQuickAccount(acc)}
                className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between text-xs cursor-pointer ${
                  loginId === acc.loginId
                    ? "bg-indigo-50/80 border-indigo-400 ring-1 ring-indigo-300"
                    : "bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    style={{ backgroundColor: acc.color }}
                    className="w-7 h-7 rounded-full text-white font-bold text-[10px] flex items-center justify-center shrink-0"
                  >
                    {getUserInitials(acc.name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900">{acc.name}</span>
                      {acc.isAdmin ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded-full">
                          <Crown className="w-2.5 h-2.5 text-amber-600" />
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.2 rounded-full">
                          <Shield className="w-2.5 h-2.5 text-slate-400" />
                          一般ユーザー
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      ID: <strong className="text-slate-800">{acc.loginId}</strong> / PW:{" "}
                      <span className="text-slate-700">{acc.password}</span>
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-200">
                  選択
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
