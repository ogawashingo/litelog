// メンション解析・自動通知（アサイン・作成者/担当者更新・コメント）・通知先指定の生成ユーティリティ
import { DatabaseSync } from "node:sqlite";

export interface MentionUser {
  id: number;
  login_id: string;
  name: string;
}

/**
 * 対象課題のプロジェクトにアクセス可能なユーザー（Adminまたはプロジェクト参加メンバー）のみを取得
 * プロジェクトメンバーシップが設定されていない場合（単体テスト環境等）は全ユーザーを返す
 */
function getNotifiableUsersForIssue(db: DatabaseSync, issueId: number): MentionUser[] {
  try {
    const issueRow = db
      .prepare("SELECT project_id FROM issues WHERE id = ?")
      .get(issueId) as { project_id: number } | undefined;
    if (issueRow?.project_id) {
      const pmCount = db
        .prepare("SELECT COUNT(*) AS count FROM project_members WHERE project_id = ?")
        .get(issueRow.project_id) as { count: number } | undefined;
      if (pmCount && pmCount.count > 0) {
        return db
          .prepare(`
            SELECT DISTINCT u.id, u.login_id, u.name
            FROM users u
            LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = ?
            WHERE u.is_admin = 1 OR u.role_type = 'admin' OR pm.user_id IS NOT NULL
          `)
          .all(issueRow.project_id) as unknown as MentionUser[];
      }
    }
  } catch {
    // project_members テーブルが存在しない環境へのフォールバック
  }
  return db.prepare("SELECT id, login_id, name FROM users").all() as unknown as MentionUser[];
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
    excludeUserIds?: number[];    // 既に別種別の通知を送ったため除外するユーザーID配列
  }
): number[] {
  const {
    issueId,
    commentId = null,
    senderId,
    text,
    existingText = null,
    excludeUserIds = [],
  } = options;
  if (!text || !text.trim()) return [];

  // 対象プロジェクトの閲覧権限を持つユーザーのみ取得（非参加ユーザーへの情報漏洩防止）
  const users = getNotifiableUsersForIssue(db, issueId);
  if (!users || users.length === 0) return [];

  // テキストからメンション対象ユーザーを抽出
  const currentMentions = parseMentions(text, users);

  // 編集時の場合、以前から既にメンションされていたユーザーは除外（二重通知防止）
  const previousMentions = existingText ? parseMentions(existingText, users) : [];
  const newMentions = currentMentions.filter((userId) => !previousMentions.includes(userId));

  // 送信者自身（自分自身）および除外指定ユーザーへのメンションは通知対象外
  const excludeSet = new Set<number>([senderId, ...excludeUserIds]);
  const targetUserIds = newMentions.filter((userId) => !excludeSet.has(userId));

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

/**
 * 課題の新規登録に伴う自動通知（担当者アサイン・本文メンション・通知先チェックボックス）を一括作成
 */
export function createIssueCreatedNotifications(
  db: DatabaseSync,
  options: {
    issueId: number;
    senderId: number;
    assigneeId?: number | null;
    issueKey: string;
    title: string;
    description?: string | null;
    notifyUserIds?: (number | string)[] | null;
  }
): number[] {
  const {
    issueId,
    senderId,
    assigneeId = null,
    issueKey,
    title,
    description = "",
    notifyUserIds = [],
  } = options;

  const users = getNotifiableUsersForIssue(db, issueId);
  if (!users || users.length === 0) return [];
  const validUserIdSet = new Set<number>(users.map((u) => Number(u.id)));
  const senderRow = db.prepare("SELECT name FROM users WHERE id = ?").get(senderId) as { name: string } | undefined;
  const senderName = senderRow?.name || "メンバー";

  // 同一操作内での重複通知を防ぐセット（送信者自身を最初から除外）
  const notifiedUserIds = new Set<number>([Number(senderId)]);
  const createdNotificationIds: number[] = [];

  const insertStmt = db.prepare(`
    INSERT INTO notifications (user_id, sender_id, issue_id, comment_id, type, content, is_read)
    VALUES (?, ?, ?, NULL, ?, ?, 0)
  `);

  // 1. 担当者にアサインされた時の自動通知（「○○さんがあなたを担当者に設定しました」）
  const targetAssigneeId = assigneeId ? Number(assigneeId) : null;
  if (
    targetAssigneeId &&
    validUserIdSet.has(targetAssigneeId) &&
    !notifiedUserIds.has(targetAssigneeId)
  ) {
    const res = insertStmt.run(
      targetAssigneeId,
      senderId,
      issueId,
      "assigned",
      `${senderName}さんがあなたを担当者に設定しました`
    );
    createdNotificationIds.push(Number(res.lastInsertRowid));
    notifiedUserIds.add(targetAssigneeId);
  }

  // 2. 課題説明文に @メンション が含まれる場合の通知
  const cleanDesc = String(description || "").trim();
  if (cleanDesc) {
    const mentionedIds = parseMentions(cleanDesc, users);
    const snippet = cleanDesc.slice(0, 120);
    for (const uid of mentionedIds) {
      if (validUserIdSet.has(uid) && !notifiedUserIds.has(uid)) {
        const res = insertStmt.run(uid, senderId, issueId, "mention", snippet);
        createdNotificationIds.push(Number(res.lastInsertRowid));
        notifiedUserIds.add(uid);
      }
    }
  }

  // 3. 「通知したいユーザー（参加者）」チェックボックスで選択されたユーザーへの通知
  if (Array.isArray(notifyUserIds) && notifyUserIds.length > 0) {
    const snippet = cleanDesc
      ? cleanDesc.slice(0, 120)
      : `課題 [${issueKey}] 「${title}」が登録されました`;
    for (const rawId of notifyUserIds) {
      const uid = Number(rawId);
      if (uid && validUserIdSet.has(uid) && !notifiedUserIds.has(uid)) {
        const res = insertStmt.run(uid, senderId, issueId, "notify", snippet);
        createdNotificationIds.push(Number(res.lastInsertRowid));
        notifiedUserIds.add(uid);
      }
    }
  }

  return createdNotificationIds;
}

/**
 * 課題の更新に伴う自動通知（担当者アサイン・本文新規メンション・通知先チェックボックス・作成者/担当者への更新通知）を一括作成
 */
export function createIssueUpdatedNotifications(
  db: DatabaseSync,
  options: {
    issueId: number;
    senderId: number;
    issueKey: string;
    createdBy?: number | null;
    previousAssigneeId?: number | null;
    newAssigneeId?: number | null;
    newDescription?: string;
    existingDescription?: string | null;
    updateSummary?: string;
    notifyUserIds?: (number | string)[] | null;
  }
): number[] {
  const {
    issueId,
    senderId,
    issueKey,
    createdBy = null,
    previousAssigneeId = null,
    newAssigneeId = null,
    newDescription,
    existingDescription = null,
    updateSummary = "",
    notifyUserIds = [],
  } = options;

  const users = getNotifiableUsersForIssue(db, issueId);
  if (!users || users.length === 0) return [];
  const validUserIdSet = new Set<number>(users.map((u) => Number(u.id)));
  const senderRow = db.prepare("SELECT name FROM users WHERE id = ?").get(senderId) as { name: string } | undefined;
  const senderName = senderRow?.name || "メンバー";

  // 同一操作内での重複通知を防ぐセット（送信者自身を最初から除外）
  const notifiedUserIds = new Set<number>([Number(senderId)]);
  const createdNotificationIds: number[] = [];

  const insertStmt = db.prepare(`
    INSERT INTO notifications (user_id, sender_id, issue_id, comment_id, type, content, is_read)
    VALUES (?, ?, ?, NULL, ?, ?, 0)
  `);

  // 1. 担当者が新たに設定・変更された場合の自動通知（「○○さんがあなたを担当者に設定しました」）
  const resolvedNewAssignee = newAssigneeId ? Number(newAssigneeId) : null;
  const resolvedPrevAssignee = previousAssigneeId ? Number(previousAssigneeId) : null;
  if (
    resolvedNewAssignee &&
    resolvedNewAssignee !== resolvedPrevAssignee &&
    validUserIdSet.has(resolvedNewAssignee) &&
    !notifiedUserIds.has(resolvedNewAssignee)
  ) {
    const res = insertStmt.run(
      resolvedNewAssignee,
      senderId,
      issueId,
      "assigned",
      `${senderName}さんがあなたを担当者に設定しました`
    );
    createdNotificationIds.push(Number(res.lastInsertRowid));
    notifiedUserIds.add(resolvedNewAssignee);
  }

  // 2. 詳細説明が更新され、新しく @メンション されたユーザーへの通知
  if (newDescription !== undefined && String(newDescription).trim()) {
    const cleanDesc = String(newDescription).trim();
    const currentMentions = parseMentions(cleanDesc, users);
    const prevMentions = existingDescription ? parseMentions(String(existingDescription), users) : [];
    const addedMentions = currentMentions.filter((uid) => !prevMentions.includes(uid));
    const snippet = cleanDesc.slice(0, 120);

    for (const uid of addedMentions) {
      if (validUserIdSet.has(uid) && !notifiedUserIds.has(uid)) {
        const res = insertStmt.run(uid, senderId, issueId, "mention", snippet);
        createdNotificationIds.push(Number(res.lastInsertRowid));
        notifiedUserIds.add(uid);
      }
    }
  }

  const summaryText = (updateSummary || `課題 [${issueKey}] を更新しました`).trim().slice(0, 120);

  // 3. 「通知したいユーザー（参加者）」チェックボックスで選択されたユーザーへの通知
  if (Array.isArray(notifyUserIds) && notifyUserIds.length > 0) {
    for (const rawId of notifyUserIds) {
      const uid = Number(rawId);
      if (uid && validUserIdSet.has(uid) && !notifiedUserIds.has(uid)) {
        const res = insertStmt.run(uid, senderId, issueId, "notify", summaryText);
        createdNotificationIds.push(Number(res.lastInsertRowid));
        notifiedUserIds.add(uid);
      }
    }
  }

  // 4. 自分が作成した課題や担当している課題が誰かに更新された時の自動通知
  const stakeholderIds = [
    createdBy ? Number(createdBy) : null,
    resolvedNewAssignee,
    resolvedPrevAssignee,
  ];
  for (const stId of stakeholderIds) {
    if (stId && validUserIdSet.has(stId) && !notifiedUserIds.has(stId)) {
      const res = insertStmt.run(stId, senderId, issueId, "updated", summaryText);
      createdNotificationIds.push(Number(res.lastInsertRowid));
      notifiedUserIds.add(stId);
    }
  }

  return createdNotificationIds;
}

/**
 * コメント投稿に伴う自動通知（@メンション・通知先チェックボックス・課題の作成者/担当者への自動通知）を一括作成
 */
export function createCommentNotifications(
  db: DatabaseSync,
  options: {
    issueId: number;
    commentId: number;
    senderId: number;
    text: string;
    issueCreatedBy?: number | null;
    issueAssigneeId?: number | null;
    notifyUserIds?: (number | string)[] | null;
  }
): number[] {
  const {
    issueId,
    commentId,
    senderId,
    text,
    issueCreatedBy = null,
    issueAssigneeId = null,
    notifyUserIds = [],
  } = options;

  if (!text || !text.trim()) return [];

  const users = getNotifiableUsersForIssue(db, issueId);
  if (!users || users.length === 0) return [];
  const validUserIdSet = new Set<number>(users.map((u) => Number(u.id)));

  // 同一コメント投稿内での重複通知を防ぐセット（送信者自身を最初から除外）
  const notifiedUserIds = new Set<number>([Number(senderId)]);
  const createdNotificationIds: number[] = [];
  const cleanSnippet = text.trim().slice(0, 120);

  const insertStmt = db.prepare(`
    INSERT INTO notifications (user_id, sender_id, issue_id, comment_id, type, content, is_read)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `);

  // 1. コメント本文で @メンション されたユーザーへの通知
  const mentionedIds = parseMentions(text, users);
  for (const uid of mentionedIds) {
    if (validUserIdSet.has(uid) && !notifiedUserIds.has(uid)) {
      const res = insertStmt.run(uid, senderId, issueId, commentId, "mention", cleanSnippet);
      createdNotificationIds.push(Number(res.lastInsertRowid));
      notifiedUserIds.add(uid);
    }
  }

  // 2. 「通知したいユーザー（参加者）」チェックボックスで選択されたユーザーへの通知
  if (Array.isArray(notifyUserIds) && notifyUserIds.length > 0) {
    for (const rawId of notifyUserIds) {
      const uid = Number(rawId);
      if (uid && validUserIdSet.has(uid) && !notifiedUserIds.has(uid)) {
        const res = insertStmt.run(uid, senderId, issueId, commentId, "notify", cleanSnippet);
        createdNotificationIds.push(Number(res.lastInsertRowid));
        notifiedUserIds.add(uid);
      }
    }
  }

  // 3. 課題の作成者および担当者への自動コメント通知
  const stakeholderIds = [
    issueCreatedBy ? Number(issueCreatedBy) : null,
    issueAssigneeId ? Number(issueAssigneeId) : null,
  ];
  for (const stId of stakeholderIds) {
    if (stId && validUserIdSet.has(stId) && !notifiedUserIds.has(stId)) {
      const res = insertStmt.run(stId, senderId, issueId, commentId, "commented", cleanSnippet);
      createdNotificationIds.push(Number(res.lastInsertRowid));
      notifiedUserIds.add(stId);
    }
  }

  return createdNotificationIds;
}
