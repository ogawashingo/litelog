// データバックアップ・インポートAPI（管理者専用・パスワード保護対応）
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
  getSessionUser,
  hashPassword,
} from "@/lib/auth";
import { isSafeStoredAttachmentName } from "@/lib/attachmentPolicy";
import { isValidTotpSecret } from "@/lib/totp";
import { isArchivedProject } from "@/types";

const PUBLIC_SETTING_KEYS = new Set([
  "timezone",
  "datetimeFormat",
  "hour12",
  "activityTimeStyle",
  "timeOffsetMinutes",
  "theme",
  "weekStart",
  "showHolidays",
  "announcementEnabled",
  "announcementMessage",
  "announcementType",
  "announcementUpdatedAt",
]);

// 全データのエクスポート（Admin管理者のみ・パスワードや内部シークレットは除外）
export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }
    if (sessionUser.is_admin !== 1) {
      return NextResponse.json(
        { error: "データのバックアップ（エクスポート）は管理者（Admin権限）のみ実行できます" },
        { status: 403 }
      );
    }

    const db = getDb();
    // セキュリティ保護のため password カラムはエクスポートに含めない
    const users = db
      .prepare("SELECT id, login_id, name, role, is_admin, role_type, color, week_start, show_holidays, created_at FROM users")
      .all();
    const projects = db.prepare("SELECT * FROM projects").all();
    const issues = db.prepare("SELECT * FROM issues").all();
    const issueHistories = db.prepare("SELECT * FROM issue_histories").all();
    const comments = db.prepare("SELECT * FROM comments").all();
    const commentHistories = db.prepare("SELECT * FROM comment_histories").all();
    const commentReactions = db.prepare("SELECT * FROM comment_reactions").all();
    const activities = db.prepare("SELECT * FROM activities").all();
    const attachments = db.prepare("SELECT * FROM attachments").all();
    const projectMembers = db.prepare("SELECT * FROM project_members").all();
    const settings = db
      .prepare("SELECT key, value, updated_at FROM settings WHERE key NOT IN ('session_secret', 'schema_migration_version')")
      .all();

    const backupData = {
      version: 6,
      exportedAt: new Date().toISOString(),
      users,
      projects,
      issues,
      issueHistories,
      comments,
      commentHistories,
      commentReactions,
      activities,
      attachments,
      projectMembers,
      settings,
    };

    return NextResponse.json(backupData);
  } catch (error) {
    console.error("エクスポートエラー:", error);
    return NextResponse.json({ error: "データのエクスポートに失敗しました" }, { status: 500 });
  }
}

// バックアップデータのインポート（Admin管理者のみ実行可能）
export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "ログインセッションが確認できません" }, { status: 401 });
    }
    if (sessionUser.is_admin !== 1) {
      return NextResponse.json(
        { error: "データの復元（インポート）は管理者（Admin権限）のみ実行できます" },
        { status: 403 }
      );
    }

    const db = getDb();
    const body = await request.json();
    const { users, projects, issues, issueHistories, comments, commentHistories, commentReactions, activities, attachments, projectMembers, settings } = body;

    if (!Array.isArray(projects) || !Array.isArray(issues)) {
      return NextResponse.json({ error: "有効なバックアップデータ形式ではありません" }, { status: 400 });
    }

    // 既存ユーザーのパスワードハッシュおよび2FA設定を退避（バックアップJSONには秘密情報が含まれないため復元時に引き継ぐ）
    interface ExistingAuthData {
      password: string;
      totp_secret: string | null;
      totp_enabled: number;
      totp_last_used_step: number | null;
    }
    const existingAuthById = new Map<number, ExistingAuthData>();
    const existingAuthByLoginId = new Map<string, ExistingAuthData>();
    const existingUsers = db
      .prepare(
        "SELECT id, login_id, password, totp_secret, COALESCE(totp_enabled, 0) AS totp_enabled, totp_last_used_step FROM users"
      )
      .all() as {
      id: number;
      login_id: string;
      password: string;
      totp_secret: string | null;
      totp_enabled: number;
      totp_last_used_step: number | null;
    }[];
    for (const eu of existingUsers) {
      if (eu.password) {
        const authInfo: ExistingAuthData = {
          password: eu.password,
          totp_secret: eu.totp_secret || null,
          totp_enabled: eu.totp_enabled ? 1 : 0,
          totp_last_used_step: eu.totp_last_used_step ?? null,
        };
        existingAuthById.set(eu.id, authInfo);
        if (eu.login_id) {
          existingAuthByLoginId.set(eu.login_id.toLowerCase(), authInfo);
        }
      }
    }

    // トランザクション内で実行
    db.exec("BEGIN TRANSACTION;");
    try {
      // 既存データをクリア
      db.exec("DELETE FROM attachments;");
      db.exec("DELETE FROM activities;");
      db.exec("DELETE FROM comment_reactions;");
      db.exec("DELETE FROM comment_histories;");
      db.exec("DELETE FROM comments;");
      db.exec("DELETE FROM issue_histories;");
      db.exec("DELETE FROM issues;");
      db.exec("DELETE FROM projects;");

      if (Array.isArray(users) && users.length > 0) {
        db.exec("DELETE FROM users;");
        const insertUser = db.prepare(`
          INSERT INTO users (id, login_id, password, name, role, is_admin, role_type, color, week_start, show_holidays, totp_secret, totp_enabled, totp_last_used_step, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        let restoredAdminCount = 0;

        for (const u of users) {
          const isAdminVal =
            u.is_admin !== undefined
              ? u.is_admin
                ? 1
                : 0
              : String(u.name || "").startsWith("山田")
              ? 1
              : 0;
          if (isAdminVal === 1) {
            restoredAdminCount++;
          }
          const roleTypeVal =
            isAdminVal === 1
              ? "admin"
              : u.role_type === "pmo"
              ? "pmo"
              : "member";
          const fallbackLoginId = String(u.name || "").startsWith("山田")
            ? "yamada"
            : String(u.name || "").startsWith("佐藤")
            ? "sato"
            : String(u.name || "").startsWith("鈴木")
            ? "suzuki"
            : `user${u.id}`;
          const loginIdStr = String(u.login_id || fallbackLoginId).trim().toLowerCase();

          const matchedAuth =
            existingAuthById.get(Number(u.id)) ||
            existingAuthByLoginId.get(loginIdStr);

          // バックアップ内の明示パスワード、または退避した既存パスワードハッシュ、または推測不可能なランダム初期パスワードを設定
          const rawOrExistingPw =
            (u.password && String(u.password).trim()) ||
            matchedAuth?.password ||
            crypto.randomBytes(16).toString("base64url");
          const hashedPw = hashPassword(rawOrExistingPw);

          // 2FA設定の引き継ぎ（バックアップに有効なシークレットが含まれる場合、または既存DBの2FA設定を維持）
          let totpSecret: string | null = null;
          let totpEnabled = 0;
          let totpLastStep: number | null = null;
          if (u.totp_secret && isValidTotpSecret(u.totp_secret)) {
            totpSecret = String(u.totp_secret).trim();
            totpEnabled = u.totp_enabled ? 1 : 0;
          } else if (matchedAuth && matchedAuth.totp_enabled === 1 && matchedAuth.totp_secret) {
            totpSecret = matchedAuth.totp_secret;
            totpEnabled = 1;
            totpLastStep = matchedAuth.totp_last_used_step;
          }

          insertUser.run(
            u.id,
            loginIdStr,
            hashedPw,
            u.name,
            u.role || (isAdminVal ? "管理者" : roleTypeVal === "pmo" ? "PMO" : "メンバー"),
            isAdminVal,
            roleTypeVal,
            u.color || "#4f46e5",
            u.week_start === "sunday" ? "sunday" : "monday",
            u.show_holidays === 0 || u.show_holidays === false ? 0 : 1,
            totpSecret,
            totpEnabled,
            totpLastStep,
            u.created_at || new Date().toISOString()
          );
        }

        // バックアップデータ内に管理者が0名だった場合、管理者不在ロックアウトを防ぐため実行者または先頭ユーザーをAdminに昇格
        if (restoredAdminCount === 0) {
          const fallbackAdmin = db
            .prepare("SELECT id FROM users WHERE id = ? OR LOWER(login_id) = LOWER(?) LIMIT 1")
            .get(sessionUser.id, sessionUser.login_id) as { id: number } | undefined;
          const targetAdminId =
            fallbackAdmin?.id ||
            (db.prepare("SELECT id FROM users ORDER BY id ASC LIMIT 1").get() as { id: number } | undefined)?.id;
          if (targetAdminId) {
            db.prepare("UPDATE users SET is_admin = 1, role_type = 'admin' WHERE id = ?").run(targetAdminId);
          }
        }
      }

      // 現在の有効なユーザーID集合を取得（旧バックアップ等の整合性保証）
      const validUserIds = new Set(
        (db.prepare("SELECT id FROM users").all() as { id: number }[]).map((u) => u.id)
      );

      // プロジェクトデータの復元（アーカイブ状態 is_archived も保持）
      const insertProj = db.prepare(`
        INSERT INTO projects (id, key, name, color, is_archived, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const p of projects) {
        const isArchivedVal =
          p.is_archived !== undefined
            ? p.is_archived
              ? 1
              : 0
            : isArchivedProject(p)
            ? 1
            : 0;
        insertProj.run(
          p.id,
          p.key,
          p.name,
          p.color || "#4f46e5",
          isArchivedVal,
          p.created_at || new Date().toISOString()
        );
      }

      // 課題データの復元（完了理由 resolution も保持）
      const insertIssue = db.prepare(`
        INSERT INTO issues (id, project_id, assignee_id, created_by, issue_key, issue_number, title, description, issue_type, status, priority, resolution, start_date, due_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const i of issues) {
        const assigneeId = i.assignee_id && validUserIds.has(i.assignee_id) ? i.assignee_id : null;
        const createdBy = i.created_by && validUserIds.has(i.created_by) ? i.created_by : null;
        const statusVal = i.status || "open";
        const resolutionVal = statusVal === "closed" && i.resolution ? i.resolution : null;
        insertIssue.run(
          i.id,
          i.project_id,
          assigneeId,
          createdBy,
          i.issue_key,
          i.issue_number,
          i.title,
          i.description || "",
          i.issue_type || "task",
          statusVal,
          i.priority || "medium",
          resolutionVal,
          i.start_date || null,
          i.due_date || null,
          i.created_at || new Date().toISOString(),
          i.updated_at || new Date().toISOString()
        );
      }

      // 親子課題（parent_id）の関連性を復元
      const updateParent = db.prepare("UPDATE issues SET parent_id = ? WHERE id = ?");
      for (const i of issues) {
        if (i.parent_id) {
          updateParent.run(i.parent_id, i.id);
        }
      }

      if (Array.isArray(issueHistories)) {
        const insertIssueHist = db.prepare(`
          INSERT INTO issue_histories (id, issue_id, user_id, field_name, old_value, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const ih of issueHistories) {
          const userId = ih.user_id && validUserIds.has(ih.user_id) ? ih.user_id : null;
          insertIssueHist.run(
            ih.id,
            ih.issue_id,
            userId,
            ih.field_name,
            ih.old_value !== undefined ? ih.old_value : null,
            ih.created_at || new Date().toISOString()
          );
        }
      }

      if (Array.isArray(comments)) {
        const insertComment = db.prepare(`
          INSERT INTO comments (id, issue_id, user_id, content, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const c of comments) {
          const userId = c.user_id && validUserIds.has(c.user_id) ? c.user_id : null;
          insertComment.run(
            c.id,
            c.issue_id,
            userId,
            c.content,
            c.created_at || new Date().toISOString(),
            c.updated_at || null
          );
        }
      }

      if (Array.isArray(commentHistories)) {
        const insertHistory = db.prepare(`
          INSERT INTO comment_histories (id, comment_id, user_id, content, created_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const h of commentHistories) {
          const userId = h.user_id && validUserIds.has(h.user_id) ? h.user_id : null;
          insertHistory.run(
            h.id,
            h.comment_id,
            userId,
            h.content,
            h.created_at || new Date().toISOString()
          );
        }
      }

      const validCommentIds = new Set(
        (db.prepare("SELECT id FROM comments").all() as { id: number }[]).map((c) => c.id)
      );

      if (Array.isArray(commentReactions)) {
        const insertReaction = db.prepare(`
          INSERT OR IGNORE INTO comment_reactions (id, comment_id, user_id, stamp, created_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const r of commentReactions) {
          const userId = r.user_id && validUserIds.has(r.user_id) ? r.user_id : null;
          const commentId = r.comment_id && validCommentIds.has(r.comment_id) ? r.comment_id : null;
          if (userId && commentId && r.stamp) {
            insertReaction.run(
              r.id,
              commentId,
              userId,
              String(r.stamp),
              r.created_at || new Date().toISOString()
            );
          }
        }
      }

      if (Array.isArray(activities)) {
        const insertAct = db.prepare(`
          INSERT INTO activities (id, issue_id, comment_id, user_id, action_type, content, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const a of activities) {
          const userId = a.user_id && validUserIds.has(a.user_id) ? a.user_id : null;
          const commentId = a.comment_id && validCommentIds.has(a.comment_id) ? a.comment_id : null;
          insertAct.run(
            a.id,
            a.issue_id || null,
            commentId,
            userId,
            a.action_type,
            a.content,
            a.created_at || new Date().toISOString()
          );
        }
      }

      if (Array.isArray(attachments)) {
        const insertAtt = db.prepare(`
          INSERT INTO attachments (id, issue_id, comment_id, user_id, file_name, stored_name, file_size, mime_type, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const att of attachments) {
          // パストラバーサルを含む不正な stored_name はインポートを拒否（任意ファイル読み取り・削除攻撃を防止）
          if (!att || !isSafeStoredAttachmentName(att.stored_name)) {
            continue;
          }
          const userId = att.user_id && validUserIds.has(att.user_id) ? att.user_id : null;
          insertAtt.run(
            att.id,
            att.issue_id || null,
            att.comment_id || null,
            userId,
            String(att.file_name || att.stored_name).slice(0, 255),
            String(att.stored_name).trim(),
            Math.max(0, Number(att.file_size) || 0),
            att.mime_type || "application/octet-stream",
            att.created_at || new Date().toISOString()
          );
        }
      }

      // プロジェクト参加メンバーの復元（ピン留め設定も含めて復元）
      if (Array.isArray(projectMembers) && projectMembers.length > 0) {
        const insertPm = db.prepare(`
          INSERT OR IGNORE INTO project_members (project_id, user_id, is_pinned, pinned_at, created_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const pm of projectMembers) {
          if (validUserIds.has(pm.user_id)) {
            insertPm.run(
              pm.project_id,
              pm.user_id,
              pm.is_pinned ? 1 : 0,
              pm.pinned_at || null,
              pm.created_at || new Date().toISOString()
            );
          }
        }
      } else {
        // 旧バックアップ復元時の自動初期メンバーシップ生成（Adminのみ全プロジェクト所属）
        db.exec(`
          INSERT OR IGNORE INTO project_members (project_id, user_id)
          SELECT p.id, u.id FROM projects p CROSS JOIN users u WHERE u.is_admin = 1 OR u.role_type = 'admin';
          INSERT OR IGNORE INTO project_members (project_id, user_id)
          SELECT DISTINCT i.project_id, i.assignee_id FROM issues i WHERE i.assignee_id IS NOT NULL;
        `);
      }

      if (Array.isArray(settings)) {
        const upsertSetting = db.prepare(`
          INSERT INTO settings (key, value, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
        `);
        for (const s of settings) {
          if (
            s &&
            typeof s.key === "string" &&
            PUBLIC_SETTING_KEYS.has(s.key) &&
            s.value !== undefined
          ) {
            upsertSetting.run(s.key, String(s.value));
          }
        }
      }

      db.exec("COMMIT;");

      // 復元後のユーザー情報に合わせて実行中の管理者のセッションCookieを再発行
      const currentAdminAfterRestore = db
        .prepare("SELECT id FROM users WHERE id = ? OR LOWER(login_id) = LOWER(?) LIMIT 1")
        .get(sessionUser.id, sessionUser.login_id) as { id: number } | undefined;
      if (currentAdminAfterRestore) {
        const cookieStore = await cookies();
        cookieStore.set(
          SESSION_COOKIE_NAME,
          createSessionToken(currentAdminAfterRestore.id),
          getSessionCookieOptions()
        );
      }

      return NextResponse.json({ success: true, message: "データのインポートが完了しました" });
    } catch (txError) {
      db.exec("ROLLBACK;");
      throw txError;
    }
  } catch (error) {
    console.error("インポートエラー:", error);
    return NextResponse.json({ error: "データのインポートに失敗しました" }, { status: 500 });
  }
}
