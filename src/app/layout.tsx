import type { Metadata } from "next";
import "./globals.css";
import { UserProvider } from "@/components/UserContext";

export const metadata: Metadata = {
  title: "Personal Backlog - チーム＆個人タスク・プロジェクト管理",
  description: "複数人・チーム対応 タスク・プロジェクト管理スタジオ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* 初回ロード時のテーマチラつき(FOUC)を0ミリ秒で防止する初期化スクリプト */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("backlog_theme");if(t){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className="antialiased font-sans transition-colors duration-150"
      >
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
