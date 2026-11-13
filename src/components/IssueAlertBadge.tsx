// 課題の遅延・停滞・未着手等のアラート警告バッジコンポーネント
"use client";

import React from "react";
import { AlertTriangle, Hourglass, Zap, UserX } from "lucide-react";
import { IssueAlert, IssueAlertType } from "@/lib/issueAlerts";

interface IssueAlertBadgeProps {
  alert: IssueAlert | null;
  size?: "sm" | "md";
  showIcon?: boolean;
}

export default function IssueAlertBadge({
  alert,
  size = "md",
  showIcon = true,
}: IssueAlertBadgeProps) {
  if (!alert) return null;

  // アラート種類に応じたアイコン
  const renderIcon = (type: IssueAlertType, className: string) => {
    switch (type) {
      case "overdue":
        return <AlertTriangle className={className} />;
      case "stalled":
        return <Hourglass className={className} />;
      case "unstarted":
        return <Zap className={className} />;
      case "unassigned":
        return <UserX className={className} />;
    }
  };

  // スタイル設定（緊急度・重要度に応じた配色）
  let styleClasses = "";
  let iconColor = "";

  if (alert.level === "critical") {
    styleClasses = "bg-rose-50 text-rose-700 border-rose-200/90 shadow-2xs font-bold";
    iconColor = "text-rose-600";
  } else if (alert.level === "warning") {
    styleClasses = "bg-amber-50 text-amber-800 border-amber-200/90 shadow-2xs font-bold";
    iconColor = "text-amber-600";
  } else {
    styleClasses = "bg-purple-50 text-purple-800 border-purple-200/90 shadow-2xs font-medium";
    iconColor = "text-purple-600";
  }

  const sizeClasses =
    size === "sm"
      ? "text-[11px] px-1.5 py-0.5 gap-1 rounded"
      : "text-xs px-2 py-0.5 gap-1.5 rounded-md";

  const iconSizeClass = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  return (
    <span
      className={`inline-flex items-center border shrink-0 transition-colors ${styleClasses} ${sizeClasses}`}
      title={alert.description}
    >
      {showIcon && renderIcon(alert.type, `${iconSizeClass} ${iconColor} shrink-0`)}
      <span>{alert.label}</span>
    </span>
  );
}
