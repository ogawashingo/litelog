// チームメンバー管理モーダルコンポーネント（メンバーの追加・編集・削除・ログインID管理）
"use client";

import React, { useState } from "react";
import { X, Users, UserPlus, Edit2, Trash2, Check, Shield, Crown, Lock, KeyRound } from "lucide-react";
import { User } from "@/types";

interface UserManageModalProps {
  isOpen: boolean;
  users: User[];
  currentUser: User | null;
  onSelectCurrentUser: (userId: number) => void;
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onOpenPasswordChange?: () => void;
}

// プリセットアバターカラー（緑を排除したコズミックカラーパレット）
const AVATAR_COLORS = [
  "#4f46e5", // コズミックインディゴ
  "#3b82f6", // ブルー
  "#8b5cf6", // バイオレット
  "#ec4899", // ピンク
  "#f59e0b", // アンバー
  "#ef4444", // ローズレッド
  "#0284c7", // スカイブルー
  "#ea580c", // コーラルオレンジ
];

// 名前からアバター表示用の頭文字（1〜2文字）を取得
export function getUserInitials(name?: string | null): string {
  if (!name) return "未";
  const trimmed = name.trim();
  if (!trimmed) return "未";
  // スペース区切りの場合は姓の1文字目＋名の1文字目、そうでなければ先頭2文字
  const parts = trimmed.split(/[\s　]+/);
  if (parts.length >= 2 && parts[0].length > 0 && parts[1].length > 0) {
    return `${parts[0][0]}${parts[1][0]}`;
  }
  return trimmed.slice(0, 2);
}

export default function UserManageModal({
  isOpen,
  users,
  currentUser,
  onClose,
  onUpdated,
  onOpenPasswordChange,
}: UserManageModalProps) {
  // 新規メンバー追加フォーム用State
  const [newLoginId, setNewLoginId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("メンバー");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [newColor, setNewColor] = useState(AVATAR_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 編集中のメンバーState
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLoginId, setEditLoginId] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [editColor, setEditColor] = useState("");

  const isCurrentUserAdmin = Boolean(currentUser?.is_admin);

  if (!isOpen) return null;

  // 新規メンバー追加
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCurrentUserAdmin) {
      setErrorMsg("メンバーの追加には管理者（Admin）権限が必要です");
      return;
    }
    if (!newLoginId.trim() || !newName.trim()) {
      setErrorMsg("ログインIDとメンバー名を入力してください");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg("");
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginId: newLoginId.trim().toLowerCase(),
          password: newPassword.trim() || `${newLoginId.trim().toLowerCase()}123`,
          name: newName.trim(),
          role: newRole.trim() || (newIsAdmin ? "管理者" : "メンバー"),
          isAdmin: newIsAdmin,
          color: newColor,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "メンバーの追加に失敗しました");
      }

      setNewLoginId("");
      setNewPassword("");
      setNewName("");
      setNewRole("メンバー");
      setNewIsAdmin(false);
      const nextColorIdx = (users.length + 1) % AVATAR_COLORS.length;
      setNewColor(AVATAR_COLORS[nextColorIdx]);
      await onUpdated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 編集開始
  const startEdit = (user: User) => {
    setEditingId(user.id);
    setEditLoginId(user.login_id || "");
    setEditPassword("");
    setEditName(user.name);
    setEditRole(user.role || "メンバー");
    setEditIsAdmin(Boolean(user.is_admin));
    setEditColor(user.color || "#4f46e5");
    setErrorMsg("");
  };

  // 編集保存
  const handleSaveEdit = async (userId: number) => {
    if (!editName.trim() || !editLoginId.trim()) {
      setErrorMsg("ログインIDとメンバー名は必須です");
      return;
    }

    try {
      setErrorMsg("");
      const payload: Record<string, unknown> = {
        loginId: editLoginId.trim().toLowerCase(),
        name: editName.trim(),
        role: editRole.trim() || (editIsAdmin ? "管理者" : "メンバー"),
        isAdmin: editIsAdmin,
        color: editColor,
      };
      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }

      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "更新に失敗しました");
      }

      setEditingId(null);
      await onUpdated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "更新エラーが発生しました");
    }
  };

  // メンバー削除
  const handleDeleteUser = async (user: User) => {
    if (users.length <= 1) {
      setErrorMsg("最低1名のメンバーが必要なため削除できません");
      return;
    }
    if (
      !confirm(
        `メンバー「${user.name} (ID: ${user.login_id})」を削除しますか？\n（担当している課題は「未割当」になります）`
      )
    ) {
      return;
    }

    try {
      setErrorMsg("");
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "削除に失敗しました");
      }
      await onUpdated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "削除エラーが発生しました");
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-indigo-100 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* モーダルヘッダー */}
        <div className="bg-gradient-to-r from-[#1e1b4b] via-[#312e81] to-[#4c1d95] px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-300" />
            <h3 className="font-bold text-lg">チームメンバー・アカウント管理</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-white/20 transition-colors text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コンテンツ領域 */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
              {errorMsg}
            </div>
          )}

          {/* 新規メンバー追加フォーム（Admin権限のみ操作可能） */}
          {isCurrentUserAdmin ? (
            <form
              onSubmit={handleAddUser}
              className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-indigo-600" />
                  <span>新しいメンバーアカウントを発行</span>
                </h4>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                  <Crown className="w-3 h-3 text-amber-600" />
                  Admin 権限でログイン中 ({currentUser?.name})
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    ログインID（半角英数字） <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="例: takahashi"
                    value={newLoginId}
                    onChange={(e) => setNewLoginId(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    初期パスワード（省略時: ID+123）
                  </label>
                  <input
                    type="text"
                    placeholder="例: takahashi123"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    氏名・表示名 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="例: 高橋 健太"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    役割・肩書き
                  </label>
                  <input
                    type="text"
                    placeholder="例: エンジニア、PM"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-1.5 px-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-xs rounded-md shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? "追加中..." : "＋ メンバー追加"}
                  </button>
                </div>
              </div>

              {/* アバターカラー ＆ Admin権限付与チェック */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-medium">テーマ色:</span>
                  <div className="flex items-center gap-1.5">
                    {AVATAR_COLORS.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setNewColor(col)}
                        style={{ backgroundColor: col }}
                        className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                          newColor === col
                            ? "scale-125 ring-2 ring-offset-1 ring-slate-700"
                            : "opacity-75 hover:opacity-100"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newIsAdmin}
                    onChange={(e) => {
                      setNewIsAdmin(e.target.checked);
                      if (e.target.checked && newRole === "メンバー") {
                        setNewRole("管理者");
                      }
                    }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <Crown className="w-3.5 h-3.5 text-amber-500" />
                  <span>管理者権限（Admin）を付与する</span>
                </label>
              </div>
            </form>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex items-center justify-between gap-3 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  現在 <strong>{currentUser?.name} (ID: {currentUser?.login_id})</strong> の<strong>一般ユーザー権限</strong>でログイン中です。ご自身のアイコンまたは名前をクリックすると、アイコンの色やパスワードを変更できます。
                </span>
              </div>
            </div>
          )}

          {/* 登録済みメンバー一覧 */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-700">
                登録メンバー一覧 ({users.length}名)
              </h4>
              <span className="text-[11px] text-slate-500">
                ※別アカウントで操作する場合はヘッダー右上の「ログアウト」から別IDでログインしてください
              </span>
            </div>

            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white">
              {users.map((u) => {
                const isCurrent = currentUser?.id === u.id;
                const isEditingThis = editingId === u.id;

                return (
                  <div
                    key={u.id}
                    className={`p-3.5 transition-colors ${
                      isCurrent ? "bg-indigo-50/50" : "hover:bg-slate-50"
                    }`}
                  >
                    {isEditingThis ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                              氏名
                            </label>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-900"
                              placeholder="メンバー名"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                              役割・肩書き
                            </label>
                            <input
                              type="text"
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-900"
                              placeholder="役割・肩書き"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                              ログインID
                            </label>
                            <input
                              type="text"
                              value={editLoginId}
                              onChange={(e) => setEditLoginId(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-900 font-mono"
                              placeholder="ログインID"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                              新しいパスワード（変更時のみ入力）
                            </label>
                            <input
                              type="password"
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-900 font-mono"
                              placeholder="変更しない場合は空欄"
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              {AVATAR_COLORS.map((col) => (
                                <button
                                  key={col}
                                  type="button"
                                  onClick={() => setEditColor(col)}
                                  style={{ backgroundColor: col }}
                                  className={`w-5 h-5 rounded-full cursor-pointer ${
                                    editColor === col ? "ring-2 ring-offset-1 ring-slate-800" : "opacity-70"
                                  }`}
                                />
                              ))}
                            </div>
                            <label className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editIsAdmin}
                                onChange={(e) => setEditIsAdmin(e.target.checked)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <Crown className="w-3.5 h-3.5 text-amber-500" />
                              <span>Admin権限</span>
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="px-2.5 py-1 text-xs border border-slate-300 rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
                            >
                              キャンセル
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(u.id)}
                              className="flex items-center gap-1 px-3 py-1 text-xs bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded hover:from-indigo-700 hover:to-violet-700 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>保存</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        {/* 左側: アバターと名前・ログインID・権限（本人の場合はクリックでマイアカウント設定を起動） */}
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            disabled={!isCurrent || !onOpenPasswordChange}
                            onClick={() => isCurrent && onOpenPasswordChange?.()}
                            style={{ backgroundColor: u.color || "#4f46e5" }}
                            title={
                              isCurrent
                                ? "クリックしてマイアカウント設定（アイコン色・パスワード変更）を開く"
                                : undefined
                            }
                            className={`w-9 h-9 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs transition-transform ${
                              isCurrent && onOpenPasswordChange
                                ? "cursor-pointer hover:scale-105 ring-2 ring-indigo-300"
                                : "cursor-default"
                            }`}
                          >
                            {getUserInitials(u.name)}
                          </button>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {isCurrent && onOpenPasswordChange ? (
                                <button
                                  type="button"
                                  onClick={onOpenPasswordChange}
                                  title="クリックしてマイアカウント設定（アイコン色・パスワード変更）を開く"
                                  className="font-bold text-sm text-slate-900 hover:text-indigo-600 hover:underline truncate cursor-pointer text-left"
                                >
                                  {u.name}
                                </button>
                              ) : (
                                <span className="font-bold text-sm text-slate-900 truncate">
                                  {u.name}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-0.5 text-[11px] font-mono text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded">
                                <KeyRound className="w-2.5 h-2.5 text-slate-400" />
                                ID: {u.login_id}
                              </span>
                              {Boolean(u.is_admin) ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded-full">
                                  <Crown className="w-3 h-3 text-amber-600" />
                                  Admin権限
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-full">
                                  一般ユーザー
                                </span>
                              )}
                              {isCurrent && (
                                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 px-1.5 py-0.5 rounded-full">
                                  ログイン中
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                              <span className="flex items-center gap-1">
                                <Shield className="w-3 h-3 text-slate-400" />
                                {u.role || "メンバー"}
                              </span>
                              <span>
                                担当課題: <strong className="text-slate-700">{u.open_issue_count ?? 0}</strong> 件（全 {u.issue_count ?? 0} 件）
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 右側: 編集・削除ボタン */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isCurrentUserAdmin && isCurrent && onOpenPasswordChange && (
                            <button
                              type="button"
                              onClick={onOpenPasswordChange}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                              title="マイアカウント設定（アイコン色・パスワード変更）"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {isCurrentUserAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(u)}
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                                title="メンバー情報を編集（Admin専用）"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              {users.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="メンバーを削除（Admin専用）"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
