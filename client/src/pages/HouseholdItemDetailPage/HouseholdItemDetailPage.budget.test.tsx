/**
 * @jest-environment jsdom
 *
 * Tests for bug #436 fix: HI budget line rendering — invoice actuals display.
 *
 * Verifies that:
 *   - Budget lines WITH invoices show actual cost in green with "Invoiced Amount" label
 *   - Budget lines WITHOUT invoices show planned amount with confidence label + margin %
 *   - Budget summary shows "Total Actual Cost:" when any budget line has invoices
 *   - Budget summary shows "Planned Range:" when confidence margins vary (hasPlannedRange)
 *   - Budget summary shows "Total Planned:" when all lines are invoice confidence (0% margin)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as HouseholdItemDetailPageTypes from './HouseholdItemDetailPage.js';
import type {
  HouseholdItemDetail,
  HouseholdItemCategory,
  HouseholdItemStatus,
  HouseholdItemBudgetLine,
  Invoice,
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
    subsidies: [];
  }>
>;
const mockFetchHouseholdItemDeps =
  jest.fn<typeof HouseholdItemDepsApiTypes.fetchHouseholdItemDeps>();
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockFetchInvoices = jest.fn<typeof InvoicesApiTypes.fetchInvoices>();

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  createHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.createHouseholdItem>(),
  getHouseholdItem: mockGetHouseholdItem,
  updateHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>(),
  listHouseholdItems: jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>(),
  deleteHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>(),
}));

jest.unstable_mockModule('../../lib/apiClient.js', () => ({
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
  fetchInvoices: mockFetchInvoices,
  fetchAllInvoices: jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>(),
  fetchInvoiceById: jest.fn<typeof InvoicesApiTypes.fetchInvoiceById>(),
  createInvoice: jest.fn<typeof InvoicesApiTypes.createInvoice>(),
  updateInvoice: jest.fn<typeof InvoicesApiTypes.updateInvoice>(),
  deleteInvoice: jest.fn<typeof InvoicesApiTypes.deleteInvoice>(),
}));

jest.unstable_mockModule('../../components/documents/LinkedDocumentsSection.js', () => ({
  LinkedDocumentsSection: function MockLinkedDocumentsSection(props: {
    entityType: string;
    entityId: string;
  }) {
    return (
      <section data-testid="linked-documents-section">
        <h2>Documents</h2>
        <span data-testid="entity-type">{props.entityType}</span>
        <span data-testid="entity-id">{props.entityId}</span>
      </section>
    );
  },
}));

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
      vendor: { id: 'vendor-1', name: 'IKEA', specialty: 'Furniture' },
      room: 'Office',
      quantity: 1,
      orderDate: null,
      targetDeliveryDate: null,
      actualDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      isLate: false,
      url: null,
      tagIds: [],
      budgetLineCount: 1,
      totalPlannedAmount: 500,
      budgetSummary: { totalPlanned: 500, totalActual: 0, subsidyReduction: 0, netCost: 500 },
      createdBy: { id: 'user-1', displayName: 'John Doe', email: 'john@example.com' },
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-02-15T14:30:00Z',
      tags: [],
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
      createdBy: null,
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-15T10:00:00Z',
      ...overrides,
    };
  }

  /** Builds a minimal Invoice for testing. */
  function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
    return {
      id: 'inv-1',
      vendorId: 'vendor-1',
      vendorName: 'IKEA',
      workItemBudgetId: null,
      workItemBudget: null,
      householdItemBudgetId: 'bl-1',
      householdItemBudget: null,
      invoiceNumber: 'INV-001',
      amount: 450,
      date: '2026-02-01',
      dueDate: null,
      status: 'paid',
      notes: null,
      createdBy: null,
      createdAt: '2026-02-01T10:00:00Z',
      updatedAt: '2026-02-01T10:00:00Z',
      ...overrides,
    };
  }

  function renderPage(itemId = 'item-1') {
    return render(
      <MemoryRouter initialEntries={[`/household-items/${itemId}`]}>
        <Routes>
          <Route path="/household-items/:id" element={<HouseholdItemDetailPageModule.default />} />
          <Route path="/household-items/:id/edit" element={<div>Household Item Edit</div>} />
          <Route path="/household-items" element={<div>Household Items List</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(async () => {
    // Reset all mocks
    mockGetHouseholdItem.mockReset();
    mockShowToast.mockReset();
    mockFetchHouseholdItemBudgets.mockReset();
    mockFetchBudgetCategories.mockReset();
    mockFetchBudgetSources.mockReset();
    mockFetchVendors.mockReset();
    mockFetchSubsidyPrograms.mockReset();
    mockFetchHouseholdItemSubsidies.mockReset();
    mockFetchHouseholdItemSubsidyPayback.mockReset();
    mockFetchHouseholdItemDeps.mockReset();
    mockListMilestones.mockReset();
    mockListWorkItems.mockReset();
    mockFetchInvoices.mockReset();

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
    // Default: no invoices
    mockFetchInvoices.mockResolvedValue([]);
  });

  // ─── Scenario 1: No invoices → shows planned amount + confidence label ───────

  describe('Scenario 1: budget line with no invoices', () => {
    it('shows planned amount when invoiceCount is 0', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({ plannedAmount: 500, invoiceCount: 0, actualCost: 0 }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Planned amount is displayed (formatCurrency renders as €500.00)
      expect(screen.getByText('€500.00')).toBeInTheDocument();
    });

    it('shows confidence label when invoiceCount is 0', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
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

      // Confidence label is shown for own_estimate
      expect(screen.getByText('Own Estimate')).toBeInTheDocument();
    });

    it('shows margin percentage for own_estimate confidence (20%)', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
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

      // own_estimate margin is 20% — shown as "(+20%)"
      expect(screen.getByText('(+20%)')).toBeInTheDocument();
    });

    it('shows margin percentage for professional_estimate confidence (10%)', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          plannedAmount: 500,
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

      expect(screen.getByText('(+10%)')).toBeInTheDocument();
    });

    it('does NOT show "Invoiced Amount" label when invoiceCount is 0', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({ invoiceCount: 0, actualCost: 0 }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByText('Invoiced Amount')).not.toBeInTheDocument();
    });

    it('does not show margin for invoice confidence (0% margin)', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
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

      // invoice confidence has 0% margin — the margin span is NOT rendered
      expect(screen.queryByText(/\(\+0%\)/)).not.toBeInTheDocument();
      // But confidence label is still shown
      expect(screen.getByText('Invoice')).toBeInTheDocument();
    });
  });

  // ─── Scenario 2: Budget line with invoices → shows actual cost ───────────────

  describe('Scenario 2: budget line with invoices shows actual cost', () => {
    it('shows actual cost amount when invoiceCount > 0', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          plannedAmount: 500,
          actualCost: 450,
          invoiceCount: 1,
        }),
      ]);
      // Invoice data for the vendor (triggers loadBudgetLineInvoices)
      mockFetchInvoices.mockResolvedValue([makeInvoice({ amount: 450 })]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Actual cost (€450.00) should appear (may appear in both line and summary)
      expect(screen.getAllByText('€450.00').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "Invoiced Amount" label when invoiceCount > 0', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          plannedAmount: 500,
          actualCost: 450,
          invoiceCount: 1,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByText('Invoiced Amount')).toBeInTheDocument();
    });

    it('shows planned amount in parentheses when invoiceCount > 0', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          plannedAmount: 500,
          actualCost: 450,
          invoiceCount: 1,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // The planned amount is shown as secondary: "(planned: €500.00)"
      expect(screen.getByText('(planned: €500.00)')).toBeInTheDocument();
    });

    it('does NOT show confidence label when invoiceCount > 0', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          confidence: 'own_estimate',
          plannedAmount: 500,
          actualCost: 450,
          invoiceCount: 1,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Confidence label should not be shown when invoice data is present
      expect(screen.queryByText('Own Estimate')).not.toBeInTheDocument();
    });

    it('handles multiple invoices summed in actualCost', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          plannedAmount: 1000,
          // Two invoices summed: 300 + 250 = 550
          actualCost: 550,
          invoiceCount: 2,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getAllByText('€550.00').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Invoiced Amount')).toBeInTheDocument();
    });
  });

  // ─── Scenario 3: Budget summary shows "Total Actual Cost" when invoices present ─

  describe('Scenario 3: budget summary with invoices present', () => {
    it('shows "Total Actual Cost" label when any budget line has invoices', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          plannedAmount: 500,
          actualCost: 450,
          invoiceCount: 1,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // totalActualCost = 450 > 0, so "Total Actual Cost" should appear in summary
      expect(screen.getByText('Total Actual Cost')).toBeInTheDocument();
    });

    it('shows the summed actual cost in the summary', async () => {
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

      // Total actual = 450 + 180 = 630 (appears in both Expected Cost and Total Actual Cost)
      expect(screen.getAllByText('€630.00').length).toBeGreaterThanOrEqual(1);
    });

    it('does NOT show "Total Actual Cost" when all invoiceCount are 0', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({ plannedAmount: 500, actualCost: 0, invoiceCount: 0 }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByText('Total Actual Cost')).not.toBeInTheDocument();
    });

    it('does NOT show "Total Actual Cost" when invoiceCount > 0 but actualCost is 0', async () => {
      // In the new layout, only totalActualCost > 0 shows the "Total Actual Cost" row.
      // invoiceCount alone is not sufficient — the actualCost field must be non-zero.
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({
          plannedAmount: 500,
          actualCost: 0,
          invoiceCount: 1,
        }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByText('Total Actual Cost')).not.toBeInTheDocument();
    });
  });

  // ─── Scenario 4: Budget summary shows "Planned Range:" with confidence margins ─

  describe('Scenario 4: budget summary shows "Expected Cost" for confidence-margined lines', () => {
    it('shows "Expected Cost" label when confidence margin creates min/max spread', async () => {
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

      expect(screen.getByText('Expected Cost')).toBeInTheDocument();
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

      // Budget summary range: "€400.00 – €600.00"
      expect(screen.getByText(/€400.00.*€600.00/)).toBeInTheDocument();
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

      expect(screen.getByText('Expected Cost')).toBeInTheDocument();
      expect(screen.getByText(/€430.00.*€570.00/)).toBeInTheDocument();
    });
  });

  // ─── Scenario 5: Budget summary shows "Total Planned" when all lines invoice confidence ─

  describe('Scenario 5: budget summary shows "Expected Cost" when all lines use invoice confidence', () => {
    it('shows "Expected Cost" label when all lines are invoice confidence (0% margin)', async () => {
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

      expect(screen.getByText('Expected Cost')).toBeInTheDocument();
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

    it('shows "Expected Cost" for quote confidence (5% margin on two equal lines → equal min/max is still range)', async () => {
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
      expect(screen.getByText('Expected Cost')).toBeInTheDocument();
    });

    it('shows "Expected Cost" when multiple invoice-confidence lines have same amount (no margin variance)', async () => {
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

      expect(screen.getByText('Expected Cost')).toBeInTheDocument();
      // Total = 300 + 200 = 500
      expect(screen.getByText('€500.00')).toBeInTheDocument();
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

      // No subsidies → only "Expected Cost" is shown (not "Planned Range")
      expect(screen.getByText('Expected Cost')).toBeInTheDocument();

      // Invoiced lines collapse: bl-1 min=max=480, bl-2 min=max=290 → total=770
      expect(screen.getByText('€770.00')).toBeInTheDocument();
    });

    it('Expected Cost shows mixed range when some lines have invoices (totalActualCost > 0)', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      // Mixed: one invoiced, one not — totalActualCost > 0
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

      // No subsidies → only "Expected Cost" is shown (not "Planned Range")
      expect(screen.getByText('Expected Cost')).toBeInTheDocument();

      // bl-1 (invoiced): min=max=480; bl-2 (own_estimate): min=300*0.8=240, max=300*1.2=360
      // totalMin = 480 + 240 = 720, totalMax = 480 + 360 = 840
      expect(screen.getByText(/€720.00.*€840.00/)).toBeInTheDocument();
    });

    it('Expected Cost span has budgetValue class when no lines have invoices', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      // No invoices at all: allLinesInvoiced = false
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

      expect(screen.getByText('Expected Cost')).toBeInTheDocument();

      // Normal emphasis (budgetValue) — totalActualCost = 0 so expected cost is not muted
      // totalMin = 500*0.8 = 400, totalMax = 500*1.2 = 600
      const rangeEl = screen.getByText(/€400.00.*€600.00/);
      expect(rangeEl.getAttribute('class')).toContain('budgetValue');
      expect(rangeEl.getAttribute('class')).not.toContain('budgetValueMuted');
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('shows empty state when no budget lines exist', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({ budgetLineCount: 0, totalPlannedAmount: 0 }),
      );
      mockFetchHouseholdItemBudgets.mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(
        screen.getByText('No budget lines yet. Add the first line to start tracking costs.'),
      ).toBeInTheDocument();
    });

    it('does NOT show budget summary when no budget lines exist', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({ budgetLineCount: 0, totalPlannedAmount: 0 }),
      );
      mockFetchHouseholdItemBudgets.mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByText('Expected Cost')).not.toBeInTheDocument();
      expect(screen.queryByText('Total Actual Cost')).not.toBeInTheDocument();
    });

    it('mixed: one invoiced line and one non-invoiced line shows both renderings', async () => {
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

      // Invoiced line shows "Invoiced Amount"
      expect(screen.getByText('Invoiced Amount')).toBeInTheDocument();
      // Non-invoiced line shows confidence label
      expect(screen.getByText('Own Estimate')).toBeInTheDocument();
      // Budget summary shows actual cost (480 > 0)
      expect(screen.getByText('Total Actual Cost')).toBeInTheDocument();
    });
  });
});
