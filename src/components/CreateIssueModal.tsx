// 課題の新規作成モーダルコンポーネント
"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, CheckSquare, Bug, Sparkles, HelpCircle, Calendar, Plus, GitBranch, UserCheck, ArrowLeft, AlertTriangle, Check } from "lucide-react";
import { Project, Issue, IssueType, IssueStatus, IssuePriority, IssueResolution, canManageIssues } from "@/types";
import { createApiError, getSafeErrorMessage } from "@/lib/clientError";
import { useUser } from "./UserContext";
import { DatePicker } from "./DatePicker";
import MentionTextarea from "./MentionTextarea";
import NotifyUserSelector from "./NotifyUserSelector";
import ResolutionSelect from "./ResolutionSelect";
import UserSelect from "./UserSelect";
import ParentDueDateConfirmModal, {
  ParentDueDateWarningInfo,
  isExceedingParentDueDate,
} from "./ParentDueDateConfirmModal";
import { notifyNotificationsUpdated } from "@/lib/clientEvents";
import { formatDueDateDisplay } from "@/lib/dateUtils";

interface CreateIssueModalProps {
  isOpen: boolean;
  projects: Project[];
  selectedProjectId: number | null;
  defaultStatus?: IssueStatus;
  defaultParentId?: number | null;
  defaultTitle?: string; // 初期タイトル（横断検索からの起票時など）
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateIssueModal({
  isOpen,
  projects,
  selectedProjectId,
  defaultStatus = "open",
  defaultParentId = null,
  defaultTitle = "",
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
  const [resolution, setResolution] = useState<IssueResolution | null>(null);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<number[]>([]);
  const [notifyUserIds, setNotifyUserIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  // 子課題の期限が親課題を超過する場合の確認モーダル情報
  const [parentDueWarning, setParentDueWarning] = useState<ParentDueDateWarningInfo | null>(null);
  // モーダルが新規に開かれた瞬間のみ初期化するための直前ステートRef
  const prevIsOpenRef = useRef(false);

  // モーダルが新規に開かれたときに初期状態を同期（入力中の再描画による入力値リセットを防止）
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      const activeList = projects.filter((p) => !p.is_archived);
      if (selectedProjectId && activeList.some((p) => p.id === selectedProjectId)) {
        setProjectId(selectedProjectId);
      } else if (activeList[0]) {
        setProjectId(activeList[0].id);
      } else if (projects[0]) {
        setProjectId(projects[0].id);
      }
      setParentId(defaultParentId ? String(defaultParentId) : "");
      setAssigneeId(currentUser ? String(currentUser.id) : "");
      setStatus(defaultStatus === "resolved" && !canManageIssues(currentUser) ? "open" : defaultStatus);
      setTitle(defaultTitle || "");
      setDescription("");
      setStartDate("");
      setDueDate("");
      setAttachmentIds([]);
      setNotifyUserIds([]);
      setPriority("medium");
      setResolution(null);
      setIssueType("task");
      setErrorMessage("");
      setIsSuccess(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, selectedProjectId, defaultStatus, defaultParentId, defaultTitle, projects, currentUser]);

  // 選択中プロジェクトの参加メンバー候補（プロジェクトメンバー＋Admin/PMO）
  const currentProject = projects.find((p) => p.id === projectId);
  const candidateUsers = React.useMemo(() => {
    if (currentProject?.members && currentProject.members.length > 0) {
      const memberIds = new Set(currentProject.members.map((m) => m.id));
      return users.filter(
        (u) =>
          memberIds.has(u.id) ||
          u.is_admin === 1 ||
          u.role_type === "admin" ||
          u.role_type === "pmo"
      );
    }
    return users;
  }, [currentProject, users]);

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

  // 選択中の親課題情報（期限日超過チェック用）
  const selectedParentIssue = parentId
    ? availableParents.find((p) => p.id === Number(parentId)) || null
    : null;
  const isExceedingParentDue = isExceedingParentDueDate(
    selectedParentIssue?.due_date,
    dueDate || null
  );

  // 課題作成のAPI送信
  const executeCreate = async (extendParentDueDate: boolean) => {
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
          resolution: resolution || null,
          startDate: startDate || null,
          dueDate: dueDate || null,
          extendParentDueDate,
          attachmentIds,
          notifyUserIds,
        }),
      });

      if (!res.ok) {
        throw await createApiError(res, "課題の作成に失敗しました");
      }

      // 成功時
      setTitle("");
      setDescription("");
      setStartDate("");
      setDueDate("");
      setNotifyUserIds([]);
      notifyNotificationsUpdated();
      await refreshUsers();
      // 作成成功の視覚的フィードバック（案C: サクセス変化）
      setIsSuccess(true);
      await new Promise((resolve) => setTimeout(resolve, 600));
      onCreated();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(getSafeErrorMessage(err, "課題の作成中にエラーが発生しました"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage("件名を入力してください");
      return;
    }
    if (startDate && dueDate && startDate > dueDate) {
      setErrorMessage("開始日は期限日以前の日付を指定してください");
      return;
    }

    // 子課題の期限日が親課題の期限日を超えている場合は確認モーダルを表示
    if (selectedParentIssue?.due_date && dueDate && isExceedingParentDue) {
      setParentDueWarning({
        parentIssueKey: selectedParentIssue.issue_key,
        parentTitle: selectedParentIssue.title,
        parentDueDate: selectedParentIssue.due_date,
        newChildDueDate: dueDate,
      });
      return;
    }

    await executeCreate(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-black/50 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white sm:rounded-xl shadow-2xl border border-slate-200/90 w-full max-w-full sm:max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 h-full sm:h-auto sm:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー（テーマ連動） */}
        <div className="app-header px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between text-white shrink-0 max-w-full overflow-hidden">
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
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto overflow-x-hidden flex-1 max-w-full">
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
                {projects.filter((p) => !p.is_archived).map((proj) => (
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
              <UserSelect
                users={candidateUsers}
                value={assigneeId ? Number(assigneeId) : null}
                onChange={(val) => setAssigneeId(val ? String(val) : "")}
                currentUserId={currentUser?.id}
                placeholder="未割当"
                className="w-full"
              />
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
              placeholder="2〜3日で完了できるタスク名"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>

          {/* 詳細（メモ） */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              詳細 <span className="text-[11px] font-normal text-slate-500">(@でメンバーをメンション)</span>
            </label>
            <MentionTextarea
              placeholder={`※クローズ条件が記載されると良いです。\n※1週間以上かかりそうな大きな課題は、複数の課題に分割しましょう。`}
              rows={5}
              value={description}
              onChange={(val) => setDescription(val)}
              users={users}
              onAttachmentUploaded={(att) => setAttachmentIds((prev) => [...prev, att.id])}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* 属性設定行（状態、完了理由、優先度、開始日、期限日） */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {/* 状態 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">状態</label>
              <select
                value={status}
                onChange={(e) => {
                  const nextSt = e.target.value as IssueStatus;
                  setStatus(nextSt);
                  if (nextSt !== "closed") {
                    setResolution(null);
                  }
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="open">未対応</option>
                <option value="in_progress">処理中</option>
                <option
                  value="resolved"
                  disabled={!canManageIssues(currentUser)}
                  title={!canManageIssues(currentUser) ? "作業完了後にレビュー依頼コメントを添えて変更してください" : undefined}
                >
                  処理済み{!canManageIssues(currentUser) ? " (作成後のレビュー依頼のみ)" : ""}
                </option>
                <option value="closed">完了</option>
              </select>
            </div>

            {/* 完了理由（完了時のみ有効） */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                完了理由
                {status !== "closed" && (
                  <span className="text-[9px] font-normal text-slate-400 ml-1">
                    (完了時のみ)
                  </span>
                )}
              </label>
              <ResolutionSelect
                value={status === "closed" ? resolution : null}
                onChange={(nextRes) => setResolution(nextRes)}
                disabled={status !== "closed"}
                placeholder="-- （未設定）"
              />
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
              {isExceedingParentDue && selectedParentIssue?.due_date && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  親課題の期限日 ({formatDueDateDisplay(selectedParentIssue.due_date)}) を超えています
                </p>
              )}
            </div>
          </div>

          {/* 通知先（参加者）チェックボックス選択 */}
          <NotifyUserSelector
            users={candidateUsers}
            currentUserId={currentUser?.id || null}
            selectedUserIds={notifyUserIds}
            onChange={setNotifyUserIds}
            autoNotifyUserIds={assigneeId ? [Number(assigneeId)] : []}
            label="この課題の登録を通知するメンバー"
          />

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
              disabled={isSubmitting || isSuccess}
              className={`px-6 py-2 rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-75 cursor-pointer spring-bounce btn-shimmer group flex items-center justify-center gap-1.5 min-w-[110px] hover:-translate-y-0.5 ${
                isSuccess
                  ? "bg-emerald-600 text-white shadow-emerald-500/30"
                  : "app-primary-btn"
              }`}
            >
              {isSuccess ? (
                <>
                  <Check className="w-4 h-4 stroke-[3] animate-check-pop" />
                  <span>追加完了！</span>
                </>
              ) : isSubmitting ? (
                <span>追加中...</span>
              ) : (
                <>
                  <Plus className="w-4 h-4 stroke-[2.5] transition-transform duration-300 group-hover:rotate-90" />
                  <span>追加する</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 子課題の期限超過に伴う親課題期限延長の確認モーダル */}
      <ParentDueDateConfirmModal
        info={parentDueWarning}
        isSubmitting={isSubmitting}
        childOnlyLabel="子課題のみ作成する"
        onExtendBoth={async () => {
          setParentDueWarning(null);
          await executeCreate(true);
        }}
        onChildOnly={async () => {
          setParentDueWarning(null);
          await executeCreate(false);
        }}
        onCancel={() => setParentDueWarning(null)}
      />
    </div>
  );
}
