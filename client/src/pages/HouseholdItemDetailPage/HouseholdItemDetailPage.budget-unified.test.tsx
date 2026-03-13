/**
 * @jest-environment jsdom
 *
 * Tests for issue #566: Unified HI budget & subsidies view (matching WI layout).
 *
 * Verifies that the HouseholdItemDetailPage renders a single "Budget" section that:
 *   1. Has no separate top-level "Subsidies" h2 heading (only an h3 subsection)
 *   2. Shows summary rows: Expected Cost, Planned Cost, Expected Payback (when subsidies linked)
 *   3. Shows Expected Payback only when subsidies are linked
 *   4. Shows Expected Cost reflecting net value (planned minus payback) when subsidies linked
 *   5. Planned Cost is struck-through only when ALL budget lines have invoices
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
  HouseholdItemSubsidyPaybackResponse,
  HouseholdItemSubsidyPaybackEntry,
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
  () => Promise<HouseholdItemSubsidyPaybackResponse>
>;
const mockFetchHouseholdItemDeps =
  jest.fn<typeof HouseholdItemDepsApiTypes.fetchHouseholdItemDeps>();
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockFetchInvoices = jest.fn<typeof InvoicesApiTypes.fetchInvoices>();
const mockFetchHouseholdItemCategories = jest.fn() as jest.MockedFunction<
  () => Promise<{ categories: [] }>
>;

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
  fetchBudgetCategories: jest.fn(),
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

jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchHouseholdItemCategories,
  createHouseholdItemCategory: jest.fn(),
  updateHouseholdItemCategory: jest.fn(),
  deleteHouseholdItemCategory: jest.fn(),
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

describe('HouseholdItemDetailPage — unified Budget section (issue #566)', () => {
  let HouseholdItemDetailPageModule: typeof HouseholdItemDetailPageTypes;

  function makeItem(overrides: Partial<HouseholdItemDetail> = {}): HouseholdItemDetail {
    return {
      id: 'item-1',
      name: 'Standing Desk',
      description: 'Electric height-adjustable desk',
      category: 'furniture' as HouseholdItemCategory,
      status: 'planned' as HouseholdItemStatus,
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
      includesVat: null,
      ...overrides,
    };
  }

  function makeSubsidyEntry(
    overrides: Partial<HouseholdItemSubsidyPaybackEntry> = {},
  ): HouseholdItemSubsidyPaybackEntry {
    return {
      subsidyProgramId: 'sp-1',
      name: 'Green Energy Fund',
      reductionType: 'percentage',
      reductionValue: 20,
      minPayback: 100,
      maxPayback: 120,
      ...overrides,
    };
  }

  function makeSubsidyPayback(
    overrides: Partial<HouseholdItemSubsidyPaybackResponse> = {},
  ): HouseholdItemSubsidyPaybackResponse {
    return {
      householdItemId: 'item-1',
      minTotalPayback: 0,
      maxTotalPayback: 0,
      subsidies: [],
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
    mockFetchBudgetSources.mockReset();
    mockFetchVendors.mockReset();
    mockFetchSubsidyPrograms.mockReset();
    mockFetchHouseholdItemSubsidies.mockReset();
    mockFetchHouseholdItemSubsidyPayback.mockReset();
    mockFetchHouseholdItemDeps.mockReset();
    mockListMilestones.mockReset();
    mockListWorkItems.mockReset();
    mockFetchInvoices.mockReset();
    mockFetchHouseholdItemCategories.mockReset();

    // Deferred import — ESM mocks must be registered before the module is imported
    if (!HouseholdItemDetailPageModule) {
      HouseholdItemDetailPageModule = await import('./HouseholdItemDetailPage.js');
    }

    // Default secondary API responses
    mockListWorkItems.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    });
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
    mockFetchVendors.mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    });
    mockFetchSubsidyPrograms.mockResolvedValue({ subsidyPrograms: [] });
    mockFetchHouseholdItemSubsidies.mockResolvedValue([]);
    mockFetchHouseholdItemSubsidyPayback.mockResolvedValue(makeSubsidyPayback());
    mockFetchHouseholdItemDeps.mockResolvedValue([]);
    mockListMilestones.mockResolvedValue([]);
    mockFetchInvoices.mockResolvedValue([]);
    mockFetchHouseholdItemCategories.mockResolvedValue({ categories: [] });
  });

  // ─── Scenario 1: Single unified section — no separate Subsidies card ────────

  describe('Scenario 1: single unified Budget section, no separate Subsidies h2', () => {
    it('renders a top-level Budget h2 heading', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ budgetLineCount: 0 }));
      mockFetchHouseholdItemBudgets.mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByRole('heading', { name: 'Budget', level: 2 })).toBeInTheDocument();
    });

    it('does NOT render a separate top-level Subsidies h2 heading', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ budgetLineCount: 0 }));
      mockFetchHouseholdItemBudgets.mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Subsidies must NOT exist as a top-level h2 — it is an h3 subsection inside Budget
      expect(
        screen.queryByRole('heading', { name: 'Subsidies', level: 2 }),
      ).not.toBeInTheDocument();
    });

    it('renders Subsidies as an h3 subsection inside the Budget section', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ budgetLineCount: 0 }));
      mockFetchHouseholdItemBudgets.mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByRole('heading', { name: 'Subsidies', level: 3 })).toBeInTheDocument();
    });
  });

  // ─── Scenario 2: Budget summary — planned only, no actuals, no subsidies ────

  describe('Scenario 2: budget summary — planned only (no actuals, no subsidies)', () => {
    it('shows Expected Cost and Planned Cost when a budget line exists', async () => {
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

      expect(screen.getByText('Expected Cost')).toBeInTheDocument();
      expect(screen.getByText('Planned Cost')).toBeInTheDocument();
    });

    it('does NOT show Expected Payback when no subsidies are linked', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({ plannedAmount: 500, invoiceCount: 0, actualCost: 0 }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByText('Expected Payback')).not.toBeInTheDocument();
    });

    it('does NOT show Net Cost property when no subsidies are linked', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({ plannedAmount: 500, invoiceCount: 0, actualCost: 0 }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByText('Net Cost')).not.toBeInTheDocument();
    });
  });

  // ─── Scenario 3: Actuals present + subsidies linked ─────────────────────────

  describe('Scenario 3: actuals present + subsidies linked', () => {
    it('shows Expected Payback row when subsidies are linked', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({ plannedAmount: 500, actualCost: 400, invoiceCount: 1 }),
      ]);
      mockFetchHouseholdItemSubsidyPayback.mockResolvedValue(
        makeSubsidyPayback({
          minTotalPayback: 100,
          maxTotalPayback: 120,
          subsidies: [makeSubsidyEntry()],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByText('Expected Payback')).toBeInTheDocument();
    });

    it('shows Expected Cost with correct net value when subsidies linked AND invoiced', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({ plannedAmount: 500, actualCost: 400, invoiceCount: 1 }),
      ]);
      mockFetchHouseholdItemSubsidyPayback.mockResolvedValue(
        makeSubsidyPayback({
          minTotalPayback: 100,
          maxTotalPayback: 120,
          subsidies: [makeSubsidyEntry()],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // All lines invoiced: payback collapses to 120 (max), expected cost = 400-120 = 280
      expect(screen.getByText('Expected Cost')).toBeInTheDocument();
      expect(screen.getByText('€280.00')).toBeInTheDocument();
    });
  });

  // ─── Scenario 4: Expected Payback visibility ───────────────────────────────

  describe('Scenario 4: Expected Payback visibility', () => {
    it('shows Expected Payback as a summary row when subsidies are linked', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({ plannedAmount: 500, invoiceCount: 0, actualCost: 0 }),
      ]);
      mockFetchHouseholdItemSubsidyPayback.mockResolvedValue(
        makeSubsidyPayback({
          minTotalPayback: 50,
          maxTotalPayback: 80,
          subsidies: [
            makeSubsidyEntry({
              subsidyProgramId: 'sp-1',
              name: 'Solar Subsidy',
              minPayback: 50,
              maxPayback: 80,
            }),
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByText('Expected Payback')).toBeInTheDocument();
    });

    it('does NOT show the payback row when no subsidies are linked', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({ plannedAmount: 500, invoiceCount: 0, actualCost: 0 }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByText('Expected Payback')).not.toBeInTheDocument();
    });
  });

  // ─── Scenario 5: Net Cost visibility rules ───────────────────────────────────

  describe('Scenario 5: Expected Cost reflects net value when subsidies linked', () => {
    it('shows Expected Cost with net value when subsidies linked but no invoices', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        // No invoices → own_estimate 500: min=400, max=600
        makeBudgetLine({ plannedAmount: 500, actualCost: 0, invoiceCount: 0 }),
      ]);
      mockFetchHouseholdItemSubsidyPayback.mockResolvedValue(
        makeSubsidyPayback({
          minTotalPayback: 100,
          maxTotalPayback: 120,
          subsidies: [makeSubsidyEntry()],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Expected Cost = minPlanned - minPayback to maxPlanned - maxPayback
      // 400-100=300, 600-120=480 → "€300.00 – €480.00"
      expect(screen.getByText('Expected Cost')).toBeInTheDocument();
      expect(screen.getByText(/€300.00.*€480.00/)).toBeInTheDocument();
    });

    it('shows Expected Cost with net value when subsidies linked AND invoiced', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({ plannedAmount: 500, actualCost: 400, invoiceCount: 1 }),
      ]);
      mockFetchHouseholdItemSubsidyPayback.mockResolvedValue(
        makeSubsidyPayback({
          minTotalPayback: 100,
          maxTotalPayback: 120,
          subsidies: [makeSubsidyEntry()],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // All lines invoiced: payback collapses to 120 (max), expected cost = 400-120 = 280
      expect(screen.getByText('Expected Cost')).toBeInTheDocument();
      expect(screen.getByText('€280.00')).toBeInTheDocument();
    });

    it('does NOT show Net Cost when no subsidies are linked even if actuals > 0', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemBudgets.mockResolvedValue([
        makeBudgetLine({ plannedAmount: 500, actualCost: 400, invoiceCount: 1 }),
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByText('Net Cost')).not.toBeInTheDocument();
    });
  });

  // ─── Scenario 6: Budget overview not shown when no budget lines ──────────────

  describe('Scenario 6: budget overview visibility', () => {
    it('does NOT show budget overview when there are no budget lines', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({ budgetLineCount: 0, totalPlannedAmount: 0 }),
      );
      mockFetchHouseholdItemBudgets.mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // The overview is only rendered when budgetLines.length > 0
      expect(screen.queryByText('Expected Cost')).not.toBeInTheDocument();
      expect(screen.queryByText('Planned Cost')).not.toBeInTheDocument();
    });
  });
});
