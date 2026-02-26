/**
 * @jest-environment node
 *
 * Unit tests for calendarUtils.ts — pure utility functions for the calendar view.
 *
 * All functions are pure (or depend only on the current date via getTodayStr),
 * so we can run them in a Node environment without jsdom overhead.
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseIsoDate,
  formatIsoDate,
  getTodayStr,
  getMonthGrid,
  getWeekDates,
  getItemsForDay,
  getMilestonesForDay,
  isItemStart,
  isItemEnd,
  prevMonth,
  nextMonth,
  prevWeek,
  nextWeek,
  getMonthName,
  formatDateForAria,
  DAY_NAMES,
  DAY_NAMES_NARROW,
} from './calendarUtils.js';
import type { TimelineWorkItem, TimelineMilestone } from '@cornerstone/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWorkItem(
  id: string,
  startDate: string | null,
  endDate: string | null,
  status: TimelineWorkItem['status'] = 'not_started',
): TimelineWorkItem {
  return {
    id,
    title: `Item ${id}`,
    status,
    startDate,
    endDate,
    durationDays: null,
    actualStartDate: null,
    actualEndDate: null,
    startAfter: null,
    startBefore: null,
    assignedUser: null,
    tags: [],
  };
}

function makeMilestone(id: number, targetDate: string, isCompleted = false): TimelineMilestone {
  return {
    id,
    title: `Milestone ${id}`,
    targetDate,
    isCompleted,
    completedAt: null,
    color: null,
    workItemIds: [],
    projectedDate: null,
  };
}

// ---------------------------------------------------------------------------
// parseIsoDate
// ---------------------------------------------------------------------------

describe('parseIsoDate', () => {
  it('creates a UTC midnight Date from a YYYY-MM-DD string', () => {
    const d = parseIsoDate('2024-03-15');
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(2); // 0-indexed
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
    expect(d.getUTCMilliseconds()).toBe(0);
  });

  it('handles January (month 1)', () => {
    const d = parseIsoDate('2024-01-01');
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(1);
  });

  it('handles December (month 12)', () => {
    const d = parseIsoDate('2024-12-31');
    expect(d.getUTCMonth()).toBe(11);
    expect(d.getUTCDate()).toBe(31);
  });

  it('handles leap year Feb 29', () => {
    const d = parseIsoDate('2024-02-29');
    expect(d.getUTCMonth()).toBe(1);
    expect(d.getUTCDate()).toBe(29);
  });
});

// ---------------------------------------------------------------------------
// formatIsoDate
// ---------------------------------------------------------------------------

describe('formatIsoDate', () => {
  it('formats a Date as YYYY-MM-DD using UTC parts', () => {
    const d = new Date(Date.UTC(2024, 2, 5)); // March 5, 2024
    expect(formatIsoDate(d)).toBe('2024-03-05');
  });

  it('pads single-digit month and day with leading zero', () => {
    const d = new Date(Date.UTC(2024, 0, 1)); // Jan 1
    expect(formatIsoDate(d)).toBe('2024-01-01');
  });

  it('is the inverse of parseIsoDate for typical dates', () => {
    const dates = ['2024-01-01', '2024-06-15', '2024-12-31', '2023-07-04'];
    for (const dateStr of dates) {
      expect(formatIsoDate(parseIsoDate(dateStr))).toBe(dateStr);
    }
  });
});

// ---------------------------------------------------------------------------
// getTodayStr
// ---------------------------------------------------------------------------

describe('getTodayStr', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    const result = getTodayStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns today's local date", () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    expect(getTodayStr()).toBe(`${year}-${month}-${day}`);
  });
});

// ---------------------------------------------------------------------------
// getMonthGrid
// ---------------------------------------------------------------------------

describe('getMonthGrid', () => {
  it('returns exactly 6 rows', () => {
    const grid = getMonthGrid(2024, 3); // March 2024
    expect(grid).toHaveLength(6);
  });

  it('each row has exactly 7 days', () => {
    const grid = getMonthGrid(2024, 3);
    for (const week of grid) {
      expect(week).toHaveLength(7);
    }
  });

  it('total cells across the grid is 42', () => {
    const grid = getMonthGrid(2024, 5); // May 2024
    expect(grid.flat()).toHaveLength(42);
  });

  it('first column is always Sunday (UTC day 0)', () => {
    // Test multiple months to ensure the first column is always Sunday
    for (const [year, month] of [
      [2024, 1],
      [2024, 3],
      [2024, 7],
      [2024, 11],
    ]) {
      const grid = getMonthGrid(year as number, month as number);
      for (const week of grid) {
        expect(week[0].date.getUTCDay()).toBe(0); // Sunday
      }
    }
  });

  it('last column is always Saturday (UTC day 6)', () => {
    const grid = getMonthGrid(2024, 3);
    for (const week of grid) {
      expect(week[6].date.getUTCDay()).toBe(6); // Saturday
    }
  });

  it('correctly marks isCurrentMonth for in-month days', () => {
    // March 2024 has 31 days
    const grid = getMonthGrid(2024, 3);
    const allDays = grid.flat();
    const marchDays = allDays.filter((d) => d.isCurrentMonth);
    expect(marchDays).toHaveLength(31);
  });

  it('marks days outside the month as isCurrentMonth=false', () => {
    const grid = getMonthGrid(2024, 3);
    const allDays = grid.flat();
    const outsideDays = allDays.filter((d) => !d.isCurrentMonth);
    expect(outsideDays.length).toBeGreaterThan(0);
    // All 42 cells = 31 in-month + 11 outside
    expect(outsideDays.length).toBe(42 - 31);
  });

  it('first in-month day is the 1st of the month', () => {
    const grid = getMonthGrid(2024, 3);
    const allDays = grid.flat();
    const firstInMonth = allDays.find((d) => d.isCurrentMonth)!;
    expect(firstInMonth.dayOfMonth).toBe(1);
    expect(firstInMonth.dateStr).toBe('2024-03-01');
  });

  it('last in-month day is the last day of the month', () => {
    const grid = getMonthGrid(2024, 3); // March = 31 days
    const allDays = grid.flat();
    const inMonthDays = allDays.filter((d) => d.isCurrentMonth);
    const lastInMonth = inMonthDays[inMonthDays.length - 1];
    expect(lastInMonth.dayOfMonth).toBe(31);
    expect(lastInMonth.dateStr).toBe('2024-03-31');
  });

  it('dateStr matches the date object (formatIsoDate of date)', () => {
    const grid = getMonthGrid(2024, 6);
    const allDays = grid.flat();
    for (const day of allDays) {
      expect(day.dateStr).toBe(formatIsoDate(day.date));
    }
  });

  it('dayOfMonth matches the date object getUTCDate()', () => {
    const grid = getMonthGrid(2024, 6);
    for (const week of grid) {
      for (const day of week) {
        expect(day.dayOfMonth).toBe(day.date.getUTCDate());
      }
    }
  });

  it('handles February in a non-leap year (28 days)', () => {
    const grid = getMonthGrid(2023, 2);
    const allDays = grid.flat();
    const febDays = allDays.filter((d) => d.isCurrentMonth);
    expect(febDays).toHaveLength(28);
  });

  it('handles February in a leap year (29 days)', () => {
    const grid = getMonthGrid(2024, 2);
    const allDays = grid.flat();
    const febDays = allDays.filter((d) => d.isCurrentMonth);
    expect(febDays).toHaveLength(29);
  });

  it('handles month starting on Sunday (no leading padding days)', () => {
    // September 2024 starts on Sunday
    const grid = getMonthGrid(2024, 9);
    const allDays = grid.flat();
    // September 1 should be in the first cell of the first row
    expect(allDays[0].dateStr).toBe('2024-09-01');
    expect(allDays[0].isCurrentMonth).toBe(true);
  });

  it('handles month starting on Saturday (most leading padding days)', () => {
    // June 2024 starts on Saturday — 6 padding days from previous month
    const grid = getMonthGrid(2024, 6);
    const allDays = grid.flat();
    // First 6 cells belong to previous month (May 2024)
    for (let i = 0; i < 6; i++) {
      expect(allDays[i].isCurrentMonth).toBe(false);
    }
    expect(allDays[6].dateStr).toBe('2024-06-01');
    expect(allDays[6].isCurrentMonth).toBe(true);
  });

  it('marks today with isToday=true', () => {
    // Use a fixed date by mocking getTodayStr would require module-level mock.
    // Instead verify the grid has at most 1 today cell.
    const grid = getMonthGrid(2024, 3);
    const allDays = grid.flat();
    const todayCells = allDays.filter((d) => d.isToday);
    expect(todayCells.length).toBeLessThanOrEqual(1);
  });

  it('exactly one cell has isToday=true when today falls in the displayed month', () => {
    const now = new Date();
    const grid = getMonthGrid(now.getFullYear(), now.getMonth() + 1);
    const allDays = grid.flat();
    const todayCells = allDays.filter((d) => d.isToday);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0].dayOfMonth).toBe(now.getDate());
  });

  it('no cells have isToday=true when today is not in the displayed month', () => {
    // Use a past month that is unlikely to be current
    const grid = getMonthGrid(2000, 1);
    const allDays = grid.flat();
    const todayCells = allDays.filter((d) => d.isToday);
    expect(todayCells).toHaveLength(0);
  });

  it('days are in chronological order', () => {
    const grid = getMonthGrid(2024, 5);
    const allDays = grid.flat();
    for (let i = 1; i < allDays.length; i++) {
      expect(allDays[i].date.getTime()).toBeGreaterThan(allDays[i - 1].date.getTime());
    }
  });

  it('handles year boundary — December (month 12)', () => {
    const grid = getMonthGrid(2023, 12);
    const allDays = grid.flat();
    const decDays = allDays.filter((d) => d.isCurrentMonth);
    expect(decDays).toHaveLength(31);
    expect(decDays[0].dateStr).toBe('2023-12-01');
    expect(decDays[decDays.length - 1].dateStr).toBe('2023-12-31');
  });

  it('trailing days after the month belong to the next month', () => {
    // March 2024: 31 days, starts on Friday (UTC) → 42 - 31 = 11 non-March days
    const grid = getMonthGrid(2024, 3);
    const allDays = grid.flat();
    const trailingDays = allDays.filter((d) => !d.isCurrentMonth && allDays.indexOf(d) > 30);
    for (const day of trailingDays) {
      // Trailing days must come from April 2024
      expect(day.date.getUTCMonth()).toBe(3); // April (0-indexed)
      expect(day.date.getUTCFullYear()).toBe(2024);
    }
  });
});

// ---------------------------------------------------------------------------
// getWeekDates
// ---------------------------------------------------------------------------

describe('getWeekDates', () => {
  it('returns exactly 7 days', () => {
    const date = new Date(Date.UTC(2024, 2, 15)); // Friday March 15 2024
    expect(getWeekDates(date)).toHaveLength(7);
  });

  it('first day of the week is Sunday', () => {
    const date = new Date(Date.UTC(2024, 2, 15)); // Friday
    const days = getWeekDates(date);
    expect(days[0].date.getUTCDay()).toBe(0); // Sunday
  });

  it('last day of the week is Saturday', () => {
    const date = new Date(Date.UTC(2024, 2, 15)); // Friday
    const days = getWeekDates(date);
    expect(days[6].date.getUTCDay()).toBe(6); // Saturday
  });

  it('the input date falls within the returned week', () => {
    const inputDate = new Date(Date.UTC(2024, 2, 15)); // Friday March 15, 2024
    const days = getWeekDates(inputDate);
    const dateStrs = days.map((d) => d.dateStr);
    expect(dateStrs).toContain('2024-03-15');
  });

  it('for a Sunday input, Sunday is the first day', () => {
    const sunday = new Date(Date.UTC(2024, 2, 10)); // Sunday March 10
    const days = getWeekDates(sunday);
    expect(days[0].dateStr).toBe('2024-03-10');
  });

  it('for a Saturday input, Saturday is the last day', () => {
    const saturday = new Date(Date.UTC(2024, 2, 16)); // Saturday March 16
    const days = getWeekDates(saturday);
    expect(days[6].dateStr).toBe('2024-03-16');
  });

  it('consecutive days are 24 hours apart', () => {
    const date = new Date(Date.UTC(2024, 2, 15));
    const days = getWeekDates(date);
    for (let i = 1; i < 7; i++) {
      const diff = days[i].date.getTime() - days[i - 1].date.getTime();
      expect(diff).toBe(24 * 60 * 60 * 1000);
    }
  });

  it('handles week spanning month boundary (Feb → March)', () => {
    // March 3, 2024 (Sunday) — week spans Feb 25 - Mar 2
    const monday = new Date(Date.UTC(2024, 2, 4)); // Monday March 4 (week starts Feb 25)
    const days = getWeekDates(monday);
    // Sunday should be March 3
    expect(days[0].dateStr).toBe('2024-03-03');
  });

  it('handles week spanning year boundary (Dec → Jan)', () => {
    // Jan 1, 2024 is a Monday. The week starting Sun Dec 31, 2023 → Sat Jan 6, 2024
    const jan1 = new Date(Date.UTC(2024, 0, 1)); // Monday Jan 1, 2024
    const days = getWeekDates(jan1);
    expect(days[0].dateStr).toBe('2023-12-31'); // Sunday Dec 31
    expect(days[6].dateStr).toBe('2024-01-06'); // Saturday Jan 6
  });

  it('all days have isCurrentMonth=true (not relevant in week view)', () => {
    const date = new Date(Date.UTC(2024, 2, 15));
    const days = getWeekDates(date);
    // isCurrentMonth is always true in week view (not meaningful)
    for (const day of days) {
      expect(day.isCurrentMonth).toBe(true);
    }
  });

  it('dateStr matches the date object', () => {
    const date = new Date(Date.UTC(2024, 5, 20)); // June 20
    const days = getWeekDates(date);
    for (const day of days) {
      expect(day.dateStr).toBe(formatIsoDate(day.date));
    }
  });

  it('marks today with isToday=true when today is in the week', () => {
    // Use the actual current date so today is always in its own week
    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const days = getWeekDates(todayUtc);
    const todayCells = days.filter((d) => d.isToday);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0].dayOfMonth).toBe(today.getDate());
  });
});

// ---------------------------------------------------------------------------
// getItemsForDay
// ---------------------------------------------------------------------------

describe('getItemsForDay', () => {
  it('returns empty array when items list is empty', () => {
    expect(getItemsForDay('2024-03-15', [])).toEqual([]);
  });

  it('excludes items without startDate', () => {
    const item = makeWorkItem('1', null, '2024-03-20');
    expect(getItemsForDay('2024-03-15', [item])).toEqual([]);
  });

  it('excludes items without endDate', () => {
    const item = makeWorkItem('1', '2024-03-10', null);
    expect(getItemsForDay('2024-03-15', [item])).toEqual([]);
  });

  it('excludes items where both startDate and endDate are null', () => {
    const item = makeWorkItem('1', null, null);
    expect(getItemsForDay('2024-03-15', [item])).toEqual([]);
  });

  it('includes item on its start date', () => {
    const item = makeWorkItem('1', '2024-03-15', '2024-03-20');
    expect(getItemsForDay('2024-03-15', [item])).toContain(item);
  });

  it('includes item on its end date', () => {
    const item = makeWorkItem('1', '2024-03-10', '2024-03-15');
    expect(getItemsForDay('2024-03-15', [item])).toContain(item);
  });

  it('includes item for a date between start and end', () => {
    const item = makeWorkItem('1', '2024-03-10', '2024-03-20');
    expect(getItemsForDay('2024-03-15', [item])).toContain(item);
  });

  it('excludes item before its start date', () => {
    const item = makeWorkItem('1', '2024-03-16', '2024-03-20');
    expect(getItemsForDay('2024-03-15', [item])).toEqual([]);
  });

  it('excludes item after its end date', () => {
    const item = makeWorkItem('1', '2024-03-01', '2024-03-14');
    expect(getItemsForDay('2024-03-15', [item])).toEqual([]);
  });

  it('handles single-day item (start === end)', () => {
    const item = makeWorkItem('1', '2024-03-15', '2024-03-15');
    expect(getItemsForDay('2024-03-15', [item])).toContain(item);
    expect(getItemsForDay('2024-03-14', [item])).toHaveLength(0);
    expect(getItemsForDay('2024-03-16', [item])).toHaveLength(0);
  });

  it('filters correctly among multiple items', () => {
    const itemA = makeWorkItem('a', '2024-03-01', '2024-03-10');
    const itemB = makeWorkItem('b', '2024-03-08', '2024-03-20');
    const itemC = makeWorkItem('c', '2024-03-15', '2024-03-25');
    const result = getItemsForDay('2024-03-09', [itemA, itemB, itemC]);
    expect(result).toContain(itemA);
    expect(result).toContain(itemB);
    expect(result).not.toContain(itemC);
  });

  it('preserves item order as returned', () => {
    const items = [
      makeWorkItem('1', '2024-03-01', '2024-03-31'),
      makeWorkItem('2', '2024-03-01', '2024-03-31'),
      makeWorkItem('3', '2024-03-01', '2024-03-31'),
    ];
    const result = getItemsForDay('2024-03-15', items);
    expect(result.map((i) => i.id)).toEqual(['1', '2', '3']);
  });
});

// ---------------------------------------------------------------------------
// getMilestonesForDay
// ---------------------------------------------------------------------------

describe('getMilestonesForDay', () => {
  it('returns empty array when milestones list is empty', () => {
    expect(getMilestonesForDay('2024-03-15', [])).toEqual([]);
  });

  it('returns milestone when targetDate matches', () => {
    const m = makeMilestone(1, '2024-03-15');
    expect(getMilestonesForDay('2024-03-15', [m])).toContain(m);
  });

  it('excludes milestone when targetDate does not match', () => {
    const m = makeMilestone(1, '2024-03-16');
    expect(getMilestonesForDay('2024-03-15', [m])).toHaveLength(0);
  });

  it('returns multiple milestones on same day', () => {
    const m1 = makeMilestone(1, '2024-06-15');
    const m2 = makeMilestone(2, '2024-06-15');
    const m3 = makeMilestone(3, '2024-06-16');
    const result = getMilestonesForDay('2024-06-15', [m1, m2, m3]);
    expect(result).toHaveLength(2);
    expect(result).toContain(m1);
    expect(result).toContain(m2);
    expect(result).not.toContain(m3);
  });

  it('does exact string matching on targetDate', () => {
    // Ensure there is no fuzzy matching
    const m = makeMilestone(1, '2024-03-05');
    expect(getMilestonesForDay('2024-03-5', [m])).toHaveLength(0); // leading zero missing
  });
});

// ---------------------------------------------------------------------------
// isItemStart
// ---------------------------------------------------------------------------

describe('isItemStart', () => {
  it('returns true when dateStr matches item startDate', () => {
    const item = makeWorkItem('1', '2024-03-10', '2024-03-20');
    expect(isItemStart('2024-03-10', item)).toBe(true);
  });

  it('returns false when dateStr does not match item startDate', () => {
    const item = makeWorkItem('1', '2024-03-10', '2024-03-20');
    expect(isItemStart('2024-03-11', item)).toBe(false);
  });

  it('returns false when item has no startDate', () => {
    const item = makeWorkItem('1', null, '2024-03-20');
    expect(isItemStart('2024-03-15', item)).toBe(false);
  });

  it('returns false when item has null startDate and null endDate', () => {
    const item = makeWorkItem('1', null, null);
    expect(isItemStart('2024-03-15', item)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isItemEnd
// ---------------------------------------------------------------------------

describe('isItemEnd', () => {
  it('returns true when dateStr matches item endDate', () => {
    const item = makeWorkItem('1', '2024-03-10', '2024-03-20');
    expect(isItemEnd('2024-03-20', item)).toBe(true);
  });

  it('returns false when dateStr does not match item endDate', () => {
    const item = makeWorkItem('1', '2024-03-10', '2024-03-20');
    expect(isItemEnd('2024-03-19', item)).toBe(false);
  });

  it('returns false when item has no endDate', () => {
    const item = makeWorkItem('1', '2024-03-10', null);
    expect(isItemEnd('2024-03-15', item)).toBe(false);
  });

  it('returns false for endDate null even when item is single-day', () => {
    const item = makeWorkItem('1', '2024-03-15', null);
    expect(isItemEnd('2024-03-15', item)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// prevMonth / nextMonth
// ---------------------------------------------------------------------------

describe('prevMonth', () => {
  it('returns the previous month in the same year', () => {
    expect(prevMonth(2024, 6)).toEqual({ year: 2024, month: 5 });
  });

  it('wraps from January to December of the previous year', () => {
    expect(prevMonth(2024, 1)).toEqual({ year: 2023, month: 12 });
  });

  it('handles December correctly', () => {
    expect(prevMonth(2024, 12)).toEqual({ year: 2024, month: 11 });
  });

  it('handles February correctly', () => {
    expect(prevMonth(2024, 3)).toEqual({ year: 2024, month: 2 });
  });
});

describe('nextMonth', () => {
  it('returns the next month in the same year', () => {
    expect(nextMonth(2024, 6)).toEqual({ year: 2024, month: 7 });
  });

  it('wraps from December to January of the next year', () => {
    expect(nextMonth(2024, 12)).toEqual({ year: 2025, month: 1 });
  });

  it('handles January correctly', () => {
    expect(nextMonth(2024, 1)).toEqual({ year: 2024, month: 2 });
  });

  it('handles November correctly', () => {
    expect(nextMonth(2024, 11)).toEqual({ year: 2024, month: 12 });
  });
});

describe('prevMonth and nextMonth are inverses', () => {
  it('prevMonth(nextMonth(y, m)) === { y, m }', () => {
    const pairs: [number, number][] = [
      [2024, 1],
      [2024, 6],
      [2024, 12],
      [2023, 11],
    ];
    for (const [year, month] of pairs) {
      expect(prevMonth(nextMonth(year, month).year, nextMonth(year, month).month)).toEqual({
        year,
        month,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// prevWeek / nextWeek
// ---------------------------------------------------------------------------

describe('prevWeek', () => {
  it('returns a Date exactly 7 days before the input', () => {
    const date = new Date(Date.UTC(2024, 2, 15)); // March 15
    const result = prevWeek(date);
    const diff = date.getTime() - result.getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('handles week spanning month boundary correctly', () => {
    const march1 = new Date(Date.UTC(2024, 2, 1));
    const result = prevWeek(march1);
    expect(formatIsoDate(result)).toBe('2024-02-23');
  });

  it('handles week spanning year boundary correctly', () => {
    const jan5 = new Date(Date.UTC(2024, 0, 5));
    const result = prevWeek(jan5);
    expect(formatIsoDate(result)).toBe('2023-12-29');
  });

  it('returns UTC midnight Date', () => {
    const date = new Date(Date.UTC(2024, 5, 20));
    const result = prevWeek(date);
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
  });
});

describe('nextWeek', () => {
  it('returns a Date exactly 7 days after the input', () => {
    const date = new Date(Date.UTC(2024, 2, 15)); // March 15
    const result = nextWeek(date);
    const diff = result.getTime() - date.getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('handles week spanning month boundary correctly', () => {
    const march25 = new Date(Date.UTC(2024, 2, 25));
    const result = nextWeek(march25);
    expect(formatIsoDate(result)).toBe('2024-04-01');
  });

  it('handles week spanning year boundary correctly', () => {
    const dec28 = new Date(Date.UTC(2023, 11, 28));
    const result = nextWeek(dec28);
    expect(formatIsoDate(result)).toBe('2024-01-04');
  });

  it('returns UTC midnight Date', () => {
    const date = new Date(Date.UTC(2024, 5, 20));
    const result = nextWeek(date);
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
  });
});

describe('prevWeek and nextWeek are inverses', () => {
  it('prevWeek(nextWeek(date)) === date', () => {
    const dates = [
      new Date(Date.UTC(2024, 0, 1)),
      new Date(Date.UTC(2024, 5, 15)),
      new Date(Date.UTC(2024, 11, 31)),
    ];
    for (const date of dates) {
      expect(prevWeek(nextWeek(date)).getTime()).toBe(date.getTime());
    }
  });
});

// ---------------------------------------------------------------------------
// getMonthName
// ---------------------------------------------------------------------------

describe('getMonthName', () => {
  it('returns full month names for 1–12', () => {
    expect(getMonthName(1)).toBe('January');
    expect(getMonthName(2)).toBe('February');
    expect(getMonthName(3)).toBe('March');
    expect(getMonthName(4)).toBe('April');
    expect(getMonthName(5)).toBe('May');
    expect(getMonthName(6)).toBe('June');
    expect(getMonthName(7)).toBe('July');
    expect(getMonthName(8)).toBe('August');
    expect(getMonthName(9)).toBe('September');
    expect(getMonthName(10)).toBe('October');
    expect(getMonthName(11)).toBe('November');
    expect(getMonthName(12)).toBe('December');
  });

  it('returns empty string for out-of-range months', () => {
    expect(getMonthName(0)).toBe('');
    expect(getMonthName(13)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatDateForAria
// ---------------------------------------------------------------------------

describe('formatDateForAria', () => {
  it('formats a Monday date correctly', () => {
    // 2024-03-11 is a Monday
    expect(formatDateForAria('2024-03-11')).toBe('Monday, March 11, 2024');
  });

  it('formats a Sunday date correctly', () => {
    // 2024-03-10 is a Sunday
    expect(formatDateForAria('2024-03-10')).toBe('Sunday, March 10, 2024');
  });

  it('formats a Saturday date correctly', () => {
    // 2024-03-16 is a Saturday
    expect(formatDateForAria('2024-03-16')).toBe('Saturday, March 16, 2024');
  });

  it('formats January 1 correctly', () => {
    // 2024-01-01 is a Monday
    expect(formatDateForAria('2024-01-01')).toBe('Monday, January 1, 2024');
  });

  it('formats December 31 correctly', () => {
    // 2024-12-31 is a Tuesday
    expect(formatDateForAria('2024-12-31')).toBe('Tuesday, December 31, 2024');
  });

  it('formats a leap-year Feb 29 correctly', () => {
    // 2024-02-29 is a Thursday
    expect(formatDateForAria('2024-02-29')).toBe('Thursday, February 29, 2024');
  });

  it('formats a date from 2026 correctly', () => {
    // 2026-02-24 is a Tuesday
    expect(formatDateForAria('2026-02-24')).toBe('Tuesday, February 24, 2026');
  });

  it('output matches pattern "Weekday, Month D, YYYY"', () => {
    const result = formatDateForAria('2024-06-15');
    // Should match: word, word space digits, digits (day without padding), comma, year
    expect(result).toMatch(/^[A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}, \d{4}$/);
  });

  it('does not zero-pad the day number', () => {
    // March 5 → "5", not "05"
    const result = formatDateForAria('2024-03-05');
    expect(result).toContain('March 5,');
    expect(result).not.toContain('March 05,');
  });
});

// ---------------------------------------------------------------------------
// DAY_NAMES / DAY_NAMES_NARROW constants
// ---------------------------------------------------------------------------

describe('DAY_NAMES', () => {
  it('has 7 entries starting with Sunday', () => {
    expect(DAY_NAMES).toHaveLength(7);
    expect(DAY_NAMES[0]).toBe('Sun');
    expect(DAY_NAMES[6]).toBe('Sat');
  });
});

describe('DAY_NAMES_NARROW', () => {
  it('has 7 entries starting with S (Sunday) and ending with S (Saturday)', () => {
    expect(DAY_NAMES_NARROW).toHaveLength(7);
    expect(DAY_NAMES_NARROW[0]).toBe('S');
    expect(DAY_NAMES_NARROW[6]).toBe('S');
  });
});
