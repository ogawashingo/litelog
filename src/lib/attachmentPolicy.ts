// 添付ファイルの許可種類・サイズ上限・署名検証を一元管理するポリシーモジュール

// 1ファイルあたりの最大サイズ（10MB）
export const MAX_ATTACHMENT_FILE_SIZE_MB = 10;
export const MAX_ATTACHMENT_FILE_SIZE = MAX_ATTACHMENT_FILE_SIZE_MB * 1024 * 1024;

// 1回のアップロードあたりの最大ファイル数
export const MAX_FILES_PER_UPLOAD = 10;

// 1回のアップロードあたりの合計最大サイズ（30MB）
export const MAX_TOTAL_UPLOAD_SIZE_MB = 30;
export const MAX_TOTAL_UPLOAD_SIZE = MAX_TOTAL_UPLOAD_SIZE_MB * 1024 * 1024;

export type AttachmentSignatureKind =
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "pdf"
  | "zip"
  | "text";

export interface AllowedAttachmentRule {
  // サーバー側で確定して保存・配信に使用する正規のMIMEタイプ
  canonicalMime: string;
  // クライアント申告値（file.type）として許容するMIMEタイプ一覧
  allowedMimes: string[];
  // ブラウザでのインライン表示を許可する安全なラスター画像か
  isInlineImage: boolean;
  // ファイル先頭バイトの検証種別
  signature: AttachmentSignatureKind;
}

// 許可する拡張子ごとのホワイトリスト定義（SVG・HTML・実行ファイル等は除外）
export const ALLOWED_ATTACHMENT_RULES: Record<string, AllowedAttachmentRule> = {
  // 画像（安全なラスター画像のみ）
  ".png": {
    canonicalMime: "image/png",
    allowedMimes: ["image/png"],
    isInlineImage: true,
    signature: "png",
  },
  ".jpg": {
    canonicalMime: "image/jpeg",
    allowedMimes: ["image/jpeg", "image/jpg"],
    isInlineImage: true,
    signature: "jpeg",
  },
  ".jpeg": {
    canonicalMime: "image/jpeg",
    allowedMimes: ["image/jpeg", "image/jpg"],
    isInlineImage: true,
    signature: "jpeg",
  },
  ".gif": {
    canonicalMime: "image/gif",
    allowedMimes: ["image/gif"],
    isInlineImage: true,
    signature: "gif",
  },
  ".webp": {
    canonicalMime: "image/webp",
    allowedMimes: ["image/webp"],
    isInlineImage: true,
    signature: "webp",
  },

  // ドキュメント・テキスト
  ".pdf": {
    canonicalMime: "application/pdf",
    allowedMimes: ["application/pdf"],
    isInlineImage: false,
    signature: "pdf",
  },
  ".txt": {
    canonicalMime: "text/plain",
    allowedMimes: ["text/plain"],
    isInlineImage: false,
    signature: "text",
  },
  ".md": {
    canonicalMime: "text/markdown",
    allowedMimes: ["text/markdown", "text/x-markdown", "text/plain"],
    isInlineImage: false,
    signature: "text",
  },
  ".csv": {
    canonicalMime: "text/csv",
    allowedMimes: ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"],
    isInlineImage: false,
    signature: "text",
  },
  ".json": {
    canonicalMime: "application/json",
    allowedMimes: ["application/json", "text/json", "text/plain"],
    isInlineImage: false,
    signature: "text",
  },
  ".log": {
    canonicalMime: "text/plain",
    allowedMimes: ["text/plain", "text/x-log"],
    isInlineImage: false,
    signature: "text",
  },

  // Officeドキュメント（OOXML形式のみ）
  ".docx": {
    canonicalMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    allowedMimes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip",
    ],
    isInlineImage: false,
    signature: "zip",
  },
  ".xlsx": {
    canonicalMime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    allowedMimes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
    ],
    isInlineImage: false,
    signature: "zip",
  },
  ".pptx": {
    canonicalMime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    allowedMimes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/zip",
    ],
    isInlineImage: false,
    signature: "zip",
  },

  // 圧縮ファイル
  ".zip": {
    canonicalMime: "application/zip",
    allowedMimes: ["application/zip", "application/x-zip-compressed", "multipart/x-zip"],
    isInlineImage: false,
    signature: "zip",
  },
};

export const ALLOWED_ATTACHMENT_EXTENSIONS = Object.keys(ALLOWED_ATTACHMENT_RULES);

// <input type="file" accept={...}> に渡す文字列
export const ATTACHMENT_ACCEPT_ATTR = ALLOWED_ATTACHMENT_EXTENSIONS.join(",");

// UIのツールチップ・案内文言
export const ATTACHMENT_POLICY_HINT =
  `対応形式: 画像(PNG/JPG/GIF/WebP), PDF, テキスト(TXT/MD/CSV/JSON/LOG), Office(DOCX/XLSX/PPTX), ZIP / 1ファイル${MAX_ATTACHMENT_FILE_SIZE_MB}MBまで（1回最大${MAX_FILES_PER_UPLOAD}件・合計${MAX_TOTAL_UPLOAD_SIZE_MB}MB）`;

// インライン表示を許可する安全なラスター画像のMIMEタイプ集合
const INLINE_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

// MIMEタイプが安全なインライン表示対象画像かどうか判定する
export function isInlineImageMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  const baseMime = mimeType.split(";")[0].trim().toLowerCase();
  return INLINE_IMAGE_MIME_TYPES.has(baseMime);
}

// ファイル名から小文字の拡張子（ドット含む）を抽出する
export function getFileExtension(fileName: string): string {
  const trimmed = (fileName || "").trim();
  const lastSlash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const base = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
  const dotIdx = base.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === base.length - 1) return "";
  return base.slice(dotIdx).toLowerCase();
}

export interface AttachmentMetaInput {
  name: string;
  size: number;
  type?: string;
}

export interface ValidatedAttachmentMeta {
  ext: string;
  rule: AllowedAttachmentRule;
}

export type SingleValidationResult =
  | { ok: true; data: ValidatedAttachmentMeta }
  | { ok: false; error: string };

// 単一ファイルのメタデータ（サイズ・拡張子・MIMEタイプ）を検証する
export function validateAttachmentMeta(file: AttachmentMetaInput): SingleValidationResult {
  const displayName = file.name || "名称未設定ファイル";

  if (typeof file.size !== "number" || Number.isNaN(file.size) || file.size <= 0) {
    return {
      ok: false,
      error: `空のファイルはアップロードできません: ${displayName}`,
    };
  }

  if (file.size > MAX_ATTACHMENT_FILE_SIZE) {
    return {
      ok: false,
      error: `ファイルサイズが上限（${MAX_ATTACHMENT_FILE_SIZE_MB}MB）を超えています: ${displayName}`,
    };
  }

  const ext = getFileExtension(displayName);
  const rule = ext ? ALLOWED_ATTACHMENT_RULES[ext] : undefined;
  if (!rule) {
    return {
      ok: false,
      error: `このファイル形式はアップロードできません: ${displayName}（対応形式: 画像・PDF・テキスト・Office・ZIP）`,
    };
  }

  // クライアント申告のMIMEタイプが指定されており、汎用バイナリ以外の場合は拡張子との整合性を検証
  const rawType = (file.type || "").split(";")[0].trim().toLowerCase();
  if (rawType && rawType !== "application/octet-stream") {
    if (!rule.allowedMimes.includes(rawType)) {
      return {
        ok: false,
        error: `ファイル形式と内容（MIMEタイプ）が一致しません: ${displayName}`,
      };
    }
  }

  return { ok: true, data: { ext, rule } };
}

export type BatchValidationResult =
  | { ok: true; items: ValidatedAttachmentMeta[] }
  | { ok: false; error: string };

// 複数ファイル一括アップロード時のメタデータ（件数・個別・合計サイズ）を検証する
export function validateAttachmentBatchMeta(
  files: AttachmentMetaInput[]
): BatchValidationResult {
  if (!files || files.length === 0) {
    return { ok: false, error: "アップロードするファイルが指定されていません" };
  }

  if (files.length > MAX_FILES_PER_UPLOAD) {
    return {
      ok: false,
      error: `一度にアップロードできるファイル数は最大${MAX_FILES_PER_UPLOAD}件までです`,
    };
  }

  const items: ValidatedAttachmentMeta[] = [];
  let totalSize = 0;

  for (const file of files) {
    const result = validateAttachmentMeta(file);
    if (!result.ok) {
      return result;
    }
    totalSize += file.size;
    if (totalSize > MAX_TOTAL_UPLOAD_SIZE) {
      return {
        ok: false,
        error: `1回のアップロード合計サイズが上限（${MAX_TOTAL_UPLOAD_SIZE_MB}MB）を超えています`,
      };
    }
    items.push(result.data);
  }

  return { ok: true, items };
}

// ファイルバイナリの先頭シグネチャ（マジックバイト）を検証する（サーバー側用）
export function validateFileSignature(
  bytes: Uint8Array,
  signature: AttachmentSignatureKind
): boolean {
  if (!bytes || bytes.length === 0) return false;

  switch (signature) {
    case "png":
      // 89 50 4E 47 0D 0A 1A 0A
      return (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );

    case "jpeg":
      // FF D8 FF
      return (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      );

    case "gif":
      // GIF87a / GIF89a
      return (
        bytes.length >= 6 &&
        bytes[0] === 0x47 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x38 &&
        (bytes[4] === 0x37 || bytes[4] === 0x39) &&
        bytes[5] === 0x61
      );

    case "webp":
      // RIFF....WEBP
      return (
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
      );

    case "pdf":
      // %PDF-
      return (
        bytes.length >= 5 &&
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46 &&
        bytes[4] === 0x2d
      );

    case "zip":
      // PK\x03\x04（通常）, PK\x05\x06（空アーカイブ）, PK\x07\x08（スパン）
      return (
        bytes.length >= 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
          (bytes[2] === 0x05 && bytes[3] === 0x06) ||
          (bytes[2] === 0x07 && bytes[3] === 0x08))
      );

    case "text": {
      // テキスト系ファイルは先頭8KB内にNULバイトを含まないことでバイナリ偽装を防ぐ
      const inspectLen = Math.min(bytes.length, 8192);
      for (let i = 0; i < inspectLen; i++) {
        if (bytes[i] === 0x00) {
          return false;
        }
      }
      return true;
    }

    default:
      return false;
  }
}
