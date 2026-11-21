// 初回セットアップ用管理者アカウント作成API
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
  hashPassword,
  verifySameOriginRequest,
} from "@/lib/auth";
import {
  MAX_LENGTHS,
  MIN_LENGTHS,
  validateLoginId,
  validateMaxLength,
  validatePassword,
} from "@/lib/validation";

// 初回管理者アカウントの登録
export async function POST(request: Request) {
  try {
    // クロスオリジンからの勝手な初期管理者作成（セットアップ乗っ取りCSRF）を遮断
    if (!verifySameOriginRequest(request)) {
      return NextResponse.json(
        { error: "不正なオリジンからのリクエストです" },
        { status: 403 }
      );
    }

    const db = getDb();

    // 既にユーザーが1人でも存在する場合は初回登録を拒否（セキュリティ対策）
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    if (userCount.count > 0) {
      return NextResponse.json(
        { error: "既にユーザーが登録されているため、初回セットアップは利用できません" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, loginId, password } = body;

    // 入力値バリデーション
    const cleanName = String(name || "").trim();
    const cleanLoginId = String(loginId || "").trim();
    const cleanPassword = String(password || "").trim();

    if (!cleanName) {
      return NextResponse.json({ error: "お名前を入力してください" }, { status: 400 });
    }
    const nameLengthErr = validateMaxLength(cleanName, MAX_LENGTHS.USER_NAME, "お名前");
    if (nameLengthErr) {
      return NextResponse.json({ error: nameLengthErr }, { status: 400 });
    }
    const loginIdErr = validateLoginId(cleanLoginId);
    if (loginIdErr) {
      return NextResponse.json({ error: loginIdErr }, { status: 400 });
    }
    const passwordErr = validatePassword(cleanPassword, MIN_LENGTHS.PASSWORD_DEFAULT);
    if (passwordErr) {
      return NextResponse.json({ error: passwordErr }, { status: 400 });
    }

    // パスワードをscryptでハッシュ化して管理者としてアトミックに保存（同時リクエスト競合防止）
    const hashedPassword = hashPassword(cleanPassword);
    let newUserId = 0;

    db.exec("BEGIN IMMEDIATE;");
    try {
      const recheckCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
      if (recheckCount.count > 0) {
        db.exec("ROLLBACK;");
        return NextResponse.json(
          { error: "既にユーザーが登録されているため、初回セットアップは利用できません" },
          { status: 400 }
        );
      }

      const insertUser = db.prepare(`
        INSERT INTO users (login_id, password, name, role, is_admin, role_type, color)
        VALUES (?, ?, ?, '管理者', 1, 'admin', '#4f46e5')
      `);
      const result = insertUser.run(cleanLoginId, hashedPassword, cleanName);
      newUserId = Number(result.lastInsertRowid);

      // 未割当の初期課題やコメントがあれば新管理者に紐付け
      db.prepare("UPDATE issues SET assignee_id = ?, created_by = ? WHERE created_by IS NULL").run(
        newUserId,
        newUserId
      );
      db.prepare("UPDATE comments SET user_id = ? WHERE user_id IS NULL").run(newUserId);
      db.prepare("UPDATE activities SET user_id = ? WHERE user_id IS NULL").run(newUserId);

      // 初期プロジェクトが存在する場合は作成された管理者をプロジェクトメンバーに登録
      db.prepare(`
        INSERT OR IGNORE INTO project_members (project_id, user_id)
        SELECT id, ? FROM projects
      `).run(newUserId);

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    const user = {
      id: newUserId,
      login_id: cleanLoginId,
      name: cleanName,
      role: "管理者",
      is_admin: 1,
      role_type: "admin" as const,
      color: "#4f46e5",
      created_at: new Date().toISOString(),
    };

    // セッショントークンを発行してログインCookieを設定
    const sessionToken = createSessionToken(newUserId);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());

    return NextResponse.json({ ok: true, authenticated: true, user });
  } catch (error) {
    console.error("初回管理者作成エラー:", error);
    return NextResponse.json({ error: "管理者アカウントの作成に失敗しました" }, { status: 500 });
  }
}
