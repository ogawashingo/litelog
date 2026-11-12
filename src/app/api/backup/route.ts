// データバックアップ・インポートAPI
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// 全データのエクスポート
export async function GET() {
  try {
    const db = getDb();
    const projects = db.prepare("SELECT * FROM projects").all();
    const issues = db.prepare("SELECT * FROM issues").all();
    const comments = db.prepare("SELECT * FROM comments").all();
    const activities = db.prepare("SELECT * FROM activities").all();

    const backupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      projects,
      issues,
      comments,
      activities,
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
    const { projects, issues, comments, activities } = body;

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

      const insertProj = db.prepare(`
        INSERT INTO projects (id, key, name, color, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const p of projects) {
        insertProj.run(p.id, p.key, p.name, p.color || "#2ca078", p.created_at || new Date().toISOString());
      }

      const insertIssue = db.prepare(`
        INSERT INTO issues (id, project_id, issue_key, issue_number, title, description, issue_type, status, priority, due_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const i of issues) {
        insertIssue.run(
          i.id,
          i.project_id,
          i.issue_key,
          i.issue_number,
          i.title,
          i.description || "",
          i.issue_type || "task",
          i.status || "open",
          i.priority || "medium",
          i.due_date || null,
          i.created_at || new Date().toISOString(),
          i.updated_at || new Date().toISOString()
        );
      }

      if (Array.isArray(comments)) {
        const insertComment = db.prepare(`
          INSERT INTO comments (id, issue_id, content, created_at)
          VALUES (?, ?, ?, ?)
        `);
        for (const c of comments) {
          insertComment.run(c.id, c.issue_id, c.content, c.created_at || new Date().toISOString());
        }
      }

      if (Array.isArray(activities)) {
        const insertAct = db.prepare(`
          INSERT INTO activities (id, issue_id, action_type, content, created_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const a of activities) {
          insertAct.run(a.id, a.issue_id || null, a.action_type, a.content, a.created_at || new Date().toISOString());
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
