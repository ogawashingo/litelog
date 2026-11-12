// システム設定（時刻・タイムゾーン・表示フォーマット等）取得・更新API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { SystemSettings, DateTimeFormatType, ActivityTimeStyle } from "@/types";
import { DEFAULT_SYSTEM_SETTINGS } from "@/lib/dateUtils";

const VALID_FORMATS: DateTimeFormatType[] = [
  "slash_sec",
  "slash_nosec",
  "hyphen_sec",
  "hyphen_nosec",
  "jp_full",
];

const VALID_ACTIVITY_STYLES: ActivityTimeStyle[] = ["both", "absolute", "relative"];

// DBから現在のシステム設定を構築して返すヘルパー
function loadSettingsFromDb(): SystemSettings {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];

  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.key, r.value);
  }

  const rawFormat = map.get("datetimeFormat") as DateTimeFormatType | undefined;
  const rawActivityStyle = map.get("activityTimeStyle") as ActivityTimeStyle | undefined;
  const rawOffset = Number(map.get("timeOffsetMinutes") ?? 0);

  return {
    timezone: map.get("timezone") || DEFAULT_SYSTEM_SETTINGS.timezone,
    datetimeFormat:
      rawFormat && VALID_FORMATS.includes(rawFormat)
        ? rawFormat
        : DEFAULT_SYSTEM_SETTINGS.datetimeFormat,
    hour12: map.get("hour12") === "true",
    activityTimeStyle:
      rawActivityStyle && VALID_ACTIVITY_STYLES.includes(rawActivityStyle)
        ? rawActivityStyle
        : DEFAULT_SYSTEM_SETTINGS.activityTimeStyle,
    timeOffsetMinutes: isNaN(rawOffset) ? 0 : rawOffset,
  };
}

// システム設定の取得
export async function GET() {
  try {
    const settings = loadSettingsFromDb();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("システム設定取得エラー:", error);
    return NextResponse.json(DEFAULT_SYSTEM_SETTINGS);
  }
}

// システム設定の更新
export async function PUT(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();

    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `);

    if (typeof body.timezone === "string" && body.timezone.trim()) {
      upsert.run("timezone", body.timezone.trim());
    }

    if (
      typeof body.datetimeFormat === "string" &&
      VALID_FORMATS.includes(body.datetimeFormat as DateTimeFormatType)
    ) {
      upsert.run("datetimeFormat", body.datetimeFormat);
    }

    if (typeof body.hour12 === "boolean") {
      upsert.run("hour12", String(body.hour12));
    }

    if (
      typeof body.activityTimeStyle === "string" &&
      VALID_ACTIVITY_STYLES.includes(body.activityTimeStyle as ActivityTimeStyle)
    ) {
      upsert.run("activityTimeStyle", body.activityTimeStyle);
    }

    if (body.timeOffsetMinutes !== undefined) {
      const offsetNum = Math.max(-1440, Math.min(1440, Math.round(Number(body.timeOffsetMinutes) || 0)));
      upsert.run("timeOffsetMinutes", String(offsetNum));
    }

    const updated = loadSettingsFromDb();
    return NextResponse.json(updated);
  } catch (error) {
    console.error("システム設定更新エラー:", error);
    return NextResponse.json({ error: "システム設定の保存に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  return PUT(request);
}
