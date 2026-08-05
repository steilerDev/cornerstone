import { describe, it, expect } from '@jest/globals';
import type { SourceReportResponse, SourceReportInvoice } from '@cornerstone/shared';
import { applyLineExclusions } from './reportExclusions.js';

// ─── Fixture helpers ────────────────────────────────────────────────────────

function makeInvoice(overrides: Partial<SourceReportInvoice> = {}): SourceReportInvoice {
  return {
    invoiceId: 'inv-1',
    vendorId: 'vendor-1',
    vendorName: 'Test Vendor',
    invoiceNumber: 'INV-001',
    date: '2026-01-15',
    status: 'paid',
    invoiceAmount: 1000,
    allocatedAmount: 1000,
    lineKind: 'invoice',
    isSplit: false,
    splitKind: null,
    documents: [],
    budgetLines: [],
    deposits: [],
    ...overrides,
  };
}

function makeReport(invoices: SourceReportInvoice[]): SourceReportResponse {
  return {
    type: 'claim',
    source: {
      id: 'src-1',
      name: 'Test Source',
      sourceType: 'bank_loan',
      reference: null,
      contactAddress: null,
    },
    invoices,
    totalAmount: invoices.reduce((s, i) => s + i.allocatedAmount, 0),
    unallocatedInvoices: [],
    generatedAt: '2026-01-20T00:00:00.000Z',
  };
}

describe('applyLineExclusions', () => {
  it('no-op: empty excludedLineIds returns the exact same report object reference', () => {
    const report = makeReport([
      makeInvoice({
        budgetLines: [
          { id: 'line-1', description: 'Foundation', allocatedPortion: 500, linkedItem: null },
        ],
      }),
    ]);

    const result = applyLineExclusions(report, new Set());

    expect(result).toBe(report); // same reference, not just deep-equal
  });

  it('single exclusion: subtracts the excluded line portion from allocatedAmount', () => {
    const report = makeReport([
      makeInvoice({
        invoiceId: 'inv-1',
        allocatedAmount: 1000,
        budgetLines: [
          { id: 'line-1', description: 'Foundation', allocatedPortion: 300, linkedItem: null },
          { id: 'line-2', description: 'Roofing', allocatedPortion: 700, linkedItem: null },
        ],
      }),
    ]);

    const result = applyLineExclusions(report, new Set(['line-1']));

    expect(result).not.toBe(report);
    expect(result.invoices[0]!.allocatedAmount).toBe(700);
    expect(result.invoices[0]!.lineKind).toBe('invoice');
  });

  it('all-excluded: subtracting every line drops allocatedAmount to exactly 0', () => {
    const report = makeReport([
      makeInvoice({
        invoiceId: 'inv-1',
        allocatedAmount: 1000,
        budgetLines: [
          { id: 'line-1', description: 'Foundation', allocatedPortion: 400, linkedItem: null },
          { id: 'line-2', description: 'Roofing', allocatedPortion: 600, linkedItem: null },
        ],
      }),
    ]);

    const result = applyLineExclusions(report, new Set(['line-1', 'line-2']));

    expect(result.invoices[0]!.allocatedAmount).toBe(0);
    // 0 is not negative, so lineKind stays 'invoice' (the newAmount < 0 check is strict)
    expect(result.invoices[0]!.lineKind).toBe('invoice');
  });

  it('sign recompute: excluding a large-enough line flips lineKind to refund-adjustment when the remainder goes negative', () => {
    const report = makeReport([
      makeInvoice({
        invoiceId: 'inv-1',
        allocatedAmount: 200,
        budgetLines: [
          {
            id: 'line-1',
            description: 'Overpaid deposit',
            allocatedPortion: 500,
            linkedItem: null,
          },
        ],
      }),
    ]);

    const result = applyLineExclusions(report, new Set(['line-1']));

    expect(result.invoices[0]!.allocatedAmount).toBe(-300);
    expect(result.invoices[0]!.lineKind).toBe('refund-adjustment');
  });

  it('an already-negative (refund-adjustment) invoice becomes more negative when a line is excluded', () => {
    const report = makeReport([
      makeInvoice({
        invoiceId: 'inv-1',
        allocatedAmount: -300,
        lineKind: 'refund-adjustment',
        budgetLines: [
          { id: 'line-1', description: 'Extra item', allocatedPortion: 100, linkedItem: null },
        ],
      }),
    ]);

    const result = applyLineExclusions(report, new Set(['line-1']));

    expect(result.invoices[0]!.allocatedAmount).toBe(-400);
    expect(result.invoices[0]!.lineKind).toBe('refund-adjustment');
  });

  it('an invoice with no matching excluded lines is passed through unchanged (same object reference)', () => {
    const uninvolvedInvoice = makeInvoice({
      invoiceId: 'inv-2',
      allocatedAmount: 500,
      budgetLines: [
        { id: 'line-9', description: 'Unrelated', allocatedPortion: 500, linkedItem: null },
      ],
    });
    const targetInvoice = makeInvoice({
      invoiceId: 'inv-1',
      allocatedAmount: 1000,
      budgetLines: [
        { id: 'line-1', description: 'Target', allocatedPortion: 300, linkedItem: null },
      ],
    });
    const report = makeReport([targetInvoice, uninvolvedInvoice]);

    const result = applyLineExclusions(report, new Set(['line-1']));

    // The unrelated invoice keeps its exact object reference (excludedPortion === 0 early-return).
    expect(result.invoices[1]).toBe(uninvolvedInvoice);
    expect(result.invoices[0]).not.toBe(targetInvoice);
    expect(result.invoices[0]!.allocatedAmount).toBe(700);
  });

  it('an invoice with zero budgetLines (deposit-only) is passed through unchanged even with a non-matching excludedLineIds set', () => {
    const depositOnlyInvoice = makeInvoice({
      invoiceId: 'inv-3',
      allocatedAmount: 400,
      budgetLines: [],
      deposits: [
        {
          id: 'dep-1',
          amount: 400,
          status: 'paid',
          entryType: 'deposit',
          dueDate: '2026-01-01',
          paidDate: '2026-01-05',
          claimedDate: null,
          budgetSourceId: 'src-1',
        },
      ],
    });
    const report = makeReport([depositOnlyInvoice]);

    const result = applyLineExclusions(report, new Set(['some-other-line']));

    expect(result.invoices[0]).toBe(depositOnlyInvoice);
    expect(result.invoices[0]!.allocatedAmount).toBe(400);
  });

  it('rounds the recomputed amount to 2 decimal places (avoids floating point drift)', () => {
    const report = makeReport([
      makeInvoice({
        invoiceId: 'inv-1',
        allocatedAmount: 100.1,
        budgetLines: [
          { id: 'line-1', description: 'Line A', allocatedPortion: 33.33, linkedItem: null },
        ],
      }),
    ]);

    const result = applyLineExclusions(report, new Set(['line-1']));

    // 100.1 - 33.33 = 66.77 exactly at 2dp (floating point without rounding would drift)
    expect(result.invoices[0]!.allocatedAmount).toBe(66.77);
  });

  it('passthrough of other fields: vendorName, invoiceNumber, status, documents, isSplit, deposits remain untouched', () => {
    const report = makeReport([
      makeInvoice({
        invoiceId: 'inv-1',
        vendorName: 'Acme Builders',
        invoiceNumber: 'INV-42',
        status: 'claimed',
        isSplit: true,
        documents: [
          {
            documentId: 99,
            archiveSerialNumber: 5,
            title: 'Invoice PDF',
            attachmentType: 'invoice',
          },
        ],
        deposits: [
          {
            id: 'dep-1',
            amount: 50,
            status: 'pending',
            entryType: 'deposit',
            dueDate: '2026-02-01',
            paidDate: null,
            claimedDate: null,
            budgetSourceId: null,
          },
        ],
        allocatedAmount: 1000,
        budgetLines: [{ id: 'line-1', description: null, allocatedPortion: 200, linkedItem: null }],
      }),
    ]);

    const result = applyLineExclusions(report, new Set(['line-1']));
    const inv = result.invoices[0]!;

    expect(inv.vendorName).toBe('Acme Builders');
    expect(inv.invoiceNumber).toBe('INV-42');
    expect(inv.status).toBe('claimed');
    expect(inv.isSplit).toBe(true);
    expect(inv.documents).toHaveLength(1);
    expect(inv.deposits).toHaveLength(1);
    expect(inv.allocatedAmount).toBe(800);
  });

  it('report-level fields (type, source, totalAmount, unallocatedInvoices, generatedAt) are copied through via spread', () => {
    const report = makeReport([
      makeInvoice({
        allocatedAmount: 1000,
        budgetLines: [{ id: 'line-1', description: null, allocatedPortion: 100, linkedItem: null }],
      }),
    ]);

    const result = applyLineExclusions(report, new Set(['line-1']));

    expect(result.type).toBe(report.type);
    expect(result.source).toBe(report.source);
    expect(result.generatedAt).toBe(report.generatedAt);
    // Note: totalAmount is NOT recomputed by applyLineExclusions itself — it is a pure
    // subtraction-source utility; totalAmount recomputation (if needed) is the caller's
    // responsibility. This test pins the current (pass-through) behavior.
    expect(result.totalAmount).toBe(report.totalAmount);
  });

  it('multiple invoices with mixed exclusions: only affected invoices get new object references', () => {
    const invA = makeInvoice({
      invoiceId: 'inv-A',
      allocatedAmount: 500,
      budgetLines: [{ id: 'line-A1', description: null, allocatedPortion: 200, linkedItem: null }],
    });
    const invB = makeInvoice({
      invoiceId: 'inv-B',
      allocatedAmount: 300,
      budgetLines: [{ id: 'line-B1', description: null, allocatedPortion: 100, linkedItem: null }],
    });
    const report = makeReport([invA, invB]);

    const result = applyLineExclusions(report, new Set(['line-A1']));

    expect(result.invoices[0]).not.toBe(invA);
    expect(result.invoices[0]!.allocatedAmount).toBe(300);
    expect(result.invoices[1]).toBe(invB);
    expect(result.invoices[1]!.allocatedAmount).toBe(300);
  });

  it('excluding a lineId that matches no line on any invoice is a full no-op on amounts (but not a reference no-op, since size > 0)', () => {
    const invoice = makeInvoice({
      allocatedAmount: 1000,
      budgetLines: [{ id: 'line-1', description: null, allocatedPortion: 500, linkedItem: null }],
    });
    const report = makeReport([invoice]);

    const result = applyLineExclusions(report, new Set(['line-does-not-exist']));

    // excludedLineIds.size > 0, so the top-level early-return doesn't trigger, but the
    // invoice-level early-return (excludedPortion === 0) does — same invoice reference.
    expect(result.invoices[0]).toBe(invoice);
    expect(result.invoices[0]!.allocatedAmount).toBe(1000);
  });
});
