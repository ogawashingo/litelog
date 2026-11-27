// データベーススキーマ初期化・マイグレーション用スクリプト
// アプリ起動前やCI/CD、デプロイ時に明示的に実行可能
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dbDir = path.join(rootDir, "data");
const dbPath =
  process.env.LITELOG_DB_PATH ||
  process.env.BACKLOG_DB_PATH ||
  path.join(dbDir, "litelog.db");

if (dbPath !== ":memory:" && !fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

console.log(`[Migration] データベース移行開始: ${dbPath}`);
const db = new DatabaseSync(dbPath);

// 外部キー制約・WALモード・ビジータイムアウト
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");

// users テーブル
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

// projects テーブル
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

// issues テーブル
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

// comments テーブル
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

// comment_histories テーブル
db.exec(`
  CREATE TABLE IF NOT EXISTS comment_histories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// comment_reactions テーブル
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

// issue_histories テーブル
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

// activities テーブル
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

// notifications テーブル
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

// attachments テーブル
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

// settings テーブル
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// project_members テーブル
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

// invitations テーブル
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

// login_rate_limits テーブル
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

// session_revocations テーブル
db.exec(`
  CREATE TABLE IF NOT EXISTS session_revocations (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_session_revocations_expires_at ON session_revocations(expires_at);
`);

// issue_pins テーブル（課題の個人別ピン留め）
db.exec(`
  CREATE TABLE IF NOT EXISTS issue_pins (
    issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (issue_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_issue_pins_user_id ON issue_pins(user_id);
  CREATE INDEX IF NOT EXISTS idx_issue_pins_issue_id ON issue_pins(issue_id);
`);

// 検索用インデックス
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

console.log("[Migration] データベース移行が正常に完了しました");
db.close();
