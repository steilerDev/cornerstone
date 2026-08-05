/**
 * Unit tests for the AI-generation feature on ReportWizardPage.tsx (originally Story #1901,
 * revised by Story #1931).
 *
 * Split out from ReportWizardPage.test.tsx (which stays focused on the #1900 editable-content
 * baseline) to keep both files a manageable size. Uses the same mock-module setup and
 * real-formatters/real-reportContent-integration strategy as the sibling file — see its header
 * comment for the two-DOM-tree (desktop table + mobile card list) and `desktopTable()` scoping
 * rationale, both of which apply identically here.
 *
 * #1931 removed the step-4 "Enable AI assistance" toggle (double opt-in defect — the toggle
 * carried no state of its own, it only gated whether a second button existed). The step-5 action
 * now depends purely on `llmEnabled` (from `GET /api/config`), and its accessible name changed
 * from "Generate with AI" to "Enhance with AI". `goToStep4`/`goToStep5` below no longer take an
 * `enableAi` parameter — there is nothing to opt into on step 4 anymore.
 *
 * Covers: the button's dependence on llmEnabled alone; the button only being offered when
 * llmEnabled is true, with no step-4 interaction required; no generation on mount; a single
 * batched call per click with the correct request shape; the fake-timer elapsed-seconds counter;
 * generated text becoming a new BASELINE (no edited indicator) rather than an override; per-field
 * reset after a further manual edit falling back to the AI baseline (not the pre-AI derived text);
 * the overwrite-confirmation modal gating regeneration only when manual overrides exist;
 * guardedUpdate clearing aiContent on a confirmed step 1-4 change; the error path preserving
 * existing content and allowing retry; and the button's aria-describedby wiring to a visually
 * hidden description that renders whenever the button does.
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
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import { LocaleProvider } from '../../contexts/LocaleContext.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// #1932: ReportWizardPage now calls useAuth() directly (threading `user.displayName` into
// buildReportContent's sender — AC 3.1). Mocked identically to the sibling ReportWizardPage.test.tsx
// (see its header comment) so this file's renders don't throw "useAuth must be used within an
// AuthProvider".
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
        splitKind: null,
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

/** Navigate to step 4. There is no AI toggle to opt into anymore (#1931) — step 5's action button
 * depends purely on llmEnabled from the mocked fetchConfig. */
async function goToStep4(user: ReturnType<typeof userEvent.setup>) {
  await goToStep3(user);
  await clickNext(user); // step 3 -> 4
}

async function goToStep5(user: ReturnType<typeof userEvent.setup>) {
  await goToStep4(user);
  await clickNext(user); // step 4 -> 5
}

describe('ReportWizardPage — AI generation (Story #1901, revised by #1931)', () => {
  // ─── Availability (llmEnabled alone — no opt-in step) ──────────────────────

  describe('availability (single llmEnabled gate, #1931)', () => {
    it('shows no AI action, spinner, note, or error slot anywhere on step 5 when llmEnabled is false', async () => {
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
      await goToStep5(user);

      expect(screen.queryByRole('button', { name: 'Enhance with AI' })).not.toBeInTheDocument();
      expect(screen.queryByText(/generating…/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText('Content generated with AI — review before submitting.'),
      ).not.toBeInTheDocument();
    });

    it('offers "Enhance with AI" on step 5 when llmEnabled is true, with no step-4 interaction required', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      expect(screen.getByRole('button', { name: 'Enhance with AI' })).toBeInTheDocument();
    });

    it('renders no AI-related control at all on step 4 (the old toggle is gone, #1931)', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep4(user);

      expect(screen.queryByText(/enable ai assistance/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: /ai/i })).not.toBeInTheDocument();
    });

    it('does NOT call generateReportContent automatically just from reaching step 5', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      expect(mockGenerateReportContent).not.toHaveBeenCalled();
    });
  });

  // ─── Accessibility: aria-describedby wiring (#1931) ────────────────────────

  describe('enhance-with-AI button accessibility description (#1931)', () => {
    it('has aria-describedby pointing at an element whose text is the description', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const button = screen.getByRole('button', { name: 'Enhance with AI' });
      const describedById = button.getAttribute('aria-describedby');
      expect(describedById).toBeTruthy();
      const descriptionEl = document.getElementById(describedById!);
      expect(descriptionEl).not.toBeNull();
      expect(descriptionEl?.textContent).toBe(
        "Replaces the usage descriptions and cover letter below with AI-generated content. Any edits you've made will be discarded.",
      );
    });

    it('renders the description whenever the button renders — unconditional on dirty state, not just after an edit', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      // No manual edit has happened yet — overrides is empty — and the description is still present.
      expect(
        screen.getByText(
          "Replaces the usage descriptions and cover letter below with AI-generated content. Any edits you've made will be discarded.",
        ),
      ).toBeInTheDocument();
    });

    it('is absent along with the button when llmEnabled is false', async () => {
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
      await goToStep5(user);

      expect(
        screen.queryByText(
          "Replaces the usage descriptions and cover letter below with AI-generated content. Any edits you've made will be discarded.",
        ),
      ).not.toBeInTheDocument();
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
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));

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
              splitKind: null,
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
      await clickNext(user); // step 4 -> 5

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));

      await waitFor(() => expect(mockGenerateReportContent).toHaveBeenCalledTimes(1));
      const call = mockGenerateReportContent.mock.calls[0]![0];
      expect(call.includedInvoiceIds).toEqual(['inv-1']);
    });
  });

  // ─── Progress feedback ──────────────────────────────────────────────────────

  describe('progress feedback', () => {
    it('disables the "Enhance with AI" button while a generation is pending', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockReturnValue(new Promise(() => {}));
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Enhance with AI' })).toBeDisabled();
      });
    });

    it('shows an elapsed-seconds caption that increments with fake timers', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockReturnValue(new Promise(() => {}));
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      // Fake timers must be enabled AFTER navigation (which relies on real userEvent timing) but
      // BEFORE the click that starts the elapsed-seconds setInterval, so the interval itself is a
      // fake one that advanceTimersByTime can drive deterministically.
      jest.useFakeTimers();
      fireEvent.click(screen.getByRole('button', { name: 'Enhance with AI' }));

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
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));

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
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
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
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
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
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));

      await waitFor(() => expect(mockGenerateReportContent).toHaveBeenCalledTimes(1));
      expect(within(desktopTable()).getByDisplayValue('Original Usage Text')).toBeInTheDocument();
    });
  });

  // ─── Overwrite confirmation ─────────────────────────────────────────────────

  describe('overwrite confirmation', () => {
    it('shows the overwrite-confirmation modal when manual overrides exist and "Enhance with AI" is clicked again', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Manual edit before any AI run' } });

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));

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
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));

      expect(screen.queryByText('Overwrite your edits?')).not.toBeInTheDocument();
      await waitFor(() => expect(mockGenerateReportContent).toHaveBeenCalledTimes(1));
    });

    it('does NOT show the overwrite modal when regenerating after a PRIOR AI run with no further manual edits', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockResolvedValue(defaultAiResult());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
      await waitFor(() => expect(mockGenerateReportContent).toHaveBeenCalledTimes(1));

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));

      expect(screen.queryByText('Overwrite your edits?')).not.toBeInTheDocument();
      await waitFor(() => expect(mockGenerateReportContent).toHaveBeenCalledTimes(2));
    });

    it('"Keep Editing" cancels the pending regeneration — overrides and displayed text survive untouched', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Manual edit to keep' } });
      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
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
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Manual edit survives Escape' } });
      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
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
      await goToStep5(user);

      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Manual edit to discard' } });
      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
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
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
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
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));

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
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
      await waitFor(() => {
        expect(screen.getByText('AI generation failed. Please try again.')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));

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
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));

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
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
      await waitFor(() =>
        expect(screen.getByText('AI generation failed. Please try again.')).toBeInTheDocument(),
      );

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));

      await waitFor(() =>
        expect(
          screen.queryByText('AI generation failed. Please try again.'),
        ).not.toBeInTheDocument(),
      );
    });
  });

  // ─── In-flight staleness guard (#1946) ─────────────────────────────────────

  describe('in-flight staleness guard (#1946)', () => {
    // AC1: guardedUpdate's widened predicate fires when isGeneratingAi is true,
    // even though overrides and aiContent are both absent.
    it('AC1 — shows discard modal while generation is in-flight with no overrides or aiContent', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockReturnValueOnce(new Promise(() => {}));
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Enhance with AI' })).toBeDisabled(),
      );

      // Navigate to step 4 and trigger a guarded setting change.
      await user.click(screen.getByRole('button', { name: 'Back' })); // 5 -> 4
      await user.click(screen.getByLabelText('Attach invoice PDFs'));

      expect(screen.getByText('Cancel AI generation?')).toBeInTheDocument();
    });

    // AC2: confirming discard increments the token so the in-flight result is
    // silently discarded when it eventually arrives.
    it('AC2 — confirming discard invalidates in-flight result', async () => {
      let resolveAiGeneration!: (value: GenerateReportContentResponse) => void;
      const controlledPromise = new Promise<GenerateReportContentResponse>((res) => {
        resolveAiGeneration = res;
      });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockReturnValueOnce(controlledPromise);
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Enhance with AI' })).toBeDisabled(),
      );

      // Navigate to step 4 and trigger the discard modal.
      await user.click(screen.getByRole('button', { name: 'Back' })); // 5 -> 4
      await user.click(screen.getByLabelText('Attach invoice PDFs'));
      await waitFor(() => expect(screen.getByText('Cancel AI generation?')).toBeInTheDocument());

      // Confirm: token incremented, isGeneratingAi set false immediately.
      await user.click(screen.getByRole('button', { name: 'Discard and Continue' }));

      // Navigate back to step 5.
      await clickNext(user); // 4 -> 5

      // Resolve the now-invalidated promise — token mismatch silently discards it.
      await act(async () => {
        resolveAiGeneration(defaultAiResult());
      });

      // AI result must NOT appear.
      expect(
        within(desktopTable()).queryByDisplayValue('AI-generated usage description'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Content generated with AI — review before submitting.'),
      ).not.toBeInTheDocument();
      // Spinner must be gone (isGeneratingAi was set false by the discard confirm).
      expect(screen.queryByText(/Generating…/)).not.toBeInTheDocument();
      // Original baseline is shown.
      expect(within(desktopTable()).getByDisplayValue('Original Usage Text')).toBeInTheDocument();
    });

    // AC3: cancelling the discard leaves the token unchanged so the in-flight
    // result lands normally when the promise resolves.
    it('AC3 — cancelling discard lets in-flight generation complete normally', async () => {
      let resolveAiGeneration!: (value: GenerateReportContentResponse) => void;
      const controlledPromise = new Promise<GenerateReportContentResponse>((res) => {
        resolveAiGeneration = res;
      });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockReturnValueOnce(controlledPromise);
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Enhance with AI' })).toBeDisabled(),
      );

      // Trigger modal, then cancel.
      await user.click(screen.getByRole('button', { name: 'Back' })); // 5 -> 4
      await user.click(screen.getByLabelText('Attach invoice PDFs'));
      await waitFor(() => expect(screen.getByText('Cancel AI generation?')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: 'Keep Editing' }));
      expect(screen.queryByText('Cancel AI generation?')).not.toBeInTheDocument();

      // Navigate back to step 5 — generation still in-flight.
      await clickNext(user); // 4 -> 5

      // Resolve the still-live promise — token unchanged so result applies.
      await act(async () => {
        resolveAiGeneration(defaultAiResult());
      });

      await waitFor(() => {
        expect(
          within(desktopTable()).getByDisplayValue('AI-generated usage description'),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText('Content generated with AI — review before submitting.'),
      ).toBeInTheDocument();
    });

    // AC4: when the user has typed overrides AND a generation is in-flight,
    // confirming discard invalidates both — the resolved result does not
    // silently re-populate aiContent or restore the discarded override.
    it('AC4 — confirmed discard invalidates both overrides and in-flight result', async () => {
      let resolveAiGeneration!: (value: GenerateReportContentResponse) => void;
      const controlledPromise = new Promise<GenerateReportContentResponse>((res) => {
        resolveAiGeneration = res;
      });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockReturnValueOnce(controlledPromise);
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Enhance with AI' })).toBeDisabled(),
      );

      // Create a manual override while generation is in-flight.
      const usageInput = within(desktopTable()).getByDisplayValue('Original Usage Text');
      fireEvent.change(usageInput, { target: { value: 'Manual edit before discard' } });

      // Trigger the discard modal and confirm.
      await user.click(screen.getByRole('button', { name: 'Back' })); // 5 -> 4
      await user.click(screen.getByLabelText('Attach invoice PDFs'));
      await waitFor(() => expect(screen.getByText('Discard your edits?')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: 'Discard and Continue' }));

      // Navigate back to step 5.
      await clickNext(user); // 4 -> 5

      // Resolve the invalidated promise.
      await act(async () => {
        resolveAiGeneration(defaultAiResult());
      });

      // Neither the manual edit nor the AI result must appear.
      expect(
        within(desktopTable()).queryByDisplayValue('Manual edit before discard'),
      ).not.toBeInTheDocument();
      expect(
        within(desktopTable()).queryByDisplayValue('AI-generated usage description'),
      ).not.toBeInTheDocument();
      // Original baseline is restored.
      expect(within(desktopTable()).getByDisplayValue('Original Usage Text')).toBeInTheDocument();
    });

    // AC5a: the modal body uses the "generating" copy when only an in-flight
    // generation exists — no overrides, no aiContent.
    it('AC5a — modal body shows generating copy when in-flight with no overrides or aiContent', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockReturnValueOnce(new Promise(() => {}));
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Enhance with AI' })).toBeDisabled(),
      );

      await user.click(screen.getByRole('button', { name: 'Back' })); // 5 -> 4
      await user.click(screen.getByLabelText('Attach invoice PDFs'));
      await waitFor(() => expect(screen.getByText('Cancel AI generation?')).toBeInTheDocument());

      expect(
        screen.getByText('An AI generation is in progress. Changing this will cancel it.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          'Changing this will regenerate the report content and your edits will be lost.',
        ),
      ).not.toBeInTheDocument();
    });

    // AC5b: once a generation completes (aiContent is set, isGeneratingAi is
    // false), the modal body falls back to the existing edits copy.
    it('AC5b — modal body shows edits copy when aiContent is set and generation is complete', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockResolvedValue(defaultAiResult());
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
      await waitFor(() => {
        expect(
          within(desktopTable()).getByDisplayValue('AI-generated usage description'),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Back' })); // 5 -> 4
      await user.click(screen.getByLabelText('Attach invoice PDFs'));
      await waitFor(() => expect(screen.getByText('Discard your edits?')).toBeInTheDocument());

      expect(
        screen.getByText(
          'Changing this will regenerate the report content and your edits will be lost.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('An AI generation is in progress. Changing this will cancel it.'),
      ).not.toBeInTheDocument();
    });

    // AC6: the fix lives in guardedUpdate, so every guarded transition — not
    // just use-case changes — is protected. Verify with a source change (step 2).
    it('AC6 — source change also shows discard modal while generation is in-flight', async () => {
      const source2 = makeSource({ id: 'src-2', name: 'Equity Fund' });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource(), source2] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockReturnValueOnce(new Promise(() => {}));
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Enhance with AI' })).toBeDisabled(),
      );

      // Navigate back to step 2.
      await user.click(screen.getByRole('button', { name: 'Back' })); // 5 -> 4
      await user.click(screen.getByRole('button', { name: 'Back' })); // 4 -> 3
      await user.click(screen.getByRole('button', { name: 'Back' })); // 3 -> 2

      // Click the second source radio — handleSourceChange -> guardedUpdate -> modal.
      await waitFor(() => expect(screen.getAllByRole('radio').length).toBeGreaterThan(1));
      await user.click(screen.getAllByRole('radio')[1]!); // src-2

      expect(screen.getByText('Cancel AI generation?')).toBeInTheDocument();
    });

    // AC9: handleUseCaseChange carries a setAiError('') call in its guarded
    // callback. Verify it clears a stale error left from a prior failed generation.
    it('AC9 — handleUseCaseChange clears aiError from a prior failed generation', async () => {
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockRejectedValueOnce(new Error('server error'));
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
      await waitFor(() =>
        expect(screen.getByText('AI generation failed. Please try again.')).toBeInTheDocument(),
      );

      // Navigate back to step 1 via four Back clicks.
      await user.click(screen.getByRole('button', { name: 'Back' })); // 5 -> 4
      await user.click(screen.getByRole('button', { name: 'Back' })); // 4 -> 3
      await user.click(screen.getByRole('button', { name: 'Back' })); // 3 -> 2
      await user.click(screen.getByRole('button', { name: 'Back' })); // 2 -> 1

      // Select "budget-overview" (first radio) — triggers handleUseCaseChange,
      // which runs setAiError('') inside its guarded callback (isDirty is false
      // since the error path left isGeneratingAi=false, overrides={}, aiContent=null).
      await waitFor(() => screen.getByRole('radiogroup'));
      await user.click(screen.getAllByRole('radio')[0]!); // budget-overview

      // Re-navigate to step 5 under the new use case.
      await clickNext(user); // 1 -> 2
      await waitFor(() => expect(screen.getAllByRole('radio').length).toBeGreaterThan(0));
      await user.click(screen.getAllByRole('radio')[0]!); // src-1
      await waitFor(() => {
        const primaryButtons = screen
          .getAllByRole('button')
          .filter((b) => b.className.includes('btnPrimary'));
        expect(primaryButtons[primaryButtons.length - 1]).not.toBeDisabled();
      });
      await clickNext(user); // 2 -> 3
      await waitFor(() => expect(screen.getByText('ACME')).toBeInTheDocument());
      await clickNext(user); // 3 -> 4
      await clickNext(user); // 4 -> 5

      // The stale error banner must be gone.
      expect(screen.queryByText('AI generation failed. Please try again.')).not.toBeInTheDocument();
    });

    // AC10: handleSourceChange clears skippedDocuments so a stale "document
    // could not be fetched" note from a previous source's PDF run does not
    // bleed into the next source's step 5 view.
    it('AC10 — handleSourceChange clears skippedDocuments', async () => {
      const source2 = makeSource({ id: 'src-2', name: 'Equity Fund' });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource(), source2] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      // First PDF generation returns a skipped document; subsequent calls return none
      // (the default set in beforeEach — mockResolvedValue — kicks in after this Once).
      mockGenerateReportPdf.mockResolvedValueOnce({
        blob: new Blob(['pdf']),
        skippedDocuments: [
          {
            invoiceId: 'inv-1',
            documentId: 'doc-1',
            reason: 'footnoteFetchFailed' as const,
            vendorName: 'ACME',
            invoiceNumber: 'INV-001',
          },
        ],
      });
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      // Click "Preview PDF" to populate skippedDocuments state.
      await user.click(screen.getByRole('button', { name: 'Preview PDF' }));
      await waitFor(() => expect(screen.getByText('PDF Preview')).toBeInTheDocument());

      // Close the preview modal.
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByText('PDF Preview')).not.toBeInTheDocument());

      // Skipped-document note must be visible on step 5 before the source change.
      expect(screen.getByText(/Document could not be retrieved/)).toBeInTheDocument();

      // Navigate back to step 2 via three Back clicks.
      await user.click(screen.getByRole('button', { name: 'Back' })); // 5 -> 4
      await user.click(screen.getByRole('button', { name: 'Back' })); // 4 -> 3
      await user.click(screen.getByRole('button', { name: 'Back' })); // 3 -> 2

      // Change to source 2 — handleSourceChange -> setSkippedDocuments([]).
      await waitFor(() => expect(screen.getAllByRole('radio').length).toBeGreaterThan(1));
      await user.click(screen.getAllByRole('radio')[1]!); // src-2

      // Navigate to step 5 under src-2.
      await waitFor(() => {
        const primaryButtons = screen
          .getAllByRole('button')
          .filter((b) => b.className.includes('btnPrimary'));
        expect(primaryButtons[primaryButtons.length - 1]).not.toBeDisabled();
      });
      await clickNext(user); // 2 -> 3
      await waitFor(() => expect(screen.getByText('ACME')).toBeInTheDocument());
      await clickNext(user); // 3 -> 4
      await clickNext(user); // 4 -> 5

      // Stale skipped-document note must be gone.
      expect(screen.queryByText(/Document could not be retrieved/)).not.toBeInTheDocument();
    });

    // H1: a discarded generation's finally block must NOT clear the spinner that
    // belongs to a second, still-in-flight generation started after the discard.
    it("H1 — discarded generation's finally does not clear spinner of new generation", async () => {
      let resolveA!: (value: GenerateReportContentResponse) => void;
      const controlledA = new Promise<GenerateReportContentResponse>((res) => {
        resolveA = res;
      });
      let resolveB!: (value: GenerateReportContentResponse) => void;
      const controlledB = new Promise<GenerateReportContentResponse>((res) => {
        resolveB = res;
      });
      mockFetchBudgetSources.mockResolvedValue({ budgetSources: [makeSource()] });
      mockGetSourceReport.mockResolvedValue(makeReport());
      mockGenerateReportContent.mockReturnValueOnce(controlledA).mockReturnValueOnce(controlledB);
      renderPage();
      const user = userEvent.setup();
      await goToStep5(user);

      // Start generation A.
      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Enhance with AI' })).toBeDisabled(),
      );

      // Navigate to step 4 and trigger the discard modal (title is the generating variant).
      await user.click(screen.getByRole('button', { name: 'Back' })); // 5 -> 4
      await user.click(screen.getByLabelText('Attach invoice PDFs'));
      await waitFor(() => expect(screen.getByText('Cancel AI generation?')).toBeInTheDocument());

      // Confirm discard — token bumped, isGeneratingAi cleared.
      await user.click(screen.getByRole('button', { name: 'Discard and Continue' }));

      // Navigate back to step 5 and start generation B.
      await clickNext(user); // 4 -> 5
      await user.click(screen.getByRole('button', { name: 'Enhance with AI' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Enhance with AI' })).toBeDisabled(),
      );

      // Resolve A — its token is stale so the finally block must NOT clear
      // isGeneratingAi (which now belongs to B).
      await act(async () => {
        resolveA(defaultAiResult());
      });

      // B is still in-flight: button must still be disabled.
      expect(screen.getByRole('button', { name: 'Enhance with AI' })).toBeDisabled();

      // Resolve B — this generation is live, so its result applies.
      await act(async () => {
        resolveB(defaultAiResult());
      });

      // Button re-enables and AI content appears.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Enhance with AI' })).not.toBeDisabled(),
      );
      expect(
        within(desktopTable()).getByDisplayValue('AI-generated usage description'),
      ).toBeInTheDocument();
    });
  });
});
