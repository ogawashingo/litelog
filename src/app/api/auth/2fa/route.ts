// src/app/api/auth/2fa/route.ts
// 2要素認証（TOTP）ログイン検証・セットアップ・有効化・無効化API
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
  getSessionUser,
  verifyPassword,
  verifyTemp2faToken,
} from "@/lib/auth";
import {
  generateTotpSecret,
  getTotpUri,
  isValidTotpSecret,
  verifyTotpCodeWithStep,
} from "@/lib/totp";
import { generateQrCodeSvg } from "@/lib/qrcode";
import {
  checkRateLimit,
  formatRetryAfterJa,
  getClientIp,
  recordAuthFailure,
  resetAuthRateLimit,
} from "@/lib/rateLimit";

/**
 * ログイン時の2FA検証（ID・パスワード照合後に発行された一時トークンと6桁コードの照合）
 */
export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { tempToken, code } = body;

    if (!tempToken || !code) {
      return NextResponse.json(
        { error: "認証トークンと2要素認証コード（6桁）を入力してください" },
        { status: 400 }
      );
    }

    const userId = verifyTemp2faToken(tempToken);
    if (!userId) {
      return NextResponse.json(
        { error: "認証セッションの有効期限が切れました。再度ログインしてください" },
        { status: 401 }
      );
    }

    const userRow = db.prepare(`
      SELECT id, login_id, name, role, is_admin, role_type, color, week_start, show_holidays, totp_secret, totp_enabled, totp_last_used_step, created_at
      FROM users
      WHERE id = ?
    `).get(userId) as {
      id: number;
      login_id: string;
      name: string;
      role: string;
      is_admin: number;
      role_type?: string;
      color: string;
      week_start: string;
      show_holidays: number;
      totp_secret: string | null;
      totp_enabled: number;
      totp_last_used_step: number | null;
      created_at: string;
    } | undefined;

    if (!userRow || userRow.totp_enabled !== 1 || !userRow.totp_secret) {
      return NextResponse.json(
        { error: "2要素認証の設定が見つかりません" },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(request);

    // 2FAコードの総当たり防止レート制限チェック
    const limitStatus = checkRateLimit(db, {
      scope: "2fa",
      identifier: userRow.login_id,
      ipAddress: clientIp,
    });
    if (!limitStatus.allowed) {
      return NextResponse.json(
        {
          error: `2要素認証の失敗回数が上限に達したため一時ロック中です。${formatRetryAfterJa(limitStatus.retryAfterSec)}後に再試行するか、管理者へロック解除をご依頼ください`,
          retryAfterSec: limitStatus.retryAfterSec,
          lockedUntil: limitStatus.lockedUntil,
        },
        { status: 429, headers: { "Retry-After": String(limitStatus.retryAfterSec) } }
      );
    }

    // TOTPコードの検証（前後30秒の時刻ズレ許容 ＆ 同一タイムステップのリプレイ再利用防止）
    const verifyResult = verifyTotpCodeWithStep(
      String(code),
      userRow.totp_secret,
      1,
      Date.now(),
      30,
      userRow.totp_last_used_step
    );
    if (!verifyResult.valid) {
      const nextLimit = recordAuthFailure(db, {
        scope: "2fa",
        identifier: userRow.login_id,
        ipAddress: clientIp,
      });
      if (!nextLimit.allowed) {
        return NextResponse.json(
          {
            error: `2要素認証コードの失敗が規定回数に達したため一時ロックしました。${formatRetryAfterJa(nextLimit.retryAfterSec)}後に再試行するか、管理者へロック解除をご依頼ください`,
            retryAfterSec: nextLimit.retryAfterSec,
          },
          { status: 429, headers: { "Retry-After": String(nextLimit.retryAfterSec) } }
        );
      }
      if (verifyResult.replayed) {
        return NextResponse.json(
          { error: "この2要素認証コードは既に使用されています。認証アプリに次のコードが表示されるまでお待ちください" },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: "2要素認証コードが正しくありません。スマホの認証アプリをご確認ください" },
        { status: 401 }
      );
    }

    // 使用済みタイムステップを記録（同一コードのリプレイ攻撃および一時トークンの再利用を防止）
    if (verifyResult.matchedStep !== null) {
      db.prepare("UPDATE users SET totp_last_used_step = ? WHERE id = ?").run(
        verifyResult.matchedStep,
        userRow.id
      );
    }

    // 2FA検証成功：該当ユーザーの失敗カウントをリセット
    resetAuthRateLimit(db, {
      scope: "2fa",
      identifier: userRow.login_id,
      ipAddress: clientIp,
    });

    const user = {
      id: userRow.id,
      login_id: userRow.login_id,
      name: userRow.name,
      role: userRow.role,
      is_admin: userRow.is_admin,
      role_type: userRow.role_type || (userRow.is_admin === 1 ? "admin" : "member"),
      color: userRow.color,
      week_start: userRow.week_start || "monday",
      show_holidays: userRow.show_holidays !== 0,
      totp_enabled: 1,
      created_at: userRow.created_at,
    };

    // 正式な署名付きセッショントークンを発行してログイン完了！
    const sessionToken = createSessionToken(user.id);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());

    return NextResponse.json({ authenticated: true, user });
  } catch (error) {
    console.error("2FA検証エラー:", error);
    return NextResponse.json({ error: "2要素認証の検証に失敗しました" }, { status: 500 });
  }
}

/**
 * ログイン中ユーザーの2FAセットアップ情報取得（新しいシークレットキーとQRコードSVGを生成）
 */
export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが必要です" }, { status: 401 });
    }

    const secret = generateTotpSecret();
    const uri = getTotpUri(secret, sessionUser.login_id, "litelog");
    const qrSvg = await generateQrCodeSvg(uri);

    return NextResponse.json({
      secret,
      uri,
      qrSvg,
      accountName: sessionUser.login_id,
      issuer: "litelog",
    });
  } catch (error) {
    console.error("2FAセットアップ情報生成エラー:", error);
    return NextResponse.json({ error: "2FA設定情報の生成に失敗しました" }, { status: 500 });
  }
}

/**
 * 2FAの有効化（QRコード読み取り後のテストコード検証に成功したらDBへ保存して有効化）
 */
export async function PUT(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが必要です" }, { status: 401 });
    }

    const body = await request.json();
    const { secret, code, password } = body;

    if (!secret || !code) {
      return NextResponse.json({ error: "シークレットと6桁コードが必要です" }, { status: 400 });
    }

    const cleanSecret = String(secret).trim();
    if (!isValidTotpSecret(cleanSecret)) {
      return NextResponse.json(
        { error: "無効な2要素認証シークレット形式です。QRコードを再生成してください" },
        { status: 400 }
      );
    }

    const db = getDb();
    const currentUserRow = db
      .prepare("SELECT password, COALESCE(totp_enabled, 0) AS totp_enabled FROM users WHERE id = ?")
      .get(sessionUser.id) as { password: string; totp_enabled: number } | undefined;

    if (!currentUserRow) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    // 既に2FAが有効な場合は無断上書きを防止（一度解除するか、現在のパスワード照合を必須とする）
    if (currentUserRow.totp_enabled === 1) {
      if (!password || !verifyPassword(String(password), currentUserRow.password)) {
        return NextResponse.json(
          { error: "既に2要素認証が有効です。再設定する場合は一度解除してから設定してください" },
          { status: 400 }
        );
      }
    }

    const verifyResult = verifyTotpCodeWithStep(String(code), cleanSecret, 1);
    if (!verifyResult.valid) {
      return NextResponse.json(
        { error: "認証コードが一致しません。スマホアプリに表示されている最新の6桁を入力してください" },
        { status: 400 }
      );
    }

    db.prepare(`
      UPDATE users
      SET totp_secret = ?, totp_enabled = 1, totp_last_used_step = ?
      WHERE id = ?
    `).run(cleanSecret, verifyResult.matchedStep, sessionUser.id);

    // 2FA状態の変更により旧セッショントークンは失効するため、操作者本人のCookieを再発行
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(sessionUser.id), getSessionCookieOptions());

    return NextResponse.json({ success: true, message: "2要素認証を有効化しました" });
  } catch (error) {
    console.error("2FA有効化エラー:", error);
    return NextResponse.json({ error: "2要素認証の有効化に失敗しました" }, { status: 500 });
  }
}

/**
 * 2FAの無効化（パスワード再確認の上で解除）
 */
export async function DELETE(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが必要です" }, { status: 401 });
    }

    const body = await request.json();
    const { password } = body;

    const db = getDb();
    const clientIp = getClientIp(request);
    const limitStatus = checkRateLimit(db, {
      scope: "login",
      identifier: sessionUser.login_id,
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

    const userRow = db.prepare("SELECT password FROM users WHERE id = ?").get(sessionUser.id) as { password: string } | undefined;
    if (!userRow || !verifyPassword(String(password), userRow.password)) {
      const nextLimit = recordAuthFailure(db, {
        scope: "login",
        identifier: sessionUser.login_id,
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
      return NextResponse.json({ error: "パスワードが正しくありません" }, { status: 401 });
    }

    resetAuthRateLimit(db, {
      scope: "login",
      identifier: sessionUser.login_id,
      ipAddress: clientIp,
    });

    db.prepare(`
      UPDATE users
      SET totp_secret = NULL, totp_enabled = 0, totp_last_used_step = NULL
      WHERE id = ?
    `).run(sessionUser.id);

    // 2FA解除後の認証状態で操作者本人のセッションCookieを再発行
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(sessionUser.id), getSessionCookieOptions());

    return NextResponse.json({ success: true, message: "2要素認証を解除しました" });
  } catch (error) {
    console.error("2FA無効化エラー:", error);
    return NextResponse.json({ error: "2要素認証の解除に失敗しました" }, { status: 500 });
  }
}
