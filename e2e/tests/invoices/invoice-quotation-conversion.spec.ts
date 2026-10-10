/**
 * E2E tests for converting a quotation into the final invoice (Story #2107)
 *
 * A quotation invoice shows a "Convert to final invoice" button on the Invoice Detail page.
 * The conversion flow (ConvertQuotationModal) lets the user set the final amount, proposes
 * pro-rata amounts for the existing itemized budget lines, surfaces the deposits/final-payment
 * arithmetic, shows an advisory overpaid banner when deposits exceed the final amount (with an in-flow
 * optional "Add refund" sub-flow), and submits everything atomically via
 * POST /api/invoices/:invoiceId/convert-quotation.
 *
 * Scenarios (numbering follows the E2E spec):
 *   1.  @smoke Entry point: quotation shows the button, a pending invoice does not
 *   2.  Manual happy path (amount 10000 -> 10500, pro-rata lines 6300 / 3150)
 *   3.  Keep existing itemization
 *   4.  Over-allocation blocks Confirm
 *   5.  Quotation without budget lines
 *   6.  Overpaid deposit (advisory) -> Add refund round trip -> Confirm
 *   6b. Convert with overpaid deposits and no refund succeeds
 *   7.  Already paid (status radio)
 *   8.  Cancel and Escape discard everything
 *   9.  Paperless not configured (default env)
 *   10. Paperless document + AI prefill (mocked) and document link on convert
 *   11. Suggestion badge when the field was edited before AI
 *   12. AI failure keeps typed values, retry available, manual conversion still works
 *   13. AI unavailable (llmEnabled=false) disables AI prefill
 *   14. @responsive Mobile 375: line cards, stacked footer, 44px Confirm
 *   15. @responsive Tablet 768: table renders, conversion succeeds
 *   16. Dark mode smoke
 *   17. Keyboard: focus trap and focus restoration after the refund round trip
 *
 * Paperless and the LLM are mocked with page.route() (no container); the convert endpoint itself
 * is always the real server. There is no paid-date field in the flow (user decision) - the
 * pending/paid radios are the only status controls.
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
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

/** Selects the mocked document through the picker modal that the convert flow opens. */
async function pickMockDocument(page: Page, detail: InvoiceDetailPage): Promise<void> {
  await detail.convertSelectDocument.click();
  const picker = new PaperlessPickerModal(page);
  await picker.waitForVisible();
  await picker.selectDocument(MOCK_DOC.title);
  await expect(detail.convertSelectedDocument).toContainText(MOCK_DOC.title);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Entry point
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - entry point (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Quotation shows the Convert button; a pending invoice does not',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detail = new InvoiceDetailPage(page);
      let quotation: Fixture | null = null;
      let pending: Fixture | null = null;
      try {
        quotation = await createQuotation(page, testPrefix, { lines: [] });
        pending = await createQuotation(page, `${testPrefix}P`, { status: 'pending', lines: [] });

        await detail.goto(quotation.invoiceId);
        await expect(detail.convertButton).toBeVisible();

        await detail.goto(pending.invoiceId);
        await expect(detail.editButton).toBeVisible();
        await expect(detail.convertButton).toHaveCount(0);
      } finally {
        await cleanup(page, quotation);
        await cleanup(page, pending);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Manual happy path
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - manual happy path (Scenario 2)', () => {
  test('Convert with pro-rata lines: status Pending, amount 10,500, lines 6,300 / 3,150', async ({
    page,
    testPrefix,
  }) => {
    test.skip(viewportKind(page) === 'mobile', 'Covered for mobile in Scenario 14');
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      const [line1, line2] = fixture.lineIds as [string, string];
      await detail.goto(fixture.invoiceId);
      await detail.openConvert();

      // Prefilled with the quoted amount
      await expect(detail.convertFinalAmount).toHaveValue('10000.00');

      await detail.convertFinalAmount.fill('10500');
      await expect(detail.convertDelta).toContainText('+');
      await expect(detail.convertDelta).toContainText('5');

      // Pro-rata proposal: 6000 * 1.05 and 3000 * 1.05
      await expect(detail.lineInput(line1, 'desktop')).toHaveValue('6300.00');
      await expect(detail.lineInput(line2, 'desktop')).toHaveValue('3150.00');
      // Remainder = 10500 - 9450 = 1050
      await expect(detail.convertRemainder).toContainText('1,050.00');

      await detail.convertInvoiceNumber.fill(`${testPrefix.substring(0, 8)}-FINAL`);
      await detail.convertDate.fill('2026-03-01');

      expect(await detail.confirmConvert()).toBe(200);

      // Modal closed, page reflects the converted invoice
      await expect(detail.convertForm).toBeHidden();
      await expect(detail.statusBadge).toContainText('To pay');
      await expect(detail.convertButton).toHaveCount(0);
      await expect(detail.infoList).toContainText('10,500.00');
      await expect(detail.infoList).toContainText('Converted from quotation of');
      await expect(detail.budgetLinesSection).toContainText('6,300.00');
      await expect(detail.budgetLinesSection).toContainText('3,150.00');

      // Same invoice, status pending, persisted
      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.id).toBe(fixture.invoiceId);
      expect(invoice.status).toBe('pending');
      expect(invoice.amount).toBe(10500);
      expect(invoice.notes).toContain('Original quotation notes');
      expect(invoice.notes).toContain('Converted from quotation of');
      const byId = new Map(invoice.budgetLines.map((l) => [l.id, l.itemizedAmount]));
      expect(byId.get(line1)).toBe(6300);
      expect(byId.get(line2)).toBe(3150);
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2b: Stored due date earlier than the invoice date
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - stale due date (Scenario 2b)', () => {
  test('Past due date shows the field error and disables Confirm until fixed', async ({
    page,
    testPrefix,
  }) => {
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [], dueDate: '2026-02-01' });
      await detail.goto(fixture.invoiceId);
      await detail.openConvert();

      // Invoice date defaults to today, so the stored due date is before it
      await expect(detail.convertDueDate).toHaveAttribute('aria-invalid', 'true');
      await expect(detail.convertConfirm).toBeDisabled();

      await detail.convertDueDate.fill('2099-12-31');
      await expect(detail.convertDueDate).not.toHaveAttribute('aria-invalid', 'true');
      await expect(detail.convertConfirm).toBeEnabled();

      expect(await detail.confirmConvert()).toBe(200);
      await expect(detail.statusBadge).toContainText('To pay');
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Keep existing itemization
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - keep existing itemization (Scenario 3)', () => {
  test('Keep existing leaves line amounts unchanged; remainder is 500', async ({
    page,
    testPrefix,
  }) => {
    test.skip(viewportKind(page) === 'mobile', 'Desktop/tablet table layout');
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      await detail.goto(fixture.invoiceId);
      await detail.openConvert();

      await detail.convertKeepExisting.check();
      await detail.convertFinalAmount.fill('9500');
      await expect(detail.convertRemainder).toContainText('500.00');
      for (const id of fixture.lineIds) {
        await expect(detail.lineInput(id, 'desktop')).toBeDisabled();
      }

      expect(await detail.confirmConvert()).toBe(200);
      await expect(detail.statusBadge).toContainText('To pay');

      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.amount).toBe(9500);
      const amounts = invoice.budgetLines.map((l) => l.itemizedAmount).sort((a, b) => a - b);
      expect(amounts).toEqual([3000, 6000]);
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Over-allocation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - over-allocation (Scenario 4)', () => {
  test('A line above the final amount shows the warning and disables Confirm', async ({
    page,
    testPrefix,
  }) => {
    test.skip(viewportKind(page) === 'mobile', 'Desktop/tablet table layout');
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      await detail.goto(fixture.invoiceId);
      await detail.openConvert();

      await expect(detail.convertOverAllocated).toBeHidden();
      await expect(detail.convertConfirm).toBeEnabled();

      await detail.lineInput(fixture.lineIds[0]!, 'desktop').fill('9000');

      await expect(detail.convertOverAllocated).toBeVisible();
      await expect(detail.convertConfirm).toBeDisabled();

      // Nothing was persisted
      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.status).toBe('quotation');
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: No budget lines
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - no budget lines (Scenario 5)', () => {
  test('Shows the empty-lines note and the conversion succeeds', async ({ page, testPrefix }) => {
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await detail.goto(fixture.invoiceId);
      await detail.openConvert();

      await expect(detail.convertLinesEmpty).toBeVisible();
      expect(await detail.confirmConvert()).toBe(200);
      await expect(detail.statusBadge).toContainText('To pay');

      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.status).toBe('pending');
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Overpaid deposits -> refund -> confirm  (+ Scenario 17 keyboard)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - overpaid then refund (Scenario 6, 17)', () => {
  test('Overpaid banner is advisory; Add refund round trip still works', async ({
    page,
    testPrefix,
  }) => {
    test.skip(viewportKind(page) === 'mobile', 'Desktop/tablet layout');
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      await createDepositViaApi(page, fixture.invoiceId, {
        amount: 6000,
        dueDate: '2026-02-01',
        status: 'paid',
        paidDate: '2026-02-01',
      });
      await detail.goto(fixture.invoiceId);
      await detail.openConvert();
      await expect(page.getByRole('dialog')).toHaveCount(1);

      await detail.convertFinalAmount.fill('5000');
      await expect(detail.convertOverpaidBanner).toBeVisible();
      await expect(detail.convertOverpaidBanner).toHaveAttribute('role', 'status');
      await expect(detail.convertConfirm).toBeEnabled();

      // Scenario 17: focus trap - Tab never leaves the dialog
      await detail.convertFinalAmount.focus();
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          return !!dialog && dialog.contains(document.activeElement);
        });
        expect(inside, `Tab #${i + 1} left the dialog`).toBe(true);
      }

      // Open the refund sub-flow: only one dialog at a time
      await detail.convertAddRefund.click();
      await expect(detail.depositEntryTypeRefundRadio).toBeChecked();
      await expect(detail.depositEntryTypeRefundRadio).toBeDisabled();
      await expect(detail.depositAmountInput).toHaveValue('1000.00');
      await expect(page.getByRole('dialog')).toHaveCount(1);
      await expect(detail.convertForm).toBeHidden();

      await detail.saveDepositForm(201);

      // Back in the convert modal with state retained
      await expect(detail.convertForm).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      await expect(detail.convertFinalAmount).toHaveValue('5000');
      await expect(detail.convertOverpaidBanner).toBeHidden();
      await expect(detail.convertConfirm).toBeEnabled();
      // Focus is restored into the flow (form field after the block was resolved)
      await expect(detail.convertFinalAmount).toBeFocused();

      expect(await detail.confirmConvert()).toBe(200);
      await expect(detail.statusBadge).toContainText('To pay');

      // Deposits untouched, refund added
      await expect(detail.depositsSection).toContainText('6,000.00');
      await expect(detail.refundBadge.first()).toBeVisible();
      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.deposits.filter((d) => d.entryType === 'deposit')).toHaveLength(1);
      expect(invoice.deposits.find((d) => d.entryType === 'deposit')?.amount).toBe(6000);
      expect(invoice.deposits.find((d) => d.entryType === 'refund')?.amount).toBe(1000);
      expect(invoice.amount).toBe(5000);
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6b: Overpaid deposits, no refund -> confirm succeeds
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - overpaid without refund (Scenario 6b)', () => {
  test('Confirm succeeds with deposits above the final amount; nothing is auto-refunded', async ({
    page,
    testPrefix,
  }) => {
    test.skip(viewportKind(page) === 'mobile', 'Desktop/tablet layout');
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await createDepositViaApi(page, fixture.invoiceId, {
        amount: 6000,
        dueDate: '2026-02-01',
        status: 'paid',
        paidDate: '2026-02-01',
      });
      await detail.goto(fixture.invoiceId);
      await detail.openConvert();

      await detail.convertFinalAmount.fill('5000');
      await expect(detail.convertOverpaidBanner).toBeVisible();
      await expect(detail.convertConfirm).toBeEnabled();

      expect(await detail.confirmConvert()).toBe(200);
      await expect(detail.statusBadge).toContainText('To pay');

      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.amount).toBe(5000);
      expect(invoice.deposits).toHaveLength(1);
      expect(invoice.deposits[0]?.entryType).toBe('deposit');
      expect(invoice.deposits[0]?.amount).toBe(6000);
      expect(invoice.deposits.filter((d) => d.entryType === 'refund')).toHaveLength(0);
      await expect(detail.finalPaymentAmount).toHaveText(/^\D*0[.,]00\D*$/);
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Already paid
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - already paid (Scenario 7)', () => {
  test('Choosing "paid" converts straight to Paid status', async ({ page, testPrefix }) => {
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await detail.goto(fixture.invoiceId);
      await detail.openConvert();

      await expect(detail.convertStatusPending).toBeChecked();
      await detail.convertStatusPaid.check();
      expect(await detail.confirmConvert()).toBe(200);

      await expect(detail.statusBadge).toContainText('Paid');
      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.status).toBe('paid');
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Cancel and Escape
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - cancel and Escape (Scenario 8)', () => {
  test('Escape and Cancel discard edits; quotation stays unchanged', async ({
    page,
    testPrefix,
  }) => {
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await detail.goto(fixture.invoiceId);

      // Escape
      await detail.openConvert();
      await detail.convertFinalAmount.fill('12345');
      await detail.convertNotes.fill('scratch note');
      await page.keyboard.press('Escape');
      await expect(detail.convertForm).toBeHidden();

      await detail.openConvert();
      await expect(detail.convertFinalAmount).toHaveValue('10000.00');
      await expect(detail.convertNotes).toHaveValue('Original quotation notes');

      // Cancel button
      await detail.convertFinalAmount.fill('777');
      await detail.convertCancel.click();
      await expect(detail.convertForm).toBeHidden();
      await detail.openConvert();
      await expect(detail.convertFinalAmount).toHaveValue('10000.00');

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
// Scenario 9: Paperless not configured
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - Paperless not configured (Scenario 9)', () => {
  test('Shows the unavailable note; manual conversion still succeeds', async ({
    page,
    testPrefix,
  }) => {
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await detail.goto(fixture.invoiceId);
      await detail.openConvert();

      await expect(detail.convertPaperlessUnavailable).toBeVisible();
      await expect(detail.convertSelectDocument).toHaveCount(0);

      expect(await detail.confirmConvert()).toBe(200);
      await expect(detail.statusBadge).toContainText('To pay');
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Paperless + AI prefill
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - Paperless document and AI prefill (Scenario 10)', () => {
  test('AI prefill fills the form; convert links the document as the invoice tier', async ({
    page,
    testPrefix,
  }) => {
    test.skip(viewportKind(page) === 'mobile', 'Desktop/tablet layout');
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      await mockPaperlessConfigured(page);
      await mockLlmEnabled(page, true);
      await mockPickerBackend(page);
      await mockPreviewOk(page);

      await detail.goto(fixture.invoiceId);
      await detail.openConvert();

      await expect(detail.convertAiPrefill).toBeDisabled();
      await pickMockDocument(page, detail);
      await expect(detail.convertAiPrefill).toBeEnabled();

      await detail.convertAiPrefill.click();
      await expect(detail.convertAiSuccess).toBeVisible();
      await expect(detail.convertFinalAmount).toHaveValue('10200.00');
      await expect(detail.convertDate).toHaveValue('2026-03-10');
      await expect(detail.convertDueDate).toHaveValue('2026-04-10');
      // Non-empty invoice number and notes are protected: values kept, AI offers suggestions
      await expect(detail.convertInvoiceNumber).toHaveValue(`${testPrefix.substring(0, 8)}-Q`);
      await expect(detail.convertNotes).toHaveValue('Original quotation notes');
      const suggestionButtons = detail.convertDialog.getByRole('button', {
        name: /Apply .* suggestion/i,
      });
      await expect(suggestionButtons).toHaveCount(2);
      await detail.convertDialog
        .getByRole('button', { name: /Apply Invoice number suggestion/i })
        .click();
      await expect(detail.convertInvoiceNumber).toHaveValue('FINAL-2026-777');
      await expect(suggestionButtons).toHaveCount(1);
      // Notes suggestion is left unapplied
      // Lines were re-proposed pro rata from the prefilled amount (x1.02)
      await expect(detail.lineInput(fixture.lineIds[0]!, 'desktop')).toHaveValue('6120.00');

      expect(await detail.confirmConvert()).toBe(200);
      await expect(detail.statusBadge).toContainText('To pay');

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
      expect(invoice.notes).toContain('Original quotation notes');
      expect(invoice.notes).not.toContain('Extracted note from document');
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Suggestion when edited first
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - AI suggestion for edited field (Scenario 11)', () => {
  test('Edited amount is kept and a suggestion badge is offered; Apply sets it', async ({
    page,
    testPrefix,
  }) => {
    test.skip(viewportKind(page) === 'mobile', 'Desktop/tablet layout');
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await mockPaperlessConfigured(page);
      await mockLlmEnabled(page, true);
      await mockPickerBackend(page);
      await mockPreviewOk(page);

      await detail.goto(fixture.invoiceId);
      await detail.openConvert();
      await detail.convertFinalAmount.fill('9900');
      await pickMockDocument(page, detail);
      await detail.convertAiPrefill.click();
      await expect(detail.convertAiSuccess).toBeVisible();

      // The edited amount was kept and offered as a suggestion (invoice number and notes
      // hold fixture values, so they get suggestions too)
      await expect(detail.convertFinalAmount).toHaveValue('9900');
      await expect(detail.convertDate).toHaveValue('2026-03-10');
      const applyButton = detail.convertDialog.getByRole('button', {
        name: /Apply Final amount suggestion/i,
      });
      await expect(applyButton).toHaveCount(1);
      await expect(applyButton).toBeVisible();

      await applyButton.click();
      await expect(detail.convertFinalAmount).toHaveValue('10200.00');
      await expect(applyButton).toHaveCount(0);
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: AI failure
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - AI failure (Scenario 12)', () => {
  test('AI error keeps typed values, offers retry, and manual conversion still succeeds', async ({
    page,
    testPrefix,
  }) => {
    test.skip(viewportKind(page) === 'mobile', 'Desktop/tablet layout');
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await mockPaperlessConfigured(page);
      await mockLlmEnabled(page, true);
      await mockPickerBackend(page);
      await mockPreviewFailure(page);

      await detail.goto(fixture.invoiceId);
      await detail.openConvert();
      await detail.convertFinalAmount.fill('9800');
      await detail.convertInvoiceNumber.fill('TYPED-1');
      await pickMockDocument(page, detail);

      await detail.convertAiPrefill.click();
      await expect(detail.convertAiError).toBeVisible();
      await expect(detail.convertAiRetry).toBeVisible();
      await expect(detail.convertFinalAmount).toHaveValue('9800');
      await expect(detail.convertInvoiceNumber).toHaveValue('TYPED-1');

      expect(await detail.confirmConvert()).toBe(200);
      await expect(detail.statusBadge).toContainText('To pay');
      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.amount).toBe(9800);
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13: AI unavailable
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - AI unavailable (Scenario 13)', () => {
  test('llmEnabled=false disables the AI prefill button', async ({ page, testPrefix }) => {
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix, { lines: [] });
      await mockPaperlessConfigured(page);
      await mockLlmEnabled(page, false);
      await mockPickerBackend(page);

      await detail.goto(fixture.invoiceId);
      await detail.openConvert();

      await expect(detail.convertSelectDocument).toBeVisible();
      await expect(detail.convertAiPrefill).toBeDisabled();
      await pickMockDocument(page, detail);
      await expect(detail.convertAiPrefill).toBeDisabled();
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14: Mobile 375
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - mobile layout (Scenario 14)', { tag: '@responsive' }, () => {
  test('Lines render as cards, footer buttons stack at >= 44px, conversion succeeds', async ({
    page,
    testPrefix,
  }) => {
    test.skip(viewportKind(page) !== 'mobile', 'Mobile-only layout test');
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      const [line1, line2] = fixture.lineIds as [string, string];
      await detail.goto(fixture.invoiceId);
      await detail.openConvert();

      await expect(detail.lineCard(line1)).toBeVisible();
      await expect(detail.lineCard(line2)).toBeVisible();
      await expect(detail.lineRow(line1)).toBeHidden();

      // Stacked footer: Confirm and Cancel share the same x and Confirm is at least 44px tall
      await detail.convertConfirm.scrollIntoViewIfNeeded();
      const confirmBox = await detail.convertConfirm.boundingBox();
      const cancelBox = await detail.convertCancel.boundingBox();
      expect(confirmBox).not.toBeNull();
      expect(cancelBox).not.toBeNull();
      expect(confirmBox!.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(confirmBox!.x - cancelBox!.x)).toBeLessThan(2);
      expect(Math.abs(confirmBox!.y - cancelBox!.y)).toBeGreaterThan(20);

      await detail.convertFinalAmount.fill('10500');
      await expect(detail.lineInput(line1, 'mobile')).toHaveValue('6300.00');

      expect(await detail.confirmConvert()).toBe(200);
      await expect(detail.statusBadge).toContainText('To pay');
      const invoice = await getInvoice(page, fixture.invoiceId);
      expect(invoice.amount).toBe(10500);
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 15: Tablet 768
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - tablet layout (Scenario 15)', { tag: '@responsive' }, () => {
  test('Table renders at 768px and the conversion succeeds', async ({ page, testPrefix }) => {
    const width = page.viewportSize()?.width ?? 1440;
    test.skip(width < 768 || width > 1023, 'Tablet-only layout test');
    const detail = new InvoiceDetailPage(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createQuotation(page, testPrefix);
      const line1 = fixture.lineIds[0]!;
      await detail.goto(fixture.invoiceId);
      await detail.openConvert();

      await expect(detail.lineRow(line1)).toBeVisible();
      await expect(detail.lineCard(line1)).toBeHidden();

      expect(await detail.confirmConvert()).toBe(200);
      await expect(detail.statusBadge).toContainText('To pay');
    } finally {
      await cleanup(page, fixture);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 16: Dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quotation conversion - dark mode (Scenario 16)', () => {
  test('Modal and overpaid banner render in dark mode', async ({ page, testPrefix }) => {
    const detail = new InvoiceDetailPage(page);
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
      await detail.goto(fixture.invoiceId);
      await detail.openConvert();

      await detail.convertFinalAmount.fill('5000');
      await expect(detail.convertOverpaidBanner).toBeVisible();
      await expect(detail.convertDialog).toBeVisible();
      await expect(detail.convertConfirm).toBeEnabled();
    } finally {
      await cleanup(page, fixture);
    }
  });
});
