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
 * Returns milestones whose targetDate matches the given day.
 */
export function getMilestonesForDay(
  dateStr: string,
  milestones: TimelineMilestone[],
): TimelineMilestone[] {
  return milestones.filter((m) => m.targetDate === dateStr);
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

const SHORT_MONTH_NAMES = [
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

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_NAMES_NARROW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? '';
}

export function getShortMonthName(month: number): string {
  return SHORT_MONTH_NAMES[month - 1] ?? '';
}
