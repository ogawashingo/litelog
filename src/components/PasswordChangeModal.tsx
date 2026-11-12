// ログイン中ユーザー（一般ユーザー・管理者共通）のパスワード変更モーダルコンポーネント
"use client";

import React, { useState, useEffect } from "react";
import { X, KeyRound, Check, AlertCircle, Eye, EyeOff, Shield, Crown } from "lucide-react";
import { User } from "@/types";
import { getUserInitials } from "./UserManageModal";

interface PasswordChangeModalProps {
  isOpen: boolean;
  currentUser: User | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function PasswordChangeModal({
  isOpen,
  currentUser,
  onClose,
  onSuccess,
}: PasswordChangeModalProps) {
  // パスワード入力用State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // モーダル開閉時に入力内容をリセット
  useEffect(() => {
    if (isOpen) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswords(false);
      setErrorMsg("");
      setSuccessMsg("");
    }
  }, [isOpen]);

  if (!isOpen || !currentUser) return null;

  // パスワード変更フォーム送信処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!currentPassword) {
      setErrorMsg("現在のパスワードを入力してください");
      return;
    }
    if (!newPassword.trim()) {
      setErrorMsg("新しいパスワードを入力してください");
      return;
    }
    if (newPassword.trim().length < 4) {
      setErrorMsg("新しいパスワードは4文字以上で入力してください");
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      setErrorMsg("新しいパスワードと確認用パスワードが一致しません");
      return;
    }
    if (currentPassword === newPassword.trim()) {
      setErrorMsg("新しいパスワードには現在のパスワードと異なるものを指定してください");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword: newPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "パスワードの変更に失敗しました");
      }

      setSuccessMsg("パスワードを変更しました。次回ログイン時から新しいパスワードが有効になります。");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "パスワード変更中にエラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
        {/* モーダルヘッダー */}
        <div className="bg-gradient-to-r from-[#1e1b4b] via-[#312e81] to-[#4c1d95] px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-300" />
            <h3 className="font-bold text-base">パスワードの変更</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-white/20 transition-colors text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* フォーム本体 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 対象アカウント情報 */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div
              style={{ backgroundColor: currentUser.color || "#2ca078" }}
              className="w-10 h-10 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs"
            >
              {getUserInitials(currentUser.name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-sm text-gray-900">{currentUser.name}</span>
                {Boolean(currentUser.is_admin) ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded-full">
                    <Crown className="w-3 h-3 text-amber-600" />
                    Admin
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full">
                    <Shield className="w-3 h-3 text-indigo-500" />
                    一般ユーザー
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 font-mono mt-0.5">
                ログインID: <strong className="text-gray-800">{currentUser.login_id}</strong>
              </div>
            </div>
          </div>

          {/* エラーメッセージ */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 完了メッセージ */}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-medium flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* 現在のパスワード */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              現在のパスワード <span className="text-red-500">*</span>
            </label>
            <input
              type={showPasswords ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="現在のパスワードを入力"
              autoComplete="current-password"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 新しいパスワード */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              新しいパスワード（4文字以上） <span className="text-red-500">*</span>
            </label>
            <input
              type={showPasswords ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新しいパスワードを入力"
              autoComplete="new-password"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 新しいパスワード（確認用） */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              新しいパスワード（確認用） <span className="text-red-500">*</span>
            </label>
            <input
              type={showPasswords ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="確認のためもう一度入力"
              autoComplete="new-password"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* パスワード表示切替 */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setShowPasswords((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 cursor-pointer select-none"
            >
              {showPasswords ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-gray-500" />
                  <span>パスワードを隠す</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-gray-500" />
                  <span>入力中のパスワードを表示する</span>
                </>
              )}
            </button>
          </div>

          {/* フッターボタン */}
          <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              閉じる
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2ca078] hover:bg-[#238161] text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSubmitting ? "変更中..." : "パスワードを変更する"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
