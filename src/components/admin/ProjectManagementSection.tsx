// プロジェクト管理セクション
"use client";

import React, { useState } from "react";
import {
  FolderGit2,
  Plus,
  Check,
  X,
  Archive,
  Users,
  FileText,
  RotateCcw,
  Edit2,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { createApiError, getSafeErrorMessage } from "@/lib/clientError";
import { getUserInitials } from "@/components/UserManageModal";
import { User, Project, isAdminUser, canManageIssues } from "@/types";

interface ProjectManagementSectionProps {
  currentUser: User | null;
  projects: Project[];
  fetchProjects: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  onOpenCreateProject: () => void;
  onManageMembers: (project: Project) => void;
  onManageTemplates?: (project: Project) => void;
  onSaveMessage: (msg: string | null) => void;
}

export default function ProjectManagementSection({
  currentUser,
  projects,
  fetchProjects,
  refreshUsers,
  onOpenCreateProject,
  onManageMembers,
  onManageTemplates,
  onSaveMessage,
}: ProjectManagementSectionProps) {
  // プロジェクト名変更・削除・クローズ（アーカイブ）用State（Admin専用）
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [projectErrorMsg, setProjectErrorMsg] = useState("");
  const [projectFilterTab, setProjectFilterTab] = useState<"all" | "active" | "archived">("all");
  const [isUpdatingArchiveId, setIsUpdatingArchiveId] = useState<number | null>(null);

  // プロジェクト名変更の開始（AdminまたはPMO）
  const handleStartEditProject = (proj: Project) => {
    if (!canManageIssues(currentUser)) {
      alert("プロジェクト名の変更は管理者（Admin）またはPMOのみ実行できます。");
      return;
    }
    setDeletingProjectId(null);
    setEditingProjectId(proj.id);
    setEditProjectName(proj.name);
    setProjectErrorMsg("");
  };

  // プロジェクト名変更の保存（AdminまたはPMO）
  const handleSaveProjectName = async (e: React.FormEvent, projectId: number) => {
    e.preventDefault();
    if (!currentUser || !canManageIssues(currentUser)) {
      setProjectErrorMsg("プロジェクト名の変更は管理者（Admin）またはPMOのみ実行できます");
      return;
    }
    if (!editProjectName.trim()) {
      setProjectErrorMsg("プロジェクト名を入力してください");
      return;
    }

    try {
      setIsUpdatingProject(true);
      setProjectErrorMsg("");
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editProjectName.trim(),
          actorId: currentUser.id,
        }),
      });

      if (!res.ok) {
        throw await createApiError(res, "プロジェクト名の変更に失敗しました");
      }

      setEditingProjectId(null);
      setEditProjectName("");
      await fetchProjects();
      onSaveMessage(`プロジェクト名を「${editProjectName.trim()}」に変更しました！`);
      setTimeout(() => onSaveMessage(null), 4000);
    } catch (err: unknown) {
      setProjectErrorMsg(getSafeErrorMessage(err, "エラーが発生しました"));
    } finally {
      setIsUpdatingProject(false);
    }
  };

  // プロジェクト削除確認の開始（管理者のみ）
  const handleStartDeleteProject = (proj: Project) => {
    if (!currentUser?.is_admin) {
      alert("プロジェクトの削除は管理者（Admin権限）のみ実行できます。");
      return;
    }
    if (projects.length <= 1) {
      setProjectErrorMsg("最低1件のプロジェクトが必要なため削除できません");
      return;
    }
    setEditingProjectId(null);
    setDeletingProjectId(proj.id);
    setProjectErrorMsg("");
  };

  // プロジェクト削除の実行（管理者のみ）
  const handleDeleteProject = async (proj: Project) => {
    if (!currentUser?.is_admin) {
      setProjectErrorMsg("プロジェクトの削除は管理者（Admin権限）のみ実行できます");
      return;
    }

    try {
      setIsDeletingProject(true);
      setProjectErrorMsg("");
      const res = await fetch(
        `/api/projects/${proj.id}?actorId=${encodeURIComponent(String(currentUser.id))}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actorId: currentUser.id }),
        }
      );

      if (!res.ok) {
        throw await createApiError(res, "プロジェクトの削除に失敗しました");
      }

      setDeletingProjectId(null);
      await fetchProjects();
      await refreshUsers();
      onSaveMessage(`プロジェクト [${proj.key}] 「${proj.name}」を削除しました！`);
      setTimeout(() => onSaveMessage(null), 4000);
    } catch (err: unknown) {
      setProjectErrorMsg(getSafeErrorMessage(err, "削除エラーが発生しました"));
    } finally {
      setIsDeletingProject(false);
    }
  };

  // プロジェクトのアーカイブ／アーカイブ解除の切り替え（AdminまたはPMO）
  const handleToggleArchiveProject = async (proj: Project) => {
    if (!currentUser || !canManageIssues(currentUser)) {
      setProjectErrorMsg("プロジェクトの状態変更は管理者（Admin）またはPMOのみ実行できます");
      return;
    }

    const willArchive = !proj.is_archived;
    const actionLabel = willArchive ? "アーカイブ" : "アーカイブ解除";

    try {
      setIsUpdatingArchiveId(proj.id);
      setProjectErrorMsg("");
      const res = await fetch(`/api/projects/${proj.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_archived: willArchive ? 1 : 0,
          actorId: currentUser.id,
        }),
      });

      if (!res.ok) {
        throw await createApiError(res, `プロジェクトの${actionLabel}に失敗しました`);
      }

      await fetchProjects();
      onSaveMessage(
        willArchive
          ? `プロジェクト [${proj.key}] をアーカイブしました。読み取り専用となり日常一覧から除外されます。`
          : `プロジェクト [${proj.key}] のアーカイブを解除しました！日常一覧に復帰し、編集可能になりました。`
      );
      setTimeout(() => onSaveMessage(null), 4000);
    } catch (err: unknown) {
      setProjectErrorMsg(getSafeErrorMessage(err, "ステータス変更エラーが発生しました"));
    } finally {
      setIsUpdatingArchiveId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-indigo-100/80 p-5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FolderGit2 className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-slate-800 text-base">
                {isAdminUser(currentUser) ? "プロジェクト管理" : "参加プロジェクト管理"} ({projects.length}件)
              </h3>
            </div>
            {/* モバイル表示時の新規作成ボタン */}
            <button
              type="button"
              onClick={() => {
                if (!canManageIssues(currentUser)) {
                  alert("新規プロジェクトの作成は管理者（Admin）またはPMOのみ実行できます。");
                  return;
                }
                onOpenCreateProject();
              }}
              className="md:hidden flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新規作成</span>
            </button>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {isAdminUser(currentUser)
              ? "登録プロジェクトの確認・名称変更・アーカイブ・削除（Admin専用）を行えます。"
              : "参加中プロジェクトの確認・名称変更・アーカイブ・メンバー管理を行えます。"}
          </p>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-2.5">
          {/* プロジェクトフィルター切り替えタブ */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs sm:text-sm w-full md:w-auto justify-between md:justify-start">
            <button
              type="button"
              onClick={() => setProjectFilterTab("all")}
              className={`flex-1 md:flex-initial px-2.5 sm:px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer text-center ${
                projectFilterTab === "all"
                  ? "bg-white text-indigo-700 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              すべて ({projects.length})
            </button>
            <button
              type="button"
              onClick={() => setProjectFilterTab("active")}
              className={`flex-1 md:flex-initial px-2.5 sm:px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer text-center ${
                projectFilterTab === "active"
                  ? "bg-white text-indigo-700 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              オープン ({projects.filter((p) => !p.is_archived).length})
            </button>
            <button
              type="button"
              onClick={() => setProjectFilterTab("archived")}
              className={`flex-1 md:flex-initial px-2.5 sm:px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer text-center ${
                projectFilterTab === "archived"
                  ? "bg-white text-indigo-700 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              アーカイブ済 ({projects.filter((p) => p.is_archived).length})
            </button>
          </div>

          {/* PC表示時の新規作成ボタン */}
          <button
            type="button"
            onClick={() => {
              if (!canManageIssues(currentUser)) {
                alert("新規プロジェクトの作成は管理者（Admin）またはPMOのみ実行できます。");
                return;
              }
              onOpenCreateProject();
            }}
            className="hidden md:flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors cursor-pointer shadow-xs shrink-0 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>新規作成</span>
          </button>
        </div>
      </div>

      {projectErrorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm font-medium">
          {projectErrorMsg}
        </div>
      )}

      <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
        {projects
          .filter((p) => {
            if (projectFilterTab === "active") return !p.is_archived;
            if (projectFilterTab === "archived") return Boolean(p.is_archived);
            return true;
          })
          .map((p) => {
            const isEditingThis = editingProjectId === p.id;
            const isDeletingThis = deletingProjectId === p.id;
            const isArchived = Boolean(p.is_archived);
            const isThisUpdatingArchive = isUpdatingArchiveId === p.id;
            return (
              <div
                key={p.id}
                className={`px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm transition-colors ${
                  isArchived ? "bg-slate-50/70" : "bg-white hover:bg-slate-50/40"
                }`}
              >
                {isEditingThis ? (
                  <form
                    onSubmit={(e) => handleSaveProjectName(e, p.id)}
                    className="flex items-center gap-2 w-full"
                  >
                    <span
                      style={{ backgroundColor: p.color || "#4f46e5" }}
                      className="w-3.5 h-3.5 rounded-xs shrink-0 shadow-2xs"
                    />
                    <span className="font-mono font-bold text-slate-600 shrink-0 text-sm">
                      [{p.key}]
                    </span>
                    <input
                      type="text"
                      value={editProjectName}
                      onChange={(e) => setEditProjectName(e.target.value)}
                      placeholder="新しいプロジェクト名"
                      autoFocus
                      className="flex-1 min-w-0 bg-white border border-indigo-300 rounded px-3 py-1.5 text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={isUpdatingProject}
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      <Check className="w-4 h-4" />
                      <span>保存</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProjectId(null);
                        setEditProjectName("");
                        setProjectErrorMsg("");
                      }}
                      className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer shrink-0"
                      title="キャンセル"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 flex-wrap">
                      <span
                        style={{ backgroundColor: p.color || "#4f46e5" }}
                        className="w-3.5 h-3.5 rounded-xs shrink-0 shadow-2xs"
                      />
                      <span className="font-mono font-bold text-sm text-slate-600 shrink-0">
                        [{p.key}]
                      </span>
                      <span
                        className={`font-bold text-sm sm:text-base ${
                          isArchived
                            ? "text-slate-500 line-through decoration-slate-400"
                            : "text-slate-900"
                        }`}
                        title={p.name}
                      >
                        {p.name}
                      </span>
                      {/* アーカイブ済みの場合のみバッジを表示 */}
                      {isArchived && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-700 border border-slate-300 shrink-0">
                          <Archive className="w-3.5 h-3.5" />
                          <span>アーカイブ</span>
                        </span>
                      )}

                      {/* 参加メンバーアバタープレビュー */}
                      <div className="flex items-center gap-1 ml-1 shrink-0">
                        <div className="flex -space-x-1.5 overflow-hidden">
                          {(p.members || []).slice(0, 4).map((m) => (
                            <div
                              key={m.id}
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-white"
                              style={{ backgroundColor: m.color || "#4f46e5" }}
                              title={`${m.name} (@${m.login_id})`}
                            >
                              {getUserInitials(m.name)}
                            </div>
                          ))}
                        </div>
                        <span className="text-[11px] text-slate-500 font-medium ml-0.5">
                          {p.member_count !== undefined ? `${p.member_count}名` : ""}
                        </span>
                      </div>
                    </div>

                    {canManageIssues(currentUser) && (
                      <div className="flex items-center gap-2 shrink-0 self-end md:self-auto flex-wrap">
                        {/* 参加メンバー管理ボタン */}
                        <button
                          type="button"
                          onClick={() => onManageMembers(p)}
                          title="プロジェクト参加メンバーを追加・削除 (Admin / PMO)"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs sm:text-sm transition-colors cursor-pointer shadow-2xs"
                        >
                          <Users className="w-4 h-4 text-indigo-600" />
                          <span>メンバー管理</span>
                        </button>
                        {/* 課題テンプレート管理ボタン */}
                        {onManageTemplates && (
                          <button
                            type="button"
                            onClick={() => onManageTemplates(p)}
                            title="プロジェクト共通の課題テンプレートを編集 (Admin / PMO)"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs sm:text-sm transition-colors cursor-pointer shadow-2xs"
                          >
                            <FileText className="w-4 h-4 text-slate-500" />
                            <span>テンプレート</span>
                          </button>
                        )}
                        {/* アーカイブ／アーカイブ解除トグルボタン */}
                        <button
                          type="button"
                          onClick={() => handleToggleArchiveProject(p)}
                          disabled={isThisUpdatingArchive}
                          title={
                            isArchived
                              ? "プロジェクトのアーカイブを解除して日常一覧に復帰（編集可能化）"
                              : "プロジェクトをアーカイブ（読み取り専用化・日常一覧から非表示）"
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold text-xs sm:text-sm transition-colors cursor-pointer ${
                            isArchived
                              ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 shadow-2xs"
                              : "border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700"
                          }`}
                        >
                          {isArchived ? (
                            <>
                              <RotateCcw className="w-4 h-4" />
                              <span>アーカイブ解除</span>
                            </>
                          ) : (
                            <>
                              <Archive className="w-4 h-4" />
                              <span>アーカイブ</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEditProject(p)}
                          title="プロジェクト名を変更 (Admin / PMO)"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                          <span>名称変更</span>
                        </button>
                        {Boolean(currentUser?.is_admin) && (
                          <button
                            type="button"
                            onClick={() => handleStartDeleteProject(p)}
                            title={
                              projects.length > 1
                                ? "プロジェクトを削除 (Admin専用)"
                                : "最低1件のプロジェクトが必要なため削除できません"
                            }
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold text-xs sm:text-sm transition-colors ${
                              projects.length > 1
                                ? "border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 cursor-pointer"
                                : "border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed"
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>削除</span>
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* プロジェクト削除確認ボックス（Admin専用） */}
                {isDeletingThis && (
                  <div className="w-full mt-2 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-sm space-y-3">
                    <div className="flex items-start gap-2 text-rose-800 font-semibold leading-relaxed">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <span>
                        プロジェクト <strong>[{p.key}] {p.name}</strong> と紐づく全課題を完全に削除しますか？（※課題やコメントもすべて消去されます）
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setDeletingProjectId(null);
                          setProjectErrorMsg("");
                        }}
                        disabled={isDeletingProject}
                        className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-sm font-medium transition-colors cursor-pointer"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProject(p)}
                        disabled={isDeletingProject}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>{isDeletingProject ? "削除中..." : "削除する"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
