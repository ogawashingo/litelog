// Next.js 設定（セキュリティレスポンスヘッダー定義・Docker standaloneビルド対応）
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 用にスタンドアロン出力を有効化
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            // モダンブラウザ向けクリックジャッキング保護（Modern Web Guidance: security §1.4）
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self';",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
