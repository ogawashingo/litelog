// 404 Not Found カスタム画面
import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
          <FileQuestion className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="text-xs font-semibold tracking-widest text-indigo-600 dark:text-indigo-400 mb-1">
          404 NOT FOUND
        </p>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          ページが見つかりませんでした
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
          お探しのページは削除されたか、URLが変更された可能性があります。
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 transition-colors"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          トップページへ戻る
        </Link>
      </div>
    </div>
  );
}
