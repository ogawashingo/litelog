// 課題登録・更新・コメント時の「通知したいユーザー（参加者）」複数選択チェックボックスコンポーネント
"use client";

import React from "react";
import { Bell, Users, CheckSquare, Square } from "lucide-react";
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
  // 自分自身を除いた通知対象候補メンバー一覧（万一候補が0人の場合は全ユーザーを表示）
  const targetUsers = React.useMemo(() => {
    const others = users.filter((u) => u.id !== currentUserId);
    return others.length > 0 ? others : users;
  }, [users, currentUserId]);

  const autoSet = React.useMemo(
    () => new Set(autoNotifyUserIds.filter((id) => Boolean(id) && id !== currentUserId)),
    [autoNotifyUserIds, currentUserId]
  );

  const participantSet = React.useMemo(
    () => new Set(participantUserIds.filter((id) => Boolean(id) && id !== currentUserId)),
    [participantUserIds, currentUserId]
  );

  // 個別ユーザーのチェック切り替え
  const handleToggleUser = (userId: number) => {
    if (selectedUserIds.includes(userId)) {
      onChange(selectedUserIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedUserIds, userId]);
    }
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
      className={`rounded-lg border border-slate-200 bg-slate-50/70 ${
        compact ? "p-2.5 space-y-2" : "p-3 space-y-2.5"
      }`}
    >
      {/* ヘッダー行：ラベル＆一括選択ボタン */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Bell className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span className="text-xs font-bold text-slate-700">{label}</span>
          {selectedUserIds.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
              {selectedUserIds.length}人選択中
            </span>
          )}
          {autoSet.size > 0 && (
            <span className="text-[10px] text-slate-500">
              ※担当・作成者には自動通知されます
            </span>
          )}
        </div>

        {selectableIds.length > 0 && (
          <div className="flex items-center gap-2 text-[11px]">
            {participantSet.size > 0 && (
              <button
                type="button"
                onClick={handleSelectParticipants}
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                title="この課題の作成者・担当者・コメント参加者をまとめて選択"
              >
                <Users className="w-3 h-3" />
                <span>参加者を選択</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleAll}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-indigo-600 font-medium cursor-pointer"
            >
              {isAllSelected ? (
                <>
                  <Square className="w-3 h-3" />
                  <span>選択解除</span>
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

      {/* メンバーチェックボックス一覧 */}
      <div className="flex flex-wrap gap-1.5">
        {targetUsers.map((user) => {
          const isSelf = user.id === currentUserId;
          const isChecked = selectedUserIds.includes(user.id);
          const isAuto = autoSet.has(user.id);

          return (
            <label
              key={user.id}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all select-none ${
                isSelf
                  ? "bg-slate-100 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed"
                  : isChecked
                  ? "bg-indigo-50 border-indigo-400 text-indigo-900 font-semibold shadow-2xs cursor-pointer"
                  : isAuto
                  ? "bg-emerald-50/60 border-emerald-200 text-slate-700 hover:border-indigo-300 cursor-pointer"
                  : "bg-white border-slate-200/90 text-slate-700 hover:border-indigo-300 hover:bg-slate-50 cursor-pointer"
              }`}
              title={
                isSelf
                  ? "自分自身には通知されません"
                  : isAuto
                  ? `${user.name}（担当者または作成者のため自動通知対象）`
                  : `${user.name} に通知する`
              }
            >
              <input
                type="checkbox"
                checked={isChecked}
                disabled={isSelf}
                onChange={() => !isSelf && handleToggleUser(user.id)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
              />
              <span
                style={{ backgroundColor: user.color || "#4f46e5" }}
                className="w-4 h-4 rounded-full text-white flex items-center justify-center text-[9px] font-bold shrink-0"
              >
                {getUserInitials(user.name)}
              </span>
              <span className="truncate max-w-[120px]">{user.name}</span>
              {isSelf && <span className="text-[10px] text-slate-400">(自分)</span>}
              {!isSelf && isAuto && (
                <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-100 text-emerald-700 font-bold">
                  自動
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
