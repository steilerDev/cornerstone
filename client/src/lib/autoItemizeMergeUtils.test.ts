/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { aggregateMergedLineNumerics, buildAvailableCategories } from './autoItemizeMergeUtils.js';

describe('aggregateMergedLineNumerics()', () => {
  it('sums the gross amounts and rounds the total to cents (0.1 + 0.2)', () => {
    const result = aggregateMergedLineNumerics([
      { grossAmount: 0.1, certainty: 0.9 },
      { grossAmount: 0.2, certainty: 0.9 },
    ]);
    expect(result.totalAmount).toBe(0.3);
  });

  it('uses the lowest certainty of the rows', () => {
    const result = aggregateMergedLineNumerics([
      { grossAmount: 10, certainty: 0.9 },
      { grossAmount: 10, certainty: 0.4 },
      { grossAmount: 10, certainty: 0.7 },
    ]);
    expect(result.certainty).toBe(0.4);
  });

  it('keeps the company name when every row names the same one (case-insensitive)', () => {
    const result = aggregateMergedLineNumerics([
      { grossAmount: 10, certainty: 1, vendorName: ' Acme Tools ' },
      { grossAmount: 10, certainty: 1, vendorName: 'acme tools' },
    ]);
    expect(result.vendorName).toBe('Acme Tools');
  });

  it('drops the company name when the rows name different companies', () => {
    const result = aggregateMergedLineNumerics([
      { grossAmount: 10, certainty: 1, vendorName: 'Acme Tools' },
      { grossAmount: 10, certainty: 1, vendorName: 'Other Co' },
    ]);
    expect(result.vendorName).toBeUndefined();
  });

  it('drops the company name when one row has none', () => {
    const result = aggregateMergedLineNumerics([
      { grossAmount: 10, certainty: 1, vendorName: 'Acme Tools' },
      { grossAmount: 10, certainty: 1, vendorName: null },
    ]);
    expect(result.vendorName).toBeUndefined();
  });

  it('takes the funding source of the first row', () => {
    const result = aggregateMergedLineNumerics([
      { grossAmount: 10, certainty: 1, budgetSourceId: 'src-a' },
      { grossAmount: 10, certainty: 1, budgetSourceId: 'src-b' },
    ]);
    expect(result.budgetSourceId).toBe('src-a');
  });

  it('returns a zero total and no source or company for an empty list', () => {
    const result = aggregateMergedLineNumerics([]);
    expect(result.totalAmount).toBe(0);
    expect(result.budgetSourceId).toBeUndefined();
    expect(result.vendorName).toBeUndefined();
  });
});

describe('buildAvailableCategories()', () => {
  it('returns the distinct extracted category words in first-seen order', () => {
    expect(buildAvailableCategories(['Wood', 'Paint', 'Wood'], ['Materials'])).toEqual([
      'Wood',
      'Paint',
    ]);
  });

  it('ignores null, undefined and blank words', () => {
    expect(buildAvailableCategories([null, undefined, '  ', 'Paint'], ['Materials'])).toEqual([
      'Paint',
    ]);
  });

  it('falls back to the project category names when nothing was extracted', () => {
    expect(buildAvailableCategories([null, ''], ['Materials', 'Labor'])).toEqual([
      'Materials',
      'Labor',
    ]);
  });

  it('returns an empty list when there are no words at all', () => {
    expect(buildAvailableCategories([], [])).toEqual([]);
  });
});
