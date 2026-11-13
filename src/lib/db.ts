// データベース接続および初期化処理
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { hashPassword, isPasswordHashed } from "@/lib/auth";

// データベースファイルの保存先パス（環境変数 BACKLOG_DB_PATH で切り替え可能）
const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.BACKLOG_DB_PATH || path.join(DB_DIR, "backlog.db");

// ディレクトリが存在しない場合は作成（インメモリDB以外）
if (DB_PATH !== ":memory:" && !fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

let dbInstance: DatabaseSync | null = null;

// シングルトンでデータベースインスタンスを取得
export function getDb(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    initDb(dbInstance);
  }
  return dbInstance;
}

// テーブル作成および初期データの投入
function initDb(db: DatabaseSync) {
  // 外部キー制約・WALモード・ビジータイムアウトの有効化
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");

  // ユーザー（チームメンバー）テーブル
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

  // users テーブルのマイグレーション（is_admin / login_id / password カラム追加 ＆ 初期メンバーのID・権限設定）
  try {
    const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    if (!userCols.some((col) => col.name === "is_admin")) {
      db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;");
    }
    if (!userCols.some((col) => col.name === "login_id")) {
      db.exec("ALTER TABLE users ADD COLUMN login_id TEXT;");
    }
    if (!userCols.some((col) => col.name === "password")) {
      db.exec("ALTER TABLE users ADD COLUMN password TEXT NOT NULL DEFAULT 'pass123';");
    }
    if (!userCols.some((col) => col.name === "week_start")) {
      db.exec("ALTER TABLE users ADD COLUMN week_start TEXT NOT NULL DEFAULT 'monday';");
    }
    if (!userCols.some((col) => col.name === "show_holidays")) {
      db.exec("ALTER TABLE users ADD COLUMN show_holidays INTEGER NOT NULL DEFAULT 1;");
    }

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

    // 平文パスワードが保存されている場合は自動的にソルト付きscryptハッシュへ移行
    const existingUsers = db
      .prepare("SELECT id, password FROM users")
      .all() as { id: number; password: string }[];
    const updatePwStmt = db.prepare("UPDATE users SET password = ? WHERE id = ?");
    for (const u of existingUsers) {
      if (u.password && !isPasswordHashed(u.password)) {
        updatePwStmt.run(hashPassword(u.password), u.id);
      }
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 課題（タスク）テーブル
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
  } catch (migErr) {
    console.error("activities テーブルのカラムマイグレーション確認エラー:", migErr);
  }

  // システム設定（時刻・タイムゾーン・マイグレーションバージョン管理等）テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

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
    CREATE INDEX IF NOT EXISTS idx_issue_histories_issue_id ON issue_histories(issue_id);
    CREATE INDEX IF NOT EXISTS idx_comments_issue_id ON comments(issue_id);
    CREATE INDEX IF NOT EXISTS idx_comment_histories_comment_id ON comment_histories(comment_id);
    CREATE INDEX IF NOT EXISTS idx_activities_issue_id ON activities(issue_id);
    CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
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
        title: "Backlogダッシュボードの操作感を確認する",
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
        title: "チームプロジェクトのタスクを洗い出して登録する",
        desc: "今後やりたいことや抱えているタスクを課題として登録し、メンバーに割り当てて管理します。",
        type: "request",
        status: "in_progress",
        priority: "medium",
        start: today,
        due: tomorrow,
        assignee: secondUserId,
      },
      {
        num: 3,
        title: "進捗管理と定期的なタスク見直しの習慣化",
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
        title: "Backlog環境のセットアップとメンバー招待",
        desc: "Next.jsとSQLiteを使った複数人対応Backlogの基本構築が完了しました。",
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
