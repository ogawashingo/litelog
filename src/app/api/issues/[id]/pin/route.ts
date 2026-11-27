// 課題の個人別ピン留め設定API（ログインユーザーごとに課題一覧・ボード上部の固定を切り替え）
import { NextResponse } from "next/server";
import { getDb, canUserAccessProject } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ピン留め状態の更新（is_pinned の明示指定、または省略時はトグル・数値IDおよび課題キーに対応）
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
    const isNumeric = /^\d+$/.test(id);
    if (!id || !id.trim()) {
      return NextResponse.json({ error: "無効な課題IDです" }, { status: 400 });
    }

    const db = getDb();

    // 対象課題の存在確認
    const issue = db
      .prepare(
        `SELECT id, project_id, issue_key, status
         FROM issues
         WHERE ${isNumeric ? "id = ?" : "issue_key = ?"}`
      )
      .get(isNumeric ? Number(id) : id) as
      | { id: number; project_id: number; issue_key: string; status: string }
      | undefined;

    if (!issue) {
      return NextResponse.json({ error: "対象の課題が見つかりません" }, { status: 404 });
    }

    // プロジェクトアクセス権チェック
    if (
      !canUserAccessProject(
        db,
        sessionUser.id,
        Number(issue.project_id),
        sessionUser.role_type,
        sessionUser.is_admin
      )
    ) {
      return NextResponse.json(
        { error: "この課題をピン留めする権限がありません（プロジェクトメンバーではありません）" },
        { status: 403 }
      );
    }

    // 現在のピン留め状態を取得
    const existingPin = db
      .prepare("SELECT pinned_at FROM issue_pins WHERE issue_id = ? AND user_id = ?")
      .get(issue.id, sessionUser.id) as { pinned_at: string } | undefined;

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

    const nextPinned =
      requestedPinned !== undefined
        ? requestedPinned
          ? 1
          : 0
        : existingPin
        ? 0
        : 1;

    // 完了済み（closed）課題は新規ピン留め不可（解除のみ許可）
    if (nextPinned === 1 && issue.status === "closed") {
      return NextResponse.json(
        { error: "完了済みの課題はピン留めできません" },
        { status: 400 }
      );
    }

    if (nextPinned === 1) {
      db.prepare(
        `INSERT INTO issue_pins (issue_id, user_id, pinned_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(issue_id, user_id) DO UPDATE SET pinned_at = CURRENT_TIMESTAMP`
      ).run(issue.id, sessionUser.id);
    } else {
      db.prepare("DELETE FROM issue_pins WHERE issue_id = ? AND user_id = ?").run(
        issue.id,
        sessionUser.id
      );
    }

    const updated = db
      .prepare("SELECT pinned_at FROM issue_pins WHERE issue_id = ? AND user_id = ?")
      .get(issue.id, sessionUser.id) as { pinned_at: string } | undefined;

    return NextResponse.json({
      issue_id: issue.id,
      issue_key: issue.issue_key,
      is_pinned: updated ? 1 : 0,
      pinned_at: updated ? updated.pinned_at : null,
    });
  } catch (error) {
    console.error("課題ピン留め更新エラー:", error);
    return NextResponse.json(
      { error: "課題のピン留め設定の更新に失敗しました" },
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
