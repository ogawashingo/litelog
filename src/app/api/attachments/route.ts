// 添付ファイル（画像・ドキュメント）のアップロードおよび一覧取得API
import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { getDb, ATTACHMENTS_DIR } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// 最大ファイルサイズ（25MB）
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// 添付ファイル一覧取得
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const issueId = searchParams.get("issueId");
    const commentId = searchParams.get("commentId");

    const db = getDb();

    let sql = `
      SELECT 
        a.*,
        u.name AS user_name,
        u.color AS user_color
      FROM attachments a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params: (number | string)[] = [];

    if (issueId) {
      sql += " AND a.issue_id = ?";
      params.push(Number(issueId));
    }
    if (commentId) {
      sql += " AND a.comment_id = ?";
      params.push(Number(commentId));
    }

    sql += " ORDER BY a.created_at ASC, a.id ASC";

    const attachments = db.prepare(sql).all(...params);
    return NextResponse.json(attachments);
  } catch (error) {
    console.error("添付ファイル一覧取得エラー:", error);
    return NextResponse.json(
      { error: "添付ファイル一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}

// 添付ファイルのアップロード（要ログインセッション）
export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json(
        { error: "ログインセッションが確認できません" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const issueIdVal = formData.get("issueId");
    const commentIdVal = formData.get("commentId");

    const issueId = issueIdVal ? Number(issueIdVal) : null;
    const commentId = commentIdVal ? Number(commentIdVal) : null;

    // ファイルエントリーの取得（単一または複数）
    const fileEntries = formData.getAll("file") as File[];
    if (!fileEntries || fileEntries.length === 0 || !(fileEntries[0] instanceof Blob)) {
      return NextResponse.json(
        { error: "アップロードするファイルが指定されていません" },
        { status: 400 }
      );
    }

    const db = getDb();

    // 課題指定がある場合、プロジェクトがアーカイブ済みかチェック
    if (issueId) {
      const issueRow = db.prepare(`
        SELECT p.is_archived
        FROM issues i
        JOIN projects p ON i.project_id = p.id
        WHERE i.id = ?
      `).get(issueId) as { is_archived?: number } | undefined;

      if (issueRow && issueRow.is_archived) {
        return NextResponse.json(
          { error: "この課題が属するプロジェクトはアーカイブされているため、ファイルを添付できません（読み取り専用）" },
          { status: 403 }
        );
      }
    }

    // ディレクトリの存在確認
    if (!fs.existsSync(ATTACHMENTS_DIR)) {
      fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
    }

    const uploadedAttachments = [];

    for (const file of fileEntries) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `ファイルサイズが上限（25MB）を超えています: ${file.name}` },
          { status: 400 }
        );
      }

      const originalName = file.name || "attachment";
      const ext = path.extname(originalName) || "";
      const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff-]/g, "_");
      const randomSuffix = crypto.randomUUID().slice(0, 8);
      const storedName = `${Date.now()}_${randomSuffix}_${baseName.slice(0, 30)}${ext}`;
      const filePath = path.join(ATTACHMENTS_DIR, storedName);

      // バイナリデータの書き込み
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(filePath, buffer);

      const mimeType = file.type || "application/octet-stream";

      // データベースへメタデータを保存
      const stmt = db.prepare(`
        INSERT INTO attachments (issue_id, comment_id, user_id, file_name, stored_name, file_size, mime_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        issueId,
        commentId,
        sessionUser.id,
        originalName,
        storedName,
        file.size,
        mimeType
      );

      const attachmentId = Number(result.lastInsertRowid);
      const isImage = mimeType.startsWith("image/");
      const attachmentUrl = `/api/attachments/${attachmentId}`;

      uploadedAttachments.push({
        id: attachmentId,
        issue_id: issueId,
        comment_id: commentId,
        user_id: sessionUser.id,
        user_name: sessionUser.name,
        user_color: sessionUser.color,
        file_name: originalName,
        stored_name: storedName,
        file_size: file.size,
        mime_type: mimeType,
        created_at: new Date().toISOString(),
        url: attachmentUrl,
        is_image: isImage,
        markdown: isImage
          ? `![${originalName}](${attachmentUrl})`
          : `[${originalName}](${attachmentUrl})`,
      });
    }

    // 1件のみの場合は単一オブジェクトと配列の両方で扱いやすいように返却
    if (uploadedAttachments.length === 1) {
      return NextResponse.json({
        ...uploadedAttachments[0],
        attachments: uploadedAttachments,
      });
    }

    return NextResponse.json({
      attachments: uploadedAttachments,
    });
  } catch (error) {
    console.error("添付ファイルアップロードエラー:", error);
    return NextResponse.json(
      { error: "添付ファイルのアップロードに失敗しました" },
      { status: 500 }
    );
  }
}
