/**
 * @jest-environment jsdom
 *
 * Integration tests for PaperlessInvoiceReviewPage — invoice Status select (Story #2154).
 *
 * AC1 placement/label, AC2 default, AC3 options, AC4 selection reaches commit payload,
 * AC5 untouched => pending, AC6 persistence across edits/errors/validation, AC7 disabled while saving.
 * All assertions are unconditional.
 */

// ─── Mocks (must precede all static imports) ───────────────────────────────────

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type * as PaperlessApiModule from '../../lib/paperlessApi.js';
import type * as InvoiceAutoItemizeApiModule from '../../lib/invoiceAutoItemizeApi.js';
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

jest.unstable_mockModule('../../lib/invoiceAutoItemizeApi.js', () => ({
  autoItemize: jest.fn(),
  previewAutoItemize: mockPreviewAutoItemize,
  commitAutoItemizeCreate: mockCommitAutoItemizeCreate,
  mergeLines: jest.fn(),
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

jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: jest.fn(),
  createWorkItemBudget: jest.fn(),
  updateWorkItemBudget: jest.fn(),
  deleteWorkItemBudget: jest.fn(),
}));

// ─── Mock: householdItemBudgetsApi ────────────────────────────────────────────

jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: jest.fn(),
  createHouseholdItemBudget: jest.fn(),
  updateHouseholdItemBudget: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));

// ─── Mock: useBudgetLinePicker ─────────────────────────────────────────────────
// Static closed-picker stub; no test here drives the picker.

jest.unstable_mockModule('../../hooks/useBudgetLinePicker.js', () => ({
  useBudgetLinePicker: () => ({
    pickerState: {
      isOpen: false,
      step: 1,
      type: null,
      itemId: null,
      itemTitle: null,
      isLoading: false,
      error: null,
      budgetLines: [],
      budgetSources: [{ id: 'src-disc', name: 'Discretionary Fund', isDiscretionary: true }],
      vendors: [{ id: 'v-builder', name: 'Builder Co', trade: null }],
      categories: [],
      showCreateForm: false,
      createError: null,
      createForm: undefined,
    },
    openPicker: jest.fn(),
    closePicker: jest.fn(),
    handleSelectItem: jest.fn(),
    showCreateBudgetLineForm: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    handleCreateBudgetLine: jest.fn(),
    setPickerState: jest.fn(),
    initializeStaticData: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    createBudgetLineButtonRef: { current: null },
  }),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BudgetLineForm: (props: any) => (
    <div data-testid="budget-line-form">{props.form?.description ?? ''}</div>
  ),
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
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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

function getStatusSelect(): HTMLSelectElement {
  return screen.getByLabelText('Status') as HTMLSelectElement;
}

async function selectStatus(value: string) {
  await act(async () => {
    fireEvent.change(getStatusSelect(), { target: { value } });
  });
}

async function clickCreate() {
  const btn = getCreateBtn();
  await act(async () => {
    fireEvent.click(btn);
  });
}

type CommitArg = Parameters<typeof InvoiceAutoItemizeApiModule.commitAutoItemizeCreate>[0];

function commitArg(index = 0): CommitArg {
  const call = mockCommitAutoItemizeCreate.mock.calls[index];
  expect(call).toBeDefined();
  return call![0];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PaperlessInvoiceReviewPage — invoice Status select (Story #2154)', () => {
  it('AC1: renders a Status <select id=invoice-status> between due date and notes', async () => {
    renderPage();
    await waitForReady();

    const select = getStatusSelect();
    expect(select.tagName).toBe('SELECT');
    expect(select.id).toBe('invoice-status');

    const dueDate = document.getElementById('due-date')!;
    const notes = document.getElementById('notes')!;
    expect(dueDate).not.toBeNull();
    expect(notes).not.toBeNull();
    expect(dueDate.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(select.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('AC2: defaults to pending after the preview loads', async () => {
    renderPage();
    await waitForReady();
    expect(getStatusSelect().value).toBe('pending');
  });

  it('AC3: offers pending, paid, claimed, quotation with English labels', async () => {
    renderPage();
    await waitForReady();

    const options = Array.from(getStatusSelect().options);
    expect(options.map((o) => o.value)).toEqual(['pending', 'paid', 'claimed', 'quotation']);
    expect(options.map((o) => o.textContent)).toEqual(['Pending', 'Paid', 'Claimed', 'Quotation']);
  });

  it.each(['paid', 'claimed', 'quotation'])(
    'AC4: selecting %s sends it as invoice.status on Create',
    async (status) => {
      renderPage();
      await waitForReady();

      await selectStatus(status);
      expect(getStatusSelect().value).toBe(status);
      await clickCreate();

      await waitFor(() => expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1));
      expect(commitArg().invoice.status).toBe(status);
    },
  );

  it('AC5: leaving the select untouched sends pending', async () => {
    renderPage();
    await waitForReady();

    await clickCreate();

    await waitFor(() => expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1));
    expect(commitArg().invoice.status).toBe('pending');
  });

  describe('AC6: selection persists', () => {
    it('across edits to other metadata fields and line toggles', async () => {
      renderPage();
      await waitForReady();

      await selectStatus('paid');
      await act(async () => {
        fireEvent.change(screen.getByLabelText('Invoice Number'), { target: { value: 'X-9' } });
        fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '123' } });
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'hello' } });
      });
      const include = screen.getByLabelText('Include');
      await act(async () => {
        fireEvent.click(include);
      });
      await act(async () => {
        fireEvent.click(include);
      });

      expect(getStatusSelect().value).toBe('paid');
      await clickCreate();
      await waitFor(() => expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1));
      expect(commitArg().invoice.status).toBe('paid');
      expect(commitArg().invoice.invoiceNumber).toBe('X-9');
    });

    it('after a failed commit, and is resent on retry', async () => {
      mockCommitAutoItemizeCreate
        .mockRejectedValueOnce(new MockApiClientError(500, 'INTERNAL_ERROR'))
        .mockResolvedValueOnce(makeCommitResponse());
      renderPage();
      await waitForReady();

      await selectStatus('claimed');
      await clickCreate();

      expect(await screen.findByText('Translated error message')).toBeInTheDocument();
      expect(getStatusSelect().value).toBe('claimed');

      await clickCreate();
      await waitFor(() => expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(2));
      expect(commitArg(0).invoice.status).toBe('claimed');
      expect(commitArg(1).invoice.status).toBe('claimed');
    });

    it('after category-required validation blocks the save', async () => {
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({
          lines: [
            {
              description: 'No category',
              totalAmount: 300,
              confidence: 0.9,
              budgetCategoryId: null,
              budgetSourceId: null,
            },
          ],
        }),
      );
      renderPage();
      await waitForReady();

      await selectStatus('quotation');
      await clickCreate();

      expect(
        await screen.findByText('Please select a category for all included line items'),
      ).toBeInTheDocument();
      expect(mockCommitAutoItemizeCreate).not.toHaveBeenCalled();
      expect(getStatusSelect().value).toBe('quotation');
    });
  });

  it('AC7: status and the other metadata controls are disabled while saving', async () => {
    mockCommitAutoItemizeCreate.mockReturnValue(new Promise(() => {}));
    renderPage();
    await waitForReady();

    const controls = () => [
      getStatusSelect(),
      screen.getByLabelText('Invoice Number'),
      screen.getByLabelText('Amount'),
      screen.getByLabelText('Invoice Date'),
      screen.getByLabelText('Due Date'),
      screen.getByLabelText('Notes'),
    ];
    controls().forEach((c) => expect(c).toBeEnabled());

    await clickCreate();

    await waitFor(() => expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getStatusSelect()).toBeDisabled());
    controls().forEach((c) => expect(c).toBeDisabled());
  });
});
