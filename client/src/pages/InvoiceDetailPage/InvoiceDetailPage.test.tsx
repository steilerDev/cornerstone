/**
 * @jest-environment jsdom
 */
import { useEffect } from 'react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import { OriginProbe, probedOrigin } from '../../test/originProbe.js';
import type {
  AppConfigResponse,
  Invoice,
  InvoiceDeposit,
  PaperlessStatusResponse,
  Vendor,
} from '@cornerstone/shared';
import { INVOICE_STATUSES } from '@cornerstone/shared';
import enCommon from '../../i18n/en/common.json';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import type * as ConfigApiTypes from '../../lib/configApi.js';
import type * as InvoiceDetailPageTypes from './InvoiceDetailPage.js';

// ─── Module-scope mock functions ──────────────────────────────────────────────

const mockFetchInvoiceById = jest.fn<typeof InvoicesApiTypes.fetchInvoiceById>();
const mockUpdateInvoice = jest.fn<typeof InvoicesApiTypes.updateInvoice>();
const mockDeleteInvoice = jest.fn<typeof InvoicesApiTypes.deleteInvoice>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockConvertQuotation = jest.fn<typeof InvoicesApiTypes.convertQuotation>();
const mockGetPaperlessStatus = jest.fn<typeof PaperlessApiTypes.getPaperlessStatus>();
const mockFetchConfig = jest.fn<typeof ConfigApiTypes.fetchConfig>();

/** Mount counters for the stubbed sections (Story #2107: remount after conversion). */
let budgetLinesMounts = 0;
let linkedDocumentsMounts = 0;

/** Captures the SearchPicker onChange handler so tests can simulate vendor selection */
let capturedSearchPickerOnChange: ((id: string) => void) | null = null;

// ─── Mock: invoicesApi ─────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchInvoiceById: mockFetchInvoiceById,
  updateInvoice: mockUpdateInvoice,
  deleteInvoice: mockDeleteInvoice,
  convertQuotation: mockConvertQuotation,
  fetchInvoices: jest.fn(),
  createInvoice: jest.fn(),
  fetchAllInvoices: jest.fn(),
}));

// ─── Mock: InvoiceBudgetLinesSection stub ─────────────────────────────────────
// Stub out the section to avoid cascading dependencies in InvoiceDetailPage tests

jest.unstable_mockModule('./InvoiceBudgetLinesSection.js', () => ({
  InvoiceBudgetLinesSection: (props: {
    invoiceId: string;
    invoiceTotal: number;
    linkState?: unknown;
  }) => {
    useEffect(() => {
      budgetLinesMounts += 1;
    }, []);
    return (
      <div
        data-testid="invoice-budget-lines-section"
        data-invoice-id={props.invoiceId}
        data-invoice-total={props.invoiceTotal}
        data-link-state={JSON.stringify(props.linkState ?? null)}
      />
    );
  },
}));

// ─── Mock: LinkedDocumentsSection stub ────────────────────────────────────────

jest.unstable_mockModule('../../components/documents/LinkedDocumentsSection.js', () => ({
  LinkedDocumentsSection: (props: { entityType: string; entityId: string }) => {
    useEffect(() => {
      linkedDocumentsMounts += 1;
    }, []);
    return (
      <div
        data-testid="linked-documents-section"
        data-entity-type={props.entityType}
        data-entity-id={props.entityId}
      />
    );
  },
}));

// ─── Mocks: conversion flow integrations (Story #2107) ───────────────────────

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
}));
jest.unstable_mockModule('../../lib/configApi.js', () => ({ fetchConfig: mockFetchConfig }));

/** Stub of the Paperless picker: lets tests select a document or close it. */
jest.unstable_mockModule('../../components/invoices/InvoicePaperlessPickerModal.js', () => ({
  InvoicePaperlessPickerModal: (props: {
    onDocumentSelected: (doc: { id: number; title: string }) => void;
    onManualEntry: () => void;
    onClose: () => void;
    paperlessUrl: string | null;
  }) => (
    <div role="dialog" aria-label="Stub picker" data-testid="stub-picker">
      <span data-testid="stub-picker-url">{props.paperlessUrl}</span>
      <button
        type="button"
        data-testid="stub-picker-select"
        onClick={() => props.onDocumentSelected({ id: 7, title: 'Picked.pdf' })}
      >
        select
      </button>
      <button type="button" data-testid="stub-picker-manual" onClick={props.onManualEntry}>
        manual
      </button>
      <button type="button" data-testid="stub-picker-close" onClick={props.onClose}>
        close
      </button>
    </div>
  ),
}));

/** Stub of the deposit form modal, used for the refund sub-flow. */
jest.unstable_mockModule('./InvoiceDepositFormModal.js', () => ({
  getEmptyForm: () => ({}),
  InvoiceDepositFormModal: (props: {
    mode: string;
    lockEntryType?: boolean;
    initialValues?: Record<string, unknown>;
    invoiceAmount?: number;
    existingEntries?: Array<{ id: string }>;
    onSaved: (deposit: unknown) => void;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="Stub refund" data-testid="stub-refund">
      <span data-testid="stub-refund-props">
        {JSON.stringify({
          mode: props.mode,
          lockEntryType: props.lockEntryType,
          initialValues: props.initialValues,
          invoiceAmount: props.invoiceAmount,
          existingEntryIds: props.existingEntries?.map((e) => e.id),
        })}
      </span>
      <button type="button" data-testid="stub-refund-save" onClick={() => props.onSaved({})}>
        save
      </button>
      <button type="button" data-testid="stub-refund-close" onClick={props.onClose}>
        close
      </button>
    </div>
  ),
}));

// ─── Mock: apiClient (required by transitively imported modules) ───────────────

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

// ─── Mock: formatters (pure utility — avoids Intl issues in jsdom) ────────────

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  formatDate: (d: string) => d ?? '—',
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
  formatTime: (d: string | null | undefined) => d ?? '—',
  formatDateTime: (d: string | null | undefined) => d ?? '—',
  formatRelativeTime: (d: string) => d,
  formatPercent: (n: number) => `${n.toFixed(2)}%`,
  computeActualDuration: () => null,
  useFormatters: () => ({
    formatCurrency: (n: number) => `$${n.toFixed(2)}`,
    formatDate: (d: string | null | undefined) => d ?? '—',
    formatTime: (d: string | null | undefined) => d ?? '—',
    formatDateTime: (d: string | null | undefined) => d ?? '—',
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
  }),
}));

// ─── Mock: vendorsApi (used transitively by SearchPicker in edit modal) ────────

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendorById: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

// ─── Mock: SearchPicker (#1736) ───────────────────────────────────────────────
// The real SearchPicker requires floating-ui portal and getBoundingClientRect
// which are problematic in jsdom. Stub it with a simple element that captures
// the onChange handler so tests can simulate vendor selection.

jest.unstable_mockModule('../../components/SearchPicker/SearchPicker.js', () => ({
  SearchPicker: ({
    onChange,
    initialTitle,
    id,
  }: {
    value: string;
    onChange: (id: string) => void;
    initialTitle?: string;
    id?: string;
    [key: string]: unknown;
  }) => {
    capturedSearchPickerOnChange = onChange;
    return (
      <div data-testid={`search-picker-${id ?? 'default'}`} data-initial-title={initialTitle}>
        <span data-testid="search-picker-title">{initialTitle ?? ''}</span>
        <input
          data-testid={`search-picker-input-${id ?? 'default'}`}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  },
}));

// ─── Type import for deferred module load ─────────────────────────────────────

let InvoiceDetailPage: (typeof InvoiceDetailPageTypes)['InvoiceDetailPage'];

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const MOCK_INVOICE_ID = 'inv-001';

const mockInvoice: Invoice = {
  id: MOCK_INVOICE_ID,
  vendorId: 'vendor-1',
  vendorName: 'Acme Construction',
  budgetLines: [],
  remainingAmount: 1500.0,
  invoiceNumber: 'INV-2026-001',
  amount: 1500.0,
  date: '2026-01-15',
  dueDate: '2026-02-15',
  status: 'pending',
  notes: null,
  deposits: [],
  finalPaymentAmount: 1500.0,
  createdBy: {
    id: 'user-1',
    displayName: 'Jane Builder',
    email: 'jane@example.com',
  },
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
};

const PAPERLESS_OFF: PaperlessStatusResponse = {
  configured: false,
  reachable: false,
  error: null,
  paperlessUrl: null,
  filterTag: null,
};
const PAPERLESS_ON: PaperlessStatusResponse = {
  configured: true,
  reachable: true,
  error: null,
  paperlessUrl: 'https://paperless.example',
  filterTag: null,
};
const CONFIG_OFF: AppConfigResponse = {
  currency: 'EUR',
  vatRate: 0.19,
  autoItemizeEnabled: false,
  llmEnabled: false,
};

/** A quotation of 10,000 with a far-future due date (so the default invoice date never trips validation). */
const mockQuotation: Invoice = {
  ...mockInvoice,
  status: 'quotation',
  amount: 10000,
  remainingAmount: 10000,
  finalPaymentAmount: 10000,
  dueDate: '2099-01-01',
};

function paidDeposit(amount: number): InvoiceDeposit {
  return {
    id: 'dep-1',
    invoiceId: MOCK_INVOICE_ID,
    amount,
    dueDate: '2026-01-10',
    paidDate: '2026-01-11',
    claimedDate: null,
    description: null,
    status: 'paid',
    entryType: 'deposit',
    budgetSourceId: null,
    createdBy: null,
    createdAt: '2026-01-10T00:00:00Z',
    updatedAt: '2026-01-10T00:00:00Z',
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  mockFetchInvoiceById.mockReset();
  mockUpdateInvoice.mockReset();
  mockDeleteInvoice.mockReset();
  mockFetchVendors.mockReset();
  mockConvertQuotation.mockReset();
  mockGetPaperlessStatus.mockReset();
  mockFetchConfig.mockReset();
  budgetLinesMounts = 0;
  linkedDocumentsMounts = 0;

  // Default: Paperless and the LLM unavailable for the conversion flow
  mockGetPaperlessStatus.mockResolvedValue(PAPERLESS_OFF);
  mockFetchConfig.mockResolvedValue(CONFIG_OFF);

  // Default: successful load
  mockFetchInvoiceById.mockResolvedValue(mockInvoice);
  // Default: empty vendor list (vendor search not exercised by most tests)
  mockFetchVendors.mockResolvedValue({
    vendors: [] as Vendor[],
    pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
  });

  // Deferred import after mock registration
  const module = (await import('./InvoiceDetailPage.js')) as typeof InvoiceDetailPageTypes;
  InvoiceDetailPage = module.InvoiceDetailPage;
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderPage(id = MOCK_INVOICE_ID) {
  return render(
    <MemoryRouter initialEntries={[`/budget/invoices/${id}`]}>
      <Routes>
        <Route path="/budget/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/budget/invoices" element={<div>Invoice List Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InvoiceDetailPage', () => {
  describe('loading state', () => {
    it('renders "Loading invoice..." before fetchInvoiceById resolves', () => {
      mockFetchInvoiceById.mockImplementation(() => new Promise(() => {}));
      renderPage();
      expect(screen.getByRole('status', { name: 'Loading invoice...' })).toBeInTheDocument();
    });
  });

  describe('deposits section wiring (#2188)', () => {
    it('passes the invoice amount and the existing entries to the deposit form modal', async () => {
      mockFetchInvoiceById.mockResolvedValue({
        ...mockInvoice,
        amount: 1500,
        deposits: [paidDeposit(400)],
      });
      renderPage();
      await screen.findByTestId('invoice-budget-lines-section');

      fireEvent.click(await screen.findByRole('button', { name: /add deposit/i }));

      const props = JSON.parse((await screen.findByTestId('stub-refund-props')).textContent!) as {
        mode: string;
        invoiceAmount: number;
        existingEntryIds: string[];
      };
      expect(props.mode).toBe('add');
      expect(props.invoiceAmount).toBe(1500);
      expect(props.existingEntryIds).toEqual(['dep-1']);
    });
  });

  describe('error state', () => {
    it('renders "Invoice not found" when fetchInvoiceById rejects with 404', async () => {
      mockFetchInvoiceById.mockRejectedValue(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'Invoice not found.' }),
      );
      renderPage();

      await waitFor(() =>
        expect(
          screen.getByRole('heading', { level: 1, name: 'Invoice not found' }),
        ).toBeInTheDocument(),
      );
      expect(screen.getByText(/It may have been deleted/i)).toBeInTheDocument();
    });

    it('renders generic error message on non-404 API error', async () => {
      mockFetchInvoiceById.mockRejectedValue(
        new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Internal server error' }),
      );
      renderPage();

      // #2113: API errors are shown via the errors namespace translation, never the raw message
      await waitFor(() =>
        expect(
          screen.getByText('An unexpected error occurred. Please try again.'),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByText(/Internal server error/i)).not.toBeInTheDocument();
    });

    it('renders generic error message on network failure', async () => {
      mockFetchInvoiceById.mockRejectedValue(new Error('Network error'));
      renderPage();

      await waitFor(() => expect(screen.getByText(/Invoice not found/i)).toBeInTheDocument());
    });
  });

  describe('successful render', () => {
    it('renders page heading with the invoice number', async () => {
      renderPage();

      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /Acme Construction · INV-2026-001/i, level: 1 }),
        ).toBeInTheDocument(),
      );
    });

    it('renders the vendor name', async () => {
      renderPage();

      await waitFor(() => expect(screen.getByText('Acme Construction')).toBeInTheDocument());
    });

    it('renders the formatted amount', async () => {
      renderPage();

      // Amount 1500 formatted as currency (mock returns $1500.00)
      await waitFor(() => expect(screen.getByText('$1500.00')).toBeInTheDocument());
    });

    it('renders the status badge', async () => {
      renderPage();

      // The page renders the status badge in two places: the page header and the info list
      await waitFor(() => expect(screen.getAllByText('To pay').length).toBeGreaterThanOrEqual(1));
    });

    it('D-07: renders the header and details status badges through the shared Badge (To pay)', async () => {
      renderPage();

      await waitFor(() => expect(screen.getByTestId('invoice-status-badge')).toBeInTheDocument());
      for (const testId of ['invoice-status-badge', 'invoice-detail-status-badge']) {
        const chip = screen.getByTestId(testId);
        expect(chip).toHaveTextContent('To pay');
        expect(chip.className).toContain('badge');
        expect(chip.className).toContain('pending');
      }
    });

    it('D-07: a quotation shows "Offer" with the offer class (info pair), never a quotation class', async () => {
      mockFetchInvoiceById.mockResolvedValue({ ...mockInvoice, status: 'quotation' });
      renderPage();

      await waitFor(() => expect(screen.getByTestId('invoice-status-badge')).toBeInTheDocument());
      const chip = screen.getByTestId('invoice-status-badge');
      expect(chip).toHaveTextContent('Offer');
      expect(chip.className).toContain('offer');
      expect(chip.className).not.toContain('quotation');
    });

    it('renders the invoice number in the details list', async () => {
      renderPage();

      await waitFor(() => expect(screen.getByText('Invoice #')).toBeInTheDocument());
    });

    it('renders "Invoice Details" section heading', async () => {
      renderPage();

      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: 'Invoice Details', level: 2 }),
        ).toBeInTheDocument(),
      );
    });
  });

  describe('LinkedDocumentsSection integration', () => {
    it('renders the LinkedDocumentsSection component after loading', async () => {
      renderPage();

      await waitFor(() =>
        expect(screen.getByTestId('linked-documents-section')).toBeInTheDocument(),
      );
    });

    it('passes entityType="invoice" to LinkedDocumentsSection', async () => {
      renderPage();

      await waitFor(() => {
        const section = screen.getByTestId('linked-documents-section');
        expect(section).toHaveAttribute('data-entity-type', 'invoice');
      });
    });

    it('passes the invoice ID as entityId to LinkedDocumentsSection', async () => {
      renderPage(MOCK_INVOICE_ID);

      await waitFor(() => {
        const section = screen.getByTestId('linked-documents-section');
        expect(section).toHaveAttribute('data-entity-id', MOCK_INVOICE_ID);
      });
    });
  });

  describe('InvoiceBudgetLinesSection integration', () => {
    it('renders InvoiceBudgetLinesSection after invoice loads', async () => {
      renderPage();

      await waitFor(() =>
        expect(screen.getByTestId('invoice-budget-lines-section')).toBeInTheDocument(),
      );
    });

    it('passes the invoice ID to InvoiceBudgetLinesSection', async () => {
      renderPage(MOCK_INVOICE_ID);

      await waitFor(() => {
        const section = screen.getByTestId('invoice-budget-lines-section');
        expect(section).toHaveAttribute('data-invoice-id', MOCK_INVOICE_ID);
      });
    });

    it('passes the invoice amount as invoiceTotal to InvoiceBudgetLinesSection', async () => {
      renderPage();

      await waitFor(() => {
        const section = screen.getByTestId('invoice-budget-lines-section');
        expect(section).toHaveAttribute('data-invoice-total', '1500');
      });
    });
  });

  describe('edit modal no longer contains legacy budget pickers', () => {
    it('edit modal status select lists INVOICE_STATUSES in order with translated labels', async () => {
      renderPage();
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /Acme Construction · INV-2026-001/i, level: 1 }),
        ).toBeInTheDocument(),
      );
      screen.getByRole('button', { name: /^Edit$/i }).click();
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Edit Invoice', level: 2 })).toBeInTheDocument(),
      );

      const select = document.getElementById('edit-status') as HTMLSelectElement;

      expect(Array.from(select.options).map((o) => [o.value, o.textContent])).toEqual(
        INVOICE_STATUSES.map((status) => [status, enCommon.statusVocabulary.invoice[status]]),
      );
    });

    it('edit modal does not render a work item picker', async () => {
      renderPage();
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /Acme Construction · INV-2026-001/i, level: 1 }),
        ).toBeInTheDocument(),
      );

      // Open edit modal
      const editButton = screen.getByRole('button', { name: /^Edit$/i });
      editButton.click();

      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Edit Invoice', level: 2 })).toBeInTheDocument(),
      );

      // No work item or household item pickers in the edit modal
      expect(screen.queryByTestId('work-item-picker')).not.toBeInTheDocument();
      expect(screen.queryByTestId('household-item-picker')).not.toBeInTheDocument();
    });

    it('edit modal does not render a "— or —" separator', async () => {
      renderPage();
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /Acme Construction · INV-2026-001/i, level: 1 }),
        ).toBeInTheDocument(),
      );

      const editButton = screen.getByRole('button', { name: /^Edit$/i });
      editButton.click();

      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Edit Invoice', level: 2 })).toBeInTheDocument(),
      );

      expect(screen.queryByText('— or —')).not.toBeInTheDocument();
    });
  });

  describe('vendor SearchPicker in edit modal (#1736)', () => {
    beforeEach(() => {
      capturedSearchPickerOnChange = null;
    });

    it('edit modal renders vendor SearchPicker pre-populated with current vendor name', async () => {
      renderPage();
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /Acme Construction · INV-2026-001/i, level: 1 }),
        ).toBeInTheDocument(),
      );

      screen.getByRole('button', { name: /^Edit$/i }).click();

      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Edit Invoice', level: 2 })).toBeInTheDocument(),
      );

      const picker = screen.getByTestId('search-picker-edit-vendor');
      expect(picker).toHaveAttribute('data-initial-title', 'Acme Construction');
    });

    it('selecting a different vendor and submitting sends PATCH with new vendorId while path uses original', async () => {
      mockUpdateInvoice.mockResolvedValue({
        ...mockInvoice,
        vendorId: 'vendor-2',
        vendorName: 'Builder Co',
      });

      renderPage();
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /Acme Construction · INV-2026-001/i, level: 1 }),
        ).toBeInTheDocument(),
      );

      screen.getByRole('button', { name: /^Edit$/i }).click();

      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Edit Invoice', level: 2 })).toBeInTheDocument(),
      );

      // Simulate selecting a different vendor
      await act(async () => {
        capturedSearchPickerOnChange?.('vendor-2');
      });

      // Submit the form
      const saveButton = screen.getByRole('button', { name: /^Save Changes$/i });
      await act(async () => {
        fireEvent.click(saveButton);
      });

      await waitFor(() => expect(mockUpdateInvoice).toHaveBeenCalledTimes(1));

      const [pathVendorId, invoiceId, body] = mockUpdateInvoice.mock.calls[0] as [
        string,
        string,
        Record<string, unknown>,
      ];
      expect(pathVendorId).toBe('vendor-1');
      expect(invoiceId).toBe(MOCK_INVOICE_ID);
      expect(body.vendorId).toBe('vendor-2');
    });

    it('submitting with vendor cleared shows vendorRequired error and does not call updateInvoice', async () => {
      renderPage();
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /Acme Construction · INV-2026-001/i, level: 1 }),
        ).toBeInTheDocument(),
      );

      screen.getByRole('button', { name: /^Edit$/i }).click();

      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Edit Invoice', level: 2 })).toBeInTheDocument(),
      );

      // Clear the vendor selection
      await act(async () => {
        capturedSearchPickerOnChange?.('');
      });

      // Submit the form
      const saveButton = screen.getByRole('button', { name: /^Save Changes$/i });
      await act(async () => {
        fireEvent.click(saveButton);
      });

      await waitFor(() => expect(screen.getByText('Please select a vendor')).toBeInTheDocument());

      expect(mockUpdateInvoice).not.toHaveBeenCalled();
    });

    it('404 response from updateInvoice surfaces vendorNotFound error without navigating away', async () => {
      mockUpdateInvoice.mockRejectedValue(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'Vendor not found' }),
      );

      renderPage();
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /Acme Construction · INV-2026-001/i, level: 1 }),
        ).toBeInTheDocument(),
      );

      screen.getByRole('button', { name: /^Edit$/i }).click();

      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Edit Invoice', level: 2 })).toBeInTheDocument(),
      );

      // Submit with default pre-populated vendor (vendor-1 is valid)
      const saveButton = screen.getByRole('button', { name: /^Save Changes$/i });
      await act(async () => {
        fireEvent.click(saveButton);
      });

      await waitFor(() =>
        expect(screen.getByText('The selected vendor could not be found')).toBeInTheDocument(),
      );

      // Modal should still be open
      expect(screen.getByRole('heading', { name: 'Edit Invoice', level: 2 })).toBeInTheDocument();
    });
  });
  // ─── Story #2107: quotation-to-final-invoice conversion ─────────────────────

  describe('quotation conversion (#2107)', () => {
    async function renderQuotation(invoice: Invoice = mockQuotation) {
      mockFetchInvoiceById.mockResolvedValue(invoice);
      renderPage();
      await screen.findByTestId('invoice-budget-lines-section');
    }

    async function openConvertModal() {
      fireEvent.click(await screen.findByTestId('convert-quotation-button'));
      return screen.findByTestId('convert-quotation-form');
    }

    it('scenario 45: shows the Convert button for a quotation', async () => {
      await renderQuotation();

      const button = screen.getByTestId('convert-quotation-button');
      expect(button).toHaveTextContent('Convert to final invoice');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('scenario 45: does not show the Convert button for a pending invoice', async () => {
      await renderQuotation(mockInvoice);

      expect(screen.queryByTestId('convert-quotation-button')).not.toBeInTheDocument();
    });

    it.each(['paid', 'claimed'] as const)(
      'does not show the Convert button for a %s invoice',
      async (status) => {
        await renderQuotation({ ...mockInvoice, status });

        expect(screen.queryByTestId('convert-quotation-button')).not.toBeInTheDocument();
      },
    );

    it('scenario 45: clicking the button opens the conversion modal with the invoice values', async () => {
      await renderQuotation();

      await openConvertModal();

      const dialogs = screen.getAllByRole('dialog');
      expect(dialogs).toHaveLength(1);
      expect(screen.getByText('Convert quotation to final invoice')).toBeInTheDocument();
      expect(screen.getByTestId('convert-final-amount')).toHaveValue(10000);
      expect(screen.getByTestId('convert-invoice-number')).toHaveValue('INV-2026-001');
    });

    it('Cancel closes the modal without calling the API', async () => {
      await renderQuotation();
      await openConvertModal();

      fireEvent.click(screen.getByTestId('convert-cancel'));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockConvertQuotation).not.toHaveBeenCalled();
      expect(screen.getByTestId('convert-quotation-button')).toBeInTheDocument();
    });

    it('scenario 45: switching to the document picker shows exactly one dialog and returns to the form', async () => {
      mockGetPaperlessStatus.mockResolvedValue(PAPERLESS_ON);
      await renderQuotation();
      await openConvertModal();
      fireEvent.click(await screen.findByTestId('convert-select-document'));

      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByTestId('stub-picker')).toBeInTheDocument();
      expect(screen.queryByTestId('convert-quotation-form')).not.toBeInTheDocument();
      expect(screen.getByTestId('stub-picker-url')).toHaveTextContent('https://paperless.example');

      fireEvent.click(screen.getByTestId('stub-picker-select'));

      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.queryByTestId('stub-picker')).not.toBeInTheDocument();
      expect(screen.getByTestId('convert-selected-document')).toHaveTextContent('Picked.pdf');
      // form values survive the round trip
      expect(screen.getByTestId('convert-final-amount')).toHaveValue(10000);
    });

    it.each(['stub-picker-close', 'stub-picker-manual'])(
      'closing the picker via %s returns to the form without a document',
      async (testId) => {
        mockGetPaperlessStatus.mockResolvedValue(PAPERLESS_ON);
        await renderQuotation();
        await openConvertModal();
        fireEvent.click(await screen.findByTestId('convert-select-document'));

        fireEvent.click(screen.getByTestId(testId));

        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(screen.getByTestId('convert-quotation-form')).toBeInTheDocument();
        expect(screen.getByTestId('convert-selected-document')).toHaveTextContent(
          'No document selected',
        );
      },
    );

    it('scenario 45: switching to the refund modal shows exactly one dialog with a locked refund preset', async () => {
      await renderQuotation({ ...mockQuotation, deposits: [paidDeposit(6000)] });
      await openConvertModal();
      fireEvent.change(screen.getByTestId('convert-final-amount'), { target: { value: '5000' } });

      fireEvent.click(screen.getByTestId('convert-add-refund'));

      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.queryByTestId('convert-quotation-form')).not.toBeInTheDocument();
      const props = JSON.parse(screen.getByTestId('stub-refund-props').textContent!) as {
        mode: string;
        lockEntryType: boolean;
        initialValues: Record<string, unknown>;
      };
      expect(props.mode).toBe('add');
      expect(props.lockEntryType).toBe(true);
      expect(props.initialValues).toMatchObject({
        entryType: 'refund',
        status: 'pending',
        amount: '1000.00',
      });
    });

    it('cancelling the refund modal returns to the form and keeps the entered amount', async () => {
      await renderQuotation({ ...mockQuotation, deposits: [paidDeposit(6000)] });
      await openConvertModal();
      fireEvent.change(screen.getByTestId('convert-final-amount'), { target: { value: '5000' } });
      fireEvent.click(screen.getByTestId('convert-add-refund'));

      fireEvent.click(screen.getByTestId('stub-refund-close'));

      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByTestId('convert-final-amount')).toHaveValue(5000);
      expect(screen.getByTestId('convert-overpaid-banner')).toBeInTheDocument();
    });

    it('saving the refund silently refreshes the invoice (no page loader) and returns to the form', async () => {
      const refunded: Invoice = {
        ...mockQuotation,
        deposits: [
          paidDeposit(6000),
          { ...paidDeposit(1000), id: 'ref-1', entryType: 'refund', status: 'pending' },
        ],
      };
      mockFetchInvoiceById.mockResolvedValueOnce({
        ...mockQuotation,
        deposits: [paidDeposit(6000)],
      });
      mockFetchInvoiceById.mockResolvedValue(refunded);
      renderPage();
      await screen.findByTestId('invoice-budget-lines-section');
      await openConvertModal();
      fireEvent.change(screen.getByTestId('convert-final-amount'), { target: { value: '5000' } });
      fireEvent.click(screen.getByTestId('convert-add-refund'));
      expect(mockFetchInvoiceById).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('stub-refund-save'));

      await waitFor(() =>
        expect(screen.queryByTestId('convert-overpaid-banner')).not.toBeInTheDocument(),
      );
      expect(mockFetchInvoiceById).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('status', { name: 'Loading invoice...' })).not.toBeInTheDocument();
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByTestId('convert-final-amount')).toHaveValue(5000);
      expect(screen.getByTestId('convert-confirm')).toBeEnabled();
    });

    it('scenario 45: after a successful conversion the status shows To pay, the button is gone and the amount is updated', async () => {
      const converted: Invoice = {
        ...mockQuotation,
        status: 'pending',
        amount: 10500,
        finalPaymentAmount: 10500,
        remainingAmount: 10500,
        notes: 'Converted from quotation of $10000.00 on 2026-09-30.',
      };
      mockConvertQuotation.mockResolvedValue(converted);
      await renderQuotation();
      expect(screen.queryByText('To pay')).not.toBeInTheDocument();
      await openConvertModal();
      fireEvent.change(screen.getByTestId('convert-final-amount'), { target: { value: '10500' } });

      await act(async () => {
        fireEvent.click(screen.getByTestId('convert-confirm'));
      });

      await waitFor(() =>
        expect(screen.queryByTestId('convert-quotation-button')).not.toBeInTheDocument(),
      );
      expect(mockConvertQuotation).toHaveBeenCalledTimes(1);
      expect(mockConvertQuotation.mock.calls[0]![0]).toBe(MOCK_INVOICE_ID);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getAllByText('To pay').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('$10500.00').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Converted from quotation of/)).toBeInTheDocument();
    });

    it('remounts the budget lines and linked documents sections after conversion', async () => {
      mockConvertQuotation.mockResolvedValue({ ...mockQuotation, status: 'pending' });
      await renderQuotation();
      await waitFor(() => expect(budgetLinesMounts).toBe(1));
      expect(linkedDocumentsMounts).toBe(1);
      await openConvertModal();

      await act(async () => {
        fireEvent.click(screen.getByTestId('convert-confirm'));
      });

      await waitFor(() => expect(budgetLinesMounts).toBe(2));
      expect(linkedDocumentsMounts).toBe(2);
    });

    it('moves focus to the page heading after conversion', async () => {
      mockConvertQuotation.mockResolvedValue({ ...mockQuotation, status: 'pending' });
      await renderQuotation();
      await openConvertModal();

      await act(async () => {
        fireEvent.click(screen.getByTestId('convert-confirm'));
      });

      await waitFor(() =>
        expect(
          screen.getByRole('heading', { level: 1, name: /Acme Construction · INV-2026-001/ }),
        ).toHaveFocus(),
      );
    });

    it('a failed conversion keeps the modal open with the error and the quotation state', async () => {
      mockConvertQuotation.mockRejectedValue(
        new MockApiClientError(409, { code: 'INVOICE_NOT_QUOTATION', message: 'x' }),
      );
      mockFetchInvoiceById.mockResolvedValue(mockQuotation);
      await renderQuotation();
      await openConvertModal();

      await act(async () => {
        fireEvent.click(screen.getByTestId('convert-confirm'));
      });

      expect(
        await screen.findByText(
          'This invoice is no longer a quotation. The page has been refreshed.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByTestId('convert-quotation-form')).toBeInTheDocument();
      expect(budgetLinesMounts).toBe(1);
    });
  });

  // ─── #2108 / #2109 / #2113: translated error surfaces ───────────────────────

  describe('translated API errors (#2108, #2109, #2113)', () => {
    async function openEditAndSave() {
      renderPage();
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /Acme Construction · INV-2026-001/i, level: 1 }),
        ).toBeInTheDocument(),
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));
      });
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Edit Invoice', level: 2 })).toBeInTheDocument(),
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Save Changes$/i }));
      });
    }

    it('scenario 19: ITEMIZED_SUM_EXCEEDS_INVOICE shows amountBelowItemized with formatted itemizedTotal and keeps the modal open', async () => {
      mockUpdateInvoice.mockRejectedValue(
        new MockApiClientError(400, {
          code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
          message: 'raw server text',
          details: { invoiceTotal: 800, itemizedTotal: 900 },
        } as never),
      );

      await openEditAndSave();

      await waitFor(() =>
        expect(
          screen.getByText(
            'The amount cannot be lower than the itemized total of $900.00. Reduce the itemized budget lines first.',
          ),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByText(/raw server text/)).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Edit Invoice', level: 2 })).toBeInTheDocument();
    });

    it('scenario 20: lowering the amount below deposits is no longer special-cased; an unknown code falls back to the translateApiError humanised text and keeps the modal open', async () => {
      mockUpdateInvoice.mockRejectedValue(
        new MockApiClientError(400, {
          code: 'SOME_FUTURE_ERROR',
          message: 'raw server text',
        }),
      );

      await openEditAndSave();

      await waitFor(() => expect(screen.getByText('Some Future Error')).toBeInTheDocument());
      expect(screen.queryByText(/raw server text/)).not.toBeInTheDocument();
      expect(screen.queryByText(/net of refunds/)).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Edit Invoice', level: 2 })).toBeInTheDocument();
    });

    it('falls back to a formatted zero when the error details are missing', async () => {
      mockUpdateInvoice.mockRejectedValueOnce(
        new MockApiClientError(400, { code: 'ITEMIZED_SUM_EXCEEDS_INVOICE', message: 'raw' }),
      );
      await openEditAndSave();
      await waitFor(() =>
        expect(screen.getByText(/itemized total of \$0\.00/)).toBeInTheDocument(),
      );
    });

    it('scenario 21: VALIDATION_ERROR shows the errors-namespace translation, not the raw server message', async () => {
      mockUpdateInvoice.mockRejectedValue(
        new MockApiClientError(400, { code: 'VALIDATION_ERROR', message: 'raw server text' }),
      );

      await openEditAndSave();

      await waitFor(() =>
        expect(
          screen.getByText('The submitted data is invalid. Please check your input.'),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByText(/raw server text/)).not.toBeInTheDocument();
    });

    it('a non-API update failure shows the generic updateError message', async () => {
      mockUpdateInvoice.mockRejectedValue(new Error('boom'));

      await openEditAndSave();

      await waitFor(() =>
        expect(screen.getByText('Failed to update invoice. Please try again.')).toBeInTheDocument(),
      );
    });

    it('scenario 22: a delete failure shows the translated error, not the raw server message', async () => {
      mockDeleteInvoice.mockRejectedValue(
        new MockApiClientError(409, { code: 'CONFLICT', message: 'raw server text' }),
      );
      renderPage();
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /Acme Construction · INV-2026-001/i, level: 1 }),
        ).toBeInTheDocument(),
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));
      });
      const confirm = await screen.findByRole('button', { name: 'Delete Invoice' });
      await act(async () => {
        fireEvent.click(confirm);
      });

      await waitFor(() =>
        expect(
          screen.getByText('A conflict occurred. The resource may already exist.'),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByText(/raw server text/)).not.toBeInTheDocument();
    });

    it('a non-API delete failure shows the generic deleteError message', async () => {
      mockDeleteInvoice.mockRejectedValue(new Error('boom'));
      renderPage();
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /Acme Construction · INV-2026-001/i, level: 1 }),
        ).toBeInTheDocument(),
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));
      });
      await act(async () => {
        fireEvent.click(await screen.findByRole('button', { name: 'Delete Invoice' }));
      });

      await waitFor(() =>
        expect(screen.getByText('Failed to delete invoice. Please try again.')).toBeInTheDocument(),
      );
    });
  });
  describe('page identity (#2203)', () => {
    function renderRouted(
      entry: string | { url: string; state?: unknown } = '/budget/invoices/inv-001',
    ) {
      const log = createRouterLog();
      render(
        <RecordingRouter entries={[entry]} log={log}>
          <Routes>
            <Route path="/budget/invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="*" element={<div>Elsewhere</div>} />
          </Routes>
        </RecordingRouter>,
      );
      return log;
    }

    function trail(): string[] {
      const nav = screen.getByRole('navigation', { name: 'You are here' });
      return within(nav)
        .getAllByRole('link')
        .map((a) => (a.textContent ?? '').replace('‹', ''));
    }

    it('loading: one "Invoice" h1, the Money > Invoices trail and the matching tab title', () => {
      document.title = 'initial';
      mockFetchInvoiceById.mockImplementation(() => new Promise(() => {}));
      renderRouted();

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1, name: 'Invoice' })).toBeInTheDocument();
      expect(trail()).toEqual(['Money', 'Invoices']);
      expect(document.title).toBe('Invoice · Money · Cornerstone');
    });

    it('not found: "Invoice not found" is the only h1, with the trail and tab title', async () => {
      mockFetchInvoiceById.mockRejectedValue(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'Invoice not found.' }),
      );
      renderRouted();

      await screen.findByRole('heading', { level: 1, name: 'Invoice not found' });
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(trail()).toEqual(['Money', 'Invoices']);
      await waitFor(() => expect(document.title).toBe('Invoice not found · Money · Cornerstone'));
    });

    it('server error: "Invoice" h1 plus the card h2 "Error"', async () => {
      mockFetchInvoiceById.mockRejectedValue(
        new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      renderRouted();

      await screen.findByRole('heading', { level: 2, name: 'Error' });
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1, name: 'Invoice' })).toBeInTheDocument();
      expect(trail()).toEqual(['Money', 'Invoices']);
    });

    it('loaded: the h1 and tab title are company and number, with no "Back to Invoices"', async () => {
      renderRouted();

      await screen.findByRole('heading', { level: 1, name: 'Acme Construction · INV-2026-001' });
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      await waitFor(() =>
        expect(document.title).toBe('Acme Construction · INV-2026-001 · Money · Cornerstone'),
      );
      expect(trail()).toEqual(['Money', 'Invoices']);
      expect(screen.queryByText(/back to invoices/i)).toBeNull();
      expect(screen.queryByTestId('breadcrumbs-back')).toBeNull();
    });

    it('loaded offer without a number: company and "Offer"', async () => {
      mockFetchInvoiceById.mockResolvedValue({
        ...mockQuotation,
        invoiceNumber: null,
      });
      renderRouted();

      await screen.findByRole('heading', { level: 1, name: 'Acme Construction · Offer' });
    });

    it('offers Back to the company the invoice was opened from', async () => {
      renderRouted({
        url: '/budget/invoices/inv-001',
        state: { origin: { to: '/settings/vendors/vendor-1', name: 'Acme Construction' } },
      });

      const back = await screen.findByTestId('breadcrumbs-back');
      expect(back).toHaveTextContent('Back to Acme Construction');
      expect(back).toHaveAttribute('href', '/settings/vendors/vendor-1');
    });

    it('the error action "Back to Invoices" navigates to the Invoices list', async () => {
      mockFetchInvoiceById.mockRejectedValue(
        new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
      );
      const log = renderRouted();

      fireEvent.click(await screen.findByRole('button', { name: 'Back to Invoices' }));

      expect(log.actions).toEqual(['PUSH /budget/invoices']);
      expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
    });

    it('deleting the invoice replaces the history entry with the Invoices list', async () => {
      mockDeleteInvoice.mockResolvedValue(undefined);
      const log = renderRouted();
      await screen.findByRole('heading', { level: 1, name: 'Acme Construction · INV-2026-001' });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));
      });
      await act(async () => {
        fireEvent.click(await screen.findByRole('button', { name: 'Delete Invoice' }));
      });

      await waitFor(() => expect(log.actions).toEqual(['REPLACE /budget/invoices']));
      expect(log.entries).toEqual(['/budget/invoices']);
    });

    it('does not navigate on mount', async () => {
      const log = renderRouted();

      await screen.findByRole('heading', { level: 1, name: 'Acme Construction · INV-2026-001' });
      expect(log.actions).toEqual([]);
      expect(log.entries).toEqual(['/budget/invoices/inv-001']);
    });

    it('the company link and the budget lines carry this invoice as origin', async () => {
      render(
        <MemoryRouter initialEntries={['/budget/invoices/inv-001']}>
          <Routes>
            <Route path="/budget/invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="*" element={<div>Elsewhere</div>} />
          </Routes>
          <OriginProbe />
        </MemoryRouter>,
      );
      await screen.findByRole('heading', { level: 1, name: 'Acme Construction · INV-2026-001' });

      const lines = screen.getByTestId('invoice-budget-lines-section');
      expect(JSON.parse(lines.getAttribute('data-link-state') ?? 'null')).toEqual({
        origin: { to: '/budget/invoices/inv-001', name: 'Acme Construction · INV-2026-001' },
      });

      fireEvent.click(screen.getByRole('link', { name: 'Acme Construction' }));

      await screen.findByText('Elsewhere');
      expect(probedOrigin()).toEqual({
        to: '/budget/invoices/inv-001',
        name: 'Acme Construction · INV-2026-001',
      });
    });
  });
});
