/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Invoice } from '@cornerstone/shared';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as InvoiceDetailPageTypes from './InvoiceDetailPage.js';

// ─── Module-scope mock functions ──────────────────────────────────────────────

const mockFetchInvoiceById = jest.fn<typeof InvoicesApiTypes.fetchInvoiceById>();
const mockUpdateInvoice = jest.fn<typeof InvoicesApiTypes.updateInvoice>();
const mockDeleteInvoice = jest.fn<typeof InvoicesApiTypes.deleteInvoice>();

// ─── Mock: invoicesApi ─────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchInvoiceById: mockFetchInvoiceById,
  updateInvoice: mockUpdateInvoice,
  deleteInvoice: mockDeleteInvoice,
  fetchInvoices: jest.fn(),
  createInvoice: jest.fn(),
  fetchAllInvoices: jest.fn(),
}));

// ─── Mock: InvoiceBudgetLinesSection stub ─────────────────────────────────────
// Stub out the section to avoid cascading dependencies in InvoiceDetailPage tests

jest.unstable_mockModule('./InvoiceBudgetLinesSection.js', () => ({
  InvoiceBudgetLinesSection: (props: { invoiceId: string; invoiceTotal: number }) => (
    <div
      data-testid="invoice-budget-lines-section"
      data-invoice-id={props.invoiceId}
      data-invoice-total={props.invoiceTotal}
    />
  ),
}));

// ─── Mock: LinkedDocumentsSection stub ────────────────────────────────────────

jest.unstable_mockModule('../../components/documents/LinkedDocumentsSection.js', () => ({
  LinkedDocumentsSection: (props: { entityType: string; entityId: string }) => (
    <div
      data-testid="linked-documents-section"
      data-entity-type={props.entityType}
      data-entity-id={props.entityId}
    />
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
  formatDate: (d: string) => d,
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
  formatRelativeTime: (d: string) => d,
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
  createdBy: {
    id: 'user-1',
    displayName: 'Jane Builder',
    email: 'jane@example.com',
  },
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  mockFetchInvoiceById.mockReset();
  mockUpdateInvoice.mockReset();
  mockDeleteInvoice.mockReset();

  // Default: successful load
  mockFetchInvoiceById.mockResolvedValue(mockInvoice);

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
      expect(screen.getByText('Loading invoice...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('renders "Invoice not found" when fetchInvoiceById rejects with 404', async () => {
      mockFetchInvoiceById.mockRejectedValue(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'Invoice not found.' }),
      );
      renderPage();

      await waitFor(() => expect(screen.getByText(/Invoice not found/i)).toBeInTheDocument());
    });

    it('renders generic error message on non-404 API error', async () => {
      mockFetchInvoiceById.mockRejectedValue(
        new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Internal server error' }),
      );
      renderPage();

      await waitFor(() => expect(screen.getByText(/Internal server error/i)).toBeInTheDocument());
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
          screen.getByRole('heading', { name: /#INV-2026-001/i, level: 1 }),
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
      await waitFor(() => expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1));
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
    it('edit modal does not render a work item picker', async () => {
      renderPage();
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /#INV-2026-001/i, level: 1 }),
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
          screen.getByRole('heading', { name: /#INV-2026-001/i, level: 1 }),
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
});
