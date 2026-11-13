// ユーザー（チームメンバー）一覧取得および新規追加API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";

// メンバー一覧の取得（担当課題数の集計付き・パスワードは除外）
export async function GET() {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT 
        u.id,
        u.login_id,
        u.name,
        u.role,
        u.is_admin,
        u.color,
        u.week_start,
        u.created_at,
        COUNT(i.id) AS issue_count,
        SUM(CASE WHEN i.id IS NOT NULL AND i.status != 'closed' THEN 1 ELSE 0 END) AS open_issue_count
      FROM users u
      LEFT JOIN issues i ON u.id = i.assignee_id
      GROUP BY u.id
      ORDER BY u.id ASC
    `).all();

    return NextResponse.json(users);
  } catch (error) {
    console.error("ユーザー一覧取得エラー:", error);
    return NextResponse.json({ error: "メンバー一覧の取得に失敗しました" }, { status: 500 });
  }
}

// メンバーの新規登録（Admin管理者のみ実行可能）
export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }
    if (sessionUser.is_admin !== 1) {
      return NextResponse.json(
        { error: "メンバーの追加には管理者（Admin）権限が必要です" },
        { status: 403 }
      );
    }

    const db = getDb();
    const body = await request.json();
    const {
      loginId,
      password = "pass123",
      name,
      role = "メンバー",
      isAdmin = false,
      color = "#4f46e5",
      weekStart = "monday",
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "メンバー名は必須です" }, { status: 400 });
    }

    const cleanLoginId = loginId && String(loginId).trim()
      ? String(loginId).trim().toLowerCase()
      : `user_${Date.now()}`;

    // ログインIDの重複チェック
    const existing = db
      .prepare("SELECT id FROM users WHERE LOWER(login_id) = LOWER(?)")
      .get(cleanLoginId);
    if (existing) {
      return NextResponse.json(
        { error: `ログインID「${cleanLoginId}」は既に使用されています` },
        { status: 400 }
      );
    }

    const rawPassword = String(password).trim() || "pass123";
    const hashedPassword = hashPassword(rawPassword);

    const cleanWeekStart = weekStart === "sunday" ? "sunday" : "monday";

    const insert = db.prepare(`
      INSERT INTO users (login_id, password, name, role, is_admin, color, week_start)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insert.run(
      cleanLoginId,
      hashedPassword,
      name.trim(),
      (role || (isAdmin ? "管理者" : "メンバー")).trim(),
      isAdmin ? 1 : 0,
      color || "#4f46e5",
      cleanWeekStart
    );

    const created = db.prepare(`
      SELECT 
        u.id,
        u.login_id,
        u.name,
        u.role,
        u.is_admin,
        u.color,
        u.week_start,
        u.created_at,
        0 AS issue_count,
        0 AS open_issue_count
      FROM users u
      WHERE u.id = ?
    `).get(result.lastInsertRowid);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("ユーザー追加エラー:", error);
    return NextResponse.json({ error: "メンバーの追加に失敗しました" }, { status: 500 });
  }
}
