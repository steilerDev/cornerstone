/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';

// Mock API modules BEFORE importing the component
const mockFetchAllInvoices = jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>();
const mockCreateInvoice = jest.fn<typeof InvoicesApiTypes.createInvoice>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchAllInvoices: mockFetchAllInvoices,
  createInvoice: mockCreateInvoice,
  fetchInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  deleteInvoice: jest.fn(),
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

// ─── Mock: formatters — provides useFormatters() hook ────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  const fmtDate = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return fallback;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  const fmtTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  const fmtDateTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: fmtTime,
    formatDateTime: fmtDateTime,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
      formatTime: fmtTime,
      formatDateTime: fmtDateTime,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// ─── Mock: useTableState — returns stable defaults ────────────────────────────

jest.unstable_mockModule('../../hooks/useTableState.js', () => ({
  useTableState: () => ({
    tableState: {
      search: '',
      sortBy: 'date',
      sortDir: 'desc',
      page: 1,
      pageSize: 25,
      filters: new Map(),
    },
    searchInput: '',
    setSearch: jest.fn(),
    toApiParams: () => ({ page: 1, pageSize: 25 }),
    setFilter: jest.fn(),
    setSortBy: jest.fn(),
    setPage: jest.fn(),
    setPageSize: jest.fn(),
  }),
}));

describe('InvoicesPage — layout consistency (Issue #1142)', () => {
  let InvoicesPage: React.ComponentType;

  const emptyInvoiceResponse = {
    invoices: [],
    pagination: { totalItems: 0, totalPages: 1, page: 1, pageSize: 25 },
    summary: {
      pending: { count: 0, totalAmount: 0 },
      paid: { count: 0, totalAmount: 0 },
      claimed: { count: 0, totalAmount: 0 },
      quotation: { count: 0, totalAmount: 0 },
    },
  };

  beforeEach(async () => {
    if (!InvoicesPage) {
      const module = await import('./InvoicesPage.js');
      InvoicesPage = module.InvoicesPage;
    }

    mockFetchAllInvoices.mockReset();
    mockCreateInvoice.mockReset();
    mockFetchVendors.mockReset();

    // Default: empty results
    mockFetchAllInvoices.mockResolvedValue(emptyInvoiceResponse);
    mockFetchVendors.mockResolvedValue({ vendors: [], pagination: { totalItems: 0, totalPages: 1, page: 1, pageSize: 100 } });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/budget/invoices']}>
        <InvoicesPage />
      </MemoryRouter>,
    );
  }

  // ─── Page layout ────────────────────────────────────────────────────────────

  describe('page layout', () => {
    it('renders an <h1> page title', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });
    });

    it('renders "New Invoice" primary action button', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new invoice/i })).toBeInTheDocument();
      });
    });

    it('"New Invoice" button is accessible by role and text', async () => {
      renderPage();

      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /new invoice/i });
        expect(btn).toBeVisible();
        expect(btn).not.toBeDisabled();
      });
    });
  });
});
