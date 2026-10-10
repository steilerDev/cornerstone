import { describe, it, expect } from '@jest/globals';
import { roundMoney, overAllocatedAmount } from './money.js';

describe('roundMoney', () => {
  it('rounds to 2 decimals', () => {
    expect(roundMoney(1.234)).toBe(1.23);
    expect(roundMoney(1.236)).toBe(1.24);
  });

  it('leaves whole cents and integers unchanged', () => {
    expect(roundMoney(250)).toBe(250);
    expect(roundMoney(19.99)).toBe(19.99);
    expect(roundMoney(0)).toBe(0);
  });

  it('rounds half-cent values with Math.round semantics (up at exactly .5 of a cent)', () => {
    expect(roundMoney(0.005)).toBe(0.01);
    expect(roundMoney(0.015)).toBe(0.02);
    // 1.005 is stored as 1.00499999999999989..., so it stays 1.00
    expect(roundMoney(1.005)).toBe(1);
  });

  it('rounds negative values to cents', () => {
    expect(roundMoney(-1.234)).toBe(-1.23);
    expect(roundMoney(-1.236)).toBe(-1.24);
    expect(roundMoney(-250)).toBe(-250);
  });

  it('collapses float residue to zero in both directions', () => {
    expect(Math.abs(roundMoney(1e-13))).toBe(0);
    expect(Math.abs(roundMoney(-1e-13))).toBe(0);
    // classic accumulated residue: 0.1 + 0.2 - 0.3 = 5.55e-17
    expect(Math.abs(roundMoney(0.1 + 0.2 - 0.3))).toBe(0);
  });

  it('removes accumulated float noise from sums', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1000 - 600 - 100 - 300)).toBe(0);
  });
});

describe('overAllocatedAmount', () => {
  it('returns allocated minus amount when over-allocated', () => {
    expect(overAllocatedAmount(1250, 1000)).toBe(250);
  });

  it('returns 0 when under-allocated (never negative)', () => {
    expect(overAllocatedAmount(900, 1000)).toBe(0);
  });

  it('returns 0 when allocated equals the amount', () => {
    expect(overAllocatedAmount(1000, 1000)).toBe(0);
  });

  it('rounds the difference to cents', () => {
    expect(overAllocatedAmount(1000.456, 1000)).toBe(0.46);
  });

  it('treats float residue above the amount as not over-allocated', () => {
    expect(Math.abs(overAllocatedAmount(1000 + 1e-13, 1000))).toBe(0);
    expect(Math.abs(overAllocatedAmount(0.1 + 0.2, 0.3))).toBe(0);
  });

  it('handles a zero amount', () => {
    expect(overAllocatedAmount(50, 0)).toBe(50);
  });
});
