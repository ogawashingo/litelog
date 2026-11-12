// 最近の更新・アクティビティウィジェットコンポーネント
"use client";

import React from "react";
import { History, PlusCircle, CheckCircle, MessageSquare, Trash2, Edit3 } from "lucide-react";
import { Activity } from "@/types";

interface ActivityListProps {
  activities: Activity[];
}

export default function ActivityList({ activities }: ActivityListProps) {
  // 相対日付フォーマッター
  const formatTimeAgo = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "たった今";
    if (diffMins < 60) return `${diffMins}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    if (diffDays === 1) return "昨日";
    return `${diffDays}日前`;
  };

  // アクションタイプ別アイコン
  const getActionIcon = (actionType: Activity["action_type"]) => {
    switch (actionType) {
      case "created":
        return <PlusCircle className="w-4 h-4 text-emerald-600" />;
      case "status_changed":
        return <CheckCircle className="w-4 h-4 text-sky-600" />;
      case "commented":
        return <MessageSquare className="w-4 h-4 text-indigo-600" />;
      case "deleted":
        return <Trash2 className="w-4 h-4 text-red-500" />;
      case "updated":
      default:
        return <Edit3 className="w-4 h-4 text-amber-600" />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-xs border border-gray-200 p-4">
      <div className="flex items-center gap-1.5 pb-3 mb-3 border-b border-gray-100">
        <History className="w-4 h-4 text-emerald-600" />
        <h3 className="font-bold text-gray-800 text-sm">最近の更新</h3>
      </div>

      {activities.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">まだ履歴がありません</p>
      ) : (
        <div className="flow-root">
          <ul className="-mb-4 space-y-3">
            {activities.map((act) => (
              <li key={act.id} className="relative flex items-start gap-2.5 text-xs">
                {/* アイコン */}
                <div className="mt-0.5 shrink-0 bg-gray-50 p-1 rounded-full border border-gray-200">
                  {getActionIcon(act.action_type)}
                </div>

                {/* 内容と時間 */}
                <div className="flex-1 min-w-0">
                  <p className="text-gray-700 leading-relaxed break-words font-medium">
                    {act.content}
                  </p>
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    {formatTimeAgo(act.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
