/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as InvoicesPageTypes from './InvoicesPage.js';
import type { Invoice, InvoiceListPaginatedResponse } from '@cornerstone/shared';

// ─── Module-scope mock functions ──────────────────────────────────────────────

const mockFetchAllInvoices = jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>();
const mockCreateInvoice = jest.fn<typeof InvoicesApiTypes.createInvoice>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();

// ─── Mock: invoicesApi ─────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchAllInvoices: mockFetchAllInvoices,
  fetchInvoices: jest.fn(),
  fetchInvoiceById: jest.fn(),
  createInvoice: mockCreateInvoice,
  updateInvoice: jest.fn(),
  deleteInvoice: jest.fn(),
}));

// ─── Mock: vendorsApi ──────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

// ─── Mock: workItemBudgetsApi ──────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: jest.fn(),
  createWorkItemBudget: jest.fn(),
  updateWorkItemBudget: jest.fn(),
  deleteWorkItemBudget: jest.fn(),
}));

// ─── Mock: householdItemBudgetsApi ─────────────────────────────────────────────

jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: jest.fn(),
  createHouseholdItemBudget: jest.fn(),
  updateHouseholdItemBudget: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));

// ─── Mock: WorkItemPicker ──────────────────────────────────────────────────────

jest.unstable_mockModule('../../components/WorkItemPicker/WorkItemPicker.js', () => ({
  WorkItemPicker: () => null,
}));

// ─── Mock: HouseholdItemPicker ─────────────────────────────────────────────────

jest.unstable_mockModule('../../components/HouseholdItemPicker/HouseholdItemPicker.js', () => ({
  HouseholdItemPicker: () => null,
}));

// ─── Mock: apiClient ──────────────────────────────────────────────────────────

class MockApiClientError extends Error {
  statusCode: number;
  error: { code: string; message?: string };
  constructor(statusCode: number, error: { code: string; message?: string }) {
    super(error.message ?? 'API Error');
    this.statusCode = statusCode;
    this.error = error;
  }
}

jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
  ApiClientError: MockApiClientError,
  NetworkError: class MockNetworkError extends Error {},
}));

// ─── Mock: formatters ─────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  formatDate: (d: string) => d,
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
  formatRelativeTime: (d: string) => d,
}));

// ─── Deferred component import ─────────────────────────────────────────────────

let InvoicesPage: (typeof InvoicesPageTypes)['InvoicesPage'];

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const EMPTY_PAGINATION = { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 };

const ZERO_SUMMARY = {
  pending: { count: 0, totalAmount: 0 },
  paid: { count: 0, totalAmount: 0 },
  claimed: { count: 0, totalAmount: 0 },
};

function makeInvoice(overrides: Partial<Invoice> & { id: string }): Invoice {
  return {
    vendorId: 'vendor-1',
    vendorName: 'Acme Construction',
    workItemBudgetId: null,
    workItemBudget: null,
    householdItemBudgetId: null,
    householdItemBudget: null,
    invoiceNumber: null,
    amount: 100,
    date: '2026-01-15',
    dueDate: null,
    status: 'pending',
    notes: null,
    createdBy: null,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

function makeApiResponse(
  overrides: Partial<InvoiceListPaginatedResponse> = {},
): InvoiceListPaginatedResponse {
  return {
    invoices: [],
    pagination: EMPTY_PAGINATION,
    summary: ZERO_SUMMARY,
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  mockFetchAllInvoices.mockReset();
  mockCreateInvoice.mockReset();
  mockFetchVendors.mockReset();

  // Default: empty list with zero summary
  mockFetchAllInvoices.mockResolvedValue(makeApiResponse());
  mockFetchVendors.mockResolvedValue({
    vendors: [],
    pagination: EMPTY_PAGINATION,
  });

  // Deferred import after mock registration
  const module = (await import('./InvoicesPage.js')) as typeof InvoicesPageTypes;
  InvoicesPage = module.InvoicesPage;
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/invoices']}>
      <InvoicesPage />
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InvoicesPage', () => {
  describe('page rendering', () => {
    it('renders the Invoices page heading', async () => {
      renderPage();

      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Invoices', level: 1 })).toBeInTheDocument(),
      );
    });

    it('renders the "Add Invoice" button', async () => {
      renderPage();

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add Invoice' })).toBeInTheDocument(),
      );
    });

    it('renders the empty state when no invoices exist', async () => {
      renderPage();

      await waitFor(() => expect(screen.getByText('No invoices yet')).toBeInTheDocument());
    });
  });

  describe('loading state', () => {
    it('renders "Loading invoices..." before fetchAllInvoices resolves', () => {
      mockFetchAllInvoices.mockImplementation(() => new Promise(() => {}));
      renderPage();

      expect(screen.getByText('Loading invoices...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('renders error banner when fetchAllInvoices rejects with an API error', async () => {
      mockFetchAllInvoices.mockRejectedValue(
        new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server blew up' }),
      );
      renderPage();

      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
      expect(screen.getByText('Server blew up')).toBeInTheDocument();
    });

    it('renders generic error message on network failure', async () => {
      mockFetchAllInvoices.mockRejectedValue(new Error('Network error'));
      renderPage();

      await waitFor(() =>
        expect(screen.getByText('Failed to load invoices. Please try again.')).toBeInTheDocument(),
      );
    });
  });

  describe('summary cards', () => {
    it('renders the Pending summary card', async () => {
      renderPage();

      await waitFor(() => {
        const cards = screen.getAllByText('Pending');
        expect(cards.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders the Paid summary card', async () => {
      renderPage();

      // 'Paid' appears as both a summary label and a filter <option> — use getAllByText
      await waitFor(() => {
        const matches = screen.getAllByText('Paid');
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders the Claimed summary card', async () => {
      renderPage();

      // 'Claimed' appears as both a summary label and a filter <option> — use getAllByText
      await waitFor(() => {
        const matches = screen.getAllByText('Claimed');
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('displays zero counts and amounts when summary is all zeros', async () => {
      renderPage();

      await waitFor(() => {
        // Three summary cards: Pending, Paid, Claimed — all showing 0 count and $0.00
        const zeros = screen.getAllByText('0');
        expect(zeros.length).toBeGreaterThanOrEqual(3);
        const amounts = screen.getAllByText('$0.00');
        expect(amounts.length).toBeGreaterThanOrEqual(3);
      });
    });

    it('Paid card shows combined paid + claimed count', async () => {
      mockFetchAllInvoices.mockResolvedValue(
        makeApiResponse({
          summary: {
            pending: { count: 1, totalAmount: 50 },
            paid: { count: 3, totalAmount: 300 },
            claimed: { count: 2, totalAmount: 200 },
          },
        }),
      );
      renderPage();

      // The Paid card must show count = paid.count (3) + claimed.count (2) = 5
      await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
    });

    it('Paid card shows combined paid + claimed total amount', async () => {
      mockFetchAllInvoices.mockResolvedValue(
        makeApiResponse({
          summary: {
            pending: { count: 1, totalAmount: 50 },
            paid: { count: 3, totalAmount: 300 },
            claimed: { count: 2, totalAmount: 200 },
          },
        }),
      );
      renderPage();

      // The Paid card must show amount = $300 + $200 = $500.00
      await waitFor(() => expect(screen.getByText('$500.00')).toBeInTheDocument());
    });

    it('Claimed card shows only claimed count (not combined)', async () => {
      mockFetchAllInvoices.mockResolvedValue(
        makeApiResponse({
          summary: {
            pending: { count: 1, totalAmount: 50 },
            paid: { count: 3, totalAmount: 300 },
            claimed: { count: 2, totalAmount: 200 },
          },
        }),
      );
      renderPage();

      // Claimed card shows exactly 2, not 5. Verify '2' appears in the DOM (claimed count).
      await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    });

    it('Claimed card shows only claimed total amount (not combined)', async () => {
      mockFetchAllInvoices.mockResolvedValue(
        makeApiResponse({
          summary: {
            pending: { count: 1, totalAmount: 50 },
            paid: { count: 3, totalAmount: 300 },
            claimed: { count: 2, totalAmount: 200 },
          },
        }),
      );
      renderPage();

      // Claimed card shows exactly $200.00, not $500.00.
      await waitFor(() => expect(screen.getByText('$200.00')).toBeInTheDocument());
    });
  });

  describe('Paid card combines paid and claimed invoices — regression', () => {
    /**
     * Regression test: the "Paid" summary card must aggregate both
     * `summary.paid` and `summary.claimed` from the API response.
     *
     * This ensures the UI reflects the full "settled" amount (both paid
     * and subsidy-claimed invoices) while the "Claimed" card still shows
     * the subset that went through a subsidy claim.
     */
    it('shows combined paid + claimed totals when both statuses are present', async () => {
      const paidInvoice = makeInvoice({ id: 'inv-paid-1', status: 'paid', amount: 1500 });
      const claimedInvoice = makeInvoice({ id: 'inv-claimed-1', status: 'claimed', amount: 750 });

      mockFetchAllInvoices.mockResolvedValue(
        makeApiResponse({
          invoices: [paidInvoice, claimedInvoice],
          pagination: { page: 1, pageSize: 25, totalItems: 2, totalPages: 1 },
          summary: {
            pending: { count: 0, totalAmount: 0 },
            paid: { count: 1, totalAmount: 1500 },
            claimed: { count: 1, totalAmount: 750 },
          },
        }),
      );

      renderPage();

      await waitFor(() => {
        // Paid card count: 1 paid + 1 claimed = 2
        expect(screen.getByText('2')).toBeInTheDocument();
        // Paid card amount: $1500 + $750 = $2250.00
        expect(screen.getByText('$2250.00')).toBeInTheDocument();
      });

      // Claimed card still shows its own totals: count=1, amount=$750.00
      // Multiple elements with '1' and '$750.00' exist (summary + table + mobile cards)
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('$750.00').length).toBeGreaterThanOrEqual(1);
    });

    it('shows only paid total when there are no claimed invoices', async () => {
      mockFetchAllInvoices.mockResolvedValue(
        makeApiResponse({
          summary: {
            pending: { count: 2, totalAmount: 400 },
            paid: { count: 4, totalAmount: 1200 },
            claimed: { count: 0, totalAmount: 0 },
          },
        }),
      );

      renderPage();

      await waitFor(() => {
        // Paid card count: 4 paid + 0 claimed = 4
        expect(screen.getByText('4')).toBeInTheDocument();
        // Paid card amount: $1200 + $0 = $1200.00
        expect(screen.getByText('$1200.00')).toBeInTheDocument();
      });
    });

    it('shows only claimed total when there are no paid invoices', async () => {
      mockFetchAllInvoices.mockResolvedValue(
        makeApiResponse({
          summary: {
            pending: { count: 0, totalAmount: 0 },
            paid: { count: 0, totalAmount: 0 },
            claimed: { count: 3, totalAmount: 900 },
          },
        }),
      );

      renderPage();

      await waitFor(() => {
        // Paid card count: 0 paid + 3 claimed = 3
        // Both Paid card and Claimed card display '3', so getAllByText
        const threeElements = screen.getAllByText('3');
        expect(threeElements.length).toBeGreaterThanOrEqual(2);
        // Paid card amount: $0 + $900 = $900.00
        // Both Paid card and Claimed card display $900.00, so getAllByText
        const nineHundredElements = screen.getAllByText('$900.00');
        expect(nineHundredElements.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('invoice list', () => {
    it('renders a table row for each invoice returned', async () => {
      const inv1 = makeInvoice({ id: 'inv-1', invoiceNumber: 'INV-001', amount: 500 });
      const inv2 = makeInvoice({ id: 'inv-2', invoiceNumber: 'INV-002', amount: 750 });

      mockFetchAllInvoices.mockResolvedValue(
        makeApiResponse({
          invoices: [inv1, inv2],
          pagination: { page: 1, pageSize: 25, totalItems: 2, totalPages: 1 },
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('INV-001').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('INV-002').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders the vendor name as a link in the table', async () => {
      const inv = makeInvoice({ id: 'inv-1', vendorName: 'Smith Builders' });

      mockFetchAllInvoices.mockResolvedValue(
        makeApiResponse({
          invoices: [inv],
          pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
        }),
      );

      renderPage();

      await waitFor(() =>
        expect(screen.getAllByText('Smith Builders').length).toBeGreaterThanOrEqual(1),
      );
    });

    it('shows filtered empty state when filters yield no results', async () => {
      // fetchAllInvoices called but returns empty — URL has a search param
      mockFetchAllInvoices.mockResolvedValue(makeApiResponse());

      renderPage();

      // Simulate there being an active filter by injecting q param
      render(
        <MemoryRouter initialEntries={['/invoices?q=nonexistent']}>
          <InvoicesPage />
        </MemoryRouter>,
      );

      await waitFor(() =>
        expect(screen.getByText('No invoices match your filters')).toBeInTheDocument(),
      );
    });
  });
});
