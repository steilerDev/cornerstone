import { describe, it, expect } from '@jest/globals';
import {
  formatDateRange,
  formatNumberRange,
  isRealDate,
  parseDateRange,
  parseNumberRange,
} from './rangeParams.js';

describe('isRealDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isRealDate('2026-02-28')).toBe(true);
    expect(isRealDate('2028-02-29')).toBe(true);
    expect(isRealDate('2026-02-29')).toBe(false);
    expect(isRealDate('2026-13-01')).toBe(false);
    expect(isRealDate('2026-1-01')).toBe(false);
  });
});

describe('parseDateRange / formatDateRange / isRealDate', () => {
  it('reads both sides', () => {
    expect(parseDateRange('from:2026-01-01,to:2026-02-01')).toEqual({
      from: '2026-01-01',
      to: '2026-02-01',
    });
  });

  it('reads one side only', () => {
    expect(parseDateRange('from:2026-01-01')).toEqual({ from: '2026-01-01', to: null });
    expect(parseDateRange('to:2026-02-01')).toEqual({ from: null, to: '2026-02-01' });
  });

  it('drops an invalid side and keeps the valid one', () => {
    expect(parseDateRange('from:nope,to:2026-02-01')).toEqual({ from: null, to: '2026-02-01' });
    expect(parseDateRange('from:2026-02-30,to:2026-02-01')).toEqual({
      from: null,
      to: '2026-02-01',
    });
    expect(parseDateRange('from:2026-13-01')).toBeNull();
  });

  it('is null for no value, an empty value, no valid side or parts without a colon', () => {
    expect(parseDateRange(null)).toBeNull();
    expect(parseDateRange('')).toBeNull();
    expect(parseDateRange('from:,to:')).toBeNull();
    expect(parseDateRange('garbage,more')).toBeNull();
    expect(parseDateRange('other:2026-01-01')).toBeNull();
  });

  it('serialises, with null for an empty range', () => {
    expect(formatDateRange('2026-01-01', '2026-02-01')).toBe('from:2026-01-01,to:2026-02-01');
    expect(formatDateRange('2026-01-01', null)).toBe('from:2026-01-01');
    expect(formatDateRange(null, '2026-02-01')).toBe('to:2026-02-01');
    expect(formatDateRange(null, null)).toBeNull();
  });
});

describe('parseNumberRange / formatNumberRange', () => {
  it('reads both sides, including zero and decimals', () => {
    expect(parseNumberRange('min:0,max:250.5')).toEqual({ min: 0, max: 250.5 });
  });

  it('reads one side only', () => {
    expect(parseNumberRange('min:10')).toEqual({ min: 10, max: null });
    expect(parseNumberRange('max:10')).toEqual({ min: null, max: 10 });
  });

  it('drops sides that are not finite numbers', () => {
    expect(parseNumberRange('min:abc,max:5')).toEqual({ min: null, max: 5 });
    expect(parseNumberRange('min:Infinity,max:  ')).toBeNull();
  });

  it('is null for no value or no valid side', () => {
    expect(parseNumberRange(null)).toBeNull();
    expect(parseNumberRange('')).toBeNull();
    expect(parseNumberRange('min:,max:')).toBeNull();
  });

  it('serialises, with null for an empty range', () => {
    expect(formatNumberRange(10, 20.5)).toBe('min:10,max:20.5');
    expect(formatNumberRange(0, null)).toBe('min:0');
    expect(formatNumberRange(null, 5)).toBe('max:5');
    expect(formatNumberRange(null, null)).toBeNull();
  });
});
