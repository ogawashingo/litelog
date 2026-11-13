// ユーザー（チームメンバー）更新・削除API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser, hashPassword, verifyPassword } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// メンバー情報の更新（Admin管理者は全メンバー編集可、一般ユーザーは自身の表示名・色・本人照合付きパスワードのみ変更可）
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id } = await params;
    const targetId = Number(id);
    if (!targetId || isNaN(targetId)) {
      return NextResponse.json({ error: "無効なメンバーIDです" }, { status: 400 });
    }

    const isAdmin = sessionUser.is_admin === 1;
    const isSelf = sessionUser.id === targetId;

    if (!isAdmin && !isSelf) {
      return NextResponse.json(
        { error: "他のメンバーのアカウント情報は変更できません" },
        { status: 403 }
      );
    }

    const db = getDb();
    const body = await request.json();

    const targetUser = db.prepare("SELECT * FROM users WHERE id = ?").get(targetId) as {
      id: number;
      name: string;
      password: string;
      is_admin: number;
    } | undefined;
    if (!targetUser) {
      return NextResponse.json({ error: "対象のメンバーが見つかりません" }, { status: 404 });
    }

    // 一般ユーザーが権限(isAdmin)・ログインID・ロールを変更しようとした場合は拒否
    if (!isAdmin) {
      if (body.isAdmin !== undefined || body.loginId !== undefined || body.role !== undefined) {
        return NextResponse.json(
          { error: "ログインID・役割・管理者権限の変更には管理者（Admin）権限が必要です" },
          { status: 403 }
        );
      }
      // 一般ユーザーが currentPassword なしで直接 password を指定した場合も拒否
      if (body.password !== undefined && body.currentPassword === undefined) {
        return NextResponse.json(
          { error: "パスワードを変更する場合は現在のパスワードを入力してください" },
          { status: 400 }
        );
      }
    }

    // 本人によるパスワード変更（currentPassword / newPassword 指定時）は現在のパスワードをハッシュ照合
    let hashedPasswordToUpdate: string | null = null;
    if (body.currentPassword !== undefined || body.newPassword !== undefined) {
      if (!body.currentPassword || !verifyPassword(String(body.currentPassword), targetUser.password)) {
        return NextResponse.json(
          { error: "現在のパスワードが正しくありません" },
          { status: 400 }
        );
      }
      const nextPw = String(body.newPassword ?? body.password ?? "").trim();
      if (!nextPw) {
        return NextResponse.json(
          { error: "新しいパスワードを入力してください" },
          { status: 400 }
        );
      }
      if (nextPw.length < 4) {
        return NextResponse.json(
          { error: "新しいパスワードは4文字以上で入力してください" },
          { status: 400 }
        );
      }
      if (verifyPassword(nextPw, targetUser.password)) {
        return NextResponse.json(
          { error: "新しいパスワードには現在のパスワードと異なるものを指定してください" },
          { status: 400 }
        );
      }
      hashedPasswordToUpdate = hashPassword(nextPw);
    } else if (isAdmin && body.password !== undefined && String(body.password).trim() !== "") {
      // Adminによるメンバー管理画面からのパスワード変更
      hashedPasswordToUpdate = hashPassword(String(body.password).trim());
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (isAdmin && body.loginId !== undefined) {
      const cleanLoginId = String(body.loginId).trim().toLowerCase();
      if (!cleanLoginId) {
        return NextResponse.json({ error: "ログインIDは空にできません" }, { status: 400 });
      }
      const dup = db
        .prepare("SELECT id FROM users WHERE LOWER(login_id) = LOWER(?) AND id != ?")
        .get(cleanLoginId, targetId);
      if (dup) {
        return NextResponse.json(
          { error: `ログインID「${cleanLoginId}」は既に使用されています` },
          { status: 400 }
        );
      }
      updates.push("login_id = ?");
      values.push(cleanLoginId);
    }
    if (hashedPasswordToUpdate !== null) {
      updates.push("password = ?");
      values.push(hashedPasswordToUpdate);
    }
    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json({ error: "メンバー名は空にできません" }, { status: 400 });
      }
      updates.push("name = ?");
      values.push(body.name.trim());
    }
    if (isAdmin && body.role !== undefined) {
      updates.push("role = ?");
      values.push(body.role.trim() || "メンバー");
    }
    if (isAdmin && body.isAdmin !== undefined) {
      const nextAdmin = body.isAdmin ? 1 : 0;
      if (targetUser.is_admin === 1 && nextAdmin === 0) {
        const adminCountRow = db
          .prepare("SELECT COUNT(*) as count FROM users WHERE is_admin = 1")
          .get() as { count: number };
        if (adminCountRow.count <= 1) {
          return NextResponse.json(
            { error: "最低1名の管理者（Admin）が必要なため、管理者権限を解除できません" },
            { status: 400 }
          );
        }
      }
      updates.push("is_admin = ?");
      values.push(nextAdmin);
    }
    if (body.color !== undefined) {
      updates.push("color = ?");
      values.push(body.color);
    }
    const incomingWeekStart = body.weekStart ?? body.week_start;
    if (incomingWeekStart !== undefined) {
      const cleanWeekStart = incomingWeekStart === "sunday" ? "sunday" : "monday";
      updates.push("week_start = ?");
      values.push(cleanWeekStart);
    }

    if (updates.length > 0) {
      values.push(targetId);
      db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare(`
      SELECT 
        u.id,
        u.login_id,
        u.name,
        u.role,
        u.is_admin,
        u.color,
        u.week_start,
        u.created_at,
        COUNT(i.id) AS issue_count,
        SUM(CASE WHEN i.id IS NOT NULL AND i.status != 'closed' THEN 1 ELSE 0 END) AS open_issue_count
      FROM users u
      LEFT JOIN issues i ON u.id = i.assignee_id
      WHERE u.id = ?
      GROUP BY u.id
    `).get(targetId);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("メンバー更新エラー:", error);
    return NextResponse.json({ error: "メンバー情報の更新に失敗しました" }, { status: 500 });
  }
}

// メンバーの削除（Admin管理者のみ実行可能）
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }
    if (sessionUser.is_admin !== 1) {
      return NextResponse.json(
        { error: "メンバーの削除には管理者（Admin）権限が必要です" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const targetId = Number(id);
    const db = getDb();

    const totalRow = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    if (totalRow.count <= 1) {
      return NextResponse.json({ error: "最低1名のメンバーが必要なため削除できません" }, { status: 400 });
    }

    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(targetId) as {
      id: number;
      is_admin: number;
    } | undefined;
    if (!target) {
      return NextResponse.json({ error: "対象のメンバーが見つかりません" }, { status: 404 });
    }

    if (target.is_admin === 1) {
      const adminCountRow = db
        .prepare("SELECT COUNT(*) as count FROM users WHERE is_admin = 1")
        .get() as { count: number };
      if (adminCountRow.count <= 1) {
        return NextResponse.json(
          { error: "最後の管理者（Admin）は削除できません" },
          { status: 400 }
        );
      }
    }

    db.prepare("DELETE FROM users WHERE id = ?").run(targetId);
    return NextResponse.json({ success: true, message: "メンバーを削除しました" });
  } catch (error) {
    console.error("メンバー削除エラー:", error);
    return NextResponse.json({ error: "メンバーの削除に失敗しました" }, { status: 500 });
  }
}
