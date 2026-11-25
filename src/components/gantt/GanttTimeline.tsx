// ガントチャート右ペイン（タイムラインヘッダー・グリッド背景・課題バー描画）
"use client";

import React from "react";
import { Plus } from "lucide-react";
import { Issue } from "@/types";
import { getJapaneseHoliday } from "@/lib/holidayUtils";
import { formatDateString, getWeekendInfo, getWeekdayJa } from "@/lib/dateUtils";
import {
  ViewScale,
  MonthGroup,
  WeekGroup,
  DisplayRow,
  DragState,
  ROW_HEIGHT,
  STATUS_BAR_STYLES,
  calculateRowBarLayout,
} from "./ganttUtils";

interface GanttTimelineProps {
  timelineScrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  dateRange: Date[];
  cellWidth: number;
  monthGroups: MonthGroup[];
  weekGroups: WeekGroup[];
  scale: ViewScale;
  todayStr: string;
  showHolidays: boolean;
  weekStart: string;
  displayRows: DisplayRow[];
  hoveredIssueId: number | null;
  onHoverIssue: (id: number | null) => void;
  dragState: DragState | null;
  withParentRelation: boolean;
  timelineStartDate: Date;
  onOpenDetail: (issue: Issue) => void;
  onBarMouseDown: (
    e: React.MouseEvent,
    issue: Issue,
    mode: "move" | "resize-start" | "resize-end"
  ) => void;
  onSetDefaultDates: (issue: Issue) => void;
}

export default function GanttTimeline({
  timelineScrollRef,
  onScroll,
  dateRange,
  cellWidth,
  monthGroups,
  weekGroups,
  scale,
  todayStr,
  showHolidays,
  weekStart,
  displayRows,
  hoveredIssueId,
  onHoverIssue,
  dragState,
  withParentRelation,
  timelineStartDate,
  onOpenDetail,
  onBarMouseDown,
  onSetDefaultDates,
}: GanttTimelineProps) {
  return (
    <div className="flex-1 min-w-0 overflow-hidden flex flex-col bg-white">
      <div
        ref={timelineScrollRef}
        onScroll={onScroll}
        className="overflow-x-auto overflow-y-auto overscroll-contain max-h-[calc(100vh-var(--app-header-height,56px)-230px)] min-h-[300px] relative select-none"
      >
        {/* タイムライン全体の幅を持つラッパー */}
        <div
          style={{ width: `${dateRange.length * cellWidth}px` }}
          className="relative min-w-full"
        >
          {/* ---------- タイムラインヘッダー（2段：年月 ＆ 日/週/月ラベル） ---------- */}
          <div className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200">
            {/* 1段目：年月グループ */}
            <div className="flex border-b border-gray-200 text-xs font-bold text-slate-800 h-[26px]">
              {monthGroups.map((g, idx) => (
                <div
                  key={idx}
                  style={{ width: `${g.daysCount * cellWidth}px` }}
                  className="px-2 flex items-center border-r border-gray-300 truncate bg-gray-100/90 text-slate-900 font-extrabold"
                >
                  <span className="font-extrabold tracking-wide">
                    {g.year}年 {g.month}月
                  </span>
                </div>
              ))}
            </div>

            {/* 2段目：スケールに応じた目盛り */}
            {scale === "days" && (
              <div className="flex text-xs h-[26px]">
                {dateRange.map((d, idx) => {
                  const dateStr = formatDateString(d);
                  const isToday = dateStr === todayStr;
                  const weekend = getWeekendInfo(d);
                  const dayNum = d.getDate();
                  const weekday = getWeekdayJa(d);
                  const holidayName = showHolidays ? getJapaneseHoliday(d) : null;
                  const isHoliday = Boolean(holidayName);

                  let colBg = "bg-white";
                  let textColor = "text-gray-600";
                  if (weekend.isSaturday) {
                    colBg = "bg-blue-50/70";
                    textColor = "text-blue-600";
                  } else if (weekend.isSunday || isHoliday) {
                    colBg = "bg-rose-50/70";
                    textColor = "text-rose-600 font-bold";
                  }

                  const cellTooltip = holidayName
                    ? `${dateStr} (${weekday}・祝日: ${holidayName})`
                    : `${dateStr} (${weekday})`;

                  return (
                    <div
                      key={idx}
                      style={{ width: `${cellWidth}px` }}
                      className={`shrink-0 flex flex-col items-center justify-center border-r border-slate-200 ${colBg} ${
                        isToday ? "bg-indigo-100/80 font-bold" : ""
                      }`}
                      title={cellTooltip}
                    >
                      <span
                        className={`leading-none font-semibold ${
                          isToday ? "text-indigo-900 font-extrabold" : textColor
                        }`}
                      >
                        {dayNum}
                      </span>
                      <span
                        className={`text-[10px] leading-none mt-0.5 ${
                          isToday ? "text-indigo-700 font-bold" : textColor
                        }`}
                      >
                        {weekday}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {scale === "weeks" && (
              <div className="flex text-xs h-[26px]">
                {weekGroups.map((wg, idx) => (
                  <div
                    key={idx}
                    style={{ width: `${wg.daysCount * cellWidth}px` }}
                    className="shrink-0 flex items-center px-1.5 border-r border-gray-300 bg-white text-gray-600 font-medium truncate"
                  >
                    {wg.label}〜
                  </div>
                ))}
              </div>
            )}

            {scale === "months" && (
              <div className="flex text-xs h-[26px]">
                {monthGroups.map((mg, idx) => (
                  <div
                    key={idx}
                    style={{ width: `${mg.daysCount * cellWidth}px` }}
                    className="shrink-0 flex items-center justify-around border-r border-gray-300 bg-white text-gray-500"
                  >
                    <span>上旬</span>
                    <span>中旬</span>
                    <span>下旬</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---------- タイムライングリッド背景レイヤー（軽量化のため1回だけ描画） ---------- */}
          <div className="relative">
            {/* 背面グリッド縦線と週末色付け */}
            <div className="absolute inset-0 flex pointer-events-none z-0">
              {dateRange.map((d, colIdx) => {
                const weekend = getWeekendInfo(d);
                const isHoliday = Boolean(showHolidays && getJapaneseHoliday(d));
                const isWeekStartDay =
                  weekStart === "sunday" ? d.getDay() === 0 : d.getDay() === 1;
                const isWeekEndDay =
                  weekStart === "sunday" ? d.getDay() === 6 : d.getDay() === 0;
                const isFirstOfMonth = d.getDate() === 1;

                let bg = "";
                if (scale === "days") {
                  if (weekend.isSaturday) bg = "bg-blue-50/30";
                  else if (weekend.isSunday || isHoliday) bg = "bg-rose-50/30";
                }

                let borderClass = "border-r border-gray-100";
                if (scale === "weeks" && isWeekEndDay) {
                  borderClass = "border-r border-gray-300";
                } else if (scale === "months") {
                  borderClass = isFirstOfMonth ? "border-l border-gray-300" : "";
                } else if (isWeekStartDay && scale === "days") {
                  borderClass = "border-r border-gray-100 border-l border-l-gray-200/70";
                }

                return (
                  <div
                    key={colIdx}
                    style={{ width: `${cellWidth}px` }}
                    className={`shrink-0 h-full ${borderClass} ${bg}`}
                  />
                );
              })}
            </div>

            {/* 今日の赤い縦線（タイムライン全体を縦断） */}
            {(() => {
              const todayIndex = dateRange.findIndex(
                (d) => formatDateString(d) === todayStr
              );
              if (todayIndex >= 0) {
                const lineLeft = todayIndex * cellWidth + cellWidth / 2;
                return (
                  <div
                    style={{ left: `${lineLeft}px` }}
                    className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10 pointer-events-none shadow-xs"
                  >
                    <div className="sticky top-[52px] -translate-x-1/2 bg-rose-500 text-white text-[9px] px-1 py-0.2 rounded font-bold uppercase tracking-wider">
                      Today
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* ---------- 各課題の行 ＆ 課題バー描画 ---------- */}
            <div className="relative divide-y divide-gray-100 z-10">
              {displayRows.map((row) => {
                const { issue, childrenIssues } = row;
                const isHovered = hoveredIssueId === issue.id;
                const isDraggingThis = dragState?.issueId === issue.id;

                const {
                  effectiveStartDate,
                  effectiveDueDate,
                  barLeft,
                  barWidth,
                  isBarVisible,
                  isSummaryBar,
                  completedChildrenCount,
                  progressPercent,
                } = calculateRowBarLayout(
                  row,
                  withParentRelation,
                  dragState,
                  timelineStartDate,
                  cellWidth
                );

                const isClosed = issue.status === "closed";
                const isOverdue = !isClosed && issue.due_date && issue.due_date < todayStr;
                const styleCfg =
                  STATUS_BAR_STYLES[issue.status] || STATUS_BAR_STYLES.open;

                return (
                  <div
                    key={issue.id}
                    onMouseEnter={() => onHoverIssue(issue.id)}
                    onMouseLeave={() => onHoverIssue(null)}
                    style={{ height: `${ROW_HEIGHT}px` }}
                    className={`relative flex items-center transition-colors ${
                      isHovered ? "bg-indigo-50/40" : ""
                    }`}
                  >
                    {isBarVisible ? (
                      isSummaryBar ? (
                        // 親課題用のサマリーバー（ブラケット風）
                        <>
                          <div
                            style={{
                              left: `${barLeft + 1}px`,
                              width: `${Math.max(16, barWidth)}px`,
                              height: "26px",
                            }}
                            onClick={() => onOpenDetail(issue)}
                            className="absolute flex flex-col justify-start cursor-pointer group/bar z-10"
                            title={`[親課題: ${issue.issue_key}] ${issue.title}\n全体期間: ${effectiveStartDate} 〜 ${effectiveDueDate}\n子課題進捗: ${completedChildrenCount}/${childrenIssues.length} (${progressPercent}%)`}
                          >
                            {/* 親バー本体 */}
                            <div className="w-full h-5 bg-indigo-950 rounded-t-sm relative overflow-hidden flex items-center px-2 shadow-xs">
                              {/* 進捗ゲージ */}
                              <div
                                style={{ width: `${progressPercent}%` }}
                                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                              />
                              <span className="relative z-10 text-xs font-bold text-white truncate">
                                {issue.issue_key} {issue.title} ({progressPercent}%)
                              </span>
                            </div>
                            {/* 両端の下向き三角形ブラケット装飾 */}
                            <div className="flex justify-between w-full">
                              <div className="w-0 h-0 border-t-[6px] border-t-indigo-950 border-r-[6px] border-r-transparent" />
                              <div className="w-0 h-0 border-t-[6px] border-t-indigo-950 border-l-[6px] border-l-transparent" />
                            </div>
                          </div>
                          {/* 親バー幅が狭い場合、右外側に件名をインライン表示して全体を確認可能に */}
                          {barWidth < 180 && (
                            <div
                              style={{
                                left: `${barLeft + Math.max(16, barWidth) + 8}px`,
                                maxWidth: "380px",
                              }}
                              className="absolute pointer-events-none flex items-center gap-1.5 text-xs text-slate-800 font-bold select-none whitespace-nowrap z-0"
                            >
                              <span className="font-mono text-xs text-indigo-700">
                                {issue.issue_key}
                              </span>
                              <span className="truncate">{issue.title}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        // 通常課題／子課題用のドラッグ＆リサイズ可能バー
                        <>
                          <div
                            style={{
                              left: `${barLeft + 1}px`,
                              width: `${Math.max(14, barWidth)}px`,
                              height: "24px",
                            }}
                            onMouseDown={(e) => onBarMouseDown(e, issue, "move")}
                            onDoubleClick={() => onOpenDetail(issue)}
                            className={`absolute flex items-center px-1.5 rounded-md shadow-xs cursor-move select-none border transition-all z-10 ${
                              styleCfg.bg
                            } ${styleCfg.border} ${styleCfg.text} ${
                              isOverdue
                                ? "ring-2 ring-rose-500 ring-offset-1 border-rose-600"
                                : ""
                            } ${
                              isDraggingThis
                                ? "opacity-80 scale-[1.02] shadow-md ring-2 ring-indigo-400 z-20"
                                : "hover:brightness-105"
                            }`}
                            title={`[${issue.issue_key}] ${issue.title}\n期間: ${effectiveStartDate} 〜 ${effectiveDueDate}\nドラッグして日付移動、左右端でリサイズ`}
                          >
                            {/* 左端リサイズハンドル */}
                            <div
                              onMouseDown={(e) => onBarMouseDown(e, issue, "resize-start")}
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 rounded-l-md transition-colors"
                              title="開始日を変更"
                            />

                            {/* バー内テキスト（幅が狭いときは隠れる） */}
                            {barWidth >= 40 && (
                              <div className="flex-1 min-w-0 flex items-center gap-1 px-1 truncate pointer-events-none">
                                <span className="text-[11px] font-bold opacity-90 shrink-0">
                                  {issue.issue_key}
                                </span>
                                <span className="text-xs font-medium truncate">
                                  {issue.title}
                                </span>
                              </div>
                            )}

                            {/* 右端リサイズハンドル */}
                            <div
                              onMouseDown={(e) => onBarMouseDown(e, issue, "resize-end")}
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 rounded-r-md transition-colors"
                              title="期限日を変更"
                            />
                          </div>
                          {/* バー幅が狭い場合、右外側に件名をインライン表示して視認性を確保 */}
                          {barWidth < 160 && (
                            <div
                              style={{
                                left: `${barLeft + Math.max(14, barWidth) + 8}px`,
                                maxWidth: "380px",
                              }}
                              className="absolute pointer-events-none flex items-center gap-1.5 text-xs text-slate-700 font-medium select-none whitespace-nowrap z-0"
                            >
                              <span className="font-semibold text-slate-400 font-mono text-[11px]">
                                {issue.issue_key}
                              </span>
                              <span className="truncate">{issue.title}</span>
                            </div>
                          )}
                        </>
                      )
                    ) : (
                      // 日付未設定の場合
                      <div className="px-3">
                        <button
                          onClick={() => onSetDefaultDates(issue)}
                          className="text-xs text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-0.5 rounded border border-dashed border-slate-300 hover:border-indigo-400 flex items-center gap-1 transition-colors cursor-pointer"
                          title="クリックすると基準日で期間を設定します"
                        >
                          <Plus className="w-3 h-3" />
                          <span>期間未設定</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
