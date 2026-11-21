// サーバー・クライアント共通の入力値バリデーションユーティリティ

// 各テキスト項目の最大文字数定義
export const MAX_LENGTHS = {
  ISSUE_TITLE: 200,
  ISSUE_DESCRIPTION: 50000,
  COMMENT_CONTENT: 20000,
  PROJECT_NAME: 100,
  PROJECT_KEY: 15,
  USER_NAME: 100,
  USER_ROLE: 50,
  LOGIN_ID: 50,
  PASSWORD: 128,
  ANNOUNCEMENT_MESSAGE: 500,
} as const;

export const MIN_LENGTHS = {
  LOGIN_ID: 2,
  PASSWORD_DEFAULT: 4,
  PASSWORD_INVITE: 6,
} as const;

// 招待リンク有効時間の許容範囲（1時間〜30日）
export const INVITATION_HOURS_MIN = 1;
export const INVITATION_HOURS_MAX = 720;

const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const LOGIN_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
const PROJECT_KEY_REGEX = /^[A-Z0-9_]{1,15}$/;

/**
 * YYYY-MM-DD 形式かつカレンダー上に実在する日付かを検証する
 */
export function isValidDateString(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = DATE_REGEX.exec(value.trim());
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * 開始日・期限日のフォーマットおよび前後関係（開始日 <= 期限日）を検証する
 * エラー時はエラーメッセージ文字列、正常時は null を返す
 */
export function validateDateRange(
  startDate: string | null | undefined,
  dueDate: string | null | undefined
): string | null {
  if (startDate !== null && startDate !== undefined && startDate !== "") {
    if (!isValidDateString(startDate)) {
      return "開始日は有効な日付（YYYY-MM-DD形式）で指定してください";
    }
  }
  if (dueDate !== null && dueDate !== undefined && dueDate !== "") {
    if (!isValidDateString(dueDate)) {
      return "期限日は有効な日付（YYYY-MM-DD形式）で指定してください";
    }
  }
  if (startDate && dueDate && startDate > dueDate) {
    return "開始日は期限日以前の日付を指定してください";
  }
  return null;
}

/**
 * 文字列の最大文字数を検証する
 */
export function validateMaxLength(
  value: string,
  maxLength: number,
  fieldLabel: string
): string | null {
  if (value.length > maxLength) {
    return `${fieldLabel}は${maxLength.toLocaleString()}文字以内で入力してください`;
  }
  return null;
}

/**
 * ログインIDの形式・文字数を検証する
 */
export function validateLoginId(loginId: string): string | null {
  const clean = loginId.trim();
  if (!clean || clean.length < MIN_LENGTHS.LOGIN_ID) {
    return `ログインIDは${MIN_LENGTHS.LOGIN_ID}文字以上で入力してください`;
  }
  if (clean.length > MAX_LENGTHS.LOGIN_ID) {
    return `ログインIDは${MAX_LENGTHS.LOGIN_ID}文字以内で入力してください`;
  }
  if (!LOGIN_ID_REGEX.test(clean)) {
    return "ログインIDは半角英数字、ハイフン、アンダースコアのみ使用できます";
  }
  return null;
}

/**
 * パスワードの文字数（最小・最大）を検証する
 */
export function validatePassword(
  password: string,
  minLength: number = MIN_LENGTHS.PASSWORD_DEFAULT,
  fieldLabel: string = "パスワード"
): string | null {
  if (!password || password.length < minLength) {
    return `${fieldLabel}は${minLength}文字以上で入力してください`;
  }
  if (password.length > MAX_LENGTHS.PASSWORD) {
    return `${fieldLabel}は${MAX_LENGTHS.PASSWORD}文字以内で入力してください`;
  }
  return null;
}

/**
 * プロジェクトキーの形式を検証する（大文字正規化後の文字列を渡す）
 */
export function validateProjectKey(normalizedKey: string): string | null {
  if (!PROJECT_KEY_REGEX.test(normalizedKey)) {
    return `プロジェクトキーは半角英数字・アンダースコア（1〜${MAX_LENGTHS.PROJECT_KEY}文字）で指定してください`;
  }
  return null;
}

/**
 * カラーコード（#RRGGBB形式）を検証する
 */
export function validateHexColor(color: unknown): string | null {
  if (typeof color !== "string" || !HEX_COLOR_REGEX.test(color.trim())) {
    return "カラーは #RRGGBB 形式で指定してください";
  }
  return null;
}

/**
 * IANAタイムゾーン文字列として有効かを検証する
 */
export function validateTimezone(timezone: unknown): string | null {
  if (typeof timezone !== "string" || !timezone.trim()) {
    return "タイムゾーンを指定してください";
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone.trim() });
    return null;
  } catch {
    return "無効なタイムゾーンが指定されました";
  }
}

/**
 * 招待リンクの有効時間（時間単位）を検証する
 */
export function validateInvitationHours(hoursValid: unknown): string | null {
  const num = Number(hoursValid);
  if (!Number.isFinite(num) || num < INVITATION_HOURS_MIN || num > INVITATION_HOURS_MAX) {
    return `招待リンクの有効期限は${INVITATION_HOURS_MIN}〜${INVITATION_HOURS_MAX}時間の範囲で指定してください`;
  }
  return null;
}

/**
 * 「処理済み」変更時のレビュー・確認依頼コメントを検証する
 * メンション（@[表示名], @表示名, @login_id）を除いた実質的な依頼本文が1文字以上あるかチェック
 */
export function validateReviewRequestComment(
  content: string,
  knownUserNames: string[] = []
): string | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return "「処理済み」に変更する際は、相手に何を確認してほしいか依頼メッセージを入力してください";
  }

  let bodyWithoutMentions = trimmed;
  // @[表示名] 形式のメンションを除去
  bodyWithoutMentions = bodyWithoutMentions.replace(/@\[[^\]]+\]/g, " ");

  // 既知のユーザー表示名（スペース含む場合あり）に一致する @表示名 を長い順に除去
  const sortedNames = [...knownUserNames]
    .map((n) => n.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    bodyWithoutMentions = bodyWithoutMentions.replace(new RegExp(`@${escaped}(?=[\\s　,、。!！?？]|$)`, "g"), " ");
  }

  // @login_id や一般の @単語 形式のメンションを除去
  bodyWithoutMentions = bodyWithoutMentions.replace(/@[^\s　]+/g, " ");

  if (!bodyWithoutMentions.trim()) {
    return "「処理済み」に変更する際は、相手に何を確認してほしいか依頼メッセージを入力してください（メンションのみは不可）";
  }

  return null;
}
