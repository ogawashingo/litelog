// 管理ページ（時刻・タイムゾーン設定、メンバー管理、プロジェクト・バックアップ管理）
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Settings, Crown, CheckCircle2 } from "lucide-react";
import Header from "@/components/Header";
import CreateIssueModal from "@/components/CreateIssueModal";
import CreateProjectModal from "@/components/CreateProjectModal";
import BackupModal from "@/components/BackupModal";
import ProjectMembersModal from "@/components/ProjectMembersModal";
import ProjectTemplatesModal from "@/components/ProjectTemplatesModal";
import LoginRateLimitPanel from "@/components/LoginRateLimitPanel";
import AnnouncementSettingsSection from "@/components/admin/AnnouncementSettingsSection";
import ThemeSettingsSection from "@/components/admin/ThemeSettingsSection";
import TimezoneSettingsSection from "@/components/admin/TimezoneSettingsSection";
import ProjectManagementSection from "@/components/admin/ProjectManagementSection";
import MemberManagementSection from "@/components/admin/MemberManagementSection";
import BackupManagementSection from "@/components/admin/BackupManagementSection";
import { useUser } from "@/components/UserContext";
import { getUserInitials } from "@/components/UserManageModal";
import {
  Project,
  getUserRoleType,
  isAdminUser,
  canManageIssues,
} from "@/types";
import versionData from "@/lib/version.json";
import { getStoredProjectId, setStoredProjectId } from "@/lib/projectStorage";

export default function AdminPage() {
  const router = useRouter();
  const {
    users,
    currentUser,
    isAuthReady,
    openUserManageModal,
    settings,
    updateSettings,
    refreshUsers,
    previewTheme,
    setPreviewTheme,
  } = useUser();

  // 一般ユーザー（AdminでもPMOでもない）がURL直打ちで /admin にアクセスした場合はダッシュボードへリダイレクト
  useEffect(() => {
    if (isAuthReady && currentUser && !canManageIssues(currentUser)) {
      router.replace("/");
    }
  }, [isAuthReady, currentUser, router]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [isCreateIssueOpen, setIsCreateIssueOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // マウント後にローカルストレージから選択中プロジェクトを同期＆クライアントマウント完了フラグをセット（Hydration Error防止）
  useEffect(() => {
    setMounted(true);
    setSelectedProjectId(getStoredProjectId());
  }, []);

  // プロジェクトメンバー管理用State
  const [managingMembersProject, setManagingMembersProject] = useState<Project | null>(null);
  // プロジェクトテンプレート管理用State
  const [managingTemplatesProject, setManagingTemplatesProject] = useState<Project | null>(null);

  // 保存完了メッセージ用State
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // プロジェクト一覧取得（管理ページは全件対象 all=1）
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects?all=1");
      if (res.ok) {
        setProjects(await res.json());
      }
    } catch (err) {
      console.error("プロジェクト一覧取得エラー:", err);
    }
  }, []);

  const canAccessAdmin = Boolean(currentUser && canManageIssues(currentUser));
  const currentUserId = currentUser?.id ?? null;

  useEffect(() => {
    // 認証確認完了後、管理権限（AdminまたはPMO）を持つユーザーのみプロジェクト一覧を取得
    if (isAuthReady && currentUserId && canAccessAdmin) {
      fetchProjects();
    }
  }, [isAuthReady, currentUserId, canAccessAdmin, fetchProjects]);

  // 認証判定中または管理権限（Admin・PMO）がない場合は、リダイレクト完了まで管理画面本体を描画しない
  if (!isAuthReady || !currentUser || !canManageIssues(currentUser)) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center font-sans">
        <div className="text-slate-500 text-sm animate-pulse">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent flex flex-col font-sans">
      <Header
        activeNav="admin"
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={(id) => {
          setSelectedProjectId(id);
          setStoredProjectId(id);
          if (id) {
            router.push(`/?projectId=${id}`);
          } else {
            router.push("/");
          }
        }}
        onOpenCreateIssue={() => setIsCreateIssueOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ページタイトルヘッダー */}
        <div className="bg-white rounded-xl shadow-xs border border-indigo-100/80 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <h1 className="text-xl font-bold text-slate-900">管理ページ・システム設定</h1>
                <span className="text-xs text-slate-400 font-mono select-all">
                  {versionData.version}
                </span>
              </div>
            </div>
          </div>

          {currentUser && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-lg text-sm shrink-0">
              <div
                style={{ backgroundColor: currentUser.color || "#4f46e5" }}
                className="w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-xs"
              >
                {getUserInitials(currentUser.name)}
              </div>
              <div>
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span>{currentUser.name}</span>
                  {getUserRoleType(currentUser) === "admin" ? (
                    <span className="inline-flex items-center gap-0.5 text-xs bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded-full font-bold">
                      <Crown className="w-3 h-3 text-amber-600" />
                      Admin
                    </span>
                  ) : getUserRoleType(currentUser) === "pmo" ? (
                    <span className="inline-flex items-center gap-0.5 text-xs bg-emerald-100 text-emerald-900 border border-emerald-300 px-1.5 py-0.5 rounded-full font-bold">
                      PMO
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-slate-500">{currentUser.role}</span>
              </div>
            </div>
          )}
        </div>

        {/* 保存完了メッセージ */}
        {saveMessage && (
          <div className="bg-indigo-50 border border-indigo-300 text-indigo-900 px-4 py-3 rounded-xl shadow-xs flex items-center gap-2.5 text-sm font-bold animate-in fade-in duration-150">
            <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0" />
            <span>{saveMessage}</span>
          </div>
        )}

        {/* ヘッダー一言通知（アナウンスメント）設定カード */}
        <AnnouncementSettingsSection
          currentUser={currentUser}
          settings={settings}
          updateSettings={updateSettings}
        />

        {/* デザイン・カラーテーマ設定カード */}
        <ThemeSettingsSection
          currentUser={currentUser}
          settings={settings}
          updateSettings={updateSettings}
          previewTheme={previewTheme}
          setPreviewTheme={setPreviewTheme}
          onSaveMessage={setSaveMessage}
        />

        {/* メインカード: 時刻・タイムゾーン設定 */}
        <TimezoneSettingsSection
          settings={settings}
          updateSettings={updateSettings}
          mounted={mounted}
          onSaveMessage={setSaveMessage}
        />

        {/* プロジェクト管理カード（全幅表示でプロジェクト名や操作ボタンの視認性を確保） */}
        <ProjectManagementSection
          currentUser={currentUser}
          projects={projects}
          fetchProjects={fetchProjects}
          refreshUsers={refreshUsers}
          onOpenCreateProject={() => setIsCreateProjectOpen(true)}
          onManageMembers={(proj) => setManagingMembersProject(proj)}
          onManageTemplates={(proj) => setManagingTemplatesProject(proj)}
          onSaveMessage={setSaveMessage}
        />

        {/* 下部: メンバー・権限管理 ＆ データバックアップ・復元（横幅を広く確保するため縦並び配置） */}
        <div className="space-y-6">
          {/* メンバー・権限管理カード（右上「<span>追加</span>」ボタンおよび各行の openUserManageModal(u.id) を提供） */}
          <MemberManagementSection
            currentUser={currentUser}
            users={users}
            projects={projects}
            openUserManageModal={openUserManageModal}
            refreshUsers={refreshUsers}
          />

          {/* データバックアップ・復元カード */}
          <BackupManagementSection
            currentUser={currentUser}
            projectCount={projects.length}
            userCount={users.length}
            onOpenBackup={() => setIsBackupOpen(true)}
          />
        </div>

        {/* システム管理者（Admin）専用：ログイン試行レート制限・ロック管理 */}
        {isAdminUser(currentUser) && <LoginRateLimitPanel settings={settings} />}

        {/* ページ下部 バージョン表記 */}
        <div className="text-center pt-2 pb-4">
          <span className="text-xs text-slate-400 font-mono select-all">
            litelog • {versionData.version}
          </span>
        </div>
      </main>

      {/* 課題追加モーダル */}
      <CreateIssueModal
        isOpen={isCreateIssueOpen}
        projects={projects}
        selectedProjectId={null}
        onClose={() => setIsCreateIssueOpen(false)}
        onCreated={refreshUsers}
      />

      {/* プロジェクト作成モーダル */}
      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        onCreated={fetchProjects}
      />

      {/* バックアップ・復元モーダル */}
      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        onRestored={async () => {
          await fetchProjects();
          await refreshUsers();
        }}
      />

      {/* プロジェクト参加メンバー管理モーダル */}
      <ProjectMembersModal
        isOpen={Boolean(managingMembersProject)}
        project={managingMembersProject}
        onClose={() => setManagingMembersProject(null)}
        onUpdated={async () => {
          await fetchProjects();
          await refreshUsers();
        }}
      />

      {/* プロジェクト別課題テンプレート管理モーダル (PMO / Admin) */}
      <ProjectTemplatesModal
        isOpen={Boolean(managingTemplatesProject)}
        project={managingTemplatesProject}
        onClose={() => setManagingTemplatesProject(null)}
        onUpdated={async () => {
          await fetchProjects();
        }}
      />
    </div>
  );
}
