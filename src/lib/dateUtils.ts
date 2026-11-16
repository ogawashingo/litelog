// ガントチャートおよびタスク管理向け日付・時刻ユーティリティ
// SQLiteのUTCタイムスタンプ（YYYY-MM-DD HH:MM:SS）の正確なパースと、
// 管理ページで設定されたタイムゾーン・フォーマットでの表示変換を提供します。

import { SystemSettings, WeekStartDay } from "@/types";
import { getJapaneseHoliday } from "./holidayUtils";

// デフォルトのシステム時刻設定（日本標準時 JST / 24時間表記・月曜始まり・祝日表示ON）
export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  timezone: "Asia/Tokyo",
  datetimeFormat: "slash_sec",
  hour12: false,
  activityTimeStyle: "both",
  timeOffsetMinutes: 0,
  theme: "cosmic",
  weekStart: "monday",
  showHolidays: true,
  announcementEnabled: false,
  announcementMessage: "",
  announcementType: "info",
  announcementUpdatedAt: "",
};

// 管理ページで選択可能なタイムゾーン一覧
export const TIMEZONE_OPTIONS: { value: string; label: string; offsetLabel: string }[] = [
  { value: "Asia/Tokyo", label: "日本標準時 (Asia/Tokyo)", offsetLabel: "UTC+09:00 (JST)" },
  { value: "UTC", label: "協定世界時 (UTC)", offsetLabel: "UTC+00:00" },
  { value: "local", label: "端末・ブラウザのローカル設定に従う", offsetLabel: "自動検出" },
  { value: "Asia/Seoul", label: "韓国標準時 (Asia/Seoul)", offsetLabel: "UTC+09:00 (KST)" },
  { value: "Asia/Shanghai", label: "中国標準時 (Asia/Shanghai)", offsetLabel: "UTC+08:00 (CST)" },
  { value: "Asia/Taipei", label: "台北時間 (Asia/Taipei)", offsetLabel: "UTC+08:00 (CST)" },
  { value: "Asia/Singapore", label: "シンガポール時間 (Asia/Singapore)", offsetLabel: "UTC+08:00 (SGT)" },
  { value: "Asia/Bangkok", label: "バンコク時間 (Asia/Bangkok)", offsetLabel: "UTC+07:00 (ICT)" },
  { value: "Asia/Kolkata", label: "インド標準時 (Asia/Kolkata)", offsetLabel: "UTC+05:30 (IST)" },
  { value: "Europe/London", label: "ロンドン時間 (Europe/London)", offsetLabel: "UTC+00:00 / +01:00" },
  { value: "Europe/Paris", label: "中央ヨーロッパ時間 (Europe/Paris)", offsetLabel: "UTC+01:00 / +02:00" },
  { value: "America/New_York", label: "米国東部時間 (America/New_York)", offsetLabel: "UTC-05:00 / -04:00" },
  { value: "America/Chicago", label: "米国中部時間 (America/Chicago)", offsetLabel: "UTC-06:00 / -05:00" },
  { value: "America/Los_Angeles", label: "米国太平洋時間 (America/Los_Angeles)", offsetLabel: "UTC-08:00 / -07:00" },
  { value: "Pacific/Honolulu", label: "ハワイ標準時 (Pacific/Honolulu)", offsetLabel: "UTC-10:00 (HST)" },
  { value: "Australia/Sydney", label: "シドニー時間 (Australia/Sydney)", offsetLabel: "UTC+10:00 / +11:00" },
];

/**
 * SQLiteのCURRENT_TIMESTAMP文字列（"YYYY-MM-DD HH:MM:SS" 等のUTC時刻）またはISO文字列を
 * 正確な Date オブジェクトに変換します。
 * SQLite標準の "2026-11-12 03:53:22" はタイムゾーン識別子がないため、
 * そのまま new Date() に渡すとローカル時刻として誤解釈される問題を解消します。
 */
export function parseDbTimestamp(raw: string | Date | null | undefined, offsetMinutes = 0): Date {
  if (!raw) return new Date();
  let date: Date;

  if (raw instanceof Date) {
    date = new Date(raw.getTime());
  } else {
    const trimmed = String(raw).trim();
    // "YYYY-MM-DD HH:MM:SS" 形式（TやZやタイムゾーンオフセットが含まれないSQLiteのUTC文字列）を判定
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed)) {
      date = new Date(trimmed.replace(/\s+/, "T") + "Z");
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed)) {
      // T区切りだが末尾にZや+09:00等がない場合もUTCとして扱う
      date = new Date(trimmed + "Z");
    } else {
      date = new Date(trimmed);
    }
  }

  if (isNaN(date.getTime())) {
    return new Date();
  }

  // 管理ページで設定された手動オフセット（分）を加算
  if (offsetMinutes && !isNaN(offsetMinutes)) {
    date = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  }

  return date;
}

/**
 * 指定されたシステム時刻設定（タイムゾーン・フォーマット・12/24時間制・オフセット）に基づき
 * タイムスタンプを表示用文字列に変換します。
 */
export function formatTimestamp(
  raw: string | Date | null | undefined,
  settings: SystemSettings = DEFAULT_SYSTEM_SETTINGS,
  includeTime = true
): string {
  const cfg = { ...DEFAULT_SYSTEM_SETTINGS, ...settings };
  const date = parseDbTimestamp(raw, cfg.timeOffsetMinutes);

  const tzOption = cfg.timezone && cfg.timezone !== "local" ? cfg.timezone : undefined;

  let parts: Intl.DateTimeFormatPart[];
  try {
    const formatter = new Intl.DateTimeFormat("ja-JP", {
      timeZone: tzOption,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: cfg.hour12,
      hourCycle: cfg.hour12 ? "h12" : "h23",
    });
    parts = formatter.formatToParts(date);
  } catch {
    // 万一無効なタイムゾーンが指定された場合はローカル設定でフォールバック
    const fallbackFormatter = new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: cfg.hour12,
      hourCycle: cfg.hour12 ? "h12" : "h23",
    });
    parts = fallbackFormatter.formatToParts(date);
  }

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || "";

  const year = getPart("year");
  const month = getPart("month").padStart(2, "0");
  const day = getPart("day").padStart(2, "0");
  const dayPeriod = getPart("dayPeriod");
  const hour = getPart("hour").padStart(2, "0");
  const minute = getPart("minute").padStart(2, "0");
  const second = getPart("second").padStart(2, "0");

  // 日付部分の組み立て
  let datePart = `${year}/${month}/${day}`;
  if (cfg.datetimeFormat === "hyphen_sec" || cfg.datetimeFormat === "hyphen_nosec") {
    datePart = `${year}-${month}-${day}`;
  } else if (cfg.datetimeFormat === "jp_full") {
    datePart = `${year}年${month}月${day}日`;
  }

  if (!includeTime) {
    return datePart;
  }

  // 時刻部分の組み立て
  const showSeconds =
    cfg.datetimeFormat === "slash_sec" ||
    cfg.datetimeFormat === "hyphen_sec" ||
    cfg.datetimeFormat === "jp_full";

  const timeCore = showSeconds ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;
  const timePart = cfg.hour12 && dayPeriod ? `${dayPeriod} ${timeCore}` : timeCore;

  return `${datePart} ${timePart}`;
}

/**
 * アクティビティ（「最近の更新」）向けの時刻フォーマッター
 * 設定に応じて「相対表示」「日時表示」「両方併記」を切り替えます。
 */
export function formatActivityTimestamp(
  raw: string | Date | null | undefined,
  settings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
): string {
  const cfg = { ...DEFAULT_SYSTEM_SETTINGS, ...settings };
  const eventDateUtc = parseDbTimestamp(raw, 0);
  const diffMs = Date.now() - eventDateUtc.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let relativeStr = "";
  if (diffSecs < 60) {
    relativeStr = "たった今";
  } else if (diffMins < 60) {
    relativeStr = `${diffMins}分前`;
  } else if (diffHours < 24) {
    relativeStr = `${diffHours}時間前`;
  } else if (diffDays === 1) {
    relativeStr = "昨日";
  } else {
    relativeStr = `${diffDays}日前`;
  }

  const absoluteStr = formatTimestamp(raw, cfg, true);

  if (cfg.activityTimeStyle === "relative") {
    return relativeStr;
  }
  if (cfg.activityTimeStyle === "absolute") {
    return absoluteStr;
  }
  return `${relativeStr} (${absoluteStr})`;
}

/**
 * 本家Backlogの「最近の更新」タイムライン日付見出し用のグルーピング情報を返します。
 * 例: { dateKey: "2026-11-12", dateLabel: "2026年11月12日(木)" }
 */
export function getActivityDateGroup(
  raw: string | Date | null | undefined,
  settings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
): { dateKey: string; dateLabel: string } {
  const cfg = { ...DEFAULT_SYSTEM_SETTINGS, ...settings };
  const date = parseDbTimestamp(raw, cfg.timeOffsetMinutes);
  const tzOption = cfg.timezone && cfg.timezone !== "local" ? cfg.timezone : undefined;

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: tzOption,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).formatToParts(date);
  }

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || "";

  const year = getPart("year");
  const monthNum = getPart("month");
  const dayNum = getPart("day");
  const weekday = getPart("weekday");

  const dateKey = `${year}-${monthNum.padStart(2, "0")}-${dayNum.padStart(2, "0")}`;
  const dateLabel = `${year}年${monthNum}月${dayNum}日(${weekday})`;

  return { dateKey, dateLabel };
}

/**
 * 設定されたタイムゾーン・オフセットにおける「今日」の日付文字列 (YYYY-MM-DD) を返します。
 */
export function getTodayDateString(settings: SystemSettings = DEFAULT_SYSTEM_SETTINGS): string {
  const cfg = { ...DEFAULT_SYSTEM_SETTINGS, ...settings };
  const now = parseDbTimestamp(new Date(), cfg.timeOffsetMinutes);
  const tzOption = cfg.timezone && cfg.timezone !== "local" ? cfg.timezone : undefined;

  try {
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: tzOption,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value.padStart(2, "0");
    const d = parts.find((p) => p.type === "day")?.value.padStart(2, "0");
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // フォールバック
  }
  return formatDateString(now);
}


/**
 * YYYY-MM-DD または YYYY/MM/DD 文字列をローカル時間の Date オブジェクトに変換
 */
export function parseDateString(dateStr: string): Date {
  const normalized = dateStr.trim().replace(/\//g, "-");
  const [y, m, d] = normalized.split("-").map(Number);
  if (!y || !m || !d || isNaN(y) || isNaN(m) || isNaN(d)) {
    return new Date();
  }
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
 * Date オブジェクトを YYYY/MM/DD 文字列に変換（Backlog URLパラメータ形式）
 */
export function formatSlashDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

/**
 * 指定月数分進めた/戻した Date を取得
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
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

/**
 * カレンダーのグリッドセル情報
 */
export interface CalendarDayCell {
  date: Date;
  dateString: string; // "YYYY-MM-DD"
  dayNumber: number;  // 1〜31
  isCurrentMonth: boolean; // 表示対象月かどうか
  isToday: boolean;        // 今日かどうか
  isSaturday: boolean;     // 土曜日かどうか
  isSunday: boolean;       // 日曜日かどうか
  dayOfWeek: number;       // 0: 日, 1: 月, ..., 6: 土
  holidayName?: string | null; // 祝日名（日本の祝日の場合）
}

/**
 * 曜日ヘッダー情報（月曜始まりまたは日曜始まり）
 */
export interface WeekdayLabel {
  name: string;
  isSunday: boolean;
  isSaturday: boolean;
  dayOfWeek: number;
}

/**
 * カレンダーの曜日ヘッダー一覧を取得（月曜始まり / 日曜始まり）
 */
export function getWeekdayLabels(weekStart: WeekStartDay = "monday"): WeekdayLabel[] {
  if (weekStart === "sunday") {
    return [
      { name: "日", isSunday: true, isSaturday: false, dayOfWeek: 0 },
      { name: "月", isSunday: false, isSaturday: false, dayOfWeek: 1 },
      { name: "火", isSunday: false, isSaturday: false, dayOfWeek: 2 },
      { name: "水", isSunday: false, isSaturday: false, dayOfWeek: 3 },
      { name: "木", isSunday: false, isSaturday: false, dayOfWeek: 4 },
      { name: "金", isSunday: false, isSaturday: false, dayOfWeek: 5 },
      { name: "土", isSunday: false, isSaturday: true, dayOfWeek: 6 },
    ];
  } else {
    return [
      { name: "月", isSunday: false, isSaturday: false, dayOfWeek: 1 },
      { name: "火", isSunday: false, isSaturday: false, dayOfWeek: 2 },
      { name: "水", isSunday: false, isSaturday: false, dayOfWeek: 3 },
      { name: "木", isSunday: false, isSaturday: false, dayOfWeek: 4 },
      { name: "金", isSunday: false, isSaturday: false, dayOfWeek: 5 },
      { name: "土", isSunday: false, isSaturday: true, dayOfWeek: 6 },
      { name: "日", isSunday: true, isSaturday: false, dayOfWeek: 0 },
    ];
  }
}

/**
 * 指定した年月のカレンダーグリッド（42セル: 6行×7列）を生成
 * 月曜始まり / 日曜始まり を指定可能
 */
export function getCalendarMonthDays(
  year: number,
  month: number, // 1〜12
  weekStart: WeekStartDay = "monday",
  todayDateStr?: string
): CalendarDayCell[] {
  const actualToday = todayDateStr || formatDateString(new Date());

  // 当月の1日
  const firstDay = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const firstDayOfWeek = firstDay.getDay(); // 0(日) 〜 6(土)

  // 当月の1日より前に埋める前月の日数
  const leadDays = weekStart === "sunday"
    ? firstDayOfWeek
    : (firstDayOfWeek + 6) % 7;

  // カレンダーグリッドの開始日
  const startDate = new Date(year, month - 1, 1 - leadDays, 0, 0, 0, 0);

  const cells: CalendarDayCell[] = [];
  // 常に6行×7列 = 42セルで生成（高さのガタつきを防止）
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i, 0, 0, 0, 0);
    const dateStr = formatDateString(d);
    const dow = d.getDay();
    const holiday = getJapaneseHoliday(dateStr);

    cells.push({
      date: d,
      dateString: dateStr,
      dayNumber: d.getDate(),
      isCurrentMonth: d.getMonth() === month - 1,
      isToday: dateStr === actualToday,
      isSaturday: dow === 6,
      isSunday: dow === 0,
      dayOfWeek: dow,
      holidayName: holiday,
    });
  }

  return cells;
}
