/**
 * @jest-environment jsdom
 *
 * Tests for bug #436 fix: HI budget line rendering — invoice actuals display.
 *
 * Verifies that:
 *   - Budget lines WITH invoices show actual cost in green with "Invoiced Amount" label
 *   - Budget lines WITHOUT invoices show planned amount with confidence label + margin %
 *   - Budget summary shows "Expected cost" and "Planned Cost" rows
 *   - Planned Cost is struck-through only when ALL lines have invoices
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as HouseholdItemDetailPageTypes from './HouseholdItemDetailPage.js';
import type {
  HouseholdItemDetail,
  HouseholdItemCategory,
  HouseholdItemStatus,
  HouseholdItemBudgetLine,
} from '@cornerstone/shared';
import type React from 'react';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as HouseholdItemDepsApiTypes from '../../lib/householdItemDepsApi.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';

// ─── Mock function declarations ───────────────────────────────────────────────

const mockGetHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>();
const mockShowToast = jest.fn();
const mockFetchHouseholdItemBudgets = jest.fn() as jest.MockedFunction<
  () => Promise<HouseholdItemBudgetLine[]>
>;
const mockFetchBudgetCategories = jest.fn() as jest.MockedFunction<
  () => Promise<{ categories: [] }>
>;
const mockFetchBudgetSources = jest.fn() as jest.MockedFunction<
  () => Promise<{ budgetSources: [] }>
>;
const mockFetchVendors = jest.fn() as jest.MockedFunction<
  () => Promise<{
    vendors: [];
    pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  }>
>;
const mockFetchSubsidyPrograms = jest.fn() as jest.MockedFunction<
  () => Promise<{ subsidyPrograms: [] }>
>;
const mockFetchHouseholdItemSubsidies = jest.fn() as jest.MockedFunction<() => Promise<[]>>;
const mockFetchHouseholdItemSubsidyPayback = jest.fn() as jest.MockedFunction<
  () => Promise<{
    householdItemId: string;
    minTotalPayback: number;
    maxTotalPayback: number;
    subsidies: { subsidyProgramId: string; name: string; minPayback: number; maxPayback: number }[];
  }>
>;
const mockFetchHouseholdItemDeps =
  jest.fn<typeof HouseholdItemDepsApiTypes.fetchHouseholdItemDeps>();
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockFetchHouseholdItemCategories = jest.fn() as jest.MockedFunction<
  () => Promise<{ categories: [] }>
>;

// ─── Module mocks ─────────────────────────────────────────────────────────────

// The cost lines section has its own tests; here it is a stub that records its props.
const mockCostLinesSection = jest.fn<(props: unknown) => void>();
jest.unstable_mockModule('../../components/CostLineTable/index.js', () => ({
  CostLinesSection: (props: { onChanged: () => Promise<void> | void }) => {
    mockCostLinesSection(props);
    return (
      <div data-testid="cost-lines-stub">
        <button type="button" onClick={() => void props.onChanged()}>
          stub-changed
        </button>
      </div>
    );
  },
}));

// useLocale throws outside a LocaleProvider; the changed components read vatRate from it.
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  createHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.createHouseholdItem>(),
  getHouseholdItem: mockGetHouseholdItem,
  updateHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>(),
  listHouseholdItems: jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>(),
  deleteHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>(),
}));

class MockNetworkError extends Error {}

jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  getBaseUrl: () => '/api',
  toApiClientError: jest.fn(),
  NetworkError: MockNetworkError,
  ApiClientError: class MockApiClientError extends Error {
    constructor(
      readonly statusCode: number,
      readonly error: { code: string; message: string },
    ) {
      super(error.message);
      this.name = 'ApiClientError';
    }
  },
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
}));

jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    dismissToast: jest.fn(),
  }),
}));

jest.unstable_mockModule('../../lib/householdItemWorkItemsApi.js', () => ({
  fetchLinkedHouseholdItems: jest.fn(),
}));

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
  getWorkItem: jest.fn(),
  createWorkItem: jest.fn(),
  updateWorkItem: jest.fn(),
  deleteWorkItem: jest.fn(),
}));

jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: mockFetchHouseholdItemBudgets,
  createHouseholdItemBudget: jest.fn(),
  updateHouseholdItemBudget: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));

jest.unstable_mockModule('../../lib/budgetCategoriesApi.js', () => ({
  fetchBudgetCategories: mockFetchBudgetCategories,
  createBudgetCategory: jest.fn(),
  updateBudgetCategory: jest.fn(),
  deleteBudgetCategory: jest.fn(),
}));

jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
  fetchBudgetSource: jest.fn(),
  createBudgetSource: jest.fn(),
  updateBudgetSource: jest.fn(),
  deleteBudgetSource: jest.fn(),
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

jest.unstable_mockModule('../../lib/subsidyProgramsApi.js', () => ({
  fetchSubsidyPrograms: mockFetchSubsidyPrograms,
  fetchSubsidyProgram: jest.fn(),
  createSubsidyProgram: jest.fn(),
  updateSubsidyProgram: jest.fn(),
  deleteSubsidyProgram: jest.fn(),
}));

jest.unstable_mockModule('../../lib/householdItemSubsidiesApi.js', () => ({
  fetchHouseholdItemSubsidies: mockFetchHouseholdItemSubsidies,
  linkHouseholdItemSubsidy: jest.fn(),
  unlinkHouseholdItemSubsidy: jest.fn(),
  fetchHouseholdItemSubsidyPayback: mockFetchHouseholdItemSubsidyPayback,
}));

jest.unstable_mockModule('../../lib/householdItemDepsApi.js', () => ({
  fetchHouseholdItemDeps: mockFetchHouseholdItemDeps,
  createHouseholdItemDep: jest.fn(),
  deleteHouseholdItemDep: jest.fn(),
}));

jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
  getMilestone: jest.fn<typeof MilestonesApiTypes.getMilestone>(),
  createMilestone: jest.fn<typeof MilestonesApiTypes.createMilestone>(),
  updateMilestone: jest.fn<typeof MilestonesApiTypes.updateMilestone>(),
  deleteMilestone: jest.fn<typeof MilestonesApiTypes.deleteMilestone>(),
  linkWorkItem: jest.fn<typeof MilestonesApiTypes.linkWorkItem>(),
  unlinkWorkItem: jest.fn<typeof MilestonesApiTypes.unlinkWorkItem>(),
  addDependentWorkItem: jest.fn<typeof MilestonesApiTypes.addDependentWorkItem>(),
  removeDependentWorkItem: jest.fn<typeof MilestonesApiTypes.removeDependentWorkItem>(),
}));

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchAllInvoices: jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>(),
  fetchInvoiceById: jest.fn<typeof InvoicesApiTypes.fetchInvoiceById>(),
  createInvoice: jest.fn<typeof InvoicesApiTypes.createInvoice>(),
  updateInvoice: jest.fn<typeof InvoicesApiTypes.updateInvoice>(),
  deleteInvoice: jest.fn<typeof InvoicesApiTypes.deleteInvoice>(),
}));

jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchHouseholdItemCategories,
  createHouseholdItemCategory: jest.fn(),
  updateHouseholdItemCategory: jest.fn(),
  deleteHouseholdItemCategory: jest.fn(),
}));

// Mock useAreas hook — HouseholdItemDetailPage uses useAreas to render AreaPicker
const mockUseAreas = jest.fn(() => ({
  areas: [],
  isLoading: false,
  error: null,
  refetch: jest.fn(),
  createArea: jest.fn(),
  updateArea: jest.fn(),
  deleteArea: jest.fn(),
}));
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: mockUseAreas,
}));

jest.unstable_mockModule('../../components/DocumentsPanel/index.js', () => ({
  DocumentsPanelButton: function MockDocumentsPanelButton(props: {
    entityType: string;
    entityId: string;
  }) {
    return (
      <div data-testid="documents-panel-button">
        <span data-testid="entity-type">{props.entityType}</span>
        <span data-testid="entity-id">{props.entityId}</span>
      </div>
    );
  },
}));

// ─── Mock: formatters — provides useFormatters() hook ────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
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
  const fmtTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  const fmtDateTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: fmtTime,
    formatDateTime: fmtDateTime,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
      formatTime: fmtTime,
      formatDateTime: fmtDateTime,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// ─── Test helpers ─────────────────────────────────────────────────────────────

describe('HouseholdItemDetailPage — budget line rendering (bug #436)', () => {
  let HouseholdItemDetailPageModule: typeof HouseholdItemDetailPageTypes;

  function makeItem(overrides: Partial<HouseholdItemDetail> = {}): HouseholdItemDetail {
    return {
      id: 'item-1',
      name: 'Standing Desk',
      description: 'Electric height-adjustable desk',
      category: 'furniture' as HouseholdItemCategory,
      status: 'purchased' as HouseholdItemStatus,
      vendor: { id: 'vendor-1', name: 'IKEA', trade: null },
      area: null,
      quantity: 1,
      orderDate: null,
      targetDeliveryDate: null,
      actualDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      isLate: false,
      url: null,
      budgetLineCount: 1,
      totalPlannedAmount: 500,
      budgetSummary: { totalPlanned: 500, totalActual: 0, subsidyReduction: 0, netCost: 500 },
      createdBy: { id: 'user-1', displayName: 'John Doe', email: 'john@example.com' },
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-02-15T14:30:00Z',
      dependencies: [],
      subsidies: [],
      ...overrides,
    };
  }

  /** Builds a minimal HouseholdItemBudgetLine for testing. */
  function makeBudgetLine(
    overrides: Partial<HouseholdItemBudgetLine> = {},
  ): HouseholdItemBudgetLine {
    return {
      id: 'bl-1',
      householdItemId: 'item-1',
      description: null,
      plannedAmount: 500,
      confidence: 'own_estimate',
      confidenceMargin: 0.2,
      budgetCategory: null,
      budgetSource: null,
      vendor: null,
      actualCost: 0,
      actualCostPaid: 0,
      invoiceCount: 0,
      invoiceLink: null,
      createdBy: null,
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-15T10:00:00Z',
      quantity: null,
      unit: null,
      unitPrice: null,
      includesVat: true,
      ...overrides,
    };
  }

  function renderPage(itemId = 'item-1') {
    return render(
      <MemoryRouter initialEntries={[`/project/household-items/${itemId}`]}>
        <Routes>
          <Route
            path="/project/household-items/:id"
            element={<HouseholdItemDetailPageModule.default />}
          />
          <Route
            path="/project/household-items/:id/edit"
            element={<div>Household Item Edit</div>}
          />
          <Route path="/project/household-items" element={<div>Household Items List</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(async () => {
    // Reset all mocks
    mockGetHouseholdItem.mockReset();
    mockShowToast.mockReset();
    mockFetchHouseholdItemBudgets.mockReset();
    mockFetchHouseholdItemCategories.mockReset();
    mockFetchBudgetCategories.mockReset();
    mockFetchBudgetSources.mockReset();
    mockFetchVendors.mockReset();
    mockFetchSubsidyPrograms.mockReset();
    mockFetchHouseholdItemSubsidies.mockReset();
    mockFetchHouseholdItemSubsidyPayback.mockReset();
    mockFetchHouseholdItemDeps.mockReset();
    mockListMilestones.mockReset();
    mockListWorkItems.mockReset();
    mockCostLinesSection.mockReset();

    // Deferred import — ESM mocks must be registered before the module is imported
    if (!HouseholdItemDetailPageModule) {
      HouseholdItemDetailPageModule = await import('./HouseholdItemDetailPage.js');
    }

    // Default secondary API responses — non-budget APIs return empty data
    mockListWorkItems.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    });
    mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
    mockFetchVendors.mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    });
    mockFetchSubsidyPrograms.mockResolvedValue({ subsidyPrograms: [] });
    mockFetchHouseholdItemSubsidies.mockResolvedValue([]);
    mockFetchHouseholdItemSubsidyPayback.mockResolvedValue({
      householdItemId: 'item-1',
      minTotalPayback: 0,
      maxTotalPayback: 0,
      subsidies: [],
    });
    mockFetchHouseholdItemDeps.mockResolvedValue([]);
    mockListMilestones.mockResolvedValue([]);
    mockFetchHouseholdItemCategories.mockResolvedValue({ categories: [] });
    // Default: no invoices
  });

  // ─── Scenario 3: Budget summary with invoices — Expected Cost collapses invoiced lines ─

  describe('Scenario 3: budget summary with invoices present', () => {
    it('shows collapsed Expected Cost when all budget lines have invoices', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          id: 'bl-1',
          plannedAmount: 500,
          actualCost: 450,
          invoiceCount: 1,
        }),
        makeBudgetLine({
          id: 'bl-2',
          plannedAmount: 200,
          actualCost: 180,
          invoiceCount: 1,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Total actual = 450 + 180 = 630 — invoiced lines collapse to actual cost
      expect(screen.getAllByText('€630.00').length).toBeGreaterThanOrEqual(1);
    });

    it('shows Expected Cost and Planned Cost labels when budget lines exist', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({ plannedAmount: 500, actualCost: 0, invoiceCount: 0 }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByText('Expected cost')).toBeInTheDocument();
      expect(screen.getByText('Planned cost')).toBeInTheDocument();
    });
  });

  // ─── Scenario 4: Budget summary shows "Planned Cost:" with confidence margins ─

  describe('Scenario 4: budget summary shows "Expected cost" for confidence-margined lines', () => {
    it('shows "Expected cost" label when confidence margin creates min/max spread', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      // own_estimate at 20%: min = 500 * 0.8 = 400, max = 500 * 1.2 = 600
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          plannedAmount: 500,
          confidence: 'own_estimate',
          confidenceMargin: 0.2,
          invoiceCount: 0,
          actualCost: 0,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByText('Expected cost')).toBeInTheDocument();
    });

    it('shows the min-max range formatted correctly', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      // own_estimate at 20% on $500: min=$400, max=$600
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          plannedAmount: 500,
          confidence: 'own_estimate',
          confidenceMargin: 0.2,
          invoiceCount: 0,
          actualCost: 0,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Budget summary range: "€400.00 – €600.00" (appears in both Expected Cost and Planned Cost)
      expect(screen.getAllByText(/€400.00.*€600.00/).length).toBeGreaterThanOrEqual(1);
    });

    it('shows range across multiple lines with different confidence levels', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      // Line 1: own_estimate 20% on 200 → min=160, max=240
      // Line 2: professional_estimate 10% on 300 → min=270, max=330
      // Combined: min=430, max=570
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          id: 'bl-1',
          plannedAmount: 200,
          confidence: 'own_estimate',
          confidenceMargin: 0.2,
          invoiceCount: 0,
          actualCost: 0,
        }),
        makeBudgetLine({
          id: 'bl-2',
          plannedAmount: 300,
          confidence: 'professional_estimate',
          confidenceMargin: 0.1,
          invoiceCount: 0,
          actualCost: 0,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByText('Expected cost')).toBeInTheDocument();
      // Range appears in both Expected Cost and Planned Cost rows
      expect(screen.getAllByText(/€430.00.*€570.00/).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Scenario 5: Budget summary shows "Total Planned" when all lines invoice confidence ─

  describe('Scenario 5: budget summary shows "Expected cost" when all lines use invoice confidence', () => {
    it('shows "Expected cost" label when all lines are invoice confidence (0% margin)', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      // invoice confidence has 0% margin → min === max → no range
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          plannedAmount: 500,
          confidence: 'invoice',
          confidenceMargin: 0,
          invoiceCount: 0,
          actualCost: 0,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByText('Expected cost')).toBeInTheDocument();
    });

    it('shows the total planned amount when no margin variance', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          plannedAmount: 750,
          confidence: 'invoice',
          confidenceMargin: 0,
          invoiceCount: 0,
          actualCost: 0,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Budget summary should show €750.00 (may appear in both line and summary)
      expect(screen.getAllByText('€750.00').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "Expected cost" for quote confidence (5% margin on two equal lines → equal min/max is still range)', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      // quote confidence has 5% margin → 500*0.95=475, 500*1.05=525 → hasPlannedRange=true
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          plannedAmount: 500,
          confidence: 'quote',
          confidenceMargin: 0.05,
          invoiceCount: 0,
          actualCost: 0,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // quote has 5% margin → 500*0.95=475, 500*1.05=525 → min !== max → Expected Cost
      expect(screen.getByText('Expected cost')).toBeInTheDocument();
    });

    it('shows "Expected cost" when multiple invoice-confidence lines have same amount (no margin variance)', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      // Both lines have invoice confidence (0% margin) → totalMin === totalMax → Total Planned
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          id: 'bl-1',
          plannedAmount: 300,
          confidence: 'invoice',
          confidenceMargin: 0,
          invoiceCount: 0,
          actualCost: 0,
        }),
        makeBudgetLine({
          id: 'bl-2',
          plannedAmount: 200,
          confidence: 'invoice',
          confidenceMargin: 0,
          invoiceCount: 0,
          actualCost: 0,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByText('Expected cost')).toBeInTheDocument();
      // Total = 300 + 200 = 500 (appears in Expected Cost and Planned Cost)
      expect(screen.getAllByText('€500.00').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Scenario 6: Planned range de-emphasis when all lines are invoiced (issue #462) ─

  describe('Scenario 6: planned range de-emphasis (allLinesInvoiced)', () => {
    it('Expected Cost shows collapsed invoiced amounts when all budget lines have invoices', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      // All lines are invoiced: invoiced lines collapse to actualCost for min/max
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          id: 'bl-1',
          plannedAmount: 500,
          confidence: 'invoice',
          confidenceMargin: 0,
          invoiceCount: 1,
          actualCost: 480,
        }),
        makeBudgetLine({
          id: 'bl-2',
          plannedAmount: 300,
          confidence: 'invoice',
          confidenceMargin: 0,
          invoiceCount: 1,
          actualCost: 290,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // No subsidies → only "Expected cost" is shown (not "Planned Cost")
      expect(screen.getByText('Expected cost')).toBeInTheDocument();

      // Invoiced lines collapse: bl-1 min=max=480, bl-2 min=max=290 → total=770
      // Value appears in both Expected Cost and Total Actual Cost
      expect(screen.getAllByText('€770.00').length).toBeGreaterThanOrEqual(1);
    });

    it('Expected Cost shows mixed range when some lines have invoices', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      // Mixed: one invoiced, one not
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          id: 'bl-1',
          plannedAmount: 500,
          confidence: 'own_estimate',
          confidenceMargin: 0.2,
          invoiceCount: 1,
          actualCost: 480,
        }),
        makeBudgetLine({
          id: 'bl-2',
          plannedAmount: 300,
          confidence: 'own_estimate',
          confidenceMargin: 0.2,
          invoiceCount: 0,
          actualCost: 0,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByText('Expected cost')).toBeInTheDocument();

      // bl-1 (invoiced): min=max=480; bl-2 (own_estimate): min=300*0.8=240, max=300*1.2=360
      // totalMin = 480 + 240 = 720, totalMax = 480 + 360 = 840
      // Range appears in both Expected Cost and Planned Cost rows
      expect(screen.getAllByText(/€720.00.*€840.00/).length).toBeGreaterThanOrEqual(1);
    });

    it('Expected Cost span has budgetValue class when no subsidies linked', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          id: 'bl-1',
          plannedAmount: 500,
          confidence: 'own_estimate',
          confidenceMargin: 0.2,
          invoiceCount: 0,
          actualCost: 0,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByText('Expected cost')).toBeInTheDocument();

      // No subsidies → budgetValue class (not highlighted or muted)
      // Range appears in both rows; check the first one
      const rangeEls = screen.getAllByText(/€400.00.*€600.00/);
      expect(rangeEls.length).toBeGreaterThanOrEqual(1);
      expect(rangeEls[0]!.getAttribute('class')).toContain('budgetValue');
      expect(rangeEls[0]!.getAttribute('class')).not.toContain('budgetValueMuted');
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('does NOT show budget summary when no budget lines exist', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({ budgetLineCount: 0, totalPlannedAmount: 0 }),
      );
      mockFetchHouseholdItemBudgets.mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByText('Expected cost')).not.toBeInTheDocument();
      expect(screen.queryByText('Planned cost')).not.toBeInTheDocument();
    });

    it('mixed: one invoiced line and one non-invoiced line still show the cost overview', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        // Invoiced line
        makeBudgetLine({
          id: 'bl-1',
          plannedAmount: 500,
          actualCost: 480,
          invoiceCount: 1,
          confidence: 'invoice',
          confidenceMargin: 0,
        }),
        // Non-invoiced line with margin
        makeBudgetLine({
          id: 'bl-2',
          plannedAmount: 200,
          actualCost: 0,
          invoiceCount: 0,
          confidence: 'own_estimate',
          confidenceMargin: 0.2,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Budget summary shows Expected Cost
      expect(screen.getByText('Expected cost')).toBeInTheDocument();
    });
  });

  describe('Cost section (#2235)', () => {
    it('renders the Cost h2 with the cost lines section and a Subsidies h3 inside it', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([makeBudgetLine()]);

      renderPage();

      const heading = await screen.findByRole('heading', { name: 'Cost', level: 2 });
      const section = heading.closest('section') as HTMLElement;
      expect(section).toHaveAttribute('aria-labelledby', heading.id);
      expect(within(section).getByTestId('cost-lines-stub')).toBeInTheDocument();
      expect(
        within(section).getByRole('heading', { name: 'Grants', level: 3 }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Budget', level: 2 })).toBeNull();
    });

    it('hands the host, the fetched lines, h3 and the origin state to the section', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([makeBudgetLine()]);

      renderPage();

      await waitFor(() => {
        const calls = mockCostLinesSection.mock.calls;
        const props = calls[calls.length - 1]![0] as { lines: unknown[] };
        expect(props.lines).toHaveLength(1);
      });
      const calls = mockCostLinesSection.mock.calls;
      const props = calls[calls.length - 1]![0] as {
        host: unknown;
        headingLevel: number;
        linkState: unknown;
      };
      expect(props.host).toEqual({ kind: 'household_item', id: 'item-1', label: 'Standing Desk' });
      expect(props.headingLevel).toBe(3);
      expect(props.linkState).toBeTruthy();
    });

    it('labels the overview After grants when a grant pays back', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([makeBudgetLine()]);
      mockFetchHouseholdItemSubsidyPayback.mockResolvedValue({
        householdItemId: 'item-1',
        minTotalPayback: 50,
        maxTotalPayback: 50,
        subsidies: [
          { subsidyProgramId: 's1', name: 'Energy Grant', minPayback: 50, maxPayback: 50 },
        ],
      });

      renderPage();

      expect(await screen.findByText('After grants')).toBeInTheDocument();
      expect(screen.queryByText('Expected cost')).toBeNull();
    });

    it('onChanged reloads the lines and the grant payback', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([makeBudgetLine()]);

      renderPage();
      await screen.findByTestId('cost-lines-stub');
      const lines = mockFetchHouseholdItemBudgets.mock.calls.length;
      const payback = mockFetchHouseholdItemSubsidyPayback.mock.calls.length;

      fireEvent.click(screen.getByRole('button', { name: 'stub-changed' }));

      await waitFor(() =>
        expect(mockFetchHouseholdItemBudgets.mock.calls.length).toBeGreaterThan(lines),
      );
      expect(mockFetchHouseholdItemSubsidyPayback.mock.calls.length).toBeGreaterThan(payback);
    });
  });
});
