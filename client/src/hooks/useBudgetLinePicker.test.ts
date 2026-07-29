/**
 * @jest-environment jsdom
 *
 * Unit tests for useBudgetLinePicker hook (Story #1564).
 *
 * Covers: initial state, openPicker, closePicker, handleSelectItem transitions,
 * showCreateBudgetLineForm, handleCreateBudgetLine success and error paths.
 *
 * External APIs are mocked; internal hook logic is tested through the real implementation.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import type * as WorkItemBudgetsApiModule from '../lib/workItemBudgetsApi.js';
import type * as HouseholdItemBudgetsApiModule from '../lib/householdItemBudgetsApi.js';
import type * as BudgetCategoriesApiModule from '../lib/budgetCategoriesApi.js';
import type * as BudgetSourcesApiModule from '../lib/budgetSourcesApi.js';
import type * as VendorsApiModule from '../lib/vendorsApi.js';
import type * as InvoiceBudgetLinesApiModule from '../lib/invoiceBudgetLinesApi.js';
import type { WorkItemBudgetLine, InvoiceBudgetLineDetailResponse } from '@cornerstone/shared';

// ─── Mock: API modules ────────────────────────────────────────────────────────

const mockFetchWorkItemBudgets = jest.fn<typeof WorkItemBudgetsApiModule.fetchWorkItemBudgets>();
const mockCreateWorkItemBudget = jest.fn<typeof WorkItemBudgetsApiModule.createWorkItemBudget>();

jest.unstable_mockModule('../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: mockFetchWorkItemBudgets,
  createWorkItemBudget: mockCreateWorkItemBudget,
  updateWorkItemBudget: jest.fn(),
  deleteWorkItemBudget: jest.fn(),
}));

const mockFetchHouseholdItemBudgets =
  jest.fn<typeof HouseholdItemBudgetsApiModule.fetchHouseholdItemBudgets>();
const mockCreateHouseholdItemBudget =
  jest.fn<typeof HouseholdItemBudgetsApiModule.createHouseholdItemBudget>();

jest.unstable_mockModule('../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: mockFetchHouseholdItemBudgets,
  createHouseholdItemBudget: mockCreateHouseholdItemBudget,
  updateHouseholdItemBudget: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));

const mockFetchBudgetCategories = jest.fn<typeof BudgetCategoriesApiModule.fetchBudgetCategories>();

jest.unstable_mockModule('../lib/budgetCategoriesApi.js', () => ({
  fetchBudgetCategories: mockFetchBudgetCategories,
  createBudgetCategory: jest.fn(),
  updateBudgetCategory: jest.fn(),
  deleteBudgetCategory: jest.fn(),
}));

const mockFetchBudgetSources = jest.fn<typeof BudgetSourcesApiModule.fetchBudgetSources>();

jest.unstable_mockModule('../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
  createBudgetSource: jest.fn(),
  updateBudgetSource: jest.fn(),
  deleteBudgetSource: jest.fn(),
}));

const mockFetchVendors = jest.fn<typeof VendorsApiModule.fetchVendors>();

jest.unstable_mockModule('../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

const mockCreateInvoiceBudgetLine =
  jest.fn<typeof InvoiceBudgetLinesApiModule.createInvoiceBudgetLine>();

jest.unstable_mockModule('../lib/invoiceBudgetLinesApi.js', () => ({
  fetchInvoiceBudgetLines: jest.fn(),
  createInvoiceBudgetLine: mockCreateInvoiceBudgetLine,
  updateInvoiceBudgetLine: jest.fn(),
  deleteInvoiceBudgetLine: jest.fn(),
  editAndMoveBudgetLine: jest.fn(),
}));

// ApiClientError mock
class MockApiClientError extends Error {
  statusCode: number;
  error: { code: string; message: string };
  constructor(statusCode: number, error: { code: string; message: string }) {
    super(error.message);
    this.statusCode = statusCode;
    this.error = error;
  }
}

jest.unstable_mockModule('../lib/apiClient.js', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
  ApiClientError: MockApiClientError,
  NetworkError: class MockNetworkError extends Error {},
}));

// ─── Dynamic import of hook under test ────────────────────────────────────────

import type * as UseBudgetLinePickerModule from './useBudgetLinePicker.js';
let useBudgetLinePicker: (typeof UseBudgetLinePickerModule)['useBudgetLinePicker'];

beforeEach(async () => {
  ({ useBudgetLinePicker } =
    (await import('./useBudgetLinePicker.js')) as typeof UseBudgetLinePickerModule);

  mockFetchWorkItemBudgets.mockReset();
  mockCreateWorkItemBudget.mockReset();
  mockFetchHouseholdItemBudgets.mockReset();
  mockCreateHouseholdItemBudget.mockReset();
  mockFetchBudgetCategories.mockReset();
  mockFetchBudgetSources.mockReset();
  mockFetchVendors.mockReset();
  mockCreateInvoiceBudgetLine.mockReset();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWib(id: string): WorkItemBudgetLine {
  return {
    id,
    workItemId: 'wi-1',
    description: 'Budget line',
    plannedAmount: 200,
    confidence: 'invoice',
    confidenceMargin: 0,
    budgetCategory: null,
    budgetSource: null,
    vendor: null,
    actualCost: 0,
    actualCostPaid: 0,
    invoiceCount: 0,
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: true,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    origin: 'manual',
    invoiceLink: null,
  };
}

function defaultOptions() {
  return {
    invoiceId: 'inv-1',
    invoiceAmount: 1000,
    onLineCreated: jest.fn(),
  };
}

const makeFormEvent = () => ({ preventDefault: jest.fn() }) as unknown as React.FormEvent;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useBudgetLinePicker', () => {
  describe('initial state', () => {
    it('isOpen is false on init', () => {
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));
      expect(result.current.pickerState.isOpen).toBe(false);
    });

    it('step is 1 on init', () => {
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));
      expect(result.current.pickerState.step).toBe(1);
    });

    it('type is null on init', () => {
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));
      expect(result.current.pickerState.type).toBeNull();
    });

    it('budgetLines is empty array on init', () => {
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));
      expect(result.current.pickerState.budgetLines).toHaveLength(0);
    });

    it('showCreateForm is false on init', () => {
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));
      expect(result.current.pickerState.showCreateForm).toBe(false);
    });

    it('createError is null on init', () => {
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));
      expect(result.current.pickerState.createError).toBeNull();
    });
  });

  describe('openPicker', () => {
    it('sets isOpen to true after openPicker()', () => {
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));
      act(() => {
        result.current.openPicker();
      });
      expect(result.current.pickerState.isOpen).toBe(true);
    });

    it('resets step to 1 when opening after a previous selection', async () => {
      mockFetchWorkItemBudgets.mockResolvedValue([]);
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      // Go to step 2
      await act(async () => {
        await result.current.handleSelectItem('wi-1', 'work_item');
      });
      expect(result.current.pickerState.step).toBe(2);

      // Re-open
      act(() => {
        result.current.openPicker();
      });
      expect(result.current.pickerState.step).toBe(1);
    });
  });

  describe('closePicker', () => {
    it('sets isOpen to false after closePicker()', () => {
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));
      act(() => {
        result.current.openPicker();
      });
      act(() => {
        result.current.closePicker();
      });
      expect(result.current.pickerState.isOpen).toBe(false);
    });

    it('resets state to initial values after closePicker()', async () => {
      mockFetchWorkItemBudgets.mockResolvedValue([makeWib('wib-1')]);
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.handleSelectItem('wi-1', 'work_item', 'Work Item 1');
      });

      act(() => {
        result.current.closePicker();
      });

      expect(result.current.pickerState.step).toBe(1);
      expect(result.current.pickerState.type).toBeNull();
      expect(result.current.pickerState.itemId).toBeNull();
      expect(result.current.pickerState.budgetLines).toHaveLength(0);
    });
  });

  describe('handleSelectItem', () => {
    it('transitions to step 2 after selecting a work item', async () => {
      mockFetchWorkItemBudgets.mockResolvedValue([]);
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      expect(result.current.pickerState.step).toBe(2);
    });

    it('sets type to work_item after selecting a work item', async () => {
      mockFetchWorkItemBudgets.mockResolvedValue([]);
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      expect(result.current.pickerState.type).toBe('work_item');
    });

    it('fetches budget lines for the selected work item', async () => {
      const budgetLines = [makeWib('wib-1'), makeWib('wib-2')];
      mockFetchWorkItemBudgets.mockResolvedValue(budgetLines);
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      expect(mockFetchWorkItemBudgets).toHaveBeenCalledWith('wi-42');
    });

    it('loads budget lines into state (filters to unlinked only)', async () => {
      const unlinkedLine = makeWib('wib-1'); // invoiceLink: null
      const linkedLine: WorkItemBudgetLine = {
        ...makeWib('wib-2'),
        invoiceLink: {
          invoiceBudgetLineId: 'ibl-x',
          invoiceId: 'inv-x',
          invoiceNumber: 'INV-001',
          invoiceDate: '2026-01-01',
          invoiceStatus: 'paid',
          itemizedAmount: 100,
          vendorId: null,
          vendorName: null,
        },
      };
      mockFetchWorkItemBudgets.mockResolvedValue([unlinkedLine, linkedLine]);
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      // Only unlinked lines should be in state
      expect(result.current.pickerState.budgetLines).toHaveLength(1);
      expect(result.current.pickerState.budgetLines[0]!.id).toBe('wib-1');
    });

    it('sets budgetLines to empty array when no unlinked lines', async () => {
      mockFetchWorkItemBudgets.mockResolvedValue([]);
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      expect(result.current.pickerState.budgetLines).toHaveLength(0);
    });

    it('sets showCreateForm to false when transitioning to step 2', async () => {
      mockFetchWorkItemBudgets.mockResolvedValue([]);
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      expect(result.current.pickerState.showCreateForm).toBe(false);
    });

    it('uses fetchHouseholdItemBudgets for household_item type', async () => {
      mockFetchHouseholdItemBudgets.mockResolvedValue([]);
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.handleSelectItem('hi-42', 'household_item');
      });

      expect(mockFetchHouseholdItemBudgets).toHaveBeenCalledWith('hi-42');
    });
  });

  describe('showCreateBudgetLineForm', () => {
    it('sets showCreateForm to true after showCreateBudgetLineForm()', async () => {
      mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
      mockFetchVendors.mockResolvedValue({
        vendors: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      });
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.showCreateBudgetLineForm();
      });

      expect(result.current.pickerState.showCreateForm).toBe(true);
    });

    it('initializes createForm with default values', async () => {
      mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
      mockFetchVendors.mockResolvedValue({
        vendors: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      });
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.showCreateBudgetLineForm();
      });

      expect(result.current.pickerState.createForm).toBeDefined();
      expect(result.current.pickerState.createForm?.description).toBe('');
      expect(result.current.pickerState.createForm?.plannedAmount).toBe('');
      expect(result.current.pickerState.createForm?.confidence).toBe('invoice');
    });

    it('loads budget sources and selects the discretionary one', async () => {
      mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
      // Use partial cast since the hook only reads id and isDiscretionary
      const minimalSources = [
        { id: 'loan-1', name: 'Loan', isDiscretionary: false },
        { id: 'disc-1', name: 'Discretionary', isDiscretionary: true },
      ];
      mockFetchBudgetSources.mockResolvedValue({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        budgetSources: minimalSources as any,
      });
      mockFetchVendors.mockResolvedValue({
        vendors: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      });
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.showCreateBudgetLineForm();
      });

      expect(result.current.pickerState.createForm?.budgetSourceId).toBe('disc-1');
    });

    it('clears createError when opening create form', async () => {
      mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
      mockFetchVendors.mockResolvedValue({
        vendors: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      });
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.showCreateBudgetLineForm();
      });

      expect(result.current.pickerState.createError).toBeNull();
    });
  });

  describe('handleCreateBudgetLine', () => {
    it('calls onLineCreated callback on successful budget line creation', async () => {
      const onLineCreated = jest.fn();
      const wib = makeWib('new-wib-1');

      mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
      mockFetchVendors.mockResolvedValue({
        vendors: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      });
      mockCreateWorkItemBudget.mockResolvedValue({ ...wib, invoiceLink: null });
      mockCreateInvoiceBudgetLine.mockResolvedValue({
        budgetLine: {
          id: 'ibl-1',
          invoiceId: 'inv-1',
          workItemBudgetId: 'new-wib-1',
          householdItemBudgetId: null,
          itemizedAmount: 200,
          budgetLineDescription: null,
          createdAt: '',
          updatedAt: '',
        } as InvoiceBudgetLineDetailResponse,
        remainingAmount: 800,
      });

      const { result } = renderHook(() =>
        useBudgetLinePicker({ ...defaultOptions(), onLineCreated }),
      );

      // Simulate selecting a work item (step 2)
      mockFetchWorkItemBudgets.mockResolvedValue([]);
      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item', 'My Work Item');
      });

      // Open create form
      await act(async () => {
        await result.current.showCreateBudgetLineForm();
      });

      // Update form state
      act(() => {
        result.current.setPickerState((prev) => ({
          ...prev,
          createForm: {
            ...prev.createForm!,
            plannedAmount: '200',
            confidence: 'invoice',
            pricingMode: 'direct',
            description: 'Test line',
            budgetCategoryId: '',
            budgetSourceId: '',
            vendorId: '',
            quantity: '',
            unit: '',
            unitPrice: '',
            includesVat: true,
          },
        }));
      });

      await act(async () => {
        await result.current.handleCreateBudgetLine(makeFormEvent());
      });

      expect(onLineCreated).toHaveBeenCalledTimes(1);
    });

    it('sets createError when API call fails with generic error', async () => {
      mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
      mockFetchVendors.mockResolvedValue({
        vendors: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      });
      mockCreateWorkItemBudget.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      mockFetchWorkItemBudgets.mockResolvedValue([]);
      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      await act(async () => {
        await result.current.showCreateBudgetLineForm();
      });

      act(() => {
        result.current.setPickerState((prev) => ({
          ...prev,
          createForm: {
            ...prev.createForm!,
            plannedAmount: '200',
            pricingMode: 'direct',
            description: 'Test',
            confidence: 'invoice',
            budgetCategoryId: '',
            budgetSourceId: '',
            vendorId: '',
            quantity: '',
            unit: '',
            unitPrice: '',
            includesVat: true,
          },
        }));
      });

      await act(async () => {
        await result.current.handleCreateBudgetLine(makeFormEvent());
      });

      expect(result.current.pickerState.createError).not.toBeNull();
    });

    it('does NOT call onLineCreated when API fails', async () => {
      const onLineCreated = jest.fn();
      mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
      mockFetchVendors.mockResolvedValue({
        vendors: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      });
      mockCreateWorkItemBudget.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useBudgetLinePicker({ ...defaultOptions(), onLineCreated }),
      );

      mockFetchWorkItemBudgets.mockResolvedValue([]);
      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      await act(async () => {
        await result.current.showCreateBudgetLineForm();
      });

      act(() => {
        result.current.setPickerState((prev) => ({
          ...prev,
          createForm: {
            ...prev.createForm!,
            plannedAmount: '100',
            pricingMode: 'direct',
            description: 'Test',
            confidence: 'invoice',
            budgetCategoryId: '',
            budgetSourceId: '',
            vendorId: '',
            quantity: '',
            unit: '',
            unitPrice: '',
            includesVat: true,
          },
        }));
      });

      await act(async () => {
        await result.current.handleCreateBudgetLine(makeFormEvent());
      });

      expect(onLineCreated).not.toHaveBeenCalled();
    });

    it('early returns without calling API when itemId is null', async () => {
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      // Manually set up create form but leave itemId null
      act(() => {
        result.current.setPickerState((prev) => ({
          ...prev,
          createForm: {
            description: 'Test',
            plannedAmount: '100',
            confidence: 'invoice',
            budgetCategoryId: '',
            budgetSourceId: '',
            vendorId: '',
            pricingMode: 'direct',
            quantity: '',
            unit: '',
            unitPrice: '',
            includesVat: true,
          },
          type: 'work_item',
          itemId: null, // null itemId → early return
        }));
      });

      await act(async () => {
        await result.current.handleCreateBudgetLine(makeFormEvent());
      });

      expect(mockCreateWorkItemBudget).not.toHaveBeenCalled();
    });

    it('sets createError when plannedAmount is invalid (NaN)', async () => {
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      mockFetchWorkItemBudgets.mockResolvedValue([]);
      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      act(() => {
        result.current.setPickerState((prev) => ({
          ...prev,
          createForm: {
            description: 'Test',
            plannedAmount: 'not-a-number',
            confidence: 'invoice',
            budgetCategoryId: '',
            budgetSourceId: '',
            vendorId: '',
            pricingMode: 'direct',
            quantity: '',
            unit: '',
            unitPrice: '',
            includesVat: true,
          },
        }));
      });

      await act(async () => {
        await result.current.handleCreateBudgetLine(makeFormEvent());
      });

      expect(result.current.pickerState.createError).not.toBeNull();
      expect(mockCreateWorkItemBudget).not.toHaveBeenCalled();
    });

    it('sets createError when unit price mode has invalid quantity', async () => {
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      mockFetchWorkItemBudgets.mockResolvedValue([]);
      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      act(() => {
        result.current.setPickerState((prev) => ({
          ...prev,
          createForm: {
            description: 'Test',
            plannedAmount: '',
            confidence: 'invoice',
            budgetCategoryId: '',
            budgetSourceId: '',
            vendorId: '',
            pricingMode: 'unit',
            quantity: 'bad',
            unit: 'm',
            unitPrice: '50',
            includesVat: true,
          },
        }));
      });

      await act(async () => {
        await result.current.handleCreateBudgetLine(makeFormEvent());
      });

      expect(result.current.pickerState.createError).not.toBeNull();
      expect(mockCreateWorkItemBudget).not.toHaveBeenCalled();
    });

    it('sets createError when unit price mode has invalid unit price', async () => {
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      mockFetchWorkItemBudgets.mockResolvedValue([]);
      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      act(() => {
        result.current.setPickerState((prev) => ({
          ...prev,
          createForm: {
            description: 'Test',
            plannedAmount: '',
            confidence: 'invoice',
            budgetCategoryId: '',
            budgetSourceId: '',
            vendorId: '',
            pricingMode: 'unit',
            quantity: '2',
            unit: 'm',
            unitPrice: 'bad-price',
            includesVat: true,
          },
        }));
      });

      await act(async () => {
        await result.current.handleCreateBudgetLine(makeFormEvent());
      });

      expect(result.current.pickerState.createError).not.toBeNull();
      expect(mockCreateWorkItemBudget).not.toHaveBeenCalled();
    });

    it('sets error and resets form when API returns ITEMIZED_SUM_EXCEEDS_INVOICE', async () => {
      const wib = makeWib('new-wib-1');
      mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
      mockFetchVendors.mockResolvedValue({
        vendors: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      });
      // createWorkItemBudget succeeds
      mockCreateWorkItemBudget.mockResolvedValue({ ...wib, invoiceLink: null });
      // createInvoiceBudgetLine fails with ITEMIZED_SUM_EXCEEDS_INVOICE
      mockCreateInvoiceBudgetLine.mockRejectedValue(
        new MockApiClientError(422, {
          code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
          message: 'Sum exceeds invoice amount',
        }),
      );
      // fetchWorkItemBudgets called to refresh lines after error
      mockFetchWorkItemBudgets.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      await act(async () => {
        await result.current.showCreateBudgetLineForm();
      });

      act(() => {
        result.current.setPickerState((prev) => ({
          ...prev,
          createForm: {
            ...prev.createForm!,
            plannedAmount: '200',
            confidence: 'invoice',
            pricingMode: 'direct',
            description: 'Test',
            budgetCategoryId: '',
            budgetSourceId: '',
            vendorId: '',
            quantity: '',
            unit: '',
            unitPrice: '',
            includesVat: true,
          },
        }));
      });

      await act(async () => {
        await result.current.handleCreateBudgetLine(makeFormEvent());
      });

      // After ITEMIZED_SUM_EXCEEDS_INVOICE: create form hidden, error shown in step-2 state
      expect(result.current.pickerState.showCreateForm).toBe(false);
      expect(result.current.pickerState.createForm).toBeUndefined();
      expect(result.current.pickerState.error).not.toBeNull();
    });

    it('computes plannedAmount correctly with unit pricing mode', async () => {
      const wib = makeWib('new-wib-1');
      mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
      mockFetchVendors.mockResolvedValue({
        vendors: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      });
      // Return wib with plannedAmount that would be set from qty * price = 2 * 50 = 100
      mockCreateWorkItemBudget.mockResolvedValue({ ...wib, plannedAmount: 100, invoiceLink: null });

      mockCreateInvoiceBudgetLine.mockResolvedValue({
        budgetLine: {
          id: 'ibl-1',
          invoiceId: 'inv-1',
          workItemBudgetId: 'new-wib-1',
          householdItemBudgetId: null,
          itemizedAmount: 100,
          budgetLineDescription: null,
          createdAt: '',
          updatedAt: '',
        } as InvoiceBudgetLineDetailResponse,
        remainingAmount: 900,
      });
      mockFetchWorkItemBudgets.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useBudgetLinePicker({ ...defaultOptions(), onLineCreated: jest.fn() }),
      );

      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      await act(async () => {
        await result.current.showCreateBudgetLineForm();
      });

      act(() => {
        result.current.setPickerState((prev) => ({
          ...prev,
          createForm: {
            ...prev.createForm!,
            plannedAmount: '',
            pricingMode: 'unit',
            quantity: '2',
            unit: 'm',
            unitPrice: '50',
            description: 'Unit test line',
            confidence: 'invoice',
            budgetCategoryId: '',
            budgetSourceId: '',
            vendorId: '',
            includesVat: true,
          },
        }));
      });

      await act(async () => {
        await result.current.handleCreateBudgetLine(makeFormEvent());
      });

      // plannedAmount = 2 * 50 = 100, passed to createWorkItemBudget
      expect(mockCreateWorkItemBudget).toHaveBeenCalledWith(
        'wi-42',
        expect.objectContaining({ plannedAmount: 100 }),
      );
    });

    it('sets createError with ApiClientError message when API returns non-ITEMIZED error', async () => {
      const wib = makeWib('new-wib-1');
      mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
      mockFetchVendors.mockResolvedValue({
        vendors: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      });
      mockCreateWorkItemBudget.mockResolvedValue({ ...wib, invoiceLink: null });
      mockCreateInvoiceBudgetLine.mockRejectedValue(
        new MockApiClientError(409, { code: 'CONFLICT', message: 'Line already exists' }),
      );
      mockFetchWorkItemBudgets.mockResolvedValue([]);

      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });
      await act(async () => {
        await result.current.showCreateBudgetLineForm();
      });
      act(() => {
        result.current.setPickerState((prev) => ({
          ...prev,
          createForm: {
            ...prev.createForm!,
            plannedAmount: '100',
            pricingMode: 'direct',
            description: 'Test',
            confidence: 'invoice',
            budgetCategoryId: '',
            budgetSourceId: '',
            vendorId: '',
            quantity: '',
            unit: '',
            unitPrice: '',
            includesVat: true,
          },
        }));
      });

      await act(async () => {
        await result.current.handleCreateBudgetLine(makeFormEvent());
      });

      expect(result.current.pickerState.createError).toBe('Line already exists');
    });

    it('sets error and resets form when API returns BUDGET_LINE_ALREADY_LINKED', async () => {
      const wib = makeWib('new-wib-1');
      mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
      mockFetchVendors.mockResolvedValue({
        vendors: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      });
      mockCreateWorkItemBudget.mockResolvedValue({ ...wib, invoiceLink: null });
      mockCreateInvoiceBudgetLine.mockRejectedValue(
        new MockApiClientError(409, {
          code: 'BUDGET_LINE_ALREADY_LINKED',
          message: 'Already linked',
        }),
      );
      // fetchWorkItemBudgets after error returns empty
      mockFetchWorkItemBudgets.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });
      await act(async () => {
        await result.current.showCreateBudgetLineForm();
      });
      act(() => {
        result.current.setPickerState((prev) => ({
          ...prev,
          createForm: {
            ...prev.createForm!,
            plannedAmount: '100',
            pricingMode: 'direct',
            description: 'Test',
            confidence: 'invoice',
            budgetCategoryId: '',
            budgetSourceId: '',
            vendorId: '',
            quantity: '',
            unit: '',
            unitPrice: '',
            includesVat: true,
          },
        }));
      });

      await act(async () => {
        await result.current.handleCreateBudgetLine(makeFormEvent());
      });

      expect(result.current.pickerState.showCreateForm).toBe(false);
      expect(result.current.pickerState.createForm).toBeUndefined();
      expect(result.current.pickerState.error).not.toBeNull();
    });
  });

  describe('handleSelectItem error path', () => {
    it('sets error message when fetchWorkItemBudgets throws generic error', async () => {
      mockFetchWorkItemBudgets.mockRejectedValue(new Error('Network error'));
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      expect(result.current.pickerState.error).not.toBeNull();
      expect(result.current.pickerState.budgetLines).toHaveLength(0);
    });

    it('sets ApiClientError message when fetchWorkItemBudgets throws ApiClientError', async () => {
      mockFetchWorkItemBudgets.mockRejectedValue(
        new MockApiClientError(500, { code: 'SERVER_ERROR', message: 'Internal server error' }),
      );
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item');
      });

      expect(result.current.pickerState.error).toBe('Internal server error');
    });
  });

  describe('showCreateBudgetLineForm error path', () => {
    it('sets error when fetchBudgetCategories throws ApiClientError', async () => {
      mockFetchBudgetCategories.mockRejectedValue(
        new MockApiClientError(500, { code: 'SERVER_ERROR', message: 'Categories unavailable' }),
      );
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
      mockFetchVendors.mockResolvedValue({
        vendors: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      });

      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.showCreateBudgetLineForm();
      });

      expect(result.current.pickerState.error).toBe('Categories unavailable');
      expect(result.current.pickerState.showCreateForm).toBe(false);
    });
  });

  // ─── Story #1600: showCreateBudgetLineForm prefill parameter ─────────────────

  describe('showCreateBudgetLineForm — prefill parameter (Story #1600)', () => {
    // Shared helper to set up the standard API mocks with a discretionary source
    function setupFormMocks() {
      mockFetchBudgetCategories.mockResolvedValue({ categories: [] });

      mockFetchBudgetSources.mockResolvedValue({
        budgetSources: [
          {
            id: 'disc-1',
            name: 'Discretionary',
            isDiscretionary: true,
            sourceType: 'savings',
            totalAmount: 0,
            usedAmount: 0,
            availableAmount: 0,
            claimedAmount: 0,
            unclaimedAmount: 0,
            paidAmount: 0,
            actualAvailableAmount: 0,
            projectedAmount: 0,
            projectedMinAmount: 0,
            projectedMaxAmount: 0,
            interestRate: null,
            terms: null,
            notes: null,
            reference: null,
            contactAddress: null,
            status: 'active',
            createdBy: null,
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 'loan-1',
            name: 'Loan',
            isDiscretionary: false,
            sourceType: 'savings',
            totalAmount: 0,
            usedAmount: 0,
            availableAmount: 0,
            claimedAmount: 0,
            unclaimedAmount: 0,
            paidAmount: 0,
            actualAvailableAmount: 0,
            projectedAmount: 0,
            projectedMinAmount: 0,
            projectedMaxAmount: 0,
            interestRate: null,
            terms: null,
            notes: null,
            reference: null,
            contactAddress: null,
            status: 'active',
            createdBy: null,
            createdAt: '',
            updatedAt: '',
          },
        ],
      });
      mockFetchVendors.mockResolvedValue({
        vendors: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      });
    }

    it('no args → defaults unchanged (description="", plannedAmount="", confidence="invoice")', async () => {
      setupFormMocks();
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.showCreateBudgetLineForm();
      });

      expect(result.current.pickerState.createForm?.description).toBe('');
      expect(result.current.pickerState.createForm?.plannedAmount).toBe('');
      expect(result.current.pickerState.createForm?.confidence).toBe('invoice');
      expect(result.current.pickerState.createForm?.pricingMode).toBe('direct');
      expect(result.current.pickerState.createForm?.vendorId).toBe('');
      expect(result.current.pickerState.createForm?.budgetCategoryId).toBe('');
    });

    it('prefill { description, plannedAmount } → those fields set, others defaulted', async () => {
      setupFormMocks();
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.showCreateBudgetLineForm({
          description: 'Bathroom tiles',
          plannedAmount: '900',
        });
      });

      expect(result.current.pickerState.createForm?.description).toBe('Bathroom tiles');
      expect(result.current.pickerState.createForm?.plannedAmount).toBe('900');
      // Other fields still at defaults
      expect(result.current.pickerState.createForm?.confidence).toBe('invoice');
      expect(result.current.pickerState.createForm?.vendorId).toBe('');
    });

    it('prefill { budgetSourceId: "loan-1" } → overrides discretionary default', async () => {
      setupFormMocks();
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.showCreateBudgetLineForm({ budgetSourceId: 'loan-1' });
      });

      expect(result.current.pickerState.createForm?.budgetSourceId).toBe('loan-1');
    });

    it('prefill { confidence: "quote" } → createForm.confidence === "quote"', async () => {
      setupFormMocks();
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.showCreateBudgetLineForm({ confidence: 'quote' });
      });

      expect(result.current.pickerState.createForm?.confidence).toBe('quote');
    });

    it('prefill { vendorId: "v-99" } → createForm.vendorId === "v-99"', async () => {
      setupFormMocks();
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.showCreateBudgetLineForm({ vendorId: 'v-99' });
      });

      expect(result.current.pickerState.createForm?.vendorId).toBe('v-99');
    });

    it('prefill { budgetCategoryId: "" } → category empty (household-item path)', async () => {
      setupFormMocks();
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.showCreateBudgetLineForm({ budgetCategoryId: '' });
      });

      expect(result.current.pickerState.createForm?.budgetCategoryId).toBe('');
    });

    it('prefill unit mode fields → pricingMode, quantity, unit, unitPrice all set', async () => {
      setupFormMocks();
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.showCreateBudgetLineForm({
          pricingMode: 'unit',
          quantity: '20',
          unit: 'm²',
          unitPrice: '45',
        });
      });

      expect(result.current.pickerState.createForm?.pricingMode).toBe('unit');
      expect(result.current.pickerState.createForm?.quantity).toBe('20');
      expect(result.current.pickerState.createForm?.unit).toBe('m²');
      expect(result.current.pickerState.createForm?.unitPrice).toBe('45');
    });

    it('prefill does NOT clear createError (createError is cleared independently)', async () => {
      setupFormMocks();
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.showCreateBudgetLineForm({ description: 'Flooring' });
      });

      // The hook always clears createError when opening create form
      expect(result.current.pickerState.createError).toBeNull();
    });

    it('showCreateForm is true after call with prefill', async () => {
      setupFormMocks();
      const { result } = renderHook(() => useBudgetLinePicker(defaultOptions()));

      await act(async () => {
        await result.current.showCreateBudgetLineForm({ description: 'Kitchen fittings' });
      });

      expect(result.current.pickerState.showCreateForm).toBe(true);
    });
  });

  // ─── Story #1693 — VAT gross-up: createBudgetLine call args ──────────────────
  // Authoritative contract:
  //   createFn (WIB/HIB) receives NET plannedAmount — never grossed up.
  //   createInvoiceBudgetLine receives GROSS itemizedAmount = effectiveLineAmount(plannedAmount, includesVat)
  //   = plannedAmount when includesVat===true
  //   = round(plannedAmount * 1.19 * 100) / 100 when includesVat===false

  describe('VAT gross-up: handleCreateBudgetLine call args (Story #1693)', () => {
    function setupMocksForCreate(
      plannedAmount: number,
      includesVat: boolean,
    ): {
      wib: WorkItemBudgetLine;
    } {
      const wib: WorkItemBudgetLine = {
        ...makeWib('vat-wib-1'),
        plannedAmount,
        includesVat,
        invoiceLink: null,
      };

      mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
      mockFetchVendors.mockResolvedValue({
        vendors: [],
        pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      });
      mockFetchWorkItemBudgets.mockResolvedValue([]);
      mockCreateWorkItemBudget.mockResolvedValue(wib);
      mockCreateInvoiceBudgetLine.mockResolvedValue({
        budgetLine: {
          id: 'ibl-vat',
          invoiceId: 'inv-1',
          workItemBudgetId: 'vat-wib-1',
          householdItemBudgetId: null,
          itemizedAmount: plannedAmount,
          budgetLineDescription: null,
          createdAt: '',
          updatedAt: '',
        } as InvoiceBudgetLineDetailResponse,
        remainingAmount: 800,
      });

      return { wib };
    }

    async function setupAndSubmitForm(
      result: ReturnType<
        typeof renderHook<ReturnType<typeof useBudgetLinePicker>, unknown>
      >['result'],
      formOverrides: Partial<{
        plannedAmount: string;
        includesVat: boolean;
        pricingMode: 'direct' | 'unit';
        quantity: string;
        unitPrice: string;
        unit: string;
      }>,
    ) {
      await act(async () => {
        await result.current.handleSelectItem('wi-42', 'work_item', 'Work Item');
      });
      await act(async () => {
        await result.current.showCreateBudgetLineForm();
      });
      act(() => {
        result.current.setPickerState((prev) => ({
          ...prev,
          createForm: {
            ...prev.createForm!,
            description: 'Test',
            confidence: 'invoice',
            budgetCategoryId: '',
            budgetSourceId: '',
            vendorId: '',
            pricingMode: 'direct',
            quantity: '',
            unit: '',
            unitPrice: '',
            includesVat: true,
            ...formOverrides,
          },
        }));
      });
      await act(async () => {
        await result.current.handleCreateBudgetLine(makeFormEvent());
      });
    }

    // direct + includesVat=true: createFn plannedAmount=100; junction itemizedAmount=100
    it('direct+VAT-incl (100, true): createFn called with plannedAmount=100; junction itemizedAmount=100', async () => {
      setupMocksForCreate(100, true);
      const { result } = renderHook(() =>
        useBudgetLinePicker({ ...defaultOptions(), eagerLinkInvoice: true }),
      );

      await setupAndSubmitForm(result, { plannedAmount: '100', includesVat: true });

      expect(mockCreateWorkItemBudget).toHaveBeenCalledWith(
        'wi-42',
        expect.objectContaining({ plannedAmount: 100, includesVat: true }),
      );
      expect(mockCreateInvoiceBudgetLine).toHaveBeenCalledWith(
        'inv-1',
        expect.objectContaining({ itemizedAmount: 100 }),
      );
    });

    // direct + includesVat=false: createFn plannedAmount=100 (NET, NOT 119); junction itemizedAmount=119
    it('direct+VAT-excl (100, false): createFn called with NET plannedAmount=100 (not 119); junction itemizedAmount=119', async () => {
      setupMocksForCreate(100, false);
      const { result } = renderHook(() =>
        useBudgetLinePicker({ ...defaultOptions(), eagerLinkInvoice: true }),
      );

      await setupAndSubmitForm(result, { plannedAmount: '100', includesVat: false });

      // WIB create must receive NET plannedAmount=100, NOT 119
      expect(mockCreateWorkItemBudget).toHaveBeenCalledWith(
        'wi-42',
        expect.objectContaining({ plannedAmount: 100, includesVat: false }),
      );
      // junction itemizedAmount = effectiveLineAmount(100, false) = 119
      expect(mockCreateInvoiceBudgetLine).toHaveBeenCalledWith(
        'inv-1',
        expect.objectContaining({ itemizedAmount: 119 }),
      );
    });

    // unit + includesVat=true (qty=2, price=50): plannedAmount=100; itemizedAmount=100
    it('unit+VAT-incl (q=2, p=50, true): createFn plannedAmount=100; junction itemizedAmount=100', async () => {
      setupMocksForCreate(100, true);
      const { result } = renderHook(() =>
        useBudgetLinePicker({ ...defaultOptions(), eagerLinkInvoice: true }),
      );

      await setupAndSubmitForm(result, {
        pricingMode: 'unit',
        quantity: '2',
        unitPrice: '50',
        unit: 'm',
        includesVat: true,
      });

      expect(mockCreateWorkItemBudget).toHaveBeenCalledWith(
        'wi-42',
        expect.objectContaining({ plannedAmount: 100, includesVat: true }),
      );
      expect(mockCreateInvoiceBudgetLine).toHaveBeenCalledWith(
        'inv-1',
        expect.objectContaining({ itemizedAmount: 100 }),
      );
    });

    // unit + includesVat=false (qty=2, price=50): NET plannedAmount=100; junction itemizedAmount=119
    it('unit+VAT-excl (q=2, p=50, false): createFn NET plannedAmount=100; junction itemizedAmount=119', async () => {
      setupMocksForCreate(100, false);
      const { result } = renderHook(() =>
        useBudgetLinePicker({ ...defaultOptions(), eagerLinkInvoice: true }),
      );

      await setupAndSubmitForm(result, {
        pricingMode: 'unit',
        quantity: '2',
        unitPrice: '50',
        unit: 'm',
        includesVat: false,
      });

      // NET plannedAmount = 2 * 50 = 100 — not grossed up
      expect(mockCreateWorkItemBudget).toHaveBeenCalledWith(
        'wi-42',
        expect.objectContaining({ plannedAmount: 100, includesVat: false }),
      );
      // junction itemizedAmount = effectiveLineAmount(100, false) = 119
      expect(mockCreateInvoiceBudgetLine).toHaveBeenCalledWith(
        'inv-1',
        expect.objectContaining({ itemizedAmount: 119 }),
      );
    });

    // Validate that junction itemizedAmount === effectiveLineAmount(plannedAmount, includesVat)
    // in every combo above (display===persisted invariant)
    it('VAT-excl invariant: junction itemizedAmount === effectiveLineAmount({amount: plannedAmount, includesVat: false})', async () => {
      setupMocksForCreate(100, false);
      const { result } = renderHook(() =>
        useBudgetLinePicker({ ...defaultOptions(), eagerLinkInvoice: true }),
      );

      await setupAndSubmitForm(result, { plannedAmount: '100', includesVat: false });

      const junctionCall = mockCreateInvoiceBudgetLine.mock.calls[0];
      expect(junctionCall).toBeDefined();
      // Expected: effectiveLineAmount({ amount: 100, includesVat: false }) = 119
      const expectedGross = Math.round(100 * 1.19 * 100) / 100; // 119
      expect((junctionCall![1] as unknown as Record<string, unknown>)['itemizedAmount']).toBe(
        expectedGross,
      );
    });

    // eagerLinkInvoice=false → createInvoiceBudgetLine NOT called
    it('eagerLinkInvoice=false → createInvoiceBudgetLine is NOT called', async () => {
      setupMocksForCreate(100, false);
      const { result } = renderHook(() =>
        useBudgetLinePicker({ ...defaultOptions(), eagerLinkInvoice: false }),
      );

      await setupAndSubmitForm(result, { plannedAmount: '100', includesVat: false });

      expect(mockCreateWorkItemBudget).toHaveBeenCalled();
      expect(mockCreateInvoiceBudgetLine).not.toHaveBeenCalled();
    });

    // eagerLinkInvoice=true (manual flow): create then link works (regression)
    it('eagerLinkInvoice=true (manual flow): createWorkItemBudget then createInvoiceBudgetLine both called', async () => {
      setupMocksForCreate(200, true);
      const { result } = renderHook(() =>
        useBudgetLinePicker({ ...defaultOptions(), eagerLinkInvoice: true }),
      );

      await setupAndSubmitForm(result, { plannedAmount: '200', includesVat: true });

      expect(mockCreateWorkItemBudget).toHaveBeenCalledTimes(1);
      expect(mockCreateInvoiceBudgetLine).toHaveBeenCalledTimes(1);
    });
  });
});
