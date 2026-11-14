// Markdown記法およびメンション対応のリッチテキスト表示コンポーネント
"use client";

import React, { useState } from "react";
import { User } from "@/types";
import { parseMarkdown, BlockNode, InlineNode, ListItem } from "@/lib/markdownUtils";
import { Check, Copy, ExternalLink } from "lucide-react";

interface MentionTextProps {
  text: string;
  users?: User[];
  className?: string;
}

/**
 * コードブロック表示コンポーネント（コピー機能付き）
 */
function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-lg border border-slate-700/60 bg-slate-900 overflow-hidden text-xs shadow-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/80 border-b border-slate-700/50 text-slate-400">
        <span className="font-mono text-[11px] font-semibold text-slate-300">
          {lang || "text"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors"
          title="コードをコピー"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">コピー完了</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>コピー</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-slate-100 font-mono text-[13px] leading-relaxed whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * インライン要素の描画
 */
function renderInlineNode(node: InlineNode, key: string | number): React.ReactNode {
  switch (node.type) {
    case "text":
      return <span key={key}>{node.value}</span>;

    case "bold":
      return (
        <strong key={key} className="font-bold text-slate-900">
          {node.children.map((child, idx) => renderInlineNode(child, `${key}-b-${idx}`))}
        </strong>
      );

    case "italic":
      return (
        <em key={key} className="italic text-slate-800">
          {node.children.map((child, idx) => renderInlineNode(child, `${key}-i-${idx}`))}
        </em>
      );

    case "strike":
      return (
        <del key={key} className="line-through text-slate-500">
          {node.children.map((child, idx) => renderInlineNode(child, `${key}-s-${idx}`))}
        </del>
      );

    case "code":
      return (
        <code
          key={key}
          className="px-1.5 py-0.5 mx-0.5 rounded font-mono text-[13px] bg-slate-100 text-pink-600 border border-slate-200"
        >
          {node.value}
        </code>
      );

    case "link": {
      const isExternal = /^https?:\/\//i.test(node.url);
      return (
        <a
          key={key}
          href={node.url}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          className="inline-flex items-baseline gap-0.5 text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-600 transition-colors"
        >
          <span>{node.text}</span>
          {isExternal && <ExternalLink className="w-3 h-3 self-center inline-block ml-0.5 opacity-70" />}
        </a>
      );
    }

    case "mention": {
      const user = node.user;
      if (user) {
        return (
          <span
            key={key}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md text-[13px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs hover:bg-indigo-100 transition-colors align-baseline"
            title={`${user.name} (@${user.login_id})`}
          >
            <span
              style={{ backgroundColor: user.color || "#4f46e5" }}
              className="w-2 h-2 rounded-full shrink-0"
            />
            @{user.login_id}
          </span>
        );
      }
      return <span key={key}>{node.raw}</span>;
    }

    case "br":
      return <br key={key} />;

    default:
      return null;
  }
}

/**
 * ブロック要素の描画
 */
function renderBlockNode(block: BlockNode, index: number): React.ReactNode {
  switch (block.type) {
    case "heading": {
      const headingContent = block.children.map((c, i) => renderInlineNode(c, i));
      if (block.level === 1) {
        return (
          <h1
            key={index}
            className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-2 mt-4 mb-2.5 first:mt-0"
          >
            {headingContent}
          </h1>
        );
      }
      if (block.level === 2) {
        return (
          <h2
            key={index}
            className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-1.5 mt-3 mb-2 first:mt-0"
          >
            {headingContent}
          </h2>
        );
      }
      if (block.level === 3) {
        return (
          <h3 key={index} className="text-base font-bold text-slate-800 mt-2.5 mb-1.5 first:mt-0">
            {headingContent}
          </h3>
        );
      }
      return (
        <h4 key={index} className="text-sm font-bold text-slate-700 mt-2 mb-1 first:mt-0">
          {headingContent}
        </h4>
      );
    }

    case "codeblock":
      return <CodeBlock key={index} code={block.code} lang={block.lang} />;

    case "blockquote":
      return (
        <blockquote
          key={index}
          className="border-l-4 border-indigo-300 bg-indigo-50/40 px-3.5 py-2 my-2 text-slate-700 rounded-r leading-relaxed space-y-1"
        >
          {block.lines.map((line, lIdx) => (
            <div key={lIdx}>
              {line.map((c, i) => renderInlineNode(c, i))}
            </div>
          ))}
        </blockquote>
      );

    case "hr":
      return <hr key={index} className="my-3 border-slate-200" />;

    case "list": {
      const isOrdered = block.ordered;
      const Tag = isOrdered ? "ol" : "ul";
      const listStyleClass = isOrdered
        ? "list-decimal list-inside space-y-1 my-1.5 text-slate-800 pl-1"
        : "space-y-1 my-1.5 text-slate-800";

      return (
        <Tag key={index} className={listStyleClass}>
          {block.items.map((item: ListItem, itemIdx: number) => {
            // タスクリストの場合
            if (typeof item.checked === "boolean") {
              return (
                <li key={itemIdx} className="flex items-start gap-2 list-none my-0.5">
                  <input
                    type="checkbox"
                    readOnly
                    checked={item.checked}
                    className="mt-1 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-default"
                  />
                  <span className={item.checked ? "line-through text-slate-400" : "text-slate-800"}>
                    {item.children.map((c, i) => renderInlineNode(c, i))}
                  </span>
                </li>
              );
            }

            // 通常の箇条書き（点）
            if (!isOrdered) {
              return (
                <li key={itemIdx} className="flex items-start gap-1.5 list-none my-0.5">
                  <span className="text-indigo-400 select-none font-bold mt-[-1px]">•</span>
                  <span>{item.children.map((c, i) => renderInlineNode(c, i))}</span>
                </li>
              );
            }

            // 通常の番号リスト
            return (
              <li key={itemIdx} className="my-0.5">
                {item.children.map((c, i) => renderInlineNode(c, i))}
              </li>
            );
          })}
        </Tag>
      );
    }

    case "table":
      return (
        <div key={index} className="my-2.5 overflow-x-auto rounded-lg border border-slate-200 shadow-2xs">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-slate-700 font-semibold">
              <tr>
                {block.headers.map((cell, hIdx) => (
                  <th key={hIdx} className="px-3 py-2 text-left border-r border-slate-200 last:border-r-0">
                    {cell.map((c, i) => renderInlineNode(c, i))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {block.rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/70 transition-colors">
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className="px-3 py-2 text-slate-800 border-r border-slate-100 last:border-r-0"
                    >
                      {cell.map((c, i) => renderInlineNode(c, i))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "paragraph":
      return (
        <p key={index} className="my-1.5 text-slate-800 leading-relaxed">
          {block.lines.map((line, lineIdx) => (
            <React.Fragment key={lineIdx}>
              {line.map((c, i) => renderInlineNode(c, i))}
              {lineIdx < block.lines.length - 1 && <br />}
            </React.Fragment>
          ))}
        </p>
      );

    default:
      return null;
  }
}

/**
 * 課題詳細やコメント用のリッチテキスト・メンション表示コンポーネント
 */
export default function MentionText({ text, users = [], className = "" }: MentionTextProps) {
  if (!text) return null;

  const blocks = parseMarkdown(text, users);

  return (
    <div className={`rich-text-content break-words leading-relaxed text-sm ${className}`}>
      {blocks.map((block, idx) => renderBlockNode(block, idx))}
    </div>
  );
}
