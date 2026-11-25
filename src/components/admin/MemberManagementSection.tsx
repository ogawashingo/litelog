// チームメンバー・権限管理セクション
"use client";

import React, { useState } from "react";
import {
  Users,
  Plus,
  Search,
  X,
  KeyRound,
  Crown,
  Edit2,
} from "lucide-react";
import { createApiError, getSafeErrorMessage } from "@/lib/clientError";
import { getUserInitials } from "@/components/UserManageModal";
import { getAvatarColorLabel } from "@/lib/avatarColors";
import {
  User,
  Project,
  getUserRoleType,
  canManageIssues,
} from "@/types";

interface MemberManagementSectionProps {
  currentUser: User | null;
  users: User[];
  projects: Project[];
  openUserManageModal: (userId?: number) => void;
  refreshUsers: () => Promise<void>;
}

export default function MemberManagementSection({
  currentUser,
  users,
  projects,
  openUserManageModal,
  refreshUsers,
}: MemberManagementSectionProps) {
  // メンバー一覧の絞り込み用State
  const [memberFilterText, setMemberFilterText] = useState("");

  // メンバーをプロジェクトから即時脱退
  const handleQuickLeaveProject = async (user: User, projectId: number, projectName: string) => {
    if (!currentUser?.is_admin && currentUser?.role_type !== "pmo") {
      alert("プロジェクトからの脱退操作は管理者（Admin）またはPMOのみ実行できます。");
      return;
    }
    if (!confirm(`${user.name}さんをプロジェクト「${projectName}」から脱退させますか？`)) {
      return;
    }
    try {
      const currentIds = (user.projects || []).map((p) => p.id);
      const nextIds = currentIds.filter((id) => id !== projectId);
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIds: nextIds }),
      });
      if (!res.ok) {
        throw await createApiError(res, "脱退処理に失敗しました");
      }
      await refreshUsers();
    } catch (err: unknown) {
      alert(getSafeErrorMessage(err, "脱退エラーが発生しました"));
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-indigo-100/80 p-5 flex flex-col justify-between space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-800 text-base">
              チームメンバー・権限管理 ({users.length}名)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => openUserManageModal()}
            className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
            title="新しいメンバーを追加"
          >
            <Plus className="w-4 h-4" />
            <span>追加</span>
          </button>
        </div>
        <p className="text-sm text-slate-500">
          メンバーの追加・編集・権限確認のほか、所属プロジェクトやロールを管理できます。
        </p>

        {/* メンバー検索入力バー */}
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={memberFilterText}
            onChange={(e) => setMemberFilterText(e.target.value)}
            placeholder="メンバー名、ログインID、役割、権限で検索..."
            className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          {memberFilterText && (
            <button
              type="button"
              onClick={() => setMemberFilterText("")}
              className="absolute right-2 p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
              title="絞り込みをクリア"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
          {(() => {
            const q = memberFilterText.toLowerCase().trim();
            const filtered = users.filter((u) => {
              if (!q) return true;
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

            if (filtered.length === 0) {
              return (
                <div className="p-8 text-center text-xs text-slate-400">
                  「{memberFilterText}」に一致するメンバーはいません
                  <button
                    type="button"
                    onClick={() => setMemberFilterText("")}
                    className="ml-2 text-indigo-600 font-semibold hover:underline cursor-pointer"
                  >
                    条件をクリア
                  </button>
                </div>
              );
            }

            return filtered.map((u) => {
              return (
                <div
                  key={u.id}
                  className="px-4 py-3 space-y-1.5 text-sm bg-white hover:bg-slate-50/60 transition-colors"
                >
                  {/* 上段: アバター、名前、ロール、役職、編集ボタン */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        style={{ backgroundColor: u.color || "#4f46e5" }}
                        className="w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs"
                        title={`${u.name}さんのテーマカラー: ${getAvatarColorLabel(u.color)}`}
                      >
                        {getUserInitials(u.name)}
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                        <span className="font-bold text-slate-800 break-words">{u.name}</span>
                        {/* ログインIDバッジ表示 */}
                        {u.login_id && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-mono text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                            <KeyRound className="w-2.5 h-2.5 text-slate-400" />
                            ID: {u.login_id}
                          </span>
                        )}
                        {getUserRoleType(u) === "admin" && (
                          <span className="inline-flex items-center gap-0.5 text-xs bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                            <Crown className="w-3 h-3 text-amber-600" />
                            Admin
                          </span>
                        )}
                        {getUserRoleType(u) === "pmo" && (
                          <span className="inline-flex items-center gap-0.5 text-xs bg-purple-100 text-purple-900 border border-purple-300 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                            PMO
                          </span>
                        )}
                        {u.role && (
                          <span className="text-slate-500 text-xs shrink-0" title={u.role}>
                            {u.role}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* メンバー編集ボタン（クリックでそのメンバーの編集専用ビューを直接開く） */}
                    {canManageIssues(currentUser) && (
                      <div className="flex items-center shrink-0">
                        <button
                          type="button"
                          onClick={() => openUserManageModal(u.id)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-md transition-colors cursor-pointer"
                          title={`${u.name}さんの情報を編集（所属プロジェクト・権限・表示設定）`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 下段: 所属プロジェクトタグ表示 */}
                  <div className="flex items-center gap-1.5 pl-9 flex-wrap text-xs">
                    <span className="text-[11px] text-slate-400 shrink-0 font-medium">
                      参加プロジェクト:
                    </span>
                    {projects.length > 0 && (u.projects || []).length === projects.length ? (
                      <span className="text-[10px] text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-medium">
                        全プロジェクト参加
                      </span>
                    ) : (u.projects || []).length > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(u.projects || []).map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center gap-1 text-[11px] font-mono pl-2 pr-1 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                            title={`${p.name} (${p.key})`}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: p.color || "#4f46e5" }}
                            />
                            <span>{p.key}</span>
                            {canManageIssues(currentUser) && (
                              <button
                                type="button"
                                onClick={() => handleQuickLeaveProject(u, p.id, p.name)}
                                title={`【脱退】${u.name}さんをプロジェクト「${p.name}」から脱退させます`}
                                className="text-slate-400 hover:text-rose-600 hover:bg-rose-100 p-0.5 rounded transition-colors cursor-pointer ml-0.5"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                        未配属
                      </span>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      <button
        type="button"
        onClick={() => openUserManageModal()}
        className="w-full py-2.5 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
      >
        <Users className="w-4 h-4" />
        <span>メンバー管理モーダルを開く</span>
      </button>
    </div>
  );
}
