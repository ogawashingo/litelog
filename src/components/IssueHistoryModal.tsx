"use client";

import { useEffect, useState, useMemo } from "react";
import { X, History, Clock, FileText, Type, Calendar } from "lucide-react";
import { formatTimestamp } from "@/lib/dateUtils";
import { createApiError, getSafeErrorMessage } from "@/lib/clientError";
import { Issue, IssueHistory, SystemSettings, User, RESOLUTION_LABELS, IssueResolution } from "@/types";
import MentionText from "./MentionText";

interface IssueHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  issueId: number | string;
  initialTab?: "description" | "title" | "dates" | "all";
  settings?: SystemSettings;
  users?: User[];
}

// ユーザー名の頭文字を取得するヘルパー
function getUserInitials(name?: string | null): string {
  if (!name) return "名";
  return name.trim().slice(0, 1);
}

// 課題変更履歴（タイトル・詳細説明・期日等の変更ログ）モーダルコンポーネント
export default function IssueHistoryModal({
  isOpen,
  onClose,
  issueId,
  initialTab = "description",
  settings,
  users = [],
}: IssueHistoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIssue, setCurrentIssue] = useState<Issue | null>(null);
  const [histories, setHistories] = useState<IssueHistory[]>([]);
  const [activeTab, setActiveTab] = useState<"description" | "title" | "dates" | "all">(initialTab);

  useEffect(() => {
    if (!isOpen || !issueId) {
      setCurrentIssue(null);
      setHistories([]);
      setError(null);
      return;
    }

    setActiveTab(initialTab);
    let isMounted = true;
    setLoading(true);
    setError(null);

    // 課題変更履歴APIを呼び出し
    fetch(`/api/issues/${issueId}/history`)
      .then(async (res) => {
        if (!res.ok) {
          throw await createApiError(res, "履歴の取得に失敗しました");
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setCurrentIssue(data.issue || null);
          setHistories(data.histories || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(getSafeErrorMessage(err, "履歴の取得に失敗しました"));
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, issueId, initialTab]);

  // タブに応じた履歴の絞り込み
  const filteredHistories = useMemo(() => {
    if (activeTab === "all") return histories;
    if (activeTab === "dates") {
      return histories.filter((h) => h.field_name === "due_date" || h.field_name === "start_date");
    }
    return histories.filter((h) => h.field_name === activeTab);
  }, [histories, activeTab]);

  // 各フィールドごとの履歴件数
  const descCount = useMemo(() => histories.filter((h) => h.field_name === "description").length, [histories]);
  const titleCount = useMemo(() => histories.filter((h) => h.field_name === "title").length, [histories]);
  const dateCount = useMemo(
    () => histories.filter((h) => h.field_name === "due_date" || h.field_name === "start_date").length,
    [histories]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">課題変更履歴</h3>
              <p className="text-xs text-slate-500">
                {currentIssue ? `[${currentIssue.issue_key}] の過去の要件・仕様の変更ログ` : "要件・仕様の変更ログ"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* タブ切り替え */}
        <div className="flex border-b border-slate-200 bg-slate-50/80 px-4 pt-2 gap-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("description")}
            className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === "description"
                ? "border-indigo-600 text-indigo-600 font-bold bg-white rounded-t-lg border-t border-x border-slate-200 -mb-[1px]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>詳細・説明</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                descCount > 0 ? "bg-indigo-100 text-indigo-700 font-bold" : "bg-slate-200 text-slate-600"
              }`}
            >
              {descCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("dates")}
            className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === "dates"
                ? "border-indigo-600 text-indigo-600 font-bold bg-white rounded-t-lg border-t border-x border-slate-200 -mb-[1px]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>期限・日程</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                dateCount > 0 ? "bg-indigo-100 text-indigo-700 font-bold" : "bg-slate-200 text-slate-600"
              }`}
            >
              {dateCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("title")}
            className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === "title"
                ? "border-indigo-600 text-indigo-600 font-bold bg-white rounded-t-lg border-t border-x border-slate-200 -mb-[1px]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>タイトル</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                titleCount > 0 ? "bg-indigo-100 text-indigo-700 font-bold" : "bg-slate-200 text-slate-600"
              }`}
            >
              {titleCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === "all"
                ? "border-indigo-600 text-indigo-600 font-bold bg-white rounded-t-lg border-t border-x border-slate-200 -mb-[1px]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>すべて ({histories.length})</span>
          </button>
        </div>

        {/* 本文エリア */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {loading && (
            <div className="py-12 text-center text-slate-500 text-xs">
              <div className="inline-block w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2" />
              <p>変更履歴を読み込み中...</p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
              {error}
            </div>
          )}

          {!loading && !error && currentIssue && (
            <div className="space-y-4">
              {/* 最新（現在）の内容 */}
              <div className="relative pl-6 pb-2 border-l-2 border-emerald-500">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] font-bold ring-4 ring-white">
                  現
                </div>
                <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-800">
                        {activeTab === "title"
                          ? "タイトル"
                          : activeTab === "description"
                          ? "詳細・説明"
                          : activeTab === "dates"
                          ? "日程設定"
                          : "最新の設定"}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
                        最新版（現在）
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{formatTimestamp(currentIssue.updated_at || currentIssue.created_at, settings, true)}</span>
                    </div>
                  </div>

                  {activeTab === "title" ? (
                    <p className="text-slate-900 font-semibold text-sm pt-1">
                      {currentIssue.title}
                    </p>
                  ) : activeTab === "description" ? (
                    <div className="pt-1">
                      {currentIssue.description ? (
                        <MentionText text={currentIssue.description} users={users} className="text-sm text-slate-800" />
                      ) : (
                        <span className="text-slate-400 italic text-xs">（詳細・説明はありません）</span>
                      )}
                    </div>
                  ) : activeTab === "dates" ? (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="bg-white p-2.5 rounded border border-emerald-200">
                        <span className="text-[10px] font-bold text-slate-500 block">開始日:</span>
                        <span className="text-slate-900 font-bold text-sm">
                          {currentIssue.start_date || "未設定"}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded border border-emerald-200">
                        <span className="text-[10px] font-bold text-slate-500 block">期限日:</span>
                        <span className="text-slate-900 font-bold text-sm">
                          {currentIssue.due_date || "未設定"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500">タイトル:</span>
                        <p className="text-slate-900 font-semibold">{currentIssue.title}</p>
                      </div>
                      <div className="flex gap-4 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-slate-500">開始日:</span>{" "}
                          <span className="font-semibold">{currentIssue.start_date || "未設定"}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-500">期限日:</span>{" "}
                          <span className="font-semibold">{currentIssue.due_date || "未設定"}</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-500">詳細・説明:</span>
                        <div className="pt-0.5">
                          {currentIssue.description ? (
                            <MentionText text={currentIssue.description} users={users} className="text-xs text-slate-800" />
                          ) : (
                            <span className="text-slate-400 italic text-xs">（詳細・説明はありません）</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 過去バージョン一覧 */}
              {filteredHistories.map((h, idx) => {
                const versionNumber = filteredHistories.length - idx;
                const isFieldDesc = h.field_name === "description";
                const isFieldTitle = h.field_name === "title";
                const isFieldDue = h.field_name === "due_date";
                const isFieldStart = h.field_name === "start_date";
                const isFieldResolution = h.field_name === "resolution";

                const fieldLabel = isFieldDesc
                  ? "説明"
                  : isFieldTitle
                  ? "タイトル"
                  : isFieldDue
                  ? "期限日"
                  : isFieldStart
                  ? "開始日"
                  : isFieldResolution
                  ? "完了理由"
                  : h.field_name;

                return (
                  <div key={h.id} className="relative pl-6 border-l-2 border-slate-200">
                    <div className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-slate-300 ring-4 ring-white" />
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            style={{ backgroundColor: h.user_color || "#64748b" }}
                            className="w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[10px]"
                          >
                            {getUserInitials(h.user_name)}
                          </span>
                          <span className="font-semibold text-slate-700">
                            {h.user_name || "メンバー"}
                          </span>
                          <span className="text-slate-400 text-[10px]">が変更</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              isFieldDue
                                ? "bg-amber-100 text-amber-800 font-bold"
                                : isFieldStart
                                ? "bg-blue-100 text-blue-800 font-bold"
                                : isFieldResolution
                                ? "bg-emerald-100 text-emerald-800 font-bold"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {fieldLabel} Ver {versionNumber} (変更前)
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Clock className="w-3 h-3" />
                          <span>{formatTimestamp(h.created_at, settings, true)}</span>
                        </div>
                      </div>
                      <div className="pt-1">
                        <span className="text-[10px] text-slate-500 font-medium">変更前の内容:</span>
                        <div className="bg-white p-2.5 rounded border border-slate-200/80 mt-1">
                          {h.old_value !== null && h.old_value !== undefined && h.old_value !== "" ? (
                            isFieldDesc ? (
                              <MentionText text={h.old_value} users={users} className="text-sm text-slate-700" />
                            ) : isFieldResolution ? (
                              <p className="text-slate-700 font-semibold text-sm">
                                {RESOLUTION_LABELS[h.old_value as IssueResolution] || h.old_value}
                              </p>
                            ) : (
                              <p className="text-slate-700 whitespace-pre-wrap text-sm">{h.old_value}</p>
                            )
                          ) : (
                            <span className="text-slate-400 italic text-xs">（未設定）</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredHistories.length === 0 && (
                <div className="text-center py-6 text-slate-400 text-xs">
                  {activeTab === "description"
                    ? "詳細・説明の変更履歴はありません（作成時のままです）。"
                    : activeTab === "title"
                    ? "タイトルの変更履歴はありません（作成時のままです）。"
                    : activeTab === "dates"
                    ? "期限日・開始日の変更履歴はありません（作成時のままです）。"
                    : "過去の変更履歴はありません。"}
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
