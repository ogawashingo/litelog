// 課題一覧取得および新規課題作成API
import { NextResponse } from "next/server";
import { getDb, canUserAccessProject, getUserAccessibleProjectIds } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createIssueCreatedNotifications } from "@/lib/notificationUtils";
import { extendAncestorDueDatesIfNeeded } from "@/lib/parentDueDate";
import { MAX_LENGTHS, validateDateRange, validateMaxLength } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/apiResponse";

const VALID_ISSUE_TYPES = new Set(["task", "bug", "request", "other"]);
const VALID_STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);
const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
const VALID_RESOLUTIONS = new Set(["fixed", "wont_fix", "invalid", "duplicated", "cannot_reproduce"]);

// 課題一覧取得（要ログインセッション・ページネーション対応）
export async function GET(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return apiError({
        status: 401,
        detail: "ログインセッションが確認できません",
        code: "UNAUTHORIZED",
        request,
      });
    }
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    const issueType = searchParams.get("type");
    const priority = searchParams.get("priority");
    const assigneeId = searchParams.get("assigneeId");
    const resolution = searchParams.get("resolution");
    const querySearch = searchParams.get("q");

    // ページネーションパラメータ
    const hasPagination = searchParams.has("page") || searchParams.has("limit");
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 30));
    const offset = (page - 1) * limit;

    // プロジェクトアクセス権のチェック
    if (projectId) {
      const canAccess = canUserAccessProject(
        db,
        sessionUser.id,
        Number(projectId),
        sessionUser.role_type,
        sessionUser.is_admin
      );
      if (!canAccess) {
        if (hasPagination) {
          return apiSuccess({ items: [], totalCount: 0, page, limit, totalPages: 0 }, undefined, request);
        }
        return apiSuccess([], undefined, request);
      }
    }

    let whereClause = " WHERE 1=1";
    const params: (string | number)[] = [];

    if (projectId) {
      whereClause += " AND i.project_id = ?";
      params.push(Number(projectId));
    } else if (sessionUser) {
      const accessibleIds = getUserAccessibleProjectIds(
        db,
        sessionUser.id,
        sessionUser.role_type,
        sessionUser.is_admin
      );
      if (accessibleIds !== null) {
        if (accessibleIds.length === 0) {
          if (hasPagination) {
            return apiSuccess({ items: [], totalCount: 0, page, limit, totalPages: 0 }, undefined, request);
          }
          return apiSuccess([], undefined, request);
        }
        const placeholders = accessibleIds.map(() => "?").join(",");
        whereClause += ` AND i.project_id IN (${placeholders})`;
        params.push(...accessibleIds);
      }
    }

    if (status && status !== "all") {
      whereClause += " AND i.status = ?";
      params.push(status);
    }

    if (issueType && issueType !== "all") {
      whereClause += " AND i.issue_type = ?";
      params.push(issueType);
    }

    if (priority && priority !== "all") {
      whereClause += " AND i.priority = ?";
      params.push(priority);
    }

    if (assigneeId && assigneeId !== "all") {
      if (assigneeId === "unassigned") {
        whereClause += " AND i.assignee_id IS NULL";
      } else {
        whereClause += " AND i.assignee_id = ?";
        params.push(Number(assigneeId));
      }
    }

    if (resolution && resolution !== "all") {
      if (resolution === "none" || resolution === "unassigned") {
        whereClause += " AND (i.resolution IS NULL OR i.resolution = '')";
      } else {
        whereClause += " AND i.resolution = ?";
        params.push(resolution);
      }
    }

    const trimmedSearch = querySearch ? querySearch.trim().slice(0, 200) : "";
    if (trimmedSearch) {
      whereClause += ` AND (
        i.title LIKE ? 
        OR i.issue_key LIKE ? 
        OR i.description LIKE ? 
        OR p.name LIKE ?
        OR p.key LIKE ?
        OR EXISTS (SELECT 1 FROM comments c WHERE c.issue_id = i.id AND c.content LIKE ?)
      )`;
      const pattern = `%${trimmedSearch}%`;
      params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }

    // ページネーション時の総件数集計
    let totalCount = 0;
    if (hasPagination) {
      const countSql = `
        SELECT COUNT(*) AS total_count
        FROM issues i
        JOIN projects p ON i.project_id = p.id
        ${whereClause}
      `;
      const countRow = db.prepare(countSql).get(...params) as { total_count: number } | undefined;
      totalCount = countRow ? countRow.total_count : 0;
    }

    let sql = `
      SELECT 
        i.*,
        p.name AS project_name,
        p.key AS project_key,
        p.color AS project_color,
        COALESCE(p.is_archived, 0) AS project_is_archived,
        parent.issue_key AS parent_issue_key,
        parent.title AS parent_title,
        parent.due_date AS parent_due_date,
        u.name AS assignee_name,
        u.color AS assignee_color,
        creator.name AS creator_name,
        COALESCE(cmt_stat.comment_count, 0) AS comment_count,
        COALESCE(att_stat.attachment_count, 0) AS attachment_count,
        latest_c.content AS latest_comment_content,
        latest_c.created_at AS latest_comment_created_at,
        cu.name AS latest_comment_user_name,
        cu.color AS latest_comment_user_color
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN issues parent ON i.parent_id = parent.id
      LEFT JOIN users u ON i.assignee_id = u.id
      LEFT JOIN users creator ON i.created_by = creator.id
      LEFT JOIN (
        SELECT issue_id, COUNT(*) AS comment_count, MAX(id) AS latest_comment_id
        FROM comments
        GROUP BY issue_id
      ) cmt_stat ON cmt_stat.issue_id = i.id
      LEFT JOIN (
        SELECT issue_id, COUNT(*) AS attachment_count
        FROM attachments
        WHERE issue_id IS NOT NULL
        GROUP BY issue_id
      ) att_stat ON att_stat.issue_id = i.id
      LEFT JOIN comments latest_c ON latest_c.id = cmt_stat.latest_comment_id
      LEFT JOIN users cu ON latest_c.user_id = cu.id
      ${whereClause}
      ORDER BY CASE WHEN i.status = 'closed' THEN 1 ELSE 0 END ASC, i.updated_at DESC, i.id DESC
    `;

    const queryParams = [...params];
    if (hasPagination) {
      sql += " LIMIT ? OFFSET ?";
      queryParams.push(limit, offset);
    }

    const issues = db.prepare(sql).all(...queryParams);

    if (hasPagination) {
      return apiSuccess(
        {
          items: issues,
          totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
        },
        {
          headers: {
            "X-Total-Count": String(totalCount),
            "X-Page": String(page),
            "X-Limit": String(limit),
          },
        },
        request
      );
    }

    return apiSuccess(
      issues,
      {
        headers: {
          "X-Total-Count": String(issues.length),
        },
      },
      request
    );
  } catch (error) {
    logger.error("課題取得エラー", { path: "/api/issues", method: "GET" }, error);
    return apiError({
      status: 500,
      detail: "課題一覧の取得に失敗しました",
      request,
    });
  }
}

// 課題の新規作成（要ログインセッション）
export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const db = getDb();
    const body = await request.json();
    const {
      projectId,
      parentId = null,
      assigneeId = null,
      title,
      description = "",
      issueType = "task",
      status = "open",
      priority = "medium",
      resolution = null,
      startDate = null,
      dueDate = null,
      extendParentDueDate = false,
    } = body;

    if (!projectId || !title || !String(title).trim()) {
      return NextResponse.json({ error: "プロジェクトと課題名は必須です" }, { status: 400 });
    }

    const cleanTitle = String(title).trim();
    const cleanDescription = String(description || "").trim();

    // 文字数上限チェック
    const titleLengthErr = validateMaxLength(cleanTitle, MAX_LENGTHS.ISSUE_TITLE, "課題名");
    if (titleLengthErr) {
      return NextResponse.json({ error: titleLengthErr }, { status: 400 });
    }
    const descLengthErr = validateMaxLength(cleanDescription, MAX_LENGTHS.ISSUE_DESCRIPTION, "詳細説明");
    if (descLengthErr) {
      return NextResponse.json({ error: descLengthErr }, { status: 400 });
    }

    // 開始日・期限日のフォーマットおよび前後関係チェック
    const cleanStartDate = startDate ? String(startDate).trim() : null;
    const cleanDueDate = dueDate ? String(dueDate).trim() : null;
    const dateRangeErr = validateDateRange(cleanStartDate, cleanDueDate);
    if (dateRangeErr) {
      return NextResponse.json({ error: dateRangeErr }, { status: 400 });
    }

    // プロジェクト参加権限の検証（Admin/PMOまたは参加メンバー）
    const canAccess = canUserAccessProject(
      db,
      sessionUser.id,
      Number(projectId),
      sessionUser.role_type,
      sessionUser.is_admin
    );
    if (!canAccess) {
      return NextResponse.json(
        { error: "このプロジェクトに課題を作成する権限がありません（プロジェクトメンバーではありません）" },
        { status: 403 }
      );
    }
    if (!VALID_ISSUE_TYPES.has(String(issueType))) {
      return NextResponse.json({ error: "無効な課題種別です" }, { status: 400 });
    }
    if (!VALID_STATUSES.has(String(status))) {
      return NextResponse.json({ error: "無効なステータスです" }, { status: 400 });
    }
    // 一般メンバーによる「処理済み」状態での直接起票を禁止（レビュー依頼なしの放置防止、Admin/PMOは許可）
    const isManager = sessionUser.is_admin === 1 || sessionUser.role_type === "pmo";
    if (String(status) === "resolved" && !isManager) {
      return NextResponse.json(
        { error: "「処理済み」状態での直接起票はできません。作業完了後にレビュー依頼コメントを添えて「処理済み」へ変更してください" },
        { status: 400 }
      );
    }
    if (!VALID_PRIORITIES.has(String(priority))) {
      return NextResponse.json({ error: "無効な優先度です" }, { status: 400 });
    }
    const cleanResolution =
      status === "closed" && resolution && String(resolution).trim() !== ""
        ? String(resolution).trim()
        : null;
    if (cleanResolution && !VALID_RESOLUTIONS.has(cleanResolution)) {
      return NextResponse.json({ error: "無効な完了理由です" }, { status: 400 });
    }

    // 対象プロジェクトの存在確認
    const project = db.prepare("SELECT id, key, name, is_archived FROM projects WHERE id = ?").get(projectId) as {
      id: number;
      key: string;
      name: string;
      is_archived?: number;
    } | undefined;

    if (!project) {
      return NextResponse.json({ error: "指定されたプロジェクトが見つかりません" }, { status: 404 });
    }

    // アーカイブされたプロジェクトは読み取り専用のため、新規課題作成を禁止（is_archivedフラグまたは名前に「アーカイブ」が含まれるか判定）
    const isArchived = Boolean(
      project.is_archived ||
      project.name.includes("アーカイブ") ||
      project.name.toLowerCase().includes("archive")
    );
    if (isArchived) {
      return NextResponse.json(
        { error: "このプロジェクトはアーカイブされているため、新しい課題を作成できません（読み取り専用）" },
        { status: 403 }
      );
    }

    const resolvedAssigneeId = assigneeId ? Number(assigneeId) : null;
    if (resolvedAssigneeId !== null) {
      if (!Number.isInteger(resolvedAssigneeId) || resolvedAssigneeId <= 0) {
        return NextResponse.json({ error: "無効な担当者IDです" }, { status: 400 });
      }
      const assigneeUser = db
        .prepare("SELECT id, role_type, is_admin FROM users WHERE id = ?")
        .get(resolvedAssigneeId) as { id: number; role_type?: string; is_admin?: number } | undefined;
      if (!assigneeUser) {
        return NextResponse.json({ error: "指定された担当者が見つかりません" }, { status: 400 });
      }
      const canAssigneeAccess = canUserAccessProject(
        db,
        assigneeUser.id,
        Number(projectId),
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

    const resolvedParentId = parentId ? Number(parentId) : null;
    if (resolvedParentId !== null) {
      if (!Number.isInteger(resolvedParentId) || resolvedParentId <= 0) {
        return NextResponse.json({ error: "無効な親課題IDです" }, { status: 400 });
      }
      const parentIssue = db
        .prepare("SELECT id, project_id FROM issues WHERE id = ?")
        .get(resolvedParentId) as { id: number; project_id: number } | undefined;
      if (!parentIssue) {
        return NextResponse.json({ error: "指定された親課題が見つかりません" }, { status: 400 });
      }
      if (parentIssue.project_id !== Number(projectId)) {
        return NextResponse.json(
          { error: "別プロジェクトの課題を親課題に設定することはできません" },
          { status: 400 }
        );
      }
    }

    // 操作者はサーバー側セッションユーザーを信頼源とする
    const resolvedActorId = sessionUser.id;

    let issueId: number | bigint = 0;

    // 採番・課題登録・アクティビティ記録を排他トランザクションで一括実行（同時採番の競合・重複エラー防止）
    db.exec("BEGIN IMMEDIATE;");
    try {
      const maxNumRow = db.prepare(`
        SELECT COALESCE(MAX(issue_number), 0) AS max_num
        FROM issues
        WHERE project_id = ?
      `).get(projectId) as { max_num: number };

      const nextNum = maxNumRow.max_num + 1;
      const issueKey = `${project.key}-${nextNum}`;

      const insert = db.prepare(`
        INSERT INTO issues (project_id, parent_id, assignee_id, created_by, issue_key, issue_number, title, description, issue_type, status, priority, resolution, start_date, due_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insert.run(
        projectId,
        resolvedParentId,
        resolvedAssigneeId,
        resolvedActorId,
        issueKey,
        nextNum,
        cleanTitle,
        cleanDescription,
        issueType,
        status,
        priority,
        cleanResolution,
        cleanStartDate,
        cleanDueDate
      );

      issueId = result.lastInsertRowid;

      // 添付ファイルの紐付け（本文中に埋め込まれた添付URLまたは明示されたattachmentIds）
      const foundAttachmentIds = new Set<number>();
      if (Array.isArray(body.attachmentIds)) {
        for (const aid of body.attachmentIds) {
          if (Number(aid)) foundAttachmentIds.add(Number(aid));
        }
      }
      if (description) {
        const matches = String(description).matchAll(/\/api\/attachments\/(\d+)/g);
        for (const m of matches) {
          if (m[1]) foundAttachmentIds.add(Number(m[1]));
        }
      }
      if (foundAttachmentIds.size > 0) {
        // 他ユーザーがアップロードした未紐付けファイルの横取りを防ぐため user_id および comment_id を検証
        const updateAttStmt = db.prepare(`
          UPDATE attachments
          SET issue_id = ?
          WHERE id = ? AND ((issue_id IS NULL AND comment_id IS NULL AND user_id = ?) OR issue_id = ?)
        `);
        for (const aid of foundAttachmentIds) {
          updateAttStmt.run(issueId, aid, resolvedActorId, issueId);
        }
      }

      // アクティビティ履歴を記録
      const insertActivity = db.prepare(`
        INSERT INTO activities (issue_id, user_id, action_type, content)
        VALUES (?, ?, 'created', ?)
      `);
      insertActivity.run(issueId, resolvedActorId, `課題 [${issueKey}] 「${String(title).trim()}」を追加しました`);

      // ユーザー承認がある場合、親課題（および祖先課題）の期限日も連動延長する
      if (extendParentDueDate && parentId && dueDate) {
        extendAncestorDueDatesIfNeeded(db, {
          startParentId: Number(parentId),
          newDueDate: String(dueDate),
          childIssueKey: issueKey,
          actorId: resolvedActorId,
        });
      }

      // 自動通知および通知先（参加者）指定・メンション通知の一括作成
      createIssueCreatedNotifications(db, {
        issueId: Number(issueId),
        senderId: resolvedActorId,
        assigneeId: resolvedAssigneeId,
        issueKey,
        title: String(title).trim(),
        description: String(description || "").trim(),
        notifyUserIds: Array.isArray(body.notifyUserIds) ? body.notifyUserIds : [],
      });

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    const created = db.prepare(`
      SELECT 
        i.*, 
        p.name AS project_name, 
        p.color AS project_color,
        parent.issue_key AS parent_issue_key,
        parent.title AS parent_title,
        parent.due_date AS parent_due_date,
        u.name AS assignee_name,
        u.color AS assignee_color,
        creator.name AS creator_name
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN issues parent ON i.parent_id = parent.id
      LEFT JOIN users u ON i.assignee_id = u.id
      LEFT JOIN users creator ON i.created_by = creator.id
      WHERE i.id = ?
    `).get(issueId);

    return apiSuccess(created, { status: 201 }, request);
  } catch (error) {
    logger.error("課題作成エラー", { path: "/api/issues", method: "POST" }, error);
    return apiError({
      status: 500,
      detail: "課題の作成に失敗しました",
      request,
    });
  }
}
