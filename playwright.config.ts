// Playwright E2Eテスト設定ファイル（最低限・最速構成）
import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// .env.local 等の環境変数を自動ロード（テスト認証情報の平文埋め込みを防止）
loadEnvConfig(process.cwd());

export default defineConfig({
  // テストファイルの配置ディレクトリ
  testDir: "./e2e",
  // 各テストのタイムアウト時間 (ミリ秒)
  timeout: 30000,
  // テスト並列実行の制御（DB競合を避けるため1ワーカーで直列実行）
  workers: 1,
  // リトライ回数（ローカルでは0回）
  retries: 0,
  use: {
    // 開発サーバーのベースURL
    baseURL: "http://localhost:3000",
    // 失敗時のみトレースやスクリーンショットを収集
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // 最軽量の Chromium のみでテスト
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // 開発サーバーが未起動の場合は自動起動、起動中の場合は再利用
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
