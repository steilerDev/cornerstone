/**
 * Pure arithmetic of the Money > Overview breakdown (#2237, ADR-039 §5): `attributePayments`
 * (per-line Paid / Still to pay, owner decision B: tagged deposits) and `computeBreakdown`
 * (the rows of every view). Synthetic data only; no database.
 *
 * Mutations these tests catch:
 *  - a tagged payment spilling into "not yet split" or onto lines of another source (T1, T5);
 *  - tagged payments weighted by the line planned amount instead of the itemized cents (T2);
 *  - an all-zero tagged weight dividing by zero instead of splitting equally (T3);
 *  - dropping a tagged payment when its source has no line (T4);
 *  - counting a refund positive, a pending refund as Still to pay, or a deposit twice (T6, T7);
 *  - per-record rounding left unreconciled (sub-cent cases): Σ differs from computePayments;
 *  - dropping the sign on a negative split (refund-only record, T9);
 *  - an order-dependent split of several tagged sources (T10);
 *  - clamping Not yet paid at 0, or adding the notYetSplit row twice to the total.
 */

import { describe, it, expect } from '@jest/globals';
import type { BudgetBreakdown, BudgetSourceType } from '@cornerstone/shared';
import type { TaggedDepositRow } from '../moneyService.js';
import {
  attributePayments,
  computeBreakdown,
  type BreakdownContext,
  type LinePayments,
} from './moneyBreakdown.js';
import {
  computeMoney,
  computePayments,
  type MoneyGrantInput,
  type MoneyInput,
  type MoneyLineInput,
  type MoneyInvoiceInput,
} from './moneyEngine.js';

// ─── attributePayments helpers ───────────────────────────────────────────────

interface Dep {
  id: string;
  amount: number;
  status: 'pending' | 'paid' | 'claimed';
  refund?: boolean;
  source?: string | null;
}

interface Rec {
  id: string;
  amount: number;
  status: 'quotation' | 'pending' | 'paid' | 'claimed';
  deps?: Dep[];
  /** [lineId, itemized amount in major units] */
  links?: Array<[string, number]>;
}

function toRows(recs: Rec[]): TaggedDepositRow[] {
  const rows: TaggedDepositRow[] = [];
  for (const rec of recs) {
    const base = {
      invoice_id: rec.id,
      invoice_amount: rec.amount,
      invoice_status: rec.status,
    };
    if (!rec.deps || rec.deps.length === 0) {
      rows.push({
        ...base,
        deposit_id: null,
        deposit_amount: null,
        deposit_status: null,
        deposit_entry_type: null,
        deposit_budget_source_id: null,
      });
      continue;
    }
    for (const dep of rec.deps) {
      rows.push({
        ...base,
        deposit_id: dep.id,
        deposit_amount: dep.amount,
        deposit_status: dep.status,
        deposit_entry_type: dep.refund ? 'refund' : 'deposit',
        deposit_budget_source_id: dep.source ?? null,
      });
    }
  }
  return rows;
}

function run(
  recs: Rec[],
  opts: {
    /** invoice id -> unsplit remainder in cents (the engine only reports remainders >= 1.00) */
    unsplit?: Record<string, number>;
    lineSources?: Record<string, string | null>;
  } = {},
): LinePayments {
  const invoices: MoneyInvoiceInput[] = recs.map((rec) => ({
    id: rec.id,
    amount: rec.amount,
    status: rec.status,
    itemizedCents: Math.round((rec.links ?? []).reduce((s, [, amt]) => s + amt, 0) * 100),
  }));
  const links = recs.flatMap((rec) =>
    (rec.links ?? []).map(([lineId, amt]) => ({
      invoiceId: rec.id,
      lineId,
      itemizedCents: Math.round(amt * 100),
    })),
  );
  return attributePayments(
    invoices,
    toRows(recs),
    links,
    new Map(Object.entries(opts.unsplit ?? {})),
    new Map(Object.entries(opts.lineSources ?? {})),
  );
}

const paidOf = (res: LinePayments, lineId: string): number => res.byLine.get(lineId)?.paid ?? 0;
const openOf = (res: LinePayments, lineId: string): number =>
  res.byLine.get(lineId)?.stillToPay ?? 0;

function sumPaid(res: LinePayments): number {
  let sum = res.unsplit.paid;
  for (const v of res.byLine.values()) sum += v.paid;
  return sum;
}
function sumOpen(res: LinePayments): number {
  let sum = res.unsplit.stillToPay;
  for (const v of res.byLine.values()) sum += v.stillToPay;
  return sum;
}

/** Σ attributed = computePayments on the same rows, to the cent. */
function expectInvariant(recs: Rec[], res: LinePayments): void {
  const totals = computePayments(toRows(recs));
  expect(sumPaid(res)).toBe(totals.paidCents);
  expect(sumOpen(res)).toBe(totals.stillToPayCents);
}

// ─── attributePayments ───────────────────────────────────────────────────────

describe('attributePayments', () => {
  describe('untagged records', () => {
    it('T1: splits a record over its lines by itemized cents (A 66,000 / B 34,000 cents)', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 1000,
          status: 'paid',
          links: [
            ['A', 660],
            ['B', 340],
          ],
        },
      ];
      const res = run(recs, { lineSources: { A: 'src-a', B: 'src-b' } });
      expect(paidOf(res, 'A')).toBe(66000);
      expect(paidOf(res, 'B')).toBe(34000);
      expect(res.unsplit).toEqual({ paid: 0, stillToPay: 0 });
      expectInvariant(recs, res);
    });

    it('splits a pending record Still to pay by the same weights and leaves Paid at 0', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 1000,
          status: 'pending',
          links: [
            ['A', 600],
            ['B', 400],
          ],
        },
      ];
      const res = run(recs);
      expect(openOf(res, 'A')).toBe(60000);
      expect(openOf(res, 'B')).toBe(40000);
      expect(sumPaid(res)).toBe(0);
      expectInvariant(recs, res);
    });

    it('gives the unsplit remainder its share of the record (weight from notYetSplitByInvoice)', () => {
      const recs: Rec[] = [{ id: 'r1', amount: 1000, status: 'paid', links: [['A', 800]] }];
      const res = run(recs, { unsplit: { r1: 20000 } });
      expect(paidOf(res, 'A')).toBe(80000);
      expect(res.unsplit.paid).toBe(20000);
      expectInvariant(recs, res);
    });

    it('puts a remainder below 1.00 on the lines (no unsplit weight), I2 style', () => {
      const recs: Rec[] = [{ id: 'r1', amount: 3000.5, status: 'paid', links: [['A', 3000]] }];
      const res = run(recs); // the engine reports no remainder below 1.00
      expect(paidOf(res, 'A')).toBe(300050);
      expect(res.unsplit.paid).toBe(0);
      expectInvariant(recs, res);
    });

    it('over-itemized record: no unsplit weight, still sums exactly', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 100,
          status: 'paid',
          links: [
            ['A', 90],
            ['B', 30],
          ],
        },
      ];
      const res = run(recs);
      expect(paidOf(res, 'A')).toBe(7500);
      expect(paidOf(res, 'B')).toBe(2500);
      expectInvariant(recs, res);
    });

    it('a record with links all itemized at 0 splits equally', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 100,
          status: 'paid',
          links: [
            ['A', 0],
            ['B', 0],
          ],
        },
      ];
      const res = run(recs);
      expect(paidOf(res, 'A')).toBe(5000);
      expect(paidOf(res, 'B')).toBe(5000);
    });

    it('a record without links goes entirely to unsplit, even below 1.00', () => {
      const recs: Rec[] = [{ id: 'r1', amount: 0.75, status: 'paid' }];
      const res = run(recs);
      expect(res.byLine.size).toBe(0);
      expect(res.unsplit.paid).toBe(75);
      expectInvariant(recs, res);
    });

    it('a pending record without links puts its whole Still to pay on unsplit', () => {
      const recs: Rec[] = [{ id: 'r1', amount: 800, status: 'pending' }];
      const res = run(recs);
      expect(res.unsplit).toEqual({ paid: 0, stillToPay: 80000 });
    });

    it('leftover cents of 100 cents over 3 equal weights go 34/33/33, ties broken by key', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 1,
          status: 'paid',
          links: [
            ['c', 10],
            ['a', 10],
            ['b', 10],
          ],
        },
      ];
      const res = run(recs);
      expect(paidOf(res, 'a')).toBe(34);
      expect(paidOf(res, 'b')).toBe(33);
      expect(paidOf(res, 'c')).toBe(33);
    });

    it('splits a negative Paid (a refund-only record) and keeps the sign (T9)', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 1000,
          status: 'pending',
          deps: [{ id: 'd1', amount: 300, status: 'paid', refund: true }],
          links: [
            ['A', 600],
            ['B', 400],
          ],
        },
      ];
      const res = run(recs);
      expect(paidOf(res, 'A')).toBe(-18000);
      expect(paidOf(res, 'B')).toBe(-12000);
      expectInvariant(recs, res);
    });

    it('counts an offer progress payment (status quotation) like any record', () => {
      const recs: Rec[] = [
        {
          id: 'q1',
          amount: 25000,
          status: 'quotation',
          deps: [
            { id: 'd1', amount: 5000, status: 'paid' },
            { id: 'd2', amount: 4000, status: 'pending' },
          ],
          links: [['A', 23800]],
        },
      ];
      const res = run(recs, { unsplit: { q1: 120000 } });
      expect(paidOf(res, 'A')).toBe(476000);
      expect(res.unsplit.paid).toBe(24000);
      expect(openOf(res, 'A')).toBe(380800);
      expect(res.unsplit.stillToPay).toBe(19200);
      expectInvariant(recs, res);
    });

    it('treats records and lines independently (several records, one shared line)', () => {
      const recs: Rec[] = [
        { id: 'r1', amount: 100, status: 'paid', links: [['A', 100]] },
        { id: 'r2', amount: 50, status: 'pending', links: [['A', 50]] },
        { id: 'r3', amount: 10, status: 'claimed' },
      ];
      const res = run(recs);
      expect(paidOf(res, 'A')).toBe(10000);
      expect(openOf(res, 'A')).toBe(5000);
      expect(res.unsplit.paid).toBe(1000);
      expectInvariant(recs, res);
    });
  });

  describe('tagged deposits (owner decision B)', () => {
    it('T1 tagged: a deposit tagged A goes to A only, the rest splits by weights', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 1000,
          status: 'pending',
          deps: [{ id: 'd1', amount: 300, status: 'paid', source: 'src-a' }],
          links: [
            ['A', 600],
            ['B', 400],
          ],
        },
      ];
      const res = run(recs, { lineSources: { A: 'src-a', B: 'src-b' } });
      expect(paidOf(res, 'A')).toBe(30000);
      expect(paidOf(res, 'B')).toBe(0);
      expect(openOf(res, 'A')).toBe(42000);
      expect(openOf(res, 'B')).toBe(28000);
      expectInvariant(recs, res);
    });

    it('T2: several lines of the tagged source share it by itemized cents', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 1000,
          status: 'paid',
          deps: [{ id: 'd1', amount: 200, status: 'paid', source: 'src-a' }],
          links: [
            ['A1', 300],
            ['A2', 100],
            ['B', 600],
          ],
        },
      ];
      const res = run(recs, { lineSources: { A1: 'src-a', A2: 'src-a', B: 'src-b' } });
      // tagged 200: A1 150, A2 50; untagged 800 over 300/100/600: 240, 80, 480
      expect(paidOf(res, 'A1')).toBe(15000 + 24000);
      expect(paidOf(res, 'A2')).toBe(5000 + 8000);
      expect(paidOf(res, 'B')).toBe(48000);
      expectInvariant(recs, res);
    });

    it('T3: tagged lines itemized at 0 split the tagged share equally', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 1000,
          status: 'paid',
          deps: [{ id: 'd1', amount: 200, status: 'paid', source: 'src-a' }],
          links: [
            ['A1', 0],
            ['A2', 0],
            ['B', 1000],
          ],
        },
      ];
      const res = run(recs, { lineSources: { A1: 'src-a', A2: 'src-a', B: 'src-b' } });
      expect(paidOf(res, 'A1')).toBe(10000);
      expect(paidOf(res, 'A2')).toBe(10000);
      expect(paidOf(res, 'B')).toBe(80000);
      expectInvariant(recs, res);
    });

    it('T4: a tagged source without a line on the record stays in the untagged part', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 1000,
          status: 'paid',
          deps: [{ id: 'd1', amount: 200, status: 'paid', source: 'src-z' }],
          links: [
            ['L1', 500],
            ['L2', 300],
          ],
        },
      ];
      const res = run(recs, {
        unsplit: { r1: 20000 },
        lineSources: { L1: 'src-a', L2: 'src-b' },
      });
      // all 1,000 spread over 500/300/200(unsplit)
      expect(paidOf(res, 'L1')).toBe(50000);
      expect(paidOf(res, 'L2')).toBe(30000);
      expect(res.unsplit.paid).toBe(20000);
      expectInvariant(recs, res);
    });

    it('T5: the tagged share never goes to Not yet split, although the record has a remainder', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 1000,
          status: 'paid',
          deps: [{ id: 'd1', amount: 1000, status: 'paid', source: 'src-a' }],
          links: [['A', 600]],
        },
      ];
      const res = run(recs, { unsplit: { r1: 40000 }, lineSources: { A: 'src-a' } });
      expect(paidOf(res, 'A')).toBe(100000);
      expect(res.unsplit.paid).toBe(0);
      expectInvariant(recs, res);
    });

    it('T5b: tagged payments never go to lines of another source', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 100,
          status: 'paid',
          deps: [{ id: 'd1', amount: 100, status: 'paid', source: 'src-b' }],
          links: [
            ['A', 90],
            ['B', 10],
          ],
        },
      ];
      const res = run(recs, { lineSources: { A: 'src-a', B: 'src-b' } });
      expect(paidOf(res, 'A')).toBe(0);
      expect(paidOf(res, 'B')).toBe(10000);
    });

    it('T6: a tagged refund nets against the tagged deposit (200 - 50 = 150)', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 1000,
          status: 'pending',
          deps: [
            { id: 'd1', amount: 200, status: 'paid', source: 'src-a' },
            { id: 'd2', amount: 50, status: 'paid', refund: true, source: 'src-a' },
          ],
          links: [
            ['A', 500],
            ['B', 500],
          ],
        },
      ];
      const res = run(recs, { lineSources: { A: 'src-a', B: 'src-b' } });
      expect(paidOf(res, 'A')).toBe(15000);
      expect(paidOf(res, 'B')).toBe(0);
      expectInvariant(recs, res);
    });

    it('T7: a pending tagged deposit is Still to pay of its source; a pending tagged refund is excluded', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 1000,
          status: 'pending',
          deps: [
            { id: 'd1', amount: 300, status: 'pending', source: 'src-a' },
            { id: 'd2', amount: 100, status: 'pending', refund: true, source: 'src-a' },
          ],
          links: [
            ['A', 500],
            ['B', 500],
          ],
        },
      ];
      const res = run(recs, { lineSources: { A: 'src-a', B: 'src-b' } });
      // open = residual 700 + pending 300 = 1000; tagged 300 -> A; untagged 700 -> 350 / 350
      expect(openOf(res, 'A')).toBe(30000 + 35000);
      expect(openOf(res, 'B')).toBe(35000);
      expect(sumPaid(res)).toBe(0);
      expectInvariant(recs, res);
    });

    it('a claimed tagged deposit counts as Paid like a paid one', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 100,
          status: 'pending',
          deps: [{ id: 'd1', amount: 40, status: 'claimed', source: 'src-a' }],
          links: [
            ['A', 50],
            ['B', 50],
          ],
        },
      ];
      const res = run(recs, { lineSources: { A: 'src-a', B: 'src-b' } });
      expect(paidOf(res, 'A')).toBe(4000);
      expect(paidOf(res, 'B')).toBe(0);
    });

    it('counts a payment once even when the join repeats its row', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 100,
          status: 'pending',
          deps: [{ id: 'd1', amount: 40, status: 'paid', source: 'src-a' }],
          links: [
            ['A', 50],
            ['B', 50],
          ],
        },
      ];
      const rows = toRows(recs);
      const res = attributePayments(
        [{ id: 'r1', amount: 100, status: 'pending', itemizedCents: 10000 }],
        [...rows, { ...rows[0]! }],
        [
          { invoiceId: 'r1', lineId: 'A', itemizedCents: 5000 },
          { invoiceId: 'r1', lineId: 'B', itemizedCents: 5000 },
        ],
        new Map(),
        new Map([
          ['A', 'src-a'],
          ['B', 'src-b'],
        ]),
      );
      expect(paidOf(res, 'A')).toBe(4000);
      expect(paidOf(res, 'B')).toBe(0);
    });

    it('ignores a deposit row without an amount (defensive) and a deposit in another status', () => {
      const rows = toRows([
        {
          id: 'r1',
          amount: 100,
          status: 'pending',
          deps: [
            { id: 'd1', amount: 10, status: 'paid', source: 'src-a' },
            { id: 'd2', amount: 10, status: 'paid', source: 'src-a' },
          ],
        },
      ]);
      rows[0]!.deposit_amount = null;
      rows[1]!.deposit_status = 'void';
      const res = attributePayments(
        [{ id: 'r1', amount: 100, status: 'pending', itemizedCents: 10000 }],
        rows,
        [{ invoiceId: 'r1', lineId: 'A', itemizedCents: 10000 }],
        new Map(),
        new Map([['A', 'src-a']]),
      );
      // nothing was tagged to A: the whole record is untagged and lands on A
      expect(sumPaid(res)).toBe(paidOf(res, 'A') + res.unsplit.paid);
      expect(paidOf(res, 'A')).toBe(res.byLine.get('A')!.paid);
    });

    it('T10: two tagged sources give the same result for any input order', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 1000,
          status: 'pending',
          deps: [
            { id: 'd1', amount: 100.01, status: 'paid', source: 'src-b' },
            { id: 'd2', amount: 200.02, status: 'paid', source: 'src-a' },
            { id: 'd3', amount: 33.33, status: 'pending', source: 'src-a' },
          ],
          links: [
            ['A1', 100],
            ['A2', 200],
            ['B1', 301],
            ['C', 399],
          ],
        },
      ];
      const lineSources = { A1: 'src-a', A2: 'src-a', B1: 'src-b', C: null };
      const base = run(recs, { lineSources });
      const reversed = attributePayments(
        [{ id: 'r1', amount: 1000, status: 'pending', itemizedCents: 100000 }],
        [...toRows(recs)].reverse(),
        [
          { invoiceId: 'r1', lineId: 'C', itemizedCents: 39900 },
          { invoiceId: 'r1', lineId: 'B1', itemizedCents: 30100 },
          { invoiceId: 'r1', lineId: 'A2', itemizedCents: 20000 },
          { invoiceId: 'r1', lineId: 'A1', itemizedCents: 10000 },
        ],
        new Map(),
        new Map(Object.entries(lineSources)),
      );
      const flat = (r: LinePayments) => ({
        lines: [...r.byLine.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
        unsplit: r.unsplit,
      });
      expect(flat(reversed)).toEqual(flat(base));
      expectInvariant(recs, base);
      // source a: tagged paid 200.02 over A1/A2 by 100:200 = 66.67 / 133.35
      expect(paidOf(base, 'A1')).toBeGreaterThanOrEqual(6667);
      expect(paidOf(base, 'B1')).toBeGreaterThanOrEqual(10001);
    });
  });

  describe('record shapes the join may produce', () => {
    it('handles a record without any row (no join output) as all zero', () => {
      const res = attributePayments(
        [{ id: 'r1', amount: 100, status: 'pending', itemizedCents: 0 }],
        [],
        [],
        new Map(),
        new Map(),
      );
      expect(sumPaid(res)).toBe(0);
      expect(sumOpen(res)).toBe(0);
    });

    it('does not throw when rows exist for records missing from the record list', () => {
      const rows = toRows([{ id: 'r1', amount: 100.005, status: 'paid' }]);
      const res = attributePayments([], rows, [], new Map(), new Map());
      expect(sumPaid(res)).toBe(0);
    });
  });

  describe('sub-cent amounts', () => {
    it('T8: 100.004 with a tagged 33.333 sums exactly and the tagged share is toCents(33.333)', () => {
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 33.333,
          status: 'paid',
          deps: [{ id: 'd1', amount: 33.333, status: 'paid', source: 'src-a' }],
          links: [
            ['A', 33.33],
            ['B', 0],
          ],
        },
        { id: 'r2', amount: 66.671, status: 'paid', links: [['B', 66.67]] },
      ];
      const res = run(recs, { lineSources: { A: 'src-a', B: 'src-b' } });
      expect(paidOf(res, 'A')).toBe(3333);
      expect(sumPaid(res)).toBe(computePayments(toRows(recs)).paidCents);
      expect(sumPaid(res)).toBe(10000);
      expectInvariant(recs, res);
    });

    it('reconciles per-record rounding onto the record that ties on size by id, so Σ equals the project figure', () => {
      // 0.005 rounds to 1 cent per record (2 in all) but the project figure 0.01 to 1 cent
      const recs: Rec[] = [
        { id: 'x', amount: 0.005, status: 'paid', links: [['LX', 0.005]] },
        { id: 'y', amount: 0.005, status: 'paid', links: [['LY', 0.005]] },
      ];
      const res = run(recs);
      expect(sumPaid(res)).toBe(1);
      expect(paidOf(res, 'LX')).toBe(0);
      expect(paidOf(res, 'LY')).toBe(1);
      expectInvariant(recs, res);
    });

    it('reconciles onto the record with the larger absolute amount, whatever the id order', () => {
      const recs: Rec[] = [
        { id: 'a-small', amount: 0.005, status: 'paid', links: [['LS', 0.005]] },
        { id: 'b-big', amount: 0.015, status: 'paid', links: [['LB', 0.015]] },
      ];
      const res = run(recs);
      expectInvariant(recs, res);
      expect(paidOf(res, 'LS')).toBe(1);
      expect(paidOf(res, 'LB')).toBe(1);
      const swapped = run([
        { id: 'a-big', amount: 0.015, status: 'paid', links: [['LB', 0.015]] },
        { id: 'b-small', amount: 0.005, status: 'paid', links: [['LS', 0.005]] },
      ]);
      expect(paidOf(swapped, 'LB')).toBe(1);
      expect(paidOf(swapped, 'LS')).toBe(1);
    });

    it('T9: a tagged payment larger than the reconciled record figure leaves a negative untagged part without throwing', () => {
      // two records of 0.005: each rounds to 1 cent, the project figure (0.01) to 1 cent
      const recs: Rec[] = [
        {
          id: 'r1',
          amount: 0.005,
          status: 'paid',
          deps: [{ id: 'd1', amount: 0.005, status: 'paid', source: 'src-a' }],
          links: [
            ['A', 0.005],
            ['B', 0],
          ],
        },
        { id: 'r2', amount: 0.005, status: 'paid', links: [['B', 0.005]] },
      ];
      const lineSources = { A: 'src-a', B: 'src-b' };
      expect(() => run(recs, { lineSources })).not.toThrow();
      const res = run(recs, { lineSources });
      expectInvariant(recs, res);
    });
  });
});

// ─── computeBreakdown ────────────────────────────────────────────────────────

const VAT = 0.19;

function line(
  id: string,
  over: Partial<MoneyLineInput> & { planned?: number } = {},
): MoneyLineInput {
  const { planned, ...rest } = over;
  return {
    id,
    kind: 'work_item',
    itemId: null,
    budgetSourceId: null,
    budgetCategoryId: null,
    confidence: 'invoice',
    plannedAmount: planned ?? 1000,
    includesVat: true,
    itemizedCents: null,
    ...rest,
  };
}

interface Fixture {
  lines: MoneyLineInput[];
  items?: BreakdownContext['items'];
  areas?: BreakdownContext['areas'];
  categories?: BreakdownContext['categories'];
  sources?: Array<{ id: string; name: string; sourceType?: BudgetSourceType }>;
  invoices?: MoneyInvoiceInput[];
  grants?: MoneyGrantInput[];
  payments?: LinePayments;
  meta?: Array<[string, { description: string | null; linkStatus?: 'paid' | 'pending' | null }]>;
  vat?: number;
  includeLine?: (l: MoneyLineInput) => boolean;
}

function breakdown(f: Fixture): BudgetBreakdown {
  const items = f.items ?? [];
  const input: MoneyInput = {
    vatRate: f.vat ?? VAT,
    lines: f.lines,
    items: items.map((i) => ({ kind: i.kind, id: i.id, areaId: i.areaId })),
    invoices: f.invoices ?? [],
    grants: f.grants ?? [],
    areas: (f.areas ?? []).map((a) => ({
      id: a.id,
      parentId: a.parentId,
      sortOrder: a.sortOrder,
      name: a.name,
    })),
    fundingTotalCents: 0,
    activeSourceCount: 0,
  };
  const unfiltered = computeMoney(input);
  const filtered = f.includeLine ? computeMoney(input, { includeLine: f.includeLine }) : unfiltered;
  return computeBreakdown({
    result: filtered,
    payments: f.payments ?? { byLine: new Map(), unsplit: { paid: 0, stillToPay: 0 } },
    items,
    areas: f.areas ?? [],
    categories: f.categories ?? [],
    sources: (f.sources ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      sourceType: s.sourceType ?? 'bank_loan',
    })),
    lineMeta: new Map(
      (f.meta ?? []).map(([id, m]) => [
        id,
        { description: m.description, linkStatus: m.linkStatus ?? null },
      ]),
    ),
    hasUnassignedLines: f.lines.some((l) => l.budgetSourceId === null),
  });
}

const expected = (r: { expected: number }): number => r.expected;

describe('computeBreakdown', () => {
  const area = (id: string, name: string, parentId: string | null = null, sortOrder = 0) => ({
    id,
    parentId,
    sortOrder,
    name,
  });
  const item = (
    id: string,
    name: string,
    areaId: string | null,
    kind: 'work_item' | 'household_item' = 'work_item',
  ) => ({
    kind,
    id,
    name,
    areaId,
  });

  describe('lines and items', () => {
    it('orders lines by item (tasks before purchases, name, id), orphans last, then description (null last), then id', () => {
      const b = breakdown({
        lines: [
          line('l-orphan'),
          line('l-hi', { kind: 'household_item', itemId: 'hi-1' }),
          line('l-b2', { itemId: 'wi-b' }),
          line('l-b1', { itemId: 'wi-b' }),
          line('l-b3', { itemId: 'wi-b' }),
          line('l-a', { itemId: 'wi-a' }),
          line('l-ghost', { itemId: 'wi-missing' }),
        ],
        items: [
          item('wi-b', 'Task B', null),
          item('wi-a', 'Task A', null),
          item('hi-1', 'Purchase One', null, 'household_item'),
        ],
        meta: [
          ['l-b1', { description: 'zeta' }],
          ['l-b2', { description: 'alpha' }],
          ['l-b3', { description: null }],
        ],
      });
      expect(b.lines.map((l) => l.id)).toEqual([
        'l-a',
        'l-b2',
        'l-b1',
        'l-b3',
        'l-hi',
        'l-ghost',
        'l-orphan',
      ]);
      expect(b.items.map((i) => i.id)).toEqual(['wi-a', 'wi-b', 'hi-1']);
      expect(b.items.map((i) => i.kind)).toEqual(['work_item', 'work_item', 'household_item']);
    });

    it('breaks name ties between items by id and between equal descriptions by line id', () => {
      const b = breakdown({
        lines: [
          line('l2', { itemId: 'wi-2' }),
          line('l1', { itemId: 'wi-1' }),
          line('l3', { itemId: 'wi-1' }),
          line('l4', { itemId: 'wi-1' }),
        ],
        items: [item('wi-2', 'Same', null), item('wi-1', 'Same', null)],
        meta: [
          ['l3', { description: 'same' }],
          ['l4', { description: 'same' }],
          ['l1', { description: 'same' }],
        ],
      });
      expect(b.items.map((i) => i.id)).toEqual(['wi-1', 'wi-2']);
      expect(b.lines.map((l) => l.id)).toEqual(['l1', 'l3', 'l4', 'l2']);
    });

    it('carries the line identity: description, link status, category, source and confidence', () => {
      const b = breakdown({
        lines: [
          line('l1', {
            itemId: 'wi-1',
            budgetCategoryId: 'bc-1',
            budgetSourceId: 'bs-1',
            confidence: 'own_estimate',
          }),
          line('l2', { itemId: 'wi-1' }),
        ],
        items: [item('wi-1', 'Task', null)],
        meta: [['l1', { description: 'Roof tiles', linkStatus: 'paid' }]],
      });
      const l1 = b.lines.find((l) => l.id === 'l1')!;
      expect(l1).toMatchObject({
        kind: 'work_item',
        itemId: 'wi-1',
        description: 'Roof tiles',
        linkStatus: 'paid',
        budgetCategoryId: 'bc-1',
        budgetSourceId: 'bs-1',
        confidence: 'own_estimate',
      });
      const l2 = b.lines.find((l) => l.id === 'l2')!;
      expect(l2.description).toBeNull();
      expect(l2.linkStatus).toBeNull();
    });

    it('omits items without a surviving line', () => {
      const b = breakdown({
        lines: [line('l1', { itemId: 'wi-1' })],
        items: [item('wi-1', 'Task One', null), item('wi-2', 'Task Two', null)],
      });
      expect(b.items.map((i) => i.id)).toEqual(['wi-1']);
    });

    it('nulls the areaId of an item whose area is unknown', () => {
      const b = breakdown({
        lines: [line('l1', { itemId: 'wi-1' })],
        items: [item('wi-1', 'Task One', 'ar-gone')],
      });
      expect(b.items[0]!.areaId).toBeNull();
    });
  });

  describe('ordering corner cases', () => {
    it('sorts tasks before purchases whatever the input order', () => {
      const kinds: Array<'work_item' | 'household_item'> = [
        'household_item',
        'work_item',
        'household_item',
        'work_item',
        'household_item',
      ];
      const items = kinds.map((k, i) => item(`i-${i}`, `Name ${i}`, null, k));
      const b = breakdown({
        lines: items.map((i) => line(`l-${i.id}`, { kind: i.kind, itemId: i.id })),
        items,
      });
      expect(b.items.map((i) => i.kind)).toEqual([
        'work_item',
        'work_item',
        'household_item',
        'household_item',
        'household_item',
      ]);
    });

    it('keeps lines without a description together (equal nulls) and orders them by id', () => {
      const b = breakdown({
        lines: [
          line('l-c', { itemId: 'wi-1' }),
          line('l-a', { itemId: 'wi-1' }),
          line('l-b', { itemId: 'wi-1' }),
        ],
        items: [item('wi-1', 'T', null)],
      });
      expect(b.lines.map((l) => l.id)).toEqual(['l-a', 'l-b', 'l-c']);
    });

    it('puts lines without a description after described ones whatever the input order', () => {
      const ids = ['n1', 'd1', 'n2', 'd2', 'n3', 'd3'];
      const b = breakdown({
        lines: ids.map((id) => line(id, { itemId: 'wi-1' })),
        items: [item('wi-1', 'T', null)],
        meta: [
          ['d1', { description: 'b' }],
          ['d2', { description: 'a' }],
          ['d3', { description: 'c' }],
        ],
      });
      expect(b.lines.map((l) => l.id)).toEqual(['d2', 'd1', 'd3', 'n1', 'n2', 'n3']);
    });

    it('has no no-category row when every line has a known category', () => {
      const b = breakdown({
        lines: [line('l1', { budgetCategoryId: 'bc-1' })],
        categories: [{ id: 'bc-1', name: 'C', translationKey: null, sortOrder: 0 }],
      });
      expect(b.byCategory.map((r) => r.budgetCategoryId)).toEqual(['bc-1']);
    });
  });

  describe('grants', () => {
    const grant: MoneyGrantInput = {
      id: 'sp-1',
      name: 'Grant One',
      status: 'approved',
      reductionType: 'percentage',
      reductionValue: 10,
      maximumAmount: null,
      includesNoCategoryItems: true,
      categoryIds: [],
      linkedItemKeys: ['work_item:wi-1'],
    };

    it('rolls counted grant shares into lines, items, views and the total, and derives afterGrants', () => {
      const b = breakdown({
        lines: [
          line('l1', { itemId: 'wi-1', planned: 1000, budgetSourceId: 'bs-1' }),
          line('l2', { itemId: 'wi-2', planned: 500 }),
        ],
        items: [item('wi-1', 'Task One', 'ar-a'), item('wi-2', 'Task Two', null)],
        areas: [area('ar-a', 'A', null)],
        sources: [{ id: 'bs-1', name: 'Loan' }],
        grants: [grant],
      });
      const l1 = b.lines.find((l) => l.id === 'l1')!;
      expect(l1.figures.expectedGrants.expected).toBe(100);
      expect(l1.figures.afterGrants.expected).toBe(900);
      expect(b.lines.find((l) => l.id === 'l2')!.figures.expectedGrants.expected).toBe(0);
      expect(b.items.find((i) => i.id === 'wi-1')!.figures.expectedGrants.expected).toBe(100);
      expect(b.byArea[0]!.figures.expectedGrants.expected).toBe(100);
      expect(b.bySource[0]!.figures.afterGrants.expected).toBe(900);
      expect(b.total.expectedGrants.expected).toBe(100);
      expect(b.total.afterGrants.expected).toBe(1400);
    });
  });

  describe('figures', () => {
    it('grosses a net line up with the configured VAT rate before the margin', () => {
      const net = breakdown({
        lines: [line('l1', { planned: 100, includesVat: false })],
        vat: 0.19,
      });
      expect(net.total.expectedCost).toEqual({ expected: 119, best: 119, worst: 119 });
      const net20 = breakdown({
        lines: [line('l1', { planned: 100, includesVat: false })],
        vat: 0.2,
      });
      expect(net20.total.expectedCost.expected).toBe(120);
      const gross = breakdown({ lines: [line('l1', { planned: 100, includesVat: true })] });
      expect(gross.total.expectedCost.expected).toBe(100);
    });

    it('applies the confidence margin to estimates', () => {
      const b = breakdown({ lines: [line('l1', { planned: 1000, confidence: 'own_estimate' })] });
      expect(b.total.expectedCost).toEqual({ expected: 1000, best: 800, worst: 1200 });
    });

    it('counts a linked line (offer included) at face value, with no margin (AC9)', () => {
      const b = breakdown({
        lines: [line('l1', { planned: 999, confidence: 'quote', itemizedCents: 23800 })],
        invoices: [{ id: 'q1', amount: 25000, status: 'quotation', itemizedCents: 23800 }],
      });
      expect(b.lines[0]!.figures.expectedCost).toEqual({ expected: 238, best: 238, worst: 238 });
    });

    it('derives afterGrants and Not yet paid per scenario and never clamps Not yet paid', () => {
      const payments: LinePayments = {
        byLine: new Map([['l1', { paid: 150000, stillToPay: 0 }]]),
        unsplit: { paid: 0, stillToPay: 0 },
      };
      const b = breakdown({
        lines: [line('l1', { planned: 1000, confidence: 'own_estimate' })],
        payments,
      });
      expect(b.lines[0]!.figures.paid).toBe(1500);
      // cost 1000 / 800 / 1200 less paid 1500: negative in two scenarios
      expect(b.lines[0]!.figures.notYetPaid).toEqual({ expected: -500, best: -700, worst: -300 });
      expect(b.total.notYetPaid.expected).toBe(-500);
      expect(b.lines[0]!.figures.afterGrants).toEqual({ expected: 1000, best: 800, worst: 1200 });
    });

    it('never returns a negative zero', () => {
      const b = breakdown({ lines: [line('l1', { planned: 0 })] });
      expect(Object.is(b.total.expectedCost.expected, -0)).toBe(false);
      expect(Object.is(b.total.notYetPaid.expected, -0)).toBe(false);
    });
  });

  describe('views', () => {
    it('by area: depth-first by (sort order, name, id), child rolled into the parent, empty subtrees dropped', () => {
      const b = breakdown({
        lines: [
          line('l1', { itemId: 'wi-1', planned: 100 }),
          line('l2', { itemId: 'wi-2', planned: 200 }),
          line('l3', { itemId: 'wi-3', planned: 400 }),
        ],
        areas: [
          area('ar-b', 'B Area', null, 1),
          area('ar-a', 'A Area', null, 0),
          area('ar-a2', 'Child Two', 'ar-a', 5),
          area('ar-a1', 'Child One', 'ar-a', 5),
          area('ar-empty', 'Empty', null, 2),
          area('ar-empty-child', 'Empty Child', 'ar-empty', 0),
          area('ar-tie-b', 'Same', null, 9),
          area('ar-tie-a', 'Same', null, 9),
          area('ar-orphan-parent', 'Orphan Parent', 'ar-missing', 8),
        ],
        items: [
          item('wi-1', 'T1', 'ar-a1'),
          item('wi-2', 'T2', 'ar-a'),
          item('wi-3', 'T3', 'ar-b'),
        ],
      });
      expect(b.byArea.map((r) => r.areaId)).toEqual(['ar-a', 'ar-a1', 'ar-b']);
      expect(b.byArea.map((r) => r.parentId)).toEqual([null, 'ar-a', null]);
      expect(expected(b.byArea[0]!.figures.expectedCost)).toBe(300);
      expect(expected(b.byArea[1]!.figures.expectedCost)).toBe(100);
      expect(expected(b.byArea[2]!.figures.expectedCost)).toBe(400);
      expect(b.noArea).toBeNull();
    });

    it('treats an unknown area as no area, and puts orphans in no-area and orphanLines', () => {
      const b = breakdown({
        lines: [
          line('l1', { itemId: 'wi-1', planned: 100 }),
          line('l2', { itemId: null, planned: 50 }),
          line('l3', { itemId: 'wi-2', planned: 25 }),
        ],
        areas: [area('ar-a', 'A', null)],
        items: [item('wi-1', 'T1', 'ar-gone'), item('wi-2', 'T2', 'ar-a')],
      });
      expect(b.noArea?.expectedCost.expected).toBe(150);
      expect(b.orphanLines?.expectedCost.expected).toBe(50);
      expect(b.byArea.map((r) => r.areaId)).toEqual(['ar-a']);
      expect(b.items.find((i) => i.id === 'wi-1')!.areaId).toBeNull();
    });

    it('has no no-area and no orphan row when none exists', () => {
      const b = breakdown({
        lines: [line('l1', { itemId: 'wi-1' })],
        areas: [area('ar-a', 'A', null)],
        items: [item('wi-1', 'T1', 'ar-a')],
      });
      expect(b.noArea).toBeNull();
      expect(b.orphanLines).toBeNull();
    });

    it('a linked item missing from the items list falls in no-area', () => {
      const b = breakdown({ lines: [line('l1', { itemId: 'wi-ghost', planned: 10 })] });
      expect(b.noArea?.expectedCost.expected).toBe(10);
      expect(b.orphanLines).toBeNull();
    });

    it('by type: orphan work-item lines count under work_items', () => {
      const b = breakdown({
        lines: [
          line('l1', { itemId: null, planned: 40 }),
          line('l2', { kind: 'household_item', itemId: 'hi-1', planned: 60 }),
        ],
        items: [item('hi-1', 'Purchase', null, 'household_item')],
      });
      expect(b.byType.work_items.expectedCost.expected).toBe(40);
      expect(b.byType.household_items.expectedCost.expected).toBe(60);
    });

    it('by category: sort order, name, id; a line without or with an unknown category goes last as null', () => {
      const b = breakdown({
        lines: [
          line('l1', { budgetCategoryId: 'bc-b', planned: 1 }),
          line('l2', { budgetCategoryId: 'bc-a', planned: 2 }),
          line('l3', { budgetCategoryId: null, planned: 4 }),
          line('l4', { budgetCategoryId: 'bc-gone', planned: 8 }),
          line('l5', { budgetCategoryId: 'bc-c', planned: 16 }),
          line('l6', { budgetCategoryId: 'bc-d', planned: 32 }),
        ],
        categories: [
          { id: 'bc-b', name: 'Same', translationKey: 'k.b', sortOrder: 1 },
          { id: 'bc-a', name: 'Same', translationKey: null, sortOrder: 1 },
          { id: 'bc-c', name: 'First', translationKey: null, sortOrder: 0 },
          { id: 'bc-d', name: 'Unused', translationKey: null, sortOrder: 5 },
          { id: 'bc-unused', name: 'Unused Two', translationKey: null, sortOrder: 6 },
        ],
      });
      expect(b.byCategory.map((r) => r.budgetCategoryId)).toEqual([
        'bc-c',
        'bc-a',
        'bc-b',
        'bc-d',
        null,
      ]);
      expect(b.byCategory[2]).toMatchObject({ name: 'Same', translationKey: 'k.b' });
      const none = b.byCategory.at(-1)!;
      expect(none).toMatchObject({ name: null, translationKey: null });
      expect(none.figures.expectedCost.expected).toBe(12);
    });

    it('by source: name order, the null source last, an unknown source id counts as none', () => {
      const b = breakdown({
        lines: [
          line('l1', { budgetSourceId: 'bs-2', planned: 1 }),
          line('l2', { budgetSourceId: 'bs-1', planned: 2 }),
          line('l3', { budgetSourceId: null, planned: 4 }),
          line('l4', { budgetSourceId: 'bs-gone', planned: 8 }),
        ],
        sources: [
          { id: 'bs-1', name: 'Alpha' },
          { id: 'bs-2', name: 'Beta' },
          { id: 'bs-3', name: 'Gamma' },
        ],
      });
      expect(b.bySource.map((r) => r.budgetSourceId)).toEqual(['bs-1', 'bs-2', null]);
      expect(b.bySource.map((r) => r.name)).toEqual(['Alpha', 'Beta', null]);
      expect(b.bySource.at(-1)!.figures.expectedCost.expected).toBe(12);
      expect(b.sourceOptions.map((s) => s.id)).toEqual(['bs-1', 'bs-2', 'bs-3']);
      expect(b.hasUnassignedLines).toBe(true);
    });

    it('reports hasUnassignedLines false when every line has a source', () => {
      const b = breakdown({
        lines: [line('l1', { budgetSourceId: 'bs-1' })],
        sources: [{ id: 'bs-1', name: 'Alpha' }],
      });
      expect(b.hasUnassignedLines).toBe(false);
      expect(b.bySource.map((r) => r.budgetSourceId)).toEqual(['bs-1']);
    });

    it('a source filter removes lines from every view but keeps Not yet split and Paid unfiltered', () => {
      const payments: LinePayments = {
        byLine: new Map([['l1', { paid: 5000, stillToPay: 0 }]]),
        unsplit: { paid: 700, stillToPay: 300 },
      };
      const full = breakdown({
        lines: [
          line('l1', { budgetSourceId: 'bs-1', planned: 100 }),
          line('l2', { budgetSourceId: 'bs-2', planned: 200 }),
        ],
        sources: [
          { id: 'bs-1', name: 'A' },
          { id: 'bs-2', name: 'B' },
        ],
        invoices: [{ id: 'r1', amount: 500, status: 'paid', itemizedCents: 0 }],
        payments,
      });
      const filtered = breakdown({
        lines: [
          line('l1', { budgetSourceId: 'bs-1', planned: 100 }),
          line('l2', { budgetSourceId: 'bs-2', planned: 200 }),
        ],
        sources: [
          { id: 'bs-1', name: 'A' },
          { id: 'bs-2', name: 'B' },
        ],
        invoices: [{ id: 'r1', amount: 500, status: 'paid', itemizedCents: 0 }],
        payments,
        includeLine: (l) => l.budgetSourceId !== 'bs-2',
      });
      expect(full.total.expectedCost.expected).toBe(800); // 300 + not yet split 500
      expect(filtered.total.expectedCost.expected).toBe(600);
      expect(filtered.notYetSplit).toEqual(full.notYetSplit);
      expect(filtered.bySource.map((r) => r.budgetSourceId)).toEqual(['bs-1']);
      expect(filtered.sourceOptions).toEqual(full.sourceOptions);
    });
  });

  describe('not yet split and totals', () => {
    it('notYetSplit is null when cost, Paid and Still to pay are all zero', () => {
      const b = breakdown({ lines: [line('l1')] });
      expect(b.notYetSplit).toBeNull();
    });

    it('notYetSplit is present for unsplit payments alone', () => {
      const b = breakdown({
        lines: [line('l1')],
        payments: { byLine: new Map(), unsplit: { paid: 0, stillToPay: 100 } },
      });
      expect(b.notYetSplit?.stillToPay).toBe(1);
      expect(b.notYetSplit?.expectedCost.expected).toBe(0);
    });

    it('notYetSplit is present for unsplit Paid alone', () => {
      const b = breakdown({
        lines: [line('l1')],
        payments: { byLine: new Map(), unsplit: { paid: 100, stillToPay: 0 } },
      });
      expect(b.notYetSplit?.paid).toBe(1);
    });

    it('notYetSplit carries the unsplit remainder as cost in every scenario, no grants', () => {
      const b = breakdown({
        lines: [line('l1', { planned: 1000, confidence: 'quote', itemizedCents: 80000 })],
        invoices: [{ id: 'r1', amount: 1000, status: 'paid', itemizedCents: 80000 }],
        payments: { byLine: new Map(), unsplit: { paid: 20000, stillToPay: 0 } },
      });
      expect(b.notYetSplit).toMatchObject({
        expectedCost: { expected: 200, best: 200, worst: 200 },
        expectedGrants: { expected: 0, best: 0, worst: 0 },
        paid: 200,
        stillToPay: 0,
        notYetPaid: { expected: 0, best: 0, worst: 0 },
      });
    });

    it('total = Σ lines + notYetSplit for every field and scenario, and every view adds up to it', () => {
      const payments: LinePayments = {
        byLine: new Map([
          ['l1', { paid: 10000, stillToPay: 2500 }],
          ['l2', { paid: 3333, stillToPay: 0 }],
          ['l3', { paid: 0, stillToPay: 777 }],
        ]),
        unsplit: { paid: 4000, stillToPay: 1500 },
      };
      const b = breakdown({
        lines: [
          line('l1', {
            itemId: 'wi-1',
            budgetSourceId: 'bs-1',
            budgetCategoryId: 'bc-1',
            planned: 1000,
            confidence: 'own_estimate',
          }),
          line('l2', {
            kind: 'household_item',
            itemId: 'hi-1',
            budgetSourceId: null,
            planned: 250.55,
            includesVat: false,
          }),
          line('l3', {
            itemId: null,
            budgetSourceId: 'bs-2',
            planned: 80,
            confidence: 'professional_estimate',
          }),
        ],
        items: [item('wi-1', 'T', 'ar-a'), item('hi-1', 'P', null, 'household_item')],
        areas: [area('ar-a', 'A', null)],
        categories: [{ id: 'bc-1', name: 'C', translationKey: null, sortOrder: 0 }],
        sources: [
          { id: 'bs-1', name: 'One' },
          { id: 'bs-2', name: 'Two' },
        ],
        invoices: [{ id: 'r1', amount: 300, status: 'paid', itemizedCents: 10000 }],
        payments,
      });
      const cents = (n: number) => Math.round(n * 100);
      const keys = ['expectedCost', 'expectedGrants', 'afterGrants', 'notYetPaid'] as const;
      const sums = (
        rows: Array<{ figures: BudgetBreakdown['total'] } | BudgetBreakdown['total']>,
      ) => rows.map((r) => ('figures' in r ? r.figures : r));
      const views: Record<string, BudgetBreakdown['total'][]> = {
        lines: sums(b.lines),
        area: [
          ...sums(b.byArea.filter((r) => r.parentId === null)),
          ...(b.noArea ? [b.noArea] : []),
        ],
        type: [b.byType.work_items, b.byType.household_items],
        category: sums(b.byCategory),
        source: sums(b.bySource),
      };
      for (const [name, rows] of Object.entries(views)) {
        const extra = b.notYetSplit ? [b.notYetSplit] : [];
        for (const key of keys) {
          for (const scen of ['expected', 'best', 'worst'] as const) {
            const sum = [...rows, ...extra].reduce((s, r) => s + cents(r[key][scen]), 0);
            expect([name, key, scen, sum]).toEqual([name, key, scen, cents(b.total[key][scen])]);
          }
        }
        for (const key of ['paid', 'stillToPay'] as const) {
          const sum = [...rows, ...extra].reduce((s, r) => s + cents(r[key]), 0);
          expect([name, key, sum]).toEqual([name, key, cents(b.total[key])]);
        }
      }
      expect(cents(b.total.paid)).toBe(10000 + 3333 + 4000);
      expect(cents(b.total.stillToPay)).toBe(2500 + 777 + 1500);
    });
  });
});
