/**
 * @jest-environment jsdom
 *
 * #2129 — error-translation tests for HouseholdItemDetailPage's budget / subsidy / invoice /
 * move handlers. BudgetSection is replaced by a prop-capturing stub so the page's own
 * handlers can be invoked directly.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, waitFor, act, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as HouseholdItemDetailPageTypes from './HouseholdItemDetailPage.js';
import type {
  HouseholdItemDetail,
  HouseholdItemStatus,
  HouseholdItemCategory,
} from '@cornerstone/shared';
import type React from 'react';
import { LocalizedError } from '../../lib/localizedError.js';
import enErrors from '../../i18n/en/errors.json';
import enCommon from '../../i18n/en/common.json';
import enHouseholdItems from '../../i18n/en/householdItems.json';
import enBudget from '../../i18n/en/budget.json';
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
const mockDeleteInvoiceBudgetLine = jest.fn() as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockEditAndMoveBudgetLine = jest.fn() as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedBudgetSectionProps: any = null;
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

jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  fetchInvoiceBudgetLines: jest.fn(),
  createInvoiceBudgetLine: jest.fn(),
  updateInvoiceBudgetLine: jest.fn(),
  deleteInvoiceBudgetLine: mockDeleteInvoiceBudgetLine,
  editAndMoveBudgetLine: mockEditAndMoveBudgetLine,
}));

jest.unstable_mockModule('../../components/budget/BudgetSection.js', () => ({
  BudgetSection: (props: unknown) => {
    capturedBudgetSectionProps = props;
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

  async function load(invoiced = false) {
    capturedBudgetSectionProps = null;
    mockGetHouseholdItem.mockResolvedValue(makeItem());
    mockFetchHouseholdItemBudgets.mockResolvedValue([budgetLine(invoiced)]);
    mockDeleteHouseholdItemBudget.mockReset();
    mockLinkHouseholdItemSubsidy.mockReset();
    mockUnlinkHouseholdItemSubsidy.mockReset();
    mockUpdateHouseholdItemBudget.mockReset();
    mockDeleteInvoiceBudgetLine.mockReset();
    mockEditAndMoveBudgetLine.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    renderPage();
    await waitFor(() => {
      expect(capturedBudgetSectionProps?.budgetLines).toHaveLength(1);
    });
  }

  const inlineError = () => capturedBudgetSectionProps.inlineError as string | null;
  const expectInlineError = (text: string) =>
    waitFor(() => {
      expect(inlineError()).toBe(text);
    });

  async function confirmDelete() {
    await act(async () => {
      capturedBudgetSectionProps.budgetSectionHook.handleDeleteBudgetLine('bl-1');
    });
    await act(async () => {
      await capturedBudgetSectionProps.onConfirmDeleteBudgetLine();
    });
  }

  describe('delete budget line', () => {
    it('ApiClientError shows the code copy, never the server text', async () => {
      await load();
      mockDeleteHouseholdItemBudget.mockRejectedValue(apiError(409, 'CONFLICT'));
      await confirmDelete();
      await expectInlineError(enErrors.CONFLICT);
    });

    it('NetworkError shows the network copy', async () => {
      await load();
      mockDeleteHouseholdItemBudget.mockRejectedValue(new MockNetworkError('RAW-LOCAL'));
      await confirmDelete();
      await expectInlineError(enCommon.requestErrors.network);
    });

    it('any other error shows the deleteFailed copy', async () => {
      await load();
      mockDeleteHouseholdItemBudget.mockRejectedValue(new Error('RAW-LOCAL'));
      await confirmDelete();
      await expectInlineError(enBudget.budgetLineForm.errors.deleteFailed);
    });
  });

  describe('subsidy linking', () => {
    async function link(rejection: unknown) {
      await load();
      mockLinkHouseholdItemSubsidy.mockRejectedValue(rejection);
      await act(async () => {
        capturedBudgetSectionProps.budgetSectionHook.setSelectedSubsidyId('sub-1');
      });
      await act(async () => {
        await capturedBudgetSectionProps.onLinkSubsidy();
      });
    }

    it('409 shows the already-linked copy', async () => {
      await link(apiError(409, 'CONFLICT'));
      await expectInlineError(enHouseholdItems.detail.errors.alreadyLinkedSubsidy);
    });

    it('other ApiClientError shows the code copy, never the server text', async () => {
      await link(apiError(500, 'INTERNAL_ERROR'));
      await expectInlineError(enErrors.INTERNAL_ERROR);
    });

    it('NetworkError shows the network copy', async () => {
      await link(new MockNetworkError('RAW-LOCAL'));
      await expectInlineError(enCommon.requestErrors.network);
    });

    it('any other error shows the linkSubsidy copy', async () => {
      await link(new Error('RAW-LOCAL'));
      await expectInlineError(enHouseholdItems.detail.errors.linkSubsidy);
    });

    it('unlink failure shows the unlinkSubsidy copy', async () => {
      await load();
      mockUnlinkHouseholdItemSubsidy.mockRejectedValue(new Error('RAW-LOCAL'));
      await act(async () => {
        await capturedBudgetSectionProps.onUnlinkSubsidy('sub-1');
      });
      await expectInlineError(enHouseholdItems.detail.errors.unlinkSubsidy);
    });
  });

  describe('invoice unlink', () => {
    it('failure shows the unlinkInvoice copy', async () => {
      await load(true);
      mockDeleteInvoiceBudgetLine.mockRejectedValue(new Error('RAW-LOCAL'));
      await act(async () => {
        await capturedBudgetSectionProps.onUnlinkInvoice('bl-1', 'ibl-1');
      });
      await expectInlineError(enHouseholdItems.detail.errors.unlinkInvoice);
    });
  });

  describe('move budget line', () => {
    async function move(
      invoiced: boolean,
      type: 'work_item' | 'household_item',
      rejection?: unknown,
    ) {
      await load(invoiced);
      if (rejection !== undefined) {
        mockEditAndMoveBudgetLine.mockRejectedValue(rejection);
        mockUpdateHouseholdItemBudget.mockRejectedValue(rejection);
      }
      let thrown: unknown;
      await act(async () => {
        try {
          await capturedBudgetSectionProps.onMoveBudgetLine('bl-1', type, 'target-1');
        } catch (err) {
          thrown = err;
        }
      });
      return thrown;
    }

    // handleMoveBudgetLine has no try/catch: the picker in BudgetLineForm owns the message,
    // so the page neither banners it nor passes it to BudgetSection (it would render twice).
    it('invoice-linked move: ApiClientError is rethrown untouched and not set as the budget banner', async () => {
      const err = apiError(404, 'NOT_FOUND');
      expect(await move(true, 'work_item', err)).toBe(err);
      expect(inlineError() ?? null).toBeNull();
      expect(screen.queryByText(enErrors.NOT_FOUND)).toBeNull();
    });

    it('NetworkError is rethrown untouched and not set as the budget banner', async () => {
      const err = new MockNetworkError('RAW-LOCAL');
      expect(await move(false, 'household_item', err)).toBe(err);
      expect(inlineError() ?? null).toBeNull();
    });

    it('cross-table move without an invoice throws a LocalizedError with the translated copy', async () => {
      const thrown = await move(false, 'work_item');
      expect(thrown).toBeInstanceOf(LocalizedError);
      expect((thrown as Error).message).toBe(enBudget.budgetLineForm.moveCrossTableNoInvoiceError);
      expect(mockUpdateHouseholdItemBudget).not.toHaveBeenCalled();
      expect(inlineError() ?? null).toBeNull();
    });

    it('a non-Error rejection is rethrown as-is and not set as the budget banner', async () => {
      expect(await move(false, 'household_item', 'plain string')).toBe('plain string');
      expect(inlineError() ?? null).toBeNull();
    });

    it('a failed move renders no alert anywhere on the page', async () => {
      await move(false, 'household_item', new Error('RAW-LOCAL'));
      expect(screen.queryAllByRole('alert')).toHaveLength(0);
    });
  });
});
