// src/lib/qrcode.ts
// 外部依存なし（Zero-dependency）のピュアTypeScriptによるQRコード（ISO/IEC 18004）SVG生成実装
// Project Nayuki (MIT License) の高信頼アルゴリズムをベースに軽量化

export type QrErrorCorrectionLevel = "LOW" | "MEDIUM" | "QUARTILE" | "HIGH";

// ガロア体 GF(256) テーブル
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);

(() => {
  let value = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = value;
    LOG_TABLE[value] = i;
    value = ((value << 1) ^ (value >= 128 ? 0x11d : 0)) & 0xff;
  }
  EXP_TABLE[255] = EXP_TABLE[0];
})();

function gfMultiply(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[x] + LOG_TABLE[y]) % 255];
}

// リード・ソロモン誤り訂正多項式の計算
function calcReedSolomonDivisor(degree: number): Uint8Array {
  let result = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(result.length + 1);
    for (let j = 0; j < result.length; j++) {
      next[j] ^= gfMultiply(result[j], EXP_TABLE[i]);
      next[j + 1] ^= result[j];
    }
    result = next;
  }
  return result;
}

function calcReedSolomonRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const remainder = new Uint8Array(divisor.length - 1);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[remainder.length - 1] = 0;
    for (let i = 0; i < remainder.length; i++) {
      remainder[i] ^= gfMultiply(divisor[i], factor);
    }
  }
  return remainder;
}

// バージョン・誤り訂正レベルごとのパラメータテーブル (Version 1〜10)
interface QrVersionInfo {
  version: number;
  totalDataBytes: number;
  ecBytesPerBlock: number;
  numBlocksGroup1: number;
  dataBytesGroup1: number;
  numBlocksGroup2: number;
  dataBytesGroup2: number;
}

// レベル M (約15% 誤り訂正) のテーブル
const VERSION_INFO_M: QrVersionInfo[] = [
  { version: 1, totalDataBytes: 16, ecBytesPerBlock: 10, numBlocksGroup1: 1, dataBytesGroup1: 16, numBlocksGroup2: 0, dataBytesGroup2: 0 },
  { version: 2, totalDataBytes: 28, ecBytesPerBlock: 16, numBlocksGroup1: 1, dataBytesGroup1: 28, numBlocksGroup2: 0, dataBytesGroup2: 0 },
  { version: 3, totalDataBytes: 44, ecBytesPerBlock: 26, numBlocksGroup1: 1, dataBytesGroup1: 44, numBlocksGroup2: 0, dataBytesGroup2: 0 },
  { version: 4, totalDataBytes: 64, ecBytesPerBlock: 18, numBlocksGroup1: 2, dataBytesGroup1: 32, numBlocksGroup2: 0, dataBytesGroup2: 0 },
  { version: 5, totalDataBytes: 86, ecBytesPerBlock: 24, numBlocksGroup1: 2, dataBytesGroup1: 43, numBlocksGroup2: 0, dataBytesGroup2: 0 },
  { version: 6, totalDataBytes: 108, ecBytesPerBlock: 16, numBlocksGroup1: 4, dataBytesGroup1: 27, numBlocksGroup2: 0, dataBytesGroup2: 0 },
  { version: 7, totalDataBytes: 124, ecBytesPerBlock: 18, numBlocksGroup1: 4, dataBytesGroup1: 31, numBlocksGroup2: 0, dataBytesGroup2: 0 },
  { version: 8, totalDataBytes: 154, ecBytesPerBlock: 22, numBlocksGroup1: 2, dataBytesGroup1: 38, numBlocksGroup2: 2, dataBytesGroup2: 39 },
  { version: 9, totalDataBytes: 182, ecBytesPerBlock: 22, numBlocksGroup1: 3, dataBytesGroup1: 36, numBlocksGroup2: 2, dataBytesGroup2: 37 },
  { version: 10, totalDataBytes: 216, ecBytesPerBlock: 26, numBlocksGroup1: 4, dataBytesGroup1: 43, numBlocksGroup2: 1, dataBytesGroup2: 44 },
];

// 位置合わせパターンの座標
const ALIGNMENT_PATTERN_POSITIONS: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/**
 * QRコードのビットマトリックス（真偽値の2次元配列）を生成します
 */
export function generateQrMatrix(text: string): boolean[][] {
  const utf8Bytes = Buffer.from(text, "utf-8");

  // 最適なバージョンを選択
  let vInfo: QrVersionInfo | null = null;
  for (const info of VERSION_INFO_M) {
    // Byteモードヘッダー: 4bit(0100) + 文字数bit(8bit for v1-9, 16bit for v10+)
    const charCountBits = info.version < 10 ? 8 : 16;
    const requiredBits = 4 + charCountBits + utf8Bytes.length * 8;
    const requiredBytes = Math.ceil(requiredBits / 8);
    if (requiredBytes <= info.totalDataBytes) {
      vInfo = info;
      break;
    }
  }

  if (!vInfo) {
    throw new Error(`Text too long for QR Code: ${text.length} bytes`);
  }

  const version = vInfo.version;
  const size = version * 4 + 17;

  // 1. ビットストリームの構築
  const bitStream: number[] = [];
  const appendBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitStream.push((val >>> i) & 1);
    }
  };

  // Byteモード指示子: 0100
  appendBits(0b0100, 4);
  // 文字数
  appendBits(utf8Bytes.length, version < 10 ? 8 : 16);
  // データ本体
  for (const byte of utf8Bytes) {
    appendBits(byte, 8);
  }

  // 終端パターン (最大4ビットの0)
  const totalCapacityBits = vInfo.totalDataBytes * 8;
  const terminatorLength = Math.min(4, totalCapacityBits - bitStream.length);
  appendBits(0, terminatorLength);

  // 8ビット境界までのパディング
  while (bitStream.length % 8 !== 0) {
    bitStream.push(0);
  }

  // パディングバイト (0xEC, 0x11)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitStream.length < totalCapacityBits) {
    appendBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // バイト配列へ変換
  const dataBytes = new Uint8Array(vInfo.totalDataBytes);
  for (let i = 0; i < dataBytes.length; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bitStream[i * 8 + b];
    }
    dataBytes[i] = byte;
  }

  // 2. ブロック分割と誤り訂正コード計算
  const divisor = calcReedSolomonDivisor(vInfo.ecBytesPerBlock);
  const totalBlocks = vInfo.numBlocksGroup1 + vInfo.numBlocksGroup2;
  const blocksData: Uint8Array[] = [];
  const blocksEc: Uint8Array[] = [];

  let byteOffset = 0;
  for (let i = 0; i < totalBlocks; i++) {
    const isGroup1 = i < vInfo.numBlocksGroup1;
    const blockDataLen = isGroup1 ? vInfo.dataBytesGroup1 : vInfo.dataBytesGroup2;
    const blockData = dataBytes.subarray(byteOffset, byteOffset + blockDataLen);
    byteOffset += blockDataLen;

    blocksData.push(blockData);
    blocksEc.push(calcReedSolomonRemainder(blockData, divisor));
  }

  // インターリーブ
  const finalBytes: number[] = [];
  const maxDataLen = Math.max(vInfo.dataBytesGroup1, vInfo.dataBytesGroup2);
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < totalBlocks; b++) {
      if (i < blocksData[b].length) {
        finalBytes.push(blocksData[b][i]);
      }
    }
  }
  for (let i = 0; i < vInfo.ecBytesPerBlock; i++) {
    for (let b = 0; b < totalBlocks; b++) {
      finalBytes.push(blocksEc[b][i]);
    }
  }

  // 3. マトリックス配置
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setFunction = (r: number, c: number, val: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      isFunction[r][c] = true;
    }
  };

  // ファインダーパターン (位置検出パターン 7x7)
  const drawFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = top + r;
        const col = left + c;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const inCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setFunction(row, col, inOuter && (isBorder || inCenter));
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // タイミングパターン
  for (let i = 8; i < size - 8; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  // 位置合わせパターン
  const alignPos = ALIGNMENT_PATTERN_POSITIONS[version] || [];
  for (const r of alignPos) {
    for (const c of alignPos) {
      if (isFunction[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
          const isCenter = dr === 0 && dc === 0;
          setFunction(r + dr, c + dc, isBorder || isCenter);
        }
      }
    }
  }

  // 暗黒モジュール (Dark module)
  setFunction(size - 8, 8, true);

  // データビットのジグザグ配置
  let dataBitIdx = 0;
  const totalBits = finalBytes.length * 8;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // タイミングパターンの縦列をスキップ
    const upward = ((size - 1 - right) >> 1) % 2 === 0;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let c = right; c >= right - 1; c--) {
        if (!isFunction[r][c]) {
          let bit = false;
          if (dataBitIdx < totalBits) {
            const byteVal = finalBytes[dataBitIdx >>> 3];
            bit = ((byteVal >>> (7 - (dataBitIdx & 7))) & 1) === 1;
            dataBitIdx++;
          }
          matrix[r][c] = bit;
        }
      }
    }
  }

  // 4. マスクパターンの適用 (マスク 0: (row + col) % 2 === 0)
  // 実用上、Mレベル・マスク0で多くの認証アプリが問題なく瞬時に認識します
  const maskPattern = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFunction[r][c]) {
        if ((r + c) % 2 === 0) {
          matrix[r][c] = !matrix[r][c];
        }
      }
    }
  }

  // 5. 形式情報（Format Information）の配置 (EC: M = 00, Mask: 0 = 000 -> 00000 -> BCH -> 101010000010010)
  // フォーマットビット (Mレベル, マスク0): 0x5412 (XOR済み)
  const formatBits = 0b101010000010010;
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >>> (14 - i)) & 1) === 1;
    // 左上
    if (i <= 5) setFunction(8, i, bit);
    else if (i === 6) setFunction(8, 7, bit);
    else if (i === 7) setFunction(8, 8, bit);
    else if (i === 8) setFunction(7, 8, bit);
    else setFunction(14 - i, 8, bit);

    // 右上 & 左下
    if (i < 8) setFunction(size - 1 - i, 8, bit);
    else setFunction(8, size - 15 + i, bit);
  }

  return matrix;
}

/**
 * QRコードをインラインSVG文字列として出力します
 */
export function generateQrCodeSvg(text: string, pixelSize = 240, margin = 4): string {
  const matrix = generateQrMatrix(text);
  const size = matrix.length;
  const viewBoxSize = size + margin * 2;

  let pathData = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        pathData += `M${c + margin},${r + margin}h1v1h-1z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${pixelSize}" height="${pixelSize}" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="#ffffff" rx="12" />
  <path d="${pathData.trim()}" fill="#0f172a" />
</svg>`;
}
