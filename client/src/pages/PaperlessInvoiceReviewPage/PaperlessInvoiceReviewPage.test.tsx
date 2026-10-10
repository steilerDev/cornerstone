/**
 * @jest-environment jsdom
 *
 * Integration tests for PaperlessInvoiceReviewPage (Story #1679).
 *
 * The component was reworked to mirror AutoItemizePage: full budget-line picker modal
 * with ParentPicker + inline BudgetLineForm, per-line category/source pickers,
 * confidence indicator. Test patterns mirror AutoItemizePage.test.tsx.
 *
 * Covers:
 *   1. Extraction runs on mount (preview called), loading state shown.
 *   2. Vendor SearchPicker pre-filled from suggestedVendorId with SuggestionBadge; required-
 *      vendor validation blocks save when empty.
 *   3. Confirm calls commitAutoItemizeCreate with correct payload (assign-existing /
 *      create-new line mapping) and navigates to /budget/invoices/:id on success.
 *   4. Cancel/abandon makes NO commit call.
 *   5. Include/exclude toggle and the assign button opening the picker.
 *   6. Error states (preview failure, document fetch failure).
 *   7. Missing documentId guard.
 */

import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
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

// ─── Mock: workItemBudgetsApi / householdItemBudgetsApi (retry-safety #1833) ──
// Not previously mocked in this file — added so tests can control the materialize
// step of handleSave (createWorkItemBudget/createHouseholdItemBudget), mirroring
// AutoItemizePage.test.tsx.

// Narrower than the real createWorkItemBudget return type (WorkItemBudgetLine) — only
// `id` plus the fields the linked-row snapshot reads (#2149) are exercised by these tests.
const mockCreateWorkItemBudget = jest.fn<
  () => Promise<{
    id: string;
    description?: string;
    plannedAmount?: number;
    includesVat?: boolean;
    budgetCategory?: null;
    budgetSource?: null;
  }>
>();

jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: jest.fn(),
  createWorkItemBudget: mockCreateWorkItemBudget,
  updateWorkItemBudget: jest.fn(),
  deleteWorkItemBudget: jest.fn(),
}));

const mockCreateHouseholdItemBudget = jest.fn();

jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: jest.fn(),
  createHouseholdItemBudget: mockCreateHouseholdItemBudget,
  updateHouseholdItemBudget: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));

// ─── Mock: useBudgetLinePicker (to avoid cascading API mocks) ─────────────────
// mockPickerStateOverride allows individual tests to inject picker state (e.g. isOpen=true)
// without changing the global default. Reset to {} in beforeEach.
// capturedOnLineCreated captures the onLineCreated callback so tests can invoke it
// directly to simulate a budget line being created via the picker.

let mockPickerStateOverride: Record<string, unknown> = {};

const mockShowCreateBudgetLineForm = jest
  .fn<(...args: unknown[]) => Promise<void>>()
  .mockResolvedValue(undefined);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OnLineCreatedFn = (...args: any[]) => void;
let capturedOnLineCreated: OnLineCreatedFn | null = null;

jest.unstable_mockModule('../../hooks/useBudgetLinePicker.js', () => ({
  useBudgetLinePicker: ({ onLineCreated }: { onLineCreated: OnLineCreatedFn }) => {
    capturedOnLineCreated = onLineCreated;
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
        budgetSources: null,
        vendors: null,
        categories: null,
        showCreateForm: false,
        createError: null,
        ...mockPickerStateOverride,
      },
      openPicker: jest.fn(),
      closePicker: jest.fn(),
      handleSelectItem: jest.fn(),
      showCreateBudgetLineForm: mockShowCreateBudgetLineForm,
      handleCreateBudgetLine: jest.fn(),
      setPickerState: jest.fn(),
      initializeStaticData: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      createBudgetLineButtonRef: { current: null },
    };
  },
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

// ─── Mock: SuggestionBadge ────────────────────────────────────────────────────
// The component uses: suggestedValue, fieldLabel, displayValue, onApply props.
// Render displayValue so tests can assert the suggested vendor name is shown.

jest.unstable_mockModule('../../components/SuggestionBadge/SuggestionBadge.js', () => ({
  SuggestionBadge: ({
    displayValue,
    suggestedValue,
  }: {
    displayValue?: string;
    suggestedValue: string;
  }) => <span data-testid="suggestion-badge">{displayValue ?? suggestedValue}</span>,
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
  useLocale: () => ({ locale: 'en', setLocale: jest.fn(), vatRate: 0.19 }),
}));

// ─── Mock: configApi + preferencesApi (prevent network calls from LocaleProvider) ─

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

// ─── Dynamic import ────────────────────────────────────────────────────────────

import React from 'react';
import type * as PaperlessInvoiceReviewPageModule from './PaperlessInvoiceReviewPage.js';
import type * as LocaleContextModule from '../../contexts/LocaleContext.js';

let PaperlessInvoiceReviewPage: (typeof PaperlessInvoiceReviewPageModule)['PaperlessInvoiceReviewPage'];
let LocaleProvider: (typeof LocaleContextModule)['LocaleProvider'];

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
  mockMergeLines.mockReset();
  mockFetchVendors.mockReset();
  mockCreateWorkItemBudget.mockReset();
  mockCreateHouseholdItemBudget.mockReset();
  // Provide a safe default so the vendor-fetch effect (which runs regardless of documentId)
  // never receives undefined from the mock. Individual tests override this as needed.
  mockFetchVendors.mockResolvedValue({
    vendors: [],
    pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
  });

  // Reset picker mock overrides between tests
  mockPickerStateOverride = {};
  capturedOnLineCreated = null;
  mockShowCreateBudgetLineForm.mockReset();
  mockShowCreateBudgetLineForm.mockResolvedValue(undefined);
});

afterEach(() => {
  const fetchCalls = mockFetch.mock.calls.length;
  globalThis.fetch = originalFetch;
  expect(fetchCalls).toBe(0);
  jest.useRealTimers();
  jest.restoreAllMocks();
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
    suggestedVendorId: null,
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
// Wraps in LocaleProvider (matches AutoItemizePage.test.tsx pattern).

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PaperlessInvoiceReviewPage', () => {
  // ─── 1. Loading state ────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows a spinner / analyzing caption on mount before APIs resolve', async () => {
      // Never resolve — stays in loading state

      mockGetPaperlessDocument.mockReturnValue(new Promise(() => {}));
      mockPreviewAutoItemize.mockReturnValue(new Promise(() => {}));
      mockFetchVendors.mockReturnValue(new Promise(() => {}));

      renderPage();

      // The loading layout renders a Spinner (role="img" aria-label="Loading") and
      // the "Analyzing document with AI…" heading.
      // Note: confidence dots also have role="img" in ready state, so we target
      // the Spinner specifically via aria-label="Loading".
      await waitFor(() => {
        expect(
          document.querySelectorAll('[role="img"][aria-label="Loading"]').length,
        ).toBeGreaterThan(0);
      });
      expect(screen.getAllByText(/Analyzing/i).length).toBeGreaterThan(0);
    });

    it('D-12: previewAutoItemize is called on mount with the documentId from the ?documentId= query', async () => {
      // Allow the document fetch to proceed so the preview call fires
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      // Let vendors load
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));
      // Keep preview pending so we stay in loading state and can inspect calls
      let resolvePreview!: (v: AutoItemizePreviewResponse) => void;
      mockPreviewAutoItemize.mockReturnValue(
        new Promise<AutoItemizePreviewResponse>((res) => {
          resolvePreview = res;
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(mockPreviewAutoItemize).toHaveBeenCalledWith({ paperlessDocumentId: 42 });
      });
      expect(mockPreviewAutoItemize).toHaveBeenCalledTimes(1);
      expect(mockGetPaperlessDocument).toHaveBeenCalledWith(42);

      // Clean up: resolve the pending preview to avoid act() warnings
      await act(async () => {
        resolvePreview(makePreviewResponse());
      });
    });

    it('does not show the Create Invoice button in loading state', async () => {
      mockGetPaperlessDocument.mockReturnValue(new Promise(() => {}));
      mockPreviewAutoItemize.mockReturnValue(new Promise(() => {}));
      mockFetchVendors.mockReturnValue(new Promise(() => {}));

      renderPage();

      await waitFor(() => {
        // We're in loading — the Spinner (role="img" aria-label="Loading"; confidence dots have
        // a different aria-label) and the "Analyzing" caption are both present
        expect(
          document.querySelectorAll('[role="img"][aria-label="Loading"]').length,
        ).toBeGreaterThan(0);
        expect(screen.queryAllByText(/Analyzing/i).length).toBeGreaterThan(0);
      });

      // The "Create Invoice & Itemize" button must not be visible yet
      expect(
        screen.queryByRole('button', { name: 'Create Invoice & Itemize' }),
      ).not.toBeInTheDocument();
    });
  });

  // ─── 2. Ready state — vendor pre-fill + SuggestionBadge ─────────────────────

  describe('ready state — vendor pre-fill', () => {
    it('shows cancel and "Create Invoice & Itemize" buttons when ready', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      // The loading state also renders a disabled Cancel button, so we must wait until
      // the page is no longer in loading state. Spinner has aria-label="Loading";
      // confidence dots also have role="img" but different aria-label, so we target specifically.
      await waitFor(
        () => {
          const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
          const hasSpinner =
            document.querySelectorAll('[role="img"][aria-label="Loading"]').length > 0;
          const inLoadingState = screen.queryAllByText(/Analyzing/i).length > 0;
          expect(cancelBtn).toBeInTheDocument();
          expect(hasSpinner || inLoadingState).toBe(false);
        },
        { timeout: 5000 },
      );

      // The create button must be present (disabled when vendorId is empty)
      const createBtn = await screen.findByRole('button', { name: 'Create Invoice & Itemize' });
      expect(createBtn).toBeInTheDocument();
    });

    it('pre-fills vendor SearchPicker when suggestedVendorId matches a loaded vendor', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({ suggestedVendorId: 'vendor-1' }),
      );
      mockFetchVendors.mockResolvedValue(
        makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]),
      );

      renderPage();

      // Page reaches ready state
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      // The vendor name is shown (picker's selected title and/or the suggestion badge).
      expect((await screen.findAllByText('Builder Corp')).length).toBeGreaterThan(0);
    });

    it('shows SuggestionBadge when suggestedVendorId is pre-filled', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({ suggestedVendorId: 'vendor-1' }),
      );
      mockFetchVendors.mockResolvedValue(
        makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      expect(await screen.findByTestId('suggestion-badge')).toBeInTheDocument();
    });

    it('renders the extracted line items list when ready', async () => {
      const previewLines = [
        {
          description: 'Tile work',
          totalAmount: 300,
          confidence: 0.9,
          budgetCategoryId: 'bc-test',
          budgetSourceId: null,
        },
        {
          description: 'Grouting',
          totalAmount: 100,
          confidence: 0.7,
          budgetCategoryId: 'bc-test',
          budgetSourceId: null,
        },
      ];

      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({
          lines: previewLines,
        }),
      );
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      // Line descriptions are rendered as textarea values (aria-label: "Edit line item description")
      expect(await screen.findByDisplayValue('Tile work')).toBeInTheDocument();
    });

    it('renders Assign… button for each unassigned line', async () => {
      const previewLines = [
        { description: 'Line A', totalAmount: 100, confidence: 0.9, budgetCategoryId: 'bc-a' },
        { description: 'Line B', totalAmount: 200, confidence: 0.8, budgetCategoryId: 'bc-b' },
      ];

      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ lines: previewLines }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(() => {
        const assignBtns = screen.queryAllByRole('button', { name: /Assign…/i });
        expect(assignBtns.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ─── 3. Vendor required validation ──────────────────────────────────────────

  describe('validation — vendor required', () => {
    it('Create Invoice button is NOT disabled when no vendor is selected (Story #1703/#1704 — click triggers vendorError instead)', async () => {
      // Story #1703/#1704 refactored vendor validation: the button is no longer disabled
      // when vendorId is empty. Instead, clicking the button runs handleSave which calls
      // setVendorError() and returns early. The button is only disabled when saving.
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      // Without a vendor the button must NOT be disabled (only disabled when saving)
      const createBtn = await screen.findByRole('button', { name: 'Create Invoice & Itemize' });

      // The component disables the button via: disabled={pageStatus === 'saving'}
      // NOT via: disabled={!vendorId} — vendor validation is inside handleSave now
      expect(createBtn).not.toBeDisabled();
    });

    it('shows a FormError / alert when confirm is somehow clicked without vendor', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      const createBtn = await screen.findByRole('button', { name: 'Create Invoice & Itemize' });

      // Button is NOT disabled without a vendor (only disabled when saving).
      // Vendor validation fires inside handleSave and renders an inline field error via
      // <FormError variant="field"> — which does NOT produce role="alert" (that is banner-only).
      await act(async () => {
        fireEvent.click(createBtn);
      });

      // The vendor field error is an inline field error rendered as:
      //   <div id="vendor-error"><FormError variant="field" message={vendorError} /></div>
      // FormError variant="field" renders a plain <div> with no role="alert" (banner-only gets alert).
      // Assert the error container is present in the DOM.
      await waitFor(() => {
        const vendorErrorEl = document.querySelector('#vendor-error');
        expect(vendorErrorEl).not.toBeNull();
      });
      // Outcome confirms vendor is required and the inline field error is surfaced
    });
  });

  // ─── 4. Confirm flow — successful creation ───────────────────────────────────

  describe('confirm flow — successful creation', () => {
    it('calls commitAutoItemizeCreate when confirm is clicked with a vendor set', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({ suggestedVendorId: 'vendor-1' }),
      );
      mockFetchVendors.mockResolvedValue(
        makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]),
      );
      mockCommitAutoItemizeCreate.mockResolvedValue(makeCommitResponse());

      renderPage();

      // Wait for vendor name to be visible (ready state + vendor pre-filled)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      const createBtn = await screen.findByRole('button', { name: 'Create Invoice & Itemize' });

      expect(createBtn).not.toBeDisabled();
      await act(async () => {
        fireEvent.click(createBtn);
      });

      expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1);
      const callArg = mockCommitAutoItemizeCreate.mock.calls[0]![0] as unknown as Record<
        string,
        unknown
      >;
      expect(callArg).toHaveProperty('vendorId', 'vendor-1');
      expect(callArg).toHaveProperty('paperlessDocumentId', 42);
      expect(callArg).toHaveProperty('lines');
      expect(callArg).toHaveProperty('invoice');
    });

    it('payload maps an unassigned included line with assignmentMode=create-new', async () => {
      // Lines without assignments get assignmentMode: 'create-new' (the assign-existing
      // path is covered in the queueSave suite).
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({
          suggestedVendorId: 'vendor-1',
          lines: [
            {
              description: 'Flooring',
              totalAmount: 500,
              confidence: 0.9,
              budgetCategoryId: 'bc-flooring',
            },
          ],
        }),
      );
      mockFetchVendors.mockResolvedValue(
        makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]),
      );
      mockCommitAutoItemizeCreate.mockResolvedValue(makeCommitResponse());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      const createBtn = await screen.findByRole('button', { name: 'Create Invoice & Itemize' });

      expect(createBtn).not.toBeDisabled();
      await act(async () => {
        fireEvent.click(createBtn);
      });

      expect(mockCommitAutoItemizeCreate).toHaveBeenCalled();
      const callArg = mockCommitAutoItemizeCreate.mock.calls[0]![0] as unknown as {
        lines: Array<Record<string, unknown>>;
      };
      expect(callArg.lines).toHaveLength(1);
      // Unassigned line → assignmentMode: 'create-new'
      expect(callArg.lines[0]).toHaveProperty('assignmentMode', 'create-new');
      expect(callArg.lines[0]).toHaveProperty('description', 'Flooring');
    });

    it('navigates to /budget/invoices/:id on successful commit', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({ suggestedVendorId: 'vendor-1' }),
      );
      mockFetchVendors.mockResolvedValue(
        makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]),
      );
      mockCommitAutoItemizeCreate.mockResolvedValue(makeCommitResponse());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      const createBtn = await screen.findByRole('button', { name: 'Create Invoice & Itemize' });

      expect(createBtn).not.toBeDisabled();
      await act(async () => {
        fireEvent.click(createBtn);
      });

      expect(mockCommitAutoItemizeCreate).toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.queryByTestId('invoice-detail-page')).toBeInTheDocument();
      });
    });
  });

  // ─── 5. Cancel / abandon flow ────────────────────────────────────────────────

  describe('cancel flow', () => {
    it('navigates to /budget/invoices when cancel is clicked', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      // The page has a race: vendors useEffect may change `vendors` state which retriggers
      // loadData, so wait until the page is in ready state (no spinner, no "Analyzing" text).
      await waitFor(
        () => {
          const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
          const hasSpinner =
            document.querySelectorAll('[role="img"][aria-label="Loading"]').length > 0;
          const inLoadingState = screen.queryAllByText(/Analyzing/i).length > 0;
          expect(cancelBtn).toBeInTheDocument();
          expect(hasSpinner || inLoadingState).toBe(false);
        },
        { timeout: 5000 },
      );

      // Use act() to flush navigation effects from the click
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      });

      await waitFor(() => {
        expect(screen.getByTestId('invoices-list-page')).toBeInTheDocument();
      });
    });

    it('does NOT call commitAutoItemizeCreate when cancel is clicked', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      // Same stable-state wait as the navigation test above
      await waitFor(
        () => {
          const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
          const hasSpinner =
            document.querySelectorAll('[role="img"][aria-label="Loading"]').length > 0;
          const inLoadingState = screen.queryAllByText(/Analyzing/i).length > 0;
          expect(cancelBtn).toBeInTheDocument();
          expect(hasSpinner || inLoadingState).toBe(false);
        },
        { timeout: 5000 },
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      });

      await waitFor(() => {
        expect(screen.getByTestId('invoices-list-page')).toBeInTheDocument();
      });

      expect(mockCommitAutoItemizeCreate).not.toHaveBeenCalled();
    });
  });

  // ─── 6. Include / exclude toggle ─────────────────────────────────────────────

  describe('include/exclude toggle', () => {
    it('renders an include checkbox for each extracted line', async () => {
      const previewLines = [
        { description: 'Line A', totalAmount: 100, confidence: 0.9, budgetCategoryId: 'bc-a' },
        { description: 'Line B', totalAmount: 200, confidence: 0.8, budgetCategoryId: 'bc-b' },
      ];

      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ lines: previewLines }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      // Wait explicitly for at least one checkbox to appear (more precise than just cancel button)
      // This avoids a race where the page is in "ready" state but lines haven't rendered yet.
      await waitFor(
        () => {
          const checkboxes = screen.queryAllByRole('checkbox');
          expect(checkboxes.length).toBeGreaterThanOrEqual(1);
        },
        { timeout: 5000 },
      );
    });

    it('toggling an include checkbox changes the checked state', async () => {
      const previewLines = [
        {
          description: 'Tile work',
          totalAmount: 300,
          confidence: 0.9,
          budgetCategoryId: 'bc-test',
        },
      ];

      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ lines: previewLines }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      // Wait for at least one checkbox to appear (line card rendered)
      await waitFor(
        () => {
          const checkboxes = screen.queryAllByRole('checkbox');
          expect(checkboxes.length).toBeGreaterThanOrEqual(1);
        },
        { timeout: 5000 },
      );

      // Find the "Include" checkbox (first checkbox in the line card)
      const checkboxes = screen.queryAllByRole('checkbox');
      if (checkboxes.length > 0) {
        const includeCheckbox = checkboxes[0]!;
        const initialState = (includeCheckbox as HTMLInputElement).checked;

        fireEvent.click(includeCheckbox);

        // State should have flipped
        await waitFor(() => {
          expect((includeCheckbox as HTMLInputElement).checked).toBe(!initialState);
        });
      }
    });
  });

  // ─── 7. Assign button — opens picker ────────────────────────────────────────

  describe('assign button — opens picker modal', () => {
    it('clicking the Assign… button does not crash and keeps the page mounted', async () => {
      const previewLines = [
        {
          description: 'Tile work',
          totalAmount: 300,
          confidence: 0.9,
          budgetCategoryId: 'bc-test',
        },
      ];

      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ lines: previewLines }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Assign…/i })).toBeInTheDocument();
      });

      // Click the assign button — must not throw
      fireEvent.click(screen.getByRole('button', { name: /Assign…/i }));

      // Page stays mounted; cancel button still present
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('renders no picker modal by default (isOpen=false)', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      // Modal should not be present since isOpen=false
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('parent-picker')).not.toBeInTheDocument();
    });

    it('renders picker modal when mockPickerStateOverride sets isOpen=true step=1', async () => {
      mockPickerStateOverride = {
        isOpen: true,
        step: 1,
      };

      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      // pickerState.isOpen=true from the mock opens the picker modal with the parent picker.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('parent-picker')).toBeInTheDocument();
    });
  });

  // ─── 8. handleSelectBudgetLine — assigns a budget line to a row ──────────────

  describe('handleSelectBudgetLine — assign existing budget line', () => {
    it('renders the budget line list in picker step 2 when budgetLines are provided', async () => {
      mockPickerStateOverride = {
        isOpen: true,
        step: 2,
        itemTitle: 'Bathroom Renovation',
        budgetLines: [
          {
            id: 'wib-1',
            description: 'Tile budget',
            plannedAmount: 500,
            workItemId: 'wi-1',
            budgetCategory: { id: 'bc-test', name: 'Tiles', translationKey: null },
          },
        ],
        isLoading: false,
        error: null,
        showCreateForm: false,
      };

      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      // The picker modal renders the provided budget line
      expect(screen.getByText('Tile budget')).toBeInTheDocument();
    });
  });

  // ─── 9. handleCreateNewBudgetLine — creates a new budget line from extraction ─

  describe('handleCreateNewBudgetLine — create new budget line from extraction', () => {
    it('clicking Create Budget Line does not crash the page', async () => {
      // Set picker to step 2 (showing the Create Budget Line button)
      mockPickerStateOverride = {
        isOpen: true,
        step: 2,
        itemTitle: 'Bathroom',
        budgetLines: [],
        isLoading: false,
        error: null,
        showCreateForm: false,
        vendors: [{ id: 'v-builder', name: 'Builder Corp' }],
        budgetSources: [{ id: 'src-1', name: 'Discretionary', isDiscretionary: true }],
        categories: [],
      };

      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      // Set activeRowId by clicking Assign…, then click the picker's Create Budget Line button
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Assign…/i }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Create Budget Line/i }));
      });

      // No crash — the normal page (not the error screen) is still rendered
      expect(screen.getByRole('button', { name: 'Create Invoice & Itemize' })).toBeInTheDocument();
    });
  });

  // ─── 10. Error states ────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows error state when previewAutoItemize fails with a generic error', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockRejectedValue(new Error('LLM unreachable'));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('shows error state when getPaperlessDocument fails with ApiClientError', async () => {
      mockGetPaperlessDocument.mockRejectedValue(
        new MockApiClientError(404, 'NOT_FOUND', 'Document not found'),
      );
      mockPreviewAutoItemize.mockReturnValue(new Promise(() => {}));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('renders "Back to Invoices" button in error state', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockRejectedValue(new Error('LLM error'));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Back to Invoices' })).toBeInTheDocument();
    });

    it('shows translated ApiClientError message in error state', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockRejectedValue(
        new MockApiClientError(500, 'LLM_NOT_CONFIGURED', 'LLM not configured'),
      );
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent('Translated error message');
    });
  });

  // ─── 11. Missing documentId guard ───────────────────────────────────────────

  describe('D-12: missing documentId guard', () => {
    function renderAt(entry: string | { pathname: string; state: unknown }) {
      return render(
        React.createElement(
          LocaleProvider,
          null,
          React.createElement(
            MemoryRouter,
            { initialEntries: [entry as string] },
            React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: '/budget/invoices/new/paperless',
                element: React.createElement(PaperlessInvoiceReviewPage),
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

    const MISSING_URLS = [
      '/budget/invoices/new/paperless',
      '/budget/invoices/new/paperless?documentId=abc',
      '/budget/invoices/new/paperless?documentId=0',
      '/budget/invoices/new/paperless?documentId=-3',
      '/budget/invoices/new/paperless?documentId=1.5',
      '/budget/invoices/new/paperless?documentId=',
      '/budget/invoices/new/paperless?documentId=99999999999999999999',
    ];

    it.each(MISSING_URLS)(
      'shows the "No document chosen" layout for %s and makes no API call',
      async (url) => {
        renderAt(url);

        expect(
          await screen.findByRole('heading', { level: 1, name: 'New invoice' }),
        ).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(
          screen.getByText(
            'Go back to Invoices and choose a document to start a new invoice from it.',
          ),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Back to Invoices' })).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: 'Create Invoice & Itemize' }),
        ).not.toBeInTheDocument();
        expect(mockGetPaperlessDocument).not.toHaveBeenCalled();
        expect(mockPreviewAutoItemize).not.toHaveBeenCalled();
      },
    );

    it('D-12: treats history state alone (no query) as a missing document', async () => {
      renderAt({
        pathname: '/budget/invoices/new/paperless',
        state: { documentId: 42, documentTitle: 'Test Invoice' },
      });

      expect(
        await screen.findByRole('heading', { level: 1, name: 'New invoice' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Go back to Invoices and choose a document to start a new invoice from it.',
      );
      expect(mockGetPaperlessDocument).not.toHaveBeenCalled();
      expect(mockPreviewAutoItemize).not.toHaveBeenCalled();
    });

    it('navigates to the invoices list when "Back to Invoices" is clicked', async () => {
      renderAt('/budget/invoices/new/paperless');

      fireEvent.click(await screen.findByRole('button', { name: 'Back to Invoices' }));

      expect(await screen.findByTestId('invoices-list-page')).toBeInTheDocument();
    });
  });

  // ─── 12. onLineCreated callback — auto-created badge ───────────────────────

  describe('onLineCreated callback — auto-created badge (Story #1613 regression)', () => {
    it('capturedOnLineCreated is set when the component renders', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      expect(typeof capturedOnLineCreated).toBe('function');
    });
  });

  // ─── 13. Silent failure fix — vendor field error (Story #1703/#1704) ────────
  // QA Spec scenario 10: clicking "Create Invoice & Itemize" with no vendor renders
  // a visible FormError with variant="field" and does NOT navigate.

  describe('silent failure fix — vendor field error on save with no vendor', () => {
    it('shows a visible FormError for the vendor field when save is clicked without a vendor', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      // Wait for ready state (stable — no spinner, no loading text)
      await waitFor(
        () => {
          const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
          const hasSpinner =
            document.querySelectorAll('[role="img"][aria-label="Loading"]').length > 0;
          const inLoadingState = screen.queryAllByText(/Analyzing/i).length > 0;
          expect(cancelBtn).toBeInTheDocument();
          expect(hasSpinner || inLoadingState).toBe(false);
        },
        { timeout: 5000 },
      );

      // The Create Invoice button is not disabled when no vendor (only disabled when saving)
      const createBtn = await screen.findByRole('button', { name: 'Create Invoice & Itemize' });

      // Click even if it looks disabled — vendor validation fires in handleSave
      await act(async () => {
        fireEvent.click(createBtn);
      });

      // Vendor error should appear as a FormError field error (role="alert" or visible error text)
      // The component renders: {vendorError && <FormError variant="field" message={vendorError} />}
      // which produces a div with an error message.
      // Also verify page did NOT navigate (invoices-list-page is NOT present)
      const navigated =
        screen.queryByTestId('invoices-list-page') !== null ||
        screen.queryByTestId('invoice-detail-page') !== null;

      // handleSave returned early (no vendor): no commit, no navigation, inline field error shown
      expect(navigated).toBe(false);
      expect(mockCommitAutoItemizeCreate).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(document.querySelector('#vendor-error')).not.toBeNull();
      });
    });

    it('does NOT call commitAutoItemizeCreate when save is clicked without a vendor', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(
        () => {
          const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
          const hasSpinner =
            document.querySelectorAll('[role="img"][aria-label="Loading"]').length > 0;
          expect(cancelBtn).toBeInTheDocument();
          expect(hasSpinner).toBe(false);
        },
        { timeout: 5000 },
      );

      const createBtn = await screen.findByRole('button', { name: 'Create Invoice & Itemize' });

      await act(async () => {
        fireEvent.click(createBtn);
      });

      // commitAutoItemizeCreate must NOT have been called
      expect(mockCommitAutoItemizeCreate).not.toHaveBeenCalled();
    });
  });

  // ─── 14. Page-level error banner in ready state on API failure ───────────────
  // QA Spec scenario 11: when commitAutoItemizeCreate throws, a banner renders
  // in the ready state (not a fatal error page).

  describe('page-level error banner on API commit failure', () => {
    it('shows a FormError banner in ready state when commitAutoItemizeCreate throws', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({ suggestedVendorId: 'vendor-1' }),
      );
      mockFetchVendors.mockResolvedValue(
        makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]),
      );
      mockCommitAutoItemizeCreate.mockRejectedValue(new Error('Server failed'));

      renderPage();

      await waitFor(
        () => {
          const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
          const hasSpinner =
            document.querySelectorAll('[role="img"][aria-label="Loading"]').length > 0;
          expect(cancelBtn).toBeInTheDocument();
          expect(hasSpinner).toBe(false);
        },
        { timeout: 5000 },
      );

      const createBtn = await screen.findByRole('button', { name: 'Create Invoice & Itemize' });

      expect(createBtn).not.toBeDisabled();
      await act(async () => {
        fireEvent.click(createBtn);
      });

      // commit throws → pageError set → banner renders
      expect(mockCommitAutoItemizeCreate).toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Still the normal page (inline banner), not the fatal error screen
      expect(screen.getByRole('button', { name: 'Create Invoice & Itemize' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Back to Invoices/i })).not.toBeInTheDocument();
    });

    it('shows the translated error in the banner when commit is rejected with 409 BUDGET_LINE_ALREADY_LINKED', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({ suggestedVendorId: 'vendor-1' }),
      );
      mockFetchVendors.mockResolvedValue(
        makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]),
      );
      mockCommitAutoItemizeCreate.mockRejectedValue(
        new MockApiClientError(409, 'BUDGET_LINE_ALREADY_LINKED', 'already linked'),
      );

      renderPage();

      const createBtn = await screen.findByRole('button', { name: 'Create Invoice & Itemize' });
      await waitFor(() => expect(createBtn).not.toBeDisabled());
      await act(async () => {
        fireEvent.click(createBtn);
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Translated error message');
      });
      expect(screen.getByRole('button', { name: 'Create Invoice & Itemize' })).toBeInTheDocument();
    });
  });

  // ─── 15. PDF iframe present in ready state (QA Spec scenario 12) ─────────────

  describe('PDF iframe in ready state', () => {
    it('renders an iframe with title for the PDF preview in ready state', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(
        () => {
          const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
          const hasSpinner =
            document.querySelectorAll('[role="img"][aria-label="Loading"]').length > 0;
          expect(cancelBtn).toBeInTheDocument();
          expect(hasSpinner).toBe(false);
        },
        { timeout: 5000 },
      );

      // The <iframe> renders with title="Invoice PDF preview" (t('autoItemize.pdfPreviewTitle'))
      const iframe = document.querySelector('iframe');
      expect(iframe).not.toBeNull();
      expect(iframe!.getAttribute('title')).toBe('Invoice PDF preview');
    });

    it('iframe src contains the documentId from the query string', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage(42);

      await waitFor(
        () => {
          const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
          const hasSpinner =
            document.querySelectorAll('[role="img"][aria-label="Loading"]').length > 0;
          expect(cancelBtn).toBeInTheDocument();
          expect(hasSpinner).toBe(false);
        },
        { timeout: 5000 },
      );

      const iframes = document.querySelectorAll('iframe');
      if (iframes.length > 0) {
        const src = iframes[0]!.getAttribute('src') ?? '';
        // The src comes from getDocumentPreviewUrl(documentId=42)
        // Our mock returns: `/paperless/documents/42/preview`
        expect(src).toContain('42');
      }
    });
  });

  // ─── 16. Two-column layout (QA Spec scenario 13) ─────────────────────────────

  describe('two-column layout in ready state', () => {
    it('renders formColumn and previewColumn containers in ready state', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(
        () => {
          const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
          const hasSpinner =
            document.querySelectorAll('[role="img"][aria-label="Loading"]').length > 0;
          expect(cancelBtn).toBeInTheDocument();
          expect(hasSpinner).toBe(false);
        },
        { timeout: 5000 },
      );

      // Partial class name match (CSS Modules may hash class names).
      const previewCol = document.querySelector('[class*="previewColumn"]');

      // formColumn is id="itemize-form"; previewColumn is a sibling div in the pageBody
      expect(document.getElementById('itemize-form')).not.toBeNull();
      expect(previewCol).not.toBeNull();
    });
  });

  // ─── 17. Save button NOT disabled when vendor is empty (QA Spec scenario 14) ─

  describe('Save button not disabled when vendor empty', () => {
    it('the Create Invoice button is NOT disabled when no vendor is selected', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse({ suggestedVendorId: null }));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));

      renderPage();

      await waitFor(
        () => {
          const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
          const hasSpinner =
            document.querySelectorAll('[role="img"][aria-label="Loading"]').length > 0;
          expect(cancelBtn).toBeInTheDocument();
          expect(hasSpinner).toBe(false);
        },
        { timeout: 5000 },
      );

      // The Create Invoice button should be clickable (not disabled) even without a vendor.
      // disabled is only set when pageStatus === 'saving'.
      const createBtn = await screen.findByRole('button', { name: 'Create Invoice & Itemize' });

      // Button must NOT have the disabled attribute
      expect(createBtn).not.toBeDisabled();
    });
  });

  // ─── Story #1797: merge line items — announceMessage live region ────────────

  describe('merge line items — live-region announcements', () => {
    it('renders a live region (role="status") that updates on merge start and success', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockFetchVendors.mockResolvedValue(
        makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]),
      );
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({
          suggestedVendorId: 'vendor-1',
          lines: [
            {
              description: 'Tile work',
              totalAmount: 300,
              confidence: 0.9,
              budgetCategoryId: 'bc-test',
              budgetSourceId: null,
            },
            {
              description: 'Grout',
              totalAmount: 100,
              confidence: 0.85,
              budgetCategoryId: 'bc-test',
              budgetSourceId: null,
            },
          ],
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue('Tile work')).toBeInTheDocument();
      });

      // A role="status" live region always exists on the page (even before any merge)
      const region = document.querySelector('[role="status"]');
      expect(region).not.toBeNull();

      mockMergeLines.mockReturnValue(new Promise(() => {}));

      const cardTile = screen.getByDisplayValue('Tile work').closest('li')!;
      const cardGrout = screen.getByDisplayValue('Grout').closest('li')!;
      fireEvent.click(within(cardTile).getAllByRole('checkbox')[0]!);
      fireEvent.click(within(cardGrout).getAllByRole('checkbox')[0]!);

      const mergeBtn = await screen.findByRole('button', { name: /Merge/i });
      await act(async () => {
        fireEvent.click(mergeBtn);
      });

      await waitFor(() => {
        expect(document.querySelector('[role="status"]')?.textContent).toMatch(
          /Merging 2 line items/i,
        );
      });
    });

    it('passes extractedNotes (metadataEdits.notes) as documentSummary to mergeLines', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockFetchVendors.mockResolvedValue(
        makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]),
      );
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({
          suggestedVendorId: 'vendor-1',
          extractedNotes: 'Bathroom renovation quote',
          lines: [
            {
              description: 'Tile work',
              totalAmount: 300,
              confidence: 0.9,
              budgetCategoryId: 'bc-test',
              budgetSourceId: null,
            },
            {
              description: 'Grout',
              totalAmount: 100,
              confidence: 0.85,
              budgetCategoryId: 'bc-test',
              budgetSourceId: null,
            },
          ],
        }),
      );
      mockMergeLines.mockReturnValue(new Promise(() => {}));

      renderPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue('Tile work')).toBeInTheDocument();
      });

      const cardTile = screen.getByDisplayValue('Tile work').closest('li')!;
      const cardGrout = screen.getByDisplayValue('Grout').closest('li')!;
      fireEvent.click(within(cardTile).getAllByRole('checkbox')[0]!);
      fireEvent.click(within(cardGrout).getAllByRole('checkbox')[0]!);

      const mergeBtn = await screen.findByRole('button', { name: /Merge/i });
      await act(async () => {
        fireEvent.click(mergeBtn);
      });

      await waitFor(() => {
        expect(mockMergeLines).toHaveBeenCalledTimes(1);
      });
      const callArg = mockMergeLines.mock.calls[0]![0] as { documentSummary?: string | null };
      expect(callArg.documentSummary).toBe('Bathroom renovation quote');
    });
  });

  // ─── Bug #1833 — retry safety: no duplicate budget lines on commit retry ─────
  //
  // handleSave calls materializeInlineDrafts (which creates a real budget line via
  // createWorkItemBudget/createHouseholdItemBudget) BEFORE the commitAutoItemizeCreate
  // call. Previously, if commitAutoItemizeCreate rejected, the page state was never
  // updated with the already-materialized line, so a retry would call
  // materializeInlineDrafts again and create a second, duplicate budget line for
  // work that was already created server-side.
  //
  // The fix: MaterializeErr now carries `lines` and handleSave writes it back via
  // `setLines(prev => mergeMaterializedLines(prev, materialized.lines))` on both the
  // failure and success branches, so a retry only re-attempts lines still in draft.
  describe('retry safety — no duplicate budget lines on commit failure (#1833)', () => {
    function findCreateButton() {
      return screen.queryByRole('button', { name: 'Create Invoice & Itemize' });
    }

    /**
     * Queues an inline draft on the next row that still shows an "Assign…" button
     * by clicking it, then the picker's "Create Budget Line" button, and asserts the
     * draft was actually queued (inline form stub or creating-new badge).
     */
    async function queueNextDraft(): Promise<void> {
      const assignBtn = screen.getAllByRole('button', { name: /Assign…/i })[0];
      expect(assignBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(assignBtn!);
      });

      const createBtn = screen.getByRole('button', { name: /Create Budget Line/i });

      await act(async () => {
        fireEvent.click(createBtn);
      });

      expect(screen.getAllByTestId('creating-new-badge').length).toBeGreaterThan(0);
    }

    it('commit failure then retry does not re-create the budget line', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({
          suggestedVendorId: 'vendor-1',
          lines: [
            {
              description: 'Tile work',
              totalAmount: 300,
              confidence: 0.9,
              budgetCategoryId: 'bc-test',
              budgetSourceId: null,
            },
          ],
        }),
      );
      mockFetchVendors.mockResolvedValue(
        makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]),
      );

      // Picker pre-opened at step 2 with non-empty vendors/budgetSources so the
      // "Create Budget Line" button is reliably clickable (mirrors the
      // AutoItemizePage.queueSave.test.tsx setup).
      mockPickerStateOverride = {
        isOpen: true,
        step: 2,
        type: 'work_item',
        itemId: 'wi-1',
        itemTitle: 'Kitchen tiles',
        isLoading: false,
        error: null,
        budgetLines: [],
        showCreateForm: false,
        createError: null,
        vendors: [{ id: 'v-1', name: 'Builder Co' }],
        budgetSources: [{ id: 'src-1', name: 'Main Fund', isDiscretionary: true }],
        categories: [],
      };

      renderPage();

      await waitFor(
        () => {
          const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
          const hasSpinner =
            document.querySelectorAll('[role="img"][aria-label="Loading"]').length > 0;
          expect(cancelBtn).toBeInTheDocument();
          expect(hasSpinner).toBe(false);
        },
        { timeout: 5000 },
      );

      await queueNextDraft();

      mockCreateWorkItemBudget.mockResolvedValue({
        id: 'new-wib-1',
        description: 'Created',
        plannedAmount: 300,
        includesVat: true,
        budgetCategory: null,
        budgetSource: null,
      });
      // First commit attempt fails; second (retry) succeeds.
      mockCommitAutoItemizeCreate.mockRejectedValueOnce(new Error('Commit failed'));
      mockCommitAutoItemizeCreate.mockResolvedValueOnce(makeCommitResponse());

      const createBtn = findCreateButton();
      expect(createBtn).not.toBeNull();

      await act(async () => {
        fireEvent.click(createBtn!);
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Materialization succeeded before the commit call failed — exactly one create call.
      expect(mockCreateWorkItemBudget).toHaveBeenCalledTimes(1);

      // Retry: click the create/save button again. The row is already assign-existing
      // in state, so materializeInlineDrafts must skip it — no second create call.
      await act(async () => {
        fireEvent.click(findCreateButton()!);
      });

      expect(mockCreateWorkItemBudget).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        expect(screen.queryByTestId('invoice-detail-page')).toBeInTheDocument();
      });

      // Both commit attempts must carry assign-existing with the materialized
      // budget line id — not 'create-new'.
      expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(2);
      const secondCallArg = mockCommitAutoItemizeCreate.mock.calls[1]![0] as unknown as {
        lines: Array<{ assignmentMode: string; assignedBudgetLineId?: string }>;
      };
      expect(secondCallArg.lines[0]).toMatchObject({
        assignmentMode: 'assign-existing',
        assignedBudgetLineId: 'new-wib-1',
      });
    });
  });
  // ─── #2149 — linking an existing budget line commits the gross itemized amount ──

  describe('linking an existing budget line (#2149)', () => {
    async function renderAndLink(previewLine: Record<string, unknown>) {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({
          suggestedVendorId: 'vendor-1',
          lines: [
            {
              description: 'Sofa delivery',
              totalAmount: 100,
              confidence: 0.9,
              budgetCategoryId: 'bc-test',
              budgetSourceId: null,
              ...previewLine,
            },
          ],
        }),
      );
      mockFetchVendors.mockResolvedValue(
        makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]),
      );
      mockPickerStateOverride = {
        isOpen: true,
        step: 2,
        type: 'household_item',
        itemId: 'hi-1',
        itemTitle: 'Sofa',
        isLoading: false,
        error: null,
        budgetLines: [
          {
            id: 'hib-1',
            householdItemId: 'hi-1',
            description: 'Existing HI line',
            plannedAmount: 800,
            confidence: 'quote',
            confidenceMargin: 0,
            includesVat: false,
            quantity: null,
            unit: null,
            unitPrice: null,
            budgetCategory: { id: 'cat-9', name: 'Furniture', translationKey: null },
            budgetSource: null,
            vendor: null,
            actualCost: 0,
            actualCostPaid: 0,
            invoiceLink: null,
          },
        ],
        showCreateForm: false,
        createError: null,
        vendors: [],
        budgetSources: [],
        categories: [],
      };

      renderPage();

      await waitFor(
        () => {
          expect(screen.queryByRole('button', { name: /cancel/i })).toBeInTheDocument();
          expect(document.querySelectorAll('[role="img"][aria-label="Loading"]')).toHaveLength(0);
        },
        { timeout: 5000 },
      );

      await act(async () => {
        fireEvent.click(screen.getAllByRole('button', { name: /Assign…/i })[0]!);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Existing HI line/i }));
      });
    }

    async function commit() {
      mockCommitAutoItemizeCreate.mockResolvedValueOnce(makeCommitResponse());
      const createBtn =
        screen.queryByRole('button', { name: /Create Invoice/i }) ||
        screen.queryByRole('button', { name: /createAndItemize/i }) ||
        screen.queryByRole('button', { name: /Itemize/i });
      expect(createBtn).not.toBeNull();
      await act(async () => {
        fireEvent.click(createBtn!);
      });
      await waitFor(() => {
        expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1);
      });
      return mockCommitAutoItemizeCreate.mock.calls[0]![0] as unknown as {
        lines: Array<Record<string, unknown>>;
      };
    }

    it('shows the original values read-only and commits the edited gross amount with includesVat=true', async () => {
      await renderAndLink({ includesVat: false });

      expect(screen.getByTestId('linked-line-category')).toHaveTextContent('Furniture');
      expect(screen.getByTestId('linked-line-source')).toHaveTextContent(/not set/i);
      expect(screen.getByTestId('linked-line-planned')).toHaveTextContent(/800/);
      expect(screen.queryByDisplayValue('Sofa delivery')).toBeNull();

      const amount = screen.getByTestId('linked-line-itemized-amount') as HTMLInputElement;
      expect(amount.value).toBe('119'); // 100 net -> gross
      fireEvent.change(amount, { target: { value: '250' } });

      const payload = await commit();

      expect(payload.lines[0]).toMatchObject({
        assignmentMode: 'assign-existing',
        assignedBudgetLineId: 'hib-1',
        assignedBudgetLineType: 'household_item',
        totalAmount: 250,
        includesVat: true,
      });
    });

    it('commits the default gross amount when the user does not edit it', async () => {
      await renderAndLink({ includesVat: false });

      const payload = await commit();

      expect(payload.lines[0]).toMatchObject({ totalAmount: 119, includesVat: true });
    });
  });
  // ─── 13. Page identity (#2203) ─────────────────────────────────────────────

  describe('page identity (#2203)', () => {
    function renderRouted(
      entry:
        string | { url: string; state?: unknown } = '/budget/invoices/new/paperless?documentId=42',
    ) {
      const log = createRouterLog();
      render(
        <LocaleProvider>
          <RecordingRouter entries={[entry]} log={log}>
            <Routes>
              <Route
                path="/budget/invoices/new/paperless"
                element={<PaperlessInvoiceReviewPage />}
              />
              <Route path="*" element={<div data-testid="elsewhere" />} />
            </Routes>
          </RecordingRouter>
        </LocaleProvider>,
      );
      return log;
    }

    function trail(): string[] {
      const nav = screen.getByRole('navigation', { name: 'You are here' });
      return within(nav)
        .getAllByRole('link')
        .map((a) => (a.textContent ?? '').replace('‹', ''));
    }

    function mockReady() {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({ suggestedVendorId: 'vendor-1' }),
      );
      mockFetchVendors.mockResolvedValue(
        makeVendorsResponse([{ id: 'vendor-1', name: 'Builder Corp' }]),
      );
    }

    it('loading: one "New invoice" h1, a role=status line, the trail and the tab title', async () => {
      document.title = 'initial';
      mockGetPaperlessDocument.mockReturnValue(new Promise(() => {}));
      mockPreviewAutoItemize.mockReturnValue(new Promise(() => {}));
      mockFetchVendors.mockReturnValue(new Promise(() => {}));
      renderRouted();

      expect(
        await screen.findByRole('heading', { level: 1, name: 'New invoice' }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('status')).toHaveTextContent('Analyzing document with AI…');
      expect(trail()).toEqual(['Money', 'Invoices']);
      expect(document.title).toBe('New invoice · Money · Cornerstone');
    });

    it('ready: the same h1, and the extraction note is a plain line without role=status', async () => {
      mockReady();
      renderRouted();

      await screen.findByRole('button', { name: 'Create Invoice & Itemize' });
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1, name: 'New invoice' })).toBeInTheDocument();
      const note = screen.getByText(/^Extraction complete/);
      expect(note.tagName).not.toBe('H1');
      expect(note).not.toHaveAttribute('role');
      expect(trail()).toEqual(['Money', 'Invoices']);
      expect(document.title).toBe('New invoice · Money · Cornerstone');
    });

    it('error: the same h1 and a "Back to Invoices" button that replaces history', async () => {
      mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
      mockPreviewAutoItemize.mockRejectedValue(new Error('LLM error'));
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));
      const log = renderRouted({
        url: '/budget/invoices/new/paperless?documentId=42',
        state: { origin: { to: '/budget/overview' } },
      });

      await screen.findByRole('alert');
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1, name: 'New invoice' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Back to Invoices' }));

      expect(log.actions).toEqual(['REPLACE /budget/invoices']);
    });

    it('Cancel replaces history with the origin the page was opened from', async () => {
      mockReady();
      const log = renderRouted({
        url: '/budget/invoices/new/paperless?documentId=42',
        state: { origin: { to: '/budget/invoices?status=pending' } },
      });
      await screen.findByRole('button', { name: 'Create Invoice & Itemize' });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      });

      expect(log.actions).toEqual(['REPLACE /budget/invoices?status=pending']);
    });

    it('Cancel without an origin replaces history with the Invoices list', async () => {
      mockReady();
      const log = renderRouted();
      await screen.findByRole('button', { name: 'Create Invoice & Itemize' });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      });

      expect(log.actions).toEqual(['REPLACE /budget/invoices']);
    });

    it('create success replaces history with the new invoice and forwards the origin', async () => {
      mockReady();
      mockCommitAutoItemizeCreate.mockResolvedValue(makeCommitResponse());
      const log = renderRouted({
        url: '/budget/invoices/new/paperless?documentId=42',
        state: { origin: { to: '/project/overview' }, documentId: 99 },
      });
      const create = await screen.findByRole('button', { name: 'Create Invoice & Itemize' });

      await act(async () => {
        fireEvent.click(create);
      });

      await waitFor(() => expect(log.actions).toEqual(['REPLACE /budget/invoices/inv-new-1']));
      expect(log.states).toEqual([{ origin: { to: '/project/overview' } }]);
      expect(log.entries).toEqual(['/budget/invoices/inv-new-1']);
    });

    it('create success without an origin forwards no state', async () => {
      mockReady();
      mockCommitAutoItemizeCreate.mockResolvedValue(makeCommitResponse());
      const log = renderRouted();
      const create = await screen.findByRole('button', { name: 'Create Invoice & Itemize' });

      await act(async () => {
        fireEvent.click(create);
      });

      await waitFor(() => expect(log.actions).toEqual(['REPLACE /budget/invoices/inv-new-1']));
      expect(log.states).toEqual([undefined]);
    });

    it('does not navigate on mount', async () => {
      mockReady();
      const log = renderRouted();

      await screen.findByRole('button', { name: 'Create Invoice & Itemize' });
      expect(log.actions).toEqual([]);
    });
  });
});
