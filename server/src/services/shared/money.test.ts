import { describe, it, expect } from '@jest/globals';
import { toCents, exceedsAmount } from './money.js';

// ─── toCents ────────────────────────────────────────────────────────────────

describe('toCents', () => {
  it('converts a whole-euro amount to the correct integer number of cents', () => {
    expect(toCents(1000)).toBe(100000);
  });

  it('rounds away IEEE-754 float noise (332.85 * 100 raw is 33284.999999999996)', () => {
    // Without Math.round, 332.85 * 100 === 33284.999999999996 in IEEE-754.
    expect(toCents(332.85)).toBe(33285);
  });
});

// ─── exceedsAmount ──────────────────────────────────────────────────────────

describe('exceedsAmount', () => {
  it('returns false for the exact issue #1806 regression case (summation noise equal to total)', () => {
    // 332.85 + 333.04 + 334.11 === 1000.0000000000001 in raw IEEE-754 arithmetic.
    expect(exceedsAmount(1000.0000000000001, 1000)).toBe(false);
  });

  it('returns true for a genuine one-cent overage', () => {
    expect(exceedsAmount(1000.01, 1000)).toBe(true);
  });

  it('returns false for exact equality', () => {
    expect(exceedsAmount(1000, 1000)).toBe(false);
  });

  it('returns false when sum is under the total', () => {
    expect(exceedsAmount(999.999, 1000)).toBe(false);
  });

  it('returns false at the sub-cent boundary that rounds down to the same cent (1000.004 -> 100000)', () => {
    expect(exceedsAmount(1000.004, 1000)).toBe(false);
  });

  it('returns true just past the rounding boundary (1000.006 -> 100001, genuinely one cent over)', () => {
    expect(exceedsAmount(1000.006, 1000)).toBe(true);
  });
});
