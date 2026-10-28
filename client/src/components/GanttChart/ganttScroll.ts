/**
 * ganttScroll.ts
 *
 * Pure helpers that turn a scroll position into a date anchor and back, so the Schedule keeps
 * its place when data, toggles or the width change (D18). Pixels are never stored.
 */

import type { TimelineWorkItem } from '@cornerstone/shared';
import { barDates } from '../../lib/scheduleDates.js';
import { isCurrentTask } from '../../lib/scheduleView.js';
import type { ScheduleRowKey } from '../../lib/scheduleView.js';
import { ROW_HEIGHT, addDays, dateToX, toUtcMidnight, xToDate } from './ganttUtils.js';
import type { ChartRange, GanttRow, ZoomLevel } from './ganttUtils.js';

/** Left-edge date (plus how far into that day) and the top row (plus the offset into it). */
export interface GanttScrollAnchor {
  readonly date: string;
  /** Fraction 0..1 of the way through `date`'s column; missing (an older saved anchor) is 0. */
  readonly dayOffset?: number;
  readonly rowKey: ScheduleRowKey | null;
  readonly rowOffset: number;
}

/** What the pixel/date maths needs to know about the chart. */
export interface GanttScrollGeometry {
  readonly chartRange: ChartRange;
  readonly zoom: ZoomLevel;
  readonly columnWidth?: number;
  /** One entry per row; null for a group header. */
  readonly rowKeys: readonly (ScheduleRowKey | null)[];
}

function toDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The date under pixel `x`, as YYYY-MM-DD. */
export function dateAtX(
  x: number,
  chartRange: ChartRange,
  zoom: ZoomLevel,
  columnWidth?: number,
): string {
  return toDateString(xToDate(Math.max(0, x), chartRange, zoom, columnWidth));
}

/** The x of a day's left and right edge. */
function dayBounds(date: string, geometry: GanttScrollGeometry): [number, number] {
  const { chartRange, zoom, columnWidth } = geometry;
  const day = toUtcMidnight(date);
  return [
    dateToX(day, chartRange, zoom, columnWidth),
    dateToX(addDays(day, 1), chartRange, zoom, columnWidth),
  ];
}

/** The scroll position as a date anchor. A group header at the top anchors on the row below it. */
export function anchorFromScroll(
  scrollLeft: number,
  scrollTop: number,
  geometry: GanttScrollGeometry,
): GanttScrollAnchor {
  const { chartRange, zoom, columnWidth, rowKeys } = geometry;
  const x = Math.max(0, scrollLeft);
  const date = dateAtX(x, chartRange, zoom, columnWidth);
  const [dayStart, dayEnd] = dayBounds(date, geometry);
  const dayOffset = Math.min(1, Math.max(0, (x - dayStart) / (dayEnd - dayStart)));
  const topIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
  const index = rowKeys.findIndex((key, i) => i >= topIndex && key !== null);
  if (index === -1) return { date, dayOffset, rowKey: null, rowOffset: 0 };
  return { date, dayOffset, rowKey: rowKeys[index]!, rowOffset: scrollTop - index * ROW_HEIGHT };
}

/** The scroll position for an anchor; `top` is null when its row is no longer shown. */
export function scrollFromAnchor(
  anchor: GanttScrollAnchor,
  geometry: GanttScrollGeometry,
): { left: number; top: number | null } {
  const { rowKeys } = geometry;
  const [dayStart, dayEnd] = dayBounds(anchor.date, geometry);
  const left = Math.max(0, dayStart + (anchor.dayOffset ?? 0) * (dayEnd - dayStart));
  const index = anchor.rowKey === null ? -1 : rowKeys.indexOf(anchor.rowKey);
  if (index === -1) return { left, top: null };
  return { left, top: Math.max(0, index * ROW_HEIGHT + anchor.rowOffset) };
}

function isUpcomingTask(item: TimelineWorkItem, todayStr: string): boolean {
  const { start } = barDates(item);
  return item.status === 'not_started' && start !== null && start >= todayStr;
}

/**
 * The first row the first positioning brings into view: the first task in progress or late,
 * else the first not-started task on or after today. -1 when there is none.
 */
export function firstCurrentRowIndex(rows: readonly GanttRow[], today: Date): number {
  const todayStr = toDateString(today);
  const current = rows.findIndex((row) => row.kind === 'workItem' && isCurrentTask(row.item));
  if (current !== -1) return current;
  return rows.findIndex((row) => row.kind === 'workItem' && isUpcomingTask(row.item, todayStr));
}
