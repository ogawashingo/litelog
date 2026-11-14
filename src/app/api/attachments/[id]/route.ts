// 個別添付ファイルの配信（GET）および削除（DELETE）API
import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { getDb, ATTACHMENTS_DIR } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 添付ファイルの取得・ストリーミング配信
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const attachmentId = Number(id);
    if (!attachmentId || isNaN(attachmentId)) {
      return NextResponse.json({ error: "無効なファイルIDです" }, { status: 400 });
    }

    const db = getDb();
    const attachment = db
      .prepare("SELECT * FROM attachments WHERE id = ?")
      .get(attachmentId) as {
      id: number;
      file_name: string;
      stored_name: string;
      file_size: number;
      mime_type: string;
    } | undefined;

    if (!attachment) {
      return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 404 });
    }

    const filePath = path.join(ATTACHMENTS_DIR, attachment.stored_name);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "ディスク上にファイル実体が存在しません" },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(filePath);
    const isImage = attachment.mime_type.startsWith("image/");
    const encodedFileName = encodeURIComponent(attachment.file_name);

    // 画像はブラウザで直接インライン表示、その他のファイルはダウンロード
    const contentDisposition = isImage
      ? `inline; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
      : `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`;

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": attachment.mime_type || "application/octet-stream",
        "Content-Length": String(fileBuffer.length),
        "Content-Disposition": contentDisposition,
        // 画像はキャッシュして表示を高速化（1年間不変キャッシュ）
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("添付ファイル配信エラー:", error);
    return NextResponse.json(
      { error: "ファイルの取得に失敗しました" },
      { status: 500 }
    );
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
      .prepare("SELECT * FROM attachments WHERE id = ?")
      .get(attachmentId) as {
      id: number;
      user_id: number | null;
      stored_name: string;
    } | undefined;

    if (!attachment) {
      return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 404 });
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

    // ディスク上の実体ファイルを削除
    try {
      const filePath = path.join(ATTACHMENTS_DIR, attachment.stored_name);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fsErr) {
      console.error("ファイル実体削除エラー:", fsErr);
    }

    return NextResponse.json({ success: true, message: "添付ファイルを削除しました" });
  } catch (error) {
    console.error("添付ファイル削除エラー:", error);
    return NextResponse.json(
      { error: "添付ファイルの削除に失敗しました" },
      { status: 500 }
    );
  }
}
