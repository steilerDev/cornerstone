import { describe, it, expect } from '@jest/globals';
import { makeRow } from '../../test/attentionFixtures.js';
import { ATTENTION_KIND_WORDS, attentionKindOf } from './kinds.js';

describe('attentionKindOf', () => {
  it.each([['N1'], ['N2'], ['H4']] as const)('%s is a task row with no kind word', (rule) => {
    expect(attentionKindOf(makeRow(rule))).toBeNull();
  });

  it.each([
    ['N3', 'milestone'],
    ['N8', 'fundingSource'],
    ['N9', 'offer'],
    ['N10', 'purchase'],
    ['N11', 'grant'],
    ['N12', 'defect'],
    ['H1', 'unfinishedLog'],
  ] as const)('%s maps to %s', (rule, kind) => {
    expect(attentionKindOf(makeRow(rule))).toBe(kind);
  });

  it.each([['N4'], ['N5'], ['N6']] as const)('%s: invoice, offer and progress payment', (rule) => {
    expect(attentionKindOf(makeRow(rule))).toBe('invoice');
    expect(attentionKindOf(makeRow(rule, { params: { recordKind: 'offer' } }))).toBe('offer');
    expect(attentionKindOf(makeRow(rule, { params: { paymentKind: 'progress' } }))).toBe(
      'progressPayment',
    );
    // An offer wins over a progress payment.
    expect(
      attentionKindOf(makeRow(rule, { params: { recordKind: 'offer', paymentKind: 'progress' } })),
    ).toBe('offer');
  });

  it('H2: invoice or offer', () => {
    expect(attentionKindOf(makeRow('H2'))).toBe('invoice');
    expect(attentionKindOf(makeRow('H2', { params: { recordKind: 'offer' } }))).toBe('offer');
  });

  it('every returned kind is a member of ATTENTION_KIND_WORDS', () => {
    const rules = ['N3', 'N4', 'N8', 'N9', 'N10', 'N11', 'N12', 'H1', 'H2'] as const;
    for (const rule of rules) {
      expect(ATTENTION_KIND_WORDS).toContain(attentionKindOf(makeRow(rule)));
    }
  });
});
