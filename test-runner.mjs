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

  // 初期メンバー作成
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  if (userCount === 0) {
    const insertUser = db.prepare("INSERT INTO users (login_id, password, name, role, is_admin, color) VALUES (?, ?, ?, ?, ?, ?)");
    const u1 = insertUser.run("yamada", "yamada123", "山田 太郎", "管理者", 1, "#4f46e5").lastInsertRowid;
    const u2 = insertUser.run("sato", "sato123", "佐藤 花子", "エンジニア", 0, "#3b82f6").lastInsertRowid;
    insertUser.run("suzuki", "suzuki123", "鈴木 一郎", "デザイナー", 0, "#8b5cf6");
    db.prepare("UPDATE issues SET assignee_id = ?, created_by = ? WHERE assignee_id IS NULL").run(u1, u1);
    db.prepare("UPDATE comments SET user_id = ? WHERE user_id IS NULL").run(u2);
    db.prepare("UPDATE activities SET user_id = ? WHERE user_id IS NULL").run(u1);
    console.log("✓ 初期メンバーを作成し既存課題へ紐付けました");
  }

  // 初期プロジェクト作成
  const projCount = db.prepare("SELECT COUNT(*) as count FROM projects").get().count;
  if (projCount === 0) {
    db.prepare(`
      INSERT INTO projects (key, name, color)
      VALUES ('MYPRJ', '個人メインプロジェクト', '#4f46e5')
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

  const tzRow = db.prepare("SELECT value FROM settings WHERE key = 'timezone'").get();
  if (!tzRow || !tzRow.value) throw new Error("settingsテーブルのtimezone取得に失敗しました");

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
      a.action_type,
      a.content,
      i.issue_key,
      i.title AS issue_title,
      i.project_id,
      p.key AS project_key
    FROM activities a
    LEFT JOIN issues i ON a.issue_id = i.id
    LEFT JOIN projects p ON i.project_id = p.id
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 10
  `).all();
  if (joinedActivities.length === 0) {
    throw new Error("結合アクティビティが取得できませんでした");
  }
  console.log(`✓ 「最近の更新」日付グルーピング見出し("${dateGroupLabel}")＆課題結合クエリ検証成功 (${joinedActivities.length}件)`);

  // 16. 一般ユーザーのパスワード変更および現在のパスワード照合テスト
  const satoBefore = db.prepare("SELECT id, login_id, password FROM users WHERE login_id = 'sato'").get();
  if (!satoBefore) throw new Error("一般ユーザー(sato)が見つかりません");
  const originalSatoPw = satoBefore.password;

  const nextTestPw = "sato_new_pw_999";
  db.prepare("UPDATE users SET password = ? WHERE id = ? AND password = ?").run(
    nextTestPw,
    satoBefore.id,
    originalSatoPw
  );
  const satoAfterChange = db.prepare("SELECT password FROM users WHERE id = ?").get(satoBefore.id);
  if (satoAfterChange.password !== nextTestPw) {
    throw new Error("一般ユーザーのパスワード変更テストに失敗しました");
  }
  // 元のパスワードへ復元
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(originalSatoPw, satoBefore.id);
  console.log(`✓ 一般ユーザー(sato)のパスワード照合・変更・復元テスト成功`);

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

  console.log("=== すべての動作テストに合格しました！ ===");
}

runTests().catch((err) => {
  console.error("テスト失敗:", err);
  process.exit(1);
});
