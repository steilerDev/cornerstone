import { describe, it, expect } from '@jest/globals';
import type { BudgetSource } from '@cornerstone/shared';
import { resolveReportPreset, isReportCandidate } from './reportPreset.js';

function source(id: string, o: Partial<BudgetSource> = {}): BudgetSource {
  return { id, sourceType: 'bank_loan', status: 'active', ...o } as BudgetSource;
}

describe('isReportCandidate', () => {
  it.each([
    ['bank_loan', 'active', true],
    ['credit_line', 'active', true],
    ['bank_loan', 'exhausted', true],
    ['bank_loan', 'closed', false],
    ['credit_line', 'closed', false],
    ['savings', 'active', false],
    ['other', 'active', false],
  ])('%s / %s -> %s', (sourceType, status, expected) => {
    expect(isReportCandidate(source('x', { sourceType, status } as Partial<BudgetSource>))).toBe(
      expected,
    );
  });
});

describe('resolveReportPreset (truth table)', () => {
  const one = [
    source('loan-1'),
    source('save', { sourceType: 'savings' } as Partial<BudgetSource>),
  ];

  it.each([[null], ['nonsense'], [''], ['Claim']])('type %p is no preset', (type) => {
    expect(resolveReportPreset(type, 'loan-1', one)).toBeNull();
  });

  it.each(['budget-overview', 'claim', 'proof-of-funds'] as const)(
    'valid type %s with a known source lands on that source',
    (type) => {
      expect(resolveReportPreset(type, 'loan-1', one)).toEqual({
        type,
        sourceId: 'loan-1',
        sourceMissing: false,
      });
    },
  );

  it('a known source need not be a candidate (savings is accepted when named)', () => {
    expect(resolveReportPreset('claim', 'save', one)).toEqual({
      type: 'claim',
      sourceId: 'save',
      sourceMissing: false,
    });
  });

  it('valid type with an unknown source id flags the source as missing', () => {
    expect(resolveReportPreset('claim', 'gone', one)).toEqual({
      type: 'claim',
      sourceId: null,
      sourceMissing: true,
    });
  });

  it('type only with exactly one candidate preselects it', () => {
    expect(resolveReportPreset('claim', null, one)).toEqual({
      type: 'claim',
      sourceId: 'loan-1',
      sourceMissing: false,
    });
  });

  it('type only with no candidate leaves the source open', () => {
    expect(
      resolveReportPreset('claim', null, [
        source('s', { sourceType: 'savings' } as Partial<BudgetSource>),
      ]),
    ).toEqual({
      type: 'claim',
      sourceId: null,
      sourceMissing: false,
    });
    expect(resolveReportPreset('claim', null, [])).toMatchObject({ sourceId: null });
  });

  it('type only with two candidates leaves the source open', () => {
    const two = [source('a'), source('b', { sourceType: 'credit_line' } as Partial<BudgetSource>)];
    expect(resolveReportPreset('claim', null, two)).toMatchObject({ sourceId: null });
  });

  it('a closed loan does not count as a candidate', () => {
    const list = [source('a'), source('b', { status: 'closed' } as Partial<BudgetSource>)];
    expect(resolveReportPreset('proof-of-funds', null, list)).toMatchObject({ sourceId: 'a' });
  });
});
