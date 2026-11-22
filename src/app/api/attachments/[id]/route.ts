// 個別添付ファイルの配信（GET）および削除（DELETE）API
import { NextResponse } from "next/server";
import fs from "node:fs";
import { Readable } from "node:stream";
import {
  getDb,
  canUserAccessProject,
  resolveSafeAttachmentPath,
  deleteAttachmentFilesOnDisk,
} from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isArchivedProject } from "@/types";
import { logger } from "@/lib/logger";
import { apiError } from "@/lib/apiResponse";

// インライン表示を安全に許可するラスター画像MIMEタイプ（SVGはXSS防止のためダウンロード強制）
const SAFE_INLINE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 添付ファイルの取得・ストリーミング配信（要ログインセッション・プロジェクトアクセス権チェック付き）
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json(
        { error: "ログインセッションが確認できません" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const attachmentId = Number(id);
    if (!attachmentId || isNaN(attachmentId)) {
      return NextResponse.json({ error: "無効なファイルIDです" }, { status: 400 });
    }

    const db = getDb();
    const attachment = db
      .prepare(`
        SELECT
          a.*,
          COALESCE(i.project_id, ci.project_id) AS project_id
        FROM attachments a
        LEFT JOIN issues i ON a.issue_id = i.id
        LEFT JOIN comments c ON a.comment_id = c.id
        LEFT JOIN issues ci ON c.issue_id = ci.id
        WHERE a.id = ?
      `)
      .get(attachmentId) as {
      id: number;
      user_id: number | null;
      issue_id: number | null;
      comment_id: number | null;
      project_id: number | null;
      file_name: string;
      stored_name: string;
      file_size: number;
      mime_type: string;
    } | undefined;

    if (!attachment) {
      return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 404 });
    }

    // アクセス権限チェック
    // 課題またはコメントに紐づいている場合はプロジェクト参加権限を確認、未紐付けの場合はアップロード者本人またはAdminのみ許可
    if (attachment.project_id) {
      const canAccess = canUserAccessProject(
        db,
        sessionUser.id,
        Number(attachment.project_id),
        sessionUser.role_type,
        sessionUser.is_admin
      );
      if (!canAccess) {
        return NextResponse.json(
          { error: "この添付ファイルを閲覧する権限がありません（プロジェクトメンバーではありません）" },
          { status: 403 }
        );
      }
    } else if (sessionUser.is_admin !== 1 && attachment.user_id !== sessionUser.id) {
      return NextResponse.json(
        { error: "この添付ファイルを閲覧する権限がありません" },
        { status: 403 }
      );
    }

    const filePath = resolveSafeAttachmentPath(attachment.stored_name);
    if (!filePath || !fs.existsSync(filePath)) {
      return apiError({
        status: 404,
        detail: "ディスク上にファイル実体が存在しません",
        code: "FILE_NOT_FOUND",
        request: _request,
      });
    }

    // メモリ枯渇を防止するため、バッファ一括読み込みではなくストリームで配信
    const fileStat = fs.statSync(filePath);
    const nodeStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    const normalizedMime = (attachment.mime_type || "application/octet-stream").toLowerCase().split(";")[0].trim();
    const isSafeInlineImage = SAFE_INLINE_IMAGE_TYPES.has(normalizedMime);
    const encodedFileName = encodeURIComponent(attachment.file_name);

    // 安全なラスター画像のみブラウザでインライン表示、SVGやその他のファイルはダウンロード強制
    const contentDisposition = isSafeInlineImage
      ? `inline; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
      : `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`;

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": attachment.mime_type || "application/octet-stream",
        "Content-Length": String(fileStat.size),
        "Content-Disposition": contentDisposition,
        "X-Content-Type-Options": "nosniff",
        // 添付ファイル配信時のスクリプト実行・同一オリジンアクセスを遮断
        "Content-Security-Policy": "sandbox",
        // 認証が必要なプライベートファイルのため共有キャッシュを禁止
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    logger.error("添付ファイル配信エラー", { path: "/api/attachments/[id]", method: "GET" }, error);
    return apiError({
      status: 500,
      detail: "ファイルの取得に失敗しました",
      request: _request,
    });
  }
}

// 添付ファイルの削除（アップロード者本人または管理者のみ）
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json(
        { error: "ログインセッションが確認できません" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const attachmentId = Number(id);
    if (!attachmentId || isNaN(attachmentId)) {
      return NextResponse.json({ error: "無効なファイルIDです" }, { status: 400 });
    }

    const db = getDb();
    const attachment = db
      .prepare(`
        SELECT
          a.*,
          COALESCE(i.project_id, ci.project_id) AS project_id,
          COALESCE(p.is_archived, cp.is_archived) AS project_is_archived,
          COALESCE(p.name, cp.name) AS project_name,
          COALESCE(p.key, cp.key) AS project_key
        FROM attachments a
        LEFT JOIN issues i ON a.issue_id = i.id
        LEFT JOIN projects p ON i.project_id = p.id
        LEFT JOIN comments c ON a.comment_id = c.id
        LEFT JOIN issues ci ON c.issue_id = ci.id
        LEFT JOIN projects cp ON ci.project_id = cp.id
        WHERE a.id = ?
      `)
      .get(attachmentId) as {
      id: number;
      user_id: number | null;
      stored_name: string;
      project_id?: number | null;
      project_is_archived?: number;
      project_name?: string;
      project_key?: string;
    } | undefined;

    if (!attachment) {
      return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 404 });
    }

    // プロジェクトに紐づく添付ファイルは参加権限も確認（脱退後の削除を防止）
    if (
      attachment.project_id &&
      !canUserAccessProject(
        db,
        sessionUser.id,
        Number(attachment.project_id),
        sessionUser.role_type,
        sessionUser.is_admin
      )
    ) {
      return NextResponse.json(
        { error: "この添付ファイルを削除する権限がありません（プロジェクトメンバーではありません）" },
        { status: 403 }
      );
    }

    if (isArchivedProject(attachment)) {
      return NextResponse.json(
        { error: "この課題が属するプロジェクトはアーカイブされているため、ファイルを削除できません（読み取り専用）" },
        { status: 403 }
      );
    }

    // 削除権限チェック（アップロード者本人、またはAdmin権限）
    if (sessionUser.is_admin !== 1 && attachment.user_id !== sessionUser.id) {
      return NextResponse.json(
        { error: "この添付ファイルを削除する権限がありません" },
        { status: 403 }
      );
    }

    // DBレコード削除
    db.prepare("DELETE FROM attachments WHERE id = ?").run(attachmentId);

    // ディスク上の実体ファイルを安全に削除（パストラバーサル防止付き）
    deleteAttachmentFilesOnDisk([attachment.stored_name]);

    return NextResponse.json({ success: true, message: "添付ファイルを削除しました" });
  } catch (error) {
    console.error("添付ファイル削除エラー:", error);
    return NextResponse.json(
      { error: "添付ファイルの削除に失敗しました" },
      { status: 500 }
    );
  }
}
