// src/lib/qrcode.ts
// Microsoft Authenticator, Google Authenticator, 1Password 等の全アプリと完全互換な
// 公式 qrcode パッケージによる高精度 QR コード（ISO/IEC 18004準拠）SVG生成
import QRCode from "qrcode";

/**
 * QRコードをインラインSVG文字列として生成します
 * 認証アプリでの認識率を最大化するため、十分なクワイエットゾーン（margin: 4）と
 * 誤り訂正レベル M（約15%復元）を適用します。
 */
export async function generateQrCodeSvg(text: string, pixelSize = 240): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: "svg",
    margin: 4,
    errorCorrectionLevel: "M",
    width: pixelSize,
    color: {
      dark: "#0f172a", // コントラストの高い黒紺
      light: "#ffffff", // 完全な白背景（クワイエットゾーン保護）
    },
  });
  return svg;
}
