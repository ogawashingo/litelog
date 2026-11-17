// チームメンバー管理モーダルコンポーネント（メンバーの追加・編集・削除・ログインID管理）
"use client";

import React, { useState, useEffect } from "react";
import { X, Users, UserPlus, Edit2, Trash2, Check, Shield, Crown, Lock, KeyRound, Calendar, Palette, ClipboardCheck, Search, Mail, Copy, ExternalLink, Send } from "lucide-react";
import { User, WeekStartDay, UserRoleType, getUserRoleType, isAdminUser, canManageIssues } from "@/types";
import { AVATAR_COLORS, AVATAR_COLOR_VALUES } from "@/lib/avatarColors";
import AvatarColorPicker from "./AvatarColorPicker";

interface UserManageModalProps {
  isOpen: boolean;
  initialUserId?: number | null;
  users: User[];
  currentUser: User | null;
  onSelectCurrentUser: (userId: number) => void;
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onOpenPasswordChange?: () => void;
}

// 所属プロジェクト選択用コンポーネント（検索フィルター・一括操作付きリスト形式）
interface ProjectSelectorProps {
  projects: { id: number; key: string; name: string; color: string }[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  label?: string;
}

function ProjectSelector({
  projects,
  selectedIds,
  onChange,
  label = "所属プロジェクト",
}: ProjectSelectorProps) {
  const [filterText, setFilterText] = useState("");

  const filtered = projects.filter((p) => {
    if (!filterText.trim()) return true;
    const q = filterText.toLowerCase();
    return p.key.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  });

  const toggleProject = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectAll = () => {
    onChange(projects.map((p) => p.id));
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-700">{label}:</span>
          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full font-mono">
            {selectedIds.length} / {projects.length} 件選択中
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
          >
            全選択
          </button>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
          >
            全解除
          </button>
        </div>
      </div>

      {/* 検索入力欄 */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="プロジェクトキーまたは名前で絞り込み..."
          className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* プロジェクトリスト（カード/行表示） */}
      <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white shadow-2xs">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">
            一致するプロジェクトがありません
          </div>
        ) : (
          filtered.map((p) => {
            const isChecked = selectedIds.includes(p.id);
            return (
              <div
                key={p.id}
                onClick={() => toggleProject(p.id)}
                className={`flex items-center justify-between gap-2.5 px-3 py-2 text-xs cursor-pointer select-none transition-colors ${
                  isChecked
                    ? "bg-indigo-50/70 hover:bg-indigo-100/60 border-l-3 border-indigo-600"
                    : "hover:bg-slate-50 bg-white"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleProject(p.id);
                    }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 shrink-0 cursor-pointer"
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                    style={{ backgroundColor: p.color || "#4f46e5" }}
                  />
                  <span className="font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-[11px] shrink-0">
                    {p.key}
                  </span>
                  <span className={`truncate text-xs ${isChecked ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                    {p.name}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 transition-colors ${
                    isChecked
                      ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                      : "bg-slate-100 text-slate-400 border border-slate-200"
                  }`}
                >
                  {isChecked ? "参加中" : "未参加"}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
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
  initialUserId,
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
  const [projectsList, setProjectsList] = useState<any[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 編集中のメンバーState
  const [editingId, setEditingId] = useState<number | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [editLoginId, setEditLoginId] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editRoleType, setEditRoleType] = useState<UserRoleType>("member");
  const [editColor, setEditColor] = useState("");
  const [editWeekStart, setEditWeekStart] = useState<WeekStartDay>("monday");
  const [editShowHolidays, setEditShowHolidays] = useState(true);
  const [editProjectIds, setEditProjectIds] = useState<number[]>([]);

  // 招待リンク発行State
  const [inviteResult, setInviteResult] = useState<{
    url: string;
    userName: string;
    expiresAt: string;
  } | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);

  // 招待リンク発行処理
  const handleGenerateInvite = async (userId: number, userName: string) => {
    try {
      setIsGeneratingInvite(true);
      setErrorMsg("");
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, hoursValid: 24 }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "招待リンクの発行に失敗しました");
      }
      setInviteResult({
        url: data.inviteUrl,
        userName,
        expiresAt: data.expiresAt,
      });
      // 自動でクリップボードにコピー
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(data.inviteUrl);
        setCopiedInvite(true);
        setTimeout(() => setCopiedInvite(false), 3000);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const editingUser = editingId !== null ? users.find((u) => u.id === editingId) : null;

  // メンバー一覧の検索・インクリメンタル絞り込み
  const filteredUsers = React.useMemo(() => {
    if (!memberSearchQuery.trim()) return users;
    const q = memberSearchQuery.toLowerCase().trim();
    return users.filter((u) => {
      const matchName = u.name.toLowerCase().includes(q);
      const matchLogin = u.login_id ? u.login_id.toLowerCase().includes(q) : false;
      const matchRole = u.role ? u.role.toLowerCase().includes(q) : false;
      const roleType = getUserRoleType(u);
      const matchRoleType =
        (roleType === "admin" && (q.includes("admin") || q.includes("管理者"))) ||
        (roleType === "pmo" && q.includes("pmo")) ||
        (roleType === "member" && (q.includes("一般") || q.includes("メンバー")));
      return matchName || matchLogin || matchRole || matchRoleType;
    });
  }, [users, memberSearchQuery]);

  // 編集開始（Hookなので早期リターン if (!isOpen) より前に配置）
  const startEdit = React.useCallback((user: User) => {
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
    setEditProjectIds((user.projects || []).map((p: any) => p.id));
    setErrorMsg("");
  }, []);

  // initialUserId が指定されてモーダルが開いた場合は、直接そのユーザーの編集画面を開く
  useEffect(() => {
    if (isOpen) {
      if (initialUserId) {
        const target = users.find((u) => u.id === initialUserId);
        if (target) {
          startEdit(target);
        }
      } else {
        setEditingId(null);
      }
    }
  }, [isOpen, initialUserId, users, startEdit]);

  // プロジェクト一覧ロード
  useEffect(() => {
    if (isOpen) {
      fetch("/api/projects?all=1")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setProjectsList(data);
          }
        })
        .catch((err) => console.error("プロジェクト一覧取得失敗:", err));
    }
  }, [isOpen]);

  const isCurrentUserAdmin = Boolean(currentUser?.is_admin);
  const canCurrentUserManageMembers = canManageIssues(currentUser);

  // システム管理者（Admin）の人数を算出（最後の1名の保護判定に使用）
  const adminCount = users.filter((u) => isAdminUser(u)).length;
  // 編集中ユーザーが最後の管理者かどうか
  const isEditingLastAdmin = Boolean(
    editingUser && isAdminUser(editingUser) && adminCount <= 1
  );

  if (!isOpen) return null;

  // 新規メンバー追加（基本情報のみで発行し、詳細設定は一覧の「編集」ボタンから行う）
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
      const defaultRoleLabel = "メンバー";
      // テーマ色は既存メンバー数に応じてローテーション
      const autoColor = AVATAR_COLOR_VALUES[users.length % AVATAR_COLOR_VALUES.length];
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginId: newLoginId.trim().toLowerCase(),
          password: newPassword.trim() || `${newLoginId.trim().toLowerCase()}123`,
          name: newName.trim(),
          role: newRole.trim() || defaultRoleLabel,
          isAdmin: false,
          roleType: "member",
          color: autoColor,
          weekStart: "monday",
          showHolidays: true,
          projectIds: projectsList.map((p: any) => p.id),
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
      await onUpdated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 編集保存
  const handleSaveEdit = async (userId: number) => {
    if (!editName.trim() || !editLoginId.trim()) {
      setErrorMsg("ログインIDとメンバー名は必須です");
      return;
    }

    // 最後のシステム管理者（Admin）の権限解除を防止
    if (isEditingLastAdmin && editRoleType !== "admin") {
      setErrorMsg("最低1名のシステム管理者（Admin）が必要なため、管理者権限を解除できません");
      return;
    }

    try {
      setIsSubmitting(true);
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
        projectIds: editProjectIds,
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
    } finally {
      setIsSubmitting(false);
    }
  };

  // 一覧からプロジェクトを即座にワンクリック脱退
  const handleQuickLeaveProject = async (user: User, projectId: number, projectName: string) => {
    if (!canCurrentUserManageMembers) return;
    if (!confirm(`${user.name}さんをプロジェクト「${projectName}」から脱退させますか？`)) {
      return;
    }

    try {
      const currentIds = (user.projects || []).map((p: any) => p.id);
      const nextIds = currentIds.filter((id: number) => id !== projectId);

      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectIds: nextIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "脱退処理に失敗しました");
      }

      await onUpdated();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "脱退エラーが発生しました");
    }
  };

  // メンバー削除
  const handleDeleteUser = async (user: User) => {
    if (users.length <= 1) {
      setErrorMsg("最低1名のメンバーが必要なため削除できません");
      return;
    }
    // 最後のシステム管理者（Admin）の削除を防止
    if (isAdminUser(user) && adminCount <= 1) {
      setErrorMsg("最後のシステム管理者（Admin）は削除できません");
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
      setEditingId(null);
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

          {/* 招待リンク発行成功バナー */}
          {inviteResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                  <Send className="w-4 h-4 text-emerald-600" />
                  「{inviteResult.userName}」さんの招待リンクを発行しました（24時間有効）
                </div>
                <button
                  type="button"
                  onClick={() => setInviteResult(null)}
                  className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-emerald-200 shadow-2xs">
                <input
                  type="text"
                  readOnly
                  value={inviteResult.url}
                  className="w-full text-xs font-mono text-slate-700 bg-transparent outline-hidden select-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteResult.url);
                    setCopiedInvite(true);
                    setTimeout(() => setCopiedInvite(false), 3000);
                  }}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shrink-0 cursor-pointer shadow-xs"
                >
                  {copiedInvite ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> コピー完了！
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> コピー
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                💡 このURLをSlackやメール等で相手に送るだけで、本人が安全にパスワードと2要素認証を設定できます。（管理者がパスワードを決める必要はありません）
              </p>
            </div>
          )}

          {/* 編集モード時は編集専用ビューを表示（他メンバーやログイン中カードを隠し、誰を編集しているかを明確化） */}
          {editingId !== null && editingUser ? (
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
              {/* 編集ヘッダー: 編集対象のアカウント情報を目立つ形で明示 */}
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-200">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    style={{ backgroundColor: editColor || "#4f46e5" }}
                    className="w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs"
                  >
                    {getUserInitials(editName)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-800 truncate">
                        {editName || "メンバー"} を編集中
                      </h4>
                      <span className="font-mono text-xs bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded">
                        ID: {editLoginId}
                      </span>
                      {editingUser.id === currentUser?.id ? (
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                          ログイン中（自分）
                        </span>
                      ) : (
                        <span className="text-[10px] bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-full border border-slate-200">
                          メンバー
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      所属プロジェクト（参加・脱退）、権限ロール、表示設定を変更して「保存」を押してください
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg hover:bg-white transition-colors cursor-pointer shrink-0 font-medium"
                >
                  ← 一覧に戻る
                </button>
              </div>

              {/* 編集フォーム */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      氏名 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      placeholder="メンバー名"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      役割・肩書き
                    </label>
                    <input
                      type="text"
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      placeholder="役割・肩書き"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      ログインID <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editLoginId}
                      onChange={(e) => setEditLoginId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      placeholder="ログインID"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      新しいパスワード（変更時のみ入力）
                    </label>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      placeholder="変更しない場合は空欄"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-medium shrink-0">色:</span>
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
                          disabled={isEditingLastAdmin}
                          onClick={() => {
                            if (isEditingLastAdmin) return;
                            setEditRoleType("member");
                            if (editRole === "管理者" || editRole === "PMO") setEditRole("メンバー");
                          }}
                          className={`px-2 py-0.5 rounded font-semibold transition-colors ${
                            isEditingLastAdmin
                              ? "text-slate-300 cursor-not-allowed"
                              : editRoleType === "member"
                              ? "bg-slate-700 text-white cursor-pointer"
                              : "text-slate-600 hover:text-slate-900 cursor-pointer"
                          }`}
                          title={isEditingLastAdmin ? "最低1名の管理者が残る必要があるため変更できません" : undefined}
                        >
                          一般
                        </button>
                        <button
                          type="button"
                          disabled={isEditingLastAdmin}
                          onClick={() => {
                            if (isEditingLastAdmin) return;
                            setEditRoleType("pmo");
                            if (editRole === "メンバー" || editRole === "管理者") setEditRole("PMO");
                          }}
                          className={`px-2 py-0.5 rounded font-semibold transition-colors flex items-center gap-0.5 ${
                            isEditingLastAdmin
                              ? "text-slate-300 cursor-not-allowed"
                              : editRoleType === "pmo"
                              ? "bg-emerald-600 text-white cursor-pointer"
                              : "text-slate-600 hover:text-slate-900 cursor-pointer"
                          }`}
                          title={isEditingLastAdmin ? "最低1名の管理者が残る必要があるため変更できません" : "PMO: 全課題の検収・完了が可能"}
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
                            className={`px-2 py-0.5 rounded font-semibold transition-colors flex items-center gap-0.5 cursor-pointer ${
                              editRoleType === "admin"
                                ? "bg-amber-500 text-amber-950 font-bold"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                            title="Admin: システム管理者"
                          >
                            <Crown className="w-2.5 h-2.5" />
                            Admin
                          </button>
                        )}
                      </div>
                    </div>
                    {isEditingLastAdmin && (
                      <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                        ※ 最後の管理者のため権限解除不可
                      </span>
                    )}
                  </div>

                  {/* 週開始曜日 & 祝日表示 */}
                  <div className="flex items-center gap-3">
                    <div className="inline-flex rounded border border-slate-300 bg-white p-0.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setEditWeekStart("monday")}
                        className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                          editWeekStart === "monday"
                            ? "bg-indigo-600 text-white"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        月曜始まり
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditWeekStart("sunday")}
                        className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                          editWeekStart === "sunday"
                            ? "bg-indigo-600 text-white"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        日曜始まり
                      </button>
                    </div>

                    <label className="inline-flex items-center gap-1 text-xs text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editShowHolidays}
                        onChange={(e) => setEditShowHolidays(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                      />
                      <span>日本の祝日表示</span>
                    </label>
                  </div>
                </div>

                {/* 編集時の所属プロジェクト選択（全ロールで自由に参加・脱退を選択可能） */}
                {projectsList.length > 0 && (
                  <div className="w-full pt-2 border-t border-slate-200">
                    <ProjectSelector
                      projects={projectsList}
                      selectedIds={editProjectIds}
                      onChange={setEditProjectIds}
                      label="所属プロジェクト"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
                  <div>
                    {isCurrentUserAdmin && users.length > 1 && editingUser.id !== currentUser?.id && (() => {
                      const isLastAdmin = isAdminUser(editingUser) && adminCount <= 1;
                      return (
                        <button
                          type="button"
                          disabled={isSubmitting || isLastAdmin}
                          onClick={() => {
                            if (isLastAdmin) {
                              setErrorMsg("最後のシステム管理者（Admin）は削除できません");
                              return;
                            }
                            handleDeleteUser(editingUser);
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md transition-colors font-medium ${
                            isLastAdmin
                              ? "text-slate-300 border-slate-200 cursor-not-allowed bg-slate-50"
                              : "text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 cursor-pointer"
                          }`}
                          title={
                            isLastAdmin
                              ? "最後の管理者（Admin）は削除できません"
                              : "このメンバーを削除（Admin専用）"
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>このメンバーを削除</span>
                        </button>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    {isCurrentUserAdmin && (
                      <button
                        type="button"
                        disabled={isGeneratingInvite || isSubmitting}
                        onClick={() => handleGenerateInvite(editingUser.id, editName)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border border-emerald-300 rounded-md transition-colors cursor-pointer font-medium disabled:opacity-50"
                        title="本人にパスワードと2要素認証を設定してもらう招待URLを発行してクリップボードにコピーします"
                      >
                        <Mail className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{isGeneratingInvite ? "発行中..." : "招待リンクを発行"}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      disabled={isSubmitting}
                      className="px-4 py-1.5 text-xs border border-slate-300 rounded-md text-slate-600 hover:bg-slate-100 cursor-pointer font-medium disabled:opacity-50"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSaveEdit(editingUser.id)}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-xs app-primary-btn text-white font-bold rounded-md cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isSubmitting ? "保存中..." : "保存"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
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
                    初期パスワード（省略時は招待リンクで本人が設定可）
                  </label>
                  <input
                    type="text"
                    placeholder="省略可（追加後に招待リンクを発行できます）"
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

              <p className="text-[11px] text-slate-500 pt-0.5">
                ※ 権限ロール、所属プロジェクト、テーマ色等の詳細設定は、追加後に一覧の「編集」ボタンから行えます。
              </p>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-700">
                登録メンバー一覧 ({users.length}名)
                {memberSearchQuery.trim() && (
                  <span className="ml-1.5 text-indigo-600 font-semibold">
                    (絞り込み: {filteredUsers.length}件)
                  </span>
                )}
              </h4>

              {/* メンバー検索入力バー */}
              <div className="relative flex items-center min-w-[200px] max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  placeholder="メンバー名・ID・役割で検索..."
                  className="w-full pl-8 pr-6 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                {memberSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setMemberSearchQuery("")}
                    className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-600 rounded-sm cursor-pointer"
                    title="絞り込みをクリア"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white">
              {filteredUsers.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  「{memberSearchQuery}」に一致するメンバーは見つかりませんでした。
                  <button
                    type="button"
                    onClick={() => setMemberSearchQuery("")}
                    className="ml-2 text-indigo-600 font-semibold hover:underline cursor-pointer"
                  >
                    検索条件をクリア
                  </button>
                </div>
              ) : (
                filteredUsers.map((u) => {
                const isCurrent = currentUser?.id === u.id;
                return (
                  <div
                    key={u.id}
                    className={`p-3.5 transition-colors ${
                      isCurrent ? "bg-indigo-50/50" : "hover:bg-slate-50"
                    }`}
                  >
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

                            {/* 所属プロジェクトタグ表示 */}
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              <span className="text-[10px] font-semibold text-slate-400 shrink-0">参加案件:</span>
                              {projectsList.length > 0 && (u.projects || []).length === projectsList.length ? (
                                <span className="text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded">
                                  全プロジェクト参加
                                </span>
                              ) : (u.projects || []).length > 0 ? (
                                <div className="flex items-center gap-1 flex-wrap">
                                  {(u.projects || []).map((p) => (
                                    <span
                                      key={p.id}
                                      className="inline-flex items-center gap-1 text-[10px] font-mono pl-1.5 pr-1 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                                      title={`${p.name} (${p.key})`}
                                    >
                                      <span
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{ backgroundColor: p.color || "#4f46e5" }}
                                      />
                                      <span>{p.key}</span>
                                      {canCurrentUserManageMembers && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleQuickLeaveProject(u, p.id, p.name);
                                          }}
                                          title={`【脱退】${u.name}さんをプロジェクト「${p.name}」から脱退させます`}
                                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-100 p-0.5 rounded transition-colors cursor-pointer ml-0.5"
                                        >
                                          <X className="w-2.5 h-2.5" />
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                                  未配属
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 右側: 招待・編集・削除ボタン */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isCurrentUserAdmin && (
                            <button
                              type="button"
                              disabled={isGeneratingInvite}
                              onClick={() => handleGenerateInvite(u.id, u.name)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border border-emerald-300 rounded-md transition-colors cursor-pointer font-medium disabled:opacity-50"
                              title={`【招待リンク発行】${u.name}さん専用のパスワード・2FA設定URLを発行してクリップボードにコピー`}
                            >
                              <Mail className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="hidden sm:inline">招待</span>
                            </button>
                          )}
                          {!canCurrentUserManageMembers && isCurrent && onOpenPasswordChange && (
                            <button
                              type="button"
                              onClick={onOpenPasswordChange}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-300 rounded-md transition-colors cursor-pointer font-medium"
                              title="マイアカウント設定（アイコン色・パスワード変更）"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>編集</span>
                            </button>
                          )}
                          {(isCurrentUserAdmin || (canCurrentUserManageMembers && getUserRoleType(u) !== "admin")) && (
                            <button
                              type="button"
                              onClick={() => startEdit(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-300 rounded-md transition-colors cursor-pointer font-medium"
                              title="メンバー情報を編集（権限・所属プロジェクト・表示設定等）"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>編集</span>
                            </button>
                          )}
                          {isCurrentUserAdmin && users.length > 1 && !isCurrent && (() => {
                            const isLastAdmin = isAdminUser(u) && adminCount <= 1;
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  if (isLastAdmin) {
                                    setErrorMsg("最後のシステム管理者（Admin）は削除できません");
                                    return;
                                  }
                                  handleDeleteUser(u);
                                }}
                                disabled={isLastAdmin}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs border rounded-md transition-colors font-medium ${
                                  isLastAdmin
                                    ? "text-slate-300 border-slate-200 cursor-not-allowed bg-slate-50"
                                    : "text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 cursor-pointer"
                                }`}
                                title={
                                  isLastAdmin
                                    ? "最後の管理者（Admin）は削除できません"
                                    : "メンバーを削除（Admin専用）"
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>削除</span>
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                  </div>
                );
              })
            )}
            </div>
          </div>
            </>
          )}
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
