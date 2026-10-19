import { describe, it, expect } from '@jest/globals';
import { SYSTEM_EVENT_NAMES, isSystemEventMetadataV1 } from './systemEvent.js';
import {
  isSystemEventMetadataV1 as fromIndex,
  SYSTEM_EVENT_NAMES as namesFromIndex,
} from '../index.js';

describe('SYSTEM_EVENT_NAMES', () => {
  it('lists the four v1 events in order', () => {
    expect([...SYSTEM_EVENT_NAMES]).toEqual([
      'status_changed',
      'milestone_delayed',
      'invoice_created',
      'legacy',
    ]);
  });

  it('is exported from the package index', () => {
    expect(namesFromIndex).toBe(SYSTEM_EVENT_NAMES);
    expect(fromIndex).toBe(isSystemEventMetadataV1);
  });
});

describe('isSystemEventMetadataV1', () => {
  it.each([
    [
      'status_changed',
      { v: 1, event: 'status_changed', from: 'pending', to: 'paid', subjectLabel: 'INV-T-001' },
    ],
    [
      'status_changed without from',
      { v: 1, event: 'status_changed', from: null, to: 'approved', subjectLabel: 'Grant A' },
    ],
    [
      'milestone_delayed',
      {
        v: 1,
        event: 'milestone_delayed',
        targetDate: '2026-03-01',
        projectedDate: '2026-03-14',
        delayDays: 13,
        subjectLabel: 'Milestone A',
      },
    ],
    [
      'invoice_created',
      {
        v: 1,
        event: 'invoice_created',
        subjectLabel: null,
        vendorId: null,
        vendorName: 'Company A',
      },
    ],
    ['legacy', { v: 1, event: 'legacy' }],
    ['legacy with a deposit id', { v: 1, event: 'legacy', depositId: 'dep-1' }],
  ])('accepts %s', (_label, value) => {
    expect(isSystemEventMetadataV1(value)).toBe(true);
  });

  it.each([
    ['the first-release { changeSummary } shape', { changeSummary: 'Status changed' }],
    [
      'the first-release shape with values',
      { changeSummary: 'x', previousValue: 'a', newValue: 'b' },
    ],
    ['null', null],
    ['undefined', undefined],
    ['an array', [{ v: 1, event: 'legacy' }]],
    ['a string', '{"v":1,"event":"legacy"}'],
    ['a number', 1],
    ['v: 2', { v: 2, event: 'status_changed' }],
    ['v as a string', { v: '1', event: 'legacy' }],
    ['a missing v', { event: 'legacy' }],
    ['an unknown event', { v: 1, event: 'budget_breach' }],
    ['a missing event', { v: 1 }],
    ['a non-string event', { v: 1, event: 7 }],
    ['an inherited event name', { v: 1, event: 'constructor' }],
  ])('rejects %s', (_label, value) => {
    expect(isSystemEventMetadataV1(value)).toBe(false);
  });
});
