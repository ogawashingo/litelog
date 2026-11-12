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

  // 既存テーブルへのカラム追加マイグレーション（start_date が存在しない場合に追加）
  try {
    const tableInfo = db.prepare("PRAGMA table_info(issues)").all() as { name: string }[];
    const hasStartDate = tableInfo.some((col) => col.name === "start_date");
    if (!hasStartDate) {
      db.exec("ALTER TABLE issues ADD COLUMN start_date TEXT;");
    }
  } catch (migErr) {
    console.error("issues テーブルの start_date カラムマイグレーション確認エラー:", migErr);
  }

  // コメントテーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 最近の更新・アクティビティテーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 初回データ（プロジェクトが0件の場合に初期投入）
  const projectCount = db.prepare("SELECT COUNT(*) as count FROM projects").get() as { count: number };
  if (projectCount.count === 0) {
    // デフォルトプロジェクト作成
    const insertProj = db.prepare(`
      INSERT INTO projects (key, name, color)
      VALUES ('MYPRJ', '個人メインプロジェクト', '#2ca078')
    `);
    const projResult = insertProj.run();
    const projId = projResult.lastInsertRowid;

    // サンプル課題作成
    const today = new Date().toISOString().split("T")[0];
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

    const sampleIssues = [
      {
        num: 1,
        title: "Backlogダッシュボードの操作感を確認する",
        desc: "課題のステータス変更や新規登録、優先度フィルターなどを試してみましょう。",
        type: "task",
        status: "open",
        priority: "high",
        start: threeDaysAgo,
        due: today,
      },
      {
        num: 2,
        title: "個人プロジェクトのタスクを洗い出して登録する",
        desc: "今後やりたいことや抱えているタスクを課題として登録して一元管理します。",
        type: "request",
        status: "in_progress",
        priority: "medium",
        start: today,
        due: tomorrow,
      },
      {
        num: 3,
        title: "進捗管理と定期的なタスク見直しの習慣化",
        desc: "毎朝ダッシュボードの『自分の課題』を確認し、ステータスを更新します。",
        type: "other",
        status: "open",
        priority: "low",
        start: today,
        due: nextWeek,
      },
      {
        num: 4,
        title: "Personal Backlogの環境セットアップ",
        desc: "Next.jsとSQLiteを使ったパーソナルBacklogの基本構築が完了しました。",
        type: "task",
        status: "closed",
        priority: "medium",
        start: threeDaysAgo,
        due: today,
      },
    ];

    const insertIssue = db.prepare(`
      INSERT INTO issues (project_id, issue_key, issue_number, title, description, issue_type, status, priority, start_date, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertActivity = db.prepare(`
      INSERT INTO activities (issue_id, action_type, content)
      VALUES (?, ?, ?)
    `);

    for (const item of sampleIssues) {
      const issueKey = `MYPRJ-${item.num}`;
      const res = insertIssue.run(
        projId,
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
        "created",
        `課題 [${issueKey}] 「${item.title}」を登録しました`
      );
    }
  }
}
