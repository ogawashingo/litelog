// 課題詳細モーダル内の添付ファイル一覧・アップロード・削除セクション
"use client";

import React from "react";
import { Paperclip, Plus, FileText, Download, Trash2 } from "lucide-react";
import { Attachment, User } from "@/types";
import {
  ATTACHMENT_ACCEPT_ATTR,
  ATTACHMENT_POLICY_HINT,
  isInlineImageMimeType,
} from "@/lib/attachmentPolicy";
import { formatFileSize } from "./issueDetailUtils";

interface IssueAttachmentsSectionProps {
  attachments: Attachment[];
  isProjectArchived: boolean;
  currentUser: User | null;
  onDirectFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteAttachment: (attachmentId: number) => void;
}

export default function IssueAttachmentsSection({
  attachments,
  isProjectArchived,
  currentUser,
  onDirectFileUpload,
  onDeleteAttachment,
}: IssueAttachmentsSectionProps) {
  return (
    <div className={`space-y-2 ${attachments.length === 0 ? "hidden sm:block" : ""}`}>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
          <span>添付ファイル ({attachments.length})</span>
        </h4>
        {!isProjectArchived && (
          <label
            title={ATTACHMENT_POLICY_HINT}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>ファイルを追加</span>
            <input
              type="file"
              className="hidden"
              accept={ATTACHMENT_ACCEPT_ATTR}
              multiple
              onChange={onDirectFileUpload}
            />
          </label>
        )}
      </div>

      {attachments.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {attachments.map((att) => {
            const isImg = isInlineImageMimeType(att.mime_type);
            const canDelete =
              currentUser?.is_admin === 1 || att.user_id === currentUser?.id;
            const fileUrl = att.url || `/api/attachments/${att.id}`;

            return (
              <div
                key={att.id}
                className="group relative flex items-center gap-2.5 p-2 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 shadow-2xs hover:shadow-xs transition-all"
              >
                {isImg ? (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-12 h-12 rounded bg-slate-100 border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center hover:opacity-90 transition-opacity"
                    title={`${att.file_name} を表示`}
                  >
                    <img
                      src={fileUrl}
                      alt={att.file_name}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ) : (
                  <div className="w-12 h-12 rounded bg-indigo-50 border border-indigo-100 text-indigo-600 shrink-0 flex items-center justify-center font-bold text-xs">
                    <FileText className="w-6 h-6" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <a
                    href={fileUrl}
                    download={att.file_name}
                    className="block text-xs font-semibold text-slate-800 hover:text-indigo-600 truncate transition-colors"
                    title={`${att.file_name} をダウンロード`}
                  >
                    {att.file_name}
                  </a>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                    <span>{formatFileSize(att.file_size)}</span>
                    {att.user_name && <span>· {att.user_name}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={fileUrl}
                    download={att.file_name}
                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                    title="ダウンロード"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  {!isProjectArchived && canDelete && (
                    <button
                      type="button"
                      onClick={() => onDeleteAttachment(att.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                      title="添付ファイルを削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-slate-400 italic bg-slate-50/70 border border-dashed border-slate-200 rounded-lg p-3 text-center">
          添付ファイルはありません（詳細やコメント欄で画像ペーストやドラッグ＆ドロップでも追加できます）
        </div>
      )}
    </div>
  );
}
