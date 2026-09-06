/**
 * @jest-environment jsdom
 *
 * Story #2046: "Show only open items" toggle behavior on InvoicesPage.
 * Covers the toggle itself, URL sync, mutual exclusivity with the status filter,
 * expandable child (deposit/refund) rows, overdue chips, the openPayable/refundsDue
 * summary tiles, and the empty-state branching. Regression coverage for pre-existing
 * behavior (no toggle, plain rows) lives in InvoicesPage.test.tsx.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type { Invoice, InvoiceDeposit, InvoiceListPaginatedResponse } from '@cornerstone/shared';
import type * as InvoicesPageTypes from './InvoicesPage.js';

// ── API mocks ─────────────────────────────────────────────────────────────────

const mockFetchAllInvoices = jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>();
const mockCreateInvoice = jest.fn<typeof InvoicesApiTypes.createInvoice>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchVendors = jest.fn<any>();

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchAllInvoices: mockFetchAllInvoices,
  createInvoice: mockCreateInvoice,
  fetchInvoices: jest.fn(),
  fetchInvoiceById: jest.fn(),
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

jest.unstable_mockModule('../../lib/formatters.js', () => {
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
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(n);
  return {
    formatDate: fmtDate,
    formatCurrency: fmtCurrency,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatDate: fmtDate,
      formatCurrency: fmtCurrency,
      formatTime: () => '—',
      formatDateTime: () => '—',
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetPaperlessStatus = jest.fn<any>();

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: jest.fn().mockReturnValue('/thumb'),
  getDocumentPreviewUrl: jest.fn().mockReturnValue('/preview'),
  listPaperlessCorrespondents: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchConfig = jest.fn<any>();

jest.unstable_mockModule('../../lib/configApi.js', () => ({
  fetchConfig: mockFetchConfig,
}));

jest.unstable_mockModule('../../components/invoices/InvoicePaperlessPickerModal.js', () => ({
  InvoicePaperlessPickerModal: () => null,
}));

import React from 'react';

// ── Location helper ───────────────────────────────────────────────────────────

function LocationDisplay() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

// ── Date helper (local-calendar offset from "today", matching todayIso()'s convention) ─

function isoDaysFromToday(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeDeposit(
  overrides: Partial<InvoiceDeposit> &
    Pick<InvoiceDeposit, 'id' | 'invoiceId' | 'amount' | 'dueDate' | 'status'>,
): InvoiceDeposit {
  return {
    paidDate: null,
    claimedDate: null,
    description: null,
    entryType: 'deposit',
    budgetSourceId: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeInvoice(
  overrides: Partial<Invoice> &
    Pick<Invoice, 'id' | 'vendorId' | 'vendorName' | 'amount' | 'status'>,
): Invoice {
  return {
    invoiceNumber: null,
    date: '2026-01-01',
    dueDate: null,
    notes: null,
    budgetLines: [],
    remainingAmount: overrides.amount,
    deposits: [],
    finalPaymentAmount: overrides.amount,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// INV-A: pending, not itself overdue, one overdue pending deposit + one non-overdue
// pending deposit + one paid deposit (not rendered as a child). openAmount 10000.
const invA: Invoice = makeInvoice({
  id: 'inv-a',
  vendorId: 'v-1',
  vendorName: 'ACME Construction',
  invoiceNumber: 'INV-A',
  amount: 15000,
  status: 'pending',
  dueDate: isoDaysFromToday(60),
  deposits: [
    makeDeposit({
      id: 'dep-a1',
      invoiceId: 'inv-a',
      amount: 5000,
      dueDate: isoDaysFromToday(-10),
      status: 'pending',
    }),
    makeDeposit({
      id: 'dep-a2',
      invoiceId: 'inv-a',
      amount: 5000,
      dueDate: isoDaysFromToday(20),
      status: 'pending',
    }),
    makeDeposit({
      id: 'dep-a3',
      invoiceId: 'inv-a',
      amount: 5000,
      dueDate: isoDaysFromToday(-30),
      status: 'paid',
      paidDate: isoDaysFromToday(-30),
    }),
  ],
  openAmount: 10000,
});

// INV-C: quotation container, one pending deposit. openAmount 8000.
const invC: Invoice = makeInvoice({
  id: 'inv-c',
  vendorId: 'v-2',
  vendorName: 'Quality Plumbing',
  invoiceNumber: 'INV-C',
  amount: 40000,
  status: 'quotation',
  dueDate: null,
  deposits: [
    makeDeposit({
      id: 'dep-c1',
      invoiceId: 'inv-c',
      amount: 8000,
      dueDate: isoDaysFromToday(15),
      status: 'pending',
    }),
  ],
  openAmount: 8000,
});

// INV-F: pending, one pending refund (not a deposit). openAmount 4000, refundsDue 1200.
const invF: Invoice = makeInvoice({
  id: 'inv-f',
  vendorId: 'v-1',
  vendorName: 'ACME Construction',
  invoiceNumber: 'INV-F',
  amount: 4000,
  status: 'pending',
  dueDate: isoDaysFromToday(45),
  deposits: [
    makeDeposit({
      id: 'dep-f1',
      invoiceId: 'inv-f',
      amount: 1200,
      dueDate: isoDaysFromToday(50),
      status: 'pending',
      entryType: 'refund',
    }),
  ],
  openAmount: 4000,
});

// INV-G: overdue in its own right, no deposits. openAmount 2000.
const invG: Invoice = makeInvoice({
  id: 'inv-g',
  vendorId: 'v-1',
  vendorName: 'ACME Construction',
  invoiceNumber: 'INV-G',
  amount: 2000,
  status: 'pending',
  dueDate: isoDaysFromToday(-5),
  deposits: [],
  openAmount: 2000,
});

// Base summary: openPayable/refundsDue deliberately DIFFER from pending, so a tile
// wired to the wrong bucket fails loudly. overdue is zeroed out to avoid the
// pre-existing "Overdue" summary card colliding with this story's own "Overdue"/
// "Deposit overdue" chip text in text-based queries.
const baseOpenSummary = {
  pending: { count: 2, totalAmount: 5000 },
  paid: { count: 0, totalAmount: 0 },
  claimed: { count: 0, totalAmount: 0 },
  quotation: { count: 1, totalAmount: 40000 },
  overdue: { count: 0, totalAmount: 0 },
  claimable: { count: 0, totalAmount: 0 },
  quotationCoveredByDeposits: 0,
  openPayable: { count: 3, totalAmount: 22000 },
  refundsDue: { count: 1, totalAmount: 1200 },
};

function openResponse(
  invoices: Invoice[],
  summaryOverrides: Partial<typeof baseOpenSummary> = {},
): InvoiceListPaginatedResponse {
  return {
    invoices,
    pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: invoices.length },
    summary: { ...baseOpenSummary, ...summaryOverrides },
  };
}

const emptyOffResponse: InvoiceListPaginatedResponse = {
  invoices: [],
  pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
  summary: {
    pending: { count: 0, totalAmount: 0 },
    paid: { count: 0, totalAmount: 0 },
    claimed: { count: 0, totalAmount: 0 },
    quotation: { count: 0, totalAmount: 0 },
    overdue: { count: 0, totalAmount: 0 },
    claimable: { count: 0, totalAmount: 0 },
    quotationCoveredByDeposits: 0,
    openPayable: { count: 0, totalAmount: 0 },
    refundsDue: { count: 0, totalAmount: 0 },
  },
};

const emptyVendorsResponse = {
  vendors: [],
  pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
};

describe('InvoicesPage — "Show only open items" (Story #2046)', () => {
  let InvoicesPageModule: typeof InvoicesPageTypes;

  beforeEach(async () => {
    mockFetchAllInvoices.mockReset();
    mockCreateInvoice.mockReset();
    mockFetchVendors.mockReset();
    mockGetPaperlessStatus.mockReset();
    mockFetchConfig.mockReset();

    if (!InvoicesPageModule) {
      InvoicesPageModule = await import('./InvoicesPage.js');
    }

    mockGetPaperlessStatus.mockResolvedValue({
      configured: false,
      reachable: false,
      error: null,
      paperlessUrl: null,
      filterTag: null,
    });
    mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false });
    mockFetchVendors.mockResolvedValue(emptyVendorsResponse);
  });

  function renderPageAt(initialEntry: string) {
    return render(
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/budget/invoices" element={<InvoicesPageModule.InvoicesPage />} />
            <Route path="/budget/invoices/:id" element={<div>Invoice Detail</div>} />
            <Route path="/settings/vendors/:id" element={<div>Vendor Detail</div>} />
          </Routes>
          <LocationDisplay />
        </MemoryRouter>
      </ToastProvider>,
    );
  }

  // ─── Toggle + URL sync (AC6) ────────────────────────────────────────────────

  describe('toggle + URL sync', () => {
    it('AC6/AC31: renders with an accessible name, and checking it sets ?openOnly=true and re-fetches with openOnly:true', async () => {
      mockFetchAllInvoices.mockResolvedValue(emptyOffResponse);
      renderPageAt('/budget/invoices');
      // useTableState's URL-sync effect re-fires the load effect once on mount
      // (a fresh filters Map reference), so the initial mount can legitimately
      // issue more than one fetch — assert it settles with openOnly not set,
      // rather than pinning an exact call count.
      await waitFor(() => {
        expect(mockFetchAllInvoices).toHaveBeenCalled();
        expect(mockFetchAllInvoices.mock.calls.at(-1)![0]).toMatchObject({ openOnly: false });
      });

      const toggle = screen.getByRole('checkbox', { name: 'Show only open items' });
      expect(toggle).not.toBeChecked();

      const user = userEvent.setup();
      await user.click(toggle);

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toContain('openOnly=true');
      });
      await waitFor(() => {
        const lastCall = mockFetchAllInvoices.mock.calls.at(-1)![0];
        expect(lastCall).toMatchObject({ openOnly: true });
      });
    });

    it('AC6: mounting at ?openOnly=true checks the toggle, and the FIRST fetch call already carries openOnly:true', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(openResponse([invA, invC, invF]));
      renderPageAt('/budget/invoices?openOnly=true');

      await waitFor(() => expect(mockFetchAllInvoices).toHaveBeenCalled());
      expect(screen.getByRole('checkbox', { name: 'Show only open items' })).toBeChecked();
      expect(mockFetchAllInvoices.mock.calls[0]![0]).toMatchObject({ openOnly: true });
    });
  });

  // ─── Mutual exclusivity with the status filter (AC7) ───────────────────────

  describe('mutual exclusivity with the status column filter', () => {
    it('AC7: turning the toggle ON removes an active status filter from the URL', async () => {
      mockFetchAllInvoices.mockResolvedValue(emptyOffResponse);
      renderPageAt('/budget/invoices?status=paid');
      await waitFor(() => expect(mockFetchAllInvoices).toHaveBeenCalled());

      const user = userEvent.setup();
      const toggle = screen.getByRole('checkbox', { name: 'Show only open items' });
      await user.click(toggle);

      await waitFor(() => {
        const location = screen.getByTestId('location').textContent!;
        expect(location).toContain('openOnly=true');
        expect(location).not.toContain('status=paid');
      });
    });

    it('AC7: a further table state change while both are set (e.g. sorting) drops openOnly, keeping the status filter', async () => {
      // Simulates a direct URL/back-forward navigation landing on both params at
      // once; the disabled filter trigger prevents choosing a status filter via the
      // UI while ON, so the cleanup path is exercised via any other DataTable state
      // change (here, clicking the sortable "Date" column header).
      mockFetchAllInvoices.mockResolvedValue(openResponse([invA]));
      renderPageAt('/budget/invoices?openOnly=true&status=paid');
      await waitFor(() => expect(mockFetchAllInvoices).toHaveBeenCalled());

      const dateHeaderLabel = screen.getAllByText('Date').find((el) => el.closest('thead'))!;
      const dateHeaderCell = dateHeaderLabel.closest('th')!;
      fireEvent.click(dateHeaderCell);

      await waitFor(() => {
        const location = screen.getByTestId('location').textContent!;
        expect(location).toContain('status=paid');
        expect(location).not.toContain('openOnly=true');
      });
    });

    it('AC7: the Status column filter trigger is disabled while the toggle is ON', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(openResponse([invA]));
      renderPageAt('/budget/invoices?openOnly=true');
      await waitFor(() => expect(mockFetchAllInvoices).toHaveBeenCalled());

      const statusFilterButton = screen.getByRole('button', {
        name: 'Not available while "Show only open items" is active',
      });
      expect(statusFilterButton).toBeDisabled();
    });
  });

  // ─── "Still due" column (AC14) ──────────────────────────────────────────────

  describe('"Still due" column', () => {
    it('AC14: appears only when the toggle is ON, and shows — for a container-only parent', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(openResponse([invA, invC]));
      renderPageAt('/budget/invoices?openOnly=true');

      await waitFor(() => expect(screen.getAllByText('Still due').length).toBeGreaterThan(0));
      // INV-A (a real open payer) shows its openAmount as currency
      expect(screen.getAllByText('€10,000.00').length).toBeGreaterThan(0);

      // INV-C (container-only) shows — instead of a currency figure
      const invCRow = screen.getAllByText('INV-C')[0]!.closest('tr')!;
      expect(
        within(invCRow).getByTitle(
          'Unpaid final payment plus unpaid deposits. Deposit amounts on the rows below are already included in this figure, not additional to it.',
        ),
      ).toHaveTextContent('—');
    });
  });

  // ─── Child rows (AC9, AC18) ─────────────────────────────────────────────────

  describe('child rows', () => {
    it('AC9: exactly the pending deposits render as child rows — the paid deposit does not', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(openResponse([invA]));
      renderPageAt('/budget/invoices?openOnly=true');

      await waitFor(() => expect(screen.getAllByText('INV-A').length).toBeGreaterThan(0));
      // getDepositOrdinal numbers ALL deposit-type entries (3 total); only the two
      // pending ones (1/3, 2/3) are rendered as children — the paid one (3/3) is not.
      // Renders in both the desktop row and the mobile card (no CSS media-query
      // filtering in jsdom), so at least one instance of each must be present.
      expect(screen.getAllByText('Deposit 1/3').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Deposit 2/3').length).toBeGreaterThan(0);
      expect(screen.queryByText('Deposit 3/3')).not.toBeInTheDocument();
    });

    it('AC18: a refund child shows the Refund badge, a negative amount, and the "excluded" caption — distinct from a deposit child\'s "included" caption', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(openResponse([invA, invF]));
      renderPageAt('/budget/invoices?openOnly=true');

      await waitFor(() => expect(screen.getAllByText('INV-F').length).toBeGreaterThan(0));

      expect(screen.getAllByText('Refund').length).toBeGreaterThan(0);
      expect(screen.getAllByText('-€1,200.00').length).toBeGreaterThan(0);

      const includedCaption = 'Included in the invoice total above';
      const excludedCaption = 'Reported separately below';
      expect(includedCaption).not.toBe(excludedCaption);
      expect(screen.getAllByText(includedCaption).length).toBeGreaterThan(0);
      expect(screen.getAllByText(excludedCaption).length).toBeGreaterThan(0);
    });
  });

  // ─── Overdue chips (AC21, AC25) ─────────────────────────────────────────────

  describe('overdue chips', () => {
    it('AC21/AC25: a collapsed parent with only an overdue deposit reads "Deposit overdue"; an invoice overdue in its own right reads "Overdue" — both keep their pending badge', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(openResponse([invA, invG]));
      renderPageAt('/budget/invoices?openOnly=true');
      await waitFor(() => expect(screen.getAllByText('INV-A').length).toBeGreaterThan(0));

      // Collapse INV-A (expanded by default) to prove the chip survives collapse.
      const user = userEvent.setup();
      const collapseButtons = screen.getAllByRole('button', { name: /Collapse INV-A/ });
      await user.click(collapseButtons[0]!);

      await waitFor(() => {
        expect(screen.getAllByTestId('invoice-overdue-inv-a')[0]).toHaveTextContent(
          'Deposit overdue',
        );
      });
      expect(screen.getAllByTestId('invoice-overdue-inv-g')[0]).toHaveTextContent('Overdue');

      // Both invoices keep their real 'pending' status badge alongside the chip.
      expect(screen.getAllByTestId('invoice-status-inv-a')[0]).toHaveTextContent('Pending');
      expect(screen.getAllByTestId('invoice-status-inv-g')[0]).toHaveTextContent('Pending');
    });
  });

  // ─── Container parent (AC10) ────────────────────────────────────────────────

  describe('container-only parent', () => {
    it('AC10: shows both its real status badge ("Quotation") and the "Deposits only" container chip', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(openResponse([invC]));
      renderPageAt('/budget/invoices?openOnly=true');
      await waitFor(() => expect(screen.getAllByText('INV-C').length).toBeGreaterThan(0));

      expect(screen.getAllByTestId('invoice-status-inv-c')[0]).toHaveTextContent('Quotation');
      expect(screen.getAllByTestId('invoice-container-inv-c')[0]).toHaveTextContent(
        'Deposits only',
      );
    });
  });

  // ─── Badge className regression ─────────────────────────────────────────────

  describe('badge className regression', () => {
    it('the status badge className resolves a real class ("pending"), never leaves the literal "undefined"', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(openResponse([invA]));
      renderPageAt('/budget/invoices?openOnly=true');
      await waitFor(() =>
        expect(screen.getAllByTestId('invoice-status-inv-a').length).toBeGreaterThan(0),
      );

      const badge = screen.getAllByTestId('invoice-status-inv-a')[0]!;
      expect(badge.className).toContain('pending');
      expect(badge.className).not.toMatch(/\bundefined\b/);
    });
  });

  // ─── Summary tiles (AC16, AC19) ─────────────────────────────────────────────

  describe('summary tiles', () => {
    it('AC16/AC19: the open-payable and refunds-due tiles read from summary.openPayable/refundsDue, not summary.pending', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(openResponse([invA, invC, invF]));
      renderPageAt('/budget/invoices?openOnly=true');
      await waitFor(() =>
        expect(screen.getByTestId('summary-card-open-payable')).toBeInTheDocument(),
      );

      const openPayableCard = screen.getByTestId('summary-card-open-payable');
      // openPayable.count is 3 (deliberately different from pending.count, 2).
      expect(within(openPayableCard).getByText('3')).toBeInTheDocument();
      expect(within(openPayableCard).getByText('€22,000.00')).toBeInTheDocument();

      const refundsCard = screen.getByTestId('summary-card-refunds-due');
      expect(within(refundsCard).getByText('1')).toBeInTheDocument();
      expect(within(refundsCard).getByText('€1,200.00')).toBeInTheDocument();
    });

    it('the open-payable tile always renders (toggle on or off); the refunds-due tile renders only when refundsDue.count > 0', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(emptyOffResponse);
      renderPageAt('/budget/invoices');
      await waitFor(() =>
        expect(screen.getByTestId('summary-card-open-payable')).toBeInTheDocument(),
      );
      expect(screen.queryByTestId('summary-card-refunds-due')).not.toBeInTheDocument();
    });
  });

  // ─── Empty states (AC26, AC27) ──────────────────────────────────────────────

  describe('empty states', () => {
    it('AC26: toggle ON, zero open items, no filters — shows "Nothing open right now" with no add-invoice action', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(
        openResponse([], {
          openPayable: { count: 0, totalAmount: 0 },
          refundsDue: { count: 0, totalAmount: 0 },
        }),
      );
      renderPageAt('/budget/invoices?openOnly=true');

      await waitFor(() => expect(screen.getByText('Nothing open right now')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'Add First Invoice' })).not.toBeInTheDocument();
    });

    it('AC27: toggle ON + a vendor filter + zero items — shows the generic filtered empty state with a Clear Filters action', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(
        openResponse([], {
          openPayable: { count: 0, totalAmount: 0 },
          refundsDue: { count: 0, totalAmount: 0 },
        }),
      );
      renderPageAt('/budget/invoices?openOnly=true&vendorId=v-1');

      await waitFor(() =>
        expect(screen.getByText('No items match the current filters')).toBeInTheDocument(),
      );
      // Both the toolbar's own "Clear Filters" button (shown whenever a filter
      // is active) and the empty-state's action button render simultaneously —
      // two distinct buttons sharing the same accessible name.
      expect(screen.getAllByRole('button', { name: 'Clear Filters' }).length).toBeGreaterThan(0);
      expect(screen.queryByText('Nothing open right now')).not.toBeInTheDocument();
    });
  });

  // ─── Toggle OFF regression (AC12) ───────────────────────────────────────────

  describe('toggle OFF', () => {
    it('AC12: no child rows, no "Still due" column, no chips even for an otherwise-qualifying invoice', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce({
        invoices: [{ ...invC, deposits: [], openAmount: undefined }],
        pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 1 },
        summary: emptyOffResponse.summary,
      });
      renderPageAt('/budget/invoices');

      await waitFor(() => expect(screen.getAllByText('INV-C').length).toBeGreaterThan(0));
      expect(screen.queryByText('Still due')).not.toBeInTheDocument();
      expect(screen.queryByText('Deposits only')).not.toBeInTheDocument();
      expect(screen.queryByText('Deposit 1/1')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Collapse INV-C|Expand INV-C/ }),
      ).not.toBeInTheDocument();
    });

    it('the pre-existing "no invoices" empty state (with its Add First Invoice CTA) returns', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(emptyOffResponse);
      renderPageAt('/budget/invoices');

      await waitFor(() => expect(screen.getByText('No invoices yet')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Add First Invoice' })).toBeInTheDocument();
    });
  });
});
