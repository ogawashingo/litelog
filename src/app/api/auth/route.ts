// ユーザーログイン認証・セッション確認・ログアウトAPI
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
  createSessionToken,
  createTemp2faToken,
  getSessionCookieOptions,
  getSessionUser,
  hashPassword,
  revokeSession,
  verifyDummyPassword,
  verifyPassword,
  verifySameOriginRequest,
} from "@/lib/auth";
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/apiResponse";
import {
  checkRateLimit,
  formatRetryAfterJa,
  getClientIp,
  recordAuthFailure,
  resetAuthRateLimit,
} from "@/lib/rateLimit";
import { MIN_LENGTHS, validatePassword } from "@/lib/validation";

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
    if (!verifySameOriginRequest(request)) {
      return NextResponse.json({ error: "不正なオリジンからのリクエストです" }, { status: 403 });
    }
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
    const clientIp = getClientIp(request);

    // レート制限チェック（同一IPからの大量試行、およびログインID×IP単位の連続失敗を防御）
    const ipLimit = checkRateLimit(db, {
      scope: "login_ip",
      identifier: clientIp,
      ipAddress: clientIp,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          error: `ログイン試行回数が上限に達したため一時ロック中です。${formatRetryAfterJa(ipLimit.retryAfterSec)}後に再試行するか、管理者へロック解除をご依頼ください`,
          retryAfterSec: ipLimit.retryAfterSec,
          lockedUntil: ipLimit.lockedUntil,
        },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
      );
    }

    const accountLimit = checkRateLimit(db, {
      scope: "login",
      identifier: cleanLoginId,
      ipAddress: clientIp,
    });
    if (!accountLimit.allowed) {
      return NextResponse.json(
        {
          error: `ログイン試行回数が上限に達したため一時ロック中です。${formatRetryAfterJa(accountLimit.retryAfterSec)}後に再試行するか、管理者へロック解除をご依頼ください`,
          retryAfterSec: accountLimit.retryAfterSec,
          lockedUntil: accountLimit.lockedUntil,
        },
        { status: 429, headers: { "Retry-After": String(accountLimit.retryAfterSec) } }
      );
    }

    const row = db.prepare(`
      SELECT id, login_id, password, name, role, is_admin, role_type, color, week_start, show_holidays, totp_enabled, created_at
      FROM users
      WHERE LOWER(login_id) = LOWER(?)
    `).get(cleanLoginId) as {
      id: number;
      login_id: string;
      password: string;
      name: string;
      role: string;
      is_admin: number;
      role_type?: string;
      color: string;
      week_start: string;
      show_holidays: number;
      totp_enabled?: number;
      created_at: string;
    } | undefined;

    const isPasswordMatched = row
      ? verifyPassword(String(password), row.password)
      : verifyDummyPassword(String(password));

    if (!row || !isPasswordMatched) {
      // 認証失敗をアカウント単位・IP単位の両方で記録
      const nextAccountLimit = recordAuthFailure(db, {
        scope: "login",
        identifier: cleanLoginId,
        ipAddress: clientIp,
      });
      const nextIpLimit = recordAuthFailure(db, {
        scope: "login_ip",
        identifier: clientIp,
        ipAddress: clientIp,
      });

      if (!nextAccountLimit.allowed || !nextIpLimit.allowed) {
        const retryAfterSec = Math.max(nextAccountLimit.retryAfterSec, nextIpLimit.retryAfterSec);
        return NextResponse.json(
          {
            error: `ログイン失敗が規定回数に達したため一時ロックしました。${formatRetryAfterJa(retryAfterSec)}後に再試行するか、管理者へロック解除をご依頼ください`,
            retryAfterSec,
          },
          { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
        );
      }

      return NextResponse.json(
        { error: "ログインIDまたはパスワードが正しくありません" },
        { status: 401 }
      );
    }

    // パスワード認証成功：ログインの失敗カウントをリセット
    resetAuthRateLimit(db, {
      scope: "login",
      identifier: cleanLoginId,
      ipAddress: clientIp,
    });

    // 2要素認証（TOTP）が有効化されている場合、一時トークンを返し認証コード入力を要求
    if (row.totp_enabled === 1) {
      const tempToken = createTemp2faToken(row.id);
      return NextResponse.json({
        requires2fa: true,
        tempToken,
        message: "2要素認証コード（6桁）を入力してください",
      });
    }

    const user = {
      id: row.id,
      login_id: row.login_id,
      name: row.name,
      role: row.role,
      is_admin: row.is_admin,
      role_type: row.role_type || (row.is_admin === 1 ? "admin" : "member"),
      color: row.color,
      week_start: row.week_start || "monday",
      show_holidays: row.show_holidays !== 0,
      totp_enabled: 0,
      created_at: row.created_at,
    };

    // 署名付きセッショントークンを発行し、httpOnly Cookieとして保存（旧Cookieがあれば削除）
    const sessionToken = createSessionToken(user.id);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());
    cookieStore.delete(LEGACY_SESSION_COOKIE_NAME);

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

    const clientIp = getClientIp(request);
    const limitStatus = checkRateLimit(db, {
      scope: "login",
      identifier: row.login_id,
      ipAddress: clientIp,
    });
    if (!limitStatus.allowed) {
      return NextResponse.json(
        {
          error: `パスワード照合の失敗回数が上限に達したため一時ロック中です。${formatRetryAfterJa(limitStatus.retryAfterSec)}後に再試行するか、管理者へロック解除をご依頼ください`,
          retryAfterSec: limitStatus.retryAfterSec,
        },
        { status: 429, headers: { "Retry-After": String(limitStatus.retryAfterSec) } }
      );
    }

    if (!verifyPassword(String(currentPassword), row.password)) {
      const nextLimit = recordAuthFailure(db, {
        scope: "login",
        identifier: row.login_id,
        ipAddress: clientIp,
      });
      if (!nextLimit.allowed) {
        return NextResponse.json(
          {
            error: `パスワード照合の失敗が規定回数に達したため一時ロックしました。${formatRetryAfterJa(nextLimit.retryAfterSec)}後に再試行してください`,
            retryAfterSec: nextLimit.retryAfterSec,
          },
          { status: 429, headers: { "Retry-After": String(nextLimit.retryAfterSec) } }
        );
      }
      return NextResponse.json(
        { error: "現在のパスワードが正しくありません" },
        { status: 400 }
      );
    }

    resetAuthRateLimit(db, {
      scope: "login",
      identifier: row.login_id,
      ipAddress: clientIp,
    });

    const cleanNewPassword = String(newPassword).trim();
    const newPwErr = validatePassword(cleanNewPassword, MIN_LENGTHS.PASSWORD_DEFAULT, "新しいパスワード");
    if (newPwErr) {
      return NextResponse.json({ error: newPwErr }, { status: 400 });
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

    // パスワード変更により他端末・旧トークンは失効するため、操作者本人のセッションCookieを新状態で再発行
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(row.id), getSessionCookieOptions());

    return NextResponse.json({
      success: true,
      message: "パスワードを変更しました",
    });
  } catch (error) {
    console.error("パスワード変更エラー:", error);
    return NextResponse.json({ error: "パスワードの変更に失敗しました" }, { status: 500 });
  }
}

// ログアウト処理（サーバー側セッショントークン失効付き）
export async function DELETE(request: Request) {
  try {
    if (!verifySameOriginRequest(request)) {
      return apiError({
        status: 403,
        detail: "不正なオリジンからのリクエストです",
        code: "CSRF_DETECTED",
        request,
      });
    }
    const cookieStore = await cookies();
    const currentToken =
      cookieStore.get(SESSION_COOKIE_NAME)?.value ||
      cookieStore.get(LEGACY_SESSION_COOKIE_NAME)?.value;

    // サーバー側のブラックリストに登録して即時失効
    if (currentToken) {
      revokeSession(currentToken);
    }

    cookieStore.set(SESSION_COOKIE_NAME, "", getSessionCookieOptions(0));
    cookieStore.delete(SESSION_COOKIE_NAME);
    cookieStore.set(LEGACY_SESSION_COOKIE_NAME, "", getSessionCookieOptions(0));
    cookieStore.delete(LEGACY_SESSION_COOKIE_NAME);

    logger.info("ユーザーがログアウトしました", { path: "/api/auth", method: "DELETE" });
    return apiSuccess({ authenticated: false, message: "ログアウトしました" }, undefined, request);
  } catch (error) {
    logger.error("ログアウトエラー", { path: "/api/auth", method: "DELETE" }, error);
    return apiError({
      status: 500,
      detail: "ログアウトに失敗しました",
      request,
    });
  }
}
