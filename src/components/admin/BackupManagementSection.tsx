// データバックアップ・復元セクション
"use client";

import React from "react";
import { Database } from "lucide-react";
import { User } from "@/types";
import versionData from "@/lib/version.json";

interface BackupManagementSectionProps {
  currentUser: User | null;
  projectCount: number;
  userCount: number;
  onOpenBackup: () => void;
}

export default function BackupManagementSection({
  currentUser,
  projectCount,
  userCount,
  onOpenBackup,
}: BackupManagementSectionProps) {
  return (
    <div className="bg-white rounded-xl shadow-xs border border-indigo-100/80 p-5 flex flex-col justify-between space-y-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-slate-800 text-base">
            データバックアップ ＆ 復元
          </h3>
        </div>
        <p className="text-sm text-slate-500">
          プロジェクト、課題、コメント、添付ファイル履歴、メンバー情報などシステム全体のデータをJSONファイルとして一括保存（エクスポート）および復元（インポート）できます。
        </p>
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-sm text-slate-600 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-700">登録プロジェクト総数</span>
            <span className="font-mono font-bold text-slate-900">{projectCount} 件</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-700">登録メンバー総数</span>
            <span className="font-mono font-bold text-slate-900">{userCount} 名</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-700">システムバージョン</span>
            <span className="font-mono font-bold text-indigo-600">{versionData.version}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          if (!currentUser?.is_admin) {
            alert("データのバックアップ・復元は管理者（Admin権限）のみ実行できます。");
            return;
          }
          onOpenBackup();
        }}
        className="w-full py-2.5 px-4 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
      >
        <Database className="w-4 h-4 text-indigo-700" />
        <span>バックアップ・復元モーダルを開く</span>
      </button>
    </div>
  );
}
