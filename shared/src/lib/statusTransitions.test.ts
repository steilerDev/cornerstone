/**
 * Unit tests for shared/src/lib/statusTransitions.ts (#2209) and the undo / delete-impact
 * constant tuples (types-only files are exempt from parity, their tuples are asserted here).
 */

import { describe, it, expect } from '@jest/globals';
import {
  INVOICE_STATUS_ACTIONS,
  INVOICE_TRANSITIONS,
  MILESTONE_COMPLETION_STATES,
  MILESTONE_STATUS_ACTIONS,
  MILESTONE_TRANSITIONS,
  DEFECT_STATUS_ACTIONS,
  DEFECT_TRANSITIONS,
  FUNDING_SOURCE_STATUS_ACTIONS,
  FUNDING_SOURCE_TRANSITIONS,
  GRANT_STATUS_ACTIONS,
  GRANT_TRANSITIONS,
  PROGRESS_PAYMENT_STATUS_ACTIONS,
  PROGRESS_PAYMENT_TRANSITIONS,
  PURCHASE_STATUS_ACTIONS,
  PURCHASE_TRANSITIONS,
  TASK_STATUS_ACTIONS,
  TASK_TRANSITIONS,
  allowedTargets,
  transitionsFrom,
} from './statusTransitions.js';
import {
  DELETE_IMPACT_ENTITY_TYPES,
  DELETE_IMPACT_KINDS,
  UNDO_SUBJECT_TYPES,
  UNDO_WINDOW_MS,
} from '../index.js';

type AnyMap = Parameters<typeof allowedTargets>[0];

function targetsOf(map: AnyMap, from: string): string[] {
  return allowedTargets(map, from as never);
}

describe('action and state tuples', () => {
  it('lists the action ids of every vocabulary', () => {
    expect(TASK_STATUS_ACTIONS).toEqual(['start', 'markDone']);
    expect(PURCHASE_STATUS_ACTIONS).toEqual([
      'markOrdered',
      'markDeliveryScheduled',
      'markDelivered',
    ]);
    expect(MILESTONE_COMPLETION_STATES).toEqual(['not_reached', 'reached']);
    expect(MILESTONE_STATUS_ACTIONS).toEqual(['markReached']);
    expect(INVOICE_STATUS_ACTIONS).toEqual(['markPaid']);
    expect(PROGRESS_PAYMENT_STATUS_ACTIONS).toEqual(['markPaid', 'markSubmitted']);
    expect(GRANT_STATUS_ACTIONS).toEqual([
      'markApplied',
      'markApproved',
      'markReceived',
      'markRejected',
    ]);
    expect(FUNDING_SOURCE_STATUS_ACTIONS).toEqual(['markUsedUp', 'markClosed']);
    expect(DEFECT_STATUS_ACTIONS).toEqual(['markBeingFixed', 'markFixed']);
  });
});

describe('undo and delete-impact constants', () => {
  it('uses a 30 second undo window', () => {
    expect(UNDO_WINDOW_MS).toBe(30_000);
  });

  it('lists the undoable subject types', () => {
    expect([...UNDO_SUBJECT_TYPES]).toEqual([
      'work_item',
      'household_item',
      'milestone',
      'invoice',
      'invoice_deposit',
      'subsidy_program',
      'diary_entry',
      'budget_source',
    ]);
    expect(UNDO_SUBJECT_TYPES).toHaveLength(8);
  });

  it('lists the delete-impact entity types (the route whitelist)', () => {
    expect([...DELETE_IMPACT_ENTITY_TYPES]).toEqual([
      'area',
      'orientation',
      'vendor',
      'invoice',
      'subsidy_program',
      'budget_source',
      'milestone',
      'work_item',
      'household_item',
      'diary_entry',
    ]);
  });

  it('lists every delete-impact kind exactly once', () => {
    expect(new Set(DELETE_IMPACT_KINDS).size).toBe(DELETE_IMPACT_KINDS.length);
    expect(DELETE_IMPACT_KINDS).toHaveLength(24);
  });
});

describe.each<[string, AnyMap, [string, string[]][]]>([
  [
    'TASK_TRANSITIONS',
    TASK_TRANSITIONS,
    [
      ['not_started', ['in_progress', 'completed']],
      ['in_progress', ['completed', 'not_started']],
      ['completed', ['in_progress']],
    ],
  ],
  [
    'PURCHASE_TRANSITIONS',
    PURCHASE_TRANSITIONS,
    [
      ['planned', ['purchased', 'scheduled', 'arrived']],
      ['purchased', ['scheduled', 'arrived', 'planned']],
      ['scheduled', ['arrived', 'purchased']],
      ['arrived', ['scheduled']],
    ],
  ],
  [
    'MILESTONE_TRANSITIONS',
    MILESTONE_TRANSITIONS,
    [
      ['not_reached', ['reached']],
      ['reached', ['not_reached']],
    ],
  ],
  [
    'INVOICE_TRANSITIONS',
    INVOICE_TRANSITIONS,
    [
      ['pending', ['paid']],
      ['paid', ['pending']],
      ['claimed', []],
      ['quotation', []],
    ],
  ],
  [
    'PROGRESS_PAYMENT_TRANSITIONS',
    PROGRESS_PAYMENT_TRANSITIONS,
    [
      ['pending', ['paid', 'claimed']],
      ['paid', ['claimed', 'pending']],
      ['claimed', ['paid']],
    ],
  ],
  [
    'GRANT_TRANSITIONS',
    GRANT_TRANSITIONS,
    [
      ['eligible', ['applied']],
      ['applied', ['approved', 'rejected', 'eligible']],
      ['approved', ['received', 'applied']],
      ['received', ['approved']],
      ['rejected', ['applied']],
    ],
  ],
  [
    'FUNDING_SOURCE_TRANSITIONS',
    FUNDING_SOURCE_TRANSITIONS,
    [
      ['active', ['exhausted', 'closed']],
      ['exhausted', ['closed', 'active']],
      ['closed', ['active']],
    ],
  ],
  [
    'DEFECT_TRANSITIONS',
    DEFECT_TRANSITIONS,
    [
      ['open', ['in_progress', 'resolved']],
      ['in_progress', ['resolved', 'open']],
      ['resolved', ['in_progress']],
    ],
  ],
])('%s', (_name, map, rows) => {
  it.each(rows)('from %s lists the targets in map order', (from, expected) => {
    expect(targetsOf(map, from)).toEqual(expected);
  });

  it('covers exactly the statuses of the table', () => {
    expect(Object.keys(map).sort()).toEqual(rows.map(([from]) => from).sort());
  });

  it('puts forward entries first, allows one backward step, and never targets itself', () => {
    for (const [from, list] of Object.entries(map)) {
      const entries = list as { to: string; direction: string; action?: string }[];
      const directions = entries.map((t) => t.direction);
      const firstBackward = directions.indexOf('backward');
      if (firstBackward !== -1) {
        expect(directions.slice(firstBackward).every((d) => d === 'backward')).toBe(true);
      }
      expect(directions.filter((d) => d === 'backward').length).toBeLessThanOrEqual(1);
      for (const t of entries) {
        if (t.direction === 'forward') expect(typeof t.action).toBe('string');
        else expect(t.action).toBeUndefined();
        expect(t.to).not.toBe(from);
      }
    }
  });
});

describe('transitionsFrom', () => {
  it('returns the transition objects with action ids and directions', () => {
    expect(transitionsFrom(TASK_TRANSITIONS, 'not_started')).toEqual([
      { to: 'in_progress', direction: 'forward', action: 'start' },
      { to: 'completed', direction: 'forward', action: 'markDone' },
    ]);
    expect(transitionsFrom(TASK_TRANSITIONS, 'completed')).toEqual([
      { to: 'in_progress', direction: 'backward' },
    ]);
  });

  it('returns an empty list for a status the map does not know', () => {
    expect(transitionsFrom(TASK_TRANSITIONS, 'bogus' as never)).toEqual([]);
    expect(allowedTargets(INVOICE_TRANSITIONS, 'bogus' as never)).toEqual([]);
  });
});

describe('progress payment map vs the legacy deposit rule', () => {
  it('equals the pre-#2209 ALLOWED_TRANSITIONS values (value and order)', () => {
    expect(allowedTargets(PROGRESS_PAYMENT_TRANSITIONS, 'pending')).toEqual(['paid', 'claimed']);
    expect(allowedTargets(PROGRESS_PAYMENT_TRANSITIONS, 'paid')).toEqual(['claimed', 'pending']);
    expect(allowedTargets(PROGRESS_PAYMENT_TRANSITIONS, 'claimed')).toEqual(['paid']);
  });
});
