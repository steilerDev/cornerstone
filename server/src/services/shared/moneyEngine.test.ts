/**
 * Unit tests of the pure money engine (ADR-039, #2228). No database: every input is a synthetic
 * `MoneyInput`, every figure is asserted in integer cents (the engine's unit) unless a test goes
 * through `toMoneyRange` / `toMajor`.
 *
 * Each block names the mutation it catches, e.g. "reverting the offer face-value rule" or "a
 * symmetric Tight verdict".
 */

import { describe, it, expect } from '@jest/globals';
import {
  computeMoney,
  computePayments,
  itemKey,
  largestRemainderSplit,
  toMajor,
  toMoneyRange,
  toOfferTotals,
  toRecordTotals,
  zeroScen,
  SCENARIOS,
  type MoneyAreaInput,
  type MoneyGrantInput,
  type MoneyInput,
  type MoneyInvoiceInput,
  type MoneyLineInput,
  type MoneyResult,
  type Scen,
} from './moneyEngine.js';
import type { InvoiceDepositRow } from './depositAggregateUtils.js';

// ─── Builders ────────────────────────────────────────────────────────────────

const VAT = 0.19;

function line(id: string, over: Partial<MoneyLineInput> = {}): MoneyLineInput {
  return {
    id,
    kind: 'work_item',
    itemId: 'wi-1',
    budgetSourceId: null,
    budgetCategoryId: null,
    confidence: 'invoice',
    plannedAmount: 1000,
    includesVat: true,
    itemizedCents: null,
    ...over,
  };
}

function grant(id: string, over: Partial<MoneyGrantInput> = {}): MoneyGrantInput {
  return {
    id,
    name: `Grant ${id}`,
    status: 'approved',
    reductionType: 'percentage',
    reductionValue: 10,
    maximumAmount: null,
    includesNoCategoryItems: false,
    categoryIds: [],
    linkedItemKeys: ['work_item:wi-1'],
    ...over,
  };
}

function invoice(id: string, over: Partial<MoneyInvoiceInput> = {}): MoneyInvoiceInput {
  return { id, amount: 100, status: 'pending', itemizedCents: 0, ...over };
}

function input(over: Partial<MoneyInput> = {}): MoneyInput {
  return {
    vatRate: VAT,
    lines: [],
    items: [],
    invoices: [],
    grants: [],
    areas: [],
    fundingTotalCents: 0,
    activeSourceCount: 1,
    ...over,
  };
}

function cents(c: Scen): [number, number, number] {
  return [c.expected, c.best, c.worst];
}

function sumScen(list: Scen[]): Scen {
  const out = zeroScen();
  for (const s of list) {
    out.expected += s.expected;
    out.best += s.best;
    out.worst += s.worst;
  }
  return out;
}

function lineCostOf(result: MoneyResult, id: string): [number, number, number] {
  return cents(result.lineCost.get(id)!);
}

// ─── Small helpers ───────────────────────────────────────────────────────────

describe('toMajor / toMoneyRange / itemKey / zeroScen', () => {
  it('converts cents to major units and never returns negative zero', () => {
    expect(toMajor(12345)).toBe(123.45);
    expect(toMajor(-1)).toBe(-0.01);
    expect(Object.is(toMajor(0), 0)).toBe(true);
    expect(Object.is(toMajor(-0), 0)).toBe(true);
  });

  it('maps all three scenarios to major units', () => {
    expect(toMoneyRange({ expected: 150, best: 100, worst: -250 })).toEqual({
      expected: 1.5,
      best: 1,
      worst: -2.5,
    });
  });

  it('builds the kind:id item key and an all-zero scenario triple', () => {
    expect(itemKey('work_item', 'a')).toBe('work_item:a');
    expect(itemKey('household_item', 'b')).toBe('household_item:b');
    expect(zeroScen()).toEqual({ expected: 0, best: 0, worst: 0 });
    expect(SCENARIOS).toEqual(['expected', 'best', 'worst']);
  });
});

// ─── 1. Line cost ────────────────────────────────────────────────────────────

describe('line cost (formula 1)', () => {
  it('grosses up a net line (includesVat false) with the VAT rate, rounded to cents', () => {
    const result = computeMoney(
      input({ lines: [line('l1', { plannedAmount: 1000, includesVat: false })] }),
    );
    expect(lineCostOf(result, 'l1')).toEqual([119000, 119000, 119000]);

    const odd = computeMoney(
      input({ lines: [line('l2', { plannedAmount: 33.33, includesVat: false })] }),
    );
    // 33.33 * 1.19 = 39.6627 -> 39.66
    expect(lineCostOf(odd, 'l2')[0]).toBe(3966);
  });

  it('uses a gross line as stored', () => {
    const result = computeMoney(input({ lines: [line('l1', { plannedAmount: 1190 })] }));
    expect(lineCostOf(result, 'l1')).toEqual([119000, 119000, 119000]);
  });

  it.each([
    ['own_estimate', 800000, 1200000],
    ['professional_estimate', 900000, 1100000],
    ['quote', 950000, 1050000],
    ['invoice', 1000000, 1000000],
  ])('applies the %s margin to an unlinked line (best/worst)', (confidence, best, worst) => {
    const result = computeMoney(
      input({ lines: [line('l1', { plannedAmount: 10000, confidence })] }),
    );
    expect(lineCostOf(result, 'l1')).toEqual([1000000, best, worst]);
  });

  it('falls back to the own_estimate margin for an unknown confidence', () => {
    const result = computeMoney(
      input({ lines: [line('l1', { plannedAmount: 10000, confidence: 'mystery' })] }),
    );
    expect(lineCostOf(result, 'l1')).toEqual([1000000, 800000, 1200000]);
  });

  it('rounds the margins to whole cents (Math.round, not floor)', () => {
    // 0.07 gross * 0.8 = 5.6 cents -> 6; * 1.2 = 8.4 -> 8
    const result = computeMoney(
      input({ lines: [line('l1', { plannedAmount: 0.07, confidence: 'own_estimate' })] }),
    );
    expect(lineCostOf(result, 'l1')).toEqual([7, 6, 8]);
  });

  it('charges a linked line its itemized amount at face value in all scenarios (offer-linked quote line has no margin)', () => {
    const result = computeMoney(
      input({
        lines: [line('l1', { plannedAmount: 20000, confidence: 'quote', itemizedCents: 2380000 })],
      }),
    );
    expect(lineCostOf(result, 'l1')).toEqual([2380000, 2380000, 2380000]);
  });

  it('charges a linked line with itemized 0 nothing, not its planned amount', () => {
    const result = computeMoney(
      input({
        lines: [line('l1', { plannedAmount: 5000, confidence: 'own_estimate', itemizedCents: 0 })],
      }),
    );
    expect(lineCostOf(result, 'l1')).toEqual([0, 0, 0]);
  });
});

// ─── 2./3. Not yet split and expected cost ───────────────────────────────────

describe('not yet split (formula 2) and expected cost (formula 3)', () => {
  it('counts a remainder of exactly one currency unit', () => {
    const result = computeMoney(
      input({ invoices: [invoice('i1', { amount: 101, itemizedCents: 10000 })] }),
    );
    expect(result.notYetSplit).toEqual({ amountCents: 100, recordCount: 1 });
  });

  it('does not count a remainder below one currency unit (0.99)', () => {
    const result = computeMoney(
      input({ invoices: [invoice('i1', { amount: 100.99, itemizedCents: 10000 })] }),
    );
    expect(result.notYetSplit).toEqual({ amountCents: 0, recordCount: 0 });
  });

  it('does not count an over-itemized (negative) remainder', () => {
    const result = computeMoney(
      input({ invoices: [invoice('i1', { amount: 50, itemizedCents: 6000 })] }),
    );
    expect(result.notYetSplit).toEqual({ amountCents: 0, recordCount: 0 });
  });

  it('counts records of all four statuses, including quotations, and an invoice with no lines in full', () => {
    const result = computeMoney(
      input({
        invoices: ['quotation', 'pending', 'paid', 'claimed'].map((status, i) =>
          invoice(`i${i}`, { amount: 10, status, itemizedCents: 0 }),
        ),
      }),
    );
    expect(result.notYetSplit).toEqual({ amountCents: 4000, recordCount: 4 });
  });

  // #2229: per-invoice remainders feeding the H2 "Tidy up" rows.
  // Mutations: a threshold of 99/101 cents, storing negative remainders, Σ drifting from notYetSplit.
  describe('notYetSplitByInvoice (#2229)', () => {
    it('holds the remainder in cents for each record at or above one currency unit', () => {
      const result = computeMoney(
        input({
          invoices: [
            invoice('i1', { amount: 101, itemizedCents: 10000 }),
            invoice('i2', { amount: 500, itemizedCents: 0, status: 'quotation' }),
          ],
        }),
      );
      expect([...result.notYetSplitByInvoice]).toEqual([
        ['i1', 100],
        ['i2', 50000],
      ]);
    });

    it('leaves out a remainder of 0.99, an exactly split record and an over-itemized record', () => {
      const result = computeMoney(
        input({
          invoices: [
            invoice('i1', { amount: 100.99, itemizedCents: 10000 }),
            invoice('i2', { amount: 100, itemizedCents: 10000 }),
            invoice('i3', { amount: 50, itemizedCents: 6000 }),
          ],
        }),
      );
      expect(result.notYetSplitByInvoice.size).toBe(0);
    });

    it('sums to notYetSplit.amountCents and counts notYetSplit.recordCount', () => {
      const result = computeMoney(
        input({
          invoices: [
            invoice('i1', { amount: 123.45, itemizedCents: 1000 }),
            invoice('i2', { amount: 10, itemizedCents: 0 }),
            invoice('i3', { amount: 0.5, itemizedCents: 0 }),
            invoice('i4', { amount: 80, itemizedCents: 8000 }),
          ],
        }),
      );
      const values = [...result.notYetSplitByInvoice.values()];
      expect(values.reduce((a, b) => a + b, 0)).toBe(result.notYetSplit.amountCents);
      expect(values).toHaveLength(result.notYetSplit.recordCount);
    });

    it('is empty without records', () => {
      expect(computeMoney(input()).notYetSplitByInvoice.size).toBe(0);
    });
  });

  it('adds the same not-yet-split amount to expected cost in every scenario', () => {
    const result = computeMoney(
      input({
        lines: [line('l1', { plannedAmount: 1000, confidence: 'own_estimate' })],
        invoices: [invoice('i1', { amount: 26, itemizedCents: 0 })],
      }),
    );
    expect(cents(result.expectedCost)).toEqual([102600, 82600, 122600]);
    expect(result.expectedCost.expected - result.afterGrants.expected).toBe(0);
  });

  it('sums line costs and not-yet-split over several lines without float noise', () => {
    const result = computeMoney(
      input({
        lines: [
          line('a', { plannedAmount: 0.1 }),
          line('b', { plannedAmount: 0.2 }),
          line('c', { plannedAmount: 0.3 }),
        ],
      }),
    );
    expect(result.expectedCost.expected).toBe(60);
    expect(toMajor(result.expectedCost.expected)).toBe(0.6);
  });
});

// ─── 4. Grants ───────────────────────────────────────────────────────────────

describe('grants (formula 4)', () => {
  const ownEstimateLine = line('l1', { plannedAmount: 1000, confidence: 'own_estimate' });

  it('computes an uncapped percentage grant per scenario (recomputed on the scenario cost)', () => {
    const result = computeMoney(input({ lines: [ownEstimateLine], grants: [grant('g1')] }));
    const g = result.grants[0]!;
    expect(cents(g.eligibleCost)).toEqual([100000, 80000, 120000]);
    expect(cents(g.uncapped)).toEqual([10000, 8000, 12000]);
    expect(cents(g.payout)).toEqual([10000, 8000, 12000]);
    expect(g.capped).toBe(false);
    // a lower cost gives a lower percentage grant: best < expected < worst on an unlinked line
    expect(g.payout.best).toBeLessThan(g.payout.expected);
    expect(g.payout.expected).toBeLessThan(g.payout.worst);
  });

  it('applies the eligible-costs cap before the rate when the cap is below the eligible cost', () => {
    const result = computeMoney(
      input({
        lines: [ownEstimateLine],
        grants: [grant('g1', { maximumAmount: 500 })],
      }),
    );
    const g = result.grants[0]!;
    // payout = min(eligible, 500.00) * 10% = 50.00 in every scenario
    expect(cents(g.payout)).toEqual([5000, 5000, 5000]);
    expect(cents(g.uncapped)).toEqual([10000, 8000, 12000]);
    expect(g.capped).toBe(true);
  });

  it('ignores a cap above the eligible cost (not capped)', () => {
    const result = computeMoney(
      input({
        lines: [ownEstimateLine],
        grants: [grant('g1', { maximumAmount: 5000 })],
      }),
    );
    const g = result.grants[0]!;
    expect(cents(g.payout)).toEqual([10000, 8000, 12000]);
    expect(g.capped).toBe(false);
  });

  it('flags capped only when the cap binds in the worst scenario', () => {
    // cap 1100.00: expected 1000 < cap, worst 1200 > cap
    const result = computeMoney(
      input({
        lines: [ownEstimateLine],
        grants: [grant('g1', { maximumAmount: 1100 })],
      }),
    );
    const g = result.grants[0]!;
    expect(cents(g.payout)).toEqual([10000, 8000, 11000]);
    expect(g.capped).toBe(true);
  });

  describe('category filter', () => {
    const lines = [
      line('a', { budgetCategoryId: 'c1', plannedAmount: 1000 }),
      line('b', { budgetCategoryId: 'c2', plannedAmount: 500 }),
      line('c', { budgetCategoryId: null, plannedAmount: 200 }),
    ];

    it('without categories every line of the linked items is eligible', () => {
      const result = computeMoney(input({ lines, grants: [grant('g1')] }));
      expect(result.grants[0]!.eligibleCost.expected).toBe(170000);
      expect(result.grants[0]!.payout.expected).toBe(17000);
    });

    it('with categories only the matching lines are eligible (uncategorised excluded)', () => {
      const result = computeMoney(input({ lines, grants: [grant('g1', { categoryIds: ['c1'] })] }));
      expect(result.grants[0]!.eligibleCost.expected).toBe(100000);
      expect(result.grants[0]!.payout.expected).toBe(10000);
      expect([...result.grants[0]!.lineShares.keys()]).toEqual(['a']);
    });

    it('includesNoCategoryItems adds the uncategorised lines', () => {
      const result = computeMoney(
        input({
          lines,
          grants: [grant('g1', { categoryIds: ['c1'], includesNoCategoryItems: true })],
        }),
      );
      expect(result.grants[0]!.eligibleCost.expected).toBe(120000);
      expect(result.grants[0]!.payout.expected).toBe(12000);
    });

    it('a line of another item is never eligible', () => {
      const result = computeMoney(
        input({
          lines: [...lines, line('other', { itemId: 'wi-2', plannedAmount: 9999 })],
          grants: [grant('g1')],
        }),
      );
      expect(result.grants[0]!.eligibleCost.expected).toBe(170000);
    });
  });

  it('a grant with no linked items pays 0 (a category filter alone gives nothing)', () => {
    const result = computeMoney(
      input({
        lines: [line('a', { budgetCategoryId: 'c2', plannedAmount: 4000 })],
        grants: [grant('g1', { linkedItemKeys: [], categoryIds: ['c2'], reductionValue: 50 })],
      }),
    );
    const g = result.grants[0]!;
    expect(g.eligibleItemCount).toBe(0);
    expect(cents(g.payout)).toEqual([0, 0, 0]);
    expect(g.counted).toBe(true);
    expect(g.capped).toBe(false);
    expect(g.lineShares.size).toBe(0);
    expect(result.expectedGrants).toEqual({ expected: 0, best: 0, worst: 0 });
  });

  it('never returns a rejected grant and does not count it anywhere', () => {
    const result = computeMoney(
      input({
        lines: [ownEstimateLine],
        grants: [grant('g1', { status: 'rejected' }), grant('g2', { status: 'approved' })],
      }),
    );
    expect(result.grants.map((g) => g.input.id)).toEqual(['g2']);
    expect(result.expectedGrants.expected).toBe(10000);
    expect(result.possibleGrants.expected).toBe(0);
  });

  it.each(['eligible', 'applied'] as const)(
    'computes a %s grant but does not count it (possible grants only)',
    (status) => {
      const result = computeMoney(
        input({ lines: [ownEstimateLine], grants: [grant('g1', { status })] }),
      );
      const g = result.grants[0]!;
      expect(g.counted).toBe(false);
      expect(cents(g.payout)).toEqual([10000, 8000, 12000]);
      expect(cents(result.possibleGrants)).toEqual([10000, 8000, 12000]);
      expect(cents(result.expectedGrants)).toEqual([0, 0, 0]);
      // the shares exist for a possible grant but do not reach line, item or source figures
      expect(g.lineShares.get('l1')!.expected).toBe(10000);
      expect(result.lineGrants.size).toBe(0);
      expect(result.items.get('work_item:wi-1')!.grants).toEqual(zeroScen());
      expect(result.sourceGrants.size).toBe(0);
    },
  );

  it.each(['approved', 'received'] as const)('counts an %s grant', (status) => {
    const result = computeMoney(
      input({ lines: [ownEstimateLine], grants: [grant('g1', { status })] }),
    );
    expect(result.grants[0]!.counted).toBe(true);
    expect(cents(result.expectedGrants)).toEqual([10000, 8000, 12000]);
    expect(cents(result.possibleGrants)).toEqual([0, 0, 0]);
  });

  it('orders grants by name, then id', () => {
    const result = computeMoney(
      input({
        lines: [ownEstimateLine],
        grants: [
          grant('g3', { name: 'Beta' }),
          grant('g2', { name: 'Alpha' }),
          grant('g1', { name: 'Alpha' }),
        ],
      }),
    );
    expect(result.grants.map((g) => g.input.id)).toEqual(['g1', 'g2', 'g3']);
  });

  it('de-duplicates linked item keys', () => {
    const result = computeMoney(
      input({
        lines: [line('a', { plannedAmount: 1000 })],
        grants: [grant('g1', { linkedItemKeys: ['work_item:wi-1', 'work_item:wi-1'] })],
      }),
    );
    expect(result.grants[0]!.eligibleItemCount).toBe(1);
    expect(result.grants[0]!.payout.expected).toBe(10000);
  });

  describe('legacy fixed grants', () => {
    const twoItems = [
      line('a', { itemId: 'wi-1', plannedAmount: 1000, budgetSourceId: 'src-a' }),
      line('b', { itemId: 'wi-2', plannedAmount: 3000, budgetSourceId: 'src-b' }),
    ];
    const fixed = (over: Partial<MoneyGrantInput> = {}) =>
      grant('fx', {
        reductionType: 'fixed',
        reductionValue: 500,
        linkedItemKeys: ['work_item:wi-1', 'work_item:wi-2'],
        ...over,
      });

    it("pays reduction_value per linked item, split equally over each item's eligible lines", () => {
      const result = computeMoney(input({ lines: twoItems, grants: [fixed()] }));
      const g = result.grants[0]!;
      expect(cents(g.uncapped)).toEqual([100000, 100000, 100000]);
      expect(cents(g.payout)).toEqual([100000, 100000, 100000]);
      expect(g.capped).toBe(false);
      expect(g.itemTotals.get('work_item:wi-1')!.expected).toBe(50000);
      expect(g.itemTotals.get('work_item:wi-2')!.expected).toBe(50000);
      // not proportional to cost: wi-2 costs three times wi-1 but gets the same share
      expect(result.items.get('work_item:wi-1')!.grants.expected).toBe(50000);
    });

    it('caps the payout at maximum_amount and flags it', () => {
      const result = computeMoney(
        input({ lines: twoItems, grants: [fixed({ maximumAmount: 700 })] }),
      );
      const g = result.grants[0]!;
      expect(cents(g.uncapped)).toEqual([100000, 100000, 100000]);
      expect(cents(g.payout)).toEqual([70000, 70000, 70000]);
      expect(g.capped).toBe(true);
      expect(g.itemTotals.get('work_item:wi-1')!.expected).toBe(35000);
      expect(g.itemTotals.get('work_item:wi-2')!.expected).toBe(35000);
    });

    it('spreads a capped fixed payout with an odd cent by line id (the smaller line id gets the extra cent)', () => {
      // 'x' sits on wi-2 and 'y' on wi-1: line-id order (x before y) differs from item-key order
      const result = computeMoney(
        input({
          lines: [
            line('y', { itemId: 'wi-1', plannedAmount: 1000 }),
            line('x', { itemId: 'wi-2', plannedAmount: 3000 }),
          ],
          grants: [fixed({ maximumAmount: 700.01 })],
        }),
      );
      const g = result.grants[0]!;
      expect(g.payout.expected).toBe(70001);
      // amounts are 500.00 each (value per item, below each line cost): a tie, decided by line id
      expect(g.lineShares.get('x')!.expected).toBe(35001);
      expect(g.lineShares.get('y')!.expected).toBe(35000);
      expect(g.itemTotals.get('work_item:wi-2')!.expected).toBe(35001);
      expect(g.itemTotals.get('work_item:wi-1')!.expected).toBe(35000);
    });

    it('splits an item share equally over its eligible lines, not in proportion to cost', () => {
      // Rule (legacy fixed grants, shown unchanged): reduction_value per item, split equally over
      // the item's eligible lines, each part capped at that line's cost.
      const result = computeMoney(
        input({
          lines: [
            line('a1', { itemId: 'wi-1', plannedAmount: 100 }),
            line('a2', { itemId: 'wi-1', plannedAmount: 300 }),
          ],
          grants: [fixed({ linkedItemKeys: ['work_item:wi-1'], reductionValue: 40 })],
        }),
      );
      const g = result.grants[0]!;
      expect(g.lineShares.get('a1')!.expected).toBe(2000);
      expect(g.lineShares.get('a2')!.expected).toBe(2000);
    });

    it('caps each line part at that line cost (1,000 fixed on a 50 line pays 50)', () => {
      const result = computeMoney(
        input({
          lines: [line('a', { itemId: 'wi-1', plannedAmount: 50 })],
          grants: [fixed({ linkedItemKeys: ['work_item:wi-1'], reductionValue: 1000 })],
        }),
      );
      const g = result.grants[0]!;
      expect(cents(g.uncapped)).toEqual([5000, 5000, 5000]);
      expect(cents(g.payout)).toEqual([5000, 5000, 5000]);
      expect(g.capped).toBe(false);
      expect(g.lineShares.get('a')!.expected).toBe(5000);
    });

    it('caps the per-line parts first and then the sum at maximum_amount, spreading by largest remainder', () => {
      // 300.00 over two lines = 150.00 each; line b costs only 100.00 -> 100.00 + 150.00 = 250.00;
      // maximum_amount 200.00 -> payout 200.00 spread 100:150 = 80.00 / 120.00
      const result = computeMoney(
        input({
          lines: [
            line('a', { itemId: 'wi-1', plannedAmount: 1000 }),
            line('b', { itemId: 'wi-1', plannedAmount: 100 }),
          ],
          grants: [
            fixed({
              linkedItemKeys: ['work_item:wi-1'],
              reductionValue: 300,
              maximumAmount: 200,
            }),
          ],
        }),
      );
      const g = result.grants[0]!;
      expect(g.uncapped.expected).toBe(25000);
      expect(g.payout.expected).toBe(20000);
      expect(g.capped).toBe(true);
      expect(g.lineShares.get('a')!.expected).toBe(12000);
      expect(g.lineShares.get('b')!.expected).toBe(8000);
      expect(g.itemTotals.get('work_item:wi-1')!.expected).toBe(20000);
    });

    it('splits an item share over 3 lines with a remainder (34 / 33 / 33 cents by line id)', () => {
      const result = computeMoney(
        input({
          lines: [line('z3'), line('z1'), line('z2')],
          grants: [fixed({ linkedItemKeys: ['work_item:wi-1'], reductionValue: 1 })],
        }),
      );
      const shares = ['z1', 'z2', 'z3'].map((id) => result.grants[0]!.lineShares.get(id)!.expected);
      expect(shares).toEqual([34, 33, 33]);
    });

    it('pays an item without an eligible line nothing (no item-only share)', () => {
      const result = computeMoney(
        input({
          lines: [line('a', { itemId: 'wi-1', plannedAmount: 1000, budgetSourceId: 'src-a' })],
          items: [
            { kind: 'work_item', id: 'wi-1', areaId: null },
            { kind: 'work_item', id: 'wi-2', areaId: null },
          ],
          grants: [fixed({ reductionValue: 100 })],
        }),
      );
      const g = result.grants[0]!;
      expect(g.eligibleItemCount).toBe(2);
      expect(g.payout.expected).toBe(10000);
      expect(g.lineShares.get('a')!.expected).toBe(10000);
      expect(g.itemTotals.has('work_item:wi-2')).toBe(false);
      expect(result.items.has('work_item:wi-2')).toBe(false);
      expect(result.sourceGrants.get('src-a')!.expected).toBe(10000);
      expect(result.sourceGrants.has('unassigned')).toBe(false);
      expect(result.byType.work_items.grants.expected).toBe(10000);
    });

    it('pays nothing when the category filter leaves no eligible line', () => {
      const result = computeMoney(
        input({
          lines: [line('a', { budgetCategoryId: 'c9', plannedAmount: 1000 })],
          grants: [
            fixed({ linkedItemKeys: ['work_item:wi-1'], categoryIds: ['c1'], reductionValue: 10 }),
          ],
        }),
      );
      const g = result.grants[0]!;
      expect(g.lineShares.size).toBe(0);
      expect(g.itemTotals.size).toBe(0);
      expect(cents(g.payout)).toEqual([0, 0, 0]);
      expect(g.eligibleCost.expected).toBe(0);
    });

    it('lets the per-line cap depend on the scenario (own_estimate line: 50 expected, 40 best, 60 worst)', () => {
      const result = computeMoney(
        input({
          lines: [line('a', { plannedAmount: 50, confidence: 'own_estimate' })],
          grants: [fixed({ linkedItemKeys: ['work_item:wi-1'], reductionValue: 50 })],
        }),
      );
      const g = result.grants[0]!;
      // min(50, cost): expected 50, best 40, worst 50 (cost 60 exceeds the flat value)
      expect(cents(g.payout)).toEqual([5000, 4000, 5000]);
      expect(cents(g.uncapped)).toEqual([5000, 4000, 5000]);
    });

    it('flags capped by the worst scenario when maximum_amount bites there only', () => {
      const result = computeMoney(
        input({
          lines: [line('a', { plannedAmount: 100, confidence: 'own_estimate' })],
          grants: [
            fixed({
              linkedItemKeys: ['work_item:wi-1'],
              reductionValue: 110,
              maximumAmount: 115,
            }),
          ],
        }),
      );
      const g = result.grants[0]!;
      // line cost 100 / 80 / 120 -> uncapped 100 / 80 / 110, all below 115: not capped
      expect(cents(g.uncapped)).toEqual([10000, 8000, 11000]);
      expect(g.capped).toBe(false);
      const capped = computeMoney(
        input({
          lines: [line('a', { plannedAmount: 100, confidence: 'own_estimate' })],
          grants: [
            fixed({
              linkedItemKeys: ['work_item:wi-1'],
              reductionValue: 110,
              maximumAmount: 105,
            }),
          ],
        }),
      ).grants[0]!;
      // only the worst scenario (110 > 105) is cut
      expect(cents(capped.payout)).toEqual([10000, 8000, 10500]);
      expect(capped.capped).toBe(true);
    });
  });
});

// ─── 4. largestRemainderSplit ────────────────────────────────────────────────

describe('largestRemainderSplit', () => {
  const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

  it('sums to the total exactly and gives leftover cents to the largest remainders', () => {
    // 10 over 1:2:3 -> floors 1,3,5 (=9); remainders 4,2,0 of 6 -> a gets the extra cent
    const split = largestRemainderSplit(10, [
      { key: 'a', weight: 1 },
      { key: 'b', weight: 2 },
      { key: 'c', weight: 3 },
    ]);
    expect(Object.fromEntries(split)).toEqual({ a: 2, b: 3, c: 5 });
    expect(total(split)).toBe(10);
  });

  it('breaks equal remainders by key ascending, regardless of input order', () => {
    const split = largestRemainderSplit(100, [
      { key: 'c', weight: 1 },
      { key: 'a', weight: 1 },
      { key: 'b', weight: 1 },
    ]);
    expect(Object.fromEntries(split)).toEqual({ a: 34, b: 33, c: 33 });
    expect(
      Object.fromEntries(
        largestRemainderSplit(1, [
          { key: 'b', weight: 1 },
          { key: 'a', weight: 1 },
        ]),
      ),
    ).toEqual({ a: 1, b: 0 });
  });

  it('splits equally when every weight is 0', () => {
    const split = largestRemainderSplit(10, [
      { key: 'x', weight: 0 },
      { key: 'y', weight: 0 },
      { key: 'z', weight: 0 },
    ]);
    expect(Object.fromEntries(split)).toEqual({ x: 4, y: 3, z: 3 });
  });

  it('gives a single key everything', () => {
    expect(Object.fromEntries(largestRemainderSplit(777, [{ key: 'only', weight: 5 }]))).toEqual({
      only: 777,
    });
  });

  it('returns all zeros for a zero total and an empty map for no weights', () => {
    expect(
      Object.fromEntries(
        largestRemainderSplit(0, [
          { key: 'a', weight: 3 },
          { key: 'b', weight: 4 },
        ]),
      ),
    ).toEqual({ a: 0, b: 0 });
    expect(largestRemainderSplit(500, []).size).toBe(0);
  });

  it('gives a zero-weight key nothing when another key has weight', () => {
    const split = largestRemainderSplit(9, [
      { key: 'a', weight: 0 },
      { key: 'b', weight: 7 },
    ]);
    expect(Object.fromEntries(split)).toEqual({ a: 0, b: 9 });
  });

  it('stays exact for products beyond 2^53 (BigInt arithmetic)', () => {
    const split = largestRemainderSplit(9_000_000_000_000, [
      { key: 'a', weight: 3_000_000_000_001 },
      { key: 'b', weight: 5_999_999_999_999 },
    ]);
    expect(total(split)).toBe(9_000_000_000_000);
  });
});

// ─── 5. Pro rata ─────────────────────────────────────────────────────────────

describe('pro rata (formula 5)', () => {
  it('splits a payout over eligible lines in proportion to cost, to the cent', () => {
    // 3 lines 100 / 200 / 300 (invoice confidence), 15% -> payout 90.00 -> 15 / 30 / 45
    const result = computeMoney(
      input({
        lines: [
          line('a', { plannedAmount: 100 }),
          line('b', { plannedAmount: 200 }),
          line('c', { plannedAmount: 300 }),
        ],
        grants: [grant('g1', { reductionValue: 15 })],
      }),
    );
    const g = result.grants[0]!;
    expect(['a', 'b', 'c'].map((id) => g.lineShares.get(id)!.expected)).toEqual([1500, 3000, 4500]);
  });

  it('allocates leftover cents by largest remainder so shares add up to the payout', () => {
    // payout 1.00 over three equal lines -> 34 / 33 / 33 (ties by line id)
    const result = computeMoney(
      input({
        lines: [
          line('a', { plannedAmount: 10 }),
          line('b', { plannedAmount: 10 }),
          line('c', { plannedAmount: 10 }),
        ],
        grants: [grant('g1', { reductionValue: 100 / 30 })],
      }),
    );
    const g = result.grants[0]!;
    expect(g.payout.expected).toBe(100);
    expect(['a', 'b', 'c'].map((id) => g.lineShares.get(id)!.expected)).toEqual([34, 33, 33]);
  });

  it('gives a capped grant item shares where best exceeds worst (scenario semantics, not an order)', () => {
    // A: linked, fixed 10,000.00. B: unlinked own_estimate 10,000.00 (best 8,000 / worst 12,000).
    // 100% of eligible cost, cap 10,000.00 -> payout 10,000.00 in every scenario, split pro rata.
    const result = computeMoney(
      input({
        lines: [
          line('A', { itemId: 'wi-1', plannedAmount: 1, itemizedCents: 1_000_000 }),
          line('B', {
            itemId: 'wi-2',
            plannedAmount: 10000,
            confidence: 'own_estimate',
          }),
        ],
        grants: [
          grant('g1', {
            reductionValue: 100,
            maximumAmount: 10000,
            linkedItemKeys: ['work_item:wi-1', 'work_item:wi-2'],
          }),
        ],
      }),
    );
    expect(cents(result.grants[0]!.payout)).toEqual([1_000_000, 1_000_000, 1_000_000]);
    const wi1 = result.items.get('work_item:wi-1')!.grants;
    expect(cents(wi1)).toEqual([500_000, 555_556, 454_545]);
    expect(wi1.best).toBeGreaterThan(wi1.worst);
    const wi2 = result.items.get('work_item:wi-2')!.grants;
    expect(wi1.best + wi2.best).toBe(1_000_000);
    expect(wi1.worst + wi2.worst).toBe(1_000_000);
  });

  it('item, area, type and source sums add up to expectedGrants', () => {
    const result = computeMoney(
      input({
        lines: [
          line('a', {
            itemId: 'wi-1',
            plannedAmount: 777.77,
            confidence: 'own_estimate',
            budgetSourceId: 's1',
          }),
          line('b', {
            itemId: 'hi-1',
            kind: 'household_item',
            plannedAmount: 333.33,
            confidence: 'quote',
            budgetSourceId: 's2',
          }),
          line('c', { itemId: 'wi-2', plannedAmount: 55.55, confidence: 'professional_estimate' }),
        ],
        items: [
          { kind: 'work_item', id: 'wi-1', areaId: 'ar-1' },
          { kind: 'household_item', id: 'hi-1', areaId: 'ar-2' },
          { kind: 'work_item', id: 'wi-2', areaId: null },
        ],
        areas: [
          { id: 'ar-1', parentId: null, sortOrder: 0, name: 'One' },
          { id: 'ar-2', parentId: null, sortOrder: 1, name: 'Two' },
        ],
        grants: [
          grant('g1', {
            reductionValue: 17.5,
            linkedItemKeys: ['work_item:wi-1', 'household_item:hi-1', 'work_item:wi-2'],
          }),
        ],
      }),
    );
    for (const s of SCENARIOS) {
      const items = sumScen([...result.items.values()].map((i) => i.grants));
      expect(items[s]).toBe(result.expectedGrants[s]);
      expect(result.byType.work_items.grants[s] + result.byType.household_items.grants[s]).toBe(
        result.expectedGrants[s],
      );
      const areas = sumScen(result.byArea.map((a) => a.grants));
      expect(areas[s]).toBe(result.expectedGrants[s]);
      expect(sumScen([...result.sourceGrants.values()])[s]).toBe(result.expectedGrants[s]);
      expect(result.afterGrants[s]).toBe(result.expectedCost[s] - result.expectedGrants[s]);
    }
  });
});

// ─── 7. Verdict and left to spend ────────────────────────────────────────────

describe('left to spend and the strict verdict (formula 7)', () => {
  const costLine = (planned: number, confidence = 'invoice') =>
    line('l1', { plannedAmount: planned, confidence });

  it('is null without an active funding source', () => {
    const result = computeMoney(
      input({ lines: [costLine(1000)], fundingTotalCents: 500000, activeSourceCount: 0 }),
    );
    expect(result.verdict).toBeNull();
    expect(result.leftToSpend.expected).toBe(400000);
  });

  it('is null when the expected cost is 0', () => {
    const result = computeMoney(input({ fundingTotalCents: 500000, activeSourceCount: 2 }));
    expect(result.verdict).toBeNull();
    expect(result.leftToSpend.expected).toBe(500000);
  });

  it('is on_budget when left to spend is exactly 0 (a "<= 0" rule would flag it)', () => {
    const result = computeMoney(input({ lines: [costLine(1000)], fundingTotalCents: 100000 }));
    expect(result.leftToSpend.expected).toBe(0);
    expect(result.verdict).toBe('on_budget');
  });

  it('is over_budget at -0.01', () => {
    const result = computeMoney(input({ lines: [costLine(1000)], fundingTotalCents: 99999 }));
    expect(result.leftToSpend.expected).toBe(-1);
    expect(result.verdict).toBe('over_budget');
  });

  it('is on_budget when expected >= 0 even though the worst scenario is negative (no Tight)', () => {
    const result = computeMoney(
      input({ lines: [costLine(1000, 'own_estimate')], fundingTotalCents: 110000 }),
    );
    expect(cents(result.leftToSpend)).toEqual([10000, 30000, -10000]);
    expect(result.verdict).toBe('on_budget');
  });

  it('is over_budget when expected < 0 even though the best scenario is positive', () => {
    const result = computeMoney(
      input({ lines: [costLine(1000, 'own_estimate')], fundingTotalCents: 90000 }),
    );
    expect(cents(result.leftToSpend)).toEqual([-10000, 10000, -30000]);
    expect(result.verdict).toBe('over_budget');
  });

  it('adds counted grants and ignores possible ones', () => {
    const result = computeMoney(
      input({
        lines: [costLine(1000)],
        fundingTotalCents: 80000,
        grants: [
          grant('g1', { reductionValue: 20 }),
          grant('g2', { status: 'applied', reductionValue: 50 }),
        ],
      }),
    );
    // 800 + 200 (approved 20%) - 1000
    expect(result.leftToSpend.expected).toBe(0);
    expect(result.verdict).toBe('on_budget');
  });

  describe('generated table of synthetic inputs', () => {
    function rng(seed: number): () => number {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
      };
    }

    function randomInput(seed: number): MoneyInput {
      const r = rng(seed);
      const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)]!;
      const confidences = ['own_estimate', 'professional_estimate', 'quote', 'invoice', 'weird'];
      const itemIds = ['i1', 'i2', 'i3', 'i4'];
      const lineCount = 1 + Math.floor(r() * 7);
      const lines: MoneyLineInput[] = Array.from({ length: lineCount }, (_, n) => {
        const orphan = r() < 0.15;
        const household = r() < 0.4;
        return line(`l${n}`, {
          kind: household ? 'household_item' : 'work_item',
          itemId: orphan && !household ? null : pick(itemIds),
          budgetSourceId: pick([null, 's1', 's2']),
          budgetCategoryId: pick([null, 'c1', 'c2']),
          confidence: pick(confidences),
          plannedAmount: Math.round(r() * 2_000_000) / 100,
          includesVat: r() < 0.5,
          itemizedCents: r() < 0.3 ? Math.floor(r() * 100_000) : null,
        });
      });
      const items = itemIds.flatMap((id) => [
        { kind: 'work_item' as const, id, areaId: pick([null, 'ar-r1', 'ar-c1', 'ar-r2']) },
        { kind: 'household_item' as const, id, areaId: pick([null, 'ar-r1', 'ar-c1', 'ar-r2']) },
      ]);
      const grantCount = Math.floor(r() * 4);
      const grants: MoneyGrantInput[] = Array.from({ length: grantCount }, (_, n) => {
        const fixed = r() < 0.25;
        return grant(`g${n}`, {
          status: pick(['eligible', 'applied', 'approved', 'received', 'rejected'] as const),
          reductionType: fixed ? 'fixed' : 'percentage',
          reductionValue: fixed ? Math.round(r() * 100000) / 100 : Math.round(r() * 10000) / 100,
          maximumAmount: r() < 0.5 ? Math.round(r() * 1_000_000) / 100 : null,
          categoryIds: r() < 0.4 ? [pick(['c1', 'c2'])] : [],
          includesNoCategoryItems: r() < 0.5,
          linkedItemKeys: itemIds
            .flatMap((id) => [`work_item:${id}`, `household_item:${id}`])
            .filter(() => r() < 0.4),
        });
      });
      const invoices: MoneyInvoiceInput[] = Array.from({ length: Math.floor(r() * 4) }, (_, n) =>
        invoice(`inv${n}`, {
          amount: Math.round(r() * 500_000) / 100,
          status: pick(['quotation', 'pending', 'paid', 'claimed']),
          itemizedCents: Math.floor(r() * 30_000),
        }),
      );
      const areas: MoneyAreaInput[] = [
        { id: 'ar-r1', parentId: null, sortOrder: 0, name: 'R1' },
        { id: 'ar-c1', parentId: 'ar-r1', sortOrder: 0, name: 'C1' },
        { id: 'ar-r2', parentId: null, sortOrder: 1, name: 'R2' },
      ];
      return input({
        lines,
        items,
        grants,
        invoices,
        areas,
        fundingTotalCents: Math.floor(r() * 5_000_000),
        activeSourceCount: pick([0, 1, 2, 3]),
      });
    }

    const seeds = Array.from({ length: 50 }, (_, n) => n + 1);

    it.each(seeds)(
      'seed %i: verdict never "tight", never contradicts the sign; best >= expected >= worst',
      (seed) => {
        const data = randomInput(seed);
        const result = computeMoney(data);
        expect(result.verdict).not.toBe('tight');
        if (data.activeSourceCount === 0 || result.expectedCost.expected === 0) {
          expect(result.verdict).toBeNull();
        } else if (result.leftToSpend.expected < 0) {
          expect(result.verdict).toBe('over_budget');
        } else {
          expect(result.verdict).toBe('on_budget');
        }
        expect(result.leftToSpend.best).toBeGreaterThanOrEqual(result.leftToSpend.expected);
        expect(result.leftToSpend.expected).toBeGreaterThanOrEqual(result.leftToSpend.worst);
      },
    );

    it.each(seeds)('seed %i: every split adds up to the cent', (seed) => {
      const data = randomInput(seed);
      const result = computeMoney(data);
      for (const g of result.grants) {
        expect(g.input.status).not.toBe('rejected');
        for (const s of SCENARIOS) {
          const perItem = sumScen([...g.itemTotals.values()]);
          expect(perItem[s]).toBe(g.payout[s]);
          const perLine = sumScen([...g.lineShares.values()]);
          expect(perLine[s]).toBeLessThanOrEqual(g.payout[s]);
        }
      }
      for (const s of SCENARIOS) {
        const counted = result.grants.filter((g) => g.counted);
        expect(result.expectedGrants[s]).toBe(sumScen(counted.map((g) => g.payout))[s]);
        expect(sumScen([...result.items.values()].map((i) => i.grants))[s]).toBe(
          result.expectedGrants[s],
        );
        expect(sumScen([...result.sourceGrants.values()])[s]).toBe(result.expectedGrants[s]);
        // by type + not yet split = expected cost; by area (roots + null) = by type
        const typeCost = result.byType.work_items.cost[s] + result.byType.household_items.cost[s];
        expect(typeCost + result.notYetSplit.amountCents).toBe(result.expectedCost[s]);
        const rootsAndNull = result.byArea.filter(
          (a) => a.areaId === null || a.areaId.startsWith('ar-r'),
        );
        expect(sumScen(rootsAndNull.map((a) => a.cost))[s]).toBe(typeCost);
        expect(sumScen(rootsAndNull.map((a) => a.grants))[s]).toBe(result.expectedGrants[s]);
        expect(result.afterGrants[s]).toBe(result.expectedCost[s] - result.expectedGrants[s]);
      }
    });
  });
});

// ─── 11. includeLine ─────────────────────────────────────────────────────────

describe('includeLine filter (formula 11)', () => {
  const data = input({
    lines: [
      line('l1', { plannedAmount: 80, budgetSourceId: 'src-a' }),
      line('l2', { plannedAmount: 80, budgetSourceId: 'src-b' }),
    ],
    invoices: [invoice('i1', { amount: 30, itemizedCents: 0 })],
    grants: [grant('g1', { reductionValue: 50, maximumAmount: 100 })],
  });

  it('keeps every line without a filter', () => {
    const result = computeMoney(data);
    expect(result.lines).toHaveLength(2);
    // eligible 160 capped at 100 -> 50% = 50.00
    expect(result.grants[0]!.payout.expected).toBe(5000);
    expect(result.grants[0]!.capped).toBe(true);
  });

  it('removes excluded lines from cost and grants and re-applies the cap on the rest', () => {
    const result = computeMoney(data, { includeLine: (l) => l.budgetSourceId !== 'src-b' });
    expect(result.lines.map((l) => l.id)).toEqual(['l1']);
    expect(result.lineCost.has('l2')).toBe(false);
    // eligible 80 < cap 100 -> 50% = 40.00, no longer capped
    expect(result.grants[0]!.eligibleCost.expected).toBe(8000);
    expect(result.grants[0]!.payout.expected).toBe(4000);
    expect(result.grants[0]!.capped).toBe(false);
    expect(result.sourceGrants.get('src-a')!.expected).toBe(4000);
    expect(result.sourceGrants.has('src-b')).toBe(false);
  });

  it('does not touch the not-yet-split remainder', () => {
    const filtered = computeMoney(data, { includeLine: () => false });
    expect(filtered.lines).toHaveLength(0);
    expect(filtered.notYetSplit).toEqual({ amountCents: 3000, recordCount: 1 });
    expect(filtered.expectedCost.expected).toBe(3000);
    expect(filtered.expectedGrants.expected).toBe(0);
  });
});

// ─── 10. By type and by area ─────────────────────────────────────────────────

describe('by type and by area (formula 10)', () => {
  it('counts orphan work-item lines in byType.work_items and the null area, not in any item', () => {
    const result = computeMoney(
      input({
        lines: [
          line('o1', { itemId: null, plannedAmount: 20 }),
          line('h1', { kind: 'household_item', itemId: 'hi-1', plannedAmount: 5 }),
        ],
        items: [{ kind: 'household_item', id: 'hi-1', areaId: null }],
      }),
    );
    expect(result.orphan.cost.expected).toBe(2000);
    expect(result.items.has('work_item:null')).toBe(false);
    expect(result.items.size).toBe(1);
    expect(result.byType.work_items.cost.expected).toBe(2000);
    expect(result.byType.household_items.cost.expected).toBe(500);
    expect(result.byArea).toEqual([
      { areaId: null, cost: { expected: 2500, best: 2500, worst: 2500 }, grants: zeroScen() },
    ]);
  });

  describe('area tree', () => {
    const areas: MoneyAreaInput[] = [
      { id: 'root-b', parentId: null, sortOrder: 0, name: 'Beta' },
      { id: 'z-alpha', parentId: null, sortOrder: 0, name: 'Alpha' },
      { id: 'a-alpha', parentId: null, sortOrder: 0, name: 'Alpha' },
      { id: 'root-last', parentId: null, sortOrder: 5, name: 'Aaa' },
      { id: 'unused', parentId: null, sortOrder: 9, name: 'Unused' },
      { id: 'child-1', parentId: 'root-b', sortOrder: 0, name: 'Child 1' },
      { id: 'child-2', parentId: 'child-1', sortOrder: 0, name: 'Child 2' },
      { id: 'dangling', parentId: 'gone', sortOrder: 7, name: 'Dangling' },
    ];
    const data = input({
      areas,
      lines: [
        line('deep', { itemId: 'wi-deep', plannedAmount: 100 }),
        line('a1', { itemId: 'wi-a1', plannedAmount: 50 }),
        line('a2', { itemId: 'wi-a2', plannedAmount: 10 }),
        line('last', { itemId: 'wi-last', plannedAmount: 5 }),
        line('none', { itemId: 'wi-none', plannedAmount: 1 }),
        line('ghost', { itemId: 'wi-ghost', plannedAmount: 4 }),
        line('orphan', { itemId: null, plannedAmount: 2 }),
        line('dang', { itemId: 'wi-dang', plannedAmount: 8 }),
      ],
      items: [
        { kind: 'work_item', id: 'wi-deep', areaId: 'child-2' },
        { kind: 'work_item', id: 'wi-a1', areaId: 'a-alpha' },
        { kind: 'work_item', id: 'wi-a2', areaId: 'z-alpha' },
        { kind: 'work_item', id: 'wi-last', areaId: 'root-last' },
        { kind: 'work_item', id: 'wi-none', areaId: null },
        { kind: 'work_item', id: 'wi-ghost', areaId: 'deleted-area' },
        { kind: 'work_item', id: 'wi-dang', areaId: 'dangling' },
      ],
      grants: [grant('g1', { reductionValue: 10, linkedItemKeys: ['work_item:wi-deep'] })],
    });

    it('rolls an item up through three levels and omits areas without lines', () => {
      const result = computeMoney(data);
      const ids = result.byArea.map((a) => a.areaId);
      expect(ids).not.toContain('unused');
      const byId = new Map(result.byArea.map((a) => [a.areaId, a]));
      for (const id of ['root-b', 'child-1', 'child-2']) {
        expect(byId.get(id)!.cost.expected).toBe(10000);
        expect(byId.get(id)!.grants.expected).toBe(1000);
      }
      expect(byId.get('a-alpha')!.cost.expected).toBe(5000);
      expect(byId.get('z-alpha')!.cost.expected).toBe(1000);
    });

    it('orders depth-first by sort_order, name, id with the null entry last', () => {
      const result = computeMoney(data);
      expect(result.byArea.map((a) => a.areaId)).toEqual([
        'a-alpha',
        'z-alpha',
        'root-b',
        'child-1',
        'child-2',
        'root-last',
        'dangling',
        null,
      ]);
    });

    it('puts items without an area, with an unknown area, and orphan lines into the null bucket', () => {
      const result = computeMoney(data);
      const nullEntry = result.byArea[result.byArea.length - 1]!;
      // none (1) + ghost (4) + orphan (2)
      expect(nullEntry.areaId).toBeNull();
      expect(nullEntry.cost.expected).toBe(700);
    });

    it('treats an area with an unknown parent as a root', () => {
      const result = computeMoney(data);
      const dangling = result.byArea.find((a) => a.areaId === 'dangling')!;
      expect(dangling.cost.expected).toBe(800);
    });

    it('omits the null entry when nothing is unassigned', () => {
      const result = computeMoney(
        input({
          areas: [{ id: 'ar', parentId: null, sortOrder: 0, name: 'Only' }],
          lines: [line('l', { itemId: 'wi' })],
          items: [{ kind: 'work_item', id: 'wi', areaId: 'ar' }],
        }),
      );
      expect(result.byArea.map((a) => a.areaId)).toEqual(['ar']);
    });

    it('returns no areas for an empty input', () => {
      expect(computeMoney(input()).byArea).toEqual([]);
    });
  });
});

// ─── 8. Payments ─────────────────────────────────────────────────────────────

describe('computePayments (formula 8)', () => {
  function row(
    invoiceId: string,
    amount: number,
    status: string,
    deposit?: { id: string; amount: number; status: string; entryType?: string },
  ): InvoiceDepositRow {
    return {
      invoice_id: invoiceId,
      invoice_amount: amount,
      invoice_status: status,
      deposit_id: deposit?.id ?? null,
      deposit_amount: deposit?.amount ?? null,
      deposit_status: deposit?.status ?? null,
      deposit_entry_type: deposit ? (deposit.entryType ?? 'deposit') : null,
    };
  }

  const rows: InvoiceDepositRow[] = [
    row('Q1', 25000, 'quotation', { id: 'D1', amount: 5000, status: 'paid' }),
    row('Q1', 25000, 'quotation', { id: 'D2', amount: 4000, status: 'pending' }),
    row('I1', 11900, 'pending', { id: 'D3', amount: 2000, status: 'paid' }),
    row('I2', 3000.5, 'paid'),
    row('I3', 14500, 'claimed'),
    row('I4', 2600, 'pending'),
  ];

  it('counts paid and claimed residuals, paid progress payments on offers, and open payables', () => {
    const p = computePayments(rows);
    // offers: 5,000 paid deposit; invoices: 2,000 + 3,000.50 + 14,500
    expect(p.offers.paidCents).toBe(500000);
    expect(p.invoices.paidCents).toBe(2000 * 100 + 300050 + 1450000);
    expect(p.paidCents).toBe(500000 + 2000 * 100 + 300050 + 1450000);
    // offers: pending deposit 4,000; invoices: I1 residual 9,900 + I4 2,600 (claimed never counts)
    expect(p.offers.stillToPayCents).toBe(400000);
    expect(p.invoices.stillToPayCents).toBe(990000 + 260000);
    expect(p.stillToPayCents).toBe(400000 + 990000 + 260000);
  });

  it('counts records and amounts per type', () => {
    const p = computePayments(rows);
    expect(p.offers.count).toBe(1);
    expect(p.offers.amountCents).toBe(2500000);
    expect(p.invoices.count).toBe(4);
    expect(p.invoices.amountCents).toBe(1190000 + 300050 + 1450000 + 260000);
  });

  it('counts the records with something still to pay, once each (#2230)', () => {
    const p = computePayments(rows);
    // Q1 (pending deposit), I1 (residual), I4 (open); I2 paid and I3 claimed never count
    expect(p.stillToPayCount).toBe(3);
  });

  it('counts an invoice once when it has several pending deposits', () => {
    const p = computePayments([
      row('I1', 1000, 'pending', { id: 'D1', amount: 100, status: 'pending' }),
      row('I1', 1000, 'pending', { id: 'D2', amount: 100, status: 'pending' }),
      row('I1', 1000, 'pending', { id: 'D3', amount: 100, status: 'paid' }),
    ]);
    expect(p.stillToPayCount).toBe(1);
  });

  it('does not count a settled offer, a paid invoice, or one with only a refund', () => {
    const p = computePayments([
      row('Q1', 1000, 'quotation', { id: 'D1', amount: 300, status: 'paid' }),
      row('I1', 800, 'paid', { id: 'R1', amount: 100, status: 'pending', entryType: 'refund' }),
      row('I2', 500, 'claimed'),
    ]);
    expect(p.stillToPayCount).toBe(0);
    expect(p.stillToPayCents).toBe(0);
  });

  it('keeps the by-type split equal to the totals (paid and stillToPay)', () => {
    const p = computePayments(rows);
    expect(p.offers.paidCents + p.invoices.paidCents).toBe(p.paidCents);
    expect(p.offers.stillToPayCents + p.invoices.stillToPayCents).toBe(p.stillToPayCents);
  });

  it('subtracts a received refund from paid', () => {
    const p = computePayments([
      row('I1', 800, 'paid', { id: 'R1', amount: 100, status: 'paid', entryType: 'refund' }),
    ]);
    expect(p.paidCents).toBe(70000);
  });

  it('computes remaining on an offer from non-refund progress payments of any status', () => {
    const p = computePayments(rows);
    expect(p.offers.remainingOnOfferCents).toBe(1600000);
  });

  it('ignores refunds in remaining on offer', () => {
    const p = computePayments([
      row('Q1', 1000, 'quotation', { id: 'R1', amount: 200, status: 'paid', entryType: 'refund' }),
    ]);
    expect(p.offers.remainingOnOfferCents).toBe(100000);
  });

  it('never lets remaining on an offer go negative (over-paid offer)', () => {
    const p = computePayments([
      row('Q1', 1000, 'quotation', { id: 'D1', amount: 1500, status: 'paid' }),
      row('Q2', 500, 'quotation'),
    ]);
    // Q1 over-paid -> 0; Q2 untouched -> 500.00
    expect(p.offers.remainingOnOfferCents).toBe(50000);
  });

  it('de-duplicates a progress payment fanned out over several rows', () => {
    const p = computePayments([
      row('Q1', 1000, 'quotation', { id: 'D1', amount: 300, status: 'paid' }),
      row('Q1', 1000, 'quotation', { id: 'D1', amount: 300, status: 'paid' }),
    ]);
    expect(p.offers.remainingOnOfferCents).toBe(70000);
    expect(p.offers.count).toBe(1);
  });

  it('returns zeros for no rows and converts to the API shape', () => {
    const p = computePayments([]);
    expect(p.paidCents).toBe(0);
    expect(p.stillToPayCents).toBe(0);
    expect(p.stillToPayCount).toBe(0);
    expect(toOfferTotals(p.offers)).toEqual({
      count: 0,
      amount: 0,
      paid: 0,
      stillToPay: 0,
      remainingOnOffer: 0,
    });
    expect(toRecordTotals(p.invoices)).toEqual({ count: 0, amount: 0, paid: 0, stillToPay: 0 });

    const full = computePayments(rows);
    expect(toOfferTotals(full.offers)).toEqual({
      count: 1,
      amount: 25000,
      paid: 5000,
      stillToPay: 4000,
      remainingOnOffer: 16000,
    });
    expect(toRecordTotals(full.invoices)).toEqual({
      count: 4,
      amount: 32000.5,
      paid: 19500.5,
      stillToPay: 12500,
    });
  });
});
