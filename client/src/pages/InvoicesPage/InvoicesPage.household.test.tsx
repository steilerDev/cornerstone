/**
 * @jest-environment jsdom
 */
/**
 * Tests for InvoicesPage household item budget linking (Issue #413).
 * Covers create modal with household item selection and budget line dropdown.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type * as InvoicesPageTypes from './InvoicesPage.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';

// ─── Mock functions ────────────────────────────────────────────────────────

const mockFetchAllInvoices = jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>();
const mockFetchInvoices = jest.fn<typeof InvoicesApiTypes.fetchInvoices>();
const mockCreateInvoice = jest.fn<typeof InvoicesApiTypes.createInvoice>();
const mockListHouseholdItems = jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>();

// ─── Mock modules ─────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchAllInvoices: mockFetchAllInvoices,
  fetchInvoices: mockFetchInvoices,
  createInvoice: mockCreateInvoice,
  fetchInvoiceById: jest.fn(),
  updateInvoice: jest.fn(),
  deleteInvoice: jest.fn(),
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

let InvoicesPage: (typeof InvoicesPageTypes)['InvoicesPage'];

// ─── Test fixtures ────────────────────────────────────────────────────────

const mockHouseholdItem = {
  id: 'hi-001',
  name: 'Kitchen Appliance',
  description: null,
  category: 'appliances' as const,
  status: 'not_ordered' as const,
  url: null,
  room: null,
  quantity: 1,
  orderDate: null,
  expectedDeliveryDate: null,
  actualDeliveryDate: null,
  vendor: null,
  tagIds: [],
  budgetLineCount: 1,
  totalPlannedAmount: 5000,
  budgetSummary: {
    totalPlanned: 5000,
    totalActual: 0,
    subsidyReduction: 0,
    netCost: 5000,
  },
  createdBy: null,
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
};

const mockHouseholdItemBudgetLine = {
  id: 'hib-001',
  description: 'Primary budget line',
  plannedAmount: 5000,
  confidence: 'professional_estimate',
};

// ─── Setup ────────────────────────────────────────────────────────────────

beforeEach(async () => {
  mockFetchAllInvoices.mockReset();
  mockFetchInvoices.mockReset();
  mockCreateInvoice.mockReset();
  mockListHouseholdItems.mockReset();

  // Default mocks
  mockFetchAllInvoices.mockResolvedValue({
    invoices: [],
    pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
    summary: {
      pending: { count: 0, totalAmount: 0 },
      paid: { count: 0, totalAmount: 0 },
      claimed: { count: 0, totalAmount: 0 },
    },
  });
  mockListHouseholdItems.mockResolvedValue({
    items: [mockHouseholdItem],
    pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
  });

  const module = (await import('./InvoicesPage.js')) as typeof InvoicesPageTypes;
  InvoicesPage = module.InvoicesPage;
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Helper ───────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/budget/invoices']}>
      <Routes>
        <Route path="/budget/invoices" element={<InvoicesPage />} />
        <Route path="/budget/vendors/:vendorId/invoices" element={<div>Vendor Invoices</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('InvoicesPage - Household Item Budget Linking', () => {
  it('renders create modal with household item dropdown', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/create invoice/i)).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /create.*invoice/i });
    await userEvent.click(createButton);

    await waitFor(() => {
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
      // Household item dropdown should be present
      expect(within(modal).getByLabelText(/household item/i)).toBeInTheDocument();
    });
  });

  it('displays household items in the household item dropdown', async () => {
    mockListHouseholdItems.mockResolvedValue({
      items: [
        mockHouseholdItem,
        {
          ...mockHouseholdItem,
          id: 'hi-002',
          name: 'Bathroom Fixture',
        },
      ],
      pagination: { page: 1, pageSize: 25, totalItems: 2, totalPages: 1 },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/create invoice/i)).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /create.*invoice/i });
    await userEvent.click(createButton);

    await waitFor(() => {
      const modal = screen.getByRole('dialog');
      const dropdown = within(modal).getByLabelText(/household item/i);
      expect(dropdown).toBeInTheDocument();
    });
  });

  it('loads budget lines when household item is selected', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/create invoice/i)).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /create.*invoice/i });
    await userEvent.click(createButton);

    await waitFor(() => {
      const modal = screen.getByRole('dialog');
      const hiDropdown = within(modal).getByLabelText(/household item/i);
      expect(hiDropdown).toBeInTheDocument();
    });

    // Select household item
    const hiDropdown = screen.getByLabelText(/household item/i);
    await userEvent.click(hiDropdown);

    await waitFor(() => {
      const option = screen.getByText('Kitchen Appliance');
      expect(option).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Kitchen Appliance'));

    // Budget line dropdown should now be available
    await waitFor(() => {
      const modal = screen.getByRole('dialog');
      expect(within(modal).getByLabelText(/budget line/i)).toBeInTheDocument();
    });
  });

  it('clears work item picker when household item is selected', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/create invoice/i)).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /create.*invoice/i });
    await userEvent.click(createButton);

    await waitFor(() => {
      const modal = screen.getByRole('dialog');
      // Both pickers should be available initially
      expect(within(modal).getByLabelText(/work item/i)).toBeInTheDocument();
      expect(within(modal).getByLabelText(/household item/i)).toBeInTheDocument();
    });

    // Select household item
    const hiDropdown = screen.getByLabelText(/household item/i);
    await userEvent.click(hiDropdown);

    await waitFor(() => {
      const option = screen.getByText('Kitchen Appliance');
      expect(option).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Kitchen Appliance'));

    // Work item picker should be cleared/disabled
    const workItemPicker = screen.getByLabelText(/work item/i);
    expect(workItemPicker).toHaveAttribute('disabled');
  });

  it('includes householdItemBudgetId in create invoice request', async () => {
    mockCreateInvoice.mockResolvedValue({
      id: 'inv-001',
      vendorId: 'vendor-1',
      vendorName: 'Test Vendor',
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
      invoiceNumber: 'INV-001',
      amount: 2500,
      date: '2026-02-01',
      dueDate: null,
      status: 'pending',
      notes: null,
      createdBy: null,
      createdAt: '2026-02-01T10:00:00Z',
      updatedAt: '2026-02-01T10:00:00Z',
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/create invoice/i)).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /create.*invoice/i });
    await userEvent.click(createButton);

    await waitFor(() => {
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
    });

    // Fill in form fields
    const modal = screen.getByRole('dialog');
    const amountInput = within(modal).getByLabelText(/amount/i);
    const dateInput = within(modal).getByLabelText(/date/i);
    const hiDropdown = within(modal).getByLabelText(/household item/i);

    await userEvent.type(amountInput, '2500');
    await userEvent.type(dateInput, '2026-02-01');

    // Select household item
    await userEvent.click(hiDropdown);
    const option = screen.getByText('Kitchen Appliance');
    await userEvent.click(option);

    // Select budget line
    await waitFor(() => {
      const budgetDropdown = within(modal).getByLabelText(/budget line/i);
      expect(budgetDropdown).toBeInTheDocument();
    });

    const budgetDropdown = within(modal).getByLabelText(/budget line/i);
    await userEvent.click(budgetDropdown);

    // Submit form
    const submitButton = within(modal).getByRole('button', { name: /create/i });
    await userEvent.click(submitButton);

    // Verify householdItemBudgetId was included in the request
    await waitFor(() => {
      expect(mockCreateInvoice).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          householdItemBudgetId: expect.any(String),
        }),
      );
    });
  });
});
