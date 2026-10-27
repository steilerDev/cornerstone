/**
 * financingBar (#2242, D9): Submitted, Paid-not-submitted, Allocated-not-paid, cumulatively
 * capped to the amount; overflow is the over-allocation.
 *
 * Mutations: Submitted double counted inside Paid; no cumulative cap; negative segment when paid
 * is below submitted; maxValue 0 for an empty source; overflow dropped.
 */
import { describe, it, expect } from '@jest/globals';
import { financingBar } from './financingBar.js';

const labels = { submitted: 'Submitted', paid: 'Paid', allocated: 'Allocated' };
const fig = (over: Partial<Parameters<typeof financingBar>[0]> = {}) => ({
  amount: 1000,
  allocated: 0,
  paid: 0,
  submitted: 0,
  overAllocated: 0,
  ...over,
});
const values = (model: ReturnType<typeof financingBar>) => model.segments.map((s) => s.value);

describe('financingBar', () => {
  it('draws the three segments as differences (Submitted is inside Paid, Paid inside Allocated)', () => {
    const model = financingBar(fig({ allocated: 700, paid: 400, submitted: 150 }), labels);

    expect(model.segments.map((s) => s.key)).toEqual(['submitted', 'paid', 'allocated']);
    expect(values(model)).toEqual([150, 250, 300]);
    expect(model.segments.map((s) => s.totalValue)).toEqual([150, 400, 700]);
    expect(model.segments.map((s) => s.label)).toEqual(['Submitted', 'Paid', 'Allocated']);
    expect(model.segments.map((s) => s.color)).toEqual([
      'var(--color-budget-claimed)',
      'var(--color-budget-paid)',
      'var(--color-budget-allocated)',
    ]);
    expect(model.maxValue).toBe(1000);
    expect(model.overflow).toBe(0);
  });

  it('caps the segments cumulatively to the amount and reports the overflow', () => {
    const model = financingBar(
      fig({ amount: 500, allocated: 800, paid: 450, submitted: 100, overAllocated: 300 }),
      labels,
    );

    expect(values(model)).toEqual([100, 350, 50]);
    expect(values(model).reduce((a, b) => a + b, 0)).toBe(500);
    expect(model.overflow).toBe(300);
  });

  it('caps Submitted itself when it exceeds the amount', () => {
    expect(
      values(financingBar(fig({ amount: 100, submitted: 250, paid: 250, allocated: 250 }), labels)),
    ).toEqual([100, 0, 0]);
  });

  it('never draws a negative segment when paid is below submitted or allocated below paid', () => {
    expect(
      values(financingBar(fig({ allocated: 100, paid: 100, submitted: 300 }), labels)),
    ).toEqual([300, 0, 0]);
    expect(values(financingBar(fig({ allocated: 50, paid: 200 }), labels))).toEqual([0, 200, 0]);
  });

  it('uses maxValue 1 for a source with no amount, with nothing drawn', () => {
    const model = financingBar(fig({ amount: 0, allocated: 40, overAllocated: 40 }), labels);

    expect(model.maxValue).toBe(1);
    expect(values(model)).toEqual([0, 0, 0]);
    expect(model.overflow).toBe(40);
  });
});
