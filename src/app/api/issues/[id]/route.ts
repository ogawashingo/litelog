// 課題詳細取得・更新・削除API
import { NextResponse } from "next/server";
import {
  getDb,
  canUserAccessProject,
  deleteAttachmentFilesOnDisk,
} from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createIssueUpdatedNotifications } from "@/lib/notificationUtils";
import { extendAncestorDueDatesIfNeeded } from "@/lib/parentDueDate";
import {
  getIssueDetailRecord,
  getIssueRelatedEntities,
  getIssueWithProjectByIdOrKey,
  getUpdatedIssueRecord,
  isIssueProjectArchived,
} from "@/lib/issueDetailQueries";
import { buildIssuePatchPlan } from "@/lib/issuePatchPlanner";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 課題詳細の取得（要ログインセッション・コメント一覧含む、数値IDまたは課題キーに対応）
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id } = await params;
    const db = getDb();
    const issue = getIssueDetailRecord(db, id, sessionUser.id);

    if (!issue) {
      return NextResponse.json({ error: "課題が見つかりません" }, { status: 404 });
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
        { error: "この課題を閲覧する権限がありません（プロジェクトメンバーではありません）" },
        { status: 403 }
      );
    }

    const { children, comments, attachments } = getIssueRelatedEntities(
      db,
      Number(issue.id),
      sessionUser.id
    );

    return NextResponse.json({ issue, children, comments, attachments });
  } catch (error) {
    console.error("課題詳細取得エラー:", error);
    return NextResponse.json({ error: "課題詳細の取得に失敗しました" }, { status: 500 });
  }
}

// 課題の更新（要ログインセッション、数値IDまたは課題キーに対応）
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id } = await params;
    const db = getDb();
    const body = (await request.json()) as Record<string, unknown>;
    const currentIssue = getIssueWithProjectByIdOrKey(db, id);

    if (!currentIssue) {
      return NextResponse.json({ error: "課題が見つかりません" }, { status: 404 });
    }

    // プロジェクトアクセス権チェック
    if (
      !canUserAccessProject(
        db,
        sessionUser.id,
        Number(currentIssue.project_id),
        sessionUser.role_type,
        sessionUser.is_admin
      )
    ) {
      return NextResponse.json(
        { error: "この課題を編集する権限がありません（プロジェクトメンバーではありません）" },
        { status: 403 }
      );
    }

    // アーカイブされたプロジェクトの課題は読み取り専用のため、更新を禁止
    if (isIssueProjectArchived(currentIssue)) {
      return NextResponse.json(
        {
          error:
            "この課題が属するプロジェクトはアーカイブされているため、編集・更新できません（読み取り専用）",
        },
        { status: 403 }
      );
    }

    // リクエストボディの検証と更新計画構築
    const planResult = buildIssuePatchPlan(db, currentIssue, body, sessionUser);
    if (!planResult.ok) {
      return NextResponse.json({ error: planResult.error }, { status: planResult.status });
    }

    const { updates, values, activityLogs, historiesToInsert, nextStatus } = planResult.plan;
    if (updates.length === 0) {
      return NextResponse.json({ message: "更新対象がありません" });
    }

    const issueId = currentIssue.id;
    const actorId =
      sessionUser.id ||
      (body.actorId ? Number(body.actorId) : null) ||
      currentIssue.assignee_id ||
      currentIssue.created_by ||
      null;

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(issueId);

    db.exec("BEGIN;");
    try {
      const sql = `UPDATE issues SET ${updates.join(", ")} WHERE id = ?`;
      db.prepare(sql).run(...values);

      // 課題が完了（closed）になった場合、すべてのユーザーのピン留めを自動解除
      if (nextStatus === "closed") {
        db.prepare("DELETE FROM issue_pins WHERE issue_id = ?").run(issueId);
      }

      // 課題変更履歴の保存
      if (historiesToInsert.length > 0) {
        const insertHistory = db.prepare(`
          INSERT INTO issue_histories (issue_id, user_id, field_name, old_value, created_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        for (const h of historiesToInsert) {
          insertHistory.run(currentIssue.id, actorId, h.field, h.oldValue);
        }
      }

      // アクティビティ履歴の記録
      const insertActivity = db.prepare(`
        INSERT INTO activities (issue_id, user_id, action_type, content)
        VALUES (?, ?, ?, ?)
      `);
      for (const log of activityLogs) {
        insertActivity.run(currentIssue.id, actorId, log.type, log.msg);
      }
      if (activityLogs.length === 0 && (body.title !== undefined || body.description !== undefined)) {
        insertActivity.run(
          currentIssue.id,
          actorId,
          "updated",
          `課題 [${currentIssue.issue_key}] を更新しました`
        );
      }

      // ユーザー承認がある場合、親課題（および祖先課題）の期限日も連動延長する
      if (body.extendParentDueDate) {
        const resolvedParentId =
          body.parentId !== undefined
            ? body.parentId
              ? Number(body.parentId)
              : null
            : currentIssue.parent_id;
        const resolvedDueDate =
          body.dueDate !== undefined ? body.dueDate || null : currentIssue.due_date;

        if (resolvedParentId && resolvedDueDate) {
          extendAncestorDueDatesIfNeeded(db, {
            startParentId: resolvedParentId,
            newDueDate: String(resolvedDueDate),
            childIssueKey: currentIssue.issue_key,
            actorId,
          });
        }
      }

      // 本文中の添付ファイルURLをこの課題にバインド（他ユーザーの未紐付けファイル横取りを防止）
      if (body.description !== undefined) {
        const descMatches = String(body.description).matchAll(/\/api\/attachments\/(\d+)/g);
        const updateAttStmt = db.prepare(`
          UPDATE attachments
          SET issue_id = ?
          WHERE id = ? AND ((issue_id IS NULL AND comment_id IS NULL AND user_id = ?) OR issue_id = ?)
        `);
        for (const m of descMatches) {
          if (m[1]) updateAttStmt.run(issueId, Number(m[1]), sessionUser.id, issueId);
        }
      }

      // 実際にフィールド変更があったか、通知先が明示選択されている場合に通知を生成
      const resolvedNextAssigneeId =
        body.assigneeId !== undefined
          ? body.assigneeId
            ? Number(body.assigneeId)
            : null
          : currentIssue.assignee_id;

      const hasOtherChanges =
        (body.issueType !== undefined && body.issueType !== currentIssue.issue_type) ||
        (body.parentId !== undefined &&
          (body.parentId ? Number(body.parentId) : null) !== (currentIssue.parent_id || null));

      const hasEffectiveChange =
        activityLogs.length > 0 ||
        historiesToInsert.length > 0 ||
        hasOtherChanges ||
        (Array.isArray(body.notifyUserIds) && body.notifyUserIds.length > 0);

      if (hasEffectiveChange) {
        const updateSummary =
          activityLogs.length > 0
            ? activityLogs.map((l) => l.msg).join(" / ")
            : `課題 [${currentIssue.issue_key}] を更新しました`;

        createIssueUpdatedNotifications(db, {
          issueId: currentIssue.id,
          senderId: sessionUser.id,
          issueKey: currentIssue.issue_key,
          createdBy: currentIssue.created_by,
          previousAssigneeId: currentIssue.assignee_id,
          newAssigneeId: resolvedNextAssigneeId,
          newDescription:
            body.description !== undefined ? String(body.description).trim() : undefined,
          existingDescription: currentIssue.description || "",
          updateSummary,
          notifyUserIds: Array.isArray(body.notifyUserIds) ? (body.notifyUserIds as number[]) : [],
        });
      }

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    const updated = getUpdatedIssueRecord(db, issueId);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("課題更新エラー:", error);
    return NextResponse.json({ error: "課題の更新に失敗しました" }, { status: 500 });
  }
}

// 課題の削除（要ログインセッション、数値IDまたは課題キーに対応）
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }

    const { id } = await params;
    const db = getDb();
    const actorId = sessionUser.id;
    const currentIssue = getIssueWithProjectByIdOrKey(db, id);

    if (!currentIssue) {
      return NextResponse.json({ error: "課題が見つかりません" }, { status: 404 });
    }

    // プロジェクトアクセス権チェック
    if (
      !canUserAccessProject(
        db,
        sessionUser.id,
        Number(currentIssue.project_id),
        sessionUser.role_type,
        sessionUser.is_admin
      )
    ) {
      return NextResponse.json(
        { error: "この課題を編集する権限がありません（プロジェクトメンバーではありません）" },
        { status: 403 }
      );
    }

    // アーカイブされたプロジェクトの課題は読み取り専用のため、削除を禁止
    if (isIssueProjectArchived(currentIssue)) {
      return NextResponse.json(
        {
          error:
            "この課題が属するプロジェクトはアーカイブされているため、削除できません（読み取り専用）",
        },
        { status: 403 }
      );
    }

    // 課題を削除できるのは、課題の作成者（起票者）または管理者（Admin）のみ
    const canDelete = Boolean(
      sessionUser.is_admin ||
        sessionUser.role_type === "admin" ||
        (currentIssue.created_by && sessionUser.id === currentIssue.created_by)
    );
    if (!canDelete) {
      return NextResponse.json(
        { error: "課題を削除できるのは、課題の作成者または管理者のみです" },
        { status: 403 }
      );
    }

    const issueId = currentIssue.id;

    // 削除前に関連する添付ファイルの保存ファイル名を取得（課題直下およびコメント紐付け分を含む）
    const attachmentsToDelete = db
      .prepare(
        `
        SELECT stored_name FROM attachments
        WHERE issue_id = ?
           OR comment_id IN (SELECT id FROM comments WHERE issue_id = ?)
      `
      )
      .all(issueId, issueId) as { stored_name: string }[];

    db.exec("BEGIN;");
    try {
      db.prepare("DELETE FROM issues WHERE id = ?").run(issueId);

      // 削除アクティビティを記録
      db.prepare(
        `
        INSERT INTO activities (user_id, action_type, content)
        VALUES (?, 'deleted', ?)
      `
      ).run(actorId, `課題 [${currentIssue.issue_key}] 「${currentIssue.title}」を削除しました`);

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    // ディスク上の実体ファイルを安全にクリーンアップ（パストラバーサル防止付き）
    deleteAttachmentFilesOnDisk(attachmentsToDelete.map((a) => a.stored_name));

    return NextResponse.json({ success: true, message: "課題を削除しました" });
  } catch (error) {
    console.error("課題削除エラー:", error);
    return NextResponse.json({ error: "課題の削除に失敗しました" }, { status: 500 });
  }
}
