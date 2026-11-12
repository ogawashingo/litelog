// データバックアップ・インポートAPI
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// 全データのエクスポート
export async function GET() {
  try {
    const db = getDb();
    const users = db.prepare("SELECT * FROM users").all();
    const projects = db.prepare("SELECT * FROM projects").all();
    const issues = db.prepare("SELECT * FROM issues").all();
    const comments = db.prepare("SELECT * FROM comments").all();
    const activities = db.prepare("SELECT * FROM activities").all();
    const settings = db.prepare("SELECT * FROM settings").all();

    const backupData = {
      version: 3,
      exportedAt: new Date().toISOString(),
      users,
      projects,
      issues,
      comments,
      activities,
      settings,
    };

    return NextResponse.json(backupData);
  } catch (error) {
    console.error("エクスポートエラー:", error);
    return NextResponse.json({ error: "データのエクスポートに失敗しました" }, { status: 500 });
  }
}

// バックアップデータのインポート
export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { users, projects, issues, comments, activities, settings } = body;

    if (!Array.isArray(projects) || !Array.isArray(issues)) {
      return NextResponse.json({ error: "有効なバックアップデータ形式ではありません" }, { status: 400 });
    }

    // トランザクション内で実行
    db.exec("BEGIN TRANSACTION;");
    try {
      // 既存データをクリア
      db.exec("DELETE FROM activities;");
      db.exec("DELETE FROM comments;");
      db.exec("DELETE FROM issues;");
      db.exec("DELETE FROM projects;");

      if (Array.isArray(users) && users.length > 0) {
        db.exec("DELETE FROM users;");
        const insertUser = db.prepare(`
          INSERT INTO users (id, login_id, password, name, role, is_admin, color, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const u of users) {
          const isAdminVal =
            u.is_admin !== undefined
              ? u.is_admin
                ? 1
                : 0
              : String(u.name || "").startsWith("山田")
              ? 1
              : 0;
          const fallbackLoginId = String(u.name || "").startsWith("山田")
            ? "yamada"
            : String(u.name || "").startsWith("佐藤")
            ? "sato"
            : String(u.name || "").startsWith("鈴木")
            ? "suzuki"
            : `user${u.id}`;
          insertUser.run(
            u.id,
            u.login_id || fallbackLoginId,
            u.password || `${fallbackLoginId}123`,
            u.name,
            u.role || (isAdminVal ? "管理者" : "メンバー"),
            isAdminVal,
            u.color || "#4f46e5",
            u.created_at || new Date().toISOString()
          );
        }
      }

      // 現在の有効なユーザーID集合を取得（旧バックアップ等の整合性保証）
      const validUserIds = new Set(
        (db.prepare("SELECT id FROM users").all() as { id: number }[]).map((u) => u.id)
      );

      const insertProj = db.prepare(`
        INSERT INTO projects (id, key, name, color, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const p of projects) {
        insertProj.run(p.id, p.key, p.name, p.color || "#4f46e5", p.created_at || new Date().toISOString());
      }

      const insertIssue = db.prepare(`
        INSERT INTO issues (id, project_id, assignee_id, created_by, issue_key, issue_number, title, description, issue_type, status, priority, start_date, due_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const i of issues) {
        const assigneeId = i.assignee_id && validUserIds.has(i.assignee_id) ? i.assignee_id : null;
        const createdBy = i.created_by && validUserIds.has(i.created_by) ? i.created_by : null;
        insertIssue.run(
          i.id,
          i.project_id,
          assigneeId,
          createdBy,
          i.issue_key,
          i.issue_number,
          i.title,
          i.description || "",
          i.issue_type || "task",
          i.status || "open",
          i.priority || "medium",
          i.start_date || null,
          i.due_date || null,
          i.created_at || new Date().toISOString(),
          i.updated_at || new Date().toISOString()
        );
      }

      // 親子課題（parent_id）の関連性を復元
      const updateParent = db.prepare("UPDATE issues SET parent_id = ? WHERE id = ?");
      for (const i of issues) {
        if (i.parent_id) {
          updateParent.run(i.parent_id, i.id);
        }
      }

      if (Array.isArray(comments)) {
        const insertComment = db.prepare(`
          INSERT INTO comments (id, issue_id, user_id, content, created_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const c of comments) {
          const userId = c.user_id && validUserIds.has(c.user_id) ? c.user_id : null;
          insertComment.run(c.id, c.issue_id, userId, c.content, c.created_at || new Date().toISOString());
        }
      }

      if (Array.isArray(activities)) {
        const insertAct = db.prepare(`
          INSERT INTO activities (id, issue_id, user_id, action_type, content, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const a of activities) {
          const userId = a.user_id && validUserIds.has(a.user_id) ? a.user_id : null;
          insertAct.run(a.id, a.issue_id || null, userId, a.action_type, a.content, a.created_at || new Date().toISOString());
        }
      }

      if (Array.isArray(settings)) {
        const upsertSetting = db.prepare(`
          INSERT INTO settings (key, value, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
        `);
        for (const s of settings) {
          if (s && typeof s.key === "string" && s.value !== undefined) {
            upsertSetting.run(s.key, String(s.value));
          }
        }
      }

      db.exec("COMMIT;");
      return NextResponse.json({ success: true, message: "データのインポートが完了しました" });
    } catch (txError) {
      db.exec("ROLLBACK;");
      throw txError;
    }
  } catch (error) {
    console.error("インポートエラー:", error);
    return NextResponse.json({ error: "データのインポートに失敗しました" }, { status: 500 });
  }
}
