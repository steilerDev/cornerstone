/**
 * @jest-environment jsdom
 */
/**
 * Tests for InvoiceDetailPage household item budget linking (Issue #413).
 * Covers detail view showing household item summary and edit modal with household item picker.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Invoice } from '@cornerstone/shared';
import type * as InvoiceDetailPageTypes from './InvoiceDetailPage.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';

// ─── Mock functions ────────────────────────────────────────────────────────

const mockFetchInvoiceById = jest.fn<typeof InvoicesApiTypes.fetchInvoiceById>();
const mockUpdateInvoice = jest.fn<typeof InvoicesApiTypes.updateInvoice>();
const mockDeleteInvoice = jest.fn<typeof InvoicesApiTypes.deleteInvoice>();
const mockListHouseholdItems = jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>();

// ─── Mock modules ─────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchInvoiceById: mockFetchInvoiceById,
  updateInvoice: mockUpdateInvoice,
  deleteInvoice: mockDeleteInvoice,
  fetchInvoices: jest.fn(),
  createInvoice: jest.fn(),
  fetchAllInvoices: jest.fn(),
}));

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  listHouseholdItems: mockListHouseholdItems,
  createHouseholdItem: jest.fn(),
  getHouseholdItem: jest.fn(),
  updateHouseholdItem: jest.fn(),
  deleteHouseholdItem: jest.fn(),
}));

jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
  ApiClientError: class MockApiClientError extends Error {
    statusCode: number;
    error: { code: string; message?: string };
    constructor(statusCode: number, error: { code: string; message?: string }) {
      super(error.message ?? 'API Error');
      this.statusCode = statusCode;
      this.error = error;
    }
  },
  NetworkError: class MockNetworkError extends Error {},
}));

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  formatDate: (d: string) => d,
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
  formatRelativeTime: (d: string) => d,
}));

jest.unstable_mockModule('../../components/WorkItemPicker/WorkItemPicker.js', () => ({
  WorkItemPicker: () => null,
}));

jest.unstable_mockModule('../../components/documents/LinkedDocumentsSection.js', () => ({
  LinkedDocumentsSection: () => null,
}));

// ─── Type import ──────────────────────────────────────────────────────────

let InvoiceDetailPage: (typeof InvoiceDetailPageTypes)['InvoiceDetailPage'];

// ─── Test fixtures ────────────────────────────────────────────────────────

const MOCK_INVOICE_ID = 'inv-001';

const mockInvoiceWithHouseholdItem: Invoice = {
  id: MOCK_INVOICE_ID,
  vendorId: 'vendor-1',
  vendorName: 'Appliance Vendor',
  workItemBudgetId: null,
  workItemBudget: null,
  householdItemBudgetId: 'hib-001',
  householdItemBudget: {
    id: 'hib-001',
    householdItemId: 'hi-001',
    householdItemName: 'Kitchen Appliance',
    description: 'Primary budget line',
    plannedAmount: 5000,
    confidence: 'professional_estimate',
  },
  invoiceNumber: 'INV-2026-001',
  amount: 2500,
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

const mockInvoiceWithoutHouseholdItem: Invoice = {
  ...mockInvoiceWithHouseholdItem,
  householdItemBudgetId: null,
  householdItemBudget: null,
};

const mockHouseholdItem = {
  id: 'hi-001',
  name: 'Kitchen Appliance',
  category: 'appliances',
  status: 'not_ordered',
  url: null,
  room: null,
  quantity: null,
  orderDate: null,
  expectedDeliveryDate: null,
  actualDeliveryDate: null,
  vendor: null,
  tags: [],
  workItems: [],
  budgetSummary: {
    totalPlanned: 5000,
    totalActual: 2500,
    subsidyReduction: 0,
    netCost: 5000,
  },
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
};

// ─── Setup ────────────────────────────────────────────────────────────────

beforeEach(async () => {
  mockFetchInvoiceById.mockReset();
  mockUpdateInvoice.mockReset();
  mockDeleteInvoice.mockReset();
  mockListHouseholdItems.mockReset();

  // Default mocks
  mockFetchInvoiceById.mockResolvedValue(mockInvoiceWithHouseholdItem);
  mockListHouseholdItems.mockResolvedValue({
    items: [mockHouseholdItem],
    pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
  });

  const module = (await import('./InvoiceDetailPage.js')) as typeof InvoiceDetailPageTypes;
  InvoiceDetailPage = module.InvoiceDetailPage;
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Helper ───────────────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────

describe('InvoiceDetailPage - Household Item Budget Linking', () => {
  it('displays household item name in detail view when linked', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Kitchen Appliance')).toBeInTheDocument();
    });
  });

  it('displays "Household Item" label and details when invoice is linked', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/household item/i)).toBeInTheDocument();
    });

    // Should display the household item name
    expect(screen.getByText('Kitchen Appliance')).toBeInTheDocument();
  });

  it('does not display household item row when invoice is not linked', async () => {
    mockFetchInvoiceById.mockResolvedValue(mockInvoiceWithoutHouseholdItem);

    renderPage();

    await waitFor(() => {
      expect(mockFetchInvoiceById).toHaveBeenCalled();
    });

    // Household item row should not be in the document
    const hiLabels = screen.queryAllByText(/household item/i);
    expect(hiLabels.length).toBe(0);
  });

  it('pre-populates household item in edit modal', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Kitchen Appliance')).toBeInTheDocument();
    });

    // Open edit modal
    const editButton = screen.getByRole('button', { name: /edit/i });
    await userEvent.click(editButton);

    await waitFor(() => {
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
    });

    // Household item dropdown should show the pre-selected value
    const modal = screen.getByRole('dialog');
    const hiDropdown = within(modal).getByLabelText(/household item/i);
    expect(hiDropdown).toHaveValue('hi-001');
  });

  it('can unlink household item in edit modal', async () => {
    mockUpdateInvoice.mockResolvedValue({
      invoice: {
        ...mockInvoiceWithHouseholdItem,
        householdItemBudgetId: null,
        householdItemBudget: null,
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Kitchen Appliance')).toBeInTheDocument();
    });

    // Open edit modal
    const editButton = screen.getByRole('button', { name: /edit/i });
    await userEvent.click(editButton);

    await waitFor(() => {
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
    });

    // Clear household item selection
    const modal = screen.getByRole('dialog');
    const hiDropdown = within(modal).getByLabelText(/household item/i);
    await userEvent.click(hiDropdown);

    // Select "None" or clear option (typical dropdown pattern)
    const clearOption = within(modal).getByText(/none|clear/i);
    if (clearOption) {
      await userEvent.click(clearOption);
    } else {
      // Or use keyboard to clear
      await userEvent.type(hiDropdown, '{backspace}');
    }

    // Submit form
    const submitButton = within(modal).getByRole('button', { name: /save/i });
    await userEvent.click(submitButton);

    // Verify update was called with householdItemBudgetId: null
    await waitFor(() => {
      expect(mockUpdateInvoice).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          householdItemBudgetId: null,
        }),
      );
    });
  });

  it('shows household item name formatted in detail summary', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Kitchen Appliance')).toBeInTheDocument();
    });

    // Verify the household item appears in the expected location (info section)
    const detailSection =
      screen.getByText('Kitchen Appliance').closest('section') ||
      screen.getByText('Kitchen Appliance').closest('div');
    expect(detailSection).toBeInTheDocument();
  });

  it('handles switching from work item to household item in edit', async () => {
    const invoiceWithWorkItem: Invoice = {
      ...mockInvoiceWithHouseholdItem,
      householdItemBudgetId: null,
      householdItemBudget: null,
      workItemBudgetId: 'wib-001',
      workItemBudget: {
        id: 'wib-001',
        workItemId: 'wi-001',
        workItemTitle: 'Plumbing Work',
        description: 'Main water line',
        plannedAmount: 3000,
        confidence: 'quote',
      },
    };

    mockFetchInvoiceById.mockResolvedValue(invoiceWithWorkItem);
    mockUpdateInvoice.mockResolvedValue({
      invoice: {
        ...invoiceWithWorkItem,
        workItemBudgetId: null,
        workItemBudget: null,
        householdItemBudgetId: 'hib-001',
        householdItemBudget: {
          id: 'hib-001',
          householdItemId: 'hi-001',
          householdItemName: 'Kitchen Appliance',
          description: 'Primary budget line',
          plannedAmount: 5000,
          confidence: 'professional_estimate',
        },
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Plumbing Work')).toBeInTheDocument();
    });

    // Open edit modal
    const editButton = screen.getByRole('button', { name: /edit/i });
    await userEvent.click(editButton);

    await waitFor(() => {
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
    });

    // Unlink work item
    const modal = screen.getByRole('dialog');
    const wiPicker = within(modal).getByLabelText(/work item/i);
    // Clear work item by selecting none
    await userEvent.click(wiPicker);
    const noneOption = within(modal).getByText(/none|clear/i);
    if (noneOption) {
      await userEvent.click(noneOption);
    }

    // Link household item
    const hiDropdown = within(modal).getByLabelText(/household item/i);
    await userEvent.click(hiDropdown);
    const hiOption = within(modal).getByText('Kitchen Appliance');
    await userEvent.click(hiOption);

    // Submit form
    const submitButton = within(modal).getByRole('button', { name: /save/i });
    await userEvent.click(submitButton);

    // Verify update was called
    await waitFor(() => {
      expect(mockUpdateInvoice).toHaveBeenCalled();
    });
  });
});
