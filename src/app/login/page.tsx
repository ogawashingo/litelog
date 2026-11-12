// Webログイン画面 (/login)
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, LogIn, KeyRound, User as UserIcon, AlertCircle } from "lucide-react";
import { useUser } from "@/components/UserContext";

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
          <h1 className="text-xl font-extrabold tracking-tight">Personal Backlog</h1>
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
            className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm rounded-lg shadow-md shadow-indigo-500/20 hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>{isLoading ? "ログイン中..." : "ログインする"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
