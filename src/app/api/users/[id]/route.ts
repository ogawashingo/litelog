// ユーザー（チームメンバー）更新・削除API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// メンバー情報の更新
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const currentUser = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(id)) as {
      id: number;
      name: string;
      password: string;
      is_admin: number;
    } | undefined;
    if (!currentUser) {
      return NextResponse.json({ error: "対象のメンバーが見つかりません" }, { status: 404 });
    }

    // 一般ユーザー（本人）によるパスワード変更が含まれる場合は現在のパスワードを照合
    if (body.currentPassword !== undefined || body.newPassword !== undefined) {
      if (!body.currentPassword || currentUser.password !== String(body.currentPassword)) {
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
      if (nextPw === currentUser.password) {
        return NextResponse.json(
          { error: "新しいパスワードには現在のパスワードと異なるものを指定してください" },
          { status: 400 }
        );
      }
      body.password = nextPw;
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (body.loginId !== undefined) {
      const cleanLoginId = String(body.loginId).trim().toLowerCase();
      if (!cleanLoginId) {
        return NextResponse.json({ error: "ログインIDは空にできません" }, { status: 400 });
      }
      const dup = db
        .prepare("SELECT id FROM users WHERE LOWER(login_id) = LOWER(?) AND id != ?")
        .get(cleanLoginId, Number(id));
      if (dup) {
        return NextResponse.json(
          { error: `ログインID「${cleanLoginId}」は既に使用されています` },
          { status: 400 }
        );
      }
      updates.push("login_id = ?");
      values.push(cleanLoginId);
    }
    if (body.password !== undefined && String(body.password).trim() !== "") {
      updates.push("password = ?");
      values.push(String(body.password).trim());
    }
    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json({ error: "メンバー名は空にできません" }, { status: 400 });
      }
      updates.push("name = ?");
      values.push(body.name.trim());
    }
    if (body.role !== undefined) {
      updates.push("role = ?");
      values.push(body.role.trim() || "メンバー");
    }
    if (body.isAdmin !== undefined) {
      const nextAdmin = body.isAdmin ? 1 : 0;
      if (currentUser.is_admin === 1 && nextAdmin === 0) {
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

    if (updates.length > 0) {
      values.push(Number(id));
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
        u.created_at,
        COUNT(i.id) AS issue_count,
        SUM(CASE WHEN i.id IS NOT NULL AND i.status != 'closed' THEN 1 ELSE 0 END) AS open_issue_count
      FROM users u
      LEFT JOIN issues i ON u.id = i.assignee_id
      WHERE u.id = ?
      GROUP BY u.id
    `).get(Number(id));

    return NextResponse.json(updated);
  } catch (error) {
    console.error("メンバー更新エラー:", error);
    return NextResponse.json({ error: "メンバー情報の更新に失敗しました" }, { status: 500 });
  }
}

// メンバーの削除
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();

    const totalRow = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    if (totalRow.count <= 1) {
      return NextResponse.json({ error: "最低1名のメンバーが必要なため削除できません" }, { status: 400 });
    }

    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(id)) as {
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

    db.prepare("DELETE FROM users WHERE id = ?").run(Number(id));
    return NextResponse.json({ success: true, message: "メンバーを削除しました" });
  } catch (error) {
    console.error("メンバー削除エラー:", error);
    return NextResponse.json({ error: "メンバーの削除に失敗しました" }, { status: 500 });
  }
}
