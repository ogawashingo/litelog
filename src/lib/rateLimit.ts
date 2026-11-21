// ログイン・2要素認証の試行回数レート制限およびロック管理ユーティリティ
import { DatabaseSync } from "node:sqlite";

export type RateLimitScope = "login" | "login_ip" | "2fa";

export interface RateLimitPolicy {
  maxAttempts: number;     // ウィンドウ内の最大許容失敗回数
  windowSeconds: number;   // 失敗回数を集計する時間窓（秒）
  lockSeconds: number;     // しきい値到達時のロック時間（秒）
  label: string;           // 管理画面表示用の日本語ラベル
}

// OWASP推奨と運用バランスを踏まえたレート制限ポリシー定義
export const RATE_LIMIT_POLICIES: Record<RateLimitScope, RateLimitPolicy> = {
  // 通常ログイン（ログインID × IPアドレス単位）: 15分以内に5回失敗で15分間ロック
  login: {
    maxAttempts: 5,
    windowSeconds: 15 * 60,
    lockSeconds: 15 * 60,
    label: "ログイン（ID×IP）",
  },
  // 同一IPからの大量試行防止（IP単体）: 15分以内に20回失敗で15分間ロック
  login_ip: {
    maxAttempts: 20,
    windowSeconds: 15 * 60,
    lockSeconds: 15 * 60,
    label: "ログイン（IP制限）",
  },
  // 2要素認証コード検証（ログインID × IPアドレス単位）: 5分以内に5回失敗で15分間ロック
  "2fa": {
    maxAttempts: 5,
    windowSeconds: 5 * 60,
    lockSeconds: 15 * 60,
    label: "2要素認証（2FA）",
  },
};

export interface RateLimitCheckResult {
  allowed: boolean;
  failedCount: number;
  maxAttempts: number;
  remainingAttempts: number;
  retryAfterSec: number;
  lockedUntil: string | null;
}

export interface RateLimitStatusItem {
  id: number;
  scope: RateLimitScope;
  scope_label: string;
  identifier: string;
  ip_address: string;
  failed_count: number;
  max_attempts: number;
  first_failed_at: string | null;
  last_failed_at: string | null;
  locked_until: string | null;
  is_locked: boolean;
  retry_after_sec: number;
  user_id: number | null;
  user_name: string | null;
  user_color: string | null;
  user_role: string | null;
}

interface RateLimitRow {
  id: number;
  scope: string;
  identifier: string;
  ip_address: string;
  failed_count: number;
  first_failed_at: string | null;
  last_failed_at: string | null;
  locked_until: string | null;
}

/**
 * リクエストヘッダーからクライアントIPアドレスを安全に抽出します
 * （不正文字列インジェクション防止のためIPアドレス文字種を検証）
 */
export function getClientIp(request: Request): string {
  if (process.env.TRUST_PROXY === "false") {
    return "local";
  }
  const sanitizeIp = (raw: string | undefined | null): string | null => {
    if (!raw) return null;
    const trimmed = raw.trim().slice(0, 64);
    if (!trimmed || !/^[0-9a-fA-F:.\-%]+$/.test(trimmed)) {
      return null;
    }
    return trimmed;
  };

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const firstIp = sanitizeIp(xff.split(",")[0]);
    if (firstIp) return firstIp;
  }
  const realIp = sanitizeIp(request.headers.get("x-real-ip"));
  if (realIp) return realIp;
  return "local";
}

/**
 * 識別子を正規化します（大文字小文字を統一してバイパスを防止）
 */
function normalizeIdentifier(identifier: string): string {
  return String(identifier || "").trim().toLowerCase().slice(0, 128);
}

/**
 * 残りロック時間を分かりやすい日本語表記に整形します
 */
export function formatRetryAfterJa(retryAfterSec: number): string {
  if (retryAfterSec <= 60) {
    return `${Math.max(1, retryAfterSec)}秒`;
  }
  const minutes = Math.ceil(retryAfterSec / 60);
  return `約${minutes}分`;
}

/**
 * 現在のレート制限状態を確認します（ロック期限切れの場合は自動リセット）
 * ※ login / 2fa スコープでは X-Forwarded-For 偽装や分散IPによる総当たり攻撃を防ぐため、
 *   同一アカウント（identifier）に対する複数IP横断のロック状態・累積失敗数も統合判定します。
 */
export function checkRateLimit(
  db: DatabaseSync,
  params: { scope: RateLimitScope; identifier: string; ipAddress: string; nowMs?: number }
): RateLimitCheckResult {
  const { scope, ipAddress } = params;
  const identifier = normalizeIdentifier(params.identifier);
  const nowMs = params.nowMs ?? Date.now();
  const policy = RATE_LIMIT_POLICIES[scope];

  const rows = (
    scope === "login_ip"
      ? db
          .prepare(
            "SELECT id, scope, identifier, ip_address, failed_count, first_failed_at, last_failed_at, locked_until FROM login_rate_limits WHERE scope = ? AND identifier = ? AND ip_address = ?"
          )
          .all(scope, identifier, ipAddress)
      : db
          .prepare(
            "SELECT id, scope, identifier, ip_address, failed_count, first_failed_at, last_failed_at, locked_until FROM login_rate_limits WHERE scope = ? AND identifier = ?"
          )
          .all(scope, identifier)
  ) as unknown as RateLimitRow[];

  if (!rows || rows.length === 0) {
    return {
      allowed: true,
      failedCount: 0,
      maxAttempts: policy.maxAttempts,
      remainingAttempts: policy.maxAttempts,
      retryAfterSec: 0,
      lockedUntil: null,
    };
  }

  let totalActiveFailed = 0;
  let maxLockedUntilMs = 0;
  let maxLockedUntilIso: string | null = null;
  const expiredIds: number[] = [];

  for (const r of rows) {
    if (r.locked_until) {
      const lockedUntilMs = Date.parse(r.locked_until);
      if (Number.isFinite(lockedUntilMs) && lockedUntilMs > nowMs) {
        totalActiveFailed += r.failed_count;
        if (lockedUntilMs > maxLockedUntilMs) {
          maxLockedUntilMs = lockedUntilMs;
          maxLockedUntilIso = r.locked_until;
        }
        continue;
      }
      // ロック期限が切れていれば自動解除対象
      expiredIds.push(r.id);
      continue;
    }

    if (r.first_failed_at) {
      const firstFailedMs = Date.parse(r.first_failed_at);
      if (Number.isFinite(firstFailedMs) && nowMs - firstFailedMs > policy.windowSeconds * 1000) {
        expiredIds.push(r.id);
        continue;
      }
    }

    totalActiveFailed += r.failed_count;
  }

  if (expiredIds.length > 0) {
    const placeholders = expiredIds.map(() => "?").join(",");
    db.prepare(`DELETE FROM login_rate_limits WHERE id IN (${placeholders})`).run(...expiredIds);
  }

  if (maxLockedUntilMs > nowMs && maxLockedUntilIso) {
    const retryAfterSec = Math.max(1, Math.ceil((maxLockedUntilMs - nowMs) / 1000));
    return {
      allowed: false,
      failedCount: totalActiveFailed,
      maxAttempts: policy.maxAttempts,
      remainingAttempts: 0,
      retryAfterSec,
      lockedUntil: maxLockedUntilIso,
    };
  }

  if (totalActiveFailed >= policy.maxAttempts) {
    const lockedUntilIso = new Date(nowMs + policy.lockSeconds * 1000).toISOString();
    return {
      allowed: false,
      failedCount: totalActiveFailed,
      maxAttempts: policy.maxAttempts,
      remainingAttempts: 0,
      retryAfterSec: policy.lockSeconds,
      lockedUntil: lockedUntilIso,
    };
  }

  return {
    allowed: true,
    failedCount: totalActiveFailed,
    maxAttempts: policy.maxAttempts,
    remainingAttempts: Math.max(0, policy.maxAttempts - totalActiveFailed),
    retryAfterSec: 0,
    lockedUntil: null,
  };
}

/**
 * 認証失敗を記録し、しきい値に達した場合はロックを設定します
 */
export function recordAuthFailure(
  db: DatabaseSync,
  params: { scope: RateLimitScope; identifier: string; ipAddress: string; nowMs?: number }
): RateLimitCheckResult {
  const { scope, ipAddress } = params;
  const identifier = normalizeIdentifier(params.identifier);
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const policy = RATE_LIMIT_POLICIES[scope];

  const row = db
    .prepare(
      "SELECT id, scope, identifier, ip_address, failed_count, first_failed_at, last_failed_at, locked_until FROM login_rate_limits WHERE scope = ? AND identifier = ? AND ip_address = ?"
    )
    .get(scope, identifier, ipAddress) as RateLimitRow | undefined;

  let nextCount = 1;
  let firstFailedIso = nowIso;

  if (row) {
    const firstFailedMs = row.first_failed_at ? Date.parse(row.first_failed_at) : NaN;
    const lockedUntilMs = row.locked_until ? Date.parse(row.locked_until) : NaN;
    const isWindowActive =
      Number.isFinite(firstFailedMs) && nowMs - firstFailedMs <= policy.windowSeconds * 1000;
    const isLockExpired = Number.isFinite(lockedUntilMs) && lockedUntilMs <= nowMs;

    if (isWindowActive && !isLockExpired) {
      nextCount = row.failed_count + 1;
      firstFailedIso = row.first_failed_at || nowIso;
    }
  }

  // login / 2fa スコープでは同一識別子に対する他IPからの有効期間内失敗数も合算してロック判定（XFF偽装バイパス防止）
  let otherIpActiveFailures = 0;
  if (scope !== "login_ip") {
    const otherRows = db
      .prepare(
        "SELECT id, failed_count, first_failed_at, locked_until FROM login_rate_limits WHERE scope = ? AND identifier = ? AND ip_address != ?"
      )
      .all(scope, identifier, ipAddress) as unknown as RateLimitRow[];
    for (const orow of otherRows) {
      const fMs = orow.first_failed_at ? Date.parse(orow.first_failed_at) : NaN;
      const lMs = orow.locked_until ? Date.parse(orow.locked_until) : NaN;
      const winActive = Number.isFinite(fMs) && nowMs - fMs <= policy.windowSeconds * 1000;
      const lockActive = Number.isFinite(lMs) && lMs > nowMs;
      if (winActive || lockActive) {
        otherIpActiveFailures += orow.failed_count;
      }
    }
  }

  const effectiveTotalCount = nextCount + otherIpActiveFailures;
  const shouldLock = effectiveTotalCount >= policy.maxAttempts;
  const lockedUntilIso = shouldLock
    ? new Date(nowMs + policy.lockSeconds * 1000).toISOString()
    : null;

  db.prepare(`
    INSERT INTO login_rate_limits (scope, identifier, ip_address, failed_count, first_failed_at, last_failed_at, locked_until, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(scope, identifier, ip_address) DO UPDATE SET
      failed_count = excluded.failed_count,
      first_failed_at = excluded.first_failed_at,
      last_failed_at = excluded.last_failed_at,
      locked_until = excluded.locked_until,
      updated_at = CURRENT_TIMESTAMP
  `).run(scope, identifier, ipAddress, nextCount, firstFailedIso, nowIso, lockedUntilIso);

  return {
    allowed: !shouldLock,
    failedCount: effectiveTotalCount,
    maxAttempts: policy.maxAttempts,
    remainingAttempts: Math.max(0, policy.maxAttempts - effectiveTotalCount),
    retryAfterSec: shouldLock ? policy.lockSeconds : 0,
    lockedUntil: lockedUntilIso,
  };
}

/**
 * 認証成功時に該当の失敗カウント・ロック状態をクリアします
 */
export function resetAuthRateLimit(
  db: DatabaseSync,
  params: { scope: RateLimitScope; identifier: string; ipAddress: string }
): void {
  const identifier = normalizeIdentifier(params.identifier);
  if (params.scope === "login_ip") {
    db.prepare(
      "DELETE FROM login_rate_limits WHERE scope = ? AND identifier = ? AND ip_address = ?"
    ).run(params.scope, identifier, params.ipAddress);
  } else {
    db.prepare(
      "DELETE FROM login_rate_limits WHERE scope = ? AND identifier = ?"
    ).run(params.scope, identifier);
  }
}

/**
 * 管理画面用：現在ロック中および直近の失敗試行一覧を取得します（期限切れの古いレコードは自動整理）
 */
export function listRateLimitStatuses(db: DatabaseSync, nowMs = Date.now()): RateLimitStatusItem[] {
  const rows = db
    .prepare(`
      SELECT
        r.id,
        r.scope,
        r.identifier,
        r.ip_address,
        r.failed_count,
        r.first_failed_at,
        r.last_failed_at,
        r.locked_until,
        u.id AS user_id,
        u.name AS user_name,
        u.color AS user_color,
        u.role AS user_role
      FROM login_rate_limits r
      LEFT JOIN users u ON r.scope != 'login_ip' AND LOWER(u.login_id) = LOWER(r.identifier)
      ORDER BY
        CASE WHEN r.locked_until IS NOT NULL THEN 0 ELSE 1 END ASC,
        r.last_failed_at DESC,
        r.id DESC
    `)
    .all() as (RateLimitRow & {
    user_id: number | null;
    user_name: string | null;
    user_color: string | null;
    user_role: string | null;
  })[];

  const expiredIds: number[] = [];
  const items: RateLimitStatusItem[] = [];

  for (const row of rows) {
    const scope = (row.scope in RATE_LIMIT_POLICIES ? row.scope : "login") as RateLimitScope;
    const policy = RATE_LIMIT_POLICIES[scope];

    let isLocked = false;
    let retryAfterSec = 0;

    if (row.locked_until) {
      const lockedMs = Date.parse(row.locked_until);
      if (Number.isFinite(lockedMs) && lockedMs > nowMs) {
        isLocked = true;
        retryAfterSec = Math.max(1, Math.ceil((lockedMs - nowMs) / 1000));
      } else {
        expiredIds.push(row.id);
        continue;
      }
    } else if (row.first_failed_at) {
      const firstMs = Date.parse(row.first_failed_at);
      if (Number.isFinite(firstMs) && nowMs - firstMs > policy.windowSeconds * 1000) {
        expiredIds.push(row.id);
        continue;
      }
    }

    items.push({
      id: row.id,
      scope,
      scope_label: policy.label,
      identifier: row.identifier,
      ip_address: row.ip_address,
      failed_count: row.failed_count,
      max_attempts: policy.maxAttempts,
      first_failed_at: row.first_failed_at,
      last_failed_at: row.last_failed_at,
      locked_until: row.locked_until,
      is_locked: isLocked,
      retry_after_sec: retryAfterSec,
      user_id: row.user_id,
      user_name: row.user_name,
      user_color: row.user_color,
      user_role: row.user_role,
    });
  }

  // 期限切れレコードをクリーンアップ
  if (expiredIds.length > 0) {
    const placeholders = expiredIds.map(() => "?").join(",");
    db.prepare(`DELETE FROM login_rate_limits WHERE id IN (${placeholders})`).run(...expiredIds);
  }

  return items;
}

/**
 * 管理者による個別ロック解除
 */
export function unlockRateLimitById(db: DatabaseSync, id: number): boolean {
  const result = db.prepare("DELETE FROM login_rate_limits WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

/**
 * 管理者による全ロック一括解除
 */
export function unlockAllRateLimits(db: DatabaseSync): number {
  const result = db.prepare("DELETE FROM login_rate_limits").run();
  return Number(result.changes);
}
