import { describe, it, expect } from '@jest/globals';
import { USER_ACCOUNT_STATUSES, isSameLocalDay, userAccountStatus } from './userAccountStatus.js';

const FUTURE = '2026-06-15T09:30:00.000Z';
const local = (y: number, m: number, d: number, h: number, min: number) =>
  new Date(y, m, d, h, min).toISOString();

describe('USER_ACCOUNT_STATUSES', () => {
  it('is ordered Active, Locked, Deactivated (filter and sort order)', () => {
    expect([...USER_ACCOUNT_STATUSES]).toEqual(['active', 'locked', 'deactivated']);
  });
});

describe('userAccountStatus', () => {
  it('is deactivated when deactivated, even while a lock is still reported', () => {
    expect(
      userAccountStatus({ deactivatedAt: '2026-02-01T00:00:00.000Z', lockedUntil: FUTURE }),
    ).toBe('deactivated');
  });

  it('is deactivated when deactivated and not locked', () => {
    expect(
      userAccountStatus({ deactivatedAt: '2026-02-01T00:00:00.000Z', lockedUntil: null }),
    ).toBe('deactivated');
  });

  it('is locked when the server reports a lock end and the account is active', () => {
    expect(userAccountStatus({ deactivatedAt: null, lockedUntil: FUTURE })).toBe('locked');
  });

  it('is active when lockedUntil is null (no lock or lock expired)', () => {
    expect(userAccountStatus({ deactivatedAt: null, lockedUntil: null })).toBe('active');
  });

  it('is active when lockedUntil is missing (member payload)', () => {
    expect(userAccountStatus({ deactivatedAt: null })).toBe('active');
  });
});

describe('isSameLocalDay', () => {
  it('is true for two times on the same local day', () => {
    expect(isSameLocalDay(local(2026, 5, 15, 0, 1), local(2026, 5, 15, 23, 59))).toBe(true);
  });

  it('is false across local midnight (23:59 vs 00:01 the next day)', () => {
    expect(isSameLocalDay(local(2026, 5, 15, 23, 59), local(2026, 5, 16, 0, 1))).toBe(false);
  });

  it('is false for the same day of month in another month or year', () => {
    expect(isSameLocalDay(local(2026, 5, 15, 9, 0), local(2026, 6, 15, 9, 0))).toBe(false);
    expect(isSameLocalDay(local(2026, 5, 15, 9, 0), local(2027, 5, 15, 9, 0))).toBe(false);
  });
});
