// データバックアップ・復元モーダルコンポーネント
"use client";

import React, { useState } from "react";
import { X, Download, Upload, Database, CheckCircle, AlertTriangle } from "lucide-react";

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestored: () => void;
}

export default function BackupModal({ isOpen, onClose, onRestored }: BackupModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  if (!isOpen) return null;

  // JSONエクスポート処理
  const handleExport = async () => {
    try {
      setIsExporting(true);
      setMessage(null);

      const res = await fetch("/api/backup");
      if (!res.ok) throw new Error("バックアップデータの取得に失敗しました");

      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      const dateStr = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `personal-backlog-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({ text: "バックアップファイルをダウンロードしました", isError: false });
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "エクスポートに失敗しました",
        isError: true,
      });
    } finally {
      setIsExporting(false);
    }
  };

  // JSONインポート処理
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("データを復元すると、現在のデータはバックアップファイルの内容で上書きされます。よろしいですか？")) {
      e.target.value = "";
      return;
    }

    try {
      setIsImporting(true);
      setMessage(null);

      const text = await file.text();
      const json = JSON.parse(text);

      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "インポートに失敗しました");
      }

      setMessage({ text: "データを正常に復元しました！", isError: false });
      setTimeout(() => {
        onRestored();
        onClose();
      }, 1000);
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "ファイルの読み込みまたは復元に失敗しました",
        isError: true,
      });
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-indigo-100 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-gradient-to-r from-[#1e1b4b] via-[#312e81] to-[#4c1d95] px-5 py-3.5 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-amber-300" />
            <h3 className="font-bold text-base">データバックアップ・復元</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/20 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            安心してお使いいただくために、登録したすべてのプロジェクト、課題、コメント、履歴を1つのJSONファイルとして保存・復元できます。
          </p>

          {message && (
            <div
              className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                message.isError
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-indigo-50 text-indigo-800 border border-indigo-200"
              }`}
            >
              {message.isError ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* バックアップダウンロード */}
          <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/60 space-y-2">
            <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-indigo-600" />
              <span>バックアップの作成（エクスポート）</span>
            </h4>
            <p className="text-[11px] text-slate-500">
              現在のSQLiteデータベースの全データをJSONファイルとしてダウンロードします。
            </p>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white py-2 px-3 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? "エクスポート中..." : "JSONファイルをダウンロード"}</span>
            </button>
          </div>

          {/* バックアップの復元 */}
          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50/60 space-y-2">
            <h4 className="font-bold text-xs text-gray-800 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-sky-600" />
              <span>データの復元（インポート）</span>
            </h4>
            <p className="text-[11px] text-gray-500">
              過去にダウンロードしたバックアップJSONファイルを選択して復元します。
            </p>
            <label className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>{isImporting ? "復元中..." : "ファイルを選択して復元"}</span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileChange}
                disabled={isImporting}
                className="hidden"
              />
            </label>
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
