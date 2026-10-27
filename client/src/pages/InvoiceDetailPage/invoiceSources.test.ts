import { describe, it, expect } from '@jest/globals';
import type { BudgetSource, InvoiceBudgetLineDetailResponse } from '@cornerstone/shared';
import { invoiceSources } from './invoiceSources.js';

const line = (budgetSourceId: string | null, itemizedAmount: number) =>
  ({ budgetSourceId, itemizedAmount }) as InvoiceBudgetLineDetailResponse;
const source = (id: string, name: string) => ({ id, name }) as BudgetSource;

describe('invoiceSources', () => {
  const known = [source('s1', 'Loan Alpha'), source('s2', 'Savings Beta'), source('s3', 'Credit')];

  it('returns no source for no lines', () => {
    expect(invoiceSources([], known)).toEqual([]);
  });

  it('skips lines without a funding source', () => {
    expect(invoiceSources([line(null, 500), line('s1', 100)], known)).toEqual([
      { id: 's1', name: 'Loan Alpha', itemized: 100 },
    ]);
  });

  it('sums the itemized amounts per source and puts the largest first', () => {
    const result = invoiceSources([line('s1', 100), line('s2', 300), line('s1', 150)], known);
    expect(result.map((s) => [s.id, s.itemized])).toEqual([
      ['s2', 300],
      ['s1', 250],
    ]);
  });

  it('keeps the order of first appearance on a tie', () => {
    const result = invoiceSources([line('s3', 100), line('s1', 100), line('s2', 100)], known);
    expect(result.map((s) => s.id)).toEqual(['s3', 's1', 's2']);
  });

  it('leaves out a source that is not in the fetched list (yet)', () => {
    expect(invoiceSources([line('ghost', 900), line('s1', 10)], known)).toEqual([
      { id: 's1', name: 'Loan Alpha', itemized: 10 },
    ]);
    expect(invoiceSources([line('s1', 10)], [])).toEqual([]);
  });
});
