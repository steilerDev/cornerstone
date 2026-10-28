import { describe, it, expect } from '@jest/globals';
import type { InvoiceDeposit, InvoiceListRow, InvoiceStatus } from '@cornerstone/shared';
import { countSubmitted, groupCompanyPayments } from './companyPayments.js';

function deposit(id: string, dueDate: string): InvoiceDeposit {
  return {
    id,
    invoiceId: 'x',
    amount: 10,
    dueDate,
    paidDate: null,
    claimedDate: null,
    description: null,
    status: 'pending',
    entryType: 'deposit',
    budgetSourceId: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function row(
  id: string,
  status: InvoiceStatus,
  o: { date?: string; dueDate?: string | null; deposits?: InvoiceDeposit[]; no?: string } = {},
): InvoiceListRow {
  return {
    id,
    status,
    date: o.date ?? '2026-01-01',
    dueDate: o.dueDate ?? null,
    invoiceNumber: o.no ?? null,
    deposits: o.deposits ?? [],
  } as unknown as InvoiceListRow;
}

const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id);

describe('groupCompanyPayments', () => {
  it('splits quotations into offers and everything else into invoices', () => {
    const g = groupCompanyPayments([row('i', 'pending'), row('q', 'quotation'), row('p', 'paid')]);

    expect(ids(g.invoices)).toEqual(['i', 'p']);
    expect(ids(g.offers)).toEqual(['q']);
  });

  // Mutation: dropping the rank sorts by date only and buries a pending invoice under a paid one.
  it('orders invoices pending, submitted, paid', () => {
    const g = groupCompanyPayments([
      row('paid', 'paid', { date: '2026-01-01' }),
      row('claimed', 'claimed', { date: '2026-02-01' }),
      row('pending', 'pending', { date: '2026-03-01' }),
    ]);

    expect(ids(g.invoices)).toEqual(['pending', 'claimed', 'paid']);
  });

  it('orders pending invoices by due date, no due date last, then date, then id', () => {
    const g = groupCompanyPayments([
      row('undated', 'pending', { dueDate: null, date: '2026-01-01' }),
      row('late', 'pending', { dueDate: '2026-09-01' }),
      row('soon-b', 'pending', { dueDate: '2026-04-01', date: '2026-02-02' }),
      row('soon-a', 'pending', { dueDate: '2026-04-01', date: '2026-02-02' }),
      row('soon-old', 'pending', { dueDate: '2026-04-01', date: '2026-01-15' }),
      row('undated-2', 'pending', { dueDate: null, date: '2026-01-01' }),
    ]);

    expect(ids(g.invoices)).toEqual([
      'soon-old',
      'soon-a',
      'soon-b',
      'late',
      'undated',
      'undated-2',
    ]);
  });

  it('puts an undated pending invoice after a dated one whichever way they are compared', () => {
    const forward = groupCompanyPayments([
      row('d', 'pending', { dueDate: '2026-04-01' }),
      row('n', 'pending'),
    ]);
    const backward = groupCompanyPayments([
      row('n', 'pending'),
      row('d', 'pending', { dueDate: '2026-04-01' }),
    ]);

    expect(ids(forward.invoices)).toEqual(['d', 'n']);
    expect(ids(backward.invoices)).toEqual(['d', 'n']);
  });

  // Mutation: applying the due-date rule to every status would reorder submitted/paid by due date.
  it('uses the due date only within pending: submitted and paid go by date then id', () => {
    const g = groupCompanyPayments([
      row('c-new', 'claimed', { date: '2026-05-01', dueDate: '2026-01-01' }),
      row('c-old', 'claimed', { date: '2026-02-01', dueDate: '2026-12-01' }),
      row('p-b', 'paid', { date: '2026-02-01' }),
      row('p-a', 'paid', { date: '2026-02-01' }),
    ]);

    expect(ids(g.invoices)).toEqual(['c-old', 'c-new', 'p-a', 'p-b']);
  });

  it('orders offers newest first, ties by id', () => {
    const g = groupCompanyPayments([
      row('o-old', 'quotation', { date: '2026-01-01' }),
      row('o-b', 'quotation', { date: '2026-06-01' }),
      row('o-a', 'quotation', { date: '2026-06-01' }),
    ]);

    expect(ids(g.offers)).toEqual(['o-a', 'o-b', 'o-old']);
  });

  it('lists the progress payments of invoices and offers, newest due first, ties by id, with the parent', () => {
    const g = groupCompanyPayments([
      row('i1', 'pending', { no: 'R-1', deposits: [deposit('d1', '2026-03-01')] }),
      row('q1', 'quotation', {
        deposits: [deposit('d3', '2026-05-01'), deposit('d2', '2026-03-01')],
      }),
      row('i2', 'paid'),
    ]);

    expect(g.progressPayments.map((p) => p.deposit.id)).toEqual(['d3', 'd1', 'd2']);
    expect(g.progressPayments[1]!.parent).toEqual({ id: 'i1', invoiceNumber: 'R-1' });
    expect(g.progressPayments[2]!.parent).toEqual({ id: 'q1', invoiceNumber: null });
  });

  it('returns three empty lists for no records', () => {
    expect(groupCompanyPayments([])).toEqual({ invoices: [], offers: [], progressPayments: [] });
  });
});

describe('countSubmitted', () => {
  it('counts only claimed invoices', () => {
    expect(
      countSubmitted([
        row('a', 'claimed'),
        row('b', 'pending'),
        row('c', 'claimed'),
        row('d', 'paid'),
      ]),
    ).toBe(2);
    expect(countSubmitted([])).toBe(0);
  });
});
