import { describe, it, expect } from '@jest/globals';
import {
  computeOpenAmounts,
  computeOpenPaymentItems,
  type InvoiceDepositRow,
  type OpenPaymentItem,
  type OpenPaymentRow,
} from './depositAggregateUtils.js';
import { toCents } from './money.js';

/**
 * Story #2046: computeOpenAmounts unit tests.
 *
 * Reuses the InvoiceDepositRow row shape (invoices LEFT JOIN invoice_deposits),
 * one row per (invoice, deposit) pair — deposit columns null when the invoice
 * has no deposits, or to represent a bare invoice row before any deposit join.
 */

function makeRow(
  invoiceId: string,
  invoiceAmount: number,
  invoiceStatus: string,
  deposit?: { id: string; amount: number; status: string; entryType?: string },
): InvoiceDepositRow {
  return {
    invoice_id: invoiceId,
    invoice_amount: invoiceAmount,
    invoice_status: invoiceStatus,
    deposit_id: deposit?.id ?? null,
    deposit_amount: deposit?.amount ?? null,
    deposit_status: deposit?.status ?? null,
    deposit_entry_type: deposit ? (deposit.entryType ?? 'deposit') : null,
  };
}

describe('computeOpenAmounts', () => {
  it('1: no rows → all zeros, empty map', () => {
    const result = computeOpenAmounts([]);
    expect(result.byInvoice.size).toBe(0);
    expect(result.openPayable).toEqual({ count: 0, totalAmount: 0 });
    expect(result.refundsDue).toEqual({ count: 0, totalAmount: 0 });
  });

  it('2: pending invoice, no deposits → openAmount === amount, counted in openPayable', () => {
    const rows = [makeRow('inv-1', 500, 'pending')];
    const result = computeOpenAmounts(rows);
    expect(result.byInvoice.get('inv-1')).toBe(500);
    expect(result.openPayable).toEqual({ count: 1, totalAmount: 500 });
  });

  it('3: INV-A shape (pending 15000, 2 pending 5000 deposits + 1 paid 5000 deposit) → openAmount 10000; the paid deposit reduces residual but contributes nothing itself', () => {
    const rows = [
      makeRow('inv-a', 15000, 'pending', { id: 'd1', amount: 5000, status: 'pending' }),
      makeRow('inv-a', 15000, 'pending', { id: 'd2', amount: 5000, status: 'pending' }),
      makeRow('inv-a', 15000, 'pending', { id: 'd3', amount: 5000, status: 'paid' }),
    ];
    const result = computeOpenAmounts(rows);
    // residual = max(0, 15000 - (5000+5000+5000)) = 0
    // pendingDepositSum = 5000 + 5000 = 10000
    expect(result.byInvoice.get('inv-a')).toBe(10000);

    // Without the paid deposit, residual would be max(0, 15000-10000)=5000, plus
    // pendingDepositSum 10000 → 15000. Proves the paid deposit's ONLY effect is
    // reducing the residual (via depositTypeSumAllStatuses), not contributing itself.
    const withoutPaid = computeOpenAmounts([rows[0]!, rows[1]!]);
    expect(withoutPaid.byInvoice.get('inv-a')).toBe(15000);
  });

  it('4: INV-C shape (quotation, 40000 face value, one 8000 pending deposit) → openAmount 8000; the face value contributes nothing', () => {
    const rows = [
      makeRow('inv-c', 40000, 'quotation', { id: 'd1', amount: 8000, status: 'pending' }),
    ];
    const result = computeOpenAmounts(rows);
    // residual = 0 because status !== 'pending' (not because of clamping)
    expect(result.byInvoice.get('inv-c')).toBe(8000);
  });

  it('5: paid invoice with a pending deposit → residual 0, openAmount = pending deposit only (guards a status !== "quotation" shortcut)', () => {
    const rows = [makeRow('inv-1', 1000, 'paid', { id: 'd1', amount: 300, status: 'pending' })];
    const result = computeOpenAmounts(rows);
    expect(result.byInvoice.get('inv-1')).toBe(300);
  });

  it('6: over-deposited invoice (Σ deposits > amount, pending invoice) → residual clamped at 0, never negative', () => {
    const rows = [makeRow('inv-1', 1000, 'pending', { id: 'd1', amount: 1500, status: 'pending' })];
    const result = computeOpenAmounts(rows);
    // residual = max(0, 1000-1500) = 0; pendingDepositSum = 1500 → openAmount 1500
    expect(result.byInvoice.get('inv-1')).toBe(1500);
  });

  it('7: pending refund only (INV-F shape) → openAmount unaffected, refundsDue reports it separately', () => {
    const rows = [
      makeRow('inv-f', 4000, 'pending', {
        id: 'r1',
        amount: 1200,
        status: 'pending',
        entryType: 'refund',
      }),
    ];
    const result = computeOpenAmounts(rows);
    // residual = max(0, 4000-0) = 4000 (refund excluded from depositTypeSumAllStatuses); no deposit-type entries.
    expect(result.byInvoice.get('inv-f')).toBe(4000);
    expect(result.refundsDue).toEqual({ count: 1, totalAmount: 1200 });
  });

  it('8: paid or claimed refund is excluded from refundsDue and does not affect openAmount', () => {
    const paidRefund = computeOpenAmounts([
      makeRow('inv-1', 1000, 'pending', {
        id: 'r1',
        amount: 300,
        status: 'paid',
        entryType: 'refund',
      }),
    ]);
    expect(paidRefund.byInvoice.get('inv-1')).toBe(1000);
    expect(paidRefund.refundsDue).toEqual({ count: 0, totalAmount: 0 });

    const claimedRefund = computeOpenAmounts([
      makeRow('inv-2', 1000, 'pending', {
        id: 'r2',
        amount: 300,
        status: 'claimed',
        entryType: 'refund',
      }),
    ]);
    expect(claimedRefund.byInvoice.get('inv-2')).toBe(1000);
    expect(claimedRefund.refundsDue).toEqual({ count: 0, totalAmount: 0 });
  });

  it('9: openPayable.count excludes invoices whose openAmount is exactly 0 (byInvoice entry still present)', () => {
    // Quotation invoice with only a paid deposit → residual 0 (not pending), no pending deposits → openAmount 0.
    const rows = [makeRow('inv-1', 500, 'quotation', { id: 'd1', amount: 500, status: 'paid' })];
    const result = computeOpenAmounts(rows);
    expect(result.byInvoice.get('inv-1')).toBe(0);
    expect(result.byInvoice.has('inv-1')).toBe(true);
    expect(result.openPayable).toEqual({ count: 0, totalAmount: 0 });
  });

  it('10: rounding — a .005-class residual rounds to cents, not whole units', () => {
    // 73333.5/100 → Math.round(73333.5) = 73334 → 733.34 (never 733, never 733.33)
    const rows = [makeRow('inv-1', 733.335, 'pending')];
    const result = computeOpenAmounts(rows);
    expect(result.byInvoice.get('inv-1')).toBe(733.34);
    expect(result.byInvoice.get('inv-1')).not.toBe(733);
    expect(result.byInvoice.get('inv-1')).not.toBe(733.33);
  });

  it('11: LEFT-JOIN fan-out — the same deposit_id appearing on multiple rows is counted once', () => {
    // amount=1000, one 900-pending deposit duplicated across two rows.
    // Deduped (correct): residual=max(0,1000-900)=100; pendingDepositSum=900 → 1000.
    // Double-counted: depositTypeSumAllStatuses=1800 → residual=0; pendingDepositSum=1800 → 1800.
    const rows = [
      makeRow('inv-2', 1000, 'pending', { id: 'd1', amount: 900, status: 'pending' }),
      makeRow('inv-2', 1000, 'pending', { id: 'd1', amount: 900, status: 'pending' }),
    ];
    const result = computeOpenAmounts(rows);
    expect(result.byInvoice.get('inv-2')).toBe(1000);
    expect(result.byInvoice.get('inv-2')).not.toBe(1800);
  });

  it('12: full fixture set (INV A-F) → openPayable {count:5, totalAmount:25310}; Σ byInvoice === openPayable.totalAmount', () => {
    const rows: InvoiceDepositRow[] = [
      // INV-A: pending 15000, 2 pending deposits (5000 each) + 1 paid deposit (5000) → 10000
      makeRow('inv-a', 15000, 'pending', { id: 'a-d1', amount: 5000, status: 'pending' }),
      makeRow('inv-a', 15000, 'pending', { id: 'a-d2', amount: 5000, status: 'pending' }),
      makeRow('inv-a', 15000, 'pending', { id: 'a-d3', amount: 5000, status: 'paid' }),
      // INV-B: pending 2310, no deposits → 2310
      makeRow('inv-b', 2310, 'pending'),
      // INV-C: quotation 40000, 1 pending deposit 8000 → 8000
      makeRow('inv-c', 40000, 'quotation', { id: 'c-d1', amount: 8000, status: 'pending' }),
      // INV-D: paid, no pending deposits/refunds → excluded (openAmount 0)
      makeRow('inv-d', 5000, 'paid', { id: 'd-d1', amount: 5000, status: 'paid' }),
      // INV-E: pending 1000, no deposits → 1000
      makeRow('inv-e', 1000, 'pending'),
      // INV-F: pending 4000, no deposits, 1 pending refund 1200 → openAmount 4000, refundsDue 1200
      makeRow('inv-f', 4000, 'pending', {
        id: 'f-r1',
        amount: 1200,
        status: 'pending',
        entryType: 'refund',
      }),
    ];

    const result = computeOpenAmounts(rows);

    expect(result.byInvoice.get('inv-a')).toBe(10000);
    expect(result.byInvoice.get('inv-b')).toBe(2310);
    expect(result.byInvoice.get('inv-c')).toBe(8000);
    expect(result.byInvoice.get('inv-d')).toBe(0);
    expect(result.byInvoice.get('inv-e')).toBe(1000);
    expect(result.byInvoice.get('inv-f')).toBe(4000);

    expect(result.openPayable).toEqual({ count: 5, totalAmount: 25310 });
    expect(result.refundsDue).toEqual({ count: 1, totalAmount: 1200 });

    // AC15 invariant: sum of ALL byInvoice values (including D's 0) equals the summary total.
    const sum = Array.from(result.byInvoice.values()).reduce((a, b) => a + b, 0);
    expect(sum).toBe(result.openPayable.totalAmount);
  });
});

describe('computeOpenAmounts over-deposited invoices (#2188)', () => {
  it('Σ deposits > amount on a pending invoice: residual is 0 and openAmount is never negative or NaN', () => {
    const rows = [
      makeRow('inv-1', 1000, 'pending', { id: 'd1', amount: 800, status: 'paid' }),
      makeRow('inv-1', 1000, 'pending', { id: 'd2', amount: 700, status: 'pending' }),
    ];
    const result = computeOpenAmounts(rows);

    // residual = max(0, 1000 - 1500) = 0; only the pending deposit (700) is still payable
    expect(result.byInvoice.get('inv-1')).toBe(700);
    expect(result.openPayable).toEqual({ count: 1, totalAmount: 700 });
  });

  it('all deposits paid/claimed and above the amount: openAmount is exactly 0 and not counted as open', () => {
    const rows = [
      makeRow('inv-1', 1000, 'pending', { id: 'd1', amount: 600, status: 'paid' }),
      makeRow('inv-1', 1000, 'pending', { id: 'd2', amount: 600, status: 'claimed' }),
    ];
    const result = computeOpenAmounts(rows);

    expect(result.byInvoice.get('inv-1')).toBe(0);
    expect(Object.is(result.byInvoice.get('inv-1'), -0)).toBe(false);
    expect(result.openPayable).toEqual({ count: 0, totalAmount: 0 });
  });
});

// ─── computeOpenPaymentItems (#2229, attention rules N4-N6) ──────────────────
//
// Mutations these tests catch: a final item on a non-pending invoice, a missing progress item on
// an offer, a refund producing an item, fanned-out join rows counted twice, a residual that
// ignores paid/claimed entries, Σ items drifting from computeOpenAmounts (= "still to pay").

function openRow(
  invoiceId: string,
  amount: number,
  status: string,
  o: {
    date?: string;
    due?: string | null;
    number?: string | null;
    vendor?: string;
    vendorId?: string;
    deposit?: {
      id: string;
      amount: number;
      status: string;
      entryType?: string;
      due?: string | null;
    };
  } = {},
): OpenPaymentRow {
  return {
    invoice_id: invoiceId,
    invoice_amount: amount,
    invoice_status: status,
    deposit_id: o.deposit?.id ?? null,
    deposit_amount: o.deposit?.amount ?? null,
    deposit_status: o.deposit?.status ?? null,
    deposit_entry_type: o.deposit ? (o.deposit.entryType ?? 'deposit') : null,
    invoice_date: o.date ?? '2026-02-01',
    invoice_due_date: o.due === undefined ? null : o.due,
    invoice_number: o.number === undefined ? `NR-${invoiceId}` : o.number,
    vendor_id: o.vendorId ?? 'v-a',
    vendor_name: o.vendor ?? 'Company A',
    deposit_due_date: o.deposit
      ? o.deposit.due === undefined
        ? '2026-03-05'
        : o.deposit.due
      : null,
  };
}

describe('computeOpenPaymentItems', () => {
  it('no rows -> no items', () => {
    expect(computeOpenPaymentItems([])).toEqual([]);
  });

  it('fills vendorId from the row vendor_id for final and progress items (#2230)', () => {
    const items = computeOpenPaymentItems([
      openRow('inv-1', 1000, 'pending', { vendorId: 'v-x', vendor: 'Company X' }),
      openRow('inv-2', 2000, 'pending', {
        vendorId: 'v-y',
        vendor: 'Company Y',
        deposit: { id: 'dep-1', amount: 500, status: 'pending' },
      }),
    ]);
    expect(items.map((i) => [i.invoiceId, i.kind, i.vendorId, i.vendorName])).toEqual([
      ['inv-1', 'final', 'v-x', 'Company X'],
      ['inv-2', 'final', 'v-y', 'Company Y'],
      ['inv-2', 'progress', 'v-y', 'Company Y'],
    ]);
  });

  it('a pending invoice with no deposits is one final item with the invoice due date and labels', () => {
    const items = computeOpenPaymentItems([
      openRow('inv-1', 1000, 'pending', { due: '2026-03-01', date: '2026-02-20', number: 'AB-1' }),
    ]);
    expect(items).toEqual([
      {
        kind: 'final',
        invoiceId: 'inv-1',
        depositId: null,
        invoiceStatus: 'pending',
        invoiceNumber: 'AB-1',
        vendorId: 'v-a',
        vendorName: 'Company A',
        invoiceDate: '2026-02-20',
        dueDate: '2026-03-01',
        amount: 1000,
      },
    ]);
  });

  it('keeps a null invoice number and a null due date', () => {
    const [item] = computeOpenPaymentItems([openRow('inv-1', 10, 'pending', { number: null })]);
    expect(item).toMatchObject({ invoiceNumber: null, dueDate: null });
  });

  it.each(['paid', 'claimed', 'quotation'])('no final item for a %s invoice', (status) => {
    expect(computeOpenPaymentItems([openRow('inv-1', 1000, status)])).toEqual([]);
  });

  it('the final residual is amount minus every non-refund entry of any status', () => {
    // 3000 with deposits 400 pending + 500 paid: final residual 2100, plus the pending 400
    const items = computeOpenPaymentItems([
      openRow('inv-4', 3000, 'pending', {
        deposit: { id: 'dep-1', amount: 400, status: 'pending' },
      }),
      openRow('inv-4', 3000, 'pending', { deposit: { id: 'dep-2', amount: 500, status: 'paid' } }),
    ]);
    expect(items.map((i) => [i.kind, i.depositId, i.amount])).toEqual([
      ['final', null, 2100],
      ['progress', 'dep-1', 400],
    ]);
  });

  it('no final item when deposits cover the invoice (residual 0), progress items remain', () => {
    const items = computeOpenPaymentItems([
      openRow('inv-a', 15000, 'pending', {
        deposit: { id: 'd1', amount: 5000, status: 'pending' },
      }),
      openRow('inv-a', 15000, 'pending', {
        deposit: { id: 'd2', amount: 5000, status: 'pending' },
      }),
      openRow('inv-a', 15000, 'pending', { deposit: { id: 'd3', amount: 5000, status: 'paid' } }),
    ]);
    expect(items.map((i) => [i.kind, i.depositId, i.amount])).toEqual([
      ['progress', 'd1', 5000],
      ['progress', 'd2', 5000],
    ]);
  });

  it('an over-deposited invoice has no negative or NaN residual item', () => {
    const items = computeOpenPaymentItems([
      openRow('inv-1', 1000, 'pending', { deposit: { id: 'd1', amount: 800, status: 'paid' } }),
      openRow('inv-1', 1000, 'pending', { deposit: { id: 'd2', amount: 700, status: 'pending' } }),
    ]);
    expect(items.map((i) => [i.kind, i.amount])).toEqual([['progress', 700]]);
  });

  it('an offer (quotation) yields progress items for pending deposits and never a final item', () => {
    const items = computeOpenPaymentItems([
      openRow('off-1', 2000, 'quotation', {
        deposit: { id: 'dep-2', amount: 300, status: 'pending', due: '2026-03-14' },
      }),
      openRow('off-1', 2000, 'quotation', {
        deposit: { id: 'dep-3', amount: 100, status: 'paid' },
      }),
    ]);
    expect(items).toEqual([
      expect.objectContaining({
        kind: 'progress',
        invoiceStatus: 'quotation',
        depositId: 'dep-2',
        dueDate: '2026-03-14',
        amount: 300,
      }),
    ]);
  });

  it('a progress item carries the deposit due date; paid and claimed entries produce none', () => {
    const items = computeOpenPaymentItems([
      openRow('inv-1', 100, 'paid', { deposit: { id: 'd1', amount: 40, status: 'claimed' } }),
      openRow('inv-1', 100, 'paid', {
        deposit: { id: 'd2', amount: 60, status: 'pending', due: '2026-04-01' },
      }),
    ]);
    expect(items).toEqual([expect.objectContaining({ depositId: 'd2', dueDate: '2026-04-01' })]);
  });

  it('pending refunds produce no item and do not reduce the final residual', () => {
    const items = computeOpenPaymentItems([
      openRow('inv-4', 1000, 'pending', {
        deposit: { id: 'ref-1', amount: 300, status: 'pending', entryType: 'refund' },
      }),
    ]);
    expect(items.map((i) => [i.kind, i.amount])).toEqual([['final', 1000]]);
  });

  it('dedupes deposits fanned out by the join (the same deposit on several rows)', () => {
    const dep = { id: 'dep-1', amount: 400, status: 'pending' };
    const items = computeOpenPaymentItems([
      openRow('inv-1', 1000, 'pending', { deposit: dep }),
      openRow('inv-1', 1000, 'pending', { deposit: dep }),
      openRow('inv-1', 1000, 'pending', { deposit: dep }),
    ]);
    expect(items.map((i) => [i.kind, i.amount])).toEqual([
      ['final', 600],
      ['progress', 400],
    ]);
  });

  it('a deposit with a null entry type counts as a deposit', () => {
    const row = openRow('inv-1', 1000, 'pending', {
      deposit: { id: 'd1', amount: 250, status: 'pending' },
    });
    row.deposit_entry_type = null;
    const items = computeOpenPaymentItems([row]);
    expect(items.map((i) => [i.kind, i.amount])).toEqual([
      ['final', 750],
      ['progress', 250],
    ]);
  });

  it('works in integer cents (no floating-point drift)', () => {
    const items = computeOpenPaymentItems([
      openRow('inv-1', 100.1, 'pending', { deposit: { id: 'd1', amount: 0.2, status: 'pending' } }),
    ]);
    expect(items.map((i) => i.amount)).toEqual([99.9, 0.2]);
  });

  it('orders by invoice id, then final before progress, then deposit id', () => {
    const items = computeOpenPaymentItems([
      openRow('b', 100, 'pending', { deposit: { id: 'z', amount: 10, status: 'pending' } }),
      openRow('b', 100, 'pending', { deposit: { id: 'a', amount: 10, status: 'pending' } }),
      openRow('a', 100, 'pending'),
    ]);
    expect(items.map((i) => `${i.invoiceId}:${i.kind}:${i.depositId}`)).toEqual([
      'a:final:null',
      'b:final:null',
      'b:progress:a',
      'b:progress:z',
    ]);
  });

  it('per invoice, Σ item cents equals computeOpenAmounts (a seeded random set), so Σ all = still to pay', () => {
    let seed = 20260310;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
    const rows: OpenPaymentRow[] = [];
    for (let i = 0; i < 120; i++) {
      const id = `inv-${String(i).padStart(3, '0')}`;
      const status = pick(['pending', 'pending', 'paid', 'claimed', 'quotation']);
      const amount = Math.round(rnd() * 500000) / 100;
      const n = Math.floor(rnd() * 4);
      if (n === 0) rows.push(openRow(id, amount, status));
      for (let d = 0; d < n; d++) {
        const row = openRow(id, amount, status, {
          deposit: {
            id: `${id}-d${d}`,
            amount: Math.round(rnd() * 200000) / 100,
            status: pick(['pending', 'paid', 'claimed']),
            entryType: pick(['deposit', 'deposit', 'refund']),
            due: rnd() < 0.2 ? null : '2026-03-20',
          },
        });
        rows.push(row);
        if (rnd() < 0.3) rows.push(row); // join fan-out
      }
    }

    const items = computeOpenPaymentItems(rows);
    const open = computeOpenAmounts(rows);
    const byInvoice = new Map<string, number>();
    for (const item of items as OpenPaymentItem[]) {
      byInvoice.set(item.invoiceId, (byInvoice.get(item.invoiceId) ?? 0) + toCents(item.amount));
    }
    for (const [invoiceId, amount] of open.byInvoice) {
      expect(byInvoice.get(invoiceId) ?? 0).toBe(toCents(amount));
    }
    for (const invoiceId of byInvoice.keys()) expect(open.byInvoice.has(invoiceId)).toBe(true);
    const total = [...byInvoice.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(toCents(open.openPayable.totalAmount));
  });
});
