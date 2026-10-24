/**
 * @jest-environment jsdom
 *
 * #2129 — error-translation tests for HouseholdItemDetailPage's grant (subsidy) handlers and
 * the cost-lines change callback. CostLinesSection and SubsidyLinkSection are replaced by
 * prop-capturing stubs so the page's own handlers can be invoked directly.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
import { render, waitFor, act, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockLinkHouseholdItemSubsidy = jest.fn() as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUnlinkHouseholdItemSubsidy = jest.fn() as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUpdateHouseholdItemBudget = jest.fn() as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDeleteHouseholdItemBudget = jest.fn() as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedCostLinesProps: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedSubsidyProps: any = null;
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

// useLocale throws outside a LocaleProvider; the page reads vatRate from it (#2194).
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

// Mock only API modules — do NOT mock react-router-dom (causes OOM)
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
  updateHouseholdItemBudget: mockUpdateHouseholdItemBudget,
  deleteHouseholdItemBudget: mockDeleteHouseholdItemBudget,
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
  linkHouseholdItemSubsidy: mockLinkHouseholdItemSubsidy,
  unlinkHouseholdItemSubsidy: mockUnlinkHouseholdItemSubsidy,
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

// Mock the Documents panel host to avoid pulling in the full documents component tree
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

// Helper to capture current location
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

jest.unstable_mockModule('../../components/CostLineTable/index.js', () => ({
  CostLinesSection: (props: unknown) => {
    capturedCostLinesProps = props;
    return null;
  },
}));

jest.unstable_mockModule('../../components/budget/SubsidyLinkSection.js', () => ({
  SubsidyLinkSection: (props: unknown) => {
    capturedSubsidyProps = props;
    return null;
  },
}));

describe('HouseholdItemDetailPage — handler error translation (#2129)', () => {
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
    mockDeleteHouseholdItemDep.mockResolvedValue({
      undo: { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' },
    });
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
        <OriginProbe />
      </MemoryRouter>,
    );
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  const SENTINEL = 'RAW-SERVER-SENTINEL';
  const apiError = (status: number, code: string) =>
    new MockApiClientError(status, { code, message: SENTINEL });

  const budgetLine = (invoiced = false) => ({
    id: 'bl-1',
    householdItemId: 'item-1',
    description: null,
    plannedAmount: 500,
    confidence: 'own_estimate' as const,
    confidenceMargin: 0.2,
    budgetCategory: null,
    budgetSource: null,
    vendor: null,
    actualCost: 0,
    actualCostPaid: 0,
    invoiceCount: invoiced ? 1 : 0,
    invoiceLink: invoiced
      ? {
          invoiceBudgetLineId: 'ibl-1',
          invoiceId: 'inv-1',
          invoiceNumber: null,
          invoiceDate: '2026-01-01',
          invoiceStatus: 'pending',
          itemizedAmount: 500,
          vendorId: null,
          vendorName: null,
        }
      : null,
    createdBy: null,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: true,
  });

  async function load() {
    capturedCostLinesProps = null;
    capturedSubsidyProps = null;
    mockGetHouseholdItem.mockResolvedValue(makeItem());
    mockFetchHouseholdItemBudgets.mockResolvedValue([budgetLine()]);
    mockLinkHouseholdItemSubsidy.mockReset();
    mockUnlinkHouseholdItemSubsidy.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    renderPage();
    await waitFor(() => {
      expect(capturedCostLinesProps?.lines).toHaveLength(1);
    });
  }

  // Grant errors render once, in the Cost section's own banner
  const expectInlineError = (text: string) =>
    waitFor(() => {
      const matches = screen.getAllByText(text);
      expect(matches).toHaveLength(1);
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    });

  describe('subsidy linking', () => {
    async function link(rejection: unknown) {
      await load();
      mockLinkHouseholdItemSubsidy.mockRejectedValue(rejection);
      await act(async () => {
        capturedSubsidyProps.onSelectSubsidy('sub-1');
      });
      await act(async () => {
        await capturedSubsidyProps.onLinkSubsidy();
      });
    }

    it('dismissing the banner clears the inline error', async () => {
      await link(new Error('RAW-LOCAL'));
      await expectInlineError(enHouseholdItems.detail.errors.linkSubsidy);

      await act(async () => {
        within(screen.getByRole('alert')).getByRole('button').click();
      });

      expect(screen.queryAllByRole('alert')).toHaveLength(0);
    });

    it('409 shows the already-linked copy', async () => {
      await link(apiError(409, 'CONFLICT'));
      await expectInlineError(enHouseholdItems.detail.errors.alreadyLinkedSubsidy);
    });

    it('other ApiClientError shows the code copy, never the server text', async () => {
      await link(apiError(500, 'INTERNAL_ERROR'));
      await expectInlineError(enErrors.INTERNAL_ERROR);
      expect(screen.queryByText(new RegExp(SENTINEL))).toBeNull();
    });

    it('NetworkError shows the network copy', async () => {
      await link(new MockNetworkError('RAW-LOCAL'));
      await expectInlineError(enCommon.requestErrors.network);
    });

    it('any other error shows the linkSubsidy copy', async () => {
      await link(new Error('RAW-LOCAL'));
      await expectInlineError(enHouseholdItems.detail.errors.linkSubsidy);
    });

    it('ignores a link request while no grant is selected', async () => {
      await load();
      await act(async () => {
        await capturedSubsidyProps.onLinkSubsidy();
      });
      expect(mockLinkHouseholdItemSubsidy).not.toHaveBeenCalled();
    });

    it('a successful link clears the selection and reloads the payback', async () => {
      await load();
      mockLinkHouseholdItemSubsidy.mockResolvedValue(undefined);
      const paybackBefore = mockFetchHouseholdItemSubsidyPayback.mock.calls.length;
      await act(async () => {
        capturedSubsidyProps.onSelectSubsidy('sub-1');
      });
      await act(async () => {
        await capturedSubsidyProps.onLinkSubsidy();
      });
      expect(mockLinkHouseholdItemSubsidy).toHaveBeenCalledWith('item-1', 'sub-1');
      expect(mockFetchHouseholdItemSubsidyPayback.mock.calls.length).toBeGreaterThan(paybackBefore);
      await waitFor(() => expect(capturedSubsidyProps.selectedSubsidyId).toBe(''));
      expect(capturedSubsidyProps.isLinking).toBe(false);
    });

    it('unlink failure shows the unlinkSubsidy copy', async () => {
      await load();
      mockUnlinkHouseholdItemSubsidy.mockRejectedValue(new Error('RAW-LOCAL'));
      await act(async () => {
        await capturedSubsidyProps.onUnlinkSubsidy('sub-1');
      });
      await expectInlineError(enHouseholdItems.detail.errors.unlinkSubsidy);
    });

    it('a successful unlink reloads the payback', async () => {
      await load();
      mockUnlinkHouseholdItemSubsidy.mockResolvedValue({
        undo: { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' },
      });
      const paybackBefore = mockFetchHouseholdItemSubsidyPayback.mock.calls.length;
      await act(async () => {
        await capturedSubsidyProps.onUnlinkSubsidy('sub-1');
      });
      expect(mockUnlinkHouseholdItemSubsidy).toHaveBeenCalledWith('item-1', 'sub-1');
      expect(mockFetchHouseholdItemSubsidyPayback.mock.calls.length).toBeGreaterThan(paybackBefore);
      expect(screen.queryAllByRole('alert')).toHaveLength(0);
    });
  });

  describe('cost lines changed', () => {
    it('a successful change clears the banner left by a failed grant action', async () => {
      await load();
      mockLinkHouseholdItemSubsidy.mockRejectedValue(new Error('RAW-LOCAL'));
      await act(async () => {
        capturedSubsidyProps.onSelectSubsidy('sub-1');
      });
      await act(async () => {
        await capturedSubsidyProps.onLinkSubsidy();
      });
      await expectInlineError(enHouseholdItems.detail.errors.linkSubsidy);

      await act(async () => {
        await capturedCostLinesProps.onChanged();
      });

      await waitFor(() => {
        expect(screen.queryAllByRole('alert')).toHaveLength(0);
      });
    });
  });

  describe('origin pass-through (#2203)', () => {
    it('hands the cost lines section this purchase as the origin of its invoice links', async () => {
      await load();

      expect(capturedCostLinesProps.linkState).toEqual({
        origin: { to: '/project/household-items/item-1', name: 'Standing Desk' },
      });
      expect(capturedCostLinesProps.host).toEqual({
        kind: 'household_item',
        id: 'item-1',
        label: 'Standing Desk',
      });
    });

    it('the company link opens the company page with this purchase as origin', async () => {
      await load();

      fireEvent.click(await screen.findByRole('link', { name: 'IKEA' }));

      expect(probedPath()).toBe('/companies/vendor-1');
      expect(probedOrigin()).toEqual({
        to: '/project/household-items/item-1',
        name: 'Standing Desk',
      });
    });
  });
});
