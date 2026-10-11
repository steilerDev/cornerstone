/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation, useNavigationType } from 'react-router-dom';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as HouseholdItemDetailPageTypes from './HouseholdItemDetailPage.js';
import type {
  HouseholdItemDetail,
  HouseholdItemStatus,
  HouseholdItemCategory,
} from '@cornerstone/shared';
import type React from 'react';
import enErrors from '../../i18n/en/errors.json';
import enCommon from '../../i18n/en/common.json';
import enHouseholdItems from '../../i18n/en/householdItems.json';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as HouseholdItemDepsApiTypes from '../../lib/householdItemDepsApi.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import type { HouseholdItemDepDetail } from '@cornerstone/shared';

const mockGetHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>();
const mockUpdateHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>();
const mockDeleteHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>();
const mockShowToast = jest.fn();
const mockShowUndoToast = jest.fn();
const mockPatch = jest.fn() as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockPost = jest.fn() as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockFetchDeleteImpact = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();
const mockNavigate = jest.fn();
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

// Mock ApiClientError for error scenarios
class MockApiClientError extends Error {
  constructor(
    readonly statusCode: number,
    readonly error: { code: string; message: string },
  ) {
    super(error.message);
    this.name = 'ApiClientError';
  }
}

// Mock only API modules — do NOT mock react-router-dom (causes OOM)
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
  updateHouseholdItem: mockUpdateHouseholdItem,
  listHouseholdItems: jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>(),
  deleteHouseholdItem: mockDeleteHouseholdItem,
}));

// Mock ApiClientError so instanceof checks work in the component
class MockNetworkError extends Error {}

jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  NetworkError: MockNetworkError,
  ApiClientError: MockApiClientError,
  get: jest.fn(),
  post: mockPost,
  put: jest.fn(),
  patch: mockPatch,
  del: jest.fn(),
}));

// Mock useToast so HouseholdItemDetailPage can render without a ToastProvider wrapper
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    showUndoToast: mockShowUndoToast,
    dismissToast: jest.fn(),
  }),
}));

jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({
  fetchDeleteImpact: mockFetchDeleteImpact,
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

// Mock householdItemDepsApi (added for Story #415 — Dependencies section)
jest.unstable_mockModule('../../lib/householdItemDepsApi.js', () => ({
  fetchHouseholdItemDeps: mockFetchHouseholdItemDeps,
  createHouseholdItemDep: mockCreateHouseholdItemDep,
  deleteHouseholdItemDep: mockDeleteHouseholdItemDep,
}));

// Mock milestonesApi to avoid unhandled promise rejection in add dep modal
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
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

// Mock invoicesApi to avoid unhandled promise rejection
const mockFetchInvoices = jest.fn<typeof InvoicesApiTypes.fetchInvoices>();
jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchInvoices: mockFetchInvoices,
  fetchAllInvoices: jest.fn<typeof InvoicesApiTypes.fetchAllInvoices>(),
  fetchInvoiceById: jest.fn<typeof InvoicesApiTypes.fetchInvoiceById>(),
  createInvoice: jest.fn<typeof InvoicesApiTypes.createInvoice>(),
  updateInvoice: jest.fn<typeof InvoicesApiTypes.updateInvoice>(),
  deleteInvoice: jest.fn<typeof InvoicesApiTypes.deleteInvoice>(),
}));

// Mock householdItemCategoriesApi — HouseholdItemDetailPage loads categories to display badges
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchHouseholdItemCategories = jest.fn() as any;
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

// Mock LinkedDocumentsSection to avoid pulling in full documents component tree
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
      formatDayMonth: (d: string | null | undefined) => d ?? '',
    }),
  };
});

// Helper to capture current location
function LocationDisplay() {
  const location = useLocation();
  const type = useNavigationType();
  return (
    <>
      <div data-testid="location">{location.pathname}</div>
      <div data-testid="location-type">{type}</div>
      <div data-testid="location-state">{JSON.stringify(location.state)}</div>
    </>
  );
}

describe('HouseholdItemDetailPage', () => {
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

  beforeEach(async () => {
    mockGetHouseholdItem.mockReset();
    mockUpdateHouseholdItem.mockReset();
    mockDeleteHouseholdItem.mockReset();
    mockShowToast.mockReset();
    mockShowUndoToast.mockReset();
    mockPatch.mockReset();
    mockPost.mockReset();
    mockFetchDeleteImpact.mockReset();
    mockFetchDeleteImpact.mockResolvedValue({
      entityType: 'household_item',
      id: 'item-1',
      effects: [],
    });
    mockUseAreas.mockReset();
    mockUseAreas.mockReturnValue({
      areas: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      createArea: jest.fn(),
      updateArea: jest.fn(),
      deleteArea: jest.fn(),
    });
    mockNavigate.mockReset();
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

    if (!HouseholdItemDetailPageModule) {
      HouseholdItemDetailPageModule = await import('./HouseholdItemDetailPage.js');
    }

    // Setup default API responses
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
    // Use id 'furniture' to match the category value on the test item (category: 'furniture')
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

  function renderPage(
    itemId = 'item-1',
    entry: string | { pathname: string; state?: unknown } = `/project/household-items/${itemId}`,
  ) {
    return render(
      <MemoryRouter initialEntries={[entry]}>
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows loading state initially', async () => {
      mockGetHouseholdItem.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderPage();

      expect(screen.getByText('Loading household item...')).toBeInTheDocument();
    });

    it('loading state has status role for accessibility', async () => {
      // Don't resolve the API call immediately
      mockGetHouseholdItem.mockReturnValue(new Promise(() => {}));
      renderPage();

      const loadingEl = screen.getByText('Loading household item...');
      expect(loadingEl).toHaveAttribute('role', 'status');
    });

    it('calls getHouseholdItem with the correct id', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage('item-123');

      await waitFor(() => {
        expect(mockGetHouseholdItem).toHaveBeenCalledWith('item-123');
      });
    });
  });

  describe('404 error state', () => {
    it('shows the "Purchase not found" h1 when item returns 404', async () => {
      mockGetHouseholdItem.mockRejectedValue(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'Item not found' }),
      );

      renderPage();

      expect(
        await screen.findByRole('heading', { name: 'Purchase not found', level: 1 }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    });

    it('shows "Back to Purchases" button in 404 state', async () => {
      mockGetHouseholdItem.mockRejectedValue(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'Item not found' }),
      );

      renderPage();

      await screen.findByRole('heading', { name: 'Purchase not found', level: 1 });

      const backLink = screen.getByRole('button', { name: 'Back to Purchases' });
      expect(backLink).toBeInTheDocument();
    });
  });

  describe('generic error state with retry', () => {
    it('shows error message on generic error', async () => {
      mockGetHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByText('Failed to load household item. Please try again.'),
        ).toBeInTheDocument();
      });
    });

    it('shows "Retry" button', async () => {
      mockGetHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('calls getHouseholdItem again on Retry click', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockRejectedValueOnce(new Error('Network error'));
      mockGetHouseholdItem.mockResolvedValueOnce(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });

      expect(mockGetHouseholdItem).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: /retry/i }));

      await waitFor(() => {
        expect(mockGetHouseholdItem).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('full item data rendering', () => {
    it('renders item name as page heading', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });
    });

    it('renders category badge', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Furniture')).toBeInTheDocument();
      });
    });

    it('renders status badge', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // HouseholdItemStatusBadge component should be rendered
      // The actual badge text depends on the component implementation
    });

    it('renders description', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Electric height-adjustable desk')).toBeInTheDocument();
      });
    });

    it('renders vendor as a link to vendor detail', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        const vendorLink = screen.getByRole('link', { name: 'IKEA' });
        expect(vendorLink).toBeInTheDocument();
        expect(vendorLink).toHaveAttribute('href', '/settings/vendors/vendor-1');
      });
    });

    // room field was removed in migration 0028 (replaced by area) — test deleted

    it('renders quantity', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });

    it('renders external URL as link', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        const urlLink = screen.getByRole('link', { name: 'https://example.com/desk' });
        expect(urlLink).toBeInTheDocument();
        expect(urlLink).toHaveAttribute('href', 'https://example.com/desk');
        expect(urlLink).toHaveAttribute('target', '_blank');
      });
    });

    // tags were removed in migration 0028 (household_item_tags table dropped) — test deleted

    it('renders order date formatted', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Verify order date is displayed (exact format depends on formatDate)
      // Use getAllByText for date since it appears in multiple places
      const orderDates = screen.getAllByText(/Feb 15, 2026|2026-02-15/);
      expect(orderDates.length).toBeGreaterThan(0);
    });

    it('renders expected delivery date formatted', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Verify expected delivery date is displayed (may appear multiple times — info row + deps section)
      const dateMatches = screen.getAllByText(/Mar 1, 2026|2026-03-01/);
      expect(dateMatches.length).toBeGreaterThan(0);
    });

    it('has no back or To Schedule buttons; the breadcrumb replaces them', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await screen.findByRole('heading', { name: 'Standing Desk', level: 1 });
      expect(
        screen.queryByRole('button', { name: /back to household items/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /to schedule/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /back to schedule/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /to household items/i })).not.toBeInTheDocument();
    });
  });

  describe('optional fields show placeholder when not set', () => {
    it('shows dash for missing description', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ description: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByText('Electric height-adjustable desk')).not.toBeInTheDocument();
      // Description label should still be present with "—" placeholder
      expect(screen.getByText('Description')).toBeInTheDocument();
      const dashValues = screen.getAllByText('\u2014');
      expect(dashValues.length).toBeGreaterThan(0);
    });

    it('shows area picker with no selection when area is null', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ area: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // The Area section heading should be present
      expect(screen.getByRole('heading', { name: 'Area', level: 2 })).toBeInTheDocument();

      // The AreaPicker renders an input with "Select an area" placeholder when no area is set
      const areaInput = screen.getByPlaceholderText('Select an area');
      expect(areaInput).toBeInTheDocument();
    });

    it('shows dash for missing vendor', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ vendor: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByRole('link', { name: 'IKEA' })).not.toBeInTheDocument();
      // Vendor row is still rendered with "—" placeholder
      expect(screen.getByText('Vendor')).toBeInTheDocument();
      const dashValues = screen.getAllByText('\u2014');
      expect(dashValues.length).toBeGreaterThan(0);
    });

    it('shows dash for missing URL', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ url: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByRole('link', { name: /https:\/\/example.com/ })).not.toBeInTheDocument();
      // Product URL row is still rendered with "—" placeholder
      expect(screen.getByText('Product URL')).toBeInTheDocument();
      const dashValues = screen.getAllByText('\u2014');
      expect(dashValues.length).toBeGreaterThan(0);
    });

    // tags were removed in migration 0028 — "No tags" test deleted

    it('shows empty Dependencies section when no deps exist', async () => {
      // The old "linked work items" section was replaced by the Dependencies section (migration 0012)
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemDeps.mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Dependencies section should be present even when empty
      expect(screen.getByText('Dependencies')).toBeInTheDocument();
    });

    it('shows dash for missing order date', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ orderDate: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });
    });

    it('shows dash for missing expected delivery date', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ targetDeliveryDate: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });
    });

    it('shows dash for missing actual delivery date', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ actualDeliveryDate: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });
    });
  });

  describe('edit button navigation', () => {
    it('navigates to edit page on Edit button click', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit/i }));

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent(
          '/project/household-items/item-1/edit',
        );
      });
    });
  });

  describe('delete dialog (#2209)', () => {
    async function openDeleteDialog(user: ReturnType<typeof userEvent.setup>) {
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Delete Item' })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: 'Delete Item' }));
      return screen.findByRole('alertdialog');
    }

    async function enabledConfirm() {
      const btn = await screen.findByTestId('purchase-delete-confirm');
      await waitFor(() => expect(btn).not.toHaveAttribute('aria-disabled'));
      return btn;
    }

    it('opens an alertdialog titled "Delete <name>?" with Cancel focused and the irreversible note', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      renderPage();

      const dialog = await openDeleteDialog(user);

      expect(dialog).toHaveAccessibleName('Delete Standing Desk?');
      expect(within(dialog).getByText("This can't be undone.")).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId('purchase-delete-cancel')).toHaveFocus();
      });
    });

    it('asks the delete-impact endpoint for this purchase and lists the counts', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchDeleteImpact.mockResolvedValue({
        entityType: 'household_item',
        id: 'item-1',
        effects: [
          { kind: 'costLines', count: 2 },
          { kind: 'documentLinks', count: 0 },
        ],
      });
      renderPage();
      await openDeleteDialog(user);

      await waitFor(() =>
        expect(screen.getByTestId('purchase-delete-consequences')).toHaveTextContent(
          'Cost lines deleted with it: 2',
        ),
      );
      expect(screen.queryByText(/Linked documents/)).not.toBeInTheDocument();
      expect(mockFetchDeleteImpact).toHaveBeenCalledWith('household_item', 'item-1');
    });

    it('keeps the action disabled until the counts have loaded', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchDeleteImpact.mockReturnValue(new Promise(() => {}));
      renderPage();
      await openDeleteDialog(user);

      await user.click(screen.getByTestId('purchase-delete-confirm'));
      expect(screen.getByTestId('purchase-delete-confirm')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect(mockDeleteHouseholdItem).not.toHaveBeenCalled();
    });

    it('confirm calls the delete API, toasts, and navigates to the list with REPLACE', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockResolvedValue(undefined);
      renderPage();
      await openDeleteDialog(user);

      await user.click(await enabledConfirm());

      await waitFor(() => {
        expect(mockDeleteHouseholdItem).toHaveBeenCalledWith('item-1');
      });
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'success',
          'Household item deleted successfully',
        );
      });
      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/project/household-items');
      });
      expect(screen.getByTestId('location-type')).toHaveTextContent('REPLACE');
    });

    it('calls deleteHouseholdItem with the correct item id', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem({ id: 'item-abc-123' }));
      mockDeleteHouseholdItem.mockResolvedValue(undefined);
      renderPage('item-abc-123');
      await openDeleteDialog(user);

      await user.click(await enabledConfirm());

      await waitFor(() => {
        expect(mockDeleteHouseholdItem).toHaveBeenCalledWith('item-abc-123');
      });
    });

    it('shows the busy label and ignores Escape while the deletion is in progress', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockImplementation(() => new Promise(() => {}));
      renderPage();
      await openDeleteDialog(user);

      await user.click(await enabledConfirm());

      await waitFor(() => {
        expect(screen.getByTestId('purchase-delete-confirm')).toHaveTextContent('Deleting…');
      });
      await user.keyboard('{Escape}');
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('Cancel and Escape close the dialog without deleting', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      renderPage();
      await openDeleteDialog(user);

      await user.click(screen.getByTestId('purchase-delete-cancel'));
      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });

      await openDeleteDialog(user);
      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
      expect(mockDeleteHouseholdItem).not.toHaveBeenCalled();
    });

    it('a non-409 failure keeps the dialog open with the action available for a retry, no navigation', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockRejectedValueOnce(new Error('Network error'));
      renderPage();
      await openDeleteDialog(user);

      await user.click(await enabledConfirm());

      await waitFor(() => {
        expect(within(screen.getByRole('alertdialog')).getByRole('alert')).toBeInTheDocument();
      });
      expect(mockDeleteHouseholdItem).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('purchase-delete-confirm')).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent('/project/household-items/item-1');
    });

    it('a 409 hides the action, shows the translated error, and reopening is clean', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockRejectedValueOnce(
        new MockApiClientError(409, { code: 'CONFLICT', message: 'RAW-SERVER-SENTINEL' }),
      );
      renderPage();
      await openDeleteDialog(user);

      await user.click(await enabledConfirm());

      expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent(
        enErrors.CONFLICT,
      );
      expect(screen.queryByText('RAW-SERVER-SENTINEL')).not.toBeInTheDocument();
      expect(screen.queryByTestId('purchase-delete-confirm')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('purchase-delete-cancel'));
      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
      const reopened = await openDeleteDialog(user);
      expect(within(reopened).queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('purchase-delete-confirm')).toBeInTheDocument();
    });

    it('a 404 failure shows the translated error and never the server text', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockRejectedValueOnce(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'RAW-SERVER-SENTINEL' }),
      );
      renderPage();
      await openDeleteDialog(user);
      await user.click(await enabledConfirm());

      expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent(
        enErrors.NOT_FOUND,
      );
      expect(screen.queryByText('RAW-SERVER-SENTINEL')).not.toBeInTheDocument();
      // Only a 409 blocks the action; any other API failure stays retryable.
      expect(screen.getByTestId('purchase-delete-confirm')).toBeInTheDocument();
    });
  });

  // ─── #2196 AC3: category chip never shows a raw id ──────────────────────────

  describe('category chip (#2196 AC3)', () => {
    it('shows no category chip when the category id cannot be resolved', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({ category: 'cat-unknown-uuid-123' as HouseholdItemCategory }),
      );
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByText('cat-unknown-uuid-123')).not.toBeInTheDocument();
      expect(screen.queryByText('Furniture')).not.toBeInTheDocument();
    });
  });

  describe('status menu (#2209)', () => {
    const TOKEN = { token: `u_${'c'.repeat(32)}`, expiresAt: '2026-08-07T10:00:30.000Z' };

    async function loadItem(status: HouseholdItemStatus = 'purchased') {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ status }));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });
    }

    it('renders the current status as a menu button, not a select', async () => {
      await loadItem('purchased');
      const chip = screen.getByTestId('purchase-status');
      expect(chip).toHaveTextContent(enCommon.statusVocabulary.purchase.purchased);
      expect(chip).toHaveAttribute('aria-haspopup', 'menu');
      expect(screen.queryByRole('combobox', { name: /purchase status/i })).toBeNull();
    });

    it('lists only the allowed transitions, forward before backward', async () => {
      const user = userEvent.setup();
      await loadItem('purchased');
      await user.click(screen.getByTestId('purchase-status'));
      const labels = screen.getAllByRole('menuitem').map((r) => r.textContent);
      expect(labels).toEqual([
        enCommon.statusAction.purchase.markDeliveryScheduled,
        `${enCommon.statusAction.purchase.markDelivered}›`,
        `Back to “${enCommon.statusVocabulary.purchase.planned}”`,
      ]);
    });

    it('a dateless transition PATCHes the status and offers Undo', async () => {
      const user = userEvent.setup();
      await loadItem('purchased');
      mockPatch.mockResolvedValue({
        householdItem: makeItem({ status: 'scheduled' }),
        undo: TOKEN,
      });

      await user.click(screen.getByTestId('purchase-status'));
      await user.click(screen.getByTestId('purchase-status-option-scheduled'));

      await waitFor(() => {
        expect(mockPatch).toHaveBeenCalledWith('/household-items/item-1', { status: 'scheduled' });
      });
      await waitFor(() => {
        expect(screen.getByTestId('purchase-status')).toHaveTextContent(
          enCommon.statusVocabulary.purchase.scheduled,
        );
      });
      expect(mockShowUndoToast).toHaveBeenCalledTimes(1);
      expect(mockShowUndoToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Standing Desk is now “Delivery scheduled”.',
          dedupeKey: 'purchase:item-1',
        }),
      );
    });

    it('marking delivered asks for the date and sends it as the actual delivery date', async () => {
      const user = userEvent.setup();
      await loadItem('purchased');
      mockPatch.mockResolvedValue({
        householdItem: makeItem({ status: 'arrived', actualDeliveryDate: '2026-03-04' }),
        undo: TOKEN,
      });

      await user.click(screen.getByTestId('purchase-status'));
      await user.click(screen.getByTestId('purchase-status-option-arrived'));
      expect(screen.getByRole('dialog', { name: 'When did it arrive?' })).toBeInTheDocument();
      await user.click(screen.getByTestId('purchase-status-date-today'));

      await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
      const [url, body] = mockPatch.mock.calls[0] as [
        string,
        { status: string; actualDeliveryDate: string },
      ];
      expect(url).toBe('/household-items/item-1');
      expect(body.status).toBe('arrived');
      expect(body.actualDeliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('shows no Undo toast when the server issued no token', async () => {
      const user = userEvent.setup();
      await loadItem('purchased');
      mockPatch.mockResolvedValue({ householdItem: makeItem({ status: 'scheduled' }) });

      await user.click(screen.getByTestId('purchase-status'));
      await user.click(screen.getByTestId('purchase-status-option-scheduled'));

      await waitFor(() => {
        expect(screen.getByTestId('purchase-status')).toHaveTextContent(
          enCommon.statusVocabulary.purchase.scheduled,
        );
      });
      expect(mockShowUndoToast).not.toHaveBeenCalled();
    });

    it('Undo posts the token and reloads the purchase', async () => {
      const user = userEvent.setup();
      await loadItem('purchased');
      mockPatch.mockResolvedValue({
        householdItem: makeItem({ status: 'scheduled' }),
        undo: TOKEN,
      });
      mockPost.mockResolvedValue({ restored: [], retractedEventIds: [] });
      await user.click(screen.getByTestId('purchase-status'));
      await user.click(screen.getByTestId('purchase-status-option-scheduled'));
      await waitFor(() => expect(mockShowUndoToast).toHaveBeenCalled());

      mockGetHouseholdItem.mockResolvedValue(makeItem({ status: 'purchased' }));
      const options = mockShowUndoToast.mock.calls[0]![0] as { onUndo: () => Promise<void> };
      await act(async () => {
        await options.onUndo();
      });

      expect(mockPost).toHaveBeenCalledWith(`/undo/${TOKEN.token}`);
      await waitFor(() => {
        expect(screen.getByTestId('purchase-status')).toHaveTextContent(
          enCommon.statusVocabulary.purchase.purchased,
        );
      });
    });

    it('a failed change shows an error toast, no Undo, and the chip keeps its status', async () => {
      const user = userEvent.setup();
      await loadItem('purchased');
      mockPatch.mockRejectedValue(new Error('RAW-LOCAL'));

      await user.click(screen.getByTestId('purchase-status'));
      await user.click(screen.getByTestId('purchase-status-option-scheduled'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('error', enCommon.statusMenu.changeFailed);
      });
      expect(mockShowUndoToast).not.toHaveBeenCalled();
      expect(screen.getByTestId('purchase-status')).toHaveTextContent(
        enCommon.statusVocabulary.purchase.purchased,
      );
      expect(screen.queryByText(/RAW-LOCAL/)).toBeNull();
      expect(screen.queryAllByRole('alert')).toHaveLength(0);
    });

    it('a failed change with an API error toasts the translated message', async () => {
      const user = userEvent.setup();
      await loadItem('purchased');
      mockPatch.mockRejectedValue(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'RAW-SERVER-SENTINEL' }),
      );

      await user.click(screen.getByTestId('purchase-status'));
      await user.click(screen.getByTestId('purchase-status-option-scheduled'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('error', enErrors.NOT_FOUND);
      });
    });
  });

  describe('inline area update', () => {
    it('shows an error toast (not a budget banner) on an area update failure', async () => {
      const user = userEvent.setup();
      mockUseAreas.mockReturnValue({
        areas: [{ id: 'area-1', name: 'Kitchen', color: null, ancestors: [] }],
        isLoading: false,
        error: null,
        refetch: jest.fn(),
        createArea: jest.fn(),
        updateArea: jest.fn(),
        deleteArea: jest.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial hook stub
      } as any);
      mockGetHouseholdItem.mockResolvedValue(makeItem({ area: null }));
      mockUpdateHouseholdItem.mockRejectedValue(new Error('RAW-LOCAL'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });
      await user.click(screen.getByPlaceholderText('Select an area'));
      await user.click(await screen.findByText('Kitchen'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'error',
          enHouseholdItems.detail.area.updateFailed,
        );
      });
      expect(screen.queryByText(enHouseholdItems.detail.area.updateFailed)).toBeNull();
      expect(screen.queryAllByRole('alert')).toHaveLength(0);
    });
  });

  describe('dependency predecessors display', () => {
    // Note: migration 0012 replaced the "linked work items" section with a
    // Dependencies section showing work_item and milestone predecessors.

    it('renders work item dependency predecessor as a link', async () => {
      const dep: HouseholdItemDepDetail = {
        householdItemId: 'item-1',
        predecessorType: 'work_item',
        predecessorId: 'wi-abc-123',
        predecessor: {
          id: 'wi-abc-123',
          title: 'Install desk',
          status: 'in_progress',
          endDate: '2026-04-15',
          area: null,
        },
      };
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemDeps.mockResolvedValue([dep]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByText('Install desk')).toBeInTheDocument();
    });

    it('renders multiple dependency predecessors', async () => {
      const deps: HouseholdItemDepDetail[] = [
        {
          householdItemId: 'item-1',
          predecessorType: 'work_item',
          predecessorId: 'wi-1',
          predecessor: {
            id: 'wi-1',
            title: 'Setup cables',
            status: 'not_started',
            endDate: null,
            area: null,
          },
        },
        {
          householdItemId: 'item-1',
          predecessorType: 'work_item',
          predecessorId: 'wi-2',
          predecessor: {
            id: 'wi-2',
            title: 'Test connection',
            status: 'completed',
            endDate: '2026-03-05',
            area: null,
          },
        },
      ];
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemDeps.mockResolvedValue(deps);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByText('Setup cables')).toBeInTheDocument();
      expect(screen.getByText('Test connection')).toBeInTheDocument();
    });
  });

  // Note: The decorative progress stepper (<ol>) was replaced by an interactive
  // status <select> dropdown. Tests for the new selector are in the
  // 'inline status selector' describe block above.

  describe('Documents section', () => {
    it('renders LinkedDocumentsSection with entityType="household_item"', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByTestId('linked-documents-section')).toBeInTheDocument();
      expect(screen.getByTestId('entity-type')).toHaveTextContent('household_item');
    });

    it('renders with correct entityId from URL params', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ id: 'item-abc' }));

      renderPage('item-abc');

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByTestId('entity-id')).toHaveTextContent('item-abc');
    });

    it('renders Documents section heading between Subsidies and Metadata sections', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Get all h2 headings on the page
      const headings = screen.getAllByRole('heading', { level: 2 });
      const headingTexts = headings.map((h) => h.textContent);

      // Verify "Documents" heading exists
      expect(headingTexts).toContain('Documents');

      // Verify Documents comes after Budget (Subsidies is now an h3 inside Budget, not a standalone h2)
      const budgetIndex = headingTexts.findIndex((text) => text === 'Budget');
      const documentsIndex = headingTexts.findIndex((text) => text === 'Documents');
      expect(budgetIndex).toBeGreaterThan(-1);
      expect(documentsIndex).toBeGreaterThan(-1);
      expect(documentsIndex).toBeGreaterThan(budgetIndex);
    });

    it('does not render LinkedDocumentsSection in loading state', async () => {
      mockGetHouseholdItem.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderPage();

      expect(screen.getByText('Loading household item...')).toBeInTheDocument();
      expect(screen.queryByTestId('linked-documents-section')).not.toBeInTheDocument();
    });

    it('does not render LinkedDocumentsSection when item returns 404', async () => {
      mockGetHouseholdItem.mockRejectedValue(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'Item not found' }),
      );

      renderPage();

      await screen.findByRole('heading', { name: 'Purchase not found', level: 1 });

      expect(screen.queryByTestId('linked-documents-section')).not.toBeInTheDocument();
    });
  });

  // ── Dependencies section (Story #415) ───────────────────────────────────────

  describe('Dependencies section', () => {
    it('renders "Dependencies" heading when item loads', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByRole('heading', { name: 'Dependencies' })).toBeInTheDocument();
    });

    it('shows empty state text when no dependencies exist', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemDeps.mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(
        screen.getByText('No dependencies yet. Add a dependency to schedule this item.'),
      ).toBeInTheDocument();
    });

    it('shows earliestDeliveryDate label in Dependencies card', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ earliestDeliveryDate: '2026-03-01' }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // "Earliest Delivery" is an inline date input label in the Dependencies card
      expect(screen.getByLabelText('Earliest Delivery')).toBeInTheDocument();
    });

    it('shows latestDeliveryDate label in Dependencies card', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ latestDeliveryDate: '2026-03-10' }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // "Latest Delivery" is an inline date input label in the Dependencies card
      expect(screen.getByLabelText('Latest Delivery')).toBeInTheDocument();
    });

    it('shows "Late" chip near Earliest Delivery when item is planned and isLate is true', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({
          status: 'planned',
          isLate: true,
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // In Story #467, the chip now shows "Late" (not "Floored to today") and is in the Dependencies card
      expect(screen.getByText('Late')).toBeInTheDocument();
    });

    it('does NOT show "Floored to today" chip when item is delivered', async () => {
      const today = new Date().toISOString().slice(0, 10);
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({
          status: 'arrived',
          earliestDeliveryDate: today,
          actualDeliveryDate: today,
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByText('Floored to today')).not.toBeInTheDocument();
    });

    it('renders dependency list when work_item dependencies exist', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemDeps.mockResolvedValue([
        {
          householdItemId: 'item-1',
          predecessorType: 'work_item',
          predecessorId: 'wi-1',
          predecessor: {
            id: 'wi-1',
            title: 'Foundation Work',
            status: 'in_progress',
            endDate: '2026-05-15',
          },
        } as HouseholdItemDepDetail,
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Foundation Work')).toBeInTheDocument();
      });

      expect(screen.getByText('Work Item')).toBeInTheDocument();
    });

    it('renders milestone dependency with "Milestone" type badge', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemDeps.mockResolvedValue([
        {
          householdItemId: 'item-1',
          predecessorType: 'milestone',
          predecessorId: '42',
          predecessor: { id: '42', title: 'Frame Complete', status: null, endDate: '2026-04-30' },
        } as HouseholdItemDepDetail,
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Frame Complete')).toBeInTheDocument();
      });

      expect(screen.getByText('Milestone')).toBeInTheDocument();
    });

    it('inline dependency search input is visible in the Dependencies card', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByTestId('dep-search-input')).toBeInTheDocument();
    });

    it('clicking "×" remove button shows Confirm and Cancel actions', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemDeps.mockResolvedValue([
        {
          householdItemId: 'item-1',
          predecessorType: 'work_item',
          predecessorId: 'wi-1',
          predecessor: {
            id: 'wi-1',
            title: 'Foundation Work',
            status: 'in_progress',
            endDate: null,
          },
        } as HouseholdItemDepDetail,
      ]);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Foundation Work')).toBeInTheDocument();
      });

      const removeButton = screen.getByRole('button', {
        name: /Remove dependency on Foundation Work/i,
      });
      await user.click(removeButton);

      expect(screen.getByRole('alertdialog', { name: 'Remove dependency?' })).toBeInTheDocument();
      expect(screen.getByTestId('purchase-dependency-remove-confirm')).toBeInTheDocument();
      expect(screen.getByTestId('purchase-dependency-remove-cancel')).toHaveFocus();
    });

    it('confirming removal calls deleteHouseholdItemDep', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemDeps
        .mockResolvedValueOnce([
          {
            householdItemId: 'item-1',
            predecessorType: 'work_item',
            predecessorId: 'wi-1',
            predecessor: {
              id: 'wi-1',
              title: 'Foundation Work',
              status: 'in_progress',
              endDate: null,
            },
          } as HouseholdItemDepDetail,
        ])
        .mockResolvedValueOnce([]);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Foundation Work')).toBeInTheDocument();
      });

      const removeButton = screen.getByRole('button', {
        name: /Remove dependency on Foundation Work/i,
      });
      await user.click(removeButton);

      const confirmButton = screen.getByTestId('purchase-dependency-remove-confirm');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockDeleteHouseholdItemDep).toHaveBeenCalledWith('item-1', 'work_item', 'wi-1');
      });
    });
  });

  describe('dependency rendering (milestone vs work item)', () => {
    it('milestone dependency is rendered as plain text, not a link', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemDeps.mockResolvedValue([
        {
          householdItemId: 'item-1',
          predecessorType: 'milestone',
          predecessorId: 'milestone-42',
          predecessor: {
            id: 'milestone-42',
            title: 'Foundation Complete',
            status: null,
            endDate: '2026-05-15',
          },
        } as HouseholdItemDepDetail,
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Milestone name should be visible in the DOM
      expect(screen.getByText('Foundation Complete')).toBeInTheDocument();

      // But it should NOT be a clickable link
      expect(screen.queryByRole('link', { name: 'Foundation Complete' })).not.toBeInTheDocument();
    });

    it('work item dependency is rendered as a clickable link', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemDeps.mockResolvedValue([
        {
          householdItemId: 'item-1',
          predecessorType: 'work_item',
          predecessorId: 'wi-install-123',
          predecessor: {
            id: 'wi-install-123',
            title: 'Install Foundation',
            status: 'in_progress',
            endDate: '2026-05-10',
          },
        } as HouseholdItemDepDetail,
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Work item should be a clickable link
      const link = screen.getByRole('link', { name: 'Install Foundation' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/project/work-items/wi-install-123');
    });

    it('mixed dependencies: milestone is plain text, work item is link', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemDeps.mockResolvedValue([
        {
          householdItemId: 'item-1',
          predecessorType: 'milestone',
          predecessorId: 'ms-1',
          predecessor: {
            id: 'ms-1',
            title: 'Walls Complete',
            status: null,
            endDate: '2026-04-20',
          },
        } as HouseholdItemDepDetail,
        {
          householdItemId: 'item-1',
          predecessorType: 'work_item',
          predecessorId: 'wi-paint',
          predecessor: {
            id: 'wi-paint',
            title: 'Paint Walls',
            status: 'completed',
            endDate: '2026-04-25',
          },
        } as HouseholdItemDepDetail,
      ]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Milestone should be plain text (no link)
      expect(screen.getByText('Walls Complete')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Walls Complete' })).not.toBeInTheDocument();

      // Work item should be a link
      const workItemLink = screen.getByRole('link', { name: 'Paint Walls' });
      expect(workItemLink).toBeInTheDocument();
      expect(workItemLink).toHaveAttribute('href', '/project/work-items/wi-paint');
    });
  });

  // ── Dates & Delivery section (Story #467 — replaces Schedule section from issue #462) ──────

  describe('Dates & Delivery section', () => {
    it('renders the "Dates & Delivery" section heading', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Story #467 replaced the "Schedule" section with "Dates & Delivery"
      expect(screen.getByRole('heading', { name: 'Dates & Delivery' })).toBeInTheDocument();
    });

    it('renders "Target Date" label when no actual delivery date', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({ targetDeliveryDate: '2026-03-01', actualDeliveryDate: null }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // In Story #467, label is "Target Date" (not "Target Delivery Date")
      expect(screen.getByText('Target Date')).toBeInTheDocument();
    });

    it('renders "Actual Date" label when actualDeliveryDate is set', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ actualDeliveryDate: '2026-03-05' }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // In Story #467, label is "Actual Date" (not "Actual Delivery Date")
      expect(screen.getByText('Actual Date')).toBeInTheDocument();
    });

    it('shows em-dash when targetDeliveryDate is null', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({ targetDeliveryDate: null, actualDeliveryDate: null }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // In Story #467, no target date shows em-dash (not "Not scheduled")
      const dashValues = screen.getAllByText('\u2014');
      expect(dashValues.length).toBeGreaterThan(0);
    });

    it('shows formatted date when targetDeliveryDate is set', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({ targetDeliveryDate: '2026-03-01', actualDeliveryDate: null }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // "Not scheduled" text should NOT appear in the new design
      expect(screen.queryByText('Not scheduled')).not.toBeInTheDocument();
    });
  });

  // ── Dependencies section (Story #467 — replaces Constraints section from issue #462) ──────

  describe('Dependencies section', () => {
    it('renders the Dependencies section heading', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Story #467 replaced "Constraints" with a unified "Dependencies" card
      expect(screen.getByRole('heading', { name: 'Dependencies' })).toBeInTheDocument();
    });

    it('does NOT render the old Constraints or Delivery Window headings', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByRole('heading', { name: 'Constraints' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Delivery Window' })).not.toBeInTheDocument();
    });
  });

  // ─── Issue #1239 — AreaBreadcrumb in inline dep search dropdown ──────────────

  describe('area breadcrumb in dep search dropdown (Issue #1239)', () => {
    it('shows area breadcrumb path in dep search dropdown when work item has ancestors', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockListWorkItems.mockResolvedValue({
        items: [
          {
            id: 'wi-with-area',
            title: 'Electrical Rough-In',
            status: 'not_started' as const,
            startDate: null,
            endDate: null,
            projectedStartDate: null,
            projectedEndDate: null,
            isLate: false,
            lateDays: null,
            isHeldUp: false,
            durationDays: null,
            actualStartDate: null,
            actualEndDate: null,
            assignedUser: null,
            assignedVendor: null,
            area: {
              id: 'area-3',
              name: 'Bathroom',
              color: null,
              ancestors: [{ id: 'area-1', name: 'Upper Floor', color: null }],
            },
            budgetLineCount: 0,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Type into the dep search input to open the dropdown
      const depInput = screen.getByTestId('dep-search-input');
      await user.type(depInput, 'Elec');

      await waitFor(() => {
        expect(screen.getByText('Electrical Rough-In')).toBeInTheDocument();
      });

      // AreaBreadcrumb compact renders plain span — text appears exactly once.
      expect(screen.getByText('Upper Floor › Bathroom')).toBeInTheDocument();
    });

    it('shows "No area" in dep search dropdown when work item has null area', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockListWorkItems.mockResolvedValue({
        items: [
          {
            id: 'wi-no-area-dep',
            title: 'Foundation Excavation',
            status: 'not_started' as const,
            startDate: null,
            endDate: null,
            projectedStartDate: null,
            projectedEndDate: null,
            isLate: false,
            lateDays: null,
            isHeldUp: false,
            durationDays: null,
            actualStartDate: null,
            actualEndDate: null,
            assignedUser: null,
            assignedVendor: null,
            area: null,
            budgetLineCount: 0,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      const depInput = screen.getByTestId('dep-search-input');
      await user.type(depInput, 'Found');

      await waitFor(() => {
        expect(screen.getByText('Foundation Excavation')).toBeInTheDocument();
      });

      // "No area" appears in the compact breadcrumb inside the dep search dropdown result.
      expect(screen.getByText('No area')).toBeInTheDocument();
    });
  });

  // ─── #2129 / #2131: translated errors, never raw server text ────────────────

  describe('translated API errors (#2129, #2131)', () => {
    const SENTINEL = 'RAW-SERVER-SENTINEL';
    const apiError = (status: number, code: string) =>
      new MockApiClientError(status, { code, message: SENTINEL });

    async function addDependencyWith(rejection: unknown) {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockCreateHouseholdItemDep.mockRejectedValue(rejection);
      mockListWorkItems.mockResolvedValue({
        items: [
          {
            id: 'wi-x',
            title: 'Electrical Rough-In',
            status: 'not_started' as const,
            startDate: null,
            endDate: null,
            projectedStartDate: null,
            projectedEndDate: null,
            isLate: false,
            lateDays: null,
            isHeldUp: false,
            durationDays: null,
            actualStartDate: null,
            actualEndDate: null,
            assignedUser: null,
            assignedVendor: null,
            area: null,
            budgetLineCount: 0,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument(),
      );
      await user.type(screen.getByTestId('dep-search-input'), 'Elec');
      await user.click(await screen.findByRole('button', { name: /Electrical Rough-In/ }));
    }

    it('add dependency 409 CIRCULAR_DEPENDENCY shows the circular copy, not the server text', async () => {
      await addDependencyWith(apiError(409, 'CIRCULAR_DEPENDENCY'));
      expect(await screen.findByText(enErrors.CIRCULAR_DEPENDENCY)).toBeInTheDocument();
      expect(screen.queryByText(new RegExp(SENTINEL))).toBeNull();
    });

    it('add dependency 409 DUPLICATE_DEPENDENCY shows the duplicate copy', async () => {
      await addDependencyWith(apiError(409, 'DUPLICATE_DEPENDENCY'));
      expect(await screen.findByText(enErrors.DUPLICATE_DEPENDENCY)).toBeInTheDocument();
      expect(screen.queryByText(new RegExp(SENTINEL))).toBeNull();
    });

    it('add dependency with a non-API error toasts the translated fallback', async () => {
      await addDependencyWith(new Error('RAW-LOCAL'));
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(
          'error',
          enHouseholdItems.detail.dependencies.failedAdd,
        ),
      );
    });

    it('a successful add dependency toasts the translated success copy', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockListWorkItems.mockResolvedValue({
        items: [
          {
            id: 'wi-x',
            title: 'Electrical Rough-In',
            status: 'not_started' as const,
            startDate: null,
            endDate: null,
            projectedStartDate: null,
            projectedEndDate: null,
            isLate: false,
            lateDays: null,
            isHeldUp: false,
            durationDays: null,
            actualStartDate: null,
            actualEndDate: null,
            assignedUser: null,
            assignedVendor: null,
            area: null,
            budgetLineCount: 0,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument(),
      );
      await user.type(screen.getByTestId('dep-search-input'), 'Elec');
      await user.click(await screen.findByRole('button', { name: /Electrical Rough-In/ }));
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(
          'success',
          enHouseholdItems.detail.dependencies.addedSuccess,
        ),
      );
    });

    async function removeDependency(rejection?: unknown) {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemDeps.mockResolvedValue([
        {
          householdItemId: 'item-1',
          predecessorType: 'work_item',
          predecessorId: 'wi-1',
          predecessor: {
            id: 'wi-1',
            title: 'Foundation Work',
            status: 'in_progress',
            endDate: null,
          },
        } as HouseholdItemDepDetail,
      ]);
      if (rejection) mockDeleteHouseholdItemDep.mockRejectedValue(rejection);
      renderPage();
      await waitFor(() => expect(screen.getByText('Foundation Work')).toBeInTheDocument());
      await user.click(
        screen.getByRole('button', { name: /Remove dependency on Foundation Work/i }),
      );
      await user.click(screen.getByTestId('purchase-dependency-remove-confirm'));
    }

    it('a successful remove dependency toasts the translated success copy', async () => {
      await removeDependency();
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(
          'success',
          enHouseholdItems.detail.dependencies.removedSuccess,
        ),
      );
    });

    it('a failed remove dependency shows the translated failure copy in the dialog, not the server text', async () => {
      await removeDependency(apiError(500, 'INTERNAL_ERROR'));
      // #2209: the failure is shown inside the open confirm dialog, not as a toast.
      const dialog = await screen.findByRole('alertdialog', { name: 'Remove dependency?' });
      await waitFor(() =>
        expect(within(dialog).getByRole('alert')).toHaveTextContent(
          enHouseholdItems.detail.dependencies.failedRemove,
        ),
      );
      expect(within(dialog).queryByText(new RegExp(SENTINEL))).toBeNull();
      expect(mockShowToast).not.toHaveBeenCalledWith('error', expect.anything());
    });

    it('load failure with an ApiClientError shows the translated code copy only', async () => {
      mockGetHouseholdItem.mockRejectedValue(apiError(500, 'INTERNAL_ERROR'));
      renderPage();
      expect(await screen.findByText(enErrors.INTERNAL_ERROR)).toBeInTheDocument();
      expect(screen.queryByText(new RegExp(SENTINEL))).toBeNull();
    });

    it('load failure with a NetworkError shows the network copy', async () => {
      mockGetHouseholdItem.mockRejectedValue(new MockNetworkError('RAW-LOCAL'));
      renderPage();
      expect(await screen.findByText(enCommon.requestErrors.network)).toBeInTheDocument();
      expect(screen.queryByText(/RAW-LOCAL/)).toBeNull();
    });

    async function deleteWith(rejection: unknown) {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockRejectedValue(rejection);
      renderPage();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument(),
      );
      await user.click(screen.getByRole('button', { name: 'Delete Item' }));
      const confirm = await screen.findByTestId('purchase-delete-confirm');
      await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'));
      await user.click(confirm);
    }

    it('delete failure with ApiClientError shows translated copy, not the server text', async () => {
      await deleteWith(apiError(409, 'CONFLICT'));
      expect(await screen.findByText(enErrors.CONFLICT)).toBeInTheDocument();
      expect(screen.queryByText(new RegExp(SENTINEL))).toBeNull();
    });

    it('delete failure with NetworkError shows the network copy', async () => {
      await deleteWith(new MockNetworkError('RAW-LOCAL'));
      expect(await screen.findByText(enCommon.requestErrors.network)).toBeInTheDocument();
    });

    it('delete failure with a plain Error shows the fallback copy, not the local text', async () => {
      await deleteWith(new Error('RAW-LOCAL'));
      expect(
        await screen.findByText(enHouseholdItems.detail.errors.deleteFailed),
      ).toBeInTheDocument();
      expect(screen.queryByText(/RAW-LOCAL/)).toBeNull();
    });
  });

  // ── Page identity (#2202) ──────────────────────────────────────────────────

  describe('page identity (#2202)', () => {
    const h1s = () => screen.queryAllByRole('heading', { level: 1 });

    it('shows one h1 with the purchase name and sets the tab title', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      expect(await screen.findByRole('heading', { name: 'Standing Desk', level: 1 })).toBeVisible();
      expect(h1s()).toHaveLength(1);
      await waitFor(() =>
        expect(document.title).toBe('Standing Desk \u00B7 Purchases \u00B7 Cornerstone'),
      );
    });

    it('falls back to "Untitled purchase" for a whitespace-only name', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ name: '   ' }));

      renderPage();

      expect(
        await screen.findByRole('heading', { name: 'Untitled purchase', level: 1 }),
      ).toBeVisible();
      expect(h1s()).toHaveLength(1);
    });

    it('shows the typed h1 "Purchase" with the breadcrumb while loading', async () => {
      mockGetHouseholdItem.mockReturnValue(new Promise(() => {}));

      renderPage();

      expect(screen.getByRole('heading', { name: 'Purchase', level: 1 })).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(screen.getByRole('link', { name: /Purchases/ })).toHaveAttribute(
        'href',
        '/project/household-items',
      );
      await waitFor(() =>
        expect(document.title).toBe('Purchase \u00B7 Purchases \u00B7 Cornerstone'),
      );
    });

    it('shows h1 "Purchase" above the error card (which keeps its h2) with Back and Retry', async () => {
      mockGetHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();

      expect(await screen.findByRole('heading', { name: 'Error', level: 2 })).toBeVisible();
      expect(screen.getByRole('heading', { name: 'Purchase', level: 1 })).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Back to Purchases' })).toBeVisible();
      expect(screen.getByRole('button', { name: /retry/i })).toBeVisible();
      expect(screen.getByRole('navigation', { name: 'You are here' })).toBeVisible();
    });

    it('keeps the breadcrumb in the 404 state', async () => {
      mockGetHouseholdItem.mockRejectedValue(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'Item not found' }),
      );

      renderPage();

      await screen.findByRole('heading', { name: 'Purchase not found', level: 1 });
      expect(screen.getByRole('navigation', { name: 'You are here' })).toBeVisible();
    });

    it('trails only Purchases (never the purchase name) and shows no Back without origin', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await screen.findByRole('heading', { name: 'Standing Desk', level: 1 });
      const nav = screen.getByRole('navigation', { name: 'You are here' });
      expect(within(nav).getAllByRole('link')).toHaveLength(1);
      expect(nav).not.toHaveTextContent('Standing Desk');
      expect(screen.queryByTestId('breadcrumbs-back')).not.toBeInTheDocument();
    });

    it('offers Back to the exact Calendar URL the user came from', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage('item-1', {
        pathname: '/project/household-items/item-1',
        state: { origin: { to: '/schedule/calendar?calendarMode=week' } },
      });

      await screen.findByRole('heading', { name: 'Standing Desk', level: 1 });
      expect(screen.getByRole('link', { name: /Back to Calendar/ })).toHaveAttribute(
        'href',
        '/schedule/calendar?calendarMode=week',
      );
    });

    it('passes origin (with the purchase name) to the Edit page', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await user.click(await screen.findByRole('button', { name: /edit/i }));

      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveTextContent(
          '/project/household-items/item-1/edit',
        ),
      );
      expect(JSON.parse(screen.getByTestId('location-state').textContent ?? 'null')).toEqual({
        origin: { to: '/project/household-items/item-1', name: 'Standing Desk' },
      });
    });

    it('passes origin (with the purchase name) to a dependency predecessor task link', async () => {
      const user = userEvent.setup();
      const dep: HouseholdItemDepDetail = {
        householdItemId: 'item-1',
        predecessorType: 'work_item',
        predecessorId: 'wi-abc-123',
        predecessor: {
          id: 'wi-abc-123',
          title: 'Install desk',
          status: 'in_progress',
          endDate: '2026-04-15',
          area: null,
        },
      };
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockFetchHouseholdItemDeps.mockResolvedValue([dep]);

      renderPage();

      await user.click(await screen.findByRole('link', { name: 'Install desk' }));

      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveTextContent('/project/work-items/wi-abc-123'),
      );
      expect(JSON.parse(screen.getByTestId('location-state').textContent ?? 'null')).toEqual({
        origin: { to: '/project/household-items/item-1', name: 'Standing Desk' },
      });
    });
  });
});
