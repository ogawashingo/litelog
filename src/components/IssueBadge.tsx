// 課題の種別、ステータス、優先度を表示するバッジコンポーネント
"use client";

import React from "react";
import { CheckSquare, Bug, Sparkles, HelpCircle, ArrowUp, ArrowRight, ArrowDown } from "lucide-react";
import { IssueType, IssueStatus, IssuePriority } from "@/types";

// 種別情報マッピング
export const ISSUE_TYPE_CONFIG: Record<
  IssueType,
  { label: string; bg: string; text: string; icon: React.ElementType }
> = {
  task: {
    label: "タスク",
    bg: "bg-blue-500",
    text: "text-white",
    icon: CheckSquare,
  },
  bug: {
    label: "バグ",
    bg: "bg-red-500",
    text: "text-white",
    icon: Bug,
  },
  request: {
    label: "要望",
    bg: "bg-emerald-600",
    text: "text-white",
    icon: Sparkles,
  },
  other: {
    label: "その他",
    bg: "bg-slate-500",
    text: "text-white",
    icon: HelpCircle,
  },
};

// ステータス情報マッピング（Backlog標準カラー準拠）
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
    bg: "bg-teal-50",
    text: "text-teal-700",
    border: "border-teal-300",
  },
  closed: {
    label: "完了",
    bg: "bg-gray-100",
    text: "text-gray-600",
    border: "border-gray-300",
  },
};

// 優先度情報マッピング
export const ISSUE_PRIORITY_CONFIG: Record<
  IssuePriority,
  { label: string; text: string; icon: React.ElementType }
> = {
  high: {
    label: "高",
    text: "text-red-600 font-bold",
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
export function TypeBadge({ type }: { type: IssueType }) {
  const config = ISSUE_TYPE_CONFIG[type] || ISSUE_TYPE_CONFIG.task;
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.bg} ${config.text} shadow-xs`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
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
