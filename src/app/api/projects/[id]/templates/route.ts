// プロジェクト別課題テンプレート取得・作成API
import { NextResponse } from "next/server";
import { getDb, canUserAccessProject } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canManageIssues, isArchivedProject } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// デフォルトの標準テンプレート
const DEFAULT_TEMPLATES = [
  {
    name: "機能開発 / 改善",
    description: "一般的な機能追加や改修タスク",
    content: `### 目的・背景\n\n### 実装内容\n- [ ] \n\n### クローズ条件（最大2つまで）\n- [ ] PRがマージされステージング環境で動作確認が取れること`,
    sort_order: 1,
  },
  {
    name: "バグ報告 / 不具合調査",
    description: "不具合の再現手順と原因特定・修正",
    content: `### 不具合の概要\n\n### 再現手順\n1. \n2. \n\n### 期待する動作\n\n### 実際の結果\n\n### クローズ条件\n- [ ] 不具合が修正され、再現手順で正常に動作すること`,
    sort_order: 2,
  },
  {
    name: "新メンバー受入（オンボーディング）",
    description: "新入社員・業務委託のアカウント発行や初期設定",
    content: `### 受入メンバー\n- 氏名: \n- 役割: \n\n### オンボーディングチェックリスト\n- [ ] PCキッティング・初期OSセットアップ\n- [ ] GitHub / リポジトリ閲覧権限付与\n- [ ] Slack / チャットツール招待\n- [ ] 開発環境構築（README・Docker動作確認）\n- [ ] 初日1on1の実施`,
    sort_order: 3,
  },
  {
    name: "本番リリース前チェック",
    description: "リリース前の確認項目とスモークテスト",
    content: `### リリース概要\n\n### チェックリスト\n- [ ] ステージング環境での動作確認完了\n- [ ] DBマイグレーションおよび環境変数確認\n- [ ] 本番デプロイ実施\n- [ ] 本番スモークテスト（15分）完了`,
    sort_order: 4,
  },
];

// テンプレート一覧取得
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
    const project = db.prepare("SELECT id, key, name, is_archived FROM projects WHERE id = ?").get(projectId) as
      | { id: number; key: string; name: string; is_archived: number }
      | undefined;
    if (!project) {
      return NextResponse.json({ error: "対象のプロジェクトが見つかりません" }, { status: 404 });
    }

    // アクセス権限確認
    const canAccess = canUserAccessProject(
      db,
      sessionUser.id,
      projectId,
      sessionUser.role_type,
      sessionUser.is_admin
    );
    if (!canAccess) {
      return NextResponse.json({ error: "プロジェクトの閲覧権限がありません" }, { status: 403 });
    }

    // テンプレート一覧取得
    let templates = db
      .prepare(
        "SELECT id, project_id, name, description, content, sort_order, created_at, updated_at FROM issue_templates WHERE project_id = ? ORDER BY sort_order ASC, id ASC"
      )
      .all(projectId) as Array<{
      id: number;
      project_id: number;
      name: string;
      description: string | null;
      content: string;
      sort_order: number;
      created_at: string;
      updated_at: string;
    }>;

    // もし未登録の場合は、デフォルトテンプレートを初期投入
    if (templates.length === 0) {
      const insertStmt = db.prepare(
        "INSERT INTO issue_templates (project_id, name, description, content, sort_order) VALUES (?, ?, ?, ?, ?)"
      );
      for (const def of DEFAULT_TEMPLATES) {
        insertStmt.run(projectId, def.name, def.description, def.content, def.sort_order);
      }

      templates = db
        .prepare(
          "SELECT id, project_id, name, description, content, sort_order, created_at, updated_at FROM issue_templates WHERE project_id = ? ORDER BY sort_order ASC, id ASC"
        )
        .all(projectId) as typeof templates;
    }

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("GET /api/projects/[id]/templates error:", error);
    return NextResponse.json({ error: "テンプレート一覧の取得に失敗しました" }, { status: 500 });
  }
}

// テンプレート新規作成（PMO / 管理者限定）
export async function POST(request: Request, { params }: RouteParams) {
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

    if (!canManageIssues(sessionUser)) {
      return NextResponse.json({ error: "テンプレートの作成にはAdminまたはPMO権限が必要です" }, { status: 403 });
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

    const body = await request.json();
    const name = String(body.name || "").trim();
    const description = body.description ? String(body.description).trim() : null;
    const content = String(body.content || "").trim();
    const sortOrder = Number(body.sort_order) || 0;

    if (!name) {
      return NextResponse.json({ error: "テンプレート名は必須です" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: "テンプレート本文（Markdown）は必須です" }, { status: 400 });
    }

    const res = db
      .prepare(
        "INSERT INTO issue_templates (project_id, name, description, content, sort_order) VALUES (?, ?, ?, ?, ?)"
      )
      .run(projectId, name, description, content, sortOrder);

    const newTemplate = db
      .prepare("SELECT * FROM issue_templates WHERE id = ?")
      .get(res.lastInsertRowid);

    return NextResponse.json({ template: newTemplate, message: "テンプレートを作成しました" }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects/[id]/templates error:", error);
    return NextResponse.json({ error: "テンプレートの作成に失敗しました" }, { status: 500 });
  }
}
