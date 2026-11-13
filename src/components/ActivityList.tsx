// 最近の更新・アクティビティウィジェットコンポーネント（本家Backlog風の日付別グルーピング＆課題詳細モーダル直接起動対応）
"use client";

import React, { useState, useMemo } from "react";
import {
  History,
  PlusCircle,
  CheckCircle,
  MessageSquare,
  Trash2,
  Edit3,
  ChevronUp,
  ChevronDown,
  Filter,
  ExternalLink,
} from "lucide-react";
import { Activity, Issue, Project } from "@/types";
import { getUserInitials } from "./UserManageModal";
import { useUser } from "./UserContext";
import {
  formatActivityTimestamp,
  formatTimestamp,
  getActivityDateGroup,
} from "@/lib/dateUtils";

interface ActivityListProps {
  activities: Activity[];
  issues?: Issue[];
  projects?: Project[];
  selectedProjectId?: number | null;
  onSelectIssue?: (issue: Issue) => void;
}

// アクティビティ文言から課題キー・件名・変更差分バッジ（[ 状態: ... ] 等）を抽出するヘルパー
function parseActivityDetails(act: Activity): {
  issueKey: string | null;
  issueTitle: string | null;
  diffBadges: string[];
  cleanMessage: string;
} {
  let issueKey = act.issue_key || null;
  let issueTitle = act.issue_title || null;
  const raw = act.content || "";

  // DB結合でキーやタイトルが取得できない場合（削除済み課題など）は正規表現で抽出
  if (!issueKey) {
    const keyMatch = raw.match(/\[([A-Z0-9_-]+-\d+)\]/i);
    if (keyMatch) {
      issueKey = keyMatch[1];
    }
  }
  if (!issueTitle) {
    const titleMatch = raw.match(/「([^」]+)」/);
    if (titleMatch && (act.action_type === "created" || act.action_type === "deleted")) {
      issueTitle = titleMatch[1];
    }
  }

  const diffBadges: string[] = [];

  if (act.action_type === "status_changed") {
    const stMatch = raw.match(/状態を「([^」]+)」から「([^」]+)」に変更/);
    if (stMatch) {
      diffBadges.push(`[ 状態: ${stMatch[1]} → ${stMatch[2]} ]`);
    }
  } else if (act.action_type === "updated") {
    const assigneeMatch = raw.match(/担当者を「([^」]+)」に設定/);
    if (assigneeMatch) {
      diffBadges.push(`[ 担当者: ${assigneeMatch[1]} ]`);
    } else if (raw.includes("担当者を未割当にしました")) {
      diffBadges.push("[ 担当者: 未割当 ]");
    }

    const dueMatch = raw.match(/期限日を「([^」]+)」に設定/);
    if (dueMatch) {
      diffBadges.push(`[ 期限日: ${dueMatch[1]} ]`);
    } else if (raw.includes("期限日を未設定にしました")) {
      diffBadges.push("[ 期限日: 未設定 ]");
    }

    const prioMatch = raw.match(/優先度を「([^」]+)」に変更/);
    if (prioMatch) {
      diffBadges.push(`[ 優先度: ${prioMatch[1]} ]`);
    }
  }

  return {
    issueKey,
    issueTitle,
    diffBadges,
    cleanMessage: raw,
  };
}

export default function ActivityList({
  activities,
  issues = [],
  projects = [],
  selectedProjectId = null,
  onSelectIssue,
}: ActivityListProps) {
  const { settings } = useUser();

  const [isCollapsed, setIsCollapsed] = useState(false);
  // プロジェクト表示設定フィルター（"sync" = ダッシュボード選択に連動、"all" = すべて、または projectId 文字列）
  const [projectFilter, setProjectFilter] = useState<string>("sync");
  const [loadingIssueId, setLoadingIssueId] = useState<number | null>(null);

  // アクションタイプ別のアイコンと本家Backlog風アクションバッジ設定
  const getActionMeta = (actionType: Activity["action_type"]) => {
    switch (actionType) {
      case "created":
        return {
          icon: <PlusCircle className="w-3.5 h-3.5 text-violet-600" />,
          particle: "課題を",
          badgeLabel: "課題を追加",
          badgeClass: "bg-violet-100 text-violet-800 border-violet-200",
        };
      case "status_changed":
        return {
          icon: <CheckCircle className="w-3.5 h-3.5 text-sky-600" />,
          particle: "課題を",
          badgeLabel: "更新",
          badgeClass: "bg-sky-100 text-sky-800 border-sky-200",
        };
      case "commented":
        return {
          icon: <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />,
          particle: "課題に",
          badgeLabel: "コメント",
          badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-200",
        };
      case "deleted":
        return {
          icon: <Trash2 className="w-3.5 h-3.5 text-rose-500" />,
          particle: "課題を",
          badgeLabel: "削除",
          badgeClass: "bg-rose-100 text-rose-800 border-rose-200",
        };
      case "updated":
      default:
        return {
          icon: <Edit3 className="w-3.5 h-3.5 text-amber-600" />,
          particle: "課題を",
          badgeLabel: "更新",
          badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
        };
    }
  };

  // 表示設定に応じたアクティビティの絞り込み
  const filteredActivities = useMemo(() => {
    const effectiveProjectId =
      projectFilter === "sync"
        ? selectedProjectId
        : projectFilter === "all"
        ? null
        : Number(projectFilter);

    if (!effectiveProjectId) return activities;

    const targetProj = projects.find((p) => p.id === effectiveProjectId);
    return activities.filter((act) => {
      if (act.project_id === effectiveProjectId) return true;
      // 削除済み課題などで project_id が NULL の場合はキープレフィックスで判定
      if (!act.project_id && targetProj) {
        const { issueKey } = parseActivityDetails(act);
        if (issueKey && issueKey.startsWith(`${targetProj.key}-`)) {
          return true;
        }
      }
      return false;
    });
  }, [activities, projectFilter, selectedProjectId, projects]);

  // 日付（YYYY年M月D日(曜日)）ごとにアクティビティをグルーピング
  const groupedTimeline = useMemo(() => {
    const groups: {
      dateKey: string;
      dateLabel: string;
      items: Activity[];
    }[] = [];

    for (const act of filteredActivities) {
      const { dateKey, dateLabel } = getActivityDateGroup(act.created_at, settings);
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.dateKey !== dateKey) {
        groups.push({
          dateKey,
          dateLabel,
          items: [act],
        });
      } else {
        lastGroup.items.push(act);
      }
    }

    return groups;
  }, [filteredActivities, settings]);

  // アクティビティ内の課題クリック時に詳細モーダルを開く処理
  const handleOpenIssue = async (act: Activity, fallbackKey: string | null) => {
    if (!onSelectIssue || act.action_type === "deleted") return;

    // 1. まず手元の issues リストから探す
    const localFound = issues.find(
      (i) =>
        (act.issue_id && i.id === act.issue_id) ||
        (fallbackKey && i.issue_key === fallbackKey)
    );
    if (localFound) {
      onSelectIssue(localFound);
      return;
    }

    // 2. 手元にない場合（別プロジェクトでフィルタ中など）はAPIから取得して開く
    if (act.issue_id) {
      try {
        setLoadingIssueId(act.issue_id);
        const res = await fetch(`/api/issues/${act.issue_id}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.issue) {
            onSelectIssue(data.issue);
          }
        }
      } catch (err) {
        console.error("アクティビティからの課題取得エラー:", err);
      } finally {
        setLoadingIssueId(null);
      }
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-xs border border-gray-200 overflow-hidden">
      {/* ウィジェットヘッダー（本家Backlog風の折りたたみトグル＆表示設定フィルター付き） */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            title={isCollapsed ? "最近の更新を展開" : "最近の更新を折りたたむ"}
            className="p-1 rounded-md hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            {isCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
          <History className="w-4 h-4 text-indigo-600 shrink-0" />
          <h3 className="font-bold text-slate-800 text-sm">最近の更新</h3>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700 shadow-2xs">
            {filteredActivities.length}
          </span>
        </div>

        {/* 右側: 表示設定（プロジェクト絞り込み） */}
        {projects.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              aria-label="最近の更新の表示対象プロジェクト"
              className="bg-white border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-700 font-medium focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer max-w-[160px] truncate"
            >
              <option value="sync">
                {selectedProjectId ? "選択中プロジェクト" : "すべてのプロジェクト"}
              </option>
              {selectedProjectId !== null && (
                <option value="all">すべてのプロジェクトを表示</option>
              )}
              {projects.map((proj) => (
                <option key={proj.id} value={String(proj.id)}>
                  [{proj.key}] {proj.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* タイムライン本体 */}
      {!isCollapsed && (
        <div className="max-h-[640px] overflow-y-auto divide-y divide-gray-100">
          {groupedTimeline.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">
              該当する更新履歴がありません
            </p>
          ) : (
            groupedTimeline.map((group) => (
              <div key={group.dateKey} className="timeline">
                {/* 本家Backlog風の日付見出し (h3.timeline__date: YYYY年M月D日(曜日)) */}
                <h4 className="timeline__date sticky top-0 z-10 bg-slate-100 border-y border-slate-200/90 px-4 py-1.5 text-xs font-bold text-slate-800 flex items-center justify-between shadow-2xs">
                  <span className="font-bold text-slate-900">{group.dateLabel}</span>
                  <span className="text-[10px] font-semibold text-slate-500">
                    {group.items.length} 件の更新
                  </span>
                </h4>

                {/* その日のアクティビティストリーム (ul.timeline__stream) */}
                <ul className="timeline__stream divide-y divide-gray-100">
                  {group.items.map((act) => {
                    const meta = getActionMeta(act.action_type);
                    const { issueKey, issueTitle, diffBadges, cleanMessage } =
                      parseActivityDetails(act);

                    // 課題が存在しクリック可能かどうかを判定
                    const isDeleted =
                      act.action_type === "deleted" ||
                      (!act.issue_id &&
                        !issues.some((i) => issueKey && i.issue_key === issueKey));
                    const isClickable = Boolean(onSelectIssue && !isDeleted && (act.issue_id || issueKey));
                    const isLoadingThis = Boolean(act.issue_id && loadingIssueId === act.issue_id);

                    return (
                      <li
                        key={act.id}
                        data-testid={`activity-item-${act.id}`}
                        className={`timeline__stream-item px-4 py-3 text-xs transition-colors ${
                          isDeleted
                            ? "is_deleted bg-slate-50/50 text-slate-400"
                            : "hover:bg-indigo-50/30"
                        }`}
                      >
                        <div className="stream-update space-y-1.5">
                          {/* 1段目: 操作者アバター・名前・アクションバッジ・時刻 (stream-update__title) */}
                          <div className="stream-update__title flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                              {/* ユーザーアバター */}
                              <span
                                style={{
                                  backgroundColor: act.user_color || "#4f46e5",
                                }}
                                className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[9px] font-bold shrink-0 shadow-2xs"
                                title={act.user_name || "システム"}
                              >
                                {getUserInitials(act.user_name || "システム")}
                              </span>

                              {/* 〇〇さんが 課題を [更新] */}
                              <span className="stream-update__text flex items-center gap-1 flex-wrap text-gray-700">
                                <span className="font-bold text-gray-900">
                                  {act.user_name || "メンバー"}
                                </span>
                                <span className="text-gray-500">
                                  さんが {meta.particle}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${meta.badgeClass}`}
                                >
                                  {meta.icon}
                                  <span>{meta.badgeLabel}</span>
                                </span>
                              </span>
                            </div>

                            {/* 相対時刻・絶対時刻ツールチップ (stream-update__meta) */}
                            <span
                              className="stream-update__meta text-[11px] text-gray-400 shrink-0"
                              title={formatTimestamp(act.created_at, settings, true)}
                            >
                              {formatActivityTimestamp(act.created_at, settings)}
                            </span>
                          </div>

                          {/* 2段目: 課題キー + 件名リンク & 変更差分 / コメントプレビュー (stream-update__content) */}
                          <div className="stream-update__content pl-6 space-y-1.5">
                            {/* 課題サマリー行 (stream-update__summary) */}
                            {issueKey ? (
                              isClickable ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenIssue(act, issueKey)}
                                  disabled={isLoadingThis}
                                  title={`クリックして [${issueKey}] の課題詳細を開く`}
                                  className="stream-update__summary group/link w-full text-left flex items-center gap-1.5 py-0.5 rounded hover:bg-indigo-50/70 transition-colors cursor-pointer"
                                >
                                  <span className="Key font-bold text-indigo-700 group-hover/link:text-indigo-900 group-hover/link:underline shrink-0">
                                    {issueKey}
                                  </span>
                                  <span className="font-semibold text-slate-800 group-hover/link:text-indigo-800 truncate">
                                    {issueTitle || "課題を開く"}
                                  </span>
                                  <ExternalLink className="w-3 h-3 text-indigo-600 opacity-0 group-hover/link:opacity-100 transition-opacity shrink-0 ml-auto" />
                                </button>
                              ) : (
                                <div className="stream-update__summary flex items-center gap-1.5 text-gray-400">
                                  <span className="font-mono font-semibold line-through">
                                    {issueKey}
                                  </span>
                                  <span className="italic">
                                    この課題は削除されました
                                    {issueTitle ? `（「${issueTitle}」）` : ""}
                                  </span>
                                </div>
                              )
                            ) : null}

                            {/* 変更差分バッジ ([ 状態: 処理中 ] 等) または コメント本文プレビュー (stream-update__content-block) */}
                            {act.action_type === "commented" ? (
                              <div
                                onClick={() => {
                                  if (isClickable) handleOpenIssue(act, issueKey);
                                }}
                                className={`stream-update__content-block bg-slate-50 border border-slate-200/90 rounded-md px-3 py-2 text-slate-800 whitespace-pre-wrap break-words leading-relaxed font-medium ${
                                  isClickable
                                    ? "hover:border-indigo-300 hover:bg-indigo-50/20 cursor-pointer transition-colors"
                                    : ""
                                }`}
                              >
                                {cleanMessage}
                              </div>
                            ) : diffBadges.length > 0 ? (
                              <div className="stream-update__content-block flex flex-wrap items-center gap-1.5">
                                {diffBadges.map((badge, idx) => (
                                  <span
                                    key={idx}
                                    className="update-value inline-block font-mono text-[11px] font-semibold text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded"
                                  >
                                    {badge}
                                  </span>
                                ))}
                              </div>
                            ) : !issueKey ? (
                              <p className="text-gray-700 leading-relaxed break-words">
                                {cleanMessage}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
