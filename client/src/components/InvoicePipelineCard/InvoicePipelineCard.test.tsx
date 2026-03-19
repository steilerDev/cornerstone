/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils.js';
import type * as CardTypes from './InvoicePipelineCard.js';
import type { Invoice, InvoiceStatusBreakdown } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

// ─── Mock: formatters — provides useFormatters() hook used by this component ──

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  return {
    formatDate: (d: string | null | undefined) => d ?? '—',
    formatCurrency: fmtCurrency,
    formatTime: (d: string | null | undefined) => d ?? '—',
    formatDateTime: (d: string | null | undefined) => d ?? '—',
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: (d: string | null | undefined) => d ?? '—',
      formatTime: (d: string | null | undefined) => d ?? '—',
      formatDateTime: (d: string | null | undefined) => d ?? '—',
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// Dynamic import — must happen after any jest.unstable_mockModule calls.
let InvoicePipelineCard: typeof CardTypes.InvoicePipelineCard;

beforeEach(async () => {
  const mod = await import('./InvoicePipelineCard.js');
  InvoicePipelineCard = mod.InvoicePipelineCard;
});

// ── Base Fixtures ─────────────────────────────────────────────────────────────

const baseSummary: InvoiceStatusBreakdown = {
  pending: { count: 0, totalAmount: 0 },
  paid: { count: 0, totalAmount: 0 },
  claimed: { count: 0, totalAmount: 0 },
  quotation: { count: 0, totalAmount: 0 },
};

const baseInvoice: Invoice = {
  id: 'inv-001',
  vendorId: 'vendor-1',
  vendorName: 'ACME Construction',
  invoiceNumber: 'INV-2026-001',
  amount: 5000,
  date: '2026-01-10',
  dueDate: '2026-02-10',
  status: 'pending',
  notes: null,
  budgetLines: [],
  remainingAmount: 5000,
  createdBy: null,
  createdAt: '2026-01-10T00:00:00.000Z',
  updatedAt: '2026-01-10T00:00:00.000Z',
};

// ── Date helper ───────────────────────────────────────────────────────────────

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InvoicePipelineCard', () => {
  // ── Test 1: Empty state ──────────────────────────────────────────────────────

  it('shows empty state when there are no pending invoices', () => {
    renderWithRouter(<InvoicePipelineCard invoices={[]} summary={baseSummary} />);

    expect(screen.getByTestId('invoice-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-row')).toBeNull();
  });

  // ── Test 2: Shows pending invoices ───────────────────────────────────────────

  it('renders one invoice-row per pending invoice', () => {
    const invoices: Invoice[] = [
      { ...baseInvoice, id: 'inv-001', vendorName: 'Builder Co' },
      { ...baseInvoice, id: 'inv-002', vendorName: 'Plumber Inc' },
    ];

    renderWithRouter(<InvoicePipelineCard invoices={invoices} summary={baseSummary} />);

    const rows = screen.getAllByTestId('invoice-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('Builder Co')).toBeInTheDocument();
    expect(screen.getByText('Plumber Inc')).toBeInTheDocument();
  });

  // ── Test 3: Filters non-pending invoices ─────────────────────────────────────

  it('only renders rows for pending invoices, excluding paid and claimed', () => {
    const invoices: Invoice[] = [
      { ...baseInvoice, id: 'inv-pending', vendorName: 'Pending Vendor', status: 'pending' },
      { ...baseInvoice, id: 'inv-paid', vendorName: 'Paid Vendor', status: 'paid' },
      { ...baseInvoice, id: 'inv-claimed', vendorName: 'Claimed Vendor', status: 'claimed' },
    ];

    renderWithRouter(<InvoicePipelineCard invoices={invoices} summary={baseSummary} />);

    const rows = screen.getAllByTestId('invoice-row');
    expect(rows).toHaveLength(1);
    expect(screen.getByText('Pending Vendor')).toBeInTheDocument();
    expect(screen.queryByText('Paid Vendor')).toBeNull();
    expect(screen.queryByText('Claimed Vendor')).toBeNull();
  });

  // ── Test 4: Sorts oldest first ───────────────────────────────────────────────

  it('sorts pending invoices by date ascending so the oldest appears first', () => {
    const invoices: Invoice[] = [
      { ...baseInvoice, id: 'inv-march', vendorName: 'March Vendor', date: '2026-03-01' },
      { ...baseInvoice, id: 'inv-jan', vendorName: 'January Vendor', date: '2026-01-15' },
      { ...baseInvoice, id: 'inv-feb', vendorName: 'February Vendor', date: '2026-02-10' },
    ];

    renderWithRouter(<InvoicePipelineCard invoices={invoices} summary={baseSummary} />);

    const rows = screen.getAllByTestId('invoice-row');
    expect(rows).toHaveLength(3);
    // Oldest (Jan 15) must be first
    expect(rows[0]).toHaveTextContent('January Vendor');
  });

  // ── Test 5: Caps at 5 invoices ───────────────────────────────────────────────

  it('renders at most 5 invoice rows even when more pending invoices exist', () => {
    const invoices: Invoice[] = Array.from({ length: 7 }, (_, i) => ({
      ...baseInvoice,
      id: `inv-${i + 1}`,
      vendorName: `Vendor ${i + 1}`,
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    }));

    renderWithRouter(<InvoicePipelineCard invoices={invoices} summary={baseSummary} />);

    const rows = screen.getAllByTestId('invoice-row');
    expect(rows).toHaveLength(5);
  });

  // ── Test 6: Overdue badge shown for past dueDate ─────────────────────────────

  it('renders an overdue-badge when the invoice dueDate is yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const invoices: Invoice[] = [
      { ...baseInvoice, id: 'inv-overdue', dueDate: formatDateStr(yesterday) },
    ];

    renderWithRouter(<InvoicePipelineCard invoices={invoices} summary={baseSummary} />);

    expect(screen.getByTestId('overdue-badge')).toBeInTheDocument();
  });

  // ── Test 7: No overdue badge for future dueDate ──────────────────────────────

  it('does not render an overdue-badge when dueDate is 30 days from now', () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);

    const invoices: Invoice[] = [
      { ...baseInvoice, id: 'inv-future', dueDate: formatDateStr(future) },
    ];

    renderWithRouter(<InvoicePipelineCard invoices={invoices} summary={baseSummary} />);

    expect(screen.queryByTestId('overdue-badge')).toBeNull();
  });

  // ── Test 8: No overdue badge when dueDate is null ────────────────────────────

  it('does not render an overdue-badge when dueDate is null', () => {
    const invoices: Invoice[] = [{ ...baseInvoice, id: 'inv-no-due', dueDate: null }];

    renderWithRouter(<InvoicePipelineCard invoices={invoices} summary={baseSummary} />);

    expect(screen.queryByTestId('overdue-badge')).toBeNull();
  });

  // ── Test 9: Fallback for null invoiceNumber ──────────────────────────────────

  it('renders the row without "null" text when invoiceNumber is null', () => {
    const invoices: Invoice[] = [{ ...baseInvoice, id: 'inv-no-num', invoiceNumber: null }];

    renderWithRouter(<InvoicePipelineCard invoices={invoices} summary={baseSummary} />);

    expect(screen.getByTestId('invoice-row')).toBeInTheDocument();
    // The word "null" must never appear as visible text
    expect(screen.queryByText('null')).toBeNull();
  });

  // ── Test 10: Pending total displayed ────────────────────────────────────────

  it('displays the pending total amount as formatted currency in the footer', () => {
    const summary: InvoiceStatusBreakdown = {
      ...baseSummary,
      pending: { count: 1, totalAmount: 12500 },
    };
    const invoices: Invoice[] = [{ ...baseInvoice, id: 'inv-total' }];

    renderWithRouter(<InvoicePipelineCard invoices={invoices} summary={summary} />);

    const totalEl = screen.getByTestId('pending-total');
    expect(totalEl).toBeInTheDocument();
    expect(totalEl.textContent).toMatch(/12,500/);
  });

  // ── Test 11: Footer link to invoices page ────────────────────────────────────

  it('renders a "View all invoices" link pointing to /budget/invoices', () => {
    const invoices: Invoice[] = [{ ...baseInvoice, id: 'inv-link' }];

    renderWithRouter(<InvoicePipelineCard invoices={invoices} summary={baseSummary} />);

    const link = screen.getByRole('link', { name: /view all invoices/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/budget/invoices');
  });

  // ── Test 12: Invoice amount formatted ────────────────────────────────────────

  it('displays the invoice amount as formatted EUR currency within the row', () => {
    const invoices: Invoice[] = [{ ...baseInvoice, id: 'inv-amount', amount: 3750 }];

    renderWithRouter(<InvoicePipelineCard invoices={invoices} summary={baseSummary} />);

    const row = screen.getByTestId('invoice-row');
    expect(row).toHaveTextContent('€3,750.00');
  });

  // ── Test 13: Each invoice row links to the invoice detail page ────────────

  it('each invoice row contains a link to /budget/invoices/<invoice-id>', () => {
    const invoices: Invoice[] = [
      { ...baseInvoice, id: 'inv-aaa', vendorName: 'Vendor AAA' },
      { ...baseInvoice, id: 'inv-bbb', vendorName: 'Vendor BBB' },
    ];

    renderWithRouter(<InvoicePipelineCard invoices={invoices} summary={baseSummary} />);

    const rows = screen.getAllByTestId('invoice-row');
    expect(rows).toHaveLength(2);

    // Each row must contain an <a> pointing to the invoice detail page
    const linkAAA = rows[0].querySelector('a');
    expect(linkAAA).not.toBeNull();
    expect(linkAAA).toHaveAttribute('href', '/budget/invoices/inv-aaa');

    const linkBBB = rows[1].querySelector('a');
    expect(linkBBB).not.toBeNull();
    expect(linkBBB).toHaveAttribute('href', '/budget/invoices/inv-bbb');
  });
});
