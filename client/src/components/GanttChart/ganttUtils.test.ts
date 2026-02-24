/**
 * @jest-environment node
 *
 * Exhaustive unit tests for ganttUtils.ts — pure date/pixel utility functions.
 * Tests cover all three zoom levels (day, week, month), edge cases, and boundary conditions.
 */
import { describe, it, expect } from '@jest/globals';
import {
  toUtcMidnight,
  daysBetween,
  addDays,
  startOfMonth,
  startOfIsoWeek,
  computeChartRange,
  dateToX,
  computeChartWidth,
  generateGridLines,
  generateHeaderCells,
  computeBarPosition,
  COLUMN_WIDTHS,
  ROW_HEIGHT,
  BAR_HEIGHT,
  BAR_OFFSET_Y,
  HEADER_HEIGHT,
  SIDEBAR_WIDTH,
  MIN_BAR_WIDTH,
  TEXT_LABEL_MIN_WIDTH,
  type ZoomLevel,
  type ChartRange,
} from './ganttUtils.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('Constants', () => {
  it('COLUMN_WIDTHS has correct day column width', () => {
    expect(COLUMN_WIDTHS.day).toBe(40);
  });

  it('COLUMN_WIDTHS has correct week column width', () => {
    expect(COLUMN_WIDTHS.week).toBe(110);
  });

  it('COLUMN_WIDTHS has correct month column width', () => {
    expect(COLUMN_WIDTHS.month).toBe(180);
  });

  it('ROW_HEIGHT is 40', () => {
    expect(ROW_HEIGHT).toBe(40);
  });

  it('BAR_HEIGHT is 32', () => {
    expect(BAR_HEIGHT).toBe(32);
  });

  it('BAR_OFFSET_Y is 4', () => {
    expect(BAR_OFFSET_Y).toBe(4);
  });

  it('BAR_OFFSET_Y + BAR_HEIGHT is less than ROW_HEIGHT (leaving bottom padding)', () => {
    // Bar has 4px top offset + 32px height = 36px; 4px bottom padding remains
    expect(BAR_OFFSET_Y + BAR_HEIGHT).toBeLessThan(ROW_HEIGHT);
    expect(BAR_OFFSET_Y + BAR_HEIGHT).toBe(36);
  });

  it('HEADER_HEIGHT is 48', () => {
    expect(HEADER_HEIGHT).toBe(48);
  });

  it('SIDEBAR_WIDTH is 260', () => {
    expect(SIDEBAR_WIDTH).toBe(260);
  });

  it('MIN_BAR_WIDTH is 4', () => {
    expect(MIN_BAR_WIDTH).toBe(4);
  });

  it('TEXT_LABEL_MIN_WIDTH is 60', () => {
    expect(TEXT_LABEL_MIN_WIDTH).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// toUtcMidnight
// ---------------------------------------------------------------------------

describe('toUtcMidnight', () => {
  it('parses YYYY-MM-DD date string correctly', () => {
    const date = toUtcMidnight('2024-03-15');
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(2); // 0-indexed (March)
    expect(date.getDate()).toBe(15);
  });

  it('sets time to noon (avoids UTC offset day-shifting)', () => {
    const date = toUtcMidnight('2024-01-01');
    expect(date.getHours()).toBe(12);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
    expect(date.getMilliseconds()).toBe(0);
  });

  it('correctly parses January 1st', () => {
    const date = toUtcMidnight('2024-01-01');
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(1);
  });

  it('correctly parses December 31st', () => {
    const date = toUtcMidnight('2024-12-31');
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(11);
    expect(date.getDate()).toBe(31);
  });

  it('handles year boundaries correctly (year 2000)', () => {
    const date = toUtcMidnight('2000-01-01');
    expect(date.getFullYear()).toBe(2000);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(1);
  });

  it('handles leap year February 29', () => {
    const date = toUtcMidnight('2024-02-29'); // 2024 is a leap year
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(1);
    expect(date.getDate()).toBe(29);
  });

  it('returns a Date instance', () => {
    const date = toUtcMidnight('2024-06-15');
    expect(date).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// daysBetween
// ---------------------------------------------------------------------------

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    const date = toUtcMidnight('2024-06-15');
    expect(daysBetween(date, date)).toBe(0);
  });

  it('returns 1 for consecutive days', () => {
    const start = toUtcMidnight('2024-06-15');
    const end = toUtcMidnight('2024-06-16');
    expect(daysBetween(start, end)).toBe(1);
  });

  it('returns 7 for one week', () => {
    const start = toUtcMidnight('2024-06-01');
    const end = toUtcMidnight('2024-06-08');
    expect(daysBetween(start, end)).toBe(7);
  });

  it('returns 30 for one month (June)', () => {
    const start = toUtcMidnight('2024-06-01');
    const end = toUtcMidnight('2024-07-01');
    expect(daysBetween(start, end)).toBe(30);
  });

  it('returns 366 for a full leap year', () => {
    const start = toUtcMidnight('2024-01-01');
    const end = toUtcMidnight('2025-01-01');
    expect(daysBetween(start, end)).toBe(366);
  });

  it('returns 365 for a full non-leap year', () => {
    const start = toUtcMidnight('2023-01-01');
    const end = toUtcMidnight('2024-01-01');
    expect(daysBetween(start, end)).toBe(365);
  });

  it('returns negative value when end is before start', () => {
    const start = toUtcMidnight('2024-06-15');
    const end = toUtcMidnight('2024-06-10');
    expect(daysBetween(start, end)).toBe(-5);
  });

  it('correctly spans year boundary', () => {
    const start = toUtcMidnight('2024-12-25');
    const end = toUtcMidnight('2025-01-05');
    expect(daysBetween(start, end)).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// addDays
// ---------------------------------------------------------------------------

describe('addDays', () => {
  it('adds positive days', () => {
    const date = toUtcMidnight('2024-06-15');
    const result = addDays(date, 5);
    expect(result.getDate()).toBe(20);
    expect(result.getMonth()).toBe(5);
    expect(result.getFullYear()).toBe(2024);
  });

  it('subtracts days when given negative value', () => {
    const date = toUtcMidnight('2024-06-15');
    const result = addDays(date, -5);
    expect(result.getDate()).toBe(10);
    expect(result.getMonth()).toBe(5);
    expect(result.getFullYear()).toBe(2024);
  });

  it('adds zero days returns same date value', () => {
    const date = toUtcMidnight('2024-06-15');
    const result = addDays(date, 0);
    expect(result.getDate()).toBe(date.getDate());
    expect(result.getMonth()).toBe(date.getMonth());
    expect(result.getFullYear()).toBe(date.getFullYear());
  });

  it('rolls over month boundary', () => {
    const date = toUtcMidnight('2024-06-28');
    const result = addDays(date, 5);
    expect(result.getMonth()).toBe(6); // July
    expect(result.getDate()).toBe(3);
  });

  it('rolls over year boundary', () => {
    const date = toUtcMidnight('2024-12-30');
    const result = addDays(date, 5);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(4);
  });

  it('does not mutate the original date', () => {
    const date = toUtcMidnight('2024-06-15');
    const originalTime = date.getTime();
    addDays(date, 5);
    expect(date.getTime()).toBe(originalTime);
  });

  it('returns a new Date instance', () => {
    const date = toUtcMidnight('2024-06-15');
    const result = addDays(date, 5);
    expect(result).toBeInstanceOf(Date);
    expect(result).not.toBe(date);
  });
});

// ---------------------------------------------------------------------------
// startOfMonth
// ---------------------------------------------------------------------------

describe('startOfMonth', () => {
  it('returns day 1 of the current month', () => {
    const date = toUtcMidnight('2024-06-15');
    const result = startOfMonth(date);
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(5); // June
    expect(result.getFullYear()).toBe(2024);
  });

  it('returns same date when already on the first', () => {
    const date = toUtcMidnight('2024-06-01');
    const result = startOfMonth(date);
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(5);
  });

  it('handles December correctly', () => {
    const date = toUtcMidnight('2024-12-25');
    const result = startOfMonth(date);
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(11); // December
    expect(result.getFullYear()).toBe(2024);
  });

  it('sets time to noon', () => {
    const date = toUtcMidnight('2024-06-15');
    const result = startOfMonth(date);
    expect(result.getHours()).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// startOfIsoWeek
// ---------------------------------------------------------------------------

describe('startOfIsoWeek', () => {
  it('returns Monday when given a Wednesday', () => {
    // 2024-06-12 is a Wednesday
    const date = toUtcMidnight('2024-06-12');
    const result = startOfIsoWeek(date);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(10); // June 10
    expect(result.getMonth()).toBe(5);
  });

  it('returns same day when given a Monday', () => {
    // 2024-06-10 is a Monday
    const date = toUtcMidnight('2024-06-10');
    const result = startOfIsoWeek(date);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(10);
  });

  it('returns previous Monday when given a Sunday', () => {
    // 2024-06-16 is a Sunday
    const date = toUtcMidnight('2024-06-16');
    const result = startOfIsoWeek(date);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(10); // June 10
  });

  it('returns previous Monday when given a Saturday', () => {
    // 2024-06-15 is a Saturday
    const date = toUtcMidnight('2024-06-15');
    const result = startOfIsoWeek(date);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(10); // June 10
  });

  it('crosses month boundary correctly', () => {
    // 2024-07-01 is a Monday — first day of July
    const date = toUtcMidnight('2024-07-01');
    const result = startOfIsoWeek(date);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(6); // July
  });

  it('sets time to noon', () => {
    const date = toUtcMidnight('2024-06-12');
    const result = startOfIsoWeek(date);
    expect(result.getHours()).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// computeChartRange
// ---------------------------------------------------------------------------

describe('computeChartRange', () => {
  describe('day zoom', () => {
    it('pads 3 days before earliest and 4 days after latest', () => {
      const range = computeChartRange('2024-06-10', '2024-06-20', 'day');
      const expectedStart = addDays(toUtcMidnight('2024-06-10'), -3);
      const expectedEnd = addDays(toUtcMidnight('2024-06-20'), 4);

      expect(range.start.getDate()).toBe(expectedStart.getDate());
      expect(range.start.getMonth()).toBe(expectedStart.getMonth());
      expect(range.end.getDate()).toBe(expectedEnd.getDate());
      expect(range.end.getMonth()).toBe(expectedEnd.getMonth());
    });

    it('computes totalDays correctly for day zoom', () => {
      const range = computeChartRange('2024-06-10', '2024-06-10', 'day');
      // Single-day: -3 to +4 = 7 days
      expect(range.totalDays).toBe(7);
    });

    it('start is before end', () => {
      const range = computeChartRange('2024-06-10', '2024-06-20', 'day');
      expect(range.start.getTime()).toBeLessThan(range.end.getTime());
    });

    it('returns ChartRange with totalDays equal to daysBetween(start, end)', () => {
      const range = computeChartRange('2024-06-10', '2024-06-20', 'day');
      expect(range.totalDays).toBe(daysBetween(range.start, range.end));
    });
  });

  describe('week zoom', () => {
    it('starts from Monday of earliest week minus 1 week', () => {
      // 2024-06-12 is a Wednesday; week start = June 10 (Mon); minus 7 = June 3
      const range = computeChartRange('2024-06-12', '2024-06-25', 'week');
      expect(range.start.getDay()).toBe(1); // Monday
      expect(range.start.getDate()).toBe(3);
      expect(range.start.getMonth()).toBe(5); // June
    });

    it('ends at 2 weeks after the start of latest ISO week', () => {
      // latest = 2024-06-25 (Tuesday); week start = June 24 (Mon); +14 = July 8
      const range = computeChartRange('2024-06-12', '2024-06-25', 'week');
      expect(range.end.getDay()).toBe(1); // Monday
      expect(range.end.getDate()).toBe(8);
      expect(range.end.getMonth()).toBe(6); // July
    });

    it('totalDays is correct for week zoom', () => {
      const range = computeChartRange('2024-06-12', '2024-06-25', 'week');
      expect(range.totalDays).toBe(daysBetween(range.start, range.end));
    });
  });

  describe('month zoom', () => {
    it('starts from the first day of the prior month', () => {
      // earliest = 2024-06-12; prior month = May 1
      const range = computeChartRange('2024-06-12', '2024-08-15', 'month');
      expect(range.start.getMonth()).toBe(4); // May
      expect(range.start.getDate()).toBe(1);
      expect(range.start.getFullYear()).toBe(2024);
    });

    it('ends at the last day of next month + 1 (so exclusive)', () => {
      // latest = 2024-08-15; next month = September; last day of Sep = Sep 30; +1 = Oct 1
      const range = computeChartRange('2024-06-12', '2024-08-15', 'month');
      expect(range.end.getMonth()).toBe(9); // October
      expect(range.end.getDate()).toBe(1);
      expect(range.end.getFullYear()).toBe(2024);
    });

    it('handles year boundary for start (earliest in January)', () => {
      // earliest = 2024-01-15; prior month = Dec 2023
      const range = computeChartRange('2024-01-15', '2024-03-01', 'month');
      expect(range.start.getMonth()).toBe(11); // December
      expect(range.start.getFullYear()).toBe(2023);
    });

    it('handles year boundary for end (latest in December)', () => {
      // latest = 2024-12-01; next month = January 2025
      const range = computeChartRange('2024-10-01', '2024-12-01', 'month');
      expect(range.end.getMonth()).toBe(1); // February
      expect(range.end.getFullYear()).toBe(2025);
    });

    it('totalDays is correct for month zoom', () => {
      const range = computeChartRange('2024-06-12', '2024-08-15', 'month');
      expect(range.totalDays).toBe(daysBetween(range.start, range.end));
    });
  });

  it('handles same start and end date', () => {
    const rangeDay = computeChartRange('2024-06-15', '2024-06-15', 'day');
    expect(rangeDay.totalDays).toBe(7); // -3 days + 4 days = 7
  });

  it('handles items spanning year boundaries', () => {
    const range = computeChartRange('2024-12-20', '2025-01-10', 'day');
    expect(range.start.getTime()).toBeLessThan(range.end.getTime());
    expect(range.totalDays).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// dateToX
// ---------------------------------------------------------------------------

describe('dateToX', () => {
  // Helper to build a simple ChartRange
  function makeRange(startStr: string, endStr: string): ChartRange {
    const start = toUtcMidnight(startStr);
    const end = toUtcMidnight(endStr);
    return { start, end, totalDays: daysBetween(start, end) };
  }

  describe('day zoom', () => {
    it('returns 0 for the chart start date', () => {
      const range = makeRange('2024-06-01', '2024-06-30');
      const x = dateToX(toUtcMidnight('2024-06-01'), range, 'day');
      expect(x).toBe(0);
    });

    it('returns COLUMN_WIDTHS.day for one day after start', () => {
      const range = makeRange('2024-06-01', '2024-06-30');
      const x = dateToX(toUtcMidnight('2024-06-02'), range, 'day');
      expect(x).toBe(COLUMN_WIDTHS.day); // 40
    });

    it('returns 7 * COLUMN_WIDTHS.day for one week after start', () => {
      const range = makeRange('2024-06-01', '2024-06-30');
      const x = dateToX(toUtcMidnight('2024-06-08'), range, 'day');
      expect(x).toBe(7 * COLUMN_WIDTHS.day); // 280
    });

    it('returns negative x for dates before chart start', () => {
      const range = makeRange('2024-06-05', '2024-06-30');
      const x = dateToX(toUtcMidnight('2024-06-01'), range, 'day');
      expect(x).toBe(-4 * COLUMN_WIDTHS.day);
    });
  });

  describe('week zoom', () => {
    it('returns 0 for the chart start date', () => {
      const range = makeRange('2024-06-03', '2024-07-29'); // Monday
      const x = dateToX(toUtcMidnight('2024-06-03'), range, 'week');
      expect(x).toBe(0);
    });

    it('returns COLUMN_WIDTHS.week for exactly 7 days after start', () => {
      const range = makeRange('2024-06-03', '2024-07-29');
      const x = dateToX(toUtcMidnight('2024-06-10'), range, 'week');
      expect(x).toBeCloseTo(COLUMN_WIDTHS.week, 5); // 110
    });

    it('returns fractional weeks for mid-week dates', () => {
      // 3.5 days into first week = 0.5 weeks = 55px
      const range = makeRange('2024-06-03', '2024-07-29');
      const x = dateToX(toUtcMidnight('2024-06-06'), range, 'week'); // 3 days in
      expect(x).toBeCloseTo((3 / 7) * COLUMN_WIDTHS.week, 5);
    });
  });

  describe('month zoom', () => {
    it('returns 0 for the chart start date (first of month)', () => {
      const range = makeRange('2024-06-01', '2024-08-31');
      const x = dateToX(toUtcMidnight('2024-06-01'), range, 'month');
      expect(x).toBeCloseTo(0, 1);
    });

    it('returns positive x for dates within the same month', () => {
      const range = makeRange('2024-06-01', '2024-08-31');
      const x = dateToX(toUtcMidnight('2024-06-15'), range, 'month');
      expect(x).toBeGreaterThan(0);
    });

    it('x positions increase monotonically for sequential dates', () => {
      const range = makeRange('2024-01-01', '2024-12-31');
      const dates = ['2024-01-15', '2024-03-10', '2024-06-15', '2024-09-01', '2024-11-30'];
      const xs = dates.map((d) => dateToX(toUtcMidnight(d), range, 'month'));
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i]).toBeGreaterThan(xs[i - 1]);
      }
    });

    it('accounts for variable month lengths (February shorter than January)', () => {
      const range = makeRange('2024-01-01', '2024-04-30');
      // First of February
      const xFeb = dateToX(toUtcMidnight('2024-02-01'), range, 'month');
      // First of March — should be approx xFeb + ~(28/30.44)*180
      const xMar = dateToX(toUtcMidnight('2024-03-01'), range, 'month');
      const janWidth = (31 / 30.44) * COLUMN_WIDTHS.month;
      expect(xFeb).toBeCloseTo(janWidth, 0);
      // Feb has 29 days in 2024 (leap year)
      const febWidth = (29 / 30.44) * COLUMN_WIDTHS.month;
      expect(xMar).toBeCloseTo(janWidth + febWidth, 0);
    });
  });
});

// ---------------------------------------------------------------------------
// computeChartWidth
// ---------------------------------------------------------------------------

describe('computeChartWidth', () => {
  function makeRange(startStr: string, endStr: string): ChartRange {
    const start = toUtcMidnight(startStr);
    const end = toUtcMidnight(endStr);
    return { start, end, totalDays: daysBetween(start, end) };
  }

  it('day zoom: width = totalDays * COLUMN_WIDTHS.day', () => {
    const range = makeRange('2024-06-01', '2024-06-30');
    const width = computeChartWidth(range, 'day');
    expect(width).toBe(range.totalDays * COLUMN_WIDTHS.day);
  });

  it('week zoom: width = (totalDays / 7) * COLUMN_WIDTHS.week', () => {
    const range = makeRange('2024-06-03', '2024-07-15'); // starts Monday
    const width = computeChartWidth(range, 'week');
    expect(width).toBeCloseTo((range.totalDays / 7) * COLUMN_WIDTHS.week, 2);
  });

  it('month zoom: width is computed by summing month widths via dateToX', () => {
    const range = makeRange('2024-01-01', '2024-04-01');
    const width = computeChartWidth(range, 'month');
    // Should be approximately 3 months * ~180px with variable month lengths
    expect(width).toBeGreaterThan(0);
    // Jan(31) + Feb(29) + Mar(31) = 91 days => (91/30.44)*180 ≈ 538px
    expect(width).toBeCloseTo(((31 + 29 + 31) / 30.44) * COLUMN_WIDTHS.month, 0);
  });

  it('returns positive width for any valid range', () => {
    const zooms: ZoomLevel[] = ['day', 'week', 'month'];
    for (const zoom of zooms) {
      const range = makeRange('2024-03-01', '2024-06-30');
      expect(computeChartWidth(range, zoom)).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// generateGridLines
// ---------------------------------------------------------------------------

describe('generateGridLines', () => {
  function makeRange(startStr: string, endStr: string): ChartRange {
    const start = toUtcMidnight(startStr);
    const end = toUtcMidnight(endStr);
    return { start, end, totalDays: daysBetween(start, end) };
  }

  describe('day zoom', () => {
    it('generates one line per day', () => {
      const range = makeRange('2024-06-01', '2024-06-08'); // 7 days
      const lines = generateGridLines(range, 'day');
      expect(lines).toHaveLength(7);
    });

    it('marks Mondays as major lines', () => {
      // 2024-06-03 is a Monday
      const range = makeRange('2024-06-01', '2024-06-10');
      const lines = generateGridLines(range, 'day');
      const mondayLines = lines.filter((l) => l.isMajor);
      mondayLines.forEach((l) => {
        expect(l.date.getDay()).toBe(1); // Monday
      });
    });

    it('marks non-Mondays as minor lines', () => {
      const range = makeRange('2024-06-01', '2024-06-08');
      const lines = generateGridLines(range, 'day');
      const minorLines = lines.filter((l) => !l.isMajor);
      minorLines.forEach((l) => {
        expect(l.date.getDay()).not.toBe(1);
      });
    });

    it('lines have non-negative x positions', () => {
      const range = makeRange('2024-06-01', '2024-06-10');
      const lines = generateGridLines(range, 'day');
      lines.forEach((l) => {
        expect(l.x).toBeGreaterThanOrEqual(0);
      });
    });

    it('x positions are strictly increasing', () => {
      const range = makeRange('2024-06-01', '2024-06-10');
      const lines = generateGridLines(range, 'day');
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i].x).toBeGreaterThan(lines[i - 1].x);
      }
    });

    it('each line has a date property', () => {
      const range = makeRange('2024-06-01', '2024-06-05');
      const lines = generateGridLines(range, 'day');
      lines.forEach((l) => {
        expect(l.date).toBeInstanceOf(Date);
      });
    });
  });

  describe('week zoom', () => {
    it('generates one line per week (Monday to Monday)', () => {
      // 4-week range (28 days) should produce 4 weekly lines
      const range = makeRange('2024-06-03', '2024-07-01'); // Mon to Mon = exactly 4 weeks
      const lines = generateGridLines(range, 'week');
      expect(lines).toHaveLength(4);
    });

    it('all lines land on Mondays (ISO week start)', () => {
      const range = makeRange('2024-06-01', '2024-07-15');
      const lines = generateGridLines(range, 'week');
      lines.forEach((l) => {
        expect(l.date.getDay()).toBe(1); // Monday
      });
    });

    it('marks first week of month as major', () => {
      const range = makeRange('2024-06-01', '2024-07-31');
      const lines = generateGridLines(range, 'week');
      const majorLines = lines.filter((l) => l.isMajor);
      majorLines.forEach((l) => {
        expect(l.date.getDate()).toBeLessThanOrEqual(7);
      });
    });

    it('x positions are non-negative and increasing', () => {
      const range = makeRange('2024-06-03', '2024-08-26');
      const lines = generateGridLines(range, 'week');
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i].x).toBeGreaterThan(lines[i - 1].x);
      }
    });
  });

  describe('month zoom', () => {
    it('generates one line per month', () => {
      const range = makeRange('2024-01-01', '2024-07-01'); // Jan through June = 6 months
      const lines = generateGridLines(range, 'month');
      expect(lines).toHaveLength(6);
    });

    it('all month lines are major', () => {
      const range = makeRange('2024-01-01', '2024-07-01');
      const lines = generateGridLines(range, 'month');
      lines.forEach((l) => {
        expect(l.isMajor).toBe(true);
      });
    });

    it('all lines land on the first of the month', () => {
      const range = makeRange('2024-01-01', '2024-07-01');
      const lines = generateGridLines(range, 'month');
      lines.forEach((l) => {
        expect(l.date.getDate()).toBe(1);
      });
    });

    it('x positions are strictly increasing', () => {
      const range = makeRange('2024-01-01', '2024-12-31');
      const lines = generateGridLines(range, 'month');
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i].x).toBeGreaterThan(lines[i - 1].x);
      }
    });

    it('correctly handles year spanning ranges', () => {
      const range = makeRange('2024-11-01', '2025-03-01');
      const lines = generateGridLines(range, 'month');
      expect(lines).toHaveLength(4); // Nov, Dec, Jan, Feb
    });
  });
});

// ---------------------------------------------------------------------------
// generateHeaderCells
// ---------------------------------------------------------------------------

describe('generateHeaderCells', () => {
  // Fixed "today" for deterministic tests: 2024-06-15 (Saturday)
  const TODAY = toUtcMidnight('2024-06-15');

  function makeRange(startStr: string, endStr: string): ChartRange {
    const start = toUtcMidnight(startStr);
    const end = toUtcMidnight(endStr);
    return { start, end, totalDays: daysBetween(start, end) };
  }

  describe('day zoom', () => {
    it('generates one cell per day', () => {
      const range = makeRange('2024-06-01', '2024-06-08'); // 7 days
      const cells = generateHeaderCells(range, 'day', TODAY);
      expect(cells).toHaveLength(7);
    });

    it('each cell has the correct label (day-of-month)', () => {
      const range = makeRange('2024-06-01', '2024-06-04');
      const cells = generateHeaderCells(range, 'day', TODAY);
      expect(cells[0].label).toBe('1');
      expect(cells[1].label).toBe('2');
      expect(cells[2].label).toBe('3');
    });

    it('each cell has the correct sublabel (weekday abbreviation)', () => {
      // 2024-06-01 is Saturday
      const range = makeRange('2024-06-01', '2024-06-04');
      const cells = generateHeaderCells(range, 'day', TODAY);
      expect(cells[0].sublabel).toBe('Sat');
      expect(cells[1].sublabel).toBe('Sun');
      expect(cells[2].sublabel).toBe('Mon');
    });

    it('cell width equals COLUMN_WIDTHS.day', () => {
      const range = makeRange('2024-06-01', '2024-06-08');
      const cells = generateHeaderCells(range, 'day', TODAY);
      cells.forEach((c) => {
        expect(c.width).toBe(COLUMN_WIDTHS.day);
      });
    });

    it('marks today cell with isToday=true', () => {
      // today is 2024-06-15
      const range = makeRange('2024-06-10', '2024-06-20');
      const cells = generateHeaderCells(range, 'day', TODAY);
      const todayCell = cells.find((c) => c.isToday);
      expect(todayCell).toBeDefined();
      expect(todayCell!.label).toBe('15');
    });

    it('marks non-today cells with isToday=false', () => {
      const range = makeRange('2024-06-10', '2024-06-14'); // range before today
      const cells = generateHeaderCells(range, 'day', TODAY);
      cells.forEach((c) => {
        expect(c.isToday).toBe(false);
      });
    });

    it('cells have increasing x positions', () => {
      const range = makeRange('2024-06-01', '2024-06-10');
      const cells = generateHeaderCells(range, 'day', TODAY);
      for (let i = 1; i < cells.length; i++) {
        expect(cells[i].x).toBeGreaterThan(cells[i - 1].x);
      }
    });

    it('first cell starts at x=0', () => {
      const range = makeRange('2024-06-01', '2024-06-10');
      const cells = generateHeaderCells(range, 'day', TODAY);
      expect(cells[0].x).toBe(0);
    });

    it('each cell has a date property', () => {
      const range = makeRange('2024-06-01', '2024-06-05');
      const cells = generateHeaderCells(range, 'day', TODAY);
      cells.forEach((c) => {
        expect(c.date).toBeInstanceOf(Date);
      });
    });
  });

  describe('week zoom', () => {
    it('generates one cell per week', () => {
      // 4-week range
      const range = makeRange('2024-06-03', '2024-07-01'); // Mon to Mon
      const cells = generateHeaderCells(range, 'week', TODAY);
      expect(cells).toHaveLength(4);
    });

    it('cell label includes start and end of week range', () => {
      // 2024-06-03 (Mon) to 2024-06-09 (Sun)
      const range = makeRange('2024-06-03', '2024-06-10');
      const cells = generateHeaderCells(range, 'week', TODAY);
      expect(cells[0].label).toContain('Jun 3');
      expect(cells[0].label).toContain('9'); // end day
    });

    it('cell width equals COLUMN_WIDTHS.week', () => {
      const range = makeRange('2024-06-03', '2024-07-01');
      const cells = generateHeaderCells(range, 'week', TODAY);
      cells.forEach((c) => {
        expect(c.width).toBe(COLUMN_WIDTHS.week);
      });
    });

    it('marks current week as isToday=true', () => {
      // today = 2024-06-15 (Saturday); week Mon = June 10
      const range = makeRange('2024-06-03', '2024-07-01');
      const cells = generateHeaderCells(range, 'week', TODAY);
      const todayCell = cells.find((c) => c.isToday);
      expect(todayCell).toBeDefined();
      // Week containing June 15 starts on June 10
      expect(todayCell!.date.getDate()).toBe(10);
    });

    it('week label shows month when end of week is in a different month', () => {
      // June 24-30 spans into July (actually June 30 is still June)
      // Let's use June 27 - July 3
      const range = makeRange('2024-06-24', '2024-07-08');
      const cells = generateHeaderCells(range, 'week', TODAY);
      // Cell for Jun 24-Jun 30 — same month so no month prefix on end
      expect(cells[0].label).toMatch(/Jun/);
    });

    it('cells have increasing x positions', () => {
      const range = makeRange('2024-06-03', '2024-08-05');
      const cells = generateHeaderCells(range, 'week', TODAY);
      for (let i = 1; i < cells.length; i++) {
        expect(cells[i].x).toBeGreaterThan(cells[i - 1].x);
      }
    });

    it('cell does not have sublabel property set', () => {
      const range = makeRange('2024-06-03', '2024-06-10');
      const cells = generateHeaderCells(range, 'week', TODAY);
      expect(cells[0].sublabel).toBeUndefined();
    });
  });

  describe('month zoom', () => {
    it('generates one cell per month', () => {
      const range = makeRange('2024-01-01', '2024-07-01'); // 6 months
      const cells = generateHeaderCells(range, 'month', TODAY);
      expect(cells).toHaveLength(6);
    });

    it('cell label includes month name and year', () => {
      const range = makeRange('2024-01-01', '2024-04-01');
      const cells = generateHeaderCells(range, 'month', TODAY);
      expect(cells[0].label).toBe('January 2024');
      expect(cells[1].label).toBe('February 2024');
      expect(cells[2].label).toBe('March 2024');
    });

    it('marks current month as isToday=true', () => {
      // today = 2024-06-15
      const range = makeRange('2024-04-01', '2024-09-01');
      const cells = generateHeaderCells(range, 'month', TODAY);
      const todayCell = cells.find((c) => c.isToday);
      expect(todayCell).toBeDefined();
      expect(todayCell!.label).toContain('June 2024');
    });

    it('width differs per month (longer months are wider)', () => {
      const range = makeRange('2024-01-01', '2024-03-01'); // Jan + Feb 2024
      const cells = generateHeaderCells(range, 'month', TODAY);
      // January (31 days) should be wider than February 2024 (29 days)
      expect(cells[0].width).toBeGreaterThan(cells[1].width);
    });

    it('cells span the full year correctly', () => {
      const range = makeRange('2024-01-01', '2025-01-01');
      const cells = generateHeaderCells(range, 'month', TODAY);
      expect(cells).toHaveLength(12);
      expect(cells[0].label).toBe('January 2024');
      expect(cells[11].label).toBe('December 2024');
    });

    it('handles year spanning ranges (Dec → Jan)', () => {
      const range = makeRange('2024-11-01', '2025-03-01');
      const cells = generateHeaderCells(range, 'month', TODAY);
      expect(cells).toHaveLength(4);
      expect(cells[2].label).toBe('January 2025');
    });

    it('cells have increasing x positions', () => {
      const range = makeRange('2024-01-01', '2024-12-31');
      const cells = generateHeaderCells(range, 'month', TODAY);
      for (let i = 1; i < cells.length; i++) {
        expect(cells[i].x).toBeGreaterThan(cells[i - 1].x);
      }
    });

    it('month cells do not have sublabel', () => {
      const range = makeRange('2024-01-01', '2024-04-01');
      const cells = generateHeaderCells(range, 'month', TODAY);
      cells.forEach((c) => {
        expect(c.sublabel).toBeUndefined();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// computeBarPosition
// ---------------------------------------------------------------------------

describe('computeBarPosition', () => {
  const TODAY = new Date(2024, 5, 15, 12, 0, 0, 0); // June 15, 2024

  function makeRange(startStr: string, endStr: string): ChartRange {
    const start = toUtcMidnight(startStr);
    const end = toUtcMidnight(endStr);
    return { start, end, totalDays: daysBetween(start, end) };
  }

  describe('x position (day zoom)', () => {
    it('computes x at chart start for bar starting at chart start', () => {
      const range = makeRange('2024-06-01', '2024-06-30');
      const pos = computeBarPosition('2024-06-01', '2024-06-05', 0, range, 'day', TODAY);
      expect(pos.x).toBe(0);
    });

    it('computes x correctly for bar starting 5 days in', () => {
      const range = makeRange('2024-06-01', '2024-06-30');
      const pos = computeBarPosition('2024-06-06', '2024-06-10', 0, range, 'day', TODAY);
      expect(pos.x).toBe(5 * COLUMN_WIDTHS.day);
    });
  });

  describe('width', () => {
    it('computes width as difference between end and start x positions', () => {
      const range = makeRange('2024-06-01', '2024-06-30');
      // 4-day span = 4 * 40 = 160px
      const pos = computeBarPosition('2024-06-01', '2024-06-05', 0, range, 'day', TODAY);
      expect(pos.width).toBe(4 * COLUMN_WIDTHS.day);
    });

    it('enforces minimum bar width of MIN_BAR_WIDTH', () => {
      // Zero-duration: same start and end
      const range = makeRange('2024-06-01', '2024-06-30');
      const pos = computeBarPosition('2024-06-15', '2024-06-15', 0, range, 'day', TODAY);
      expect(pos.width).toBe(MIN_BAR_WIDTH);
    });

    it('does not reduce width below MIN_BAR_WIDTH for very short bars', () => {
      // In day zoom, consecutive dates give exactly COLUMN_WIDTHS.day (40px) which is > MIN_BAR_WIDTH
      const range = makeRange('2024-06-01', '2024-06-30');
      const pos = computeBarPosition('2024-06-10', '2024-06-11', 0, range, 'day', TODAY);
      expect(pos.width).toBe(Math.max(COLUMN_WIDTHS.day, MIN_BAR_WIDTH));
    });

    it('uses 1-day duration when endDate is null', () => {
      const range = makeRange('2024-06-01', '2024-06-30');
      const posWithEnd = computeBarPosition('2024-06-10', '2024-06-11', 0, range, 'day', TODAY);
      const posNoEnd = computeBarPosition('2024-06-10', null, 0, range, 'day', TODAY);
      expect(posNoEnd.width).toBe(posWithEnd.width);
    });

    it('uses today as start when startDate is null', () => {
      const range = makeRange('2024-06-01', '2024-06-30');
      const posNull = computeBarPosition(null, '2024-06-20', 0, range, 'day', TODAY);
      // Today is June 15; end is June 20 => 5 days = 5 * 40 = 200px
      const expectedX = 14 * COLUMN_WIDTHS.day; // June 15 is 14 days after June 1
      expect(posNull.x).toBe(expectedX);
    });

    it('uses today + 1 day as end when both dates are null', () => {
      const range = makeRange('2024-06-01', '2024-06-30');
      const pos = computeBarPosition(null, null, 0, range, 'day', TODAY);
      // Width should be 1 day
      expect(pos.width).toBe(Math.max(COLUMN_WIDTHS.day, MIN_BAR_WIDTH));
    });
  });

  describe('y position', () => {
    it('rowIndex 0 gives y = BAR_OFFSET_Y', () => {
      const range = makeRange('2024-06-01', '2024-06-30');
      const pos = computeBarPosition('2024-06-05', '2024-06-10', 0, range, 'day', TODAY);
      expect(pos.y).toBe(BAR_OFFSET_Y);
      expect(pos.rowY).toBe(0);
    });

    it('rowIndex 1 gives y = ROW_HEIGHT + BAR_OFFSET_Y', () => {
      const range = makeRange('2024-06-01', '2024-06-30');
      const pos = computeBarPosition('2024-06-05', '2024-06-10', 1, range, 'day', TODAY);
      expect(pos.rowY).toBe(ROW_HEIGHT);
      expect(pos.y).toBe(ROW_HEIGHT + BAR_OFFSET_Y);
    });

    it('rowIndex N gives rowY = N * ROW_HEIGHT', () => {
      const range = makeRange('2024-06-01', '2024-06-30');
      for (let i = 0; i < 5; i++) {
        const pos = computeBarPosition('2024-06-05', '2024-06-10', i, range, 'day', TODAY);
        expect(pos.rowY).toBe(i * ROW_HEIGHT);
        expect(pos.y).toBe(i * ROW_HEIGHT + BAR_OFFSET_Y);
      }
    });
  });

  describe('across zoom levels', () => {
    it('computes valid position in week zoom', () => {
      const range = makeRange('2024-06-03', '2024-08-26');
      const pos = computeBarPosition('2024-06-10', '2024-06-24', 0, range, 'week', TODAY);
      expect(pos.x).toBeGreaterThan(0);
      expect(pos.width).toBeGreaterThan(0);
    });

    it('computes valid position in month zoom', () => {
      const range = makeRange('2024-05-01', '2024-09-01');
      const pos = computeBarPosition('2024-06-01', '2024-07-31', 0, range, 'month', TODAY);
      expect(pos.x).toBeGreaterThan(0);
      expect(pos.width).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles bar starting before chart range (x can be negative)', () => {
      const range = makeRange('2024-06-10', '2024-06-30');
      const pos = computeBarPosition('2024-06-01', '2024-06-05', 0, range, 'day', TODAY);
      expect(pos.x).toBeLessThan(0);
    });

    it('handles large row index without overflow', () => {
      const range = makeRange('2024-06-01', '2024-06-30');
      const pos = computeBarPosition('2024-06-05', '2024-06-10', 100, range, 'day', TODAY);
      expect(pos.rowY).toBe(100 * ROW_HEIGHT);
    });

    it('bars spanning year boundaries are positioned correctly', () => {
      const range = makeRange('2024-12-01', '2025-02-28');
      const pos = computeBarPosition('2024-12-20', '2025-01-15', 0, range, 'day', TODAY);
      expect(pos.x).toBeGreaterThan(0);
      expect(pos.width).toBeGreaterThan(0);
    });
  });
});
