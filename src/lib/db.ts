// データベース接続および初期化処理
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

// データベースファイルの保存先パス（プロジェクトルートの data ディレクトリ）
const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "backlog.db");

// ディレクトリが存在しない場合は作成
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
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
  // 外部キー制約の有効化
  db.exec("PRAGMA foreign_keys = ON;");

  // ユーザー（チームメンバー）テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login_id TEXT UNIQUE,
      password TEXT NOT NULL DEFAULT 'pass123',
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'メンバー',
      is_admin INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#2ca078',
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

    // 山田さん（Admin権限 / login_id: yamada）
    db.prepare(`
      UPDATE users
      SET is_admin = 1,
          role = CASE WHEN role = 'プロジェクトリーダー' OR role = 'メンバー' THEN '管理者' ELSE role END,
          login_id = COALESCE(NULLIF(login_id, ''), 'yamada'),
          password = CASE WHEN password IS NULL OR password = '' OR password = 'pass123' THEN 'yamada123' ELSE password END
      WHERE name LIKE '山田%'
    `).run();

    // 佐藤さん（一般ユーザー権限 / login_id: sato）
    db.prepare(`
      UPDATE users
      SET is_admin = 0,
          login_id = COALESCE(NULLIF(login_id, ''), 'sato'),
          password = CASE WHEN password IS NULL OR password = '' OR password = 'pass123' THEN 'sato123' ELSE password END
      WHERE name LIKE '佐藤%'
    `).run();

    // 鈴木さん（一般ユーザー権限 / login_id: suzuki）
    db.prepare(`
      UPDATE users
      SET is_admin = 0,
          login_id = COALESCE(NULLIF(login_id, ''), 'suzuki'),
          password = CASE WHEN password IS NULL OR password = '' OR password = 'pass123' THEN 'suzuki123' ELSE password END
      WHERE name LIKE '鈴木%'
    `).run();

    // その他login_idが未設定のユーザーにユニークなlogin_idを補完
    db.prepare(`
      UPDATE users
      SET login_id = 'user' || id
      WHERE login_id IS NULL OR login_id = ''
    `).run();
  } catch (migErr) {
    console.error("users テーブルのマイグレーション確認エラー:", migErr);
  }

  // プロジェクトテーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#2ca078',
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // comments テーブルのマイグレーション
  try {
    const commentCols = db.prepare("PRAGMA table_info(comments)").all() as { name: string }[];
    if (!commentCols.some((col) => col.name === "user_id")) {
      db.exec("ALTER TABLE comments ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;");
    }
  } catch (migErr) {
    console.error("comments テーブルのカラムマイグレーション確認エラー:", migErr);
  }

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

  // システム設定（時刻・タイムゾーン等）テーブル
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


  // 初回ユーザー（メンバーが0件の場合に初期メンバーを投入）
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  if (userCount.count === 0) {
    const insertUser = db.prepare(`
      INSERT INTO users (login_id, password, name, role, is_admin, color) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const u1 = insertUser.run("yamada", "yamada123", "山田 太郎", "管理者", 1, "#2ca078").lastInsertRowid;
    const u2 = insertUser.run("sato", "sato123", "佐藤 花子", "エンジニア", 0, "#3b82f6").lastInsertRowid;
    insertUser.run("suzuki", "suzuki123", "鈴木 一郎", "デザイナー", 0, "#8b5cf6");

    // もし既に課題が存在していて担当者が未設定なら、初期メンバーを割り当てる
    const existingIssues = db.prepare("SELECT id FROM issues WHERE assignee_id IS NULL").all() as { id: number }[];
    if (existingIssues.length > 0) {
      const updateAssignee = db.prepare("UPDATE issues SET assignee_id = ?, created_by = ? WHERE id = ?");
      existingIssues.forEach((iss, idx) => {
        const targetUser = idx % 2 === 0 ? u1 : u2;
        updateAssignee.run(targetUser, u1, iss.id);
      });
    }
    db.prepare("UPDATE comments SET user_id = ? WHERE user_id IS NULL").run(u1);
    db.prepare("UPDATE activities SET user_id = ? WHERE user_id IS NULL").run(u1);
  }

  // 初回データ（プロジェクトが0件の場合に初期投入）
  const projectCount = db.prepare("SELECT COUNT(*) as count FROM projects").get() as { count: number };
  if (projectCount.count === 0) {
    // デフォルトプロジェクト作成
    const insertProj = db.prepare(`
      INSERT INTO projects (key, name, color)
      VALUES ('MYPRJ', 'メインプロジェクト', '#2ca078')
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
