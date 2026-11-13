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
    <html lang="ja">
      <body
        className="antialiased font-sans transition-colors duration-150"
      >
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
