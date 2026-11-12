// ユーザーログイン認証・セッション確認・ログアウトAPI
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";

const SESSION_COOKIE_NAME = "backlog_session_uid";

// 現在のログインセッション確認
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionUid = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const db = getDb();

    if (sessionUid) {
      const user = db.prepare(`
        SELECT id, login_id, name, role, is_admin, color, created_at
        FROM users
        WHERE id = ?
      `).get(Number(sessionUid));

      if (user) {
        return NextResponse.json({ authenticated: true, user });
      }
    }

    return NextResponse.json({ authenticated: false, user: null });
  } catch (error) {
    console.error("セッション確認エラー:", error);
    return NextResponse.json({ authenticated: false, user: null }, { status: 500 });
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

    if (!row || row.password !== password) {
      return NextResponse.json(
        { error: "ログインIDまたはパスワードが正しくありません" },
        { status: 401 }
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

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, String(user.id), {
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7日間有効
      sameSite: "lax",
    });

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
    const cookieStore = await cookies();
    const sessionUid = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const body = await request.json();

    const targetUserId = body.userId ? Number(body.userId) : sessionUid ? Number(sessionUid) : null;
    const { currentPassword, newPassword } = body;

    if (!targetUserId) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
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
    `).get(targetUserId) as {
      id: number;
      login_id: string;
      password: string;
      name: string;
    } | undefined;

    if (!row) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    if (row.password !== String(currentPassword)) {
      return NextResponse.json(
        { error: "現在のパスワードが正しくありません" },
        { status: 400 }
      );
    }

    const cleanNewPassword = String(newPassword).trim();
    if (cleanNewPassword === row.password) {
      return NextResponse.json(
        { error: "新しいパスワードには現在のパスワードと異なるものを指定してください" },
        { status: 400 }
      );
    }

    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(cleanNewPassword, row.id);

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
    cookieStore.set(SESSION_COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    });
    cookieStore.delete(SESSION_COOKIE_NAME);
    return NextResponse.json({ authenticated: false, message: "ログアウトしました" });
  } catch (error) {
    console.error("ログアウトエラー:", error);
    return NextResponse.json({ error: "ログアウトに失敗しました" }, { status: 500 });
  }
}
