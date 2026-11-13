// メンション解析および通知生成ユーティリティ
import { DatabaseSync } from "node:sqlite";

export interface MentionUser {
  id: number;
  login_id: string;
  name: string;
}

/**
 * テキストからメンションされたユーザーのID一覧を抽出（重複除去済み）
 * @param text 対象の本文（コメントや課題説明文）
 * @param users 登録されているユーザー一覧
 * @returns メンションされたユーザーのID配列
 */
export function parseMentions(text: string, users: MentionUser[]): number[] {
  if (!text || !users || users.length === 0) return [];

  const matchedUserIds = new Set<number>();

  // 1. @login_id 形式のマッチング（例: @admin, @yamada, @sato-123）
  //    英数字、ハイフン、アンダースコア、ドットを許容
  const loginIdMatches = text.matchAll(/@([a-zA-Z0-9_.-]+)/g);
  for (const match of loginIdMatches) {
    const rawId = match[1].toLowerCase();
    const found = users.find((u) => u.login_id.toLowerCase() === rawId);
    if (found) {
      matchedUserIds.add(found.id);
    }
  }

  // 2. @[表示名] 形式または @表示名 形式のマッチング（例: @[山田 太郎] や @山田 太郎）
  for (const user of users) {
    if (!user.name) continue;
    // @[表示名]
    if (text.includes(`@[${user.name}]`)) {
      matchedUserIds.add(user.id);
      continue;
    }
    // @表示名（スペースを含まない名前の場合や直後に区切りがある場合）
    const escapedName = user.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp(`@${escapedName}(?:\\s|$)`, "u");
    if (nameRegex.test(text)) {
      matchedUserIds.add(user.id);
    }
  }

  return Array.from(matchedUserIds);
}

/**
 * メンション通知を作成してデータベースに保存
 * @param db DatabaseSync インスタンス
 * @param options 通知作成用パラメータ
 * @returns 作成された通知IDの配列
 */
export function createMentionNotifications(
  db: DatabaseSync,
  options: {
    issueId: number;
    commentId?: number | null;
    senderId: number;
    text: string;
    existingText?: string | null; // 編集時の場合、変更前テキスト。新しくメンションされたユーザーのみに通知
  }
): number[] {
  const { issueId, commentId = null, senderId, text, existingText = null } = options;
  if (!text || !text.trim()) return [];

  // 全ユーザー取得
  const users = db.prepare("SELECT id, login_id, name FROM users").all() as unknown as MentionUser[];
  if (!users || users.length === 0) return [];

  // テキストからメンション対象ユーザーを抽出
  const currentMentions = parseMentions(text, users);

  // 編集時の場合、以前から既にメンションされていたユーザーは除外（二重通知防止）
  const previousMentions = existingText ? parseMentions(existingText, users) : [];
  const newMentions = currentMentions.filter((userId) => !previousMentions.includes(userId));

  // 送信者自身（自分自身）へのメンションは通知対象外
  const targetUserIds = newMentions.filter((userId) => userId !== senderId);

  if (targetUserIds.length === 0) return [];

  // 本文抜粋（120文字まで）
  const cleanSnippet = text.trim().slice(0, 120);

  const insertStmt = db.prepare(`
    INSERT INTO notifications (user_id, sender_id, issue_id, comment_id, type, content, is_read)
    VALUES (?, ?, ?, ?, 'mention', ?, 0)
  `);

  const createdIds: number[] = [];
  for (const targetId of targetUserIds) {
    const result = insertStmt.run(targetId, senderId, issueId, commentId, cleanSnippet);
    createdIds.push(Number(result.lastInsertRowid));
  }

  return createdIds;
}
