// デザインカラーテーマ定義およびパレット・メタデータ管理
import { ThemeId } from "@/types";

export interface ThemeConfig {
  id: ThemeId;
  name: string;           // 日本語表示名
  englishName: string;    // 英語名
  description: string;    // 説明
  hasGradient: boolean;   // グラデーションの有無
  badge?: string;         // おすすめ・特徴バッジ
  palette: {
    header: string;       // ヘッダー背景CSS
    headerBorder: string; // ヘッダー下部ボーダーCSS
    primaryBtn: string;   // プライマリボタン（課題追加等）CSS
    accent: string;       // メインアクセントカラー（HEX）
    subAccent: string;    // サブアクセントカラー（HEX）
    background: string;   // 背景基本色（HEX）
    previewBorder: string;// プレビュー用ボーダー色
  };
}

export const DEFAULT_THEME_ID: ThemeId = "cosmic";

export const THEME_LIST: ThemeConfig[] = [
  {
    id: "cosmic",
    name: "コズミック・グラデーション",
    englishName: "Cosmic Gradient",
    description: "インディゴ〜バイオレット〜パープルの鮮やかな多層グラデーションと光彩背景。先進的でクリエイティブな世界観。",
    hasGradient: true,
    badge: "初期デフォルト・華やか",
    palette: {
      header: "linear-gradient(to right, #1e1b4b, #312e81, #4c1d95)",
      headerBorder: "rgba(129, 140, 248, 0.25)",
      primaryBtn: "linear-gradient(to right, #f43f5e, #f59e0b)",
      accent: "#6366f1",
      subAccent: "#f43f5e",
      background: "#f3f4f9",
      previewBorder: "#c7d2fe",
    },
  },
  {
    id: "monochrome",
    name: "シック・モノクロ＆オレンジ",
    englishName: "Chic Monochrome",
    description: "グラデーション一切なし！マットブラックとクールホワイト、鮮烈なビビッドオレンジのコントラスト。洗練されたミニマルデザイン。",
    hasGradient: false,
    badge: "おすすめ・グラデなし",
    palette: {
      header: "#18181b",
      headerBorder: "#27272a",
      primaryBtn: "#ea580c",
      accent: "#ea580c",
      subAccent: "#f97316",
      background: "#f4f4f5",
      previewBorder: "#d4d4d8",
    },
  },
  {
    id: "forest",
    name: "北欧フォレスト＆ミント",
    englishName: "Nordic Forest",
    description: "深みのあるフォレストグリーンと爽やかなミント。グラデーションなしの落ち着いたトーンで、長時間のタスク管理でも目が疲れにくいデザイン。",
    hasGradient: false,
    badge: "目に優しい・グラデなし",
    palette: {
      header: "#064e3b",
      headerBorder: "rgba(52, 211, 153, 0.25)",
      primaryBtn: "#059669",
      accent: "#059669",
      subAccent: "#10b981",
      background: "#f0fdf4",
      previewBorder: "#a7f3d0",
    },
  },
  {
    id: "navy",
    name: "モダン・ネイビー＆シアン",
    englishName: "Modern Navy",
    description: "信頼感のあるディープネイビーとシャープなシアンブルー。王道ビジネスシーンに最適なクリーンで知的なフラットデザイン。",
    hasGradient: false,
    badge: "ビジネス・グラデなし",
    palette: {
      header: "#0f172a",
      headerBorder: "rgba(56, 189, 248, 0.2)",
      primaryBtn: "#0284c7",
      accent: "#0284c7",
      subAccent: "#38bdf8",
      background: "#f8fafc",
      previewBorder: "#cbd5e1",
    },
  },
  {
    id: "sunset",
    name: "サンセット・コーラル＆アンバー",
    englishName: "Sunset Warmth",
    description: "夕暮れのような温かみのある深紅・テラコッタ・アンバーのグラデーション。ポジティブで活気あるチームワークに最適。",
    hasGradient: true,
    badge: "温かみ・グラデあり",
    palette: {
      header: "linear-gradient(to right, #831843, #9a3412, #c2410c)",
      headerBorder: "rgba(251, 146, 60, 0.25)",
      primaryBtn: "linear-gradient(to right, #e11d48, #ea580c)",
      accent: "#ea580c",
      subAccent: "#f59e0b",
      background: "#fff7ed",
      previewBorder: "#fed7aa",
    },
  },
  {
    id: "dark",
    name: "ミッドナイト・サイバーダーク",
    englishName: "Midnight Dark",
    description: "漆黒とダークスレートの背景に、ネオンバイオレット＆シアンが映える開発者向けスタイリッシュダークテーマ。",
    hasGradient: true,
    badge: "ダークモード",
    palette: {
      header: "#09090b",
      headerBorder: "#27272a",
      primaryBtn: "linear-gradient(to right, #6366f1, #8b5cf6)",
      accent: "#6366f1",
      subAccent: "#a855f7",
      background: "#0f172a",
      previewBorder: "#334155",
    },
  },
];

// テーマIDからテーマ設定を取得するヘルパー
export function getThemeConfig(id: ThemeId | string | undefined): ThemeConfig {
  const found = THEME_LIST.find((t) => t.id === id);
  return found || THEME_LIST[0];
}
