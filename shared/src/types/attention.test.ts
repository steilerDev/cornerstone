/**
 * Attention types (#2229): tuples, constants, the row-key pattern and its helpers, and the
 * served-route guarantee of `ATTENTION_LINK_ROUTES`.
 *
 * Mutations these tests catch:
 *  - adding H3 / N7 / a photo subject type back into a tuple;
 *  - loosening the key pattern (allowing `S1:`, `/`, spaces, 65-char ids, unknown types);
 *  - a link route that is still `planned` in the route map (routeUrl would throw on the client).
 */

import { describe, it, expect } from '@jest/globals';
import {
  ATTENTION_ACTIONS,
  ATTENTION_LINK_ROUTES,
  ATTENTION_NEEDS_RULES,
  ATTENTION_NOT_NOW_DAYS,
  ATTENTION_ROW_KEY_PATTERN,
  ATTENTION_RULES,
  ATTENTION_SEVERITIES,
  ATTENTION_SNOOZE_MAX_BYTES,
  ATTENTION_SNOOZE_MAX_KEYS,
  ATTENTION_SNOOZED_PREFERENCE_KEY,
  ATTENTION_STANDING_RULES,
  ATTENTION_SUBJECT_TYPES,
  ATTENTION_TIDY_RULES,
  ATTENTION_TIERS,
  CRITICAL_LINE_LEVELS,
  attentionRowKey,
  isAttentionRowKey,
} from './attention.js';
import { isRouteServed } from '../routes/index.js';

describe('attention tuples', () => {
  it('lists the needs-attention rules without N7', () => {
    expect([...ATTENTION_NEEDS_RULES]).toEqual([
      'N1',
      'N2',
      'N3',
      'N4',
      'N5',
      'N6',
      'N8',
      'N9',
      'N10',
      'N11',
      'N12',
    ]);
    expect((ATTENTION_NEEDS_RULES as readonly string[]).includes('N7')).toBe(false);
  });

  it('lists the tidy-up rules without H3', () => {
    expect([...ATTENTION_TIDY_RULES]).toEqual(['H1', 'H2', 'H4']);
    expect((ATTENTION_TIDY_RULES as readonly string[]).includes('H3')).toBe(false);
  });

  it('ATTENTION_RULES is needs rules followed by tidy rules (the rule order)', () => {
    expect([...ATTENTION_RULES]).toEqual([...ATTENTION_NEEDS_RULES, ...ATTENTION_TIDY_RULES]);
  });

  it('S1 is the only standing rule and is not a snoozable rule', () => {
    expect([...ATTENTION_STANDING_RULES]).toEqual(['S1']);
    expect((ATTENTION_RULES as readonly string[]).includes('S1')).toBe(false);
  });

  it('has the documented tiers, severities, actions and critical levels', () => {
    expect([...ATTENTION_TIERS]).toEqual(['late', 'overdue', 'due', 'ready', 'follow_up', 'tidy']);
    expect([...ATTENTION_SEVERITIES]).toEqual(['red', 'amber', 'none']);
    expect([...ATTENTION_ACTIONS]).toEqual([
      'mark_done',
      'start',
      'reschedule',
      'change_target',
      'open',
      'mark_paid',
      'prepare_bank_report',
      'convert',
      'mark_delivered',
      'continue',
      'discard',
      'split',
    ]);
    expect([...CRITICAL_LINE_LEVELS]).toEqual(['on_track', 'warning', 'critical', 'overdue']);
  });

  it('has no photo subject type (photos never produce a row)', () => {
    expect([...ATTENTION_SUBJECT_TYPES]).toEqual([
      'work_item',
      'milestone',
      'invoice',
      'progress_payment',
      'household_item',
      'budget_source',
      'subsidy_program',
      'diary_entry',
      'group',
    ]);
    expect(ATTENTION_SUBJECT_TYPES.some((t) => t.includes('photo'))).toBe(false);
  });

  it('pins the Not-now constants', () => {
    expect(ATTENTION_NOT_NOW_DAYS).toBe(7);
    expect(ATTENTION_SNOOZE_MAX_KEYS).toBe(500);
    expect(ATTENTION_SNOOZE_MAX_BYTES).toBe(16 * 1024);
    expect(ATTENTION_SNOOZED_PREFERENCE_KEY).toBe('attention.snoozed');
  });
});

describe('row key pattern', () => {
  it.each([
    'N1:work_item:wi-1',
    'N2:work_item:wi-7',
    'N2:group:2026-03-02',
    'N3:milestone:12',
    'N4:invoice:inv-1',
    'N4:progress_payment:dep-1',
    'N5:invoice:inv-2',
    'N6:invoice:inv-5',
    'N8:budget_source:src-loan',
    'N9:invoice:off-1',
    'N10:household_item:hi-1',
    'N11:subsidy_program:gr-1',
    'N12:diary_entry:d.1_x',
    'H1:diary_entry:d-1',
    'H2:invoice:inv-9',
    'H4:work_item:wi-6',
  ])('accepts %s', (key) => {
    expect(isAttentionRowKey(key)).toBe(true);
    expect(new RegExp(ATTENTION_ROW_KEY_PATTERN).test(key)).toBe(true);
  });

  it.each([
    ['H3 does not exist', 'H3:diary_entry:d-1'],
    ['N7 does not exist', 'N7:invoice:inv-1'],
    ['N13 is unknown', 'N13:invoice:inv-1'],
    ['N0 is unknown', 'N0:invoice:inv-1'],
    ['S1 is standing, not snoozable', 'S1:budget_source:src-1'],
    ['unknown subject type', 'N1:photo:p-1'],
    ['unknown subject type (typo)', 'N1:workitem:wi-1'],
    ['empty id', 'N1:work_item:'],
    ['missing id part', 'N1:work_item'],
    ['slash in id', 'N1:work_item:a/b'],
    ['space in id', 'N1:work_item:a b'],
    ['colon in id', 'N1:work_item:a:b'],
    ['leading text', 'xN1:work_item:wi-1'],
    ['trailing text', 'N1:work_item:wi-1 '],
    ['lowercase rule', 'n1:work_item:wi-1'],
    ['empty string', ''],
  ])('rejects: %s', (_label, key) => {
    expect(isAttentionRowKey(key)).toBe(false);
  });

  it('accepts a 64-character id and rejects a 65-character id', () => {
    expect(isAttentionRowKey(`N1:work_item:${'a'.repeat(64)}`)).toBe(true);
    expect(isAttentionRowKey(`N1:work_item:${'a'.repeat(65)}`)).toBe(false);
  });

  it('attentionRowKey builds a key that isAttentionRowKey accepts (round trip)', () => {
    for (const rule of ATTENTION_RULES) {
      const key = attentionRowKey(rule, 'work_item', 'x-1');
      expect(key).toBe(`${rule}:work_item:x-1`);
      expect(isAttentionRowKey(key)).toBe(true);
    }
  });
});

describe('ATTENTION_LINK_ROUTES', () => {
  it('lists the ten route ids a row may link to', () => {
    expect([...ATTENTION_LINK_ROUTES]).toEqual([
      'workItem',
      'workItems',
      'milestone',
      'invoice',
      'householdItem',
      'diaryEntry',
      'diaryEntryEdit',
      'bankReport',
      'budgetSubsidies',
      'budgetSources',
    ]);
  });

  it.each([...ATTENTION_LINK_ROUTES])('%s is served by the route map', (id) => {
    expect(isRouteServed(id)).toBe(true);
  });
});
