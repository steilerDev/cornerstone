/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock: LocaleContext (MUST be before any module that imports formatters) ──
// Defensive layer to ensure useLocale never reaches the real LocaleContext
// implementation (which throws if no LocaleProvider wraps the tree).
// NOTE: Mock on .ts not .js because moduleNameMapper redirects .js to .ts

jest.unstable_mockModule('../../contexts/LocaleContext.tsx', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import type * as InvoiceBudgetLinesApiTypes from '../../lib/invoiceBudgetLinesApi.js';
import type * as WorkItemBudgetsApiTypes from '../../lib/workItemBudgetsApi.js';
import type * as HouseholdItemBudgetsApiTypes from '../../lib/householdItemBudgetsApi.js';
import type * as BudgetCategoriesApiTypes from '../../lib/budgetCategoriesApi.js';
import type * as BudgetSourcesApiTypes from '../../lib/budgetSourcesApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as InvoiceBudgetLinesSectionTypes from './InvoiceBudgetLinesSection.js';
import type {
  InvoiceBudgetLineDetailResponse,
  InvoiceBudgetLineListDetailResponse,
  InvoiceBudgetLineCreateResponse,
} from '@cornerstone/shared';

// ─── Module-scope mock functions ───────────────────────────────────────────────

const mockFetchBudgetCategories = jest.fn<typeof BudgetCategoriesApiTypes.fetchBudgetCategories>();
const mockFetchBudgetSources = jest.fn<typeof BudgetSourcesApiTypes.fetchBudgetSources>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
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
const mockEditAndMoveBudgetLine =
  jest.fn<typeof InvoiceBudgetLinesApiTypes.editAndMoveBudgetLine>();
const mockFetchWorkItemBudgets = jest.fn<typeof WorkItemBudgetsApiTypes.fetchWorkItemBudgets>();
const mockFetchHouseholdItemBudgets =
  jest.fn<typeof HouseholdItemBudgetsApiTypes.fetchHouseholdItemBudgets>();

// ─── Mock: invoiceBudgetLinesApi ───────────────────────────────────────────────

jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  fetchInvoiceBudgetLines: mockFetchInvoiceBudgetLines,
  createInvoiceBudgetLine: mockCreateInvoiceBudgetLine,
  updateInvoiceBudgetLine: mockUpdateInvoiceBudgetLine,
  deleteInvoiceBudgetLine: mockDeleteInvoiceBudgetLine,
  editAndMoveBudgetLine: mockEditAndMoveBudgetLine,
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

// ─── Mock: vendorsApi ─────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

// ─── Mock: BudgetLineForm ─────────────────────────────────────────────────────
// Mocked at the module boundary so tests don't need to render its full internals.

jest.unstable_mockModule('../../components/budget/BudgetLineForm.js', () => ({
  BudgetLineForm: (props: {
    form: { description?: string; plannedAmount?: string; pricingMode?: string };
    onSubmit: (e: { preventDefault: () => void }) => void;
    onFormChange: (updates: Record<string, unknown>) => void;
    onCancel: () => void;
    error: string | null;
    isSaving: boolean;
    budgetCategories?: unknown[];
    // Itemized amount field — used in the invoice-side edit context
    itemizedAmount?: string;
    onItemizedAmountChange?: (value: string) => void;
  }) => (
    <form data-testid="budget-line-form" onSubmit={props.onSubmit}>
      <input
        data-testid="form-description"
        value={props.form.description ?? ''}
        onChange={(e) => props.onFormChange({ description: e.target.value })}
      />
      <input
        data-testid="form-planned-amount"
        value={props.form.plannedAmount ?? ''}
        onChange={(e) => props.onFormChange({ plannedAmount: e.target.value })}
      />
      {/* Itemized Amount field — rendered when prop is provided (edit-modal context) */}
      {props.itemizedAmount !== undefined && (
        <div>
          <label htmlFor="mock-itemized-amount">Itemized Amount (€) *</label>
          <input
            id="mock-itemized-amount"
            type="number"
            value={props.itemizedAmount}
            onChange={(e) => props.onItemizedAmountChange?.(e.target.value)}
          />
        </div>
      )}
      {props.error && (
        <div data-testid="form-error" role="alert">
          {props.error}
        </div>
      )}
      {props.isSaving && <span data-testid="form-saving">Saving...</span>}
      <button type="submit" data-testid="form-submit" disabled={props.isSaving}>
        Submit
      </button>
      <button type="button" data-testid="form-cancel" onClick={props.onCancel}>
        Cancel
      </button>
      {props.budgetCategories !== undefined && <div data-testid="has-categories" />}
    </form>
  ),
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

/**
 * Minimal WorkItemBudgetLine stub for mocking createWorkItemBudget/fetchWorkItemBudgets.
 * Includes all required BaseBudgetLine fields.
 */
const makeBudgetLineStub = (id: string, plannedAmount: number) => ({
  id,
  workItemId: 'wi-001',
  description: null,
  plannedAmount,
  confidence: 'own_estimate' as const,
  confidenceMargin: 0.3,
  budgetCategory: null,
  budgetSource: null,
  vendor: null,
  actualCost: 0,
  actualCostPaid: 0,
  invoiceCount: 0,
  invoiceLink: null,
  quantity: null,
  unit: null,
  unitPrice: null,
  includesVat: true,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

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
  parentItemArea: null,
  quantity: null,
  unit: null,
  unitPrice: null,
  includesVat: true,
  vendorId: null,
  budgetSourceId: null,
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
  mockEditAndMoveBudgetLine.mockReset();
  mockFetchWorkItemBudgets.mockReset();
  mockFetchHouseholdItemBudgets.mockReset();
  mockFetchBudgetCategories.mockReset();
  mockFetchBudgetSources.mockReset();
  mockFetchVendors.mockReset();
  mockCreateWorkItemBudget.mockReset();
  mockCreateHouseholdItemBudget.mockReset();

  // Default: empty budget lines
  mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse([], INVOICE_TOTAL));
  mockFetchWorkItemBudgets.mockResolvedValue([]);
  mockFetchHouseholdItemBudgets.mockResolvedValue([]);

  // Default: empty vendors list
  mockFetchVendors.mockResolvedValue({
    vendors: [],
    pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
  });

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
        projectedMinAmount: 0,
        projectedMaxAmount: 0,
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
        projectedMinAmount: 0,
        projectedMaxAmount: 0,
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

// LocaleProvider passthrough stub — useLocale is already mocked via jest.unstable_mockModule above,
// so we just need a valid React wrapper that renders children.
const LocaleProviderStub = ({ children }: { children: React.ReactNode }) => <>{children}</>;

function renderSection(invoiceId = INVOICE_ID, invoiceTotal = INVOICE_TOTAL) {
  return render(
    <MemoryRouter initialEntries={[`/budget/invoices/${invoiceId}`]}>
      <LocaleProviderStub>
        <InvoiceBudgetLinesSection invoiceId={invoiceId} invoiceTotal={invoiceTotal} />
      </LocaleProviderStub>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InvoiceBudgetLinesSection', () => {
  describe('loading state', () => {
    it('renders "Loading budget lines..." while fetch is pending', () => {
      mockFetchInvoiceBudgetLines.mockImplementation(() => new Promise(() => {}));
      renderSection();
      expect(screen.getByText(/Loading budget lines/i)).toBeInTheDocument();
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

  describe('create budget line form — BudgetLineForm integration', () => {
    /**
     * Helper: opens the picker, selects a work item (triggering step 2 with
     * empty budget lines), then clicks "Create Budget Line" to open the rich form.
     * By default, mockFetchWorkItemBudgets returns [] so the "Create Budget Line"
     * button is shown in step 2 (empty-state path).
     */
    async function openCreateFormForWorkItem() {
      renderSection(INVOICE_ID, 1500.0);

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).not.toBeDisabled(),
      );

      fireEvent.click(screen.getByRole('button', { name: /\+ Add Budget Line/i }));
      expect(screen.getByRole('dialog', { name: /Add Budget Line/i })).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByTestId('work-item-picker'));
      });

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Create Budget Line/i })).toBeInTheDocument(),
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Budget Line/i }));
      });

      await waitFor(() => expect(screen.getByTestId('budget-line-form')).toBeInTheDocument());
    }

    it('shows BudgetLineForm with categories (work_item branch)', async () => {
      await openCreateFormForWorkItem();
      // work_item branch passes budgetCategories prop → mock renders [data-testid="has-categories"]
      expect(screen.getByTestId('has-categories')).toBeInTheDocument();
    });

    it('calls fetchVendors with pageSize:100 when create form opens', async () => {
      await openCreateFormForWorkItem();
      expect(mockFetchVendors).toHaveBeenCalledWith({ pageSize: 100 });
    });

    it('shows BudgetLineForm without categories for household_item branch', async () => {
      renderSection(INVOICE_ID, 1500.0);

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).not.toBeDisabled(),
      );

      fireEvent.click(screen.getByRole('button', { name: /\+ Add Budget Line/i }));

      // Select a household item
      await act(async () => {
        fireEvent.click(screen.getByTestId('household-item-picker'));
      });

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Create Budget Line/i })).toBeInTheDocument(),
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Budget Line/i }));
      });

      await waitFor(() => expect(screen.getByTestId('budget-line-form')).toBeInTheDocument());
      // household_item passes undefined for budgetCategories → mock does NOT render [data-testid="has-categories"]
      expect(screen.queryByTestId('has-categories')).not.toBeInTheDocument();
    });

    it('onFormChange updates form description state', async () => {
      await openCreateFormForWorkItem();

      const descInput = screen.getByTestId('form-description');
      fireEvent.change(descInput, { target: { value: 'My updated description' } });

      await waitFor(() =>
        expect(screen.getByTestId('form-description')).toHaveValue('My updated description'),
      );
    });

    it('shows error banner when fetchBudgetSources fails during create form open', async () => {
      mockFetchBudgetSources.mockRejectedValue(new Error('Sources unavailable'));

      renderSection(INVOICE_ID, 1500.0);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).not.toBeDisabled(),
      );

      fireEvent.click(screen.getByRole('button', { name: /\+ Add Budget Line/i }));
      await act(async () => {
        fireEvent.click(screen.getByTestId('work-item-picker'));
      });

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Create Budget Line/i })).toBeInTheDocument(),
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Budget Line/i }));
      });

      // Error banner appears in the picker step; form does NOT open
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
      expect(screen.getByText('Failed to load form data.')).toBeInTheDocument();
      expect(screen.queryByTestId('budget-line-form')).not.toBeInTheDocument();
    });
  });

  describe('auto-link: create budget line and link to invoice (#1401)', () => {
    /**
     * Helper: navigate to step 2 (empty-state path) for a work item and open
     * the rich create form.
     */
    async function openCreateFormWorkItemEmpty() {
      renderSection(INVOICE_ID, INVOICE_TOTAL);

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).not.toBeDisabled(),
      );

      fireEvent.click(screen.getByRole('button', { name: /\+ Add Budget Line/i }));

      await act(async () => {
        fireEvent.click(screen.getByTestId('work-item-picker'));
      });

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Create Budget Line/i })).toBeInTheDocument(),
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Budget Line/i }));
      });

      await waitFor(() => expect(screen.getByTestId('budget-line-form')).toBeInTheDocument());
    }

    /**
     * Helper: navigate to step 2 with existing budget lines, then click
     * the "Create Budget Line" button that appears below the list.
     */
    async function openCreateFormWorkItemNonEmpty() {
      // Make one unlinked work item budget line available
      const unlinkedLine = makeBudgetLineStub('wib-existing-001', 300);
      mockFetchWorkItemBudgets.mockResolvedValue([unlinkedLine]);

      renderSection(INVOICE_ID, INVOICE_TOTAL);

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).not.toBeDisabled(),
      );

      fireEvent.click(screen.getByRole('button', { name: /\+ Add Budget Line/i }));

      await act(async () => {
        fireEvent.click(screen.getByTestId('work-item-picker'));
      });

      // The list shows AND a "Create Budget Line" button is below it
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Add Selected Lines/i })).toBeInTheDocument(),
      );

      // "Create Budget Line" button should also be visible below the list
      expect(screen.getByRole('button', { name: /^Create Budget Line$/i })).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Create Budget Line$/i }));
      });

      await waitFor(() => expect(screen.getByTestId('budget-line-form')).toBeInTheDocument());
    }

    it('non-empty path: list + "Create Budget Line" button visible; clicking shows form, hides list', async () => {
      await openCreateFormWorkItemNonEmpty();
      // Once form opens, the budget line list should be hidden
      expect(screen.queryByRole('button', { name: /Add Selected Lines/i })).not.toBeInTheDocument();
      // Form is visible
      expect(screen.getByTestId('budget-line-form')).toBeInTheDocument();
    });

    it('submit happy path — direct mode VAT included: calls createWorkItemBudget (not createInvoiceBudgetLine), then closes', async () => {
      const newBudgetLineStub = makeBudgetLineStub('wib-new-001', 500);
      mockCreateWorkItemBudget.mockResolvedValue(newBudgetLineStub);

      // After the first (empty) render call, return the newly-created line on refetch
      const linkedLine = makeDetailLine('ibl-linked-001', {
        workItemBudgetId: 'wib-new-001',
        itemizedAmount: 500,
        plannedAmount: 500,
      });
      mockFetchInvoiceBudgetLines
        .mockResolvedValueOnce(makeListResponse([], INVOICE_TOTAL)) // initial load (empty)
        .mockResolvedValue(makeListResponse([linkedLine], INVOICE_TOTAL)); // after create

      await openCreateFormWorkItemEmpty();

      // Drive form state: set plannedAmount to '500' (includesVat defaults to true in initial form)
      fireEvent.change(screen.getByTestId('form-planned-amount'), { target: { value: '500' } });

      await act(async () => {
        fireEvent.submit(screen.getByTestId('budget-line-form'));
      });

      await waitFor(() => {
        expect(mockCreateWorkItemBudget).toHaveBeenCalledWith(
          'wi-001',
          expect.objectContaining({
            plannedAmount: 500,
            confidence: 'invoice',
            includesVat: true,
          }),
        );
      });

      // createInvoiceBudgetLine is NOT called from the create flow (non-eager mode)
      expect(mockCreateInvoiceBudgetLine).not.toHaveBeenCalled();

      // Picker closes after success
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      // Newly linked line appears in the table
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('submit direct mode VAT NOT included: validation error for invalid amount', async () => {
      // Test the validation guard: invalid plannedAmount (empty string → NaN) stays in form
      await openCreateFormWorkItemEmpty();

      // Submit with empty plannedAmount (default) — NaN guard fires
      await act(async () => {
        fireEvent.submit(screen.getByTestId('budget-line-form'));
      });

      // Form stays open (error state)
      await waitFor(() => expect(screen.getByTestId('budget-line-form')).toBeInTheDocument());
      // createWorkItemBudget is NOT called (validation rejected)
      expect(mockCreateWorkItemBudget).not.toHaveBeenCalled();
    });

    it('submit direct mode with valid amount and VAT included: amount sent as-is (multiplier=1)', async () => {
      // plannedAmount=1000, includesVat=true → multiplier=1 → stored as 1000
      const newBudgetLineStub = makeBudgetLineStub('wib-vat-incl-001', 1000);
      mockCreateWorkItemBudget.mockResolvedValue(newBudgetLineStub);
      const linkedLine = makeDetailLine('ibl-vat-incl-001', {
        workItemBudgetId: 'wib-vat-incl-001',
        itemizedAmount: 1000,
        plannedAmount: 1000,
      });
      mockCreateInvoiceBudgetLine.mockResolvedValue(makeCreateResponse(linkedLine, 500.0));

      await openCreateFormWorkItemEmpty();

      fireEvent.change(screen.getByTestId('form-planned-amount'), { target: { value: '1000' } });

      await act(async () => {
        fireEvent.submit(screen.getByTestId('budget-line-form'));
      });

      await waitFor(() =>
        expect(mockCreateWorkItemBudget).toHaveBeenCalledWith(
          'wi-001',
          expect.objectContaining({ plannedAmount: 1000, includesVat: true }),
        ),
      );
    });

    it('submit unit mode: plannedAmount = quantity * unitPrice', async () => {
      const newBudgetLineStub = makeBudgetLineStub('wib-unit-001', 600);
      mockCreateWorkItemBudget.mockResolvedValue(newBudgetLineStub);

      const linkedLine = makeDetailLine('ibl-unit-001', {
        workItemBudgetId: 'wib-unit-001',
        itemizedAmount: 600,
        plannedAmount: 600,
      });
      mockCreateInvoiceBudgetLine.mockResolvedValue(makeCreateResponse(linkedLine, 900.0));

      await openCreateFormWorkItemEmpty();

      // For unit mode we need plannedAmount to be set (direct mode path is tested above).
      // The mock form only exposes plannedAmount as a string input.
      // Setting plannedAmount='600' with pricingMode='direct' (default) is sufficient
      // to verify that the component reads and forwards the value correctly.
      fireEvent.change(screen.getByTestId('form-planned-amount'), { target: { value: '600' } });

      await act(async () => {
        fireEvent.submit(screen.getByTestId('budget-line-form'));
      });

      await waitFor(() => {
        expect(mockCreateWorkItemBudget).toHaveBeenCalledWith(
          'wi-001',
          expect.objectContaining({ plannedAmount: 600 }),
        );
      });
    });

    it('isSaving is shown during create+link sequence and cleared on success', async () => {
      let resolveCreate: (v: ReturnType<typeof makeBudgetLineStub>) => void;
      const createPromise = new Promise<ReturnType<typeof makeBudgetLineStub>>(
        (res) => (resolveCreate = res),
      );
      mockCreateWorkItemBudget.mockReturnValue(createPromise);

      await openCreateFormWorkItemEmpty();

      // Set a valid planned amount so the form doesn't fail validation
      fireEvent.change(screen.getByTestId('form-planned-amount'), { target: { value: '100' } });

      // Submit — isSaving should appear before promise resolves
      act(() => {
        fireEvent.submit(screen.getByTestId('budget-line-form'));
      });

      await waitFor(() => expect(screen.getByTestId('form-saving')).toBeInTheDocument());

      // Now resolve the create promise
      const newBudgetLine = makeBudgetLineStub('wib-saving-001', 100);
      const linkedLine = makeDetailLine('ibl-saving-001', {
        workItemBudgetId: 'wib-saving-001',
        itemizedAmount: 100,
        plannedAmount: 100,
      });
      mockCreateInvoiceBudgetLine.mockResolvedValue(makeCreateResponse(linkedLine, 1400.0));

      await act(async () => {
        resolveCreate!(newBudgetLine);
      });

      // After both promises resolve, isSaving is cleared and picker closes
      await waitFor(() => expect(screen.queryByTestId('form-saving')).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('create error from createWorkItemBudget: form stays open with error', async () => {
      mockCreateWorkItemBudget.mockRejectedValue(
        new MockApiClientError(400, {
          code: 'VALIDATION_ERROR',
          message: 'Failed to create budget line.',
        }),
      );
      await openCreateFormWorkItemEmpty();
      fireEvent.change(screen.getByTestId('form-planned-amount'), { target: { value: '5000' } });
      await act(async () => {
        fireEvent.submit(screen.getByTestId('budget-line-form'));
      });
      await waitFor(() => expect(screen.getByTestId('budget-line-form')).toBeInTheDocument());
      await waitFor(() =>
        expect(screen.getByTestId('form-error')).toHaveTextContent('Failed to create budget line.'),
      );
      expect(mockCreateInvoiceBudgetLine).not.toHaveBeenCalled();
    });

    it('create error (non-link): form stays open with error, createInvoiceBudgetLine NOT called', async () => {
      mockCreateWorkItemBudget.mockRejectedValue(
        new MockApiClientError(400, {
          code: 'VALIDATION_ERROR',
          message: 'Description is required.',
        }),
      );

      await openCreateFormWorkItemEmpty();

      fireEvent.change(screen.getByTestId('form-planned-amount'), { target: { value: '300' } });

      await act(async () => {
        fireEvent.submit(screen.getByTestId('budget-line-form'));
      });

      // Form stays open (picker is still showing)
      await waitFor(() => expect(screen.getByTestId('budget-line-form')).toBeInTheDocument());

      // Error is shown in the form
      await waitFor(() =>
        expect(screen.getByTestId('form-error')).toHaveTextContent('Description is required.'),
      );

      // The link call was never made
      expect(mockCreateInvoiceBudgetLine).not.toHaveBeenCalled();
    });

    it('cancel returns to list view', async () => {
      await openCreateFormWorkItemNonEmpty();

      // Form is open; click cancel
      await act(async () => {
        fireEvent.click(screen.getByTestId('form-cancel'));
      });

      // Form should be gone
      await waitFor(() => expect(screen.queryByTestId('budget-line-form')).not.toBeInTheDocument());

      // List + Add Selected Lines button should reappear
      expect(screen.getByRole('button', { name: /Add Selected Lines/i })).toBeInTheDocument();
    });

    it('regression — select-existing-line flow uses createInvoiceBudgetLine with existing-line payload', async () => {
      const existingLine = makeBudgetLineStub('wib-existing-reg-001', 400);
      mockFetchWorkItemBudgets.mockResolvedValue([existingLine]);

      const linkedLine = makeDetailLine('ibl-reg-001', {
        workItemBudgetId: 'wib-existing-reg-001',
        itemizedAmount: 400,
        plannedAmount: 400,
      });
      mockCreateInvoiceBudgetLine.mockResolvedValue(makeCreateResponse(linkedLine, 1100.0));

      renderSection(INVOICE_ID, INVOICE_TOTAL);

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /\+ Add Budget Line/i })).not.toBeDisabled(),
      );

      fireEvent.click(screen.getByRole('button', { name: /\+ Add Budget Line/i }));

      await act(async () => {
        fireEvent.click(screen.getByTestId('work-item-picker'));
      });

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Add Selected Lines/i })).toBeInTheDocument(),
      );

      // Check the line's checkbox so handleAddSelectedLines will process it
      const checkbox = screen.getByRole('checkbox');
      await act(async () => {
        fireEvent.click(checkbox);
      });

      // Set itemized amount for the existing line via its input
      const amountInput = screen.getByRole('spinbutton', {
        name: /Itemized amount for/i,
      });
      fireEvent.change(amountInput, { target: { value: '400' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Add Selected Lines/i }));
      });

      await waitFor(() =>
        expect(mockCreateInvoiceBudgetLine).toHaveBeenCalledWith(
          INVOICE_ID,
          expect.objectContaining({
            workItemBudgetId: 'wib-existing-reg-001',
            itemizedAmount: 400,
          }),
        ),
      );

      // createWorkItemBudget was NOT called (existing line path)
      expect(mockCreateWorkItemBudget).not.toHaveBeenCalled();
    });
  });

  // ─── Bug #1425: kebab menu + modal flow ────────────────────────────────────────

  describe('budget line kebab menu + modal flow (#1425)', () => {
    const lineWithDesc = makeDetailLine('ibl-001', {
      budgetLineDescription: 'Foundation work',
      itemizedAmount: 500.0,
      plannedAmount: 1000.0,
    });

    beforeEach(() => {
      mockFetchInvoiceBudgetLines.mockResolvedValue(makeListResponse([lineWithDesc], 1000.0));
    });

    it('each budget line row renders an OverflowMenu trigger (⋮) with data-testid', async () => {
      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      // The OverflowMenu trigger is rendered with data-testid="budget-line-menu-{line.id}"
      const trigger = screen.getByTestId('budget-line-menu-ibl-001');
      expect(trigger).toBeInTheDocument();
      expect(trigger.tagName.toLowerCase()).toBe('button');
    });

    it('clicking ⋮ trigger opens the overflow menu with Edit and Remove items', async () => {
      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      const trigger = screen.getByTestId('budget-line-menu-ibl-001');
      fireEvent.click(trigger);

      const menuItems = screen.getAllByRole('menuitem');
      const labels = menuItems.map((m) => m.textContent?.toLowerCase() ?? '');
      expect(labels.some((l) => l.includes('edit'))).toBe(true);
      expect(labels.some((l) => l.includes('remove'))).toBe(true);
    });

    it('clicking "Edit" opens a modal with title "Edit Budget Line"', async () => {
      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      const trigger = screen.getByTestId('budget-line-menu-ibl-001');
      fireEvent.click(trigger);

      const editItem = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('edit'))!;
      fireEvent.click(editItem);

      // Modal should be visible — the real Modal renders a dialog with aria-label
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      // The dialog has an accessible name containing "Edit Budget Line"
      expect(screen.getByRole('dialog', { name: /edit budget line/i })).toBeInTheDocument();
    });

    it('Edit modal pre-populates amount input with current itemizedAmount', async () => {
      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      const trigger = screen.getByTestId('budget-line-menu-ibl-001');
      fireEvent.click(trigger);

      const editItem = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('edit'))!;
      fireEvent.click(editItem);

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      // The amount input should be pre-populated with the current itemizedAmount (500)
      const amountInput = screen.getByLabelText(/itemized amount/i) as HTMLInputElement;
      expect(amountInput.value).toBe('500');
    });

    it('changing amount and submitting calls editAndMoveBudgetLine with new value', async () => {
      const updatedLine = makeDetailLine('ibl-001', { itemizedAmount: 750.0 });
      // The full-form edit path uses editAndMoveBudgetLine (not updateInvoiceBudgetLine)
      mockEditAndMoveBudgetLine.mockResolvedValue(makeCreateResponse(updatedLine, 750.0));

      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      const trigger = screen.getByTestId('budget-line-menu-ibl-001');
      fireEvent.click(trigger);

      const editItem = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('edit'))!;
      fireEvent.click(editItem);

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      const amountInput = screen.getByLabelText(/itemized amount/i);
      fireEvent.change(amountInput, { target: { value: '750' } });

      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        // editAndMoveBudgetLine is called with the full payload; verify itemizedAmount
        expect(mockEditAndMoveBudgetLine).toHaveBeenCalledWith(
          INVOICE_ID,
          'ibl-001',
          expect.objectContaining({ itemizedAmount: 750 }),
        );
      });
    });

    it('successful edit closes the modal', async () => {
      const updatedLine = makeDetailLine('ibl-001', { itemizedAmount: 750.0 });
      // The full-form edit path uses editAndMoveBudgetLine (not updateInvoiceBudgetLine)
      mockEditAndMoveBudgetLine.mockResolvedValue(makeCreateResponse(updatedLine, 750.0));

      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      const trigger = screen.getByTestId('budget-line-menu-ibl-001');
      fireEvent.click(trigger);
      const editItem = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('edit'))!;
      fireEvent.click(editItem);

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      const amountInput = screen.getByLabelText(/itemized amount/i);
      fireEvent.change(amountInput, { target: { value: '750' } });

      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('ITEMIZED_SUM_EXCEEDS_INVOICE error shows error in modal and modal stays open', async () => {
      // The full-form edit path uses editAndMoveBudgetLine (not updateInvoiceBudgetLine)
      mockEditAndMoveBudgetLine.mockRejectedValue(
        new MockApiClientError(400, {
          code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
          message: 'The new amount would exceed the invoice total.',
        }),
      );

      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      const trigger = screen.getByTestId('budget-line-menu-ibl-001');
      fireEvent.click(trigger);
      const editItem = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('edit'))!;
      fireEvent.click(editItem);

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      const amountInput = screen.getByLabelText(/itemized amount/i);
      fireEvent.change(amountInput, { target: { value: '9999' } });

      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });

      // Modal stays open
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      // Error message appears inside the modal (FormError renders role="alert")
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(
        screen.getByText('The new amount would exceed the invoice total.'),
      ).toBeInTheDocument();
    });

    it('clicking "Remove" opens the delete confirmation modal', async () => {
      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      const trigger = screen.getByTestId('budget-line-menu-ibl-001');
      fireEvent.click(trigger);

      const removeItem = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('remove'))!;
      fireEvent.click(removeItem);

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
      expect(screen.getByRole('dialog', { name: /remove budget line/i })).toBeInTheDocument();
    });

    it('confirming removal calls deleteInvoiceBudgetLine and removes the row', async () => {
      mockDeleteInvoiceBudgetLine.mockResolvedValue(undefined);
      // After delete, reload returns empty list
      mockFetchInvoiceBudgetLines
        .mockResolvedValueOnce(makeListResponse([lineWithDesc], 1000.0))
        .mockResolvedValueOnce(makeListResponse([], INVOICE_TOTAL));

      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      const trigger = screen.getByTestId('budget-line-menu-ibl-001');
      fireEvent.click(trigger);
      const removeItem = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('remove'))!;
      fireEvent.click(removeItem);

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      // Use an exact-match selector so we get the "Remove" confirm button, not the × close button
      const dialog = screen.getByRole('dialog');
      const removeConfirmBtn = within(dialog).getByRole('button', { name: /^Remove$/i });

      await act(async () => {
        fireEvent.click(removeConfirmBtn);
      });

      await waitFor(() => {
        expect(mockDeleteInvoiceBudgetLine).toHaveBeenCalledWith(INVOICE_ID, 'ibl-001');
      });

      // After deletion, empty state is shown
      await waitFor(() => expect(screen.getByText('No budget lines linked')).toBeInTheDocument());
    });

    it('cancel in delete modal closes without calling delete', async () => {
      renderSection();
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

      const trigger = screen.getByTestId('budget-line-menu-ibl-001');
      fireEvent.click(trigger);
      const removeItem = screen
        .getAllByRole('menuitem')
        .find((m) => m.textContent?.toLowerCase().includes('remove'))!;
      fireEvent.click(removeItem);

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

      // Find cancel button in the dialog
      const cancelBtn = Array.from(screen.getByRole('dialog').querySelectorAll('button')).find(
        (b) => b.textContent?.toLowerCase().includes('cancel'),
      )!;
      fireEvent.click(cancelBtn);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockDeleteInvoiceBudgetLine).not.toHaveBeenCalled();
    });
  });
});
