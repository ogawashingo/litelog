// プロジェクト新規作成モーダルコンポーネント
"use client";

import React, { useState } from "react";
import { X, FolderPlus } from "lucide-react";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const COLOR_PALETTE = [
  "#2ca078", // Backlogグリーン
  "#2980b9", // ブルー
  "#8e44ad", // パープル
  "#e67e22", // オレンジ
  "#e74c3c", // レッド
  "#16a085", // ティール
  "#34495e", // ネイビー
  "#d35400", // ダークオレンジ
];

export default function CreateProjectModal({
  isOpen,
  onClose,
  onCreated,
}: CreateProjectModalProps) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !key.trim()) {
      setErrorMessage("プロジェクト名とプロジェクトキーは必須です");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: key.trim().toUpperCase(),
          name: name.trim(),
          color,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "プロジェクトの作成に失敗しました");
      }

      setKey("");
      setName("");
      onCreated();
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("エラーが発生しました");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-[#2ca078] px-5 py-3.5 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5" />
            <h3 className="font-bold text-base">新規プロジェクトの作成</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/20 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
              {errorMessage}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              プロジェクト名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="例: 個人ブログリニューアル"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              プロジェクトキー（英数字） <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="例: BLOG, WORK, DEV"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              maxLength={10}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono uppercase focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              required
            />
            <p className="text-[11px] text-gray-400 mt-1">課題キーの接頭辞になります（例: BLOG-1, BLOG-2）</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              プロジェクトカラー
            </label>
            <div className="flex items-center gap-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                    color === c ? "scale-110 border-gray-800 ring-2 ring-offset-1 ring-gray-400" : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-1.5 rounded-lg bg-[#2ca078] hover:bg-[#238161] text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50"
            >
              {isSubmitting ? "作成中..." : "プロジェクトを作成"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
