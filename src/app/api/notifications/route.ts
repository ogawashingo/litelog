// 通知一覧取得・既読化・削除API
import { NextResponse } from "next/server";
import { getDb, getUserAccessibleProjectIds } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// 通知一覧および未読件数の取得（要ログインセッション・アクセス可能プロジェクトの通知のみ返却）
export async function GET(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 30, 100);
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const db = getDb();
    const accessibleProjectIds = getUserAccessibleProjectIds(
      db,
      sessionUser.id,
      sessionUser.role_type,
      sessionUser.is_admin
    );

    if (accessibleProjectIds !== null && accessibleProjectIds.length === 0) {
      return NextResponse.json({ notifications: [], unreadCount: 0 });
    }

    const projectFilterClause =
      accessibleProjectIds === null
        ? ""
        : ` AND i.project_id IN (${accessibleProjectIds.map(() => "?").join(",")})`;
    const projectFilterParams = accessibleProjectIds === null ? [] : accessibleProjectIds;

    // 未読通知総数を取得（参加中プロジェクトの課題に紐づく通知のみ集計）
    const countRow = db.prepare(`
      SELECT COUNT(*) AS unread_count 
      FROM notifications n
      JOIN issues i ON n.issue_id = i.id
      WHERE n.user_id = ? AND n.is_read = 0${projectFilterClause}
    `).get(sessionUser.id, ...projectFilterParams) as { unread_count: number } | undefined;
    const unreadCount = countRow ? countRow.unread_count : 0;

    // 通知一覧を取得（課題情報・送信者情報を結合・アクセス可能プロジェクトのみ）
    let sql = `
      SELECT 
        n.*,
        sender.name AS sender_name,
        sender.color AS sender_color,
        i.issue_key,
        i.title AS issue_title,
        p.name AS project_name,
        p.color AS project_color
      FROM notifications n
      LEFT JOIN users sender ON n.sender_id = sender.id
      JOIN issues i ON n.issue_id = i.id
      JOIN projects p ON i.project_id = p.id
      WHERE n.user_id = ?${projectFilterClause}
    `;

    if (unreadOnly) {
      sql += " AND n.is_read = 0";
    }

    sql += " ORDER BY n.created_at DESC LIMIT ?";

    const notifications = db.prepare(sql).all(sessionUser.id, ...projectFilterParams, limit);

    return NextResponse.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("通知一覧取得エラー:", error);
    return NextResponse.json({ error: "通知一覧の取得に失敗しました" }, { status: 500 });
  }
}

// 通知の既読化（要ログインセッション）
export async function PATCH(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const db = getDb();
    const body = await request.json().catch(() => ({}));
    const { id, all } = body;

    if (all) {
      // すべて既読にする
      db.prepare(`
        UPDATE notifications 
        SET is_read = 1 
        WHERE user_id = ? AND is_read = 0
      `).run(sessionUser.id);
      return NextResponse.json({ success: true, message: "すべての通知を既読にしました" });
    }

    if (id !== undefined) {
      // 指定の通知を既読にする
      db.prepare(`
        UPDATE notifications 
        SET is_read = 1 
        WHERE id = ? AND user_id = ?
      `).run(Number(id), sessionUser.id);
      return NextResponse.json({ success: true, message: "通知を既読にしました" });
    }

    return NextResponse.json({ error: "id または all パラメータが必要です" }, { status: 400 });
  } catch (error) {
    console.error("通知既読化エラー:", error);
    return NextResponse.json({ error: "通知の更新に失敗しました" }, { status: 500 });
  }
}

// 通知の削除（要ログインセッション）
export async function DELETE(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get("id");
    const allParam = searchParams.get("all") === "true";

    const db = getDb();

    if (allParam) {
      // 全削除
      db.prepare("DELETE FROM notifications WHERE user_id = ?").run(sessionUser.id);
      return NextResponse.json({ success: true, message: "通知をすべて削除しました" });
    }

    if (idParam) {
      db.prepare("DELETE FROM notifications WHERE id = ? AND user_id = ?").run(
        Number(idParam),
        sessionUser.id
      );
      return NextResponse.json({ success: true, message: "通知を削除しました" });
    }

    return NextResponse.json({ error: "id または all パラメータが必要です" }, { status: 400 });
  } catch (error) {
    console.error("通知削除エラー:", error);
    return NextResponse.json({ error: "通知の削除に失敗しました" }, { status: 500 });
  }
}
