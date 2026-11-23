// クリップボードへの安全なテキストコピー関数
// HTTPS環境のモダンAPI（navigator.clipboard）と、HTTP環境・iOS Safari向けのdocument.execCommandフォールバックを両対応

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // 1. モダンブラウザ標準の navigator.clipboard（HTTPS環境・localhost）
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // セキュリティ制限や非SSL等で例外が出た場合はフォールバックへ進む
    }
  }

  // 2. HTTP環境・ローカルネットワークアクセス時のiOS Safari / Chrome向けフォールバック
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    // iOS Safariで画面が勝手にスクロールしたりキーボードが飛び出さないよう固定
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.width = "2em";
    textArea.style.height = "2em";
    textArea.style.padding = "0";
    textArea.style.border = "none";
    textArea.style.outline = "none";
    textArea.style.boxShadow = "none";
    textArea.style.background = "transparent";
    textArea.setAttribute("readonly", "");
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, text.length); // iOS対応

    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error("クリップボードへのコピーに失敗しました:", err);
    return false;
  }
}
