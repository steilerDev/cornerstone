import { describe, it, expect } from '@jest/globals';
import {
  QUICK_LOG_MODES,
  isQuickLogMode,
  prefillFromSearch,
  sanitizePrefill,
  startModeFromSearch,
} from './createQuery.js';

describe('sanitizePrefill', () => {
  it('accepts a real calendar date and valid ids', () => {
    expect(sanitizePrefill({ date: '2026-02-28', areaId: 'a_1-B', companyId: 'c2' })).toEqual({
      date: '2026-02-28',
      areaId: 'a_1-B',
      companyId: 'c2',
    });
  });

  it.each(['2026-02-30', '2026-13-01', '2026-2-1', '20260228', '2026-02-28T00:00', ''])(
    'rejects date %p',
    (date) => {
      expect(sanitizePrefill({ date })).toEqual({});
    },
  );

  it('accepts a leap day and rejects it in a common year', () => {
    expect(sanitizePrefill({ date: '2028-02-29' })).toEqual({ date: '2028-02-29' });
    expect(sanitizePrefill({ date: '2027-02-29' })).toEqual({});
  });

  it('rejects ids with slashes, spaces, empty, or longer than 64', () => {
    expect(sanitizePrefill({ areaId: 'a/b' })).toEqual({});
    expect(sanitizePrefill({ areaId: 'a b' })).toEqual({});
    expect(sanitizePrefill({ companyId: '' })).toEqual({});
    expect(sanitizePrefill({ areaId: 'a'.repeat(65) })).toEqual({});
    expect(sanitizePrefill({ areaId: 'a'.repeat(64) })).toEqual({ areaId: 'a'.repeat(64) });
  });

  it('ignores non-string values', () => {
    expect(sanitizePrefill({ areaId: 5, date: null, companyId: undefined })).toEqual({});
  });
});

describe('prefillFromSearch', () => {
  it('reads and sanitizes the three keys', () => {
    const params = new URLSearchParams('areaId=a1&companyId=bad/id&date=2026-02-30');
    expect(prefillFromSearch(params)).toEqual({ areaId: 'a1' });
    expect(prefillFromSearch(new URLSearchParams('date=2026-03-01'))).toEqual({
      date: '2026-03-01',
    });
    expect(prefillFromSearch(new URLSearchParams(''))).toEqual({});
  });
});

describe('isQuickLogMode', () => {
  it('lists photo, note, delivery in order', () => {
    expect(QUICK_LOG_MODES).toEqual(['photo', 'note', 'delivery']);
  });

  it.each(['photo', 'note', 'delivery'])('accepts %s', (mode) => {
    expect(isQuickLogMode(mode)).toBe(true);
  });

  it.each(['video', '', null, undefined, 1, 'Photo'])('rejects %p', (value) => {
    expect(isQuickLogMode(value)).toBe(false);
  });
});

describe('startModeFromSearch', () => {
  it('reads a valid start', () => {
    expect(startModeFromSearch(new URLSearchParams('start=delivery'))).toBe('delivery');
  });

  it('ignores an invalid or missing start', () => {
    expect(startModeFromSearch(new URLSearchParams('start=video'))).toBeNull();
    expect(startModeFromSearch(new URLSearchParams('start='))).toBeNull();
    expect(startModeFromSearch(new URLSearchParams('areaId=a1'))).toBeNull();
  });

  it('takes the first of a duplicated start', () => {
    expect(startModeFromSearch(new URLSearchParams('start=note&start=photo'))).toBe('note');
  });
});
