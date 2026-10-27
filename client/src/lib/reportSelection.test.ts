import { describe, it, expect } from '@jest/globals';
import type { SourceReportInvoice, SourceReportResponse } from '@cornerstone/shared';
import { reportSelection } from './reportSelection.js';

function invoice(
  id: string,
  amount: number,
  lines: { id: string; portion: number }[] = [],
): SourceReportInvoice {
  return {
    invoiceId: id,
    vendorId: 'v',
    vendorName: 'V',
    invoiceNumber: id,
    date: '2026-01-01',
    status: 'pending',
    invoiceAmount: amount,
    allocatedAmount: amount,
    lineKind: 'invoice',
    isSplit: false,
    splitKind: null,
    documents: [],
    budgetLinesForSource: lines.map((l) => ({
      id: l.id,
      description: l.id,
      allocatedPortion: l.portion,
      linkedItem: null,
    })),
    depositsVisibleToSource: [],
  };
}

function report(invoices: SourceReportInvoice[]): SourceReportResponse {
  return {
    type: 'claim',
    source: { id: 's', name: 'S', sourceType: 'bank_loan', reference: null, contactAddress: null },
    invoices,
    totalAmount: Math.round(invoices.reduce((s, i) => s + i.allocatedAmount, 0) * 100) / 100,
    unallocatedInvoices: [],
    generatedAt: '2026-01-15T00:00:00.000Z',
  };
}

describe('reportSelection', () => {
  const rep = report([
    invoice('a', 100.1, [
      { id: 'l1', portion: 40 },
      { id: 'l2', portion: 60.1 },
    ]),
    invoice('b', 200.2),
    invoice('c', -50.05),
  ]);

  it('with nothing excluded equals the server totalAmount and counts every invoice', () => {
    const sel = reportSelection(rep, new Set(), new Set());
    expect(sel.total).toBe(rep.totalAmount);
    expect(sel.count).toBe(3);
    expect(sel.totalCount).toBe(3);
    expect(sel.includedInvoiceIds).toEqual(['a', 'b', 'c']);
  });

  it('drops excluded invoices from the count, ids and total (refunds are netted)', () => {
    const sel = reportSelection(rep, new Set(['b']), new Set());
    expect(sel.includedInvoiceIds).toEqual(['a', 'c']);
    expect(sel.count).toBe(2);
    expect(sel.totalCount).toBe(3);
    expect(sel.total).toBe(50.05);
  });

  it('subtracts an excluded budget line once', () => {
    const sel = reportSelection(rep, new Set(), new Set(['l1']));
    expect(sel.total).toBe(210.25); // 250.25 - 40
    expect(sel.count).toBe(3);
  });

  it('ignores a line exclusion of an excluded invoice (nothing subtracted twice)', () => {
    const sel = reportSelection(rep, new Set(['a']), new Set(['l1']));
    expect(sel.total).toBe(150.15);
  });

  it('equals the sum of the included invoices per group', () => {
    const sel = reportSelection(rep, new Set(['c']), new Set());
    expect(sel.total).toBe(300.3);
  });

  it('handles an empty report', () => {
    const sel = reportSelection(report([]), new Set(), new Set());
    expect(sel).toEqual({ includedInvoiceIds: [], count: 0, totalCount: 0, total: 0 });
  });

  it('does not mutate the given sets', () => {
    const lines = new Set(['l1']);
    reportSelection(rep, new Set(), lines);
    expect([...lines]).toEqual(['l1']);
  });
});
