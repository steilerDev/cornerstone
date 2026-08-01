/**
 * Unit tests for the AI-generation feature added to ReportWizardPage.tsx (Story #1901).
 *
 * Split out from ReportWizardPage.test.tsx (which stays focused on the #1900 editable-content
 * baseline) to keep both files a manageable size. Uses the same mock-module setup and
 * real-formatters/real-reportContent-integration strategy as the sibling file — see its header
 * comment for the two-DOM-tree (desktop table + mobile card list) and `desktopTable()` scoping
 * rationale, both of which apply identically here.
 *
 * Covers: the AI toggle's dependence on llmEnabled (from fetchConfig) and the wizard's own
 * aiEnabled state; the "Generate with AI" button only being offered when both are true; no
 * generation on mount; a single batched call per click with the correct request shape; the
 * fake-timer elapsed-seconds counter; generated text becoming a new BASELINE (no edited
 * indicator) rather than an override; per-field reset after a further manual edit falling back to
 * the AI baseline (not the pre-AI derived text); the overwrite-confirmation modal gating
 * regeneration only when manual overrides exist; guardedUpdate clearing aiContent on a
 * confirmed step 1-4 change; and the error path preserving existing content and allowing retry.
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
  MarkClaimedResponse,
  PaperlessStatusResponse,
  AppConfigResponse,
  GenerateReportContentRequest,
  GenerateReportContentResponse,
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

const mockFetchConfig = jest.fn<() => Promise<AppConfigResponse>>();
jest.unstable_mockModule('../../lib/configApi.js', () => ({
  fetchConfig: mockFetchConfig,
}));

const mockGetSourceReport =
  jest.fn<(type: string, sourceId: string) => Promise<SourceReportResponse>>();
const mockMarkInvoicesClaimed = jest.fn<(ids: string[]) => Promise<MarkClaimedResponse>>();
const mockGenerateReportContent =
  jest.fn<(body: GenerateReportContentRequest) => Promise<GenerateReportContentResponse>>();
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

// formatters.js and lib/reportContent/* are intentionally NOT mocked, same rationale as
// ReportWizardPage.test.tsx: these tests exercise the real baseline/override/AI-overlay
// integration, not a stub.

let ReportWizardPage: React.ComponentType;

let savedCreateObjectURL: typeof URL.createObjectURL;
let savedRevokeObjectURL: typeof URL.revokeObjectURL;

beforeEach(async () => {
  jest.clearAllMocks();
  ({ ReportWizardPage } = await import('./ReportWizardPage.js'));

  mockFetchConfig.mockResolvedValue({
    currency: 'EUR',
    vatRate: 0.19,
    autoItemizeEnabled: true,
    llmEnabled: true,
  });
  mockFetchHouseholdSettings.mockResolvedValue({ householdName: null, householdAddress: null });
  mockGetPaperlessStatus.mockResolvedValue({
    configured: false,
    reachable: false,
    error: null,
    paperlessUrl: null,
    filterTag: null,
  });
  mockGenerateReportPdf.mockResolvedValue({ blob: new Blob(['pdf']), skippedDocuments: [] });

  savedCreateObjectURL = URL.createObjectURL;
  savedRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn<typeof URL.createObjectURL>().mockReturnValue('blob:mock-url');
  URL.revokeObjectURL = jest.fn<typeof URL.revokeObjectURL>();
});

afterEach(() => {
  URL.createObjectURL = savedCreateObjectURL;
  URL.revokeObjectURL = savedRevokeObjectURL;
  // Unconditional — a no-op when real timers are already active. Any test that opts into fake
  // timers (the elapsed-seconds counter test) must not leak them into subsequent tests, which
  // would otherwise break every later renderPage() in this file (effects/promises silently never
  // flush, and the page renders nothing).
  jest.useRealTimers();
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

function defaultAiResult(
  overrides: Partial<GenerateReportContentResponse> = {},
): GenerateReportContentResponse {
  return {
    letterSubject: 'AI Subject',
    letterBody: 'AI Body',
    descriptions: { 'inv-1': 'AI-generated usage description' },
    ...overrides,
  };
}

async function clickNext(user: ReturnType<typeof userEvent.setup>) {
  const primaryButtons = screen
    .getAllByRole('button')
    .filter((b) => b.className.includes('btnPrimary'));
  await user.click(primaryButtons[primaryButtons.length - 1]!);
}

function desktopTable(): HTMLElement {
  return document.querySelector('table.table') as HTMLElement;
}

async function goToStep3(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => screen.getByRole('radiogroup'));
  await user.click(screen.getAllByRole('radio')[1]!); // "claim"
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

/** Navigate to step 4 and, unless `enableAi` is false, tick the "Enable AI assistance" toggle. */
async function goToStep4(user: ReturnType<typeof userEvent.setup>, enableAi = true) {
  await goToStep3(user);
  await clickNext(user); // step 3 -> 4
  if (enableAi) {
    await waitFor(() => expect(screen.getByLabelText('Enable AI assistance')).toBeInTheDocument());
    await user.click(screen.getByLabelText('Enable AI assistance'));
  }
}

async function goToStep5(user: ReturnType<typeof userEvent.setup>, enableAi = true) {
  await goToStep4(user, enableAi);
  await clickNext(user); // step 4 -> 5
}

describe('ReportWizardPage — AI generation (Story #1901)', () => {
  // ─── Availability / opt-in ─────────────────────────────────────────────────

  describe('availability and opt-in', () => {
    it('shows the "Enable AI assistance" toggle on step 4 when llmEnabled is true', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user, false);

      expect(screen.getByLabelText('Enable AI assistance')).toBeInTheDocument();
    });

    it('hides the "Enable AI assistance" toggle entirely when llmEnabled is false', async () => {
      mockFetchConfig.mockResolvedValue({
        currency: 'EUR',
        vatRate: 0.19,
        autoItemizeEnabled: false,
        llmEnabled: false,
      });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user, false);

      expect(screen.queryByLabelText('Enable AI assistance')).not.toBeInTheDocument();
    });

    it('does not offer "Generate with AI" on step 5 when the AI toggle is off', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, false); // AI toggle left off

      expect(screen.queryByRole('button', { name: 'Generate with AI' })).not.toBeInTheDocument();
    });

    it('offers "Generate with AI" on step 5 when the AI toggle is on', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      expect(screen.getByRole('button', { name: 'Generate with AI' })).toBeInTheDocument();
    });

    it('does NOT call generateReportContent automatically just from reaching step 5', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      expect(mockGenerateReportContent).not.toHaveBeenCalled();
    });
  });

  // ─── Batched generation request shape ──────────────────────────────────────

  describe('batched generation request', () => {
    it('issues exactly one generateReportContent call per click, with type/sourceId/language/includedInvoiceIds', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockResolvedValue(defaultAiResult());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));

      await waitFor(() => expect(mockGenerateReportContent).toHaveBeenCalledTimes(1));
      const call = mockGenerateReportContent.mock.calls[0]![0];
      expect(call.type).toBe('claim');
      expect(call.sourceId).toBe('src-1');
      expect(call.language).toBe('en');
      expect(call.includedInvoiceIds).toEqual(['inv-1']);
    });

    it('excludes invoices excluded on step 3 from includedInvoiceIds', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(
        makeReport({
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
        }),
      );
      mockGenerateReportContent.mockResolvedValue(defaultAiResult());
      renderPage();
      const user = userEvent.setup();

      await goToStep3(user);
      await user.click(screen.getByRole('checkbox', { name: /Beta Supplies/ }));
      await clickNext(user); // step 3 -> 4
      await user.click(screen.getByLabelText('Enable AI assistance'));
      await clickNext(user); // step 4 -> 5

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));

      await waitFor(() => expect(mockGenerateReportContent).toHaveBeenCalledTimes(1));
      const call = mockGenerateReportContent.mock.calls[0]![0];
      expect(call.includedInvoiceIds).toEqual(['inv-1']);
    });
  });

  // ─── Progress feedback ──────────────────────────────────────────────────────

  describe('progress feedback', () => {
    it('disables the "Generate with AI" button while a generation is pending', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockReturnValue(new Promise(() => {}));
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Generate with AI' })).toBeDisabled();
      });
    });

    it('shows an elapsed-seconds caption that increments with fake timers', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockReturnValue(new Promise(() => {}));
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      // Fake timers must be enabled AFTER navigation (which relies on real userEvent timing) but
      // BEFORE the click that starts the elapsed-seconds setInterval, so the interval itself is a
      // fake one that advanceTimersByTime can drive deterministically.
      jest.useFakeTimers();
      fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(screen.getByText('Generating… (3s)')).toBeInTheDocument();
    });
  });

  // ─── Generated text becomes an editable BASELINE ───────────────────────────

  describe('generated text becomes a new baseline (not an override)', () => {
    it('populates the usage field with the AI description and shows the "generated with AI" note', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockResolvedValue(defaultAiResult());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));

      await waitFor(() => {
        expect(
          within(desktopTable()).getByDisplayValue('AI-generated usage description'),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText('Content generated with AI — review before submitting.'),
      ).toBeInTheDocument();
    });

    it('shows NO per-field reset button right after generation (it is the baseline, not an override)', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockResolvedValue(defaultAiResult());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));
      await waitFor(() => {
        expect(
          within(desktopTable()).getByDisplayValue('AI-generated usage description'),
        ).toBeInTheDocument();
      });

      expect(
        within(desktopTable()).queryByRole('button', { name: 'Reset Usage to generated text' }),
      ).not.toBeInTheDocument();
    });

    it('a further manual edit on the AI-populated field shows a reset button, and resetting reverts to the AI text (not the pre-AI derived text)', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockResolvedValue(defaultAiResult());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));
      await waitFor(() => {
        expect(
          within(desktopTable()).getByDisplayValue('AI-generated usage description'),
        ).toBeInTheDocument();
      });

      const usageInput = within(desktopTable()).getByDisplayValue('AI-generated usage description');
      fireEvent.change(usageInput, { target: { value: 'Manually edited further' } });

      const resetButton = within(desktopTable()).getByRole('button', {
        name: 'Reset Usage to generated text',
      });
      expect(resetButton).toBeInTheDocument();

      await user.click(resetButton);

      expect(
        within(desktopTable()).getByDisplayValue('AI-generated usage description'),
      ).toBeInTheDocument();
      expect(
        within(desktopTable()).queryByDisplayValue('Original Usage Text'),
      ).not.toBeInTheDocument();
    });

    it('fields without generated content retain their derived baseline value (not blanked)', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      // AI result has no entry for inv-1 at all.
      mockGenerateReportContent.mockResolvedValue(
        defaultAiResult({ descriptions: {}, letterSubject: '', letterBody: '' }),
      );
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));

      await waitFor(() => expect(mockGenerateReportContent).toHaveBeenCalledTimes(1));
      expect(within(desktopTable()).getByDisplayValue('Original Usage Text')).toBeInTheDocument();
    });
  });

  // ─── Overwrite confirmation ─────────────────────────────────────────────────

  describe('overwrite confirmation', () => {
    it('shows the overwrite-confirmation modal when manual overrides exist and "Generate with AI" is clicked again', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Manual edit before any AI run' } });

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));

      expect(screen.getByText('Overwrite your edits?')).toBeInTheDocument();
      // Generation must not have started yet — it is gated behind the confirmation.
      expect(mockGenerateReportContent).not.toHaveBeenCalled();
    });

    it('does NOT show the overwrite modal when there are no manual overrides (first generation)', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockResolvedValue(defaultAiResult());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));

      expect(screen.queryByText('Overwrite your edits?')).not.toBeInTheDocument();
      await waitFor(() => expect(mockGenerateReportContent).toHaveBeenCalledTimes(1));
    });

    it('does NOT show the overwrite modal when regenerating after a PRIOR AI run with no further manual edits', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockResolvedValue(defaultAiResult());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));
      await waitFor(() => expect(mockGenerateReportContent).toHaveBeenCalledTimes(1));

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));

      expect(screen.queryByText('Overwrite your edits?')).not.toBeInTheDocument();
      await waitFor(() => expect(mockGenerateReportContent).toHaveBeenCalledTimes(2));
    });

    it('"Keep Editing" cancels the pending regeneration — overrides and displayed text survive untouched', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Manual edit to keep' } });
      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));
      await waitFor(() => expect(screen.getByText('Overwrite your edits?')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Keep Editing' }));

      expect(screen.queryByText('Overwrite your edits?')).not.toBeInTheDocument();
      expect(mockGenerateReportContent).not.toHaveBeenCalled();
      expect(within(desktopTable()).getByDisplayValue('Manual edit to keep')).toBeInTheDocument();
    });

    it('closing the overwrite-confirmation modal via Escape leaves the manual edit intact and does not generate', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Manual edit survives Escape' } });
      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));
      await waitFor(() => expect(screen.getByText('Overwrite your edits?')).toBeInTheDocument());

      await user.keyboard('{Escape}');

      expect(screen.queryByText('Overwrite your edits?')).not.toBeInTheDocument();
      expect(mockGenerateReportContent).not.toHaveBeenCalled();
      expect(
        within(desktopTable()).getByDisplayValue('Manual edit survives Escape'),
      ).toBeInTheDocument();
    });

    it('"Overwrite and Generate" discards the manual edit and runs the batched generation', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockResolvedValue(defaultAiResult());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Manual edit to discard' } });
      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));
      await waitFor(() => expect(screen.getByText('Overwrite your edits?')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Overwrite and Generate' }));

      await waitFor(() => expect(mockGenerateReportContent).toHaveBeenCalledTimes(1));
      await waitFor(() => {
        expect(
          within(desktopTable()).getByDisplayValue('AI-generated usage description'),
        ).toBeInTheDocument();
      });
    });
  });

  // ─── guardedUpdate clears aiContent on a confirmed step 1-4 change ─────────

  describe('guardedUpdate clears aiContent (Story #1900 integration)', () => {
    it('a confirmed upstream change (invoice exclusion) after an AI run clears aiContent and restores the derived baseline', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockResolvedValue(defaultAiResult());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));
      await waitFor(() => {
        expect(
          within(desktopTable()).getByDisplayValue('AI-generated usage description'),
        ).toBeInTheDocument();
      });

      // Back to step 3 and toggle the invoice — isDirty is true because aiContent is set, so the
      // discard-confirmation modal must appear even though there are no manual `overrides`.
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await waitFor(() => expect(screen.getByText('ACME')).toBeInTheDocument());
      await user.click(screen.getByRole('checkbox', { name: /ACME/ }));
      expect(screen.getByText('Discard your edits?')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Discard and Continue' }));

      // Re-include the invoice, then navigate back to step 5: the AI content is gone, and the
      // original derived baseline text is shown again.
      await user.click(screen.getByRole('checkbox', { name: /ACME/ }));
      await clickNext(user); // 3 -> 4
      await clickNext(user); // 4 -> 5
      expect(within(desktopTable()).getByDisplayValue('Original Usage Text')).toBeInTheDocument();
      expect(
        screen.queryByText('Content generated with AI — review before submitting.'),
      ).not.toBeInTheDocument();
    });
  });

  // ─── Error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('shows a translated error and preserves the existing (derived) content on a network-style failure', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockRejectedValueOnce(new Error('network dropped'));
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));

      await waitFor(() => {
        expect(screen.getByText('AI generation failed. Please try again.')).toBeInTheDocument();
      });
      // Existing (derived) content is preserved — not blanked or replaced with an error state.
      expect(within(desktopTable()).getByDisplayValue('Original Usage Text')).toBeInTheDocument();
    });

    it('allows retrying after a failure — a second click can still succeed', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(defaultAiResult());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));
      await waitFor(() => {
        expect(screen.getByText('AI generation failed. Please try again.')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));

      await waitFor(() => {
        expect(
          within(desktopTable()).getByDisplayValue('AI-generated usage description'),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText('AI generation failed. Please try again.')).not.toBeInTheDocument();
    });

    it('shows a translated LLM_NOT_CONFIGURED error via ApiClientError', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      const ApiClientErrorModule = await import('../../lib/apiClient.js');
      mockGenerateReportContent.mockRejectedValueOnce(
        new ApiClientErrorModule.ApiClientError(503, {
          code: 'LLM_NOT_CONFIGURED',
          message: 'not configured',
        }),
      );
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));

      await waitFor(() => {
        expect(
          screen.getByText('AI assistance is not configured on this server.'),
        ).toBeInTheDocument();
      });
    });

    it('clears a prior error banner once a subsequent generation succeeds', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(defaultAiResult());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user, true);

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));
      await waitFor(() =>
        expect(screen.getByText('AI generation failed. Please try again.')).toBeInTheDocument(),
      );

      await user.click(screen.getByRole('button', { name: 'Generate with AI' }));

      await waitFor(() =>
        expect(
          screen.queryByText('AI generation failed. Please try again.'),
        ).not.toBeInTheDocument(),
      );
    });
  });
});
