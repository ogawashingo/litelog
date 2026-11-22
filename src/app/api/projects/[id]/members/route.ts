// プロジェクト参加メンバー一覧取得・更新API
import { NextResponse } from "next/server";
import { getDb, canUserAccessProject, setProjectMembers, getProjectMemberUsers } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isArchivedProject } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 参加メンバー一覧・全ユーザー参加状況の取得
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const projectId = Number(id);
    if (!projectId || isNaN(projectId)) {
      return NextResponse.json({ error: "無効なプロジェクトIDです" }, { status: 400 });
    }

    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const db = getDb();
    // プロジェクトの存在確認
    const project = db.prepare("SELECT id, key, name FROM projects WHERE id = ?").get(projectId);
    if (!project) {
      return NextResponse.json({ error: "対象のプロジェクトが見つかりません" }, { status: 404 });
    }

    // アクセス権限チェック（Admin/PMOまたはプロジェクト参加者）
    const canAccess = canUserAccessProject(
      db,
      sessionUser.id,
      projectId,
      sessionUser.role_type,
      sessionUser.is_admin
    );
    if (!canAccess) {
      return NextResponse.json(
        { error: "このプロジェクトのメンバー情報を閲覧する権限がありません" },
        { status: 403 }
      );
    }

    // 参加中のメンバー一覧
    const members = getProjectMemberUsers(db, projectId) as { id: number }[];
    const memberUserIds = new Set(members.map((m) => m.id));

    // システム全体の全ユーザー一覧（参加フラグ付き）
    const allUsers = db
      .prepare(`
        SELECT id, login_id, name, role, role_type, color, is_admin
        FROM users
        ORDER BY is_admin DESC, role_type = 'pmo' DESC, id ASC
      `)
      .all()
      .map((row) => {
        const u = row as { id: number } & Record<string, unknown>;
        return {
          ...u,
          is_member: memberUserIds.has(u.id),
        };
      });

    return NextResponse.json({
      project,
      members,
      allUsers,
    });
  } catch (error) {
    console.error("プロジェクトメンバー取得エラー:", error);
    return NextResponse.json({ error: "メンバー情報の取得に失敗しました" }, { status: 500 });
  }
}

// プロジェクト参加メンバーの更新（Admin管理者またはPMOのみ実行可能）
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const projectId = Number(id);
    if (!projectId || isNaN(projectId)) {
      return NextResponse.json({ error: "無効なプロジェクトIDです" }, { status: 400 });
    }

    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    // 権限チェック: AdminまたはPMOのみメンバー変更可能
    const isManager = sessionUser.is_admin === 1 || sessionUser.role_type === "pmo";
    if (!isManager) {
      return NextResponse.json(
        { error: "プロジェクト参加メンバーの変更は管理者（Admin）またはPMOのみ実行できます" },
        { status: 403 }
      );
    }

    const db = getDb();
    const project = db
      .prepare("SELECT id, key, name, COALESCE(is_archived, 0) AS is_archived FROM projects WHERE id = ?")
      .get(projectId) as { id: number; key: string; name: string; is_archived?: number } | undefined;
    if (!project) {
      return NextResponse.json({ error: "対象のプロジェクトが見つかりません" }, { status: 404 });
    }

    if (isArchivedProject(project)) {
      return NextResponse.json(
        { error: "このプロジェクトはアーカイブされているため、参加メンバーを変更できません（読み取り専用）" },
        { status: 403 }
      );
    }

    // 参加権限チェック（Adminは全件、PMOは参加しているプロジェクトのみメンバー変更可能）
    const canAccess = canUserAccessProject(
      db,
      sessionUser.id,
      projectId,
      sessionUser.role_type,
      sessionUser.is_admin
    );
    if (!canAccess) {
      return NextResponse.json(
        { error: "参加していないプロジェクトのメンバーを変更する権限はありません" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userIds } = body;

    if (!Array.isArray(userIds)) {
      return NextResponse.json({ error: "userIds は配列で指定してください" }, { status: 400 });
    }

    let targetUserIds = userIds.map(Number).filter(Boolean);
    if (sessionUser.is_admin !== 1) {
      // PMOによるメンバー変更時は、既に参加しているシステム管理者（Admin）を強制脱退（締め出し）させられないよう保護
      const currentAdminMembers = db
        .prepare(`
          SELECT pm.user_id
          FROM project_members pm
          JOIN users u ON pm.user_id = u.id
          WHERE pm.project_id = ? AND (u.is_admin = 1 OR u.role_type = 'admin')
        `)
        .all(projectId) as { user_id: number }[];
      targetUserIds = Array.from(
        new Set([...targetUserIds, ...currentAdminMembers.map((m) => Number(m.user_id))])
      );
    }

    // メンバー更新実行
    setProjectMembers(db, projectId, targetUserIds);

    const updatedMembers = getProjectMemberUsers(db, projectId);
    return NextResponse.json({
      message: "プロジェクト参加メンバーを更新しました",
      members: updatedMembers,
    });
  } catch (error) {
    console.error("プロジェクトメンバー更新エラー:", error);
    return NextResponse.json({ error: "メンバー情報の更新に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteParams) {
  return PUT(request, context);
}
