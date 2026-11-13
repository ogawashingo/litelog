// 認証・パスワードハッシュ化・署名付きセッション管理・API認可ユーティリティ
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";

export const SESSION_COOKIE_NAME = "backlog_session_uid";
const HASH_PREFIX = "scrypt$";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7日間

export interface SessionUser {
  id: number;
  login_id: string;
  name: string;
  role: string;
  is_admin: number;
  color: string;
  week_start?: string;
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
 * 入力された平文パスワードとDB保存パスワード（ハッシュまたは旧平文）を照合します
 */
export function verifyPassword(plainPassword: string, storedPassword: string): boolean {
  if (!plainPassword || !storedPassword) return false;

  if (isPasswordHashed(storedPassword)) {
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

  // 旧平文パスワードとの後方互換照合（定数時間比較）
  const plainBuf = Buffer.from(String(plainPassword), "utf8");
  const storedBuf = Buffer.from(String(storedPassword), "utf8");
  if (plainBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(plainBuf, storedBuf);
}

/**
 * HMAC署名用のシークレットキーを取得します（未生成の場合は自動生成してsettingsテーブルに保存）
 */
function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }

  const db = getDb();
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
 * ユーザーIDからHMAC-SHA256署名付きセッショントークンを生成します
 * 形式: <userId>.<expiresAtMs>.<signatureHex>
 */
export function createSessionToken(userId: number, maxAgeSec = SESSION_MAX_AGE_SEC): string {
  const expiresAt = Date.now() + maxAgeSec * 1000;
  const payload = `${userId}.${expiresAt}`;
  const secret = getSessionSecret();
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

/**
 * 署名付きセッショントークンを検証し、有効であればユーザーIDを返します
 */
export function verifySessionToken(token: string | undefined | null): number | null {
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
  const secret = getSessionSecret();
  const expectedSigHex = crypto.createHmac("sha256", secret).update(payload).digest("hex");

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
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const rawCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!rawCookie) return null;

    let userId = verifySessionToken(rawCookie);
    // 旧形式の数値のみCookieが残っている場合の後方互換フォールバック
    if (!userId && /^\d+$/.test(rawCookie)) {
      userId = Number(rawCookie);
    }
    if (!userId) return null;

    const db = getDb();
    const user = db
      .prepare(`
        SELECT id, login_id, name, role, is_admin, color, week_start, created_at
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
