// 課題コメントAPI
import { NextResponse } from "next/server";
import { getDb, attachReactionsToComments, canUserAccessProject } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createCommentNotifications, createIssueUpdatedNotifications } from "@/lib/notificationUtils";
import { MAX_LENGTHS, validateMaxLength, validateReviewRequestComment } from "@/lib/validation";

const VALID_STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);
const VALID_RESOLUTIONS = new Set(["fixed", "wont_fix", "invalid", "duplicated", "cannot_reproduce"]);

interface RouteParams {
  params: Promise<{ id: string }>;
}

// コメント一覧取得（要ログインセッション・数値IDまたは課題キーに対応）
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id } = await params;
    const db = getDb();
    const isNumeric = /^\d+$/.test(id);

    const issue = db.prepare(
      `SELECT id, project_id FROM issues WHERE ${isNumeric ? "id = ?" : "issue_key = ?"}`
    ).get(isNumeric ? Number(id) : id) as { id: number; project_id: number } | undefined;

    if (!issue) {
      return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
    }

    // プロジェクトアクセス権チェック
    if (
      !canUserAccessProject(
        db,
        sessionUser.id,
        issue.project_id,
        sessionUser.role_type,
        sessionUser.is_admin
      )
    ) {
      return NextResponse.json(
        { error: "この課題のコメントを閲覧する権限がありません（プロジェクトメンバーではありません）" },
        { status: 403 }
      );
    }

    const rawComments = db.prepare(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM comment_histories ch WHERE ch.comment_id = c.id) AS history_count,
        u.name AS user_name,
        u.color AS user_color
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.issue_id = ?
      ORDER BY c.created_at ASC
    `).all(issue.id) as { id: number }[];
    const comments = attachReactionsToComments(db, rawComments);
    return NextResponse.json(comments);
  } catch (error) {
    console.error("コメント取得エラー:", error);
    return NextResponse.json({ error: "コメントの取得に失敗しました" }, { status: 500 });
  }
}

// コメント追加（要ログインセッション、数値IDまたは課題キーに対応）
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id } = await params;
    const isNumeric = /^\d+$/.test(id);
    const db = getDb();
    const body = await request.json();
    const { content } = body;

    if (!content || !String(content).trim()) {
      return NextResponse.json({ error: "コメント内容は必須です" }, { status: 400 });
    }
    const contentLengthErr = validateMaxLength(
      String(content).trim(),
      MAX_LENGTHS.COMMENT_CONTENT,
      "コメント内容"
    );
    if (contentLengthErr) {
      return NextResponse.json({ error: contentLengthErr }, { status: 400 });
    }

    const issue = db.prepare(`
      SELECT i.*, p.is_archived AS project_is_archived, p.name AS project_name
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      WHERE ${isNumeric ? "i.id = ?" : "i.issue_key = ?"}
    `).get(isNumeric ? Number(id) : id) as {
      id: number;
      project_id: number;
      issue_key: string;
      title: string;
      description?: string | null;
      status: string;
      resolution: string | null;
      assignee_id: number | null;
      created_by: number | null;
      project_is_archived?: number;
      project_name?: string;
    } | undefined;

    if (!issue) {
      return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
    }

    // プロジェクトアクセス権チェック
    if (sessionUser) {
      const canAccess = canUserAccessProject(
        db,
        sessionUser.id,
        issue.project_id,
        sessionUser.role_type,
        sessionUser.is_admin
      );
      if (!canAccess) {
        return NextResponse.json(
          { error: "この課題のコメントを閲覧する権限がありません（プロジェクトメンバーではありません）" },
          { status: 403 }
        );
      }
    }

    // アーカイブされたプロジェクトの課題は読み取り専用のため、コメント投稿を禁止（is_archivedまたは名前にアーカイブ含む）
    const isArchived = Boolean(
      issue.project_is_archived ||
      (issue.project_name && (
        issue.project_name.includes("アーカイブ") ||
        issue.project_name.toLowerCase().includes("archive")
      ))
    );
    if (isArchived) {
      return NextResponse.json(
        { error: "この課題が属するプロジェクトはアーカイブされているため、コメントを投稿できません（読み取り専用）" },
        { status: 403 }
      );
    }

    const issueId = issue.id;

    // 投稿者・操作者はサーバー側セッションユーザーを信頼源とする
    const resolvedUserId = sessionUser.id;
    const cleanContent = body.content ? String(body.content).trim() : "";

    // 状態変更・完了理由変更・担当者変更のチェック
    const nextStatus = body.status !== undefined ? String(body.status) : undefined;
    const nextResolution =
      body.resolution !== undefined
        ? body.resolution && String(body.resolution).trim() !== ""
          ? String(body.resolution).trim()
          : null
        : undefined;
    const nextAssigneeId =
      body.assigneeId !== undefined
        ? body.assigneeId
          ? Number(body.assigneeId)
          : null
        : undefined;

    // ステータス更新バリデーション
    if (nextStatus !== undefined && !VALID_STATUSES.has(nextStatus)) {
      return NextResponse.json({ error: "無効なステータスです" }, { status: 400 });
    }
    // 一般メンバーが「処理済み」へ変更する際は、メンション以外の依頼メッセージ本文を必須とする（Admin/PMOはスキップ許可）
    const isManager = sessionUser.is_admin === 1 || sessionUser.role_type === "pmo";
    if (nextStatus === "resolved" && issue.status !== "resolved" && !isManager) {
      const userNames = (db.prepare("SELECT name FROM users").all() as { name: string }[]).map((u) => u.name);
      const reviewCommentErr = validateReviewRequestComment(cleanContent, userNames);
      if (reviewCommentErr) {
        return NextResponse.json({ error: reviewCommentErr }, { status: 400 });
      }
    }
    // 完了理由バリデーション
    if (nextResolution !== undefined && nextResolution !== null && !VALID_RESOLUTIONS.has(nextResolution)) {
      return NextResponse.json({ error: "無効な完了理由です" }, { status: 400 });
    }
    // 担当者バリデーション（実在かつプロジェクトメンバーであること）
    if (nextAssigneeId !== undefined && nextAssigneeId !== null) {
      if (!Number.isInteger(nextAssigneeId) || nextAssigneeId <= 0) {
        return NextResponse.json({ error: "無効な担当者IDです" }, { status: 400 });
      }
      const assigneeUser = db
        .prepare("SELECT id, role_type, is_admin FROM users WHERE id = ?")
        .get(nextAssigneeId) as { id: number; role_type?: string; is_admin?: number } | undefined;
      if (!assigneeUser) {
        return NextResponse.json({ error: "指定された担当者が見つかりません" }, { status: 400 });
      }
      const canAssigneeAccess = canUserAccessProject(
        db,
        assigneeUser.id,
        issue.project_id,
        assigneeUser.role_type,
        assigneeUser.is_admin
      );
      if (!canAssigneeAccess) {
        return NextResponse.json(
          { error: "指定された担当者はこのプロジェクトのメンバーではありません" },
          { status: 400 }
        );
      }
    }

    // 課題を完了（closed）にできるのは、課題の起票者・PMO・または管理者のみ
    if (nextStatus === "closed" && issue.status !== "closed") {
      const canClose = Boolean(
        sessionUser.is_admin ||
        sessionUser.role_type === "pmo" ||
        (issue.created_by && sessionUser.id === issue.created_by)
      );
      if (!canClose) {
        return NextResponse.json(
          { error: "課題を完了にできるのは、課題の起票者・PMO・または管理者のみです" },
          { status: 403 }
        );
      }
    }

    // 未完了の子課題バリデーション（closedに変更時）
    if (nextStatus === "closed" && issue.status !== "closed") {
      const unclosedChildren = db
        .prepare("SELECT COUNT(*) AS count FROM issues WHERE parent_id = ? AND status != 'closed'")
        .get(issueId) as { count: number } | undefined;
      if (unclosedChildren && unclosedChildren.count > 0) {
        return NextResponse.json(
          { error: `未完了の子課題が ${unclosedChildren.count} 件存在するため、親課題を完了にすることはできません` },
          { status: 400 }
        );
      }
    }

    // 最終ステータス判定（未完了に戻す場合は完了理由を強制クリア）
    const effectiveStatus = nextStatus !== undefined ? nextStatus : issue.status;
    const effectiveResolution =
      effectiveStatus === "closed"
        ? nextResolution !== undefined
          ? nextResolution
          : issue.resolution
        : null;

    const isStatusChanged = nextStatus !== undefined && nextStatus !== issue.status;
    const isResolutionChanged = effectiveResolution !== (issue.resolution || null);
    const isAssigneeChanged = nextAssigneeId !== undefined && nextAssigneeId !== (issue.assignee_id || null);

    if (!cleanContent && !isStatusChanged && !isResolutionChanged && !isAssigneeChanged) {
      return NextResponse.json({ error: "コメント内容、または状態・完了理由の変更を入力してください" }, { status: 400 });
    }

    let commentId: number | bigint = 0;

    db.exec("BEGIN;");
    try {
      // 1. コメントの追加（本文がある場合）
      if (cleanContent) {
        const insert = db.prepare(`
          INSERT INTO comments (issue_id, user_id, content)
          VALUES (?, ?, ?)
        `);
        const result = insert.run(issueId, resolvedUserId, cleanContent);
        commentId = result.lastInsertRowid;

        // コメント本文内の添付ファイルURLをこの課題およびコメントにバインド（他ユーザーのファイルや既存コメント・課題本文の添付ファイル横取りを防止）
        const issueDescAttachmentIds = new Set(
          Array.from(String(issue.description || "").matchAll(/\/api\/attachments\/(\d+)/g), (m) =>
            Number(m[1])
          )
        );
        const commentMatches = cleanContent.matchAll(/\/api\/attachments\/(\d+)/g);
        const updateAttStmt = db.prepare(`
          UPDATE attachments
          SET issue_id = ?, comment_id = ?
          WHERE id = ?
            AND user_id = ?
            AND comment_id IS NULL
            AND (issue_id IS NULL OR issue_id = ?)
        `);
        for (const m of commentMatches) {
          const attId = Number(m[1]);
          if (attId && !issueDescAttachmentIds.has(attId)) {
            updateAttStmt.run(issueId, commentId, attId, resolvedUserId, issueId);
          }
        }

        // アクティビティに記録
        db.prepare(`
          INSERT INTO activities (issue_id, comment_id, user_id, action_type, content)
          VALUES (?, ?, ?, 'commented', ?)
        `).run(issueId, commentId, resolvedUserId, cleanContent);

        // コメント通知
        createCommentNotifications(db, {
          issueId,
          commentId: Number(commentId),
          senderId: resolvedUserId,
          text: cleanContent,
          issueCreatedBy: issue.created_by,
          issueAssigneeId: isAssigneeChanged ? nextAssigneeId : issue.assignee_id,
          notifyUserIds: Array.isArray(body.notifyUserIds) ? body.notifyUserIds : [],
        });
      }

      // 2. 課題テーブルの更新（ステータス・完了理由・担当者）
      const issueUpdates: string[] = ["updated_at = CURRENT_TIMESTAMP"];
      const issueValues: (string | number | null)[] = [];

      if (isStatusChanged) {
        issueUpdates.push("status = ?");
        issueValues.push(nextStatus);

        const statusMap: Record<string, string> = {
          open: "未対応",
          in_progress: "処理中",
          resolved: "処理済み",
          closed: "完了",
        };
        const prevLabel = statusMap[issue.status] || issue.status;
        const newLabel = statusMap[nextStatus] || nextStatus;
        db.prepare(`
          INSERT INTO activities (issue_id, user_id, action_type, content)
          VALUES (?, ?, 'status_changed', ?)
        `).run(
          issueId,
          resolvedUserId,
          `課題 [${issue.issue_key}] の状態を「${prevLabel}」から「${newLabel}」に変更しました`
        );
      }

      if (isResolutionChanged) {
        issueUpdates.push("resolution = ?");
        issueValues.push(effectiveResolution);

        // 変更履歴に退避
        db.prepare(`
          INSERT INTO issue_histories (issue_id, user_id, field_name, old_value, created_at)
          VALUES (?, ?, 'resolution', ?, CURRENT_TIMESTAMP)
        `).run(issueId, resolvedUserId, issue.resolution || null);

        const resMap: Record<string, string> = {
          fixed: "対応済み",
          wont_fix: "対応しない",
          invalid: "無効",
          duplicated: "重複",
          cannot_reproduce: "再現しない",
        };
        const prevResLabel = issue.resolution ? (resMap[issue.resolution] || issue.resolution) : "未設定";
        const newResLabel = effectiveResolution ? (resMap[effectiveResolution] || effectiveResolution) : "未設定";
        db.prepare(`
          INSERT INTO activities (issue_id, user_id, action_type, content)
          VALUES (?, ?, 'updated', ?)
        `).run(
          issueId,
          resolvedUserId,
          `課題 [${issue.issue_key}] の完了理由を「${prevResLabel}」から「${newResLabel}」に変更しました`
        );
      }

      if (isAssigneeChanged) {
        issueUpdates.push("assignee_id = ?");
        issueValues.push(nextAssigneeId);

        let assigneeMsg = `課題 [${issue.issue_key}] の担当者を未割当にしました`;
        if (nextAssigneeId) {
          const targetUser = db.prepare("SELECT name FROM users WHERE id = ?").get(nextAssigneeId) as { name: string } | undefined;
          assigneeMsg = `課題 [${issue.issue_key}] の担当者を「${targetUser?.name || "不明"}」に設定しました`;
        }
        db.prepare(`
          INSERT INTO activities (issue_id, user_id, action_type, content)
          VALUES (?, ?, 'updated', ?)
        `).run(issueId, resolvedUserId, assigneeMsg);
      }

      if (issueUpdates.length > 0) {
        issueValues.push(issueId);
        db.prepare(`
          UPDATE issues
          SET ${issueUpdates.join(", ")}
          WHERE id = ?
        `).run(...issueValues);
      }

      // 状態や担当者が変更された場合の通知作成
      if (isStatusChanged || isResolutionChanged || isAssigneeChanged) {
        createIssueUpdatedNotifications(db, {
          issueId,
          issueKey: issue.issue_key,
          senderId: resolvedUserId,
          createdBy: issue.created_by,
          previousAssigneeId: issue.assignee_id,
          newAssigneeId: isAssigneeChanged ? nextAssigneeId : issue.assignee_id,
          updateSummary: [
            isStatusChanged ? `状態変更: ${nextStatus}` : null,
            isResolutionChanged ? `完了理由: ${nextResolution || "未設定"}` : null,
          ].filter(Boolean).join(", "),
          notifyUserIds: Array.isArray(body.notifyUserIds) ? body.notifyUserIds : [],
        });
      }

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    let createdComment = null;
    if (commentId) {
      createdComment = db.prepare(`
        SELECT 
          c.*,
          (SELECT COUNT(*) FROM comment_histories ch WHERE ch.comment_id = c.id) AS history_count,
          u.name AS user_name,
          u.color AS user_color
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.id = ?
      `).get(commentId) as Record<string, unknown> | undefined;
    }

    // 更新後の課題データを取得して返却
    const updatedIssue = db.prepare(`
      SELECT 
        i.*,
        p.name AS project_name,
        p.color AS project_color,
        u.name AS assignee_name,
        u.color AS assignee_color,
        creator.name AS creator_name
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN users u ON i.assignee_id = u.id
      LEFT JOIN users creator ON i.created_by = creator.id
      WHERE i.id = ?
    `).get(issueId);

    return NextResponse.json(
      {
        comment: createdComment ? { ...createdComment, reactions: [] } : null,
        issue: updatedIssue,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("コメント投稿エラー:", error);
    return NextResponse.json({ error: "コメントの投稿に失敗しました" }, { status: 500 });
  }
}
