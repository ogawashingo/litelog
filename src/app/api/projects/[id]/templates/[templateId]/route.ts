// プロジェクト別課題テンプレート更新・削除API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canManageIssues, isArchivedProject } from "@/types";

interface RouteParams {
  params: Promise<{ id: string; templateId: string }>;
}

// テンプレート更新（PMO / 管理者限定）
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id, templateId } = await params;
    const projectId = Number(id);
    const tmplId = Number(templateId);
    if (!projectId || !tmplId || isNaN(projectId) || isNaN(tmplId)) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }

    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    if (!canManageIssues(sessionUser)) {
      return NextResponse.json({ error: "テンプレートの編集にはAdminまたはPMO権限が必要です" }, { status: 403 });
    }

    const db = getDb();
    const project = db.prepare("SELECT id, is_archived FROM projects WHERE id = ?").get(projectId) as
      | { id: number; is_archived: number }
      | undefined;
    if (!project) {
      return NextResponse.json({ error: "対象のプロジェクトが見つかりません" }, { status: 404 });
    }
    if (isArchivedProject(project)) {
      return NextResponse.json({ error: "アーカイブ済みプロジェクトは編集できません" }, { status: 400 });
    }

    const existing = db
      .prepare("SELECT * FROM issue_templates WHERE id = ? AND project_id = ?")
      .get(tmplId, projectId);
    if (!existing) {
      return NextResponse.json({ error: "対象のテンプレートが見つかりません" }, { status: 404 });
    }

    const body = await request.json();
    const name = String(body.name || "").trim();
    const description = body.description !== undefined ? String(body.description).trim() || null : undefined;
    const content = String(body.content || "").trim();
    const sortOrder = body.sort_order !== undefined ? Number(body.sort_order) || 0 : undefined;

    if (!name) {
      return NextResponse.json({ error: "テンプレート名は必須です" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: "テンプレート本文（Markdown）は必須です" }, { status: 400 });
    }

    db.prepare(`
      UPDATE issue_templates 
      SET name = ?, description = COALESCE(?, description), content = ?, sort_order = COALESCE(?, sort_order), updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ?
    `).run(name, description, content, sortOrder, tmplId, projectId);

    const updated = db.prepare("SELECT * FROM issue_templates WHERE id = ?").get(tmplId);

    return NextResponse.json({ template: updated, message: "テンプレートを更新しました" });
  } catch (error) {
    console.error("PUT /api/projects/[id]/templates/[templateId] error:", error);
    return NextResponse.json({ error: "テンプレートの更新に失敗しました" }, { status: 500 });
  }
}

// テンプレート削除（PMO / 管理者限定）
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id, templateId } = await params;
    const projectId = Number(id);
    const tmplId = Number(templateId);
    if (!projectId || !tmplId || isNaN(projectId) || isNaN(tmplId)) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }

    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    if (!canManageIssues(sessionUser)) {
      return NextResponse.json({ error: "テンプレートの削除にはAdminまたはPMO権限が必要です" }, { status: 403 });
    }

    const db = getDb();
    const project = db.prepare("SELECT id, is_archived FROM projects WHERE id = ?").get(projectId) as
      | { id: number; is_archived: number }
      | undefined;
    if (!project) {
      return NextResponse.json({ error: "対象のプロジェクトが見つかりません" }, { status: 404 });
    }
    if (isArchivedProject(project)) {
      return NextResponse.json({ error: "アーカイブ済みプロジェクトは編集できません" }, { status: 400 });
    }

    const res = db.prepare("DELETE FROM issue_templates WHERE id = ? AND project_id = ?").run(tmplId, projectId);
    if (res.changes === 0) {
      return NextResponse.json({ error: "対象のテンプレートが見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ message: "テンプレートを削除しました" });
  } catch (error) {
    console.error("DELETE /api/projects/[id]/templates/[templateId] error:", error);
    return NextResponse.json({ error: "テンプレートの削除に失敗しました" }, { status: 500 });
  }
}
