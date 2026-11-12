import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Backlog - ダッシュボード",
  description: "個人用Backlogクローン タスク・プロジェクト管理",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className="antialiased bg-[#f5f6f7] text-gray-900 font-sans"
      >
        {children}
      </body>
    </html>
  );
}
