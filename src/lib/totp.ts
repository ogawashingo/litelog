// src/lib/totp.ts
// 外部依存なし（Zero-dependency）の RFC 6238 / RFC 4226 準拠 TOTP（時間ベースワンタイムパスワード）実装
import crypto from "node:crypto";

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * バイナリバッファを Base32 文字列にエンコードします
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Base32 文字列をバイナリバッファにデコードします
 */
export function base32Decode(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, "").replace(/[\s-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_CHARS.indexOf(clean[i]);
    if (val === -1) {
      continue;
    }
    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * TOTP用のランダムな秘密鍵（Base32形式、20バイト = 32文字）を生成します
 */
export function generateTotpSecret(byteLength = 20): string {
  const randomBytes = crypto.randomBytes(byteLength);
  return base32Encode(randomBytes);
}

/**
 * TOTPシークレットが有効なBase32文字列であり、十分な鍵長（デフォルト16バイト＝128bit以上）を持つか検証します。
 * 0バイト鍵や無効文字混入・低エントロピー鍵の登録を防止します。
 */
export function isValidTotpSecret(secret: unknown, minByteLength = 16): boolean {
  if (typeof secret !== "string") return false;
  const clean = secret.toUpperCase().replace(/=+$/, "").replace(/[\s-]/g, "");
  if (!clean || !/^[A-Z2-7]+$/.test(clean)) {
    return false;
  }
  const decoded = base32Decode(clean);
  return decoded.length >= minByteLength;
}

/**
 * 指定したカウンタ（30秒単位のタイムステップ）に対する6桁のHOTPコードを生成します
 */
export function generateHotpCode(secret: string, counter: number): string {
  const secretBuffer = base32Decode(secret);

  // 8バイトのビッグエンディアンカウンタバッファ
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  // HMAC-SHA1 計算
  const hmac = crypto.createHmac("sha1", secretBuffer).update(counterBuffer).digest();

  // ダイナミックトランケーション (RFC 4226 Section 5.4)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, "0");
}

/**
 * 現在の時刻（または指定タイムスタンプ）に対する6桁のTOTPコードを生成します
 */
export function generateTotpCode(secret: string, timestampMs = Date.now(), stepSec = 30): string {
  const counter = Math.floor(timestampMs / 1000 / stepSec);
  return generateHotpCode(secret, counter);
}

export interface TotpVerifyResult {
  valid: boolean;
  matchedStep: number | null;
  replayed: boolean;
}

/**
 * ユーザーが入力した6桁コードを検証し、一致したタイムステップおよびリプレイ（再利用）有無を返します（RFC 6238 Section 5.2 準拠）
 */
export function verifyTotpCodeWithStep(
  token: string,
  secret: string,
  window = 1,
  timestampMs = Date.now(),
  stepSec = 30,
  lastUsedStep: number | null | undefined = null
): TotpVerifyResult {
  if (!token || !secret || !isValidTotpSecret(secret, 10)) {
    return { valid: false, matchedStep: null, replayed: false };
  }
  const cleanToken = token.trim().replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleanToken)) {
    return { valid: false, matchedStep: null, replayed: false };
  }

  const currentCounter = Math.floor(timestampMs / 1000 / stepSec);

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const candidateStep = currentCounter + errorWindow;
    const calculated = generateHotpCode(secret, candidateStep);
    // タイミング攻撃防止のため crypto.timingSafeEqual を使用
    if (
      calculated.length === cleanToken.length &&
      crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(cleanToken))
    ) {
      if (
        lastUsedStep !== null &&
        lastUsedStep !== undefined &&
        Number.isFinite(Number(lastUsedStep)) &&
        candidateStep <= Number(lastUsedStep)
      ) {
        return { valid: false, matchedStep: candidateStep, replayed: true };
      }
      return { valid: true, matchedStep: candidateStep, replayed: false };
    }
  }

  return { valid: false, matchedStep: null, replayed: false };
}

/**
 * ユーザーが入力した6桁コードを検証します（時刻ズレ許容 window: デフォルト前後1ステップ = ±30秒）
 */
export function verifyTotpCode(
  token: string,
  secret: string,
  window = 1,
  timestampMs = Date.now(),
  stepSec = 30
): boolean {
  return verifyTotpCodeWithStep(token, secret, window, timestampMs, stepSec).valid;
}

/**
 * 認証アプリ（Google Authenticator, Microsoft Authenticator等）登録用の URI を生成します
 * ※ Microsoft Authenticator 等での互換性を最大化するため、デフォルトパラメータはクエリから省略し
 *    label と issuer パラメータを標準仕様に厳密に準拠させます。
 */
export function getTotpUri(
  secret: string,
  accountName: string,
  issuer = "litelog"
): string {
  const cleanAccount = encodeURIComponent(accountName.trim());
  const cleanIssuer = encodeURIComponent(issuer.trim());
  const cleanSecret = secret.toUpperCase().replace(/[\s=-]/g, "");
  return `otpauth://totp/${cleanIssuer}:${cleanAccount}?secret=${cleanSecret}&issuer=${cleanIssuer}`;
}
