// クライアント側でユーザー画面に表示してよい安全なエラーのみを扱うユーティリティ

/**
 * 画面へそのまま表示してよい安全な業務・バリデーションエラーを表すクラス。
 * 想定外の JavaScript 例外（SyntaxError / TypeError / ネットワークエラー等）と区別するために使用する。
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * API のエラーレスポンスから表示用の安全なメッセージを取り出し、UserFacingError を生成する。
 * レスポンスが JSON でない場合（プロキシの 502 HTML 等）はフォールバック文言を使用する。
 */
export async function createApiError(
  res: Response,
  fallbackMessage: string
): Promise<UserFacingError> {
  try {
    const data = await res.json();
    if (data && typeof data.error === "string" && data.error.trim().length > 0) {
      return new UserFacingError(data.error);
    }
  } catch {
    // JSON パース失敗時は生の構文エラーを画面に出さずフォールバック文言を使用する
  }
  return new UserFacingError(fallbackMessage);
}

/**
 * catch ブロックで受け取った例外から画面表示用の安全なメッセージを取得する。
 * UserFacingError の場合のみメッセージを返し、それ以外の内部例外はフォールバック文言を返す。
 */
export function getSafeErrorMessage(err: unknown, fallbackMessage: string): string {
  if (err instanceof UserFacingError && err.message.trim().length > 0) {
    return err.message;
  }
  return fallbackMessage;
}
