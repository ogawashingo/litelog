// ガントチャートおよびタスク管理向け日付ユーティリティ
// タイムゾーンによるズレを防ぐため、YYYY-MM-DD形式を基本に安全に取り扱います。

/**
 * YYYY-MM-DD 文字列をローカル時間の Date オブジェクトに変換
 */
export function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Date オブジェクトを YYYY-MM-DD 文字列に変換
 */
export function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 指定日数分進めた/戻した Date を取得
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * 2つの日付の日数差 (date2 - date1) を算出
 */
export function diffInDays(date1: Date, date2: Date): number {
  const utc1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const utc2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
  return Math.round((utc2 - utc1) / 86400000);
}

/**
 * 2つの日付が同じ日かどうか
 */
export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * 週末（土・日）かどうかを判定
 */
export function getWeekendInfo(date: Date): { isWeekend: boolean; isSaturday: boolean; isSunday: boolean } {
  const day = date.getDay();
  return {
    isWeekend: day === 0 || day === 6,
    isSaturday: day === 6,
    isSunday: day === 0,
  };
}

/**
 * 日本語の曜日文字（日、月、火...）を取得
 */
export const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];
export function getWeekdayJa(date: Date): string {
  return WEEKDAY_JA[date.getDay()];
}

/**
 * 指定開始日から終了日までの日付配列を生成
 */
export function generateDateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (current <= last) {
    dates.push(new Date(current.getTime()));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
