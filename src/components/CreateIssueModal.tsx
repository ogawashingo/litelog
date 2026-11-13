// 課題の新規作成モーダルコンポーネント
"use client";

import React, { useState, useEffect } from "react";
import { X, CheckSquare, Bug, Sparkles, HelpCircle, Calendar, Plus, GitBranch, UserCheck, ArrowLeft } from "lucide-react";
import { Project, Issue, IssueType, IssueStatus, IssuePriority } from "@/types";
import { useUser } from "./UserContext";
import { DatePicker } from "./DatePicker";
import MentionTextarea from "./MentionTextarea";

interface CreateIssueModalProps {
  isOpen: boolean;
  projects: Project[];
  selectedProjectId: number | null;
  defaultStatus?: IssueStatus;
  defaultParentId?: number | null;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateIssueModal({
  isOpen,
  projects,
  selectedProjectId,
  defaultStatus = "open",
  defaultParentId = null,
  onClose,
  onCreated,
}: CreateIssueModalProps) {
  const { users, currentUser, refreshUsers } = useUser();

  const [projectId, setProjectId] = useState<number>(
    selectedProjectId || (projects[0] ? projects[0].id : 1)
  );
  const [parentId, setParentId] = useState<string>(defaultParentId ? String(defaultParentId) : "");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [availableParents, setAvailableParents] = useState<Issue[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [issueType, setIssueType] = useState<IssueType>("task");
  const [status, setStatus] = useState<IssueStatus>(defaultStatus);
  const [priority, setPriority] = useState<IssuePriority>("medium");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // モーダルが開かれたときに初期状態を同期
  useEffect(() => {
    if (isOpen) {
      if (selectedProjectId) {
        setProjectId(selectedProjectId);
      } else if (projects[0]) {
        setProjectId(projects[0].id);
      }
      setParentId(defaultParentId ? String(defaultParentId) : "");
      setAssigneeId(currentUser ? String(currentUser.id) : "");
      setStatus(defaultStatus);
      setTitle("");
      setDescription("");
      setStartDate("");
      setDueDate("");
      setPriority("medium");
      setIssueType("task");
      setErrorMessage("");
    }
  }, [isOpen, selectedProjectId, defaultStatus, defaultParentId, projects, currentUser]);

  // プロジェクトが変わったら親課題候補一覧を取得
  useEffect(() => {
    if (!isOpen || !projectId) return;
    fetch(`/api/issues?projectId=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAvailableParents(data);
        }
      })
      .catch((err) => console.error("親課題候補の取得エラー:", err));
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage("件名を入力してください");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          parentId: parentId ? Number(parentId) : null,
          assigneeId: assigneeId ? Number(assigneeId) : null,
          actorId: currentUser?.id || null,
          title: title.trim(),
          description: description.trim(),
          issueType,
          status,
          priority,
          startDate: startDate || null,
          dueDate: dueDate || null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "課題の作成に失敗しました");
      }

      // 成功時
      setTitle("");
      setDescription("");
      setStartDate("");
      setDueDate("");
      await refreshUsers();
      onCreated();
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("課題の作成中にエラーが発生しました");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white sm:rounded-xl shadow-2xl border border-slate-200/90 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 h-full sm:h-auto sm:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー（テーマ連動） */}
        <div className="app-header px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2">
            {/* モバイル用戻るボタン */}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-white/10 active:bg-white/20 text-white font-bold text-xs sm:hidden cursor-pointer"
              title="戻る"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>戻る</span>
            </button>
            <Plus className="w-5 h-5 stroke-[2.5] app-nav-indicator hidden sm:block" />
            <h3 className="font-bold text-base sm:text-lg">課題の追加</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="閉じる"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* フォーム入力領域 */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg font-medium">
              {errorMessage}
            </div>
          )}

          {/* プロジェクト選択 ＆ 親課題選択 ＆ 担当者選択 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                プロジェクト <span className="text-rose-500">*</span>
              </label>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(Number(e.target.value));
                  setParentId("");
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    [{proj.key}] {proj.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                <span className="flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                  担当者
                </span>
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">未割当</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {currentUser?.id === u.id ? "(自分)" : `(${u.role})`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                <span className="flex items-center gap-1">
                  <GitBranch className="w-3.5 h-3.5 text-slate-500" />
                  親課題（任意）
                </span>
              </label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">親課題なし（単独課題）</option>
                {availableParents
                  .filter((p) => !p.parent_id) // 親課題になれる課題（トップレベル課題）を優先表示
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.issue_key}] {p.title}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* 種別の選択（ボタングループ） */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              種別 <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { type: "task" as IssueType, label: "タスク", icon: CheckSquare, activeBg: "bg-indigo-600 text-white" },
                { type: "bug" as IssueType, label: "バグ", icon: Bug, activeBg: "bg-rose-600 text-white" },
                { type: "request" as IssueType, label: "要望", icon: Sparkles, activeBg: "bg-amber-500 text-white" },
                { type: "other" as IssueType, label: "その他", icon: HelpCircle, activeBg: "bg-violet-600 text-white" },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = issueType === item.type;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => setIssueType(item.type)}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? item.activeBg + " shadow-sm border-transparent"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 件名 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              件名 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="課題の概要を入力してください"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>

          {/* 詳細（メモ） */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              詳細 <span className="text-[11px] font-normal text-slate-500">(@でメンバーをメンション)</span>
            </label>
            <MentionTextarea
              placeholder="タスクの背景、達成条件、作業手順など... (@でメンバー候補を表示)"
              rows={4}
              value={description}
              onChange={(val) => setDescription(val)}
              users={users}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* 属性設定行（状態、優先度、開始日、期限日） */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* 状態 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">状態</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as IssueStatus)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="open">未対応</option>
                <option value="in_progress">処理中</option>
                <option value="resolved">処理済み</option>
                <option value="closed">完了</option>
              </select>
            </div>

            {/* 優先度 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">優先度</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as IssuePriority)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>

            {/* 開始日 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  開始日
                </span>
              </label>
              <DatePicker
                value={startDate || null}
                onChange={(nextDate) => setStartDate(nextDate || "")}
                placeholder="開始日を設定"
                fullWidth
              />
            </div>

            {/* 期限日 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  期限日
                </span>
              </label>
              <DatePicker
                value={dueDate || null}
                onChange={(nextDate) => setDueDate(nextDate || "")}
                placeholder="期限日を設定"
                fullWidth
              />
            </div>
          </div>

          {/* フッター操作ボタン */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 rounded-lg app-primary-btn text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? "追加中..." : "追加する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
