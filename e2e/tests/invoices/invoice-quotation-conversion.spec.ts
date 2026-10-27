/**
 * E2E tests for the Convert page (#2240, supersedes the Story #2107 dialog tests)
 *
 * An offer (status `quotation`) shows "Convert to final invoice" as a link to
 * /budget/invoices/:id/convert. The page has a Document card (Paperless only), the final invoice
 * details, the Cost lines card (Offered · Proposed · Keep, grouped by task/purchase), a Progress
 * payments card (Refund due + Add refund) and a sticky Cancel / Convert bar. Converting posts
 * POST /api/invoices/:invoiceId/convert-quotation and returns to the same invoice id.
 *
 * Scenarios (numbering follows the E2E spec):
 *   C1  @smoke Entry link, page identity, grouped lines, columns
 *   C2  Happy path (10,000 -> 10,500, lines 6,300 / 3,150), same id, list chips (AC4)
 *   C3  Keep all offered amounts; Reset to proposal
 *   C4  Over-allocation blocks Convert (aria-disabled, focus moves, nothing posted)
 *   C5  Past due date error shown at once
 *   C6  Offer without cost lines
 *   C7  Refund due -> Add refund round trip (AC2); C7b Convert without a refund (D1, #2188)
 *   C8  Status Paid
 *   C9  Cancel (clean / dirty -> Discard changes?)
 *   C10 Paperless off: no Document card (AC3)
 *   C11 Paperless + AI mocked: Read amounts pre-fills, document linked
 *   C12 Edited field keeps its value and gets a suggestion
 *   C13 AI error keeps typed values, retry, manual convert
 *   C14 LLM off: no Read amounts, picking still works
 *   C15 @responsive mobile; C16 @responsive tablet; C17 dark mode
 *   C18 Not an offer; C19 Home N9 "Convert" link
 *
 * Paperless and the LLM are mocked with page.route() (no container); the convert endpoint itself
 * is always the real server.
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoiceConvertPage } from '../../pages/InvoiceConvertPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { HomePage } from '../../pages/HomePage.js';
import { PaperlessPickerModal } from '../../pages/PaperlessPickerModal.js';
import { API } from '../../fixtures/testData.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
import type { Page, Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Constants and mocks
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_DOC = {
  id: 9101,
  title: 'Final Invoice 2026-777 - Builder Co',
  content: 'Final invoice',
  tags: [],
  created: '2026-03-10',
  added: '2026-03-10T10:00:00Z',
  modified: '2026-03-10T10:00:00Z',
  correspondent: 'Builder Co',
  documentType: 'Invoice',
  archiveSerialNumber: 9101,
  originalFileName: 'final-invoice.pdf',
  pageCount: 1,
  searchHit: null,
};

const MOCK_LINES = [
  {
    description: 'Structural work',
    quantity: 1,
    unit: 'lot',
    unitPrice: 7000,
    totalAmount: 7000,
    includesVat: false,
    vatRate: 0.19,
    vendorName: null,
    confidence: 0.9,
  },
  {
    description: 'Finishing',
    quantity: 1,
    unit: 'lot',
    unitPrice: 3200,
    totalAmount: 3200,
    includesVat: false,
    vatRate: 0.19,
    vendorName: null,
    confidence: 0.9,
  },
];

async function mockPaperlessConfigured(page: Page): Promise<void> {
  await page.route('**/api/paperless/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: 'http://paperless.local:8000',
        filterTag: null,
      }),
    });
  });
}

/** Overrides only `llmEnabled` in GET /api/config; other fields come from the real server. */
async function mockLlmEnabled(page: Page, llmEnabled: boolean): Promise<void> {
  await page.route('**/api/config', async (route: Route) => {
    try {
      const realResp = await route.fetch();
      const realBody = (await realResp.json()) as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...realBody, llmEnabled }),
      });
    } catch {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'EUR', llmEnabled }),
      });
    }
  });
}

/** Mocks everything the document picker modal needs. */
async function mockPickerBackend(page: Page): Promise<void> {
  await page.route('**/paperless/correspondents', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ correspondents: [] }),
    });
  });
  await page.route('**/api/paperless/tags', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tags: [] }),
    });
  });
  await page.route('**/api/document-links/linked-ids', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ paperlessDocumentIds: [] }),
    });
  });
  await page.route('**/paperless/documents**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        documents: [MOCK_DOC],
        pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      }),
    });
  });
}

async function mockPreviewOk(page: Page): Promise<void> {
  await page.route('**/api/invoices/auto-itemize/preview', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lines: MOCK_LINES,
        warnings: [],
        suggestedVendorId: null,
        extractedTotal: 10200,
        extractedInvoiceDate: '2026-03-10',
        extractedInvoiceNumber: 'FINAL-2026-777',
        extractedNotes: 'Extracted note from document',
        extractedDueDate: '2026-04-10',
      }),
    });
  });
}

async function mockPreviewFailure(page: Page): Promise<void> {
  await page.route('**/api/invoices/auto-itemize/preview', async (route: Route) => {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'LLM_UNREACHABLE', message: 'LLM unreachable', details: {} },
      }),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

interface Fixture {
  vendorId: string;
  invoiceId: string;
  workItemId: string | null;
  budgetSourceId: string | null;
  /** Junction ids of the invoice budget lines, in creation order. */
  lineIds: string[];
}

interface InvoiceResponse {
  id: string;
  status: string;
  amount: number;
  notes: string | null;
  invoiceNumber: string | null;
  budgetLines: Array<{ id: string; itemizedAmount: number }>;
  deposits: Array<{ id: string; amount: number; entryType: string; status: string }>;
}

async function createQuotation(
  page: Page,
  testPrefix: string,
  opts: {
    status?: 'quotation' | 'pending';
    lines?: number[];
    amount?: number;
    dueDate?: string;
  } = {},
): Promise<Fixture> {
  const lines = opts.lines ?? [6000, 3000];
  const fixture: Fixture = {
    vendorId: '',
    invoiceId: '',
    workItemId: null,
    budgetSourceId: null,
    lineIds: [],
  };

  const vendorResp = await page.request.post(API.vendors, {
    data: { name: `${testPrefix} Convert Vendor` },
  });
  expect(vendorResp.ok(), 'POST vendor').toBeTruthy();
  fixture.vendorId = ((await vendorResp.json()) as { vendor: { id: string } }).vendor.id;

  const invoiceResp = await page.request.post(`${API.vendors}/${fixture.vendorId}/invoices`, {
    data: {
      status: opts.status ?? 'quotation',
      amount: opts.amount ?? 10000,
      date: '2026-01-15',
      invoiceNumber: `${testPrefix.substring(0, 8)}-Q`,
      notes: 'Original quotation notes',
      ...(opts.dueDate ? { dueDate: opts.dueDate } : {}),
    },
  });
  expect(invoiceResp.ok(), `POST invoice ${invoiceResp.status()}`).toBeTruthy();
  fixture.invoiceId = ((await invoiceResp.json()) as { invoice: { id: string } }).invoice.id;

  if (lines.length > 0) {
    fixture.workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} Convert WI` });
    const sourceResp = await page.request.post(API.budgetSources, {
      data: { name: `${testPrefix} Convert Source`, sourceType: 'savings', totalAmount: 500000 },
    });
    expect(sourceResp.ok(), 'POST budget source').toBeTruthy();
    fixture.budgetSourceId = (
      (await sourceResp.json()) as { budgetSource: { id: string } }
    ).budgetSource.id;

    for (const [index, amount] of lines.entries()) {
      const wibResp = await page.request.post(`${API.workItems}/${fixture.workItemId}/budgets`, {
        data: {
          confidence: 'own_estimate',
          plannedAmount: amount,
          budgetSourceId: fixture.budgetSourceId,
          description: `${testPrefix} Line ${index + 1}`,
        },
      });
      expect(wibResp.ok(), 'POST work item budget').toBeTruthy();
      const budgetId = ((await wibResp.json()) as { budget: { id: string } }).budget.id;

      const linkResp = await page.request.post(`/api/invoices/${fixture.invoiceId}/budget-lines`, {
        data: { invoiceId: fixture.invoiceId, workItemBudgetId: budgetId, itemizedAmount: amount },
      });
      expect(linkResp.ok(), `POST invoice budget line ${linkResp.status()}`).toBeTruthy();
      fixture.lineIds.push(
        ((await linkResp.json()) as { budgetLine: { id: string } }).budgetLine.id,
      );
    }
  }
  return fixture;
}

async function cleanup(page: Page, fixture: Fixture | null): Promise<void> {
  if (!fixture) return;
  if (fixture.invoiceId && fixture.vendorId) {
    await page.request.delete(`${API.vendors}/${fixture.vendorId}/invoices/${fixture.invoiceId}`);
  }
  if (fixture.vendorId) await page.request.delete(`${API.vendors}/${fixture.vendorId}`);
  if (fixture.workItemId) await deleteWorkItemViaApi(page, fixture.workItemId);
  if (fixture.budgetSourceId)
    await page.request.delete(`${API.budgetSources}/${fixture.budgetSourceId}`);
}

async function createDepositViaApi(
  page: Page,
  invoiceId: string,
  data: {
    amount: number;
    dueDate: string;
    status?: 'pending' | 'paid';
    paidDate?: string;
    entryType?: 'deposit' | 'refund';
  },
): Promise<void> {
  const response = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
    data: { status: 'pending', ...data },
  });
  expect(response.ok(), `POST deposit failed: ${response.status()}`).toBeTruthy();
}

async function getInvoice(page: Page, invoiceId: string): Promise<InvoiceResponse> {
  const response = await page.request.get(`/api/invoices/${invoiceId}`);
  expect(response.ok(), `GET invoice ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { invoice: InvoiceResponse }).invoice;
}

function viewportKind(page: Page): 'desktop' | 'mobile' {
  return (page.viewportSize()?.width ?? 1440) <= 767 ? 'mobile' : 'desktop';
}

/** Matches an amount input value like "6300" or "6300.00". */
function amountValue(amount: number): RegExp {
  return new RegExp(`^${amount}(\\.00)?$`);
}

/** Today as the browser sees it (YYYY-MM-DD). */
async function browserToday(page: Page): Promise<string> {
  return page.evaluate(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
}

/** Selects the mocked document through the picker modal that the Document card opens. */
async function pickMockDocument(page: Page, convert: InvoiceConvertPage): Promise<void> {
  await convert.selectDocument.click();
  const picker = new PaperlessPickerModal(page);
  await picker.waitForVisible();
  await picker.selectDocument(MOCK_DOC.title);
  await expect(convert.selectedDocument).toContainText(MOCK_DOC.title);
}

/** Counts POSTs to convert-quotation. */
function trackConvertPosts(page: Page): { count: () => number } {
  let posts = 0;
  page.on('request', (request) => {
    if (request.url().includes('/convert-quotation') && request.method() === 'POST') posts += 1;
  });
  return { count: () => posts };
}

// ─────────────────────────────────────────────────────────────────────────────
// C1: Entry point
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - entry point (C1)', { tag: '@responsive' }, () => {
  test(
    'The offer page links to the Convert page, which shows the grouped lines',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detail = new InvoiceDetailPage(page);
      const convert = new InvoiceConvertPage(page);
      let fixture: Fixture | null = null;
      try {
        fixture = await createQuotation(page, testPrefix);
        await detail.goto(fixture.invoiceId);
        await expect(detail.convertButton).toHaveText('Convert to final invoice');
        await expect(detail.convertButton).toHaveAttribute(
          'href',
          `/budget/invoices/${fixture.invoiceId}/convert`,
        );

        await detail.convertButton.click();
        await expect(page).toHaveURL(new RegExp(`/budget/invoices/${fixture.invoiceId}/convert$`));
        await expect(convert.root).toBeVisible();
        await expect(convert.heading).toHaveText('Convert to final invoice');
        await expect(convert.heading).toBeFocused();
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

        // Money › Invoices › ‹company› · ‹number› (a single link below 1024px)
        await convert.breadcrumbs.expectTrail([
          'Money',
          'Invoices',
          `${testPrefix} Convert Vendor · ${testPrefix.substring(0, 8)}-Q`,
        ]);

        // Lines are grouped under the task they belong to
        await expect(convert.linesCard).toContainText(`${testPrefix} Convert WI`);
        for (const id of fixture.lineIds) await expect(convert.lineInput(id)).toBeVisible();
        if ((page.viewportSize()?.width ?? 0) >= 768) {
          for (const name of ['Offered', 'Proposed', 'Keep']) {
            await expect(page.getByRole('columnheader', { name })).toBeVisible();
          }
        }

        await expect(convert.confirm).toHaveText('Convert to final invoice');
      } finally {
        await cleanup(page, fixture);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// C2: Happy path
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - happy path (C2)', () => {
  test('Convert with pro-rata lines: same invoice, To pay, lines 6,300 / 3,150', async ({
    page,
    testPrefix,
  }) => {
    const detail = new InvoiceDetailPage(page);
    const convert = new InvoiceConvertPage(page);
    const invoices = new InvoicesPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      const [line1, line2] = fixture.lineIds as [string, string];
      await detail.goto(fixture.invoiceId);
      await detail.convertButton.click();
      await expect(convert.root).toBeVisible();

      await expect(convert.finalAmount).toHaveValue(amountValue(10000));
      await convert.finalAmount.fill('10500');
      await expect(convert.difference).toContainText('more than the offer');

      // Pro-rata proposal: 6000 * 1.05 and 3000 * 1.05, remainder 1,050
      await expect(convert.lineInput(line1)).toHaveValue(amountValue(6300));
      await expect(convert.lineInput(line2)).toHaveValue(amountValue(3150));
      await expect(convert.remainder()).toContainText('1,050.00 not yet split');
      await expect(convert.proposedTotal()).toContainText('9,450.00');

      await convert.invoiceNumber.fill(`${testPrefix.substring(0, 8)}-FINAL`);
      await convert.date.fill('2026-03-01');

      expect(await convert.convert()).toBe(200);

      // Same invoice id, a toast, the h1 takes focus, the header has no offer state any more
      await expect(page).toHaveURL(
        (url) => url.pathname === `/budget/invoices/${fixture!.invoiceId}`,
      );
      await expect(convert.toasts.successToast).toContainText(
        'Offer converted to a final invoice.',
      );
      await expect(detail.statusBadge).toContainText('To pay');
      await expect(detail.convertButton).toHaveCount(0);
      await expect(detail.heading).toBeFocused();
      await expect(detail.summary.fact('amount')).toContainText('10,500.00');
      await expect(detail.budgetLinesSection).toContainText('6,300.00');
      await expect(detail.budgetLinesSection).toContainText('3,150.00');

      // Back does not reopen the Convert page as a form
      await page.goBack();
      await expect(convert.root).toHaveCount(0);

      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.id).toBe(fixture.invoiceId);
      expect(invoice.status).toBe('pending');
      expect(invoice.amount).toBe(10500);
      expect(invoice.notes).toContain('Original quotation notes');
      expect(invoice.notes).toContain('Converted from offer of');
      const byId = new Map(invoice.budgetLines.map((l) => [l.id, l.itemizedAmount]));
      expect(byId.get(line1)).toBe(6300);
      expect(byId.get(line2)).toBe(3150);

      // AC4: the list shows the record under To pay and no longer under Offers
      const number = `${testPrefix.substring(0, 8)}-FINAL`;
      await invoices.gotoChip('pending', `q=${number}`);
      await expect(invoices.row(fixture.invoiceId)).toBeVisible();
      await invoices.gotoChip('quotation', `q=${number}`);
      await expect(invoices.row(fixture.invoiceId)).toHaveCount(0);
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C3: Keep all offered amounts, Reset to proposal
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - keep offered amounts (C3)', () => {
  test('Keep all offered amounts leaves the lines unchanged; the remainder is 500', async ({
    page,
    testPrefix,
  }) => {
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      const [line1, line2] = fixture.lineIds as [string, string];
      await convert.goto(fixture.invoiceId);

      await convert.keepAll.getByRole('checkbox').check();
      await convert.finalAmount.fill('9500');
      await expect(convert.lineKeep(line1)).toBeChecked();
      await expect(convert.lineInput(line1)).toHaveValue(amountValue(6000));
      await expect(convert.lineInput(line2)).toHaveValue(amountValue(3000));
      await expect(convert.remainder()).toContainText('500.00 not yet split');

      expect(await convert.convert()).toBe(200);
      await expect(page).toHaveURL(
        (url) => url.pathname === `/budget/invoices/${fixture!.invoiceId}`,
      );

      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.amount).toBe(9500);
      const amounts = invoice.budgetLines.map((l) => l.itemizedAmount).sort((a, b) => a - b);
      expect(amounts).toEqual([3000, 6000]);
    } finally {
      await cleanup(page, fixture);
    }
  });

  test('Reset to proposal restores the pro-rata amounts of an edited line', async ({
    page,
    testPrefix,
  }) => {
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      const [line1, line2] = fixture.lineIds as [string, string];
      await convert.goto(fixture.invoiceId);

      await convert.finalAmount.fill('10500');
      await expect(convert.lineInput(line1)).toHaveValue(amountValue(6300));
      await convert.lineInput(line1).fill('5000');
      await expect(convert.lineInput(line1)).toHaveValue('5000');

      await convert.resetProposal.click();
      await expect(convert.lineInput(line1)).toHaveValue(amountValue(6300));
      await expect(convert.lineInput(line2)).toHaveValue(amountValue(3150));
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C4: Over-allocation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - over-allocation (C4)', () => {
  test('A line above the final amount blocks Convert; clicking it posts nothing', async ({
    page,
    testPrefix,
  }) => {
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      await convert.goto(fixture.invoiceId);
      await expect(convert.confirm).not.toHaveAttribute('aria-disabled', 'true');
      const posts = trackConvertPosts(page);

      await convert.lineInput(fixture.lineIds[0]!).fill('9000');
      await expect(convert.remainder()).toContainText('more than the final amount');
      await expect(convert.confirm).toHaveAttribute('aria-disabled', 'true');
      await expect(convert.problems).toBeVisible();

      // aria-disabled (not disabled): the click goes through, focuses a line and posts nothing
      await convert.confirm.click({ force: true });
      await expect(page.locator('input[data-convert-input]:focus')).toHaveCount(1);
      expect(posts.count()).toBe(0);

      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.status).toBe('quotation');
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C5: Stale due date
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - stale due date (C5)', () => {
  test('A past due date shows the field error at once and blocks Convert until fixed', async ({
    page,
    testPrefix,
  }) => {
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [], dueDate: '2026-02-01' });
      await convert.goto(fixture.invoiceId);

      // The invoice date defaults to today, so the stored due date is before it
      await expect(convert.dueDate).toHaveAttribute('aria-invalid', 'true');
      await expect(convert.confirm).toHaveAttribute('aria-disabled', 'true');

      await convert.dueDate.fill('2099-12-31');
      await expect(convert.dueDate).not.toHaveAttribute('aria-invalid', 'true');
      await expect(convert.confirm).not.toHaveAttribute('aria-disabled', 'true');

      expect(await convert.convert()).toBe(200);
      await expect(page).toHaveURL(
        (url) => url.pathname === `/budget/invoices/${fixture!.invoiceId}`,
      );
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C6: No cost lines
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - no cost lines (C6)', () => {
  test('Shows the empty state and the conversion succeeds', async ({ page, testPrefix }) => {
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await convert.goto(fixture.invoiceId);

      await expect(convert.linesEmpty).toBeVisible();
      await expect(convert.payments).toHaveCount(0);
      expect(await convert.convert()).toBe(200);
      await expect(new InvoiceDetailPage(page).statusBadge).toContainText('To pay');

      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.status).toBe('pending');
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C7 / C7b: Refund due
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - refund due (C7, C7b)', () => {
  test('Progress payments above the final amount show Refund due; Add refund round trip', async ({
    page,
    testPrefix,
  }) => {
    const detail = new InvoiceDetailPage(page);
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      await createDepositViaApi(page, fixture.invoiceId, {
        amount: 6000,
        dueDate: '2026-02-01',
        status: 'paid',
        paidDate: '2026-02-01',
      });
      await convert.goto(fixture.invoiceId);

      await expect(convert.payments).toBeVisible();
      await expect(convert.refundDue).toHaveCount(0);
      await convert.finalAmount.fill('5000');
      await expect(convert.refundDue).toBeVisible();
      await expect(convert.refundDue).toContainText('1,000.00');
      await expect(convert.confirm).not.toHaveAttribute('aria-disabled', 'true');

      // Add refund opens the shared dialog prefilled as a refund due today
      await convert.addRefund.click();
      await expect(detail.depositEntryTypeRefundRadio).toBeChecked();
      await expect(detail.depositAmountInput).toHaveValue(amountValue(1000));
      await expect(detail.depositDueDateInput).toHaveValue(await browserToday(page));

      await detail.saveDepositForm(201);

      // The recorded row appears, focus lands on it, the form state is retained
      await expect(convert.refundRecorded).toBeVisible();
      await expect(convert.refundRecorded).toBeFocused();
      await expect(convert.refundDue).toHaveCount(0);
      await expect(convert.finalAmount).toHaveValue(amountValue(5000));

      expect(await convert.convert()).toBe(200);
      await expect(page).toHaveURL(
        (url) => url.pathname === `/budget/invoices/${fixture!.invoiceId}`,
      );

      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.deposits.find((d) => d.entryType === 'deposit')?.amount).toBe(6000);
      expect(invoice.deposits.find((d) => d.entryType === 'refund')?.amount).toBe(1000);
      expect(invoice.amount).toBe(5000);
    } finally {
      await cleanup(page, fixture);
    }
  });

  test('C7b: Convert succeeds with a Refund due and no refund; nothing is auto-refunded', async ({
    page,
    testPrefix,
  }) => {
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await createDepositViaApi(page, fixture.invoiceId, {
        amount: 6000,
        dueDate: '2026-02-01',
        status: 'paid',
        paidDate: '2026-02-01',
      });
      await convert.goto(fixture.invoiceId);

      await convert.finalAmount.fill('5000');
      await expect(convert.refundDue).toBeVisible();
      await expect(convert.confirm).not.toHaveAttribute('aria-disabled', 'true');

      expect(await convert.convert()).toBe(200);
      await expect(page).toHaveURL(
        (url) => url.pathname === `/budget/invoices/${fixture!.invoiceId}`,
      );

      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.amount).toBe(5000);
      expect(invoice.deposits).toHaveLength(1);
      expect(invoice.deposits[0]?.entryType).toBe('deposit');
      expect(invoice.deposits[0]?.amount).toBe(6000);
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C8: Paid
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - already paid (C8)', () => {
  test('Choosing Paid converts straight to Paid, which the list shows under its chip', async ({
    page,
    testPrefix,
  }) => {
    const convert = new InvoiceConvertPage(page);
    const invoices = new InvoicesPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await convert.goto(fixture.invoiceId);

      await expect(convert.statusPending).toBeChecked();
      await convert.statusPaid.check();
      expect(await convert.convert()).toBe(200);
      await expect(new InvoiceDetailPage(page).statusBadge).toContainText('Paid');

      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.status).toBe('paid');

      await invoices.gotoChip('paid', `q=${testPrefix.substring(0, 8)}-Q`);
      await expect(invoices.row(fixture.invoiceId)).toBeVisible();
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C9: Cancel
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - cancel (C9)', () => {
  test('Cancel on a clean form returns to the offer at once', async ({ page, testPrefix }) => {
    const convert = new InvoiceConvertPage(page);
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await detail.goto(fixture.invoiceId);
      await detail.convertButton.click();
      await expect(convert.root).toBeVisible();

      await convert.cancel.click();
      await expect(convert.discardDialog.dialog).toHaveCount(0);
      await expect(page).toHaveURL(
        (url) => url.pathname === `/budget/invoices/${fixture!.invoiceId}`,
      );
      await expect(detail.convertButton).toBeVisible();
    } finally {
      await cleanup(page, fixture);
    }
  });

  test('Cancel with edits asks "Discard changes?"; Keep editing stays, Discard leaves', async ({
    page,
    testPrefix,
  }) => {
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await convert.goto(fixture.invoiceId);
      await convert.finalAmount.fill('777');

      await convert.cancel.click();
      await expect(convert.discardDialog.dialog).toBeVisible();
      await expect(convert.discardDialog.dialog).toContainText('Discard changes?');

      // Keep editing
      await convert.discardDialog.cancelButton.click();
      await expect(convert.discardDialog.dialog).toHaveCount(0);
      await expect(convert.root).toBeVisible();
      await expect(convert.finalAmount).toHaveValue('777');

      // Discard
      await convert.cancel.click();
      await convert.discardDialog.confirmButton.click();
      await expect(page).toHaveURL(
        (url) => url.pathname === `/budget/invoices/${fixture!.invoiceId}`,
      );

      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.status).toBe('quotation');
      expect(invoice.amount).toBe(10000);
      expect(invoice.notes).toBe('Original quotation notes');
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C10: Paperless not configured
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - Paperless not configured (C10)', () => {
  test('Hides the Document card entirely; manual conversion still succeeds', async ({
    page,
    testPrefix,
  }) => {
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await convert.goto(fixture.invoiceId);

      await expect(convert.details).toBeVisible();
      await expect(convert.document).toHaveCount(0);
      await expect(convert.selectDocument).toHaveCount(0);
      await expect(convert.readAmounts).toHaveCount(0);
      await expect(convert.root.getByText(/not configured|PAPERLESS_/i)).toHaveCount(0);

      expect(await convert.convert()).toBe(200);
      await expect(new InvoiceDetailPage(page).statusBadge).toContainText('To pay');
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C11: Paperless + AI prefill
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - Paperless document and Read amounts (C11)', () => {
  test('Read amounts pre-fills untouched fields; Convert links the document as the invoice', async ({
    page,
    testPrefix,
  }) => {
    test.skip(viewportKind(page) === 'mobile', 'Desktop/tablet layout');
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      await mockPaperlessConfigured(page);
      await mockLlmEnabled(page, true);
      await mockPickerBackend(page);
      await mockPreviewOk(page);

      await convert.goto(fixture.invoiceId);
      await expect(convert.document).toBeVisible();
      await expect(convert.readAmounts).toHaveAttribute('aria-disabled', 'true');
      await pickMockDocument(page, convert);
      await expect(convert.readAmounts).not.toHaveAttribute('aria-disabled', 'true');

      await convert.readAmounts.click();
      await expect(convert.readStatus).toContainText('Document read');
      await expect(convert.finalAmount).toHaveValue(amountValue(10200));
      await expect(convert.date).toHaveValue('2026-03-10');
      await expect(convert.dueDate).toHaveValue('2026-04-10');
      // Seeded invoice number and notes are protected: values kept, suggestions offered
      await expect(convert.invoiceNumber).toHaveValue(`${testPrefix.substring(0, 8)}-Q`);
      await expect(convert.notes).toHaveValue('Original quotation notes');
      await expect(convert.suggestion('invoiceNumber')).toBeVisible();
      await expect(convert.suggestion('notes')).toBeVisible();

      await convert.suggestion('invoiceNumber').click();
      await expect(convert.invoiceNumber).toHaveValue('FINAL-2026-777');
      await expect(convert.suggestion('invoiceNumber')).toHaveCount(0);
      // Lines were re-proposed pro rata from the pre-filled amount (x1.02)
      await expect(convert.lineInput(fixture.lineIds[0]!)).toHaveValue(amountValue(6120));

      expect(await convert.convert()).toBe(200);
      await expect(page).toHaveURL(
        (url) => url.pathname === `/budget/invoices/${fixture!.invoiceId}`,
      );

      const linksResp = await page.request.get(
        `/api/document-links?entityType=invoice&entityId=${fixture.invoiceId}`,
      );
      expect(linksResp.ok()).toBeTruthy();
      const links = (
        (await linksResp.json()) as {
          documentLinks: Array<{ paperlessDocumentId: number; attachmentType: string | null }>;
        }
      ).documentLinks;
      const link = links.find((l) => l.paperlessDocumentId === MOCK_DOC.id);
      expect(link, 'document link created by conversion').toBeDefined();
      expect(link?.attachmentType).toBe('invoice');

      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.invoiceNumber).toBe('FINAL-2026-777');
      expect(invoice.notes).not.toContain('Extracted note from document');
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C12: Suggestion when edited first
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - suggestion for an edited field (C12)', () => {
  test('An edited amount is kept and a suggestion is offered; Apply sets it', async ({
    page,
    testPrefix,
  }) => {
    test.skip(viewportKind(page) === 'mobile', 'Desktop/tablet layout');
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await mockPaperlessConfigured(page);
      await mockLlmEnabled(page, true);
      await mockPickerBackend(page);
      await mockPreviewOk(page);

      await convert.goto(fixture.invoiceId);
      await convert.finalAmount.fill('9900');
      await pickMockDocument(page, convert);
      await convert.readAmounts.click();
      await expect(convert.readStatus).toContainText('Document read');

      await expect(convert.finalAmount).toHaveValue('9900');
      await expect(convert.date).toHaveValue('2026-03-10');
      await expect(convert.suggestion('amount')).toBeVisible();

      await convert.suggestion('amount').click();
      await expect(convert.finalAmount).toHaveValue(amountValue(10200));
      await expect(convert.suggestion('amount')).toHaveCount(0);
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C13: AI failure
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - read failure (C13)', () => {
  test('An AI error keeps typed values, offers Try again, and manual conversion succeeds', async ({
    page,
    testPrefix,
  }) => {
    test.skip(viewportKind(page) === 'mobile', 'Desktop/tablet layout');
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await mockPaperlessConfigured(page);
      await mockLlmEnabled(page, true);
      await mockPickerBackend(page);
      await mockPreviewFailure(page);

      await convert.goto(fixture.invoiceId);
      await convert.finalAmount.fill('9800');
      await convert.invoiceNumber.fill('TYPED-1');
      await pickMockDocument(page, convert);

      await convert.readAmounts.click();
      await expect(convert.readError).toBeVisible();
      await expect(convert.readRetry).toBeVisible();
      await expect(convert.finalAmount).toHaveValue('9800');
      await expect(convert.invoiceNumber).toHaveValue('TYPED-1');

      expect(await convert.convert()).toBe(200);
      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.amount).toBe(9800);
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C14: LLM off
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - AI unavailable (C14)', () => {
  test('llmEnabled=false hides Read amounts; picking a document still works', async ({
    page,
    testPrefix,
  }) => {
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await mockPaperlessConfigured(page);
      await mockLlmEnabled(page, false);
      await mockPickerBackend(page);

      await convert.goto(fixture.invoiceId);
      await expect(convert.selectDocument).toBeVisible();
      await expect(convert.readAmounts).toHaveCount(0);
      await pickMockDocument(page, convert);
      await expect(convert.readAmounts).toHaveCount(0);
      await expect(convert.removeDocument).toBeVisible();
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C15: Mobile
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - mobile layout (C15)', { tag: '@responsive' }, () => {
  test('Lines render as cards, the bar stacks Convert over Cancel at >= 44px, converting works', async ({
    page,
    testPrefix,
  }) => {
    test.skip(viewportKind(page) !== 'mobile', 'Mobile-only layout test');
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      const [line1, line2] = fixture.lineIds as [string, string];
      await convert.goto(fixture.invoiceId);

      await expect(convert.cardRow(line1)).toBeVisible();
      await expect(convert.cardRow(line2)).toBeVisible();
      await expect(convert.tableRow(line1)).toBeHidden();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'horizontal scroll').toBeLessThanOrEqual(0);

      // Stacked bar: Convert on top of Cancel, same x, both at least 44px tall
      const confirmBox = await convert.confirm.boundingBox();
      const cancelBox = await convert.cancel.boundingBox();
      expect(confirmBox).not.toBeNull();
      expect(cancelBox).not.toBeNull();
      expect(confirmBox!.height).toBeGreaterThanOrEqual(44);
      expect(cancelBox!.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(confirmBox!.x - cancelBox!.x)).toBeLessThan(2);
      expect(confirmBox!.y).toBeLessThan(cancelBox!.y);

      await convert.finalAmount.fill('10500');
      await expect(convert.lineInput(line1)).toHaveValue(amountValue(6300));

      expect(await convert.convert()).toBe(200);
      await expect(page).toHaveURL(
        (url) => url.pathname === `/budget/invoices/${fixture!.invoiceId}`,
      );
      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.amount).toBe(10500);
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C16: Tablet
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - tablet layout (C16)', { tag: '@responsive' }, () => {
  test('The table renders at 768px and the conversion succeeds', async ({ page, testPrefix }) => {
    const width = page.viewportSize()?.width ?? 1440;
    test.skip(width < 768 || width > 1023, 'Tablet-only layout test');
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      const line1 = fixture.lineIds[0]!;
      await convert.goto(fixture.invoiceId);

      await expect(convert.tableRow(line1)).toBeVisible();
      await expect(convert.cardRow(line1)).toBeHidden();

      expect(await convert.convert()).toBe(200);
      await expect(new InvoiceDetailPage(page).statusBadge).toContainText('To pay');
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C17: Dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - dark mode (C17)', () => {
  test('The Refund due block and the difference badge have a background in dark mode', async ({
    page,
    testPrefix,
  }) => {
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await createDepositViaApi(page, fixture.invoiceId, {
        amount: 6000,
        dueDate: '2026-02-01',
        status: 'paid',
        paidDate: '2026-02-01',
      });
      await page.emulateMedia({ colorScheme: 'dark' });
      await convert.goto(fixture.invoiceId);

      await convert.finalAmount.fill('5000');
      await expect(convert.refundDue).toBeVisible();
      await expect(convert.difference).toContainText('less than the offer');

      const background = (locator: typeof convert.refundDue) =>
        locator.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(await background(convert.refundDue)).not.toBe('rgba(0, 0, 0, 0)');
      expect(await background(convert.difference.locator('xpath=./*[1]'))).not.toBe(
        'rgba(0, 0, 0, 0)',
      );
      await expect(convert.confirm).toBeVisible();
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C18: Not an offer
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - not an offer (C18)', () => {
  test('A final invoice shows "Offer not found" and a link to the invoice, no redirect', async ({
    page,
    testPrefix,
  }) => {
    const convert = new InvoiceConvertPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { status: 'pending', lines: [] });
      await convert.gotoRaw(fixture.invoiceId);

      await expect(convert.heading).toHaveText('Offer not found');
      await expect(convert.notAnOffer).toBeVisible();
      const open = convert.notAnOffer.getByRole('link', { name: 'Open the invoice' });
      await expect(open).toHaveAttribute('href', `/budget/invoices/${fixture.invoiceId}`);
      await expect(page).toHaveURL(
        (url) => url.pathname === `/budget/invoices/${fixture!.invoiceId}/convert`,
      );
      await expect(convert.root).toHaveCount(0);
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C19: Home N9
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Convert page - Home attention entry (C19)', () => {
  test('An offer due within 7 days offers Convert on Home, which opens the Convert page', async ({
    page,
    testPrefix,
  }) => {
    const home = new HomePage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, {
        lines: [],
        dueDate: await browserToday(page),
      });
      await home.goto();
      // A fresh database may show the set-up checklist instead of the sections
      test.skip(await home.setup.isVisible(), 'Home is in set-up mode: no Needs attention list');
      if (await home.showAllButton.isVisible()) await home.showAllButton.click();

      const key = `N9:invoice:${fixture.invoiceId}`;
      const convertLink = page.getByTestId(`needs-attention-row-${key}-convert`);
      await expect(convertLink).toHaveAttribute(
        'href',
        `/budget/invoices/${fixture.invoiceId}/convert`,
      );
      await convertLink.click();
      await expect(new InvoiceConvertPage(page).root).toBeVisible();
    } finally {
      await cleanup(page, fixture);
    }
  });
});
