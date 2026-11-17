// プロジェクト一覧ウィジェットコンポーネント
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FolderPlus, Folder, ChevronRight, Kanban, ChartGantt, Edit2, Trash2, Check, X, AlertTriangle, Archive } from "lucide-react";
import { Project, isArchivedProject, canManageIssues } from "@/types";
import { useUser } from "./UserContext";
import { getUserInitials } from "./UserManageModal";

interface ExtendedProject extends Project {
  total_issues?: number;
  active_issues?: number;
}

interface ProjectListProps {
  projects: ExtendedProject[];
  selectedProjectId: number | null;
  onSelectProject: (id: number | null) => void;
  onOpenCreateProject: () => void;
  onUpdated?: () => void;
}

export default function ProjectList({
  projects,
  selectedProjectId,
  onSelectProject,
  onOpenCreateProject,
  onUpdated,
}: ProjectListProps) {
  const { currentUser } = useUser();
  const isAdmin = Boolean(currentUser?.is_admin);

  // プロジェクト名編集用State（Admin専用）
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // プロジェクト削除確認用State（Admin専用）
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // アーカイブ済みプロジェクトの表示トグル
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = projects.filter((p) => isArchivedProject(p)).length;
  const visibleProjects = showArchived ? projects : projects.filter((p) => !isArchivedProject(p));

  // プロジェクト名の編集開始
  const startEditProject = (e: React.MouseEvent, proj: ExtendedProject) => {
    e.stopPropagation();
    if (!isAdmin) return;
    setDeletingProjectId(null);
    setDeleteError("");
    setEditingProjectId(proj.id);
    setEditName(proj.name);
    setEditError("");
  };

  // プロジェクト名の編集キャンセル
  const cancelEditProject = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProjectId(null);
    setEditName("");
    setEditError("");
  };

  // プロジェクト名の保存実行
  const saveProjectName = async (e: React.FormEvent, projectId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAdmin || !currentUser) return;
    if (!editName.trim()) {
      setEditError("プロジェクト名を入力してください");
      return;
    }

    try {
      setIsSaving(true);
      setEditError("");
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          actorId: currentUser.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "プロジェクト名の変更に失敗しました");
      }

      setEditingProjectId(null);
      setEditName("");
      onUpdated?.();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsSaving(false);
    }
  };

  // プロジェクト削除確認の開始
  const startDeleteProject = (e: React.MouseEvent, proj: ExtendedProject) => {
    e.stopPropagation();
    if (!isAdmin) return;
    if (projects.length <= 1) {
      alert("最低1件のプロジェクトが必要なため削除できません。");
      return;
    }
    setEditingProjectId(null);
    setEditError("");
    setDeletingProjectId(proj.id);
    setDeleteError("");
  };

  // プロジェクト削除確認のキャンセル
  const cancelDeleteProject = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingProjectId(null);
    setDeleteError("");
  };

  // プロジェクト削除の実行
  const executeDeleteProject = async (e: React.MouseEvent, proj: ExtendedProject) => {
    e.stopPropagation();
    if (!isAdmin || !currentUser) return;

    try {
      setIsDeleting(true);
      setDeleteError("");
      const res = await fetch(
        `/api/projects/${proj.id}?actorId=${encodeURIComponent(String(currentUser.id))}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actorId: currentUser.id }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "プロジェクトの削除に失敗しました");
      }

      setDeletingProjectId(null);
      if (selectedProjectId === proj.id) {
        onSelectProject(null);
      }
      onUpdated?.();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "削除エラーが発生しました");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur-xs rounded-xl shadow-xs border border-indigo-100/80 p-4">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
            <Folder className="w-4 h-4 text-indigo-600" />
            <span>プロジェクト一覧</span>
          </h3>
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className={`text-[11px] px-1.5 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                showArchived
                  ? "bg-indigo-100 text-indigo-800 font-bold"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600"
              }`}
              title={showArchived ? "アーカイブ済みプロジェクトを隠す" : "アーカイブ済みプロジェクトも含めて表示"}
            >
              {showArchived ? "アーカイブ表示中" : `+アーカイブ済(${archivedCount})`}
            </button>
          )}
        </div>
        <button
          onClick={() => {
            if (!canManageIssues(currentUser)) {
              alert("新規プロジェクトの作成は管理者（Admin）またはPMOのみ実行できます。");
              return;
            }
            onOpenCreateProject();
          }}
          title={
            canManageIssues(currentUser)
              ? "新規プロジェクト作成 (Admin / PMO)"
              : "新規プロジェクト作成 (Admin / PMO権限が必要)"
          }
          className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-colors ${
            canManageIssues(currentUser)
              ? "text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 cursor-pointer"
              : "text-slate-400 cursor-not-allowed"
          }`}
        >
          <FolderPlus className="w-4 h-4" />
          <span>追加</span>
        </button>
      </div>

      <div className="space-y-2.5">
        {/* 全プロジェクト表示ボタン */}
        <button
          onClick={() => onSelectProject(null)}
          className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all flex items-center justify-between cursor-pointer ${
            selectedProjectId === null
              ? "bg-indigo-50/90 border-indigo-300 font-bold text-indigo-950 shadow-2xs"
              : "border-slate-200 hover:bg-slate-50 text-slate-700"
          }`}
        >
          <span>すべての課題を表示</span>
          <ChevronRight className="w-4 h-4 text-indigo-400" />
        </button>

        {/* 各プロジェクトカード */}
        {visibleProjects.map((proj) => {
          const total = proj.total_issues || 0;
          const active = proj.active_issues || 0;
          // 負数にならないよう安全ガード
          const completed = Math.max(0, total - active);
          const progressPercent = total > 0 ? Math.min(100, Math.max(0, Math.round((completed / total) * 100))) : 0;
          const isSelected = selectedProjectId === proj.id;
          const isEditingThis = editingProjectId === proj.id;
          const isDeletingThis = deletingProjectId === proj.id;
          const isArchived = isArchivedProject(proj);

          return (
            <div
              key={proj.id}
              onClick={() => {
                if (!isEditingThis && !isDeletingThis) {
                  onSelectProject(proj.id);
                }
              }}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                isSelected
                  ? "bg-indigo-50/70 border-indigo-400 ring-1 ring-indigo-300 shadow-2xs"
                  : isArchived
                  ? "bg-slate-50/60 border-slate-200 hover:border-slate-300 opacity-80"
                  : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50/70"
              }`}
            >
              {isEditingThis ? (
                <form
                  onSubmit={(e) => saveProjectName(e, proj.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mb-2 space-y-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shadow-2xs shrink-0"
                      style={{ backgroundColor: proj.color || "#4f46e5" }}
                    />
                    <span className="font-mono font-bold text-xs text-slate-600 shrink-0">
                      [{proj.key}]
                    </span>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="プロジェクト名を入力"
                      autoFocus
                      className="flex-1 min-w-0 bg-white border border-indigo-300 rounded-md px-2 py-1 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={isSaving}
                      title="プロジェクト名を保存"
                      className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      <Check className="w-3 h-3" />
                      <span>保存</span>
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditProject}
                      title="キャンセル"
                      className="p-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {editError && (
                    <p className="text-[11px] text-rose-600 font-medium pl-4">{editError}</p>
                  )}
                </form>
              ) : (
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shadow-2xs shrink-0"
                      style={{ backgroundColor: proj.color || "#4f46e5" }}
                    />
                    <span className={`font-bold text-xs truncate ${isArchived ? "text-slate-500" : "text-slate-800"}`}>
                      [{proj.key}] {proj.name}
                    </span>
                    {isArchived && (
                      <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-slate-200 text-slate-700 shrink-0">
                        <Archive className="w-2.5 h-2.5" />
                        <span>アーカイブ</span>
                      </span>
                    )}
                    {/* 管理者（Admin権限）のみプロジェクト名変更・削除ボタンを表示 */}
                    {isAdmin && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => startEditProject(e, proj)}
                          title="プロジェクト名を変更 (Admin専用)"
                          className="p-1 rounded-md text-slate-400 hover:text-indigo-700 hover:bg-indigo-100/70 transition-colors cursor-pointer shrink-0"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => startDeleteProject(e, proj)}
                          title={
                            projects.length > 1
                              ? "プロジェクトを削除 (Admin専用)"
                              : "最低1件のプロジェクトが必要なため削除できません"
                          }
                          className={`p-1 rounded-md transition-colors shrink-0 ${
                            projects.length > 1
                              ? "text-slate-400 hover:text-rose-600 hover:bg-rose-100/70 cursor-pointer"
                              : "text-slate-300 cursor-not-allowed"
                          }`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-indigo-600 shrink-0">
                    {progressPercent}%
                  </span>
                </div>
              )}

              {/* プロジェクト削除確認ボックス（Admin専用） */}
              {isDeletingThis && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="mb-2.5 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs space-y-2"
                >
                  <div className="flex items-start gap-1.5 text-rose-800 font-semibold leading-snug">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>
                      プロジェクト <strong>[{proj.key}] {proj.name}</strong>
                      {total > 0 ? `（紐づく課題 ${total}件を含む）` : ""} を完全に削除しますか？
                    </span>
                  </div>
                  {deleteError && (
                    <p className="text-[11px] text-rose-700 font-medium pl-5">{deleteError}</p>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelDeleteProject}
                      disabled={isDeleting}
                      className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={(e) => executeDeleteProject(e, proj)}
                      disabled={isDeleting}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{isDeleting ? "削除中..." : "削除する"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* プログレスバー（インディゴ〜バイオレット〜ローズのグラデーション） */}
              <div className="w-full bg-slate-200/80 rounded-full h-1.5 mb-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 via-violet-500 to-rose-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
                <span>未完了: <strong className="text-rose-600">{active}</strong> 件</span>
                <div className="flex items-center gap-1.5">
                  <span>完了: {completed} / 全 {total} 件</span>
                  <Link
                    href={`/board/${encodeURIComponent(proj.key)}`}
                    onClick={(e) => e.stopPropagation()}
                    title="このプロジェクトのボードを開く"
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded-md font-semibold transition-colors"
                  >
                    <Kanban className="w-3 h-3" />
                    <span>ボード</span>
                  </Link>
                  <Link
                    href={`/gantt/${encodeURIComponent(proj.key)}`}
                    onClick={(e) => e.stopPropagation()}
                    title="このプロジェクトのガントチャートを開く"
                    className="hidden md:inline-flex items-center gap-1 text-[11px] text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-1.5 py-0.5 rounded-md font-semibold transition-colors"
                  >
                    <ChartGantt className="w-3 h-3" />
                    <span>ガント</span>
                  </Link>
                </div>
              </div>
              {/* 参加メンバー一覧（表示のみ） */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="flex -space-x-1.5 overflow-hidden">
                    {(proj.members || []).slice(0, 5).map((m) => (
                      <div
                        key={m.id}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-white"
                        style={{ backgroundColor: m.color || "#4f46e5" }}
                        title={`${m.name} (@${m.login_id}) [${m.role || "メンバー"}]`}
                      >
                        {getUserInitials(m.name)}
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {proj.member_count !== undefined ? `${proj.member_count}名` : ""}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
