// 課題一覧取得および新規課題作成API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createIssueCreatedNotifications } from "@/lib/notificationUtils";

const VALID_ISSUE_TYPES = new Set(["task", "bug", "request", "other"]);
const VALID_STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);
const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
const VALID_RESOLUTIONS = new Set(["fixed", "wont_fix", "invalid", "duplicated", "cannot_reproduce"]);

// 課題一覧取得
export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    const issueType = searchParams.get("type");
    const priority = searchParams.get("priority");
    const assigneeId = searchParams.get("assigneeId");
    const resolution = searchParams.get("resolution");
    const querySearch = searchParams.get("q");

    let sql = `
      SELECT 
        i.*,
        p.name AS project_name,
        p.key AS project_key,
        p.color AS project_color,
        parent.issue_key AS parent_issue_key,
        parent.title AS parent_title,
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
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (projectId) {
      sql += " AND i.project_id = ?";
      params.push(Number(projectId));
    }

    if (status && status !== "all") {
      sql += " AND i.status = ?";
      params.push(status);
    }

    if (issueType && issueType !== "all") {
      sql += " AND i.issue_type = ?";
      params.push(issueType);
    }

    if (priority && priority !== "all") {
      sql += " AND i.priority = ?";
      params.push(priority);
    }

    if (assigneeId && assigneeId !== "all") {
      if (assigneeId === "unassigned") {
        sql += " AND i.assignee_id IS NULL";
      } else {
        sql += " AND i.assignee_id = ?";
        params.push(Number(assigneeId));
      }
    }

    if (resolution && resolution !== "all") {
      if (resolution === "none" || resolution === "unassigned") {
        sql += " AND (i.resolution IS NULL OR i.resolution = '')";
      } else {
        sql += " AND i.resolution = ?";
        params.push(resolution);
      }
    }

    if (querySearch) {
      // 課題件名・課題キー・詳細説明、およびコメント本文を横断検索
      sql += ` AND (
        i.title LIKE ? 
        OR i.issue_key LIKE ? 
        OR i.description LIKE ? 
        OR EXISTS (SELECT 1 FROM comments c WHERE c.issue_id = i.id AND c.content LIKE ?)
      )`;
      const pattern = `%${querySearch}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    sql += " ORDER BY CASE WHEN i.status = 'closed' THEN 1 ELSE 0 END ASC, i.updated_at DESC, i.id DESC";

    const issues = db.prepare(sql).all(...params);
    return NextResponse.json(issues);
  } catch (error) {
    console.error("課題取得エラー:", error);
    return NextResponse.json({ error: "課題一覧の取得に失敗しました" }, { status: 500 });
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
    } = body;

    if (!projectId || !title || !String(title).trim()) {
      return NextResponse.json({ error: "プロジェクトと課題名は必須です" }, { status: 400 });
    }
    if (!VALID_ISSUE_TYPES.has(String(issueType))) {
      return NextResponse.json({ error: "無効な課題種別です" }, { status: 400 });
    }
    if (!VALID_STATUSES.has(String(status))) {
      return NextResponse.json({ error: "無効なステータスです" }, { status: 400 });
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
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as {
      id: number;
      key: string;
      name: string;
    } | undefined;

    if (!project) {
      return NextResponse.json({ error: "指定されたプロジェクトが見つかりません" }, { status: 404 });
    }

    const resolvedAssigneeId = assigneeId ? Number(assigneeId) : null;
    // 操作者はサーバー側セッションユーザーを信頼源とする
    const resolvedActorId = sessionUser.id;

    let issueId: number | bigint = 0;

    // 採番・課題登録・アクティビティ記録をトランザクションで一括実行
    db.exec("BEGIN;");
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
        parentId || null,
        resolvedAssigneeId,
        resolvedActorId,
        issueKey,
        nextNum,
        String(title).trim(),
        String(description || "").trim(),
        issueType,
        status,
        priority,
        cleanResolution,
        startDate || null,
        dueDate || null
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
        const updateAttStmt = db.prepare(`
          UPDATE attachments
          SET issue_id = ?
          WHERE id = ? AND (issue_id IS NULL OR issue_id = ?)
        `);
        for (const aid of foundAttachmentIds) {
          updateAttStmt.run(issueId, aid, issueId);
        }
      }

      // アクティビティ履歴を記録
      const insertActivity = db.prepare(`
        INSERT INTO activities (issue_id, user_id, action_type, content)
        VALUES (?, ?, 'created', ?)
      `);
      insertActivity.run(issueId, resolvedActorId, `課題 [${issueKey}] 「${String(title).trim()}」を追加しました`);

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

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("課題作成エラー:", error);
    return NextResponse.json({ error: "課題の作成に失敗しました" }, { status: 500 });
  }
}
