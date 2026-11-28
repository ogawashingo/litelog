// 課題一覧のページネーションフッターバーコンポーネント
"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildPageNumbers } from "./issueListUtils";

interface IssueListPaginationProps {
  totalItems: number;
  startIndex: number;
  endIndex: number;
  pageSize: number;
  onChangePageSize: (size: number) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function IssueListPagination({
  totalItems,
  startIndex,
  endIndex,
  pageSize,
  onChangePageSize,
  currentPage,
  totalPages,
  onPageChange,
}: IssueListPaginationProps) {
  const pageNumbers = buildPageNumbers(currentPage, totalPages);

  return (
    <div className="px-4 py-3 border-t border-slate-200/80 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
      {/* 件数表示 ＆ 1ページの件数セレクタ */}
      <div className="flex flex-wrap items-center gap-3 text-slate-600 text-xs sm:text-sm">
        <span>
          {totalItems === 0 ? (
            "0 件"
          ) : (
            <>
              <strong className="text-slate-800 font-semibold">{totalItems}</strong> 件中{" "}
              <strong className="text-slate-800 font-semibold">{startIndex}</strong> -{" "}
              <strong className="text-slate-800 font-semibold">{endIndex}</strong> 件を表示
            </>
          )}
        </span>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400">表示件数:</span>
          <select
            value={pageSize}
            onChange={(e) => onChangePageSize(Number(e.target.value))}
            className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-700 font-medium focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value={25}>25件</option>
            <option value={50}>50件</option>
            <option value={100}>100件</option>
            <option value={0}>全件</option>
          </select>
        </div>
      </div>

      {/* ページネーションボタン群 */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            title="前のページへ"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">前へ</span>
          </button>

          <div className="flex items-center gap-1">
            {pageNumbers.map((p, idx) => {
              if (p === "...") {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    className="px-1.5 py-1 text-xs text-slate-400 select-none"
                  >
                    …
                  </span>
                );
              }
              const isCurrent = p === currentPage;
              return (
                <button
                  key={`page-${p}`}
                  type="button"
                  onClick={() => onPageChange(p)}
                  className={`min-w-[28px] h-7 px-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    isCurrent
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            title="次のページへ"
          >
            <span className="hidden sm:inline">次へ</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
