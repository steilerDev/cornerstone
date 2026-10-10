import { describe, it, expect } from '@jest/globals';
import { barDates, scheduleSignalOf } from './scheduleDates.js';

describe('barDates', () => {
  const base = {
    actualStartDate: null,
    actualEndDate: null,
    projectedStartDate: '2026-03-10',
    projectedEndDate: '2026-03-13',
  };

  it('uses the forecast dates when there are no actual dates', () => {
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
