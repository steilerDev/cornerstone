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
import type * as UseInvoiceCreateTypes from './useInvoiceCreate.js';
import type { Invoice } from '@cornerstone/shared';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import { ShortcutSnapshot } from '../../test/shortcutSnapshot.js';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import { INVOICE_STATUSES } from '@cornerstone/shared';
import enCommon from '../../i18n/en/common.json';
import enErrors from '../../i18n/en/errors.json';

// ── API mocks ─────────────────────────────────────────────────────────────────

const mockCreateInvoice = jest.fn<typeof InvoicesApiTypes.createInvoice>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
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

const mockOnCreated = jest.fn<() => void>();
let useInvoiceCreateHook: typeof UseInvoiceCreateTypes.useInvoiceCreate;

/** The smallest host of the hook: a primary button (aria-disabled until the status is known) and the dialogs. */
function Host() {
  const create = useInvoiceCreateHook({ onCreated: mockOnCreated });
  return (
    <div>
      <h1>Host</h1>
      <input type="search" role="searchbox" aria-label="Search" />
      <button
        type="button"
        data-testid="new-invoice-button"
        aria-disabled={create.paperlessConfigured === null ? 'true' : 'false'}
        onClick={create.open}
      >
        New
      </button>
      <span data-testid="paperless-configured">{String(create.paperlessConfigured)}</span>
      {create.dialogs}
    </div>
  );
}

describe('useInvoiceCreate', () => {
  beforeEach(async () => {
    mockCreateInvoice.mockReset();
    mockOnCreated.mockReset();
    mockFetchVendors.mockReset();
    mockFetchVendor.mockReset();
    mockFetchVendor.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
    mockGetPaperlessStatus.mockReset();
    mockFetchConfig.mockReset();

    if (!useInvoiceCreateHook) {
      ({ useInvoiceCreate: useInvoiceCreateHook } = await import('./useInvoiceCreate.js'));
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
            <Route path="/budget/invoices" element={<Host />} />
            <Route path="/budget/invoices/:id" element={<div>Invoice Detail</div>} />
            <Route path="/budget/invoices/new/paperless" element={<div>Paperless Review</div>} />
            <Route path="/companies/:id" element={<div>Vendor Detail</div>} />
          </Routes>
          <LocationDisplay />
        </MemoryRouter>
      </ToastProvider>,
    );
  }

  describe('open before the status is known', () => {
    it('opens the manual form once the status load settles when New was pressed before', async () => {
      let resolveConfig: (v: { autoItemizeEnabled: boolean }) => void = () => {};
      mockFetchConfig.mockReturnValue(
        new Promise((resolve) => {
          resolveConfig = resolve;
        }),
      );
      renderPage();
      expect(screen.getByTestId('paperless-configured')).toHaveTextContent('null');
      fireEvent.click(screen.getByTestId('new-invoice-button'));
      expect(screen.queryByRole('dialog')).toBeNull();

      await act(async () => {
        resolveConfig({ autoItemizeEnabled: false });
      });

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('opens the Paperless picker once settled when Paperless and auto-itemize are on', async () => {
      let resolveConfig: (v: { autoItemizeEnabled: boolean }) => void = () => {};
      mockGetPaperlessStatus.mockResolvedValue({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: 'https://paperless.example.com',
        filterTag: null,
      });
      mockFetchConfig.mockReturnValue(
        new Promise((resolve) => {
          resolveConfig = resolve;
        }),
      );
      renderPage();
      fireEvent.click(screen.getByTestId('new-invoice-button'));
      await act(async () => {
        resolveConfig({ autoItemizeEnabled: true });
      });
      expect(await screen.findByTestId('paperless-picker-modal')).toBeInTheDocument();
      expect(screen.getByTestId('paperless-configured')).toHaveTextContent('true');
    });

    it('does not reopen on later renders after the queued open ran once', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('paperless-configured')).toHaveTextContent('false'),
      );
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('create invoice modal', () => {
    it('opens modal when New Invoice button is clicked', async () => {
      const user = userEvent.setup();
      // Use mockResolvedValue (not Once) to handle multiple loadInvoices calls from useTableState

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
      await waitFor(() => expect(mockOnCreated).toHaveBeenCalledTimes(1));
    });

    it('shows API error when createInvoice fails', async () => {
      const user = userEvent.setup();
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

  // ─── Story #1679: "New Invoice" button branching logic ──────────────────────

  describe('"New Invoice" button branching (#1679)', () => {
    it('button has aria-disabled while integration status is loading', async () => {
      // Never resolve — stays loading
      mockGetPaperlessStatus.mockReturnValue(new Promise(() => {}));
      mockFetchConfig.mockReturnValue(new Promise(() => {}));

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
        renderPage();
        await waitFor(() => {
          expect(screen.getByTestId('new-invoice-button')).toHaveAttribute('aria-disabled', 'true');
        });
        fireEvent.keyDown(document, { key: 'n' });
        expect(screen.queryByRole('dialog')).toBeNull();
      });

      it('ignores n typed into the list search field', async () => {
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
        render(
          <ShortcutRegistryProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={['/budget/invoices']}>
                <Host />
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
              <Route path="/budget/invoices" element={<Host />} />
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

    // #2194 D-17 (moved here from InvoicesPage.test.tsx in #2238)
    it('D-17: the manual create modal opens with the status preset to To pay, never Offer', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: false,
        reachable: false,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      });
      mockFetchConfig.mockResolvedValue({ autoItemizeEnabled: false });
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

    it('(J) the create form status select lists INVOICE_STATUSES in order with translated labels', async () => {
      renderPageWithCreate();
      const dialog = await screen.findByRole('dialog');
      const options = Array.from(dialog.querySelectorAll('#invoice-status option')).map((o) => [
        (o as HTMLOptionElement).value,
        o.textContent,
      ]);

      expect(options).toEqual(
        INVOICE_STATUSES.map((status) => [status, enCommon.statusVocabulary.invoice[status]]),
      );
    });

    // (G) status load fails → Add Invoice is enabled with no spinner and opens the manual modal
    it('(G) enables Add Invoice with no spinner and opens the manual modal when the status load fails', async () => {
      mockGetPaperlessStatus.mockRejectedValue(new Error('status down'));
      mockFetchConfig.mockRejectedValue(new Error('config down'));
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
              <Route path="/budget/invoices" element={<Host />} />
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
        mockFetchVendors.mockResolvedValue(vendorsResponse);
        return render(
          <ToastProvider>
            <MemoryRouter initialEntries={[url]}>
              <Routes>
                <Route path="/budget/invoices" element={<Host />} />
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
                <Route path="/budget/invoices" element={<Host />} />
              </Routes>
            </MemoryRouter>
          </CompanyCreateContext>
        </ToastProvider>,
      );
    }

    async function openModal(user: ReturnType<typeof userEvent.setup>) {
      mockFetchVendors.mockResolvedValue(vendorsResponse);
      await waitFor(() => expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument());
      await user.click(screen.getByTestId('new-invoice-button'));
      return within(await screen.findByRole('dialog'));
    }

    it('offers "New company ‹text›" when no result equals the text', async () => {
      const user = userEvent.setup();
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
      renderPage();

      await waitFor(() => expect(screen.getByTestId('new-invoice-button')).toBeEnabled());
      fireEvent.click(screen.getByTestId('new-invoice-button'));
      fireEvent.click(await screen.findByRole('button', { name: 'Manual Entry' }));

      expect(screen.queryByTestId('paperless-picker-modal')).toBeNull();
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('closes the picker without opening anything', async () => {
      configured();
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
});
