// Markdownおよびメンションの解析・AST変換ユーティリティ
import type { User } from "../types";

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "mention"; raw: string; user?: User }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "code"; value: string }
  | { type: "link"; text: string; url: string }
  | { type: "image"; alt: string; url: string }
  | { type: "br" };

export interface ListItem {
  checked?: boolean; // undefinedなら通常リスト、true/falseならタスクリスト
  children: InlineNode[];
}

export type BlockNode =
  | { type: "heading"; level: number; children: InlineNode[] }
  | { type: "codeblock"; lang: string; code: string }
  | { type: "blockquote"; lines: InlineNode[][] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "table"; headers: InlineNode[][]; rows: InlineNode[][][] }
  | { type: "hr" }
  | { type: "paragraph"; lines: InlineNode[][] };

/**
 * テキスト内のインライン要素（太字、斜体、打ち消し線、インラインコード、リンク、メンション等）をパースする
 */
export function parseInline(text: string, users: User[] = []): InlineNode[] {
  if (!text) return [];

  // トークン単位で切り出すための正規表現パターン
  // 1: コード: `...`
  // 2: 画像: ![alt](url)
  // 3: 太字: **...** または __...__
  // 4: 取り消し線: ~~...~~
  // 5: 斜体: *...* または _..._
  // 6: リンク: [text](url)
  // 7: 自動URL: https?://...
  // 8: メンション: @login_id または @[表示名]
  const inlineRegex =
    /(`[^`\n]+`)|(!\[[^\]\n]*\]\([^)\s]+\))|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\n]+\*|_[^_\n]+_)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[a-zA-Z0-9_\-.~:/?#\[\]@!$&'()*+,;=%]+)|(@[a-zA-Z0-9_.-]+|@\[[^\]\n]+\])/g;

  const result: InlineNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // マッチの手前の通常テキスト
    if (match.index > lastIndex) {
      result.push({
        type: "text",
        value: text.slice(lastIndex, match.index),
      });
    }

    const matchedStr = match[0];

    if (match[1]) {
      // インラインコード: `code`
      const codeVal = matchedStr.slice(1, -1);
      result.push({ type: "code", value: codeVal });
    } else if (match[2]) {
      // 画像: ![alt](url)
      const imgMatch = matchedStr.match(/^!\[([^\]]*)\]\((.+)\)$/);
      if (imgMatch) {
        result.push({
          type: "image",
          alt: imgMatch[1],
          url: imgMatch[2],
        });
      } else {
        result.push({ type: "text", value: matchedStr });
      }
    } else if (match[3]) {
      // 太字: **bold** または __bold__
      const inner = matchedStr.slice(2, -2);
      result.push({
        type: "bold",
        children: parseInline(inner, users),
      });
    } else if (match[4]) {
      // 取り消し線: ~~strike~~
      const inner = matchedStr.slice(2, -2);
      result.push({
        type: "strike",
        children: parseInline(inner, users),
      });
    } else if (match[5]) {
      // 斜体: *italic* または _italic_
      const inner = matchedStr.slice(1, -1);
      result.push({
        type: "italic",
        children: parseInline(inner, users),
      });
    } else if (match[6]) {
      // リンク: [text](url)
      const linkMatch = matchedStr.match(/^\[([^\]]+)\]\((.+)\)$/);
      if (linkMatch) {
        result.push({
          type: "link",
          text: linkMatch[1],
          url: linkMatch[2],
        });
      } else {
        result.push({ type: "text", value: matchedStr });
      }
    } else if (match[7]) {
      // 自動URLリンク
      result.push({
        type: "link",
        text: matchedStr,
        url: matchedStr,
      });
    } else if (match[8]) {
      // メンション: @login_id または @[表示名]
      let targetUser: User | undefined;
      if (matchedStr.startsWith("@[") && matchedStr.endsWith("]")) {
        const rawName = matchedStr.slice(2, -1);
        targetUser = users.find((u) => u.name === rawName);
      } else {
        const rawLoginId = matchedStr.slice(1).toLowerCase();
        targetUser = users.find((u) => u.login_id.toLowerCase() === rawLoginId);
      }

      result.push({
        type: "mention",
        raw: matchedStr,
        user: targetUser,
      });
    }

    lastIndex = inlineRegex.lastIndex;
  }

  // 残りのテキスト
  if (lastIndex < text.length) {
    result.push({
      type: "text",
      value: text.slice(lastIndex),
    });
  }

  return result;
}

/**
 * テーブルの区切り行かを判定する（例: |---|:---:|---:|）
 */
function isTableDelimiter(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return false;
  const inner = trimmed.slice(1, -1);
  const cells = inner.split("|");
  return (
    cells.length > 0 &&
    cells.every((c) => /^\s*:?-+:?\s*$/.test(c))
  );
}

/**
 * テーブル行のセル配列を抽出する
 */
function extractTableCells(line: string): string[] {
  const trimmed = line.trim();
  let content = trimmed;
  if (content.startsWith("|")) content = content.slice(1);
  if (content.endsWith("|")) content = content.slice(0, -1);
  return content.split("|").map((c) => c.trim());
}

/**
 * Markdownテキスト全体をブロック要素のツリー（AST）にパースする
 */
export function parseMarkdown(text: string, users: User[] = []): BlockNode[] {
  if (!text) return [];

  const rawLines = text.split(/\r?\n/);
  const blocks: BlockNode[] = [];

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // 空行はスキップ
    if (trimmed === "") {
      i++;
      continue;
    }

    // 1. コードブロック (```lang)
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < rawLines.length && !rawLines[i].trim().startsWith("```")) {
        codeLines.push(rawLines[i]);
        i++;
      }
      if (i < rawLines.length && rawLines[i].trim().startsWith("```")) {
        i++; // 閉じ ``` を消費
      }
      blocks.push({
        type: "codeblock",
        lang,
        code: codeLines.join("\n"),
      });
      continue;
    }

    // 2. 水平線 (---, ***, ___)
    if (/^(?:---|___|\*\*\*)\s*$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // 3. 見出し (# ～ ####)
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        children: parseInline(headingMatch[2].trim(), users),
      });
      i++;
      continue;
    }

    // 4. 引用 (> text)
    if (trimmed.startsWith(">")) {
      const quoteLines: InlineNode[][] = [];
      while (i < rawLines.length && rawLines[i].trim().startsWith(">")) {
        const quoteContent = rawLines[i].trim().replace(/^>\s?/, "");
        quoteLines.push(parseInline(quoteContent, users));
        i++;
      }
      blocks.push({
        type: "blockquote",
        lines: quoteLines,
      });
      continue;
    }

    // 5. テーブル判定 (| ... | かつ次行が区切り行)
    if (
      trimmed.startsWith("|") &&
      trimmed.endsWith("|") &&
      i + 1 < rawLines.length &&
      isTableDelimiter(rawLines[i + 1])
    ) {
      const headers = extractTableCells(trimmed).map((c) => parseInline(c, users));
      i += 2; // ヘッダー行と区切り行をスキップ
      const rows: InlineNode[][][] = [];
      while (
        i < rawLines.length &&
        rawLines[i].trim().startsWith("|") &&
        rawLines[i].trim().endsWith("|")
      ) {
        const cells = extractTableCells(rawLines[i]).map((c) => parseInline(c, users));
        rows.push(cells);
        i++;
      }
      blocks.push({
        type: "table",
        headers,
        rows,
      });
      continue;
    }

    // 6. リスト（箇条書き、番号付き、タスクリスト）
    const isTaskList = /^[-*+]\s+\[([ xX])\]\s+(.*)$/.test(trimmed);
    const isUnordered = /^[-*+]\s+(.*)$/.test(trimmed);
    const isOrdered = /^\d+\.\s+(.*)$/.test(trimmed);

    if (isTaskList || isUnordered || isOrdered) {
      const ordered = isOrdered && !isTaskList && !isUnordered;
      const items: ListItem[] = [];

      while (i < rawLines.length) {
        const curLine = rawLines[i].trim();
        const taskMatch = curLine.match(/^[-*+]\s+\[([ xX])\]\s*(.*)$/);
        const unordMatch = curLine.match(/^[-*+]\s+(.*)$/);
        const ordMatch = curLine.match(/^\d+\.\s+(.*)$/);

        if (taskMatch) {
          items.push({
            checked: taskMatch[1].toLowerCase() === "x",
            children: parseInline(taskMatch[2], users),
          });
          i++;
        } else if (!ordered && unordMatch) {
          items.push({
            children: parseInline(unordMatch[1], users),
          });
          i++;
        } else if (ordered && ordMatch) {
          items.push({
            children: parseInline(ordMatch[1], users),
          });
          i++;
        } else {
          // リストの終了
          break;
        }
      }

      blocks.push({
        type: "list",
        ordered,
        items,
      });
      continue;
    }

    // 7. 通常の段落（空行または他のブロック開始行まで）
    const paragraphLines: InlineNode[][] = [];
    while (i < rawLines.length) {
      const cur = rawLines[i];
      const curTrim = cur.trim();
      if (curTrim === "") break;
      // 他のブロック要素（コード、見出し、引用、水平線、リスト、テーブル）が始まったら段落終了
      if (
        curTrim.startsWith("```") ||
        /^(?:---|___|\*\*\*)\s*$/.test(curTrim) ||
        /^(#{1,4})\s+/.test(cur) ||
        curTrim.startsWith(">") ||
        /^[-*+]\s+/.test(curTrim) ||
        /^\d+\.\s+/.test(curTrim) ||
        (curTrim.startsWith("|") && curTrim.endsWith("|") && i + 1 < rawLines.length && isTableDelimiter(rawLines[i + 1]))
      ) {
        break;
      }
      paragraphLines.push(parseInline(cur, users));
      i++;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        lines: paragraphLines,
      });
    }
  }

  return blocks;
}
