// プロジェクト新規作成モーダルコンポーネント
"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, FolderPlus, Users } from "lucide-react";
import { useUser } from "./UserContext";
import { getUserInitials } from "./UserManageModal";
import { createApiError, getSafeErrorMessage } from "@/lib/clientError";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const COLOR_PALETTE = [
  "#4f46e5", // コズミックインディゴ
  "#7c3aed", // ロイヤルバイオレット
  "#db2777", // マゼンタピンク
  "#e11d48", // ローズレッド
  "#ea580c", // コーラルオレンジ
  "#d97706", // アンバーゴールド
  "#0284c7", // スカイブルー
  "#334155", // スレートネイビー
];

export default function CreateProjectModal({
  isOpen,
  onClose,
  onCreated,
}: CreateProjectModalProps) {
  const { users, currentUser } = useUser();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  // モーダルが新規に開かれた瞬間のみ初期化するための直前ステートRef
  const prevIsOpenRef = useRef(false);

  // モーダルオープン時に全ユーザーをデフォルト選択（入力中の再描画による選択リセットを防止）
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setSelectedUserIds(users.map((u) => u.id));
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, users]);

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
          memberIds: selectedUserIds,
        }),
      });

      if (!res.ok) {
        throw await createApiError(res, "プロジェクトの作成に失敗しました");
      }

      setKey("");
      setName("");
      onCreated();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(getSafeErrorMessage(err, "エラーが発生しました"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-slate-200/90 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="app-header px-5 py-3.5 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 app-nav-indicator" />
            <h3 className="font-bold text-base">新規プロジェクトの作成</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/20 transition-colors cursor-pointer">
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
            <label className="block text-xs font-bold text-slate-700 mb-1">
              プロジェクト名 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="例: 個人ブログリニューアル"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              プロジェクトキー（英数字） <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="例: BLOG, WORK, DEV"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              maxLength={15}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 font-mono uppercase focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">課題キーの接頭辞になります（例: BLOG-1, BLOG-2）</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              プロジェクトカラー
            </label>
            <div className="flex items-center gap-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                    color === c ? "scale-110 border-slate-800 ring-2 ring-offset-1 ring-indigo-400" : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* 初期参加メンバー選択 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700">
                初期参加メンバー ({selectedUserIds.length}名)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedUserIds(users.map((u) => u.id))}
                  className="text-[10px] text-indigo-600 hover:underline cursor-pointer"
                >
                  全員選択
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedUserIds(
                      users
                        .filter(
                          (u) =>
                            u.is_admin === 1 ||
                            u.role_type === "admin" ||
                            u.id === currentUser?.id
                        )
                        .map((u) => u.id)
                    )
                  }
                  className="text-[10px] text-slate-500 hover:underline cursor-pointer"
                >
                  管理者・自分のみ
                </button>
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg p-2 max-h-36 overflow-y-auto divide-y divide-slate-100 bg-slate-50/50">
              {users.map((u) => {
                const isSelected = selectedUserIds.includes(u.id);
                const isPermanent =
                  u.is_admin === 1 ||
                  u.role_type === "admin" ||
                  u.id === currentUser?.id;

                return (
                  <label
                    key={u.id}
                    className="flex items-center justify-between py-1.5 px-1 cursor-pointer hover:bg-white rounded transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                        style={{ backgroundColor: u.color || "#4f46e5" }}
                      >
                        {getUserInitials(u.name)}
                      </div>
                      <span className="text-xs text-slate-800 font-medium truncate">
                        {u.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        @{u.login_id}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isPermanent}
                      onChange={() => {
                        if (isPermanent) return;
                        setSelectedUserIds((prev) =>
                          prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                        );
                      }}
                      className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </label>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              ※管理者（Admin）と作成者は自動的に参加します。作成後もいつでも変更できます。
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-1.5 rounded-lg app-primary-btn text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? "作成中..." : "プロジェクトを作成"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
