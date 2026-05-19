import { describe, it, expect } from '@jest/globals';
import {
  computeDepositAwareAggregates,
  computeStatusContribution,
  aggregateInvoiceStatusBreakdown,
  splitByDeposits,
  type DepositAwareRow,
  type InvoiceDepositRow,
} from './depositAggregateUtils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a DepositAwareRow for a single invoice budget line with no deposits.
 */
function makeRow(
  iblId: string,
  itemizedAmount: number,
  invoiceId: string,
  invoiceAmount: number,
  invoiceStatus: string,
  deposit?: { id: string; amount: number; status: string },
): DepositAwareRow {
  return {
    ibl_id: iblId,
    itemized_amount: itemizedAmount,
    invoice_id: invoiceId,
    invoice_amount: invoiceAmount,
    invoice_status: invoiceStatus,
    deposit_id: deposit?.id ?? null,
    deposit_amount: deposit?.amount ?? null,
    deposit_status: deposit?.status ?? null,
  };
}

// ─── computeDepositAwareAggregates ────────────────────────────────────────────

describe('computeDepositAwareAggregates', () => {
  // ─── Empty input ───────────────────────────────────────────────────────────

  describe('empty input', () => {
    it('returns all zeros for empty rows array', () => {
      const result = computeDepositAwareAggregates([]);
      expect(result).toEqual({
        actualCost: 0,
        actualCostPaid: 0,
        actualCostClaimed: 0,
        invoiceCount: 0,
      });
    });
  });

  // ─── Zero-deposit invoices (AC-2 regression) ───────────────────────────────

  describe('zero-deposit invoices (pre-deposit behavior unchanged)', () => {
    it('pending invoice: actualCost = iblAmount, actualCostPaid = 0, actualCostClaimed = 0', () => {
      const rows = [makeRow('ibl-1', 500, 'inv-1', 500, 'pending')];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(500);
      expect(result.actualCostPaid).toBe(0);
      expect(result.actualCostClaimed).toBe(0);
      expect(result.invoiceCount).toBe(1);
    });

    it('paid invoice: actualCostPaid = iblAmount, actualCostClaimed = 0', () => {
      const rows = [makeRow('ibl-1', 300, 'inv-1', 300, 'paid')];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(300);
      expect(result.actualCostPaid).toBe(300);
      expect(result.actualCostClaimed).toBe(0);
    });

    it('claimed invoice: actualCostPaid = iblAmount AND actualCostClaimed = iblAmount', () => {
      const rows = [makeRow('ibl-1', 400, 'inv-1', 400, 'claimed')];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(400);
      expect(result.actualCostPaid).toBe(400);
      expect(result.actualCostClaimed).toBe(400);
    });

    it('quotation invoice: included in actualCost (ADR-029) but excluded from actualCostPaid', () => {
      const rows = [makeRow('ibl-1', 250, 'inv-1', 250, 'quotation')];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(250); // quotation now counts toward actualCost (ADR-029)
      expect(result.actualCostPaid).toBe(0); // quotation is not paid
      expect(result.actualCostClaimed).toBe(0);
      expect(result.invoiceCount).toBe(1);
    });

    it('multiple zero-deposit invoices across multiple ibls', () => {
      const rows = [
        makeRow('ibl-1', 100, 'inv-1', 100, 'paid'),
        makeRow('ibl-2', 200, 'inv-2', 200, 'pending'),
        makeRow('ibl-3', 300, 'inv-3', 300, 'claimed'),
      ];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(600); // 100 + 200 + 300
      expect(result.actualCostPaid).toBe(400); // 100 (paid) + 300 (claimed)
      expect(result.actualCostClaimed).toBe(300);
      expect(result.invoiceCount).toBe(3);
    });
  });

  // ─── Scenario 2: one paid deposit + pending residual ──────────────────────

  describe('single paid deposit + pending residual', () => {
    it('paid deposit fraction of iblAmount, residual (pending) contributes 0', () => {
      // invoice amount=1000, ibl itemized=1000
      // deposit: 300 paid → fraction 300/1000 = 0.3
      // residual: 700 pending → contributes 0 to actualCostPaid
      const rows = [
        makeRow('ibl-1', 1000, 'inv-1', 1000, 'pending', {
          id: 'd-1',
          amount: 300,
          status: 'paid',
        }),
      ];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(1000);
      expect(result.actualCostPaid).toBeCloseTo(300); // 300/1000 * 1000 = 300
      expect(result.actualCostClaimed).toBe(0);
    });

    it('works when ibl.itemizedAmount differs from invoice.amount (proportional split)', () => {
      // invoice amount=1000, ibl itemized=500 (partial allocation)
      // deposit: 300 paid → deposit fraction 300/1000 = 0.3 → ibl contribution 500 * 0.3 = 150
      // residual: 700 pending → residual fraction 700/1000 = 0.7 → ibl residual = 500 * 0.7 = 350
      //   pending → 0 contribution to actualCostPaid
      const rows = [
        makeRow('ibl-1', 500, 'inv-1', 1000, 'pending', {
          id: 'd-1',
          amount: 300,
          status: 'paid',
        }),
      ];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(500);
      expect(result.actualCostPaid).toBeCloseTo(150); // 500 * 0.3
      expect(result.actualCostClaimed).toBe(0);
    });
  });

  // ─── Scenario 3: claimed deposit + paid residual ──────────────────────────

  describe('claimed deposit + paid residual', () => {
    it('claimed deposit contributes to both actualCostPaid and actualCostClaimed; paid residual to actualCostPaid only', () => {
      // invoice amount=1000, ibl=1000
      // deposit: 400 claimed → 0.4 fraction → claimedContrib=400, paidContrib=400
      // residual: 600 paid → residualContrib=600 to actualCostPaid, 0 to actualCostClaimed
      const rows = [
        makeRow('ibl-1', 1000, 'inv-1', 1000, 'paid', {
          id: 'd-1',
          amount: 400,
          status: 'claimed',
        }),
      ];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(1000);
      // actualCostPaid = residual(600) + claimed_deposit(400) = 1000
      expect(result.actualCostPaid).toBeCloseTo(1000);
      // actualCostClaimed = only claimed deposit fraction = 400
      expect(result.actualCostClaimed).toBeCloseTo(400);
    });
  });

  // ─── Scenario 4: fully allocated (Σdeposits = invoice.amount) ────────────

  describe('fully allocated: Σdeposits = invoice.amount, residual = 0', () => {
    it('no residual contribution; only deposit statuses count', () => {
      // invoice=1000, deposit 600 paid + deposit 400 pending
      // residual = 0 → parent invoice status (pending) contributes 0
      // paid deposit: 600/1000 * 1000 = 600 → actualCostPaid += 600
      // pending deposit: 400/1000 * 1000 = 400 → actualCostPaid += 0
      const rows = [
        makeRow('ibl-1', 1000, 'inv-1', 1000, 'pending', {
          id: 'd-1',
          amount: 600,
          status: 'paid',
        }),
        makeRow('ibl-1', 1000, 'inv-1', 1000, 'pending', {
          id: 'd-2',
          amount: 400,
          status: 'pending',
        }),
      ];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(1000);
      expect(result.actualCostPaid).toBeCloseTo(600);
      expect(result.actualCostClaimed).toBe(0);
    });

    it('fully claimed: all deposits claimed, residual=0, actualCostClaimed = iblAmount', () => {
      // invoice=500, one deposit 500 claimed
      const rows = [
        makeRow('ibl-1', 500, 'inv-1', 500, 'pending', {
          id: 'd-1',
          amount: 500,
          status: 'claimed',
        }),
      ];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(500);
      expect(result.actualCostPaid).toBeCloseTo(500);
      expect(result.actualCostClaimed).toBeCloseTo(500);
    });
  });

  // ─── Scenario 5: quotation invoice with deposits ───────────────────────────

  describe('quotation invoice with deposits', () => {
    it('quotation invoice contributes to actualCost but deposit fraction counted in actualCostPaid (ADR-029)', () => {
      // invoice 200 quotation, deposit 100 paid → actualCost=200 (ADR-029), actualCostPaid=100 (deposit is paid)
      const rows = [
        makeRow('ibl-1', 200, 'inv-1', 200, 'quotation', {
          id: 'd-1',
          amount: 100,
          status: 'paid',
        }),
      ];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(200); // quotation contributes to actualCost (ADR-029)
      // deposit fraction: 100/200 = 0.5, ibl contribution = 200*0.5 = 100 (paid deposit)
      // residual fraction: 100/200 = 0.5, ibl contribution = 200*0.5 = 100 under 'quotation' → not paid
      expect(result.actualCostPaid).toBeCloseTo(100);
      expect(result.actualCostClaimed).toBe(0);
    });

    it('quotation invoice with no deposits: actualCost=ibl amount, actualCostPaid=0', () => {
      const rows = [makeRow('ibl-1', 300, 'inv-1', 300, 'quotation')];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(300);
      expect(result.actualCostPaid).toBe(0);
      expect(result.actualCostClaimed).toBe(0);
      expect(result.invoiceCount).toBe(1);
    });
  });

  // ─── Scenario 5b: mixed quotation + paid invoices (ADR-029 regression) ───────

  describe('mixed quotation + paid invoices (ADR-029)', () => {
    it('actualCost sums both quotation and paid; actualCostPaid only counts paid', () => {
      // ibl-1: quotation invoice 400 → actualCost+=400, actualCostPaid+=0
      // ibl-2: paid invoice 600 → actualCost+=600, actualCostPaid+=600
      const rows = [
        makeRow('ibl-1', 400, 'inv-1', 400, 'quotation'),
        makeRow('ibl-2', 600, 'inv-2', 600, 'paid'),
      ];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(1000); // 400 + 600
      expect(result.actualCostPaid).toBe(600); // only paid
      expect(result.actualCostClaimed).toBe(0);
      expect(result.invoiceCount).toBe(2);
    });

    it('mixed: quotation + pending + claimed — actualCost sums all three', () => {
      const rows = [
        makeRow('ibl-1', 200, 'inv-1', 200, 'quotation'),
        makeRow('ibl-2', 300, 'inv-2', 300, 'pending'),
        makeRow('ibl-3', 500, 'inv-3', 500, 'claimed'),
      ];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(1000); // 200 + 300 + 500
      expect(result.actualCostPaid).toBe(500); // only claimed counts
      expect(result.actualCostClaimed).toBe(500); // claimed
      expect(result.invoiceCount).toBe(3);
    });
  });

  // ─── Scenario 6: multiple ibl rows pointing to same invoice ───────────────

  describe('multiple ibl rows for the same invoice (no double-counting)', () => {
    it('deposits de-duplicated: same deposit appears once per ibl row but counted once', () => {
      // Two budget lines link to same invoice (realistic: different work item budgets)
      // Each row for deposit appears once per ibl — deposits map deduplicates by depositId
      const rows = [
        // ibl-A: 600 itemized, invoice 1000 paid, deposit 300 paid
        makeRow('ibl-A', 600, 'inv-1', 1000, 'paid', { id: 'd-1', amount: 300, status: 'paid' }),
        // ibl-B: 400 itemized, same invoice 1000, same deposit 300 paid
        makeRow('ibl-B', 400, 'inv-1', 1000, 'paid', { id: 'd-1', amount: 300, status: 'paid' }),
      ];
      const result = computeDepositAwareAggregates(rows);
      // ibl-A: depositFraction=300/1000=0.3, depositContrib=600*0.3=180; residualFraction=700/1000=0.7, residualContrib=600*0.7=420 (paid)
      //        actualCostPaid += 180 + 420 = 600
      // ibl-B: depositFraction=0.3, depositContrib=400*0.3=120; residualFraction=0.7, residualContrib=400*0.7=280 (paid)
      //        actualCostPaid += 120 + 280 = 400
      // total actualCostPaid = 1000
      expect(result.actualCost).toBe(1000);
      expect(result.actualCostPaid).toBeCloseTo(1000);
      expect(result.invoiceCount).toBe(1); // same invoice counted once
    });
  });

  // ─── Scenario 7: invoice.amount = 0 (division-by-zero guard) ─────────────

  describe('invoice.amount = 0 (division-by-zero guard)', () => {
    it('handles invoice.amount = 0 safely without throwing', () => {
      const rows = [
        makeRow('ibl-1', 0, 'inv-1', 0, 'paid', { id: 'd-1', amount: 0, status: 'paid' }),
      ];
      expect(() => computeDepositAwareAggregates(rows)).not.toThrow();
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCost).toBe(0);
      expect(result.actualCostPaid).toBe(0);
    });
  });

  // ─── Mixed-state deposits (AC-1 invariant) ────────────────────────────────

  describe('mixed-state deposits: total contribution invariant', () => {
    it('sum of all contributions equals iblAmount regardless of deposit split', () => {
      // invoice=1000, ibl=1000, deposits: 200 paid + 300 claimed + 100 pending, residual=400 pending
      const rows = [
        makeRow('ibl-1', 1000, 'inv-1', 1000, 'pending', {
          id: 'd-1',
          amount: 200,
          status: 'paid',
        }),
        makeRow('ibl-1', 1000, 'inv-1', 1000, 'pending', {
          id: 'd-2',
          amount: 300,
          status: 'claimed',
        }),
        makeRow('ibl-1', 1000, 'inv-1', 1000, 'pending', {
          id: 'd-3',
          amount: 100,
          status: 'pending',
        }),
      ];
      const result = computeDepositAwareAggregates(rows);
      // actualCost must equal iblAmount = 1000 (not double-counted)
      expect(result.actualCost).toBe(1000);
      // actualCostPaid: d-1 contrib=200, d-2 contrib=300 → 500
      // residual=400 pending → 0
      expect(result.actualCostPaid).toBeCloseTo(500);
      // actualCostClaimed: only d-2 contrib=300
      expect(result.actualCostClaimed).toBeCloseTo(300);
    });

    it('invariant: actualCostClaimed ≤ actualCostPaid ≤ actualCost always holds', () => {
      const rows = [
        makeRow('ibl-1', 750, 'inv-1', 1000, 'claimed', {
          id: 'd-1',
          amount: 500,
          status: 'pending',
        }),
        makeRow('ibl-1', 750, 'inv-1', 1000, 'claimed', {
          id: 'd-2',
          amount: 300,
          status: 'claimed',
        }),
      ];
      const result = computeDepositAwareAggregates(rows);
      expect(result.actualCostClaimed).toBeLessThanOrEqual(result.actualCostPaid);
      expect(result.actualCostPaid).toBeLessThanOrEqual(result.actualCost);
    });
  });

  // ─── invoiceCount deduplification ─────────────────────────────────────────

  describe('invoiceCount deduplication', () => {
    it('counts each unique invoice once even with multiple ibl rows', () => {
      const rows = [
        makeRow('ibl-1', 100, 'inv-1', 200, 'paid'),
        makeRow('ibl-2', 100, 'inv-1', 200, 'paid'),
        makeRow('ibl-3', 150, 'inv-2', 150, 'pending'),
      ];
      const result = computeDepositAwareAggregates(rows);
      expect(result.invoiceCount).toBe(2);
    });
  });
});

// ─── computeStatusContribution ────────────────────────────────────────────────

describe('computeStatusContribution', () => {
  it('returns 0 for empty rows array', () => {
    expect(computeStatusContribution([], 'claimed')).toBe(0);
  });

  it('no deposits: entire ibl amount contributes when invoice status matches target', () => {
    const rows = [makeRow('ibl-1', 400, 'inv-1', 400, 'claimed')];
    expect(computeStatusContribution(rows, 'claimed')).toBe(400);
  });

  it('no deposits: returns 0 when invoice status does not match target', () => {
    const rows = [makeRow('ibl-1', 400, 'inv-1', 400, 'paid')];
    expect(computeStatusContribution(rows, 'claimed')).toBe(0);
  });

  it('with deposits: claimed deposit contributes its fraction, residual under parent status', () => {
    // invoice=1000, ibl=1000, deposit 400 claimed, residual 600 paid
    // computeStatusContribution('claimed'): deposit fraction=400/1000=0.4 → 400
    // residual: parent status='paid' != 'claimed' → 0
    const rows = [
      makeRow('ibl-1', 1000, 'inv-1', 1000, 'paid', { id: 'd-1', amount: 400, status: 'claimed' }),
    ];
    expect(computeStatusContribution(rows, 'claimed')).toBeCloseTo(400);
  });

  it('with deposits: paid deposit contributes its fraction to paid; parent status pending contributes 0', () => {
    // invoice=1000, ibl=1000, deposit 300 paid, residual 700 pending
    // computeStatusContribution('paid'): deposit fraction=300/1000=0.3 → 300; residual pending → 0
    const rows = [
      makeRow('ibl-1', 1000, 'inv-1', 1000, 'pending', {
        id: 'd-1',
        amount: 300,
        status: 'paid',
      }),
    ];
    expect(computeStatusContribution(rows, 'paid')).toBeCloseTo(300);
  });

  it('with deposits: residual under parent invoice status contributes when status matches', () => {
    // invoice=1000, ibl=500, deposit 200 pending, residual 800 claimed
    // computeStatusContribution('claimed'): residual fraction=800/1000=0.8 → ibl 500*0.8=400; deposit pending → 0
    const rows = [
      makeRow('ibl-1', 500, 'inv-1', 1000, 'claimed', {
        id: 'd-1',
        amount: 200,
        status: 'pending',
      }),
    ];
    expect(computeStatusContribution(rows, 'claimed')).toBeCloseTo(400);
  });

  it('handles multiple ibls and deduplicates deposit rows correctly', () => {
    // Two ibl rows, same invoice, same deposit
    const rows = [
      makeRow('ibl-A', 300, 'inv-1', 1000, 'paid', { id: 'd-1', amount: 500, status: 'claimed' }),
      makeRow('ibl-B', 200, 'inv-1', 1000, 'paid', { id: 'd-1', amount: 500, status: 'claimed' }),
    ];
    // ibl-A: claimed deposit 500/1000=0.5 → 300*0.5=150; residual 500/1000=0.5 → paid, not claimed → 0
    // ibl-B: claimed deposit → 200*0.5=100; residual paid → 0
    expect(computeStatusContribution(rows, 'claimed')).toBeCloseTo(250);
  });

  it('returns 0 for empty deposit list with non-matching invoice status', () => {
    const rows = [makeRow('ibl-1', 500, 'inv-1', 500, 'pending')];
    expect(computeStatusContribution(rows, 'claimed')).toBe(0);
    expect(computeStatusContribution(rows, 'paid')).toBe(0);
  });

  it('handles invoice.amount = 0 safely', () => {
    const rows = [makeRow('ibl-1', 0, 'inv-1', 0, 'claimed')];
    expect(() => computeStatusContribution(rows, 'claimed')).not.toThrow();
  });
});

// ─── aggregateInvoiceStatusBreakdown ──────────────────────────────────────────

/**
 * Build an InvoiceDepositRow with no deposit (deposit columns null).
 */
function makeInvoiceRow(
  invoiceId: string,
  invoiceAmount: number,
  invoiceStatus: string,
  deposit?: { id: string; amount: number; status: string },
): InvoiceDepositRow {
  return {
    invoice_id: invoiceId,
    invoice_amount: invoiceAmount,
    invoice_status: invoiceStatus,
    deposit_id: deposit?.id ?? null,
    deposit_amount: deposit?.amount ?? null,
    deposit_status: deposit?.status ?? null,
  };
}

describe('aggregateInvoiceStatusBreakdown', () => {
  // ─── Scenario 1: Empty rows ────────────────────────────────────────────────

  it('returns {} for empty rows array', () => {
    const result = aggregateInvoiceStatusBreakdown([]);
    expect(result).toEqual({});
  });

  // ─── Scenario 2: Single invoice, no deposits ──────────────────────────────

  it('single invoice with no deposits: full amount under invoice status', () => {
    const rows: InvoiceDepositRow[] = [makeInvoiceRow('i1', 1000, 'quotation')];
    const result = aggregateInvoiceStatusBreakdown(rows);
    expect(result['quotation']).toEqual({ count: 1, totalAmount: 1000 });
    // No deposit key should exist
    expect(result['pending']).toBeUndefined();
  });

  // ─── Scenario 3: Single invoice with one pending deposit ──────────────────

  it('single quotation invoice (1000) with one pending deposit (200): residual 800 under quotation, 200 under pending', () => {
    const rows: InvoiceDepositRow[] = [
      makeInvoiceRow('i1', 1000, 'quotation', { id: 'd1', amount: 200, status: 'pending' }),
    ];
    const result = aggregateInvoiceStatusBreakdown(rows);
    expect(result['quotation']!.count).toBe(1);
    expect(result['quotation']!.totalAmount).toBe(800);
    expect(result['pending']!.count).toBe(0);
    expect(result['pending']!.totalAmount).toBe(200);
  });

  // ─── Scenario 4: Sum invariant ────────────────────────────────────────────

  it('sum invariant: quotation.totalAmount + pending.totalAmount === invoiceAmount', () => {
    const invoiceAmount = 1000;
    const depositAmount = 200;
    const rows: InvoiceDepositRow[] = [
      makeInvoiceRow('i1', invoiceAmount, 'quotation', {
        id: 'd1',
        amount: depositAmount,
        status: 'pending',
      }),
    ];
    const result = aggregateInvoiceStatusBreakdown(rows);
    const quotationTotal = result['quotation']!.totalAmount;
    const pendingTotal = result['pending']!.totalAmount;
    expect(quotationTotal + pendingTotal).toBe(invoiceAmount);
  });

  // ─── Scenario 5: Multiple deposits on one invoice ─────────────────────────

  it('multiple deposits on one invoice: residual + per-status accrual', () => {
    // invoice 1200 quotation, deposits: 300 pending + 400 paid
    // residual = 1200 - 300 - 400 = 500 under quotation
    const rows: InvoiceDepositRow[] = [
      makeInvoiceRow('i1', 1200, 'quotation', { id: 'd1', amount: 300, status: 'pending' }),
      makeInvoiceRow('i1', 1200, 'quotation', { id: 'd2', amount: 400, status: 'paid' }),
    ];
    const result = aggregateInvoiceStatusBreakdown(rows);
    expect(result['quotation']!.count).toBe(1);
    expect(result['quotation']!.totalAmount).toBe(500);
    expect(result['pending']!.totalAmount).toBe(300);
    expect(result['paid']!.totalAmount).toBe(400);
    // count is only incremented for the parent invoice status bucket
    expect(result['pending']!.count).toBe(0);
    expect(result['paid']!.count).toBe(0);
  });

  // ─── Scenario 6: Deposit sum exceeds invoice amount (clamped to 0) ─────────

  it('deposit sum exceeds invoice amount: residual clamped to 0 via Math.max(0,...)', () => {
    // invoice 100 quotation, deposit 150 paid → residual = Math.max(0, 100 - 150) = 0
    const rows: InvoiceDepositRow[] = [
      makeInvoiceRow('i1', 100, 'quotation', { id: 'd1', amount: 150, status: 'paid' }),
    ];
    const result = aggregateInvoiceStatusBreakdown(rows);
    // residual = 0: quotation.totalAmount must be 0 (not negative)
    expect(result['quotation']!.totalAmount).toBe(0);
    // deposit amount still fully accrued
    expect(result['paid']!.totalAmount).toBe(150);
  });

  // ─── Scenario 7: Multiple invoices, count once each ───────────────────────

  it('multiple invoices with same status: count equals invoice count (not row count)', () => {
    // Two pending invoices, no deposits
    const rows: InvoiceDepositRow[] = [
      makeInvoiceRow('i1', 300, 'pending'),
      makeInvoiceRow('i2', 500, 'pending'),
    ];
    const result = aggregateInvoiceStatusBreakdown(rows);
    expect(result['pending']!.count).toBe(2);
    expect(result['pending']!.totalAmount).toBe(800);
  });

  // ─── Scenario 8: Duplicate deposit rows deduped ───────────────────────────

  it('same deposit_id appearing multiple times in rows is counted only once', () => {
    // SQLite LEFT JOIN can produce one row per invoice-deposit pair; this simulates
    // that scenario where the same deposit appears twice (e.g. from a different source row).
    const rows: InvoiceDepositRow[] = [
      makeInvoiceRow('i1', 1000, 'pending', { id: 'd1', amount: 200, status: 'paid' }),
      // Same deposit_id 'd1' appearing again (duplicate) — must be deduplicated
      makeInvoiceRow('i1', 1000, 'pending', { id: 'd1', amount: 200, status: 'paid' }),
    ];
    const result = aggregateInvoiceStatusBreakdown(rows);
    // residual = 1000 - 200 = 800, not 1000 - 400 = 600
    expect(result['pending']!.totalAmount).toBe(800);
    expect(result['paid']!.totalAmount).toBe(200);
    // sum invariant: 800 + 200 = 1000
    expect(result['pending']!.totalAmount + result['paid']!.totalAmount).toBe(1000);
  });

  // ─── Scenario 9: Mixed scenario ───────────────────────────────────────────

  it('mixed scenario: invoice A (quotation, 500, pending deposit 100) + invoice B (paid, 200, no deposits)', () => {
    // Invoice A: quotation 500, deposit 100 pending → quotation residual 400, pending 100
    // Invoice B: paid 200, no deposits → paid 200
    const rows: InvoiceDepositRow[] = [
      makeInvoiceRow('invA', 500, 'quotation', { id: 'dA1', amount: 100, status: 'pending' }),
      makeInvoiceRow('invB', 200, 'paid'),
    ];
    const result = aggregateInvoiceStatusBreakdown(rows);

    expect(result['quotation']!.count).toBe(1);
    expect(result['quotation']!.totalAmount).toBe(400);

    expect(result['paid']!.count).toBe(1);
    expect(result['paid']!.totalAmount).toBe(200);

    expect(result['pending']!.count).toBe(0);
    expect(result['pending']!.totalAmount).toBe(100);
  });
});

// ─── splitByDeposits ──────────────────────────────────────────────────────────

/**
 * Build a minimal row for splitByDeposits (no ibl_id / itemized_amount needed).
 */
function makeSplitRow(
  invoiceId: string,
  invoiceAmount: number,
  invoiceStatus: string,
  deposit?: { id: string; amount: number; status: string },
) {
  return {
    invoice_id: invoiceId,
    invoice_amount: invoiceAmount,
    invoice_status: invoiceStatus,
    deposit_id: deposit?.id ?? null,
    deposit_amount: deposit?.amount ?? null,
    deposit_status: deposit?.status ?? null,
  };
}

describe('splitByDeposits', () => {
  // ─── Scenario 1: Empty input ────────────────────────────────────────────────

  it('Scenario 1: empty input returns empty Map', () => {
    const result = splitByDeposits([]);
    expect(result.size).toBe(0);
  });

  // ─── Scenario 2: Single invoice, no deposits ────────────────────────────────

  it('Scenario 2: single invoice with no deposits → residualFraction=1, depositFractions=[]', () => {
    const rows = [makeSplitRow('inv-1', 500, 'pending')];
    const result = splitByDeposits(rows);

    expect(result.size).toBe(1);
    const split = result.get('inv-1')!;
    expect(split.residualFraction).toBe(1);
    expect(split.depositFractions).toHaveLength(0);
    expect(split.invoiceAmount).toBe(500);
    expect(split.invoiceStatus).toBe('pending');
  });

  // ─── Scenario 3: Single invoice, one deposit covering 50% ──────────────────

  it('Scenario 3: single invoice with one deposit covering 50% → residualFraction=0.5, depositFractions=[{fraction:0.5}]', () => {
    const rows = [
      makeSplitRow('inv-1', 1000, 'pending', { id: 'd-1', amount: 500, status: 'paid' }),
    ];
    const result = splitByDeposits(rows);

    const split = result.get('inv-1')!;
    expect(split.residualFraction).toBeCloseTo(0.5);
    expect(split.depositFractions).toHaveLength(1);
    expect(split.depositFractions[0]!.fraction).toBeCloseTo(0.5);
    expect(split.depositFractions[0]!.depositStatus).toBe('paid');
  });

  // ─── Scenario 4: Deposits sum > invoice amount → residualFraction clamped to 0 ─

  it('Scenario 4: deposits sum > invoice amount → residualFraction = 0 (clamped, not negative)', () => {
    // invoice = 100, deposit = 150 → residual = max(0, 100 - 150) / 100 = 0
    const rows = [
      makeSplitRow('inv-1', 100, 'pending', { id: 'd-1', amount: 150, status: 'paid' }),
    ];
    const result = splitByDeposits(rows);

    const split = result.get('inv-1')!;
    expect(split.residualFraction).toBe(0);
    // Deposit fraction can exceed 1 since it is amount / safeInvoiceAmount
    expect(split.depositFractions[0]!.fraction).toBeCloseTo(1.5);
  });

  // ─── Scenario 5: Zero invoice amount → no division by zero ──────────────────

  it('Scenario 5: zero invoice amount → no division by zero (safeInvoiceAmount = 1)', () => {
    const rows = [makeSplitRow('inv-1', 0, 'paid', { id: 'd-1', amount: 0, status: 'paid' })];
    expect(() => splitByDeposits(rows)).not.toThrow();
    const result = splitByDeposits(rows);
    const split = result.get('inv-1')!;
    // safeInvoiceAmount = 1 (since invoiceAmount = 0)
    // residualFraction = max(0, 1 - 0) / 1 = 1 (since deposit_amount = 0, no subtraction)
    // depositFraction = 0 / 1 = 0
    expect(split.residualFraction).toBe(1);
    expect(split.depositFractions[0]!.fraction).toBe(0);
    expect(split.invoiceAmount).toBe(0);
  });

  // ─── Scenario 6: Multiple invoices, mixed ────────────────────────────────────

  it('Scenario 6: multiple invoices split independently', () => {
    const rows = [
      // inv-1: 1000, one deposit 300 paid
      makeSplitRow('inv-1', 1000, 'pending', { id: 'd-A', amount: 300, status: 'paid' }),
      // inv-2: 500, no deposits
      makeSplitRow('inv-2', 500, 'claimed'),
    ];
    const result = splitByDeposits(rows);

    expect(result.size).toBe(2);

    const split1 = result.get('inv-1')!;
    expect(split1.residualFraction).toBeCloseTo(0.7); // (1000 - 300) / 1000
    expect(split1.depositFractions).toHaveLength(1);
    expect(split1.depositFractions[0]!.fraction).toBeCloseTo(0.3);

    const split2 = result.get('inv-2')!;
    expect(split2.residualFraction).toBe(1);
    expect(split2.depositFractions).toHaveLength(0);
    expect(split2.invoiceStatus).toBe('claimed');
  });

  // ─── Scenario 7: Duplicate deposit rows (same deposit_id) → deduplicated ────

  it('Scenario 7: duplicate deposit_id rows across multiple rows → deposit counted once', () => {
    // Same deposit_id d-1 appears in two rows (simulating LEFT JOIN row expansion)
    const rows = [
      makeSplitRow('inv-1', 1000, 'pending', { id: 'd-1', amount: 200, status: 'paid' }),
      makeSplitRow('inv-1', 1000, 'pending', { id: 'd-1', amount: 200, status: 'paid' }),
    ];
    const result = splitByDeposits(rows);

    const split = result.get('inv-1')!;
    // Deposit should appear exactly once, not twice
    expect(split.depositFractions).toHaveLength(1);
    // residualFraction = (1000 - 200) / 1000 = 0.8, NOT (1000 - 400) / 1000 = 0.6
    expect(split.residualFraction).toBeCloseTo(0.8);
  });

  // ─── Scenario 8: Mix — some invoices with deposits, some without ─────────────

  it('Scenario 8: mix of invoices with and without deposits, each splits correctly', () => {
    const rows = [
      // Invoice A: has a 400-claimed deposit out of 800
      makeSplitRow('inv-A', 800, 'pending', { id: 'dA', amount: 400, status: 'claimed' }),
      // Invoice B: no deposits
      makeSplitRow('inv-B', 200, 'paid'),
      // Invoice C: fully covered (one deposit = invoice amount)
      makeSplitRow('inv-C', 300, 'pending', { id: 'dC', amount: 300, status: 'paid' }),
    ];
    const result = splitByDeposits(rows);

    expect(result.size).toBe(3);

    const splitA = result.get('inv-A')!;
    expect(splitA.residualFraction).toBeCloseTo(0.5); // (800 - 400) / 800
    expect(splitA.depositFractions[0]!.depositStatus).toBe('claimed');
    expect(splitA.depositFractions[0]!.fraction).toBeCloseTo(0.5);

    const splitB = result.get('inv-B')!;
    expect(splitB.residualFraction).toBe(1);
    expect(splitB.depositFractions).toHaveLength(0);

    const splitC = result.get('inv-C')!;
    expect(splitC.residualFraction).toBeCloseTo(0); // (300 - 300) / 300 = 0
    expect(splitC.depositFractions[0]!.fraction).toBeCloseTo(1);
  });

  // ─── Scenario 9: invoiceAmount field populated ──────────────────────────────

  it('Scenario 9: invoiceAmount field in split matches the input invoice_amount', () => {
    const rows = [
      makeSplitRow('inv-1', 750, 'paid', { id: 'd-1', amount: 250, status: 'claimed' }),
    ];
    const result = splitByDeposits(rows);
    const split = result.get('inv-1')!;
    expect(split.invoiceAmount).toBe(750);
  });
});
