// プロジェクトの個人別ピン留め設定API（ログインユーザーごとに上部固定を切り替え）
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isArchivedProject } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ピン留め状態の更新（is_pinned の明示指定、または省略時はトグル）
async function handlePinUpdate(request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json(
        { error: "ログインセッションが確認できません" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const projectId = Number(id);
    if (!projectId || isNaN(projectId)) {
      return NextResponse.json({ error: "無効なプロジェクトIDです" }, { status: 400 });
    }

    const db = getDb();

    // 対象プロジェクトの存在確認
    const project = db
      .prepare("SELECT id, key, name, COALESCE(is_archived, 0) AS is_archived FROM projects WHERE id = ?")
      .get(projectId) as { id: number; key: string; name: string; is_archived: number } | undefined;

    if (!project) {
      return NextResponse.json({ error: "対象のプロジェクトが見つかりません" }, { status: 404 });
    }

    // ログインユーザーが対象プロジェクトに参加しているか確認
    const membership = db
      .prepare("SELECT is_pinned, pinned_at FROM project_members WHERE project_id = ? AND user_id = ?")
      .get(projectId, sessionUser.id) as { is_pinned: number; pinned_at: string | null } | undefined;

    if (!membership) {
      return NextResponse.json(
        { error: "参加していないプロジェクトはピン留めできません" },
        { status: 403 }
      );
    }

    // リクエストボディの解析（ボディ空でもトグル動作できるように許容）
    let requestedPinned: boolean | undefined;
    try {
      const text = await request.text();
      if (text.trim()) {
        const body = JSON.parse(text);
        if (body.is_pinned !== undefined) {
          requestedPinned = Boolean(body.is_pinned);
        }
      }
    } catch {
      return NextResponse.json({ error: "リクエスト形式が不正です" }, { status: 400 });
    }

    const nextPinned = requestedPinned !== undefined ? (requestedPinned ? 1 : 0) : (membership.is_pinned ? 0 : 1);

    // アーカイブ済みプロジェクトは新規ピン留め不可（解除のみ許可）
    if (nextPinned === 1 && isArchivedProject(project)) {
      return NextResponse.json(
        { error: "アーカイブ済みのプロジェクトはピン留めできません" },
        { status: 400 }
      );
    }

    if (nextPinned === 1) {
      db.prepare(
        "UPDATE project_members SET is_pinned = 1, pinned_at = CURRENT_TIMESTAMP WHERE project_id = ? AND user_id = ?"
      ).run(projectId, sessionUser.id);
    } else {
      db.prepare(
        "UPDATE project_members SET is_pinned = 0, pinned_at = NULL WHERE project_id = ? AND user_id = ?"
      ).run(projectId, sessionUser.id);
    }

    const updated = db
      .prepare("SELECT is_pinned, pinned_at FROM project_members WHERE project_id = ? AND user_id = ?")
      .get(projectId, sessionUser.id) as { is_pinned: number; pinned_at: string | null };

    return NextResponse.json({
      project_id: projectId,
      is_pinned: updated.is_pinned,
      pinned_at: updated.pinned_at,
    });
  } catch (error) {
    console.error("プロジェクトピン留め更新エラー:", error);
    return NextResponse.json(
      { error: "ピン留め設定の更新に失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: RouteParams) {
  return handlePinUpdate(request, context);
}

export async function PATCH(request: Request, context: RouteParams) {
  return handlePinUpdate(request, context);
}
