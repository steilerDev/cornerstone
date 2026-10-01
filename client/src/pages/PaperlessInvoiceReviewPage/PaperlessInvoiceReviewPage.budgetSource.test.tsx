/**
 * @jest-environment jsdom
 *
 * Integration tests for PaperlessInvoiceReviewPage — invoice-level default budget source (Issue #2158).
 */

// ─── Mocks (must precede all static imports) ───────────────────────────────────

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type * as PaperlessApiModule from '../../lib/paperlessApi.js';
import type * as InvoiceAutoItemizeApiModule from '../../lib/invoiceAutoItemizeApi.js';
import type * as WorkItemBudgetsApiModule from '../../lib/workItemBudgetsApi.js';
import type * as HouseholdItemBudgetsApiModule from '../../lib/householdItemBudgetsApi.js';
import type * as VendorsApiModule from '../../lib/vendorsApi.js';
import type {
  PaperlessDocumentDetailResponse,
  AutoItemizePreviewResponse,
  AutoItemizeCommitResponse,
  Invoice,
} from '@cornerstone/shared';

// ─── Mock: paperlessApi ────────────────────────────────────────────────────────

const mockGetPaperlessDocument = jest.fn<typeof PaperlessApiModule.getPaperlessDocument>();
const mockGetDocumentPreviewUrl = jest.fn<(id: number) => string>(
  (id) => `/paperless/documents/${id}/preview`,
);

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: jest.fn(),
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: mockGetPaperlessDocument,
  getDocumentThumbnailUrl: (id: number) => `/thumb/${id}`,
  getDocumentPreviewUrl: mockGetDocumentPreviewUrl,
  listPaperlessCorrespondents: jest.fn(),
}));

// ─── Mock: invoiceAutoItemizeApi ───────────────────────────────────────────────

const mockPreviewAutoItemize = jest.fn<typeof InvoiceAutoItemizeApiModule.previewAutoItemize>();
const mockCommitAutoItemizeCreate =
  jest.fn<typeof InvoiceAutoItemizeApiModule.commitAutoItemizeCreate>();

const mockMergeLines = jest.fn<typeof InvoiceAutoItemizeApiModule.mergeLines>();

jest.unstable_mockModule('../../lib/invoiceAutoItemizeApi.js', () => ({
  autoItemize: jest.fn(),
  previewAutoItemize: mockPreviewAutoItemize,
  commitAutoItemizeCreate: mockCommitAutoItemizeCreate,
  mergeLines: mockMergeLines,
}));

// ─── Mock: vendorsApi ──────────────────────────────────────────────────────────

const mockFetchVendors = jest.fn<typeof VendorsApiModule.fetchVendors>();

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

// ─── Mock: workItemBudgetsApi ─────────────────────────────────────────────────

const mockCreateWorkItemBudget = jest.fn<typeof WorkItemBudgetsApiModule.createWorkItemBudget>();

jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: jest.fn(),
  createWorkItemBudget: mockCreateWorkItemBudget,
  updateWorkItemBudget: jest.fn(),
  deleteWorkItemBudget: jest.fn(),
}));

// ─── Mock: householdItemBudgetsApi ────────────────────────────────────────────

const mockCreateHouseholdItemBudget =
  jest.fn<typeof HouseholdItemBudgetsApiModule.createHouseholdItemBudget>();

jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: jest.fn(),
  createHouseholdItemBudget: mockCreateHouseholdItemBudget,
  updateHouseholdItemBudget: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));

// ─── Mock: useBudgetLinePicker ─────────────────────────────────────────────────
// Exposes mockPickerStateOverride so individual tests can inject picker state
// (e.g. isOpen=true, step=2, type='work_item') without changing the global default.
// The capturedClosePicker spy lets tests verify picker.closePicker() was called.

const SOURCES = [
  { id: 'src-disc', name: 'Discretionary Fund', isDiscretionary: true },
  { id: 'src-loan', name: 'Bank Loan', isDiscretionary: false },
  { id: 'src-sav', name: 'Savings', isDiscretionary: false },
];

let mockPickerStateOverride: Record<string, unknown> = {};
const mockClosePicker = jest.fn();
// Captures the hook's onLineCreated so tests can simulate a picker-created budget line.
let capturedOnLineCreated: ((line: unknown) => void) | null = null;

jest.unstable_mockModule('../../hooks/useBudgetLinePicker.js', () => ({
  useBudgetLinePicker: (opts: { onLineCreated: (line: unknown) => void }) => {
    capturedOnLineCreated = opts.onLineCreated;
    return {
      pickerState: {
        isOpen: false,
        step: 1,
        type: null,
        itemId: null,
        itemTitle: null,
        isLoading: false,
        error: null,
        budgetLines: [],
        budgetSources: SOURCES,
        vendors: [{ id: 'v-builder', name: 'Builder Co', trade: null }],
        categories: [],
        showCreateForm: false,
        createError: null,
        createForm: undefined,
        ...mockPickerStateOverride,
      },
      openPicker: jest.fn(),
      closePicker: mockClosePicker,
      handleSelectItem: jest.fn(),
      showCreateBudgetLineForm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      handleCreateBudgetLine: jest.fn(),
      setPickerState: jest.fn(),
      initializeStaticData: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      createBudgetLineButtonRef: { current: null },
    };
  },
}));

// ─── Mock: formatters ─────────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  useFormatters: () => ({
    formatCurrency: (v: number) => `€${v.toFixed(2)}`,
    formatDate: (v: string) => v,
    formatDateTime: (v: string) => v,
    formatNumber: (v: number) => String(v),
    formatPercent: (v: number) => `${v}%`,
  }),
}));

// ─── Mock: LocaleContext ──────────────────────────────────────────────────────

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
  useLocale: () => ({ locale: 'en', setLocale: jest.fn() }),
}));

// ─── Mock: configApi + preferencesApi ────────────────────────────────────────

jest.unstable_mockModule('../../lib/configApi.js', () => ({
  // Only autoItemizeEnabled is exercised by these tests — narrower than the real
  // fetchConfig's AppConfigResponse return type is intentional here.
  fetchConfig: jest
    .fn<() => Promise<{ autoItemizeEnabled: boolean }>>()
    .mockResolvedValue({ autoItemizeEnabled: true }),
}));

jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: jest.fn(),
  upsertPreference: jest.fn(),
}));

// ─── Mock: SuggestionBadge ────────────────────────────────────────────────────

jest.unstable_mockModule('../../components/SuggestionBadge/SuggestionBadge.js', () => ({
  SuggestionBadge: ({
    displayValue,
    suggestedValue,
  }: {
    displayValue?: string;
    suggestedValue: string;
  }) => <span data-testid="suggestion-badge">{displayValue ?? suggestedValue}</span>,
}));

// ─── Mock: BudgetLineForm ──────────────────────────────────────────────────────

jest.unstable_mockModule('../../components/budget/BudgetLineForm.js', () => ({
  // Minimal controlled stand-in exposing the inputs these tests drive. Ids mirror the real
  // form (`${idPrefix}budget-<field>`) so the tests query them the same way.
  BudgetLineForm: (props: {
    idPrefix?: string;
    form: Record<string, string>;
    onFormChange: (updates: Record<string, string>) => void;
  }) => {
    const prefix = props.idPrefix ?? '';
    const field = (id: string, key: string) => (
      <input
        id={`${prefix}budget-${id}`}
        value={props.form[key] ?? ''}
        onChange={(e) => props.onFormChange({ [key]: e.target.value })}
      />
    );
    return (
      <div
        data-testid="budget-line-form"
        data-budget-source-id={props.form?.budgetSourceId ?? ''}
        data-budget-category-id={props.form?.budgetCategoryId ?? ''}
      >
        {field('description', 'description')}
        {field('planned-amount', 'plannedAmount')}
        {field('source-id', 'budgetSourceId')}
        {field('category-id', 'budgetCategoryId')}
      </div>
    );
  },
}));

// ─── Mock: ParentPicker ────────────────────────────────────────────────────────

jest.unstable_mockModule('../../components/ParentPicker/ParentPicker.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ParentPicker: (props: any) => (
    <div data-testid="parent-picker" data-selected-type={props.selectedType ?? ''} />
  ),
}));

// ─── Mock: errorTranslation ────────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/errorTranslation.js', () => ({
  translateApiError: (_code: string) => 'Translated error message',
}));

// ─── Mock: apiClient ──────────────────────────────────────────────────────────

class MockApiClientError extends Error {
  statusCode: number;
  error: { code: string; message: string };
  constructor(statusCode: number, code: string, message = 'Error') {
    super(message);
    this.statusCode = statusCode;
    this.error = { code, message };
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

// ─── Static imports (after all mocks) ─────────────────────────────────────────

import React from 'react';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as PaperlessInvoiceReviewPageModule from './PaperlessInvoiceReviewPage.js';
import type * as LocaleContextModule from '../../contexts/LocaleContext.js';

let PaperlessInvoiceReviewPage: (typeof PaperlessInvoiceReviewPageModule)['PaperlessInvoiceReviewPage'];
let LocaleProvider: (typeof LocaleContextModule)['LocaleProvider'];

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
let mockFetch: jest.Mock<typeof fetch>;

beforeEach(async () => {
  // Every API the page uses is module-mocked; any real fetch is an unmocked dependency.
  mockFetch = jest.fn<typeof fetch>(() => Promise.reject(new Error('unmocked fetch')));
  globalThis.fetch = mockFetch;

  ({ PaperlessInvoiceReviewPage } =
    (await import('./PaperlessInvoiceReviewPage.js')) as typeof PaperlessInvoiceReviewPageModule);
  ({ LocaleProvider } =
    (await import('../../contexts/LocaleContext.js')) as typeof LocaleContextModule);

  mockGetPaperlessDocument.mockReset();
  mockGetDocumentPreviewUrl.mockImplementation((id) => `/paperless/documents/${id}/preview`);
  mockPreviewAutoItemize.mockReset();
  mockCommitAutoItemizeCreate.mockReset();
  mockFetchVendors.mockReset();
  mockCreateWorkItemBudget.mockReset();
  mockCreateHouseholdItemBudget.mockReset();
  mockClosePicker.mockReset();
  capturedOnLineCreated = null;
  mockPickerStateOverride = {};

  // Safe defaults so tests that don't override still reach ready state
  mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
  mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse());
  mockFetchVendors.mockResolvedValue(
    makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]),
  );
  mockCommitAutoItemizeCreate.mockResolvedValue(makeCommitResponse());
});

afterEach(() => {
  const fetchCalls = mockFetch.mock.calls.length;
  globalThis.fetch = originalFetch;
  expect(fetchCalls).toBe(0);
  jest.useRealTimers();
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePaperlessDoc(): PaperlessDocumentDetailResponse {
  return {
    document: {
      id: 42,
      title: 'Test Invoice',
      content: 'Invoice OCR content',
      tags: [],
      created: '2026-03-01',
      added: '2026-03-02',
      modified: '2026-03-02',
      correspondent: null,
      documentType: null,
      archiveSerialNumber: null,
      originalFileName: 'invoice.pdf',
      pageCount: 1,
    },
  };
}

function makePreviewResponse(
  overrides: Partial<AutoItemizePreviewResponse> = {},
): AutoItemizePreviewResponse {
  return {
    lines: [
      {
        description: 'Tile work',
        totalAmount: 300,
        confidence: 0.9,
        budgetCategoryId: 'bc-test',
        budgetSourceId: null,
      },
    ],
    suggestedVendorId: 'vendor-1',
    extractedInvoiceNumber: 'INV-001',
    extractedInvoiceDate: '2026-03-01',
    ...overrides,
  };
}

function makeVendorsResponse(vendors: Array<{ id: string; name: string }> = []) {
  return {
    vendors: vendors.map((v) => ({
      ...v,
      notes: null,
      phone: null,
      email: null,
      address: null,
      trade: null,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })),
    pagination: { page: 1, pageSize: 100, totalItems: vendors.length, totalPages: 1 },
  };
}

function makeCommitResponse(): AutoItemizeCommitResponse {
  const invoice: Invoice = {
    id: 'inv-new-1',
    vendorId: 'vendor-1',
    vendorName: 'Builder Corp',
    invoiceNumber: 'INV-001',
    amount: 300,
    date: '2026-03-01',
    dueDate: null,
    status: 'pending',
    notes: null,
    budgetLines: [],
    remainingAmount: 0,
    deposits: [],
    finalPaymentAmount: 300,
    createdBy: null,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
  };
  return { invoice, budgetLines: [], remainingAmount: 0 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeWorkItemBudgetLine(overrides: { id: string; plannedAmount: number }): any {
  return {
    id: overrides.id,
    workItemId: 'wi-1',
    description: 'Test budget line',
    plannedAmount: overrides.plannedAmount,
    confidence: 'invoice',
    includesVat: true,
    quantity: null,
    unit: null,
    unitPrice: null,
    budgetCategoryId: null,
    budgetSourceId: null,
    // BaseBudgetLine shape: the server echoes the persisted source/category as objects.
    budgetSource: { id: 'src-loan', name: 'Bank Loan' },
    budgetCategory: { id: 'bc-draft', name: 'Draft Category', translationKey: null },
    vendorId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

// ─── Render helper ─────────────────────────────────────────────────────────────

function renderPage(
  state: { documentId: number; documentTitle: string } = {
    documentId: 42,
    documentTitle: 'Test Invoice',
  },
) {
  return render(
    React.createElement(
      LocaleProvider,
      null,
      React.createElement(
        MemoryRouter,
        {
          initialEntries: [
            {
              pathname: '/budget/invoices/new/paperless',
              state,
            },
          ],
        },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: '/budget/invoices/new/paperless',
            element: React.createElement(PaperlessInvoiceReviewPage),
          }),
          React.createElement(Route, {
            path: '/budget/invoices/:id',
            element: React.createElement('div', { 'data-testid': 'invoice-detail-page' }),
          }),
          React.createElement(Route, {
            path: '/budget/invoices',
            element: React.createElement('div', { 'data-testid': 'invoices-list-page' }),
          }),
        ),
      ),
    ),
  );
}

/** Wait for the page to reach ready state (Cancel button visible, no spinner). */
async function waitForReady() {
  await waitFor(
    () => {
      const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
      const hasSpinner = document.querySelectorAll('[role="img"][aria-label="Loading"]').length > 0;
      const inLoadingState = screen.queryAllByText(/Analyzing/i).length > 0;
      expect(cancelBtn).toBeInTheDocument();
      expect(hasSpinner || inLoadingState).toBe(false);
    },
    { timeout: 5000 },
  );
}

/** The save button. */
function getCreateBtn(): HTMLElement {
  return screen.getByRole('button', { name: 'Create Invoice & Itemize' });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PreviewLine = AutoItemizePreviewResponse['lines'][number];

function previewLine(
  description: string,
  budgetSourceId: string | null,
  overrides: Partial<PreviewLine> = {},
): PreviewLine {
  return {
    description,
    totalAmount: 100,
    confidence: 0.9,
    budgetCategoryId: 'bc-test',
    budgetSourceId,
    ...overrides,
  };
}

function setPreviewLines(lines: PreviewLine[]) {
  mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ lines }));
}

function openPickerForItem(
  budgetLines: unknown[] = [],
  type: 'work_item' | 'household_item' = 'work_item',
) {
  mockPickerStateOverride = {
    isOpen: true,
    step: 2,
    type,
    itemId: type === 'work_item' ? 'wi-1' : 'hi-1',
    itemTitle: type === 'work_item' ? 'Kitchen tiles' : 'Sofa',
    isLoading: false,
    showCreateForm: false,
    budgetLines,
  };
}

function getRows(): HTMLElement[] {
  const list = screen.getByRole('list', { name: 'Extracted line items' });
  return within(list).getAllByRole('listitem');
}

function getRow(index: number): HTMLElement {
  const row = getRows()[index];
  expect(row).toBeDefined();
  return row as HTMLElement;
}

function getRowSelect(row: HTMLElement): HTMLSelectElement {
  const select = row.querySelector<HTMLSelectElement>('select[id^="source-"]');
  expect(select).not.toBeNull();
  return select as HTMLSelectElement;
}

function rowSources(): string[] {
  return getRows().map((row) => getRowSelect(row).value);
}

function getTopSelect(): HTMLSelectElement {
  return screen.getByLabelText('Budget source') as HTMLSelectElement;
}

function draftSource(index: number): string | null {
  return within(getRow(index))
    .getByTestId('budget-line-form')
    .getAttribute('data-budget-source-id');
}

function statusText(): string {
  const region = document.querySelector('[role="status"]');
  expect(region).not.toBeNull();
  return region?.textContent ?? '';
}

async function setTopSource(value: string) {
  await act(async () => {
    fireEvent.change(getTopSelect(), { target: { value } });
  });
}

async function setRowSource(rowIndex: number, value: string) {
  await act(async () => {
    fireEvent.change(getRowSelect(getRow(rowIndex)), { target: { value } });
  });
}

async function queueDraft(rowIndex: number) {
  const row = getRow(rowIndex);
  await act(async () => {
    fireEvent.click(within(row).getByRole('button', { name: /Assign…/i }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Create Budget Line/i }));
  });
}

async function linkExistingLine(rowIndex: number, buttonName: RegExp) {
  const row = getRow(rowIndex);
  await act(async () => {
    fireEvent.click(within(row).getByRole('button', { name: /Assign…/i }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: buttonName }));
  });
}

async function changeDraftField(rowIndex: number, field: string, value: string) {
  const input = getRow(rowIndex).querySelector<HTMLInputElement>(`input[id$="budget-${field}"]`);
  expect(input).not.toBeNull();
  await act(async () => {
    fireEvent.change(input as HTMLInputElement, { target: { value } });
  });
}

async function renderReady() {
  renderPage();
  await waitForReady();
}

interface CommitLine {
  assignmentMode: string;
  assignedBudgetLineId?: string;
  budgetSourceId?: string;
  budgetCategoryId?: string | null;
}

async function clickSaveAndGetCommitLines(): Promise<CommitLine[]> {
  await act(async () => {
    fireEvent.click(getCreateBtn());
  });
  await waitFor(() => {
    expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1);
  });
  const call = mockCommitAutoItemizeCreate.mock.calls[0];
  expect(call).toBeDefined();
  const arg = call?.[0] as { lines: CommitLine[] } | undefined;
  expect(arg).toBeDefined();
  return (arg as { lines: CommitLine[] }).lines;
}

const WORK_ITEM_BUDGET_LINE_DISC = {
  id: 'wib-disc',
  workItemId: 'wi-1',
  description: 'Existing disc line',
  plannedAmount: 500,
  budgetSource: { id: 'src-disc', name: 'Discretionary Fund' },
  budgetCategory: { id: 'bc-linked', name: 'Linked Cat', translationKey: null },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PaperlessInvoiceReviewPage — invoice-level default budget source (Issue #2158)', () => {
  it('AC1: renders a "Budget source" select between status and notes with None + all sources', async () => {
    await renderReady();

    const select = getTopSelect();
    expect(select.tagName).toBe('SELECT');
    expect(select.id).toBe('invoice-budget-source');
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'No default',
      'Discretionary Fund',
      'Bank Loan',
      'Savings',
    ]);

    const status = document.getElementById('invoice-status') as HTMLElement;
    const notes = document.getElementById('notes') as HTMLElement;
    expect(status).not.toBeNull();
    expect(notes).not.toBeNull();
    expect(status.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(select.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('AC2: starts on "No default", leaves each line on its original source, announces nothing', async () => {
    setPreviewLines([previewLine('Tiles', 'src-loan'), previewLine('Grout', 'src-sav')]);
    await renderReady();

    expect(getTopSelect().value).toBe('');
    expect(rowSources()).toEqual(['src-loan', 'src-sav']);
    expect(statusText()).toBe('');
  });

  it('AC3: a queued inline draft takes the invoice default even when the row source differs', async () => {
    openPickerForItem();
    setPreviewLines([previewLine('Tiles', 'src-sav')]);
    await renderReady();

    await setTopSource('src-loan');
    await setRowSource(0, 'src-sav');
    expect(rowSources()).toEqual(['src-sav']);

    await queueDraft(0);

    expect(draftSource(0)).toBe('src-loan');
  });

  it('AC4: with no default, a queued inline draft uses the row budget source', async () => {
    openPickerForItem();
    setPreviewLines([previewLine('Tiles', 'src-sav')]);
    await renderReady();

    await queueDraft(0);

    expect(draftSource(0)).toBe('src-sav');
  });

  it('AC5/AC10: choosing a source applies it to every non-linked row (included, excluded, draft) and announces the count', async () => {
    openPickerForItem();
    setPreviewLines([
      previewLine('Tiles', 'src-loan'),
      previewLine('Grout', 'src-disc'),
      previewLine('Paint', 'src-loan'),
      previewLine('Plaster', 'src-disc'),
    ]);
    await renderReady();

    // Exclude the third row, queue a draft on the fourth.
    await act(async () => {
      fireEvent.click(within(getRow(2)).getByLabelText('Include'));
    });
    await queueDraft(3);

    await setTopSource('src-sav');

    expect(getRows().length).toBe(4);
    expect(getRowSelect(getRow(0)).value).toBe('src-sav');
    expect(getRowSelect(getRow(1)).value).toBe('src-sav');
    expect(getRowSelect(getRow(2)).value).toBe('src-sav');
    expect(draftSource(3)).toBe('src-sav');
    expect(statusText()).toBe('Budget source "Savings" applied to 4 lines');
  });

  it('AC6: a row linked to an existing budget line is untouched by the default, not counted, and commits no source or category', async () => {
    openPickerForItem([WORK_ITEM_BUDGET_LINE_DISC]);
    setPreviewLines([previewLine('Tiles', 'src-loan'), previewLine('Grout', 'src-loan')]);
    await renderReady();

    await linkExistingLine(0, /Existing disc line/);
    expect(rowSources()).toEqual(['src-loan', 'src-loan']);

    await setTopSource('src-sav');

    expect(rowSources()).toEqual(['src-loan', 'src-sav']);
    expect(statusText()).toBe('Budget source "Savings" applied to 1 line');

    const lines = await clickSaveAndGetCommitLines();
    expect(lines.length).toBe(2);
    expect(lines[0]?.assignmentMode).toBe('assign-existing');
    expect(lines[0]?.assignedBudgetLineId).toBe('wib-disc');
    expect(lines[0]?.budgetSourceId).toBeUndefined();
    expect(lines[0]?.budgetCategoryId).toBeUndefined();
    expect(lines[1]?.assignmentMode).toBe('create-new');
    expect(lines[1]?.budgetSourceId).toBe('src-sav');
  });

  it('announces nothing when every line is linked to an existing budget line', async () => {
    openPickerForItem([WORK_ITEM_BUDGET_LINE_DISC]);
    setPreviewLines([previewLine('Tiles', 'src-loan')]);
    await renderReady();

    await linkExistingLine(0, /Existing disc line/);
    await setTopSource('src-sav');

    expect(rowSources()).toEqual(['src-loan']);
    expect(getTopSelect().value).toBe('src-sav');
    expect(statusText()).toBe('');
  });

  it('AC7: resetting to "No default" leaves applied sources and the announcement untouched, and new drafts use the row source', async () => {
    openPickerForItem();
    setPreviewLines([previewLine('Tiles', 'src-loan'), previewLine('Grout', 'src-loan')]);
    await renderReady();

    await setTopSource('src-sav');
    expect(statusText()).toBe('Budget source "Savings" applied to 2 lines');

    await setTopSource('');

    expect(getTopSelect().value).toBe('');
    expect(rowSources()).toEqual(['src-sav', 'src-sav']);
    expect(statusText()).toBe('Budget source "Savings" applied to 2 lines');

    await setRowSource(0, 'src-loan');
    await queueDraft(0);
    expect(draftSource(0)).toBe('src-loan');
  });

  it('AC8: a per-line override after applying a default only changes that line and keeps the default', async () => {
    openPickerForItem();
    setPreviewLines([
      previewLine('Tiles', 'src-disc'),
      previewLine('Grout', 'src-disc'),
      previewLine('Paint', 'src-disc'),
    ]);
    await renderReady();
    await queueDraft(2);

    await setTopSource('src-sav');
    await setRowSource(0, 'src-loan');

    expect(getRowSelect(getRow(0)).value).toBe('src-loan');
    expect(getRowSelect(getRow(1)).value).toBe('src-sav');
    expect(draftSource(2)).toBe('src-sav');
    expect(getTopSelect().value).toBe('src-sav');

    await changeDraftField(2, 'source-id', 'src-disc');

    expect(getRowSelect(getRow(0)).value).toBe('src-loan');
    expect(getRowSelect(getRow(1)).value).toBe('src-sav');
    expect(draftSource(2)).toBe('src-disc');
    expect(getTopSelect().value).toBe('src-sav');
  });

  it('AC9: choosing another default afterwards overwrites earlier per-line overrides, drafts included', async () => {
    openPickerForItem();
    setPreviewLines([previewLine('Tiles', 'src-disc'), previewLine('Grout', 'src-disc')]);
    await renderReady();
    await queueDraft(1);

    await setTopSource('src-sav');
    await setRowSource(0, 'src-loan');
    await changeDraftField(1, 'source-id', 'src-loan');

    await setTopSource('src-disc');

    expect(getRowSelect(getRow(0)).value).toBe('src-disc');
    expect(draftSource(1)).toBe('src-disc');
    expect(statusText()).toBe('Budget source "Discretionary Fund" applied to 2 lines');
  });

  it('AC10: a merged line takes the invoice default source', async () => {
    mockMergeLines.mockResolvedValue({
      description: 'Merged work',
      category: null,
      budgetCategoryId: 'bc-test',
    });
    setPreviewLines([previewLine('Tiles', 'src-disc'), previewLine('Grout', 'src-disc')]);
    await renderReady();

    await setTopSource('src-sav');
    // Move the rows off the default so the merge must apply it itself.
    await setRowSource(0, 'src-loan');
    await setRowSource(1, 'src-disc');

    for (const row of getRows()) {
      fireEvent.click(within(row).getAllByRole('checkbox')[0] as HTMLElement);
    }
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /Merge/i }));
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Merged work')).toBeInTheDocument();
    });
    expect(rowSources()).toEqual(['src-sav']);
  });

  it('AC11: commit sends the default for untouched create-new lines and the override for edited ones', async () => {
    setPreviewLines([previewLine('Tiles', 'src-disc'), previewLine('Grout', 'src-disc')]);
    await renderReady();

    await setTopSource('src-sav');
    await setRowSource(1, 'src-loan');

    const lines = await clickSaveAndGetCommitLines();
    expect(lines.length).toBe(2);
    expect(lines[0]?.assignmentMode).toBe('create-new');
    expect(lines[0]?.budgetSourceId).toBe('src-sav');
    expect(lines[1]?.assignmentMode).toBe('create-new');
    expect(lines[1]?.budgetSourceId).toBe('src-loan');
  });

  it('AC11: an overridden inline draft is created and committed with its own source and category', async () => {
    openPickerForItem();
    mockCreateWorkItemBudget.mockResolvedValue(
      makeWorkItemBudgetLine({ id: 'bl-draft', plannedAmount: 100 }),
    );
    setPreviewLines([previewLine('Tiles', 'src-disc', { budgetCategoryId: 'bc-row' })]);
    await renderReady();
    await queueDraft(0);

    await setTopSource('src-sav');
    await changeDraftField(0, 'source-id', 'src-loan');
    await changeDraftField(0, 'category-id', 'bc-draft');

    const lines = await clickSaveAndGetCommitLines();

    expect(mockCreateWorkItemBudget).toHaveBeenCalledTimes(1);
    const createCall = mockCreateWorkItemBudget.mock.calls[0];
    expect(createCall).toBeDefined();
    expect(createCall?.[0]).toBe('wi-1');
    expect(createCall?.[1]).toMatchObject({
      budgetSourceId: 'src-loan',
      budgetCategoryId: 'bc-draft',
    });

    expect(lines.length).toBe(1);
    expect(lines[0]?.assignmentMode).toBe('assign-existing');
    expect(lines[0]?.assignedBudgetLineId).toBe('bl-draft');
    expect(lines[0]?.budgetSourceId).toBeUndefined();
    expect(lines[0]?.budgetCategoryId).toBeUndefined();
  });

  it('household-item inline draft is created with the draft values and commits no source or category', async () => {
    openPickerForItem([], 'household_item');
    mockCreateHouseholdItemBudget.mockResolvedValue({
      id: 'hbl-new',
      householdItemId: 'hi-1',
      description: 'Created HI line',
      plannedAmount: 100,
      confidence: 'invoice',
      includesVat: true,
      quantity: null,
      unit: null,
      unitPrice: null,
      budgetCategory: {
        id: 'bc-household-items',
        name: 'Household Items',
        translationKey: null,
      },
      budgetSource: { id: 'src-loan', name: 'Bank Loan' },
      vendor: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as never);
    setPreviewLines([previewLine('Sofa', 'src-loan', { budgetCategoryId: 'bc-row' })]);
    await renderReady();
    await queueDraft(0);

    const lines = await clickSaveAndGetCommitLines();

    expect(mockCreateHouseholdItemBudget).toHaveBeenCalledTimes(1);
    expect(mockCreateHouseholdItemBudget.mock.calls[0]?.[1]).toMatchObject({
      budgetSourceId: 'src-loan',
    });
    expect(lines.length).toBe(1);
    expect(lines[0]?.assignmentMode).toBe('assign-existing');
    expect(lines[0]?.assignedBudgetLineId).toBe('hbl-new');
    expect(lines[0]?.budgetSourceId).toBeUndefined();
    expect(lines[0]?.budgetCategoryId).toBeUndefined();
  });

  it('a budget line created through the picker and linked commits no source or category', async () => {
    openPickerForItem();
    setPreviewLines([previewLine('Tiles', 'src-loan', { budgetCategoryId: 'bc-row' })]);
    await renderReady();

    await act(async () => {
      fireEvent.click(within(getRow(0)).getByRole('button', { name: /Assign…/i }));
    });
    expect(capturedOnLineCreated).not.toBeNull();
    await act(async () => {
      capturedOnLineCreated?.(makeWorkItemBudgetLine({ id: 'bl-picker', plannedAmount: 100 }));
    });
    expect(rowSources()).toEqual(['src-loan']);

    const lines = await clickSaveAndGetCommitLines();
    expect(lines.length).toBe(1);
    expect(lines[0]?.assignmentMode).toBe('assign-existing');
    expect(lines[0]?.assignedBudgetLineId).toBe('bl-picker');
    expect(lines[0]?.budgetSourceId).toBeUndefined();
    expect(lines[0]?.budgetCategoryId).toBeUndefined();
  });

  it('clearing a linked row while a default is set makes it a new line with the default source', async () => {
    openPickerForItem([
      { ...WORK_ITEM_BUDGET_LINE_DISC, budgetSource: null, budgetCategory: null },
    ]);
    setPreviewLines([previewLine('Tiles', 'src-loan')]);
    await renderReady();

    await linkExistingLine(0, /Existing disc line/);
    // The default is chosen while the row is linked, so it is skipped by the apply step.
    await setTopSource('src-sav');
    expect(rowSources()).toEqual(['src-loan']);
    expect(statusText()).toBe('');

    await act(async () => {
      fireEvent.click(
        within(getRow(0)).getByRole('button', { name: 'Clear budget line assignment' }),
      );
    });

    expect(rowSources()).toEqual(['src-sav']);
    const lines = await clickSaveAndGetCommitLines();
    expect(lines.length).toBe(1);
    expect(lines[0]?.assignmentMode).toBe('create-new');
    expect(lines[0]?.budgetSourceId).toBe('src-sav');
    expect(lines[0]?.budgetCategoryId).toBe('bc-test');
  });

  it('clearing a linked row without a default restores its own source on the new line', async () => {
    openPickerForItem([
      { ...WORK_ITEM_BUDGET_LINE_DISC, budgetSource: null, budgetCategory: null },
    ]);
    setPreviewLines([previewLine('Tiles', 'src-loan')]);
    await renderReady();

    await linkExistingLine(0, /Existing disc line/);
    await act(async () => {
      fireEvent.click(
        within(getRow(0)).getByRole('button', { name: 'Clear budget line assignment' }),
      );
    });

    const lines = await clickSaveAndGetCommitLines();
    expect(lines[0]?.assignmentMode).toBe('create-new');
    expect(lines[0]?.budgetSourceId).toBe('src-loan');
  });

  it('re-applying a different source with the same line count changes the announcement', async () => {
    setPreviewLines([previewLine('Tiles', 'src-disc'), previewLine('Grout', 'src-disc')]);
    await renderReady();

    await setTopSource('src-sav');
    expect(statusText()).toBe('Budget source "Savings" applied to 2 lines');

    await setTopSource('src-loan');
    expect(statusText()).toBe('Budget source "Bank Loan" applied to 2 lines');
  });

  it('disables the budget source select while the invoice is being saved', async () => {
    mockCommitAutoItemizeCreate.mockReturnValue(new Promise(() => {}));
    setPreviewLines([previewLine('Tiles', 'src-disc')]);
    await renderReady();
    expect(getTopSelect().disabled).toBe(false);

    await act(async () => {
      fireEvent.click(getCreateBtn());
    });

    await waitFor(() => {
      expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1);
    });
    expect(getTopSelect().disabled).toBe(true);
  });

  describe('linking an existing budget line sends no source or category', () => {
    it("omits the linked work-item line's source and category even though the row has extracted ones", async () => {
      openPickerForItem([WORK_ITEM_BUDGET_LINE_DISC]);
      setPreviewLines([previewLine('Tiles', 'src-loan', { budgetCategoryId: 'bc-row' })]);
      await renderReady();

      await linkExistingLine(0, /Existing disc line/);

      const lines = await clickSaveAndGetCommitLines();
      expect(lines.length).toBe(1);
      expect(lines[0]?.assignmentMode).toBe('assign-existing');
      expect(lines[0]?.assignedBudgetLineId).toBe('wib-disc');
      expect(lines[0]?.budgetCategoryId).toBeUndefined();
      expect(lines[0]?.budgetSourceId).toBeUndefined();
    });

    it('a linked household-item line is not blocked by category validation and sends no source or category', async () => {
      openPickerForItem(
        [
          {
            id: 'hbl-1',
            householdItemId: 'hi-1',
            description: 'Sofa budget',
            plannedAmount: 100,
            budgetSource: null,
            budgetCategory: null,
          },
        ],
        'household_item',
      );
      setPreviewLines([previewLine('Sofa', 'src-loan', { budgetCategoryId: null })]);
      await renderReady();

      await linkExistingLine(0, /Sofa budget/);

      const lines = await clickSaveAndGetCommitLines();
      expect(lines.length).toBe(1);
      expect(lines[0]?.assignmentMode).toBe('assign-existing');
      expect(lines[0]?.assignedBudgetLineId).toBe('hbl-1');
      expect(lines[0]?.budgetCategoryId).toBeUndefined();
      expect(lines[0]?.budgetSourceId).toBeUndefined();
    });
  });
});
