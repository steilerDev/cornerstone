/**
 * Calendar utility functions for monthly and weekly views.
 *
 * Date handling strategy: all dates are treated as UTC midnight ISO strings
 * (YYYY-MM-DD) to avoid local timezone shifting when constructing Date objects.
 */

import type { TimelineWorkItem, TimelineMilestone } from '@cornerstone/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single day cell in a calendar grid.
 */
export interface CalendarDay {
  /** The Date object for this cell (UTC midnight). */
  date: Date;
  /** ISO date string (YYYY-MM-DD). */
  dateStr: string;
  /** Day of month (1–31). */
  dayOfMonth: number;
  /** True when this day belongs to the currently displayed month (month grid only). */
  isCurrentMonth: boolean;
  /** True when this day is today. */
  isToday: boolean;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Creates a Date at UTC midnight from a YYYY-MM-DD string.
 * Avoids local timezone shifts that would occur with `new Date(str)`.
 */
export function parseIsoDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Formats a Date as YYYY-MM-DD (using UTC parts).
 */
export function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the ISO date string for today, using local date (for "today" highlight).
 */
export function getTodayStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Month grid
// ---------------------------------------------------------------------------

/**
 * Returns an array of 6 weeks (rows), each with 7 CalendarDay objects (Sun–Sat),
 * covering the full 6-row grid for the given year/month.
 *
 * Days outside the current month have `isCurrentMonth = false`.
 */
export function getMonthGrid(year: number, month: number): CalendarDay[][] {
  const todayStr = getTodayStr();

  // First day of the month (UTC)
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  // 0 = Sunday, 1 = Monday, …
  const startDow = firstOfMonth.getUTCDay();

  // Total days in the month
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // Build a flat list of cells starting from the Sunday before (or on) the 1st
  const cells: CalendarDay[] = [];

  // Days before the first of the month (from previous month)
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1, -i));
    const dateStr = formatIsoDate(d);
    cells.push({
      date: d,
      dateStr,
      dayOfMonth: d.getUTCDate(),
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
    });
  }

  // Days of the current month
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(Date.UTC(year, month - 1, day));
    const dateStr = formatIsoDate(d);
    cells.push({
      date: d,
      dateStr,
      dayOfMonth: day,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
    });
  }

  // Days after the last of the month (from next month) to fill 6 rows × 7 columns
  const totalCells = 42; // 6 rows
  let nextDay = 1;
  while (cells.length < totalCells) {
    const d = new Date(Date.UTC(year, month, nextDay));
    const dateStr = formatIsoDate(d);
    cells.push({
      date: d,
      dateStr,
      dayOfMonth: d.getUTCDate(),
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
    });
    nextDay++;
  }

  // Split flat list into rows of 7
  const weeks: CalendarDay[][] = [];
  for (let row = 0; row < 6; row++) {
    weeks.push(cells.slice(row * 7, row * 7 + 7));
  }

  return weeks;
}

// ---------------------------------------------------------------------------
// Week grid
// ---------------------------------------------------------------------------

/**
 * Returns 7 CalendarDay objects (Sun–Sat) for the week containing the given date.
 */
export function getWeekDates(date: Date): CalendarDay[] {
  const todayStr = getTodayStr();
  const dow = date.getUTCDay(); // 0 = Sunday

  const days: CalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - dow + i),
    );
    const dateStr = formatIsoDate(d);
    days.push({
      date: d,
      dateStr,
      dayOfMonth: d.getUTCDate(),
      isCurrentMonth: true, // not relevant for week view
      isToday: dateStr === todayStr,
    });
  }
  return days;
}

// ---------------------------------------------------------------------------
// Item filtering helpers
// ---------------------------------------------------------------------------

/**
 * Returns work items that overlap the given day.
 * An item overlaps if its startDate <= day <= endDate.
 * Items without both dates are excluded.
 */
export function getItemsForDay(dateStr: string, items: TimelineWorkItem[]): TimelineWorkItem[] {
  return items.filter((item) => {
    if (!item.startDate || !item.endDate) return false;
    return item.startDate <= dateStr && item.endDate >= dateStr;
  });
}

/**
 * Returns milestones that should appear on the given day.
 *
 * Date resolution order:
 *   1. Completed milestones: match on completedAt date (YYYY-MM-DD portion)
 *   2. Incomplete with projectedDate: match on projectedDate
 *   3. Incomplete without projectedDate: match on targetDate (fallback)
 */
export function getMilestonesForDay(
  dateStr: string,
  milestones: TimelineMilestone[],
): TimelineMilestone[] {
  return milestones.filter((m) => {
    if (m.isCompleted && m.completedAt) {
      // Use the YYYY-MM-DD portion of the ISO timestamp
      return m.completedAt.slice(0, 10) === dateStr;
    }
    if (m.projectedDate) {
      return m.projectedDate === dateStr;
    }
    return m.targetDate === dateStr;
  });
}

// ---------------------------------------------------------------------------
// Multi-day span helpers
// ---------------------------------------------------------------------------

/**
 * Returns whether a work item starts on the given day
 * (used to decide whether to render the item title or a continuation bar).
 */
export function isItemStart(dateStr: string, item: TimelineWorkItem): boolean {
  return item.startDate === dateStr;
}

/**
 * Returns whether a work item ends on the given day.
 */
export function isItemEnd(dateStr: string, item: TimelineWorkItem): boolean {
  return item.endDate === dateStr;
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

/**
 * Returns the previous month's year and month (1-indexed).
 */
export function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

/**
 * Returns the next month's year and month (1-indexed).
 */
export function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

/**
 * Returns the Date for the same day one week earlier.
 */
export function prevWeek(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 7));
}

/**
 * Returns the Date for the same day one week later.
 */
export function nextWeek(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 7));
}

// ---------------------------------------------------------------------------
// Lane allocation for multi-day item visual continuity
// ---------------------------------------------------------------------------

/**
 * Allocates a consistent vertical lane index to each work item that appears
 * within the given week (weekStart..weekEnd inclusive).
 *
 * Algorithm:
 *  1. Collect all items that overlap the week.
 *  2. Sort: multi-day items first (longest duration first), then single-day.
 *  3. Greedily assign lanes: for each item find the lowest lane that is free
 *     on all days the item spans within this week.
 *
 * Returns a Map<itemId, laneIndex> (0-based).
 */
export function allocateLanes(
  weekStart: string,
  weekEnd: string,
  items: TimelineWorkItem[],
): Map<string, number> {
  // Only items with both dates that overlap this week
  const weekItems = items.filter((item) => {
    if (!item.startDate || !item.endDate) return false;
    // Item overlaps if its range intersects [weekStart, weekEnd]
    return item.startDate <= weekEnd && item.endDate >= weekStart;
  });

  // Calculate how many days each item spans *within* this week
  function spanInWeek(item: TimelineWorkItem): number {
    const start = item.startDate! > weekStart ? item.startDate! : weekStart;
    const end = item.endDate! < weekEnd ? item.endDate! : weekEnd;
    // Count days between start and end inclusive
    const startDate = parseIsoDate(start);
    const endDate = parseIsoDate(end);
    return Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  }

  // Sort: multi-day (span > 1) first by descending span, then single-day
  const sorted = [...weekItems].sort((a, b) => {
    const spanA = spanInWeek(a);
    const spanB = spanInWeek(b);
    // Multi-day first
    if (spanA > 1 && spanB === 1) return -1;
    if (spanA === 1 && spanB > 1) return 1;
    // Both multi-day: longer span first
    return spanB - spanA;
  });

  // Build a list of ISO day strings for the week
  const weekDays: string[] = [];
  {
    const startDate = parseIsoDate(weekStart);
    const endDate = parseIsoDate(weekEnd);
    let d = startDate;
    while (d <= endDate) {
      weekDays.push(formatIsoDate(d));
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
    }
  }

  // laneBusy[day][lane] = itemId occupying that lane on that day
  const laneBusy: Map<string, Set<number>> = new Map();
  for (const day of weekDays) {
    laneBusy.set(day, new Set());
  }

  const result = new Map<string, number>();

  for (const item of sorted) {
    // Days this item occupies within the week
    const itemStart = item.startDate! > weekStart ? item.startDate! : weekStart;
    const itemEnd = item.endDate! < weekEnd ? item.endDate! : weekEnd;
    const occupiedDays = weekDays.filter((d) => d >= itemStart && d <= itemEnd);

    // Find the lowest lane free on all occupied days
    let lane = 0;
    let laneFree = false;
    while (!laneFree) {
      laneFree = occupiedDays.every((d) => !laneBusy.get(d)!.has(lane));
      if (!laneFree) lane++;
    }

    // Mark lane as occupied on all days
    for (const d of occupiedDays) {
      laneBusy.get(d)!.add(lane);
    }

    result.set(item.id, lane);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Item color palette
// ---------------------------------------------------------------------------

/**
 * Returns a deterministic color index (1–8) for a work item based on its ID.
 * The same ID always maps to the same color slot.
 */
export function getItemColor(itemId: string): number {
  let hash = 0;
  for (let i = 0; i < itemId.length; i++) {
    hash = (hash * 31 + itemId.charCodeAt(i)) >>> 0; // keep as unsigned 32-bit
  }
  return (hash % 8) + 1; // 1-indexed, 1..8
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

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

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_NAMES_NARROW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? '';
}

/**
 * Formats a YYYY-MM-DD date string as a human-readable aria-label.
 * Example: "2026-02-24" → "Tuesday, February 24, 2026"
 */
export function formatDateForAria(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const monthName = date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${weekday}, ${monthName} ${day}, ${year}`;
}
