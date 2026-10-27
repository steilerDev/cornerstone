/**
 * formatRate (#2242): whole rates without decimals, others with two.
 * Mutations: always two digits; always zero digits; the digit count inverted.
 */
import { jest, describe, it, expect } from '@jest/globals';
import { formatRate } from './formatRate.js';

describe('formatRate', () => {
  const formatPercent = jest.fn((rate: number, digits?: number) => `${rate.toFixed(digits ?? 1)}%`);

  it('shows a whole rate without decimals', () => {
    expect(formatRate(30, formatPercent)).toBe('30%');
    expect(formatPercent).toHaveBeenLastCalledWith(30, 0);
  });

  it('shows a fractional rate with two decimals', () => {
    expect(formatRate(2.5, formatPercent)).toBe('2.50%');
    expect(formatPercent).toHaveBeenLastCalledWith(2.5, 2);
  });

  it('treats 0 as a whole rate', () => {
    expect(formatRate(0, formatPercent)).toBe('0%');
  });
});
