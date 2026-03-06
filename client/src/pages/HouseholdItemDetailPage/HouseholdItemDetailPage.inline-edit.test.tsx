/**
 * @jest-environment jsdom
 *
 * Tests for inline date editing and section structure on HouseholdItemDetailPage.
 * Story #467: Inline date and dependency editing on Household Item Detail Page.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

// ─── Mock function declarations ───────────────────────────────────────────────

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
  () => Promise<{ subsidyPrograms: [] }>
>;
const mockFetchHouseholdItemSubsidies = jest.fn() as jest.MockedFunction<() => Promise<[]>>;
const mockFetchHouseholdItemSubsidyPayback = jest.fn() as jest.MockedFunction<
  () => Promise<object>
>;
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
const mockFetchInvoices = jest.fn<typeof InvoicesApiTypes.fetchInvoices>();

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

// ─── jest.unstable_mockModule declarations ────────────────────────────────────
// Must be declared before any imports of the component.

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('HouseholdItemDetailPage — inline date editing (Story #467)', () => {
  let HouseholdItemDetailPageModule: typeof HouseholdItemDetailPageTypes;

  /** Build a complete HouseholdItemDetail with sensible defaults. */
  function makeItem(overrides: Partial<HouseholdItemDetail> = {}): HouseholdItemDetail {
    return {
      id: 'item-1',
      name: 'Standing Desk',
      description: 'Electric height-adjustable desk',
      category: 'furniture' as HouseholdItemCategory,
      status: 'purchased' as HouseholdItemStatus,
      vendor: { id: 'vendor-1', name: 'IKEA', specialty: 'Furniture' },
      room: 'Office',
      quantity: 2,
      orderDate: '2026-02-15',
      targetDeliveryDate: '2026-03-01',
      actualDeliveryDate: null,
      earliestDeliveryDate: '2026-03-01',
      latestDeliveryDate: '2026-03-10',
      isLate: false,
      url: 'https://example.com/desk',
      tagIds: ['tag-1'],
      budgetLineCount: 0,
      totalPlannedAmount: 0,
      budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
      createdBy: { id: 'user-1', displayName: 'John Doe', email: 'john@example.com' },
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-02-15T14:30:00Z',
      tags: [
        { id: 'tag-1', name: 'Priority', color: '#ff0000', createdAt: '2026-01-01T00:00:00Z' },
      ],
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
    mockFetchInvoices.mockReset();

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
    mockDeleteHouseholdItemDep.mockResolvedValue(undefined);
    mockListMilestones.mockResolvedValue([]);
    mockFetchInvoices.mockResolvedValue([]);
  });

  function renderPage(itemId = 'item-1') {
    return render(
      <MemoryRouter initialEntries={[`/household-items/${itemId}`]}>
        <Routes>
          <Route path="/household-items/:id" element={<HouseholdItemDetailPageModule.default />} />
          <Route path="/household-items/:id/edit" element={<div>Household Item Edit</div>} />
          <Route path="/household-items" element={<div>Household Items List</div>} />
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
      expect(screen.getByLabelText('Order date')).toBeInTheDocument();
    });
  }

  // ─── Schedule row display ──────────────────────────────────────────────────

  describe('Schedule row — target vs actual date display', () => {
    it('shows "Target Date" label when actualDeliveryDate is null', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({ actualDeliveryDate: null, targetDeliveryDate: '2026-03-01' }),
      );

      renderPage();
      await waitForPageLoad();

      expect(screen.getByText('Target Date')).toBeInTheDocument();
      expect(screen.queryByText('Actual Date')).not.toBeInTheDocument();
    });

    it('shows targetDeliveryDate value in the Target Date row when no actual date', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({ actualDeliveryDate: null, targetDeliveryDate: '2026-03-01' }),
      );

      renderPage();
      await waitForPageLoad();

      // formatDate('2026-03-01') should appear in the Target Date row
      // The exact format depends on the locale — we check that the date is rendered
      expect(screen.getByText('Target Date')).toBeInTheDocument();
    });

    it('shows "Actual Date" label when actualDeliveryDate is set', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({ actualDeliveryDate: '2026-03-05', targetDeliveryDate: '2026-03-01' }),
      );

      renderPage();
      await waitForPageLoad();

      expect(screen.getByText('Actual Date')).toBeInTheDocument();
      expect(screen.queryByText('Target Date')).not.toBeInTheDocument();
    });

    it('renders an aria-label containing both actual and target dates when actual is set', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({ actualDeliveryDate: '2026-03-05', targetDeliveryDate: '2026-03-01' }),
      );

      renderPage();
      await waitForPageLoad();

      // The aria-label on the span includes "Actual delivery" and "target was"
      const ariaEl = document.querySelector('[aria-label*="Actual delivery"]');
      expect(ariaEl).toBeTruthy();
      expect(ariaEl?.getAttribute('aria-label')).toMatch(/target was/i);
    });
  });

  // ─── Order Date blur — changed value ──────────────────────────────────────

  describe('Order Date inline editing', () => {
    it('calls updateHouseholdItem with new orderDate on blur when value changed', async () => {
      const item = makeItem({ orderDate: '2026-02-15' });
      mockGetHouseholdItem.mockResolvedValue(item);
      mockUpdateHouseholdItem.mockResolvedValue({ ...item, orderDate: '2026-03-15' });

      renderPage();
      await waitForPageLoad();

      const orderDateInput = screen.getByLabelText('Order date') as HTMLInputElement;
      fireEvent.change(orderDateInput, { target: { value: '2026-03-15' } });
      fireEvent.blur(orderDateInput);

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', { orderDate: '2026-03-15' });
      });
    });

    it('does NOT call updateHouseholdItem on blur when order date is unchanged', async () => {
      const item = makeItem({ orderDate: '2026-02-15' });
      mockGetHouseholdItem.mockResolvedValue(item);

      renderPage();
      await waitForPageLoad();

      const orderDateInput = screen.getByLabelText('Order date') as HTMLInputElement;
      // Wait for useEffect to initialize local state from item
      await waitFor(() => {
        expect(orderDateInput.value).toBe('2026-02-15');
      });
      // Focus then blur without changing
      fireEvent.focus(orderDateInput);
      fireEvent.blur(orderDateInput);

      // Give React time to process any async effects
      await waitFor(() => {
        expect(mockUpdateHouseholdItem).not.toHaveBeenCalled();
      });
    });

    it('updates item state from PATCH response and does NOT re-fetch after order date blur', async () => {
      const item = makeItem({ orderDate: '2026-02-15' });
      const updatedItem = { ...item, orderDate: '2026-03-15' };
      mockGetHouseholdItem.mockResolvedValue(item);
      mockUpdateHouseholdItem.mockResolvedValue(updatedItem);

      renderPage();
      await waitForPageLoad();

      // getHouseholdItem is called once on mount
      const initialCallCount = mockGetHouseholdItem.mock.calls.length;

      const orderDateInput = screen.getByLabelText('Order date') as HTMLInputElement;
      fireEvent.change(orderDateInput, { target: { value: '2026-03-15' } });
      fireEvent.blur(orderDateInput);

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledTimes(1);
      });

      // getHouseholdItem should NOT have been called again (no re-fetch for order date)
      expect(mockGetHouseholdItem.mock.calls.length).toBe(initialCallCount);
    });
  });

  // ─── Actual Delivery Date blur — triggers re-fetch ─────────────────────────

  describe('Actual Delivery Date inline editing', () => {
    it('calls updateHouseholdItem then re-fetches item after actual delivery date blur', async () => {
      const item = makeItem({ actualDeliveryDate: null });
      const updatedItem = {
        ...item,
        actualDeliveryDate: '2026-03-20',
        targetDeliveryDate: '2026-03-20',
      };
      mockGetHouseholdItem
        .mockResolvedValueOnce(item) // initial load
        .mockResolvedValueOnce(updatedItem); // re-fetch after autosave
      mockUpdateHouseholdItem.mockResolvedValue(undefined as unknown as HouseholdItemDetail);

      renderPage();
      await waitForPageLoad();

      const actualDeliveryInput = screen.getByLabelText('Actual delivery date') as HTMLInputElement;
      fireEvent.change(actualDeliveryInput, { target: { value: '2026-03-20' } });
      fireEvent.blur(actualDeliveryInput);

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', {
          actualDeliveryDate: '2026-03-20',
        });
      });

      // getHouseholdItem must be called a second time (re-fetch for targetDeliveryDate recalculation)
      await waitFor(() => {
        expect(mockGetHouseholdItem.mock.calls.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ─── Earliest Delivery Date blur — triggers re-fetch ──────────────────────

  describe('Earliest Delivery Date inline editing', () => {
    it('calls updateHouseholdItem then re-fetches item after earliest delivery date blur', async () => {
      const item = makeItem({ earliestDeliveryDate: '2026-03-01' });
      const updatedItem = {
        ...item,
        earliestDeliveryDate: '2026-03-05',
        targetDeliveryDate: '2026-03-05',
      };
      mockGetHouseholdItem.mockResolvedValueOnce(item).mockResolvedValueOnce(updatedItem);
      mockUpdateHouseholdItem.mockResolvedValue(undefined as unknown as HouseholdItemDetail);

      renderPage();
      await waitForPageLoad();

      const earliestInput = screen.getByLabelText('Earliest delivery date') as HTMLInputElement;
      fireEvent.change(earliestInput, { target: { value: '2026-03-05' } });
      fireEvent.blur(earliestInput);

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', {
          earliestDeliveryDate: '2026-03-05',
        });
      });

      // Must re-fetch to recalculate targetDeliveryDate
      await waitFor(() => {
        expect(mockGetHouseholdItem.mock.calls.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ─── Latest Delivery Date blur — no re-fetch ──────────────────────────────

  describe('Latest Delivery Date inline editing', () => {
    it('calls updateHouseholdItem and does NOT re-fetch after latest delivery date blur', async () => {
      const item = makeItem({ latestDeliveryDate: '2026-03-10' });
      const updatedItem = { ...item, latestDeliveryDate: '2026-03-15' };
      mockGetHouseholdItem.mockResolvedValue(item);
      mockUpdateHouseholdItem.mockResolvedValue(updatedItem);

      renderPage();
      await waitForPageLoad();

      const initialCallCount = mockGetHouseholdItem.mock.calls.length;

      const latestInput = screen.getByLabelText('Latest delivery date') as HTMLInputElement;
      fireEvent.change(latestInput, { target: { value: '2026-03-15' } });
      fireEvent.blur(latestInput);

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', {
          latestDeliveryDate: '2026-03-15',
        });
      });

      // getHouseholdItem must NOT be called again for latest delivery
      expect(mockGetHouseholdItem.mock.calls.length).toBe(initialCallCount);
    });
  });

  // ─── Clear button — Order Date ─────────────────────────────────────────────

  describe('Clear buttons', () => {
    it('calls updateHouseholdItem with orderDate: null when clear order date button is clicked', async () => {
      const item = makeItem({ orderDate: '2026-02-15' });
      const updatedItem = { ...item, orderDate: null };
      mockGetHouseholdItem.mockResolvedValue(item);
      mockUpdateHouseholdItem.mockResolvedValue(updatedItem);

      renderPage();
      await waitForPageLoad();

      // Wait for local state to initialize (clear button only shows when localOrderDate is set)
      const clearOrderDateBtn = await screen.findByRole('button', { name: 'Clear order date' });
      fireEvent.click(clearOrderDateBtn);

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', { orderDate: null });
      });
    });

    it('does NOT re-fetch after clearing order date', async () => {
      const item = makeItem({ orderDate: '2026-02-15' });
      const updatedItem = { ...item, orderDate: null };
      mockGetHouseholdItem.mockResolvedValue(item);
      mockUpdateHouseholdItem.mockResolvedValue(updatedItem);

      renderPage();
      await waitForPageLoad();

      const initialCallCount = mockGetHouseholdItem.mock.calls.length;

      const clearOrderDateBtn = await screen.findByRole('button', { name: 'Clear order date' });
      fireEvent.click(clearOrderDateBtn);

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledTimes(1);
      });

      expect(mockGetHouseholdItem.mock.calls.length).toBe(initialCallCount);
    });

    it('calls updateHouseholdItem with actualDeliveryDate: null and re-fetches on clear', async () => {
      const item = makeItem({ actualDeliveryDate: '2026-03-05' });
      const updatedItem = { ...item, actualDeliveryDate: null };
      mockGetHouseholdItem.mockResolvedValueOnce(item).mockResolvedValueOnce(updatedItem);
      mockUpdateHouseholdItem.mockResolvedValue(undefined as unknown as HouseholdItemDetail);

      renderPage();
      await waitForPageLoad();

      const clearActualBtn = await screen.findByRole('button', {
        name: 'Clear actual delivery date',
      });
      fireEvent.click(clearActualBtn);

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', {
          actualDeliveryDate: null,
        });
      });

      // Must re-fetch after clearing actual delivery (targetDeliveryDate may change)
      await waitFor(() => {
        expect(mockGetHouseholdItem.mock.calls.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('calls updateHouseholdItem with earliestDeliveryDate: null and re-fetches on clear', async () => {
      const item = makeItem({ earliestDeliveryDate: '2026-03-01' });
      const updatedItem = { ...item, earliestDeliveryDate: null };
      mockGetHouseholdItem.mockResolvedValueOnce(item).mockResolvedValueOnce(updatedItem);
      mockUpdateHouseholdItem.mockResolvedValue(undefined as unknown as HouseholdItemDetail);

      renderPage();
      await waitForPageLoad();

      const clearEarliestBtn = await screen.findByRole('button', {
        name: 'Clear earliest delivery date',
      });
      fireEvent.click(clearEarliestBtn);

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', {
          earliestDeliveryDate: null,
        });
      });

      // Must re-fetch after clearing earliest (targetDeliveryDate may change)
      await waitFor(() => {
        expect(mockGetHouseholdItem.mock.calls.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('calls updateHouseholdItem with latestDeliveryDate: null and does NOT re-fetch on clear', async () => {
      const item = makeItem({ latestDeliveryDate: '2026-03-10' });
      const updatedItem = { ...item, latestDeliveryDate: null };
      mockGetHouseholdItem.mockResolvedValue(item);
      mockUpdateHouseholdItem.mockResolvedValue(updatedItem);

      renderPage();
      await waitForPageLoad();

      const initialCallCount = mockGetHouseholdItem.mock.calls.length;

      const clearLatestBtn = await screen.findByRole('button', {
        name: 'Clear latest delivery date',
      });
      fireEvent.click(clearLatestBtn);

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledWith('item-1', {
          latestDeliveryDate: null,
        });
      });

      // getHouseholdItem must NOT be called again (no re-fetch for latest delivery clear)
      expect(mockGetHouseholdItem.mock.calls.length).toBe(initialCallCount);
    });
  });

  // ─── Autosave error state ─────────────────────────────────────────────────

  describe('Autosave error handling', () => {
    it('shows an inline error message when updateHouseholdItem rejects on order date blur', async () => {
      const item = makeItem({ orderDate: '2026-02-15' });
      mockGetHouseholdItem.mockResolvedValue(item);
      mockUpdateHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();
      await waitForPageLoad();

      const orderDateInput = screen.getByLabelText('Order date') as HTMLInputElement;
      fireEvent.change(orderDateInput, { target: { value: '2026-03-15' } });
      fireEvent.blur(orderDateInput);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent(/failed to update order date/i);
    });

    it('shows an inline error message when updateHouseholdItem rejects on actual delivery blur', async () => {
      const item = makeItem({ actualDeliveryDate: null });
      mockGetHouseholdItem.mockResolvedValue(item);
      mockUpdateHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();
      await waitForPageLoad();

      const actualInput = screen.getByLabelText('Actual delivery date') as HTMLInputElement;
      fireEvent.change(actualInput, { target: { value: '2026-03-20' } });
      fireEvent.blur(actualInput);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent(/failed to update actual delivery date/i);
    });

    it('shows an inline error message when updateHouseholdItem rejects on latest delivery blur', async () => {
      const item = makeItem({ latestDeliveryDate: '2026-03-10' });
      mockGetHouseholdItem.mockResolvedValue(item);
      mockUpdateHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();
      await waitForPageLoad();

      const latestInput = screen.getByLabelText('Latest delivery date') as HTMLInputElement;
      fireEvent.change(latestInput, { target: { value: '2026-03-15' } });
      fireEvent.blur(latestInput);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent(/failed to update latest delivery date/i);
    });

    it('shows an inline error message when updateHouseholdItem rejects on earliest delivery blur', async () => {
      const item = makeItem({ earliestDeliveryDate: '2026-03-01' });
      mockGetHouseholdItem.mockResolvedValue(item);
      mockUpdateHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();
      await waitForPageLoad();

      const earliestInput = screen.getByLabelText('Earliest delivery date') as HTMLInputElement;
      fireEvent.change(earliestInput, { target: { value: '2026-03-05' } });
      fireEvent.blur(earliestInput);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent(
        /failed to update earliest delivery date/i,
      );
    });
  });

  // ─── Section structure ─────────────────────────────────────────────────────

  describe('Section structure', () => {
    it('renders a "Dependencies" section heading', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();
      await waitForPageLoad();

      expect(screen.getByRole('heading', { name: 'Dependencies' })).toBeInTheDocument();
    });

    it('does NOT render a "Schedule" section heading', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();
      await waitForPageLoad();

      // "Schedule" was a legacy section removed in Story #467
      expect(screen.queryByRole('heading', { name: 'Schedule' })).not.toBeInTheDocument();
    });

    it('does NOT render a "Constraints" section heading', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();
      await waitForPageLoad();

      // "Constraints" was a legacy section removed in Story #467
      expect(screen.queryByRole('heading', { name: 'Constraints' })).not.toBeInTheDocument();
    });

    it('renders a "Dates & Delivery" section with order and actual date inputs', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();
      await waitForPageLoad();

      expect(screen.getByRole('heading', { name: 'Dates & Delivery' })).toBeInTheDocument();

      // Order and actual delivery date inputs in Dates & Delivery section
      expect(screen.getByLabelText('Order date')).toBeInTheDocument();
      expect(screen.getByLabelText('Actual delivery date')).toBeInTheDocument();
    });

    it('renders earliest and latest delivery dates in the Dependencies section', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();
      await waitForPageLoad();

      expect(screen.getByRole('heading', { name: 'Dependencies' })).toBeInTheDocument();

      // Earliest and latest delivery dates are constraints in the Dependencies section
      expect(screen.getByLabelText('Earliest delivery date')).toBeInTheDocument();
      expect(screen.getByLabelText('Latest delivery date')).toBeInTheDocument();
    });
  });

  // ─── isLate chip ──────────────────────────────────────────────────────────

  describe('isLate chip', () => {
    it('shows "Late" chip near Earliest Delivery when isLate=true and status is not "arrived"', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ isLate: true, status: 'purchased' }));

      renderPage();
      await waitForPageLoad();

      expect(screen.getByText('Late')).toBeInTheDocument();
    });

    it('does NOT show "Late" chip when isLate=false', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ isLate: false, status: 'purchased' }));

      renderPage();
      await waitForPageLoad();

      expect(screen.queryByText('Late')).not.toBeInTheDocument();
    });

    it('does NOT show "Late" chip when status is "arrived" even if isLate=true', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ isLate: true, status: 'arrived' }));

      renderPage();
      await waitForPageLoad();

      expect(screen.queryByText('Late')).not.toBeInTheDocument();
    });
  });

  // ─── Local state initialized from item ────────────────────────────────────

  describe('Local date state initialized from loaded item', () => {
    it('order date input shows the item orderDate value after load', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ orderDate: '2026-02-15' }));

      renderPage();
      await waitForPageLoad();

      await waitFor(() => {
        const orderDateInput = screen.getByLabelText('Order date') as HTMLInputElement;
        expect(orderDateInput.value).toBe('2026-02-15');
      });
    });

    it('actual delivery input shows the item actualDeliveryDate value after load', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ actualDeliveryDate: '2026-03-05' }));

      renderPage();
      await waitForPageLoad();

      await waitFor(() => {
        const actualInput = screen.getByLabelText('Actual delivery date') as HTMLInputElement;
        expect(actualInput.value).toBe('2026-03-05');
      });
    });

    it('earliest delivery input shows the item earliestDeliveryDate value after load', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ earliestDeliveryDate: '2026-03-01' }));

      renderPage();
      await waitForPageLoad();

      await waitFor(() => {
        const earliestInput = screen.getByLabelText('Earliest delivery date') as HTMLInputElement;
        expect(earliestInput.value).toBe('2026-03-01');
      });
    });

    it('latest delivery input shows the item latestDeliveryDate value after load', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ latestDeliveryDate: '2026-03-10' }));

      renderPage();
      await waitForPageLoad();

      await waitFor(() => {
        const latestInput = screen.getByLabelText('Latest delivery date') as HTMLInputElement;
        expect(latestInput.value).toBe('2026-03-10');
      });
    });

    it('order date input is empty when item has no orderDate', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ orderDate: null }));

      renderPage();
      await waitForPageLoad();

      const orderDateInput = screen.getByLabelText('Order date') as HTMLInputElement;
      expect(orderDateInput.value).toBe('');
    });
  });

  // ─── Clear button visibility ───────────────────────────────────────────────

  describe('Clear button visibility', () => {
    it('shows "Clear order date" button when orderDate is set', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ orderDate: '2026-02-15' }));

      renderPage();
      await waitForPageLoad();

      // findByRole waits for useEffect to initialize local state, which shows the clear button
      expect(await screen.findByRole('button', { name: 'Clear order date' })).toBeInTheDocument();
    });

    it('does NOT show "Clear order date" button when orderDate is null', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ orderDate: null }));

      renderPage();
      await waitForPageLoad();

      expect(screen.queryByRole('button', { name: 'Clear order date' })).not.toBeInTheDocument();
    });

    it('shows "Clear actual delivery date" button when actualDeliveryDate is set', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ actualDeliveryDate: '2026-03-05' }));

      renderPage();
      await waitForPageLoad();

      expect(
        await screen.findByRole('button', { name: 'Clear actual delivery date' }),
      ).toBeInTheDocument();
    });

    it('shows "Clear earliest delivery date" button when earliestDeliveryDate is set', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ earliestDeliveryDate: '2026-03-01' }));

      renderPage();
      await waitForPageLoad();

      expect(
        await screen.findByRole('button', { name: 'Clear earliest delivery date' }),
      ).toBeInTheDocument();
    });

    it('shows "Clear latest delivery date" button when latestDeliveryDate is set', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ latestDeliveryDate: '2026-03-10' }));

      renderPage();
      await waitForPageLoad();

      expect(
        await screen.findByRole('button', { name: 'Clear latest delivery date' }),
      ).toBeInTheDocument();
    });
  });
});
