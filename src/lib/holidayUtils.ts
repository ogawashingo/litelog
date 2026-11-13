// 日本の国民の祝日・振替休日・国民の休日 計算ユーティリティ（方式A: アプリ内蔵方式）
// 外部通信なしで、春分・秋分の天文計算およびハッピーマンデー・振替休日ルールを自動計算します。

export interface HolidayInfo {
  dateString: string; // YYYY-MM-DD
  name: string;       // 祝日名（例: "元日", "成人の日", "春分の日" 等）
}

// キャッシュ用マップ（年 -> 日付文字列 -> 祝日名）
const holidayCacheByYear = new Map<number, Map<string, string>>();

/**
 * 2桁パディング
 */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 春分の日の日付を算出（1980〜2099年対応の国立天文台略算式）
 */
function getVernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/**
 * 秋分の日の日付を算出（1980〜2099年対応の国立天文台略算式）
 */
function getAutumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/**
 * 第n月曜日の日付を取得（ハッピーマンデー用）
 */
function getNthMonday(year: number, month: number, nth: number): number {
  // 当月1日の曜日 (0:日 〜 6:土)
  const firstDay = new Date(year, month - 1, 1).getDay();
  // 第1月曜日の日付
  const firstMonday = firstDay <= 1 ? 1 + (1 - firstDay) : 1 + (8 - firstDay);
  return firstMonday + (nth - 1) * 7;
}

/**
 * 指定した年の日本の祝日マップ（YYYY-MM-DD -> 祝日名）を生成
 */
export function getJapaneseHolidaysForYear(year: number): Map<string, string> {
  const cached = holidayCacheByYear.get(year);
  if (cached) return cached;

  const holidays = new Map<string, string>();

  const setHoliday = (m: number, d: number, name: string) => {
    holidays.set(`${year}-${pad2(m)}-${pad2(d)}`, name);
  };

  // 1. 固定祝日
  setHoliday(1, 1, "元日");
  setHoliday(2, 11, "建国記念の日");
  if (year >= 2020) {
    setHoliday(2, 23, "天皇誕生日");
  } else if (year <= 2018) {
    setHoliday(12, 23, "天皇誕生日");
  }
  setHoliday(4, 29, "昭和の日");
  setHoliday(5, 3, "憲法記念日");
  setHoliday(5, 4, "みどりの日");
  setHoliday(5, 5, "こどもの日");
  setHoliday(11, 3, "文化の日");
  setHoliday(11, 23, "勤労感謝の日");

  // 2. 山の日（2016年新設、東京五輪特例対応）
  if (year >= 2016) {
    if (year === 2020) {
      setHoliday(8, 10, "山の日");
    } else if (year === 2021) {
      setHoliday(8, 8, "山の日");
    } else {
      setHoliday(8, 11, "山の日");
    }
  }

  // 3. ハッピーマンデー祝日（成人の日、海の日、敬老の日、スポーツの日）
  // 成人の日（1月第2月曜）
  setHoliday(1, getNthMonday(year, 1, 2), "成人の日");

  // 海の日（7月第3月曜、2020/2021五輪特例）
  if (year === 2020) {
    setHoliday(7, 23, "海の日");
  } else if (year === 2021) {
    setHoliday(7, 22, "海の日");
  } else {
    setHoliday(7, getNthMonday(year, 7, 3), "海の日");
  }

  // 敬老の日（9月第3月曜）
  const keirouDay = getNthMonday(year, 9, 3);
  setHoliday(9, keirouDay, "敬老の日");

  // スポーツの日（10月第2月曜、2020/2021五輪特例）
  const sportsName = year >= 2020 ? "スポーツの日" : "体育の日";
  if (year === 2020) {
    setHoliday(7, 24, sportsName);
  } else if (year === 2021) {
    setHoliday(7, 23, sportsName);
  } else {
    setHoliday(10, getNthMonday(year, 10, 2), sportsName);
  }

  // 4. 天文計算による祝日（春分の日、秋分の日）
  setHoliday(3, getVernalEquinoxDay(year), "春分の日");
  const shubunDay = getAutumnalEquinoxDay(year);
  setHoliday(9, shubunDay, "秋分の日");

  // 5. 国民の休日の判定（祝日と祝日に挟まれた平日）
  // 敬老の日と秋分の日の間の日（シルバーウィーク）
  if (shubunDay - keirouDay === 2) {
    setHoliday(9, keirouDay + 1, "国民の休日");
  }

  // 6. 振替休日の判定
  // 祝日が日曜日の場合、その日後で最も近い「祝日でない日」を振替休日にする
  const sortedDates = Array.from(holidays.keys()).sort();
  for (const dateStr of sortedDates) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    if (dateObj.getDay() === 0) {
      // 日曜日と重複
      let nextDate = new Date(y, m - 1, d + 1);
      while (true) {
        const nextStr = `${nextDate.getFullYear()}-${pad2(nextDate.getMonth() + 1)}-${pad2(nextDate.getDate())}`;
        if (!holidays.has(nextStr)) {
          holidays.set(nextStr, "振替休日");
          break;
        }
        nextDate = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate() + 1);
      }
    }
  }

  holidayCacheByYear.set(year, holidays);
  return holidays;
}

/**
 * 指定した日付文字列（YYYY-MM-DD または Date）が日本の祝日かどうかを判定
 * 祝日の場合は祝日名を返し、平日の場合は null を返します。
 */
export function getJapaneseHoliday(date: Date | string): string | null {
  let dateStr: string;
  let year: number;

  if (typeof date === "string") {
    dateStr = date.trim().split("T")[0].replace(/\//g, "-");
    year = Number(dateStr.split("-")[0]);
  } else {
    year = date.getFullYear();
    const m = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    dateStr = `${year}-${m}-${d}`;
  }

  if (isNaN(year) || year < 1980 || year > 2099) {
    return null;
  }

  const holidays = getJapaneseHolidaysForYear(year);
  return holidays.get(dateStr) || null;
}
