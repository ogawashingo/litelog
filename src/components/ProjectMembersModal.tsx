// プロジェクト参加メンバー管理モーダルコンポーネント
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Users, X, Check, Shield, Crown, ClipboardCheck, AlertCircle, Search } from "lucide-react";
import { Project, User, canManageIssues } from "@/types";
import { useUser } from "./UserContext";
import { getUserInitials } from "./UserManageModal";

interface ProjectMemberUser extends User {
  is_member?: boolean;
}

interface ProjectMembersModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onUpdated?: () => void;
}

export default function ProjectMembersModal({
  isOpen,
  project,
  onClose,
  onUpdated,
}: ProjectMembersModalProps) {
  const { currentUser } = useUser();
  const canManage = canManageIssues(currentUser); // AdminまたはPMOが編集可能

  const [allUsers, setAllUsers] = useState<ProjectMemberUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // メンバー情報ロード
  const loadMembers = useCallback(async () => {
    if (!project) return;
    setIsLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/projects/${project.id}/members`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "メンバー情報の取得に失敗しました");
      }
      const data = await res.json();
      setAllUsers(data.allUsers || []);

      // 参加中メンバーのID集合
      const memberIds = new Set<number>();
      for (const u of data.allUsers || []) {
        if (u.is_member) {
          memberIds.add(u.id);
        }
      }
      setSelectedUserIds(memberIds);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "読み込みエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }, [project]);

  useEffect(() => {
    if (isOpen && project) {
      loadMembers();
    }
  }, [isOpen, project, loadMembers]);

  if (!isOpen || !project) return null;

  // メンバー選択の切り替え
  const toggleUser = (userId: number, isPermanent: boolean) => {
    if (!canManage || isPermanent) return;
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
    setSuccessMsg("");
  };

  // 全員選択・全解除（一般メンバーのみトグル）
  const selectAll = () => {
    if (!canManage) return;
    const allIds = new Set<number>();
    for (const u of allUsers) {
      allIds.add(u.id);
    }
    setSelectedUserIds(allIds);
  };

  const clearNonAdmins = () => {
    if (!canManage) return;
    const requiredOnly = new Set<number>();
    for (const u of allUsers) {
      if (u.is_admin || u.role_type === "admin" || u.role_type === "pmo") {
        requiredOnly.add(u.id);
      }
    }
    setSelectedUserIds(requiredOnly);
  };

  // 保存処理
  const handleSave = async () => {
    if (!canManage || !project) return;
    setIsSaving(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/projects/${project.id}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: Array.from(selectedUserIds),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "メンバー更新に失敗しました");
      }

      setSuccessMsg("参加メンバーを保存しました！");
      onUpdated?.();
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "保存エラーが発生しました");
    } finally {
      setIsSaving(false);
    }
  };

  // 検索フィルター
  const filteredUsers = allUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      (u.login_id && u.login_id.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q))
    );
  });

  const memberCount = Array.from(selectedUserIds).length;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white sm:rounded-xl shadow-2xl border border-slate-200/90 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col h-full sm:h-auto sm:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="app-header px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-3.5 h-3.5 rounded-sm shrink-0"
              style={{ backgroundColor: project.color || "#4f46e5" }}
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base">プロジェクト参加メンバー</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-white/20 font-mono font-bold">
                  {project.key}
                </span>
              </div>
              <p className="text-[11px] text-white/80 line-clamp-1">{project.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-white/20 transition-colors text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg font-medium flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* 説明および権限案内 */}
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">
                参加メンバー: <strong className="text-indigo-600 font-bold">{memberCount}名</strong> / 全{allUsers.length}名
              </span>
              {canManage ? (
                <span className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded font-medium">
                  Admin/PMO 権限で編集可能
                </span>
              ) : (
                <span className="text-[11px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-medium">
                  閲覧専用（Admin/PMOのみ変更可能）
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              ※一般メンバーは参加しているプロジェクトのみアクセス・閲覧できます。管理者（Admin）およびPMOは全プロジェクトに常時参加します。
            </p>
          </div>

          {/* 検索・一括操作バー */}
          <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="名前・ID・役職で絞り込み..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            {canManage && (
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-[11px] px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded transition-colors cursor-pointer"
                >
                  全員参加
                </button>
                <button
                  type="button"
                  onClick={clearNonAdmins}
                  className="text-[11px] px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded transition-colors cursor-pointer"
                >
                  一般メンバー解除
                </button>
              </div>
            )}
          </div>

          {/* メンバー一覧グリッド */}
          {isLoading ? (
            <div className="py-8 text-center text-xs text-slate-400">読み込み中...</div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white max-h-80 overflow-y-auto">
              {filteredUsers.map((user) => {
                const isSelected = selectedUserIds.has(user.id);
                const isPermanent = Boolean(
                  user.is_admin || user.role_type === "admin" || user.role_type === "pmo"
                );

                return (
                  <label
                    key={user.id}
                    onClick={() => toggleUser(user.id, isPermanent)}
                    className={`flex items-center justify-between p-3 transition-colors ${
                      canManage && !isPermanent ? "cursor-pointer hover:bg-slate-50" : ""
                    } ${isSelected ? "bg-indigo-50/40" : "bg-white"}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* アバター */}
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-2xs"
                        style={{ backgroundColor: user.color || "#4f46e5" }}
                      >
                        {getUserInitials(user.name)}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {user.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            @{user.login_id}
                          </span>
                          {/* ロールバッジ */}
                          {user.is_admin === 1 || user.role_type === "admin" ? (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded-full">
                              <Crown className="w-2.5 h-2.5 text-amber-600" />
                              管理者
                            </span>
                          ) : user.role_type === "pmo" ? (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-purple-800 bg-purple-100 border border-purple-300 px-1.5 py-0.2 rounded-full">
                              <ClipboardCheck className="w-2.5 h-2.5 text-purple-600" />
                              PMO
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {user.role || "メンバー"}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 pl-2">
                      {isPermanent ? (
                        <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                          常時参加
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!canManage}
                          onChange={() => {}} // onClickでトグル
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                        />
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            選択中: <strong>{memberCount}</strong> 名
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              閉じる
            </button>
            {canManage && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || isLoading}
                className="px-4 py-1.5 rounded-lg app-primary-btn text-white text-xs font-bold shadow-xs hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isSaving ? "保存中..." : "参加メンバーを保存"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
