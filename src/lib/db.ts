// データベース接続および初期化処理
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { isSafeStoredAttachmentName } from "@/lib/attachmentPolicy";

// データベースファイルの保存先パス（環境変数 LITELOG_DB_PATH で切り替え可能）
const DB_DIR = path.join(process.cwd(), "data");
const DEFAULT_DB_FILENAME = "litelog.db";
const DB_PATH =
  process.env.LITELOG_DB_PATH ||
  process.env.BACKLOG_DB_PATH ||
  path.join(DB_DIR, DEFAULT_DB_FILENAME);

// 添付ファイル（画像等）の実体保存先ディレクトリ
export const ATTACHMENTS_DIR =
  process.env.LITELOG_ATTACHMENTS_DIR ||
  process.env.BACKLOG_ATTACHMENTS_DIR ||
  path.join(DB_DIR, "attachments");

// ディレクトリが存在しない場合は作成（インメモリDB以外）
if (DB_PATH !== ":memory:" && !fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}
if (ATTACHMENTS_DIR && !fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

let dbInstance: DatabaseSync | null = null;
let isDbInitialized = false;

// シングルトンでデータベースインスタンスを取得
export function getDb(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    if (!isDbInitialized) {
      initDb(dbInstance);
      isDbInitialized = true;
    }
  }
  return dbInstance;
}

// テーブル作成および初期データの投入（デプロイ時スクリプトからも呼び出し可能）
export function initDb(db: DatabaseSync) {
  // 外部キー制約・WALモード・ビジータイムアウトの有効化
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");

  // ユーザー（チームメンバー）テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login_id TEXT UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'メンバー',
      is_admin INTEGER NOT NULL DEFAULT 0,
      role_type TEXT NOT NULL DEFAULT 'member',
      color TEXT NOT NULL DEFAULT '#4f46e5',
      week_start TEXT NOT NULL DEFAULT 'monday',
      show_holidays INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // users テーブルのマイグレーション（is_admin / role_type / login_id / password カラム追加 ＆ 初期メンバーのID・権限設定）
  try {
    const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    if (!userCols.some((col) => col.name === "is_admin")) {
      db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;");
    }
    if (!userCols.some((col) => col.name === "role_type")) {
      db.exec("ALTER TABLE users ADD COLUMN role_type TEXT NOT NULL DEFAULT 'member';");
      db.exec("UPDATE users SET role_type = 'admin' WHERE is_admin = 1;");
    }
    if (!userCols.some((col) => col.name === "login_id")) {
      db.exec("ALTER TABLE users ADD COLUMN login_id TEXT;");
    }
    if (!userCols.some((col) => col.name === "password")) {
      db.exec("ALTER TABLE users ADD COLUMN password TEXT NOT NULL DEFAULT '';");
    }
    if (!userCols.some((col) => col.name === "week_start")) {
      db.exec("ALTER TABLE users ADD COLUMN week_start TEXT NOT NULL DEFAULT 'monday';");
    }
    if (!userCols.some((col) => col.name === "show_holidays")) {
      db.exec("ALTER TABLE users ADD COLUMN show_holidays INTEGER NOT NULL DEFAULT 1;");
    }
    if (!userCols.some((col) => col.name === "totp_secret")) {
      db.exec("ALTER TABLE users ADD COLUMN totp_secret TEXT;");
    }
    if (!userCols.some((col) => col.name === "totp_enabled")) {
      db.exec("ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;");
    }
    if (!userCols.some((col) => col.name === "totp_last_used_step")) {
      db.exec("ALTER TABLE users ADD COLUMN totp_last_used_step INTEGER;");
    }

    // is_admin=1 のユーザーは常に role_type='admin' となるよう整合性を維持
    db.exec("UPDATE users SET role_type = 'admin' WHERE is_admin = 1 AND role_type != 'admin';");

    // その他login_idが未設定のユーザーにユニークなlogin_idを補完
    db.prepare(`
      UPDATE users
      SET login_id = 'user' || id
      WHERE login_id IS NULL OR login_id = ''
    `).run();

    // デモ用アカウント（yamada, sato, suzuki）が存在する場合は削除し、本番用初期セットアップ画面へ移行
    try {
      const demoMigrated = db.prepare("SELECT value FROM settings WHERE key = 'migrated_remove_demo_users'").get();
      if (!demoMigrated) {
        db.prepare("DELETE FROM users WHERE login_id IN ('yamada', 'sato', 'suzuki')").run();
        db.prepare(`
          INSERT INTO settings (key, value, updated_at)
          VALUES ('migrated_remove_demo_users', '1', CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = CURRENT_TIMESTAMP
        `).run();
      }
    } catch (demoErr) {
      console.error("デモアカウント削除マイグレーションエラー:", demoErr);
    }
  } catch (migErr) {
    console.error("users テーブルのマイグレーション確認エラー:", migErr);
  }

  // プロジェクトテーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#4f46e5',
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // projects テーブルのマイグレーション（is_archived カラム追加）
  try {
    const projCols = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
    if (!projCols.some((col) => col.name === "is_archived")) {
      db.exec("ALTER TABLE projects ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;");
    }
  } catch (projMigErr) {
    console.error("projects テーブルのマイグレーション確認エラー:", projMigErr);
  }

  // 課題テーブル
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

  // 既存テーブルへのカラム追加マイグレーション
  try {
    const tableInfo = db.prepare("PRAGMA table_info(issues)").all() as { name: string }[];
    const hasStartDate = tableInfo.some((col) => col.name === "start_date");
    if (!hasStartDate) {
      db.exec("ALTER TABLE issues ADD COLUMN start_date TEXT;");
    }
    const hasParentId = tableInfo.some((col) => col.name === "parent_id");
    if (!hasParentId) {
      db.exec("ALTER TABLE issues ADD COLUMN parent_id INTEGER REFERENCES issues(id) ON DELETE SET NULL;");
    }
    const hasAssigneeId = tableInfo.some((col) => col.name === "assignee_id");
    if (!hasAssigneeId) {
      db.exec("ALTER TABLE issues ADD COLUMN assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL;");
    }
    const hasCreatedBy = tableInfo.some((col) => col.name === "created_by");
    if (!hasCreatedBy) {
      db.exec("ALTER TABLE issues ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;");
    }
    const hasResolution = tableInfo.some((col) => col.name === "resolution");
    if (!hasResolution) {
      db.exec("ALTER TABLE issues ADD COLUMN resolution TEXT;");
    }
    // 未完了（完了以外）の課題に誤って完了理由が設定されている不整合データをクリーンアップ
    db.exec("UPDATE issues SET resolution = NULL WHERE status != 'closed' AND resolution IS NOT NULL;");
  } catch (migErr) {
    console.error("issues テーブルのカラムマイグレーション確認エラー:", migErr);
  }

  // コメントテーブル
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

  // comments テーブルのマイグレーション
  try {
    const commentCols = db.prepare("PRAGMA table_info(comments)").all() as { name: string }[];
    if (!commentCols.some((col) => col.name === "user_id")) {
      db.exec("ALTER TABLE comments ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;");
    }
    if (!commentCols.some((col) => col.name === "updated_at")) {
      db.exec("ALTER TABLE comments ADD COLUMN updated_at DATETIME;");
    }
  } catch (migErr) {
    console.error("comments テーブルのカラムマイグレーション確認エラー:", migErr);
  }

  // コメント編集履歴テーブル（過去バージョンの保持）
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

  // 最近の更新・アクティビティテーブル
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

  // activities テーブルのマイグレーション
  try {
    const activityCols = db.prepare("PRAGMA table_info(activities)").all() as { name: string }[];
    if (!activityCols.some((col) => col.name === "user_id")) {
      db.exec("ALTER TABLE activities ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;");
    }
    if (!activityCols.some((col) => col.name === "comment_id")) {
      db.exec("ALTER TABLE activities ADD COLUMN comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE;");
    }

    // 既存のコメントアクティビティで comment_id が未設定のものに該当するコメントIDを自動補完
    db.exec(`
      UPDATE activities
      SET comment_id = (
        SELECT c.id FROM comments c
        WHERE c.issue_id = activities.issue_id
          AND c.content = activities.content
        ORDER BY ABS(strftime('%s', c.created_at) - strftime('%s', activities.created_at)) ASC
        LIMIT 1
      )
      WHERE action_type = 'commented' AND comment_id IS NULL;
    `);
  } catch (migErr) {
    console.error("activities テーブルのカラムマイグレーション確認エラー:", migErr);
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

  // 添付ファイルテーブル（画像・ファイル管理）
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

  // システム設定（時刻・タイムゾーン・マイグレーションバージョン管理等）テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // プロジェクト参加メンバー（メンバーシップ）テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      pinned_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (project_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
  `);

  // project_members テーブルのマイグレーション（個人別ピン留めカラム追加）
  try {
    const pmCols = db.prepare("PRAGMA table_info(project_members)").all() as { name: string }[];
    if (!pmCols.some((col) => col.name === "is_pinned")) {
      db.exec("ALTER TABLE project_members ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;");
    }
    if (!pmCols.some((col) => col.name === "pinned_at")) {
      db.exec("ALTER TABLE project_members ADD COLUMN pinned_at DATETIME;");
    }
  } catch (pmMigErr) {
    console.error("project_members テーブルのマイグレーション確認エラー:", pmMigErr);
  }

  // 招待トークンテーブル（新規メンバーの初期パスワード手動手渡し解消・ワンタイム招待リンク）
  db.exec(`
    CREATE TABLE IF NOT EXISTS invitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
    CREATE INDEX IF NOT EXISTS idx_invitations_user_id ON invitations(user_id);
  `);

  // ログイン・2FA試行レート制限テーブル（総当たり攻撃対策・管理画面からのロック確認/解除用）
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_rate_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      identifier TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      failed_count INTEGER NOT NULL DEFAULT 0,
      first_failed_at TEXT,
      last_failed_at TEXT,
      locked_until TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(scope, identifier, ip_address)
    );
    CREATE INDEX IF NOT EXISTS idx_login_rate_limits_locked_until ON login_rate_limits(locked_until);
    CREATE INDEX IF NOT EXISTS idx_login_rate_limits_updated_at ON login_rate_limits(updated_at DESC);
  `);

  // セッション即時失効（ブラックリスト）テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_revocations (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_session_revocations_expires_at ON session_revocations(expires_at);

    -- プロジェクト別課題テンプレート
    CREATE TABLE IF NOT EXISTS issue_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_issue_templates_project ON issue_templates(project_id, sort_order ASC);
  `);

  // project_members の初期データ移行（初回のみ1回だけ実行。ユーザーによる脱退操作を勝手に上書き・再登録しないようにガード）
  try {
    const isMigrated = db
      .prepare("SELECT value FROM settings WHERE key = 'migrated_project_members_initial'")
      .get() as { value: string } | undefined;

    if (!isMigrated) {
      // 1. Adminは全プロジェクトに参加（PMOおよび一般メンバーは担当・参加プロジェクトのみ）
      db.exec(`
        INSERT OR IGNORE INTO project_members (project_id, user_id)
        SELECT p.id, u.id
        FROM projects p
        CROSS JOIN users u
        WHERE u.is_admin = 1 OR u.role_type = 'admin';
      `);

      // 2. 各プロジェクトの課題にアサインされているユーザーを登録
      db.exec(`
        INSERT OR IGNORE INTO project_members (project_id, user_id)
        SELECT DISTINCT i.project_id, i.assignee_id
        FROM issues i
        WHERE i.assignee_id IS NOT NULL;
      `);

      // 3. 各プロジェクトの課題を作成したユーザーを登録
      db.exec(`
        INSERT OR IGNORE INTO project_members (project_id, user_id)
        SELECT DISTINCT i.project_id, i.created_by
        FROM issues i
        WHERE i.created_by IS NOT NULL;
      `);

      // 4. 各プロジェクトの課題にコメントしたユーザーを登録
      db.exec(`
        INSERT OR IGNORE INTO project_members (project_id, user_id)
        SELECT DISTINCT i.project_id, c.user_id
        FROM comments c
        JOIN issues i ON c.issue_id = i.id
        WHERE c.user_id IS NOT NULL;
      `);

      db.prepare(
        "INSERT INTO settings (key, value, updated_at) VALUES ('migrated_project_members_initial', '1', CURRENT_TIMESTAMP)"
      ).run();
    }
  } catch (pmErr) {
    console.error("project_members 初期データ登録エラー:", pmErr);
  }

  // デフォルト設定の初期投入（未登録キーのみ）
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);
  insertSetting.run("timezone", "Asia/Tokyo");
  insertSetting.run("datetimeFormat", "slash_sec");
  insertSetting.run("hour12", "false");
  insertSetting.run("activityTimeStyle", "both");
  insertSetting.run("timeOffsetMinutes", "0");

  // 検索・結合高速化のためのインデックス作成
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_issues_project_status_updated ON issues(project_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_issues_assignee_id ON issues(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_issues_parent_id ON issues(parent_id);
    CREATE INDEX IF NOT EXISTS idx_issues_resolution ON issues(resolution);
    CREATE INDEX IF NOT EXISTS idx_issue_histories_issue_id ON issue_histories(issue_id);
    CREATE INDEX IF NOT EXISTS idx_comments_issue_id ON comments(issue_id);
    CREATE INDEX IF NOT EXISTS idx_comment_histories_comment_id ON comment_histories(comment_id);
    CREATE INDEX IF NOT EXISTS idx_activities_issue_id ON activities(issue_id);
    CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_issue_id ON notifications(issue_id);
  `);

  // 一度限りのデータマイグレーション（テーマカラー移行・アクティビティ文言移行・操作者ID補完）
  const migVersionRow = db
    .prepare("SELECT value FROM settings WHERE key = 'schema_migration_version'")
    .get() as { value: string } | undefined;
  if (migVersionRow?.value !== "5") {
    try {
      db.exec(`
        UPDATE users SET color = '#4f46e5' WHERE color LIKE '#2c%' OR color LIKE '#16%' OR color LIKE '#14%' OR color LIKE '#06%';
        UPDATE projects SET color = '#4f46e5' WHERE color LIKE '#2c%' OR color LIKE '#16%' OR color LIKE '#14%' OR color LIKE '#06%';
      `);
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
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_migration_version', '5', CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = '5', updated_at = CURRENT_TIMESTAMP
      `).run();
    } catch (onceMigErr) {
      console.error("初回データマイグレーションエラー:", onceMigErr);
    }
  }


  // 初回データ（プロジェクトが0件の場合に初期投入）
  const projectCount = db.prepare("SELECT COUNT(*) as count FROM projects").get() as { count: number };
  if (projectCount.count === 0) {
    // デフォルトプロジェクト作成
    const insertProj = db.prepare(`
      INSERT INTO projects (key, name, color)
      VALUES ('MYPRJ', 'メインプロジェクト', '#4f46e5')
    `);
    const projResult = insertProj.run();
    const projId = projResult.lastInsertRowid;

    // 初期ユーザーID一覧を取得
    const usersList = db.prepare("SELECT id FROM users ORDER BY id ASC").all() as { id: number }[];
    const defaultUserId = usersList[0]?.id || null;
    const secondUserId = usersList[1]?.id || defaultUserId;

    // サンプル課題作成
    const today = new Date().toISOString().split("T")[0];
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

    const sampleIssues = [
      {
        num: 1,
        title: "litelogダッシュボードの操作感を確認する",
        desc: "課題のステータス変更や新規登録、担当者フィルターなどを試してみましょう。",
        type: "task",
        status: "open",
        priority: "high",
        start: threeDaysAgo,
        due: today,
        assignee: defaultUserId,
      },
      {
        num: 2,
        title: "チームプロジェクトの課題を洗い出して登録する",
        desc: "今後やりたいことや抱えている課題を登録し、メンバーに割り当てて管理します。",
        type: "request",
        status: "in_progress",
        priority: "medium",
        start: today,
        due: tomorrow,
        assignee: secondUserId,
      },
      {
        num: 3,
        title: "進捗管理と定期的な課題見直しの習慣化",
        desc: "毎朝ダッシュボードで各メンバーの課題を確認し、ステータスを更新します。",
        type: "other",
        status: "open",
        priority: "low",
        start: today,
        due: nextWeek,
        assignee: defaultUserId,
      },
      {
        num: 4,
        title: "litelog環境のセットアップとメンバー招待",
        desc: "Next.jsとSQLiteを使った複数人対応litelogの基本構築が完了しました。",
        type: "task",
        status: "closed",
        priority: "medium",
        start: threeDaysAgo,
        due: today,
        assignee: defaultUserId,
      },
    ];

    const insertIssue = db.prepare(`
      INSERT INTO issues (project_id, assignee_id, created_by, issue_key, issue_number, title, description, issue_type, status, priority, start_date, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertActivity = db.prepare(`
      INSERT INTO activities (issue_id, user_id, action_type, content)
      VALUES (?, ?, ?, ?)
    `);

    for (const item of sampleIssues) {
      const issueKey = `MYPRJ-${item.num}`;
      const res = insertIssue.run(
        projId,
        item.assignee,
        defaultUserId,
        issueKey,
        item.num,
        item.title,
        item.desc,
        item.type,
        item.status,
        item.priority,
        item.start,
        item.due
      );
      const issueId = res.lastInsertRowid;

      insertActivity.run(
        issueId,
        defaultUserId,
        "created",
        `課題 [${issueKey}] 「${item.title}」を登録しました`
      );
    }
  }
}

// 単一コメントのリアクション一覧を取得
export function getCommentReactions(db: DatabaseSync, commentId: number) {
  return db.prepare(`
    SELECT
      cr.id,
      cr.comment_id,
      cr.user_id,
      cr.stamp,
      cr.created_at,
      u.name AS user_name,
      u.color AS user_color
    FROM comment_reactions cr
    LEFT JOIN users u ON cr.user_id = u.id
    WHERE cr.comment_id = ?
    ORDER BY cr.created_at ASC, cr.id ASC
  `).all(commentId);
}

// コメント配列にリアクション一覧（reactions）を一括付与して返す
export function attachReactionsToComments<T extends { id: number }>(
  db: DatabaseSync,
  comments: T[]
): (T & { reactions: unknown[] })[] {
  if (!comments || comments.length === 0) return [];
  const commentIds = comments.map((c) => Number(c.id)).filter(Boolean);
  if (commentIds.length === 0) {
    return comments.map((c) => ({ ...c, reactions: [] }));
  }

  const placeholders = commentIds.map(() => "?").join(",");
  const allReactions = db
    .prepare(`
      SELECT
        cr.id,
        cr.comment_id,
        cr.user_id,
        cr.stamp,
        cr.created_at,
        u.name AS user_name,
        u.color AS user_color
      FROM comment_reactions cr
      LEFT JOIN users u ON cr.user_id = u.id
      WHERE cr.comment_id IN (${placeholders})
      ORDER BY cr.created_at ASC, cr.id ASC
    `)
    .all(...commentIds) as { comment_id: number }[];

  const mapByCommentId = new Map<number, unknown[]>();
  for (const r of allReactions) {
    const cid = Number(r.comment_id);
    const list = mapByCommentId.get(cid) || [];
    list.push(r);
    mapByCommentId.set(cid, list);
  }

  return comments.map((c) => ({
    ...c,
    reactions: mapByCommentId.get(Number(c.id)) || [],
  }));
}

// ユーザーが特定プロジェクトにアクセス可能か判定（Adminは全プロジェクトアクセス可、PMOおよび一般メンバーは参加プロジェクトのみ）
export function canUserAccessProject(
  db: DatabaseSync,
  userId: number,
  projectId: number,
  userRoleType?: string,
  isAdmin?: number
): boolean {
  if (isAdmin === 1 || userRoleType === "admin") {
    return true;
  }
  const row = db
    .prepare("SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?")
    .get(projectId, userId);
  return Boolean(row);
}

// ユーザーがアクセス可能なプロジェクトID一覧を取得（Adminの場合は null を返し、全件対象を示す）
export function getUserAccessibleProjectIds(
  db: DatabaseSync,
  userId: number,
  userRoleType?: string,
  isAdmin?: number
): number[] | null {
  if (isAdmin === 1 || userRoleType === "admin") {
    return null; // 全プロジェクト対象
  }
  const rows = db
    .prepare("SELECT project_id FROM project_members WHERE user_id = ?")
    .all(userId) as { project_id: number }[];
  return rows.map((r) => r.project_id);
}

// プロジェクトに参加しているユーザー一覧を取得
export function getProjectMemberUsers(db: DatabaseSync, projectId: number) {
  return db
    .prepare(`
      SELECT 
        u.id,
        u.login_id,
        u.name,
        u.role,
        u.role_type,
        u.color,
        u.is_admin,
        pm.created_at AS joined_at
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = ?
      ORDER BY u.is_admin DESC, u.role_type = 'pmo' DESC, u.id ASC
    `)
    .all(projectId);
}

// プロジェクトの参加メンバーを更新（選択されたメンバーID一覧で正確に同期・脱退。継続メンバーのピン留め状態は保持）
export function setProjectMembers(db: DatabaseSync, projectId: number, userIds: number[]) {
  const rawUniqueIds = Array.from(new Set(userIds.map(Number))).filter(
    (id) => Number.isInteger(id) && id > 0
  );

  // 実在するユーザーIDのみに絞り込み（外部キー制約エラーによる500例外を防止）
  let uniqueIds: number[] = [];
  if (rawUniqueIds.length > 0) {
    const checkPlaceholders = rawUniqueIds.map(() => "?").join(", ");
    const existingRows = db
      .prepare(`SELECT id FROM users WHERE id IN (${checkPlaceholders})`)
      .all(...rawUniqueIds) as { id: number }[];
    uniqueIds = existingRows.map((r) => Number(r.id));
  }

  db.exec("BEGIN IMMEDIATE;");
  try {
    if (uniqueIds.length === 0) {
      db.prepare("DELETE FROM project_members WHERE project_id = ?").run(projectId);
    } else {
      // 選択から外れたメンバーのみ削除し、既存メンバーの is_pinned / pinned_at / created_at を維持する
      const placeholders = uniqueIds.map(() => "?").join(", ");
      db.prepare(
        `DELETE FROM project_members WHERE project_id = ? AND user_id NOT IN (${placeholders})`
      ).run(projectId, ...uniqueIds);

      const insertStmt = db.prepare(
        "INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)"
      );
      for (const uid of uniqueIds) {
        insertStmt.run(projectId, uid);
      }
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

// ユーザーの所属プロジェクト一覧を更新（選択されたプロジェクトID一覧で正確に同期・脱退。継続プロジェクトのピン留め状態は保持）
export function setUserProjects(db: DatabaseSync, userId: number, projectIds: number[]) {
  const rawUniqueProjectIds = Array.from(new Set(projectIds.map(Number))).filter(
    (id) => Number.isInteger(id) && id > 0
  );

  // 実在するプロジェクトIDのみに絞り込み（外部キー制約エラーによる500例外を防止）
  let uniqueProjectIds: number[] = [];
  if (rawUniqueProjectIds.length > 0) {
    const checkPlaceholders = rawUniqueProjectIds.map(() => "?").join(", ");
    const existingRows = db
      .prepare(`SELECT id FROM projects WHERE id IN (${checkPlaceholders})`)
      .all(...rawUniqueProjectIds) as { id: number }[];
    uniqueProjectIds = existingRows.map((r) => Number(r.id));
  }

  db.exec("BEGIN IMMEDIATE;");
  try {
    if (uniqueProjectIds.length === 0) {
      db.prepare("DELETE FROM project_members WHERE user_id = ?").run(userId);
    } else {
      // 選択から外れたプロジェクトのみ削除し、既存プロジェクトの is_pinned / pinned_at / created_at を維持する
      const placeholders = uniqueProjectIds.map(() => "?").join(", ");
      db.prepare(
        `DELETE FROM project_members WHERE user_id = ? AND project_id NOT IN (${placeholders})`
      ).run(userId, ...uniqueProjectIds);

      const insertStmt = db.prepare(
        "INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)"
      );
      for (const pid of uniqueProjectIds) {
        insertStmt.run(pid, userId);
      }
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

// 保存ファイル名（stored_name）の安全性を検証し、ATTACHMENTS_DIR 直下の絶対パスを解決する（パストラバーサル防止）
export function resolveSafeAttachmentPath(
  storedName: unknown,
  baseDir: string = ATTACHMENTS_DIR
): string | null {
  if (!isSafeStoredAttachmentName(storedName)) {
    return null;
  }
  const cleanName = String(storedName).trim();
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, cleanName);

  // 解決後のパスが必ず ATTACHMENTS_DIR 直下のファイルであることを厳密に検証
  if (
    path.dirname(resolvedTarget) !== resolvedBase ||
    !resolvedTarget.startsWith(resolvedBase + path.sep)
  ) {
    return null;
  }
  return resolvedTarget;
}

// ディスク上の添付ファイル実体を安全に一括削除する（パストラバーサル防止付き）
export function deleteAttachmentFilesOnDisk(
  storedNames: Array<string | null | undefined>,
  baseDir: string = ATTACHMENTS_DIR
): void {
  for (const name of storedNames) {
    if (!name) continue;
    const safePath = resolveSafeAttachmentPath(name, baseDir);
    if (!safePath) continue;
    try {
      if (fs.existsSync(safePath)) {
        fs.unlinkSync(safePath);
      }
    } catch (err) {
      console.error("添付ファイル実体削除エラー:", err);
    }
  }
}

/**
 * ログアウト時等にセッショントークンを即座に失効（ブラックリスト登録）します
 */
export function revokeSessionToken(
  db: DatabaseSync,
  rawToken: string,
  userId: number,
  expiresAtMs: number
): void {
  try {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const nowMs = Date.now();
    // 期限切れレコードのパージ
    db.prepare("DELETE FROM session_revocations WHERE expires_at < ?").run(nowMs);
    // ブラックリスト登録
    db.prepare(`
      INSERT INTO session_revocations (token_hash, user_id, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(token_hash) DO NOTHING
    `).run(tokenHash, userId, expiresAtMs);
  } catch (err) {
    console.error("セッショントークン失効登録エラー:", err);
  }
}

/**
 * 指定されたトークンが失効済み（ブラックリスト登録済み）かを照合します
 */
export function isSessionTokenRevoked(db: DatabaseSync, rawToken: string): boolean {
  try {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const row = db
      .prepare("SELECT 1 FROM session_revocations WHERE token_hash = ?")
      .get(tokenHash);
    return Boolean(row);
  } catch {
    return false;
  }
}



