/**
 * ganttUtils.ts
 *
 * Pure utility functions for Gantt chart date calculations, pixel positioning,
 * and grid generation. All functions are side-effect free and memoization-friendly.
 */

import type {
  TimelineHouseholdItem,
  TimelineMilestone,
  TimelineResponse,
  TimelineWorkItem,
} from '@cornerstone/shared';
import { barDates, scheduleSignalOf } from '../../lib/scheduleDates.js';
import type { ScheduleSignalState } from '../../lib/scheduleDates.js';
import { parseRowKey, rowKey } from '../../lib/scheduleView.js';
import type { ScheduleGroup, ScheduleRowKey } from '../../lib/scheduleView.js';

export type ZoomLevel = 'day' | 'week' | 'month';

/** Column widths in pixels per zoom level. */
export const COLUMN_WIDTHS: Record<ZoomLevel, number> = {
  day: 58,
  week: 158,
  month: 260,
};

/** Minimum column width per zoom level for zoom in/out control. */
export const COLUMN_WIDTH_MIN: Record<ZoomLevel, number> = {
  day: 15,
  week: 35,
  month: 80,
};

/** Maximum column width per zoom level for zoom in/out control. */
export const COLUMN_WIDTH_MAX: Record<ZoomLevel, number> = {
  day: 170,
  week: 400,
  month: 900,
};

/** Row height in pixels — must match sidebar row height exactly for alignment. */
export const ROW_HEIGHT = 44;

/** Bar height within a row (centered with 6px padding top/bottom). */
export const BAR_HEIGHT = 32;

/** BAR_OFFSET from row top. */
export const BAR_OFFSET_Y = 6;

/** Header height in pixels. */
export const HEADER_HEIGHT = 48;

/** Sidebar width in pixels. */
export const SIDEBAR_WIDTH = 260;

/** Minimum bar width so zero-duration items are still visible. */
export const MIN_BAR_WIDTH = 4;

/** Minimum bar width to show text label inside bar. */
export const TEXT_LABEL_MIN_WIDTH = 60;

// ---------------------------------------------------------------------------
// Date normalization helpers
// ---------------------------------------------------------------------------

/**
 * Returns a Date object representing midnight UTC for the given ISO date string
 * (or Date). Avoids timezone offset pitfalls by treating all dates as UTC noon.
 */
export function toUtcMidnight(dateStr: string): Date {
  // Parse YYYY-MM-DD as local midnight to avoid UTC offset day shifting
  const parts = dateStr.split('-').map(Number);
  const year = parts[0]!; // split ensures at least 1 part or throws
  const month = parts[1]!; // must be YYYY-MM-DD format
  const day = parts[2]!; // must be YYYY-MM-DD format
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/** Returns number of whole days between two dates (end - start). */
export function daysBetween(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay);
}

/** Adds days to a date, returning a new Date. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Returns the first day of the month for the given date. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

/** Returns the first day (Monday) of the ISO week containing the given date. */
export function startOfIsoWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon...6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Chart range computation
// ---------------------------------------------------------------------------

export interface ChartRange {
  /** Chart start date (inclusive, UTC midnight). */
  start: Date;
  /** Chart end date (exclusive, one day after the last item). */
  end: Date;
  /** Number of days in the range. */
  totalDays: number;
}

/**
 * Computes the date range for the chart canvas.
 * Adds a padding of one unit on each side so bars don't touch the edge.
 */
export function computeChartRange(
  earliestStr: string,
  latestStr: string,
  zoom: ZoomLevel,
): ChartRange {
  const earliest = toUtcMidnight(earliestStr);
  const latest = toUtcMidnight(latestStr);

  let start: Date;
  let end: Date;

  if (zoom === 'day') {
    // Pad 3 days on each side
    start = addDays(earliest, -3);
    end = addDays(latest, 4);
  } else if (zoom === 'week') {
    // Start from the Monday of the earliest week; end at next Monday + 1 week
    start = addDays(startOfIsoWeek(earliest), -7);
    end = addDays(startOfIsoWeek(latest), 14);
  } else {
    // month: start from first of prior month, end at end of next month
    const prevMonth = new Date(earliest.getFullYear(), earliest.getMonth() - 1, 1, 12);
    const nextMonth = new Date(latest.getFullYear(), latest.getMonth() + 2, 0, 12); // last day of next month
    start = prevMonth;
    end = addDays(nextMonth, 1);
  }

  const totalDays = daysBetween(start, end);
  return { start, end, totalDays };
}

// ---------------------------------------------------------------------------
// Pixel positioning
// ---------------------------------------------------------------------------

/**
 * Converts a date to an x-pixel position relative to the chart's left edge.
 * @param columnWidth Optional override for the column width (used for zoom in/out). Defaults to COLUMN_WIDTHS[zoom].
 */
export function dateToX(
  date: Date,
  chartRange: ChartRange,
  zoom: ZoomLevel,
  columnWidth?: number,
): number {
  const days = daysBetween(chartRange.start, date);
  const colWidth = columnWidth ?? COLUMN_WIDTHS[zoom];

  if (zoom === 'day') {
    return days * colWidth;
  } else if (zoom === 'week') {
    // Fractional weeks
    return (days / 7) * colWidth;
  } else {
    // month: fractional months based on days in the month
    return daysToMonthX(date, chartRange.start, colWidth);
  }
}

/**
 * For month zoom: compute x position accounting for variable month lengths.
 */
function daysToMonthX(date: Date, rangeStart: Date, colWidth: number): number {
  let x = 0;

  // Count complete months from rangeStart to date's month
  let cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1, 12);
  const target = new Date(date.getFullYear(), date.getMonth(), 1, 12);

  while (
    cur.getFullYear() < target.getFullYear() ||
    (cur.getFullYear() === target.getFullYear() && cur.getMonth() < target.getMonth())
  ) {
    const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    x += (daysInMonth / 30.44) * colWidth;
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 12);
  }

  // Add fractional position within the current month
  const daysInTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const dayOfMonth = date.getDate() - 1; // 0-indexed
  x += (dayOfMonth / daysInTargetMonth) * (daysInTargetMonth / 30.44) * colWidth;

  return x;
}

/**
 * Computes the total SVG canvas width in pixels for the given range and zoom.
 * @param columnWidth Optional override for the column width. Defaults to COLUMN_WIDTHS[zoom].
 */
export function computeChartWidth(
  chartRange: ChartRange,
  zoom: ZoomLevel,
  columnWidth?: number,
): number {
  const colWidth = columnWidth ?? COLUMN_WIDTHS[zoom];
  if (zoom === 'day') {
    return chartRange.totalDays * colWidth;
  } else if (zoom === 'week') {
    return (chartRange.totalDays / 7) * colWidth;
  } else {
    // Sum up month widths
    return dateToX(chartRange.end, chartRange, 'month', colWidth);
  }
}

// ---------------------------------------------------------------------------
// Grid line generation
// ---------------------------------------------------------------------------

export interface GridLine {
  /** X position in pixels. */
  x: number;
  /** Whether this is a major (month/week boundary) or minor line. */
  isMajor: boolean;
  /** Date at this grid line position. */
  date: Date;
}

/**
 * Generates vertical grid line positions for the SVG canvas.
 * @param columnWidth Optional override for the column width. Defaults to COLUMN_WIDTHS[zoom].
 */
export function generateGridLines(
  chartRange: ChartRange,
  zoom: ZoomLevel,
  columnWidth?: number,
): GridLine[] {
  const lines: GridLine[] = [];

  if (zoom === 'day') {
    // A line per day; major lines on Monday (start of week)
    let cur = new Date(chartRange.start);
    while (cur < chartRange.end) {
      const x = dateToX(cur, chartRange, zoom, columnWidth);
      const isMajor = cur.getDay() === 1; // Monday
      lines.push({ x, isMajor, date: new Date(cur) });
      cur = addDays(cur, 1);
    }
  } else if (zoom === 'week') {
    // A line per week (Monday); major lines on month boundaries
    let cur = startOfIsoWeek(chartRange.start);
    while (cur < chartRange.end) {
      const x = dateToX(cur, chartRange, zoom, columnWidth);
      const isMajor = cur.getDate() <= 7; // First week of the month (approx)
      lines.push({ x, isMajor, date: new Date(cur) });
      cur = addDays(cur, 7);
    }
  } else {
    // A line per month; all are major
    let cur = new Date(chartRange.start.getFullYear(), chartRange.start.getMonth(), 1, 12);
    while (cur < chartRange.end) {
      const x = dateToX(cur, chartRange, zoom, columnWidth);
      lines.push({ x, isMajor: true, date: new Date(cur) });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 12);
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Header label generation
// ---------------------------------------------------------------------------

export interface HeaderCell {
  /** X position of the cell's left edge. */
  x: number;
  /** Width of the cell in pixels. */
  width: number;
  /** Primary label text. */
  label: string;
  /** Secondary label (for day zoom: weekday above day number). */
  sublabel?: string;
  /** Whether this cell falls on today. */
  isToday: boolean;
  /** Date this cell represents. */
  date: Date;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Generates header cell descriptors for the date header row.
 * @param columnWidth Optional override for the column width. Defaults to COLUMN_WIDTHS[zoom].
 */
export function generateHeaderCells(
  chartRange: ChartRange,
  zoom: ZoomLevel,
  today: Date,
  columnWidth?: number,
): HeaderCell[] {
  const cells: HeaderCell[] = [];
  const colWidth = columnWidth ?? COLUMN_WIDTHS[zoom];
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);

  if (zoom === 'day') {
    let cur = new Date(chartRange.start);
    while (cur < chartRange.end) {
      const x = dateToX(cur, chartRange, zoom, columnWidth);
      const curNorm = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 12);
      cells.push({
        x,
        width: colWidth,
        label: String(cur.getDate()),
        sublabel: WEEKDAY_SHORT[cur.getDay()],
        isToday: curNorm.getTime() === todayNorm.getTime(),
        date: new Date(cur),
      });
      cur = addDays(cur, 1);
    }
  } else if (zoom === 'week') {
    let cur = startOfIsoWeek(chartRange.start);
    while (cur < chartRange.end) {
      const x = dateToX(cur, chartRange, zoom, columnWidth);
      const weekEnd = addDays(cur, 6);
      const startLabel = `${MONTH_SHORT[cur.getMonth()]} ${cur.getDate()}`;
      const endLabel = `${cur.getMonth() !== weekEnd.getMonth() ? MONTH_SHORT[weekEnd.getMonth()] + ' ' : ''}${weekEnd.getDate()}`;
      const todayNormTime = todayNorm.getTime();
      const isToday = cur.getTime() <= todayNormTime && todayNormTime <= weekEnd.getTime();
      cells.push({
        x,
        width: colWidth,
        label: `${startLabel}–${endLabel}`,
        isToday,
        date: new Date(cur),
      });
      cur = addDays(cur, 7);
    }
  } else {
    // month zoom
    let cur = new Date(chartRange.start.getFullYear(), chartRange.start.getMonth(), 1, 12);
    while (cur < chartRange.end) {
      const x = dateToX(cur, chartRange, zoom, columnWidth);
      const nextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 12);
      const xNext = dateToX(nextMonth, chartRange, zoom, columnWidth);
      const width = xNext - x;
      const isToday =
        cur.getFullYear() === todayNorm.getFullYear() && cur.getMonth() === todayNorm.getMonth();
      cells.push({
        x,
        width,
        label: `${MONTH_NAMES[cur.getMonth()]} ${cur.getFullYear()}`,
        isToday,
        date: new Date(cur),
      });
      cur = nextMonth;
    }
  }

  return cells;
}

// ---------------------------------------------------------------------------
// Inverse coordinate mapping (pixel → date)
// ---------------------------------------------------------------------------

/**
 * Converts an x pixel position to a Date, given the current chart range and zoom.
 * This is the inverse of dateToX().
 *
 * @param x           Pixel offset from the left edge of the SVG canvas.
 * @param chartRange  The current chart date range.
 * @param zoom        The current zoom level.
 * @param columnWidth Optional override for the column width. Defaults to COLUMN_WIDTHS[zoom].
 * @returns           The Date corresponding to pixel position x.
 */
export function xToDate(
  x: number,
  chartRange: ChartRange,
  zoom: ZoomLevel,
  columnWidth?: number,
): Date {
  const colWidth = columnWidth ?? COLUMN_WIDTHS[zoom];

  if (zoom === 'day') {
    const days = x / colWidth;
    return addDays(chartRange.start, days);
  } else if (zoom === 'week') {
    // fractional weeks → days
    const days = (x / colWidth) * 7;
    return addDays(chartRange.start, days);
  } else {
    // month zoom: iterate through months to find the containing month
    return xToDateMonth(x, chartRange.start, colWidth);
  }
}

/**
 * For month zoom: convert x pixel to a Date by iterating through months.
 */
function xToDateMonth(x: number, rangeStart: Date, colWidth: number): Date {
  let accumulated = 0;
  let cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1, 12);

  // Walk through months until we find which month x falls within
  // Safety cap: at most 1200 months to prevent infinite loops
  for (let i = 0; i < 1200; i++) {
    const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    const monthWidth = (daysInMonth / 30.44) * colWidth;

    if (accumulated + monthWidth >= x || i === 1199) {
      // x is within this month
      const fraction = (x - accumulated) / monthWidth;
      const dayOfMonth = Math.floor(fraction * daysInMonth) + 1;
      const clampedDay = Math.max(1, Math.min(dayOfMonth, daysInMonth));
      return new Date(cur.getFullYear(), cur.getMonth(), clampedDay, 12, 0, 0, 0);
    }

    accumulated += monthWidth;
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 12);
  }

  return cur;
}

/**
 * Snaps a Date to the nearest grid unit for the current zoom level.
 *
 * - day zoom:   snap to nearest calendar day
 * - week zoom:  snap to nearest Monday (ISO week start)
 * - month zoom: snap to the 1st of the nearest month
 *
 * @param date The raw date to snap.
 * @param zoom The current zoom level.
 * @returns    The snapped Date.
 */
export function snapToGrid(date: Date, zoom: ZoomLevel): Date {
  if (zoom === 'day') {
    // Round to nearest day (already at noon, just normalize)
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  } else if (zoom === 'week') {
    // Snap to nearest Monday
    const monday = startOfIsoWeek(date);
    const nextMonday = addDays(monday, 7);
    const distToMonday = Math.abs(date.getTime() - monday.getTime());
    const distToNext = Math.abs(date.getTime() - nextMonday.getTime());
    return distToMonday <= distToNext ? monday : nextMonday;
  } else {
    // month zoom: snap to 1st of nearest month
    const firstOfCurrent = new Date(date.getFullYear(), date.getMonth(), 1, 12);
    const firstOfNext = new Date(date.getFullYear(), date.getMonth() + 1, 1, 12);
    const distToCurrent = Math.abs(date.getTime() - firstOfCurrent.getTime());
    const distToNext = Math.abs(date.getTime() - firstOfNext.getTime());
    return distToCurrent <= distToNext ? firstOfCurrent : firstOfNext;
  }
}

// ---------------------------------------------------------------------------
// Bar positioning
// ---------------------------------------------------------------------------

export interface BarPosition {
  /** X pixel position of bar left edge. */
  x: number;
  /** Bar width in pixels (clamped to MIN_BAR_WIDTH). */
  width: number;
  /** Y position in pixels (relative to SVG top). */
  y: number;
  /** Row height. */
  rowY: number;
}

/**
 * Computes the pixel rectangle for a work item bar.
 *
 * @param startDateStr  ISO date string for bar start (null = use today)
 * @param endDateStr    ISO date string for bar end (null = use startDate + 1 day)
 * @param rowIndex      Zero-based row index in the chart
 * @param chartRange    The current chart date range
 * @param zoom          Current zoom level
 * @param today         Today's date
 * @param columnWidth   Optional override for the column width. Defaults to COLUMN_WIDTHS[zoom].
 */
export function computeBarPosition(
  startDateStr: string | null,
  endDateStr: string | null,
  rowIndex: number,
  chartRange: ChartRange,
  zoom: ZoomLevel,
  today: Date,
  columnWidth?: number,
): BarPosition {
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const startDate = startDateStr ? toUtcMidnight(startDateStr) : todayDate;
  const endDate = endDateStr ? toUtcMidnight(endDateStr) : addDays(startDate, 1);

  const x = dateToX(startDate, chartRange, zoom, columnWidth);
  const xEnd = dateToX(endDate, chartRange, zoom, columnWidth);
  const rawWidth = xEnd - x;
  const width = Math.max(rawWidth, MIN_BAR_WIDTH);

  const rowY = rowIndex * ROW_HEIGHT;
  const y = rowY + BAR_OFFSET_Y;

  return { x, width, y, rowY };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** A chart row: a group header, a task, a milestone or a purchase. */
export type GanttRow =
  | { kind: 'group'; groupId: string; name: string; count: number; collapsed: boolean }
  | { kind: 'workItem'; key: ScheduleRowKey; item: TimelineWorkItem }
  | { kind: 'milestone'; key: ScheduleRowKey; milestone: TimelineMilestone }
  | { kind: 'householdItem'; key: ScheduleRowKey; item: TimelineHouseholdItem };

/** Group id of the final "No area" group. */
export const NO_AREA_GROUP_ID = 'none';

/** The row's key, null for a group header. */
export function ganttRowKey(row: GanttRow): ScheduleRowKey | null {
  return row.kind === 'group' ? null : row.key;
}

/** Late: not completed and Late · n d or Held up (D7). */
export function lateSignalOf(item: TimelineWorkItem): ScheduleSignalState | null {
  return item.status === 'completed' ? null : scheduleSignalOf(item);
}

function milestoneSortDate(m: TimelineMilestone): string | null {
  if (m.isCompleted && m.completedAt) return m.completedAt.slice(0, 10);
  return m.projectedDate ?? m.targetDate;
}

type SortRow = Exclude<GanttRow, { kind: 'group' }>;

function sortDateOf(row: SortRow): string | null {
  if (row.kind === 'workItem') return barDates(row.item).start;
  if (row.kind === 'milestone') return milestoneSortDate(row.milestone);
  return row.item.earliestDeliveryDate;
}

function sortDurationOf(row: SortRow): number {
  if (row.kind === 'milestone') return 0;
  const start = row.kind === 'workItem' ? barDates(row.item).start : row.item.earliestDeliveryDate;
  const end = row.kind === 'workItem' ? barDates(row.item).end : row.item.latestDeliveryDate;
  if (!start || !end) return 0;
  return new Date(end).getTime() - new Date(start).getTime();
}

const KIND_ORDER = { milestone: 0, householdItem: 1, workItem: 2 } as const;

function compareRows(a: SortRow, b: SortRow): number {
  const dateA = sortDateOf(a);
  const dateB = sortDateOf(b);
  if (dateA === null && dateB === null) return 0;
  if (dateA === null) return 1;
  if (dateB === null) return -1;
  if (dateA < dateB) return -1;
  if (dateA > dateB) return 1;
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  return sortDurationOf(b) - sortDurationOf(a);
}

/** Tasks, milestones and purchases interleaved by date (nulls last, longest first on a tie). */
export function sortedDataRows(data: TimelineResponse): SortRow[] {
  const rows: SortRow[] = [
    ...data.workItems.map((item): SortRow => ({
      kind: 'workItem',
      key: rowKey('task', item.id),
      item,
    })),
    ...data.milestones.map((milestone): SortRow => ({
      kind: 'milestone',
      key: rowKey('milestone', milestone.id),
      milestone,
    })),
    ...data.householdItems.map((item): SortRow => ({
      kind: 'householdItem',
      key: rowKey('purchase', item.id),
      item,
    })),
  ];
  return rows.sort(compareRows);
}

function ownAreaOf(row: SortRow): { id: string; name: string } | null {
  if (row.kind === 'workItem') return row.item.area;
  if (row.kind === 'householdItem') return row.item.area ?? null;
  return null;
}

/**
 * The chart's rows. Time grouping is the plain interleaved order; Area grouping follows
 * `areaOrder` (an item's own area) with a final "No area" group, and a collapsed group keeps
 * only its header (D15).
 */
export function buildGanttRows(
  data: TimelineResponse,
  groupBy: ScheduleGroup,
  areaOrder: readonly string[],
  collapsedGroups: ReadonlySet<string>,
  noAreaName: string,
): GanttRow[] {
  const sorted = sortedDataRows(data);
  if (groupBy !== 'area') return sorted;

  const known = new Set(areaOrder);
  const buckets = new Map<string, { name: string; rows: SortRow[] }>();
  for (const row of sorted) {
    const area = ownAreaOf(row);
    const id = area && known.has(area.id) ? area.id : NO_AREA_GROUP_ID;
    const bucket = buckets.get(id);
    if (bucket) bucket.rows.push(row);
    else buckets.set(id, { name: id === NO_AREA_GROUP_ID ? noAreaName : area!.name, rows: [row] });
  }

  const result: GanttRow[] = [];
  for (const id of [...areaOrder, NO_AREA_GROUP_ID]) {
    const bucket = buckets.get(id);
    if (!bucket) continue;
    const collapsed = collapsedGroups.has(id);
    result.push({
      kind: 'group',
      groupId: id,
      name: bucket.name,
      count: bucket.rows.length,
      collapsed,
    });
    if (!collapsed) result.push(...bucket.rows);
  }
  return result;
}

/** The hover-highlight id of a row: a task id, `milestone:<id>` or `hi:<id>`. */
export function hoverIdOfKey(key: ScheduleRowKey): string {
  const { kind, id } = parseRowKey(key);
  if (kind === 'task') return id;
  return kind === 'milestone' ? `milestone:${id}` : `hi:${id}`;
}
