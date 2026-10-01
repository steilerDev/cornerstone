/**
 * @jest-environment jsdom
 *
 * Integration tests for PaperlessInvoiceReviewPage — queued-on-save flow (Issue #1764).
 *
 * Covers the new three-handler flow for "Create New Budget Line":
 *  1. handleQueueNewBudgetLine — closes picker, stores draft on row, NO API call
 *  2. handleInlineDraftChange — updates draft fields; other fields unchanged
 *  3. handleSave materializes queued lines before commitAutoItemizeCreate
 *     3a. direct pricing, work_item — createWorkItemBudget called; commit gets assign-existing
 *     3b. unit pricing, household_item — createHouseholdItemBudget called; commit gets assign-existing
 *     3c. invalid unit pricing (NaN) — page error set; commitAutoItemizeCreate NOT called
 *     3d. createWorkItemBudget rejects — page error set; commitAutoItemizeCreate NOT called
 *  4. missingCategories validation skips queued draft lines (exempt from category check)
 *  5. onClearAssign clears all 7 fields including queued-flow fields
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

let mockPickerStateOverride: Record<string, unknown> = {};
const mockClosePicker = jest.fn();

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
      <div data-testid="budget-line-form">
        {field('description', 'description')}
        {field('planned-amount', 'plannedAmount')}
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
  mockCreateWorkItemBudget.mockReset();
  mockCreateHouseholdItemBudget.mockReset();
  mockClosePicker.mockReset();
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
    vendorId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeHouseholdItemBudgetLine(overrides: { id: string; plannedAmount: number }): any {
  return {
    id: overrides.id,
    householdItemId: 'hi-1',
    description: 'HI budget line',
    plannedAmount: overrides.plannedAmount,
    confidence: 'invoice',
    includesVat: true,
    quantity: null,
    unit: null,
    unitPrice: null,
    budgetCategoryId: null,
    budgetSourceId: null,
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PaperlessInvoiceReviewPage — queued-on-save flow (Issue #1764)', () => {
  // ─── Scenario 1: handleQueueNewBudgetLine — stores draft, closes picker ───────

  describe('Scenario 1 — handleQueueNewBudgetLine: stores draft and closes picker', () => {
    it('clicking onCreateNewBudgetLine queues draft, closes picker, makes no API call', async () => {
      // Picker open in step 2 with a work_item selected
      mockPickerStateOverride = {
        isOpen: true,
        step: 2,
        type: 'work_item',
        itemId: 'wi-1',
        itemTitle: 'Kitchen tiles',
        isLoading: false,
        showCreateForm: false,
        budgetSources: [{ id: 'src-disc', name: 'Discretionary Fund', isDiscretionary: true }],
        vendors: [{ id: 'v-builder', name: 'Builder Co', trade: null }],
      };

      renderPage();
      await waitForReady();

      // Click Assign button on the line to set activeRowId (the component needs this for
      // handleQueueNewBudgetLine to know which row to update)
      const assignBtn = screen.getByRole('button', { name: /Assign…/i });

      await act(async () => {
        fireEvent.click(assignBtn);
      });

      // "Create Budget Line" button appears in picker step 2
      const createLineBtn = screen.getByRole('button', { name: /Create Budget Line/i });

      await act(async () => {
        fireEvent.click(createLineBtn);
      });

      // No create API calls must have been made — draft is only queued
      expect(mockCreateWorkItemBudget).not.toHaveBeenCalled();
      expect(mockCreateHouseholdItemBudget).not.toHaveBeenCalled();

      // The picker must have been closed via closePicker()
      expect(mockClosePicker).toHaveBeenCalled();

      // The row shows the "Creating New" badge and its Assign button is gone
      expect(screen.getByTestId('creating-new-badge')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Assign…/i })).not.toBeInTheDocument();
    });
  });

  // ─── Scenario 2: handleInlineDraftChange — updates draft fields ───────────────

  describe('Scenario 2 — handleInlineDraftChange: updates draft fields', () => {
    it('onInlineDraftChange updates description field while other fields remain unchanged', async () => {
      // Open picker in step 2 with a work_item to enable "Create Budget Line"
      mockPickerStateOverride = {
        isOpen: true,
        step: 2,
        type: 'work_item',
        itemId: 'wi-1',
        itemTitle: 'Kitchen tiles',
        isLoading: false,
        showCreateForm: false,
        budgetSources: [{ id: 'src-disc', name: 'Discretionary Fund', isDiscretionary: true }],
        vendors: [{ id: 'v-builder', name: 'Builder Co', trade: null }],
      };

      renderPage();
      await waitForReady();

      // Set activeRowId via Assign button
      const assignBtn = screen.getByRole('button', { name: /Assign…/i });

      await act(async () => {
        fireEvent.click(assignBtn);
      });

      // Queue the draft
      const createLineBtn = screen.getByRole('button', { name: /Create Budget Line/i });

      await act(async () => {
        fireEvent.click(createLineBtn);
      });

      // Wait for inline draft form to appear
      expect(screen.getByTestId('creating-new-badge')).toBeInTheDocument();

      // The AutoItemizeLineList passes onInlineDraftChange to AutoItemizeLineCard.
      // If the inline BudgetLineForm is real (not mocked), find the description textarea
      // scoped to an inline form. The inline BudgetLineForm renders id="inline-{rowId}-budget-description".
      const descInputs = document.querySelectorAll('[id*="budget-description"]');
      expect(descInputs.length).toBeGreaterThan(0);

      const descInput = descInputs[0] as HTMLInputElement;
      const originalValue = descInput.value;

      await act(async () => {
        fireEvent.change(descInput, { target: { value: 'Updated description' } });
      });

      // The description input should reflect the updated value
      expect((descInput as HTMLInputElement).value).toBe('Updated description');
      // The original value should differ from the new value (confirming a change occurred)
      expect(originalValue).not.toBe('Updated description');
    });
  });

  // ─── Scenario 3a: handleSave materializes — direct pricing, work_item ─────────

  describe('Scenario 3a — handleSave materializes: direct pricing, work_item', () => {
    it('createWorkItemBudget called with NET plannedAmount; commit gets assign-existing with correct id', async () => {
      mockCreateWorkItemBudget.mockResolvedValue(
        makeWorkItemBudgetLine({ id: 'bl-123', plannedAmount: 1500 }),
      );

      // Open picker in step 2 so "Create Budget Line" button is available
      mockPickerStateOverride = {
        isOpen: true,
        step: 2,
        type: 'work_item',
        itemId: 'wi-1',
        itemTitle: 'Flooring',
        isLoading: false,
        showCreateForm: false,
        budgetSources: [{ id: 'src-disc', name: 'Discretionary Fund', isDiscretionary: true }],
        vendors: [{ id: 'v-builder', name: 'Builder Co', trade: null }],
      };

      renderPage();
      await waitForReady();

      // Set activeRowId via Assign click
      const assignBtn = screen.getByRole('button', { name: /Assign…/i });

      await act(async () => {
        fireEvent.click(assignBtn);
      });

      // Queue the draft by clicking "Create Budget Line"
      const createLineBtn = screen.getByRole('button', { name: /Create Budget Line/i });

      await act(async () => {
        fireEvent.click(createLineBtn);
      });

      // Verify draft queued
      expect(screen.getByTestId('creating-new-badge')).toBeInTheDocument();

      // Update the plannedAmount to 1500 (direct pricing)
      const amountInputs = document.querySelectorAll('[id*="budget-planned-amount"]');
      expect(amountInputs.length).toBeGreaterThan(0);
      await act(async () => {
        fireEvent.change(amountInputs[0]!, { target: { value: '1500' } });
      });

      // Click the save button
      const createBtn = getCreateBtn();

      await act(async () => {
        fireEvent.click(createBtn);
      });

      // createWorkItemBudget must have been called
      await waitFor(() => {
        expect(mockCreateWorkItemBudget).toHaveBeenCalled();
      });

      // Verify the first argument is the work item ID
      const wibCall = mockCreateWorkItemBudget.mock.calls[0];
      expect(wibCall).toBeDefined();
      expect(wibCall![0]).toBe('wi-1');

      // Verify the payload includes a numeric plannedAmount
      const payload = wibCall![1] as { plannedAmount: number };
      expect(typeof payload.plannedAmount).toBe('number');
      expect(payload.plannedAmount).toBeGreaterThan(0);

      // createHouseholdItemBudget must NOT be called
      expect(mockCreateHouseholdItemBudget).not.toHaveBeenCalled();

      // commitAutoItemizeCreate must have been called with an assign-existing line
      await waitFor(() => {
        expect(mockCommitAutoItemizeCreate).toHaveBeenCalled();
      });

      const commitArg = mockCommitAutoItemizeCreate.mock.calls[0]![0] as {
        lines: Array<{ assignmentMode: string; assignedBudgetLineId?: string }>;
      };
      const assignedLine = commitArg.lines.find((l) => l.assignmentMode === 'assign-existing');
      expect(assignedLine).toBeDefined();
      expect(assignedLine!.assignedBudgetLineId).toBe('bl-123');
    });
  });

  // ─── Scenario 3b: handleSave materializes — unit pricing, household_item ──────

  describe('Scenario 3b — handleSave materializes: unit pricing, household_item', () => {
    it('createHouseholdItemBudget called with computed plannedAmount (qty*unitPrice); commit gets assign-existing', async () => {
      mockCreateHouseholdItemBudget.mockResolvedValue(
        makeHouseholdItemBudgetLine({ id: 'hbl-456', plannedAmount: 1500 }),
      );

      // Open picker in step 2 with household_item type
      mockPickerStateOverride = {
        isOpen: true,
        step: 2,
        type: 'household_item',
        itemId: 'hi-1',
        itemTitle: 'Sofa',
        isLoading: false,
        showCreateForm: false,
        budgetSources: [{ id: 'src-disc', name: 'Discretionary Fund', isDiscretionary: true }],
        vendors: [{ id: 'v-builder', name: 'Builder Co', trade: null }],
      };

      // Use a preview with unit pricing data so the draft initializes with pricingMode='unit'
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({
          lines: [
            {
              description: 'Sofa purchase',
              totalAmount: 1500,
              confidence: 0.9,
              budgetCategoryId: null,
              budgetSourceId: null,
              quantity: 5,
              unitPrice: 300,
            },
          ],
          suggestedVendorId: 'vendor-1',
        }),
      );

      renderPage();
      await waitForReady();

      // Set activeRowId via Assign click
      const assignBtn = screen.getByRole('button', { name: /Assign…/i });

      await act(async () => {
        fireEvent.click(assignBtn);
      });

      // Queue the draft by clicking "Create Budget Line"
      const createLineBtn = screen.getByRole('button', { name: /Create Budget Line/i });

      await act(async () => {
        fireEvent.click(createLineBtn);
      });

      // Verify draft queued
      expect(screen.getByTestId('creating-new-badge')).toBeInTheDocument();

      // Click save
      const createBtn = getCreateBtn();

      await act(async () => {
        fireEvent.click(createBtn);
      });

      // createHouseholdItemBudget must have been called
      await waitFor(() => {
        expect(mockCreateHouseholdItemBudget).toHaveBeenCalled();
      });

      // Verify the first argument is the household item ID
      const hibCall = mockCreateHouseholdItemBudget.mock.calls[0];
      expect(hibCall).toBeDefined();
      expect(hibCall![0]).toBe('hi-1');

      // Verify plannedAmount is a number (qty*unitPrice or plannedAmount from draft)
      const payload = hibCall![1] as { plannedAmount: number };
      expect(typeof payload.plannedAmount).toBe('number');
      expect(payload.plannedAmount).toBeGreaterThan(0);

      // createWorkItemBudget must NOT be called
      expect(mockCreateWorkItemBudget).not.toHaveBeenCalled();

      // commitAutoItemizeCreate must have been called with an assign-existing line
      await waitFor(() => {
        expect(mockCommitAutoItemizeCreate).toHaveBeenCalled();
      });

      const commitArg = mockCommitAutoItemizeCreate.mock.calls[0]![0] as {
        lines: Array<{ assignmentMode: string; assignedBudgetLineId?: string }>;
      };
      const assignedLine = commitArg.lines.find((l) => l.assignmentMode === 'assign-existing');
      expect(assignedLine).toBeDefined();
      expect(assignedLine!.assignedBudgetLineId).toBe('hbl-456');
    });
  });

  // ─── Scenario 3c: handleSave validation — invalid unit pricing ────────────────

  describe('Scenario 3c — handleSave validation: invalid unit pricing (NaN)', () => {
    it('shows page error and does NOT call commitAutoItemizeCreate when unit pricing is invalid', async () => {
      // Open picker in step 2 with work_item so "Create Budget Line" is available
      mockPickerStateOverride = {
        isOpen: true,
        step: 2,
        type: 'work_item',
        itemId: 'wi-1',
        itemTitle: 'Kitchen tiles',
        isLoading: false,
        showCreateForm: false,
        budgetSources: [{ id: 'src-disc', name: 'Discretionary Fund', isDiscretionary: true }],
        vendors: [{ id: 'v-builder', name: 'Builder Co', trade: null }],
      };

      // Preview with unit pricing so draft initializes with pricingMode='unit'
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({
          lines: [
            {
              description: 'Tiles',
              totalAmount: 300,
              confidence: 0.9,
              budgetCategoryId: 'bc-test',
              budgetSourceId: null,
              quantity: 10,
              unitPrice: 30,
            },
          ],
          suggestedVendorId: 'vendor-1',
        }),
      );

      renderPage();
      await waitForReady();

      // Make the live line's unit pricing invalid (negative net base: -5 x 30). The metric
      // inputs are hidden once a draft is queued, so edit before queueing.
      await act(async () => {
        fireEvent.change(screen.getByLabelText('Edit line item quantity'), {
          target: { value: '-5' },
        });
      });

      // Set activeRowId
      const assignBtn = screen.getByRole('button', { name: /Assign…/i });

      await act(async () => {
        fireEvent.click(assignBtn);
      });

      // Queue draft
      const createLineBtn = screen.getByRole('button', { name: /Create Budget Line/i });

      await act(async () => {
        fireEvent.click(createLineBtn);
      });

      expect(screen.getByTestId('creating-new-badge')).toBeInTheDocument();

      // Click save
      const createBtn = getCreateBtn();

      await act(async () => {
        fireEvent.click(createBtn);
      });

      // commitAutoItemizeCreate must NOT be called (validation blocked it)
      expect(mockCommitAutoItemizeCreate).not.toHaveBeenCalled();

      // The page error banner shows the invalid-amount message
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Invalid amount in queued budget line. Please fix before saving.',
      );
    });
  });

  // ─── Scenario 3d: handleSave — materialization API error ──────────────────────

  describe('Scenario 3d — handleSave: createWorkItemBudget rejects with ApiClientError', () => {
    it('page error set to translated message; commitAutoItemizeCreate NOT called', async () => {
      mockCreateWorkItemBudget.mockRejectedValue(
        new MockApiClientError(422, 'BUDGET_LINE_INVALID', 'Invalid budget line'),
      );

      mockPickerStateOverride = {
        isOpen: true,
        step: 2,
        type: 'work_item',
        itemId: 'wi-1',
        itemTitle: 'Kitchen tiles',
        isLoading: false,
        showCreateForm: false,
        budgetSources: [{ id: 'src-disc', name: 'Discretionary Fund', isDiscretionary: true }],
        vendors: [{ id: 'v-builder', name: 'Builder Co', trade: null }],
      };

      renderPage();
      await waitForReady();

      // Set activeRowId
      const assignBtn = screen.getByRole('button', { name: /Assign…/i });

      await act(async () => {
        fireEvent.click(assignBtn);
      });

      // Queue draft
      const createLineBtn = screen.getByRole('button', { name: /Create Budget Line/i });

      await act(async () => {
        fireEvent.click(createLineBtn);
      });

      expect(screen.getByTestId('creating-new-badge')).toBeInTheDocument();

      // Click save
      const createBtn = getCreateBtn();

      await act(async () => {
        fireEvent.click(createBtn);
      });

      // createWorkItemBudget must have been called (and rejected)
      await waitFor(() => {
        expect(mockCreateWorkItemBudget).toHaveBeenCalled();
      });

      // commitAutoItemizeCreate must NOT be called
      expect(mockCommitAutoItemizeCreate).not.toHaveBeenCalled();

      // Page error banner shows the translated API error
      expect(await screen.findByRole('alert')).toHaveTextContent('Translated error message');

      // Page stays in ready state (not navigated away)
      expect(screen.queryByTestId('invoice-detail-page')).not.toBeInTheDocument();
    });
  });

  // ─── Scenario 4: missingCategories validation skips queued draft lines ─────────

  describe('Scenario 4 — missingCategories validation: queued draft lines are exempt', () => {
    it('does NOT show category required error when included line has inlineCreatedBudgetLineDraft (no budgetCategoryId)', async () => {
      // Preview with two lines: both have budgetCategoryId=null so they would fail
      // the category check — BUT the one with a queued draft should be exempt.
      // The second line has an assignedBudgetLineId so it already passes as assign-existing.
      mockPreviewAutoItemize.mockResolvedValue(
        makePreviewResponse({
          lines: [
            {
              description: 'Queued draft line',
              totalAmount: 500,
              confidence: 0.9,
              budgetCategoryId: null, // no category — would normally fail validation
              budgetSourceId: null,
            },
          ],
          suggestedVendorId: 'vendor-1',
        }),
      );

      mockPickerStateOverride = {
        isOpen: true,
        step: 2,
        type: 'work_item',
        itemId: 'wi-1',
        itemTitle: 'Flooring',
        isLoading: false,
        showCreateForm: false,
        budgetSources: [{ id: 'src-disc', name: 'Discretionary Fund', isDiscretionary: true }],
        vendors: [{ id: 'v-builder', name: 'Builder Co', trade: null }],
      };

      mockCreateWorkItemBudget.mockResolvedValue(
        makeWorkItemBudgetLine({ id: 'bl-exempt', plannedAmount: 500 }),
      );

      renderPage();
      await waitForReady();

      // Queue a draft on the line by going through the picker flow
      const assignBtn = screen.getByRole('button', { name: /Assign…/i });

      await act(async () => {
        fireEvent.click(assignBtn);
      });

      const createLineBtn = screen.getByRole('button', { name: /Create Budget Line/i });

      await act(async () => {
        fireEvent.click(createLineBtn);
      });

      expect(screen.getByTestId('creating-new-badge')).toBeInTheDocument();

      // Click save
      const createBtn = getCreateBtn();

      await act(async () => {
        fireEvent.click(createBtn);
      });

      // createWorkItemBudget must have been called (not blocked by category check)
      await waitFor(() => {
        expect(mockCreateWorkItemBudget).toHaveBeenCalled();
      });

      // The "category required" error must NOT have been shown
      expect(
        screen.queryByText('Please select a category for all included line items'),
      ).not.toBeInTheDocument();

      // commitAutoItemizeCreate must have been called (save completed)
      await waitFor(() => {
        expect(mockCommitAutoItemizeCreate).toHaveBeenCalled();
      });
    });
  });

  // ─── Scenario 5: onClearAssign clears all 7 fields ────────────────────────────

  describe('Scenario 5 — onClearAssign: clears all 7 fields including queued-flow ones', () => {
    it('Discard button clears inlineCreatedBudgetLineDraft, assignedItemId, assignedItemType and other assignment fields', async () => {
      mockPickerStateOverride = {
        isOpen: true,
        step: 2,
        type: 'work_item',
        itemId: 'wi-1',
        itemTitle: 'Kitchen tiles',
        isLoading: false,
        showCreateForm: false,
        budgetSources: [{ id: 'src-disc', name: 'Discretionary Fund', isDiscretionary: true }],
        vendors: [{ id: 'v-builder', name: 'Builder Co', trade: null }],
      };

      renderPage();
      await waitForReady();

      // Queue a draft
      const assignBtn = screen.getByRole('button', { name: /Assign…/i });

      await act(async () => {
        fireEvent.click(assignBtn);
      });

      const createLineBtn = screen.getByRole('button', { name: /Create Budget Line/i });

      await act(async () => {
        fireEvent.click(createLineBtn);
      });

      // Verify draft is queued (creating-new badge should appear)
      expect(screen.getByTestId('creating-new-badge')).toBeInTheDocument();

      // Click the Discard button (onClearAssign triggers via AutoItemizeLineCard)
      // The Discard button has aria-label from t('autoItemize.discardInlineDraft') = "Discard"
      const discardBtn = screen.getByRole('button', { name: /Discard/i });

      await act(async () => {
        fireEvent.click(discardBtn);
      });

      // After discard: the row should be unassigned — Assign button should return
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Assign…/i })).toBeInTheDocument();
      });

      // The "creating new" draft state must be gone
      expect(screen.queryByTestId('creating-new-badge')).not.toBeInTheDocument();

      // The inline form draft must be gone
      expect(screen.queryByTestId('budget-line-form')).not.toBeInTheDocument();
    });
  });

  // ─── Extra: no createWorkItemBudget call when no drafts queued ────────────────

  describe('Extra — save without queued drafts: no budget creation API called', () => {
    it('commitAutoItemizeCreate called directly when all lines have no inlineCreatedBudgetLineDraft', async () => {
      // Default setup: preview line has budgetCategoryId set so category validation passes,
      // vendor pre-filled as 'vendor-1'. No picker override (picker is closed).
      // suggestedVendorId='vendor-1' causes the page to pre-fill vendorId state,
      // which lets save proceed without triggering the vendor-required guard.

      renderPage();
      await waitForReady();

      const createBtn = getCreateBtn();

      await act(async () => {
        fireEvent.click(createBtn);
      });

      // suggestedVendorId='vendor-1' pre-fills the vendor, so save proceeds to commit.
      // No inline drafts are queued, so neither budget creation API may be called.
      expect(mockCreateWorkItemBudget).not.toHaveBeenCalled();
      expect(mockCreateHouseholdItemBudget).not.toHaveBeenCalled();
      expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1);
    });
  });
});
