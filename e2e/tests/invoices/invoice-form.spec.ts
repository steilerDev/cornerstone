/**
 * E2E tests for the New invoice / New offer dialog and Edit details (#2241, EPIC-21 P4.9).
 *
 * The dialog is the shared ObjectForm, opened in place by the App-root provider from the New
 * menu, the Invoices primary, the Company page and the Cost lines of a task or purchase. Save
 * creates the record (and, with "For task / purchase", one cost line for the full amount in the
 * same transaction) and opens the new invoice's page.
 *
 *   I1   New menu › Invoice: fields, defaults, Save lands on the invoice page (h1 focused)
 *   I2   New menu › Offer: no Status, saved as an offer
 *   I3   For task / purchase: hint, exactly one cost line, shown on the task / purchase
 *   I4   Offers chip: the primary reads "New offer" and opens New offer
 *   I5   Company page: company pre-filled, focus on Amount, Cancel returns focus, Save, Back
 *   I5b  Task and Purchase Cost lines: the item is pre-filled; Cancel stays on the page
 *   I6   Paperless (AI off): a picked document pre-fills date, company (exact match) and notes
 *   I6b  No company match: Company stays empty
 *   I6c  AI on: "Read amounts and lines with AI" opens the review page of the document
 *   I7   Paperless off: no document row
 *   I8   Click budget (typing is free)
 *   I9   Add another keeps Company, Status and Date; clears Number and Amount
 *   I10  Validation: Company, Amount and Due date errors; the first error is focused
 *   I11  Edit details: pre-filled, saves; an offer has no Status
 *   I12  Responsive: Modal up to 640 px from 768 px; full-screen Sheet with 44 px controls below
 *   I13  Dark mode
 *   (I14, the Convert page's "Source document" picker, lives in invoice-quotation-conversion.spec.ts)
 *
 * Data is synthetic and named with `testPrefix`; companies are deleted in `afterEach` (their
 * invoices go with them).
 */

import type { Page, Route } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createInvoice,
  createPurchase,
  createTask,
  createVendor,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import type { SeedCleanup } from '../../fixtures/costLineSeed.js';
import {
  MOCK_DOC,
  mockCorrespondents,
  mockDocumentDetail,
  mockLinkedIds,
  mockPaperlessConfigured,
  mockPreview,
  mockTags,
} from '../../fixtures/paperlessInvoiceMocks.js';
import { API, ROUTES } from '../../fixtures/testData.js';
import { CreateMenu } from '../../pages/components/CreateMenu.js';
import { InvoiceFormDialog } from '../../pages/components/InvoiceFormDialog.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { PaperlessInvoiceReviewPage } from '../../pages/PaperlessInvoiceReviewPage.js';
import { VendorDetailPage } from '../../pages/VendorDetailPage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';

let cleanup: SeedCleanup;

test.beforeEach(() => {
  cleanup = newCleanup();
});

test.afterEach(async () => {
  await runCleanup(cleanup);
});

const INVOICE_URL = /\/budget\/invoices\/[0-9a-f-]{8,}$/;

interface InvoiceResponse {
  readonly status: string;
  readonly amount: number;
  readonly invoiceNumber: string | null;
  readonly dueDate: string | null;
  readonly vendorId: string;
}

async function getInvoice(page: Page, id: string): Promise<InvoiceResponse> {
  const response = await page.request.get(`/api/invoices/${id}`);
  expect(response.ok(), `GET invoice ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { invoice: InvoiceResponse }).invoice;
}

async function costLineCount(page: Page, id: string): Promise<number> {
  const response = await page.request.get(`/api/invoices/${id}/budget-lines`);
  expect(response.ok(), `GET budget-lines ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { budgetLines: Array<{ itemizedAmount: number }> };
  return body.budgetLines.length;
}

async function itemizedAmounts(page: Page, id: string): Promise<number[]> {
  const response = await page.request.get(`/api/invoices/${id}/budget-lines`);
  const body = (await response.json()) as { budgetLines: Array<{ itemizedAmount: number }> };
  return body.budgetLines.map((line) => line.itemizedAmount);
}

/** Today as the browser sees it (YYYY-MM-DD). */
async function browserToday(page: Page): Promise<string> {
  return page.evaluate(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
}

function isWide(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 768;
}

/** Counts pointer actions as a user would make them. */
class ClickCounter {
  clicks = 0;
  async click(target: ReturnType<Page['locator']>): Promise<void> {
    this.clicks += 1;
    await target.click();
  }
}

/** Opens the New invoice dialog from the New menu (the menu navigates to the Invoices list). */
async function openFromMenu(page: Page, kind: 'invoice' | 'offer'): Promise<InvoiceFormDialog> {
  const menu = new CreateMenu(page);
  await page.goto(ROUTES.home);
  await menu.choose(kind);
  const dialog = new InvoiceFormDialog(page, kind);
  await dialog.waitForOpen();
  return dialog;
}

/** Documents the picker offers: one document of a synthetic correspondent. */
function mockedDoc(title: string, correspondent: string | null) {
  return { ...MOCK_DOC, title, correspondent, created: '2026-02-11' };
}

async function mockDocumentList(page: Page, docs: object[]): Promise<void> {
  await page.route('**/paperless/documents**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        documents: docs,
        pagination: { page: 1, pageSize: 25, totalItems: docs.length, totalPages: 1 },
      }),
    });
  });
}

async function mockIntegration(page: Page, llm: boolean): Promise<void> {
  await mockPaperlessConfigured(page);
  await page.route('**/api/config', async (route: Route) => {
    const real = (await (await route.fetch()).json()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...real, llmEnabled: llm, autoItemizeEnabled: llm }),
    });
  });
  await mockLinkedIds(page);
  await mockCorrespondents(page);
  await mockTags(page);
}

// ─────────────────────────────────────────────────────────────────────────────
// I1 / I2: the New menu
// ─────────────────────────────────────────────────────────────────────────────

test.describe('New invoice dialog - New menu (I1, I2)', { tag: '@responsive' }, () => {
  test('I1: New › Invoice shows the fields with defaults; Save opens the invoice page', async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} I1 Co`;
    await createVendor(page, cleanup, company);
    const dialog = await openFromMenu(page, 'invoice');

    await expect(dialog.heading).toHaveText('New invoice');
    await expect(dialog.company.input).toBeVisible();
    await expect(dialog.number).toBeVisible();
    await expect(dialog.amount).toBeVisible();
    await expect(dialog.date).toHaveValue(await browserToday(page));
    await expect(dialog.dueDate).toBeVisible();
    await expect(dialog.status).toHaveValue('pending');
    await expect(dialog.forItem.input).toBeVisible();
    await expect(dialog.addAnotherCheckbox).toBeVisible();
    // Notes sits behind More details
    await expect(dialog.notes).toBeHidden();
    await dialog.expandMoreDetails();
    await expect(dialog.notes).toBeVisible();
    // Without Paperless the document row is not there (I7 covers the reason)
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('invoices'));

    await dialog.fill({
      company,
      number: `${testPrefix}-I1`,
      amount: '1234.50',
      notes: `${testPrefix} note`,
    });
    const id = await dialog.saveAndGetId();

    await expect(page).toHaveURL(new RegExp(`/budget/invoices/${id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    const invoice = await getInvoice(page, id);
    expect(invoice.status).toBe('pending');
    expect(invoice.amount).toBe(1234.5);
    expect(invoice.invoiceNumber).toBe(`${testPrefix}-I1`);
  });

  test('I2: New › Offer is titled New offer, has no Status and is saved as an offer', async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} I2 Co`;
    await createVendor(page, cleanup, company);
    const dialog = await openFromMenu(page, 'offer');

    await expect(dialog.heading).toHaveText('New offer');
    await expect(dialog.status).toHaveCount(0);

    await dialog.fill({ company, amount: '9000', number: `${testPrefix}-I2` });
    const id = await dialog.saveAndGetId();

    expect((await getInvoice(page, id)).status).toBe('quotation');
    // The record is under the Offers chip
    const invoices = new InvoicesPage(page);
    await invoices.gotoChip('quotation', `q=${encodeURIComponent(`${testPrefix}-I2`)}`);
    await expect(invoices.titleLinks.filter({ hasText: `${testPrefix}-I2` })).toHaveCount(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I3: For task / purchase
// ─────────────────────────────────────────────────────────────────────────────

test.describe('New invoice dialog - For task / purchase (I3)', { tag: '@responsive' }, () => {
  test('I3: a task gets exactly one cost line for the full amount', async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} I3 Co`;
    const taskTitle = `${testPrefix} I3 Task`;
    await createVendor(page, cleanup, company);
    const taskId = await createTask(page, cleanup, taskTitle);
    const dialog = await openFromMenu(page, 'invoice');

    await dialog.fill({ company, amount: '480' });
    await dialog.pickItem(taskTitle);
    await expect(dialog.itemHint()).toContainText(taskTitle);
    await expect(dialog.itemHint()).toContainText(/One cost line of/);
    const id = await dialog.saveAndGetId();

    expect(await costLineCount(page, id)).toBe(1);
    expect(await itemizedAmounts(page, id)).toEqual([480]);

    const task = new WorkItemDetailPage(page);
    await task.goto(taskId);
    await task.costLines.waitForLoaded();
    await expect(task.costLines.rows()).toHaveCount(1);
  });

  test('I3: a purchase gets exactly one cost line for the full amount', async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} I3p Co`;
    const purchaseName = `${testPrefix} I3 Purchase`;
    await createVendor(page, cleanup, company);
    const purchaseId = await createPurchase(page, cleanup, purchaseName);
    const dialog = await openFromMenu(page, 'invoice');

    await dialog.fill({ company, amount: '75.25' });
    await dialog.pickItem(purchaseName);
    await expect(dialog.itemHint()).toContainText(purchaseName);
    const id = await dialog.saveAndGetId();

    expect(await costLineCount(page, id)).toBe(1);
    expect(await itemizedAmounts(page, id)).toEqual([75.25]);

    const purchase = new HouseholdItemDetailPage(page);
    await purchase.goto(purchaseId);
    await purchase.costLines.waitForLoaded();
    await expect(purchase.costLines.rows()).toHaveCount(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I4 / I5 / I5b: entry points
// ─────────────────────────────────────────────────────────────────────────────

test.describe('New invoice dialog - entry points (I4, I5, I5b)', { tag: '@responsive' }, () => {
  test('I4: on the Offers chip the primary reads New offer and opens New offer', async ({
    page,
  }) => {
    const invoices = new InvoicesPage(page);
    await invoices.gotoChip('quotation');
    await expect(invoices.newInvoiceButton).toHaveText('New offer');
    await invoices.clickNewInvoice();
    await invoices.offerDialog.waitForOpen();
    await expect(invoices.offerDialog.heading).toHaveText('New offer');
    await invoices.closeCreateModal();

    await invoices.selectChip('pending');
    await expect(invoices.newInvoiceButton).toHaveText('New invoice');
  });

  test('I5: Company page > New invoice starts with the company; Save, then Back', async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} I5 Co`;
    const companyId = await createVendor(page, cleanup, company);
    const vendor = new VendorDetailPage(page);
    const dialog = new InvoiceFormDialog(page, 'invoice');
    await vendor.goto(companyId);

    await vendor.newInvoiceButton.click();
    await dialog.waitForOpen();
    await expect(dialog.companyChip()).toContainText(company);
    // The first empty required field takes focus: Company is set, so Amount
    await expect(dialog.amount).toBeFocused();
    // The company page stays behind the dialog
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('company', { id: companyId }));

    // Cancel (untouched) closes it and returns focus to the button
    await dialog.cancel();
    await dialog.waitForClosed();
    await expect(vendor.newInvoiceButton).toBeFocused();

    await vendor.newInvoiceButton.click();
    await dialog.waitForOpen();
    await dialog.amount.fill('310');
    const id = await dialog.saveAndGetId();
    await expect(page).toHaveURL(new RegExp(`/budget/invoices/${id}$`));
    expect((await getInvoice(page, id)).vendorId).toBe(companyId);

    // Back returns to the company page
    const detail = new InvoiceDetailPage(page);
    await detail.breadcrumbs.expectBack(company);
    await detail.breadcrumbs.backLink.click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('company', { id: companyId }));
  });

  test('I5b: a task and a purchase Cost lines > New invoice pre-fill the item; Cancel stays', async ({
    page,
    testPrefix,
  }) => {
    const taskTitle = `${testPrefix} I5b Task`;
    const purchaseName = `${testPrefix} I5b Purchase`;
    const taskId = await createTask(page, cleanup, taskTitle);
    const purchaseId = await createPurchase(page, cleanup, purchaseName);
    const dialog = new InvoiceFormDialog(page, 'invoice');

    const task = new WorkItemDetailPage(page);
    await task.goto(taskId);
    await task.costLines.waitForLoaded();
    await task.costLines.newInvoiceButton.click();
    await dialog.waitForOpen();
    await expect(dialog.itemChip()).toContainText(taskTitle);
    await dialog.cancel();
    await dialog.waitForClosed();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('workItem', { id: taskId }));
    await expect(task.costLines.newInvoiceButton).toBeFocused();

    const purchase = new HouseholdItemDetailPage(page);
    await purchase.goto(purchaseId);
    await purchase.costLines.waitForLoaded();
    await purchase.costLines.newInvoiceButton.click();
    await dialog.waitForOpen();
    await expect(dialog.itemChip()).toContainText(purchaseName);
    await dialog.cancel();
    await dialog.waitForClosed();
    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('householdItem', { id: purchaseId }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I6 / I6b / I6c / I7: start from a document
// ─────────────────────────────────────────────────────────────────────────────

test.describe('New invoice dialog - start from a document (I6, I7)', { tag: '@responsive' }, () => {
  test('I6: picking a document pre-fills date, company and notes; Save links the document', async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} I6 Builder Co`;
    const title = `${testPrefix} I6 scan`;
    const companyId = await createVendor(page, cleanup, company);
    const doc = mockedDoc(title, company);
    await mockIntegration(page, false);
    await mockDocumentList(page, [doc]);

    const dialog = await openFromMenu(page, 'invoice');
    await dialog.pickDocument(title);

    await expect(dialog.companyChip()).toContainText(company);
    await expect(dialog.date).toHaveValue('2026-02-11');
    await expect(dialog.addedStatus).toContainText(`Filled from ${title}.`);
    await dialog.expandMoreDetails();
    await expect(dialog.notes).toHaveValue(title);
    // AI is off: the picker only pre-fills
    await expect(dialog.readWithAi).toHaveCount(0);

    await dialog.amount.fill('860');
    const id = await dialog.saveAndGetId();
    expect((await getInvoice(page, id)).vendorId).toBe(companyId);

    const links = await page.request.get(`/api/document-links?entityType=invoice&entityId=${id}`);
    expect(links.ok()).toBeTruthy();
    const body = (await links.json()) as {
      documentLinks: Array<{ paperlessDocumentId: number }>;
    };
    expect(body.documentLinks.map((link) => link.paperlessDocumentId)).toContain(doc.id);
  });

  test('I6b: a correspondent that matches no company leaves Company empty', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} I6b scan`;
    await mockIntegration(page, false);
    await mockDocumentList(page, [mockedDoc(title, `${testPrefix} Unknown Correspondent`)]);

    const dialog = await openFromMenu(page, 'invoice');
    await dialog.pickDocument(title);

    await expect(dialog.addedStatus).toContainText(`Filled from ${title}.`);
    await expect(dialog.companyChip()).toHaveCount(0);
    await expect(dialog.company.input).toBeVisible();
    await expect(dialog.date).toHaveValue('2026-02-11');
  });

  test('I6c: with AI on, "Read amounts and lines with AI" opens the review of the document', async ({
    page,
  }) => {
    await mockIntegration(page, true);
    await mockDocumentList(page, [MOCK_DOC]);
    await mockDocumentDetail(page, MOCK_DOC.id);
    await mockPreview(page);

    const dialog = await openFromMenu(page, 'invoice');
    await expect(dialog.readWithAi).toHaveCount(0);
    await dialog.pickDocument(MOCK_DOC.title);
    await expect(dialog.readWithAi).toBeVisible();

    await dialog.readWithAi.click();

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('invoicePaperlessReview') &&
        url.searchParams.get('documentId') === String(MOCK_DOC.id),
    );
    const review = new PaperlessInvoiceReviewPage(page);
    await review.waitForExtractionComplete();
    await expect(dialog.dialog).toBeHidden();
  });

  test('I7: with Paperless off there is no document row', async ({ page }) => {
    // The default test environment has no Paperless: nothing is mocked
    const dialog = await openFromMenu(page, 'invoice');
    await expect(dialog.company.input).toBeVisible();
    await expect(dialog.documentPicker.input).toHaveCount(0);
    await expect(dialog.dialog.getByText('Start from a document')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I8: click budget
// ─────────────────────────────────────────────────────────────────────────────

test.describe('New invoice dialog - click budget (I8)', { tag: '@responsive' }, () => {
  test('I8: an existing company takes 4 clicks, with a task 5, with due date and status at most 7', async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} I8 Co`;
    const taskTitle = `${testPrefix} I8 Task`;
    await createVendor(page, cleanup, company);
    await createTask(page, cleanup, taskTitle);
    const menu = new CreateMenu(page);
    const dialog = new InvoiceFormDialog(page, 'invoice');

    // 1 New, 2 Invoice, 3 the company (picked with the keyboard, counted), 4 Save
    await page.goto(ROUTES.home);
    const plain = new ClickCounter();
    await plain.click(menu.activeTrigger());
    await plain.click(menu.row('invoice'));
    await dialog.waitForOpen();
    await dialog.company.pick(company);
    plain.clicks += 1;
    await dialog.amount.fill('100');
    await dialog.saveButton.click();
    plain.clicks += 1;
    await expect(page).toHaveURL(INVOICE_URL);
    expect(plain.clicks, 'existing company').toBe(4);

    // With a task: the picker is the one extra click
    await page.goto(ROUTES.home);
    const withTask = new ClickCounter();
    await withTask.click(menu.activeTrigger());
    await withTask.click(menu.row('invoice'));
    await dialog.waitForOpen();
    await dialog.company.pick(company);
    withTask.clicks += 1;
    await dialog.amount.fill('100');
    await dialog.forItem.pick(taskTitle);
    withTask.clicks += 1;
    await dialog.saveButton.click();
    withTask.clicks += 1;
    await expect(page).toHaveURL(INVOICE_URL);
    expect(withTask.clicks, 'with a task').toBe(5);

    // Due date (typed) and a status (one click)
    await page.goto(ROUTES.home);
    const full = new ClickCounter();
    await full.click(menu.activeTrigger());
    await full.click(menu.row('invoice'));
    await dialog.waitForOpen();
    await dialog.company.pick(company);
    full.clicks += 1;
    await dialog.amount.fill('100');
    await dialog.dueDate.fill('2027-01-31');
    await dialog.status.selectOption('paid');
    full.clicks += 1;
    await dialog.saveButton.click();
    full.clicks += 1;
    await expect(page).toHaveURL(INVOICE_URL);
    expect(full.clicks, 'with due date and status').toBeLessThanOrEqual(7);
  });

  test('I8: a company created inline takes at most 9 clicks', async ({ page, testPrefix }) => {
    const typed = `${testPrefix} I8 Inline Co`;
    const menu = new CreateMenu(page);
    const dialog = new InvoiceFormDialog(page, 'invoice');

    try {
      await page.goto(ROUTES.home);
      const clicks = new ClickCounter();
      await clicks.click(menu.activeTrigger());
      await clicks.click(menu.row('invoice'));
      await dialog.waitForOpen();
      // The "New company" row (keyboard, counted), the child form's Save, then the invoice Save
      await dialog.openNewCompany(typed);
      clicks.clicks += 1;
      await clicks.click(dialog.companyChild.saveButton);
      await dialog.waitForOpen();
      await expect(dialog.companyChip()).toContainText(typed);
      await dialog.amount.fill('100');
      await clicks.click(dialog.saveButton);
      await expect(page).toHaveURL(INVOICE_URL);
      expect(clicks.clicks, 'new company inline').toBeLessThanOrEqual(9);
    } finally {
      // The company was created by the inline form: remove it (and its invoice)
      const found = await page.request.get(`${API.vendors}?q=${encodeURIComponent(typed)}`);
      const body = (await found.json()) as { vendors: Array<{ id: string; name: string }> };
      for (const vendor of body.vendors.filter((v) => v.name === typed)) {
        await page.request.delete(`${API.vendors}/${vendor.id}`);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I9: Add another
// ─────────────────────────────────────────────────────────────────────────────

test.describe('New invoice dialog - Add another (I9)', { tag: '@responsive' }, () => {
  test('I9: keeps Company, Status and Date, clears Number and Amount, focus on Amount', async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} I9 Co`;
    const companyId = await createVendor(page, cleanup, company);
    const dialog = await openFromMenu(page, 'invoice');

    await dialog.fill({
      company,
      number: `${testPrefix}-I9a`,
      amount: '55',
      date: '2026-04-02',
      status: 'paid',
    });
    await dialog.addAnotherCheckbox.check();
    await dialog.save();

    await expect(dialog.addedStatus).toContainText(`${testPrefix}-I9a`);
    await expect(dialog.addedStatus).toContainText(/Invoice .* added\./);
    await expect(dialog.companyChip()).toContainText(company);
    await expect(dialog.status).toHaveValue('paid');
    await expect(dialog.date).toHaveValue('2026-04-02');
    await expect(dialog.number).toHaveValue('');
    await expect(dialog.amount).toHaveValue('');
    await expect(dialog.amount).toBeFocused();
    // The dialog is still the Invoices page's: nothing navigated
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('invoices'));

    // The first one exists
    const list = await page.request.get(`${API.vendors}/${companyId}/invoices`);
    expect(list.ok()).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I10: validation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('New invoice dialog - validation (I10)', { tag: '@responsive' }, () => {
  test('I10: Save with nothing focuses the Company error; zero amount and an early due date fail', async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} I10 Co`;
    await createVendor(page, cleanup, company);
    const dialog = await openFromMenu(page, 'invoice');

    await dialog.save();
    await expect(dialog.fieldError('vendorId')).toBeVisible();
    await expect(dialog.fieldError('amount')).toBeVisible();
    await expect(dialog.company.input).toBeFocused();
    await expect(dialog.dialog).toBeVisible();

    await dialog.fill({ company, amount: '0', date: '2026-05-10', dueDate: '2026-05-01' });
    await dialog.save();
    await expect(dialog.fieldError('amount')).toBeVisible();
    await expect(dialog.fieldError('dueDate')).toBeVisible();
    await expect(dialog.fieldError('vendorId')).toBeHidden();
    await expect(dialog.dialog).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I11: Edit details
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Edit details (I11)', { tag: '@responsive' }, () => {
  test('I11: the form is pre-filled and saves a new amount', async ({ page, testPrefix }) => {
    const company = `${testPrefix} I11 Co`;
    const vendorId = await createVendor(page, cleanup, company);
    const invoice = await createInvoice(page, cleanup, vendorId, {
      amount: 700,
      invoiceNumber: `${testPrefix}-I11`,
      date: '2026-03-03',
      status: 'pending',
    });
    const detail = new InvoiceDetailPage(page);
    await detail.goto(invoice.id);
    await detail.openEditModal();

    const dialog = detail.editDialog;
    await expect(dialog.heading).toHaveText('Edit details');
    await expect(dialog.number).toHaveValue(`${testPrefix}-I11`);
    await expect(dialog.amount).toHaveValue(/^700(\.00)?$/);
    await expect(dialog.date).toHaveValue('2026-03-03');
    await expect(dialog.status).toHaveValue('pending');
    await expect(dialog.companyChip()).toContainText(company);
    // No document or item row, no Add another
    await expect(dialog.documentPicker.input).toHaveCount(0);
    await expect(dialog.forItem.input).toHaveCount(0);
    await expect(dialog.addAnotherCheckbox).toHaveCount(0);

    await dialog.amount.fill('725');
    await detail.saveEdit();
    expect((await getInvoice(page, invoice.id)).amount).toBe(725);
  });

  test('I11: an offer has no Status field', async ({ page, testPrefix }) => {
    const vendorId = await createVendor(page, cleanup, `${testPrefix} I11o Co`);
    const offer = await createInvoice(page, cleanup, vendorId, {
      amount: 1500,
      status: 'quotation',
      date: '2026-03-04',
    });
    const detail = new InvoiceDetailPage(page);
    await detail.goto(offer.id);
    await detail.openEditModal();

    await expect(detail.editDialog.heading).toHaveText('Edit details');
    await expect(detail.editDialog.amount).toBeVisible();
    await expect(detail.editDialog.status).toHaveCount(0);
    await detail.closeEditModal();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I12 / I13: responsive and dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('New invoice dialog - responsive and dark mode (I12, I13)', () => {
  test('I12: a Modal up to 640 px from 768 px, a full-screen Sheet with 44 px controls below', async ({
    page,
    testPrefix,
  }) => {
    await createVendor(page, cleanup, `${testPrefix} I12 Co`);
    const dialog = await openFromMenu(page, 'invoice');
    await dialog.settled();

    const viewport = page.viewportSize()!;
    const surface = await dialog.dialog.evaluate((el) => {
      // Sheet: the dialog is the panel. Modal: the dialog is the overlay, its content is child 2.
      const sheet = el.getAttribute('data-testid') === 'invoice-form-sheet';
      const target = sheet ? el : (el.children[1] as HTMLElement);
      const box = target.getBoundingClientRect();
      return { sheet, x: box.x, y: box.y, width: box.width, height: box.height };
    });

    expect(surface.sheet).toBe(!isWide(page));
    if (isWide(page)) {
      expect(surface.width).toBeLessThanOrEqual(640);
      expect(surface.height).toBeLessThan(viewport.height);
      return;
    }

    expect(surface.x).toBe(0);
    expect(surface.y).toBe(0);
    expect(surface.width).toBe(viewport.width);
    expect(surface.height).toBe(viewport.height);
    // Save is visible without scrolling and every control is a 44 px target
    await expect(dialog.saveButton).toBeInViewport();
    for (const control of [
      dialog.saveButton,
      dialog.cancelButton,
      dialog.company.input,
      dialog.number,
      dialog.amount,
      dialog.date,
      dialog.dueDate,
      dialog.status,
    ]) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.99);
    }

    // No horizontal overflow, down to 320 px
    await page.setViewportSize({ width: 320, height: viewport.height });
    await dialog.settled();
    const overflow = await dialog.dialog.evaluate((el) => ({
      panel: el.scrollWidth - el.clientWidth,
      page: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(overflow.panel).toBeLessThanOrEqual(0);
    expect(overflow.page).toBeLessThanOrEqual(0);
  });

  test('I13: dark mode renders the dialog and the status line', async ({ page, testPrefix }) => {
    const company = `${testPrefix} I13 Co`;
    await createVendor(page, cleanup, company);
    const dialog = await openFromMenu(page, 'invoice');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

    // The form's nearest painted background is dark
    const luminance = await dialog.form.evaluate((el) => {
      let node: Element | null = el;
      while (node) {
        const match = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(
          getComputedStyle(node).backgroundColor,
        );
        if (match && (match[4] === undefined || Number(match[4]) > 0)) {
          return (Number(match[1]) + Number(match[2]) + Number(match[3])) / 3;
        }
        node = node.parentElement;
      }
      return 255;
    });
    expect(luminance).toBeLessThan(110);

    // The status line after Add another is readable in the dark theme too
    await dialog.fill({ company, amount: '10' });
    await dialog.addAnotherCheckbox.check();
    await dialog.save();
    await expect(dialog.addedStatus).toContainText(/added\./);
    await expect(dialog.addedStatus).toBeVisible();
    const color = await dialog.addedStatus.evaluate((el) => getComputedStyle(el).color);
    const channels = /rgba?\((\d+), (\d+), (\d+)/.exec(color)!.slice(1).map(Number);
    expect((channels[0]! + channels[1]! + channels[2]!) / 3).toBeGreaterThan(110);
  });
});
