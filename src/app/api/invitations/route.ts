// src/app/api/invitations/route.ts
// 管理者専用 招待リンク発行および一覧取得API
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { getSessionUser, hashInvitationToken } from "@/lib/auth";
import { validateInvitationHours } from "@/lib/validation";

// 招待リンク発行 (Admin限定)
export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.is_admin !== 1) {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, hoursValid = 24 } = body;

    if (!userId) {
      return NextResponse.json({ error: "招待対象のユーザーIDが必要です" }, { status: 400 });
    }
    const hoursErr = validateInvitationHours(hoursValid);
    if (hoursErr) {
      return NextResponse.json({ error: hoursErr }, { status: 400 });
    }

    const db = getDb();
    const targetUser = db.prepare(`
      SELECT id, login_id, name, role, role_type, is_admin, COALESCE(totp_enabled, 0) AS totp_enabled
      FROM users
      WHERE id = ?
    `).get(userId) as {
      id: number;
      login_id: string;
      name: string;
      role: string;
      role_type: string;
      is_admin: number;
      totp_enabled: number;
    } | undefined;

    if (!targetUser) {
      return NextResponse.json({ error: "指定されたユーザーが見つかりません" }, { status: 404 });
    }

    // 2FAが既に有効な他のシステム管理者（Admin）に対する招待リンク発行（2FAバイパス・乗っ取り）を遮断
    if (
      targetUser.id !== sessionUser.id &&
      (targetUser.is_admin === 1 || targetUser.role_type === "admin") &&
      targetUser.totp_enabled === 1
    ) {
      return NextResponse.json(
        { error: "2要素認証が有効な他のシステム管理者に対して招待リンクを発行することはできません" },
        { status: 403 }
      );
    }

    // 以前の未使用招待があれば無効化（新しいトークンに更新）
    db.prepare(`
      DELETE FROM invitations
      WHERE user_id = ? AND used_at IS NULL
    `).run(targetUser.id);

    // 64文字のセキュアなランダム16進数トークン（DBにはSHA-256ハッシュ値のみ保存し漏洩を防止）
    const token = crypto.randomBytes(32).toString("hex");
    const hashedToken = hashInvitationToken(token);

    // 有効期限の計算（デフォルト24時間）
    const expiresAt = new Date(Date.now() + Number(hoursValid) * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);

    db.prepare(`
      INSERT INTO invitations (token, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(hashedToken, targetUser.id, expiresAt);

    // リクエストのホスト情報から完全な招待URLを安全に組み立て（Host / Proto ヘッダーインジェクション防止）
    const trustProxy = process.env.TRUST_PROXY !== "false";
    const rawHost = (
      (trustProxy ? request.headers.get("x-forwarded-host") : null) ||
      request.headers.get("host") ||
      ""
    )
      .split(",")[0]
      .trim();
    const safeHost = /^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::\d{1,5})?$/.test(rawHost)
      ? rawHost
      : "localhost:3000";
    const rawProto = (trustProxy ? request.headers.get("x-forwarded-proto") || "" : "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    const safeProto = rawProto === "https" ? "https" : "http";
    const inviteUrl = `${safeProto}://${safeHost}/invite?token=${token}`;

    return NextResponse.json({
      success: true,
      token,
      inviteUrl,
      expiresAt,
      user: targetUser,
      message: `「${targetUser.name}」さんの招待リンクを発行しました（有効期限: ${hoursValid}時間）`,
    });
  } catch (error) {
    console.error("招待リンク発行エラー:", error);
    return NextResponse.json({ error: "招待リンクの発行に失敗しました" }, { status: 500 });
  }
}

// 発行済み招待一覧の取得 (Admin限定・セキュリティ保護のため生トークンは返却しない)
export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || sessionUser.is_admin !== 1) {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    }

    const db = getDb();
    const invitations = db.prepare(`
      SELECT i.id, i.expires_at, i.used_at, i.created_at,
             u.id as user_id, u.login_id, u.name as user_name, u.role as user_role
      FROM invitations i
      JOIN users u ON i.user_id = u.id
      ORDER BY i.id DESC
      LIMIT 50
    `).all();

    return NextResponse.json({ invitations });
  } catch (error) {
    console.error("招待一覧取得エラー:", error);
    return NextResponse.json({ error: "招待一覧の取得に失敗しました" }, { status: 500 });
  }
}
