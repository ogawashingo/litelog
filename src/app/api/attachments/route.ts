// 添付ファイル（画像・ドキュメント）のアップロードおよび一覧取得API
import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  getDb,
  ATTACHMENTS_DIR,
  canUserAccessProject,
  getUserAccessibleProjectIds,
} from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  validateAttachmentBatchMeta,
  validateFileSignature,
} from "@/lib/attachmentPolicy";

// 添付ファイル一覧取得（要ログインセッション・プロジェクトアクセス権検証付き）
export async function GET(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json(
        { error: "ログインセッションが確認できません" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const issueId = searchParams.get("issueId");
    const commentId = searchParams.get("commentId");

    const db = getDb();

    // issueId 指定時は対象課題のプロジェクトアクセス権をチェック
    if (issueId) {
      const issueRow = db
        .prepare("SELECT id, project_id FROM issues WHERE id = ?")
        .get(Number(issueId)) as { id: number; project_id: number } | undefined;
      if (!issueRow) {
        return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
      }
      if (
        !canUserAccessProject(
          db,
          sessionUser.id,
          Number(issueRow.project_id),
          sessionUser.role_type,
          sessionUser.is_admin
        )
      ) {
        return NextResponse.json(
          { error: "この課題の添付ファイルを閲覧する権限がありません" },
          { status: 403 }
        );
      }
    }

    // commentId 指定時は対象コメントの課題のプロジェクトアクセス権をチェック
    if (commentId) {
      const commentRow = db
        .prepare(`
          SELECT c.id, i.project_id
          FROM comments c
          JOIN issues i ON c.issue_id = i.id
          WHERE c.id = ?
        `)
        .get(Number(commentId)) as { id: number; project_id: number } | undefined;
      if (!commentRow) {
        return NextResponse.json({ error: "対象のコメントが見つかりません" }, { status: 404 });
      }
      if (
        !canUserAccessProject(
          db,
          sessionUser.id,
          Number(commentRow.project_id),
          sessionUser.role_type,
          sessionUser.is_admin
        )
      ) {
        return NextResponse.json(
          { error: "このコメントの添付ファイルを閲覧する権限がありません" },
          { status: 403 }
        );
      }
    }

    let sql = `
      SELECT 
        a.*,
        u.name AS user_name,
        u.color AS user_color
      FROM attachments a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN issues i ON a.issue_id = i.id
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

    // Admin以外は自身がアクセス可能なプロジェクトの添付ファイル、または自身がアップロードした未紐付けファイルのみに絞り込む
    if (!issueId && !commentId) {
      const accessibleIds = getUserAccessibleProjectIds(
        db,
        sessionUser.id,
        sessionUser.role_type,
        sessionUser.is_admin
      );
      if (accessibleIds !== null) {
        if (accessibleIds.length === 0) {
          sql += " AND a.issue_id IS NULL AND a.user_id = ?";
          params.push(sessionUser.id);
        } else {
          const placeholders = accessibleIds.map(() => "?").join(",");
          sql += ` AND (i.project_id IN (${placeholders}) OR (a.issue_id IS NULL AND a.user_id = ?))`;
          params.push(...accessibleIds, sessionUser.id);
        }
      }
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
    const rawEntries = formData.getAll("file");
    const fileEntries = rawEntries.filter((entry): entry is File => entry instanceof Blob);
    if (fileEntries.length === 0) {
      return NextResponse.json(
        { error: "アップロードするファイルが指定されていません" },
        { status: 400 }
      );
    }

    // 保存処理の前に全ファイルの件数・サイズ・拡張子・MIMEタイプを一括検証
    const batchValidation = validateAttachmentBatchMeta(
      fileEntries.map((file) => ({
        name: file.name || "attachment",
        size: file.size,
        type: file.type,
      }))
    );
    if (!batchValidation.ok) {
      return NextResponse.json(
        { error: batchValidation.error },
        { status: 400 }
      );
    }

    const db = getDb();

    // 課題指定がある場合、存在確認・プロジェクト参加権限・アーカイブ状態をチェック
    if (issueId) {
      const issueRow = db.prepare(`
        SELECT i.id, i.project_id, p.is_archived, p.name
        FROM issues i
        JOIN projects p ON i.project_id = p.id
        WHERE i.id = ?
      `).get(issueId) as { id: number; project_id: number; is_archived?: number; name?: string } | undefined;

      if (!issueRow) {
        return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
      }

      if (
        !canUserAccessProject(
          db,
          sessionUser.id,
          Number(issueRow.project_id),
          sessionUser.role_type,
          sessionUser.is_admin
        )
      ) {
        return NextResponse.json(
          { error: "この課題へファイルを添付する権限がありません（プロジェクトメンバーではありません）" },
          { status: 403 }
        );
      }

      const isArchived = Boolean(
        issueRow.is_archived ||
        (issueRow.name && (
          issueRow.name.includes("アーカイブ") ||
          issueRow.name.toLowerCase().includes("archive")
        ))
      );
      if (isArchived) {
        return NextResponse.json(
          { error: "この課題が属するプロジェクトはアーカイブされているため、ファイルを添付できません（読み取り専用）" },
          { status: 403 }
        );
      }
    }

    // コメント指定がある場合も、対象コメントの課題とプロジェクト参加権限をチェック
    if (commentId) {
      const commentRow = db.prepare(`
        SELECT c.id, c.issue_id, i.project_id, p.is_archived, p.name
        FROM comments c
        JOIN issues i ON c.issue_id = i.id
        JOIN projects p ON i.project_id = p.id
        WHERE c.id = ?
      `).get(commentId) as {
        id: number;
        issue_id: number;
        project_id: number;
        is_archived?: number;
        name?: string;
      } | undefined;

      if (!commentRow) {
        return NextResponse.json({ error: "対象のコメントが見つかりません" }, { status: 404 });
      }
      if (issueId && Number(commentRow.issue_id) !== issueId) {
        return NextResponse.json({ error: "コメントと課題の指定が一致しません" }, { status: 400 });
      }
      if (
        !canUserAccessProject(
          db,
          sessionUser.id,
          Number(commentRow.project_id),
          sessionUser.role_type,
          sessionUser.is_admin
        )
      ) {
        return NextResponse.json(
          { error: "このコメントへファイルを添付する権限がありません（プロジェクトメンバーではありません）" },
          { status: 403 }
        );
      }
      const isArchived = Boolean(
        commentRow.is_archived ||
        (commentRow.name && (
          commentRow.name.includes("アーカイブ") ||
          commentRow.name.toLowerCase().includes("archive")
        ))
      );
      if (isArchived) {
        return NextResponse.json(
          { error: "この課題が属するプロジェクトはアーカイブされているため、ファイルを添付できません（読み取り専用）" },
          { status: 403 }
        );
      }
    }

    // 保存前に全ファイルのバイナリを読み込み、ファイルシグネチャ（マジックバイト）を検証
    const preparedFiles: Array<{
      file: File;
      originalName: string;
      ext: string;
      canonicalMime: string;
      isInlineImage: boolean;
      buffer: Buffer;
    }> = [];

    for (let i = 0; i < fileEntries.length; i++) {
      const file = fileEntries[i];
      const { ext, rule } = batchValidation.items[i];
      const originalName = file.name || "attachment";
      const buffer = Buffer.from(await file.arrayBuffer());

      if (!validateFileSignature(buffer, rule.signature)) {
        return NextResponse.json(
          { error: `ファイルの内容が拡張子（${ext}）と一致しないためアップロードできません: ${originalName}` },
          { status: 400 }
        );
      }

      preparedFiles.push({
        file,
        originalName,
        ext,
        canonicalMime: rule.canonicalMime,
        isInlineImage: rule.isInlineImage,
        buffer,
      });
    }

    // ディレクトリの存在確認
    if (!fs.existsSync(ATTACHMENTS_DIR)) {
      fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
    }

    const uploadedAttachments = [];

    for (const item of preparedFiles) {
      const { file, originalName, ext, canonicalMime, isInlineImage, buffer } = item;
      const baseName = path
        .basename(originalName, path.extname(originalName))
        .replace(/[^a-zA-Z0-9_\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff-]/g, "_");
      const randomSuffix = crypto.randomUUID().slice(0, 8);
      const storedName = `${Date.now()}_${randomSuffix}_${baseName.slice(0, 30)}${ext}`;
      const filePath = path.join(ATTACHMENTS_DIR, storedName);

      // バイナリデータの書き込み
      fs.writeFileSync(filePath, buffer);

      // データベースへメタデータを保存（サーバー確定の正規MIMEタイプを使用）
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
        canonicalMime
      );

      const attachmentId = Number(result.lastInsertRowid);
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
        mime_type: canonicalMime,
        created_at: new Date().toISOString(),
        url: attachmentUrl,
        is_image: isInlineImage,
        markdown: isInlineImage
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
