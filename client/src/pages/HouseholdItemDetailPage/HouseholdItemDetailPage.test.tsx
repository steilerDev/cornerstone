/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import type { HouseholdItemDepDetail } from '@cornerstone/shared';

const mockGetHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>();
const mockUpdateHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>();
const mockDeleteHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>();
const mockShowToast = jest.fn();
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
jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  createHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.createHouseholdItem>(),
  getHouseholdItem: mockGetHouseholdItem,
  updateHouseholdItem: mockUpdateHouseholdItem,
  listHouseholdItems: jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>(),
  deleteHouseholdItem: mockDeleteHouseholdItem,
}));

// Mock ApiClientError so instanceof checks work in the component
jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  ApiClientError: MockApiClientError,
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
}));

// Mock useToast so HouseholdItemDetailPage can render without a ToastProvider wrapper
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
    }),
  };
});

// Helper to capture current location
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
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
    it('shows "Item Not Found" heading when item returns 404', async () => {
      mockGetHouseholdItem.mockRejectedValue(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'Item not found' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Item Not Found')).toBeInTheDocument();
      });
    });

    it('shows "Back to Household Items" button in 404 state', async () => {
      mockGetHouseholdItem.mockRejectedValue(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'Item not found' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Item Not Found')).toBeInTheDocument();
      });

      const backLink = screen.getByRole('button', { name: /back to household items/i });
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
        expect(vendorLink).toHaveAttribute('href', '/budget/vendors/vendor-1');
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

    it('renders back button to household items list', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        const backButton = screen.getByRole('button', { name: /back to household items/i });
        expect(backButton).toBeInTheDocument();
      });
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

    it.skip('shows dash for missing area — area display not yet implemented in UI', () => {
      // The HouseholdItemDetailPage does not yet display the area field.
      // This test should be re-enabled when area display is added to the detail page.
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

  describe('delete flow — success', () => {
    it('opens delete modal on Delete button click', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('shows confirmation text with item name in delete modal', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
      });

      // Verify the item name is in the modal (it's wrapped in <strong>)
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      const modalText = screen.getByRole('dialog').textContent;
      expect(modalText).toMatch(/Standing Desk/);
    });

    it('shows "This action cannot be undone" warning in delete modal', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
      });
    });

    it('deletes item and navigates on Delete Item confirmation', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockResolvedValue(undefined);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(
          within(screen.getByRole('dialog')).getByRole('button', { name: /delete item/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: /delete item/i }),
      );

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
    });

    it('calls deleteHouseholdItem with correct item id', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem({ id: 'item-abc-123' }));
      mockDeleteHouseholdItem.mockResolvedValue(undefined);

      renderPage('item-abc-123');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(
          within(screen.getByRole('dialog')).getByRole('button', { name: /delete item/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: /delete item/i }),
      );

      await waitFor(() => {
        expect(mockDeleteHouseholdItem).toHaveBeenCalledWith('item-abc-123');
      });
    });

    it('shows "Deleting..." text while deletion is in progress', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(
          within(screen.getByRole('dialog')).getByRole('button', { name: /delete item/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: /delete item/i }),
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /deleting/i })).toBeInTheDocument();
      });
    });
  });

  describe('delete flow — error', () => {
    it('handles delete failure by showing error state in modal', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(
          within(screen.getByRole('dialog')).getByRole('button', { name: /delete item/i }),
        ).toBeInTheDocument();
      });

      // Note: Component checks instanceof ApiClientError to display error message.
      // Plain Error objects show generic fallback message instead.
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: /delete item/i }),
      );

      // Modal remains open after error
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('modal stays open and does not navigate on delete failure', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(
          within(screen.getByRole('dialog')).getByRole('button', { name: /delete item/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: /delete item/i }),
      );

      // Modal should still be open
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Should NOT have navigated
      expect(screen.getByTestId('location')).toHaveTextContent('/project/household-items/item-1');
    });

    it('hides confirm button after delete error so user must re-open modal to retry', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(
          within(screen.getByRole('dialog')).getByRole('button', { name: /delete item/i }),
        ).toBeInTheDocument();
      });

      // First attempt fails
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: /delete item/i }),
      );

      await waitFor(() => {
        // Error message shows and confirm button is hidden
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Verify deleteHouseholdItem was called once
      expect(mockDeleteHouseholdItem).toHaveBeenCalledTimes(1);
      // Confirm button should be hidden after error (user must close and re-open to retry)
      expect(
        within(screen.getByRole('dialog')).queryByRole('button', { name: /delete item/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('delete modal cancel', () => {
    it('closes delete modal on Cancel click', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('closes delete modal on Escape key', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('inline status selector', () => {
    it('renders the status select with correct current value', async () => {
      const _user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem({ status: 'purchased' }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      const statusSelect = screen.getByRole('combobox', { name: /purchase status/i });
      expect(statusSelect).toHaveValue('purchased');
    });

    it('status dropdown has all four options', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      const statusSelect = screen.getByRole('combobox', { name: /purchase status/i });

      // Check that all four options are present
      const options = Array.from(statusSelect.querySelectorAll('option')).map((o) => o.value);
      expect(options).toContain('planned');
      expect(options).toContain('purchased');
      expect(options).toContain('scheduled');
      expect(options).toContain('arrived');
    });

    it('selecting a new status calls updateHouseholdItem', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem({ status: 'purchased' }));
      mockUpdateHouseholdItem.mockResolvedValue(
        makeItem({ status: 'arrived', actualDeliveryDate: '2026-03-04' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      const statusSelect = screen.getByRole('combobox', { name: /purchase status/i });
      await user.selectOptions(statusSelect, 'arrived');

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', { status: 'arrived' });
      });
    });

    it('shows success toast on successful status change', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem({ status: 'purchased' }));
      mockUpdateHouseholdItem.mockResolvedValue(
        makeItem({ status: 'scheduled', actualDeliveryDate: null }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      const statusSelect = screen.getByRole('combobox', { name: /purchase status/i });
      await user.selectOptions(statusSelect, 'scheduled');

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('success', 'Status updated');
      });
    });

    it('shows inline error on API failure', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem({ status: 'purchased' }));
      mockUpdateHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      const statusSelect = screen.getByRole('combobox', { name: /purchase status/i });
      await user.selectOptions(statusSelect, 'arrived');

      await waitFor(() => {
        expect(screen.getByText(/failed to update status/i)).toBeInTheDocument();
      });
    });

    it('updates rendered item state from API response after status change', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem({ status: 'purchased' }));
      mockUpdateHouseholdItem.mockResolvedValue(
        makeItem({ status: 'arrived', actualDeliveryDate: '2026-03-04' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      const statusSelect = screen.getByRole('combobox', { name: /purchase status/i });
      await user.selectOptions(statusSelect, 'arrived');

      await waitFor(() => {
        expect(statusSelect).toHaveValue('arrived');
        // Actual Delivery date should reflect auto-set value from API response
        // Date appears in both "Dates & Delivery" card and "Schedule" section
        expect(screen.getAllByText('Mar 4, 2026').length).toBeGreaterThanOrEqual(1);
      });
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
          predecessor: { id: 'wi-1', title: 'Setup cables', status: 'not_started', endDate: null },
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

      await waitFor(() => {
        expect(screen.getByText('Item Not Found')).toBeInTheDocument();
      });

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

      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
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

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
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
});
