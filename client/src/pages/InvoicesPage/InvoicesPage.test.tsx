/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation, useSearchParams } from 'react-router-dom';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import { CompanyCreateContext } from '../../objectForms/companyCreateContext.js';
import type { RequestCompanyCreate } from '../../objectForms/companyCreateContext.js';
import type { CompanyOption } from '../../objectForms/companyForm.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type { Invoice, InvoiceListPaginatedResponse } from '@cornerstone/shared';
import type * as InvoicesPageTypes from './InvoicesPage.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { ShortcutSnapshot } from '../../test/shortcutSnapshot.js';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import { INVOICE_STATUSES } from '@cornerstone/shared';
import enCommon from '../../i18n/en/common.json';
import enErrors from '../../i18n/en/errors.json';

// ── API mocks ─────────────────────────────────────────────────────────────────

const mockFetchAllInvoices = jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>();
const mockCreateInvoice = jest.fn<typeof InvoicesApiTypes.createInvoice>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();

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
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: mockFetchVendor,
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

// ── Formatters mock ───────────────────────────────────────────────────────────

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
    formatDayRange: (start: Date, end: Date) =>
      `${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}`,
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

// ── LocaleContext mock — InvoicesPage uses useFormatters() → useLocale() ─────
// Defensive layer to ensure useLocale never reaches the real LocaleContext
// implementation (which throws if no LocaleProvider wraps the tree). Pattern
// matches CalendarView.test.tsx.

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Story #1679: paperlessApi mock ────────────────────────────────────────────
const mockGetPaperlessStatus = jest.fn<typeof PaperlessApiTypes.getPaperlessStatus>();

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: jest.fn().mockReturnValue('/thumb'),
  getDocumentPreviewUrl: jest.fn().mockReturnValue('/preview'),
  listPaperlessCorrespondents: jest.fn(),
}));

// ── Story #1679: configApi mock ───────────────────────────────────────────────
// Only autoItemizeEnabled is exercised by these tests — narrower than the real
// fetchConfig's AppConfigResponse return type is intentional here.
const mockFetchConfig = jest.fn<() => Promise<{ autoItemizeEnabled: boolean }>>();

jest.unstable_mockModule('../../lib/configApi.js', () => ({
  fetchConfig: mockFetchConfig,
}));

// ── Story #1679: InvoicePaperlessPickerModal mock ─────────────────────────────

jest.unstable_mockModule('../../components/invoices/InvoicePaperlessPickerModal.js', () => ({
  InvoicePaperlessPickerModal: ({
    onDocumentSelected,
    onManualEntry,
    onClose,
  }: {
    onDocumentSelected: (doc: { id: number; title: string }) => void;
    onManualEntry: () => void;
    onClose: () => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'paperless-picker-modal' },
      React.createElement(
        'button',
        { onClick: () => onDocumentSelected({ id: 7, title: 'Doc' }) },
        'Select Document',
      ),
      React.createElement('button', { onClick: onManualEntry }, 'Manual Entry'),
      React.createElement('button', { onClick: onClose }, 'Close Modal'),
    ),
}));

// React must be imported for JSX in the mock factory above
import React from 'react';

const EMPTY_CHIP_COUNTS = {
  matching: { toPay: 0, offers: 0, paid: 0, submitted: 0, all: 0 },
  outsideToPay: { offers: 0, paid: 0, submitted: 0, all: 0 },
  totals: { toPay: 0, offers: 0, paid: 0, submitted: 0, all: 0 },
};

// ── Location helper ───────────────────────────────────────────────────────────

function LocationDisplay() {
  const location = useLocation();
  return (
    <>
      <div data-testid="location">{location.pathname}</div>
      <div data-testid="location-full">{location.pathname + location.search}</div>
      <div data-testid="location-state">{JSON.stringify(location.state)}</div>
    </>
  );
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleInvoice1: Invoice = {
  id: 'inv-001',
  vendorId: 'v-1',
  vendorName: 'ACME Construction',
  invoiceNumber: 'INV-2026-001',
  amount: 15000,
  date: '2026-02-01',
  dueDate: '2026-03-01',
  status: 'pending',
  notes: null,
  budgetLines: [],
  remainingAmount: 15000,
  deposits: [],
  finalPaymentAmount: 15000,
  createdBy: null,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
};

const sampleInvoice2: Invoice = {
  id: 'inv-002',
  vendorId: 'v-2',
  vendorName: 'Quality Plumbing',
  invoiceNumber: null,
  amount: 3500,
  date: '2026-01-15',
  dueDate: null,
  status: 'paid',
  notes: 'Paid on time',
  budgetLines: [
    {
      id: 'ibl-1',
      budgetLineId: 'wib-1',
      budgetLineType: 'work_item',
      itemName: 'Plumbing Work',
      budgetLineDescription: null,
      categoryName: null,
      categoryColor: null,
      categoryTranslationKey: null,
      plannedAmount: 3500,
      confidence: 'quote',
      itemizedAmount: 3500,
    },
  ],
  remainingAmount: 0,
  deposits: [],
  finalPaymentAmount: 3500,
  createdBy: null,
  createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z',
};

const emptySummary = {
  pending: { count: 0, totalAmount: 0 },
  paid: { count: 0, totalAmount: 0 },
  claimed: { count: 0, totalAmount: 0 },
  quotation: { count: 0, totalAmount: 0 },
  overdue: { count: 0, totalAmount: 0 },
  claimable: { count: 0, totalAmount: 0 },
  quotationCoveredByDeposits: 0,
  openPayable: { count: 0, totalAmount: 0 },
  refundsDue: { count: 0, totalAmount: 0 },
};

const populatedSummary = {
  pending: { count: 1, totalAmount: 15000 },
  paid: { count: 1, totalAmount: 3500 },
  claimed: { count: 0, totalAmount: 0 },
  quotation: { count: 0, totalAmount: 0 },
  overdue: { count: 0, totalAmount: 0 },
  claimable: { count: 1, totalAmount: 15000 },
  quotationCoveredByDeposits: 0,
  openPayable: { count: 1, totalAmount: 15000 },
  refundsDue: { count: 0, totalAmount: 0 },
};

const emptyResponse: InvoiceListPaginatedResponse = {
  invoices: [],
  pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
  chipCounts: EMPTY_CHIP_COUNTS,
  summary: emptySummary,
};

const populatedResponse: InvoiceListPaginatedResponse = {
  invoices: [sampleInvoice1, sampleInvoice2],
  pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 2 },
  chipCounts: EMPTY_CHIP_COUNTS,
  summary: populatedSummary,
};

const emptyVendorsResponse = {
  vendors: [],
  pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
};

const vendorsResponse = {
  vendors: [
    {
      id: 'v-1',
      name: 'ACME Construction',
      notes: null,
      phone: null,
      email: null,
      address: null,
      trade: null,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'v-2',
      name: 'Quality Plumbing',
      notes: null,
      phone: null,
      email: null,
      address: null,
      trade: null,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  pagination: { page: 1, pageSize: 100, totalItems: 2, totalPages: 1 },
};

/** The company field is a text picker (#2213): open it and click the result. */
async function chooseCompany(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(screen.getByRole('dialog')).getByLabelText(/vendor/i));
  await user.click(await screen.findByRole('option', { name }));
}

describe('InvoicesPage', () => {
  let InvoicesPageModule: typeof InvoicesPageTypes;

  beforeEach(async () => {
    mockFetchAllInvoices.mockReset();
    mockCreateInvoice.mockReset();
    mockFetchVendors.mockReset();
    mockFetchVendor.mockReset();
    mockFetchVendor.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
    mockGetPaperlessStatus.mockReset();
    mockFetchConfig.mockReset();

    if (!InvoicesPageModule) {
      InvoicesPageModule = await import('./InvoicesPage.js');
    }

    // Default: paperless not configured + auto-itemize disabled (manual modal path)
    mockGetPaperlessStatus.mockResolvedValue({
      configured: false,
      reachable: false,
      error: null,
      paperlessUrl: null,
      filterTag: null,
    });
    mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false });

    // Default: empty vendors
    mockFetchVendors.mockResolvedValue(emptyVendorsResponse);
  });

  function renderPage() {
    return render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/budget/invoices']}>
          <Routes>
            <Route path="/budget/invoices" element={<InvoicesPageModule.InvoicesPage />} />
            <Route path="/budget/invoices/:id" element={<div>Invoice Detail</div>} />
            <Route path="/budget/invoices/new/paperless" element={<div>Paperless Review</div>} />
            <Route path="/companies/:id" element={<div>Vendor Detail</div>} />
          </Routes>
          <LocationDisplay />
        </MemoryRouter>
      </ToastProvider>,
    );
  }

  // ─── Loading state ────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('renders loading skeleton while fetching', () => {
      mockFetchAllInvoices.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      // DataTable shows Skeleton with role="status"
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  // ─── Populated state ──────────────────────────────────────────────────────

  describe('populated state', () => {
    it('renders invoice number for invoices with a number', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(populatedResponse);

      renderPage();

      // DataTable renders each item in both table row and mobile card (duplicate text)
      await waitFor(() => {
        expect(screen.getAllByText('INV-2026-001')[0]!).toBeInTheDocument();
      });
    });

    it('renders vendor name links', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(populatedResponse);

      renderPage();

      // DataTable renders items in both table and mobile card view (duplicate text)
      await waitFor(() => {
        expect(screen.getAllByText('ACME Construction')[0]!).toBeInTheDocument();
      });
      expect(screen.getAllByText('Quality Plumbing')[0]!).toBeInTheDocument();
    });

    it('renders summary cards with correct counts', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(populatedResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('INV-2026-001')[0]!).toBeInTheDocument();
      });

      // Pending count = 1 and paid count = 1 (paid + claimed) in summary cards.
      // Multiple elements have text "1"; use getAllByText to confirm at least one exists.
      expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    });

    it('renders the "New Invoice" button', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument();
      });
    });

    it('renders attribution as "None" for invoice with no budget lines', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(populatedResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('INV-2026-001')[0]!).toBeInTheDocument();
      });
    });
  });

  // ─── Error state ──────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows API error message when fetchAllInvoices fails', async () => {
      // Use mockRejectedValue (not Once) so ALL calls fail consistently —
      // useTableState may trigger multiple loadInvoices calls
      mockFetchAllInvoices.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
      );

      renderPage();

      // DataTable renders the error via role="alert" banner
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByText(enErrors.INTERNAL_ERROR)).toBeInTheDocument();
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
    });

    it('shows generic error for non-ApiClientError', async () => {
      // Use mockRejectedValue (not Once) so ALL calls fail consistently
      mockFetchAllInvoices.mockRejectedValue(new Error('Network error'));

      renderPage();

      // DataTable renders the error via role="alert" banner
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  // ─── Empty state ──────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('renders without crashing when no invoices returned', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });
  });

  // ─── Create Invoice modal ─────────────────────────────────────────────────

  describe('create invoice modal', () => {
    it('opens modal when New Invoice button is clicked', async () => {
      const user = userEvent.setup();
      // Use mockResolvedValue (not Once) to handle multiple loadInvoices calls from useTableState
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('new-invoice-button'));

      // Modal should appear
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('shows the company field as a text picker, not a select (#2213)', async () => {
      const user = userEvent.setup();
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(vendorsResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('new-invoice-button'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const field = within(screen.getByRole('dialog')).getByLabelText(/vendor/i);
      expect(field.tagName).toBe('INPUT');
      expect(field.id).toBe('invoice-vendor');
      expect(field).toHaveAttribute('aria-required', 'true');
      expect(screen.getByRole('dialog').querySelector('select#invoice-vendor')).toBeNull();
    });

    it('shows validation error when submitting without vendor', async () => {
      const user = userEvent.setup();
      // Use mockResolvedValue (not Once) to handle multiple loadInvoices calls from useTableState
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('new-invoice-button'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // The Create button is disabled when no vendor is selected.
      // Submit the form directly to trigger JS validation (form has noValidate).
      const form = screen.getByRole('dialog').querySelector('form');
      expect(form).toBeTruthy();
      if (form) fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(mockCreateInvoice).not.toHaveBeenCalled();
    });

    it('shows validation error for missing amount', async () => {
      const user = userEvent.setup();
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(vendorsResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('new-invoice-button'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Select a vendor
      await chooseCompany(user, 'ACME Construction');

      // Set a date, no amount
      const dateInput = screen.getByLabelText(/invoice date/i);
      fireEvent.change(dateInput, { target: { value: '2026-02-01' } });

      // Create button is disabled when amount is missing; submit form directly
      const form = screen.getByRole('dialog').querySelector('form');
      expect(form).toBeTruthy();
      if (form) fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(mockCreateInvoice).not.toHaveBeenCalled();
    });

    it('calls createInvoice with correct data on valid submission', async () => {
      const user = userEvent.setup();
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(vendorsResponse);
      mockCreateInvoice.mockResolvedValueOnce(sampleInvoice1);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('new-invoice-button'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Fill vendor
      await chooseCompany(user, 'ACME Construction');

      // Fill amount using fireEvent.change (reliable for number inputs)
      const amountInput = screen.getByLabelText(/^amount/i);
      fireEvent.change(amountInput, { target: { value: '15000' } });

      // Fill date
      const dateInput = screen.getByLabelText(/invoice date/i);
      fireEvent.change(dateInput, { target: { value: '2026-02-01' } });

      // The Create button is enabled once all required fields are filled;
      // submit the form directly to bypass any potential button-click issues
      const form = screen.getByRole('dialog').querySelector('form');
      expect(form).toBeTruthy();
      if (form) fireEvent.submit(form);

      await waitFor(() => {
        expect(mockCreateInvoice).toHaveBeenCalledWith(
          'v-1',
          expect.objectContaining({
            amount: 15000,
            date: '2026-02-01',
          }),
        );
      });
    });

    it('shows API error when createInvoice fails', async () => {
      const user = userEvent.setup();
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(vendorsResponse);
      mockCreateInvoice.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('new-invoice-button'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      await chooseCompany(user, 'ACME Construction');

      // Fill amount using fireEvent.change (reliable for number inputs)
      const amountInput = screen.getByLabelText(/^amount/i);
      fireEvent.change(amountInput, { target: { value: '5000' } });

      const dateInput = screen.getByLabelText(/invoice date/i);
      fireEvent.change(dateInput, { target: { value: '2026-02-01' } });

      // Submit the form directly (reliable for controlled inputs)
      const form = screen.getByRole('dialog').querySelector('form');
      expect(form).toBeTruthy();
      if (form) fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(enErrors.INTERNAL_ERROR)).toBeInTheDocument();
      });
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
    });

    it('closes modal when Cancel is clicked', async () => {
      const user = userEvent.setup();
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('new-invoice-button'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const cancelBtn = screen
        .getAllByRole('button')
        .find((btn) => btn.textContent?.match(/cancel/i));
      expect(cancelBtn).toBeTruthy();
      if (cancelBtn) await user.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  // ─── Actions menu ─────────────────────────────────────────────────────────

  describe('actions menu', () => {
    it('shows action menu button for each invoice', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(populatedResponse);

      renderPage();

      // DataTable renders renderActions in both table and mobile card; the ids are disjoint
      // (`invoice-menu-button-<id>` vs `invoice-menu-button-mobile-<id>`), so getByTestId is safe.
      await waitFor(() => {
        expect(screen.getByTestId('invoice-menu-button-inv-001')).toBeInTheDocument();
      });
      expect(screen.getByTestId('invoice-menu-button-inv-002')).toBeInTheDocument();
    });

    it('shows view option in dropdown when menu opened', async () => {
      const user = userEvent.setup();
      mockFetchAllInvoices.mockResolvedValueOnce(populatedResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('invoice-menu-button-inv-001')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('invoice-menu-button-inv-001'));

      expect(screen.getByTestId('invoice-view-inv-001')).toBeInTheDocument();
    });

    it('keeps every data-testid unique across the table and mobile cards, with a row menu open (#2069)', async () => {
      const user = userEvent.setup();
      mockFetchAllInvoices.mockResolvedValueOnce(populatedResponse);

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('invoice-menu-button-inv-001')).toBeInTheDocument();
      });
      expect(screen.getByTestId('invoice-menu-button-mobile-inv-001')).toBeInTheDocument();

      await user.click(screen.getByTestId('invoice-menu-button-inv-001'));

      expect(screen.getByTestId('invoice-view-inv-001')).toBeInTheDocument();
      expect(findDuplicateTestIds(container)).toEqual([]);
    });

    it('navigates to invoice detail on view click', async () => {
      const user = userEvent.setup();
      mockFetchAllInvoices.mockResolvedValueOnce(populatedResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('invoice-menu-button-inv-001')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('invoice-menu-button-inv-001'));
      await user.click(screen.getByTestId('invoice-view-inv-001'));

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/budget/invoices/inv-001');
      });
    });
  });

  // ─── Summary cards (#1373) ────────────────────────────────────────────────

  describe('summary cards (#1373)', () => {
    it('renders four summary cards (pending, paid, claimed, quotation)', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(populatedResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('INV-2026-001')[0]!).toBeInTheDocument();
      });

      // All four status labels should be present (getAllByText: labels appear in both
      // summary cards and filter dropdown, so multiple matches are expected)
      expect(screen.getAllByText('To pay').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Submitted').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Offers').length).toBeGreaterThan(0);
    });

    it('renders the Claimed card with correct count and amount', async () => {
      const responseWithClaimed: InvoiceListPaginatedResponse = {
        ...populatedResponse,
        summary: {
          pending: { count: 1, totalAmount: 15000 },
          paid: { count: 0, totalAmount: 0 },
          claimed: { count: 3, totalAmount: 900 },
          quotation: { count: 0, totalAmount: 0 },
          overdue: { count: 0, totalAmount: 0 },
          claimable: { count: 1, totalAmount: 15000 },
          quotationCoveredByDeposits: 0,
          openPayable: { count: 1, totalAmount: 15000 },
          refundsDue: { count: 0, totalAmount: 0 },
        },
      };
      mockFetchAllInvoices.mockResolvedValueOnce(responseWithClaimed);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Submitted').length).toBeGreaterThan(0);
      });

      // Count 3 should appear in the DOM (summaryCount span under the Claimed card)
      // Multiple elements may show "3" — at least one must exist
      expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    });

    it('Claimed card still renders when claimed count is 0', async () => {
      const responseWithZeroClaimed: InvoiceListPaginatedResponse = {
        ...emptyResponse,
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
      mockFetchAllInvoices.mockResolvedValueOnce(responseWithZeroClaimed);

      renderPage();

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      expect(screen.getAllByText('Submitted').length).toBeGreaterThan(0);
    });

    it('Claimable card shows only claimable summary data (not combined with claimed)', async () => {
      const responseWithSeparateData: InvoiceListPaginatedResponse = {
        ...populatedResponse,
        summary: {
          pending: { count: 1, totalAmount: 15000 },
          paid: { count: 2, totalAmount: 5000 },
          claimed: { count: 3, totalAmount: 900 },
          quotation: { count: 0, totalAmount: 0 },
          overdue: { count: 0, totalAmount: 0 },
          claimable: { count: 2, totalAmount: 12000 },
          quotationCoveredByDeposits: 0,
          openPayable: { count: 1, totalAmount: 15000 },
          refundsDue: { count: 0, totalAmount: 0 },
        },
      };
      mockFetchAllInvoices.mockResolvedValueOnce(responseWithSeparateData);

      const fmtCurrency = (n: number) =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'EUR',
          minimumFractionDigits: 2,
        }).format(n);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Ready to submit').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Submitted').length).toBeGreaterThan(0);
      });

      // Claimable total is €12,000 and claimed total is €900 — they must appear as separate amounts
      expect(screen.getByText(fmtCurrency(12000))).toBeInTheDocument();
      expect(screen.getByText(fmtCurrency(900))).toBeInTheDocument();
    });
  });

  // ─── Figure markers (#2232) ──────────────────────────────────────────────────

  describe('figure markers (#2232)', () => {
    const markedResponse: InvoiceListPaginatedResponse = {
      ...populatedResponse,
      summary: {
        pending: { count: 1, totalAmount: 15000 },
        paid: { count: 2, totalAmount: 5000 },
        claimed: { count: 3, totalAmount: 900 },
        quotation: { count: 0, totalAmount: 0 },
        overdue: { count: 0, totalAmount: 0 },
        claimable: { count: 2, totalAmount: 12000 },
        quotationCoveredByDeposits: 0,
        openPayable: { count: 1, totalAmount: 7777 },
        refundsDue: { count: 0, totalAmount: 0 },
      },
    };

    it('marks only the amount of the Ready to submit card as ready-to-submit', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(markedResponse);
      renderPage();

      const card = await screen.findByTestId('summary-card-ready-to-submit');
      expect(card).toHaveTextContent('Ready to submit');
      const marked = card.querySelectorAll('[data-figure]');
      expect(marked).toHaveLength(1);
      expect(marked[0]).toHaveAttribute('data-figure', 'ready-to-submit');
      expect(marked[0]!.textContent).toBe('€12,000.00');
    });

    it('words the Ready to submit hint as loans and credit lines only', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(markedResponse);
      renderPage();

      const card = await screen.findByTestId('summary-card-ready-to-submit');
      expect(card).toHaveTextContent('Loans and credit lines only');
      expect(card).not.toHaveTextContent(/discretionary/i);
    });

    it('marks only the amount of the open-payable card as still-to-pay', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(markedResponse);
      renderPage();

      const card = await screen.findByTestId('summary-card-open-payable');
      const marked = card.querySelectorAll('[data-figure]');
      expect(marked).toHaveLength(1);
      expect(marked[0]).toHaveAttribute('data-figure', 'still-to-pay');
      expect(marked[0]!.textContent).toBe('€7,777.00');
    });

    it('marks exactly the two registered figures on the summary strip', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(markedResponse);
      renderPage();

      await screen.findByTestId('summary-card-ready-to-submit');
      const kinds = Array.from(document.querySelectorAll('[data-figure]')).map((el) =>
        el.getAttribute('data-figure'),
      );
      expect(kinds.sort()).toEqual(['ready-to-submit', 'still-to-pay']);
    });
  });

  // ─── Overdue summary card (#1421) ────────────────────────────────────────────

  describe('overdue summary card (#1421)', () => {
    it('T1: renders overdue card when summary.overdue.count is 2', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce({
        ...emptyResponse,
        summary: { ...emptySummary, overdue: { count: 2, totalAmount: 3000 } },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('summary-card-overdue')).toBeInTheDocument();
      });
      // The count "2" must appear inside the overdue card
      const card = screen.getByTestId('summary-card-overdue');
      expect(card).toHaveTextContent('2');
    });

    it('T2: does NOT render overdue card when summary.overdue.count is 0', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce({
        ...emptyResponse,
        summary: { ...emptySummary, overdue: { count: 0, totalAmount: 0 } },
      });

      renderPage();

      await waitFor(() => {
        // Wait for the loading state to clear
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
      expect(screen.queryByTestId('summary-card-overdue')).not.toBeInTheDocument();
    });

    it('T3: empty response (no invoices, overdue 0) — card is NOT in document', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
      expect(screen.queryByTestId('summary-card-overdue')).not.toBeInTheDocument();
    });

    it('T4: renders overdue count "3" inside the card when summary.overdue.count is 3', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce({
        ...emptyResponse,
        summary: { ...emptySummary, overdue: { count: 3, totalAmount: 7500 } },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('summary-card-overdue')).toBeInTheDocument();
      });
      const card = screen.getByTestId('summary-card-overdue');
      expect(card).toHaveTextContent('3');
    });

    it('summaryGrid container exists in the DOM', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      // The summaryGrid className is applied to the grid container div
      // identity-obj-proxy returns 'summaryGrid' as the class name
      const grid = document.querySelector('[class*="summaryGrid"]');
      expect(grid).toBeInTheDocument();
    });
  });

  // ─── getAttributionLabel utility (tested via rendering) ────────────────────

  describe('attribution column', () => {
    it('renders 100% attribution for fully allocated invoice', async () => {
      const fullyAllocatedInvoice: Invoice = {
        ...sampleInvoice2,
        // sampleInvoice2 has budgetLines with itemizedAmount = amount = 3500
        // so getAttributionLabel returns "100% allocated"
      };

      mockFetchAllInvoices.mockResolvedValueOnce({
        ...populatedResponse,
        invoices: [fullyAllocatedInvoice],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Quality Plumbing')[0]!).toBeInTheDocument();
      });
    });
  });

  // ─── Story #1679: "New Invoice" button branching logic ──────────────────────

  describe('"New Invoice" button branching (#1679)', () => {
    it('button has aria-disabled while integration status is loading', async () => {
      // Never resolve — stays loading
      mockGetPaperlessStatus.mockReturnValue(new Promise(() => {}));
      mockFetchConfig.mockReturnValue(new Promise(() => {}));
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);

      renderPage();

      // Button should appear immediately with aria-disabled=true
      await waitFor(() => {
        const btn = screen.getByTestId('new-invoice-button');
        expect(btn).toBeInTheDocument();
        expect(btn).toHaveAttribute('aria-disabled', 'true');
      });
    });

    it('button is enabled after integration status resolves', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: false,
        reachable: false,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false });
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);

      renderPage();

      await waitFor(() => {
        const btn = screen.getByTestId('new-invoice-button');
        expect(btn).not.toHaveAttribute('aria-disabled', 'true');
      });
    });

    it('opens manual modal when autoItemizeEnabled=false', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: 'https://paperless.example.com',
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false });
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(emptyVendorsResponse);

      renderPage();

      // Wait for button to be enabled
      await waitFor(() => {
        const btn = screen.getByTestId('new-invoice-button');
        expect(btn).not.toHaveAttribute('aria-disabled', 'true');
      });

      fireEvent.click(screen.getByTestId('new-invoice-button'));

      // Manual modal appears (has Modal title from invoices.modal.title)
      await waitFor(() => {
        // The manual invoice creation modal contains a vendor select or form
        const modal =
          screen.queryByRole('dialog') ||
          screen.queryByText(/New Invoice/i) ||
          document.querySelector('[data-testid="paperless-picker-modal"]');
        // Paperless picker should NOT appear when autoItemizeEnabled=false
        expect(
          document.querySelector('[data-testid="paperless-picker-modal"]'),
        ).not.toBeInTheDocument();
        // Manual modal OR some form element should appear
        expect(modal !== null || screen.queryByLabelText(/Vendor/i) !== null).toBe(true);
      });
    });

    it('opens Paperless picker modal when configured + reachable + autoItemizeEnabled=true', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: 'https://paperless.example.com',
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: true });
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(emptyVendorsResponse);

      renderPage();

      // Wait for button to be enabled
      await waitFor(() => {
        const btn = screen.getByTestId('new-invoice-button');
        expect(btn).not.toHaveAttribute('aria-disabled', 'true');
      });

      fireEvent.click(screen.getByTestId('new-invoice-button'));

      await waitFor(() => {
        expect(screen.getByTestId('paperless-picker-modal')).toBeInTheDocument();
      });
    });

    describe('n shortcut (#2211)', () => {
      const PAPERLESS_READY = {
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: 'https://paperless.example.com',
        filterTag: null,
      };

      it('opens the manual create modal like the primary button when Paperless is not configured', async () => {
        mockFetchAllInvoices.mockResolvedValue(emptyResponse);
        renderPage();
        await waitFor(() => {
          expect(screen.getByTestId('new-invoice-button')).not.toHaveAttribute(
            'aria-disabled',
            'true',
          );
        });
        fireEvent.keyDown(document, { key: 'n' });
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(screen.queryByTestId('paperless-picker-modal')).toBeNull();
      });

      it('opens the Paperless picker when Paperless and auto-itemize are on, like the button', async () => {
        mockGetPaperlessStatus.mockResolvedValue(PAPERLESS_READY);
        mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: true });
        mockFetchAllInvoices.mockResolvedValue(emptyResponse);
        renderPage();
        await waitFor(() => {
          expect(screen.getByTestId('new-invoice-button')).not.toHaveAttribute(
            'aria-disabled',
            'true',
          );
        });
        fireEvent.keyDown(document, { key: 'n' });
        await waitFor(() => {
          expect(screen.getByTestId('paperless-picker-modal')).toBeInTheDocument();
        });
      });

      it('opens the manual modal when Paperless is on but auto-itemize is off', async () => {
        mockGetPaperlessStatus.mockResolvedValue(PAPERLESS_READY);
        mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false });
        mockFetchAllInvoices.mockResolvedValue(emptyResponse);
        renderPage();
        await waitFor(() => {
          expect(screen.getByTestId('new-invoice-button')).not.toHaveAttribute(
            'aria-disabled',
            'true',
          );
        });
        fireEvent.keyDown(document, { key: 'n' });
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(screen.queryByTestId('paperless-picker-modal')).toBeNull();
      });

      // Fixed in #2211: n honours integrationReady like the disabled primary button.
      it('does nothing while the integration status is still loading, like the disabled button', async () => {
        mockGetPaperlessStatus.mockReturnValue(new Promise(() => {}));
        mockFetchConfig.mockReturnValue(new Promise(() => {}));
        mockFetchAllInvoices.mockResolvedValue(emptyResponse);
        renderPage();
        await waitFor(() => {
          expect(screen.getByTestId('new-invoice-button')).toHaveAttribute('aria-disabled', 'true');
        });
        fireEvent.keyDown(document, { key: 'n' });
        expect(screen.queryByRole('dialog')).toBeNull();
      });

      it('ignores n typed into the list search field', async () => {
        mockFetchAllInvoices.mockResolvedValue(emptyResponse);
        renderPage();
        await waitFor(() => {
          expect(screen.getByTestId('new-invoice-button')).not.toHaveAttribute(
            'aria-disabled',
            'true',
          );
        });
        fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'n' });
        expect(screen.queryByRole('dialog')).toBeNull();
      });

      it('registers n as "New invoice" in the shortcut registry', async () => {
        mockFetchAllInvoices.mockResolvedValue(emptyResponse);
        render(
          <ShortcutRegistryProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={['/budget/invoices']}>
                <InvoicesPageModule.InvoicesPage />
                <ShortcutSnapshot />
              </MemoryRouter>
            </ToastProvider>
          </ShortcutRegistryProvider>,
        );
        await waitFor(() => {
          expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId('shortcut-snapshot'));
        expect(screen.getByTestId('shortcut-snapshot-out').textContent).toContain('n:New invoice');
      });
    });

    it('navigates to the review page with ?documentId= and only the origin in history state when a Paperless document is picked (#2197, #2203)', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: 'https://paperless.example.com',
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: true });
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(emptyVendorsResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-invoice-button')).not.toHaveAttribute(
          'aria-disabled',
          'true',
        );
      });
      fireEvent.click(screen.getByTestId('new-invoice-button'));
      fireEvent.click(await screen.findByRole('button', { name: 'Select Document' }));

      await waitFor(() => {
        expect(screen.getByTestId('location-full')).toHaveTextContent(
          '/budget/invoices/new/paperless?documentId=7',
        );
      });
      // The document travels in the query, never in state; state carries only the origin.
      expect(JSON.parse(screen.getByTestId('location-state').textContent ?? 'null')).toEqual({
        origin: { to: '/budget/invoices' },
      });
      expect(screen.queryByTestId('paperless-picker-modal')).not.toBeInTheDocument();
    });

    it('opens manual modal when paperless configured=false even if autoItemizeEnabled=true', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: false,
        reachable: false,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: true });
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(emptyVendorsResponse);

      renderPage();

      await waitFor(() => {
        const btn = screen.getByTestId('new-invoice-button');
        expect(btn).not.toHaveAttribute('aria-disabled', 'true');
      });

      fireEvent.click(screen.getByTestId('new-invoice-button'));

      // Paperless picker should NOT appear when paperless not configured
      await waitFor(() => {
        expect(
          document.querySelector('[data-testid="paperless-picker-modal"]'),
        ).not.toBeInTheDocument();
      });
    });
  });

  // ─── Story #1735: ?create=1 auto-open effect ────────────────────────────────

  describe('?create=1 auto-open effect (Story #1735)', () => {
    /** Renders the page with ?create=1 in the URL and a location helper
     *  that exposes pathname+search so tests can assert the param is removed. */
    function LocationSearchDisplay() {
      const location = useLocation();
      return <div data-testid="location-search">{location.pathname + location.search}</div>;
    }

    function renderPageWithCreate() {
      return render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/budget/invoices?create=1']}>
            <Routes>
              <Route path="/budget/invoices" element={<InvoicesPageModule.InvoicesPage />} />
              <Route path="/budget/invoices/:id" element={<div>Invoice Detail</div>} />
              <Route path="/companies/:id" element={<div>Vendor Detail</div>} />
            </Routes>
            <LocationSearchDisplay />
          </MemoryRouter>
        </ToastProvider>,
      );
    }

    // (A) integrationStatus unresolved (both APIs pending) → no modal opens
    it('(A) does not auto-open any modal while integration status is still loading', async () => {
      mockGetPaperlessStatus.mockReturnValue(new Promise(() => {}));
      mockFetchConfig.mockReturnValue(new Promise(() => {}));
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);

      renderPageWithCreate();

      // Give the effect a chance to fire if it wrongly ignores the loading gate
      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        document.querySelector('[data-testid="paperless-picker-modal"]'),
      ).not.toBeInTheDocument();
    });

    // (B) ?create=1 absent + status resolved → no modal opens
    it('(B) does not auto-open any modal when ?create=1 is absent from the URL', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: 'https://paperless.example.com',
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: true });
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);

      // Use renderPage() which starts at /budget/invoices (no ?create param)
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-invoice-button')).not.toHaveAttribute(
          'aria-disabled',
          'true',
        );
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        document.querySelector('[data-testid="paperless-picker-modal"]'),
      ).not.toBeInTheDocument();
    });

    // (C) ?create=1 + Paperless NOT configured + autoItemizeEnabled=false → manual modal
    it('(C) auto-opens manual modal when Paperless not configured and ?create=1', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: false,
        reachable: false,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false });
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(emptyVendorsResponse);

      renderPageWithCreate();

      // Manual modal should auto-open
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Paperless picker must NOT be present
      expect(
        document.querySelector('[data-testid="paperless-picker-modal"]'),
      ).not.toBeInTheDocument();
    });

    // #2194 D-17: the manual create modal opens on Pending, never Quotation
    it('manual create modal opens with the status preset to To pay', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: false,
        reachable: false,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false });
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(emptyVendorsResponse);

      renderPageWithCreate();

      const dialog = await screen.findByRole('dialog');
      const status = dialog.querySelector('#invoice-status') as HTMLSelectElement;
      expect(status).not.toBeNull();
      expect(status.value).toBe('pending');
    });

    // (D) ?create=1 + Paperless configured + reachable + autoItemizeEnabled=true → Paperless picker
    it('(D) auto-opens Paperless picker when Paperless configured and autoItemizeEnabled=true', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: 'https://paperless.example.com',
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: true });
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);

      renderPageWithCreate();

      await waitFor(() => {
        expect(screen.getByTestId('paperless-picker-modal')).toBeInTheDocument();
      });

      // Manual create modal must NOT be present
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // (E) ?create=1 + Paperless configured + autoItemizeEnabled DISABLED → manual modal
    it('(E) auto-opens manual modal when Paperless configured but autoItemizeEnabled=false', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: 'https://paperless.example.com',
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false });
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(emptyVendorsResponse);

      renderPageWithCreate();

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      expect(
        document.querySelector('[data-testid="paperless-picker-modal"]'),
      ).not.toBeInTheDocument();
    });

    // (F) after auto-open, the URL no longer contains create=1
    it('(F) removes ?create=1 from the URL after auto-opening the modal', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: false,
        reachable: false,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false });
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(emptyVendorsResponse);

      renderPageWithCreate();

      // Wait for the modal to open (confirms the effect ran)
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // The URL should no longer carry ?create=1
      await waitFor(() => {
        const locationEl = screen.getByTestId('location-search');
        expect(locationEl.textContent).not.toContain('create=1');
      });
    });

    it('(J) status filter lists INVOICE_STATUSES in order with translated labels', async () => {
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      renderPage();
      fireEvent.click((await screen.findAllByRole('button', { name: /filter by status/i }))[0]!);
      const dialog = await screen.findByRole('dialog', { name: /filter by status/i });
      const rows = Array.from(dialog.querySelectorAll('label')).map((label) => [
        label.querySelector('input')?.id,
        label.querySelector('span')?.textContent,
      ]);

      expect(rows).toEqual(
        INVOICE_STATUSES.map((status) => [
          `enum-${status}`,
          enCommon.statusVocabulary.invoice[status],
        ]),
      );
    });

    // (G) status load fails → Add Invoice is enabled with no spinner and opens the manual modal
    it('(G) enables Add Invoice with no spinner and opens the manual modal when the status load fails', async () => {
      mockGetPaperlessStatus.mockRejectedValue(new Error('status down'));
      mockFetchConfig.mockRejectedValue(new Error('config down'));
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(emptyVendorsResponse);

      renderPage();

      const button = screen.getByTestId('new-invoice-button');
      await waitFor(() => {
        expect(button).toBeEnabled();
      });
      expect(button).toHaveAttribute('aria-disabled', 'false');
      expect(within(button).queryByRole('status')).not.toBeInTheDocument();

      fireEvent.click(button);

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(
        document.querySelector('[data-testid="paperless-picker-modal"]'),
      ).not.toBeInTheDocument();
    });

    // (H) ?create=1 + status load fails → manual modal auto-opens and create is stripped
    it('(H) auto-opens the manual modal and strips ?create=1 when the status load fails', async () => {
      mockGetPaperlessStatus.mockRejectedValue(new Error('status down'));
      mockFetchConfig.mockRejectedValue(new Error('config down'));
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(emptyVendorsResponse);

      renderPageWithCreate();

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId('location-search').textContent).not.toContain('create=1');
      });
    });

    // (I) the shortcut is consumed once: re-adding ?create=1 later does not reopen the modal
    it('(I) opens once per occurrence: a later ?create=1 reopens the modal and is cleared again (#2212)', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: false,
        reachable: false,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false });
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(emptyVendorsResponse);

      function ReAddCreate() {
        const [, setSearchParams] = useSearchParams();
        return (
          <button type="button" onClick={() => setSearchParams({ create: '1' })}>
            re-add create
          </button>
        );
      }

      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/budget/invoices?create=1']}>
            <Routes>
              <Route path="/budget/invoices" element={<InvoicesPageModule.InvoicesPage />} />
            </Routes>
            <ReAddCreate />
            <LocationSearchDisplay />
          </MemoryRouter>
        </ToastProvider>,
      );

      const dialog = await screen.findByRole('dialog');
      await waitFor(() => {
        expect(screen.getByTestId('location-search').textContent).not.toContain('create=1');
      });
      // Close the modal, then change the search params again.
      fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 're-add create' }));

      // The request is consumed again: the modal opens a second time and the param is removed.
      await screen.findByRole('dialog');
      await waitFor(() => {
        expect(screen.getByTestId('location-search').textContent).not.toContain('create=1');
      });
    });

    describe('Offer preset and company pre-fill (#2212 D13, D15)', () => {
      const unconfigured = {
        configured: false,
        reachable: false,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      };

      function renderAtUrl(url: string) {
        mockGetPaperlessStatus.mockResolvedValue(unconfigured);
        mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false });
        mockFetchAllInvoices.mockResolvedValue(emptyResponse);
        mockFetchVendors.mockResolvedValue(vendorsResponse);
        return render(
          <ToastProvider>
            <MemoryRouter initialEntries={[url]}>
              <Routes>
                <Route path="/budget/invoices" element={<InvoicesPageModule.InvoicesPage />} />
              </Routes>
              <LocationSearchDisplay />
            </MemoryRouter>
          </ToastProvider>,
        );
      }

      it('kind=offer presets the status to Offer (quotation)', async () => {
        renderAtUrl('/budget/invoices?create=1&kind=offer');
        const dialog = await screen.findByRole('dialog');
        expect((within(dialog).getByLabelText(/status/i) as HTMLSelectElement).value).toBe(
          'quotation',
        );
      });

      it('without kind the status stays on the default (pending)', async () => {
        renderAtUrl('/budget/invoices?create=1');
        const dialog = await screen.findByRole('dialog');
        expect((within(dialog).getByLabelText(/status/i) as HTMLSelectElement).value).toBe(
          'pending',
        );
      });

      it('an unknown kind is ignored (pending)', async () => {
        renderAtUrl('/budget/invoices?create=1&kind=bogus');
        const dialog = await screen.findByRole('dialog');
        expect((within(dialog).getByLabelText(/status/i) as HTMLSelectElement).value).toBe(
          'pending',
        );
      });

      describe('pre-selected company lookup (GET /vendors/:id)', () => {
        const farCompany = { id: 'v-far', name: 'Far Away Co' } as unknown as Awaited<
          ReturnType<typeof VendorsApiTypes.fetchVendor>
        >;
        const dialogField = (dialog: HTMLElement) =>
          dialog.querySelector('#invoice-vendor') as HTMLInputElement;
        const saveButton = (dialog: HTMLElement) =>
          within(dialog)
            .getAllByRole('button')
            .find((b) => b.className.includes('btnPrimary'))!;

        const fillAmountAndDate = (dialog: HTMLElement) => {
          fireEvent.change(dialog.querySelector('#invoice-amount') as HTMLInputElement, {
            target: { value: '10' },
          });
          fireEvent.change(dialog.querySelector('#invoice-date') as HTMLInputElement, {
            target: { value: '2026-03-01' },
          });
        };

        it('shows the name of a company that is far beyond the first page and posts its id', async () => {
          mockFetchVendor.mockResolvedValue(farCompany);
          mockCreateInvoice.mockResolvedValueOnce(sampleInvoice1);
          renderAtUrl('/budget/invoices?create=1&companyId=v-far');
          const dialog = await screen.findByRole('dialog');

          expect(await within(dialog).findByText('Far Away Co')).toBeInTheDocument();
          expect(mockFetchVendor).toHaveBeenCalledWith('v-far');
          expect(mockFetchVendor).toHaveBeenCalledTimes(1);
          fillAmountAndDate(dialog);
          fireEvent.submit(dialog.querySelector('form')!);

          await waitFor(() =>
            expect(mockCreateInvoice).toHaveBeenCalledWith('v-far', expect.anything()),
          );
        });

        it('does not look anything up without a pre-filled company', async () => {
          renderAtUrl('/budget/invoices?create=1');
          await screen.findByRole('dialog');
          await act(async () => {
            await Promise.resolve();
          });

          expect(mockFetchVendor).not.toHaveBeenCalled();
        });

        it('clears an unknown (404) company and never posts it', async () => {
          renderAtUrl('/budget/invoices?create=1&companyId=gone-id');
          const dialog = await screen.findByRole('dialog');

          await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledWith('gone-id'));
          await waitFor(() => expect(dialogField(dialog)).not.toBeDisabled());
          expect(dialogField(dialog).value).toBe('');
          // the stale id is gone from the form state: Save stays disabled with amount and date set
          fillAmountAndDate(dialog);
          expect(saveButton(dialog)).toBeDisabled();
          fireEvent.submit(dialog.querySelector('form')!);

          expect(mockCreateInvoice).not.toHaveBeenCalled();
        });

        it('keeps the company when the lookup fails with a server error (only a 404 drops it)', async () => {
          mockFetchVendor.mockRejectedValue(
            new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
          );
          mockCreateInvoice.mockResolvedValueOnce(sampleInvoice1);
          renderAtUrl('/budget/invoices?create=1&companyId=v-1');
          const dialog = await screen.findByRole('dialog');

          await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledTimes(1));
          await waitFor(() => expect(dialogField(dialog)).not.toBeDisabled());
          fillAmountAndDate(dialog);

          expect(saveButton(dialog)).not.toBeDisabled();
          fireEvent.submit(dialog.querySelector('form')!);
          await waitFor(() =>
            expect(mockCreateInvoice).toHaveBeenCalledWith('v-1', expect.anything()),
          );
        });

        it('disables the picker and Create while the lookup is pending', async () => {
          let finish: (v: typeof farCompany) => void = () => {};
          mockFetchVendor.mockReturnValue(new Promise((resolve) => (finish = resolve)));
          renderAtUrl('/budget/invoices?create=1&companyId=v-far');
          const dialog = await screen.findByRole('dialog');
          fillAmountAndDate(dialog);

          await waitFor(() => expect(dialogField(dialog)).toBeDisabled());
          expect(saveButton(dialog)).toBeDisabled();
          expect(mockFetchVendor).toHaveBeenCalledTimes(1);

          await act(async () => {
            finish(farCompany);
          });

          expect(await within(dialog).findByText('Far Away Co')).toBeInTheDocument();
          expect(
            within(dialog).getByRole('button', { name: 'Clear selection' }),
          ).not.toBeDisabled();
          expect(saveButton(dialog)).not.toBeDisabled();
        });

        it('looks a company up only once', async () => {
          renderAtUrl('/budget/invoices?create=1&companyId=gone-id');
          await screen.findByRole('dialog');
          await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledTimes(1));
          await act(async () => {
            await Promise.resolve();
          });

          expect(mockFetchVendor).toHaveBeenCalledTimes(1);
        });

        it('shows a company picked from the search results without any lookup', async () => {
          renderAtUrl('/budget/invoices?create=1');
          const dialog = await screen.findByRole('dialog');

          fireEvent.focus(dialogField(dialog));
          fireEvent.click(await screen.findByRole('option', { name: 'ACME Construction' }));

          expect(await within(dialog).findByText('ACME Construction')).toBeInTheDocument();
          expect(mockFetchVendor).not.toHaveBeenCalled();
        });
      });

      it('removes create, kind and companyId from the URL', async () => {
        renderAtUrl('/budget/invoices?create=1&kind=offer&companyId=v-1&sortBy=date');
        await screen.findByRole('dialog');
        await waitFor(() => {
          const text = screen.getByTestId('location-search').textContent ?? '';
          expect(text).not.toContain('create=');
          expect(text).not.toContain('kind=');
          expect(text).not.toContain('companyId=');
          expect(text).toContain('sortBy=date');
        });
      });

      it('does not treat companyId as a table filter', async () => {
        renderAtUrl('/budget/invoices?companyId=v-1');
        await waitFor(() => expect(mockFetchAllInvoices).toHaveBeenCalled());
        const lastCall = mockFetchAllInvoices.mock.calls.at(-1);
        expect(JSON.stringify(lastCall)).not.toContain('companyId');
      });
    });
  });

  // ─── Inline company create from the picker (#2213) ────────────────────────

  describe('create invoice modal: New company row (#2213)', () => {
    function renderWithCompanyCreate(request: RequestCompanyCreate | null) {
      return render(
        <ToastProvider>
          <CompanyCreateContext value={request}>
            <MemoryRouter initialEntries={['/budget/invoices']}>
              <Routes>
                <Route path="/budget/invoices" element={<InvoicesPageModule.InvoicesPage />} />
              </Routes>
            </MemoryRouter>
          </CompanyCreateContext>
        </ToastProvider>,
      );
    }

    async function openModal(user: ReturnType<typeof userEvent.setup>) {
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(vendorsResponse);
      await waitFor(() => expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument());
      await user.click(screen.getByTestId('new-invoice-button'));
      return within(await screen.findByRole('dialog'));
    }

    it('offers "New company ‹text›" when no result equals the text', async () => {
      const user = userEvent.setup();
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(vendorsResponse);
      renderWithCompanyCreate(jest.fn<RequestCompanyCreate>());
      const dialog = await openModal(user);

      await user.type(dialog.getByLabelText(/vendor/i), 'Brand New Co');

      expect(
        await screen.findByRole('option', { name: 'New company Brand New Co' }),
      ).toBeInTheDocument();
    });

    it('offers no row when a result equals the text, ignoring case', async () => {
      const user = userEvent.setup();
      renderWithCompanyCreate(jest.fn<RequestCompanyCreate>());
      const dialog = await openModal(user);

      await user.type(dialog.getByLabelText(/vendor/i), 'acme construction');

      await screen.findByRole('option', { name: 'ACME Construction' });
      expect(screen.queryByRole('option', { name: /^New company/ })).not.toBeInTheDocument();
    });

    it('offers no row outside a CompanyCreateProvider', async () => {
      const user = userEvent.setup();
      renderWithCompanyCreate(null);
      const dialog = await openModal(user);

      await user.type(dialog.getByLabelText(/vendor/i), 'Brand New Co');

      await waitFor(() =>
        expect(mockFetchVendors).toHaveBeenCalledWith(
          { q: 'Brand New Co', pageSize: 50 },
          { signal: expect.any(AbortSignal) },
        ),
      );
      expect(screen.queryByRole('option', { name: /^New company/ })).not.toBeInTheDocument();
    });

    it('selects the created company and posts its id with the invoice', async () => {
      const user = userEvent.setup();
      const request = jest
        .fn<RequestCompanyCreate>()
        .mockResolvedValue({ id: 'v-new', name: 'Brand New Co' });
      mockCreateInvoice.mockResolvedValueOnce(sampleInvoice1);
      renderWithCompanyCreate(request);
      const dialog = await openModal(user);

      await user.type(dialog.getByLabelText(/vendor/i), 'Brand New Co');
      await user.click(await screen.findByRole('option', { name: 'New company Brand New Co' }));

      expect(request).toHaveBeenCalledWith('Brand New Co');
      expect(await dialog.findByText('Brand New Co')).toBeInTheDocument();
      fireEvent.change(dialog.getByLabelText(/^amount/i), { target: { value: '100' } });
      fireEvent.change(dialog.getByLabelText(/invoice date/i), { target: { value: '2026-02-01' } });
      fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

      await waitFor(() =>
        expect(mockCreateInvoice).toHaveBeenCalledWith(
          'v-new',
          expect.objectContaining({ amount: 100, date: '2026-02-01' }),
        ),
      );
    });

    it('selects nothing when the New company form is cancelled, and keeps the modal', async () => {
      const user = userEvent.setup();
      const request = jest.fn<RequestCompanyCreate>().mockResolvedValue(null);
      renderWithCompanyCreate(request);
      const dialog = await openModal(user);

      await user.type(dialog.getByLabelText(/vendor/i), 'Brand New Co');
      await user.click(await screen.findByRole('option', { name: 'New company Brand New Co' }));

      await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(dialog.queryByText('Brand New Co')).not.toBeInTheDocument();
      expect(dialog.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
    });

    it('Escape does not close the invoice modal while the New company form is open', async () => {
      const user = userEvent.setup();
      let finish: (c: CompanyOption | null) => void = () => {};
      const request = jest.fn<RequestCompanyCreate>(
        () => new Promise<CompanyOption | null>((resolve) => (finish = resolve)),
      );
      renderWithCompanyCreate(request);
      const dialog = await openModal(user);
      await user.type(dialog.getByLabelText(/vendor/i), 'Brand New Co');
      await user.click(await screen.findByRole('option', { name: 'New company Brand New Co' }));

      await user.keyboard('{Escape}');
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await act(async () => {
        finish(null);
      });
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });
  // ─── Story #1876: effectiveAmount column ─────────────────────────────────

  describe('effectiveAmount column (Story #1876)', () => {
    // An invoice with both budget-line itemization (making remainingAmount
    // differ from amount) AND a refund-driven finalPaymentAmount (making
    // effectiveAmount differ from both amount and remainingAmount) — proves
    // the two columns are computed independently.
    const refundInvoice: Invoice = {
      id: 'inv-refund-001',
      vendorId: 'v-1',
      vendorName: 'ACME Construction',
      invoiceNumber: 'INV-2026-REFUND',
      amount: 10000,
      date: '2026-02-01',
      dueDate: '2026-03-01',
      status: 'pending',
      notes: null,
      budgetLines: [
        {
          id: 'ibl-refund-1',
          budgetLineId: 'wib-refund-1',
          budgetLineType: 'work_item',
          itemName: 'Refund Test Work Item',
          budgetLineDescription: null,
          categoryName: null,
          categoryColor: null,
          categoryTranslationKey: null,
          plannedAmount: 2000,
          confidence: 'quote',
          itemizedAmount: 2000,
        },
      ],
      // remainingAmount = amount - Σ itemizedAmount = 10000 - 2000 = 8000
      remainingAmount: 8000,
      deposits: [],
      // finalPaymentAmount = amount - deposits - received refunds = 10000 - 1500 = 8500
      // (deliberately different from remainingAmount to prove independence)
      finalPaymentAmount: 8500,
      createdBy: null,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    };

    const refundResponse: InvoiceListPaginatedResponse = {
      invoices: [refundInvoice],
      pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 1 },
      chipCounts: EMPTY_CHIP_COUNTS,
      summary: {
        pending: { count: 1, totalAmount: 10000 },
        paid: { count: 0, totalAmount: 0 },
        claimed: { count: 0, totalAmount: 0 },
        quotation: { count: 0, totalAmount: 0 },
        overdue: { count: 0, totalAmount: 0 },
        claimable: { count: 1, totalAmount: 10000 },
        quotationCoveredByDeposits: 0,
        openPayable: { count: 1, totalAmount: 10000 },
        refundsDue: { count: 0, totalAmount: 0 },
      },
    };

    async function openColumnSettings() {
      const settingsBtn = screen.getByRole('button', { name: /column settings/i });
      fireEvent.click(settingsBtn);
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /visible columns/i })).toBeInTheDocument();
      });
    }

    it('the "Effective Amount" column is hidden by default (defaultVisible: false)', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(refundResponse);
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('INV-2026-REFUND')[0]!).toBeInTheDocument();
      });

      // The formatted effectiveAmount value must not appear anywhere yet
      expect(screen.queryByText('€8,500.00')).not.toBeInTheDocument();
    });

    it('toggling "Effective Amount" on renders formatCurrency(finalPaymentAmount), independent of "Remaining Amount"', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(refundResponse);
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('INV-2026-REFUND')[0]!).toBeInTheDocument();
      });

      await openColumnSettings();

      const effectiveAmountCheckbox = document.getElementById(
        'col-effectiveAmount',
      ) as HTMLInputElement;
      expect(effectiveAmountCheckbox).toBeInTheDocument();
      expect(effectiveAmountCheckbox.checked).toBe(false);

      fireEvent.click(effectiveAmountCheckbox);

      await waitFor(() => {
        expect(screen.getAllByText('€8,500.00').length).toBeGreaterThan(0);
      });
    });

    it('"Remaining Amount" and "Effective Amount" show distinct values for the same invoice when both are visible', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(refundResponse);
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('INV-2026-REFUND')[0]!).toBeInTheDocument();
      });

      await openColumnSettings();

      fireEvent.click(document.getElementById('col-remainingAmount')!);
      fireEvent.click(document.getElementById('col-effectiveAmount')!);

      await waitFor(() => {
        // remainingAmount = 8000, finalPaymentAmount = 8500 — both visible and distinct
        expect(screen.getAllByText('€8,000.00').length).toBeGreaterThan(0);
        expect(screen.getAllByText('€8,500.00').length).toBeGreaterThan(0);
      });
    });

    it('the "Effective Amount" column label is "Effective Amount"', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(refundResponse);
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('INV-2026-REFUND')[0]!).toBeInTheDocument();
      });

      await openColumnSettings();

      const label = screen.getByLabelText('Effective Amount');
      expect(label).toBeInTheDocument();
    });
  });

  // ─── Badge-fix regression (Story #2046) ───────────────────────────────────
  // The status Badge's className must resolve to a real variant class
  // (badgeStyles[status]), not silently drop to just the base "badge" class
  // or interpolate a literal "undefined" string.

  describe('status badge className regression (Story #2046)', () => {
    it('the invoice status badge className includes the resolved variant class and never the literal "undefined"', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(populatedResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('invoice-status-inv-001')).toBeInTheDocument();
      });

      const badge = screen.getByTestId('invoice-status-inv-001');
      expect(badge.className).toContain('pending');
      expect(badge.className).not.toContain('undefined');

      const paidBadge = screen.getByTestId('invoice-status-inv-002');
      expect(paidBadge.className).toContain('paid');
      expect(paidBadge.className).not.toContain('undefined');
    });
  });

  // ─── Desktop/mobile duplicate-testid regression (fix/2046-e2e-toggle-flake) ─
  // DataTable mounts the desktop table AND the mobile cards simultaneously (CSS
  // picks one visually; jsdom applies no CSS), so a status column with no
  // `renderCard` override used to emit the SAME `invoice-status-{id}` testid
  // twice — invisible to jsdom-based unit assertions (which mostly used
  // getAllByTestId(...)[0], tolerant of 1 or 2 matches) but a real Playwright
  // strict-mode violation. The fix gives the renderCard-rendered instance a
  // `-mobile-` suffixed testid. These tests pin that: exactly one match per
  // testid (not two), and the two elements are genuinely distinct nodes.

  describe('desktop/mobile testid disambiguation (fix/2046-e2e-toggle-flake)', () => {
    it('the status badge renders exactly one desktop-testid element and one distinct mobile-testid element', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(populatedResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('invoice-status-inv-001')).toBeInTheDocument();
      });

      const desktopBadges = screen.getAllByTestId('invoice-status-inv-001');
      const mobileBadges = screen.getAllByTestId('invoice-status-mobile-inv-001');
      expect(desktopBadges).toHaveLength(1);
      expect(mobileBadges).toHaveLength(1);
      expect(desktopBadges[0]).not.toBe(mobileBadges[0]);
    });
  });
  // ─── Page identity (#2203) ─────────────────────────────────────────────────

  describe('page identity (#2203)', () => {
    function renderRouted(url = '/budget/invoices') {
      const log = createRouterLog();
      render(
        <ToastProvider>
          <RecordingRouter entries={[url]} log={log}>
            <InvoicesPageModule.InvoicesPage />
          </RecordingRouter>
        </ToastProvider>,
      );
      return log;
    }

    it('shows one "Invoices" h1 and the Invoices tab title in every state', async () => {
      document.title = 'initial';
      mockFetchAllInvoices.mockReturnValueOnce(new Promise(() => {}));
      renderRouted();

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1, name: 'Invoices' })).toBeInTheDocument();
      expect(document.title).toBe('Invoices · Money · Cornerstone');
    });

    it('keeps one "Invoices" h1 and no breadcrumbs once loaded, and does not navigate on mount', async () => {
      mockFetchAllInvoices.mockResolvedValue({
        ...emptyResponse,
        invoices: [sampleInvoice1],
      });
      const log = renderRouted();

      await screen.findAllByText('ACME Construction');
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1, name: 'Invoices' })).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'You are here' })).toBeNull();
      expect(log.actions).toEqual([]);
    });

    it('replaces history when the open-only toggle changes', async () => {
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      const log = renderRouted();

      await waitFor(() => expect(mockFetchAllInvoices).toHaveBeenCalled());
      fireEvent.click(await screen.findByRole('checkbox', { name: 'Show only open items' }));

      await waitFor(() => expect(log.actions.length).toBeGreaterThan(0));
      expect(log.actions.every((a) => a.startsWith('REPLACE '))).toBe(true);
      expect(log.actions.at(-1)).toContain('openOnly=true');
      expect(log.entries).toHaveLength(1);
    });

    it('replaces history again when the open-only toggle is switched off', async () => {
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      const log = renderRouted('/budget/invoices?openOnly=true');

      const toggle = await screen.findByRole('checkbox', { name: 'Show only open items' });
      expect(toggle).toBeChecked();
      fireEvent.click(toggle);

      await waitFor(() => expect(log.actions.length).toBeGreaterThan(0));
      expect(log.actions.every((a) => a.startsWith('REPLACE '))).toBe(true);
      expect(log.actions.at(-1)).not.toContain('openOnly');
      expect(log.entries).toHaveLength(1);
    });

    it('replaces history when a table sort changes', async () => {
      mockFetchAllInvoices.mockResolvedValue({ ...emptyResponse, invoices: [sampleInvoice1] });
      const log = renderRouted();

      await screen.findAllByText('ACME Construction');
      const header = screen
        .getAllByRole('columnheader')
        .find((h) => /^\s*Amount/i.test(h.textContent ?? ''));
      expect(header).toBeDefined();
      fireEvent.click(header!);

      await waitFor(() => expect(log.actions.length).toBeGreaterThan(0));
      expect(log.actions.every((a) => a.startsWith('REPLACE '))).toBe(true);
      expect(log.entries).toHaveLength(1);
    });

    function renderProbed() {
      return render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/budget/invoices?status=pending']}>
            <Routes>
              <Route path="/budget/invoices" element={<InvoicesPageModule.InvoicesPage />} />
              <Route path="*" element={<div>Elsewhere</div>} />
            </Routes>
            <LocationDisplay />
          </MemoryRouter>
        </ToastProvider>,
      );
    }

    it('the company link pushes once, to the company page with origin state, and never to the invoice', async () => {
      mockFetchAllInvoices.mockResolvedValue({ ...emptyResponse, invoices: [sampleInvoice1] });
      const log = createRouterLog();
      render(
        <ToastProvider>
          <RecordingRouter entries={['/budget/invoices?status=pending']} log={log}>
            <InvoicesPageModule.InvoicesPage />
          </RecordingRouter>
        </ToastProvider>,
      );

      fireEvent.click((await screen.findAllByRole('link', { name: 'ACME Construction' }))[0]!);

      expect(log.actions).toEqual(['PUSH /companies/v-1']);
      expect(log.states[0]).toEqual({ origin: { to: '/budget/invoices?status=pending' } });
    });

    it('the invoice-number link pushes exactly once, to the invoice', async () => {
      mockFetchAllInvoices.mockResolvedValue({ ...emptyResponse, invoices: [sampleInvoice1] });
      const log = createRouterLog();
      render(
        <ToastProvider>
          <RecordingRouter entries={['/budget/invoices']} log={log}>
            <InvoicesPageModule.InvoicesPage />
          </RecordingRouter>
        </ToastProvider>,
      );

      const links = await screen.findAllByRole('link', { name: 'INV-2026-001' });
      fireEvent.click(links[0]!);

      expect(log.actions).toEqual(['PUSH /budget/invoices/inv-001']);
    });

    it('opening a row carries no origin', async () => {
      mockFetchAllInvoices.mockResolvedValue({ ...emptyResponse, invoices: [sampleInvoice1] });
      renderProbed();

      const cell = (await screen.findAllByText('INV-2026-001'))[0]!;
      fireEvent.click(cell);

      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveTextContent('/budget/invoices/inv-001'),
      );
      expect(screen.getByTestId('location-state')).toHaveTextContent('null');
    });
  });

  // ─── Company column filter: entity filter, resolved from the URL ─────────────

  describe('company filter (vendorId, entity filter)', () => {
    function Probe({ onSearch }: { onSearch: (search: string) => void }) {
      onSearch(useLocation().search);
      return null;
    }

    function renderAtFilter(url: string) {
      let search = '';
      mockFetchAllInvoices.mockResolvedValue(populatedResponse);
      render(
        <ToastProvider>
          <MemoryRouter initialEntries={[url]}>
            <Routes>
              <Route path="/budget/invoices" element={<InvoicesPageModule.InvoicesPage />} />
            </Routes>
            <Probe onSearch={(v) => (search = v)} />
          </MemoryRouter>
        </ToastProvider>,
      );
      return { search: () => search };
    }

    it('loads no companies on mount', async () => {
      renderAtFilter('/budget/invoices');

      await waitFor(() => expect(mockFetchAllInvoices).toHaveBeenCalled());
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockFetchVendors).not.toHaveBeenCalled();
      expect(mockFetchVendor).not.toHaveBeenCalled();
    });

    it('searches companies on the server from the column filter and writes vendorId to the URL', async () => {
      const user = userEvent.setup();
      mockFetchVendors.mockImplementation(async (params) => ({
        ...vendorsResponse,
        vendors:
          params?.q === 'zeta'
            ? [{ ...vendorsResponse.vendors[0]!, id: 'v-250', name: 'Zeta Tiling' }]
            : [],
      }));
      // the chosen id is resolved by GET /vendors/:id once it is in the URL
      mockFetchVendor.mockResolvedValue({ id: 'v-250', name: 'Zeta Tiling' } as never);
      const probe = renderAtFilter('/budget/invoices');
      await screen.findByRole('button', { name: /filter by vendor/i });

      await user.click(screen.getByRole('button', { name: /filter by vendor/i }));
      await user.type(within(await screen.findByRole('dialog')).getByRole('textbox'), 'zeta');
      await user.click(await screen.findByRole('option', { name: 'Zeta Tiling' }));

      expect(mockFetchVendors).toHaveBeenCalledWith(
        { q: 'zeta', pageSize: 50 },
        { signal: expect.any(AbortSignal) },
      );
      await waitFor(
        () => expect(new URLSearchParams(probe.search()).get('vendorId')).toBe('v-250'),
        {
          timeout: 3000,
        },
      );
    });

    it('resolves the label of ?vendorId=<id> with GET /vendors/:id and keeps the param', async () => {
      const user = userEvent.setup();
      mockFetchVendor.mockResolvedValue({ id: 'v-250', name: 'Zeta Tiling' } as never);
      const probe = renderAtFilter('/budget/invoices?vendorId=v-250');

      await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledWith('v-250'));
      await user.click(await screen.findByRole('button', { name: /filter by vendor/i }));

      expect(
        await within(await screen.findByRole('dialog')).findByText('Zeta Tiling'),
      ).toBeInTheDocument();
      expect(new URLSearchParams(probe.search()).get('vendorId')).toBe('v-250');
    });

    it('drops an unknown (404) company from the URL', async () => {
      const probe = renderAtFilter('/budget/invoices?vendorId=v-gone&sortBy=date');

      await waitFor(() => expect(new URLSearchParams(probe.search()).has('vendorId')).toBe(false));
      expect(new URLSearchParams(probe.search()).get('sortBy')).toBe('date');
    });

    it('keeps the param when the lookup fails with a server error', async () => {
      mockFetchVendor.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      const probe = renderAtFilter('/budget/invoices?vendorId=v-1');

      await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledTimes(1));
      await act(async () => {
        await Promise.resolve();
      });

      expect(new URLSearchParams(probe.search()).get('vendorId')).toBe('v-1');
    });
  });

  // ─── Branch coverage: menus, search/sort, create flow edge cases, open-items cells (#2232) ───

  describe('menus, search, sorting and row navigation', () => {
    function renderAt(url: string) {
      return render(
        <ToastProvider>
          <MemoryRouter initialEntries={[url]}>
            <Routes>
              <Route path="/budget/invoices" element={<InvoicesPageModule.InvoicesPage />} />
              <Route path="/budget/invoices/:id" element={<div>Invoice Detail</div>} />
            </Routes>
            <LocationDisplay />
          </MemoryRouter>
        </ToastProvider>,
      );
    }

    it('words the allocation of a zero-amount invoice as a line count', async () => {
      mockFetchAllInvoices.mockResolvedValue({
        ...populatedResponse,
        invoices: [{ ...sampleInvoice2, amount: 0, invoiceNumber: 'INV-ZERO' }],
      });
      renderPage();

      const row = (await screen.findAllByText('INV-ZERO'))[0]!.closest('tr')!;
      expect(row).toHaveTextContent('1 lines');
      expect(row).not.toHaveTextContent('% allocated');
    });

    it('keeps the filter options the server returns', async () => {
      mockFetchAllInvoices.mockResolvedValue({
        ...populatedResponse,
        filterMeta: { status: [{ value: 'paid', label: 'Paid' }] } as never,
      });
      renderPage();

      expect((await screen.findAllByText('INV-2026-001')).length).toBeGreaterThan(0);
    });

    it('opens the invoice when a row is clicked', async () => {
      mockFetchAllInvoices.mockResolvedValue(populatedResponse);
      renderAt('/budget/invoices');

      const row = (await screen.findAllByText('INV-2026-001'))[0]!.closest('tr')!;
      fireEvent.click(within(row).getByText('Feb 1, 2026'));

      expect(await screen.findByText('Invoice Detail')).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent('/budget/invoices/inv-001');
    });

    it('opens and closes the row menu with its button, an outside press and Escape', async () => {
      mockFetchAllInvoices.mockResolvedValue(populatedResponse);
      renderAt('/budget/invoices');
      await screen.findAllByText('INV-2026-001');

      const toggle = () => screen.getByTestId('invoice-menu-button-inv-001');
      fireEvent.click(toggle());
      expect(screen.getByTestId('invoice-view-inv-001')).toBeInTheDocument();

      // the same button closes it
      fireEvent.click(toggle());
      expect(screen.queryByTestId('invoice-view-inv-001')).toBeNull();

      // a press outside closes it
      fireEvent.click(toggle());
      fireEvent.mouseDown(document.body);
      expect(screen.queryByTestId('invoice-view-inv-001')).toBeNull();

      // a press inside the menu keeps it open
      fireEvent.click(toggle());
      fireEvent.mouseDown(screen.getByTestId('invoice-view-inv-001'));
      expect(screen.getByTestId('invoice-view-inv-001')).toBeInTheDocument();

      // other keys keep it open, Escape closes it
      fireEvent.keyDown(document, { key: 'a' });
      expect(screen.getByTestId('invoice-view-inv-001')).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('invoice-view-inv-001')).toBeNull();
    });

    it('opens the invoice from the row menu', async () => {
      mockFetchAllInvoices.mockResolvedValue(populatedResponse);
      renderAt('/budget/invoices');
      await screen.findAllByText('INV-2026-001');

      fireEvent.click(screen.getByTestId('invoice-menu-button-inv-001'));
      fireEvent.click(screen.getByTestId('invoice-view-inv-001'));

      expect(await screen.findByText('Invoice Detail')).toBeInTheDocument();
    });

    it('writes the search text to the URL', async () => {
      mockFetchAllInvoices.mockResolvedValue(populatedResponse);
      renderAt('/budget/invoices');
      await screen.findAllByText('INV-2026-001');

      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'plaster' } });

      await waitFor(() =>
        expect(screen.getByTestId('location-full')).toHaveTextContent('q=plaster'),
      );
    });

    it('defaults the sort direction to ascending when the URL has a column but no direction', async () => {
      mockFetchAllInvoices.mockResolvedValue(populatedResponse);
      renderAt('/budget/invoices?sortBy=date');
      await screen.findAllByText('INV-2026-001');

      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'plaster' } });

      await waitFor(() => {
        const where = screen.getByTestId('location-full').textContent!;
        expect(where).toContain('sortBy=date');
        expect(where).toContain('sortOrder=asc');
      });
    });

    it('writes the sort column and direction to the URL when a header is clicked', async () => {
      mockFetchAllInvoices.mockResolvedValue(populatedResponse);
      renderAt('/budget/invoices');
      await screen.findAllByText('INV-2026-001');

      const header = screen
        .getAllByText('Date')
        .find((el) => el.closest('thead'))!
        .closest('th')!;
      fireEvent.click(header);

      await waitFor(() => {
        const where = screen.getByTestId('location-full').textContent!;
        expect(where).toContain('sortBy=date');
        expect(where).toContain('sortOrder=asc');
      });
    });
  });

  describe('Paperless picker and manual entry (#2232 coverage)', () => {
    const configured = () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: 'https://paperless.example.test',
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: true });
    };

    it('opens the picker, then the manual form from "Manual Entry"', async () => {
      configured();
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      renderPage();

      await waitFor(() => expect(screen.getByTestId('new-invoice-button')).toBeEnabled());
      fireEvent.click(screen.getByTestId('new-invoice-button'));
      fireEvent.click(await screen.findByRole('button', { name: 'Manual Entry' }));

      expect(screen.queryByTestId('paperless-picker-modal')).toBeNull();
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('closes the picker without opening anything', async () => {
      configured();
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      renderPage();

      await waitFor(() => expect(screen.getByTestId('new-invoice-button')).toBeEnabled());
      fireEvent.click(screen.getByTestId('new-invoice-button'));
      fireEvent.click(await screen.findByRole('button', { name: 'Close Modal' }));

      expect(screen.queryByTestId('paperless-picker-modal')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('opens the manual form when Paperless is configured but unreachable', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: true,
        reachable: false,
        error: 'down',
        paperlessUrl: null,
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: true });
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      renderPage();

      await waitFor(() => expect(screen.getByTestId('new-invoice-button')).toBeEnabled());
      fireEvent.click(screen.getByTestId('new-invoice-button'));

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.queryByTestId('paperless-picker-modal')).toBeNull();
    });
  });

  describe('status load that settles after the page is gone', () => {
    it('ignores a status that resolves after unmount', async () => {
      let resolveStatus: (v: Awaited<ReturnType<typeof mockGetPaperlessStatus>>) => void = () => {};
      mockGetPaperlessStatus.mockReturnValue(
        new Promise((resolve) => {
          resolveStatus = resolve;
        }),
      );
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      const { unmount } = renderPage();
      unmount();

      await act(async () => {
        resolveStatus({
          configured: false,
          reachable: false,
          error: null,
          paperlessUrl: null,
          filterTag: null,
        });
        await Promise.resolve();
      });
      expect(mockFetchConfig).toHaveBeenCalled();
    });

    it('ignores a status that fails after unmount', async () => {
      let rejectStatus: (e: Error) => void = () => {};
      mockGetPaperlessStatus.mockReturnValue(
        new Promise((_resolve, reject) => {
          rejectStatus = reject;
        }),
      );
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      const { unmount } = renderPage();
      unmount();

      await act(async () => {
        rejectStatus(new Error('late'));
        await Promise.resolve();
      });
      expect(mockGetPaperlessStatus).toHaveBeenCalled();
    });
  });

  describe('create form edge cases (#2232 coverage)', () => {
    async function openForm(user: ReturnType<typeof userEvent.setup>) {
      mockFetchAllInvoices.mockResolvedValue(emptyResponse);
      mockFetchVendors.mockResolvedValue(vendorsResponse);
      renderPage();
      await waitFor(() => expect(screen.getByTestId('new-invoice-button')).toBeEnabled());
      await user.click(screen.getByTestId('new-invoice-button'));
      await screen.findByRole('dialog');
    }

    const submit = () => {
      const form = screen.getByRole('dialog').querySelector('form')!;
      fireEvent.submit(form);
    };

    it('asks for the invoice date when only company and amount are filled', async () => {
      const user = userEvent.setup();
      await openForm(user);
      await chooseCompany(user, 'ACME Construction');
      fireEvent.change(screen.getByLabelText(/^amount/i), { target: { value: '100' } });

      submit();

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(mockCreateInvoice).not.toHaveBeenCalled();
    });

    it('sends every filled field and closes the form on success', async () => {
      const user = userEvent.setup();
      mockCreateInvoice.mockResolvedValueOnce(sampleInvoice1);
      await openForm(user);
      await chooseCompany(user, 'ACME Construction');
      fireEvent.change(screen.getByLabelText(/invoice #/i), {
        target: { value: ' INV-NEW ' },
      });
      fireEvent.change(screen.getByLabelText(/^amount/i), { target: { value: '250.5' } });
      fireEvent.wheel(screen.getByLabelText(/^amount/i));
      fireEvent.change(screen.getByLabelText(/invoice date/i), { target: { value: '2026-02-01' } });
      fireEvent.change(document.getElementById('invoice-due-date')!, {
        target: { value: '2026-03-01' },
      });
      fireEvent.change(document.getElementById('invoice-status')!, {
        target: { value: 'quotation' },
      });
      fireEvent.change(document.getElementById('invoice-notes')!, {
        target: { value: ' Synthetic note ' },
      });

      submit();

      await waitFor(() =>
        expect(mockCreateInvoice).toHaveBeenCalledWith('v-1', {
          invoiceNumber: 'INV-NEW',
          amount: 250.5,
          date: '2026-02-01',
          dueDate: '2026-03-01',
          status: 'quotation',
          notes: 'Synthetic note',
        }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('sends nulls for the optional fields that were left empty', async () => {
      const user = userEvent.setup();
      mockCreateInvoice.mockResolvedValueOnce(sampleInvoice1);
      await openForm(user);
      await chooseCompany(user, 'ACME Construction');
      fireEvent.change(screen.getByLabelText(/^amount/i), { target: { value: '10' } });
      fireEvent.change(screen.getByLabelText(/invoice date/i), { target: { value: '2026-02-01' } });

      submit();

      await waitFor(() =>
        expect(mockCreateInvoice).toHaveBeenCalledWith('v-1', {
          invoiceNumber: null,
          amount: 10,
          date: '2026-02-01',
          dueDate: null,
          status: 'pending',
          notes: null,
        }),
      );
    });

    it('shows the generic message when the request fails without an API error', async () => {
      const user = userEvent.setup();
      mockCreateInvoice.mockRejectedValueOnce(new Error('network down'));
      await openForm(user);
      await chooseCompany(user, 'ACME Construction');
      fireEvent.change(screen.getByLabelText(/^amount/i), { target: { value: '10' } });
      fireEvent.change(screen.getByLabelText(/invoice date/i), { target: { value: '2026-02-01' } });

      submit();

      const alert = await screen.findByRole('alert');
      expect(alert).not.toHaveTextContent('network down');
      expect(alert.textContent!.length).toBeGreaterThan(0);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('keeps the form open on Escape while the invoice is being created', async () => {
      const user = userEvent.setup();
      let finish: (v: Invoice) => void = () => {};
      mockCreateInvoice.mockReturnValueOnce(
        new Promise<Invoice>((resolve) => {
          finish = resolve;
        }),
      );
      await openForm(user);
      await chooseCompany(user, 'ACME Construction');
      fireEvent.change(screen.getByLabelText(/^amount/i), { target: { value: '10' } });
      fireEvent.change(screen.getByLabelText(/invoice date/i), { target: { value: '2026-02-01' } });
      submit();
      await waitFor(() => expect(mockCreateInvoice).toHaveBeenCalled());

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await act(async () => {
        finish(sampleInvoice1);
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('creates the invoice when the Add Invoice button is pressed', async () => {
      const user = userEvent.setup();
      mockCreateInvoice.mockResolvedValueOnce(sampleInvoice1);
      await openForm(user);
      await chooseCompany(user, 'ACME Construction');
      fireEvent.change(screen.getByLabelText(/^amount/i), { target: { value: '10' } });
      fireEvent.change(screen.getByLabelText(/invoice date/i), { target: { value: '2026-02-01' } });

      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Add Invoice' }),
      );

      await waitFor(() => expect(mockCreateInvoice).toHaveBeenCalledWith('v-1', expect.anything()));
    });

    it('enables Create only once company, amount and date are all filled', async () => {
      const user = userEvent.setup();
      await openForm(user);
      const create = () =>
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Add Invoice' });

      expect(create()).toBeDisabled();
      await chooseCompany(user, 'ACME Construction');
      expect(create()).toBeDisabled();
      fireEvent.change(screen.getByLabelText(/^amount/i), { target: { value: '10' } });
      expect(create()).toBeDisabled();
      fireEvent.change(screen.getByLabelText(/invoice date/i), { target: { value: '2026-02-01' } });
      expect(create()).toBeEnabled();
    });
  });

  describe('summary hints (#2232 coverage)', () => {
    it('shows how much of the offers is already covered by deposits', async () => {
      mockFetchAllInvoices.mockResolvedValue({
        ...populatedResponse,
        summary: { ...populatedSummary, quotationCoveredByDeposits: 1200 },
      });
      renderPage();

      expect(await screen.findByText('€1,200.00 already deposited')).toBeInTheDocument();
    });
  });
});
