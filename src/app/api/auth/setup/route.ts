// 初回セットアップ用管理者アカウント作成API
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
  hashPassword,
} from "@/lib/auth";

// 初回管理者アカウントの登録
export async function POST(request: Request) {
  try {
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
    if (!cleanLoginId || cleanLoginId.length < 2) {
      return NextResponse.json(
        { error: "ログインIDは2文字以上で入力してください" },
        { status: 400 }
      );
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(cleanLoginId)) {
      return NextResponse.json(
        { error: "ログインIDは半角英数字、ハイフン、アンダースコアのみ使用できます" },
        { status: 400 }
      );
    }
    if (!cleanPassword || cleanPassword.length < 4) {
      return NextResponse.json(
        { error: "パスワードは4文字以上で入力してください" },
        { status: 400 }
      );
    }

    // パスワードをscryptでハッシュ化して管理者として保存
    const hashedPassword = hashPassword(cleanPassword);
    const insertUser = db.prepare(`
      INSERT INTO users (login_id, password, name, role, is_admin, color)
      VALUES (?, ?, ?, '管理者', 1, '#4f46e5')
    `);
    const result = insertUser.run(cleanLoginId, hashedPassword, cleanName);
    const newUserId = Number(result.lastInsertRowid);

    // 未割当の初期課題やコメントがあれば新管理者に紐付け
    db.prepare("UPDATE issues SET assignee_id = ?, created_by = ? WHERE created_by IS NULL").run(
      newUserId,
      newUserId
    );
    db.prepare("UPDATE comments SET user_id = ? WHERE user_id IS NULL").run(newUserId);
    db.prepare("UPDATE activities SET user_id = ? WHERE user_id IS NULL").run(newUserId);

    const user = {
      id: newUserId,
      login_id: cleanLoginId,
      name: cleanName,
      role: "管理者",
      is_admin: 1,
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
