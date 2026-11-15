// 課題の種別、ステータス、優先度を表示するバッジコンポーネント
"use client";

import React from "react";
import { CheckSquare, Bug, Sparkles, HelpCircle, ArrowUp, ArrowRight, ArrowDown } from "lucide-react";
import { IssueType, IssueStatus, IssuePriority, IssueResolution } from "@/types";

// 種別情報マッピング（オリジナル・コズミックカラーパレット）
export const ISSUE_TYPE_CONFIG: Record<
  IssueType,
  { label: string; bg: string; text: string; icon: React.ElementType }
> = {
  task: {
    label: "タスク",
    bg: "bg-indigo-600",
    text: "text-white",
    icon: CheckSquare,
  },
  bug: {
    label: "バグ",
    bg: "bg-rose-600",
    text: "text-white",
    icon: Bug,
  },
  request: {
    label: "要望",
    bg: "bg-amber-500",
    text: "text-white",
    icon: Sparkles,
  },
  other: {
    label: "その他",
    bg: "bg-violet-600",
    text: "text-white",
    icon: HelpCircle,
  },
};

// ステータス情報マッピング（緑を排除したオリジナル配色：ローズ／スカイ／バイオレット／スレート）
export const ISSUE_STATUS_CONFIG: Record<
  IssueStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  open: {
    label: "未対応",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-300",
  },
  in_progress: {
    label: "処理中",
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-300",
  },
  resolved: {
    label: "処理済み",
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-300",
  },
  closed: {
    label: "完了",
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-300",
  },
};

// 優先度情報マッピング
export const ISSUE_PRIORITY_CONFIG: Record<
  IssuePriority,
  { label: string; text: string; icon: React.ElementType }
> = {
  high: {
    label: "高",
    text: "text-rose-600 font-bold",
    icon: ArrowUp,
  },
  medium: {
    label: "中",
    text: "text-amber-600",
    icon: ArrowRight,
  },
  low: {
    label: "低",
    text: "text-slate-500",
    icon: ArrowDown,
  },
};

// 種別バッジ
export function TypeBadge({
  type,
  showLabel = true,
}: {
  type: IssueType;
  showLabel?: boolean;
}) {
  const config = ISSUE_TYPE_CONFIG[type] || ISSUE_TYPE_CONFIG.task;
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 ${
        showLabel ? "px-2 py-0.5" : "p-1"
      } rounded-md text-xs font-semibold ${config.bg} ${config.text} shadow-2xs`}
      title={config.label}
    >
      <Icon className="w-3 h-3" />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

// ステータスバッジ
export function StatusBadge({ status }: { status: IssueStatus }) {
  const config = ISSUE_STATUS_CONFIG[status] || ISSUE_STATUS_CONFIG.open;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border}`}
    >
      {config.label}
    </span>
  );
}

// 優先度バッジ
export function PriorityBadge({ priority }: { priority: IssuePriority }) {
  const config = ISSUE_PRIORITY_CONFIG[priority] || ISSUE_PRIORITY_CONFIG.medium;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${config.text}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

// 完了理由情報マッピング（本家Backlogライクな落ち着いたタグデザイン）
export const ISSUE_RESOLUTION_CONFIG: Record<
  IssueResolution,
  { label: string; bg: string; text: string; border: string }
> = {
  fixed: {
    label: "対応済み",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-300",
  },
  wont_fix: {
    label: "対応しない",
    bg: "bg-stone-50",
    text: "text-stone-600",
    border: "border-stone-300",
  },
  invalid: {
    label: "無効",
    bg: "bg-zinc-100",
    text: "text-zinc-600",
    border: "border-zinc-300",
  },
  duplicated: {
    label: "重複",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    border: "border-indigo-300",
  },
  cannot_reproduce: {
    label: "再現しない",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-300",
  },
};

// 完了理由バッジ
export function ResolutionBadge({
  resolution,
  className = "",
}: {
  resolution?: IssueResolution | null;
  className?: string;
}) {
  if (!resolution) return null;
  const config = ISSUE_RESOLUTION_CONFIG[resolution];
  if (!config) return null;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${config.bg} ${config.text} ${config.border} ${className}`}
      title={`完了理由: ${config.label}`}
    >
      {config.label}
    </span>
  );
}
