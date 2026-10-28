/**
 * @jest-environment jsdom
 *
 * Integration tests for creating a company inline from PaperlessInvoiceReviewPage (Story #2148).
 *
 * Mock factories are copied from PaperlessInvoiceReviewPage.test.tsx (kept in a separate file to
 * keep per-file shard time down). The real CompanyCreateProvider and New company form (#2213)
 * are used; vendorsApi.createVendor is mocked.
 */

import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { makeSearchCompanies } from '../../test/companySearchMock.js';
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

const mockLocale = { value: 'en' as 'en' | 'de' };

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
const mockFetchVendor = jest.fn<typeof VendorsApiModule.fetchVendor>();
const mockCreateVendor = jest.fn<typeof VendorsApiModule.createVendor>();

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  searchCompanies: makeSearchCompanies(mockFetchVendors),
  fetchVendor: mockFetchVendor,
  createVendor: mockCreateVendor,
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

const mockUseTrades = jest.fn<typeof UseTradesModule.useTrades>();
jest.unstable_mockModule('../../hooks/useTrades.js', () => ({
  useTrades: mockUseTrades,
}));

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
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

jest.unstable_mockModule('../../components/SuggestionBadge/SuggestionBadge.js', () => ({
  SuggestionBadge: ({
    displayValue,
    suggestedValue,
    onApply,
  }: {
    displayValue?: string;
    suggestedValue: string;
    onApply: () => void;
  }) => (
    <>
      <span data-testid="suggestion-badge">{displayValue ?? suggestedValue}</span>
      <button type="button" data-testid="suggestion-apply" onClick={onApply}>
        Apply suggestion
      </button>
    </>
  ),
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
  useLocale: () => ({
    locale: mockLocale.value,
    resolvedLocale: mockLocale.value,
    setLocale: jest.fn(),
    vatRate: 0.19,
  }),
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

import { foldSearchText } from '@cornerstone/shared';
import type * as PageModule from './PaperlessInvoiceReviewPage.js';
import type * as ProviderModule from '../../objectForms/CompanyCreateProvider.js';
import type * as ToastContextModule from '../../components/Toast/ToastContext.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';

let PaperlessInvoiceReviewPage: (typeof PageModule)['PaperlessInvoiceReviewPage'];
let CompanyCreateProvider: (typeof ProviderModule)['CompanyCreateProvider'];
let ToastProvider: (typeof ToastContextModule)['ToastProvider'];
let media: MatchMediaControl;

beforeEach(async () => {
  ({ PaperlessInvoiceReviewPage } =
    (await import('./PaperlessInvoiceReviewPage.js')) as typeof PageModule);
  ({ CompanyCreateProvider } =
    (await import('../../objectForms/CompanyCreateProvider.js')) as typeof ProviderModule);
  ({ ToastProvider } =
    (await import('../../components/Toast/ToastContext.js')) as typeof ToastContextModule);
  media = installMatchMedia({ '(min-width: 768px)': true });

  mockGetPaperlessDocument.mockReset();
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
  mockLocale.value = 'en';
  media.restore();
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

/**
 * A server stand-in: GET /api/vendors filters by the folded query (like the real matcher), and the
 * "first page" is whatever `firstPage` lists for an empty query. Created companies join it.
 */
function serverBacked(
  all: Array<{ id: string; name: string }>,
  firstPage = Number.POSITIVE_INFINITY,
) {
  const store = [...all];
  mockFetchVendors.mockImplementation(async (params) => {
    const q = foldSearchText(params?.q ?? '');
    const hits =
      q === ''
        ? store.slice(0, firstPage)
        : store.filter((v) => foldSearchText(v.name).includes(q));
    return makeVendorsResponse(hits);
  });
  return store;
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
    <MemoryRouter initialEntries={['/budget/invoices/new/paperless?documentId=42']}>
      <ToastProvider>
        <CompanyCreateProvider>
          <Routes>
            <Route path="/budget/invoices/new/paperless" element={<PaperlessInvoiceReviewPage />} />
            <Route
              path="/budget/invoices/:id"
              element={<div data-testid="invoice-detail-page" />}
            />
            <Route path="/budget/invoices" element={<div data-testid="invoices-list-page" />} />
          </Routes>
        </CompanyCreateProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function renderReady(preview: Partial<AutoItemizePreviewResponse> = {}) {
  mockPreviewAutoItemize.mockResolvedValue(makePreviewResponse(preview));
  renderPage();
  return screen.findByPlaceholderText('Search vendors…');
}

// ─── Helpers for the New company form ──────────────────────────────────────────

const createRowName = /^New company/;

async function renderReadyEmptyField(preview: Partial<AutoItemizePreviewResponse> = {}) {
  const input = await renderReady(preview);
  fireEvent.click(input);
  return input;
}

async function openCreateDialog(input: HTMLElement, rowName: string | RegExp = createRowName) {
  fireEvent.click(input);
  const row = await screen.findByRole('option', { name: rowName });
  fireEvent.click(row);
  return screen.findByRole('dialog', { name: 'New company' });
}

function dialogNameInput(dialog: HTMLElement) {
  return within(dialog).getByTestId('company-name-input') as HTMLInputElement;
}

const saveCompany = (dialog: HTMLElement) =>
  fireEvent.click(within(dialog).getByTestId('company-create-form-save'));
const cancelCompany = (dialog: HTMLElement) =>
  fireEvent.click(within(dialog).getByTestId('company-create-form-cancel'));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PaperlessInvoiceReviewPage — inline company creation (Story #2148, #2213)', () => {
  describe('the create row', () => {
    it('is offered with the extracted name while the field is empty and no company matches it', async () => {
      const input = await renderReadyEmptyField({ extractedVendorName: 'Neue Firma' });

      expect(
        await screen.findByRole('option', { name: 'New company Neue Firma' }),
      ).toBeInTheDocument();
      expect(input).toBeInTheDocument();
    });

    it('opens the form pre-filled with the extracted name', async () => {
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });

      const dialog = await openCreateDialog(input);

      expect(dialogNameInput(dialog).value).toBe('Neue Firma');
    });

    it('trims the extracted name and ignores a blank one', async () => {
      const input = await renderReady({ extractedVendorName: '   Neue Firma   ' });
      const dialog = await openCreateDialog(input, 'New company Neue Firma');
      expect(dialogNameInput(dialog).value).toBe('Neue Firma');
    });

    it('offers no row for a blank extracted name and an empty field', async () => {
      const input = await renderReady({ extractedVendorName: '   ' });

      fireEvent.click(input);
      await screen.findByRole('listbox');

      expect(screen.queryByRole('option', { name: createRowName })).not.toBeInTheDocument();
    });

    it('uses the typed text instead of the extracted name once the user types', async () => {
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });

      fireEvent.change(input, { target: { value: 'Typed Co' } });
      const row = await screen.findByRole('option', { name: 'New company Typed Co' });
      fireEvent.click(row);
      const dialog = await screen.findByRole('dialog', { name: 'New company' });

      expect(dialogNameInput(dialog).value).toBe('Typed Co');
    });

    it('falls back to the typed query when no company name was extracted', async () => {
      const input = await renderReady();

      fireEvent.change(input, { target: { value: 'Typed Co' } });
      const row = await screen.findByRole('option', { name: 'New company Typed Co' });
      fireEvent.click(row);
      const dialog = await screen.findByRole('dialog', { name: 'New company' });

      expect(dialogNameInput(dialog).value).toBe('Typed Co');
    });

    it('offers no row for an empty field when nothing was extracted', async () => {
      const input = await renderReady();

      fireEvent.click(input);
      await screen.findByRole('listbox');

      expect(screen.queryByRole('option', { name: createRowName })).not.toBeInTheDocument();
    });

    it('offers no row for an extracted name that only differs by case and umlaut spelling', async () => {
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([{ id: 'v-1', name: 'Öko Fenster' }]));
      const input = await renderReady({ extractedVendorName: 'OEKO FENSTER' });

      fireEvent.click(input);
      await screen.findByRole('option', { name: 'Öko Fenster' });

      expect(screen.queryByRole('option', { name: createRowName })).not.toBeInTheDocument();
    });

    it('offers no row when the typed text matches an existing company in another spelling', async () => {
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([{ id: 'v-1', name: 'Öko Fenster' }]));
      const input = await renderReady({ extractedVendorName: 'Something Else GmbH' });

      fireEvent.change(input, { target: { value: 'OEKO FENSTER' } });

      await screen.findByRole('option', { name: 'Öko Fenster' });
      expect(screen.queryByRole('option', { name: createRowName })).not.toBeInTheDocument();
    });

    it('searches the server with the typed text, folded by the server (umlaut, digraph, case)', async () => {
      serverBacked([
        { id: 'v-1', name: 'Öko Fenster' },
        { id: 'v-2', name: 'MUELLER BAU' },
        { id: 'v-3', name: 'Other Co' },
      ]);
      const input = await renderReady();

      fireEvent.change(input, { target: { value: 'oeko' } });
      expect(await screen.findByRole('option', { name: 'Öko Fenster' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Other Co' })).not.toBeInTheDocument();
      expect(mockFetchVendors).toHaveBeenCalledWith(
        { q: 'oeko', pageSize: 50 },
        { signal: expect.any(AbortSignal) },
      );

      fireEvent.change(input, { target: { value: 'müller' } });
      expect(await screen.findByRole('option', { name: 'MUELLER BAU' })).toBeInTheDocument();
    });

    it('finds a company outside the first page by typing', async () => {
      serverBacked(
        [
          { id: 'v-1', name: 'Alpha Co' },
          { id: 'v-far', name: 'Zeta Far Away GmbH' },
        ],
        1,
      );
      const input = await renderReady();
      fireEvent.click(input);
      await screen.findByRole('option', { name: 'Alpha Co' });
      expect(screen.queryByRole('option', { name: 'Zeta Far Away GmbH' })).not.toBeInTheDocument();

      fireEvent.change(input, { target: { value: 'zeta far' } });

      expect(await screen.findByRole('option', { name: 'Zeta Far Away GmbH' })).toBeInTheDocument();
      expect(mockFetchVendors).toHaveBeenCalledWith(
        { q: 'zeta far', pageSize: 50 },
        { signal: expect.any(AbortSignal) },
      );
    });

    it('preselects a suggested company that is not on the first page, by id', async () => {
      serverBacked([{ id: 'v-1', name: 'Alpha Co' }]);
      mockFetchVendor.mockResolvedValue(
        makeVendor('v-far', 'Far Away Co') as Awaited<
          ReturnType<typeof VendorsApiModule.fetchVendor>
        >,
      );
      mockCommitAutoItemizeCreate.mockResolvedValue(makeCommitResponse());
      await renderReady({ suggestedVendorId: 'v-far' });

      expect((await screen.findAllByText('Far Away Co')).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
      expect(mockFetchVendor).toHaveBeenCalledWith('v-far');
      fireEvent.click(screen.getByRole('button', { name: /Create Invoice/i }));
      await waitFor(() => expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1));
      expect(mockCommitAutoItemizeCreate.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ vendorId: 'v-far' }),
      );
    });

    it('keeps the suggested company selected when its Apply button is pressed', async () => {
      serverBacked([{ id: 'v-1', name: 'Alpha Co' }]);
      mockFetchVendor.mockResolvedValue(
        makeVendor('v-1', 'Alpha Co') as Awaited<ReturnType<typeof VendorsApiModule.fetchVendor>>,
      );
      await renderReady({ suggestedVendorId: 'v-1' });
      await screen.findAllByText('Alpha Co');

      fireEvent.click(screen.getByTestId('suggestion-apply'));

      expect(screen.getAllByText('Alpha Co').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
    });

    it('shows no title for a suggested company that cannot be looked up, but keeps the id', async () => {
      serverBacked([]);
      mockFetchVendor.mockRejectedValue(new Error('offline'));
      await renderReady({ suggestedVendorId: 'v-far' });

      await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledWith('v-far'));
      expect(screen.queryByText('Far Away Co')).not.toBeInTheDocument();
    });

    it('asks the server whether the extracted name exists, with the name as the query', async () => {
      serverBacked([]);
      await renderReady({ extractedVendorName: 'Neue Firma' });

      await waitFor(() =>
        expect(mockFetchVendors).toHaveBeenCalledWith({ q: 'Neue Firma', pageSize: 50 }),
      );
    });

    it('an extracted name that exists on the server (other spelling) gets no create row', async () => {
      serverBacked([{ id: 'v-1', name: 'Öko Fenster' }]);
      const input = await renderReady({ extractedVendorName: 'OEKO FENSTER' });
      await waitFor(() =>
        expect(mockFetchVendors).toHaveBeenCalledWith({ q: 'OEKO FENSTER', pageSize: 50 }),
      );

      fireEvent.click(input);
      await screen.findByRole('option', { name: 'Öko Fenster' });

      expect(screen.queryByRole('option', { name: createRowName })).not.toBeInTheDocument();
    });

    it('a server hit that only contains the extracted name does not count as existing', async () => {
      serverBacked([{ id: 'v-1', name: 'Neue Firma Holding' }]);
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });
      await waitFor(() =>
        expect(mockFetchVendors).toHaveBeenCalledWith({ q: 'Neue Firma', pageSize: 50 }),
      );

      fireEvent.click(input);

      expect(
        await screen.findByRole('option', { name: 'New company Neue Firma' }),
      ).toBeInTheDocument();
    });

    it('an extracted name that does not exist gets the prefilled create row on an empty field', async () => {
      serverBacked([{ id: 'v-1', name: 'Alpha Co' }]);
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });

      const dialog = await openCreateDialog(input, 'New company Neue Firma');

      expect(dialogNameInput(dialog).value).toBe('Neue Firma');
    });

    it('a truncated existence lookup (50 of 51, no exact match) is unknown: no empty-field row, typed text still gets one', async () => {
      const fifty = Array.from({ length: 50 }, (_, i) => ({
        id: `v-${i}`,
        name: `Other Company ${i}`,
      }));
      mockFetchVendors.mockImplementation(async (params) => {
        if (params?.q === 'Neue Firma') {
          return {
            ...makeVendorsResponse(fifty),
            pagination: { page: 1, pageSize: 50, totalItems: 51, totalPages: 2 },
          };
        }
        return makeVendorsResponse(fifty.slice(0, 3));
      });
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });
      await waitFor(() =>
        expect(mockFetchVendors).toHaveBeenCalledWith({ q: 'Neue Firma', pageSize: 50 }),
      );

      fireEvent.click(input);
      await screen.findByRole('option', { name: 'Other Company 0' });
      expect(screen.queryByRole('option', { name: createRowName })).not.toBeInTheDocument();

      fireEvent.change(input, { target: { value: 'Brand New Co' } });
      expect(
        await screen.findByRole('option', { name: 'New company Brand New Co' }),
      ).toBeInTheDocument();
    });

    it('a complete existence lookup with no exact match (50 of 50) still offers the row', async () => {
      const fifty = Array.from({ length: 50 }, (_, i) => ({
        id: `v-${i}`,
        name: `Other Company ${i}`,
      }));
      mockFetchVendors.mockImplementation(async (params) =>
        params?.q === 'Neue Firma'
          ? makeVendorsResponse(fifty)
          : makeVendorsResponse(fifty.slice(0, 3)),
      );
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });
      await waitFor(() =>
        expect(mockFetchVendors).toHaveBeenCalledWith({ q: 'Neue Firma', pageSize: 50 }),
      );

      fireEvent.click(input);

      expect(
        await screen.findByRole('option', { name: 'New company Neue Firma' }),
      ).toBeInTheDocument();
    });

    it('a failed existence lookup shows no empty-field row', async () => {
      serverBacked([{ id: 'v-1', name: 'Alpha Co' }]);
      const normal = mockFetchVendors.getMockImplementation()!;
      mockFetchVendors.mockImplementation(async (params) => {
        if (params?.q === 'Neue Firma') throw new Error('offline');
        return normal(params);
      });
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });
      await waitFor(() =>
        expect(mockFetchVendors).toHaveBeenCalledWith({ q: 'Neue Firma', pageSize: 50 }),
      );

      fireEvent.click(input);
      await screen.findByRole('option', { name: 'Alpha Co' });

      expect(screen.queryByRole('option', { name: createRowName })).not.toBeInTheDocument();
    });

    it('typed text still gets a create row after a failed existence lookup', async () => {
      serverBacked([]);
      const normal = mockFetchVendors.getMockImplementation()!;
      mockFetchVendors.mockImplementation(async (params) => {
        if (params?.q === 'Neue Firma') throw new Error('offline');
        return normal(params);
      });
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });
      await waitFor(() =>
        expect(mockFetchVendors).toHaveBeenCalledWith({ q: 'Neue Firma', pageSize: 50 }),
      );

      fireEvent.change(input, { target: { value: 'Brand New Co' } });

      expect(
        await screen.findByRole('option', { name: 'New company Brand New Co' }),
      ).toBeInTheDocument();
    });

    it('still offers a row for typed text that matches no company, even when the extracted name matches one', async () => {
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([{ id: 'v-1', name: 'Neue Firma' }]));
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });

      fireEvent.change(input, { target: { value: 'Brand New Co' } });

      expect(
        await screen.findByRole('option', { name: 'New company Brand New Co' }),
      ).toBeInTheDocument();
    });

    it('does not push the extracted name when a company with that name already exists', async () => {
      mockFetchVendors.mockResolvedValue(makeVendorsResponse([{ id: 'v-1', name: 'NEUE FIRMA' }]));
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });

      fireEvent.click(input);
      await screen.findByRole('option', { name: 'NEUE FIRMA' });

      expect(screen.queryByRole('option', { name: createRowName })).not.toBeInTheDocument();
    });
  });

  describe('successful creation', () => {
    it('closes the form, selects the new company, clears the company error and announces it', async () => {
      mockCreateVendor.mockResolvedValue(makeVendor('vendor-new', 'Neue Firma'));
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });

      // Trigger the required-company error first
      fireEvent.click(screen.getByRole('button', { name: /Create Invoice/i }));
      await waitFor(() => {
        expect(document.querySelector('#vendor-error')).not.toBeNull();
      });

      const dialog = await openCreateDialog(input);
      saveCompany(dialog);

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'New company' })).not.toBeInTheDocument();
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

    it('selects a company created under another name than the extracted one and keeps the extracted name unmatched', async () => {
      mockCreateVendor.mockResolvedValue(makeVendor('vendor-typed', 'Typed Co'));
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });

      fireEvent.change(input, { target: { value: 'Typed Co' } });
      fireEvent.click(await screen.findByRole('option', { name: 'New company Typed Co' }));
      const dialog = await screen.findByRole('dialog', { name: 'New company' });
      saveCompany(dialog);

      expect(await screen.findByText('Typed Co')).toBeInTheDocument();
      expect(document.querySelector('[role="status"]')).toHaveTextContent(
        'Vendor "Typed Co" created and selected',
      );
      // The extracted name still has no company, so clearing offers its row again.
      fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
      const cleared = await screen.findByPlaceholderText('Search vendors…');
      fireEvent.click(cleared);
      expect(await screen.findByRole('option', { name: createRowName })).toBeInTheDocument();
    });

    it('lets the user clear the created company and choose again', async () => {
      mockCreateVendor.mockResolvedValue(makeVendor('vendor-new', 'Neue Firma'));
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });
      saveCompany(await openCreateDialog(input));
      await screen.findByText('Neue Firma');

      fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

      expect(await screen.findByPlaceholderText('Search vendors…')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
    });

    it('after creating the extracted company the empty-field row is gone and the server lists it', async () => {
      const store = serverBacked([]);
      mockCreateVendor.mockImplementation(async () => {
        const created = makeVendor('vendor-new', 'Neue Firma');
        store.push({ id: created.id, name: created.name });
        return created;
      });
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });
      await waitFor(() =>
        expect(mockFetchVendors).toHaveBeenCalledWith({ q: 'Neue Firma', pageSize: 50 }),
      );
      const dialog = await openCreateDialog(input);
      saveCompany(dialog);
      await screen.findByRole('button', { name: 'Clear selection' });

      fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
      const freshInput = await screen.findByPlaceholderText('Search vendors…');
      fireEvent.click(freshInput);

      expect(await screen.findByRole('option', { name: 'Neue Firma' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: createRowName })).not.toBeInTheDocument();
    });

    it('commits the same invoice total when the interface is German', async () => {
      mockLocale.value = 'de';
      mockCreateVendor.mockResolvedValue(makeVendor('vendor-new', 'Neue Firma'));
      mockCommitAutoItemizeCreate.mockResolvedValue(makeCommitResponse());
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });
      saveCompany(await openCreateDialog(input));
      await screen.findByRole('button', { name: 'Clear selection' });

      fireEvent.click(screen.getByRole('button', { name: /Create Invoice/i }));

      await waitFor(() => expect(mockCommitAutoItemizeCreate).toHaveBeenCalledTimes(1));
      expect(mockCommitAutoItemizeCreate.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          vendorId: 'vendor-new',
          invoice: expect.objectContaining({ amount: 350 }),
        }),
      );
    });

    it('commits the invoice with the created company id', async () => {
      mockCreateVendor.mockResolvedValue(makeVendor('vendor-new', 'Neue Firma'));
      mockCommitAutoItemizeCreate.mockResolvedValue(makeCommitResponse());
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });
      const dialog = await openCreateDialog(input);
      saveCompany(dialog);
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
    const includeBoxes = () => screen.getAllByRole('checkbox', { name: /^Include, row/ });

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
      saveCompany(dialog);
      await screen.findByRole('button', { name: 'Clear selection' });

      expectFormIntact(others);
    });

    it('keeps edited fields and the exclusion state after cancelling', async () => {
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });
      const others = await editForm();

      const dialog = await openCreateDialog(input);
      cancelCompany(dialog);
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'New company' })).not.toBeInTheDocument();
      });

      expectFormIntact(others);
    });
  });

  describe('cancelling', () => {
    it('leaves the company unset, makes no createVendor call and still requires a company on save', async () => {
      const input = await renderReady({ extractedVendorName: 'Neue Firma' });

      const dialog = await openCreateDialog(input);
      cancelCompany(dialog);
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'New company' })).not.toBeInTheDocument();
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
