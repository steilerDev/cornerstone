/**
 * Mocks for the bank report wizard (#2243): the funding source list (the shared E2E database holds
 * other tests' loans, so the preset landing rule is only deterministic against a mocked list) and
 * the source report. Synthetic data only.
 *
 * Route order: Playwright runs the LATEST registered route first. Register these after any broader
 * glob a test installs and before any narrower one.
 */

import type { Page } from '@playwright/test';
import type { BudgetSource } from '../../shared/src/types/budgetSource.js';
import type {
  SourceReportInvoice,
  SourceReportResponse,
  SourceReportType,
} from '../../shared/src/types/sourceReport.js';

const NOW = '2026-06-01T08:00:00.000Z';

/** A complete funding source with the figures zeroed; override what the scenario needs. */
export function buildBudgetSource(
  id: string,
  name: string,
  overrides: Partial<BudgetSource> = {},
): BudgetSource {
  return {
    id,
    name,
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
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Answers GET /api/budget-sources with exactly these sources. */
export async function mockBudgetSources(
  page: Page,
  sources: readonly BudgetSource[],
): Promise<void> {
  await page.route('**/api/budget-sources', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 200, json: { budgetSources: sources } });
  });
}

/** One report invoice with no budget lines, deposits or documents. */
export function buildReportInvoice(
  index: number,
  vendorId: string,
  vendorName: string,
  amount: number,
  overrides: Partial<SourceReportInvoice> = {},
): SourceReportInvoice {
  const padded = String(index).padStart(3, '0');
  return {
    invoiceId: `mock-invoice-${vendorId}-${padded}`,
    vendorId,
    vendorName,
    invoiceNumber: `MOCK-${vendorId}-${padded}`,
    date: '2026-03-01',
    status: 'pending',
    invoiceAmount: amount,
    allocatedAmount: amount,
    lineKind: 'invoice',
    isSplit: false,
    splitKind: null,
    documents: [],
    budgetLinesForSource: [],
    depositsVisibleToSource: [],
    ...overrides,
  };
}

/** A report of the given invoices; `totalAmount` is their allocated sum. */
export function buildSourceReport(
  type: SourceReportType,
  source: BudgetSource,
  invoices: readonly SourceReportInvoice[],
): SourceReportResponse {
  const totalAmount =
    Math.round(invoices.reduce((sum, invoice) => sum + invoice.allocatedAmount, 0) * 100) / 100;
  return {
    type,
    source: {
      id: source.id,
      name: source.name,
      sourceType: source.sourceType,
      reference: source.reference,
      contactAddress: source.contactAddress,
    },
    invoices: [...invoices],
    totalAmount,
    unallocatedInvoices: [],
    generatedAt: NOW,
  };
}

/**
 * Answers GET /api/source-reports?type=&sourceId= from `reportFor(type, sourceId)`; a null result
 * is an empty report of that source. Matches the query form only, so mark-claimed and
 * generate-content keep reaching the server.
 */
export async function mockSourceReports(
  page: Page,
  sources: readonly BudgetSource[],
  reportFor: (type: SourceReportType, source: BudgetSource) => SourceReportResponse | null,
): Promise<void> {
  await page.route(/\/api\/source-reports\?/, async (route) => {
    const url = new URL(route.request().url());
    const type = url.searchParams.get('type') as SourceReportType;
    const source = sources.find((candidate) => candidate.id === url.searchParams.get('sourceId'));
    if (!source) {
      await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'x' } } });
      return;
    }
    const report = reportFor(type, source) ?? buildSourceReport(type, source, []);
    await route.fulfill({ status: 200, json: { report } });
  });
}
