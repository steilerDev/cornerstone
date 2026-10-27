/**
 * @jest-environment jsdom
 *
 * AutoItemizePage with the real cost line grid (P4.3): funding-source note, Assign all to, the
 * "Use an existing cost line" link, creating cost lines on the task or purchase before the commit,
 * partial-failure safety, merging selected rows and the validation on Save.
 */
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as InvoicesApiModule from '../../lib/invoicesApi.js';
import type * as InvoiceAutoItemizeApiModule from '../../lib/invoiceAutoItemizeApi.js';
import type * as PaperlessApiModule from '../../lib/paperlessApi.js';
import type * as WorkItemBudgetsApiModule from '../../lib/workItemBudgetsApi.js';
import type * as HouseholdItemBudgetsApiModule from '../../lib/householdItemBudgetsApi.js';
import type * as SearchApiModule from '../../lib/searchApi.js';
import type { InvoiceDetail, PaperlessDocumentDetailResponse } from '@cornerstone/shared';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFetchInvoiceById = jest.fn<typeof InvoicesApiModule.fetchInvoiceById>();
jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchInvoiceById: mockFetchInvoiceById,
  fetchInvoices: jest.fn(),
  createInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  deleteInvoice: jest.fn(),
  fetchAllInvoices: jest.fn(),
  convertQuotation: jest.fn(),
}));

const mockAutoItemize = jest.fn<typeof InvoiceAutoItemizeApiModule.autoItemize>();
const mockMergeLines = jest.fn<typeof InvoiceAutoItemizeApiModule.mergeLines>();
jest.unstable_mockModule('../../lib/invoiceAutoItemizeApi.js', () => ({
  autoItemize: mockAutoItemize,
  mergeLines: mockMergeLines,
}));

const mockGetPaperlessDocument = jest.fn<typeof PaperlessApiModule.getPaperlessDocument>();
const mockGetPaperlessStatus = jest.fn<typeof PaperlessApiModule.getPaperlessStatus>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  listPaperlessCorrespondents: jest.fn(),
  uploadPaperlessDocument: jest.fn(),
  getPaperlessDocument: mockGetPaperlessDocument,
  getDocumentThumbnailUrl: (id: number) => `/thumb/${id}`,
  getDocumentPreviewUrl: (id: number) => `/paperless/documents/${id}/preview`,
}));

const mockCreateWorkItemBudget = jest.fn<typeof WorkItemBudgetsApiModule.createWorkItemBudget>();
const mockFetchWorkItemBudgets = jest.fn<typeof WorkItemBudgetsApiModule.fetchWorkItemBudgets>();
jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: mockFetchWorkItemBudgets,
  createWorkItemBudget: mockCreateWorkItemBudget,
  updateWorkItemBudget: jest.fn(),
  deleteWorkItemBudget: jest.fn(),
}));

const mockCreateHouseholdItemBudget =
  jest.fn<typeof HouseholdItemBudgetsApiModule.createHouseholdItemBudget>();
jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: jest.fn(),
  createHouseholdItemBudget: mockCreateHouseholdItemBudget,
  updateHouseholdItemBudget: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));

const mockSearchEverywhere = jest.fn<typeof SearchApiModule.searchEverywhere>();
jest.unstable_mockModule('../../lib/searchApi.js', () => ({
  searchEverywhere: mockSearchEverywhere,
}));

const mockFetchBudgetCategories = jest.fn<() => Promise<unknown>>();
jest.unstable_mockModule('../../lib/budgetCategoriesApi.js', () => ({
  fetchBudgetCategories: mockFetchBudgetCategories,
}));

const mockFetchBudgetSources = jest.fn<() => Promise<unknown>>();
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
  fetchBudgetSource: jest.fn(),
  fetchBudgetLinesForSource: jest.fn(),
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  searchCompanies: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  fetchVendor: jest.fn(),
  fetchVendors: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
  COMPANY_PICKER_PAGE_SIZE: 50,
}));

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  useFormatters: () => ({
    formatCurrency: (v: number) => `€${v.toFixed(2)}`,
    formatDate: (v: string) => v,
    formatDateTime: (v: string) => v,
    formatNumber: (v: number) => String(v),
    formatPercent: (v: number) => `${v}%`,
    getCurrencySymbol: () => '€',
  }),
}));

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
  useLocale: () => ({
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
}));

jest.unstable_mockModule('../../lib/errorTranslation.js', () => ({
  translateApiError: () => 'Translated error message',
}));

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

import type * as AutoItemizePageModule from './AutoItemizePage.js';
import type * as ToastContextModule from '../../components/Toast/ToastContext.js';
let AutoItemizePage: (typeof AutoItemizePageModule)['AutoItemizePage'];
let ToastProvider: (typeof ToastContextModule)['ToastProvider'];

// ─── Fixtures (synthetic) ─────────────────────────────────────────────────────

const DISCRETIONARY = { id: 'src-disc', name: 'Discretionary', isDiscretionary: true };
const BANK = { id: 'src-bank', name: 'Bank loan', isDiscretionary: false };

function makeInvoice(): InvoiceDetail {
  return {
    id: 'inv-1',
    vendorId: 'vendor-1',
    vendorName: 'Test Vendor',
    invoiceNumber: 'INV-001',
    amount: 1000,
    date: '2026-01-01',
    dueDate: null,
    status: 'pending',
    notes: 'Bathroom job',
    budgetLines: [],
    remainingAmount: 1000,
    deposits: [],
    finalPaymentAmount: 1000,
    paid: 0,
    openAmount: 1000,
    remainingOnOffer: null,
    notYetSplit: false,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeDoc(): PaperlessDocumentDetailResponse {
  return {
    document: {
      id: 42,
      title: 'Invoice PDF',
      content: 'ocr',
      tags: [],
      created: '2026-01-01',
      added: '2026-01-01',
      modified: '2026-01-01',
      correspondent: null,
      documentType: 'Invoice',
      archiveSerialNumber: null,
      originalFileName: 'invoice.pdf',
      pageCount: 1,
    },
  };
}

interface LineSpec {
  description: string;
  totalAmount: number;
  includesVat?: boolean;
  budgetCategoryId?: string | null;
  vendorName?: string;
}

function dryRun(lines: LineSpec[]) {
  return {
    lines: lines.map((l) => ({
      description: l.description,
      totalAmount: l.totalAmount,
      confidence: 0.9,
      includesVat: l.includesVat ?? false,
      budgetCategoryId: l.budgetCategoryId === undefined ? 'cat-1' : l.budgetCategoryId,
      vendorName: l.vendorName,
    })),
    warnings: [],
  };
}

function createdLine(id: string, description = 'Tile work') {
  return { id, description } as Awaited<
    ReturnType<typeof WorkItemBudgetsApiModule.createWorkItemBudget>
  >;
}

function commitCall() {
  const call = mockAutoItemize.mock.calls.find(
    (c) => (c[1] as { dryRun?: boolean }).dryRun === false,
  );
  return call?.[1] as unknown as { mode: string; lines: Array<Record<string, unknown>> };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/budget/invoices/inv-1/auto-itemize/42']}>
        <Routes>
          <Route
            path="/budget/invoices/:id/auto-itemize/:documentId"
            element={<AutoItemizePage />}
          />
          <Route path="/budget/invoices/:id" element={<div data-testid="invoice-detail-page" />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function renderReady(lines: LineSpec[]) {
  mockAutoItemize.mockResolvedValueOnce(dryRun(lines));
  renderPage();
  await waitFor(() => expect(screen.getByRole('button', { name: /^Save$/i })).toBeInTheDocument());
}

/** Picks "Kitchen" (a task) in the Assign all to picker. */
async function assignAllToKitchen() {
  const picker = screen.getByTestId('auto-itemize-grid-assign-all');
  const input = picker.querySelector('input') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'kit' } });
  const option = await screen.findByRole('option', { name: /Kitchen/ }, { timeout: 3000 });
  fireEvent.click(option);
  await waitFor(() => expect(within(picker).getByText('Kitchen')).toBeInTheDocument());
}

async function clickSave() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
  });
}

beforeEach(async () => {
  ({ AutoItemizePage } = (await import('./AutoItemizePage.js')) as typeof AutoItemizePageModule);
  ({ ToastProvider } =
    (await import('../../components/Toast/ToastContext.js')) as typeof ToastContextModule);

  mockFetchInvoiceById.mockReset().mockResolvedValue(makeInvoice());
  mockGetPaperlessDocument.mockReset().mockResolvedValue(makeDoc());
  mockGetPaperlessStatus.mockReset().mockRejectedValue(new Error('no paperless'));
  mockAutoItemize.mockReset();
  mockMergeLines.mockReset();
  mockCreateWorkItemBudget.mockReset();
  mockCreateHouseholdItemBudget.mockReset();
  mockFetchWorkItemBudgets.mockReset().mockResolvedValue([]);
  mockSearchEverywhere.mockReset().mockResolvedValue({
    groups: [
      {
        type: 'work_item',
        items: [{ id: 'wi-1', label: 'Kitchen', areaPath: [] }],
      },
    ],
  } as unknown as Awaited<ReturnType<typeof SearchApiModule.searchEverywhere>>);
  mockFetchBudgetCategories.mockReset().mockResolvedValue({
    categories: [{ id: 'cat-1', name: 'Flooring', translationKey: null }],
  });
  mockFetchBudgetSources.mockReset().mockResolvedValue({ budgetSources: [DISCRETIONARY, BANK] });
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AutoItemizePage with the cost line grid', () => {
  describe('funding source note', () => {
    it('shows the discretionary note when a new line uses the Discretionary source', async () => {
      await renderReady([{ description: 'Tile work', totalAmount: 100 }]);

      const note = await screen.findByRole('note');
      expect(note).toHaveAttribute('class', expect.stringContaining('discretionaryNote'));
      expect(within(note).getByText(/Discretionary/i)).toBeInTheDocument();
    });

    it('shows no note when no funding source is discretionary', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [BANK] });
      await renderReady([{ description: 'Tile work', totalAmount: 100 }]);

      await waitFor(() => expect(screen.getByDisplayValue('Tile work')).toBeInTheDocument());
      expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });

    it('shows no note when the sources could not be loaded', async () => {
      mockFetchBudgetSources.mockRejectedValue(new Error('down'));
      await renderReady([{ description: 'Tile work', totalAmount: 100 }]);

      expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });
  });

  describe('create-new rows (no task or purchase)', () => {
    it('commits the row as create-new with category and the discretionary source', async () => {
      await renderReady([{ description: 'Tile work', totalAmount: 100, vendorName: 'Acme' }]);
      await screen.findByRole('note');
      mockAutoItemize.mockResolvedValueOnce({ budgetLines: [], remainingAmount: 0 } as never);

      await clickSave();

      await waitFor(() => expect(commitCall()).toBeDefined());
      expect(mockCreateWorkItemBudget).not.toHaveBeenCalled();
      expect(commitCall().lines[0]).toMatchObject({
        description: 'Tile work',
        totalAmount: 100,
        includesVat: false,
        assignmentMode: 'create-new',
        budgetCategoryId: 'cat-1',
        budgetSourceId: 'src-disc',
        vendorName: 'Acme',
      });
      await waitFor(() => expect(screen.getByTestId('invoice-detail-page')).toBeInTheDocument());
    });

    it('asks for a category when a row has neither a category nor a task or purchase', async () => {
      await renderReady([{ description: 'Tile work', totalAmount: 100, budgetCategoryId: null }]);

      await clickSave();

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(commitCall()).toBeUndefined();
    });

    it('does not save while a row is invalid and shows the row errors', async () => {
      await renderReady([{ description: 'Tile work', totalAmount: 100 }]);
      fireEvent.change(screen.getByDisplayValue('Tile work'), { target: { value: '' } });

      await clickSave();

      expect(commitCall()).toBeUndefined();
      await waitFor(() =>
        expect(
          document.querySelector(
            '[data-testid^="auto-itemize-grid-description-"][aria-invalid="true"]',
          ),
        ).not.toBeNull(),
      );
    });

    it('refuses to save while a merge is still running', async () => {
      mockMergeLines.mockReturnValue(new Promise(() => {}));
      await renderReady([
        { description: 'Tile work', totalAmount: 100 },
        { description: 'Grout', totalAmount: 50 },
      ]);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select, row 1' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select, row 2' }));
      await act(async () => {
        fireEvent.click(await screen.findByTestId('auto-itemize-merge'));
      });

      await clickSave();

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(commitCall()).toBeUndefined();
    });
  });

  describe('Assign all to a task', () => {
    it('creates the cost line on the task from the row first, then commits assign-existing', async () => {
      mockCreateWorkItemBudget.mockResolvedValue(createdLine('bl-new'));
      await renderReady([{ description: 'Tile work', totalAmount: 100, vendorName: 'Acme' }]);
      await assignAllToKitchen();
      mockAutoItemize.mockResolvedValueOnce({ budgetLines: [], remainingAmount: 0 } as never);

      await clickSave();

      await waitFor(() => expect(commitCall()).toBeDefined());
      expect(mockCreateWorkItemBudget).toHaveBeenCalledTimes(1);
      expect(mockCreateWorkItemBudget).toHaveBeenCalledWith(
        'wi-1',
        expect.objectContaining({
          description: 'Tile work',
          plannedAmount: 100,
          includesVat: false,
          confidence: 'invoice',
          budgetCategoryId: 'cat-1',
          budgetSourceId: 'src-disc',
        }),
      );
      expect(commitCall().lines[0]).toMatchObject({
        assignmentMode: 'assign-existing',
        assignedBudgetLineId: 'bl-new',
        assignedBudgetLineType: 'work_item',
        totalAmount: 119,
        includesVat: true,
      });
    });

    it('keeps the lines it already created when a later one fails, and does not commit', async () => {
      mockCreateWorkItemBudget
        .mockResolvedValueOnce(createdLine('bl-1'))
        .mockRejectedValueOnce(new MockApiClientError(400, 'VALIDATION_ERROR'));
      await renderReady([
        { description: 'Tile work', totalAmount: 100 },
        { description: 'Grout', totalAmount: 50 },
      ]);
      await assignAllToKitchen();

      await clickSave();

      expect(await screen.findByText('Translated error message')).toBeInTheDocument();
      expect(commitCall()).toBeUndefined();

      // A retry only creates the line that is missing.
      mockCreateWorkItemBudget.mockResolvedValueOnce(createdLine('bl-2', 'Grout'));
      mockAutoItemize.mockResolvedValueOnce({ budgetLines: [], remainingAmount: 0 } as never);
      await clickSave();
      await waitFor(() => expect(commitCall()).toBeDefined());
      expect(mockCreateWorkItemBudget).toHaveBeenCalledTimes(3);
      expect(commitCall().lines.map((l) => l.assignedBudgetLineId)).toEqual(['bl-1', 'bl-2']);
    });

    it('shows a generic error when the commit call fails after the lines were created', async () => {
      mockCreateWorkItemBudget.mockResolvedValue(createdLine('bl-1'));
      await renderReady([{ description: 'Tile work', totalAmount: 100 }]);
      await assignAllToKitchen();
      mockAutoItemize.mockRejectedValueOnce(new Error('boom'));

      await clickSave();

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.queryByTestId('invoice-detail-page')).not.toBeInTheDocument();
    });
  });

  describe('Use an existing cost line', () => {
    it('links the row to the picked line and commits assign-existing without creating one', async () => {
      mockFetchWorkItemBudgets.mockResolvedValue([
        {
          id: 'wib-1',
          description: 'Existing estimate',
          plannedAmount: 250,
          includesVat: true,
          invoiceLink: null,
        },
      ] as never);
      await renderReady([{ description: 'Tile work', totalAmount: 100 }]);
      await assignAllToKitchen();

      fireEvent.click(screen.getByRole('button', { name: /Use an existing cost line…, Row 1/ }));
      fireEvent.click(await screen.findByTestId('cost-line-existing-use-wib-1'));

      // The row now shows the linked line's gross amount and its name instead of the inputs.
      expect(await screen.findByText(/Links Existing estimate/)).toBeInTheDocument();
      expect(screen.queryByDisplayValue('Tile work')).not.toBeInTheDocument();

      mockAutoItemize.mockResolvedValueOnce({ budgetLines: [], remainingAmount: 0 } as never);
      await clickSave();

      await waitFor(() => expect(commitCall()).toBeDefined());
      expect(mockCreateWorkItemBudget).not.toHaveBeenCalled();
      expect(commitCall().lines[0]).toMatchObject({
        assignmentMode: 'assign-existing',
        assignedBudgetLineId: 'wib-1',
        assignedBudgetLineType: 'work_item',
        totalAmount: 250,
        includesVat: true,
      });
    });
  });

  describe('merging selected rows', () => {
    async function selectBoth() {
      await renderReady([
        { description: 'Tile work', totalAmount: 300 },
        { description: 'Grout', totalAmount: 100 },
      ]);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select, row 1' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select, row 2' }));
    }

    it('announces the start, passes the invoice notes and fills the merged row on success', async () => {
      mockMergeLines.mockResolvedValue({
        description: 'Tile work and grout',
        category: null,
        budgetCategoryId: 'cat-1',
      });
      await selectBoth();

      await act(async () => {
        fireEvent.click(await screen.findByTestId('auto-itemize-merge'));
      });

      await waitFor(() => expect(mockMergeLines).toHaveBeenCalledTimes(1));
      expect(
        (mockMergeLines.mock.calls[0]![0] as { documentSummary?: string }).documentSummary,
      ).toBe('Bathroom job');
      expect(await screen.findByDisplayValue('Tile work and grout')).toBeInTheDocument();
      await waitFor(() =>
        expect(document.querySelector('[role="status"]')?.textContent).toMatch(/merged/i),
      );
    });

    it('offers Retry and Undo when the merge fails, and Undo brings the original rows back', async () => {
      mockMergeLines.mockRejectedValue(new Error('LLM down'));
      await selectBoth();

      await act(async () => {
        fireEvent.click(await screen.findByTestId('auto-itemize-merge'));
      });

      const undo = await screen.findByTestId(/^auto-itemize-grid-notice-undo-/);
      expect(screen.getByTestId(/^auto-itemize-grid-notice-retry-/)).toBeInTheDocument();
      fireEvent.click(undo);

      expect(await screen.findByDisplayValue('Tile work')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Grout')).toBeInTheDocument();
    });

    it('keeps Merge inert with fewer than two selected rows', async () => {
      await renderReady([{ description: 'Tile work', totalAmount: 300 }]);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select, row 1' }));

      const merge = await screen.findByTestId('auto-itemize-merge');
      expect(merge).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(merge);
      expect(mockMergeLines).not.toHaveBeenCalled();
    });
  });

  describe('invoice details and recovery', () => {
    it('applies the extracted number and due date, edits and clears fields and saves a patch', async () => {
      mockGetPaperlessStatus.mockResolvedValue({
        configured: true,
        reachable: true,
        paperlessUrl: 'https://paperless.example.test',
        filterTag: null,
      } as Awaited<ReturnType<typeof PaperlessApiModule.getPaperlessStatus>>);
      mockFetchInvoiceById.mockResolvedValue({
        ...makeInvoice(),
        invoiceNumber: null,
        dueDate: '2026-02-01',
      });
      mockAutoItemize.mockResolvedValueOnce({
        ...dryRun([{ description: 'Tile work', totalAmount: 100 }]),
        extractedInvoiceNumber: 'RE-77',
        extractedDueDate: '2026-03-01',
        extractedNotes: 'Extracted notes',
      } as never);
      renderPage();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^Save$/i })).toBeInTheDocument(),
      );

      // Clear and retype the editable details.
      const number = document.getElementById('invoice-number') as HTMLInputElement;
      fireEvent.change(number, { target: { value: 'X-1' } });
      fireEvent.change(number, { target: { value: '' } });
      expect(number).toHaveValue('');
      const due = document.getElementById('due-date') as HTMLInputElement;
      fireEvent.change(due, { target: { value: '' } });
      expect(due).toHaveValue('');
      const notes = document.getElementById('notes') as HTMLTextAreaElement;
      fireEvent.change(notes, { target: { value: '' } });
      expect(notes).toHaveValue('');
      fireEvent.change(notes, { target: { value: 'Changed notes' } });

      mockAutoItemize.mockResolvedValueOnce({ budgetLines: [], remainingAmount: 0 } as never);
      await clickSave();

      await waitFor(() => expect(mockAutoItemize).toHaveBeenCalledTimes(2));
      const commit = mockAutoItemize.mock.calls[1]![1] as unknown as {
        invoicePatch: Record<string, unknown>;
      };
      expect(commit.invoicePatch).toMatchObject({ dueDate: null, notes: 'Changed notes' });
      expect(commit.invoicePatch).not.toHaveProperty('invoiceNumber');
    });

    it('shows an unexpected-response error when the retry answers without lines', async () => {
      mockAutoItemize.mockRejectedValueOnce(new Error('LLM unreachable'));
      renderPage();
      const retry = await screen.findByRole('button', { name: /Retry/i });
      mockAutoItemize.mockResolvedValueOnce({ budgetLines: [], remainingAmount: 0 } as never);

      fireEvent.click(retry);

      await waitFor(() => expect(mockAutoItemize).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    });
  });
});
