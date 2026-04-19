/**
 * @jest-environment jsdom
 */
/**
 * Tests for AreaBreadcrumb rendering in InvoiceBudgetLinesSection (Issue #1272).
 *
 * Verifies that the compact AreaBreadcrumb is rendered beneath the Linked Item link
 * for work_item budget lines, and is absent for household_item budget lines.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as InvoiceBudgetLinesApiTypes from '../../lib/invoiceBudgetLinesApi.js';
import type * as BudgetCategoriesApiTypes from '../../lib/budgetCategoriesApi.js';
import type * as BudgetSourcesApiTypes from '../../lib/budgetSourcesApi.js';
import type * as InvoiceBudgetLinesSectionTypes from './InvoiceBudgetLinesSection.js';
import type {
  InvoiceBudgetLineDetailResponse,
  InvoiceBudgetLineListDetailResponse,
  WorkItemBudgetLine,
  HouseholdItemBudgetLine,
} from '@cornerstone/shared';

// ── Mock functions ─────────────────────────────────────────────────────────────

const mockFetchInvoiceBudgetLines =
  jest.fn<typeof InvoiceBudgetLinesApiTypes.fetchInvoiceBudgetLines>();
const mockFetchBudgetCategories = jest.fn<typeof BudgetCategoriesApiTypes.fetchBudgetCategories>();
const mockFetchBudgetSources = jest.fn<typeof BudgetSourcesApiTypes.fetchBudgetSources>();

jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  fetchInvoiceBudgetLines: mockFetchInvoiceBudgetLines,
  createInvoiceBudgetLine: jest.fn(),
  updateInvoiceBudgetLine: jest.fn(),
  deleteInvoiceBudgetLine: jest.fn(),
}));

jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: jest.fn<() => Promise<WorkItemBudgetLine[]>>().mockResolvedValue([]),
  createWorkItemBudget: jest.fn(),
  updateWorkItemBudget: jest.fn(),
  deleteWorkItemBudget: jest.fn(),
}));

jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: jest
    .fn<() => Promise<HouseholdItemBudgetLine[]>>()
    .mockResolvedValue([]),
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

jest.unstable_mockModule('../../components/WorkItemPicker/WorkItemPicker.js', () => ({
  WorkItemPicker: () => <button data-testid="work-item-picker">Work Item Picker</button>,
}));

jest.unstable_mockModule('../../components/HouseholdItemPicker/HouseholdItemPicker.js', () => ({
  HouseholdItemPicker: () => (
    <button data-testid="household-item-picker">Household Item Picker</button>
  ),
}));

jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ApiClientError: class MockApiClientError extends Error {
    constructor(
      readonly statusCode: number,
      readonly error: { code: string; message?: string },
    ) {
      super(error.message ?? 'API Error');
      this.name = 'ApiClientError';
    }
  },
}));

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  formatDate: (d: string | null | undefined) => d ?? '—',
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
  formatTime: (d: string | null | undefined) => d ?? '—',
  formatDateTime: (d: string | null | undefined) => d ?? '—',
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const INVOICE_ID = 'inv-area-001';
const INVOICE_TOTAL = 5000.0;

function makeWorkItemLine(
  overrides: Partial<InvoiceBudgetLineDetailResponse> = {},
): InvoiceBudgetLineDetailResponse {
  return {
    id: 'ibl-wi-001',
    invoiceId: INVOICE_ID,
    workItemBudgetId: 'wib-001',
    householdItemBudgetId: null,
    itemizedAmount: 500.0,
    budgetLineDescription: 'Foundation work',
    plannedAmount: 1000.0,
    confidence: 'quote',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryTranslationKey: null,
    parentItemId: 'wi-001',
    parentItemTitle: 'Foundation',
    parentItemType: 'work_item',
    parentItemArea: null,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
    ...overrides,
  };
}

function makeHouseholdItemLine(
  overrides: Partial<InvoiceBudgetLineDetailResponse> = {},
): InvoiceBudgetLineDetailResponse {
  return {
    id: 'ibl-hi-001',
    invoiceId: INVOICE_ID,
    workItemBudgetId: null,
    householdItemBudgetId: 'hib-001',
    itemizedAmount: 200.0,
    budgetLineDescription: 'Standing Desk budget',
    plannedAmount: 800.0,
    confidence: 'own_estimate',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryTranslationKey: null,
    parentItemId: 'hi-001',
    parentItemTitle: 'Standing Desk',
    parentItemType: 'household_item',
    parentItemArea: null,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
    ...overrides,
  };
}

function makeListResponse(
  lines: InvoiceBudgetLineDetailResponse[],
  remainingAmount = 4000.0,
): InvoiceBudgetLineListDetailResponse {
  return { budgetLines: lines, remainingAmount };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let InvoiceBudgetLinesSection: (typeof InvoiceBudgetLinesSectionTypes)['InvoiceBudgetLinesSection'];

beforeEach(async () => {
  mockFetchInvoiceBudgetLines.mockReset();
  mockFetchBudgetCategories.mockReset();
  mockFetchBudgetSources.mockReset();

  mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
  mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });

  if (!InvoiceBudgetLinesSection) {
    const module =
      (await import('./InvoiceBudgetLinesSection.js')) as typeof InvoiceBudgetLinesSectionTypes;
    InvoiceBudgetLinesSection = module.InvoiceBudgetLinesSection;
  }
});

function renderSection() {
  return render(
    <MemoryRouter initialEntries={[`/budget/invoices/${INVOICE_ID}`]}>
      <InvoiceBudgetLinesSection invoiceId={INVOICE_ID} invoiceTotal={INVOICE_TOTAL} />
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InvoiceBudgetLinesSection — area breadcrumb', () => {
  it('work_item line with area → area name visible in linked item cell', async () => {
    const line = makeWorkItemLine({
      parentItemArea: { id: 'area-kitchen', name: 'Kitchen', color: '#ff0000', ancestors: [] },
    });
    mockFetchInvoiceBudgetLines.mockResolvedValueOnce(makeListResponse([line]));

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('Foundation')).toBeInTheDocument();
    });

    expect(screen.getByText('Kitchen')).toBeInTheDocument();
  });

  it('work_item line with null area → "No area" visible in linked item cell', async () => {
    const line = makeWorkItemLine({ parentItemArea: null });
    mockFetchInvoiceBudgetLines.mockResolvedValueOnce(makeListResponse([line]));

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('Foundation')).toBeInTheDocument();
    });

    expect(screen.getByText('No area')).toBeInTheDocument();
  });

  it('household_item line → no breadcrumb in that row', async () => {
    const hiLine = makeHouseholdItemLine({ parentItemArea: null });
    mockFetchInvoiceBudgetLines.mockResolvedValueOnce(makeListResponse([hiLine]));

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('Standing Desk')).toBeInTheDocument();
    });

    // AreaBreadcrumb is not rendered for household_item lines
    expect(screen.queryByText('No area')).not.toBeInTheDocument();
  });
});
