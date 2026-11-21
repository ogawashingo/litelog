// 認証・パスワードハッシュ化・署名付きセッション管理・API認可ユーティリティ
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { cookies, headers } from "next/headers";
import { getDb } from "@/lib/db";

export const SESSION_COOKIE_NAME = "litelog_session_uid";
export const LEGACY_SESSION_COOKIE_NAME = "backlog_session_uid";
const HASH_PREFIX = "scrypt$";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7日間

// 存在しないログインID照合時のタイミング攻撃（ユーザー列挙）を防ぐためのダミーscryptハッシュ
const DUMMY_PASSWORD_HASH = hashPassword("litelog_dummy_timing_protection_secret");

export interface SessionUser {
  id: number;
  login_id: string;
  name: string;
  role: string;
  is_admin: number;
  role_type?: string;
  color: string;
  week_start?: string;
  show_holidays?: number;
  totp_enabled?: number;
  created_at: string;
}

/**
 * パスワードが既にscrypt形式でハッシュ化されているか判定します
 */
export function isPasswordHashed(storedPassword: string | null | undefined): boolean {
  return typeof storedPassword === "string" && storedPassword.startsWith(HASH_PREFIX);
}

/**
 * 平文パスワードをソルト付きscryptでハッシュ化します
 * 形式: scrypt$<salt_hex>$<hash_hex>
 */
export function hashPassword(plainPassword: string): string {
  const clean = String(plainPassword);
  if (isPasswordHashed(clean)) {
    return clean;
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(clean, salt, 64).toString("hex");
  return `${HASH_PREFIX}${salt}$${derivedKey}`;
}

/**
 * 入力された平文パスワードとDB保存ハッシュを照合します
 */
export function verifyPassword(plainPassword: string, storedPassword: string): boolean {
  if (!plainPassword || !storedPassword || !isPasswordHashed(storedPassword)) {
    return false;
  }

  const parts = storedPassword.split("$");
  if (parts.length !== 3) return false;
  const [, salt, originalHashHex] = parts;
  try {
    const derivedKey = crypto.scryptSync(String(plainPassword), salt, 64);
    const originalKey = Buffer.from(originalHashHex, "hex");
    if (derivedKey.length !== originalKey.length) return false;
    return crypto.timingSafeEqual(derivedKey, originalKey);
  } catch {
    return false;
  }
}

/**
 * ユーザーが存在しない場合でも実在ユーザーと同等のscrypt計算時間を消費させ、
 * レスポンス時間差によるログインID列挙（タイミング攻撃）を防止します
 */
export function verifyDummyPassword(plainPassword: string): false {
  verifyPassword(String(plainPassword || "dummy"), DUMMY_PASSWORD_HASH);
  return false;
}

/**
 * Origin ヘッダー・Sec-Fetch-Site ヘッダーと Host / X-Forwarded-Host ヘッダーが同一オリジン（ホスト一致）か検証します（CSRF防止）
 * Origin ヘッダーが存在しない場合（同一オリジンGET等）かつ Sec-Fetch-Site が cross-site でない場合は true を返し、
 * 外部サイトからのクロスオリジンリクエスト（Origin 不一致または Sec-Fetch-Site: cross-site）は false を返します
 */
export function isSameOriginHeader(
  originHeader: string | null | undefined,
  hostHeader: string | null | undefined,
  forwardedHostHeader?: string | null | undefined,
  secFetchSiteHeader?: string | null | undefined
): boolean {
  if (secFetchSiteHeader && secFetchSiteHeader.trim().toLowerCase() === "cross-site") {
    return false;
  }
  if (!originHeader) return true;
  if (originHeader === "null") return false;

  const primaryHost = (hostHeader || "").split(",")[0].trim().toLowerCase();
  const proxyHost =
    process.env.TRUST_PROXY === "false"
      ? ""
      : (forwardedHostHeader || "").split(",")[0].trim().toLowerCase();
  const effectiveHost = proxyHost || primaryHost;
  if (!effectiveHost) return false;

  try {
    const parsedOrigin = new URL(originHeader.trim());
    const originHost = parsedOrigin.host.toLowerCase();
    return originHost === effectiveHost || (Boolean(primaryHost) && originHost === primaryHost);
  } catch {
    return false;
  }
}

/**
 * Request オブジェクトのヘッダーから同一オリジン要求かを検証します（未認証POST/DELETE等のCSRF防御用）
 */
export function verifySameOriginRequest(request: Request): boolean {
  return isSameOriginHeader(
    request.headers.get("origin"),
    request.headers.get("host"),
    request.headers.get("x-forwarded-host"),
    request.headers.get("sec-fetch-site")
  );
}

/**
 * 招待トークンをDB保存・照合用にSHA-256ハッシュ化します（DB漏洩時の未使用招待トークン悪用防止）
 * 形式: sha256$<hex>
 */
export function hashInvitationToken(rawToken: string): string {
  const clean = String(rawToken || "").trim();
  if (!clean) return "";
  if (clean.startsWith("sha256$")) return clean;
  return `sha256$${crypto.createHash("sha256").update(clean).digest("hex")}`;
}

/**
 * HMAC署名用のシークレットキーを取得します（未生成の場合は自動生成してsettingsテーブルに保存）
 */
function getSessionSecret(dbOverride?: DatabaseSync): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }

  const db = dbOverride || getDb();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'session_secret'")
    .get() as { value: string } | undefined;

  if (row && row.value) {
    return row.value;
  }

  const generatedSecret = crypto.randomBytes(32).toString("hex");
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('session_secret', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO NOTHING
  `).run(generatedSecret);

  const saved = db
    .prepare("SELECT value FROM settings WHERE key = 'session_secret'")
    .get() as { value: string } | undefined;

  return saved?.value || generatedSecret;
}

/**
 * ユーザーの現在の認証状態（パスワードハッシュ・2FA設定・2FA使用ステップ）を署名入力用コンテキストとして取得します。
 * パスワード変更や2FA設定変更が行われるとコンテキスト値が変化し、過去発行のトークンが即座に自動失効します。
 */
function getUserCredentialContext(
  userId: number,
  includeTotpStep = false,
  dbOverride?: DatabaseSync
): string {
  try {
    const db = dbOverride || getDb();
    const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    const hasTotpStep = userCols.some((c) => c.name === "totp_last_used_step");
    const hasTotpSecret = userCols.some((c) => c.name === "totp_secret");
    const hasTotpEnabled = userCols.some((c) => c.name === "totp_enabled");

    const row = db
      .prepare(`
        SELECT
          password,
          ${hasTotpEnabled ? "COALESCE(totp_enabled, 0)" : "0"} AS totp_enabled,
          ${hasTotpSecret ? "COALESCE(totp_secret, '')" : "''"} AS totp_secret,
          ${hasTotpStep ? "COALESCE(totp_last_used_step, 0)" : "0"} AS totp_last_used_step
        FROM users
        WHERE id = ?
      `)
      .get(userId) as
      | {
          password: string;
          totp_enabled: number;
          totp_secret: string;
          totp_last_used_step: number;
        }
      | undefined;

    if (!row) return "";
    if (includeTotpStep) {
      return `:${row.password}:${row.totp_enabled}:${row.totp_secret}:${row.totp_last_used_step}`;
    }
    return `:${row.password}:${row.totp_enabled}:${row.totp_secret}`;
  } catch {
    return "";
  }
}

/**
 * ユーザーIDからHMAC-SHA256署名付きセッショントークンを生成します
 * 形式: <userId>.<expiresAtMs>.<signatureHex>
 */
export function createSessionToken(
  userId: number,
  maxAgeSec = SESSION_MAX_AGE_SEC,
  dbOverride?: DatabaseSync
): string {
  const expiresAt = Date.now() + maxAgeSec * 1000;
  const payload = `${userId}.${expiresAt}`;
  const secret = getSessionSecret(dbOverride);
  const credContext = getUserCredentialContext(userId, false, dbOverride);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${payload}${credContext}`)
    .digest("hex");
  return `${payload}.${signature}`;
}

/**
 * 署名付きセッショントークンを検証し、有効であればユーザーIDを返します
 */
export function verifySessionToken(
  token: string | undefined | null,
  dbOverride?: DatabaseSync
): number | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [uidStr, expStr, sigHex] = parts;
  const userId = Number(uidStr);
  const expiresAt = Number(expStr);

  if (!Number.isInteger(userId) || userId <= 0 || !Number.isFinite(expiresAt)) {
    return null;
  }

  if (Date.now() > expiresAt) {
    return null;
  }

  const payload = `${uidStr}.${expStr}`;
  const secret = getSessionSecret(dbOverride);
  const credContext = getUserCredentialContext(userId, false, dbOverride);
  const expectedSigHex = crypto
    .createHmac("sha256", secret)
    .update(`${payload}${credContext}`)
    .digest("hex");

  try {
    const sigBuf = Buffer.from(sigHex, "hex");
    const expectedBuf = Buffer.from(expectedSigHex, "hex");
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    return userId;
  } catch {
    return null;
  }
}

/**
 * 2要素認証コード入力待機用の一時署名トークン（有効期限5分）を生成します
 * 形式: 2fa.<userId>.<expiresAtMs>.<signatureHex>
 */
export function createTemp2faToken(
  userId: number,
  maxAgeSec = 300,
  dbOverride?: DatabaseSync
): string {
  const expiresAt = Date.now() + maxAgeSec * 1000;
  const payload = `2fa.${userId}.${expiresAt}`;
  const secret = getSessionSecret(dbOverride);
  const credContext = getUserCredentialContext(userId, true, dbOverride);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${payload}${credContext}`)
    .digest("hex");
  return `${payload}.${signature}`;
}

/**
 * 2要素認証用の一時署名トークンを検証し、有効であればユーザーIDを返します
 */
export function verifyTemp2faToken(
  token: string | undefined | null,
  dbOverride?: DatabaseSync
): number | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "2fa") {
    return null;
  }

  const [, uidStr, expStr, sigHex] = parts;
  const userId = Number(uidStr);
  const expiresAt = Number(expStr);

  if (!Number.isInteger(userId) || userId <= 0 || !Number.isFinite(expiresAt)) {
    return null;
  }

  if (Date.now() > expiresAt) {
    return null;
  }

  const payload = `2fa.${uidStr}.${expStr}`;
  const secret = getSessionSecret(dbOverride);
  const credContext = getUserCredentialContext(userId, true, dbOverride);
  const expectedSigHex = crypto
    .createHmac("sha256", secret)
    .update(`${payload}${credContext}`)
    .digest("hex");

  try {
    const sigBuf = Buffer.from(sigHex, "hex");
    const expectedBuf = Buffer.from(expectedSigHex, "hex");
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    return userId;
  } catch {
    return null;
  }
}

/**
 * 現在のリクエストのCookieからログイン中のユーザー情報を取得します
 * （Originヘッダーが存在する状態変更リクエストではCSRF保護のためHost一致も検証します）
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const headerStore = await headers();
    const origin = headerStore.get("origin");
    const secFetchSite = headerStore.get("sec-fetch-site");
    if (
      (origin || secFetchSite) &&
      !isSameOriginHeader(
        origin,
        headerStore.get("host"),
        headerStore.get("x-forwarded-host"),
        secFetchSite
      )
    ) {
      return null;
    }

    const cookieStore = await cookies();
    const rawCookie =
      cookieStore.get(SESSION_COOKIE_NAME)?.value ||
      cookieStore.get(LEGACY_SESSION_COOKIE_NAME)?.value;
    if (!rawCookie) return null;

    const userId = verifySessionToken(rawCookie);
    if (!userId) return null;

    const db = getDb();
    const user = db
      .prepare(`
        SELECT id, login_id, name, role, is_admin, role_type, color, week_start, show_holidays, totp_enabled, created_at
        FROM users
        WHERE id = ?
      `)
      .get(userId) as SessionUser | undefined;

    return user || null;
  } catch {
    return null;
  }
}

/**
 * セッションCookie用の共通オプションを生成します
 */
export function getSessionCookieOptions(maxAge = SESSION_MAX_AGE_SEC) {
  // 明示的に SESSION_COOKIE_SECURE=true が指定された場合のみ Secure 属性を付与（ローカルLAN・HTTPアクセスでのセッション切断を防止）
  const isSecure = process.env.SESSION_COOKIE_SECURE === "true";
  return {
    path: "/",
    httpOnly: true,
    maxAge,
    sameSite: "lax" as const,
    secure: isSecure,
  };
}
