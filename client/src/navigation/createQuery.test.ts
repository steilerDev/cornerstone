import { describe, it, expect } from '@jest/globals';
import { prefillFromSearch, sanitizePrefill } from './createQuery.js';

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
