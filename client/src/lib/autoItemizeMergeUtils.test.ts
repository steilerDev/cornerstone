/**
 * Unit tests for autoItemizeMergeUtils.ts — Story #1797 (merge line items).
 *
 * Covers:
 * - aggregateMergedLineNumerics: VAT gross-up aggregation, quantity/unit uniformity,
 *   confidence = min, vendorName agreement, budgetSourceId passthrough
 * - buildAvailableCategories: distinct extracted categories vs. project fallback
 */

import { describe, it, expect } from '@jest/globals';
import { aggregateMergedLineNumerics, buildAvailableCategories } from './autoItemizeMergeUtils.js';
import type { LineWithInclude } from '../components/autoItemize/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeLine(overrides: Partial<LineWithInclude> = {}): LineWithInclude {
  return {
    rowId: `row-${Math.random().toString(36).slice(2, 8)}`,
    description: 'Line item',
    totalAmount: 100,
    confidence: 0.9,
    included: true,
    ...overrides,
  };
}

describe('aggregateMergedLineNumerics()', () => {
  // ─── Scenario 1: all includesVat: true ─────────────────────────────────────

  it('sums totalAmount correctly when all lines have includesVat: true', () => {
    const lines = [
      makeLine({ totalAmount: 100, includesVat: true }),
      makeLine({ totalAmount: 50, includesVat: true }),
      makeLine({ totalAmount: 25, includesVat: true }),
    ];

    const result = aggregateMergedLineNumerics(lines);

    expect(result.totalAmount).toBe(175);
    expect(result.includesVat).toBe(true);
  });

  it('output includesVat is always true regardless of source lines', () => {
    const lines = [makeLine({ includesVat: false }), makeLine({ includesVat: false })];
    const result = aggregateMergedLineNumerics(lines);
    expect(result.includesVat).toBe(true);
  });

  // ─── Scenario 2: mixed includesVat true/false/undefined ───────────────────

  it('grosses up each net line (includesVat: false) via effectiveLineAmount before summing', () => {
    // Line A: gross already (includesVat: true) -> 100
    // Line B: net (includesVat: false) -> 100 * 1.19 = 119
    // Line C: includesVat undefined -> treated as gross (per effectiveLineAmount) -> 100
    const lines = [
      makeLine({ totalAmount: 100, includesVat: true }),
      makeLine({ totalAmount: 100, includesVat: false }),
      makeLine({ totalAmount: 100, includesVat: undefined }),
    ];

    const result = aggregateMergedLineNumerics(lines);

    // Manual fixture: 100 + 119 + 100 = 319
    expect(result.totalAmount).toBe(319);
  });

  it('rounds the grossed-up net amount to 2 decimal places before summing', () => {
    // 33.33 * 1.19 = 39.6627 -> rounds to 39.66
    const lines = [makeLine({ totalAmount: 33.33, includesVat: false })];
    const result = aggregateMergedLineNumerics(lines);
    expect(result.totalAmount).toBe(39.66);
  });

  it('rounds the final summed total to 2 decimal places (classic 0.1+0.2 float-drift case)', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE754 double-precision float without rounding.
    const lines = [
      makeLine({ totalAmount: 0.1, includesVat: true }),
      makeLine({ totalAmount: 0.2, includesVat: true }),
    ];
    const result = aggregateMergedLineNumerics(lines);
    expect(result.totalAmount).toBe(0.3);
  });

  // ─── Scenario 3: shared quantity + identical unit (case/whitespace variation) ─

  it('sums quantity and uses the first unit when all lines share the same unit (case/whitespace-insensitive)', () => {
    const lines = [
      makeLine({ quantity: 5, unit: 'Stk' }),
      makeLine({ quantity: 3, unit: ' stk ' }),
      makeLine({ quantity: 2, unit: 'STK' }),
    ];

    const result = aggregateMergedLineNumerics(lines);

    expect(result.quantity).toBe(10);
    expect(result.unit).toBe('Stk'); // unit taken from first line, verbatim
  });

  // ─── Scenario 4: units differ ──────────────────────────────────────────────

  it('leaves quantity and unit undefined when units differ across lines', () => {
    const lines = [makeLine({ quantity: 5, unit: 'kg' }), makeLine({ quantity: 3, unit: 'Stk' })];

    const result = aggregateMergedLineNumerics(lines);

    expect(result.quantity).toBeUndefined();
    expect(result.unit).toBeUndefined();
  });

  // ─── Scenario 5: one line missing quantity ─────────────────────────────────

  it('leaves quantity and unit undefined when one line is missing quantity, even if units match', () => {
    const lines = [
      makeLine({ quantity: 5, unit: 'Stk' }),
      makeLine({ quantity: undefined, unit: 'Stk' }),
    ];

    const result = aggregateMergedLineNumerics(lines);

    expect(result.quantity).toBeUndefined();
    expect(result.unit).toBeUndefined();
  });

  it('leaves quantity and unit undefined when one line is missing unit, even if quantities are present', () => {
    const lines = [
      makeLine({ quantity: 5, unit: 'Stk' }),
      makeLine({ quantity: 3, unit: undefined }),
    ];

    const result = aggregateMergedLineNumerics(lines);

    expect(result.quantity).toBeUndefined();
    expect(result.unit).toBeUndefined();
  });

  // ─── Scenario 6: unitPrice always undefined ────────────────────────────────

  it('never includes a unitPrice field in the aggregated result', () => {
    const lines = [
      makeLine({ unitPrice: 10, quantity: 5, unit: 'Stk' }),
      makeLine({ unitPrice: 20, quantity: 3, unit: 'Stk' }),
    ];

    const result = aggregateMergedLineNumerics(lines);

    expect('unitPrice' in result).toBe(false);
  });

  // ─── Scenario 7: confidence = min ──────────────────────────────────────────

  it('sets confidence to the minimum confidence across all source lines', () => {
    const lines = [
      makeLine({ confidence: 0.9 }),
      makeLine({ confidence: 0.5 }),
      makeLine({ confidence: 0.95 }),
    ];

    const result = aggregateMergedLineNumerics(lines);

    expect(result.confidence).toBe(0.5);
  });

  it('confidence = min works with exactly 2 lines', () => {
    const lines = [makeLine({ confidence: 0.3 }), makeLine({ confidence: 0.8 })];
    const result = aggregateMergedLineNumerics(lines);
    expect(result.confidence).toBe(0.3);
  });

  // ─── Scenario 8: vendorName agreement ──────────────────────────────────────

  it('keeps vendorName when all lines share the same vendorName (case-insensitive)', () => {
    const lines = [
      makeLine({ vendorName: 'Builder Co' }),
      makeLine({ vendorName: 'BUILDER CO' }),
      makeLine({ vendorName: 'builder co' }),
    ];

    const result = aggregateMergedLineNumerics(lines);

    expect(result.vendorName).toBeDefined();
    expect(result.vendorName?.toLowerCase()).toBe('builder co');
  });

  it('clears vendorName when vendor names differ', () => {
    const lines = [makeLine({ vendorName: 'Builder Co' }), makeLine({ vendorName: 'Other Co' })];
    const result = aggregateMergedLineNumerics(lines);
    expect(result.vendorName).toBeUndefined();
  });

  it('clears vendorName when at least one line is missing vendorName', () => {
    const lines = [makeLine({ vendorName: 'Builder Co' }), makeLine({ vendorName: undefined })];
    const result = aggregateMergedLineNumerics(lines);
    expect(result.vendorName).toBeUndefined();
  });

  it('clears vendorName when all lines are missing vendorName', () => {
    const lines = [makeLine({ vendorName: undefined }), makeLine({ vendorName: undefined })];
    const result = aggregateMergedLineNumerics(lines);
    expect(result.vendorName).toBeUndefined();
  });

  // ─── Scenario 9: budgetSourceId = first line's ─────────────────────────────

  it("uses the first line's budgetSourceId in the aggregated result", () => {
    const lines = [
      makeLine({ budgetSourceId: 'src-1' }),
      makeLine({ budgetSourceId: 'src-2' }),
      makeLine({ budgetSourceId: 'src-3' }),
    ];

    const result = aggregateMergedLineNumerics(lines);

    expect(result.budgetSourceId).toBe('src-1');
  });

  it('budgetSourceId is undefined when the first line has no budgetSourceId', () => {
    const lines = [makeLine({ budgetSourceId: undefined }), makeLine({ budgetSourceId: 'src-2' })];
    const result = aggregateMergedLineNumerics(lines);
    expect(result.budgetSourceId).toBeUndefined();
  });

  it('budgetSourceId is null when the first line explicitly has null', () => {
    const lines = [makeLine({ budgetSourceId: null }), makeLine({ budgetSourceId: 'src-2' })];
    const result = aggregateMergedLineNumerics(lines);
    expect(result.budgetSourceId).toBeNull();
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────────

  it('handles exactly 2 source lines (the minimum for a merge)', () => {
    const lines = [makeLine({ totalAmount: 10 }), makeLine({ totalAmount: 20 })];
    const result = aggregateMergedLineNumerics(lines);
    expect(result.totalAmount).toBe(30);
  });

  it('treats a missing totalAmount as 0 when grossing up', () => {
    const lines = [makeLine({ totalAmount: undefined as unknown as number, includesVat: false })];
    const result = aggregateMergedLineNumerics(lines);
    expect(result.totalAmount).toBe(0);
  });
});

describe('buildAvailableCategories()', () => {
  it('returns distinct extracted categories when present on any line', () => {
    const lines = [
      makeLine({ category: 'Materials' }),
      makeLine({ category: 'Labor' }),
      makeLine({ category: 'Materials' }), // duplicate
    ];

    const result = buildAvailableCategories(lines, ['Project Cat A', 'Project Cat B']);

    expect(result).toEqual(['Materials', 'Labor']);
  });

  it('deduplicates extracted category names', () => {
    const lines = [
      makeLine({ category: 'Tile work' }),
      makeLine({ category: 'Tile work' }),
      makeLine({ category: 'Tile work' }),
    ];

    const result = buildAvailableCategories(lines, []);

    expect(result).toEqual(['Tile work']);
  });

  it('falls back to project category names when no line has an extracted category', () => {
    const lines = [
      makeLine({ category: undefined }),
      makeLine({ category: null as unknown as undefined }),
    ];

    const result = buildAvailableCategories(lines, ['Materials', 'Labor', 'Permits']);

    expect(result).toEqual(['Materials', 'Labor', 'Permits']);
  });

  it('ignores blank/whitespace-only category strings when determining the extracted set', () => {
    const lines = [makeLine({ category: '   ' }), makeLine({ category: '' })];

    const result = buildAvailableCategories(lines, ['Materials']);

    // Whitespace-only categories are filtered out -> falls back to project categories
    expect(result).toEqual(['Materials']);
  });

  it('returns an empty array when neither extracted categories nor project categories exist', () => {
    const lines = [makeLine({ category: undefined })];
    const result = buildAvailableCategories(lines, []);
    expect(result).toEqual([]);
  });

  it('preserves the order categories first appear across lines', () => {
    const lines = [
      makeLine({ category: 'Zeta' }),
      makeLine({ category: 'Alpha' }),
      makeLine({ category: 'Zeta' }),
    ];

    const result = buildAvailableCategories(lines, []);

    expect(result).toEqual(['Zeta', 'Alpha']);
  });
});
