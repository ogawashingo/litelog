// ルートレイアウト全体のエラーバウンダリ画面（最終防衛線として内部情報を遮断）
"use client";

import { useEffect } from "react";
import Link from "next/link";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // 詳細情報はコンソールにのみ記録し、画面には一切表示しない
    console.error("グローバルアプリケーションエラー:", error);
  }, [error]);

  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f3f4f9",
          color: "#0f172a",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "16px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "32px",
            textAlign: "center",
            boxShadow: "0 10px 25px rgba(15, 23, 42, 0.08)",
          }}
        >
          <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 12px" }}>
            予期しないエラーが発生しました
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "#475569",
              lineHeight: 1.6,
              margin: "0 0 24px",
            }}
          >
            ページの読み込み中に問題が発生しました。画面を再読み込みして再度お試しください。
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                backgroundColor: "#4f46e5",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 18px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              再試行する
            </button>
            <Link
              href="/"
              style={{
                backgroundColor: "#ffffff",
                color: "#334155",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                padding: "10px 18px",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              トップページへ
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
