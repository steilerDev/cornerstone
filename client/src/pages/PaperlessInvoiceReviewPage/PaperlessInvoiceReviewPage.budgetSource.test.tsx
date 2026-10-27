/**
 * @jest-environment jsdom
 *
 * Integration tests for PaperlessInvoiceReviewPage — invoice-level default budget source (Issue #2158).
 */

// ─── Mocks (must precede all static imports) ───────────────────────────────────

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
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
const mockGetPaperlessStatus = jest.fn<typeof PaperlessApiModule.getPaperlessStatus>();
const mockGetDocumentPreviewUrl = jest.fn<(id: number) => string>(
  (id) => `/paperless/documents/${id}/preview`,
);

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: mockGetPaperlessDocument,
  getDocumentThumbnailUrl: (id: number) => `/thumb/${id}`,
  getDocumentPreviewUrl: mockGetDocumentPreviewUrl,
  listPaperlessCorrespondents: jest.fn(),
  uploadPaperlessDocument: jest.fn(),
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
const mockFetchVendor = jest.fn<typeof VendorsApiModule.fetchVendor>();

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: mockFetchVendor,
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

// ─── Mock: workItemBudgetsApi ─────────────────────────────────────────────────

const mockCreateWorkItemBudget = jest.fn<typeof WorkItemBudgetsApiModule.createWorkItemBudget>();
const mockFetchWorkItemBudgets = jest.fn<typeof WorkItemBudgetsApiModule.fetchWorkItemBudgets>();

jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: mockFetchWorkItemBudgets,
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

// ─── Funding sources and categories served to the cost line grid ──────────────

jest.unstable_mockModule('../../lib/budgetCategoriesApi.js', () => ({
  fetchBudgetCategories: jest
    .fn<() => Promise<unknown>>()
    .mockResolvedValue({ categories: [{ id: 'bc-test', name: 'Flooring', translationKey: null }] }),
}));

jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: jest
    .fn<() => Promise<unknown>>()
    .mockImplementation(async () => ({ budgetSources: SOURCES })),
  fetchBudgetSource: jest.fn(),
  fetchBudgetLinesForSource: jest.fn(),
}));

const mockSearchEverywhere = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: mockSearchEverywhere,
}));

const SOURCES = [
  { id: 'src-disc', name: 'Discretionary Fund', isDiscretionary: true },
  { id: 'src-loan', name: 'Bank Loan', isDiscretionary: false },
  { id: 'src-sav', name: 'Savings', isDiscretionary: false },
];

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
  useLocale: () => ({ locale: 'en', setLocale: jest.fn(), vatRate: 0.19 }),
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

  // The cost line grid shows Undo toasts, so the page needs a ToastProvider.
  const { ToastProvider } = await import('../../components/Toast/ToastContext.js');
  const BaseLocaleProvider = LocaleProvider;
  LocaleProvider = (({ children }: { children?: React.ReactNode }) =>
    React.createElement(
      BaseLocaleProvider,
      null,
      React.createElement(ToastProvider, null, children),
    )) as typeof LocaleProvider;

  mockGetPaperlessDocument.mockReset();
  mockGetDocumentPreviewUrl.mockImplementation((id) => `/paperless/documents/${id}/preview`);
  mockPreviewAutoItemize.mockReset();
  mockCommitAutoItemizeCreate.mockReset();
  mockFetchVendors.mockReset();
  mockFetchVendor.mockReset();
  // By default a company is found by id in whatever the vendor list mock serves.
  mockFetchVendor.mockImplementation(async (id: string) => {
    const res = await mockFetchVendors({});
    const found = res.vendors.find((v) => v.id === id);
    if (!found) throw new Error('not found');
    return found as Awaited<ReturnType<typeof VendorsApiModule.fetchVendor>>;
  });
  mockMergeLines.mockReset();
  mockGetPaperlessStatus.mockReset().mockRejectedValue(new Error('no paperless'));
  mockCreateWorkItemBudget.mockReset();
  mockFetchWorkItemBudgets.mockReset().mockResolvedValue([]);
  mockSearchEverywhere.mockReset().mockResolvedValue({
    groups: [
      { type: 'work_item', items: [{ id: 'wi-1', label: 'Kitchen', areaPath: [] }] },
      { type: 'household_item', items: [{ id: 'hi-1', label: 'Sofa', areaPath: [] }] },
    ],
  });
  mockCreateHouseholdItemBudget.mockReset();

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

// ─── Render helper ─────────────────────────────────────────────────────────────

function renderPage(documentId: number = 42) {
  return render(
    React.createElement(
      LocaleProvider,
      null,
      React.createElement(
        MemoryRouter,
        {
          initialEntries: [`/budget/invoices/new/paperless?documentId=${documentId}`],
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

function getRowIds(): string[] {
  return screen
    .getAllByTestId(/^auto-itemize-grid-source-/)
    .map((el) => el.getAttribute('data-testid')!.replace('auto-itemize-grid-source-', ''));
}

/** Rows of extracted lines (without the grid's blank row at the end). */
function lineRowIds(): string[] {
  return getRowIds().slice(0, -1);
}

function sourceSelect(rowId: string): HTMLSelectElement {
  return screen.getByTestId(`auto-itemize-grid-source-${rowId}`) as HTMLSelectElement;
}

function rowSources(): string[] {
  return lineRowIds().map((id) => sourceSelect(id).value);
}

function getTopSelect(): HTMLSelectElement {
  return screen.getByLabelText('Funding source') as HTMLSelectElement;
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
    fireEvent.change(sourceSelect(lineRowIds()[rowIndex]!), { target: { value } });
  });
}

async function renderReady() {
  renderPage();
  await waitForReady();
  // Wait for the funding sources, so the rows carry their default.
  await waitFor(() => expect(getTopSelect().options.length).toBeGreaterThan(1));
}

async function assignAllToKitchen(name: RegExp = /Kitchen/, label = 'Kitchen') {
  const picker = screen.getByTestId('auto-itemize-grid-assign-all');
  fireEvent.change(picker.querySelector('input') as HTMLInputElement, { target: { value: 'kit' } });
  fireEvent.click(await screen.findByRole('option', { name }, { timeout: 3000 }));
  await waitFor(() => expect(within(picker).getByText(label)).toBeInTheDocument());
}

interface CommitLine {
  assignmentMode: string;
  assignedBudgetLineId?: string;
  assignedBudgetLineType?: string;
  budgetSourceId?: string;
  budgetCategoryId?: string | null;
  totalAmount?: number;
}

async function clickSave() {
  await act(async () => {
    fireEvent.click(getCreateBtn());
  });
}

async function clickSaveAndGetCommitLines(): Promise<CommitLine[]> {
  await clickSave();
  await waitFor(() => {
    expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1);
  });
  const arg = mockCommitAutoItemizeCreate.mock.calls[0]?.[0] as { lines: CommitLine[] };
  return arg.lines;
}

function createdLine(id: string) {
  return { id, description: 'Created line' } as Awaited<
    ReturnType<typeof WorkItemBudgetsApiModule.createWorkItemBudget>
  >;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PaperlessInvoiceReviewPage — invoice-level default budget source (Issue #2158)', () => {
  it('AC1: renders a "Funding source" select between status and notes with None + all sources', async () => {
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

  it('lines without a source start on the Discretionary source', async () => {
    setPreviewLines([previewLine('Tiles', null)]);
    await renderReady();

    expect(rowSources()).toEqual(['src-disc']);
  });

  it('AC5: choosing a source applies it to every row (included or not) and announces the count', async () => {
    setPreviewLines([
      previewLine('Tiles', 'src-loan'),
      previewLine('Grout', 'src-disc'),
      previewLine('Paint', 'src-loan'),
    ]);
    await renderReady();
    // Exclude the third row.
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Include, row 3' }));
    });

    await setTopSource('src-sav');

    expect(rowSources()).toEqual(['src-sav', 'src-sav', 'src-sav']);
    expect(statusText()).toBe('Funding source "Savings" applied to 3 lines');
  });

  it('AC6: a row linked to an existing cost line keeps its own values and is not counted', async () => {
    mockFetchWorkItemBudgets.mockResolvedValue([
      {
        id: 'wib-disc',
        description: 'Existing disc line',
        plannedAmount: 500,
        includesVat: true,
        invoiceLink: null,
      },
    ] as never);
    setPreviewLines([previewLine('Tiles', 'src-loan'), previewLine('Grout', 'src-loan')]);
    await renderReady();
    await assignAllToKitchen();
    fireEvent.click(screen.getByRole('button', { name: /Use an existing cost line…, Row 1/ }));
    fireEvent.click(await screen.findByTestId('cost-line-existing-use-wib-disc'));
    await screen.findByText(/Links Existing disc line/);

    await setTopSource('src-sav');

    expect(statusText()).toBe('Funding source "Savings" applied to 1 line');
    mockCreateWorkItemBudget.mockResolvedValue(createdLine('bl-new'));
    const lines = await clickSaveAndGetCommitLines();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      assignmentMode: 'assign-existing',
      assignedBudgetLineId: 'wib-disc',
      assignedBudgetLineType: 'work_item',
      totalAmount: 500,
    });
    expect(lines[0]?.budgetSourceId).toBeUndefined();
    expect(lines[0]?.budgetCategoryId).toBeUndefined();
  });

  it('announces nothing when every line is linked to an existing cost line', async () => {
    mockFetchWorkItemBudgets.mockResolvedValue([
      {
        id: 'wib-1',
        description: 'Existing',
        plannedAmount: 500,
        includesVat: true,
        invoiceLink: null,
      },
    ] as never);
    setPreviewLines([previewLine('Tiles', 'src-loan')]);
    await renderReady();
    await assignAllToKitchen();
    fireEvent.click(screen.getByRole('button', { name: /Use an existing cost line…, Row 1/ }));
    fireEvent.click(await screen.findByTestId('cost-line-existing-use-wib-1'));
    await screen.findByText(/Links Existing/);

    await setTopSource('src-sav');

    expect(statusText()).toBe('');
  });

  it('AC7: resetting to "No default" leaves applied sources and the announcement untouched', async () => {
    setPreviewLines([previewLine('Tiles', 'src-loan')]);
    await renderReady();
    await setTopSource('src-sav');
    const message = statusText();

    await setTopSource('');

    expect(rowSources()).toEqual(['src-sav']);
    expect(statusText()).toBe(message);
  });

  it('AC8/AC9: a per-line override keeps the default; another default overwrites the override', async () => {
    setPreviewLines([previewLine('Tiles', 'src-loan'), previewLine('Grout', 'src-loan')]);
    await renderReady();
    await setTopSource('src-sav');

    await setRowSource(0, 'src-disc');
    expect(rowSources()).toEqual(['src-disc', 'src-sav']);
    expect(getTopSelect().value).toBe('src-sav');

    await setTopSource('src-loan');
    expect(rowSources()).toEqual(['src-loan', 'src-loan']);
  });

  it('re-applying a different source with the same line count changes the announcement', async () => {
    setPreviewLines([previewLine('Tiles', 'src-loan')]);
    await renderReady();
    await setTopSource('src-sav');
    const first = statusText();

    await setTopSource('src-loan');

    expect(statusText()).not.toBe(first);
    expect(statusText()).toBe('Funding source "Bank Loan" applied to 1 line');
  });

  it('AC10: a merged line takes the invoice default source', async () => {
    mockMergeLines.mockResolvedValue({
      description: 'Tiles and grout',
      category: null,
      budgetCategoryId: 'bc-test',
    });
    setPreviewLines([previewLine('Tiles', 'src-loan'), previewLine('Grout', 'src-sav')]);
    await renderReady();
    await setTopSource('src-disc');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select, row 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select, row 2' }));

    await act(async () => {
      fireEvent.click(await screen.findByTestId('auto-itemize-merge'));
    });

    expect(await screen.findByDisplayValue('Tiles and grout')).toBeInTheDocument();
    expect(rowSources()).toEqual(['src-disc']);
  });

  it('AC11: commit sends the default for untouched lines and the override for edited ones', async () => {
    setPreviewLines([previewLine('Tiles', 'src-loan'), previewLine('Grout', 'src-loan')]);
    await renderReady();
    await setTopSource('src-sav');
    await setRowSource(1, 'src-disc');

    const lines = await clickSaveAndGetCommitLines();

    expect(lines.map((l) => l.budgetSourceId)).toEqual(['src-sav', 'src-disc']);
    expect(lines.map((l) => l.assignmentMode)).toEqual(['create-new', 'create-new']);
  });

  it('disables the budget source select while the invoice is being saved', async () => {
    mockCommitAutoItemizeCreate.mockReturnValue(new Promise(() => {}));
    setPreviewLines([previewLine('Tiles', 'src-loan')]);
    await renderReady();

    await clickSave();

    await waitFor(() => expect(getTopSelect()).toBeDisabled());
  });
});

describe('PaperlessInvoiceReviewPage — cost lines created before the invoice (task or purchase)', () => {
  it('creates the line on the task with the row values and commits it as assign-existing', async () => {
    mockCreateWorkItemBudget.mockResolvedValue(createdLine('bl-new'));
    setPreviewLines([previewLine('Tiles', 'src-loan', { totalAmount: 100 })]);
    await renderReady();
    await assignAllToKitchen();

    const lines = await clickSaveAndGetCommitLines();

    expect(mockCreateWorkItemBudget).toHaveBeenCalledWith(
      'wi-1',
      expect.objectContaining({
        description: 'Tiles',
        plannedAmount: 100,
        budgetSourceId: 'src-loan',
        budgetCategoryId: 'bc-test',
      }),
    );
    expect(lines[0]).toMatchObject({
      assignmentMode: 'assign-existing',
      assignedBudgetLineId: 'bl-new',
      assignedBudgetLineType: 'work_item',
    });
  });

  it('creates the line on a purchase through the household item endpoint', async () => {
    mockCreateHouseholdItemBudget.mockResolvedValue(createdLine('bl-hi') as never);
    setPreviewLines([previewLine('Sofa', 'src-loan')]);
    await renderReady();
    await assignAllToKitchen(/Sofa/, 'Sofa');

    const lines = await clickSaveAndGetCommitLines();

    expect(mockCreateHouseholdItemBudget).toHaveBeenCalledWith('hi-1', expect.any(Object));
    expect(lines[0]).toMatchObject({
      assignedBudgetLineId: 'bl-hi',
      assignedBudgetLineType: 'household_item',
    });
  });

  it('commit failure then retry does not create the cost line again', async () => {
    mockCreateWorkItemBudget.mockResolvedValue(createdLine('bl-new'));
    mockCommitAutoItemizeCreate
      .mockRejectedValueOnce(new MockApiClientError(500, 'INTERNAL_ERROR'))
      .mockResolvedValueOnce(makeCommitResponse());
    setPreviewLines([previewLine('Tiles', 'src-loan')]);
    await renderReady();
    await assignAllToKitchen();

    await clickSave();
    expect(await screen.findByText('Translated error message')).toBeInTheDocument();
    await clickSave();

    await waitFor(() => expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(2));
    expect(mockCreateWorkItemBudget).toHaveBeenCalledTimes(1);
    const retry = mockCommitAutoItemizeCreate.mock.calls[1]![0] as { lines: CommitLine[] };
    expect(retry.lines[0]?.assignedBudgetLineId).toBe('bl-new');
  });

  it('stops with the translated error when creating the cost line fails', async () => {
    mockCreateWorkItemBudget.mockRejectedValue(new MockApiClientError(400, 'VALIDATION_ERROR'));
    setPreviewLines([previewLine('Tiles', 'src-loan')]);
    await renderReady();
    await assignAllToKitchen();

    await clickSave();

    expect(await screen.findByText('Translated error message')).toBeInTheDocument();
    expect(mockCommitAutoItemizeCreate).not.toHaveBeenCalled();
  });
});

describe('PaperlessInvoiceReviewPage — save guards of the cost line grid', () => {
  it('asks for a category when a line has neither a category nor a task or purchase', async () => {
    setPreviewLines([previewLine('Tiles', 'src-loan', { budgetCategoryId: null })]);
    await renderReady();

    await clickSave();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mockCommitAutoItemizeCreate).not.toHaveBeenCalled();
  });

  it('does not save while a line is invalid', async () => {
    setPreviewLines([previewLine('Tiles', 'src-loan')]);
    await renderReady();
    fireEvent.change(screen.getByDisplayValue('Tiles'), { target: { value: '' } });

    await clickSave();

    expect(mockCommitAutoItemizeCreate).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        document.querySelector(
          '[data-testid^="auto-itemize-grid-description-"][aria-invalid="true"]',
        ),
      ).not.toBeNull(),
    );
  });

  it('refuses to save while a merge is running', async () => {
    mockMergeLines.mockReturnValue(new Promise(() => {}));
    setPreviewLines([previewLine('Tiles', 'src-loan'), previewLine('Grout', 'src-loan')]);
    await renderReady();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select, row 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select, row 2' }));
    await act(async () => {
      fireEvent.click(await screen.findByTestId('auto-itemize-merge'));
    });

    await clickSave();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mockCommitAutoItemizeCreate).not.toHaveBeenCalled();
  });

  it('passes the extracted notes to the merge as the document summary', async () => {
    mockMergeLines.mockReturnValue(new Promise(() => {}));
    mockPreviewAutoItemize.mockResolvedValue(
      makePreviewResponse({
        extractedNotes: 'Bathroom job',
        lines: [previewLine('Tiles', 'src-loan'), previewLine('Grout', 'src-loan')],
      }),
    );
    await renderReady();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select, row 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select, row 2' }));
    await act(async () => {
      fireEvent.click(await screen.findByTestId('auto-itemize-merge'));
    });

    await waitFor(() => expect(mockMergeLines).toHaveBeenCalledTimes(1));
    expect((mockMergeLines.mock.calls[0]![0] as { documentSummary?: string }).documentSummary).toBe(
      'Bathroom job',
    );
    await waitFor(() =>
      expect(document.querySelector('[role="status"]')?.textContent).toMatch(
        /Merging 2 line items/,
      ),
    );
  });
});

describe('PaperlessInvoiceReviewPage — invoice details and lookups', () => {
  it('starts empty when the extraction found no details, and saves what the user typed', async () => {
    mockGetPaperlessStatus.mockResolvedValue({
      configured: true,
      reachable: true,
      paperlessUrl: 'https://paperless.example.test',
      filterTag: null,
    } as Awaited<ReturnType<typeof PaperlessApiModule.getPaperlessStatus>>);
    mockPreviewAutoItemize.mockResolvedValue({
      lines: [
        {
          description: 'Tiles',
          confidence: 0.9,
          budgetCategoryId: 'bc-test',
          budgetSourceId: null,
        },
      ],
      suggestedVendorId: 'vendor-1',
    } as unknown as AutoItemizePreviewResponse);
    await renderReady();

    const number = document.getElementById('invoice-number') as HTMLInputElement;
    const amount = document.getElementById('amount') as HTMLInputElement;
    const due = document.getElementById('due-date') as HTMLInputElement;
    const notes = document.getElementById('notes') as HTMLTextAreaElement;
    expect(number).toHaveValue('');
    expect(amount).toHaveValue(null);
    expect((document.getElementById('date') as HTMLInputElement).value).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(due).toHaveValue('');

    // Typing and clearing the optional fields.
    fireEvent.change(number, { target: { value: 'X-1' } });
    fireEvent.change(number, { target: { value: '' } });
    fireEvent.change(due, { target: { value: '2026-05-01' } });
    fireEvent.change(due, { target: { value: '' } });
    fireEvent.change(notes, { target: { value: 'n' } });
    fireEvent.change(notes, { target: { value: '' } });
    expect(number).toHaveValue('');
    expect(due).toHaveValue('');
    expect(notes).toHaveValue('');
    // A line with no amount is not a valid line: the grid blocks the save.
    await clickSave();
    expect(mockCommitAutoItemizeCreate).not.toHaveBeenCalled();
  });

  it('sends the invoice with the typed number, due date and notes', async () => {
    mockPreviewAutoItemize.mockResolvedValue(
      makePreviewResponse({ extractedDueDate: '2026-04-01' }),
    );
    await renderReady();
    expect(document.getElementById('due-date')).toHaveValue('2026-04-01');
    fireEvent.change(document.getElementById('invoice-number') as HTMLInputElement, {
      target: { value: 'RE-9' },
    });
    fireEvent.change(document.getElementById('date') as HTMLInputElement, {
      target: { value: '2026-03-15' },
    });
    fireEvent.change(document.getElementById('due-date') as HTMLInputElement, {
      target: { value: '2026-05-01' },
    });
    fireEvent.change(document.getElementById('notes') as HTMLTextAreaElement, {
      target: { value: 'Paid in two parts' },
    });

    await clickSave();

    await waitFor(() => expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1));
    const arg = mockCommitAutoItemizeCreate.mock.calls[0]![0] as unknown as {
      invoice: Record<string, unknown>;
    };
    expect(arg.invoice).toMatchObject({
      invoiceNumber: 'RE-9',
      date: '2026-03-15',
      dueDate: '2026-05-01',
      notes: 'Paid in two parts',
    });
  });

  it('commits null details when the number, due date and notes stay empty', async () => {
    mockPreviewAutoItemize.mockResolvedValue({
      lines: [previewLine('Tiles', 'src-loan')],
      suggestedVendorId: 'vendor-1',
    } as unknown as AutoItemizePreviewResponse);
    await renderReady();

    await clickSave();

    await waitFor(() => expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1));
    const arg = mockCommitAutoItemizeCreate.mock.calls[0]![0] as unknown as {
      invoice: Record<string, unknown>;
    };
    expect(arg.invoice).toMatchObject({ invoiceNumber: null, dueDate: null, notes: null });
  });

  it('ignores the company lookups when the page is left before they answer', async () => {
    let resolveVendor: (value: never) => void = () => {};
    let resolveVendors: (value: never) => void = () => {};
    mockFetchVendor.mockReturnValue(new Promise((resolve) => (resolveVendor = resolve)));
    mockFetchVendors.mockReturnValue(new Promise((resolve) => (resolveVendors = resolve)));
    mockPreviewAutoItemize.mockResolvedValue(
      makePreviewResponse({ extractedVendorName: 'Builder Corp' }),
    );
    const view = renderPage();
    await waitForReady();

    view.unmount();
    await act(async () => {
      resolveVendor(
        makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]).vendors[0] as never,
      );
      resolveVendors(makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]) as never);
      await Promise.resolve();
    });
  });

  it('ignores a failed company lookup after the page was left', async () => {
    let rejectVendors: (reason: unknown) => void = () => {};
    mockFetchVendors.mockReturnValue(new Promise((_, reject) => (rejectVendors = reject)));
    mockPreviewAutoItemize.mockResolvedValue(
      makePreviewResponse({ extractedVendorName: 'Builder Corp' }),
    );
    const view = renderPage();
    await waitForReady();

    view.unmount();
    await act(async () => {
      rejectVendors(new Error('down'));
      await Promise.resolve();
    });
  });
});
