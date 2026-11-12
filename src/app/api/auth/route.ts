// ユーザーログイン認証・セッション確認・ログアウトAPI
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
  getSessionUser,
  hashPassword,
  isPasswordHashed,
  verifyPassword,
} from "@/lib/auth";

// 現在のログインセッション確認（HMAC署名検証付き＆初回セットアップ要否判定）
export async function GET() {
  try {
    const db = getDb();
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    const needsSetup = userCount.count === 0;

    const user = await getSessionUser();
    if (user) {
      return NextResponse.json({ authenticated: true, user, needsSetup: false });
    }
    return NextResponse.json({ authenticated: false, user: null, needsSetup });
  } catch (error) {
    console.error("セッション確認エラー:", error);
    return NextResponse.json({ authenticated: false, user: null, needsSetup: false }, { status: 500 });
  }
}

// ID・パスワードによるWebログイン認証
export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { loginId, password } = body;

    if (!loginId || !String(loginId).trim() || !password) {
      return NextResponse.json(
        { error: "ログインIDとパスワードを入力してください" },
        { status: 400 }
      );
    }

    const cleanLoginId = String(loginId).trim();

    const row = db.prepare(`
      SELECT id, login_id, password, name, role, is_admin, color, created_at
      FROM users
      WHERE LOWER(login_id) = LOWER(?)
    `).get(cleanLoginId) as {
      id: number;
      login_id: string;
      password: string;
      name: string;
      role: string;
      is_admin: number;
      color: string;
      created_at: string;
    } | undefined;

    if (!row || !verifyPassword(String(password), row.password)) {
      return NextResponse.json(
        { error: "ログインIDまたはパスワードが正しくありません" },
        { status: 401 }
      );
    }

    // 万一DBに旧平文パスワードが残っていた場合は、ログイン成功時にハッシュ形式へ自動移行
    if (!isPasswordHashed(row.password)) {
      db.prepare("UPDATE users SET password = ? WHERE id = ?").run(
        hashPassword(String(password)),
        row.id
      );
    }

    const user = {
      id: row.id,
      login_id: row.login_id,
      name: row.name,
      role: row.role,
      is_admin: row.is_admin,
      color: row.color,
      created_at: row.created_at,
    };

    // 署名付きセッショントークンを発行し、httpOnly Cookieとして保存
    const sessionToken = createSessionToken(user.id);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());

    return NextResponse.json({ authenticated: true, user });
  } catch (error) {
    console.error("ログイン処理エラー:", error);
    return NextResponse.json({ error: "ログイン処理に失敗しました" }, { status: 500 });
  }
}

// ログイン中ユーザー自身のパスワード変更処理
export async function PUT(request: Request) {
  try {
    const db = getDb();
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    // 自身以外のIDが指定された場合は管理者であっても本人確認APIでは拒否（なりすまし防止）
    if (body.userId && Number(body.userId) !== sessionUser.id) {
      return NextResponse.json(
        { error: "他のユーザーのパスワードはこのエンドポイントから変更できません" },
        { status: 403 }
      );
    }

    if (!currentPassword || !newPassword || !String(newPassword).trim()) {
      return NextResponse.json(
        { error: "現在のパスワードと新しいパスワードを入力してください" },
        { status: 400 }
      );
    }

    const row = db.prepare(`
      SELECT id, login_id, password, name
      FROM users
      WHERE id = ?
    `).get(sessionUser.id) as {
      id: number;
      login_id: string;
      password: string;
      name: string;
    } | undefined;

    if (!row) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    if (!verifyPassword(String(currentPassword), row.password)) {
      return NextResponse.json(
        { error: "現在のパスワードが正しくありません" },
        { status: 400 }
      );
    }

    const cleanNewPassword = String(newPassword).trim();
    if (cleanNewPassword.length < 4) {
      return NextResponse.json(
        { error: "新しいパスワードは4文字以上で入力してください" },
        { status: 400 }
      );
    }

    if (verifyPassword(cleanNewPassword, row.password)) {
      return NextResponse.json(
        { error: "新しいパスワードには現在のパスワードと異なるものを指定してください" },
        { status: 400 }
      );
    }

    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(
      hashPassword(cleanNewPassword),
      row.id
    );

    return NextResponse.json({
      success: true,
      message: "パスワードを変更しました",
    });
  } catch (error) {
    console.error("パスワード変更エラー:", error);
    return NextResponse.json({ error: "パスワードの変更に失敗しました" }, { status: 500 });
  }
}

// ログアウト処理
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, "", getSessionCookieOptions(0));
    cookieStore.delete(SESSION_COOKIE_NAME);
    return NextResponse.json({ authenticated: false, message: "ログアウトしました" });
  } catch (error) {
    console.error("ログアウトエラー:", error);
    return NextResponse.json({ error: "ログアウトに失敗しました" }, { status: 500 });
  }
}
