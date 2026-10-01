/**
 * @jest-environment jsdom
 *
 * Integration tests for creating a vendor inline from PaperlessInvoiceReviewPage (Story #2148).
 *
 * Mock factories are copied from PaperlessInvoiceReviewPage.test.tsx (kept in a separate file to
 * keep per-file shard time down). apiClient / errorTranslation are NOT mocked so the real
 * VendorCreateModal error path is exercised; vendorsApi.createVendor is mocked.
 */

import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import type * as PaperlessApiModule from '../../lib/paperlessApi.js';
import type * as InvoiceAutoItemizeApiModule from '../../lib/invoiceAutoItemizeApi.js';
import type * as VendorsApiModule from '../../lib/vendorsApi.js';
import type * as UseTradesModule from '../../hooks/useTrades.js';
import type {
  PaperlessDocumentDetailResponse,
  AutoItemizePreviewResponse,
  AutoItemizeCommitResponse,
  Invoice,
  Vendor,
} from '@cornerstone/shared';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetPaperlessDocument = jest.fn<typeof PaperlessApiModule.getPaperlessDocument>();

jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: jest.fn(),
  listPaperlessDocuments: jest.fn(),
  listPaperlessTags: jest.fn(),
  getPaperlessDocument: mockGetPaperlessDocument,
  getDocumentThumbnailUrl: (id: number) => `/thumb/${id}`,
  getDocumentPreviewUrl: (id: number) => `/paperless/documents/${id}/preview`,
  listPaperlessCorrespondents: jest.fn(),
}));

const mockPreviewAutoItemize = jest.fn<typeof InvoiceAutoItemizeApiModule.previewAutoItemize>();
const mockCommitAutoItemizeCreate =
  jest.fn<typeof InvoiceAutoItemizeApiModule.commitAutoItemizeCreate>();

jest.unstable_mockModule('../../lib/invoiceAutoItemizeApi.js', () => ({
  autoItemize: jest.fn(),
  previewAutoItemize: mockPreviewAutoItemize,
  commitAutoItemizeCreate: mockCommitAutoItemizeCreate,
  mergeLines: jest.fn(),
}));

const mockFetchVendors = jest.fn<typeof VendorsApiModule.fetchVendors>();
const mockCreateVendor = jest.fn<typeof VendorsApiModule.createVendor>();

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
  createVendor: mockCreateVendor,
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

const mockUseTrades = jest.fn<typeof UseTradesModule.useTrades>();
jest.unstable_mockModule('../../hooks/useTrades.js', () => ({
  useTrades: mockUseTrades,
}));

jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  fetchWorkItemBudgets: jest.fn(),
  createWorkItemBudget: jest.fn(),
  updateWorkItemBudget: jest.fn(),
  deleteWorkItemBudget: jest.fn(),
}));

jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: jest.fn(),
  createHouseholdItemBudget: jest.fn(),
  updateHouseholdItemBudget: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));

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
      budgetSources: null,
      vendors: null,
      categories: null,
      showCreateForm: false,
      createError: null,
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

jest.unstable_mockModule('../../components/budget/BudgetLineForm.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BudgetLineForm: (props: any) => (
    <div data-testid="budget-line-form">{props.form?.description ?? ''}</div>
  ),
}));

jest.unstable_mockModule('../../components/ParentPicker/ParentPicker.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ParentPicker: (props: any) => (
    <div data-testid="parent-picker" data-selected-type={props.selectedType ?? ''} />
  ),
}));

jest.unstable_mockModule('../../components/SuggestionBadge/SuggestionBadge.js', () => ({
  SuggestionBadge: ({
    displayValue,
    suggestedValue,
  }: {
    displayValue?: string;
    suggestedValue: string;
  }) => <span data-testid="suggestion-badge">{displayValue ?? suggestedValue}</span>,
}));

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  useFormatters: () => ({
    formatCurrency: (v: number) => `€${v.toFixed(2)}`,
    formatDate: (v: string) => v,
    formatDateTime: (v: string) => v,
    formatNumber: (v: number) => String(v),
    formatPercent: (v: number) => `${v}%`,
  }),
}));

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
  useLocale: () => ({ locale: 'en', setLocale: jest.fn() }),
}));

jest.unstable_mockModule('../../lib/configApi.js', () => ({
  fetchConfig: jest
    .fn<() => Promise<{ autoItemizeEnabled: boolean }>>()
    .mockResolvedValue({ autoItemizeEnabled: true }),
}));

jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: jest.fn(),
  upsertPreference: jest.fn(),
}));

// ─── Dynamic import ────────────────────────────────────────────────────────────

import type * as PageModule from './PaperlessInvoiceReviewPage.js';

let PaperlessInvoiceReviewPage: (typeof PageModule)['PaperlessInvoiceReviewPage'];

beforeEach(async () => {
  ({ PaperlessInvoiceReviewPage } =
    (await import('./PaperlessInvoiceReviewPage.js')) as typeof PageModule);

  mockGetPaperlessDocument.mockReset();
  mockPreviewAutoItemize.mockReset();
  mockCommitAutoItemizeCreate.mockReset();
  mockFetchVendors.mockReset();
  mockCreateVendor.mockReset();
  mockUseTrades.mockReset();
  mockUseTrades.mockReturnValue({
    trades: [],
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof UseTradesModule.useTrades>);

  mockGetPaperlessDocument.mockResolvedValue(makePaperlessDoc());
  mockFetchVendors.mockResolvedValue(makeVendorsResponse([]));
});

afterEach(() => {
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
      {
        description: 'Grout',
        totalAmount: 50,
        confidence: 0.8,
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

function makeVendor(id: string, name: string): Vendor {
  return {
    id,
    name,
    phone: null,
    email: null,
    address: null,
    notes: null,
    trade: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  } as Vendor;
}

function makeCommitResponse(): AutoItemizeCommitResponse {
  const invoice: Invoice = {
    id: 'inv-new-1',
    vendorId: 'vendor-new',
    vendorName: 'Neue Firma',
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

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/budget/invoices/new/paperless',
          state: { documentId: 42, documentTitle: 'Test Invoice' },
        },
      ]}
    >
      <Routes>
        <Route path="/budget/invoices/new/paperless" element={<PaperlessInvoiceReviewPage />} />
        <Route path="/budget/invoices/:id" element={<div data-testid="invoice-detail-page" />} />
        <Route path="/budget/invoices" element={<div data-testid="invoices-list-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function renderReady(preview: Partial<AutoItemizePreviewResponse> = {}) {
  mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse(preview));
  renderPage();
  return screen.findByPlaceholderText('Search vendors…');
}

async function openCreateDialog(input: HTMLElement) {
  fireEvent.focus(input);
  const row = await screen.findByRole('option', { name: /^Add new vendor/ });
  fireEvent.click(row);
  return screen.findByRole('dialog', { name: 'Add Vendor' });
}

function dialogNameInput(dialog: HTMLElement) {
  return within(dialog).getByLabelText(/^Name/) as HTMLInputElement;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PaperlessInvoiceReviewPage — inline vendor creation (Story #2148)', () => {
  describe('opening the dialog', () => {
    it('prefills the dialog name with the extracted vendor name when no vendor was matched', async () => {
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });

      const dialog = await openCreateDialog(input);

      expect(dialogNameInput(dialog).value).toBe('Neue Firma');
    });

    it('falls back to the typed query when no vendor name was extracted', async () => {
      const input = await renderReady();

      fireEvent.change(input, { target: { value: 'Typed Co' } });
      const row = await screen.findByRole('option', { name: 'Add new vendor "Typed Co"' });
      fireEvent.click(row);
      const dialog = await screen.findByRole('dialog', { name: 'Add Vendor' });

      expect(dialogNameInput(dialog).value).toBe('Typed Co');
    });

    it('opens with an empty name when there is neither a query nor an extracted name', async () => {
      const input = await renderReady();

      const dialog = await openCreateDialog(input);

      expect(dialogNameInput(dialog).value).toBe('');
    });
  });

  describe('successful creation', () => {
    it('closes the dialog, selects the new vendor, clears the vendor error and announces it', async () => {
      mockCreateVendor.mockResolvedValue(makeVendor('vendor-new', 'Neue Firma'));
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });

      // Trigger the required-vendor error first
      fireEvent.click(screen.getByRole('button', { name: /Create Invoice/i }));
      await waitFor(() => {
        expect(document.querySelector('#vendor-error')).not.toBeNull();
      });

      const dialog = await openCreateDialog(input);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add Vendor' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Add Vendor' })).not.toBeInTheDocument();
      });
      expect(await screen.findByText('Neue Firma')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
      expect(document.querySelector('#vendor-error')).toBeNull();
      expect(document.querySelector('[role="status"]')).toHaveTextContent(
        'Vendor "Neue Firma" created and selected',
      );
      expect(mockCreateVendor).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Neue Firma' }),
      );
    });

    it('makes the new vendor available in subsequent vendor searches', async () => {
      mockCreateVendor.mockResolvedValue(makeVendor('vendor-new', 'Neue Firma'));
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });
      const dialog = await openCreateDialog(input);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add Vendor' }));
      await screen.findByRole('button', { name: 'Clear selection' });

      fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
      const freshInput = await screen.findByPlaceholderText('Search vendors…');
      fireEvent.focus(freshInput);

      expect(await screen.findByRole('option', { name: 'Neue Firma' })).toBeInTheDocument();
    });

    it('commits the invoice with the created vendor id', async () => {
      mockCreateVendor.mockResolvedValue(makeVendor('vendor-new', 'Neue Firma'));
      mockCommitAutoItemizeCreate.mockResolvedValue(makeCommitResponse());
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });
      const dialog = await openCreateDialog(input);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add Vendor' }));
      await screen.findByRole('button', { name: 'Clear selection' });

      fireEvent.click(screen.getByRole('button', { name: /Create Invoice/i }));

      await waitFor(() => {
        expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1);
      });
      const arg = mockCommitAutoItemizeCreate.mock.calls[0]?.[0];
      expect(arg).toBeDefined();
      expect(arg).toEqual(expect.objectContaining({ vendorId: 'vendor-new' }));
      await screen.findByTestId('invoice-detail-page');
    });
  });

  describe('preserving the in-progress review (AC 5)', () => {
    const includeBoxes = () => screen.getAllByRole('checkbox', { name: 'Include' });

    async function editForm() {
      fireEvent.change(screen.getByLabelText(/Invoice Number/i), {
        target: { value: 'EDITED-42' },
      });
      fireEvent.change(document.querySelector('#notes') as HTMLTextAreaElement, {
        target: { value: 'My own notes' },
      });
      const before = includeBoxes().map((c) => (c as HTMLInputElement).checked);
      expect(before[0]).toBe(true);
      fireEvent.click(includeBoxes()[0]!);
      await waitFor(() => {
        expect((includeBoxes()[0] as HTMLInputElement).checked).toBe(false);
      });
      return before.slice(1);
    }

    function expectFormIntact(otherLines: boolean[]) {
      expect((screen.getByLabelText(/Invoice Number/i) as HTMLInputElement).value).toBe(
        'EDITED-42',
      );
      expect((document.querySelector('#notes') as HTMLTextAreaElement).value).toBe('My own notes');
      const checked = includeBoxes().map((c) => (c as HTMLInputElement).checked);
      expect(checked).toEqual([false, ...otherLines]);
      expect(mockPreviewAutoItemize).toHaveBeenCalledTimes(1);
    }

    it('keeps edited fields and the exclusion state after a successful create', async () => {
      mockCreateVendor.mockResolvedValue(makeVendor('vendor-new', 'Neue Firma'));
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });
      const others = await editForm();

      const dialog = await openCreateDialog(input);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add Vendor' }));
      await screen.findByRole('button', { name: 'Clear selection' });

      expectFormIntact(others);
    });

    it('keeps edited fields and the exclusion state after cancelling', async () => {
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });
      const others = await editForm();

      const dialog = await openCreateDialog(input);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Add Vendor' })).not.toBeInTheDocument();
      });

      expectFormIntact(others);
    });
  });

  describe('cancelling', () => {
    it('leaves the vendor unset, makes no createVendor call and still requires a vendor on save', async () => {
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });

      const dialog = await openCreateDialog(input);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Add Vendor' })).not.toBeInTheDocument();
      });

      expect(mockCreateVendor).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Create Invoice/i }));
      await waitFor(() => {
        expect(document.querySelector('#vendor-error')).not.toBeNull();
      });
      expect(mockCommitAutoItemizeCreate).not.toHaveBeenCalled();
    });
  });
});
