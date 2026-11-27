// プロジェクト別課題テンプレート管理モーダルコンポーネント (PMO / 管理者向け)
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { FileText, X, Plus, Trash2, Edit3, Check, AlertCircle, Save, Sparkles, ArrowLeft } from "lucide-react";
import { Project, IssueTemplate, canManageIssues } from "@/types";
import { createApiError, getSafeErrorMessage } from "@/lib/clientError";
import { useUser } from "./UserContext";

interface ProjectTemplatesModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onUpdated?: () => void;
}

export default function ProjectTemplatesModal({
  isOpen,
  project,
  onClose,
  onUpdated,
}: ProjectTemplatesModalProps) {
  const { currentUser } = useUser();
  const canManage = canManageIssues(currentUser);

  const [templates, setTemplates] = useState<IssueTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // 編集モード・新規作成モード
  const [editingTemplate, setEditingTemplate] = useState<IssueTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formContent, setFormContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // テンプレート一覧取得
  const loadTemplates = useCallback(async () => {
    if (!project) return;
    setIsLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/projects/${project.id}/templates`);
      if (!res.ok) {
        throw await createApiError(res, "テンプレートの取得に失敗しました");
      }
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      setErrorMsg(getSafeErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [project]);

  useEffect(() => {
    if (isOpen && project) {
      loadTemplates();
      setEditingTemplate(null);
      setIsCreating(false);
      setSuccessMsg("");
    }
  }, [isOpen, project, loadTemplates]);

  // 新規作成開始
  const handleStartCreate = () => {
    setEditingTemplate(null);
    setIsCreating(true);
    setFormName("");
    setFormDescription("");
    setFormContent(`### 目的・背景\n\n### チェックリスト\n- [ ] \n\n### クローズ条件\n- [ ] `);
    setErrorMsg("");
    setSuccessMsg("");
  };

  // 編集開始
  const handleStartEdit = (tmpl: IssueTemplate) => {
    setIsCreating(false);
    setEditingTemplate(tmpl);
    setFormName(tmpl.name);
    setFormDescription(tmpl.description || "");
    setFormContent(tmpl.content);
    setErrorMsg("");
    setSuccessMsg("");
  };

  // 編集・新規キャンセル
  const handleCancelForm = () => {
    setIsCreating(false);
    setEditingTemplate(null);
  };

  // 保存処理（新規または更新）
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !canManage) return;

    if (!formName.trim()) {
      setErrorMsg("テンプレート名を入力してください");
      return;
    }
    if (!formContent.trim()) {
      setErrorMsg("テンプレート本文（Markdown）を入力してください");
      return;
    }

    setIsSaving(true);
    setErrorMsg("");
    try {
      if (isCreating) {
        // 新規作成
        const res = await fetch(`/api/projects/${project.id}/templates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim() || null,
            content: formContent.trim(),
            sort_order: templates.length + 1,
          }),
        });
        if (!res.ok) {
          throw await createApiError(res, "テンプレートの作成に失敗しました");
        }
        setSuccessMsg("新しいテンプレートを追加しました！");
      } else if (editingTemplate) {
        // 更新
        const res = await fetch(`/api/projects/${project.id}/templates/${editingTemplate.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim() || null,
            content: formContent.trim(),
          }),
        });
        if (!res.ok) {
          throw await createApiError(res, "テンプレートの更新に失敗しました");
        }
        setSuccessMsg("テンプレートを更新しました！");
      }

      await loadTemplates();
      setIsCreating(false);
      setEditingTemplate(null);
      if (onUpdated) onUpdated();
    } catch (err) {
      setErrorMsg(getSafeErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  // 削除処理
  const handleDelete = async (tmplId: number | string, tmplName: string) => {
    if (!project || !canManage) return;
    if (!window.confirm(`テンプレート「${tmplName}」を削除してもよろしいですか？`)) {
      return;
    }

    setErrorMsg("");
    try {
      const res = await fetch(`/api/projects/${project.id}/templates/${tmplId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw await createApiError(res, "テンプレートの削除に失敗しました");
      }
      setSuccessMsg(`「${tmplName}」を削除しました`);
      await loadTemplates();
      if (onUpdated) onUpdated();
    } catch (err) {
      setErrorMsg(getSafeErrorMessage(err));
    }
  };

  if (!isOpen || !project) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* ヘッダー */}
        <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span>課題テンプレート設定</span>
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-semibold text-white shadow-2xs"
                  style={{ backgroundColor: project.color }}
                >
                  {project.key}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {project.name} で共有される課題詳細の定型テンプレートを管理します (PMO/Admin)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* メッセージ */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ボディ */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* 編集・新規作成フォーム */}
          {isCreating || editingTemplate ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>一覧に戻る</span>
                </button>
                <span className="text-xs font-bold text-indigo-600">
                  {isCreating ? "新規テンプレートの作成" : "テンプレートの編集"}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  テンプレート名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例: バグ報告 / 不具合調査"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  説明（用途・概要）
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="例: 不具合の再現手順と原因特定・修正"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  テンプレート本文 (Markdown) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={8}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="### 概要&#10;&#10;### チェックリスト&#10;- [ ] &#10;&#10;### クローズ条件&#10;- [ ] "
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? "保存中..." : "保存する"}</span>
                </button>
              </div>
            </form>
          ) : (
            // テンプレート一覧表示
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  登録済みテンプレート: <span className="font-bold text-slate-700">{templates.length}件</span>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={handleStartCreate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>テンプレートを追加</span>
                  </button>
                )}
              </div>

              {isLoading ? (
                <div className="py-8 text-center text-xs text-slate-400">読み込み中...</div>
              ) : templates.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  テンプレートがまだありません。
                </div>
              ) : (
                <div className="space-y-2.5">
                  {templates.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className="p-3.5 rounded-xl border border-slate-200/90 hover:border-indigo-200 bg-white hover:bg-slate-50/50 transition-colors flex items-start justify-between gap-4 group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                            {tmpl.name}
                          </h4>
                          {tmpl.description && (
                            <span className="text-[11px] text-slate-400 font-normal line-clamp-1">
                              — {tmpl.description}
                            </span>
                          )}
                        </div>
                        <pre className="text-[11px] font-mono text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 line-clamp-3 whitespace-pre-wrap">
                          {tmpl.content}
                        </pre>
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(tmpl)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                            title="編集"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(tmpl.id, tmpl.name)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-6 py-3 border-t border-slate-200/80 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>課題作成画面の「📋 テンプレート」ボタンからすぐに利用できます</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
