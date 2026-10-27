/**
 * grantPrimary (#2242, D2): the next forward status move, Log once there is none.
 * Mutations: Log shown while a forward move exists; the move target dropped.
 */
import { describe, it, expect } from '@jest/globals';
import {
  GRANT_TRANSITIONS,
  SUBSIDY_APPLICATION_STATUSES,
  transitionsFrom,
} from '@cornerstone/shared';
import type { SubsidyApplicationStatus } from '@cornerstone/shared';
import { grantPrimary } from './grantHeaderActions.js';

describe('grantPrimary', () => {
  it.each(['applied', 'approved', 'received', 'rejected'] as const)(
    'leads with the forward move to %s',
    (to) => {
      expect(grantPrimary(to)).toEqual({ kind: 'status', to });
    },
  );

  it('leads with Log when there is no forward move', () => {
    expect(grantPrimary(null)).toEqual({ kind: 'log' });
  });

  it.each([
    ['eligible', 'applied'],
    ['applied', 'approved'],
    ['approved', 'received'],
    ['received', null],
    ['rejected', null],
  ] as [SubsidyApplicationStatus, SubsidyApplicationStatus | null][])(
    'the table of statuses: %s leads with %s',
    (status, expected) => {
      const forward =
        transitionsFrom(GRANT_TRANSITIONS, status).find((t) => t.direction === 'forward')?.to ??
        null;
      expect(grantPrimary(forward)).toEqual(
        expected === null ? { kind: 'log' } : { kind: 'status', to: expected },
      );
    },
  );

  it('covers every status of the table', () => {
    for (const status of SUBSIDY_APPLICATION_STATUSES) {
      expect(() => transitionsFrom(GRANT_TRANSITIONS, status)).not.toThrow();
    }
  });
});
