// メンションハイライト表示コンポーネント
"use client";

import React from "react";
import { User } from "@/types";

interface MentionTextProps {
  text: string;
  users?: User[];
  className?: string;
}

/**
 * テキスト内の @login_id や @[表示名] を検出してハイライト表示するコンポーネント
 */
export default function MentionText({ text, users = [], className = "" }: MentionTextProps) {
  if (!text) return null;

  // テキストを行ごとに分割
  const lines = text.split("\n");

  // login_id や ユーザー名からメンション対象を探す
  const renderLine = (line: string, lineIndex: number) => {
    // @login_id または @[表示名] にマッチする正規表現
    const mentionRegex = /(@[a-zA-Z0-9_.-]+|@\[[^\]]+\])/g;
    const parts = line.split(mentionRegex);

    return (
      <React.Fragment key={lineIndex}>
        {parts.map((part, partIndex) => {
          if (!part.startsWith("@")) {
            return <span key={partIndex}>{part}</span>;
          }

          // @login_id 形式
          let targetUser: User | undefined;
          if (part.startsWith("@[") && part.endsWith("]")) {
            const rawName = part.slice(2, -1);
            targetUser = users.find((u) => u.name === rawName);
          } else {
            const rawLoginId = part.slice(1).toLowerCase();
            targetUser = users.find((u) => u.login_id.toLowerCase() === rawLoginId);
          }

          if (targetUser) {
            return (
              <span
                key={partIndex}
                className="inline-flex items-center gap-1 px-1.5 py-0.2 mx-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs hover:bg-indigo-100 transition-colors align-baseline"
                title={`${targetUser.name} (@${targetUser.login_id})`}
              >
                <span
                  style={{ backgroundColor: targetUser.color || "#4f46e5" }}
                  className="w-2 h-2 rounded-full shrink-0"
                />
                @{targetUser.login_id}
              </span>
            );
          }

          // ユーザーに一致しない @単語 の場合はそのまま通常文字として表示
          return <span key={partIndex}>{part}</span>;
        })}
        {lineIndex < lines.length - 1 && <br />}
      </React.Fragment>
    );
  };

  return (
    <div className={`whitespace-pre-wrap break-words ${className}`}>
      {lines.map((line, index) => renderLine(line, index))}
    </div>
  );
}
