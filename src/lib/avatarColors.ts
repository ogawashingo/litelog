// チームメンバー・アカウント管理用のアバター・テーマカラー定義
export interface AvatarColorOption {
  value: string; // 16進数カラーコード（HEX）
  label: string; // 日本語カラー名
  group: string; // カラー系統カテゴリ
}

// 豊富なカラーバリエーション（全26色・視認性と美しさを両立したパレット）
export const AVATAR_COLORS: AvatarColorOption[] = [
  // 1. ブルー・インディゴ系（誠実・知性・コズミック）
  { value: "#4f46e5", label: "コズミックインディゴ", group: "ブルー・インディゴ" },
  { value: "#3b82f6", label: "ブライトブルー", group: "ブルー・インディゴ" },
  { value: "#1d4ed8", label: "ロイヤルサファイア", group: "ブルー・インディゴ" },
  { value: "#0284c7", label: "オーシャンブルー", group: "ブルー・インディゴ" },

  // 2. シアン・ティール系（爽快・洗練・先進）
  { value: "#06b6d4", label: "ターコイズシアン", group: "シアン・ティール" },
  { value: "#0891b2", label: "ディープシアン", group: "シアン・ティール" },
  { value: "#0d9488", label: "エメラルドティール", group: "シアン・ティール" },
  { value: "#0f766e", label: "ダークティール", group: "シアン・ティール" },

  // 3. パープル・バイオレット系（創造・高貴・エレガント）
  { value: "#8b5cf6", label: "アメジストバイオレット", group: "パープル・バイオレット" },
  { value: "#7c3aed", label: "ディープバイオレット", group: "パープル・バイオレット" },
  { value: "#a855f7", label: "ブライトパープル", group: "パープル・バイオレット" },
  { value: "#d946ef", label: "ネオンフューシャ", group: "パープル・バイオレット" },

  // 4. ピンク・ローズ系（親しみ・華やか・アクセント）
  { value: "#ec4899", label: "ローズピンク", group: "ピンク・ローズ" },
  { value: "#db2777", label: "マゼンタピンク", group: "ピンク・ローズ" },
  { value: "#f43f5e", label: "コーラルローズ", group: "ピンク・ローズ" },
  { value: "#be123c", label: "ルビーレッド", group: "ピンク・ローズ" },

  // 5. レッド・オレンジ・アンバー系（活力・情熱・温かみ）
  { value: "#ef4444", label: "クリムゾンレッド", group: "レッド・オレンジ・アンバー" },
  { value: "#ea580c", label: "コーラルオレンジ", group: "レッド・オレンジ・アンバー" },
  { value: "#f97316", label: "マンダリンオレンジ", group: "レッド・オレンジ・アンバー" },
  { value: "#f59e0b", label: "サンシャインアンバー", group: "レッド・オレンジ・アンバー" },

  // 6. グリーン・アース・シック系（安心・ナチュラル・モダン）
  { value: "#10b981", label: "ミントグリーン", group: "グリーン・アース・シック" },
  { value: "#059669", label: "エメラルドグリーン", group: "グリーン・アース・シック" },
  { value: "#15803d", label: "フォレストグリーン", group: "グリーン・アース・シック" },
  { value: "#475569", label: "スレートチャコール", group: "グリーン・アース・シック" },
  { value: "#57534e", label: "ウォームストーン", group: "グリーン・アース・シック" },
  { value: "#334155", label: "クールナイト", group: "グリーン・アース・シック" },
];

// HEXカラーコードのみの配列（インデックス計算・既存互換用）
export const AVATAR_COLOR_VALUES = AVATAR_COLORS.map((c) => c.value);

// カラーコードからラベル（名前）を取得するヘルパー関数
export function getAvatarColorLabel(hex?: string | null): string {
  if (!hex) return "未設定";
  const found = AVATAR_COLORS.find(
    (c) => c.value.toLowerCase() === hex.toLowerCase()
  );
  if (found) return found.label;
  return `カスタム (${hex.toUpperCase()})`;
}
