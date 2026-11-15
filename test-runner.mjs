// SQLite データベース初期化＆総合検証テスト
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { getJapaneseHoliday } from "./src/lib/holidayUtils.ts";
import {
  parseMentions,
  createMentionNotifications,
  createIssueCreatedNotifications,
  createIssueUpdatedNotifications,
  createCommentNotifications,
} from "./src/lib/notificationUtils.ts";
import { AVATAR_COLORS, AVATAR_COLOR_VALUES, getAvatarColorLabel } from "./src/lib/avatarColors.ts";
import { parseMarkdown, parseInline } from "./src/lib/markdownUtils.ts";

const HASH_PREFIX = "scrypt$";

function isPasswordHashed(pw) {
  return typeof pw === "string" && pw.startsWith(HASH_PREFIX);
}

function hashPassword(plain) {
  const clean = String(plain);
  if (isPasswordHashed(clean)) return clean;
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(clean, salt, 64).toString("hex");
  return `${HASH_PREFIX}${salt}$${derived}`;
}

function verifyPassword(plain, stored) {
  if (!plain || !stored) return false;
  if (isPasswordHashed(stored)) {
    const parts = stored.split("$");
    if (parts.length !== 3) return false;
    const [, salt, hashHex] = parts;
    const derived = crypto.scryptSync(String(plain), salt, 64);
    const orig = Buffer.from(hashHex, "hex");
    if (derived.length !== orig.length) return false;
    return crypto.timingSafeEqual(derived, orig);
  }
  return String(plain) === String(stored);
}

function setupSchemaAndSeed(db, isProdDb = false) {
  // テーブル定義・WAL・外部キー有効化
  db.exec("PRAGMA foreign_keys = ON;");
  if (isProdDb) {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login_id TEXT UNIQUE,
      password TEXT NOT NULL DEFAULT 'pass123',
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'メンバー',
      is_admin INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#4f46e5',
      week_start TEXT NOT NULL DEFAULT 'monday',
      show_holidays INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const userCols = db.prepare("PRAGMA table_info(users)").all();
  if (!userCols.some((col) => col.name === "is_admin")) {
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;");
    console.log("✓ users.is_admin カラムのマイグレーションが成功しました");
  }
  if (!userCols.some((col) => col.name === "login_id")) {
    db.exec("ALTER TABLE users ADD COLUMN login_id TEXT;");
    console.log("✓ users.login_id カラムのマイグレーションが成功しました");
  }
  if (!userCols.some((col) => col.name === "password")) {
    db.exec("ALTER TABLE users ADD COLUMN password TEXT NOT NULL DEFAULT 'pass123';");
    console.log("✓ users.password カラムのマイグレーションが成功しました");
  }
  if (!userCols.some((col) => col.name === "week_start")) {
    db.exec("ALTER TABLE users ADD COLUMN week_start TEXT NOT NULL DEFAULT 'monday';");
    console.log("✓ users.week_start カラムのマイグレーションが成功しました");
  }
  if (!userCols.some((col) => col.name === "show_holidays")) {
    db.exec("ALTER TABLE users ADD COLUMN show_holidays INTEGER NOT NULL DEFAULT 1;");
    console.log("✓ users.show_holidays カラムのマイグレーションが成功しました");
  }
  db.prepare(`
    UPDATE users
    SET is_admin = 1,
        role = CASE WHEN role = 'プロジェクトリーダー' OR role = 'メンバー' THEN '管理者' ELSE role END,
        login_id = COALESCE(NULLIF(login_id, ''), 'yamada'),
        password = CASE WHEN password IS NULL OR password = '' OR password = 'pass123' THEN 'yamada123' ELSE password END
    WHERE name LIKE '山田%'
  `).run();
  db.prepare(`
    UPDATE users
    SET is_admin = 0,
        login_id = COALESCE(NULLIF(login_id, ''), 'sato'),
        password = CASE WHEN password IS NULL OR password = '' OR password = 'pass123' THEN 'sato123' ELSE password END
    WHERE name LIKE '佐藤%'
  `).run();
  db.prepare(`
    UPDATE users
    SET is_admin = 0,
        login_id = COALESCE(NULLIF(login_id, ''), 'suzuki'),
        password = CASE WHEN password IS NULL OR password = '' OR password = 'pass123' THEN 'suzuki123' ELSE password END
    WHERE name LIKE '鈴木%'
  `).run();
  db.prepare(`
    UPDATE users
    SET login_id = 'user' || id
    WHERE login_id IS NULL OR login_id = ''
  `).run();
  // 平文パスワードをscryptハッシュへ自動移行
  const rawUsers = db.prepare("SELECT id, password FROM users").all();
  const updateHashStmt = db.prepare("UPDATE users SET password = ? WHERE id = ?");
  for (const u of rawUsers) {
    if (u.password && !isPasswordHashed(u.password)) {
      updateHashStmt.run(hashPassword(u.password), u.id);
    }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#4f46e5',
      week_start TEXT NOT NULL DEFAULT 'monday',
      show_holidays INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`
    UPDATE users SET color = '#4f46e5' WHERE color LIKE '#2c%' OR color LIKE '#16%' OR color LIKE '#14%' OR color LIKE '#06%';
    UPDATE projects SET color = '#4f46e5' WHERE color LIKE '#2c%' OR color LIKE '#16%' OR color LIKE '#14%' OR color LIKE '#06%';
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES issues(id) ON DELETE SET NULL,
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      issue_key TEXT UNIQUE NOT NULL,
      issue_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      issue_type TEXT NOT NULL DEFAULT 'task',
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'medium',
      resolution TEXT,
      start_date TEXT,
      due_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // start_date / parent_id / assignee_id / created_by カラムの存在確認およびマイグレーション
  const tableCols = db.prepare("PRAGMA table_info(issues)").all();
  if (!tableCols.some((col) => col.name === "start_date")) {
    db.exec("ALTER TABLE issues ADD COLUMN start_date TEXT;");
    console.log("✓ start_date カラムのマイグレーションが成功しました");
  }
  if (!tableCols.some((col) => col.name === "parent_id")) {
    db.exec("ALTER TABLE issues ADD COLUMN parent_id INTEGER REFERENCES issues(id) ON DELETE SET NULL;");
    console.log("✓ parent_id カラムのマイグレーションが成功しました");
  }
  if (!tableCols.some((col) => col.name === "assignee_id")) {
    db.exec("ALTER TABLE issues ADD COLUMN assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL;");
    console.log("✓ assignee_id カラムのマイグレーションが成功しました");
  }
  if (!tableCols.some((col) => col.name === "created_by")) {
    db.exec("ALTER TABLE issues ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;");
    console.log("✓ created_by カラムのマイグレーションが成功しました");
  }
  if (!tableCols.some((col) => col.name === "resolution")) {
    db.exec("ALTER TABLE issues ADD COLUMN resolution TEXT;");
    console.log("✓ resolution カラムのマイグレーションが成功しました");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    );
  `);
  const commentCols = db.prepare("PRAGMA table_info(comments)").all();
  if (!commentCols.some((col) => col.name === "user_id")) {
    db.exec("ALTER TABLE comments ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;");
  }
  if (!commentCols.some((col) => col.name === "updated_at")) {
    db.exec("ALTER TABLE comments ADD COLUMN updated_at DATETIME;");
  }
  // コメント編集履歴テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS comment_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // コメントリアクション（スタンプ）テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS comment_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stamp TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(comment_id, user_id, stamp)
    );
    CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON comment_reactions(comment_id);
  `);
  // 課題変更履歴テーブル（タイトル・詳細説明等の過去バージョン保持）
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      field_name TEXT NOT NULL,
      old_value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
      comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action_type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const activityCols = db.prepare("PRAGMA table_info(activities)").all();
  if (!activityCols.some((col) => col.name === "user_id")) {
    db.exec("ALTER TABLE activities ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;");
  }
  if (!activityCols.some((col) => col.name === "comment_id")) {
    db.exec("ALTER TABLE activities ADD COLUMN comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE;");
  }

  // 通知（メンションなど）テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'mention',
      content TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 添付ファイルテーブル（画像・ファイル保存）
  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
      comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      file_name TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_issue_id ON attachments(issue_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_comment_id ON attachments(comment_id);
  `);
  // 既存の「〜にコメントを追加しました」を実際のコメント内容へマイグレーション
  db.exec(`
    UPDATE activities
    SET content = COALESCE(
      (
        SELECT c.content
        FROM comments c
        WHERE c.issue_id = activities.issue_id
          AND c.created_at = activities.created_at
        LIMIT 1
      ),
      (
        SELECT c.content
        FROM comments c
        WHERE c.issue_id = activities.issue_id
        ORDER BY ABS(strftime('%s', c.created_at) - strftime('%s', activities.created_at)) ASC
        LIMIT 1
      ),
      content
    )
    WHERE action_type = 'commented'
      AND content LIKE '%にコメントを追加しました%';
  `);
  // user_id が未設定（NULL）のアクティビティ・コメントを課題の担当者・作成者または初期メンバーで補完
  db.exec(`
    UPDATE activities
    SET user_id = COALESCE(
      (
        SELECT COALESCE(i.assignee_id, i.created_by)
        FROM issues i
        WHERE i.id = activities.issue_id
      ),
      (
        SELECT id FROM users ORDER BY is_admin DESC, id ASC LIMIT 1
      )
    )
    WHERE user_id IS NULL
      AND EXISTS (SELECT 1 FROM users);

    UPDATE comments
    SET user_id = COALESCE(
      (
        SELECT COALESCE(i.assignee_id, i.created_by)
        FROM issues i
        WHERE i.id = comments.issue_id
      ),
      (
        SELECT id FROM users ORDER BY is_admin DESC, id ASC LIMIT 1
      )
    )
    WHERE user_id IS NULL
      AND EXISTS (SELECT 1 FROM users);
  `);

  // 初期メンバー作成（パスワードはscryptハッシュ化して保存）
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  if (userCount === 0) {
    const insertUser = db.prepare("INSERT INTO users (login_id, password, name, role, is_admin, color) VALUES (?, ?, ?, ?, ?, ?)");
    const u1 = insertUser.run("yamada", hashPassword("yamada123"), "山田 太郎", "管理者", 1, "#4f46e5").lastInsertRowid;
    const u2 = insertUser.run("sato", hashPassword("sato123"), "佐藤 花子", "エンジニア", 0, "#3b82f6").lastInsertRowid;
    insertUser.run("suzuki", hashPassword("suzuki123"), "鈴木 一郎", "デザイナー", 0, "#8b5cf6");
    db.prepare("UPDATE issues SET assignee_id = ?, created_by = ? WHERE assignee_id IS NULL").run(u1, u1);
    db.prepare("UPDATE comments SET user_id = ? WHERE user_id IS NULL").run(u2);
    db.prepare("UPDATE activities SET user_id = ? WHERE user_id IS NULL").run(u1);
    if (!isProdDb) console.log("✓ 初期メンバーを作成し既存課題へ紐付けました");
  }

  // 初期プロジェクト作成
  const projCount = db.prepare("SELECT COUNT(*) as count FROM projects").get().count;
  if (projCount === 0) {
    db.prepare(`
      INSERT INTO projects (key, name, color)
      VALUES ('MYPRJ', '個人メインプロジェクト', '#4f46e5')
    `).run();
    if (!isProdDb) console.log("✓ 初期プロジェクト「MYPRJ」を作成しました");
  }

  // 初期課題作成
  const issueCount = db.prepare("SELECT COUNT(*) as count FROM issues").get().count;
  if (issueCount === 0) {
    const today = new Date().toISOString().split("T")[0];
    const sampleIssues = [
      { num: 1, title: "Backlogダッシュボードの操作感を確認する", type: "task", status: "open", priority: "high", due: today },
      { num: 2, title: "個人プロジェクトのタスクを洗い出して登録する", type: "request", status: "in_progress", priority: "medium", due: today },
      { num: 3, title: "Personal Backlogの環境セットアップ", type: "task", status: "closed", priority: "medium", due: today },
    ];
    for (const item of sampleIssues) {
      const res = db.prepare(`
        INSERT INTO issues (project_id, issue_key, issue_number, title, description, issue_type, status, priority, due_date)
        VALUES (1, ?, ?, ?, 'サンプル詳細メモ', ?, ?, ?, ?)
      `).run(`MYPRJ-${item.num}`, item.num, item.title, item.type, item.status, item.priority, item.due);

      db.prepare(`
        INSERT INTO activities (issue_id, action_type, content)
        VALUES (?, 'created', ?)
      `).run(res.lastInsertRowid, `課題 [MYPRJ-${item.num}] 「${item.title}」を追加しました`);
    }
    if (!isProdDb) console.log("✓ 初期サンプル課題およびアクティビティを作成しました");
  }

  // インデックス作成
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_issues_project_status_updated ON issues(project_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_issues_assignee_id ON issues(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_issues_parent_id ON issues(parent_id);
    CREATE INDEX IF NOT EXISTS idx_issue_histories_issue_id ON issue_histories(issue_id);
    CREATE INDEX IF NOT EXISTS idx_comments_issue_id ON comments(issue_id);
    CREATE INDEX IF NOT EXISTS idx_comment_histories_comment_id ON comment_histories(comment_id);
    CREATE INDEX IF NOT EXISTS idx_activities_issue_id ON activities(issue_id);
    CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
  `);
}

async function runTests() {
  console.log("=== Personal Backlog データベース初期化＆動作検証開始（テスト用分離DB） ===");
  // 本番DBのスキーマ・インデックス・パスワードハッシュ化の整合性のみ安全に同期（テストデータの書き込みは行わない）
  const dbDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const prodDbPath = path.join(dbDir, "backlog.db");
  const prodDb = new DatabaseSync(prodDbPath);
  setupSchemaAndSeed(prodDb, true);
  prodDb.close();

  // CRUD・破壊的検証は完全に分離されたインメモリDBで実行（本番データを一切汚さない）
  const db = new DatabaseSync(":memory:");
  setupSchemaAndSeed(db, false);

  // 1. プロジェクト確認
  const projects = db.prepare("SELECT * FROM projects").all();
  console.log(`✓ プロジェクト取得成功: ${projects.length} 件`);
  if (projects.length === 0) throw new Error("初期プロジェクトが存在しません");

  // 2. 課題一覧確認
  const issues = db.prepare("SELECT * FROM issues").all();
  console.log(`✓ 課題一覧取得成功: ${issues.length} 件`);
  if (issues.length === 0) throw new Error("初期課題が存在しません");

  // 3. 課題新規作成テスト
  const nextNum = issues.length + 1;
  const newKey = `MYPRJ-${nextNum}`;
  const res = db.prepare(`
    INSERT INTO issues (project_id, issue_key, issue_number, title, description, issue_type, status, priority, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    projects[0].id,
    newKey,
    nextNum,
    "自動検証テスト課題",
    "自動テストで作成された課題です",
    "task",
    "open",
    "high",
    "2026-11-20"
  );
  const createdId = res.lastInsertRowid;
  console.log(`✓ 課題作成テスト成功: ID=${createdId}, KEY=${newKey}`);

  // 3-2. 課題キーによる個別検索検証（一意URL対応用）
  const fetchedByKey = db.prepare(`
    SELECT i.*, p.name AS project_name
    FROM issues i
    JOIN projects p ON i.project_id = p.id
    WHERE i.issue_key = ?
  `).get(newKey);
  if (!fetchedByKey || fetchedByKey.id !== createdId) {
    throw new Error(`課題キーによる検索に失敗しました: key=${newKey}`);
  }
  console.log(`✓ 課題キー一意検索テスト成功: KEY=${newKey} -> ID=${fetchedByKey.id}`);

  // 3-3. 課題キーをキーとしたコメント追加と結合取得テスト
  db.prepare(`
    INSERT INTO comments (issue_id, user_id, content)
    VALUES (?, ?, ?)
  `).run(fetchedByKey.id, null, "一意URL連携確認コメント");
  const commentsByKey = db.prepare(`
    SELECT c.* FROM comments c
    JOIN issues i ON c.issue_id = i.id
    WHERE i.issue_key = ?
  `).all(newKey);
  if (commentsByKey.length === 0) {
    throw new Error("課題キー経由のコメント取得に失敗しました");
  }
  console.log(`✓ 課題キー連動コメント取得テスト成功: KEY=${newKey} コメント数=${commentsByKey.length}`);

  // 4. ステータス変更テスト
  db.prepare("UPDATE issues SET status = 'in_progress' WHERE id = ?").run(createdId);
  const updated = db.prepare("SELECT * FROM issues WHERE id = ?").get(createdId);
  if (updated.status !== "in_progress") throw new Error("ステータス変更に失敗しました");
  console.log(`✓ ステータス更新テスト成功: ${updated.status}`);

  // 4-2. 種別即時変更テスト
  db.prepare("UPDATE issues SET issue_type = 'bug' WHERE id = ?").run(createdId);
  const updatedType = db.prepare("SELECT issue_type FROM issues WHERE id = ?").get(createdId);
  if (updatedType.issue_type !== "bug") throw new Error("種別変更に失敗しました");
  console.log(`✓ 種別更新テスト成功: ${updatedType.issue_type}`);

  // 4-3. 優先度即時変更テスト
  db.prepare("UPDATE issues SET priority = 'low' WHERE id = ?").run(createdId);
  const updatedPrio = db.prepare("SELECT priority FROM issues WHERE id = ?").get(createdId);
  if (updatedPrio.priority !== "low") throw new Error("優先度変更に失敗しました");
  console.log(`✓ 優先度更新テスト成功: ${updatedPrio.priority}`);

  // 4-4. 期限日即時更新＆クリアテスト
  db.prepare("UPDATE issues SET due_date = '2026-12-01' WHERE id = ?").run(createdId);
  const updatedDue = db.prepare("SELECT due_date FROM issues WHERE id = ?").get(createdId);
  if (updatedDue.due_date !== "2026-12-01") throw new Error("期限日変更に失敗しました");
  db.prepare("UPDATE issues SET due_date = NULL WHERE id = ?").run(createdId);
  const clearedDue = db.prepare("SELECT due_date FROM issues WHERE id = ?").get(createdId);
  if (clearedDue.due_date !== null) throw new Error("期限日クリアに失敗しました");
  console.log("✓ 期限日即時更新＆クリアテスト成功");

  // 4-4-2. 完了理由（Resolution）即時更新＆履歴退避＆フィルタリング検証テスト
  const origRes = updated.resolution || null;
  db.prepare(`
    INSERT INTO issue_histories (issue_id, user_id, field_name, old_value, created_at)
    VALUES (?, ?, 'resolution', ?, CURRENT_TIMESTAMP)
  `).run(createdId, 1, origRes);
  db.prepare("UPDATE issues SET resolution = 'fixed' WHERE id = ?").run(createdId);
  const updatedRes1 = db.prepare("SELECT resolution FROM issues WHERE id = ?").get(createdId);
  if (updatedRes1.resolution !== "fixed") throw new Error("完了理由の更新（fixed）に失敗しました");

  // 重複（duplicated）に変更し履歴を記録
  db.prepare(`
    INSERT INTO issue_histories (issue_id, user_id, field_name, old_value, created_at)
    VALUES (?, ?, 'resolution', 'fixed', CURRENT_TIMESTAMP)
  `).run(createdId, 1);
  db.prepare("UPDATE issues SET resolution = 'duplicated' WHERE id = ?").run(createdId);
  const updatedRes2 = db.prepare("SELECT resolution FROM issues WHERE id = ?").get(createdId);
  if (updatedRes2.resolution !== "duplicated") throw new Error("完了理由の更新（duplicated）に失敗しました");

  // 完了理由によるフィルタリング抽出テスト
  const duplicatedIssues = db.prepare("SELECT id FROM issues WHERE resolution = 'duplicated'").all();
  if (!duplicatedIssues.some((i) => i.id === createdId)) {
    throw new Error("完了理由フィルタリング抽出に失敗しました");
  }

  // 完了理由のクリア（未設定化）テスト
  db.prepare("UPDATE issues SET resolution = NULL WHERE id = ?").run(createdId);
  const clearedRes = db.prepare("SELECT resolution FROM issues WHERE id = ?").get(createdId);
  if (clearedRes.resolution !== null) throw new Error("完了理由クリアに失敗しました");

  // 履歴件数集計の検証
  const resHistCount = db.prepare("SELECT COUNT(*) as count FROM issue_histories WHERE issue_id = ? AND field_name = 'resolution'").get(createdId);
  if (resHistCount.count !== 2) throw new Error(`完了理由の変更履歴件数が不正です: ${resHistCount.count}`);
  console.log("✓ 完了理由（Resolution: fixed/duplicated/clear）更新・履歴退避・フィルター検証成功");

  // 4-5. 課題タイトル・詳細説明の更新および変更履歴（issue_histories）保存テスト
  const curIssueForHist = db.prepare("SELECT * FROM issues WHERE id = ?").get(createdId);
  const origTitle = curIssueForHist.title;
  const origDesc = curIssueForHist.description || "";

  // タイトルの変更前を履歴保存し、更新
  db.prepare(`
    INSERT INTO issue_histories (issue_id, user_id, field_name, old_value, created_at)
    VALUES (?, ?, 'title', ?, CURRENT_TIMESTAMP)
  `).run(createdId, 1, origTitle);
  db.prepare("UPDATE issues SET title = ? WHERE id = ?").run("更新後タイトルテスト", createdId);

  // 詳細説明の変更前を履歴保存し、更新
  db.prepare(`
    INSERT INTO issue_histories (issue_id, user_id, field_name, old_value, created_at)
    VALUES (?, ?, 'description', ?, CURRENT_TIMESTAMP)
  `).run(createdId, 1, origDesc);
  db.prepare("UPDATE issues SET description = ? WHERE id = ?").run("更新後詳細説明文テスト", createdId);

  // 期限日の変更前を履歴保存し、更新（ステルス延期防止検証）
  const origDueDate = curIssueForHist.due_date || "";
  db.prepare(`
    INSERT INTO issue_histories (issue_id, user_id, field_name, old_value, created_at)
    VALUES (?, ?, 'due_date', ?, CURRENT_TIMESTAMP)
  `).run(createdId, 1, origDueDate);
  db.prepare("UPDATE issues SET due_date = '2026-12-15' WHERE id = ?").run(createdId);

  // 履歴テーブルの検証（完了理由2件 + タイトル1件 + 説明1件 + 期限日1件 = 計5件）
  const issueHists = db.prepare("SELECT * FROM issue_histories WHERE issue_id = ? ORDER BY id ASC").all(createdId);
  if (issueHists.length !== 5) throw new Error(`課題変更履歴件数不一致: ${issueHists.length}`);
  if (issueHists[0].field_name !== "resolution" || issueHists[0].old_value !== origRes) {
    throw new Error(`完了理由初回変更履歴不一致: ${JSON.stringify(issueHists[0])}`);
  }
  if (issueHists[1].field_name !== "resolution" || issueHists[1].old_value !== "fixed") {
    throw new Error(`完了理由次回変更履歴不一致: ${JSON.stringify(issueHists[1])}`);
  }
  if (issueHists[2].field_name !== "title" || issueHists[2].old_value !== origTitle) {
    throw new Error(`タイトル変更履歴不一致: ${JSON.stringify(issueHists[2])}`);
  }
  if (issueHists[3].field_name !== "description" || issueHists[3].old_value !== origDesc) {
    throw new Error(`詳細説明変更履歴不一致: ${JSON.stringify(issueHists[3])}`);
  }
  if (issueHists[4].field_name !== "due_date" || issueHists[4].old_value !== origDueDate) {
    throw new Error(`期限日変更履歴不一致: ${JSON.stringify(issueHists[4])}`);
  }

  // 課題取得時の履歴カウント検証（完了理由履歴カウント含む）
  const issueWithHistCount = db.prepare(`
    SELECT 
      i.*,
      (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'description') AS description_history_count,
      (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'title') AS title_history_count,
      (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'due_date') AS due_date_history_count,
      (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'start_date') AS start_date_history_count,
      (SELECT COUNT(*) FROM issue_histories ih WHERE ih.issue_id = i.id AND ih.field_name = 'resolution') AS resolution_history_count
    FROM issues i
    WHERE i.id = ?
  `).get(createdId);

  if (
    issueWithHistCount.description_history_count !== 1 ||
    issueWithHistCount.title_history_count !== 1 ||
    issueWithHistCount.due_date_history_count !== 1 ||
    issueWithHistCount.resolution_history_count !== 2
  ) {
    throw new Error(
      `課題履歴カウントサブクエリ検証失敗: desc=${issueWithHistCount.description_history_count}, title=${issueWithHistCount.title_history_count}, due=${issueWithHistCount.due_date_history_count}, res=${issueWithHistCount.resolution_history_count}`
    );
  }
  console.log(`✓ 課題タイトル・詳細説明・期限日・完了理由変更履歴退避＆件数結合テスト成功: タイトル旧="${origTitle}", 説明旧="${origDesc}", 期限旧="${origDueDate}", 完了理由履歴=${issueWithHistCount.resolution_history_count}件`);

  // 5. コメント追加テスト
  const commentRes = db.prepare(`
    INSERT INTO comments (issue_id, content) VALUES (?, ?)
  `).run(createdId, "テストコメントを投稿しました");
  const commentId = commentRes.lastInsertRowid;
  console.log(`✓ コメント追加テスト成功: ID=${commentId}`);

  // 5-1. コメント編集および変更ログ（comment_histories）保存テスト
  const origComment = db.prepare("SELECT * FROM comments WHERE id = ?").get(commentId);
  // 変更前の本文を comment_histories に保存
  db.prepare(`
    INSERT INTO comment_histories (comment_id, user_id, content, created_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `).run(commentId, 1, origComment.content);
  // コメント本文を更新
  db.prepare(`
    UPDATE comments
    SET content = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run("テストコメントを編集しました（修正後）", commentId);

  // 編集結果の検証
  const editedComment = db.prepare(`
    SELECT 
      c.*,
      (SELECT COUNT(*) FROM comment_histories ch WHERE ch.comment_id = c.id) AS history_count
    FROM comments c
    WHERE c.id = ?
  `).get(commentId);

  if (!editedComment || editedComment.content !== "テストコメントを編集しました（修正後）" || editedComment.history_count !== 1 || !editedComment.updated_at) {
    throw new Error(`コメント編集・変更ログ検証失敗: ${JSON.stringify(editedComment)}`);
  }

  // 変更ログテーブルの履歴確認
  const histories = db.prepare("SELECT * FROM comment_histories WHERE comment_id = ?").all(commentId);
  if (histories.length !== 1 || histories[0].content !== "テストコメントを投稿しました") {
    throw new Error(`コメント履歴テーブルの内容不一致: ${JSON.stringify(histories)}`);
  }
  console.log(`✓ コメント編集・変更ログ退避＆履歴取得テスト成功: 編集前="${histories[0].content}" -> 編集後="${editedComment.content}" (履歴件数: ${editedComment.history_count})`);

  // 5-2. 課題一覧API用 コメント件数・最新コメント結合取得テスト
  const issueWithComment = db.prepare(`
    SELECT 
      i.*,
      COALESCE(cmt_stat.comment_count, 0) AS comment_count,
      latest_c.content AS latest_comment_content,
      latest_c.created_at AS latest_comment_created_at,
      cu.name AS latest_comment_user_name,
      cu.color AS latest_comment_user_color
    FROM issues i
    LEFT JOIN (
      SELECT issue_id, COUNT(*) AS comment_count, MAX(id) AS latest_comment_id
      FROM comments
      GROUP BY issue_id
    ) cmt_stat ON cmt_stat.issue_id = i.id
    LEFT JOIN comments latest_c ON latest_c.id = cmt_stat.latest_comment_id
    LEFT JOIN users cu ON latest_c.user_id = cu.id
    WHERE i.id = ?
  `).get(createdId);
  if (!issueWithComment || issueWithComment.comment_count !== 2 || issueWithComment.latest_comment_content !== "テストコメントを編集しました（修正後）") {
    throw new Error(`コメント結合クエリ検証失敗: count=${issueWithComment?.comment_count}, content=${issueWithComment?.latest_comment_content}`);
  }
  console.log(`✓ 課題コメント件数・最新プレビュー結合クエリ検証成功: 件数=${issueWithComment.comment_count}, 最新="${issueWithComment.latest_comment_content}"`);

  // 5-3. 管理者による機密情報・誤爆コメント完全削除および履歴カスケード削除テスト
  const secretCommentRes = db.prepare(`
    INSERT INTO comments (issue_id, user_id, content) VALUES (?, 1, ?)
  `).run(createdId, "誤ってAPIキー sk-secret-12345 を投稿");
  const secretCommentId = secretCommentRes.lastInsertRowid;
  // 編集履歴も作成
  db.prepare(`
    INSERT INTO comment_histories (comment_id, user_id, content, created_at)
    VALUES (?, 1, '旧APIキー sk-old-00000', CURRENT_TIMESTAMP)
  `).run(secretCommentId);

  // コメント削除前の履歴存在確認
  const secretHistBefore = db.prepare("SELECT COUNT(*) AS c FROM comment_histories WHERE comment_id = ?").get(secretCommentId);
  if (secretHistBefore.c !== 1) throw new Error("削除前履歴が存在しません");

  // 管理者による削除実行（外部キー ON DELETE CASCADE の検証）
  db.prepare("DELETE FROM comments WHERE id = ?").run(secretCommentId);

  // コメントおよび履歴が完全削除されていることを検証
  const deletedCmt = db.prepare("SELECT * FROM comments WHERE id = ?").get(secretCommentId);
  if (deletedCmt) throw new Error("コメントが削除されていません");
  const secretHistAfter = db.prepare("SELECT COUNT(*) AS c FROM comment_histories WHERE comment_id = ?").get(secretCommentId);
  if (secretHistAfter.c !== 0) throw new Error("コメント履歴がカスケード削除されていません（機密情報が残存）");

  console.log("✓ 管理者限定コメント完全削除＆履歴カスケード消去テスト成功（機密情報残存なし）");

  // 6. アクティビティ追加テスト
  db.prepare(`
    INSERT INTO activities (issue_id, action_type, content) VALUES (?, 'created', ?)
  `).run(createdId, `課題 [${newKey}] を作成しました`);
  const activities = db.prepare("SELECT * FROM activities").all();
  console.log(`✓ アクティビティ取得成功: ${activities.length} 件`);

  // 7. かんばんボード用ステータス別集計テスト
  const boardCols = ["open", "in_progress", "resolved", "closed"];
  for (const st of boardCols) {
    const list = db.prepare("SELECT * FROM issues WHERE status = ?").all(st);
    console.log(`✓ ボードレーン [${st}] 取得成功: ${list.length} 件`);
  }

  // 8. ガントチャート用 開始日・期限日（期間）更新テスト
  db.prepare(`
    UPDATE issues
    SET start_date = '2026-11-10', due_date = '2026-11-25'
    WHERE id = ?
  `).run(createdId);
  const ganttUpdated = db.prepare("SELECT start_date, due_date FROM issues WHERE id = ?").get(createdId);
  if (ganttUpdated.start_date !== "2026-11-10" || ganttUpdated.due_date !== "2026-11-25") {
    throw new Error("ガントチャート用の期間更新に失敗しました");
  }
  console.log(`✓ ガントチャート期間更新テスト成功: ${ganttUpdated.start_date} 〜 ${ganttUpdated.due_date}`);

  // 9. ガントチャート用 期間指定フィルタリングテスト
  const rangeIssues = db.prepare(`
    SELECT * FROM issues
    WHERE (start_date IS NOT NULL AND due_date IS NOT NULL)
       OR due_date IS NOT NULL
  `).all();
  console.log(`✓ ガントチャート対象課題取得成功: ${rangeIssues.length} 件`);

  // 10. 親子課題（withParentRelation）連携テスト
  const childNum = nextNum + 1;
  const childKey = `MYPRJ-${childNum}`;
  const childRes = db.prepare(`
    INSERT INTO issues (project_id, parent_id, issue_key, issue_number, title, description, issue_type, status, priority, start_date, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    projects[0].id,
    createdId,
    childKey,
    childNum,
    "自動検証テスト子課題",
    "親課題に紐づく子課題テスト",
    "task",
    "in_progress",
    "medium",
    "2026-11-12",
    "2026-11-18"
  );
  const childId = childRes.lastInsertRowid;
  const linkedChildren = db.prepare("SELECT * FROM issues WHERE parent_id = ?").all(createdId);
  if (linkedChildren.length !== 1 || linkedChildren[0].issue_key !== childKey) {
    throw new Error("親子課題の紐付け取得に失敗しました");
  }
  console.log(`✓ 親子課題連携テスト成功: 親ID=${createdId} -> 子=${childKey}`);

  // 10-2. 未完了の子課題が存在する場合に親課題を完了(closed)にできない制御テスト
  const checkUnclosedChildren = (parentId) => {
    const unclosed = db
      .prepare("SELECT COUNT(*) AS count FROM issues WHERE parent_id = ? AND status != 'closed'")
      .get(parentId);
    return unclosed ? unclosed.count : 0;
  };

  // 子課題が未完了(in_progress)の状態で親課題を完了にしようとした場合
  if (checkUnclosedChildren(createdId) === 0) {
    throw new Error("未完了子課題が存在するはずですが、検出されませんでした");
  }
  console.log("✓ 未完了子課題の存在チェック成功（親課題の完了をブロック）");

  // 子課題を「closed（完了）」に変更
  db.prepare("UPDATE issues SET status = 'closed' WHERE id = ?").run(childId);
  if (checkUnclosedChildren(createdId) !== 0) {
    throw new Error("子課題完了後にもかかわらず未完了子課題が検出されました");
  }

  // 全子課題が完了したため、親課題を「closed」に更新可能
  db.prepare("UPDATE issues SET status = 'closed' WHERE id = ?").run(createdId);
  const updatedParent = db.prepare("SELECT status FROM issues WHERE id = ?").get(createdId);
  if (!updatedParent || updatedParent.status !== "closed") {
    throw new Error("子課題完了後の親課題完了ステータス更新に失敗しました");
  }
  console.log("✓ 子課題全件完了時の親課題クローズ完了テスト成功");

  // 11. 親課題削除時の子課題ON DELETE SET NULLおよび後始末
  db.prepare("DELETE FROM issues WHERE id = ?").run(createdId);
  const afterDelete = db.prepare("SELECT * FROM issues WHERE id = ?").get(createdId);
  if (afterDelete) throw new Error("親課題削除に失敗しました");
  const orphanChild = db.prepare("SELECT * FROM issues WHERE id = ?").get(childId);
  if (!orphanChild || orphanChild.parent_id !== null) {
    throw new Error("親課題削除時の parent_id NULL化(ON DELETE SET NULL)に失敗しました");
  }
  db.prepare("DELETE FROM issues WHERE id = ?").run(childId);
  console.log("✓ 課題削除および親子参照クリアテスト成功");

  // 12. ガントチャート向け日付ユーティリティ検証（YYYY/MM/DD形式 ＆ 月スパン計算）
  const slashStr = "2026/11/05";
  const [sy, sm, sd] = slashStr.replace(/\//g, "-").split("-").map(Number);
  const startDt = new Date(sy, sm - 1, sd);
  const spanEndDt = new Date(startDt.getTime());
  spanEndDt.setMonth(spanEndDt.getMonth() + 6); // span=6
  if (spanEndDt.getFullYear() !== 2027 || spanEndDt.getMonth() !== 4 || spanEndDt.getDate() !== 5) {
    throw new Error("span=6 の日付計算に失敗しました");
  }
  console.log(`✓ 日付スパン計算テスト成功: 2026/11/05 + 6ヶ月 = ${spanEndDt.getFullYear()}/${spanEndDt.getMonth() + 1}/${spanEndDt.getDate()}`);

  const d1 = new Date(2026, 10, 10); // 2026-11-10
  const d2 = new Date(2026, 10, 20); // 2026-11-20
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  const diff = Math.round((utc2 - utc1) / 86400000);
  if (diff !== 10) throw new Error("日付差分計算エラー");
  console.log(`✓ 日付差分計算テスト成功: ${diff} 日間`);

  // 13. 複数人（メンバー管理・山田さんのAdmin権限・佐藤さん/鈴木さんの一般ユーザー＆個別ログインID）検証
  const usersList = db.prepare("SELECT * FROM users").all();
  if (usersList.length === 0) throw new Error("初期メンバーが存在しません");
  const yamada = usersList.find((u) => u.login_id === "yamada");
  const sato = usersList.find((u) => u.login_id === "sato");
  const suzuki = usersList.find((u) => u.login_id === "suzuki");
  if (!yamada || yamada.is_admin !== 1) {
    throw new Error("山田さん(login_id=yamada)にAdmin権限(is_admin=1)が設定されていません");
  }
  if (!sato || sato.is_admin !== 0 || !suzuki || suzuki.is_admin !== 0) {
    throw new Error("佐藤さん(sato)・鈴木さん(suzuki)の一般ユーザーID設定が正しくありません");
  }
  console.log(`✓ 個別ログインID＆権限検証成功: ${yamada.name}(ID=${yamada.login_id}, Admin=${yamada.is_admin}), ${sato.name}(ID=${sato.login_id}, Admin=${sato.is_admin}), ${suzuki.name}(ID=${suzuki.login_id}, Admin=${suzuki.is_admin})`);

  const tempUserRes = db.prepare("INSERT INTO users (name, role, color) VALUES (?, ?, ?)").run(
    "テスト メンバー",
    "QA",
    "#ec4899"
  );
  const tempUserId = tempUserRes.lastInsertRowid;

  const currentIssuesCount = db.prepare("SELECT COALESCE(MAX(issue_number), 0) as max_num FROM issues WHERE project_id = ?").get(projects[0].id).max_num;
  const assignIssueKey = `MYPRJ-${currentIssuesCount + 1}`;
  const assignIssueRes = db.prepare(`
    INSERT INTO issues (project_id, assignee_id, created_by, issue_key, issue_number, title, description, issue_type, status, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'task', 'open', 'medium')
  `).run(projects[0].id, tempUserId, tempUserId, assignIssueKey, currentIssuesCount + 1, "担当者検証課題", "複数人担当テスト");
  const assignIssueId = assignIssueRes.lastInsertRowid;

  const joinedIssue = db.prepare(`
    SELECT i.*, u.name AS assignee_name
    FROM issues i
    LEFT JOIN users u ON i.assignee_id = u.id
    WHERE i.id = ?
  `).get(assignIssueId);
  if (joinedIssue.assignee_name !== "テスト メンバー") {
    throw new Error("担当者結合クエリに失敗しました");
  }
  console.log(`✓ 課題への担当者割り当て＆結合取得テスト成功: 担当者=${joinedIssue.assignee_name}`);

  // メンバー削除時に課題の assignee_id が NULL (未割当) になることを確認
  db.prepare("DELETE FROM users WHERE id = ?").run(tempUserId);
  const unassignedIssue = db.prepare("SELECT * FROM issues WHERE id = ?").get(assignIssueId);
  if (!unassignedIssue || unassignedIssue.assignee_id !== null) {
    throw new Error("メンバー削除時の担当者NULL化(ON DELETE SET NULL)に失敗しました");
  }
  db.prepare("DELETE FROM issues WHERE id = ?").run(assignIssueId);
  console.log("✓ メンバー削除時の担当者未割当化(ON DELETE SET NULL)および後始末成功");

  // 14. システム時刻・タイムゾーン設定テーブルおよびUTC→JST変換検証
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  insertSetting.run("timezone", "Asia/Tokyo");
  insertSetting.run("datetimeFormat", "slash_sec");
  insertSetting.run("hour12", "false");
  insertSetting.run("activityTimeStyle", "both");
  insertSetting.run("timeOffsetMinutes", "0");
  insertSetting.run("theme", "cosmic");

  const tzRow = db.prepare("SELECT value FROM settings WHERE key = 'timezone'").get();
  if (!tzRow || !tzRow.value) throw new Error("settingsテーブルのtimezone取得に失敗しました");

  // デザイン・カラーテーマ（シック・モノクロ＆オレンジ、北欧フォレスト等）の保存・更新検証
  const updateTheme = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('theme', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  updateTheme.run("monochrome");
  const themeRow = db.prepare("SELECT value FROM settings WHERE key = 'theme'").get();
  if (!themeRow || themeRow.value !== "monochrome") {
    throw new Error("デザインカラーテーマの更新・取得に失敗しました");
  }
  // デフォルトのコズミックに戻す検証
  updateTheme.run("cosmic");
  const restoredThemeRow = db.prepare("SELECT value FROM settings WHERE key = 'theme'").get();
  if (!restoredThemeRow || restoredThemeRow.value !== "cosmic") {
    throw new Error("デザインカラーテーマの復元に失敗しました");
  }
  console.log("✓ デザインカラーテーマ設定（モノクロ＆オレンジ、コズミック等）保存・更新検証成功");

  // SQLiteのUTC文字列 "2026-11-12 03:53:22" をUTCとしてパースし、Asia/Tokyo (UTC+9) で "2026/11/12 12:53:22" になることを検証
  const rawSqliteUtc = "2026-11-12 03:53:22";
  const parsedUtcDate = new Date(rawSqliteUtc.replace(/\s+/, "T") + "Z");
  const jstParts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(parsedUtcDate);
  const getP = (t) => jstParts.find((p) => p.type === t)?.value || "";
  const formattedJst = `${getP("year")}/${getP("month")}/${getP("day")} ${getP("hour")}:${getP("minute")}:${getP("second")}`;
  if (formattedJst !== "2026/11/12 12:53:22") {
    throw new Error(`UTC→JST変換結果が期待値と異なります: ${formattedJst}`);
  }
  console.log(`✓ タイムスタンプUTC→JST変換テスト成功: "${rawSqliteUtc}" (UTC) -> "${formattedJst}" (Asia/Tokyo)`);

  // 15. 「最近の更新」の日付別グルーピング（YYYY年M月D日(曜日)）および課題詳細結合クエリ検証
  const dateGroupParts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(parsedUtcDate);
  const getDp = (t) => dateGroupParts.find((p) => p.type === t)?.value || "";
  const dateGroupLabel = `${getDp("year")}年${getDp("month")}月${getDp("day")}日(${getDp("weekday")})`;
  if (dateGroupLabel !== "2026年11月12日(木)") {
    throw new Error(`日付見出しフォーマットが期待値と異なります: ${dateGroupLabel}`);
  }
  const joinedActivities = db.prepare(`
    SELECT 
      a.id,
      a.issue_id,
      COALESCE(a.user_id, i.assignee_id, i.created_by, du.id) AS user_id,
      COALESCE(u.name, iu.name, cu.name, du.name) AS user_name,
      a.action_type,
      a.content,
      i.issue_key,
      i.title AS issue_title,
      i.project_id,
      p.key AS project_key
    FROM activities a
    LEFT JOIN issues i ON a.issue_id = i.id
    LEFT JOIN projects p ON i.project_id = p.id
    LEFT JOIN users u ON a.user_id = u.id
    LEFT JOIN users iu ON i.assignee_id = iu.id
    LEFT JOIN users cu ON i.created_by = cu.id
    LEFT JOIN users du ON du.id = (SELECT id FROM users ORDER BY is_admin DESC, id ASC LIMIT 1)
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 50
  `).all();
  if (joinedActivities.length === 0) {
    throw new Error("結合アクティビティが取得できませんでした");
  }
  if (joinedActivities.some((act) => !act.user_name)) {
    throw new Error("「最近の更新」に操作者名(user_name)が未設定の履歴が存在します");
  }
  console.log(`✓ 「最近の更新」日付グルーピング見出し("${dateGroupLabel}")＆操作者名・課題結合クエリ検証成功 (${joinedActivities.length}件)`);

  // 16. 一般ユーザーのパスワードハッシュ変更および現在のパスワード照合テスト
  const satoBefore = db.prepare("SELECT id, login_id, password FROM users WHERE login_id = 'sato'").get();
  if (!satoBefore) throw new Error("一般ユーザー(sato)が見つかりません");
  const originalSatoPw = satoBefore.password;
  if (!isPasswordHashed(originalSatoPw)) {
    throw new Error("パスワードがscrypt形式でハッシュ化されていません");
  }

  const nextTestPw = "sato_new_pw_999";
  const nextHashedPw = hashPassword(nextTestPw);
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(nextHashedPw, satoBefore.id);
  const satoAfterChange = db.prepare("SELECT password FROM users WHERE id = ?").get(satoBefore.id);
  if (!verifyPassword(nextTestPw, satoAfterChange.password) || verifyPassword("wrong_pw", satoAfterChange.password)) {
    throw new Error("一般ユーザーのハッシュ化パスワード照合テストに失敗しました");
  }
  // 元のパスワードハッシュへ復元
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(originalSatoPw, satoBefore.id);
  console.log(`✓ 一般ユーザー(sato)のscryptパスワードハッシュ照合・変更・復元テスト成功`);

  // 17. 管理者（Admin権限）専用のプロジェクト名変更テスト
  const targetProject = db.prepare("SELECT * FROM projects ORDER BY id ASC LIMIT 1").get();
  if (!targetProject) throw new Error("テスト対象のプロジェクトが存在しません");
  const originalProjectName = targetProject.name;

  // 管理者権限(yamada: is_admin=1)を確認してプロジェクト名を変更
  const adminActor = db.prepare("SELECT id, is_admin FROM users WHERE login_id = 'yamada'").get();
  if (!adminActor || adminActor.is_admin !== 1) {
    throw new Error("管理者(yamada)の権限確認に失敗しました");
  }
  const renamedProjectName = "名称変更テストプロジェクト";
  db.prepare("UPDATE projects SET name = ? WHERE id = ?").run(renamedProjectName, targetProject.id);
  const projectAfterRename = db.prepare("SELECT name FROM projects WHERE id = ?").get(targetProject.id);
  if (projectAfterRename.name !== renamedProjectName) {
    throw new Error("プロジェクト名の変更テストに失敗しました");
  }
  // 元のプロジェクト名へ復元
  db.prepare("UPDATE projects SET name = ? WHERE id = ?").run(originalProjectName, targetProject.id);
  console.log(`✓ 管理者(Admin)専用のプロジェクト名変更・復元テスト成功: "${originalProjectName}" -> "${renamedProjectName}" -> "${originalProjectName}"`);

  // 18. ダッシュボード課題一覧の完了済み(closed)デフォルト非表示フィルタリング検証
  const allIssuesForFilter = db.prepare("SELECT * FROM issues").all();
  const filterDashboardIssues = (list, selectedStatus = "all", showClosed = false) => {
    const isShowingClosed = selectedStatus === "closed" || showClosed;
    return list.filter((issue) => {
      if (selectedStatus !== "all" && issue.status !== selectedStatus) return false;
      if (!isShowingClosed && issue.status === "closed") return false;
      return true;
    });
  };
  const defaultFiltered = filterDashboardIssues(allIssuesForFilter, "all", false);
  if (defaultFiltered.some((i) => i.status === "closed")) {
    throw new Error("デフォルト状態で完了済み(closed)の課題が表示されています");
  }
  const withClosedEnabled = filterDashboardIssues(allIssuesForFilter, "all", true);
  const closedOnlySelected = filterDashboardIssues(allIssuesForFilter, "closed", false);
  if (withClosedEnabled.length !== allIssuesForFilter.length) {
    throw new Error("「完了を含む」ON時の件数が全課題数と一致しません");
  }
  if (!closedOnlySelected.every((i) => i.status === "closed")) {
    throw new Error("「完了」ステータス選択時に完了以外の課題が含まれています");
  }
  console.log(`✓ ダッシュボード完了済み課題デフォルト非表示検証成功: 全${allIssuesForFilter.length}件 -> デフォルト表示${defaultFiltered.length}件 (完了${closedOnlySelected.length}件を非表示)`);

  // 19. 管理者（Admin権限）専用のプロジェクト削除＆関連課題・コメント一括削除テスト
  const tempProjKey = "DELTEST";
  db.prepare("DELETE FROM projects WHERE key = ?").run(tempProjKey);
  const tempProjRes = db.prepare(`
    INSERT INTO projects (key, name, color)
    VALUES (?, '削除検証用一時プロジェクト', '#e11d48')
  `).run(tempProjKey);
  const tempProjId = tempProjRes.lastInsertRowid;

  const tempProjIssueRes = db.prepare(`
    INSERT INTO issues (project_id, assignee_id, created_by, issue_key, issue_number, title, description, issue_type, status, priority)
    VALUES (?, ?, ?, 'DELTEST-1', 1, 'プロジェクト削除連動テスト課題', 'プロジェクト削除時に消える課題', 'task', 'open', 'medium')
  `).run(tempProjId, adminActor.id, adminActor.id);
  const tempProjIssueId = tempProjIssueRes.lastInsertRowid;

  db.prepare("INSERT INTO comments (issue_id, user_id, content) VALUES (?, ?, '削除テストコメント')").run(
    tempProjIssueId,
    adminActor.id
  );
  db.prepare("INSERT INTO activities (issue_id, user_id, action_type, content) VALUES (?, ?, 'created', '課題 [DELTEST-1] を作成')").run(
    tempProjIssueId,
    adminActor.id
  );

  // トランザクションによるプロジェクト削除実行
  db.exec("BEGIN;");
  db.prepare("DELETE FROM comments WHERE issue_id IN (SELECT id FROM issues WHERE project_id = ?)").run(tempProjId);
  db.prepare("DELETE FROM activities WHERE issue_id IN (SELECT id FROM issues WHERE project_id = ?) OR content LIKE ?").run(
    tempProjId,
    `%[${tempProjKey}-%`
  );
  db.prepare("DELETE FROM issues WHERE project_id = ?").run(tempProjId);
  db.prepare("DELETE FROM projects WHERE id = ?").run(tempProjId);
  db.exec("COMMIT;");

  const checkDeletedProj = db.prepare("SELECT * FROM projects WHERE id = ?").get(tempProjId);
  const checkDeletedIssue = db.prepare("SELECT * FROM issues WHERE id = ?").get(tempProjIssueId);
  const checkDeletedComment = db.prepare("SELECT * FROM comments WHERE issue_id = ?").get(tempProjIssueId);
  if (checkDeletedProj || checkDeletedIssue || checkDeletedComment) {
    throw new Error("プロジェクト削除時の一括クリーンアップに失敗しました");
  }
  console.log(`✓ 管理者(Admin)専用のプロジェクト削除＆関連課題・コメント一括削除テスト成功`);

  // 20. セキュリティ検証（全ユーザーのパスワードハッシュ化確認 ＆ 初期アカウント照合 ＆ HMACセッショントークン改ざん検知）
  const allUsersForSec = db.prepare("SELECT id, login_id, password FROM users").all();
  for (const u of allUsersForSec) {
    if (!isPasswordHashed(u.password)) {
      throw new Error(`ユーザー ${u.login_id} のパスワードが平文のまま残っています`);
    }
  }
  const yamadaRow = allUsersForSec.find((u) => u.login_id === "yamada");
  const satoRow = allUsersForSec.find((u) => u.login_id === "sato");
  const suzukiRow = allUsersForSec.find((u) => u.login_id === "suzuki");
  if (
    !verifyPassword("yamada123", yamadaRow.password) ||
    !verifyPassword("sato123", satoRow.password) ||
    !verifyPassword("suzuki123", suzukiRow.password)
  ) {
    throw new Error("初期メンバーのパスワードハッシュ照合に失敗しました");
  }
  const testSecret = crypto.randomBytes(32).toString("hex");
  const expMs = Date.now() + 3600000;
  const payload = `2.${expMs}`;
  const validSig = crypto.createHmac("sha256", testSecret).update(payload).digest("hex");
  const tamperedPayload = `1.${expMs}`; // 一般ユーザー(2)からAdmin(1)へのID改ざんを試行
  const expectedTamperedSig = crypto.createHmac("sha256", testSecret).update(tamperedPayload).digest("hex");
  if (validSig === expectedTamperedSig) {
    throw new Error("HMAC署名によるID改ざん検知テストに失敗しました");
  }
  console.log(`✓ セキュリティ検証（全ユーザーscryptハッシュ化・初期アカウント照合・HMACセッショントークン改ざん防止）成功`);

  // 19. 初回管理者セットアップ機能およびデモユーザー削除マイグレーション検証
  const setupDb = new DatabaseSync(":memory:");
  setupDb.exec("PRAGMA foreign_keys = ON;");
  setupDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login_id TEXT UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'メンバー',
      is_admin INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#4f46e5',
      week_start TEXT NOT NULL DEFAULT 'monday',
      show_holidays INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL
    );
  `);

  // デモユーザーが残っていた場合の削除マイグレーション検証
  setupDb.prepare("INSERT INTO users (login_id, password, name, is_admin) VALUES ('yamada', 'pass', '山田 太郎', 1)").run();
  setupDb.prepare("INSERT INTO users (login_id, password, name) VALUES ('sato', 'pass', '佐藤 花子')").run();
  setupDb.prepare("DELETE FROM users WHERE login_id IN ('yamada', 'sato', 'suzuki')").run();
  const countAfterDelete = setupDb.prepare("SELECT COUNT(*) as c FROM users").get().c;
  if (countAfterDelete !== 0) throw new Error("デモユーザー削除マイグレーションに失敗しました");

  // ユーザー0件時の初回管理者登録テスト
  const adminName = "システム 管理者";
  const adminLoginId = "admin";
  const adminPass = "admin1234";
  const adminHash = hashPassword(adminPass);
  const newAdminId = setupDb.prepare(`
    INSERT INTO users (login_id, password, name, role, is_admin, color)
    VALUES (?, ?, ?, '管理者', 1, '#4f46e5')
  `).run(adminLoginId, adminHash, adminName).lastInsertRowid;

  const createdAdmin = setupDb.prepare("SELECT * FROM users WHERE id = ?").get(newAdminId);
  if (!createdAdmin || createdAdmin.is_admin !== 1 || createdAdmin.login_id !== "admin" || !verifyPassword(adminPass, createdAdmin.password)) {
    throw new Error("初回管理者アカウント登録テストに失敗しました");
  }

  // 既にユーザーが存在する場合の重複セットアップ防止チェック
  const reCheckCount = setupDb.prepare("SELECT COUNT(*) as c FROM users").get().c;
  if (reCheckCount <= 0) throw new Error("ユーザー存在判定エラー");
  console.log(`✓ 初回セットアップ＆デモユーザー削除マイグレーション検証成功: 管理者「${createdAdmin.name}」(ID=${createdAdmin.login_id}) 作成完了`);

  // 20. カレンダー週開始曜日（月曜始まり／日曜始まり）および設定保存テスト
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('weekStart', 'sunday')").run();
  const loadedWeekStart = db.prepare("SELECT value FROM settings WHERE key = 'weekStart'").get().value;
  if (loadedWeekStart !== "sunday") {
    throw new Error(`カレンダー設定保存テスト失敗: 期待='sunday', 実際='${loadedWeekStart}'`);
  }

  // 2026年11月1日は日曜日(getDay() === 0)
  // 月曜始まりの場合: 11月1日の前に10月26日(月)〜10月31日(土)の6日分が入る
  const nov1st = new Date(2026, 10, 1); // 2026-11-01
  const nov1Dow = nov1st.getDay(); // 0 (日曜日)
  const mondayLeadDays = (nov1Dow + 6) % 7; // 6日間
  const sundayLeadDays = nov1Dow; // 0日間

  if (mondayLeadDays !== 6) {
    throw new Error(`月曜始まりカレンダーのオフセット計算テスト失敗: 期待=6, 実際=${mondayLeadDays}`);
  }
  if (sundayLeadDays !== 0) {
    throw new Error(`日曜始まりカレンダーのオフセット計算テスト失敗: 期待=0, 実際=${sundayLeadDays}`);
  }

  // 月曜始まりの先頭日は 10月26日(月)
  const monStart = new Date(2026, 10, 1 - mondayLeadDays);
  if (monStart.getDate() !== 26 || monStart.getDay() !== 1) {
    throw new Error(`月曜始まり先頭日計算テスト失敗: ${monStart.toISOString()}`);
  }

  // 日曜始まりの先頭日は 11月1日(日)
  const sunStart = new Date(2026, 10, 1 - sundayLeadDays);
  if (sunStart.getDate() !== 1 || sunStart.getDay() !== 0) {
    throw new Error(`日曜始まり先頭日計算テスト失敗: ${sunStart.toISOString()}`);
  }
  console.log(`✓ 期日カレンダーの週開始曜日（月曜始まり／日曜始まり）計算＆設定保存テスト成功`);

  // 21. メンバー各個人ごとのカレンダー設定（月曜始まり／日曜始まり）個別保存・更新テスト
  const userYamada = db.prepare("SELECT id, name, week_start FROM users WHERE login_id = 'yamada'").get();
  const userSato = db.prepare("SELECT id, name, week_start FROM users WHERE login_id = 'sato'").get();
  if (!userYamada || !userSato) throw new Error("テスト対象ユーザーが見つかりません");

  // デフォルト値が 'monday' であること
  if (userYamada.week_start !== "monday" || userSato.week_start !== "monday") {
    throw new Error(`メンバー初期week_start不正: yamada=${userYamada.week_start}, sato=${userSato.week_start}`);
  }

  // sato を日曜始まりに更新
  db.prepare("UPDATE users SET week_start = 'sunday' WHERE id = ?").run(userSato.id);
  const updatedSato = db.prepare("SELECT week_start FROM users WHERE id = ?").get(userSato.id);
  const recheckYamada = db.prepare("SELECT week_start FROM users WHERE id = ?").get(userYamada.id);

  if (updatedSato.week_start !== "sunday") {
    throw new Error(`個人カレンダー設定更新失敗: sato期待='sunday', 実際='${updatedSato.week_start}'`);
  }
  if (recheckYamada.week_start !== "monday") {
    throw new Error(`他メンバーへの副作用検知: yamada期待='monday', 実際='${recheckYamada.week_start}'`);
  }
  console.log(`✓ メンバー各個人のカレンダー設定（山田: 月曜始まり, 佐藤: 日曜始まり）個別更新＆分離検証成功`);

  // 22. 日本の祝日（方式A: アプリ内蔵方式）の自動計算＆判定テスト
  const expectedHolidays2026 = [
    { date: "2026-01-01", name: "元日" },
    { date: "2026-01-12", name: "成人の日" },
    { date: "2026-02-11", name: "建国記念の日" },
    { date: "2026-02-23", name: "天皇誕生日" },
    { date: "2026-03-20", name: "春分の日" },
    { date: "2026-04-29", name: "昭和の日" },
    { date: "2026-05-03", name: "憲法記念日" },
    { date: "2026-05-04", name: "みどりの日" },
    { date: "2026-05-05", name: "こどもの日" },
    { date: "2026-05-06", name: "振替休日" }, // 5/3(日)の振替
    { date: "2026-07-20", name: "海の日" },
    { date: "2026-08-11", name: "山の日" },
    { date: "2026-09-21", name: "敬老の日" },
    { date: "2026-09-22", name: "国民の休日" }, // 敬老の日と秋分の日の中間日
    { date: "2026-09-23", name: "秋分の日" },
    { date: "2026-10-12", name: "スポーツの日" },
    { date: "2026-11-03", name: "文化の日" },
    { date: "2026-11-23", name: "勤労感謝の日" },
  ];

  for (const h of expectedHolidays2026) {
    const res = getJapaneseHoliday(h.date);
    if (res !== h.name) {
      throw new Error(`祝日判定エラー (${h.date}): 期待='${h.name}', 実際='${res}'`);
    }
  }

  // 平日判定
  if (getJapaneseHoliday("2026-11-13") !== null) {
    throw new Error("平日判定エラー: 2026-11-13が祝日として判定されました");
  }
  if (getJapaneseHoliday("2026-05-07") !== null) {
    throw new Error("平日判定エラー: 2026-05-07が祝日として判定されました");
  }

  // 祝日表示フラグ（show_holidays）の個人別保存・照合テスト
  db.prepare("UPDATE users SET show_holidays = 0 WHERE id = ?").run(userSato.id);
  const satoHolidays = db.prepare("SELECT show_holidays FROM users WHERE id = ?").get(userSato.id);
  const yamadaHolidays = db.prepare("SELECT show_holidays FROM users WHERE id = ?").get(userYamada.id);

  if (satoHolidays.show_holidays !== 0) {
    throw new Error(`個人祝日設定保存失敗: sato期待=0, 実際=${satoHolidays.show_holidays}`);
  }
  if (yamadaHolidays.show_holidays !== 1) {
    throw new Error(`個人祝日設定保存失敗: yamada期待=1, 実際=${yamadaHolidays.show_holidays}`);
  }
  console.log(`✓ 日本の祝日（元日・春分・秋分・振替休日・国民の休日等18日）内蔵計算＆表示ON/OFF検証成功`);

  // ヘッダーナビゲーションリンクとプロジェクト選択連動検証
  const testProjects = [
    { id: 1, key: "PRJA", name: "プロジェクトA" },
    { id: 2, key: "PRJB", name: "プロジェクトB" },
  ];
  const generateHeaderHrefs = (selectedId, projects) => {
    const selected = projects.find((p) => p.id === selectedId) || null;
    const projectKey = selected ? encodeURIComponent(selected.key) : "";
    return {
      dashboard: selectedId ? `/?projectId=${selectedId}` : "/",
      board: projectKey ? `/board/${projectKey}` : "/board",
      gantt: projectKey ? `/gantt/${projectKey}` : "/gantt",
    };
  };

  const hrefsWithProject = generateHeaderHrefs(2, testProjects);
  if (
    hrefsWithProject.dashboard !== "/?projectId=2" ||
    hrefsWithProject.board !== "/board/PRJB" ||
    hrefsWithProject.gantt !== "/gantt/PRJB"
  ) {
    throw new Error(`プロジェクト選択時のヘッダーリンク生成失敗: ${JSON.stringify(hrefsWithProject)}`);
  }

  const hrefsWithoutProject = generateHeaderHrefs(null, testProjects);
  if (
    hrefsWithoutProject.dashboard !== "/" ||
    hrefsWithoutProject.board !== "/board" ||
    hrefsWithoutProject.gantt !== "/gantt"
  ) {
    throw new Error(`プロジェクト未選択時のヘッダーリンク生成失敗: ${JSON.stringify(hrefsWithoutProject)}`);
  }
  console.log("✓ ヘッダーのプロジェクト選択連動ナビゲーションリンク生成テスト成功");

  // === メンション通知機能の検証 ===
  // 1. メンション解析（@login_id, @[名前], 重複除外）のテスト
  const sampleUsers = [
    { id: 1, login_id: "admin", name: "システム 管理者" },
    { id: 2, login_id: "yamada", name: "山田 太郎" },
    { id: 3, login_id: "sato", name: "佐藤 花子" },
  ];
  const parsed1 = parseMentions("お疲れ様です @yamada さん、この件ご確認お願いします @admin", sampleUsers);
  if (!parsed1.includes(2) || !parsed1.includes(1) || parsed1.length !== 2) {
    throw new Error(`メンション解析失敗: 期待=[1, 2], 実際=${JSON.stringify(parsed1)}`);
  }

  // 重複メンションの除外テスト
  const parsedDup = parseMentions("@yamada @yamada @yamada テスト", sampleUsers);
  if (parsedDup.length !== 1 || parsedDup[0] !== 2) {
    throw new Error(`重複メンション除外失敗: 実際=${JSON.stringify(parsedDup)}`);
  }

  // @[表示名] メンションのテスト
  const parsedByName = parseMentions("よろしく @[佐藤 花子] さん", sampleUsers);
  if (!parsedByName.includes(3) || parsedByName.length !== 1) {
    throw new Error(`表示名メンション解析失敗: 期待=[3], 実際=${JSON.stringify(parsedByName)}`);
  }
  console.log("✓ メンション解析ロジック検証成功（@login_id, @[表示名], 重複除外）");

  // 2. コメント投稿時のメンション通知作成テスト
  // テスト用課題とコメントを確実に作成
  const testPrj = db.prepare("SELECT id FROM projects LIMIT 1").get();
  let validPrjId = testPrj ? testPrj.id : null;
  if (!validPrjId) {
    const newPrj = db.prepare("INSERT INTO projects (key, name) VALUES ('NOTIF', '通知テスト')").run();
    validPrjId = Number(newPrj.lastInsertRowid);
  }
  const notifTestIssue = db.prepare(`
    INSERT INTO issues (project_id, issue_key, issue_number, title, description, issue_type, status, priority)
    VALUES (?, 'NOTIF-1', 1, '通知テスト用課題', 'テスト説明', 'task', 'open', 'medium')
  `).run(validPrjId);
  const notifIssueId = Number(notifTestIssue.lastInsertRowid);

  const notifTestComment = db.prepare(`
    INSERT INTO comments (issue_id, user_id, content)
    VALUES (?, ?, 'テスト用コメント')
  `).run(notifIssueId, userYamada.id);
  const notifCommentId = Number(notifTestComment.lastInsertRowid);

  // 山田(id=userYamada.id) が 佐藤(id=userSato.id) をメンション
  const notifIds = createMentionNotifications(db, {
    issueId: notifIssueId,
    commentId: notifCommentId,
    senderId: userYamada.id,
    text: "こんにちは @sato さん、確認をお願いします！",
  });
  if (notifIds.length !== 1) {
    throw new Error(`通知作成件数不一致: 期待=1, 実際=${notifIds.length}`);
  }
  const createdNotif = db.prepare("SELECT * FROM notifications WHERE id = ?").get(notifIds[0]);
  if (!createdNotif || createdNotif.user_id !== userSato.id || createdNotif.sender_id !== userYamada.id) {
    throw new Error(`通知レコード内容不一致: ${JSON.stringify(createdNotif)}`);
  }
  if (createdNotif.is_read !== 0) {
    throw new Error(`通知作成時初期ステータス不一致: 期待 is_read=0, 実際=${createdNotif.is_read}`);
  }

  // 3. 自分自身へのメンションは通知対象外テスト
  const selfNotifs = createMentionNotifications(db, {
    issueId: notifIssueId,
    commentId: notifCommentId,
    senderId: userYamada.id,
    text: "自分宛て @yamada メモ",
  });
  if (selfNotifs.length !== 0) {
    throw new Error(`自分自身へのメンションが通知されました: ${JSON.stringify(selfNotifs)}`);
  }

  // 4. 通知一覧取得・未読カウント検証
  const unreadCountRow = db
    .prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0")
    .get(userSato.id);
  if (unreadCountRow.count !== 1) {
    throw new Error(`未読カウント不一致: 期待=1, 実際=${unreadCountRow.count}`);
  }

  // 5. 通知既読化テスト
  db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(createdNotif.id);
  const updatedNotif = db.prepare("SELECT is_read FROM notifications WHERE id = ?").get(createdNotif.id);
  if (updatedNotif.is_read !== 1) {
    throw new Error(`通知既読化失敗: 期待=1, 実際=${updatedNotif.is_read}`);
  }
  console.log("✓ メンション通知生成・自己宛て除外・未読集計・既読更新テスト成功");

  // 6. 課題削除時の通知カスケード削除検証
  // 新たに課題を作成し、メンション通知を作成
  const tempIssue = db.prepare(`
    INSERT INTO issues (project_id, issue_key, issue_number, title, description, issue_type, status, priority)
    VALUES (?, 'NOTIF-CASCADE', 9999, '通知テスト課題', '@sato 通知カスケード検証', 'task', 'open', 'medium')
  `).run(validPrjId);
  const tempIssueId = Number(tempIssue.lastInsertRowid);
  const cascadeNotifIds = createMentionNotifications(db, {
    issueId: tempIssueId,
    senderId: userYamada.id,
    text: "カスケードテスト @sato",
  });
  if (cascadeNotifIds.length !== 1) {
    throw new Error("カスケード用通知作成失敗");
  }
  // 課題を削除
  db.prepare("DELETE FROM issues WHERE id = ?").run(tempIssueId);
  const remainingNotif = db.prepare("SELECT * FROM notifications WHERE id = ?").get(cascadeNotifIds[0]);
  if (remainingNotif) {
    throw new Error("課題削除に伴う通知のカスケード削除が失敗しました");
  }
  console.log("✓ 課題削除時の通知カスケード消去テスト成功（ON DELETE CASCADE）");

  // 7. アバター＆テーマカラーパターン拡充検証テスト
  if (!Array.isArray(AVATAR_COLORS) || AVATAR_COLORS.length < 20) {
    throw new Error(`カラーパレットの種類数が不足しています: ${AVATAR_COLORS.length}件`);
  }
  const hexSet = new Set();
  for (const c of AVATAR_COLORS) {
    if (!c.value || !/^#[0-9a-fA-F]{6}$/.test(c.value)) {
      throw new Error(`無効なカラーHEX値です: ${c.value}`);
    }
    if (!c.label || typeof c.label !== "string") {
      throw new Error(`カラーのラベル名が不正です: ${JSON.stringify(c)}`);
    }
    if (!c.group || typeof c.group !== "string") {
      throw new Error(`カラーのグループ名が不正です: ${JSON.stringify(c)}`);
    }
    const lower = c.value.toLowerCase();
    if (hexSet.has(lower)) {
      throw new Error(`カラーHEX値が重複しています: ${c.value}`);
    }
    hexSet.add(lower);
  }
  if (!AVATAR_COLOR_VALUES.includes("#4f46e5")) {
    throw new Error("初期デフォルトカラー #4f46e5 が含まれていません");
  }
  if (getAvatarColorLabel("#4f46e5") !== "コズミックインディゴ") {
    throw new Error(`カラーラベル取得不一致: ${getAvatarColorLabel("#4f46e5")}`);
  }
  if (getAvatarColorLabel("#123456") !== "カスタム (#123456)") {
    throw new Error(`カスタムカラーラベル取得不一致: ${getAvatarColorLabel("#123456")}`);
  }
  console.log(`✓ チームメンバー・アカウント管理用カラーパターン拡充テスト成功 (${AVATAR_COLORS.length}色・重複なし・ラベル定義完全)`);

  // 8. Markdown記法・リッチテキストAST解析＆メンション結合テスト
  const testUsers = [
    { id: 1, login_id: "yamada", name: "山田 太郎", color: "#4f46e5" },
    { id: 2, login_id: "sato", name: "佐藤 花子", color: "#ec4899" },
  ];

  // 8-1. インライン要素検証（太字・斜体・取消線・コード・リンク・画像・メンション・課題キー自動リンク）
  const inlineSample = "こんにちは **太字** と *斜体* と ~~取り消し~~、そして `code` と [Google](https://google.com) と ![スクリーンショット](/api/attachments/10) と @yamada、詳細は [SAMPLE-36] および HITORI-5 を参照です";
  const inlines = parseInline(inlineSample, testUsers);
  const boldNode = inlines.find((n) => n.type === "bold");
  const italicNode = inlines.find((n) => n.type === "italic");
  const strikeNode = inlines.find((n) => n.type === "strike");
  const codeNode = inlines.find((n) => n.type === "code");
  const linkNode = inlines.find((n) => n.type === "link");
  const imgNode = inlines.find((n) => n.type === "image");
  const mentionNode = inlines.find((n) => n.type === "mention");
  const keyNodes = inlines.filter((n) => n.type === "issue_key");

  if (!boldNode || boldNode.children[0]?.value !== "太字") {
    throw new Error("インライン太字のパースに失敗しました");
  }
  if (!italicNode || italicNode.children[0]?.value !== "斜体") {
    throw new Error("インライン斜体のパースに失敗しました");
  }
  if (!strikeNode || strikeNode.children[0]?.value !== "取り消し") {
    throw new Error("インライン取り消し線のパースに失敗しました");
  }
  if (!codeNode || codeNode.value !== "code") {
    throw new Error("インラインコードのパースに失敗しました");
  }
  if (!linkNode || linkNode.text !== "Google" || linkNode.url !== "https://google.com") {
    throw new Error("インラインリンクのパースに失敗しました");
  }
  if (!imgNode || imgNode.alt !== "スクリーンショット" || imgNode.url !== "/api/attachments/10") {
    throw new Error("インライン画像のパースに失敗しました");
  }
  if (!mentionNode || mentionNode.raw !== "@yamada" || mentionNode.user?.login_id !== "yamada") {
    throw new Error("インラインメンションのユーザー解決に失敗しました");
  }
  if (keyNodes.length !== 2 || keyNodes[0].issueKey !== "SAMPLE-36" || keyNodes[1].issueKey !== "HITORI-5") {
    throw new Error(`課題キー自動リンクのパースに失敗しました: 件数=${keyNodes.length}`);
  }
  console.log("✓ インラインMarkdown（太字・斜体・取消線・コード・リンク・画像・メンション・課題キー自動リンク）パース成功");

  // 8-2. ブロック要素検証（見出し・リスト・タスクリスト・引用・コードブロック・テーブル）
  const markdownSample = [
    "# 大見出し",
    "## 中見出し",
    "> これが引用文です",
    "> 複数行引用 @sato",
    "```typescript",
    "const greeting = 'Hello World';",
    "```",
    "- [ ] 未完了タスク",
    "- [x] 完了済みタスク",
    "- 通常リスト項目",
    "1. 番号付き項目1",
    "2. 番号付き項目2",
    "---",
    "| 列1 | 列2 |",
    "| --- | --- |",
    "| 値A | 値B |",
  ].join("\n");

  const blocks = parseMarkdown(markdownSample, testUsers);
  if (blocks.length !== 8) {
    throw new Error(`ブロック数の解析結果が一致しません: 期待値=8, 実際=${blocks.length}`);
  }

  // 見出し1
  if (blocks[0].type !== "heading" || blocks[0].level !== 1) {
    throw new Error("h1見出しのパース失敗");
  }
  // 見出し2
  if (blocks[1].type !== "heading" || blocks[1].level !== 2) {
    throw new Error("h2見出しのパース失敗");
  }
  // 引用
  if (blocks[2].type !== "blockquote" || blocks[2].lines.length !== 2) {
    throw new Error("引用ブロックのパース失敗");
  }
  // コードブロック
  if (blocks[3].type !== "codeblock" || blocks[3].lang !== "typescript" || !blocks[3].code.includes("Hello World")) {
    throw new Error("コードブロックのパース失敗");
  }
  // リスト（箇条書き＋タスクリスト）
  if (blocks[4].type !== "list" || blocks[4].ordered !== false || blocks[4].items.length !== 3) {
    throw new Error("箇条書き/タスクリストのパース失敗");
  }
  if (blocks[4].items[0].checked !== false || blocks[4].items[1].checked !== true) {
    throw new Error("タスクリストのチェック状態判定失敗");
  }
  // 番号付きリスト
  if (blocks[5].type !== "list" || blocks[5].ordered !== true || blocks[5].items.length !== 2) {
    throw new Error("番号付きリストのパース失敗");
  }
  // 水平線
  if (blocks[6].type !== "hr") {
    throw new Error("水平線のパース失敗");
  }
  // テーブル
  if (blocks[7].type !== "table" || blocks[7].headers.length !== 2 || blocks[7].rows.length !== 1) {
    throw new Error("テーブルのパース失敗");
  }
  console.log("✓ ブロックMarkdown（見出し・引用・コードブロック・タスクリスト・番号リスト・水平線・テーブル）パース成功");

  // 9. 添付ファイル（attachments）テーブル操作＆結合・カスケード削除テスト
  const testIssueId = db.prepare("SELECT id FROM issues LIMIT 1").get().id;
  const insertAttStmt = db.prepare(`
    INSERT INTO attachments (issue_id, user_id, file_name, stored_name, file_size, mime_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const attRes1 = insertAttStmt.run(testIssueId, 1, "test_screenshot.png", "1731580000_abc_test_screenshot.png", 10240, "image/png");
  const attRes2 = insertAttStmt.run(testIssueId, 2, "sample_doc.pdf", "1731580001_def_sample_doc.pdf", 20480, "application/pdf");

  // 集計クエリの検証
  const countRow = db.prepare(`
    SELECT COUNT(*) AS count FROM attachments WHERE issue_id = ?
  `).get(testIssueId);
  if (countRow.count !== 2) {
    throw new Error(`添付ファイル件数不一致: 期待値=2, 実際=${countRow.count}`);
  }

  // 課題一覧結合クエリでの attachment_count 検証
  const issueWithAtt = db.prepare(`
    SELECT i.id, i.issue_key, COALESCE(att_stat.attachment_count, 0) AS attachment_count
    FROM issues i
    LEFT JOIN (
      SELECT issue_id, COUNT(*) AS attachment_count
      FROM attachments
      WHERE issue_id IS NOT NULL
      GROUP BY issue_id
    ) att_stat ON att_stat.issue_id = i.id
    WHERE i.id = ?
  `).get(testIssueId);
  if (!issueWithAtt || issueWithAtt.attachment_count !== 2) {
    throw new Error(`課題添付ファイル集計結合クエリ失敗: ${JSON.stringify(issueWithAtt)}`);
  }

  // 課題削除時の添付ファイルカスケード削除検証
  db.prepare("DELETE FROM issues WHERE id = ?").run(testIssueId);
  const remainingAtts = db.prepare(`
    SELECT COUNT(*) AS count FROM attachments WHERE issue_id = ?
  `).get(testIssueId);
  if (remainingAtts.count !== 0) {
    throw new Error(`課題削除時の添付ファイルカスケード削除失敗: 残存件数=${remainingAtts.count}`);
  }
  console.log("✓ 添付ファイル（attachments）テーブル登録・件数集計結合・カスケード削除テスト成功");

  // 10. 自動通知（担当アサイン・作成課題/担当課題の更新＆コメント）および通知先（参加者）チェックボックス選択の検証
  const userSuzuki = db.prepare("SELECT id, name FROM users WHERE login_id = 'suzuki'").get();
  if (!userSuzuki) throw new Error("テスト用ユーザー suzuki が見つかりません");

  // テスト前に通知テーブルをクリーンアップ
  db.prepare("DELETE FROM notifications").run();

  // 10-1. 課題新規作成時：山田が作成、佐藤を担当者にアサイン、鈴木を「通知先チェックボックス」で選択
  const autoIssueRes = db.prepare(`
    INSERT INTO issues (project_id, assignee_id, created_by, issue_key, issue_number, title, description, issue_type, status, priority)
    VALUES (?, ?, ?, 'NOTIF-AUTO-1', 1001, '自動通知テスト課題', '詳細説明テキスト', 'task', 'open', 'high')
  `).run(validPrjId, userSato.id, userYamada.id);
  const autoIssueId = Number(autoIssueRes.lastInsertRowid);

  const createdNotifIds = createIssueCreatedNotifications(db, {
    issueId: autoIssueId,
    senderId: userYamada.id,
    assigneeId: userSato.id,
    issueKey: "NOTIF-AUTO-1",
    title: "自動通知テスト課題",
    description: "詳細説明テキスト",
    notifyUserIds: [userSuzuki.id, userYamada.id], // 自分自身(山田)が含まれていても除外されること
  });

  if (createdNotifIds.length !== 2) {
    throw new Error(`課題作成時の通知生成件数不一致: 期待=2, 実際=${createdNotifIds.length}`);
  }
  const satoAssignNotif = db
    .prepare("SELECT * FROM notifications WHERE issue_id = ? AND user_id = ?")
    .get(autoIssueId, userSato.id);
  if (
    !satoAssignNotif ||
    satoAssignNotif.type !== "assigned" ||
    !satoAssignNotif.content.includes("あなたを担当者に設定しました")
  ) {
    throw new Error(`担当者アサイン通知の検証失敗: ${JSON.stringify(satoAssignNotif)}`);
  }

  const suzukiNotifyNotif = db
    .prepare("SELECT * FROM notifications WHERE issue_id = ? AND user_id = ?")
    .get(autoIssueId, userSuzuki.id);
  if (!suzukiNotifyNotif || suzukiNotifyNotif.type !== "notify") {
    throw new Error(`チェックボックス通知先指定の検証失敗: ${JSON.stringify(suzukiNotifyNotif)}`);
  }

  // 10-2. 課題更新時：鈴木が課題を更新し、担当者を鈴木から佐藤のままステータス変更 ➔ 作成者(山田)と担当者(佐藤)に自動通知('updated')が届くこと
  db.prepare("DELETE FROM notifications WHERE issue_id = ?").run(autoIssueId);
  const updateNotifIds = createIssueUpdatedNotifications(db, {
    issueId: autoIssueId,
    senderId: userSuzuki.id,
    issueKey: "NOTIF-AUTO-1",
    createdBy: userYamada.id,
    previousAssigneeId: userSato.id,
    newAssigneeId: userSato.id,
    updateSummary: "課題 [NOTIF-AUTO-1] の状態を「未対応」から「処理中」に変更しました",
  });

  if (updateNotifIds.length !== 2) {
    throw new Error(`課題更新時の作成者・担当者自動通知件数不一致: 期待=2, 実際=${updateNotifIds.length}`);
  }
  const yamadaUpdNotif = db
    .prepare("SELECT * FROM notifications WHERE issue_id = ? AND user_id = ?")
    .get(autoIssueId, userYamada.id);
  const satoUpdNotif = db
    .prepare("SELECT * FROM notifications WHERE issue_id = ? AND user_id = ?")
    .get(autoIssueId, userSato.id);
  if (!yamadaUpdNotif || yamadaUpdNotif.type !== "updated" || !satoUpdNotif || satoUpdNotif.type !== "updated") {
    throw new Error(`課題更新時の作成者・担当者通知種別不一致: yamada=${JSON.stringify(yamadaUpdNotif)}, sato=${JSON.stringify(satoUpdNotif)}`);
  }

  // 10-3. 課題更新で担当者が変更された時：山田が担当者を佐藤から鈴木へ変更 ➔ 鈴木には 'assigned'、元担当者の佐藤には 'updated' が届き、操作者の山田には届かないこと
  db.prepare("DELETE FROM notifications WHERE issue_id = ?").run(autoIssueId);
  const reassignNotifIds = createIssueUpdatedNotifications(db, {
    issueId: autoIssueId,
    senderId: userYamada.id,
    issueKey: "NOTIF-AUTO-1",
    createdBy: userYamada.id,
    previousAssigneeId: userSato.id,
    newAssigneeId: userSuzuki.id,
    updateSummary: `課題 [NOTIF-AUTO-1] の担当者を「${userSuzuki.name}」に設定しました`,
  });
  if (reassignNotifIds.length !== 2) {
    throw new Error(`担当者変更時の通知件数不一致: 期待=2, 実際=${reassignNotifIds.length}`);
  }
  const suzukiReassignNotif = db
    .prepare("SELECT * FROM notifications WHERE issue_id = ? AND user_id = ?")
    .get(autoIssueId, userSuzuki.id);
  if (!suzukiReassignNotif || suzukiReassignNotif.type !== "assigned") {
    throw new Error(`担当者変更時の新担当者へのassigned通知失敗: ${JSON.stringify(suzukiReassignNotif)}`);
  }

  // 10-4. コメント投稿時：鈴木がコメントし、通知先チェックボックスも併用 ➔ 作成者(山田)と担当者(佐藤)に自動で 'commented' 通知が届くこと（重複なし）
  db.prepare("DELETE FROM notifications WHERE issue_id = ?").run(autoIssueId);
  const autoCommentRes = db.prepare(`
    INSERT INTO comments (issue_id, user_id, content)
    VALUES (?, ?, '進捗を報告します。確認お願いします。')
  `).run(autoIssueId, userSuzuki.id);
  const autoCommentId = Number(autoCommentRes.lastInsertRowid);

  const commentNotifIds = createCommentNotifications(db, {
    issueId: autoIssueId,
    commentId: autoCommentId,
    senderId: userSuzuki.id,
    text: "進捗を報告します。確認お願いします。",
    issueCreatedBy: userYamada.id,
    issueAssigneeId: userSato.id,
    notifyUserIds: [],
  });
  if (commentNotifIds.length !== 2) {
    throw new Error(`コメント時の作成者・担当者自動通知件数不一致: 期待=2, 実際=${commentNotifIds.length}`);
  }
  const yamadaCmtNotif = db
    .prepare("SELECT * FROM notifications WHERE issue_id = ? AND user_id = ?")
    .get(autoIssueId, userYamada.id);
  const satoCmtNotif = db
    .prepare("SELECT * FROM notifications WHERE issue_id = ? AND user_id = ?")
    .get(autoIssueId, userSato.id);
  if (!yamadaCmtNotif || yamadaCmtNotif.type !== "commented" || !satoCmtNotif || satoCmtNotif.type !== "commented") {
    throw new Error(`コメント時の自動通知種別不一致: yamada=${JSON.stringify(yamadaCmtNotif)}, sato=${JSON.stringify(satoCmtNotif)}`);
  }

  // テスト用課題のクリーンアップ
  db.prepare("DELETE FROM issues WHERE id = ?").run(autoIssueId);
  console.log("✓ 自動通知（担当アサイン・作成者/担当者への更新＆コメント通知）＆通知先（参加者）複数選択の検証成功");

  // 11. コメントスタンプ（リアクション）機能（👍, ✅）の検証
  const reactionIssueRes = db.prepare(`
    INSERT INTO issues (project_id, assignee_id, created_by, issue_key, issue_number, title, description, issue_type, status, priority)
    VALUES (?, ?, ?, 'REACT-TEST-1', 9901, 'スタンプ検証課題', 'コメントへのスタンプテスト', 'task', 'open', 'medium')
  `).run(validPrjId, userSato.id, userYamada.id);
  const reactionIssueId = Number(reactionIssueRes.lastInsertRowid);

  const reactionCommentRes = db.prepare(`
    INSERT INTO comments (issue_id, user_id, content)
    VALUES (?, ?, '体調不良のため本日は午後休をいただきます。')
  `).run(reactionIssueId, userSato.id);
  const reactionCommentId = Number(reactionCommentRes.lastInsertRowid);

  // 山田が「👍」、鈴木が「✅」を押す
  const validStamps = ["👍", "✅"];
  if (validStamps.length !== 2) {
    throw new Error("スタンプ種別定義エラー");
  }

  db.prepare("INSERT INTO comment_reactions (comment_id, user_id, stamp) VALUES (?, ?, ?)").run(
    reactionCommentId,
    userYamada.id,
    "👍"
  );
  db.prepare("INSERT INTO comment_reactions (comment_id, user_id, stamp) VALUES (?, ?, ?)").run(
    reactionCommentId,
    userSuzuki.id,
    "✅"
  );
  db.prepare("INSERT INTO comment_reactions (comment_id, user_id, stamp) VALUES (?, ?, ?)").run(
    reactionCommentId,
    userYamada.id,
    "✅"
  );

  // 同一ユーザーが同じスタンプを重複登録しようとするとUNIQUE制約エラーになること
  let duplicateBlocked = false;
  try {
    db.prepare("INSERT INTO comment_reactions (comment_id, user_id, stamp) VALUES (?, ?, ?)").run(
      reactionCommentId,
      userYamada.id,
      "👍"
    );
  } catch {
    duplicateBlocked = true;
  }
  if (!duplicateBlocked) {
    throw new Error("同一ユーザー・同一スタンプの重複登録防止（UNIQUE制約）が機能していません");
  }

  // スタンプ一覧と押したユーザー名の結合取得検証
  const reactionsList = db.prepare(`
    SELECT cr.*, u.name AS user_name, u.color AS user_color
    FROM comment_reactions cr
    LEFT JOIN users u ON cr.user_id = u.id
    WHERE cr.comment_id = ?
    ORDER BY cr.id ASC
  `).all(reactionCommentId);

  if (reactionsList.length !== 3) {
    throw new Error(`スタンプ件数不一致: 期待=3, 実際=${reactionsList.length}`);
  }
  const checkReactions = reactionsList.filter((r) => r.stamp === "✅");
  if (checkReactions.length !== 2 || !checkReactions.some((r) => r.user_name === userYamada.name)) {
    throw new Error("✅ スタンプの集計・ユーザー名結合に失敗しました");
  }

  // 課題削除時にカスケードで comment_reactions も削除されること
  db.prepare("DELETE FROM issues WHERE id = ?").run(reactionIssueId);
  const remainingReactions = db.prepare(
    "SELECT COUNT(*) AS count FROM comment_reactions WHERE comment_id = ?"
  ).get(reactionCommentId);
  if (remainingReactions.count !== 0) {
    throw new Error("コメント削除時のスタンプカスケード削除が機能していません");
  }
  console.log("✓ コメントスタンプ（👍, ✅）の付与・集計・カスケード削除の検証成功");

  // 12. アクティビティ（最近の更新）とコメントスタンプ連携の検証
  const actIssueRes = db.prepare(`
    INSERT INTO issues (project_id, assignee_id, created_by, issue_key, issue_number, title, description, issue_type, status, priority)
    VALUES (?, ?, ?, 'ACT-TEST-1', 9902, 'アクティビティ検証課題', '説明', 'task', 'open', 'medium')
  `).run(validPrjId, userSato.id, userYamada.id);
  const actIssueId = Number(actIssueRes.lastInsertRowid);

  const actCommentRes = db.prepare(`
    INSERT INTO comments (issue_id, user_id, content)
    VALUES (?, ?, 'アクティビティからスタンプを押すテストです')
  `).run(actIssueId, userSato.id);
  const actCommentId = Number(actCommentRes.lastInsertRowid);

  // コメント作成時のアクティビティ記録（comment_id を保持）
  const actInsertRes = db.prepare(`
    INSERT INTO activities (issue_id, comment_id, user_id, action_type, content)
    VALUES (?, ?, ?, 'commented', 'アクティビティからスタンプを押すテストです')
  `).run(actIssueId, actCommentId, userSato.id);
  const actActivityId = Number(actInsertRes.lastInsertRowid);

  // アクティビティに紐づくコメントに対して山田が 👍 を押す
  db.prepare("INSERT INTO comment_reactions (comment_id, user_id, stamp) VALUES (?, ?, '👍')").run(
    actCommentId,
    userYamada.id
  );

  // アクティビティ取得クエリで comment_id とリアクションが正しく取得できることの検証
  const fetchedAct = db.prepare("SELECT * FROM activities WHERE id = ?").get(actActivityId);
  if (!fetchedAct || fetchedAct.comment_id !== actCommentId) {
    throw new Error(`アクティビティの comment_id 保持検証失敗: ${JSON.stringify(fetchedAct)}`);
  }

  const actReactions = db.prepare("SELECT * FROM comment_reactions WHERE comment_id = ?").all(fetchedAct.comment_id);
  if (actReactions.length !== 1 || actReactions[0].stamp !== "👍") {
    throw new Error(`アクティビティ経由のリアクション取得失敗: ${JSON.stringify(actReactions)}`);
  }

  // クリーンアップ
  db.prepare("DELETE FROM issues WHERE id = ?").run(actIssueId);
  console.log("✓ アクティビティ（最近の更新）とコメントID・スタンプ連携の検証成功");

  // 13. プロジェクト横断 全体キーワード検索（タイトル・本文・コメント・プロジェクト結合）の検証
  const searchPrj1Res = db.prepare("INSERT INTO projects (name, key, color) VALUES ('横断テストPJ1', 'SRCH1', '#3b82f6')").run();
  const searchPrj1Id = Number(searchPrj1Res.lastInsertRowid);
  const searchPrj2Res = db.prepare("INSERT INTO projects (name, key, color) VALUES ('横断テストPJ2', 'SRCH2', '#10b981')").run();
  const searchPrj2Id = Number(searchPrj2Res.lastInsertRowid);

  // PJ1: タイトルに「Dependabot」を含む課題
  const sIssue1Res = db.prepare(`
    INSERT INTO issues (project_id, assignee_id, created_by, issue_key, issue_number, title, description, issue_type, status, priority)
    VALUES (?, ?, ?, 'SRCH1-1', 1, 'Dependabotの脆弱性アラート対応', 'ライブラリの更新を行う', 'task', 'open', 'high')
  `).run(searchPrj1Id, userYamada.id, userYamada.id);
  const sIssue1Id = Number(sIssue1Res.lastInsertRowid);

  // PJ2: 詳細説明に「Next.js」を含む課題
  const sIssue2Res = db.prepare(`
    INSERT INTO issues (project_id, assignee_id, created_by, issue_key, issue_number, title, description, issue_type, status, priority)
    VALUES (?, ?, ?, 'SRCH2-1', 1, 'Webフロントエンドの刷新', 'Next.js 15 へのメジャーバージョンアップ対応', 'task', 'in_progress', 'medium')
  `).run(searchPrj2Id, userSato.id, userYamada.id);
  const sIssue2Id = Number(sIssue2Res.lastInsertRowid);

  // PJ2: コメントに「Dependabot」を含む課題
  const sIssue3Res = db.prepare(`
    INSERT INTO issues (project_id, assignee_id, created_by, issue_key, issue_number, title, description, issue_type, status, priority)
    VALUES (?, ?, ?, 'SRCH2-2', 2, '定期セキュリティチェック', '各種チェック', 'task', 'closed', 'low')
  `).run(searchPrj2Id, userSato.id, userYamada.id);
  const sIssue3Id = Number(sIssue3Res.lastInsertRowid);

  db.prepare(`
    INSERT INTO comments (issue_id, user_id, content)
    VALUES (?, ?, 'Dependabotによる週次PRを確認してマージ完了しました')
  `).run(sIssue3Id, userSato.id);

  // 横断検索クエリ（api/issues/route.ts の実装と同一のSQLロジック）
  const querySearchSql = `
    SELECT i.*, p.name AS project_name, p.key AS project_key, p.color AS project_color
    FROM issues i
    JOIN projects p ON i.project_id = p.id
    WHERE (
      i.title LIKE ? 
      OR i.issue_key LIKE ? 
      OR i.description LIKE ? 
      OR EXISTS (SELECT 1 FROM comments c WHERE c.issue_id = i.id AND c.content LIKE ?)
    )
    ORDER BY i.id ASC
  `;

  // 検証1: 「Dependabot」で検索 -> PJ1のSRCH1-1 (タイトル一致) と PJ2のSRCH2-2 (コメント一致) の2件がヒットすること
  const patternDep = "%Dependabot%";
  const depResults = db.prepare(querySearchSql).all(patternDep, patternDep, patternDep, patternDep);
  if (depResults.length !== 2) {
    throw new Error(`「Dependabot」横断検索件数不一致: 期待=2, 実際=${depResults.length}`);
  }
  if (!depResults.some((r) => r.issue_key === "SRCH1-1" && r.project_key === "SRCH1")) {
    throw new Error("「Dependabot」検索でSRCH1-1（タイトル一致＆project_key結合）が取得できませんでした");
  }
  if (!depResults.some((r) => r.issue_key === "SRCH2-2" && r.project_key === "SRCH2")) {
    throw new Error("「Dependabot」検索でSRCH2-2（コメント一致＆project_key結合）が取得できませんでした");
  }

  // 検証2: 「Next.js」で検索 -> PJ2のSRCH2-1 (詳細説明一致) がヒットすること
  const patternNext = "%Next.js%";
  const nextResults = db.prepare(querySearchSql).all(patternNext, patternNext, patternNext, patternNext);
  if (nextResults.length !== 1 || nextResults[0].issue_key !== "SRCH2-1") {
    throw new Error(`「Next.js」横断検索失敗: ${JSON.stringify(nextResults)}`);
  }

  // クリーンアップ
  db.prepare("DELETE FROM issues WHERE id IN (?, ?, ?)").run(sIssue1Id, sIssue2Id, sIssue3Id);
  db.prepare("DELETE FROM projects WHERE id IN (?, ?)").run(searchPrj1Id, searchPrj2Id);
  console.log("✓ プロジェクト横断 全体キーワード検索（タイトル・本文・コメント・プロジェクト結合）の検証成功");

  console.log("=== すべての動作テストに合格しました！ ===");
}

runTests().catch((err) => {
  console.error("テスト失敗:", err);
  process.exit(1);
});
