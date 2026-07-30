/**
 * Unit tests for client/src/pages/ReportWizardPage/ReportWizardPage.tsx
 *
 * Covers the step machine: source-prefill from ?sourceId=, parallel step-2 amount fetch,
 * step-3 report fetch, debounced PDF regeneration (a `useRef<NodeJS.Timeout | null>` +
 * `setTimeout`/`clearTimeout` in a `useEffect` — no `shouldRegenerate` gate, no external debounce
 * hook), the "current preview blob is always what ships" invariant, claim confirm -> success ->
 * link, 409 silent refetch + banner, finish-without-marking (its own distinct success message,
 * `sourceReports.finishedWithoutMarkingSuccess`), and Paperless upload gating.
 *
 * Error translation: both `handleMarkClaimed`'s catch-else branch and `handleUploadPaperless`'s
 * catch call `translateApiError(err.error.code, tErrors)` with a dedicated
 * `useTranslation('errors')` translator (see InvoiceDepositsSection.tsx for the same pattern);
 * non-`ApiClientError` failures fall back to the page's own `sourceReports.claimFailed` /
 * `sourceReports.uploadFailed` budget-namespace keys.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MemoryRouter } from 'react-router-dom';
import type React from 'react';
import type {
  BudgetSource,
  HouseholdSettings,
  SourceReportResponse,
  MarkClaimedResponse,
  PaperlessStatusResponse,
  ErrorCode,
} from '@cornerstone/shared';
import type * as ReportPdfIndexTypes from '../../lib/reportPdf/index.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockFetchBudgetSources = jest.fn<() => Promise<{ budgetSources: BudgetSource[] }>>();
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
}));

const mockFetchHouseholdSettings = jest.fn<() => Promise<HouseholdSettings>>();
jest.unstable_mockModule('../../lib/settingsApi.js', () => ({
  fetchHouseholdSettings: mockFetchHouseholdSettings,
}));

const mockGetSourceReport =
  jest.fn<(type: string, sourceId: string) => Promise<SourceReportResponse>>();
const mockMarkInvoicesClaimed = jest.fn<(ids: string[]) => Promise<MarkClaimedResponse>>();
jest.unstable_mockModule('../../lib/sourceReportsApi.js', () => ({
  getSourceReport: mockGetSourceReport,
  markInvoicesClaimed: mockMarkInvoicesClaimed,
}));

const mockGetPaperlessStatus = jest.fn<() => Promise<PaperlessStatusResponse>>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
}));

const mockGenerateReportPdf = jest.fn<typeof ReportPdfIndexTypes.generateReportPdf>();
const mockDownloadPdf = jest.fn<typeof ReportPdfIndexTypes.downloadPdf>();
const mockCreatePreviewUrl = jest
  .fn<typeof ReportPdfIndexTypes.createPreviewUrl>()
  .mockReturnValue('blob:preview-url');
const mockUploadToPaperless = jest.fn<typeof ReportPdfIndexTypes.uploadToPaperless>();
jest.unstable_mockModule('../../lib/reportPdf/index.js', () => ({
  generateReportPdf: mockGenerateReportPdf,
  downloadPdf: mockDownloadPdf,
  createPreviewUrl: mockCreatePreviewUrl,
  uploadToPaperless: mockUploadToPaperless,
}));

const mockShowToast = jest.fn();
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  useToast: () => ({ toasts: [], showToast: mockShowToast, dismissToast: jest.fn() }),
}));

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  useFormatters: () => ({
    formatCurrency: (n: number) => `€${n.toFixed(2)}`,
    formatDate: (d: string) => d,
    formatPercent: (n: number) => `${n}%`,
  }),
}));

let ReportWizardPage: React.ComponentType;

// jsdom does not implement URL.createObjectURL/revokeObjectURL — ReportWizardPage's
// preview-cleanup effect calls URL.revokeObjectURL(previewUrl) on unmount/URL change, which
// would otherwise throw "URL.revokeObjectURL is not a function" and crash the render tree.
let savedCreateObjectURL: typeof URL.createObjectURL;
let savedRevokeObjectURL: typeof URL.revokeObjectURL;

beforeEach(async () => {
  jest.clearAllMocks();
  ({ ReportWizardPage } = await import('./ReportWizardPage.js'));

  mockFetchHouseholdSettings.mockResolvedValue({ householdName: null, householdAddress: null });
  mockGetPaperlessStatus.mockResolvedValue({
    configured: false,
    reachable: false,
    error: null,
    paperlessUrl: null,
    filterTag: null,
  });
  // Report loading always triggers the initial PDF-generation effect — default every test to a
  // resolving mock so tests that don't care about PDF output aren't tripped up by it.
  mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });

  savedCreateObjectURL = URL.createObjectURL;
  savedRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn<typeof URL.createObjectURL>().mockReturnValue('blob:mock-url');
  URL.revokeObjectURL = jest.fn<typeof URL.revokeObjectURL>();
});

afterEach(() => {
  URL.createObjectURL = savedCreateObjectURL;
  URL.revokeObjectURL = savedRevokeObjectURL;
});

function renderPage(initialEntries: string[] = ['/budget/reports']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ReportWizardPage />
    </MemoryRouter>,
  );
}

function makeSource(overrides: Partial<BudgetSource> = {}): BudgetSource {
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
    ...overrides,
  };
}

function makeReport(overrides: Partial<SourceReportResponse> = {}): SourceReportResponse {
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
        documents: [],
      },
    ],
    totalAmount: 1000,
    unallocatedInvoices: [],
    generatedAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

// Step navigation is manual in ReportWizardPage: selecting a use case / source only advances
// `maxReachedStep`, not `currentStep` — the user must click "Next" explicitly at each step.
//
// The "Next" button's accessible name now correctly resolves to "Next" (see the dedicated
// "Next" button test below). This helper is pure navigation plumbing though, not an assertion
// about translated text, so it deliberately selects the primary-action button by its stable
// `btnPrimary` shared-style class rather than by name — decoupling every business-logic test
// below from label text. Exactly one `btnPrimary` button is present at a time during steps 1-3
// (the claim-confirm modal's "Confirm" button, also `btnPrimary`, is never mounted while this
// helper runs).
async function clickNext(user: ReturnType<typeof userEvent.setup>) {
  const primaryButtons = screen
    .getAllByRole('button')
    .filter((b) => b.className.includes('btnPrimary'));
  await user.click(primaryButtons[primaryButtons.length - 1]!);
}

async function goToStep3(user: ReturnType<typeof userEvent.setup>, useCaseIndex = 1) {
  await waitFor(() => screen.getByRole('radiogroup'));
  await user.click(screen.getAllByRole('radio')[useCaseIndex]!); // use case
  await clickNext(user); // step 1 -> 2
  await waitFor(() => screen.getAllByRole('radio').length > 0);
  await user.click(screen.getAllByRole('radio')[0]!); // source
  await waitFor(() => {
    const primaryButtons = screen
      .getAllByRole('button')
      .filter((b) => b.className.includes('btnPrimary'));
    expect(primaryButtons[primaryButtons.length - 1]).not.toBeDisabled();
  });
  await clickNext(user); // step 2 -> 3
  await waitFor(() => expect(screen.getByText('ACME')).toBeInTheDocument());
}

async function goToStep4(user: ReturnType<typeof userEvent.setup>, useCaseIndex = 1) {
  await goToStep3(user, useCaseIndex);
  await clickNext(user); // step 3 -> 4
}

describe('ReportWizardPage', () => {
  it('renders the use-case step without crashing while the initial fetch is pending', () => {
    mockFetchBudgetSources.mockReturnValue(new Promise(() => {}));
    expect(() => renderPage()).not.toThrow();
  });

  it('fetches budget sources, household settings, and Paperless status on mount', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });

    renderPage();

    await waitFor(() => {
      expect(mockFetchBudgetSources).toHaveBeenCalledTimes(1);
      expect(mockFetchHouseholdSettings).toHaveBeenCalledTimes(1);
      expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(1);
    });
  });

  it('renders the use-case step first, with the WizardStepper on step 1', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });
  });

  it('shows a real, translated "Next" label (not a raw i18next key) once a use case is selected', async () => {
    // FIXED, in two parts:
    // 1. The dot-vs-colon namespace-separator bug originally documented here — production now
    //    correctly calls t('common:button.next') (colon-separated, cross-namespace lookup).
    // 2. common.json's `button` object now has a `next` entry (grep confirms), so the lookup
    //    resolves to real text instead of falling back to the raw key.
    // Note the button itself is conditionally rendered — `{useCase && (<button>...</button>)}`
    // in ReportWizardPage.tsx — so it doesn't exist in the DOM at all until a use case radio
    // is selected; this test selects one before asserting on the label. Selecting a use case
    // also triggers the parallel step-2 amounts fetch, so getSourceReport must be mocked.
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    renderPage();
    await waitFor(() => screen.getByRole('radiogroup'));

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('radio')[1]!);

    // Spec-conformant expectation: a real, translated "Next" label.
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();

    // Sanity check that this isn't an isolated fix: advancing to step 2 shows a
    // correctly-translated "Back" button too (`common:button.back` already resolved before
    // this round of fixes).
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('selecting a use case fetches step-2 amounts for every budget source in parallel', async () => {
    mockFetchBudgetSources.mockResolvedValue({
      budgetSources: [makeSource({ id: 'src-1' }), makeSource({ id: 'src-2', name: 'Savings' })],
    });
    mockGetSourceReport.mockResolvedValue(makeReport({ totalAmount: 500 }));
    renderPage();

    await waitFor(() => screen.getByRole('radiogroup'));
    const user = userEvent.setup();
    const radios = screen.getAllByRole('radio');
    await user.click(radios[1]!); // "claim"

    await waitFor(() => {
      expect(mockGetSourceReport).toHaveBeenCalledWith('claim', 'src-1');
      expect(mockGetSourceReport).toHaveBeenCalledWith('claim', 'src-2');
    });
  });

  it('prefills the source from ?sourceId= (pre-selected once the use case is picked)', async () => {
    mockFetchBudgetSources.mockResolvedValue({
      budgetSources: [makeSource({ id: 'src-42', name: 'Prefilled Source' })],
    });
    mockGetSourceReport.mockResolvedValue(makeReport());
    renderPage(['/budget/reports?sourceId=src-42']);

    await waitFor(() => screen.getByRole('radiogroup'));
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('radio')[1]!); // pick a use case first
    await clickNext(user);

    await waitFor(() => {
      const sourceRadios = screen.getAllByRole('radio') as HTMLInputElement[];
      expect(sourceRadios.some((r) => r.checked && r.value === 'src-42')).toBe(true);
    });
  });

  it('fetches the report when a source is selected on step 2', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    renderPage();

    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('radiogroup'));
    await user.click(screen.getAllByRole('radio')[1]!);
    await clickNext(user);
    await waitFor(() => screen.getAllByRole('radio').length > 0);
    await user.click(screen.getAllByRole('radio')[0]!);

    await waitFor(() => {
      expect(mockGetSourceReport).toHaveBeenLastCalledWith('claim', 'src-1');
    });
  });

  it('shows the invoice list once the report loads on step 3', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    renderPage();

    const user = userEvent.setup();
    await goToStep3(user);

    expect(screen.getByText('ACME')).toBeInTheDocument();
  });

  it('generates the initial PDF preview once the report loads and step 4 is reached', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });

    renderPage();
    const user = userEvent.setup();
    await goToStep4(user);

    await waitFor(() => {
      expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1);
    });
    expect(mockCreatePreviewUrl).toHaveBeenCalledTimes(1);
  });

  it('revokes the previous preview URL before assigning a new one when regenerating (option toggle)', async () => {
    // contactAddress makes coverLetterDisabled false, so the checkbox below is togglable.
    mockFetchBudgetSources.mockResolvedValue({
      budgetSources: [makeSource({ contactAddress: '123 Bank St' })],
    });
    mockGetSourceReport.mockResolvedValue(makeReport());
    mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });
    mockCreatePreviewUrl.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');

    const savedRevoke = URL.revokeObjectURL;
    const revokeSpy = jest.fn();
    URL.revokeObjectURL = revokeSpy;

    try {
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

      // Toggle an option to trigger the debounced regenerate path (any of attachDocuments /
      // includeCoverLetter / excludedInvoiceIds changing re-triggers it — there is no
      // `shouldRegenerate` gate; regeneratePdf()'s only guard is `!report || !useCase`).
      const coverLetterCheckbox = screen.getByLabelText('Include cover letter');
      await user.click(coverLetterCheckbox);

      await waitFor(
        () => {
          expect(mockGenerateReportPdf).toHaveBeenCalledTimes(2);
        },
        { timeout: 2000 },
      );
      expect(revokeSpy).toHaveBeenCalledWith('blob:first');
    } finally {
      URL.revokeObjectURL = savedRevoke;
    }
  });

  it('claim confirm → markInvoicesClaimed success → success banner with claimedCount', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });
    mockMarkInvoicesClaimed.mockResolvedValue({
      claimedInvoiceIds: ['inv-1'],
      claimedDepositIds: [],
    });

    renderPage();
    const user = userEvent.setup();
    await goToStep4(user);
    await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
    // Claim confirm modal
    await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(mockMarkInvoicesClaimed).toHaveBeenCalledWith(['inv-1']);
    });
    await waitFor(() => {
      expect(screen.getByText(/invoice\(s\) marked as claimed/)).toBeInTheDocument();
    });
  });

  it('409 INVOICES_NOT_CLAIMABLE: closes the modal, shows a banner, and silently refetches without navigating away', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    const twoInvoiceReport = makeReport({
      invoices: [
        ...makeReport().invoices,
        {
          invoiceId: 'inv-2',
          vendorId: 'vend-2',
          vendorName: 'Beta Supplies',
          invoiceNumber: 'INV-002',
          date: '2026-01-11',
          status: 'pending',
          invoiceAmount: 500,
          allocatedAmount: 500,
          lineKind: 'invoice',
          isSplit: false,
          documents: [],
        },
      ],
    });
    mockGetSourceReport.mockResolvedValue(twoInvoiceReport);
    mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });

    const ApiClientErrorModule = await import('../../lib/apiClient.js');
    const conflictErr = new ApiClientErrorModule.ApiClientError(409, {
      code: 'INVOICES_NOT_CLAIMABLE',
      message: 'not claimable',
    });
    mockMarkInvoicesClaimed.mockRejectedValueOnce(conflictErr);

    renderPage();
    const user = userEvent.setup();
    await goToStep3(user);

    // Exclude one of the two invoices before advancing (the other stays selected, so the "Next"
    // button stays enabled), so the post-409 "reset excludedInvoiceIds to only invoices still
    // present in the refetched report" filter (which retains it, since the silently-refetched
    // report still contains both) has something to iterate over.
    await user.click(screen.getByRole('checkbox', { name: /ACME/ }));
    await clickNext(user); // step 3 -> 4
    await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
    await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      // Modal closed (Confirm button gone).
      expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    });
    // getSourceReport is called 3 times total: once per source for the step-2 amounts
    // (1 source here), once for the initial step-3 report fetch, and once more for the
    // silent 409 refetch.
    await waitFor(() => {
      expect(mockGetSourceReport).toHaveBeenCalledTimes(3);
    });
  });

  it('"Finish without marking" shows its own distinct success message, without calling markInvoicesClaimed', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });

    renderPage();
    const user = userEvent.setup();
    await goToStep4(user);
    await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Finish without marking' }));

    expect(mockMarkInvoicesClaimed).not.toHaveBeenCalled();
    // Finish-without-marking uses its own success copy (sourceReports.finishedWithoutMarkingSuccess)
    // — distinct from the "N invoice(s) marked as claimed" text shown after a real claim.
    await waitFor(() => {
      expect(
        screen.getByText('Report finished without marking invoices as claimed.'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/invoice\(s\) marked as claimed/)).not.toBeInTheDocument();
  });

  it('hides the Upload-to-Paperless action when Paperless is not configured/reachable', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetPaperlessStatus.mockResolvedValue({
      configured: false,
      reachable: false,
      error: null,
      paperlessUrl: null,
      filterTag: null,
    });
    mockGetSourceReport.mockResolvedValue(makeReport());
    mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });

    renderPage();
    const user = userEvent.setup();
    await goToStep4(user);
    await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole('button', { name: 'Upload to Paperless' })).not.toBeInTheDocument();
  });

  it('shows the Upload-to-Paperless action when configured and reachable, and uploads the current preview blob', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetPaperlessStatus.mockResolvedValue({
      configured: true,
      reachable: true,
      error: null,
      paperlessUrl: null,
      filterTag: null,
    });
    mockGetSourceReport.mockResolvedValue(makeReport());
    const previewBlob = new Blob(['pdf']);
    mockGenerateReportPdf.mockResolvedValue({ blob: previewBlob, skippedDocuments: [] });
    mockUploadToPaperless.mockResolvedValue(undefined);

    renderPage();
    const user = userEvent.setup();
    await goToStep4(user);
    await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

    const uploadBtn = screen.getByRole('button', { name: 'Upload to Paperless' });
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(mockUploadToPaperless).toHaveBeenCalledWith(previewBlob, expect.any(String));
    });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('success', 'Document uploaded to Paperless');
    });
  });

  it('a Paperless upload failure (ApiClientError) shows a translated error toast', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetPaperlessStatus.mockResolvedValue({
      configured: true,
      reachable: true,
      error: null,
      paperlessUrl: null,
      filterTag: null,
    });
    mockGetSourceReport.mockResolvedValue(makeReport());
    mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });

    const ApiClientErrorModule = await import('../../lib/apiClient.js');
    mockUploadToPaperless.mockRejectedValue(
      new ApiClientErrorModule.ApiClientError(502, {
        code: 'PAPERLESS_UNREACHABLE',
        message: 'unreachable',
      }),
    );

    renderPage();
    const user = userEvent.setup();
    await goToStep4(user);
    await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

    const uploadBtn = screen.getByRole('button', { name: 'Upload to Paperless' });
    await user.click(uploadBtn);

    // translateApiError(err.error.code, tErrors) resolves PAPERLESS_UNREACHABLE to its real
    // errors.json message.
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'error',
        'The document management system could not be reached.',
      );
    });
  });

  // ─── Error-path and navigation coverage ────────────────────────────────────

  it('shows an error banner when the initial data load fails', async () => {
    mockFetchBudgetSources.mockRejectedValue(new Error('network down'));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Failed to load report data')).toBeInTheDocument();
    });
  });

  it("defaults a source's step-2 amount to 0 when its own report fetch fails, without blocking the others", async () => {
    mockFetchBudgetSources.mockResolvedValue({
      budgetSources: [makeSource({ id: 'src-1' }), makeSource({ id: 'src-2', name: 'Savings' })],
    });
    mockGetSourceReport.mockImplementation((_type: string, sourceId: string) =>
      sourceId === 'src-1'
        ? Promise.reject(new Error('fail'))
        : Promise.resolve(makeReport({ totalAmount: 500 })),
    );
    renderPage();

    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('radiogroup'));
    await user.click(screen.getAllByRole('radio')[1]!);

    await waitFor(() => {
      expect(mockGetSourceReport).toHaveBeenCalledWith('claim', 'src-1');
      expect(mockGetSourceReport).toHaveBeenCalledWith('claim', 'src-2');
    });
    // Both sources remain selectable afterwards — the rejected source didn't block step2Loading.
    await clickNext(user);
    await waitFor(() => {
      expect(screen.getAllByRole('radio')).toHaveLength(2);
    });
  });

  it('shows an error banner and can retry the step-3 report fetch after it fails', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    let callCount = 0;
    mockGetSourceReport.mockImplementation(() => {
      callCount += 1;
      // Call 1 is the step-2 parallel amounts fetch (1 source here); call 2 is the initial
      // step-3 report fetch, which we fail; call 3+ (the retry) resolves normally.
      if (callCount === 2) return Promise.reject(new Error('boom'));
      return Promise.resolve(makeReport());
    });
    renderPage();

    const user = userEvent.setup();
    await waitFor(() => screen.getByRole('radiogroup'));
    await user.click(screen.getAllByRole('radio')[1]!);
    await clickNext(user);
    await waitFor(() => screen.getAllByRole('radio').length > 0);
    await user.click(screen.getAllByRole('radio')[0]!);
    await waitFor(() => {
      const primaryButtons = screen
        .getAllByRole('button')
        .filter((b) => b.className.includes('btnPrimary'));
      expect(primaryButtons[primaryButtons.length - 1]).not.toBeDisabled();
    });
    await clickNext(user); // step 2 -> 3, triggering the report fetch that rejects

    await waitFor(() => {
      expect(screen.getByText('Failed to load report')).toBeInTheDocument();
    });

    // The retry button's translated label is a separate, already-reported bug
    // (t('common:retry') — "retry" is also missing from common.json's top level), so select it
    // by its stable shared-style class rather than by name; it's the only `btnSecondary` button
    // rendered in this error state.
    const retryBtn = screen
      .getAllByRole('button')
      .find((b) => b.className.includes('btnSecondary'));
    await user.click(retryBtn!);

    await waitFor(() => {
      expect(screen.getByText('ACME')).toBeInTheDocument();
    });
  });

  it('shows a preview error banner when the initial PDF generation fails', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    mockGenerateReportPdf.mockRejectedValueOnce(new Error('pdf boom'));

    renderPage();
    const user = userEvent.setup();
    await goToStep4(user);

    await waitFor(() => {
      expect(screen.getAllByText('PDF generation failed').length).toBeGreaterThan(0);
    });
  });

  it('shows a preview error banner when a debounced regeneration fails', async () => {
    mockFetchBudgetSources.mockResolvedValue({
      budgetSources: [makeSource({ contactAddress: '123 Bank St' })],
    });
    mockGetSourceReport.mockResolvedValue(makeReport());
    mockGenerateReportPdf
      .mockResolvedValueOnce({ blob: new Blob(['pdf']), skippedDocuments: [] })
      .mockRejectedValueOnce(new Error('regen boom'));

    renderPage();
    const user = userEvent.setup();
    await goToStep4(user);
    await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

    const coverLetterCheckbox = screen.getByLabelText('Include cover letter');
    await user.click(coverLetterCheckbox);

    await waitFor(
      () => {
        expect(screen.getAllByText('PDF generation failed').length).toBeGreaterThan(0);
      },
      { timeout: 2000 },
    );
  });

  it('shows a translated claim error for an ApiClientError other than INVOICES_NOT_CLAIMABLE', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });

    const ApiClientErrorModule = await import('../../lib/apiClient.js');
    mockMarkInvoicesClaimed.mockRejectedValueOnce(
      new ApiClientErrorModule.ApiClientError(500, {
        code: 'TOTALLY_UNKNOWN_CODE' as ErrorCode,
        message: 'oops',
      }),
    );

    renderPage();
    const user = userEvent.setup();
    await goToStep4(user);
    await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
    await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    // translateApiError's fallback (no matching errors.json key) title-cases the code.
    await waitFor(() => {
      expect(screen.getByText('Totally Unknown Code')).toBeInTheDocument();
    });
  });

  it(
    'shows a real, translated generic error message for a non-ApiClientError claim failure ' +
      '(sourceReports.claimFailed)',
    async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });
      mockMarkInvoicesClaimed.mockRejectedValueOnce(new Error('network dropped'));

      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

      await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
      await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
      await user.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(
          screen.getByText('Marking invoices as claimed failed. Please try again.'),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText('sourceReports.claimFailed')).not.toBeInTheDocument();
    },
  );

  it('downloads the PDF with a generated filename when Download is clicked', async () => {
    mockFetchBudgetSources.mockResolvedValue({
      budgetSources: [makeSource({ name: 'Home Loan' })],
    });
    mockGetSourceReport.mockResolvedValue(makeReport());
    const blob = new Blob(['pdf']);
    mockGenerateReportPdf.mockResolvedValue({ blob, skippedDocuments: [] });

    renderPage();
    const user = userEvent.setup();
    await goToStep4(user);
    await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Download PDF' }));

    expect(mockDownloadPdf).toHaveBeenCalledWith(
      blob,
      expect.stringMatching(/^claim-home-loan-\d{4}-\d{2}-\d{2}\.pdf$/),
    );
  });

  it('navigates backward via the per-step Back buttons and the stepper nav', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });

    renderPage();
    const user = userEvent.setup();
    await goToStep4(user);
    await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

    // step4 -> step3
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByText('ACME')).toBeInTheDocument());

    // step3 -> step2
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getAllByRole('radio').length).toBeGreaterThan(0));

    // step2 -> step1
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByRole('radiogroup')).toBeInTheDocument());

    // Forward again, then jump straight back to step 1 via the stepper nav (onStepClick).
    await user.click(screen.getAllByRole('radio')[1]!);
    await clickNext(user);
    await waitFor(() => screen.getAllByRole('radio').length > 0);
    await user.click(screen.getByRole('button', { name: 'Report Type' }));
    await waitFor(() => expect(screen.getByRole('radiogroup')).toBeInTheDocument());
  });

  it('toggles individual invoice exclusion and cancels the claim confirmation modal', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });

    renderPage();
    const user = userEvent.setup();
    await goToStep3(user);

    const checkbox = screen.getByRole('checkbox', { name: /ACME/ });
    await user.click(checkbox); // exclude
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox); // re-include
    expect(checkbox).toBeChecked();

    await clickNext(user); // step3 -> step4
    await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
    await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    });
    expect(mockMarkInvoicesClaimed).not.toHaveBeenCalled();
  });

  it('shows a skipped-document note when generateReportPdf reports skipped documents', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    mockGenerateReportPdf.mockResolvedValue({
      blob: new Blob(['pdf']),
      skippedDocuments: [
        { invoiceId: 'inv-1', documentId: 'doc-1', reason: 'footnoteFetchFailed' },
      ],
    });

    renderPage();
    const user = userEvent.setup();
    await goToStep4(user);

    await waitFor(() => {
      expect(screen.getByText('Document could not be retrieved')).toBeInTheDocument();
    });
  });

  it(
    'shows a real, translated generic error message for a non-ApiClientError Paperless upload ' +
      'failure (sourceReports.uploadFailed)',
    async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetPaperlessStatus.mockResolvedValue({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });
      mockUploadToPaperless.mockRejectedValueOnce(new Error('network dropped'));

      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

      await user.click(screen.getByRole('button', { name: 'Upload to Paperless' }));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'error',
          'Upload to Paperless failed. Please try again.',
        );
      });
      expect(mockShowToast).not.toHaveBeenCalledWith('error', 'sourceReports.uploadFailed');
    },
  );

  it('selects and deselects all invoices via the list header checkbox', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });

    renderPage();
    const user = userEvent.setup();
    await goToStep3(user);

    const selectAll = screen.getByRole('checkbox', { name: 'Select all invoices' });
    const invoiceCheckbox = screen.getByRole('checkbox', { name: /ACME/ });
    expect(invoiceCheckbox).toBeChecked();

    await user.click(selectAll); // all -> none
    expect(invoiceCheckbox).not.toBeChecked();

    await user.click(selectAll); // none -> all
    expect(invoiceCheckbox).toBeChecked();
  });

  it(
    'the preview panel\'s "Retry" button re-attempts PDF generation and clears the error ' +
      'after the INITIAL PDF generation fails',
    async () => {
      // regeneratePdf()'s only guard is `if (!report || !useCase) return;` — there is no
      // `shouldRegenerate`-style gate requiring a pre-existing previewBlob — so retry works even
      // when the INITIAL generation attempt is what failed (previewBlob was never set).
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportPdf
        .mockRejectedValueOnce(new Error('pdf boom'))
        .mockResolvedValueOnce({ blob: new Blob(['pdf']), skippedDocuments: [] });

      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);
      await waitFor(() => {
        expect(screen.getAllByText('PDF generation failed').length).toBeGreaterThan(0);
      });

      // FIXED: the preview panel's retry button now resolves `t('common:button.retry')` via the
      // correct cross-namespace colon separator, and `button.retry` exists in common.json, so it
      // renders real translated text ("Retry") instead of a raw i18next key.
      await user.click(screen.getByRole('button', { name: 'Retry' }));

      // Spec-conformant expectation: retry re-attempts generation and clears the error.
      await waitFor(() => {
        expect(mockGenerateReportPdf).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(screen.queryAllByText('PDF generation failed')).toHaveLength(0);
      });
    },
  );

  it('closes the claim confirmation modal via Escape without marking anything claimed', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });

    renderPage();
    const user = userEvent.setup();
    await goToStep4(user);
    await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
    await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    });
    expect(mockMarkInvoicesClaimed).not.toHaveBeenCalled();
  });
});
