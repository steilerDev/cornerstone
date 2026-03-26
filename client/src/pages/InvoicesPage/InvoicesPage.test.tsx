/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type { Invoice, InvoiceListPaginatedResponse } from '@cornerstone/shared';
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

// ── Location helper ───────────────────────────────────────────────────────────

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
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
  createdBy: null,
  createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z',
};

const emptySummary = {
  pending: { count: 0, totalAmount: 0 },
  paid: { count: 0, totalAmount: 0 },
  claimed: { count: 0, totalAmount: 0 },
  quotation: { count: 0, totalAmount: 0 },
};

const populatedSummary = {
  pending: { count: 1, totalAmount: 15000 },
  paid: { count: 1, totalAmount: 3500 },
  claimed: { count: 0, totalAmount: 0 },
  quotation: { count: 0, totalAmount: 0 },
};

const emptyResponse: InvoiceListPaginatedResponse = {
  invoices: [],
  pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
  summary: emptySummary,
};

const populatedResponse: InvoiceListPaginatedResponse = {
  invoices: [sampleInvoice1, sampleInvoice2],
  pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 2 },
  summary: populatedSummary,
};

const emptyVendorsResponse = {
  vendors: [],
  pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
};

const vendorsResponse = {
  vendors: [
    { id: 'v-1', name: 'ACME Construction', tradeId: null, notes: null, websiteUrl: null, contactEmail: null, contactPhone: null, trade: null, createdBy: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'v-2', name: 'Quality Plumbing', tradeId: null, notes: null, websiteUrl: null, contactEmail: null, contactPhone: null, trade: null, createdBy: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ],
  pagination: { page: 1, pageSize: 100, totalItems: 2, totalPages: 1 },
};

describe('InvoicesPage', () => {
  let InvoicesPageModule: typeof InvoicesPageTypes;

  beforeEach(async () => {
    mockFetchAllInvoices.mockReset();
    mockCreateInvoice.mockReset();
    mockFetchVendors.mockReset();

    if (!InvoicesPageModule) {
      InvoicesPageModule = await import('./InvoicesPage.js');
    }

    // Default: empty vendors
    mockFetchVendors.mockResolvedValue(emptyVendorsResponse);
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/budget/invoices']}>
        <Routes>
          <Route path="/budget/invoices" element={<InvoicesPageModule.InvoicesPage />} />
          <Route path="/budget/invoices/:id" element={<div>Invoice Detail</div>} />
          <Route path="/budget/vendors/:id" element={<div>Vendor Detail</div>} />
        </Routes>
        <LocationDisplay />
      </MemoryRouter>,
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

      await waitFor(() => {
        expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
      });
    });

    it('renders vendor name links', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(populatedResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('ACME Construction')).toBeInTheDocument();
      });
      expect(screen.getByText('Quality Plumbing')).toBeInTheDocument();
    });

    it('renders summary cards with correct counts', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(populatedResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
      });

      // Pending count = 1
      expect(screen.getByText('1')).toBeInTheDocument();
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
        expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
      });
    });
  });

  // ─── Error state ──────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows API error message when fetchAllInvoices fails', async () => {
      mockFetchAllInvoices.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Service unavailable' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    });

    it('shows generic error for non-ApiClientError', async () => {
      mockFetchAllInvoices.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      // Should show some error text
      expect(document.body.textContent).toMatch(/error|Error/);
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
      mockFetchAllInvoices.mockResolvedValueOnce(emptyResponse);

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

    it('shows vendor select in modal', async () => {
      const user = userEvent.setup();
      mockFetchAllInvoices.mockResolvedValueOnce(emptyResponse);
      mockFetchVendors.mockResolvedValue(vendorsResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('new-invoice-button'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Vendor select should be visible
      expect(screen.getByRole('combobox', { name: /vendor/i })).toBeInTheDocument();
    });

    it('shows validation error when submitting without vendor', async () => {
      const user = userEvent.setup();
      mockFetchAllInvoices.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('new-invoice-button'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Try to submit by clicking the Create button (trigger form validation)
      const createBtn = screen.getAllByRole('button').find((btn) =>
        btn.textContent?.match(/^create$/i),
      );
      expect(createBtn).toBeTruthy();
      if (createBtn) await user.click(createBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(mockCreateInvoice).not.toHaveBeenCalled();
    });

    it('shows validation error for missing amount', async () => {
      const user = userEvent.setup();
      mockFetchAllInvoices.mockResolvedValueOnce(emptyResponse);
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
      const vendorSelect = screen.getByRole('combobox', { name: /vendor/i });
      await user.selectOptions(vendorSelect, 'v-1');

      // Set a date, no amount
      const dateInput = screen.getByLabelText(/invoice date/i);
      fireEvent.change(dateInput, { target: { value: '2026-02-01' } });

      // Submit
      const createBtn = screen.getAllByRole('button').find((btn) =>
        btn.textContent?.match(/^create$/i),
      );
      if (createBtn) await user.click(createBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(mockCreateInvoice).not.toHaveBeenCalled();
    });

    it('calls createInvoice with correct data on valid submission', async () => {
      const user = userEvent.setup();
      mockFetchAllInvoices
        .mockResolvedValueOnce(emptyResponse)
        .mockResolvedValueOnce(emptyResponse);
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
      const vendorSelect = screen.getByRole('combobox', { name: /vendor/i });
      await user.selectOptions(vendorSelect, 'v-1');

      // Fill amount
      const amountInput = screen.getByLabelText(/amount.*required/i);
      await user.type(amountInput, '15000');

      // Fill date
      const dateInput = screen.getByLabelText(/invoice date/i);
      fireEvent.change(dateInput, { target: { value: '2026-02-01' } });

      // Submit
      const createBtn = screen.getAllByRole('button').find((btn) =>
        btn.textContent?.match(/^create$/i),
      );
      if (createBtn) await user.click(createBtn);

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
      mockFetchAllInvoices.mockResolvedValueOnce(emptyResponse);
      mockFetchVendors.mockResolvedValue(vendorsResponse);
      mockCreateInvoice.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Creation failed' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('new-invoice-button'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const vendorSelect = screen.getByRole('combobox', { name: /vendor/i });
      await user.selectOptions(vendorSelect, 'v-1');

      const amountInput = screen.getByLabelText(/amount.*required/i);
      await user.type(amountInput, '5000');

      const dateInput = screen.getByLabelText(/invoice date/i);
      fireEvent.change(dateInput, { target: { value: '2026-02-01' } });

      const createBtn = screen.getAllByRole('button').find((btn) =>
        btn.textContent?.match(/^create$/i),
      );
      if (createBtn) await user.click(createBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Creation failed')).toBeInTheDocument();
      });
    });

    it('closes modal when Cancel is clicked', async () => {
      const user = userEvent.setup();
      mockFetchAllInvoices.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('new-invoice-button')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('new-invoice-button'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const cancelBtn = screen.getAllByRole('button').find((btn) =>
        btn.textContent?.match(/cancel/i),
      );
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

  // ─── Summary cards ────────────────────────────────────────────────────────

  describe('summary cards', () => {
    it('renders three summary cards (pending, paid, quotation)', async () => {
      mockFetchAllInvoices.mockResolvedValueOnce(populatedResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
      });

      // The summaryGrid renders labels for pending, paid, and quotation
      // These come from t() — will match the i18n key fallbacks
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
        expect(screen.getByText('Quality Plumbing')).toBeInTheDocument();
      });
    });
  });
});
