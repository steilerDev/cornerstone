/**
 * Unit tests for client/src/pages/ReportWizardPage/ReportWizardPage.tsx
 *
 * Story #1900 REWRITE. The page moved from a debounced auto-regeneration model (a PDF blob kept
 * continuously in sync with every option change) to an EDITABLE-CONTENT + ON-DEMAND generation
 * model:
 *   - Step 5 renders `ReportContentEditor` over `effectiveContent` (baselineContent with
 *     `overrides` applied via `applyOverrides`) — no PDF call happens just from reaching step 5.
 *   - `generateReportPdf` is now called ONLY when the user explicitly clicks Preview PDF,
 *     Download, or Upload to Paperless — each on-demand, from `generatePdfFromContent()`.
 *   - Mutating any upstream input (use case, source, invoice/line exclusions, document/cover-letter
 *     settings) while `overrides` is non-empty (`isDirty`) now shows a discard-confirmation modal
 *     (`guardedUpdate`) instead of silently regenerating; confirming discards overrides and applies
 *     the change, "Keep Editing" cancels the pending change entirely.
 *   - `formatters.js` and the real `reportContent/*` modules are intentionally NOT mocked here (as
 *     in the pre-#1900 file for formatters) — content-building and override-application run for
 *     real, exercising the actual page/lib integration, not a stub.
 *
 * Two DOM-vs-heading gotcha carried over from the pre-#1900 file: the wizard renders BOTH a
 * desktop stepper nav (button labels e.g. "Report Type") and a step-panel `<h2>` heading with the
 * SAME translated text at once — tests that assert step identity select the `<h2>` (via
 * `getByRole('heading', ...)`) to disambiguate from the stepper nav's own buttons.
 *
 * QA re-verification round (story #1900 fix batch): step 5's ReportContentEditor now renders BOTH
 * a desktop `<table class="table">` and a mobile card list unconditionally (CSS-only responsive —
 * see ReportContentEditor.test.tsx), so row-level queries (usage text, its reset button) match
 * twice unless scoped — see the `desktopTable()` helper below. All five previously-pinned "BUG:"
 * tests are now regression guards, reflecting fixes landed this round: the Preview PDF modal opens
 * immediately on click (before generation resolves, success or failure), Download failures now
 * show an error toast, the skip note also renders inside the PDF preview modal (in addition to the
 * page level), and the modal's Retry button is reachable — the modal body's ternary now renders
 * `modalPreviewUrl || actionError ? <ReportPdfPreview hasError={!!actionError} .../> : <p>loading</p>`,
 * so a failed generation routes into ReportPdfPreview's own `hasError` branch (with its Retry
 * button) instead of a dead-end `<FormError/>` banner. The final QA re-verification round confirmed
 * clicking Retry from inside the modal re-invokes `generatePdfFromContent()` and, on success,
 * replaces the error state with the regenerated PDF iframe.
 */
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
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
  GenerateReportContentResponse,
  AppConfigResponse,
  ErrorCode,
} from '@cornerstone/shared';
import type * as ReportPdfIndexTypes from '../../lib/reportPdf/index.js';
import { LocaleProvider } from '../../contexts/LocaleContext.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockFetchBudgetSources = jest.fn<() => Promise<{ budgetSources: BudgetSource[] }>>();
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
}));

const mockFetchHouseholdSettings = jest.fn<() => Promise<HouseholdSettings>>();
jest.unstable_mockModule('../../lib/settingsApi.js', () => ({
  fetchHouseholdSettings: mockFetchHouseholdSettings,
}));

// Story #1901: fetchConfig() is called on mount (Promise.all alongside the other init fetches) to
// determine llmEnabled. Default resolves with AI disabled — the AI-generation-specific test file
// (ReportWizardPage.aiGeneration.test.tsx) overrides this to llmEnabled: true.
const mockFetchConfig = jest.fn<() => Promise<AppConfigResponse>>();
jest.unstable_mockModule('../../lib/configApi.js', () => ({
  fetchConfig: mockFetchConfig,
}));

const mockGetSourceReport =
  jest.fn<(type: string, sourceId: string) => Promise<SourceReportResponse>>();
const mockMarkInvoicesClaimed =
  jest.fn<
    (sourceId: string, invoiceIds: string[], depositIds: string[]) => Promise<MarkClaimedResponse>
  >();
const mockGenerateReportContent =
  jest.fn<
    (body: {
      type: string;
      sourceId: string;
      language: string;
      includedInvoiceIds: string[];
      excludedLineIds?: string[];
    }) => Promise<GenerateReportContentResponse>
  >();
jest.unstable_mockModule('../../lib/sourceReportsApi.js', () => ({
  getSourceReport: mockGetSourceReport,
  markInvoicesClaimed: mockMarkInvoicesClaimed,
  generateReportContent: mockGenerateReportContent,
}));

const mockGetPaperlessStatus = jest.fn<() => Promise<PaperlessStatusResponse>>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
}));

const mockGenerateReportPdf = jest.fn<typeof ReportPdfIndexTypes.generateReportPdf>();
const mockDownloadPdf = jest.fn<typeof ReportPdfIndexTypes.downloadPdf>();
let previewUrlCallCount = 0;
const mockCreatePreviewUrl = jest
  .fn<typeof ReportPdfIndexTypes.createPreviewUrl>()
  .mockImplementation(() => `blob:preview-url-${++previewUrlCallCount}`);
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

// formatters.js and lib/reportContent/* are intentionally NOT mocked: production builds
// baselineContent/effectiveContent via the real buildReportContent/applyOverrides + real
// createFormatters(...), and these tests exercise that real integration end-to-end rather than a
// stub.

let ReportWizardPage: React.ComponentType;

// jsdom does not implement URL.createObjectURL/revokeObjectURL — ReportWizardPage's modal-preview
// cleanup calls URL.revokeObjectURL on close/unmount, which would otherwise throw and crash the
// render tree.
let savedCreateObjectURL: typeof URL.createObjectURL;
let savedRevokeObjectURL: typeof URL.revokeObjectURL;

beforeEach(async () => {
  jest.clearAllMocks();
  previewUrlCallCount = 0;
  mockCreatePreviewUrl.mockImplementation(() => `blob:preview-url-${++previewUrlCallCount}`);
  ({ ReportWizardPage } = await import('./ReportWizardPage.js'));

  mockFetchConfig.mockResolvedValue({
    currency: 'EUR',
    vatRate: 0.19,
    autoItemizeEnabled: false,
    llmEnabled: false,
  });
  mockFetchHouseholdSettings.mockResolvedValue({ householdName: null, householdAddress: null });
  mockGetPaperlessStatus.mockResolvedValue({
    configured: false,
    reachable: false,
    error: null,
    paperlessUrl: null,
    filterTag: null,
  });
  // No PDF generation happens automatically anymore, but default every test to a resolving mock
  // so tests that explicitly trigger a generation aren't tripped up by an unhandled rejection.
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
    <LocaleProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <ReportWizardPage />
      </MemoryRouter>
    </LocaleProvider>,
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
        budgetLines: [
          {
            id: 'bl-1',
            description: 'Original Usage Text',
            allocatedPortion: 0,
            linkedItem: null,
          },
        ],
        deposits: [],
      },
    ],
    totalAmount: 1000,
    unallocatedInvoices: [],
    generatedAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

// Step navigation is manual: selecting a use case / source only advances `maxReachedStep`, not
// `currentStep` — the user must click "Next" explicitly at each step. `clickNext` selects the
// primary-action button by its stable `btnPrimary` shared-style class rather than by name,
// decoupling navigation from label text (exactly one `btnPrimary` button is present at a time
// during steps 1-3; the claim-confirm/discard modals' own `btnPrimary` buttons are never mounted
// while this helper runs in the tests below that use it purely for forward navigation).
async function clickNext(user: ReturnType<typeof userEvent.setup>) {
  const primaryButtons = screen
    .getAllByRole('button')
    .filter((b) => b.className.includes('btnPrimary'));
  await user.click(primaryButtons[primaryButtons.length - 1]!);
}

// Step 5's ReportContentEditor renders BOTH a desktop <table class="table"> and a mobile card
// list unconditionally (CSS-only responsive breakpoint — see ReportContentEditor.test.tsx). Both
// trees mirror the same row content/overrides, so `screen.getByDisplayValue`/`getByText` queries
// for row-level fields (usage text, its reset button) match twice unless scoped. Scope to the
// desktop table for all row-level step-5 interactions; edits made through either tree are
// equivalent since both are driven by the same lifted `overrides` state.
function desktopTable(): HTMLElement {
  return document.querySelector('table.table') as HTMLElement;
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
  await clickNext(user); // step 3 -> 4 (Settings: language + document options)
}

async function goToStep5(user: ReturnType<typeof userEvent.setup>, useCaseIndex = 1) {
  await goToStep4(user, useCaseIndex);
  await clickNext(user); // step 4 -> 5
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

  it('shows a real, translated "Next" label once a use case is selected', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    renderPage();
    await waitFor(() => screen.getByRole('radiogroup'));

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('radio')[1]!);
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
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

  it('prefills the source from ?sourceId= and carries through to a loaded step-3 report', async () => {
    mockFetchBudgetSources.mockResolvedValue({
      budgetSources: [makeSource({ id: 'src-42', name: 'Prefilled Source' })],
    });
    mockGetSourceReport.mockResolvedValue(makeReport());
    renderPage(['/budget/reports?sourceId=src-42']);

    await waitFor(() => screen.getByRole('radiogroup'));
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('radio')[1]!);
    await clickNext(user);

    await waitFor(() => {
      const sourceRadios = screen.getAllByRole('radio') as HTMLInputElement[];
      expect(sourceRadios.some((r) => r.checked && r.value === 'src-42')).toBe(true);
    });
    await clickNext(user);
    await waitFor(() => {
      expect(mockGetSourceReport).toHaveBeenCalledWith('claim', 'src-42');
    });
    await waitFor(() => expect(screen.getByText('ACME')).toBeInTheDocument());
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
    await clickNext(user);

    await waitFor(() => {
      expect(screen.getByText('Failed to load report')).toBeInTheDocument();
    });
    const retryBtn = screen
      .getAllByRole('button')
      .find((b) => b.className.includes('btnSecondary'));
    await user.click(retryBtn!);
    await waitFor(() => {
      expect(screen.getByText('ACME')).toBeInTheDocument();
    });
  });

  // ─── 5-step wizard structure (Story #1899, unaffected by #1900) ────────────

  describe('5-step wizard structure', () => {
    it('renders exactly 5 items in the desktop stepper nav', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      renderPage();
      await waitFor(() => screen.getByRole('radiogroup'));
      const stepperNav = screen.getByRole('navigation', { name: 'Report wizard steps' });
      expect(within(stepperNav).getAllByRole('listitem')).toHaveLength(5);
    });

    it('shows "Step 5 of 5" in the mobile stepper on the Preview & Export step', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);
      expect(screen.getByText('Step 5 of 5')).toBeInTheDocument();
    });

    it('the Settings step (4) shows the language radios and toggles, but no download/claim/preview UI', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);

      expect(screen.getByRole('radio', { name: 'English' })).toBeInTheDocument();
      expect(screen.getByLabelText('Include cover letter')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument();
      expect(document.querySelector('iframe')).not.toBeInTheDocument();
    });
  });

  // ─── Story #1900: no PDF call on step-5 arrival; content editor renders baseline ──────────────

  describe('Step 5 arrival: no PDF generation until an explicit action (Story #1900)', () => {
    it('reaching step 5 does NOT call generateReportPdf', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      expect(mockGenerateReportPdf).not.toHaveBeenCalled();
    });

    it('never opens the PDF preview modal (no iframe) just from reaching step 5', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      expect(document.querySelector('iframe')).not.toBeInTheDocument();
    });

    it("renders the ReportContentEditor with the baseline usage text for the report's invoice", async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      expect(within(desktopTable()).getByDisplayValue('Original Usage Text')).toBeInTheDocument();
    });

    it('renders the editable content table heading (tableHeading) as an h3', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      expect(screen.getByRole('heading', { level: 3, name: 'Report Table' })).toBeInTheDocument();
    });
  });

  // ─── Story #1900: editing content, isDirty, reset, discard-confirm ────────────────────────────

  describe('editable content: overrides, isDirty, per-field reset (Story #1900)', () => {
    it('editing the usage field shows an edited indicator and does not call generateReportPdf', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Edited Usage Text' } });

      expect(within(desktopTable()).getByDisplayValue('Edited Usage Text')).toBeInTheDocument();
      expect(
        within(desktopTable()).getByRole('button', { name: 'Reset Usage to generated text' }),
      ).toBeInTheDocument();
      expect(mockGenerateReportPdf).not.toHaveBeenCalled();
    });

    it('clicking the per-field reset button reverts the field to its baseline value and removes the edited indicator', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Edited Usage Text' } });
      await user.click(
        within(desktopTable()).getByRole('button', { name: 'Reset Usage to generated text' }),
      );

      expect(within(desktopTable()).getByDisplayValue('Original Usage Text')).toBeInTheDocument();
      expect(
        screen.queryAllByRole('button', { name: 'Reset Usage to generated text' }),
      ).toHaveLength(0);
    });

    it('does NOT show the discard-confirmation modal for an upstream change when there are no edits (isDirty false)', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      // Back to step 3, toggle exclusion — no prior edits exist, so no discard modal.
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await waitFor(() => expect(screen.getByText('ACME')).toBeInTheDocument());
      await user.click(screen.getByRole('checkbox', { name: /ACME/ }));

      expect(screen.queryByText('Discard your edits?')).not.toBeInTheDocument();
    });

    it('shows the discard-confirmation modal for an upstream change when isDirty (an override exists)', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Edited Usage Text' } });

      await user.click(screen.getByRole('button', { name: 'Back' }));
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await waitFor(() => expect(screen.getByText('ACME')).toBeInTheDocument());
      await user.click(screen.getByRole('checkbox', { name: /ACME/ }));

      expect(screen.getByText('Discard your edits?')).toBeInTheDocument();
    });

    it('"Keep Editing" cancels the pending change entirely — the guarded mutation never applies', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Edited Usage Text' } });
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await waitFor(() => expect(screen.getByText('ACME')).toBeInTheDocument());
      await user.click(screen.getByRole('checkbox', { name: /ACME/ }));

      await user.click(screen.getByRole('button', { name: 'Keep Editing' }));

      expect(screen.queryByText('Discard your edits?')).not.toBeInTheDocument();
      // The exclusion checkbox itself: still checked, since the guarded change never committed.
      expect(screen.getByRole('checkbox', { name: /ACME/ })).toBeChecked();
    });

    it('"Discard and Continue" clears overrides and applies the pending change', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Edited Usage Text' } });
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await waitFor(() => expect(screen.getByText('ACME')).toBeInTheDocument());
      await user.click(screen.getByRole('checkbox', { name: /ACME/ }));

      await user.click(screen.getByRole('button', { name: 'Discard and Continue' }));

      expect(screen.queryByText('Discard your edits?')).not.toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /ACME/ })).not.toBeChecked();

      // Re-include the invoice (the discarded change excluded the report's only invoice, which
      // disables step 3's Next button) so navigation back to step 5 is possible again.
      await user.click(screen.getByRole('checkbox', { name: /ACME/ }));

      // Overrides were cleared: navigating back to step 5 shows the baseline value again, not the
      // discarded edit.
      await clickNext(user);
      await waitFor(() => expect(mockGenerateReportPdf).not.toHaveBeenCalled());
      await clickNext(user);
      await clickNext(user);
      expect(within(desktopTable()).getByDisplayValue('Original Usage Text')).toBeInTheDocument();
    });

    it('guardedUpdate also covers use-case selection (step 1) — shows the discard modal when dirty', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Edited Usage Text' } });

      // Jump back to step 1 via the stepper nav.
      await user.click(screen.getByRole('button', { name: 'Report Type' }));
      await waitFor(() => screen.getByRole('radiogroup'));
      await user.click(screen.getAllByRole('radio')[0]!); // pick a different use case

      expect(screen.getByText('Discard your edits?')).toBeInTheDocument();
    });

    it('guardedUpdate covers toggling attachDocuments and includeCoverLetter on step 4', async () => {
      mockFetchBudgetSources.mockResolvedValue({
        budgetSources: [makeSource({ contactAddress: '123 Bank St' })],
      });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Edited Usage Text' } });

      await user.click(screen.getByRole('button', { name: 'Back' }));
      await user.click(screen.getByLabelText('Include cover letter'));

      expect(screen.getByText('Discard your edits?')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Discard and Continue' }));
      expect(screen.getByLabelText('Include cover letter')).toBeChecked();
    });

    it('guardedUpdate covers toggling attachDocuments specifically on step 4', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Edited Usage Text' } });

      await user.click(screen.getByRole('button', { name: 'Back' }));
      expect(screen.getByLabelText('Attach invoice PDFs')).toBeChecked();
      await user.click(screen.getByLabelText('Attach invoice PDFs'));

      expect(screen.getByText('Discard your edits?')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Discard and Continue' }));
      expect(screen.getByLabelText('Attach invoice PDFs')).not.toBeChecked();
    });

    it('guardedUpdate also covers changing the report language on step 4 when dirty', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Edited Usage Text' } });

      await user.click(screen.getByRole('button', { name: 'Back' }));
      expect(screen.getByLabelText('English')).toBeChecked();
      await user.click(screen.getByLabelText('Deutsch'));

      expect(screen.getByText('Discard your edits?')).toBeInTheDocument();
      // The radio itself: still on the prior selection, since the guarded change never committed.
      expect(screen.getByLabelText('English')).toBeChecked();

      await user.click(screen.getByRole('button', { name: 'Discard and Continue' }));
      expect(screen.getByLabelText('Deutsch')).toBeChecked();
    });

    it('closing the discard-confirmation modal without choosing an option (Escape) leaves the pending change uncommitted', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Edited Usage Text' } });
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await waitFor(() => expect(screen.getByText('ACME')).toBeInTheDocument());
      await user.click(screen.getByRole('checkbox', { name: /ACME/ }));

      await user.keyboard('{Escape}');

      expect(screen.queryByText('Discard your edits?')).not.toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /ACME/ })).toBeChecked();
    });

    it("re-including a previously-excluded budget line reverts excludedLineIds (onToggleLine's else branch)", async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(
        makeReport({
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
              budgetLines: [
                {
                  id: 'line-1',
                  description: 'Foundation work',
                  allocatedPortion: 600,
                  linkedItem: null,
                },
              ],
              deposits: [],
            },
          ],
        }),
      );
      renderPage();
      const user = userEvent.setup();
      await goToStep3(user);

      const expandButton = document.querySelector(
        '[aria-controls="invoice-expand-inv-1"]',
      ) as HTMLElement;
      await user.click(expandButton);
      const excludeCheckbox = screen.getAllByRole('checkbox', {
        name: 'Exclude Foundation work from report',
      })[0]!;
      await user.click(excludeCheckbox); // exclude
      await user.click(excludeCheckbox); // re-include

      await clickNext(user);
      await clickNext(user);
      await user.click(screen.getByRole('button', { name: 'Download PDF' }));

      await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));
      const effectiveContent = mockGenerateReportPdf.mock.calls[0]![2];
      expect(effectiveContent.rows[0]!.allocatedAmountValueText).toContain('1,000');
    });
  });

  // ─── Story #1900: on-demand generation — Preview PDF ───────────────────────────────────────────

  describe('on-demand generation: Preview PDF (Story #1900)', () => {
    it('clicking Preview PDF calls generateReportPdf exactly once, with the effective content and options', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Preview PDF' }));

      await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));
      const callArgs = mockGenerateReportPdf.mock.calls[0]!;
      expect(callArgs[0]).toEqual(expect.objectContaining({ type: 'claim' })); // report
      expect(callArgs[1]).toEqual(new Set(['inv-1'])); // includedInvoiceIds
      expect(callArgs[2]).toEqual(expect.objectContaining({ isOverview: false })); // effectiveContent
      expect(callArgs[3]).toEqual({ attachDocuments: true }); // default attachDocuments
    });

    it('opens the PDF preview modal and renders an iframe once generation succeeds', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Preview PDF' }));

      await waitFor(() => expect(document.querySelector('iframe')).toBeInTheDocument());
      expect(screen.getByText('PDF Preview')).toBeInTheDocument();
    });

    it('opens the PDF preview modal IMMEDIATELY on click, showing a loading state before generation resolves (regression guard — previously the modal only opened after a successful generation)', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      let resolveGeneration!: (value: { blob: Blob; skippedDocuments: never[] }) => void;
      mockGenerateReportPdf.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveGeneration = resolve;
        }),
      );
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Preview PDF' }));

      // Modal is open BEFORE generation resolves: shows the loading text, no iframe yet.
      expect(screen.getByRole('dialog', { name: 'PDF Preview' })).toBeInTheDocument();
      expect(screen.getByText('Generating preview…')).toBeInTheDocument();
      expect(document.querySelector('iframe')).not.toBeInTheDocument();

      resolveGeneration({ blob: new Blob(['pdf']), skippedDocuments: [] });
      await waitFor(() => expect(document.querySelector('iframe')).toBeInTheDocument());
      expect(screen.queryByText('Generating preview…')).not.toBeInTheDocument();
    });

    it("an edited (overridden) field's value is included in the effectiveContent passed to generateReportPdf", async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Edited Usage Text' } });
      await user.click(screen.getByRole('button', { name: 'Preview PDF' }));

      await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));
      const effectiveContent = mockGenerateReportPdf.mock.calls[0]![2];
      expect(effectiveContent.rows[0]!.usageText).toBe('Edited Usage Text');
    });

    it('closing the modal revokes the created blob URL and clears the iframe', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Preview PDF' }));
      await waitFor(() => expect(document.querySelector('iframe')).toBeInTheDocument());

      const closeBtn = screen.getByRole('button', { name: /close/i });
      await user.click(closeBtn);

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-url-1');
      expect(document.querySelector('iframe')).not.toBeInTheDocument();
    });

    it('previewing a second time (without closing the modal first) revokes the FIRST modal URL before assigning the new one', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Preview PDF' }));
      await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(document.querySelector('iframe')).toHaveAttribute('src', 'blob:preview-url-1'),
      );

      await user.click(screen.getByRole('button', { name: 'Preview PDF' }));
      await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(2));

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-url-1');
      await waitFor(() =>
        expect(document.querySelector('iframe')).toHaveAttribute('src', 'blob:preview-url-2'),
      );
    });

    it(
      'a Preview PDF failure opens the modal and shows an error state inside it (regression guard ' +
        '— previously handlePreviewPdf only called setShowPdfPreviewModal(true) on the SUCCESS ' +
        'path, so a failure left the modal closed with no feedback; the modal now opens ' +
        'immediately on click, before generation resolves either way).',
      async () => {
        mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
        mockGetSourceReport.mockResolvedValue(makeReport());
        mockGenerateReportPdf.mockRejectedValueOnce(new Error('pdf boom'));
        renderPage();
        const user = userEvent.setup();
        await goToStep5(user);

        const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
        fireEvent.change(usageInput, { target: { value: 'Edited Usage Text' } });
        await user.click(screen.getByRole('button', { name: 'Preview PDF' }));

        await waitFor(() => {
          expect(screen.getByRole('dialog', { name: 'PDF Preview' })).toBeInTheDocument();
        });
        expect(screen.getByText('PDF generation failed')).toBeInTheDocument();
        // The edit itself survives the failed generation attempt — overrides are never cleared by
        // a failed generatePdfFromContent() call.
        expect(within(desktopTable()).getByDisplayValue('Edited Usage Text')).toBeInTheDocument();
      },
    );

    it('a failed generatePdfFromContent() call never clears existing overrides (edit-preservation half of the bug above, independently verified)', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportPdf.mockRejectedValueOnce(new Error('pdf boom'));
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Edited Usage Text' } });
      await user.click(screen.getByRole('button', { name: 'Preview PDF' }));

      await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));
      expect(within(desktopTable()).getByDisplayValue('Edited Usage Text')).toBeInTheDocument();
    });

    it(
      'clicking Retry inside the failed-preview modal re-generates the PDF (regression guard — ' +
        "previously ReportWizardPage.tsx's modal body was `actionError ? <FormError/> : " +
        'modalPreviewUrl ? <ReportPdfPreview .../> : <p>loading</p>`, so every actionError-truthy ' +
        'case rendered a static <FormError> banner with no way to retry from inside the modal, and ' +
        "ReportPdfPreview's own hasError/Retry branch was unreachable dead code. The modal body now " +
        'renders `modalPreviewUrl || actionError ? <ReportPdfPreview hasError={!!actionError} ' +
        'onRetry={handlePreviewPdf} .../> : <p>loading</p>`, so a failed generation reaches ' +
        "ReportPdfPreview's Retry button, which re-invokes handlePreviewPdf and, on success, " +
        'replaces the error state with the regenerated PDF iframe).',
      async () => {
        mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
        mockGetSourceReport.mockResolvedValue(makeReport());
        mockGenerateReportPdf
          .mockRejectedValueOnce(new Error('pdf boom'))
          .mockResolvedValueOnce({ blob: new Blob(['pdf']), skippedDocuments: [] });
        renderPage();
        const user = userEvent.setup();
        await goToStep5(user);

        await user.click(screen.getByRole('button', { name: 'Preview PDF' }));
        await waitFor(() => expect(screen.getByText('PDF generation failed')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: 'Retry' }));

        await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(document.querySelector('iframe')).toBeInTheDocument());
      },
    );
  });

  // ─── Story #1900: on-demand generation — Download ──────────────────────────────────────────────

  describe('on-demand generation: Download (Story #1900)', () => {
    it('clicking Download generates on-demand and downloads with a generated filename', async () => {
      mockFetchBudgetSources.mockResolvedValue({
        budgetSources: [makeSource({ name: 'Home Loan' })],
      });
      mockGetSourceReport.mockResolvedValue(makeReport());
      const blob = new Blob(['pdf']);
      mockGenerateReportPdf.mockResolvedValue({ blob, skippedDocuments: [] });

      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      expect(mockGenerateReportPdf).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Download PDF' }));

      // Assert the final (post-await) effect directly rather than splitting across two waitFor
      // calls — mockGenerateReportPdf being called does not guarantee handleDownload's `await
      // generatePdfFromContent()` continuation (which calls downloadPdf) has already run.
      await waitFor(() => {
        expect(mockDownloadPdf).toHaveBeenCalledWith(
          blob,
          expect.stringMatching(/^claim-home-loan-\d{4}-\d{2}-\d{2}\.pdf$/),
        );
      });
    });

    it('does not open the PDF preview modal when downloading', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Download PDF' }));
      await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

      expect(document.querySelector('iframe')).not.toBeInTheDocument();
    });

    it('a Download failure shows an error toast (sourceReports.downloadFailed), does not throw, and preserves edits', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportPdf.mockRejectedValueOnce(new Error('boom'));
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Edited Usage Text' } });

      await user.click(screen.getByRole('button', { name: 'Download PDF' }));
      await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));

      // Regression guard: handleDownload's catch/`!result` branch now calls
      // showToast('error', t('sourceReports.downloadFailed')) — previously this failure path gave
      // the user NO feedback at all.
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'error',
          'Failed to generate the PDF for download.',
        );
      });
      expect(mockDownloadPdf).not.toHaveBeenCalled();
      expect(document.querySelector('iframe')).not.toBeInTheDocument();
      expect(within(desktopTable()).getByDisplayValue('Edited Usage Text')).toBeInTheDocument();
    });
  });

  // ─── Story #1900: on-demand generation — Paperless upload ──────────────────────────────────────

  describe('on-demand generation: Upload to Paperless (Story #1900)', () => {
    it('shows the Upload-to-Paperless action when configured/reachable and uploads on-demand', async () => {
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
      await goToStep5(user);

      expect(mockGenerateReportPdf).not.toHaveBeenCalled();
      const uploadBtn = screen.getByRole('button', { name: 'Upload to Paperless' });
      await user.click(uploadBtn);

      await waitFor(() => {
        expect(mockUploadToPaperless).toHaveBeenCalledWith(previewBlob, expect.any(String));
      });
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('success', 'Document uploaded to Paperless');
      });
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
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      expect(screen.queryByRole('button', { name: 'Upload to Paperless' })).not.toBeInTheDocument();
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
      const ApiClientErrorModule = await import('../../lib/apiClient.js');
      mockUploadToPaperless.mockRejectedValue(
        new ApiClientErrorModule.ApiClientError(502, {
          code: 'PAPERLESS_UNREACHABLE',
          message: 'unreachable',
        }),
      );

      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Upload to Paperless' }));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'error',
          'The document management system could not be reached.',
        );
      });
    });

    it('a generic (non-ApiClientError) Paperless upload failure shows the generic uploadFailed message', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetPaperlessStatus.mockResolvedValue({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockUploadToPaperless.mockRejectedValueOnce(new Error('network dropped'));

      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);
      await user.click(screen.getByRole('button', { name: 'Upload to Paperless' }));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'error',
          'Upload to Paperless failed. Please try again.',
        );
      });
    });

    it('a generation failure during Paperless upload shows an error toast instead of uploading', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetPaperlessStatus.mockResolvedValue({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportPdf.mockRejectedValueOnce(new Error('boom'));

      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);
      await user.click(screen.getByRole('button', { name: 'Upload to Paperless' }));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'error',
          'Upload to Paperless failed. Please try again.',
        );
      });
      expect(mockUploadToPaperless).not.toHaveBeenCalled();
    });
  });

  // ─── Story #1900: skipped-document notes (rendered at BOTH the page level and inside the modal) ─

  describe('skipped-document notes (Story #1900)', () => {
    it('shows a skipped-document note (vendor/invoice-number attribution) below the content editor after a generation reports skips', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportPdf.mockResolvedValue({
        blob: new Blob(['pdf']),
        skippedDocuments: [
          {
            invoiceId: 'inv-1',
            documentId: 'doc-1',
            reason: 'footnoteFetchFailed',
            vendorName: 'ACME',
            invoiceNumber: 'INV-001',
          },
        ],
      });

      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);
      await user.click(screen.getByRole('button', { name: 'Preview PDF' }));

      // The note is now rendered TWICE — once below the content editor at the page level, once
      // inside the PDF preview modal (see the modal-scoped test below). Confirm a page-level
      // instance specifically exists, i.e. one outside the modal dialog.
      await waitFor(() => {
        expect(
          screen.getAllByText('ACME (INV-001) — Document could not be retrieved').length,
        ).toBeGreaterThanOrEqual(1);
      });
      const dialog = screen.getByRole('dialog', { name: 'PDF Preview' });
      const pageLevelNote = screen
        .getAllByText('ACME (INV-001) — Document could not be retrieved')
        .find((el) => !dialog.contains(el));
      expect(pageLevelNote).toBeTruthy();
    });

    it(
      'the skip note also renders INSIDE the PDF preview modal (regression guard — previously ' +
        'the skip note was specced to render both at the page level and inside the modal, but the ' +
        'actual JSX only rendered it at the page level).',
      async () => {
        mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
        mockGetSourceReport.mockResolvedValue(makeReport());
        mockGenerateReportPdf.mockResolvedValue({
          blob: new Blob(['pdf']),
          skippedDocuments: [
            {
              invoiceId: 'inv-1',
              documentId: 'doc-1',
              reason: 'footnoteFetchFailed',
              vendorName: 'ACME',
              invoiceNumber: 'INV-001',
            },
          ],
        });

        renderPage();
        const user = userEvent.setup();
        await goToStep5(user);
        await user.click(screen.getByRole('button', { name: 'Preview PDF' }));
        await waitFor(() => expect(document.querySelector('iframe')).toBeInTheDocument());

        const modal = screen.getByRole('dialog', { name: 'PDF Preview' });
        expect(
          within(modal).getByText('ACME (INV-001) — Document could not be retrieved'),
        ).toBeInTheDocument();
      },
    );
  });

  // ─── Mark Claimed (unchanged behavior per spec) ────────────────────────────────────────────────

  describe('Mark Claimed (unchanged behavior)', () => {
    it('claim confirm → markInvoicesClaimed success → success banner with claimedCount', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockMarkInvoicesClaimed.mockResolvedValue({
        claimedInvoiceIds: ['inv-1'],
        claimedDepositIds: [],
      });

      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
      await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
      await user.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(mockMarkInvoicesClaimed).toHaveBeenCalledWith('src-1', ['inv-1'], []);
      });
      await waitFor(() => {
        expect(screen.getByText(/invoice\(s\) marked as claimed/)).toBeInTheDocument();
      });
      // Mark Claimed never touches the PDF-generation pipeline (no PDF step in this flow).
      expect(mockGenerateReportPdf).not.toHaveBeenCalled();
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
            budgetLines: [],
            deposits: [],
          },
        ],
      });
      mockGetSourceReport.mockResolvedValue(twoInvoiceReport);

      const ApiClientErrorModule = await import('../../lib/apiClient.js');
      const conflictErr = new ApiClientErrorModule.ApiClientError(409, {
        code: 'INVOICES_NOT_CLAIMABLE',
        message: 'not claimable',
      });
      mockMarkInvoicesClaimed.mockRejectedValueOnce(conflictErr);

      renderPage();
      const user = userEvent.setup();
      await goToStep3(user);

      await user.click(screen.getByRole('checkbox', { name: /ACME/ }));
      await clickNext(user); // step 3 -> 4
      await clickNext(user); // step 4 -> 5

      await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
      await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
      await user.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
      });
      await waitFor(() => {
        expect(mockGetSourceReport).toHaveBeenCalledTimes(3);
      });
    });

    it('409 with a matching details.invoiceIds shows the specific claimFailedWithInvoices text containing the offending invoice number', async () => {
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
            budgetLines: [],
            deposits: [],
          },
        ],
      });
      mockGetSourceReport.mockResolvedValue(twoInvoiceReport);

      const ApiClientErrorModule = await import('../../lib/apiClient.js');
      const conflictErr = new ApiClientErrorModule.ApiClientError(409, {
        code: 'INVOICES_NOT_CLAIMABLE',
        message: 'not claimable',
        details: { invoiceIds: ['inv-2'] },
      });
      mockMarkInvoicesClaimed.mockRejectedValueOnce(conflictErr);

      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
      await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
      await user.click(screen.getByRole('button', { name: 'Confirm' }));

      // INV-002 also appears as a plain table cell in the invoice list, so the full banner
      // sentence is asserted (not a bare /INV-002/ regex) to uniquely target the error banner.
      await waitFor(() => {
        expect(
          screen.getByText(
            'Could not mark as claimed: invoice(s) INV-002 are not in a claimable state.',
          ),
        ).toBeInTheDocument();
      });
    });

    it('409 with absent details falls back to the generic INVOICES_NOT_CLAIMABLE error message', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());

      const ApiClientErrorModule = await import('../../lib/apiClient.js');
      const conflictErr = new ApiClientErrorModule.ApiClientError(409, {
        code: 'INVOICES_NOT_CLAIMABLE',
        message: 'not claimable',
        // No `details` field at all — must fall back to the generic translated message.
      });
      mockMarkInvoicesClaimed.mockRejectedValueOnce(conflictErr);

      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
      await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
      await user.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(
          screen.getByText(
            'One or more invoices could not be marked as claimed. They may have already been claimed or are in an invalid state.',
          ),
        ).toBeInTheDocument();
      });
    });

    it('409 with an empty details.invoiceIds array falls back to the generic INVOICES_NOT_CLAIMABLE error message', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());

      const ApiClientErrorModule = await import('../../lib/apiClient.js');
      const conflictErr = new ApiClientErrorModule.ApiClientError(409, {
        code: 'INVOICES_NOT_CLAIMABLE',
        message: 'not claimable',
        details: { invoiceIds: [] },
      });
      mockMarkInvoicesClaimed.mockRejectedValueOnce(conflictErr);

      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
      await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
      await user.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(
          screen.getByText(
            'One or more invoices could not be marked as claimed. They may have already been claimed or are in an invalid state.',
          ),
        ).toBeInTheDocument();
      });
    });

    it('an invoice with an excluded line is omitted from invoiceIds but its non-claimed deposit is still included in depositIds', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(
        makeReport({
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
              budgetLines: [
                {
                  id: 'line-1',
                  description: 'Foundation work',
                  allocatedPortion: 600,
                  linkedItem: null,
                },
              ],
              deposits: [
                {
                  id: 'dep-1',
                  amount: 200,
                  status: 'pending',
                  entryType: 'deposit',
                  dueDate: '2026-01-01',
                  paidDate: null,
                  claimedDate: null,
                  budgetSourceId: null,
                },
              ],
            },
          ],
        }),
      );
      mockMarkInvoicesClaimed.mockResolvedValue({
        claimedInvoiceIds: [],
        claimedDepositIds: ['dep-1'],
      });

      renderPage();
      const user = userEvent.setup();
      await goToStep3(user);

      const expandButton = document.querySelector(
        '[aria-controls="invoice-expand-inv-1"]',
      ) as HTMLElement;
      await user.click(expandButton);
      await user.click(
        screen.getAllByRole('checkbox', { name: 'Exclude Foundation work from report' })[0]!,
      );

      await clickNext(user); // step 3 -> 4
      await clickNext(user); // step 4 -> 5

      await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
      await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
      await user.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        // The invoice has an excluded line, so it must not flip status (invoiceIds: []) — but its
        // still-pending deposit was NOT itself excluded at the invoice level, so it stays in
        // depositIds for the sweep.
        expect(mockMarkInvoicesClaimed).toHaveBeenCalledWith('src-1', [], ['dep-1']);
      });
    });

    it('"Finish without marking" shows its own distinct success message, without calling markInvoicesClaimed', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Finish without marking' }));

      expect(mockMarkInvoicesClaimed).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(
          screen.getByText('Report finished without marking invoices as claimed.'),
        ).toBeInTheDocument();
      });
    });

    it('shows a translated claim error for an ApiClientError other than INVOICES_NOT_CLAIMABLE', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      const ApiClientErrorModule = await import('../../lib/apiClient.js');
      mockMarkInvoicesClaimed.mockRejectedValueOnce(
        new ApiClientErrorModule.ApiClientError(500, {
          code: 'TOTALLY_UNKNOWN_CODE' as ErrorCode,
          message: 'oops',
        }),
      );

      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
      await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
      await user.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(screen.getByText('Totally Unknown Code')).toBeInTheDocument();
      });
    });

    it('shows a generic error message for a non-ApiClientError claim failure', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockMarkInvoicesClaimed.mockRejectedValueOnce(new Error('network dropped'));

      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
      await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
      await user.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(
          screen.getByText('Marking invoices as claimed failed. Please try again.'),
        ).toBeInTheDocument();
      });
    });

    it('closes the claim confirmation modal via Escape without marking anything claimed', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
      await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
      });
      expect(mockMarkInvoicesClaimed).not.toHaveBeenCalled();
    });

    it('cancels the claim confirmation modal via Cancel without marking anything claimed', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
      await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
      });
      expect(mockMarkInvoicesClaimed).not.toHaveBeenCalled();
    });
  });

  // ─── Line/invoice exclusions feed the amount-adjusted content (Story #1891, adapted for #1900) ─

  describe('invoice/line exclusions feed the effective content (Story #1891, adapted)', () => {
    function makeReportWithLines(): SourceReportResponse {
      return makeReport({
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
            budgetLines: [
              {
                id: 'line-1',
                description: 'Foundation work',
                allocatedPortion: 600,
                linkedItem: null,
              },
              { id: 'line-2', description: 'Roofing', allocatedPortion: 400, linkedItem: null },
            ],
            deposits: [],
          },
        ],
        totalAmount: 1000,
      });
    }

    it('excluding a budget line adjusts the amount passed to generateReportPdf on the next on-demand generation', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReportWithLines());

      renderPage();
      const user = userEvent.setup();
      await goToStep3(user);

      const expandButton = document.querySelector(
        '[aria-controls="invoice-expand-inv-1"]',
      ) as HTMLElement;
      await user.click(expandButton);
      const excludeCheckbox = screen.getAllByRole('checkbox', {
        name: 'Exclude Foundation work from report',
      })[0]!;
      await user.click(excludeCheckbox);

      await clickNext(user); // step 3 -> 4
      await clickNext(user); // step 4 -> 5
      await user.click(screen.getByRole('button', { name: 'Download PDF' }));

      await waitFor(() => expect(mockGenerateReportPdf).toHaveBeenCalledTimes(1));
      // The line-exclusion amount adjustment is baked into `effectiveContent` (the 3rd arg,
      // already built via applyLineExclusions inside baselineContent's own useMemo) — NOT into
      // the raw `report` object passed as the 1st arg, which merge.ts only reads for its
      // document-fetch/embed loop (never for allocatedAmount) and is intentionally left
      // unadjusted. 1000 - 600 (Foundation work) = 400.
      const effectiveContent = mockGenerateReportPdf.mock.calls[0]![2];
      expect(effectiveContent.rows[0]!.allocatedAmountValueText).toContain('400');
    });

    it('excluding the only invoice with excluded lines shows the claim-modal warning about excluded items', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReportWithLines());

      renderPage();
      const user = userEvent.setup();
      await goToStep3(user);

      const expandButton = document.querySelector(
        '[aria-controls="invoice-expand-inv-1"]',
      ) as HTMLElement;
      await user.click(expandButton);
      await user.click(
        screen.getAllByRole('checkbox', { name: 'Exclude Foundation work from report' })[0]!,
      );

      await clickNext(user); // step 3 -> 4
      await clickNext(user); // step 4 -> 5
      await user.click(screen.getByRole('button', { name: /Mark [0-9]+ invoices as claimed/ }));
      await waitFor(() => screen.getByRole('button', { name: 'Confirm' }));

      const warning = screen.getByRole('alert');
      expect(warning).toHaveTextContent(
        '1 invoice(s) have excluded line items and will keep their current claim status',
      );
    });

    it('excluding the sole invoice at the invoice level disables the step-3 Next button (cannot reach step 5)', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());

      renderPage();
      const user = userEvent.setup();
      await goToStep3(user);

      await user.click(screen.getByRole('checkbox', { name: /ACME/ }));

      const nextButtons = screen
        .getAllByRole('button')
        .filter((b) => b.className.includes('btnPrimary'));
      expect(nextButtons[nextButtons.length - 1]).toBeDisabled();
    });

    it('selects and deselects all invoices via the list header checkbox', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep3(user);

      const selectAll = screen.getByRole('checkbox', { name: 'Select all invoices' });
      const invoiceCheckbox = screen.getByRole('checkbox', { name: /ACME/ });
      expect(invoiceCheckbox).toBeChecked();

      await user.click(selectAll);
      expect(invoiceCheckbox).not.toBeChecked();
      await user.click(selectAll);
      expect(invoiceCheckbox).toBeChecked();
    });
  });

  // ─── Navigation ─────────────────────────────────────────────────────────────

  it('navigates backward via the per-step Back buttons and the stepper nav', async () => {
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
    mockGetSourceReport.mockResolvedValue(makeReport());
    renderPage();
    const user = userEvent.setup();
    await goToStep5(user);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'English' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByText('ACME')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getAllByRole('radio').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByRole('radiogroup')).toBeInTheDocument());

    await user.click(screen.getAllByRole('radio')[1]!);
    await clickNext(user);
    await waitFor(() => screen.getAllByRole('radio').length > 0);
    await user.click(screen.getByRole('button', { name: 'Report Type' }));
    await waitFor(() => expect(screen.getByRole('radiogroup')).toBeInTheDocument());
  });
});
