// SQLite データベース初期化＆総合検証テスト
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

async function runTests() {
  console.log("=== Personal Backlog データベース初期化＆動作検証開始 ===");
  const dbDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, "backlog.db");
  const db = new DatabaseSync(dbPath);

  // テーブル定義
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#2ca078',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
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

  // start_date カラムの存在確認およびマイグレーション
  const tableCols = db.prepare("PRAGMA table_info(issues)").all();
  if (!tableCols.some((col) => col.name === "start_date")) {
    db.exec("ALTER TABLE issues ADD COLUMN start_date TEXT;");
    console.log("✓ start_date カラムのマイグレーションが成功しました");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 初期プロジェクト作成
  const projCount = db.prepare("SELECT COUNT(*) as count FROM projects").get().count;
  if (projCount === 0) {
    db.prepare(`
      INSERT INTO projects (key, name, color)
      VALUES ('MYPRJ', '個人メインプロジェクト', '#2ca078')
    `).run();
    console.log("✓ 初期プロジェクト「MYPRJ」を作成しました");
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
    console.log("✓ 初期サンプル課題およびアクティビティを作成しました");
  }

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

  // 4. ステータス変更テスト
  db.prepare("UPDATE issues SET status = 'in_progress' WHERE id = ?").run(createdId);
  const updated = db.prepare("SELECT * FROM issues WHERE id = ?").get(createdId);
  if (updated.status !== "in_progress") throw new Error("ステータス変更に失敗しました");
  console.log(`✓ ステータス更新テスト成功: ${updated.status}`);

  // 5. コメント追加テスト
  const commentRes = db.prepare(`
    INSERT INTO comments (issue_id, content) VALUES (?, ?)
  `).run(createdId, "テストコメントを投稿しました");
  console.log(`✓ コメント追加テスト成功: ID=${commentRes.lastInsertRowid}`);

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

  // 10. テスト課題の削除テスト
  db.prepare("DELETE FROM issues WHERE id = ?").run(createdId);
  const afterDelete = db.prepare("SELECT * FROM issues WHERE id = ?").get(createdId);
  if (afterDelete) throw new Error("課題削除に失敗しました");
  console.log("✓ 課題削除テスト成功");

  // 11. ガントチャート向け日付ユーティリティ検証
  const d1 = new Date(2026, 10, 10); // 2026-11-10
  const d2 = new Date(2026, 10, 20); // 2026-11-20
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  const diff = Math.round((utc2 - utc1) / 86400000);
  if (diff !== 10) throw new Error("日付差分計算エラー");
  console.log(`✓ 日付差分計算テスト成功: ${diff} 日間`);

  console.log("=== すべての動作テストに合格しました！ ===");
}

runTests().catch((err) => {
  console.error("テスト失敗:", err);
  process.exit(1);
});
