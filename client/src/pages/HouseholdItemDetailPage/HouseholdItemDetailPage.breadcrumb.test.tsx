/**
 * @jest-environment jsdom
 *
 * Breadcrumb-specific tests for HouseholdItemDetailPage.tsx (Story #1240).
 * Verifies that the detail page header renders AreaBreadcrumb (default variant)
 * below the item h1 — including the nav/aria-label for items with an area
 * and the "No area" fallback for items with area: null.
 *
 * All mocks replicate those in HouseholdItemDetailPage.test.tsx to stay
 * independent and avoid module-registry conflicts.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as HouseholdItemDetailPageTypes from './HouseholdItemDetailPage.js';
import type {
  HouseholdItemDetail,
  HouseholdItemStatus,
  HouseholdItemCategory,
  AreaSummary,
} from '@cornerstone/shared';
import type React from 'react';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as HouseholdItemDepsApiTypes from '../../lib/householdItemDepsApi.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type { HouseholdItemDepDetail } from '@cornerstone/shared';

// ─── API mock handles ─────────────────────────────────────────────────────────

const mockGetHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>();
const mockUpdateHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>();
const mockDeleteHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>();
const mockShowToast = jest.fn();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockFetchHouseholdItemDeps =
  jest.fn<typeof HouseholdItemDepsApiTypes.fetchHouseholdItemDeps>();
const mockCreateHouseholdItemDep =
  jest.fn<typeof HouseholdItemDepsApiTypes.createHouseholdItemDep>();
const mockDeleteHouseholdItemDep =
  jest.fn<typeof HouseholdItemDepsApiTypes.deleteHouseholdItemDep>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchHouseholdItemBudgets = jest.fn() as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchBudgetCategories = jest.fn() as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchBudgetSources = jest.fn() as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchVendors = jest.fn() as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchSubsidyPrograms = jest.fn() as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchHouseholdItemSubsidies = jest.fn() as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchHouseholdItemSubsidyPayback = jest.fn() as any;
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockFetchInvoices = jest.fn<typeof InvoicesApiTypes.fetchInvoices>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchHouseholdItemCategories = jest.fn() as any;

// Mock ApiClientError so instanceof checks work in the component
class MockApiClientError extends Error {
  constructor(
    readonly statusCode: number,
    readonly error: { code: string; message: string },
  ) {
    super(error.message);
    this.name = 'ApiClientError';
  }
}

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  createHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.createHouseholdItem>(),
  getHouseholdItem: mockGetHouseholdItem,
  updateHouseholdItem: mockUpdateHouseholdItem,
  listHouseholdItems: jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>(),
  deleteHouseholdItem: mockDeleteHouseholdItem,
}));

jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  ApiClientError: MockApiClientError,
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
  createHouseholdItemDep: mockCreateHouseholdItemDep,
  deleteHouseholdItemDep: mockDeleteHouseholdItemDep,
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

jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: jest.fn(() => ({
    areas: [],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    createArea: jest.fn(),
    updateArea: jest.fn(),
    deleteArea: jest.fn(),
  })),
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<HouseholdItemDetail> = {}): HouseholdItemDetail {
  return {
    id: 'item-1',
    name: 'Standing Desk',
    description: 'Electric height-adjustable desk',
    category: 'furniture' as HouseholdItemCategory,
    status: 'purchased' as HouseholdItemStatus,
    vendor: { id: 'vendor-1', name: 'IKEA', trade: null },
    area: null,
    quantity: 2,
    orderDate: '2026-02-15',
    targetDeliveryDate: '2026-03-01',
    actualDeliveryDate: null,
    earliestDeliveryDate: '2026-03-01',
    latestDeliveryDate: '2026-03-10',
    isLate: false,
    url: 'https://example.com/desk',
    budgetLineCount: 1,
    totalPlannedAmount: 599.99,
    budgetSummary: { totalPlanned: 599.99, totalActual: 0, subsidyReduction: 0, netCost: 599.99 },
    createdBy: { id: 'user-1', displayName: 'John Doe', email: 'john@example.com' },
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-02-15T14:30:00Z',
    dependencies: [],
    subsidies: [],
    ...overrides,
  };
}

const areaWithAncestor: AreaSummary = {
  id: 'area-kitchen',
  name: 'Kitchen',
  color: null,
  ancestors: [{ id: 'area-gf', name: 'Ground Floor', color: null }],
};

const areaRootLevel: AreaSummary = {
  id: 'area-garage',
  name: 'Garage',
  color: null,
  ancestors: [],
};

const areaDeepNested: AreaSummary = {
  id: 'area-pantry',
  name: 'Pantry',
  color: null,
  ancestors: [
    { id: 'area-gf', name: 'Ground Floor', color: null },
    { id: 'area-kitchen', name: 'Kitchen', color: null },
  ],
};

// ─── Component import (must be after mocks) ──────────────────────────────────

let HouseholdItemDetailPageModule: typeof HouseholdItemDetailPageTypes;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderPage(itemId = 'item-1') {
  return render(
    <MemoryRouter initialEntries={[`/project/household-items/${itemId}`]}>
      <Routes>
        <Route
          path="/project/household-items/:id"
          element={<HouseholdItemDetailPageModule.default />}
        />
        <Route path="/project/household-items" element={<div>Household Items List</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HouseholdItemDetailPage — AreaBreadcrumb in header (Story #1240)', () => {
  beforeEach(async () => {
    if (!HouseholdItemDetailPageModule) {
      HouseholdItemDetailPageModule = await import('./HouseholdItemDetailPage.js');
    }

    mockGetHouseholdItem.mockReset();
    mockUpdateHouseholdItem.mockReset();
    mockDeleteHouseholdItem.mockReset();
    mockShowToast.mockReset();
    mockListWorkItems.mockReset();
    mockFetchHouseholdItemBudgets.mockReset();
    mockFetchBudgetCategories.mockReset();
    mockFetchBudgetSources.mockReset();
    mockFetchVendors.mockReset();
    mockFetchSubsidyPrograms.mockReset();
    mockFetchHouseholdItemSubsidies.mockReset();
    mockFetchHouseholdItemSubsidyPayback.mockReset();
    mockFetchHouseholdItemDeps.mockReset();
    mockCreateHouseholdItemDep.mockReset();
    mockDeleteHouseholdItemDep.mockReset();
    mockListMilestones.mockReset();
    mockFetchInvoices.mockReset();
    mockFetchHouseholdItemCategories.mockReset();

    // Default API responses
    mockListWorkItems.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    });
    mockFetchHouseholdItemBudgets.mockResolvedValue([]);
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
    mockCreateHouseholdItemDep.mockResolvedValue({
      householdItemId: 'item-1',
      predecessorType: 'work_item',
      predecessorId: 'wi-1',
      predecessor: { id: 'wi-1', title: 'Work Item', status: 'not_started', endDate: null },
    } as HouseholdItemDepDetail);
    mockDeleteHouseholdItemDep.mockResolvedValue(undefined);
    mockListMilestones.mockResolvedValue([]);
    mockFetchInvoices.mockResolvedValue([]);
    mockFetchHouseholdItemCategories.mockResolvedValue({
      categories: [
        {
          id: 'furniture',
          name: 'Furniture',
          color: '#8B5CF6',
          sortOrder: 0,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  // ── Scenario 3: area set → nav element with aria-label visible ──────────

  describe('header — item with area set', () => {
    it('renders nav with aria-label "Area path" when area is set', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ area: areaWithAncestor }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Standing Desk')).toBeInTheDocument();
      });

      expect(screen.getByRole('navigation', { name: 'Area path' })).toBeInTheDocument();
    });

    it('renders ancestor name inside the nav breadcrumb', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ area: areaWithAncestor }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Standing Desk')).toBeInTheDocument();
      });

      const nav = screen.getByRole('navigation', { name: 'Area path' });
      expect(nav).toBeInTheDocument();
      // The nav contains list items: ancestor name + separator + leaf name
      expect(nav.textContent).toContain('Ground Floor');
      expect(nav.textContent).toContain('Kitchen');
    });

    it('renders leaf area name inside the nav breadcrumb', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ area: areaRootLevel }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Standing Desk')).toBeInTheDocument();
      });

      const nav = screen.getByRole('navigation', { name: 'Area path' });
      expect(nav.textContent).toContain('Garage');
    });

    it('renders correct separator count for multi-level ancestors', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ area: areaDeepNested }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Standing Desk')).toBeInTheDocument();
      });

      const nav = screen.getByRole('navigation', { name: 'Area path' });
      // 3 segments → 2 separators
      const separators = nav.querySelectorAll('[aria-hidden="true"]');
      expect(separators).toHaveLength(2);
    });

    it('renders all ancestor and leaf names in the nav for deeply nested area', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ area: areaDeepNested }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Standing Desk')).toBeInTheDocument();
      });

      const nav = screen.getByRole('navigation', { name: 'Area path' });
      expect(nav.textContent).toContain('Ground Floor');
      expect(nav.textContent).toContain('Kitchen');
      expect(nav.textContent).toContain('Pantry');
    });

    it('does not render "No area" text when area is set', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ area: areaWithAncestor }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Standing Desk')).toBeInTheDocument();
      });

      expect(screen.queryByText('No area')).not.toBeInTheDocument();
    });
  });

  // ── Scenario 4: area: null → "No area" visible, no nav ──────────────────

  describe('header — item with area: null', () => {
    it('renders "No area" text when area is null', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ area: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Standing Desk')).toBeInTheDocument();
      });

      // AreaBreadcrumb renders "No area" muted span when area is null
      expect(screen.getByText('No area')).toBeInTheDocument();
    });

    it('does not render a nav with "Area path" label when area is null', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ area: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Standing Desk')).toBeInTheDocument();
      });

      expect(screen.queryByRole('navigation', { name: 'Area path' })).not.toBeInTheDocument();
    });

    it('still renders the item heading h1 when area is null', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ name: 'My Item', area: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'My Item' })).toBeInTheDocument();
      });

      expect(screen.getByText('No area')).toBeInTheDocument();
    });
  });
});
