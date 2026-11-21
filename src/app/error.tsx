// アプリケーション共通のエラーバウンダリ画面（内部エラー詳細を画面へ露出しない）
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // デバッグ用のエラー詳細はコンソールにのみ記録し、画面には表示しない
    console.error("アプリケーションエラー:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          予期しないエラーが発生しました
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
          画面の表示中に問題が発生しました。時間をおいて再度お試しいただくか、トップページへお戻りください。
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            再試行する
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium px-4 py-2.5 transition-colors"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            トップページへ
          </Link>
        </div>
      </div>
    </div>
  );
}
