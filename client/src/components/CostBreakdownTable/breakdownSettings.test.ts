import { describe, it, expect } from '@jest/globals';
import {
  BREAKDOWN_ESTIMATES,
  BREAKDOWN_PAYMENTS,
  BREAKDOWN_VIEWS,
  ESTIMATE_SCENARIO,
  UNASSIGNED_SOURCE_KEY,
  breakdownSourceKeys,
  isBreakdownFiltered,
} from './breakdownSettings.js';
import type { BreakdownSettings } from './breakdownSettings.js';
import { makeBreakdown, makeEmptyBreakdown } from '../../test/breakdownFixtures.js';

const base: BreakdownSettings = {
  view: 'area',
  payment: 'all',
  estimate: 'expected',
  grants: false,
  deselected: new Set(),
};

describe('breakdownSettings', () => {
  it('lists the four views, three payment bases and three estimates in display order', () => {
    expect([...BREAKDOWN_VIEWS]).toEqual(['area', 'type', 'category', 'source']);
    expect([...BREAKDOWN_PAYMENTS]).toEqual(['all', 'paid', 'outstanding']);
    expect([...BREAKDOWN_ESTIMATES]).toEqual(['low', 'expected', 'high']);
  });

  it('maps Low to the best scenario and High to the worst one', () => {
    expect(ESTIMATE_SCENARIO).toEqual({ low: 'best', expected: 'expected', high: 'worst' });
  });

  describe('breakdownSourceKeys', () => {
    it('lists every source and then Unassigned when lines without a source exist', () => {
      expect(breakdownSourceKeys(makeBreakdown(), new Set())).toEqual([
        'bs-a',
        'bs-b',
        UNASSIGNED_SOURCE_KEY,
      ]);
    });

    it('omits Unassigned when no line lacks a source and it is not deselected', () => {
      const b = makeBreakdown({ hasUnassignedLines: false });
      expect(breakdownSourceKeys(b, new Set(['bs-a']))).toEqual(['bs-a', 'bs-b']);
    });

    it('keeps Unassigned while it is deselected so it can be switched back on', () => {
      const b = makeBreakdown({ hasUnassignedLines: false });
      expect(breakdownSourceKeys(b, new Set([UNASSIGNED_SOURCE_KEY]))).toEqual([
        'bs-a',
        'bs-b',
        UNASSIGNED_SOURCE_KEY,
      ]);
    });

    it('returns no keys for a project without sources or unassigned lines', () => {
      expect(breakdownSourceKeys(makeEmptyBreakdown(), new Set())).toEqual([]);
    });
  });

  describe('isBreakdownFiltered', () => {
    it('is false for the whole project at expected estimates (view and grants do not count)', () => {
      expect(isBreakdownFiltered(base)).toBe(false);
      expect(isBreakdownFiltered({ ...base, view: 'source', grants: true })).toBe(false);
    });

    it('is true for a payment basis other than All', () => {
      expect(isBreakdownFiltered({ ...base, payment: 'paid' })).toBe(true);
      expect(isBreakdownFiltered({ ...base, payment: 'outstanding' })).toBe(true);
    });

    it('is true for an estimate other than Expected', () => {
      expect(isBreakdownFiltered({ ...base, estimate: 'low' })).toBe(true);
      expect(isBreakdownFiltered({ ...base, estimate: 'high' })).toBe(true);
    });

    it('is true when any funding source is deselected', () => {
      expect(isBreakdownFiltered({ ...base, deselected: new Set(['bs-a']) })).toBe(true);
    });
  });
});
