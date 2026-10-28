/**
 * Branch-coverage and `?type=` preset tests for ReportWizardPage.tsx (story #2237).
 *
 * The page gained the `useReportTypePreset` call (Money > Budget deep link `?type=...`). The
 * whole file had to reach 95% statements and branches, so this file also pins existing behaviour
 * that the other ReportWizardPage test files did not reach:
 *   - `?type=` / `?sourceId=` presets (valid, invalid, combined, once-only),
 *   - Download / Upload to Paperless when the deep-linked source id matches no known source,
 *   - claim 409 error text when the offending invoice ids are unknown or blank,
 *   - AI generation blocked when every invoice is deselected (reached through the stepper),
 *   - a report language that differs from the UI language,
 *   - skipped documents without an invoice number (page level and inside the preview modal),
 *   - closing the preview modal after a failed generation (no preview URL to revoke).
 *
 * Own mocks, independent of the sibling test files. formatters and reportContent are real.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
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
} from '@cornerstone/shared';
import type * as ReportPdfIndexTypes from '../../lib/reportPdf/index.js';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';

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
const mockMarkInvoicesClaimed =
  jest.fn<
    (sourceId: string, invoiceIds: string[], depositIds: string[]) => Promise<MarkClaimedResponse>
  >();
const mockGenerateReportContent = jest.fn<() => Promise<GenerateReportContentResponse>>();
jest.unstable_mockModule('../../lib/sourceReportsApi.js', () => ({
  getSourceReport: mockGetSourceReport,
  markInvoicesClaimed: mockMarkInvoicesClaimed,
  generateReportContent: mockGenerateReportContent,
}));

const mockGetPaperlessStatus = jest.fn<() => Promise<PaperlessStatusResponse>>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
  listPaperlessDocuments: jest.fn(),
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

const mockShowToast = jest.fn();
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  useToast: () => ({ toasts: [], showToast: mockShowToast, dismissToast: jest.fn() }),
}));

const { LocaleProvider } = await import('../../contexts/LocaleContext.js');

let ReportWizardPage: React.ComponentType;
let savedCreateObjectURL: typeof URL.createObjectURL;
let savedRevokeObjectURL: typeof URL.revokeObjectURL;

// ─── Fixtures ───────────────────────────────────────────────────────────────

type User = ReturnType<typeof userEvent.setup>;
type Invoice = SourceReportResponse['invoices'][number];

function makeSource(over: Partial<BudgetSource> = {}): BudgetSource {
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
    ...over,
  };
}

function makeInvoice(over: Partial<Invoice> = {}): Invoice {
  return {
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
    budgetLinesForSource: [
      { id: 'bl-1', description: 'Original Usage Text', allocatedPortion: 0, linkedItem: null },
    ],
    depositsVisibleToSource: [],
    ...over,
  };
}

function makeReport(over: Partial<SourceReportResponse> = {}): SourceReportResponse {
  return {
    type: 'claim',
    source: {
      id: 'src-1',
      name: 'Home Loan',
      sourceType: 'bank_loan',
      reference: null,
      contactAddress: null,
    },
    invoices: [makeInvoice()],
    totalAmount: 1000,
    unallocatedInvoices: [],
    generatedAt: '2026-01-15T00:00:00.000Z',
    ...over,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  for (const mock of [mockGetSourceReport, mockMarkInvoicesClaimed, mockGenerateReportPdf]) {
    mock.mockReset();
  }
  ({ ReportWizardPage } = await import('./ReportWizardPage.js'));

  mockFetchConfig.mockResolvedValue({
    currency: 'EUR',
    vatRate: 0.19,
    autoItemizeEnabled: false,
    llmEnabled: false,
  });
  mockFetchHouseholdSettings.mockResolvedValue({
    householdName: null,
    householdAddress: null,
    entriesLanguage: 'en',
  });
  mockUseAuth.mockReturnValue({
    user: null,
    oidcEnabled: false,
    status: 'signedOut',
    setupRequired: false,
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

  savedCreateObjectURL = URL.createObjectURL;
  savedRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn<typeof URL.createObjectURL>().mockReturnValue('blob:mock-url');
  URL.revokeObjectURL = jest.fn<typeof URL.revokeObjectURL>();
});

afterEach(() => {
  URL.createObjectURL = savedCreateObjectURL;
  URL.revokeObjectURL = savedRevokeObjectURL;
});

function renderPage(url = '/money/reports') {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={[url]}>
        <ReportWizardPage />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

async function clickNext(user: User) {
  const primary = screen.getAllByRole('button').filter((b) => b.className.includes('btnPrimary'));
  await user.click(primary[primary.length - 1]!);
}

/** Picks use case index 0 (claim) and the first source, then walks to the given step. */
async function walkTo(user: User, step: 3 | 4 | 5) {
  await waitFor(() => screen.getByRole('radiogroup'));
  await user.click(screen.getAllByRole('radio')[0]!);
  await clickNext(user);
  await waitFor(() => expect(screen.getAllByRole('radio').length).toBeGreaterThan(0));
  await user.click(screen.getAllByRole('radio')[0]!);
  await waitFor(() => {
    const primary = screen.getAllByRole('button').filter((b) => b.className.includes('btnPrimary'));
    expect(primary[primary.length - 1]).not.toBeDisabled();
  });
  await clickNext(user);
  await waitFor(() => expect(screen.getAllByText('ACME')[0]).toBeInTheDocument());
  if (step >= 4) await clickNext(user);
  if (step >= 5) await clickNext(user);
}

/**
 * From a `?sourceId=` deep link to an id that is not among the sources (no `type`, so the normal
 * step 1 flow runs and the id is applied once a type is picked): Next through the steps to step 5.
 */
async function deepLinkToStep5(user: User) {
  await waitFor(() => screen.getByRole('radiogroup'));
  await user.click(screen.getAllByRole('radio')[0]!); // claim
  await clickNext(user); // 1 -> 2
  await waitFor(() => {
    const primary = screen.getAllByRole('button').filter((b) => b.className.includes('btnPrimary'));
    expect(primary[primary.length - 1]).not.toBeDisabled();
  });
  await clickNext(user); // 2 -> 3
  await waitFor(() => expect(screen.getAllByText('ACME')[0]).toBeInTheDocument());
  await clickNext(user); // 3 -> 4
  await clickNext(user); // 4 -> 5
}

// ─── ?type= / ?sourceId= presets (#2243 D1) ─────────────────────────────────

describe('ReportWizardPage ?type= / ?sourceId= presets', () => {
  const stepHeading = () => screen.getByRole('heading', { level: 2 });
  const stepperButton = (name: string) => screen.getByRole('button', { name });
  const currentStepText = () => document.querySelector('[aria-current="step"]')?.textContent ?? '';
  const sourceRadio = (id: string) =>
    screen.getAllByRole('radio').find((r) => (r as HTMLInputElement).value === id) as
      HTMLInputElement | undefined;

  function twoSources() {
    mockFetchBudgetSources.mockResolvedValue({
      budgetSources: [
        makeSource({ id: 'src-1' }),
        makeSource({ id: 'src-2', name: 'Credit Line', sourceType: 'credit_line' }),
      ],
    });
  }

  it('a known type and source land on step 3 with steps 1 and 2 completed and clickable', async () => {
    renderPage('/money/reports?type=claim&sourceId=src-1');

    await waitFor(() => expect(stepHeading()).toHaveTextContent('Select invoices'));
    expect(mockGetSourceReport).toHaveBeenCalledWith('claim', 'src-1');
    await waitFor(() => expect(screen.getAllByText('ACME')[0]).toBeInTheDocument());
    expect(currentStepText()).toContain('Select invoices');
    expect(stepperButton('Report type')).toBeEnabled();
    expect(stepperButton('Funding source')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
  });

  it('Back from the preset landing goes to step 2 with the source radio checked', async () => {
    renderPage('/money/reports?type=claim&sourceId=src-1');
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText('ACME')[0]).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(stepHeading()).toHaveTextContent('Funding source'));
    expect(sourceRadio('src-1')).toBeChecked();
  });

  it('a type without a source preselects the only candidate source and lands on step 3', async () => {
    renderPage('/money/reports?type=proof-of-funds');

    await waitFor(() => expect(stepHeading()).toHaveTextContent('Select invoices'));
    expect(mockGetSourceReport).toHaveBeenCalledWith('proof-of-funds', 'src-1');
  });

  it('a type without a source lands on step 2 when two sources qualify, loading every amount', async () => {
    twoSources();
    renderPage('/money/reports?type=budget-overview');

    await waitFor(() => expect(stepHeading()).toHaveTextContent('Funding source'));
    await waitFor(() => {
      expect(mockGetSourceReport).toHaveBeenCalledWith('budget-overview', 'src-1');
      expect(mockGetSourceReport).toHaveBeenCalledWith('budget-overview', 'src-2');
    });
    await waitFor(() => expect(sourceRadio('src-1')).toBeDefined());
    expect(sourceRadio('src-1')).not.toBeChecked();
    expect(sourceRadio('src-2')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByText('That funding source no longer exists. Choose one.')).toBeNull();
  });

  it('a savings source or a closed loan is not a candidate: step 2 even with one such source', async () => {
    mockFetchBudgetSources.mockResolvedValue({
      budgetSources: [makeSource({ id: 'src-1', status: 'closed' })],
    });
    renderPage('/money/reports?type=claim');

    await waitFor(() => expect(stepHeading()).toHaveTextContent('Funding source'));
  });

  it('an unknown source id lands on step 2 with an error that clears when a source is picked', async () => {
    twoSources();
    renderPage('/money/reports?type=claim&sourceId=ghost');
    const user = userEvent.setup();

    await waitFor(() => expect(stepHeading()).toHaveTextContent('Funding source'));
    expect(
      screen.getByText('That funding source no longer exists. Choose one.'),
    ).toBeInTheDocument();
    expect(mockGetSourceReport).not.toHaveBeenCalledWith('claim', 'ghost');

    await waitFor(() => expect(sourceRadio('src-2')).toBeDefined());
    await user.click(sourceRadio('src-2')!);

    expect(screen.queryByText('That funding source no longer exists. Choose one.')).toBeNull();
    await waitFor(() => expect(mockGetSourceReport).toHaveBeenCalledWith('claim', 'src-2'));
  });

  it('does not re-apply ?sourceId= after the use case is changed', async () => {
    twoSources();
    renderPage('/money/reports?type=claim&sourceId=src-1');
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText('ACME')[0]).toBeInTheDocument());

    await user.click(stepperButton('Report type'));
    await user.click(screen.getAllByRole('radio')[1]!); // budget-overview
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(stepHeading()).toHaveTextContent('Funding source'));
    await waitFor(() => expect(sourceRadio('src-1')).toBeDefined());
    expect(sourceRadio('src-1')).not.toBeChecked();
    expect(sourceRadio('src-2')).not.toBeChecked();
  });

  it('applies the preset only once: choosing another use case is not overridden', async () => {
    renderPage('/money/reports?type=claim');
    const user = userEvent.setup();
    await waitFor(() => expect(stepHeading()).toHaveTextContent('Select invoices'));

    await user.click(stepperButton('Report type'));
    await user.click(screen.getAllByRole('radio')[2]!);

    await waitFor(() => expect(screen.getAllByRole('radio')[2]).toBeChecked());
    expect(screen.getAllByRole('radio')[0]).not.toBeChecked();
  });

  it('ignores an unknown type value and stays on step 1 with nothing chosen', async () => {
    renderPage('/money/reports?type=bogus');
    await waitFor(() => screen.getByRole('radiogroup'));
    // Let the initial data load settle: the preset would have fired by now.
    await waitFor(() => expect(mockFetchBudgetSources).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(mockGetSourceReport).not.toHaveBeenCalled();
  });

  it('does not select anything while the initial data failed to load', async () => {
    mockFetchBudgetSources.mockRejectedValue(new Error('boom'));
    renderPage('/money/reports?type=claim');
    await screen.findByText('Could not load the page data. Please try again.').catch(() => null);
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
  });

  it('keeps focus off the step heading on mount and on a preset landing, and moves it after Next', async () => {
    renderPage('/money/reports?type=claim&sourceId=src-1');
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByText('ACME')[0]).toBeInTheDocument());
    // Two animation frames: a wrongly scheduled heading focus would have landed by now.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(stepHeading()).not.toHaveFocus();

    await clickNext(user); // 3 -> 4
    await waitFor(() => expect(stepHeading()).toHaveTextContent('Settings'));
    await waitFor(() => expect(stepHeading()).toHaveFocus());
  });

  it('does not focus the step 1 heading on a plain page mount either', async () => {
    renderPage('/money/reports');
    await waitFor(() => screen.getByRole('radiogroup'));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(stepHeading()).not.toHaveFocus();
  });
});

// ─── Deep link to a source id that matches no source ────────────────────────

describe('ReportWizardPage with a source id that is not among the sources', () => {
  it('Download does nothing and generates no PDF', async () => {
    renderPage('/money/reports?sourceId=ghost-source');
    const user = userEvent.setup();
    await deepLinkToStep5(user);

    await user.click(await screen.findByRole('button', { name: 'Download PDF' }));

    expect(mockGenerateReportPdf).not.toHaveBeenCalled();
    expect(mockDownloadPdf).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('Upload to Paperless does nothing and uploads nothing', async () => {
    mockGetPaperlessStatus.mockResolvedValue({
      configured: true,
      reachable: true,
      error: null,
      paperlessUrl: null,
      filterTag: null,
    });
    renderPage('/money/reports?sourceId=ghost-source');
    const user = userEvent.setup();
    await deepLinkToStep5(user);

    await user.click(await screen.findByRole('button', { name: 'Upload to Paperless' }));

    expect(mockGenerateReportPdf).not.toHaveBeenCalled();
    expect(mockUploadToPaperless).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
  });
});

// ─── Claim edge cases ───────────────────────────────────────────────────────

async function confirmClaim(user: User) {
  await user.click(
    await screen.findByRole('button', { name: /Mark [0-9]+ invoices? as submitted/ }),
  );
  await user.click(await screen.findByTestId('report-mark-confirm'));
}

describe('ReportWizardPage claim edge cases', () => {
  it('409 naming an invoice id the report does not contain falls back to that raw id', async () => {
    const { ApiClientError } = await import('../../lib/apiClient.js');
    mockMarkInvoicesClaimed.mockRejectedValueOnce(
      new ApiClientError(409, {
        code: 'INVOICES_NOT_CLAIMABLE',
        message: 'not claimable',
        details: { invoiceIds: ['ghost-invoice'] },
      }),
    );
    renderPage();
    const user = userEvent.setup();
    await walkTo(user, 5);

    await confirmClaim(user);

    expect(
      await screen.findByText(
        'Could not mark invoices ghost-invoice as submitted: their current status does not allow it.',
      ),
    ).toBeInTheDocument();
  });

  it('409 naming an invoice with no number falls back to its id', async () => {
    const { ApiClientError } = await import('../../lib/apiClient.js');
    mockGetSourceReport.mockResolvedValue(
      makeReport({ invoices: [makeInvoice({ invoiceNumber: null })] }),
    );
    mockMarkInvoicesClaimed.mockRejectedValueOnce(
      new ApiClientError(409, {
        code: 'INVOICES_NOT_CLAIMABLE',
        message: 'not claimable',
        details: { invoiceIds: ['inv-1'] },
      }),
    );
    renderPage();
    const user = userEvent.setup();
    await walkTo(user, 5);

    await confirmClaim(user);

    expect(
      await screen.findByText(
        'Could not mark invoices inv-1 as submitted: their current status does not allow it.',
      ),
    ).toBeInTheDocument();
  });

  it('409 whose only invoice id is blank shows the generic not-claimable message', async () => {
    const { ApiClientError } = await import('../../lib/apiClient.js');
    mockMarkInvoicesClaimed.mockRejectedValueOnce(
      new ApiClientError(409, {
        code: 'INVOICES_NOT_CLAIMABLE',
        message: 'not claimable',
        details: { invoiceIds: [''] },
      }),
    );
    renderPage();
    const user = userEvent.setup();
    await walkTo(user, 5);

    await confirmClaim(user);

    await waitFor(() => expect(screen.queryByTestId('report-mark-confirm')).toBeNull());
    expect(screen.queryByText(/Could not mark invoices/)).toBeNull();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });
});

// ─── AI generation with nothing selected ────────────────────────────────────

describe('ReportWizardPage AI generation with every invoice deselected', () => {
  it('blocks the request and shows the empty-selection error', async () => {
    mockFetchConfig.mockResolvedValue({
      currency: 'EUR',
      vatRate: 0.19,
      autoItemizeEnabled: false,
      llmEnabled: true,
    });
    renderPage();
    const user = userEvent.setup();
    await walkTo(user, 5);

    // Back to step 3 and deselect everything, then jump to step 5 through the stepper (the Next
    // button is disabled when nothing is selected, the stepper is not).
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(await screen.findByRole('checkbox', { name: /^Select all invoices/ }));
    const stepper = screen.getByRole('navigation', { name: 'Report wizard steps' });
    await user.click(within(stepper).getByRole('button', { name: /Preview and export/ }));

    await user.click(await screen.findByRole('button', { name: 'Draft with AI' }));

    expect(await screen.findByText('Select at least one invoice.')).toBeInTheDocument();
    expect(mockGenerateReportContent).not.toHaveBeenCalled();
  });
});

// ─── Report language differing from the UI language ─────────────────────────

describe('ReportWizardPage report language', () => {
  it('marks the editor with the report language when it differs from the UI language', async () => {
    renderPage();
    const user = userEvent.setup();
    await walkTo(user, 4);

    await user.click(screen.getByRole('radio', { name: 'Deutsch' }));
    await clickNext(user);

    await waitFor(() => expect(document.querySelector('[lang="de"]')).not.toBeNull());
  });

  it('does not mark the editor with a language when it matches the UI language', async () => {
    renderPage();
    const user = userEvent.setup();
    await walkTo(user, 5);

    await screen.findByRole('button', { name: 'Preview PDF' });
    expect(document.querySelector('table.table [lang="de"]')).toBeNull();
  });
});

// ─── Skipped documents and preview modal ────────────────────────────────────

describe('ReportWizardPage skipped documents and preview', () => {
  it('lists a skipped document without an invoice number with a dash, on the page and in the modal', async () => {
    mockGenerateReportPdf.mockResolvedValue({
      blob: new Blob(['pdf']),
      skippedDocuments: [
        {
          invoiceId: 'inv-1',
          documentId: 'doc-9',
          reason: 'footnoteFetchFailed',
          vendorName: 'Sample Vendor',
          invoiceNumber: null,
        },
      ],
    });
    renderPage();
    const user = userEvent.setup();
    await walkTo(user, 5);

    await user.click(await screen.findByRole('button', { name: 'Preview PDF' }));

    await waitFor(() => expect(screen.getAllByText(/Sample Vendor \(—\)/).length).toBe(2));
  });

  it('closes the preview modal after a failed generation without revoking a URL', async () => {
    mockGenerateReportPdf.mockRejectedValue(new Error('pdf boom'));
    renderPage();
    const user = userEvent.setup();
    await walkTo(user, 5);

    await user.click(await screen.findByRole('button', { name: 'Preview PDF' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Retry' })).toBeInTheDocument(),
    );

    await user.click(within(dialog).getByRole('button', { name: /close/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});

// ─── Step 3 summary, Mark dialog and success banner (#2243 AC3, AC5) ────────

describe('ReportWizardPage selection and the Mark as submitted dialog', () => {
  function twoInvoices() {
    mockGetSourceReport.mockResolvedValue(
      makeReport({
        invoices: [
          makeInvoice({ invoiceId: 'inv-1', invoiceNumber: 'INV-001', allocatedAmount: 1000 }),
          makeInvoice({
            invoiceId: 'inv-2',
            vendorId: 'vend-2',
            vendorName: 'Beta',
            invoiceNumber: 'INV-002',
            allocatedAmount: 500,
            invoiceAmount: 500,
          }),
        ],
        totalAmount: 1500,
      }),
    );
  }

  async function toStep5WithSecondExcluded(user: User) {
    renderPage('/money/reports?type=claim&sourceId=src-1');
    await waitFor(() => expect(screen.getAllByText('ACME')[0]).toBeInTheDocument());
    await user.click(screen.getByRole('checkbox', { name: /Beta.*INV-002/ }));
    await clickNext(user); // 3 -> 4
    await clickNext(user); // 4 -> 5
    await screen.findByRole('button', { name: 'Mark 1 invoice as submitted' });
  }

  it('shows one count and total in the step 3 summary, the step 5 block, and the Mark dialog', async () => {
    twoInvoices();
    const user = userEvent.setup();
    renderPage('/money/reports?type=claim&sourceId=src-1');
    await waitFor(() => expect(screen.getAllByText('ACME')[0]).toBeInTheDocument());

    await user.click(screen.getByRole('checkbox', { name: /Beta.*INV-002/ }));
    expect(screen.getByText(/1 of 2 invoices selected · Total .*1,000\.00/)).toBeInTheDocument();

    await clickNext(user);
    await clickNext(user);
    expect(
      await screen.findByText(/This invoice then leaves the Draw-down request list/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark 1 invoice as submitted' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Mark 1 invoice as submitted?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Total: .*1,000\.00/)).toBeInTheDocument();
    expect(
      within(dialog).getByText('They move from To pay or Paid to Submitted for Home Loan.'),
    ).toBeInTheDocument();
    // The dialog moves focus to Cancel after it mounts, not in the same tick
    await waitFor(() => expect(screen.getByTestId('report-mark-cancel')).toHaveFocus());
  });

  it('marks, closes the dialog, shows the success banner with both links, and focuses the step 5 heading', async () => {
    twoInvoices();
    mockMarkInvoicesClaimed.mockResolvedValue({
      batchId: 'batch-1',
      claimedInvoiceIds: ['inv-1'],
      claimedDepositIds: [],
    });
    const user = userEvent.setup();
    await toStep5WithSecondExcluded(user);

    await user.click(screen.getByRole('button', { name: 'Mark 1 invoice as submitted' }));
    await user.click(await screen.findByTestId('report-mark-confirm'));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mockMarkInvoicesClaimed).toHaveBeenCalledWith('src-1', ['inv-1'], []);
    const banner = screen
      .getAllByRole('status')
      .find((el) => el.className.includes('bannerSuccess'))!;
    expect(banner).toHaveTextContent('1 invoice and 0 progress payments marked as submitted');
    expect(within(banner).getByRole('link', { name: 'View invoices' })).toHaveAttribute(
      'href',
      '/budget/invoices',
    );
    expect(within(banner).getByRole('link', { name: 'Open History' })).toHaveAttribute(
      'href',
      '/budget/financing/sources/src-1?tab=history',
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Preview and export' })).toHaveFocus(),
    );
  });

  it('INVOICES_NOT_CLAIMABLE keeps the dialog open with the reason, hides the action, and refetches', async () => {
    twoInvoices();
    const { ApiClientError } = await import('../../lib/apiClient.js');
    mockMarkInvoicesClaimed.mockRejectedValueOnce(
      new ApiClientError(409, {
        code: 'INVOICES_NOT_CLAIMABLE',
        message: 'not claimable',
        details: { invoiceIds: ['inv-1'] },
      }),
    );
    const user = userEvent.setup();
    await toStep5WithSecondExcluded(user);
    const callsBefore = mockGetSourceReport.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'Mark 1 invoice as submitted' }));
    await user.click(await screen.findByTestId('report-mark-confirm'));

    const dialog = await screen.findByRole('alertdialog');
    expect(
      await within(dialog).findByText(/Could not mark invoices INV-001 as submitted/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('report-mark-confirm')).toBeNull();
    await waitFor(() => expect(mockGetSourceReport.mock.calls.length).toBeGreaterThan(callsBefore));

    // Cancel closes it; opening it again starts clean
    await user.click(screen.getByTestId('report-mark-cancel'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Mark 1 invoice as submitted' }));
    expect(await screen.findByTestId('report-mark-confirm')).toBeInTheDocument();
    expect(screen.queryByText(/Could not mark invoices/)).toBeNull();
  });

  it('Finish without marking shows View invoices but no Open History', async () => {
    twoInvoices();
    const user = userEvent.setup();
    await toStep5WithSecondExcluded(user);

    await user.click(screen.getByRole('button', { name: 'Finish without marking' }));

    expect(screen.getByRole('link', { name: 'View invoices' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open History' })).toBeNull();
    expect(mockMarkInvoicesClaimed).not.toHaveBeenCalled();
  });

  it('keeps Next on step 3 inert (aria-disabled, with its reason) when every invoice is deselected', async () => {
    twoInvoices();
    const user = userEvent.setup();
    renderPage('/money/reports?type=claim&sourceId=src-1');
    await waitFor(() => expect(screen.getAllByText('ACME')[0]).toBeInTheDocument());

    await user.click(screen.getByRole('checkbox', { name: /^Select all invoices/ }));

    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(next.className).toContain('inertPrimary');
    expect(next).toHaveAccessibleDescription('Select at least one invoice to proceed');
    await user.click(next);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Select invoices');
  });
});
