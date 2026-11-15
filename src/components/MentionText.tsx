// Markdown記法およびメンション対応のリッチテキスト表示コンポーネント
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { User } from "@/types";
import { parseMarkdown, BlockNode, InlineNode, ListItem } from "@/lib/markdownUtils";
import { Check, Copy, ExternalLink, X, ZoomIn, Download, Tag } from "lucide-react";

interface MentionTextProps {
  text: string;
  users?: User[];
  className?: string;
  onIssueClick?: (issueKey: string) => void;
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
 * 添付画像インライン表示およびクリック拡大ライトボックス
 */
function ImageNodeView({ url, alt }: { url: string; alt: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <>
      <span className="block my-2 group relative max-w-fit">
        {hasError ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs">
            ⚠️ 画像を読み込めませんでした: {alt || url}
          </span>
        ) : (
          <span className="relative inline-block cursor-zoom-in rounded-lg overflow-hidden border border-slate-200 shadow-2xs hover:shadow-md transition-all">
            <img
              src={url}
              alt={alt || "添付画像"}
              loading="lazy"
              onError={() => setHasError(true)}
              onClick={() => setIsOpen(true)}
              className="max-h-80 max-w-full block object-contain bg-slate-50 hover:opacity-95 transition-opacity"
            />
            <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-slate-900/70 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 pointer-events-none">
              <ZoomIn className="w-3 h-3" /> 拡大
            </span>
          </span>
        )}
        {alt && !hasError && (
          <span className="block text-[11px] text-slate-500 mt-1">{alt}</span>
        )}
      </span>

      {/* 拡大ライトボックスモーダル */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 cursor-zoom-out animate-fadeIn"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] flex flex-col items-center cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full mb-2 px-1 text-white">
              <span className="text-sm font-medium truncate max-w-md">{alt || "添付画像プレビュー"}</span>
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  download={alt || "image"}
                  className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors"
                  title="ダウンロード"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors"
                  title="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <img
              src={url}
              alt={alt || "拡大プレビュー"}
              className="max-h-[82vh] max-w-full rounded-lg shadow-2xl object-contain border border-slate-700 bg-slate-900"
            />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * インライン要素の描画
 */
function renderInlineNode(
  node: InlineNode,
  key: string | number,
  onIssueClick?: (issueKey: string) => void
): React.ReactNode {
  switch (node.type) {
    case "text":
      return <span key={key}>{node.value}</span>;

    case "bold":
      return (
        <strong key={key} className="font-bold text-slate-900">
          {node.children.map((child, idx) => renderInlineNode(child, `${key}-b-${idx}`, onIssueClick))}
        </strong>
      );

    case "italic":
      return (
        <em key={key} className="italic text-slate-800">
          {node.children.map((child, idx) => renderInlineNode(child, `${key}-i-${idx}`, onIssueClick))}
        </em>
      );

    case "strike":
      return (
        <del key={key} className="line-through text-slate-500">
          {node.children.map((child, idx) => renderInlineNode(child, `${key}-s-${idx}`, onIssueClick))}
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

    case "issue_key": {
      const issueKey = node.issueKey;
      const displayLabel = node.raw;

      if (onIssueClick) {
        return (
          <button
            key={key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIssueClick(issueKey);
            }}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-[12.5px] font-semibold text-indigo-700 bg-indigo-50/90 hover:bg-indigo-100/90 hover:text-indigo-900 border border-indigo-200/90 shadow-2xs hover:shadow-xs transition-all cursor-pointer select-text align-baseline"
            title={`課題 [${issueKey}] を開く`}
          >
            <Tag className="w-3 h-3 text-indigo-500 shrink-0 opacity-80" />
            <span>{displayLabel}</span>
          </button>
        );
      }

      return (
        <Link
          key={key}
          href={`/issues/${issueKey}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-[12.5px] font-semibold text-indigo-700 bg-indigo-50/90 hover:bg-indigo-100/90 hover:text-indigo-900 border border-indigo-200/90 shadow-2xs hover:shadow-xs transition-all cursor-pointer align-baseline"
          title={`課題 [${issueKey}] を開く`}
        >
          <Tag className="w-3 h-3 text-indigo-500 shrink-0 opacity-80" />
          <span>{displayLabel}</span>
        </Link>
      );
    }

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

    case "image":
      return <ImageNodeView key={key} url={node.url} alt={node.alt} />;

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
function renderBlockNode(
  block: BlockNode,
  index: number,
  onIssueClick?: (issueKey: string) => void
): React.ReactNode {
  switch (block.type) {
    case "heading": {
      const headingContent = block.children.map((c, i) => renderInlineNode(c, i, onIssueClick));
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
              {line.map((c, i) => renderInlineNode(c, i, onIssueClick))}
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
                    {item.children.map((c, i) => renderInlineNode(c, i, onIssueClick))}
                  </span>
                </li>
              );
            }

            // 通常の箇条書き（点）
            if (!isOrdered) {
              return (
                <li key={itemIdx} className="flex items-start gap-1.5 list-none my-0.5">
                  <span className="text-indigo-400 select-none font-bold mt-[-1px]">•</span>
                  <span>{item.children.map((c, i) => renderInlineNode(c, i, onIssueClick))}</span>
                </li>
              );
            }

            // 通常の番号リスト
            return (
              <li key={itemIdx} className="my-0.5">
                {item.children.map((c, i) => renderInlineNode(c, i, onIssueClick))}
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
                    {cell.map((c, i) => renderInlineNode(c, i, onIssueClick))}
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
                      {cell.map((c, i) => renderInlineNode(c, i, onIssueClick))}
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
              {line.map((c, i) => renderInlineNode(c, i, onIssueClick))}
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
export default function MentionText({
  text,
  users = [],
  className = "",
  onIssueClick,
}: MentionTextProps) {
  if (!text) return null;

  const blocks = parseMarkdown(text, users);

  return (
    <div className={`rich-text-content break-words leading-relaxed text-sm ${className}`}>
      {blocks.map((block, idx) => renderBlockNode(block, idx, onIssueClick))}
    </div>
  );
}
