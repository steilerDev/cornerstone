import { describe, it, expect } from '@jest/globals';
import { barDates, plannedRangeText, scheduleSignalOf, showsPlannedRow } from './scheduleDates.js';

describe('barDates', () => {
  const base = {
    actualStartDate: null,
    actualEndDate: null,
    projectedStartDate: '2026-03-10',
    projectedEndDate: '2026-03-13',
  };

  it('D-38: uses the forecast dates when there are no actual dates', () => {
    expect(barDates(base)).toEqual({ start: '2026-03-10', end: '2026-03-13' });
  });

  it('prefers actual dates over the forecast', () => {
    expect(
      barDates({ ...base, actualStartDate: '2026-03-01', actualEndDate: '2026-03-04' }),
    ).toEqual({ start: '2026-03-01', end: '2026-03-04' });
  });

  it('mixes an actual start with a forecast end', () => {
    expect(barDates({ ...base, actualStartDate: '2026-03-01' })).toEqual({
      start: '2026-03-01',
      end: '2026-03-13',
    });
  });

  it('returns nulls when neither actual nor forecast dates exist', () => {
    expect(
      barDates({
        actualStartDate: null,
        actualEndDate: null,
        projectedStartDate: null,
        projectedEndDate: null,
      }),
    ).toEqual({ start: null, end: null });
  });
});

describe('scheduleSignalOf', () => {
  it('reports a late item with its day count', () => {
    expect(scheduleSignalOf({ isLate: true, lateDays: 3, isHeldUp: false })).toEqual({
      signal: 'late',
      days: 3,
    });
  });

  it('reports a held-up item', () => {
    expect(scheduleSignalOf({ isLate: false, lateDays: null, isHeldUp: true })).toEqual({
      signal: 'held_up',
    });
  });

  it('lets late win over held up', () => {
    expect(scheduleSignalOf({ isLate: true, lateDays: 2, isHeldUp: true })).toEqual({
      signal: 'late',
      days: 2,
    });
  });

  it('shows nothing for late without a usable day count', () => {
    expect(scheduleSignalOf({ isLate: true, lateDays: null, isHeldUp: false })).toBeNull();
    expect(scheduleSignalOf({ isLate: true, lateDays: 0, isHeldUp: false })).toBeNull();
  });

  it('falls back to held up when late has no day count but the item is held up', () => {
    expect(scheduleSignalOf({ isLate: true, lateDays: null, isHeldUp: true })).toEqual({
      signal: 'held_up',
    });
  });

  it('shows nothing for an on-time item', () => {
    expect(scheduleSignalOf({ isLate: false, lateDays: null, isHeldUp: false })).toBeNull();
  });
});

describe('showsPlannedRow', () => {
  const shown = { startDate: '2026-03-05', endDate: '2026-03-15' };

  it('is false when the planned dates equal the shown dates', () => {
    expect(
      showsPlannedRow({ ...shown, plannedStartDate: '2026-03-05', plannedEndDate: '2026-03-15' }),
    ).toBe(false);
  });

  it('D-38: is true when the start differs', () => {
    expect(
      showsPlannedRow({ ...shown, plannedStartDate: '2026-03-01', plannedEndDate: '2026-03-15' }),
    ).toBe(true);
  });

  it('is true when the end differs', () => {
    expect(
      showsPlannedRow({ ...shown, plannedStartDate: '2026-03-05', plannedEndDate: '2026-03-12' }),
    ).toBe(true);
  });

  it('is false when both planned dates are null (undated task)', () => {
    expect(showsPlannedRow({ ...shown, plannedStartDate: null, plannedEndDate: null })).toBe(false);
  });

  it('is true when the planned start is null but the shown start is set and the end differs', () => {
    expect(
      showsPlannedRow({ ...shown, plannedStartDate: null, plannedEndDate: '2026-03-12' }),
    ).toBe(true);
  });

  it('is false when the planned start is null, the shown start is null too, and the end equals', () => {
    expect(
      showsPlannedRow({
        startDate: null,
        endDate: '2026-03-15',
        plannedStartDate: null,
        plannedEndDate: '2026-03-15',
      }),
    ).toBe(false);
  });
});

describe('plannedRangeText', () => {
  const fmt = (d: string) => `<${d}>`;

  it('formats both dates as a day range', () => {
    const text = plannedRangeText('2026-03-05', '2026-03-08', 'en-US', fmt);
    expect(text).toContain('5');
    expect(text).toContain('8');
    expect(text).toContain('2026');
    expect(text).not.toContain('<');
  });

  it('formats the range in German for the de locale', () => {
    const text = plannedRangeText('2026-03-05', '2026-03-08', 'de-DE', fmt);
    expect(text).toMatch(/Mär|3\./);
  });

  it('uses the single-date formatter when only the start is set', () => {
    expect(plannedRangeText('2026-03-05', null, 'en-US', fmt)).toBe('<2026-03-05>');
  });

  it('uses the single-date formatter when only the end is set', () => {
    expect(plannedRangeText(null, '2026-03-08', 'en-US', fmt)).toBe('<2026-03-08>');
  });

  it('returns null when no planned date is set', () => {
    expect(plannedRangeText(null, null, 'en-US', fmt)).toBeNull();
  });
});
