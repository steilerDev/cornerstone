/**
 * fundingSourcePrimary (#2242, D2): the one header primary per source type and status.
 *
 * Mutations: a loan leading with a status move; a savings source without Log once no forward
 * move is left; a type missing from the table.
 */
import { describe, it, expect } from '@jest/globals';
import { BUDGET_SOURCE_TYPES } from '@cornerstone/shared';
import { FUNDING_SOURCE_PRIMARY_KIND, fundingSourcePrimary } from './fundingSourceHeaderActions.js';

describe('fundingSourcePrimary', () => {
  it.each(['bank_loan', 'credit_line'] as const)(
    '%s always leads with Prepare bank report, even with a forward move',
    (type) => {
      expect(fundingSourcePrimary(type, null)).toEqual({ kind: 'bankReport' });
      expect(fundingSourcePrimary(type, 'closed')).toEqual({ kind: 'bankReport' });
    },
  );

  it.each(['savings', 'other', 'discretionary'] as const)(
    '%s leads with the forward status move, then with Log',
    (type) => {
      expect(fundingSourcePrimary(type, 'exhausted')).toEqual({ kind: 'status', to: 'exhausted' });
      expect(fundingSourcePrimary(type, null)).toEqual({ kind: 'log' });
    },
  );

  it('classifies every source type', () => {
    for (const type of BUDGET_SOURCE_TYPES) {
      expect(['bankReport', 'status']).toContain(FUNDING_SOURCE_PRIMARY_KIND[type]);
    }
  });
});
