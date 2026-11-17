// チームメンバー管理モーダルコンポーネント（メンバーの追加・編集・削除・ログインID管理）
"use client";

import React, { useState } from "react";
import { X, Users, UserPlus, Edit2, Trash2, Check, Shield, Crown, Lock, KeyRound, Calendar, Palette, ClipboardCheck } from "lucide-react";
import { User, WeekStartDay, UserRoleType, getUserRoleType, canManageIssues } from "@/types";
import { AVATAR_COLORS, AVATAR_COLOR_VALUES } from "@/lib/avatarColors";
import AvatarColorPicker from "./AvatarColorPicker";

interface UserManageModalProps {
  isOpen: boolean;
  users: User[];
  currentUser: User | null;
  onSelectCurrentUser: (userId: number) => void;
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onOpenPasswordChange?: () => void;
}

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
  const [newRoleType, setNewRoleType] = useState<UserRoleType>("member");
  const [newColor, setNewColor] = useState(AVATAR_COLOR_VALUES[0]);
  const [newWeekStart, setNewWeekStart] = useState<WeekStartDay>("monday");
  const [newShowHolidays, setNewShowHolidays] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 編集中のメンバーState
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLoginId, setEditLoginId] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editRoleType, setEditRoleType] = useState<UserRoleType>("member");
  const [editColor, setEditColor] = useState("");
  const [editWeekStart, setEditWeekStart] = useState<WeekStartDay>("monday");
  const [editShowHolidays, setEditShowHolidays] = useState(true);

  const isCurrentUserAdmin = Boolean(currentUser?.is_admin);
  const canCurrentUserManageMembers = canManageIssues(currentUser);

  if (!isOpen) return null;

  // 新規メンバー追加
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCurrentUserManageMembers) {
      setErrorMsg("メンバーの追加には管理者（Admin）またはPMO権限が必要です");
      return;
    }
    if (!newLoginId.trim() || !newName.trim()) {
      setErrorMsg("ログインIDとメンバー名を入力してください");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg("");
      const defaultRoleLabel =
        newRoleType === "admin" ? "管理者" : newRoleType === "pmo" ? "PMO" : "メンバー";
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginId: newLoginId.trim().toLowerCase(),
          password: newPassword.trim() || `${newLoginId.trim().toLowerCase()}123`,
          name: newName.trim(),
          role: newRole.trim() || defaultRoleLabel,
          isAdmin: newRoleType === "admin",
          roleType: newRoleType,
          color: newColor,
          weekStart: newWeekStart,
          showHolidays: newShowHolidays,
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
      setNewRoleType("member");
      setNewWeekStart("monday");
      setNewShowHolidays(true);
      const nextColorIdx = (users.length + 1) % AVATAR_COLOR_VALUES.length;
      setNewColor(AVATAR_COLOR_VALUES[nextColorIdx]);
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
    setEditRoleType(getUserRoleType(user));
    setEditColor(user.color || "#4f46e5");
    setEditWeekStart(user.week_start || "monday");
    setEditShowHolidays(
      user.show_holidays !== undefined ? Boolean(user.show_holidays) : true
    );
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
      const defaultRoleLabel =
        editRoleType === "admin" ? "管理者" : editRoleType === "pmo" ? "PMO" : "メンバー";
      const payload: Record<string, unknown> = {
        loginId: editLoginId.trim().toLowerCase(),
        name: editName.trim(),
        role: editRole.trim() || defaultRoleLabel,
        isAdmin: editRoleType === "admin",
        roleType: editRoleType,
        color: editColor,
        weekStart: editWeekStart,
        showHolidays: editShowHolidays,
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
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white sm:rounded-xl shadow-2xl border border-slate-200/90 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col h-full sm:h-auto sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー（テーマ連動） */}
        <div className="app-header px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 app-nav-indicator" />
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

          {/* 新規メンバー追加フォーム（AdminまたはPMO権限で操作可能） */}
          {canCurrentUserManageMembers ? (
            <form
              onSubmit={handleAddUser}
              className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-indigo-600" />
                  <span>新しいメンバーアカウントを発行</span>
                </h4>
                {isCurrentUserAdmin ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                    <Crown className="w-3 h-3 text-amber-600" />
                    Admin 権限でログイン中 ({currentUser?.name})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                    <ClipboardCheck className="w-3 h-3 text-emerald-600" />
                    PMO 権限でログイン中 ({currentUser?.name})
                  </span>
                )}
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
                    className="w-full py-1.5 px-3 app-primary-btn text-white font-bold text-xs rounded-md shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? "追加中..." : "＋ メンバー追加"}
                  </button>
                </div>
              </div>

              {/* アバターカラー ＆ Admin権限付与チェック */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-medium shrink-0">テーマ色:</span>
                  <AvatarColorPicker
                    selectedColor={newColor}
                    onChange={setNewColor}
                    mode="popover"
                    size="sm"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-700">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[11px] font-semibold text-slate-600">カレンダー:</span>
                    <div className="inline-flex rounded border border-slate-300 bg-white p-0.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setNewWeekStart("monday")}
                        className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                          newWeekStart === "monday"
                            ? "bg-indigo-600 text-white"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        月曜始まり
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewWeekStart("sunday")}
                        className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                          newWeekStart === "sunday"
                            ? "bg-indigo-600 text-white"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        日曜始まり
                      </button>
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-1 text-xs text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newShowHolidays}
                      onChange={(e) => setNewShowHolidays(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                    />
                    <span>日本の祝日表示</span>
                  </label>

                  {/* 3段階ロール（一般 / PMO / Admin）選択 */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-700">
                    <Shield className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[11px] font-semibold text-slate-600">権限ロール:</span>
                    <div className="inline-flex rounded border border-slate-300 bg-white p-0.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => {
                          setNewRoleType("member");
                          if (newRole === "管理者" || newRole === "PMO") setNewRole("メンバー");
                        }}
                        className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                          newRoleType === "member"
                            ? "bg-slate-700 text-white"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        一般
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewRoleType("pmo");
                          if (newRole === "メンバー" || newRole === "管理者") setNewRole("PMO");
                        }}
                        className={`px-2 py-0.5 rounded font-semibold transition-colors flex items-center gap-0.5 cursor-pointer ${
                          newRoleType === "pmo"
                            ? "bg-emerald-600 text-white"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        title="PMO / 進行管理: 全課題の検収・完了が可能（システム設定やユーザー削除は不可）"
                      >
                        <ClipboardCheck className="w-2.5 h-2.5" />
                        PMO
                      </button>
                      {isCurrentUserAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setNewRoleType("admin");
                            if (newRole === "メンバー" || newRole === "PMO") setNewRole("管理者");
                          }}
                          className={`px-2 py-0.5 rounded font-semibold transition-colors flex items-center gap-0.5 cursor-pointer ${
                            newRoleType === "admin"
                              ? "bg-amber-500 text-amber-950 font-bold"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                          title="システム管理者: メンバー管理・システム設定などすべての操作が可能"
                        >
                          <Crown className="w-2.5 h-2.5" />
                          Admin
                        </button>
                      )}
                    </div>
                  </div>
                </div>
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
                              <span className="text-[10px] text-slate-500 font-medium shrink-0">色:</span>
                              <AvatarColorPicker
                                selectedColor={editColor}
                                onChange={setEditColor}
                                mode="popover"
                                size="sm"
                              />
                            </div>
                            {/* 編集時: 3段階ロール（一般 / PMO / Admin）切替 */}
                            <div className="flex items-center gap-1 text-[11px] text-slate-600">
                              <Shield className="w-3.5 h-3.5 text-slate-400" />
                              <div className="inline-flex rounded border border-slate-300 bg-white p-0.5 text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditRoleType("member");
                                    if (editRole === "管理者" || editRole === "PMO") setEditRole("メンバー");
                                  }}
                                  className={`px-1.5 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                                    editRoleType === "member"
                                      ? "bg-slate-700 text-white"
                                      : "text-slate-600 hover:text-slate-900"
                                  }`}
                                >
                                  一般
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditRoleType("pmo");
                                    if (editRole === "メンバー" || editRole === "管理者") setEditRole("PMO");
                                  }}
                                  className={`px-1.5 py-0.5 rounded font-semibold transition-colors flex items-center gap-0.5 cursor-pointer ${
                                    editRoleType === "pmo"
                                      ? "bg-emerald-600 text-white"
                                      : "text-slate-600 hover:text-slate-900"
                                  }`}
                                >
                                  <ClipboardCheck className="w-2.5 h-2.5" />
                                  PMO
                                </button>
                                {isCurrentUserAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditRoleType("admin");
                                      if (editRole === "メンバー" || editRole === "PMO") setEditRole("管理者");
                                    }}
                                    className={`px-1.5 py-0.5 rounded font-semibold transition-colors flex items-center gap-0.5 cursor-pointer ${
                                      editRoleType === "admin"
                                        ? "bg-amber-500 text-amber-950 font-bold"
                                        : "text-slate-600 hover:text-slate-900"
                                    }`}
                                  >
                                    <Crown className="w-2.5 h-2.5" />
                                    Admin
                                  </button>
                                )}
                              </div>
                            </div>
                            {/* カレンダー個人設定切替 */}
                            <div className="flex items-center gap-1 text-[11px] text-slate-600 ml-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <div className="inline-flex rounded border border-slate-300 bg-white p-0.5 text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => setEditWeekStart("monday")}
                                  className={`px-1.5 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                                    editWeekStart === "monday"
                                      ? "bg-indigo-600 text-white"
                                      : "text-slate-600 hover:text-slate-900"
                                  }`}
                                >
                                  月始
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditWeekStart("sunday")}
                                  className={`px-1.5 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                                    editWeekStart === "sunday"
                                      ? "bg-indigo-600 text-white"
                                      : "text-slate-600 hover:text-slate-900"
                                  }`}
                                >
                                  日始
                                </button>
                              </div>
                            </div>
                            <label className="inline-flex items-center gap-1 text-[11px] text-slate-700 cursor-pointer ml-1 select-none">
                              <input
                                type="checkbox"
                                checked={editShowHolidays}
                                onChange={(e) => setEditShowHolidays(e.target.checked)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                              />
                              <span>祝日表示</span>
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
                              className="flex items-center gap-1 px-3 py-1 text-xs app-primary-btn text-white font-bold rounded cursor-pointer"
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
                              {getUserRoleType(u) === "admin" ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded-full">
                                  <Crown className="w-3 h-3 text-amber-600" />
                                  Admin権限
                                </span>
                              ) : getUserRoleType(u) === "pmo" ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded-full">
                                  <ClipboardCheck className="w-3 h-3 text-emerald-600" />
                                  PMO権限
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-full">
                                  一般メンバー
                                </span>
                              )}
                              {isCurrent && (
                                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 px-1.5 py-0.5 rounded-full">
                                  ログイン中
                                </span>
                              )}
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                                <Calendar className="w-2.5 h-2.5 text-slate-400" />
                                {u.week_start === "sunday" ? "日曜始まり" : "月曜始まり"}
                              </span>
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
                          {!canCurrentUserManageMembers && isCurrent && onOpenPasswordChange && (
                            <button
                              type="button"
                              onClick={onOpenPasswordChange}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                              title="マイアカウント設定（アイコン色・パスワード変更）"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {(isCurrentUserAdmin || (canCurrentUserManageMembers && getUserRoleType(u) !== "admin")) && (
                            <button
                              type="button"
                              onClick={() => startEdit(u)}
                              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors cursor-pointer"
                              title="メンバー情報を編集（Admin / PMO）"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {isCurrentUserAdmin && users.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                              title="メンバーを削除（Admin専用）"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
