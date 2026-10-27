/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { useFormatters } from '../../lib/formatters.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { makeInvoiceDetail, makePayment } from '../../test/invoiceDetailFixtures.js';
import { buildPaymentRows, FINAL_PAYMENT_ROW_ID } from './invoicePaymentRows.js';
import type { PaymentRowContext } from './invoicePaymentRows.js';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <LocaleProvider>{children}</LocaleProvider>
    </MemoryRouter>
  );
}

function useContextParts() {
  const { t } = useTranslation('budget');
  const { formatCurrency, formatDate } = useFormatters();
  const variants = useStatusBadgeVariants();
  return { t, formatCurrency, formatDate, variants };
}

function build(invoice: ReturnType<typeof makeInvoiceDetail>) {
  const { result } = renderHook(useContextParts, { wrapper });
  const ctx: PaymentRowContext = {
    invoice,
    ...result.current,
    renderStatus: (deposit, title) => (
      <span data-testid={`chip-${deposit.id}`}>{`chip:${deposit.status}:${title}`}</span>
    ),
  };
  return { rows: buildPaymentRows(ctx), ctx };
}

function renderNode(node: ReactNode) {
  return render(<>{node}</>, { wrapper });
}

describe('buildPaymentRows (S13)', () => {
  it('numbers progress payments and refunds per list in the API order, and a description wins', () => {
    const { rows } = build(
      makeInvoiceDetail({
        deposits: [
          makePayment({ id: 'p1' }),
          makePayment({ id: 'r1', entryType: 'refund', amount: 50 }),
          makePayment({ id: 'p2', description: 'Scaffolding deposit' }),
          makePayment({ id: 'p3' }),
          makePayment({ id: 'r2', entryType: 'refund', amount: 25 }),
        ],
      }),
    );
    expect(rows.progress.map((r) => r.title)).toEqual([
      'Progress payment 1',
      'Scaffolding deposit',
      'Progress payment 3',
      'Final payment',
    ]);
    expect(rows.refunds.map((r) => r.title)).toEqual(['Refund 1', 'Refund 2']);
    expect(rows.progress.map((r) => r.id)).toEqual(['p1', 'p2', 'p3', FINAL_PAYMENT_ROW_ID]);
  });

  it('links every payment row to itself on the Payments tab', () => {
    const { rows } = build(
      makeInvoiceDetail({
        id: 'inv-9',
        deposits: [makePayment({ id: 'p1' }), makePayment({ id: 'r1', entryType: 'refund' })],
      }),
    );
    expect(rows.progress[0]?.to).toBe('/budget/invoices/inv-9?tab=payments&payment=p1');
    expect(rows.refunds[0]?.to).toBe('/budget/invoices/inv-9?tab=payments&payment=r1');
  });

  it('shows the amount of a progress payment and the negative amount of a refund', () => {
    const { rows } = build(
      makeInvoiceDetail({
        deposits: [
          makePayment({ id: 'p1', amount: 300 }),
          makePayment({ id: 'r1', entryType: 'refund', amount: 50 }),
        ],
      }),
    );
    expect(rows.progress[0]?.amount).toBe('€300.00');
    expect(rows.refunds[0]?.amount).toBe('-€50.00');
  });

  it('shows the Refund badge on refunds only, and the status chip inside the facts for both', () => {
    const { rows } = build(
      makeInvoiceDetail({
        deposits: [makePayment({ id: 'p1' }), makePayment({ id: 'r1', entryType: 'refund' })],
      }),
    );
    expect(rows.progress[0]?.badges).toBeUndefined();
    renderNode(rows.refunds[0]?.badges);
    expect(screen.getByText('Refund')).toBeInTheDocument();
    renderNode(rows.progress[0]?.facts);
    expect(screen.getByTestId('chip-p1')).toHaveTextContent('chip:pending:Progress payment 1');
  });

  it.each([
    ['pending', { dueDate: '2026-07-20' }, 'Due 2026-07-20'],
    ['paid', { dueDate: '2026-07-20', paidDate: '2026-07-22' }, 'Paid 2026-07-22'],
    ['paid', { dueDate: '2026-07-20', paidDate: null }, 'Paid 2026-07-20'],
    ['claimed', { dueDate: '2026-07-20', claimedDate: '2026-08-02' }, 'Submitted 2026-08-02'],
    ['claimed', { dueDate: '2026-07-20', claimedDate: null }, 'Submitted 2026-07-20'],
  ] as const)(
    'date fact for a %s payment (%j) reads "%s" in the locale format',
    (status, dates, text) => {
      const { rows, ctx } = build(
        makeInvoiceDetail({ deposits: [makePayment({ id: 'p1', status, ...dates })] }),
      );
      renderNode(rows.progress[0]?.facts);
      const expected = text.replace(/\d{4}-\d{2}-\d{2}/, (d) => ctx.formatDate(d));
      expect(screen.getByText(expected)).toBeInTheDocument();
      // the date is formatted, never the raw ISO string
      expect(screen.queryByText(text)).toBeNull();
    },
  );

  it('adds the final-payment row only when at least one progress payment exists', () => {
    expect(build(makeInvoiceDetail({ deposits: [] })).rows.progress).toEqual([]);
    expect(
      build(
        makeInvoiceDetail({
          deposits: [makePayment({ id: 'r1', entryType: 'refund' })],
        }),
      ).rows.progress,
    ).toEqual([]);
    expect(
      build(makeInvoiceDetail({ deposits: [makePayment({ id: 'p1' })] })).rows.progress,
    ).toHaveLength(2);
  });

  it('the final-payment row is not removable or editable, has no link and carries the record status badge', () => {
    const { rows } = build(
      makeInvoiceDetail({
        status: 'paid',
        finalPaymentAmount: 800,
        dueDate: '2026-08-01',
        deposits: [makePayment({ id: 'p1', amount: 200 })],
      }),
    );
    const final = rows.progress.at(-1)!;
    expect(final).toMatchObject({
      id: FINAL_PAYMENT_ROW_ID,
      title: 'Final payment',
      amount: '€800.00',
      removable: false,
      editable: false,
      facts: 'Due Aug 1, 2026',
    });
    expect(final.to).toBeUndefined();
    renderNode(final.badges);
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  it('the final-payment row shows an Offer badge on an offer and no date without a due date', () => {
    const { rows } = build(
      makeInvoiceDetail({
        status: 'quotation',
        dueDate: null,
        deposits: [makePayment({ id: 'p1' })],
      }),
    );
    const final = rows.progress.at(-1)!;
    expect(final.facts).toBeUndefined();
    renderNode(final.badges);
    expect(screen.getByText('Offer')).toBeInTheDocument();
  });

  it('counts progress payments only: the final row and refunds are excluded', () => {
    const { rows } = build(
      makeInvoiceDetail({
        deposits: [
          makePayment({ id: 'p1' }),
          makePayment({ id: 'p2' }),
          makePayment({ id: 'r1', entryType: 'refund' }),
        ],
      }),
    );
    expect(rows.progressCount).toBe(2);
    expect(rows.progress).toHaveLength(3);
    expect(rows.refunds).toHaveLength(1);
  });
});
