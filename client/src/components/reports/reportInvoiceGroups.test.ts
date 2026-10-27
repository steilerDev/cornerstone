import { describe, it, expect } from '@jest/globals';
import type { SourceReportInvoice } from '@cornerstone/shared';
import { orderInvoices, groupByCompany } from './reportInvoiceGroups.js';

function inv(id: string, o: Partial<SourceReportInvoice> = {}): SourceReportInvoice {
  return {
    invoiceId: id,
    vendorId: 'v1',
    vendorName: 'Alpha',
    invoiceNumber: 'N-1',
    date: '2026-01-01',
    status: 'pending',
    invoiceAmount: 1,
    allocatedAmount: 1,
    lineKind: 'invoice',
    isSplit: false,
    splitKind: null,
    documents: [],
    budgetLinesForSource: [],
    depositsVisibleToSource: [],
    ...o,
  };
}

describe('orderInvoices', () => {
  it('orders by company name, then company id, date, invoice number and invoice id', () => {
    const ordered = orderInvoices(
      [
        inv('e', { vendorName: 'Beta', vendorId: 'v2' }),
        inv('d', { invoiceNumber: 'N-2' }),
        inv('c', { date: '2026-02-01' }),
        inv('b'),
        inv('a'),
        inv('z', { vendorName: 'Alpha', vendorId: 'v0' }),
      ],
      'en',
    );
    expect(ordered.map((i) => i.invoiceId)).toEqual(['z', 'a', 'b', 'd', 'c', 'e']);
  });

  it('is independent of the input order', () => {
    const items = [inv('b'), inv('a'), inv('c', { vendorName: 'Beta', vendorId: 'v2' })];
    const forward = orderInvoices(items, 'en').map((i) => i.invoiceId);
    const backward = orderInvoices([...items].reverse(), 'en').map((i) => i.invoiceId);
    expect(backward).toEqual(forward);
  });

  it('does not mutate its input and sorts a null invoice number first', () => {
    const items = [inv('b', { invoiceNumber: 'N-9' }), inv('a', { invoiceNumber: null })];
    const copy = [...items];
    expect(orderInvoices(items, 'de').map((i) => i.invoiceId)).toEqual(['a', 'b']);
    expect(items).toEqual(copy);
  });

  it('uses the given locale for company names (German umlaut sorts with a)', () => {
    const items = [
      inv('z', { vendorName: 'Zimmer', vendorId: 'v1' }),
      inv('a', { vendorName: 'Äpfel', vendorId: 'v2' }),
    ];
    expect(orderInvoices(items, 'de').map((i) => i.invoiceId)).toEqual(['a', 'z']);
  });
});

describe('groupByCompany', () => {
  it('groups ids by company in order of first appearance', () => {
    const list = [inv('1'), inv('2', { vendorId: 'v2', vendorName: 'Beta' }), inv('3')];
    const byId = new Map(list.map((i) => [i.invoiceId, i]));
    expect(groupByCompany(['1', '2', '3'], byId)).toEqual([
      { vendorId: 'v1', vendorName: 'Alpha', ids: ['1', '3'] },
      { vendorId: 'v2', vendorName: 'Beta', ids: ['2'] },
    ]);
  });

  it('returns no groups for no ids', () => {
    expect(groupByCompany([], new Map())).toEqual([]);
  });
});
