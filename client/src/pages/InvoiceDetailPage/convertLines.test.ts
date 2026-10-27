/**
 * @jest-environment node
 *
 * Pure per-line state of the Convert page (#2240). Money in major units, cents for sums.
 *
 * Mutations these tests catch:
 *  - keying lines by `row.id` (the task budget id) instead of `invoiceBudgetLineId` (D4);
 *  - the proposal overwriting an edited or kept line, or running for a final amount <= 0;
 *  - `lineUpdates` sending kept lines or lines whose amount did not change;
 *  - `remainderState` comparing in major units (a 1-cent over amount must be 'over').
 */
import { describe, it, expect } from '@jest/globals';
import { makeLinkedRow } from '../../test/costLineFixtures.js';
import {
  applyProposal,
  effectiveCents,
  initialLines,
  invalidLineKeys,
  lineKey,
  lineUpdates,
  proposedTotalCents,
  remainderState,
  type ConvertLines,
  type ConvertLineState,
} from './convertLines.js';

const line = (over: Partial<ConvertLineState> = {}): ConvertLineState => ({
  offered: 100,
  proposed: '100.00',
  edited: false,
  keep: false,
  ...over,
});

const rows = [
  makeLinkedRow({ id: 'wb-1', invoiceBudgetLineId: 'ibl-1', gross: 6000 }),
  makeLinkedRow({ id: 'wb-2', invoiceBudgetLineId: 'ibl-2', gross: 3000 }),
];

describe('lineKey', () => {
  it('is the invoice budget line id, never the task budget id (D4)', () => {
    expect(lineKey(rows[0]!)).toBe('ibl-1');
    expect(lineKey(rows[0]!)).not.toBe('wb-1');
  });
});

describe('initialLines', () => {
  it('seeds every line at its offered amount when the final amount equals the offer', () => {
    const lines = initialLines(rows, 9000, '9000.00');
    expect([...lines.keys()]).toEqual(['ibl-1', 'ibl-2']);
    expect(lines.get('ibl-1')).toEqual({
      offered: 6000,
      proposed: '6000.00',
      edited: false,
      keep: false,
    });
  });

  it('proposes pro rata for a final amount above the offer (10,000 -> 10,500)', () => {
    const lines = initialLines(rows, 10000, '10500.00');
    expect(lines.get('ibl-1')!.proposed).toBe('6300.00');
    expect(lines.get('ibl-2')!.proposed).toBe('3150.00');
    expect(lines.get('ibl-1')!.offered).toBe(6000);
  });

  it('gives the rounding cent to the largest line so the lines sum to the final amount', () => {
    const three = [
      makeLinkedRow({ id: 'a', invoiceBudgetLineId: 'ibl-a', gross: 10 }),
      makeLinkedRow({ id: 'b', invoiceBudgetLineId: 'ibl-b', gross: 10 }),
      makeLinkedRow({ id: 'c', invoiceBudgetLineId: 'ibl-c', gross: 11 }),
    ];
    const lines = initialLines(three, 31, '1.00');
    expect(lines.get('ibl-a')!.proposed).toBe('0.32');
    expect(lines.get('ibl-b')!.proposed).toBe('0.32');
    expect(lines.get('ibl-c')!.proposed).toBe('0.36');
    expect(proposedTotalCents(lines)).toBe(100);
  });

  it('seeds nothing for an offer without lines', () => {
    expect(initialLines([], 1000, '1000').size).toBe(0);
  });
});

describe('applyProposal', () => {
  const base: ConvertLines = new Map([
    ['k1', line({ offered: 6000, proposed: '6000.00' })],
    ['k2', line({ offered: 3000, proposed: '3000.00' })],
  ]);

  it('leaves edited lines untouched', () => {
    const lines = new Map(base).set('k1', line({ offered: 6000, proposed: '1.00', edited: true }));
    const next = applyProposal(lines, 9000, '18000');
    expect(next.get('k1')!.proposed).toBe('1.00');
    expect(next.get('k2')!.proposed).toBe('6000.00');
  });

  it('leaves kept lines untouched', () => {
    const lines = new Map(base).set('k1', line({ offered: 6000, proposed: '6000.00', keep: true }));
    const next = applyProposal(lines, 9000, '18000');
    expect(next.get('k1')!.proposed).toBe('6000.00');
    expect(next.get('k2')!.proposed).toBe('6000.00');
  });

  it.each([['0'], ['-5'], ['abc'], ['']])('is a no-op for the final amount %j', (input) => {
    expect(applyProposal(base, 9000, input)).toBe(base);
  });
});

describe('effectiveCents / invalidLineKeys / proposedTotalCents', () => {
  it('a kept line counts as its offered amount, a typed one as what was typed', () => {
    expect(effectiveCents(line({ offered: 12.34, proposed: '99', keep: true }))).toBe(1234);
    expect(effectiveCents(line({ offered: 12.34, proposed: '99.5' }))).toBe(9950);
  });

  it('an unparsable proposal counts as 0', () => {
    expect(effectiveCents(line({ proposed: 'x' }))).toBe(0);
  });

  it('flags unparsable, zero and negative proposals but never a kept line', () => {
    const lines: ConvertLines = new Map([
      ['bad', line({ proposed: 'x' })],
      ['zero', line({ proposed: '0' })],
      ['neg', line({ proposed: '-1' })],
      ['kept', line({ proposed: '0', keep: true })],
      ['ok', line({ proposed: '0.01' })],
    ]);
    expect([...invalidLineKeys(lines)].sort()).toEqual(['bad', 'neg', 'zero']);
  });

  it('sums all lines, or only the given keys', () => {
    const lines: ConvertLines = new Map([
      ['a', line({ proposed: '10.10' })],
      ['b', line({ proposed: '20.20' })],
    ]);
    expect(proposedTotalCents(lines)).toBe(3030);
    expect(proposedTotalCents(lines, ['b'])).toBe(2020);
    expect(proposedTotalCents(lines, [])).toBe(0);
  });
});

describe('remainderState', () => {
  it.each([
    [0, 'none'],
    [1, 'notYetSplit'],
    [-1, 'over'],
    [100000, 'notYetSplit'],
  ] as const)('%d cents is %s', (cents, state) => {
    expect(remainderState(cents)).toBe(state);
  });
});

describe('lineUpdates', () => {
  it('addresses lines by their invoice budget line id and sends only changed amounts', () => {
    const lines = initialLines(rows, 10000, '10500.00');
    expect(lineUpdates(lines)).toEqual([
      { id: 'ibl-1', itemizedAmount: 6300 },
      { id: 'ibl-2', itemizedAmount: 3150 },
    ]);
  });

  it('drops kept lines and lines whose amount equals the offered one', () => {
    const lines: ConvertLines = new Map([
      ['kept', line({ offered: 50, proposed: '70', keep: true })],
      ['same', line({ offered: 50, proposed: '50.00' })],
      ['changed', line({ offered: 50, proposed: '60.5' })],
    ]);
    expect(lineUpdates(lines)).toEqual([{ id: 'changed', itemizedAmount: 60.5 }]);
  });

  it('is empty when nothing changed', () => {
    expect(lineUpdates(initialLines(rows, 9000, '9000'))).toEqual([]);
  });
});
