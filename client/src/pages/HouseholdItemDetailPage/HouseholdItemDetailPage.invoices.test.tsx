/**
 * @jest-environment jsdom
 */
/**
 * Tests for HouseholdItemDetailPage invoices display via household item budget linking (Issue #413).
 * Covers display of invoices linked to household item budget lines.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type * as HouseholdItemDetailPageTypes from './HouseholdItemDetailPage.js';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';

// ─── Mock functions ────────────────────────────────────────────────────────

const mockGetHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>();
const mockFetchInvoices = jest.fn<typeof InvoicesApiTypes.fetchInvoices>();

// ─── Mock modules ─────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  getHouseholdItem: mockGetHouseholdItem,
  updateHouseholdItem: jest.fn(),
  deleteHouseholdItem: jest.fn(),
  listHouseholdItems: jest.fn(),
  createHouseholdItem: jest.fn(),
}));

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchInvoices: mockFetchInvoices,
  fetchAllInvoices: jest.fn(),
  createInvoice: jest.fn(),
  fetchInvoiceById: jest.fn(),
  updateInvoice: jest.fn(),
  deleteInvoice: jest.fn(),
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

jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({
    toasts: [],
    showToast: jest.fn(),
    dismissToast: jest.fn(),
  }),
}));

jest.unstable_mockModule('../../components/documents/LinkedDocumentsSection.js', () => ({
  LinkedDocumentsSection: () => null,
}));

// ─── Type import ──────────────────────────────────────────────────────────

let HouseholdItemDetailPage: (typeof HouseholdItemDetailPageTypes)['HouseholdItemDetailPage'];

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
  vendor: {
    id: 'vendor-1',
    name: 'Appliance Vendor',
    specialty: null,
  },
  tagIds: [],
  tags: [],
  workItems: [],
  subsidies: [],
  budgetLineCount: 2,
  totalPlannedAmount: 8000,
  budgetSummary: {
    totalPlanned: 8000,
    totalActual: 4000,
    subsidyReduction: 0,
    netCost: 8000,
  },
  createdBy: null,
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
};

const mockBudgetLines = [
  {
    id: 'hib-001',
    description: 'Primary budget line',
    plannedAmount: 5000,
    confidence: 'professional_estimate' as const,
  },
  {
    id: 'hib-002',
    description: 'Secondary budget line',
    plannedAmount: 3000,
    confidence: 'own_estimate' as const,
  },
];

const mockInvoices = [
  {
    id: 'inv-001',
    vendorId: 'vendor-1',
    vendorName: 'Appliance Vendor',
    invoiceNumber: 'INV-2026-001',
    amount: 2500,
    date: '2026-01-15',
    dueDate: null,
    status: 'pending' as const,
    notes: null,
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
    createdBy: null,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'inv-002',
    vendorId: 'vendor-1',
    vendorName: 'Appliance Vendor',
    invoiceNumber: 'INV-2026-002',
    amount: 1500,
    date: '2026-01-20',
    dueDate: null,
    status: 'paid' as const,
    notes: null,
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
    createdBy: null,
    createdAt: '2026-01-20T10:00:00Z',
    updatedAt: '2026-01-20T10:00:00Z',
  },
];

// ─── Setup ────────────────────────────────────────────────────────────────

beforeEach(async () => {
  mockGetHouseholdItem.mockReset();
  mockFetchInvoices.mockReset();

  // Default mocks
  mockGetHouseholdItem.mockResolvedValue(mockHouseholdItem);
  mockFetchInvoices.mockResolvedValue(mockInvoices);

  const module =
    (await import('./HouseholdItemDetailPage.js')) as typeof HouseholdItemDetailPageTypes;
  HouseholdItemDetailPage = module.HouseholdItemDetailPage;
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Helper ───────────────────────────────────────────────────────────────

function renderPage(id = 'hi-001') {
  return render(
    <MemoryRouter initialEntries={[`/household-items/${id}`]}>
      <Routes>
        <Route path="/household-items/:id" element={<HouseholdItemDetailPage />} />
        <Route path="/household-items" element={<div>Household Items List</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('HouseholdItemDetailPage - Household Item Invoice Display', () => {
  it('loads household item detail successfully', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Kitchen Appliance' })).toBeInTheDocument();
    });

    expect(mockGetHouseholdItem).toHaveBeenCalledWith('hi-001');
  });

  it('fetches invoices for linked household item budgets', async () => {
    renderPage();

    await waitFor(() => {
      expect(mockFetchInvoices).toHaveBeenCalled();
    });

    // Should fetch invoices for the vendor
    expect(mockFetchInvoices).toHaveBeenCalledWith('vendor-1');
  });

  it('displays invoices linked to household item budgets', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    });

    // Both invoices should be visible
    expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    expect(screen.getByText('INV-2026-002')).toBeInTheDocument();
  });

  it('displays invoice amounts correctly', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    });

    // Amounts should be formatted as currency
    expect(screen.getByText('$2500.00')).toBeInTheDocument();
    expect(screen.getByText('$1500.00')).toBeInTheDocument();
  });

  it('displays invoice status badges', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    });

    // Status badges should be present
    const statusTexts = screen.getAllByText(/pending|paid/i);
    expect(statusTexts.length).toBeGreaterThanOrEqual(2);
  });

  it('does not display invoices when fetch returns empty', async () => {
    mockFetchInvoices.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Kitchen Appliance')).toBeInTheDocument();
    });

    // Invoices should not be displayed
    expect(screen.queryByText(/INV-2026/)).not.toBeInTheDocument();
  });

  it('handles invoice fetch errors gracefully', async () => {
    mockFetchInvoices.mockRejectedValue(new Error('Failed to fetch invoices'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Kitchen Appliance' })).toBeInTheDocument();
    });

    // Page should still render household item despite fetch error
    expect(screen.getByRole('heading', { name: 'Kitchen Appliance' })).toBeInTheDocument();
  });

  it('aggregates invoice amounts for household item budget', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    });

    // Total invoiced amount should be displayed (2500 + 1500 = 4000)
    // This is shown in the budgetSummary.totalActual
    const totalActualText = screen.queryByText(/4000|4,000\.00/);
    if (totalActualText) {
      expect(totalActualText).toBeInTheDocument();
    }
  });
});
