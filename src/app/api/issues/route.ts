// 課題一覧取得および新規課題作成API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// 課題一覧取得
export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    const issueType = searchParams.get("type");
    const priority = searchParams.get("priority");
    const querySearch = searchParams.get("q");

    let sql = `
      SELECT 
        i.*,
        p.name AS project_name,
        p.color AS project_color,
        parent.issue_key AS parent_issue_key,
        parent.title AS parent_title
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN issues parent ON i.parent_id = parent.id
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

    if (querySearch) {
      sql += " AND (i.title LIKE ? OR i.issue_key LIKE ? OR i.description LIKE ?)";
      const pattern = `%${querySearch}%`;
      params.push(pattern, pattern, pattern);
    }

    sql += " ORDER BY CASE WHEN i.status = 'closed' THEN 1 ELSE 0 END ASC, i.updated_at DESC, i.id DESC";

    const issues = db.prepare(sql).all(...params);
    return NextResponse.json(issues);
  } catch (error) {
    console.error("課題取得エラー:", error);
    return NextResponse.json({ error: "課題一覧の取得に失敗しました" }, { status: 500 });
  }
}

// 課題の新規作成
export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const {
      projectId,
      parentId = null,
      title,
      description = "",
      issueType = "task",
      status = "open",
      priority = "medium",
      startDate = null,
      dueDate = null,
    } = body;

    if (!projectId || !title) {
      return NextResponse.json({ error: "プロジェクトと課題名は必須です" }, { status: 400 });
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

    // そのプロジェクト内での最大番号を取得してインクリメント
    const maxNumRow = db.prepare(`
      SELECT COALESCE(MAX(issue_number), 0) AS max_num
      FROM issues
      WHERE project_id = ?
    `).get(projectId) as { max_num: number };

    const nextNum = maxNumRow.max_num + 1;
    const issueKey = `${project.key}-${nextNum}`;

    const insert = db.prepare(`
      INSERT INTO issues (project_id, parent_id, issue_key, issue_number, title, description, issue_type, status, priority, start_date, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      projectId,
      parentId || null,
      issueKey,
      nextNum,
      title.trim(),
      description.trim(),
      issueType,
      status,
      priority,
      startDate || null,
      dueDate || null
    );

    const issueId = result.lastInsertRowid;

    // アクティビティ履歴を記録
    const insertActivity = db.prepare(`
      INSERT INTO activities (issue_id, action_type, content)
      VALUES (?, 'created', ?)
    `);
    insertActivity.run(issueId, `課題 [${issueKey}] 「${title.trim()}」を追加しました`);

    const created = db.prepare(`
      SELECT 
        i.*, 
        p.name AS project_name, 
        p.color AS project_color,
        parent.issue_key AS parent_issue_key,
        parent.title AS parent_title
      FROM issues i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN issues parent ON i.parent_id = parent.id
      WHERE i.id = ?
    `).get(issueId);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("課題作成エラー:", error);
    return NextResponse.json({ error: "課題の作成に失敗しました" }, { status: 500 });
  }
}
