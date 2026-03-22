/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as InvoiceBudgetLinesApiTypes from '../../lib/invoiceBudgetLinesApi.js';
import type * as WorkItemBudgetsApiTypes from '../../lib/workItemBudgetsApi.js';
import type * as HouseholdItemBudgetsApiTypes from '../../lib/householdItemBudgetsApi.js';
import type * as BudgetCategoriesApiTypes from '../../lib/budgetCategoriesApi.js';
import type * as BudgetSourcesApiTypes from '../../lib/budgetSourcesApi.js';
import type * as InvoiceBudgetLinesSectionTypes from './InvoiceBudgetLinesSection.js';
import type {
  InvoiceBudgetLineDetailResponse,
  InvoiceBudgetLineListDetailResponse,
  InvoiceBudgetLineCreateResponse,
} from '@cornerstone/shared';

// ─── Module-scope mock functions ───────────────────────────────────────────────

const mockFetchBudgetCategories = jest.fn<typeof BudgetCategoriesApiTypes.fetchBudgetCategories>();
const mockFetchBudgetSources = jest.fn<typeof BudgetSourcesApiTypes.fetchBudgetSources>();
const mockCreateWorkItemBudget = jest.fn<typeof WorkItemBudgetsApiTypes.createWorkItemBudget>();
const mockCreateHouseholdItemBudget =
  jest.fn<typeof HouseholdItemBudgetsApiTypes.createHouseholdItemBudget>();
const mockFetchInvoiceBudgetLines =
  jest.fn<typeof InvoiceBudgetLinesApiTypes.fetchInvoiceBudgetLines>();
const mockCreateInvoiceBudgetLine =
  jest.fn<typeof InvoiceBudgetLinesApiTypes.createInvoiceBudgetLine>();
const mockUpdateInvoiceBudgetLine =
  jest.fn<typeof InvoiceBudgetLinesApiTypes.updateInvoiceBudgetLine>();
const mockDeleteInvoiceBudgetLine =
  jest.fn<typeof InvoiceBudgetLinesApiTypes.deleteInvoiceBudgetLine>();
const mockFetchWorkItemBudgets = jest.fn<typeof WorkItemBudgetsApiTypes.fetchWorkItemBudgets>();
const mockFetchHouseholdItemBudgets =
  jest.fn<typeof HouseholdItemBudgetsApiTypes.fetchHouseholdItemBudgets>();

// ─── Mock: invoiceBudgetLinesApi ───────────────────────────────────────────────

jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  fetchInvoiceBudgetLines: mockFetchInvoiceBudgetLines,
  createInvoiceBudgetLine: mockCreateInvoiceBudgetLine,
  updateInvoiceBudgetLine: mockUpdateInvoiceBudgetLine,
  deleteInvoiceBudgetLine: mockDeleteInvoiceBudgetLine,
}));

// ─── Mock: workItemBudgetsApi ──────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: mockFetchWorkItemBudgets,
  createWorkItemBudget: mockCreateWorkItemBudget,
  updateWorkItemBudget: jest.fn(),
  deleteWorkItemBudget: jest.fn(),
}));

// ─── Mock: householdItemBudgetsApi ─────────────────────────────────────────────

jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: mockFetchHouseholdItemBudgets,
  createHouseholdItemBudget: mockCreateHouseholdItemBudget,
  updateHouseholdItemBudget: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));

// ─── Mock: budgetCategoriesApi ────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/budgetCategoriesApi.js', () => ({
  fetchBudgetCategories: mockFetchBudgetCategories,
  createBudgetCategory: jest.fn(),
  updateBudgetCategory: jest.fn(),
  deleteBudgetCategory: jest.fn(),
}));

// ─── Mock: budgetSourcesApi ────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
  fetchBudgetSource: jest.fn(),
  createBudgetSource: jest.fn(),
  updateBudgetSource: jest.fn(),
  deleteBudgetSource: jest.fn(),
}));

// ─── Mock: WorkItemPicker ──────────────────────────────────────────────────────

jest.unstable_mockModule('../../components/WorkItemPicker/WorkItemPicker.js', () => ({
  WorkItemPicker: (props: {
    onChange?: (id: string) => void;
    onSelectItem?: (item: { id: string }) => void;
  }) => (
    <button data-testid="work-item-picker" onClick={() => props.onSelectItem?.({ id: 'wi-001' })}>
      Work Item Picker
    </button>
  ),
}));

// ─── Mock: HouseholdItemPicker ─────────────────────────────────────────────────

jest.unstable_mockModule('../../components/HouseholdItemPicker/HouseholdItemPicker.js', () => ({
  HouseholdItemPicker: (props: { onChange?: (id: string) => void }) => (
    <button data-testid="household-item-picker" onClick={() => props.onChange?.('hi-001')}>
      Household Item Picker
    </button>
  ),
}));

// ─── Mock: apiClient ───────────────────────────────────────────────────────────

class MockApiClientError extends Error {
  statusCode: number;
  error: { code: string; message?: string };
  constructor(statusCode: number, error: { code: string; message?: string }) {
    super(error.message ?? 'API Error');
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.error = error;
  }
}

jest.unstable_mockModule('../../lib/apiClient.js', () => ({
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

// ─── Mock: formatters ─────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  formatDate: (d: string) => d ?? '—',
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
  formatTime: (d: string | null | undefined) => d ?? '—',
  formatDateTime: (d: string | null | undefined) => d ?? '—',
  formatRelativeTime: (d: string) => d,
  formatPercent: (n: number) => `${n.toFixed(2)}%`,
  computeActualDuration: () => null,
  useFormatters: () => ({
    formatCurrency: (n: number) => `$${n.toFixed(2)}`,
    formatDate: (d: string | null | undefined) => d ?? '—',
    formatTime: (d: string | null | undefined) => d ?? '—',
    formatDateTime: (d: string | null | undefined) => d ?? '—',
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
  }),
}));

// ─── Type import for deferred module load ─────────────────────────────────────

let InvoiceBudgetLinesSection: (typeof InvoiceBudgetLinesSectionTypes)['InvoiceBudgetLinesSection'];

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const INVOICE_ID = 'inv-001';
const INVOICE_TOTAL = 1500.0;

const makeDetailLine = (
  id: string,
  overrides: Partial<InvoiceBudgetLineDetailResponse> = {},
): InvoiceBudgetLineDetailResponse => ({
  id,
  invoiceId: INVOICE_ID,
  workItemBudgetId: 'wib-001',
  householdItemBudgetId: null,
  itemizedAmount: 500.0,
  budgetLineDescription: 'Foundation work',
  plannedAmount: 1000.0,
  confidence: 'quote',
  categoryId: 'bc-construction',
  categoryName: 'Construction',
  categoryColor: '#ff0000',
  categoryTranslationKey: null,
  parentItemId: 'wi-001',
  parentItemTitle: 'Foundation',
  parentItemType: 'work_item',
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
  ...overrides,
});

const makeListResponse = (
  lines: InvoiceBudgetLineDetailResponse[] = [],
  remainingAmount = 1000.0,
): InvoiceBudgetLineListDetailResponse => ({
  budgetLines: lines,
  remainingAmount,
});

const makeCreateResponse = (
  line: InvoiceBudgetLineDetailResponse,
  remainingAmount = 1000.0,
): InvoiceBudgetLineCreateResponse => ({
  budgetLine: line,
  remainingAmount,
});

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  mockFetchInvoiceBudgetLines.mockReset();
  mockCreateInvoiceBudgetLine.mockReset();
  mockUpdateInvoiceBudgetLine.mockReset();
  mockDeleteInvoiceBudgetLine.mockReset();
  mockFetchWorkItemBudgets.mockReset();
  mockFetchHouseholdItemBudgets.mockReset();
  mockFetchBudgetCategories.mockReset();
  mockFetchBudgetSources.mockReset();
  mockCreateWorkItemBudget.mockReset();
  mockCreateHouseholdItemBudget.mockReset();

  // Default: empty budget lines
  mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse([], INVOICE_TOTAL));
  mockFetchWorkItemBudgets.mockResolvedValue([]);
  mockFetchHouseholdItemBudgets.mockResolvedValue([]);

  // Default: categories and budget sources for create form
  mockFetchBudgetCategories.mockResolvedValue({
    categories: [
      {
        id: 'bc-construction',
        name: 'Construction',
        color: '#ff0000',
        translationKey: null,
        sortOrder: 1,
        description: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'bc-materials',
        name: 'Materials',
        color: '#00ff00',
        translationKey: null,
        sortOrder: 2,
        description: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
  });
  mockFetchBudgetSources.mockResolvedValue({
    budgetSources: [
      {
        id: 'bs-disc',
        name: 'Discretionary',
        isDiscretionary: true,
        status: 'active' as const,
        sourceType: 'savings' as const,
        totalAmount: 100000,
        usedAmount: 0,
        availableAmount: 100000,
        claimedAmount: 0,
        unclaimedAmount: 0,
        paidAmount: 0,
        actualAvailableAmount: 100000,
        projectedAmount: 0,
        interestRate: null,
        terms: null,
        notes: null,
        createdBy: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'bs-loan',
        name: 'Bank Loan',
        isDiscretionary: false,
        status: 'active' as const,
        sourceType: 'bank_loan' as const,
        totalAmount: 100000,
        usedAmount: 0,
        availableAmount: 100000,
        claimedAmount: 0,
        unclaimedAmount: 0,
        paidAmount: 0,
        actualAvailableAmount: 100000,
        projectedAmount: 0,
        interestRate: null,
        terms: null,
        notes: null,
        createdBy: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
  });

  // Deferred import after mock registration
  const module =
    (await import('./InvoiceBudgetLinesSection.js')) as typeof InvoiceBudgetLinesSectionTypes;
  InvoiceBudgetLinesSection = module.InvoiceBudgetLinesSection;
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderSection(invoiceId = INVOICE_ID, invoiceTotal = INVOICE_TOTAL) {
  return render(
    <MemoryRouter initialEntries={[`/budget/invoices/${invoiceId}`]}>
      <InvoiceBudgetLinesSection invoiceId={invoiceId} invoiceTotal={invoiceTotal} />
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InvoiceBudgetLinesSection', () => {
  describe('loading state', () => {
    it('renders "Loading budget lines..." while fetch is pending', () => {
      mockFetchInvoiceBudgetLines.mockImplementation(() => new Promise(() => {}));
      renderSection();
      expect(screen.getByText('Loading budget lines...')).toBeInTheDocument();
    });

    it('"Add Budget Line" button is disabled while loading', () => {
      mockFetchInvoiceBudgetLines.mockImplementation(() => new Promise(() => {}));
      renderSection();
      expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).toBeDisabled();
    });
  });

  describe('error state', () => {
    it('renders error banner with ApiClientError message when fetch rejects', async () => {
      mockFetchInvoiceBudgetLines.mockRejectedValue(
        new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Database unavailable' }),
      );
      renderSection();
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
      expect(screen.getByText('Database unavailable')).toBeInTheDocument();
    });

    it('renders generic error message when non-ApiClientError is thrown', async () => {
      mockFetchInvoiceBudgetLines.mockRejectedValue(new Error('Network failure'));
      renderSection();
      await waitFor(() =>
        expect(
          screen.getByText('Failed to load budget lines. Please try again.'),
        ).toBeInTheDocument(),
      );
    });

    it('can dismiss the error banner', async () => {
      mockFetchInvoiceBudgetLines.mockRejectedValue(
        new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server error' }),
      );
      renderSection();
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Dismiss error/i }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('renders empty state text when no budget lines are linked', async () => {
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse([], INVOICE_TOTAL));
      renderSection();
      await waitFor(() => expect(screen.getByText('No budget lines linked')).toBeInTheDocument());
    });

    it('renders descriptive body text in empty state', async () => {
      renderSection();
      await waitFor(() =>
        expect(
          screen.getByText(/Link budget lines to allocate portions of this invoice/i),
        ).toBeInTheDocument(),
      );
    });

    it('does not render a table when there are no budget lines', async () => {
      renderSection();
      await waitFor(() => expect(screen.getByText('No budget lines linked')).toBeInTheDocument());
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('section structure', () => {
    it('renders the "Budget Lines" section heading', async () => {
      renderSection();
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: /^Budget Lines/i, level: 2 }),
        ).toBeInTheDocument(),
      );
    });

    it('renders "+ Add Budget Line" button', async () => {
      renderSection();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).toBeInTheDocument(),
      );
    });
  });

  describe('table with linked budget lines', () => {
    it('renders table with one row per budget line', async () => {
      const lines = [makeDetailLine('ibl-001'), makeDetailLine('ibl-002')];
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse(lines, 500.0));
      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
      // 2 data rows + 1 remaining row = 3 rows in tbody
      const rows = screen.getAllByRole('row');
      // 1 header row + 2 data rows + 1 remaining row
      expect(rows.length).toBe(4);
    });

    it('renders budget line description in the table', async () => {
      const lines = [makeDetailLine('ibl-001', { budgetLineDescription: 'Foundation work' })];
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse(lines, 1000.0));
      renderSection();
      await waitFor(() => expect(screen.getByText('Foundation work')).toBeInTheDocument());
    });

    it('renders budget line category name in the table', async () => {
      const lines = [makeDetailLine('ibl-001', { categoryName: 'Construction' })];
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse(lines, 1000.0));
      renderSection();
      await waitFor(() => expect(screen.getByText('Construction')).toBeInTheDocument());
    });

    it('renders formatted planned amount in the table', async () => {
      const lines = [makeDetailLine('ibl-001', { plannedAmount: 1000.0 })];
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse(lines, 500.0));
      renderSection();
      await waitFor(() => expect(screen.getByText('$1000.00')).toBeInTheDocument());
    });

    it('renders formatted itemized amount in the table', async () => {
      const lines = [makeDetailLine('ibl-001', { itemizedAmount: 500.0 })];
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse(lines, 1000.0));
      renderSection();
      await waitFor(() => expect(screen.getByText('$500.00')).toBeInTheDocument());
    });

    it('renders the "Remaining" row with the correct value', async () => {
      const lines = [makeDetailLine('ibl-001', { itemizedAmount: 600.0 })];
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse(lines, 900.0));
      renderSection();
      await waitFor(() => expect(screen.getByText('Remaining')).toBeInTheDocument());
      expect(screen.getByText('$900.00')).toBeInTheDocument();
    });

    it('renders em-dash when budget line has no description', async () => {
      const lines = [makeDetailLine('ibl-001', { budgetLineDescription: null })];
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse(lines, 1000.0));
      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
      // em-dash rendered as \u2014
      expect(screen.getAllByText('\u2014').length).toBeGreaterThanOrEqual(1);
    });

    it('renders "Linked Item" column header', async () => {
      const lines = [makeDetailLine('ibl-001')];
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse(lines, 1000.0));
      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
      expect(screen.getByText('Linked Item')).toBeInTheDocument();
    });

    it('renders parent item title as a link in the Linked Item column', async () => {
      const lines = [
        makeDetailLine('ibl-001', {
          parentItemId: 'wi-001',
          parentItemTitle: 'Foundation',
          parentItemType: 'work_item',
        }),
      ];
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse(lines, 1000.0));
      renderSection();
      await waitFor(() => expect(screen.getByText('Foundation')).toBeInTheDocument());
      const link = screen.getByRole('link', { name: 'Foundation' });
      expect(link).toHaveAttribute('href', '/project/work-items/wi-001');
    });

    it('renders count badge when budget lines are present', async () => {
      const lines = [makeDetailLine('ibl-001'), makeDetailLine('ibl-002')];
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse(lines, 500.0));
      renderSection();
      await waitFor(() =>
        expect(screen.getByLabelText('2 budget lines linked')).toBeInTheDocument(),
      );
    });
  });

  describe('Add Budget Line picker modal', () => {
    it('opens picker modal when "+ Add Budget Line" is clicked', async () => {
      renderSection();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Budget Line/i }));
      expect(screen.getByRole('dialog', { name: /Add Budget Line/i })).toBeInTheDocument();
    });

    it('shows "Add Budget Line" title in step 1 of picker', async () => {
      renderSection();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Budget Line/i }));
      expect(screen.getByRole('heading', { name: /^Add Budget Line$/i })).toBeInTheDocument();
    });

    it('renders WorkItemPicker and HouseholdItemPicker in step 1', async () => {
      renderSection();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Budget Line/i }));
      expect(screen.getByTestId('work-item-picker')).toBeInTheDocument();
      expect(screen.getByTestId('household-item-picker')).toBeInTheDocument();
    });

    it('closes picker when close button is clicked', async () => {
      renderSection();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Budget Line/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Close budget line picker/i }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes picker when Escape key is pressed', async () => {
      renderSection();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Budget Line/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes picker when backdrop is clicked', async () => {
      renderSection();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Budget Line/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // The outer modal container wraps a backdrop div and the dialog
      // Click the outer modal container itself (which is the parent of the backdrop div)
      const dialog = screen.getByRole('dialog');
      const outerModal = dialog.parentElement; // .modalContent -> .modal
      const backdropDiv =
        outerModal?.querySelector('.modalBackdrop') ?? outerModal?.firstElementChild;
      if (backdropDiv) fireEvent.click(backdropDiv);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  describe('inline edit', () => {
    beforeEach(async () => {
      const lines = [makeDetailLine('ibl-001', { itemizedAmount: 500.0 })];
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse(lines, 1000.0));
    });

    it('clicking Edit shows input field with current itemized amount', async () => {
      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Edit budget line/i }));
      const input = screen.getByRole('spinbutton', { name: /Edit itemized amount/i });
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue(500);
    });

    it('Cancel button restores display without making API call', async () => {
      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Edit budget line/i }));
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
      expect(mockUpdateInvoiceBudgetLine).not.toHaveBeenCalled();
    });

    it('Save calls updateInvoiceBudgetLine with new amount', async () => {
      const updatedLine = makeDetailLine('ibl-001', { itemizedAmount: 750.0 });
      mockUpdateInvoiceBudgetLine.mockResolvedValue(makeCreateResponse(updatedLine, 750.0));

      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Edit budget line/i }));

      const input = screen.getByRole('spinbutton', { name: /Edit itemized amount/i });
      fireEvent.change(input, { target: { value: '750' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Save/i }));
      });

      expect(mockUpdateInvoiceBudgetLine).toHaveBeenCalledWith(INVOICE_ID, 'ibl-001', {
        itemizedAmount: 750,
      });
    });

    it('Save hides the input field on success', async () => {
      const updatedLine = makeDetailLine('ibl-001', { itemizedAmount: 750.0 });
      mockUpdateInvoiceBudgetLine.mockResolvedValue(makeCreateResponse(updatedLine, 750.0));

      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Edit budget line/i }));
      const input = screen.getByRole('spinbutton', { name: /Edit itemized amount/i });
      fireEvent.change(input, { target: { value: '750' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Save/i }));
      });

      await waitFor(() => expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument());
    });

    it('shows validation error for negative amount', async () => {
      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Edit budget line/i }));

      const input = screen.getByRole('spinbutton', { name: /Edit itemized amount/i });
      fireEvent.change(input, { target: { value: '-100' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Save/i }));
      });

      await waitFor(() =>
        expect(screen.getByText('Amount must be a non-negative number.')).toBeInTheDocument(),
      );
      expect(mockUpdateInvoiceBudgetLine).not.toHaveBeenCalled();
    });

    it('shows API error message when updateInvoiceBudgetLine rejects with ITEMIZED_SUM_EXCEEDS_INVOICE', async () => {
      mockUpdateInvoiceBudgetLine.mockRejectedValue(
        new MockApiClientError(400, {
          code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
          message: 'The new amount would exceed the invoice total.',
        }),
      );

      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Edit budget line/i }));
      const input = screen.getByRole('spinbutton', { name: /Edit itemized amount/i });
      fireEvent.change(input, { target: { value: '9999' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Save/i }));
      });

      await waitFor(() =>
        expect(
          screen.getByText('The new amount would exceed the invoice total.'),
        ).toBeInTheDocument(),
      );
    });
  });

  describe('remove budget line', () => {
    beforeEach(async () => {
      const lines = [makeDetailLine('ibl-001')];
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse(lines, 1000.0));
    });

    it('clicking Remove shows the delete confirmation modal', async () => {
      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Remove budget line/i }));

      expect(screen.getByRole('dialog', { name: /Remove Budget Line/i })).toBeInTheDocument();
    });

    it('clicking Cancel in confirmation modal dismisses it without calling delete', async () => {
      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Remove budget line/i }));
      expect(screen.getByRole('dialog', { name: /Remove Budget Line/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockDeleteInvoiceBudgetLine).not.toHaveBeenCalled();
    });

    it('clicking Remove in confirmation calls deleteInvoiceBudgetLine', async () => {
      mockDeleteInvoiceBudgetLine.mockResolvedValue(undefined);
      // After delete, reload returns empty list
      mockFetchInvoiceBudgetLines
        .mockResolvedValueOnce(makeListResponse([makeDetailLine('ibl-001')], 1000.0))
        .mockResolvedValueOnce(makeListResponse([], INVOICE_TOTAL));

      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Remove budget line/i }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Remove$/i }));
      });

      expect(mockDeleteInvoiceBudgetLine).toHaveBeenCalledWith(INVOICE_ID, 'ibl-001');
    });

    it('refreshes budget lines list after successful removal', async () => {
      mockDeleteInvoiceBudgetLine.mockResolvedValue(undefined);
      mockFetchInvoiceBudgetLines
        .mockResolvedValueOnce(makeListResponse([makeDetailLine('ibl-001')], 1000.0))
        .mockResolvedValueOnce(makeListResponse([], INVOICE_TOTAL));

      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Remove budget line/i }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Remove$/i }));
      });

      await waitFor(() => expect(screen.getByText('No budget lines linked')).toBeInTheDocument());
    });

    it('shows error banner when deleteInvoiceBudgetLine rejects', async () => {
      mockDeleteInvoiceBudgetLine.mockRejectedValue(
        new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Delete failed' }),
      );

      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Remove budget line/i }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Remove$/i }));
      });

      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
      expect(screen.getByText('Delete failed')).toBeInTheDocument();
    });
  });

  describe('create budget line form — funding source and pre-fill', () => {
    /**
     * Helper: opens the picker, selects the work item (triggering step 2 with
     * empty budget lines), then clicks "Create Budget Line" to open the inline
     * create form. By default, mockFetchWorkItemBudgets returns [] so the
     * "Create Budget Line" button is shown in step 2.
     */
    async function openCreateForm() {
      renderSection(INVOICE_ID, 1500.0);

      // Wait for section to finish initial load
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).not.toBeDisabled(),
      );

      // Open picker (step 1)
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Budget Line/i }));
      expect(screen.getByRole('dialog', { name: /Add Budget Line/i })).toBeInTheDocument();

      // Select a work item via the mocked WorkItemPicker → transitions to step 2
      await act(async () => {
        fireEvent.click(screen.getByTestId('work-item-picker'));
      });

      // Step 2: no unlinked budget lines → "Create Budget Line" button appears
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Create Budget Line/i })).toBeInTheDocument(),
      );

      // Click "Create Budget Line" → loads categories + sources, shows inline form
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Budget Line/i }));
      });

      // Wait for create form heading
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: /Create Budget Line/i })).toBeInTheDocument(),
      );
    }

    it('renders "Funding Source" dropdown when create form opens', async () => {
      await openCreateForm();
      expect(screen.getByLabelText(/Funding Source/i)).toBeInTheDocument();
    });

    it('pre-selects the discretionary budget source in the dropdown', async () => {
      await openCreateForm();
      const select = screen.getByLabelText(/Funding Source/i) as HTMLSelectElement;
      expect(select.value).toBe('bs-disc');
    });

    it('lists all budget sources as options including "No funding source"', async () => {
      await openCreateForm();
      const select = screen.getByLabelText(/Funding Source/i);
      expect(select).toContainElement(select.querySelector('option[value=""]') as HTMLElement);
      expect(select).toContainElement(
        select.querySelector('option[value="bs-disc"]') as HTMLElement,
      );
      expect(select).toContainElement(
        select.querySelector('option[value="bs-loan"]') as HTMLElement,
      );
    });

    it('pre-fills planned amount with remaining invoice balance', async () => {
      // remainingAmount starts at INVOICE_TOTAL = 1500.00 (nothing linked yet)
      await openCreateForm();
      const amountInput = screen.getByLabelText(/Planned Amount/i) as HTMLInputElement;
      expect(amountInput.value).toBe('1500.00');
    });

    it('includes budgetSourceId in the API payload when creating a budget line', async () => {
      // The test cares about the *call arguments*, not the return value.
      // Return a minimal stub — the component only iterates the re-fetched list.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCreateWorkItemBudget.mockResolvedValue({} as any);

      // After creation, re-fetching returns an empty list (new line already linked)
      mockFetchWorkItemBudgets.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await openCreateForm();

      // Fill in the required description field
      fireEvent.change(screen.getByLabelText(/Description/i), {
        target: { value: 'Test line' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));
      });

      expect(mockCreateWorkItemBudget).toHaveBeenCalledWith(
        'wi-001',
        expect.objectContaining({
          budgetSourceId: 'bs-disc',
        }),
      );
    });

    it('shows error banner when fetchBudgetSources fails during create form open', async () => {
      mockFetchBudgetSources.mockRejectedValue(new Error('Sources unavailable'));

      renderSection(INVOICE_ID, 1500.0);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).not.toBeDisabled(),
      );

      // Open picker and navigate to step 2
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Budget Line/i }));
      await act(async () => {
        fireEvent.click(screen.getByTestId('work-item-picker'));
      });

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Create Budget Line/i })).toBeInTheDocument(),
      );

      // Click "Create Budget Line" — fetchBudgetSources will reject
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Budget Line/i }));
      });

      // Error banner should appear in the picker step
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
      expect(screen.getByText('Failed to load form data.')).toBeInTheDocument();
    });
  });

  describe('remaining amount updates', () => {
    it('remaining amount updates after a successful inline save', async () => {
      // Use distinct amounts so planned vs remaining are unambiguous
      const line = makeDetailLine('ibl-001', { itemizedAmount: 500.0, plannedAmount: 800.0 });
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse([line], 1000.0));

      const updatedLine = makeDetailLine('ibl-001', {
        itemizedAmount: 1200.0,
        plannedAmount: 800.0,
      });
      mockUpdateInvoiceBudgetLine.mockResolvedValue(makeCreateResponse(updatedLine, 300.0));

      renderSection();
      await waitFor(() => expect(screen.getByText('Remaining')).toBeInTheDocument());

      // Initial remaining amount should be $1000.00 (in the Remaining row)
      expect(screen.getByText('$1000.00')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Edit budget line/i }));
      const input = screen.getByRole('spinbutton', { name: /Edit itemized amount/i });
      fireEvent.change(input, { target: { value: '1200' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Save/i }));
      });

      // After save, remaining should be $300.00
      await waitFor(() => expect(screen.getByText('$300.00')).toBeInTheDocument());
    });
  });
});
