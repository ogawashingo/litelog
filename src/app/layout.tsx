import type { Metadata, Viewport } from "next";
import "./globals.css";
import { UserProvider } from "@/components/UserContext";
import Toast from "@/components/Toast";

export const metadata: Metadata = {
  title: "litelog - タスク・プロジェクト管理",
  description: "個人や小さなチームで気楽に使えるBacklogライクなタスク管理ツール",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* ブラウザネイティブUIのテーマ適応＆FOUC防止（Modern Web Guidance: dark-mode） */}
        <meta name="color-scheme" content="light dark" />
        {/* 初回ロード時のテーマチラつき(FOUC)を0ミリ秒で防止する初期化スクリプト */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("litelog_theme")||localStorage.getItem("backlog_theme");if(t){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className="antialiased font-sans transition-colors duration-150"
      >
        <UserProvider>
          {children}
          <Toast />
        </UserProvider>
      </body>
    </html>
  );
}
