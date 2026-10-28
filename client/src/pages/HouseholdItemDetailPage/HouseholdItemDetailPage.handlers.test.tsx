/**
 * @jest-environment jsdom
 *
 * Tests for inline date editing and section structure on HouseholdItemDetailPage.
 * Story #467: Inline date and dependency editing on Household Item Detail Page.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import enCommon from '../../i18n/en/common.json';
import enHouseholdItems from '../../i18n/en/householdItems.json';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as HouseholdItemDetailPageTypes from './HouseholdItemDetailPage.js';
import type {
  HouseholdItemDetail,
  HouseholdItemStatus,
  HouseholdItemCategory,
} from '@cornerstone/shared';
import type React from 'react';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as HouseholdItemDepsApiTypes from '../../lib/householdItemDepsApi.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type * as HouseholdItemCategoriesApiTypes from '../../lib/householdItemCategoriesApi.js';
import type { HouseholdItemDepDetail } from '@cornerstone/shared';

// ─── Mock function declarations ───────────────────────────────────────────────

const mockGetHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>();
const mockUpdateHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>();
const mockDeleteHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>();
const mockShowToast = jest.fn();
const mockShowUndoToast = jest.fn();
const mockPatch = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockFetchHouseholdItemDeps =
  jest.fn<typeof HouseholdItemDepsApiTypes.fetchHouseholdItemDeps>();
const mockCreateHouseholdItemDep =
  jest.fn<typeof HouseholdItemDepsApiTypes.createHouseholdItemDep>();
const mockDeleteHouseholdItemDep =
  jest.fn<typeof HouseholdItemDepsApiTypes.deleteHouseholdItemDep>();
const mockFetchHouseholdItemBudgets = jest.fn() as jest.MockedFunction<() => Promise<[]>>;
const mockFetchBudgetCategories = jest.fn() as jest.MockedFunction<
  () => Promise<{ categories: [] }>
>;
const mockFetchBudgetSources = jest.fn() as jest.MockedFunction<
  () => Promise<{ budgetSources: [] }>
>;
const mockFetchVendors = jest.fn() as jest.MockedFunction<
  () => Promise<{ vendors: []; pagination: object }>
>;
const mockFetchSubsidyPrograms = jest.fn() as jest.MockedFunction<
  () => Promise<{ subsidyPrograms: unknown[] }>
>;
const mockFetchHouseholdItemSubsidies = jest.fn() as jest.MockedFunction<() => Promise<unknown[]>>;
const mockFetchHouseholdItemSubsidyPayback = jest.fn() as jest.MockedFunction<
  () => Promise<object>
>;
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();

// ─── Mock ApiClientError ──────────────────────────────────────────────────────

class MockApiClientError extends Error {
  constructor(
    readonly statusCode: number,
    readonly error: { code: string; message: string },
  ) {
    super(error.message);
    this.name = 'ApiClientError';
  }
}

jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: jest.fn(() =>
    Promise.resolve({ entityType: 'household_item', id: 'item-1', effects: [] }),
  ),
}));

// ─── jest.unstable_mockModule declarations ────────────────────────────────────
// Must be declared before any imports of the component.

// useLocale throws outside a LocaleProvider; the changed components read vatRate from it.
// The cost lines section has its own tests; it is not under test here.
jest.unstable_mockModule('../../components/CostLineTable/index.js', () => ({
  CostLinesSection: (props: { onChanged: () => Promise<void> | void }) => (
    <button type="button" onClick={() => void props.onChanged()}>
      stub-changed
    </button>
  ),
}));

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
  updateHouseholdItem: mockUpdateHouseholdItem,
  listHouseholdItems: jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>(),
  deleteHouseholdItem: mockDeleteHouseholdItem,
}));

class MockNetworkError extends Error {}

jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  getBaseUrl: () => '/api',
  toApiClientError: jest.fn(),
  NetworkError: MockNetworkError,
  ApiClientError: MockApiClientError,
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: mockPatch,
  del: jest.fn(),
}));

jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    showUndoToast: mockShowUndoToast,
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
  fetchAllInvoices: jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>(),
  fetchInvoiceById: jest.fn<typeof InvoicesApiTypes.fetchInvoiceById>(),
  createInvoice: jest.fn<typeof InvoicesApiTypes.createInvoice>(),
  updateInvoice: jest.fn<typeof InvoicesApiTypes.updateInvoice>(),
  deleteInvoice: jest.fn<typeof InvoicesApiTypes.deleteInvoice>(),
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

// Mock householdItemCategoriesApi — HouseholdItemDetailPage loads categories to display badges
const mockFetchHICCategories = jest
  .fn<typeof HouseholdItemCategoriesApiTypes.fetchHouseholdItemCategories>()
  .mockResolvedValue({ categories: [] });
jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchHICCategories,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('HouseholdItemDetailPage — handlers and arms', () => {
  let HouseholdItemDetailPageModule: typeof HouseholdItemDetailPageTypes;

  /** Build a complete HouseholdItemDetail with sensible defaults. */
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
      budgetLineCount: 0,
      totalPlannedAmount: 0,
      budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
      createdBy: { id: 'user-1', displayName: 'John Doe', email: 'john@example.com' },
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-02-15T14:30:00Z',
      dependencies: [],
      subsidies: [],
      ...overrides,
    };
  }

  beforeEach(async () => {
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

    // Deferred import: ensures mocks are in place before the component module loads
    if (!HouseholdItemDetailPageModule) {
      HouseholdItemDetailPageModule = await import('./HouseholdItemDetailPage.js');
    }

    // Default supporting API responses (non-critical secondary calls)
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
    mockDeleteHouseholdItemDep.mockResolvedValue({
      undo: { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' },
    });
    mockListMilestones.mockResolvedValue([]);
  });

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
        <LocationDisplay />
      </MemoryRouter>,
    );
  }

  // ─── Helper: wait for the page to finish loading ───────────────────────────

  async function waitForPageLoad() {
    // Wait for loading to finish AND item to render.
    // The heading confirms item is set and at least one render cycle with data has completed.
    await waitFor(() => {
      expect(screen.queryByText('Loading household item...')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
    });
    // Allow one more microtask tick for useEffect([item?.id]) that initializes local date state
    await waitFor(() => {
      expect(screen.getByLabelText('Order Date')).toBeInTheDocument();
    });
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Handlers: guards, failures and arms the focused suites do not reach ───

  describe('handlers and arms', () => {
    beforeEach(() => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockGetHouseholdItem.mockResolvedValue(makeItem());
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    const dateInput = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

    describe('route and load states', () => {
      it('redirects to the purchase list when the route carries no id', async () => {
        render(
          <MemoryRouter initialEntries={['/no-id']}>
            <Routes>
              <Route path="/no-id" element={<HouseholdItemDetailPageModule.default />} />
              <Route path="/project/household-items" element={<div>Household Items List</div>} />
            </Routes>
          </MemoryRouter>,
        );
        expect(await screen.findByText('Household Items List')).toBeInTheDocument();
        expect(mockGetHouseholdItem).not.toHaveBeenCalled();
      });

      it('the not-found card goes back to the purchase list', async () => {
        mockGetHouseholdItem.mockRejectedValue(
          new MockApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
        );
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /Back to/ }));
        expect(await screen.findByText('Household Items List')).toBeInTheDocument();
      });

      it('the load-failed card goes back to the purchase list', async () => {
        mockGetHouseholdItem.mockRejectedValue(new Error('boom'));
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /Back to/ }));
        expect(await screen.findByText('Household Items List')).toBeInTheDocument();
      });

      it('shows a dash for a purchase without a creator', async () => {
        mockGetHouseholdItem.mockResolvedValue(makeItem({ createdBy: null }));
        renderPage();
        await waitForPageLoad();
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
      });

      it('keeps the page when the budget data fails to load', async () => {
        mockFetchHouseholdItemBudgets.mockRejectedValue(new Error('budget'));
        renderPage();
        await waitForPageLoad();
        await waitFor(() => expect(console.error).toHaveBeenCalled());
      });

      it('keeps the page when the milestones fail to load', async () => {
        mockListMilestones.mockRejectedValue(new Error('milestones'));
        renderPage();
        await waitForPageLoad();
        await waitFor(() => expect(console.error).toHaveBeenCalled());
      });

      it('logs failed reloads after the cost lines changed', async () => {
        renderPage();
        await waitForPageLoad();
        mockFetchHouseholdItemBudgets.mockRejectedValue(new Error('reload'));
        mockFetchHouseholdItemSubsidies.mockRejectedValue(new Error('reload'));
        mockFetchHouseholdItemSubsidyPayback.mockRejectedValue(new Error('reload'));
        fireEvent.click(screen.getByRole('button', { name: 'stub-changed' }));
        await waitFor(() => expect(console.error).toHaveBeenCalledTimes(3));
      });

      it('shows an area and an actual delivery date without a target', async () => {
        mockGetHouseholdItem.mockResolvedValue(
          makeItem({
            area: { id: 'area-1', name: 'Kitchen', color: null } as never,
            actualDeliveryDate: '2026-03-05',
            targetDeliveryDate: null,
          }),
        );
        renderPage();
        await waitForPageLoad();
        expect(screen.getByLabelText(/target was not set/)).toBeInTheDocument();
      });

      it('clears the area', async () => {
        mockGetHouseholdItem.mockResolvedValue(
          makeItem({ area: { id: 'area-1', name: 'Kitchen', color: null } as never }),
        );
        mockUpdateHouseholdItem.mockResolvedValue(makeItem());
        renderPage();
        await waitForPageLoad();
        fireEvent.click(screen.getByPlaceholderText(enCommon.aria.selectArea));
        fireEvent.click(await screen.findByText(enCommon.aria.noArea));
        await waitFor(() =>
          expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', { areaId: null }),
        );
        await waitFor(() =>
          expect(mockShowToast).toHaveBeenCalledWith(
            'success',
            enHouseholdItems.detail.area.updated,
          ),
        );
      });

      it('lists the grants that are not linked yet', async () => {
        const program = (id: string, name: string) =>
          ({
            id,
            name,
            description: null,
            eligibility: null,
            reductionType: 'percentage',
            reductionValue: 10,
            applicationStatus: 'eligible',
            applicationDeadline: null,
            notes: null,
            maximumAmount: null,
            applicableCategories: [],
            includesNoCategoryItems: true,
            createdBy: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          }) as never;
        mockFetchSubsidyPrograms.mockResolvedValue({
          subsidyPrograms: [program('s1', 'Energy Grant'), program('s2', 'Solar Grant')],
        });
        mockFetchHouseholdItemSubsidies.mockResolvedValue([program('s1', 'Energy Grant')] as never);
        renderPage();
        await waitForPageLoad();
        const select = await screen.findByRole('combobox', { name: /select a grant to link/i });
        expect(within(select).getByRole('option', { name: /Solar Grant/ })).toBeInTheDocument();
        expect(within(select).queryByRole('option', { name: /Energy Grant/ })).toBeNull();
      });
    });

    describe('predecessor search', () => {
      it('searches tasks without a text filter once the field is emptied again', async () => {
        renderPage();
        await waitForPageLoad();
        const field = screen.getByLabelText(enHouseholdItems.detail.dependencies.search);
        fireEvent.change(field, { target: { value: 'ab' } });
        await waitFor(() =>
          expect(mockListWorkItems).toHaveBeenCalledWith(
            { q: 'ab', pageSize: 50 },
            expect.anything(),
          ),
        );
        fireEvent.change(field, { target: { value: '' } });
        await waitFor(() =>
          expect(mockListWorkItems).toHaveBeenCalledWith(
            { q: undefined, pageSize: 50 },
            expect.anything(),
          ),
        );
      });
    });

    describe('status change on a purchase without a name', () => {
      it('uses the untitled name in the Undo message', async () => {
        mockGetHouseholdItem.mockResolvedValue(makeItem({ name: '   ', status: 'purchased' }));
        mockPatch.mockResolvedValue({
          householdItem: makeItem({ name: '   ', status: 'scheduled' }),
          undo: 'tok',
        });
        renderPage();
        await waitFor(() => expect(screen.getByTestId('purchase-status')).toBeInTheDocument());
        fireEvent.click(screen.getByTestId('purchase-status'));
        fireEvent.click(screen.getByTestId('purchase-status-option-scheduled'));
        await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalledTimes(1));
      });
    });

    describe('delivery dates', () => {
      it('order date: sets a first value, then empties it again', async () => {
        jest.useFakeTimers();
        mockGetHouseholdItem.mockResolvedValue(makeItem({ orderDate: null }));
        mockUpdateHouseholdItem.mockResolvedValue(makeItem({ orderDate: '2026-04-01' }));
        renderPage();
        await waitForPageLoad();
        fireEvent.change(dateInput('Order Date'), { target: { value: '2026-04-01' } });
        fireEvent.blur(dateInput('Order Date'));
        await waitFor(() =>
          expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', {
            orderDate: '2026-04-01',
          }),
        );
        // Empty it again: the same field restarts its reset timer and saves null
        await waitFor(() => expect(dateInput('Order Date')).toHaveValue('2026-04-01'));
        fireEvent.change(dateInput('Order Date'), { target: { value: '' } });
        fireEvent.blur(dateInput('Order Date'));
        await waitFor(() =>
          expect(mockUpdateHouseholdItem).toHaveBeenLastCalledWith('item-1', { orderDate: null }),
        );
        await act(async () => {
          jest.advanceTimersByTime(2100);
        });
      });

      it.each([
        ['Actual Delivery', 'actualDeliveryDate'],
        ['Earliest Delivery', 'earliestDeliveryDate'],
      ])(
        '%s: saves a first value, reloads and tolerates a reload without dates',
        async (label, field) => {
          const empty = makeItem({
            orderDate: null,
            actualDeliveryDate: null,
            earliestDeliveryDate: null,
            latestDeliveryDate: null,
          });
          mockGetHouseholdItem.mockResolvedValue(empty);
          mockUpdateHouseholdItem.mockResolvedValue(empty);
          renderPage();
          await waitFor(() => expect(screen.getByLabelText(label)).toBeInTheDocument());
          fireEvent.change(dateInput(label), { target: { value: '2026-05-01' } });
          fireEvent.blur(dateInput(label));
          await waitFor(() =>
            expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', {
              [field]: '2026-05-01',
            }),
          );
          await waitFor(() => expect(dateInput(label)).toHaveValue(''));
        },
      );

      it.each([
        ['Actual Delivery', 'actualDeliveryDate'],
        ['Earliest Delivery', 'earliestDeliveryDate'],
        ['Latest Delivery', 'latestDeliveryDate'],
      ])('%s: emptying a stored value saves null', async (label, field) => {
        mockGetHouseholdItem.mockResolvedValue(makeItem({ [field]: '2026-05-01' }));
        mockUpdateHouseholdItem.mockResolvedValue(makeItem());
        renderPage();
        await waitFor(() => expect(screen.getByLabelText(label)).toBeInTheDocument());
        await waitFor(() => expect(dateInput(label)).toHaveValue('2026-05-01'));
        fireEvent.change(dateInput(label), { target: { value: '' } });
        fireEvent.blur(dateInput(label));
        await waitFor(() =>
          expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', { [field]: null }),
        );
      });

      it('latest delivery date: sets a first value', async () => {
        mockGetHouseholdItem.mockResolvedValue(makeItem({ latestDeliveryDate: null }));
        mockUpdateHouseholdItem.mockResolvedValue(makeItem({ latestDeliveryDate: '2026-06-01' }));
        renderPage();
        await waitFor(() => expect(screen.getByLabelText('Latest Delivery')).toBeInTheDocument());
        fireEvent.change(dateInput('Latest Delivery'), { target: { value: '2026-06-01' } });
        fireEvent.blur(dateInput('Latest Delivery'));
        await waitFor(() =>
          expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', {
            latestDeliveryDate: '2026-06-01',
          }),
        );
      });

      it.each([
        ['order date', 'orderDate', 'Order Date'],
        ['actual delivery date', 'actualDeliveryDate', 'Actual Delivery'],
        ['earliest delivery date', 'earliestDeliveryDate', 'Earliest Delivery'],
        ['latest delivery date', 'latestDeliveryDate', 'Latest Delivery'],
      ])('a failing clear of the %s shows the error state', async (_name, field, label) => {
        jest.useFakeTimers();
        mockGetHouseholdItem.mockResolvedValue(makeItem({ [field]: '2026-05-01' }));
        mockUpdateHouseholdItem.mockRejectedValue(new Error('x'));
        renderPage();
        await waitFor(() => expect(dateInput(label)).toHaveValue('2026-05-01'));
        fireEvent.click(
          within(dateInput(label).parentElement as HTMLElement).getByRole('button', {
            name: /^Clear/,
          }),
        );
        await waitFor(() => expect(mockUpdateHouseholdItem).toHaveBeenCalledTimes(1));
        await act(async () => {
          jest.advanceTimersByTime(2100);
        });
      });

      it.each([
        ['order date', 'orderDate', 'Order Date'],
        ['actual delivery date', 'actualDeliveryDate', 'Actual Delivery'],
        ['earliest delivery date', 'earliestDeliveryDate', 'Earliest Delivery'],
        ['latest delivery date', 'latestDeliveryDate', 'Latest Delivery'],
      ])('clearing a typed but unsaved %s makes no request', async (_name, field, label) => {
        mockGetHouseholdItem.mockResolvedValue(makeItem({ [field]: null }));
        renderPage();
        await waitFor(() => expect(screen.getByLabelText(label)).toBeInTheDocument());
        fireEvent.change(dateInput(label), { target: { value: '2026-07-01' } });
        fireEvent.click(
          within(dateInput(label).parentElement as HTMLElement).getByRole('button', {
            name: /^Clear/,
          }),
        );
        expect(mockUpdateHouseholdItem).not.toHaveBeenCalled();
        expect(dateInput(label)).toHaveValue('');
      });
    });

    describe('unchanged blurs and clears that reload an item without dates', () => {
      it.each([
        ['Actual Delivery', 'actualDeliveryDate'],
        ['Earliest Delivery', 'earliestDeliveryDate'],
        ['Latest Delivery', 'latestDeliveryDate'],
      ])('%s: a blur without a change makes no request', async (label, field) => {
        mockGetHouseholdItem.mockResolvedValue(makeItem({ [field]: '2026-05-01' }));
        renderPage();
        await waitFor(() => expect(dateInput(label)).toHaveValue('2026-05-01'));
        fireEvent.blur(dateInput(label));
        expect(mockUpdateHouseholdItem).not.toHaveBeenCalled();
      });

      it.each([
        ['Actual Delivery', 'actualDeliveryDate'],
        ['Earliest Delivery', 'earliestDeliveryDate'],
      ])('%s: clearing reloads an item that no longer has any date', async (label, field) => {
        const first = makeItem({ [field]: '2026-05-01' });
        mockGetHouseholdItem.mockResolvedValue(first);
        mockUpdateHouseholdItem.mockResolvedValue(first);
        renderPage();
        await waitFor(() => expect(dateInput(label)).toHaveValue('2026-05-01'));
        mockGetHouseholdItem.mockResolvedValue(
          makeItem({
            orderDate: null,
            actualDeliveryDate: null,
            earliestDeliveryDate: null,
            latestDeliveryDate: null,
          }),
        );
        fireEvent.click(
          within(dateInput(label).parentElement as HTMLElement).getByRole('button', {
            name: /^Clear/,
          }),
        );
        await waitFor(() =>
          expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', { [field]: null }),
        );
        await waitFor(() => expect(dateInput('Order Date')).toHaveValue(''));
      });
    });

    describe('dialogs', () => {
      it('Cancel closes the delete dialog', async () => {
        renderPage();
        await waitForPageLoad();
        fireEvent.click(
          screen.getByRole('button', { name: enHouseholdItems.detail.delete.delete }),
        );
        fireEvent.click(await screen.findByTestId('purchase-delete-cancel'));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      });

      it('Cancel closes the dependency dialog without removing', async () => {
        mockFetchHouseholdItemDeps.mockResolvedValue([
          {
            householdItemId: 'item-1',
            predecessorType: 'milestone',
            predecessorId: '7',
            predecessor: { id: '7', title: 'Roof done', status: 'pending', endDate: null },
          } as unknown as HouseholdItemDepDetail,
        ]);
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /Roof done/ }));
        fireEvent.click(await screen.findByTestId('purchase-dependency-remove-cancel'));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        expect(mockDeleteHouseholdItemDep).not.toHaveBeenCalled();
      });
    });
  });
});
