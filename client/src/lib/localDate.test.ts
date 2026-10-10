import { describe, it, expect } from '@jest/globals';
import { todayLocalIsoDate } from './localDate.js';

describe('todayLocalIsoDate', () => {
  it('formats the local calendar day as YYYY-MM-DD', () => {
    expect(todayLocalIsoDate(new Date(2026, 7, 7, 12, 0, 0))).toBe('2026-08-07');
  });

  it('zero-pads single-digit months and days', () => {
    expect(todayLocalIsoDate(new Date(2026, 0, 5, 9, 0, 0))).toBe('2026-01-05');
  });

  it('uses the local day just after midnight, never the UTC-shifted day', () => {
    expect(todayLocalIsoDate(new Date(2026, 2, 1, 0, 30, 0))).toBe('2026-03-01');
  });

  it('uses the local day just before midnight', () => {
    expect(todayLocalIsoDate(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });

  it('defaults to the current date', () => {
    expect(todayLocalIsoDate()).toBe(todayLocalIsoDate(new Date()));
  });
});
