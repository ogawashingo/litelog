// 課題登録・更新・コメント時の「通知したいユーザー（参加者）」選択コンポーネント（省スペースなチップ＆検索ドロップダウン方式）
"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Bell,
  Users,
  CheckSquare,
  Square,
  Search,
  X,
  Plus,
  Check,
  ChevronDown,
} from "lucide-react";
import { User } from "@/types";
import { getUserInitials } from "./UserManageModal";

interface NotifyUserSelectorProps {
  users: User[];
  currentUserId?: number | null;
  selectedUserIds: number[];
  onChange: (nextIds: number[]) => void;
  /** 担当者や課題作成者など、チェックしなくても自動通知されるユーザーのID一覧 */
  autoNotifyUserIds?: number[];
  /** 課題の参加者（作成者・担当者・過去コメント投稿者）のID一覧 */
  participantUserIds?: number[];
  label?: string;
  compact?: boolean;
}

export default function NotifyUserSelector({
  users,
  currentUserId = null,
  selectedUserIds,
  onChange,
  autoNotifyUserIds = [],
  participantUserIds = [],
  label = "通知先（参加者）",
  compact = false,
}: NotifyUserSelectorProps) {
  // ドロップダウン開閉状態
  const [isOpen, setIsOpen] = useState(false);
  // メンバー検索クエリ
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 自分自身を除いた通知対象候補メンバー一覧（万一候補が0人の場合は全ユーザーを表示）
  const targetUsers = useMemo(() => {
    const others = users.filter((u) => u.id !== currentUserId);
    return others.length > 0 ? others : users;
  }, [users, currentUserId]);

  const autoSet = useMemo(
    () => new Set(autoNotifyUserIds.filter((id) => Boolean(id) && id !== currentUserId)),
    [autoNotifyUserIds, currentUserId]
  );

  const participantSet = useMemo(
    () => new Set(participantUserIds.filter((id) => Boolean(id) && id !== currentUserId)),
    [participantUserIds, currentUserId]
  );

  // ドロップダウンを開いた際に検索入力にフォーカス
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  // 外側クリックでドロップダウンを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // 選択中ユーザーオブジェクト一覧（表示用）
  const selectedUsers = useMemo(() => {
    return selectedUserIds
      .map((id) => users.find((u) => u.id === id))
      .filter((u): u is User => Boolean(u));
  }, [selectedUserIds, users]);

  // 自動通知対象ユーザーオブジェクト一覧（表示用）
  const autoUsers = useMemo(() => {
    return Array.from(autoSet)
      .map((id) => users.find((u) => u.id === id))
      .filter((u): u is User => Boolean(u));
  }, [autoSet, users]);

  // ドロップダウン内の検索絞り込み＆優先ソート
  // 参加者を上位に表示し、その後に名前順
  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const list = targetUsers.filter((u) => {
      if (!q) return true;
      const matchName = u.name.toLowerCase().includes(q);
      const matchLogin = u.login_id ? u.login_id.toLowerCase().includes(q) : false;
      const matchRole = u.role ? u.role.toLowerCase().includes(q) : false;
      return matchName || matchLogin || matchRole;
    });

    return list.sort((a, b) => {
      const aSelected = selectedUserIds.includes(a.id);
      const bSelected = selectedUserIds.includes(b.id);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;

      const aPart = participantSet.has(a.id);
      const bPart = participantSet.has(b.id);
      if (aPart && !bPart) return -1;
      if (!aPart && bPart) return 1;

      return a.name.localeCompare(b.name, "ja");
    });
  }, [targetUsers, searchQuery, selectedUserIds, participantSet]);

  // 個別ユーザーの選択トグル
  const handleToggleUser = (userId: number) => {
    if (selectedUserIds.includes(userId)) {
      onChange(selectedUserIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedUserIds, userId]);
    }
  };

  // 個別ユーザーの選択解除
  const handleRemoveUser = (userId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedUserIds.filter((id) => id !== userId));
  };

  // 全員選択 / 全解除
  const selectableIds = targetUsers
    .filter((u) => u.id !== currentUserId)
    .map((u) => u.id);
  const isAllSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedUserIds.includes(id));

  const handleToggleAll = () => {
    if (isAllSelected) {
      onChange([]);
    } else {
      onChange(selectableIds);
    }
  };

  // 参加者（作成者・担当者・コメント投稿者）を一括選択
  const handleSelectParticipants = () => {
    const nextSet = new Set<number>([...selectedUserIds, ...Array.from(participantSet)]);
    onChange(Array.from(nextSet));
  };

  if (users.length === 0) return null;

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-slate-50/70 transition-all ${
        compact ? "p-2.5 space-y-2" : "p-3 space-y-2.5"
      }`}
    >
      {/* 上段ヘッダー: ラベル ＆ 一括操作リンク */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Bell className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span className="text-xs font-bold text-slate-700">{label}</span>
          {selectedUserIds.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
              {selectedUserIds.length}名選択中
            </span>
          )}
          {autoSet.size > 0 && (
            <span className="text-[10px] text-slate-500">
              ※担当・作成者には自動通知
            </span>
          )}
        </div>

        {selectableIds.length > 0 && (
          <div className="flex items-center gap-2.5 text-[11px]">
            {participantSet.size > 0 && (
              <button
                type="button"
                onClick={handleSelectParticipants}
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                title="この課題の作成者・担当者・コメント参加者をまとめて選択"
              >
                <Users className="w-3 h-3" />
                <span>参加者を追加</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleAll}
              className="inline-flex items-center gap-1 text-slate-500 hover:text-indigo-600 font-medium cursor-pointer"
            >
              {isAllSelected ? (
                <>
                  <Square className="w-3 h-3" />
                  <span>全解除</span>
                </>
              ) : (
                <>
                  <CheckSquare className="w-3 h-3" />
                  <span>全員選択</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 選択済みメンバー・自動通知メンバーのチップ一覧 ＆ 「+ メンバー追加」ボタン */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* 自動通知されるメンバー（緑系チップで分かりやすく表示） */}
        {autoUsers.map((user) => (
          <div
            key={`auto-${user.id}`}
            className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs shadow-2xs select-none"
            title={`${user.name}（担当者または作成者のため自動通知）`}
          >
            <span
              style={{ backgroundColor: user.color || "#059669" }}
              className="w-4 h-4 rounded-full text-white flex items-center justify-center text-[9px] font-bold shrink-0"
            >
              {getUserInitials(user.name)}
            </span>
            <span className="font-medium text-[11px] truncate max-w-[120px]">{user.name}</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-100 text-emerald-700 font-bold">
              自動
            </span>
          </div>
        ))}

        {/* 手動選択されたメンバー（青系チップで✕ボタン付き） */}
        {selectedUsers
          .filter((u) => !autoSet.has(u.id))
          .map((user) => (
            <div
              key={user.id}
              className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs shadow-2xs group hover:bg-indigo-100/70 transition-colors select-none"
            >
              <span
                style={{ backgroundColor: user.color || "#4f46e5" }}
                className="w-4 h-4 rounded-full text-white flex items-center justify-center text-[9px] font-bold shrink-0"
              >
                {getUserInitials(user.name)}
              </span>
              <span className="font-semibold text-[11px] truncate max-w-[120px]">{user.name}</span>
              <button
                type="button"
                onClick={(e) => handleRemoveUser(user.id, e)}
                className="w-4 h-4 rounded-full flex items-center justify-center text-indigo-400 hover:text-indigo-800 hover:bg-indigo-200/60 transition-colors cursor-pointer"
                title={`${user.name} の選択を解除`}
                aria-label={`${user.name} の選択を解除`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

        {/* 「+ メンバー追加」ドロップダウン起動ボタン＆ポップオーバーコンテナ */}
        <div ref={dropdownRef} className="relative inline-block">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer select-none ${
              isOpen
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-white border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400 shadow-2xs"
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>メンバーを追加</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </button>

          {/* ドロップダウン／ポップオーバー */}
          {isOpen && (
            <div className="absolute left-0 bottom-full mb-1 sm:bottom-auto sm:top-full sm:mt-1 z-50 w-72 sm:w-80 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-100 max-w-[calc(100vw-32px)]">
              {/* ドロップダウンヘッダー: 検索バー */}
              <div className="p-2.5 bg-slate-50 border-b border-slate-200 space-y-2">
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="名前、ログインID、役割で検索..."
                    className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-600 rounded-sm cursor-pointer"
                      title="検索をクリア"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 px-0.5">
                  <span>
                    候補: {filteredUsers.length}名
                    {selectedUserIds.length > 0 && ` (${selectedUserIds.length}名選択中)`}
                  </span>
                  {selectedUserIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onChange([])}
                      className="text-slate-500 hover:text-rose-600 font-medium cursor-pointer"
                    >
                      全選択解除
                    </button>
                  )}
                </div>
              </div>

              {/* メンバーリスト */}
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 py-1">
                {filteredUsers.length === 0 ? (
                  <div className="py-6 px-4 text-center text-slate-400 text-xs">
                    「{searchQuery}」に一致するメンバーはいません
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelected = selectedUserIds.includes(user.id);
                    const isAuto = autoSet.has(user.id);
                    const isParticipant = participantSet.has(user.id);

                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleToggleUser(user.id)}
                        className={`w-full px-3 py-2 flex items-center justify-between text-left transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-indigo-50/80 hover:bg-indigo-100/70"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div
                            style={{ backgroundColor: user.color || "#4f46e5" }}
                            className="w-6 h-6 rounded-full text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs"
                          >
                            {getUserInitials(user.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`text-xs truncate ${
                                  isSelected
                                    ? "font-bold text-indigo-900"
                                    : "font-semibold text-slate-800"
                                }`}
                              >
                                {user.name}
                              </span>
                              {user.login_id && (
                                <span className="text-[11px] font-mono text-indigo-600/80 truncate">
                                  @{user.login_id}
                                </span>
                              )}
                              {isAuto && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-100 text-emerald-700 font-bold shrink-0">
                                  自動
                                </span>
                              )}
                              {!isAuto && isParticipant && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-100 text-indigo-700 font-semibold shrink-0">
                                  参加者
                                </span>
                              )}
                            </div>
                            {user.role && (
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                {user.role}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* チェック状態アイコン */}
                        <div className="shrink-0 ml-2">
                          <div
                            className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                              isSelected
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "border-slate-300 bg-white"
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* ドロップダウンフッター */}
              <div className="p-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">クリックで選択・解除</span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md shadow-2xs transition-colors cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
