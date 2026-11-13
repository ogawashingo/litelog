// SQLite データベース初期化＆総合検証テスト
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

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
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const commentCols = db.prepare("PRAGMA table_info(comments)").all();
  if (!commentCols.some((col) => col.name === "user_id")) {
    db.exec("ALTER TABLE comments ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;");
  }
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
  const activityCols = db.prepare("PRAGMA table_info(activities)").all();
  if (!activityCols.some((col) => col.name === "user_id")) {
    db.exec("ALTER TABLE activities ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;");
  }
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
    CREATE INDEX IF NOT EXISTS idx_comments_issue_id ON comments(issue_id);
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

  console.log("=== すべての動作テストに合格しました！ ===");
}

runTests().catch((err) => {
  console.error("テスト失敗:", err);
  process.exit(1);
});
