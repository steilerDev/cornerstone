/**
 * Page-level tests for the maximum file size / multi-PDF split in ReportWizardPage (story #2161).
 *
 * Own mocks (independent of ReportWizardPage.test.tsx):
 *   - `reportPdf/index.js` with the 4 names the page imports,
 *   - `reportPdf/parts.js` (the lazily-imported pipeline: acquire / count / generate),
 *   - `paperlessApi.js`.
 * `fetch` is replaced by a rejecting stub; every test asserts it was never called (the pipeline is
 * mocked, so any network access would be an escaped dependency).
 *
 * NOTE: the first test asserts the pipeline module was never imported when no limit is set. The
 * `partsModuleImported` flag is set by the mock factory on first import and the module registry is
 * shared across the file, so that test must stay FIRST.
 */
import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MemoryRouter } from 'react-router-dom';
import type React from 'react';
import type {
  BudgetSource,
  HouseholdSettings,
  SourceReportResponse,
  PaperlessStatusResponse,
  AppConfigResponse,
} from '@cornerstone/shared';
import type * as ReportPdfIndexTypes from '../../lib/reportPdf/index.js';
import type * as PartsTypes from '../../lib/reportPdf/parts.js';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type { ApiClientError as ApiClientErrorClass } from '../../lib/apiClient.js';
import type {
  AcquireResult,
  GeneratedReportParts,
  SkippedDocument,
} from '../../lib/reportPdf/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUseAuth = jest.fn<typeof AuthContextTypes.useAuth>();
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockFetchBudgetSources = jest.fn<() => Promise<{ budgetSources: BudgetSource[] }>>();
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
}));

const mockFetchHouseholdSettings = jest.fn<() => Promise<HouseholdSettings>>();
jest.unstable_mockModule('../../lib/settingsApi.js', () => ({
  fetchHouseholdSettings: mockFetchHouseholdSettings,
}));

const mockFetchConfig = jest.fn<() => Promise<AppConfigResponse>>();
jest.unstable_mockModule('../../lib/configApi.js', () => ({ fetchConfig: mockFetchConfig }));

const mockGetSourceReport =
  jest.fn<(type: string, sourceId: string) => Promise<SourceReportResponse>>();
jest.unstable_mockModule('../../lib/sourceReportsApi.js', () => ({
  getSourceReport: mockGetSourceReport,
  markInvoicesClaimed: jest.fn(),
  generateReportContent: jest.fn(),
}));

const mockGetPaperlessStatus = jest.fn<() => Promise<PaperlessStatusResponse>>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
}));

const mockGenerateReportPdf = jest.fn<typeof ReportPdfIndexTypes.generateReportPdf>();
const mockDownloadPdf = jest.fn<typeof ReportPdfIndexTypes.downloadPdf>();
const mockCreatePreviewUrl = jest.fn<typeof ReportPdfIndexTypes.createPreviewUrl>();
const mockUploadToPaperless = jest.fn<typeof ReportPdfIndexTypes.uploadToPaperless>();
jest.unstable_mockModule('../../lib/reportPdf/index.js', () => ({
  generateReportPdf: mockGenerateReportPdf,
  downloadPdf: mockDownloadPdf,
  createPreviewUrl: mockCreatePreviewUrl,
  uploadToPaperless: mockUploadToPaperless,
}));

let partsModuleImported = false;
const mockAcquire = jest.fn<typeof PartsTypes.acquireAttachments>();
const mockCountUncached = jest.fn<typeof PartsTypes.countUncachedDocuments>();
const mockGenerateParts = jest.fn<typeof PartsTypes.generateReportParts>();
jest.unstable_mockModule('../../lib/reportPdf/parts.js', () => {
  partsModuleImported = true;
  return {
    acquireAttachments: mockAcquire,
    countUncachedDocuments: mockCountUncached,
    generateReportParts: mockGenerateParts,
  };
});

const mockShowToast = jest.fn();
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  useToast: () => ({ toasts: [], showToast: mockShowToast, dismissToast: jest.fn() }),
}));

// Imported after the mocks so LocaleProvider uses the mocked configApi (no real /api/config call).
const { LocaleProvider } = await import('../../contexts/LocaleContext.js');

let ReportWizardPage: React.ComponentType;
let ApiClientError: typeof ApiClientErrorClass;

let savedFetch: typeof globalThis.fetch;
let mockFetch: jest.Mock<typeof fetch>;
let savedCreateObjectURL: typeof URL.createObjectURL;
let savedRevokeObjectURL: typeof URL.revokeObjectURL;

// ─── Fixtures ───────────────────────────────────────────────────────────────

const OK_ACQUIRE: AcquireResult = { attachments: [], skippedDocuments: [], failedFetches: [] };

function makeSource(): BudgetSource {
  return {
    id: 'src-1',
    name: 'Home Loan',
    sourceType: 'bank_loan',
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
    reference: null,
    contactAddress: null,
    status: 'active',
    isDiscretionary: false,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeReport(): SourceReportResponse {
  return {
    type: 'claim',
    source: {
      id: 'src-1',
      name: 'Home Loan',
      sourceType: 'bank_loan',
      reference: null,
      contactAddress: null,
    },
    invoices: [
      {
        invoiceId: 'inv-1',
        vendorId: 'vend-1',
        vendorName: 'ACME',
        invoiceNumber: 'INV-001',
        date: '2026-01-10',
        status: 'pending',
        invoiceAmount: 1000,
        allocatedAmount: 1000,
        lineKind: 'invoice',
        isSplit: false,
        splitKind: null,
        // 3 documents: the sizing total counts every included (invoice, document) pair.
        documents: [1, 2, 3].map((documentId) => ({
          documentId,
          archiveSerialNumber: null,
          title: null,
          attachmentType: null,
        })),
        budgetLinesForSource: [
          { id: 'bl-1', description: 'Original Usage Text', allocatedPortion: 0, linkedItem: null },
        ],
        depositsVisibleToSource: [],
      },
    ],
    totalAmount: 1000,
    unallocatedInvoices: [],
    generatedAt: '2026-01-15T00:00:00.000Z',
  };
}

function makeParts(
  count: number,
  extras: Partial<GeneratedReportParts> = {},
): GeneratedReportParts {
  return {
    parts: Array.from({ length: count }, (_, i) => ({
      index: i,
      blob: new Blob([`part-${i + 1}`]),
      size: 500_000,
      attachmentKeys: [`inv-1:${i + 1}`],
      invoiceIds: ['inv-1'],
      overLimit: false,
    })),
    skippedDocuments: [],
    warnings: [],
    limitBytes: 1_000_000,
    ...extras,
  };
}

const PAPERLESS_READY: PaperlessStatusResponse = {
  configured: true,
  reachable: true,
  error: null,
  paperlessUrl: null,
  filterTag: null,
};

const BASE_NAME = /claim-home-loan-\d{4}-\d{2}-\d{2}/;

beforeEach(async () => {
  jest.clearAllMocks();
  ({ ReportWizardPage } = await import('./ReportWizardPage.js'));
  ({ ApiClientError } = await import('../../lib/apiClient.js'));

  mockFetch = jest.fn<typeof fetch>().mockRejectedValue(new Error('network access is not allowed'));
  savedFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  mockFetchConfig.mockResolvedValue({
    currency: 'EUR',
    vatRate: 0.19,
    autoItemizeEnabled: false,
    llmEnabled: false,
  });
  mockFetchHouseholdSettings.mockResolvedValue({ householdName: null, householdAddress: null });
  mockUseAuth.mockReturnValue({
    user: null,
    oidcEnabled: false,
    isLoading: false,
    error: null,
    refreshAuth: jest.fn(async () => {}),
    logout: jest.fn(async () => {}),
  });
  mockGetPaperlessStatus.mockResolvedValue({
    configured: false,
    reachable: false,
    error: null,
    paperlessUrl: null,
    filterTag: null,
  });
  mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
  mockGetSourceReport.mockResolvedValue(makeReport());
  mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });
  mockCreatePreviewUrl.mockImplementation(() => 'blob:preview');
  mockUploadToPaperless.mockResolvedValue(undefined);
  mockCountUncached.mockReturnValue(0);
  mockAcquire.mockResolvedValue(OK_ACQUIRE);
  mockGenerateParts.mockImplementation(async () => makeParts(3));

  savedCreateObjectURL = URL.createObjectURL;
  savedRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn<typeof URL.createObjectURL>().mockReturnValue('blob:mock-url');
  URL.revokeObjectURL = jest.fn<typeof URL.revokeObjectURL>();
});

afterEach(() => {
  jest.useRealTimers();
  expect(mockFetch).not.toHaveBeenCalled();
  globalThis.fetch = savedFetch;
  URL.createObjectURL = savedCreateObjectURL;
  URL.revokeObjectURL = savedRevokeObjectURL;
});

// ─── Navigation helpers ─────────────────────────────────────────────────────

function renderPage() {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={['/budget/reports']}>
        <ReportWizardPage />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

type User = ReturnType<typeof userEvent.setup>;

async function clickNext(user: User) {
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

async function goToStep4(user: User) {
  await waitFor(() => screen.getByRole('radiogroup'));
  await user.click(screen.getAllByRole('radio')[1]!); // claim
  await clickNext(user);
  await waitFor(() => expect(screen.getAllByRole('radio').length).toBeGreaterThan(0));
  await user.click(screen.getAllByRole('radio')[0]!);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
  await clickNext(user);
  await waitFor(() => expect(screen.getByText('ACME')).toBeInTheDocument());
  await clickNext(user);
  await screen.findByLabelText('Maximum file size (MB)');
}

async function setLimit(user: User, value: string) {
  const input = screen.getByLabelText('Maximum file size (MB)');
  await user.clear(input);
  if (value !== '') await user.type(input, value);
}

/** Step 4 with a valid limit typed, ready to click Next. */
async function step4WithLimit(user: User, limit = '1') {
  await goToStep4(user);
  await setLimit(user, limit);
}

async function goToStep5WithLimit(user: User, limit = '1') {
  await step4WithLimit(user, limit);
  await clickNext(user);
  await screen.findByRole('button', { name: /^Download all/ });
}

async function firstGenerated(): Promise<GeneratedReportParts> {
  return (await mockGenerateParts.mock.results[0]!.value) as GeneratedReportParts;
}

function stepperButton(name: string) {
  return screen.getByRole('button', { name });
}

function expectedPartName(k: number, total: number) {
  return new RegExp(`^${BASE_NAME.source}-part-${k}-of-${total}\\.pdf$`);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ReportWizardPage — maximum file size / multi-PDF split (#2161)', () => {
  // MUST stay first: see file header.
  it('with an empty limit, generates a single PDF via generateReportPdf and never loads the parts pipeline', async () => {
    renderPage();
    const user = userEvent.setup();
    await goToStep4(user);
    expect(screen.getByLabelText('Maximum file size (MB)')).toHaveValue('');
    await clickNext(user);

    await user.click(await screen.findByRole('button', { name: 'Download PDF' }));

    await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockDownloadPdf).toHaveBeenCalledTimes(1));
    expect(mockDownloadPdf.mock.calls[0]![1]).toMatch(new RegExp(`^${BASE_NAME.source}\\.pdf$`));
    expect(screen.queryByText('Generated files')).not.toBeInTheDocument();
    expect(mockAcquire).not.toHaveBeenCalled();
    expect(mockCountUncached).not.toHaveBeenCalled();
    expect(mockGenerateParts).not.toHaveBeenCalled();
    expect(partsModuleImported).toBe(false);
  });

  describe('limit validation', () => {
    it('shows the min / decimals errors, disables Next while invalid, and re-enables it when cleared', async () => {
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);

      await setLimit(user, '0.5');
      expect(screen.getByText('The minimum is 1 MB.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

      await setLimit(user, '1.25');
      expect(screen.getByText('Use at most one decimal place.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

      await setLimit(user, 'abc');
      expect(
        screen.getByText('Enter a positive number, for example 10 or 9.5.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

      await setLimit(user, '');
      expect(screen.queryByText('The minimum is 1 MB.')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    });

    it('does not let the Preview & Export stepper step skip an invalid limit', async () => {
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await clickNext(user); // step 5 without a limit -> maxReachedStep = 5
      await screen.findByRole('button', { name: 'Download PDF' });
      await user.click(stepperButton('Settings'));
      await screen.findByLabelText('Maximum file size (MB)');
      await setLimit(user, '0.5');
      await screen.findByText('The minimum is 1 MB.');

      await user.click(stepperButton('Preview & Export'));

      expect(screen.getByLabelText('Maximum file size (MB)')).toHaveValue('0.5');
      expect(screen.getByText('The minimum is 1 MB.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument();
      expect(stepperButton('Settings')).toHaveAttribute('aria-current', 'step');
      expect(mockCountUncached).not.toHaveBeenCalled();
      expect(mockAcquire).not.toHaveBeenCalled();
    });

    it('ignores an invalid limit while attachments are switched off', async () => {
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await setLimit(user, '0.5');

      await user.click(screen.getByRole('checkbox', { name: /Attach invoice PDFs/ }));

      expect(screen.getByLabelText('Maximum file size (MB)')).toBeDisabled();
      expect(screen.getByText('Only applies to attached invoice PDFs.')).toBeInTheDocument();
      expect(screen.queryByText('The minimum is 1 MB.')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();

      await clickNext(user);
      await user.click(await screen.findByRole('button', { name: 'Download PDF' }));
      await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));
      expect(mockAcquire).not.toHaveBeenCalled();
      expect(mockGenerateParts).not.toHaveBeenCalled();
    });
  });

  describe('sizing gate (step 4 -> 5)', () => {
    it('shows the sizing card on step 4 until attachment sizes are known, then opens step 5', async () => {
      const gate = deferredAcquire();
      mockCountUncached.mockReturnValue(1); // partially warm cache; total still counts all pairs
      mockAcquire.mockReturnValueOnce(gate.promise);
      renderPage();
      const user = userEvent.setup();
      await step4WithLimit(user);

      await clickNext(user);

      expect(await screen.findByTestId('sizing-phase')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Checking attachment sizes… 0 of 3');
      expect(screen.queryByLabelText('Maximum file size (MB)')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Download all/ })).not.toBeInTheDocument();
      expect(mockGenerateParts).not.toHaveBeenCalled();

      await act(async () => {
        gate.resolve(OK_ACQUIRE);
      });

      expect(await screen.findByRole('button', { name: 'Download all (3 PDFs)' })).toBeEnabled();
      expect(screen.getByRole('heading', { name: 'Generated files' })).toBeInTheDocument();
      expect(screen.queryByTestId('sizing-phase')).not.toBeInTheDocument();
    });

    it('goes straight to step 5 when every attachment is already cached (no sizing card)', async () => {
      mockCountUncached.mockReturnValue(0);
      renderPage();
      const user = userEvent.setup();
      await step4WithLimit(user);

      await clickNext(user);

      expect(
        await screen.findByRole('button', { name: 'Download all (3 PDFs)' }),
      ).toBeInTheDocument();
      expect(mockAcquire).toHaveBeenCalledTimes(1); // only the step-5 generation acquire
    });

    it('Cancel during sizing returns to the settings with the limit preserved', async () => {
      const gate = deferredAcquire();
      mockCountUncached.mockReturnValue(3);
      mockAcquire.mockReturnValueOnce(gate.promise);
      renderPage();
      const user = userEvent.setup();
      await step4WithLimit(user, '2');
      await clickNext(user);
      await screen.findByTestId('sizing-phase');

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await act(async () => {
        gate.resolve(OK_ACQUIRE);
      });

      expect(await screen.findByLabelText('Maximum file size (MB)')).toHaveValue('2');
      expect(screen.queryByTestId('sizing-phase')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Download all/ })).not.toBeInTheDocument();
    });

    it('a failed attachment fetch shows the failure card with a focused Retry; Retry re-runs sizing', async () => {
      mockCountUncached.mockReturnValue(1);
      mockAcquire.mockResolvedValueOnce({
        ...OK_ACQUIRE,
        failedFetches: [
          {
            invoiceId: 'inv-1',
            documentId: 7,
            title: 'Scan.pdf',
            vendorName: 'ACME',
            invoiceNumber: 'INV-001',
          },
        ],
      });
      renderPage();
      const user = userEvent.setup();
      await step4WithLimit(user);

      await clickNext(user);

      expect(await screen.findByTestId('sizing-failed')).toBeInTheDocument();
      expect(screen.getByText('Scan.pdf (ACME, INV-001)')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus());

      await user.click(screen.getByRole('button', { name: 'Retry' }));

      expect(
        await screen.findByRole('button', { name: 'Download all (3 PDFs)' }),
      ).toBeInTheDocument();
      expect(mockCountUncached).toHaveBeenCalledTimes(2);
    });

    it('"Continue without them" proceeds to step 5 and skips the accepted failures on generation', async () => {
      mockCountUncached.mockReturnValue(1);
      mockAcquire.mockResolvedValueOnce({
        ...OK_ACQUIRE,
        failedFetches: [
          {
            invoiceId: 'inv-1',
            documentId: 7,
            title: null,
            vendorName: 'ACME',
            invoiceNumber: null,
          },
        ],
      });
      renderPage();
      const user = userEvent.setup();
      await step4WithLimit(user);
      await clickNext(user);
      await screen.findByTestId('sizing-failed');
      expect(screen.getByText('Document 7 (ACME, —)')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Continue without them' }));

      expect(
        await screen.findByRole('button', { name: 'Download all (3 PDFs)' }),
      ).toBeInTheDocument();
      const generationCall = mockAcquire.mock.calls[mockAcquire.mock.calls.length - 1]!;
      expect(Array.from(generationCall[3]!.skipFetch ?? [])).toEqual([7]);
    });

    it('Back on the failure card dismisses it and shows the settings again', async () => {
      mockCountUncached.mockReturnValue(1);
      mockAcquire.mockResolvedValueOnce({
        ...OK_ACQUIRE,
        failedFetches: [
          {
            invoiceId: 'inv-1',
            documentId: 7,
            title: 'Scan.pdf',
            vendorName: 'ACME',
            invoiceNumber: 'INV-001',
          },
        ],
      });
      renderPage();
      const user = userEvent.setup();
      await step4WithLimit(user, '3');
      await clickNext(user);
      await screen.findByTestId('sizing-failed');

      await user.click(screen.getByRole('button', { name: 'Back' }));

      expect(await screen.findByLabelText('Maximum file size (MB)')).toHaveValue('3');
      expect(screen.queryByTestId('sizing-failed')).not.toBeInTheDocument();
    });

    it('clicking the Preview & Export stepper step from step 3 shows the sizing card on step 4 first', async () => {
      renderPage();
      const user = userEvent.setup();
      await goToStep5WithLimit(user);
      await user.click(stepperButton('Select Invoices'));
      await waitFor(() => expect(screen.queryByLabelText('Maximum file size (MB)')).toBeNull());
      const gate = deferredAcquire();
      mockCountUncached.mockReturnValue(2);
      mockAcquire.mockReturnValueOnce(gate.promise);

      await user.click(stepperButton('Preview & Export'));

      expect(await screen.findByTestId('sizing-phase')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Checking attachment sizes… 0 of 3');
      await act(async () => {
        gate.resolve(OK_ACQUIRE);
      });
      expect(
        await screen.findByRole('button', { name: 'Download all (3 PDFs)' }),
      ).toBeInTheDocument();
    });
  });

  describe('step 5 files', () => {
    it('lists the generated files with their sizes and attachment counts', async () => {
      renderPage();
      const user = userEvent.setup();
      await goToStep5WithLimit(user);

      expect(screen.getByText('3 files, 1.5 MB in total')).toBeInTheDocument();
      expect(within(screen.getByTestId('report-parts')).getAllByRole('listitem')).toHaveLength(3);
      expect(screen.getByText('Part 1 of 3 · 500.0 kB · 1 attachment')).toBeInTheDocument();
    });

    it('reports skipped documents from the generation to the skip note state', async () => {
      const skipped: SkippedDocument[] = [
        {
          invoiceId: 'inv-1',
          documentId: '9',
          reason: 'footnoteFetchFailed',
          vendorName: 'ACME',
          invoiceNumber: 'INV-001',
        },
      ];
      mockGenerateParts.mockImplementation(async () => makeParts(3, { skippedDocuments: skipped }));
      renderPage();
      const user = userEvent.setup();
      await goToStep5WithLimit(user);

      // The skip note names the vendor/invoice of the skipped document.
      expect(await screen.findAllByText(/INV-001/)).not.toHaveLength(0);
    });

    it('downloads a single file from its row', async () => {
      renderPage();
      const user = userEvent.setup();
      await goToStep5WithLimit(user);

      const rows = within(screen.getByTestId('report-parts')).getAllByRole('listitem');
      const name = within(rows[1]!).getByText(expectedPartName(2, 3)).textContent!;
      await user.click(screen.getByRole('button', { name: `Download ${name}` }));

      expect(mockDownloadPdf).toHaveBeenCalledTimes(1);
      const parts = await firstGenerated();
      expect(mockDownloadPdf).toHaveBeenCalledWith(parts.parts[1]!.blob, name);
    });

    it('Download all downloads every part in order with -part-k-of-N names, staggered', async () => {
      renderPage();
      const user = userEvent.setup();
      await goToStep5WithLimit(user);
      const parts = await firstGenerated();

      jest.useFakeTimers();
      fireEvent.click(screen.getByRole('button', { name: 'Download all (3 PDFs)' }));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });

      expect(mockDownloadPdf).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status', { name: '' })).toBeInTheDocument();
      expect(screen.getByText('Downloading 1 of 3…')).toBeInTheDocument();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(400);
      });
      expect(mockDownloadPdf).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Downloading 2 of 3…')).toBeInTheDocument();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(400);
      });

      expect(mockDownloadPdf).toHaveBeenCalledTimes(3);
      for (let k = 1; k <= 3; k++) {
        const [blob, name] = mockDownloadPdf.mock.calls[k - 1]!;
        expect(blob).toBe(parts.parts[k - 1]!.blob);
        expect(name).toMatch(expectedPartName(k, 3));
      }
      expect(screen.queryByText(/^Downloading \d of 3/)).not.toBeInTheDocument();
    });

    it('a single-part result downloads under the plain report name and shows no file list', async () => {
      mockGenerateParts.mockImplementation(async () => makeParts(1));
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await setLimit(user, '5');
      await clickNext(user);

      await user.click(await screen.findByRole('button', { name: 'Download PDF' }));

      await waitFor(() => expect(mockDownloadPdf).toHaveBeenCalledTimes(1));
      expect(mockDownloadPdf.mock.calls[0]![1]).toMatch(new RegExp(`^${BASE_NAME.source}\\.pdf$`));
      expect(screen.queryByText('Generated files')).not.toBeInTheDocument();
    });

    it('shows an error toast when the download cannot generate the parts', async () => {
      mockGenerateParts.mockRejectedValue(new Error('render failed'));
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await setLimit(user, '1');
      await clickNext(user);
      await screen.findByRole('button', { name: 'Retry' }); // step 5 auto-prepare failed

      await user.click(screen.getByRole('button', { name: 'Download PDF' }));

      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(
          'error',
          'Failed to generate the PDF for download.',
        ),
      );
      expect(mockDownloadPdf).not.toHaveBeenCalled();
    });
  });

  describe('upload to Paperless', () => {
    beforeEach(() => {
      mockGetPaperlessStatus.mockResolvedValue(PAPERLESS_READY);
    });

    it('uploads every part; one failure is shown, and "Retry failed" re-uploads only that part', async () => {
      mockUploadToPaperless
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined);
      renderPage();
      const user = userEvent.setup();
      await goToStep5WithLimit(user);
      const parts = await firstGenerated();

      await user.click(screen.getByRole('button', { name: 'Upload all (3) to Paperless' }));

      expect(await screen.findByText('1 of 3 files failed to upload.')).toBeInTheDocument();
      expect(mockUploadToPaperless).toHaveBeenCalledTimes(3);
      const titles = mockUploadToPaperless.mock.calls.map((c) => c[1]);
      expect(titles[0]).toMatch(new RegExp(`^${BASE_NAME.source} \\(1 of 3\\)$`));
      expect(titles[1]).toMatch(new RegExp(`^${BASE_NAME.source} \\(2 of 3\\)$`));
      expect(titles[2]).toMatch(new RegExp(`^${BASE_NAME.source} \\(3 of 3\\)$`));
      const rows = within(screen.getByTestId('report-parts')).getAllByRole('listitem');
      expect(within(rows[0]!).getByText('Uploaded')).toBeInTheDocument();
      expect(within(rows[1]!).getByText('Failed')).toBeInTheDocument();
      expect(
        within(rows[1]!).getByText('Failed: Upload to Paperless failed. Please try again.'),
      ).toBeInTheDocument();
      expect(within(rows[2]!).getByText('Uploaded')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Upload all (3) to Paperless' })).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Retry failed (1)' }));

      await waitFor(() => expect(mockUploadToPaperless).toHaveBeenCalledTimes(4));
      const [retriedBlob, retriedTitle] = mockUploadToPaperless.mock.calls[3]!;
      expect(retriedBlob).toBe(parts.parts[1]!.blob);
      expect(retriedTitle).toMatch(new RegExp(`^${BASE_NAME.source} \\(2 of 3\\)$`));
      expect(await screen.findByText('3 files uploaded to Paperless.')).toBeInTheDocument();
      expect(screen.queryByText('1 of 3 files failed to upload.')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Retry failed/ })).not.toBeInTheDocument();
    });

    it('shows the translated API error as the failure reason of a part', async () => {
      mockUploadToPaperless.mockResolvedValue(undefined);
      mockUploadToPaperless.mockRejectedValueOnce(
        new ApiClientError(502, { code: 'PAPERLESS_UNREACHABLE', message: 'unreachable' }),
      );
      renderPage();
      const user = userEvent.setup();
      await goToStep5WithLimit(user);

      await user.click(screen.getByRole('button', { name: 'Upload all (3) to Paperless' }));

      expect(
        await screen.findByText('Failed: The document management system could not be reached.'),
      ).toBeInTheDocument();
    });

    it('uploads a single-part result under the plain report name with a success toast', async () => {
      mockGenerateParts.mockImplementation(async () => makeParts(1));
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await setLimit(user, '5');
      await clickNext(user);

      await user.click(await screen.findByRole('button', { name: 'Upload to Paperless' }));

      await waitFor(() => expect(mockUploadToPaperless).toHaveBeenCalledTimes(1));
      expect(mockUploadToPaperless.mock.calls[0]![1]).toMatch(new RegExp(`^${BASE_NAME.source}$`));
      expect(mockShowToast).toHaveBeenCalledWith('success', 'Document uploaded to Paperless');
    });

    it('a single-part upload failure shows the translated API error as a toast', async () => {
      mockGenerateParts.mockImplementation(async () => makeParts(1));
      mockUploadToPaperless.mockRejectedValue(
        new ApiClientError(502, { code: 'PAPERLESS_UNREACHABLE', message: 'unreachable' }),
      );
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await setLimit(user, '5');
      await clickNext(user);

      await user.click(await screen.findByRole('button', { name: 'Upload to Paperless' }));

      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(
          'error',
          'The document management system could not be reached.',
        ),
      );
    });

    it('a single-part upload failure without an API error shows the generic upload toast', async () => {
      mockGenerateParts.mockImplementation(async () => makeParts(1));
      mockUploadToPaperless.mockRejectedValue(new Error('boom'));
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await setLimit(user, '5');
      await clickNext(user);

      await user.click(await screen.findByRole('button', { name: 'Upload to Paperless' }));

      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(
          'error',
          'Upload to Paperless failed. Please try again.',
        ),
      );
    });

    it('shows an error toast when the parts cannot be generated for the upload', async () => {
      mockGenerateParts.mockRejectedValue(new Error('render failed'));
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await setLimit(user, '1');
      await clickNext(user);
      await screen.findByRole('button', { name: 'Retry' }); // step 5 auto-prepare failed

      await user.click(screen.getByRole('button', { name: 'Upload to Paperless' }));

      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(
          'error',
          'Upload to Paperless failed. Please try again.',
        ),
      );
      expect(mockUploadToPaperless).not.toHaveBeenCalled();
    });
  });

  describe('step 5 generation errors and staleness', () => {
    it('shows the generation error with a Retry that regenerates the files', async () => {
      mockGenerateParts.mockRejectedValueOnce(new Error('render failed'));
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await setLimit(user, '1');
      await clickNext(user);

      const retry = await screen.findByRole('button', { name: 'Retry' });
      await user.click(retry);

      expect(
        await screen.findByRole('button', { name: 'Download all (3 PDFs)' }),
      ).toBeInTheDocument();
      expect(mockGenerateParts).toHaveBeenCalledTimes(2);
    });

    it('editing the report content makes the files stale; "Update files" regenerates them', async () => {
      renderPage();
      const user = userEvent.setup();
      await goToStep5WithLimit(user);
      expect(mockGenerateParts).toHaveBeenCalledTimes(1);

      const table = document.querySelector('table.table') as HTMLElement;
      const usage = within(table).getByDisplayValue('Original Usage Text');
      await user.clear(usage);
      await user.type(usage, 'Edited usage');

      expect(
        await screen.findByText(
          'The report changed since the files were prepared. They are regenerated on the next preview, download or upload.',
        ),
      ).toBeInTheDocument();
      expect(mockGenerateParts).toHaveBeenCalledTimes(1); // no auto-regeneration on edit
      for (const button of screen.getAllByRole('button', { name: /^Download claim-/ })) {
        expect(button).toBeDisabled();
      }

      await user.click(screen.getByRole('button', { name: 'Update files' }));

      await waitFor(() => expect(mockGenerateParts).toHaveBeenCalledTimes(2));
      expect(
        mockGenerateParts.mock.calls[1]![0].content.rows.some((row) =>
          JSON.stringify(row).includes('Edited usage'),
        ),
      ).toBe(true);
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Update files' })).not.toBeInTheDocument(),
      );
    });
  });

  describe('preview', () => {
    it('previews part 1 first and switches parts through the file selector', async () => {
      renderPage();
      const user = userEvent.setup();
      await goToStep5WithLimit(user);
      const parts = await firstGenerated();

      await user.click(screen.getByRole('button', { name: 'Preview PDF' }));

      const select = await screen.findByRole('combobox', { name: 'File' });
      await waitFor(() => expect(mockCreatePreviewUrl).toHaveBeenCalledWith(parts.parts[0]!.blob));
      expect(
        within(select)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Part 1 of 3', 'Part 2 of 3', 'Part 3 of 3']);

      await user.selectOptions(select, 'Part 2 of 3');

      await waitFor(() => expect(mockCreatePreviewUrl).toHaveBeenCalledWith(parts.parts[1]!.blob));
      await waitFor(() => expect(select).toHaveValue('1'));
    });

    it('shows no file selector for a single-part result', async () => {
      mockGenerateParts.mockImplementation(async () => makeParts(1));
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await setLimit(user, '5');
      await clickNext(user);

      await user.click(await screen.findByRole('button', { name: 'Preview PDF' }));

      await waitFor(() => expect(mockCreatePreviewUrl).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('combobox', { name: 'File' })).not.toBeInTheDocument();
    });

    it('shows the preview error state when the parts cannot be generated', async () => {
      mockGenerateParts.mockRejectedValue(new Error('render failed'));
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await setLimit(user, '1');
      await clickNext(user);
      await screen.findByRole('button', { name: 'Retry' });

      await user.click(screen.getByRole('button', { name: 'Preview PDF' }));

      // The step-5 banner and the preview modal both report the failure.
      await waitFor(() => expect(screen.getAllByText('PDF generation failed')).toHaveLength(2));
      expect(mockCreatePreviewUrl).not.toHaveBeenCalled();
    });
  });
});

function deferredAcquire() {
  let resolve!: (value: AcquireResult) => void;
  const promise = new Promise<AcquireResult>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
