// プロジェクト情報（プロジェクト名・テーマカラー）更新・削除API（管理者専用）
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// プロジェクト名の変更・情報更新（Admin管理者のみ実行可能）
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const projectId = Number(id);
    if (!projectId || isNaN(projectId)) {
      return NextResponse.json({ error: "無効なプロジェクトIDです" }, { status: 400 });
    }

    const db = getDb();
    const body = await request.json();
    const { name, color, actorId } = body;

    // 管理者（Admin権限）チェック
    if (!actorId) {
      return NextResponse.json(
        { error: "プロジェクト名の変更には管理者（Admin）権限でのログインが必要です" },
        { status: 403 }
      );
    }

    const actor = db
      .prepare("SELECT id, name, is_admin FROM users WHERE id = ?")
      .get(Number(actorId)) as { id: number; name: string; is_admin: number } | undefined;

    if (!actor || actor.is_admin !== 1) {
      return NextResponse.json(
        { error: "プロジェクト名の変更は管理者（Admin権限）のみ実行できます" },
        { status: 403 }
      );
    }

    // 対象プロジェクトの存在確認
    const existing = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId) as { id: number; key: string; name: string; color: string } | undefined;

    if (!existing) {
      return NextResponse.json({ error: "対象のプロジェクトが見つかりません" }, { status: 404 });
    }

    // プロジェクト名のバリデーション
    if (name === undefined || !String(name).trim()) {
      return NextResponse.json({ error: "プロジェクト名は空にできません" }, { status: 400 });
    }

    const nextName = String(name).trim();
    const nextColor = color && String(color).trim() ? String(color).trim() : existing.color;

    db.prepare("UPDATE projects SET name = ?, color = ? WHERE id = ?").run(
      nextName,
      nextColor,
      projectId
    );

    // 課題集計付きで更新後のプロジェクト情報を取得して返却
    const updated = db
      .prepare(`
        SELECT 
          p.id,
          p.key,
          p.name,
          p.color,
          p.created_at,
          COUNT(i.id) AS total_issues,
          SUM(CASE WHEN i.status != 'closed' THEN 1 ELSE 0 END) AS active_issues
        FROM projects p
        LEFT JOIN issues i ON p.id = i.project_id
        WHERE p.id = ?
        GROUP BY p.id
      `)
      .get(projectId);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("プロジェクト更新エラー:", error);
    return NextResponse.json(
      { error: "プロジェクト名の変更に失敗しました" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, context: RouteParams) {
  return PATCH(request, context);
}

// プロジェクトの削除（Admin管理者のみ実行可能・関連する課題やコメントも一括削除）
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const projectId = Number(id);
    if (!projectId || isNaN(projectId)) {
      return NextResponse.json({ error: "無効なプロジェクトIDです" }, { status: 400 });
    }

    const db = getDb();

    // クエリパラメータまたはリクエストボディから actorId を取得
    const { searchParams } = new URL(request.url);
    let actorId: number | null = searchParams.get("actorId")
      ? Number(searchParams.get("actorId"))
      : null;

    if (!actorId) {
      try {
        const body = await request.json();
        if (body?.actorId) {
          actorId = Number(body.actorId);
        }
      } catch {
        // ボディが空の場合は無視
      }
    }

    // 管理者（Admin権限）チェック
    if (!actorId) {
      return NextResponse.json(
        { error: "プロジェクトの削除には管理者（Admin）権限でのログインが必要です" },
        { status: 403 }
      );
    }

    const actor = db
      .prepare("SELECT id, name, is_admin FROM users WHERE id = ?")
      .get(actorId) as { id: number; name: string; is_admin: number } | undefined;

    if (!actor || actor.is_admin !== 1) {
      return NextResponse.json(
        { error: "プロジェクトの削除は管理者（Admin権限）のみ実行できます" },
        { status: 403 }
      );
    }

    // 対象プロジェクトの存在確認
    const existing = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId) as { id: number; key: string; name: string; color: string } | undefined;

    if (!existing) {
      return NextResponse.json({ error: "対象のプロジェクトが見つかりません" }, { status: 404 });
    }

    // 最低1件のプロジェクトは残す制約チェック
    const totalRow = db
      .prepare("SELECT COUNT(*) as count FROM projects")
      .get() as { count: number };
    if (totalRow.count <= 1) {
      return NextResponse.json(
        { error: "最低1件のプロジェクトが必要なため削除できません" },
        { status: 400 }
      );
    }

    // トランザクションで関連するコメント・アクティビティ・課題・プロジェクトを一括削除
    db.exec("BEGIN;");
    try {
      db.prepare(`
        DELETE FROM comments
        WHERE issue_id IN (SELECT id FROM issues WHERE project_id = ?)
      `).run(projectId);

      db.prepare(`
        DELETE FROM activities
        WHERE issue_id IN (SELECT id FROM issues WHERE project_id = ?)
           OR content LIKE ?
      `).run(projectId, `%[${existing.key}-%`);

      db.prepare("DELETE FROM issues WHERE project_id = ?").run(projectId);
      db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    return NextResponse.json({
      success: true,
      deletedProject: existing,
      message: `プロジェクト [${existing.key}] 「${existing.name}」を削除しました`,
    });
  } catch (error) {
    console.error("プロジェクト削除エラー:", error);
    return NextResponse.json(
      { error: "プロジェクトの削除に失敗しました" },
      { status: 500 }
    );
  }
}
