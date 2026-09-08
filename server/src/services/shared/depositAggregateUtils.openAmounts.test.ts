import { describe, it, expect } from '@jest/globals';
import { computeOpenAmounts, type InvoiceDepositRow } from './depositAggregateUtils.js';

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
