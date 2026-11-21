// src/app/api/invitations/[token]/route.ts
// 招待トークンの検証・対象者情報取得・招待受諾（パスワード設定＆2FA有効化）API
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
  hashPassword,
} from "@/lib/auth";
import {
  generateTotpSecret,
  getTotpUri,
  isValidTotpSecret,
  verifyTotpCodeWithStep,
} from "@/lib/totp";
import { generateQrCodeSvg } from "@/lib/qrcode";
import { MIN_LENGTHS, validatePassword } from "@/lib/validation";
import {
  checkRateLimit,
  formatRetryAfterJa,
  getClientIp,
  recordAuthFailure,
} from "@/lib/rateLimit";

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * 招待トークンの検証および招待対象ユーザー情報の取得
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "トークンが指定されていません" }, { status: 400 });
    }

    const db = getDb();
    const clientIp = getClientIp(request);
    const ipLimit = checkRateLimit(db, {
      scope: "login_ip",
      identifier: clientIp,
      ipAddress: clientIp,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          error: `アクセス試行回数が上限に達したため一時ロック中です。${formatRetryAfterJa(ipLimit.retryAfterSec)}後に再試行してください`,
        },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
      );
    }

    const row = db.prepare(`
      SELECT i.id, i.token, i.expires_at, i.used_at, i.created_at,
             u.id as user_id, u.login_id, u.name as user_name, u.role as user_role, u.role_type, u.color
      FROM invitations i
      JOIN users u ON i.user_id = u.id
      WHERE i.token = ?
    `).get(token) as {
      id: number;
      token: string;
      expires_at: string;
      used_at: string | null;
      created_at: string;
      user_id: number;
      login_id: string;
      user_name: string;
      user_role: string;
      role_type: string;
      color: string;
    } | undefined;

    if (!row) {
      recordAuthFailure(db, {
        scope: "login_ip",
        identifier: clientIp,
        ipAddress: clientIp,
      });
      return NextResponse.json({ error: "無効な招待リンクです。URLをご確認ください。" }, { status: 404 });
    }

    if (row.used_at) {
      return NextResponse.json({ error: "この招待リンクは既に使用済みです。通常のログイン画面からログインしてください。" }, { status: 410 });
    }

    // 有効期限の確認
    const expiresAtTime = new Date(row.expires_at.replace(" ", "T") + "Z").getTime();
    if (Date.now() > expiresAtTime) {
      return NextResponse.json({ error: "この招待リンクは有効期限が切れています。管理者に再発行を依頼してください。" }, { status: 410 });
    }

    // 所属プロジェクト一覧の取得
    const projects = db.prepare(`
      SELECT p.id, p.key, p.name, p.color
      FROM project_members pm
      JOIN projects p ON pm.project_id = p.id
      WHERE pm.user_id = ?
      ORDER BY p.id ASC
    `).all(row.user_id);

    // 初回2FAセットアップ用のシークレットとQRコードSVGも準備
    const totpSecret = generateTotpSecret();
    const totpUri = getTotpUri(totpSecret, row.login_id, "litelog");
    const qrSvg = await generateQrCodeSvg(totpUri);

    return NextResponse.json({
      valid: true,
      user: {
        id: row.user_id,
        login_id: row.login_id,
        name: row.user_name,
        role: row.user_role,
        role_type: row.role_type,
        color: row.color,
      },
      projects,
      totpSetup: {
        secret: totpSecret,
        uri: totpUri,
        qrSvg,
      },
    });
  } catch (error) {
    console.error("招待トークン検証エラー:", error);
    return NextResponse.json({ error: "招待情報の確認に失敗しました" }, { status: 500 });
  }
}

/**
 * 招待受諾処理（新しいパスワードの設定、任意で2FAの有効化、招待トークンの消費、即時ログイン）
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { password, enable2fa, totpSecret, totpCode } = body;

    const passwordErr = validatePassword(String(password || ""), MIN_LENGTHS.PASSWORD_INVITE);
    if (passwordErr) {
      return NextResponse.json({ error: passwordErr }, { status: 400 });
    }

    const db = getDb();
    const clientIp = getClientIp(request);
    const ipLimit = checkRateLimit(db, {
      scope: "login_ip",
      identifier: clientIp,
      ipAddress: clientIp,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          error: `試行回数が上限に達したため一時ロック中です。${formatRetryAfterJa(ipLimit.retryAfterSec)}後に再試行してください`,
        },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } }
      );
    }

    const row = db.prepare(`
      SELECT i.id, i.user_id, i.expires_at, i.used_at,
             u.login_id, u.name, u.role, u.role_type, u.is_admin, u.color, u.week_start, u.show_holidays, u.created_at
      FROM invitations i
      JOIN users u ON i.user_id = u.id
      WHERE i.token = ?
    `).get(token) as {
      id: number;
      user_id: number;
      expires_at: string;
      used_at: string | null;
      login_id: string;
      name: string;
      role: string;
      role_type: string;
      is_admin: number;
      color: string;
      week_start: string;
      show_holidays: number;
      created_at: string;
    } | undefined;

    if (!row) {
      recordAuthFailure(db, {
        scope: "login_ip",
        identifier: clientIp,
        ipAddress: clientIp,
      });
      return NextResponse.json({ error: "無効な招待リンクです" }, { status: 404 });
    }

    if (row.used_at) {
      return NextResponse.json({ error: "この招待リンクは既に使用されています" }, { status: 410 });
    }

    const expiresAtTime = new Date(row.expires_at.replace(" ", "T") + "Z").getTime();
    if (Date.now() > expiresAtTime) {
      return NextResponse.json({ error: "招待リンクの有効期限が切れています" }, { status: 410 });
    }

    let is2faEnabled = 0;
    let finalTotpSecret: string | null = null;
    let finalTotpStep: number | null = null;

    // 2要素認証を有効化する場合の検証
    if (enable2fa) {
      if (!totpSecret || !totpCode) {
        return NextResponse.json(
          { error: "2要素認証を有効にするには認証アプリの6桁コードを入力してください" },
          { status: 400 }
        );
      }
      const cleanTotpSecret = String(totpSecret).trim();
      if (!isValidTotpSecret(cleanTotpSecret)) {
        return NextResponse.json(
          { error: "無効な2要素認証シークレット形式です。画面を再読み込みしてください" },
          { status: 400 }
        );
      }
      const verifyResult = verifyTotpCodeWithStep(String(totpCode), cleanTotpSecret, 1);
      if (!verifyResult.valid) {
        return NextResponse.json(
          { error: "2要素認証コードが一致しません。スマホアプリに表示されている最新の6桁を入力してください" },
          { status: 400 }
        );
      }
      is2faEnabled = 1;
      finalTotpSecret = cleanTotpSecret;
      finalTotpStep = verifyResult.matchedStep;
    }

    // パスワードのハッシュ化
    const hashedPassword = hashPassword(String(password));

    // トランザクション内で招待トークンをアトミックに消費し、ユーザー情報を更新（競合状態の二重受諾を防止）
    db.exec("BEGIN IMMEDIATE;");
    try {
      const consumeResult = db
        .prepare("UPDATE invitations SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL")
        .run(row.id);

      if (Number(consumeResult.changes) !== 1) {
        db.exec("ROLLBACK;");
        return NextResponse.json({ error: "この招待リンクは既に使用されています" }, { status: 410 });
      }

      db.prepare(`
        UPDATE users
        SET password = ?,
            totp_secret = ?,
            totp_enabled = ?,
            totp_last_used_step = ?
        WHERE id = ?
      `).run(hashedPassword, finalTotpSecret, is2faEnabled, finalTotpStep, row.user_id);

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    const user = {
      id: row.user_id,
      login_id: row.login_id,
      name: row.name,
      role: row.role,
      is_admin: row.is_admin,
      role_type: row.role_type,
      color: row.color,
      week_start: row.week_start || "monday",
      show_holidays: row.show_holidays !== 0,
      totp_enabled: is2faEnabled,
      created_at: row.created_at,
    };

    // 正式なセッショントークンを発行して即座にログイン完了！
    const sessionToken = createSessionToken(user.id);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());

    return NextResponse.json({
      success: true,
      user,
      message: "パスワードとセキュリティ設定が完了しました！litelogへようこそ。",
    });
  } catch (error) {
    console.error("招待受諾エラー:", error);
    return NextResponse.json({ error: "初期セットアップ処理に失敗しました" }, { status: 500 });
  }
}
