// 管理者専用：ログイン・2FA試行レート制限（ロック状態）の取得および手動解除API
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  RATE_LIMIT_POLICIES,
  listRateLimitStatuses,
  unlockAllRateLimits,
  unlockRateLimitById,
} from "@/lib/rateLimit";

// 現在のロック中・失敗試行一覧の取得（Admin限定）
export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }
    if (sessionUser.is_admin !== 1) {
      return NextResponse.json(
        { error: "ログインロック状況の確認はシステム管理者（Admin）のみ実行できます" },
        { status: 403 }
      );
    }

    const db = getDb();
    const items = listRateLimitStatuses(db);
    const lockedCount = items.filter((item) => item.is_locked).length;

    return NextResponse.json({
      items,
      lockedCount,
      policies: RATE_LIMIT_POLICIES,
    });
  } catch (error) {
    console.error("レート制限一覧取得エラー:", error);
    return NextResponse.json(
      { error: "ログインロック状況の取得に失敗しました" },
      { status: 500 }
    );
  }
}

// ロックの手動解除（Admin限定：?id=X で個別解除、?all=true で一括解除）
export async function DELETE(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }
    if (sessionUser.is_admin !== 1) {
      return NextResponse.json(
        { error: "ログインロックの解除はシステム管理者（Admin）のみ実行できます" },
        { status: 403 }
      );
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "true";
    const idParam = searchParams.get("id");

    if (all) {
      const clearedCount = unlockAllRateLimits(db);
      return NextResponse.json({
        success: true,
        clearedCount,
        message: `すべてのログイン制限（${clearedCount}件）を解除しました`,
      });
    }

    const targetId = Number(idParam);
    if (!targetId || isNaN(targetId)) {
      return NextResponse.json({ error: "解除対象のIDを指定してください" }, { status: 400 });
    }

    const removed = unlockRateLimitById(db, targetId);
    if (!removed) {
      return NextResponse.json({ error: "対象のロック情報が見つかりません" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "ログイン制限を解除しました",
    });
  } catch (error) {
    console.error("レート制限解除エラー:", error);
    return NextResponse.json(
      { error: "ログイン制限の解除に失敗しました" },
      { status: 500 }
    );
  }
}
