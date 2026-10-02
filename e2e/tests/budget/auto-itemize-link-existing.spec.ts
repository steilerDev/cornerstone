/**
 * E2E tests for Bug #2149: assigning an extracted line to an EXISTING budget line must
 * only LINK it (create the invoice_budget_lines junction row). The budget line itself is
 * never modified, and the review UI shows the linked line's ORIGINAL values read-only.
 *
 * Scenarios:
 *   1. [smoke] AutoItemizePage, work item line: link -> read-only original values, no
 *      editable description/VAT/category; edit the invoiced amount; Save -> WI line
 *      unchanged, junction itemizedAmount = edited gross amount.
 *   2. Clear restores the editable fields with the extracted values; Assign gets focus.
 *   3. Change to a second line updates the read-only values; Change gets focus after
 *      the picker closes.
 *   4. PaperlessInvoiceReviewPage, household item line: link + Save -> HI line unchanged,
 *      junction created.
 *   5. Responsive + dark mode: read-only values visible, stacked on mobile, no horizontal
 *      overflow.
 *   6. A budget line is never linked twice: the picker hides lines linked to another invoice
 *      and lines already chosen by another row of the same draft (empty state when none left).
 *
 * Mocking strategy: dry-run/preview extraction, config and Paperless document are mocked;
 * the commit always goes to the real server so DB state can be asserted via the API, except
 * Scenario 4: the Paperless-first commit needs a configured Paperless instance (503 in E2E),
 * so it is mocked and the request payload asserted instead.
 */

import { test, expect } from '../../fixtures/auth.js';
import { AutoItemizePage } from '../../pages/AutoItemizePage.js';
import { PaperlessInvoiceReviewPage } from '../../pages/PaperlessInvoiceReviewPage.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import type { Locator, Page, Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// REST helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createVendorViaApi(page: Page, name: string): Promise<string> {
  const resp = await page.request.post(API.vendors, { data: { name } });
  expect(resp.ok(), `POST vendor failed: ${resp.status()}`).toBeTruthy();
  return ((await resp.json()) as { vendor: { id: string } }).vendor.id;
}

async function deleteVendorViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${id}`);
}

async function createInvoiceViaApi(page: Page, vendorId: string, amount: number): Promise<string> {
  const resp = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', amount, date: '2026-06-01' },
  });
  expect(resp.ok(), `POST invoice failed: ${resp.status()}`).toBeTruthy();
  return ((await resp.json()) as { invoice: { id: string } }).invoice.id;
}

async function deleteInvoiceViaApi(page: Page, vendorId: string, invoiceId: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoiceId}`);
}

async function linkDocumentToInvoiceViaApi(
  page: Page,
  invoiceId: string,
  paperlessDocumentId: number,
): Promise<void> {
  const resp = await page.request.post('/api/document-links', {
    data: { entityType: 'invoice', entityId: invoiceId, paperlessDocumentId },
  });
  expect(resp.ok(), `POST /api/document-links failed ${resp.status()}`).toBeTruthy();
}

/** Custom categories have no translationKey, so the UI shows `name` verbatim. */
async function createCategoryViaApi(page: Page, name: string): Promise<string> {
  const resp = await page.request.post(API.budgetCategories, {
    data: { name, sortOrder: 999 },
  });
  expect(resp.ok(), `POST category failed: ${resp.status()}`).toBeTruthy();
  return ((await resp.json()) as { budgetCategory: { id: string } }).budgetCategory.id;
}

async function deleteCategoryViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.budgetCategories}/${id}`);
}

interface SeedBudgetLine {
  description: string;
  plannedAmount: number;
  quantity?: number;
  budgetCategoryId: string;
  budgetSourceId: string;
}

async function createBudgetLineViaApi(
  page: Page,
  parent: 'work-items' | 'household-items',
  parentId: string,
  data: SeedBudgetLine,
): Promise<string> {
  const resp = await page.request.post(`/api/${parent}/${parentId}/budgets`, {
    data: { confidence: 'own_estimate', ...data },
  });
  expect(resp.ok(), `POST ${parent} budget failed: ${resp.status()}`).toBeTruthy();
  return ((await resp.json()) as { budget: { id: string } }).budget.id;
}

interface StoredBudgetLine {
  id: string;
  description: string | null;
  plannedAmount: number;
  quantity: number | null;
  includesVat: boolean | null;
  budgetCategory: { id: string } | null;
  budgetSource: { id: string } | null;
}

async function listBudgetLinesViaApi(
  page: Page,
  parent: 'work-items' | 'household-items',
  parentId: string,
): Promise<StoredBudgetLine[]> {
  const resp = await page.request.get(`/api/${parent}/${parentId}/budgets`);
  expect(resp.ok(), `GET ${parent} budgets failed: ${resp.status()}`).toBeTruthy();
  return ((await resp.json()) as { budgets: StoredBudgetLine[] }).budgets;
}

async function listInvoiceBudgetLinesViaApi(
  page: Page,
  invoiceId: string,
): Promise<
  Array<{
    workItemBudgetId: string | null;
    householdItemBudgetId: string | null;
    itemizedAmount: number;
  }>
> {
  const resp = await page.request.get(`/api/invoices/${invoiceId}/budget-lines`);
  expect(resp.ok(), `GET invoice budget-lines failed: ${resp.status()}`).toBeTruthy();
  return ((await resp.json()) as { budgetLines: never[] }).budgetLines;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────────────────────────────────────

async function mockConfigEnabled(page: Page): Promise<void> {
  await page.route('**/api/config', async (route: Route) => {
    try {
      const real = (await (await route.fetch()).json()) as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...real, autoItemizeEnabled: true }),
      });
    } catch {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'EUR', autoItemizeEnabled: true }),
      });
    }
  });
}

function extractedLine(opts: { description: string; categoryId: string }) {
  return {
    description: opts.description,
    quantity: 2,
    unit: 'pcs',
    unitPrice: 600,
    totalAmount: 1200,
    includesVat: false,
    vatRate: null,
    vendorName: null,
    confidence: 0.9,
    budgetSourceId: null,
    budgetCategoryId: opts.categoryId,
  };
}

/** Mock only the dry run; the commit (dryRun: false) continues to the real server. */
async function mockDryRun(
  page: Page,
  invoiceId: string,
  lineOrLines: object | object[],
): Promise<void> {
  const lines = Array.isArray(lineOrLines) ? lineOrLines : [lineOrLines];
  await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
    const body = route.request().postDataJSON() as { dryRun?: boolean } | null;
    if (body?.dryRun) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lines, warnings: [] }),
      });
    } else {
      await route.continue();
    }
  });
}

async function mockPaperlessDocument(page: Page, docId: number): Promise<void> {
  await page.route(`**/paperless/documents/${docId}`, async (route: Route) => {
    if (
      route.request().method() !== 'GET' ||
      route.request().url().includes('/thumb') ||
      route.request().url().includes('/preview')
    ) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        document: {
          id: docId,
          title: `Mock Link Invoice ${docId}`,
          content: 'link existing content',
          tags: [],
          created: '2026-01-01',
          added: '2026-01-01T00:00:00.000Z',
          modified: '2026-01-01T00:00:00.000Z',
          correspondent: 'Link Test Vendor GmbH',
          documentType: null,
          archiveSerialNumber: null,
          originalFileName: `invoice-${docId}.pdf`,
        },
      }),
    });
  });
}

async function openAutoItemizePage(
  page: Page,
  autoItemizePage: AutoItemizePage,
  invoiceId: string,
  docId: number,
): Promise<void> {
  const dryRunDone = page.waitForResponse(
    (resp) =>
      resp.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
      resp.request().method() === 'POST' &&
      resp.status() === 200,
  );
  await page.goto(`/budget/invoices/${invoiceId}/auto-itemize/${docId}`);
  await dryRunDone;
  await autoItemizePage.waitForAnalyzingDone();
}

/** Structural subset shared by both page objects for driving the picker. */
interface PickerDriver {
  lineAssignButton(index: number): Locator;
  lineChangeAssignButton(index: number): Locator;
  pickerModal: Locator;
  pickerWorkItemSearchInput: Locator;
  pickerPortalDropdown: Locator;
  pickerStep2Modal(): Locator;
  pickerBudgetLineRow(nameOrIndex: number | string | RegExp): Locator;
}

const escapeRe = (s: string): RegExp => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

/** Open the picker via `trigger`, choose the work item, then the existing budget line. */
async function pickWorkItemBudgetLine(
  pom: PickerDriver,
  trigger: Locator,
  workItemTitle: string,
  budgetLineDescription: string,
): Promise<void> {
  await trigger.click();
  await expect(pom.pickerModal).toBeVisible();
  await pom.pickerWorkItemSearchInput.fill(workItemTitle);
  const option = pom.pickerPortalDropdown.getByRole('option', { name: escapeRe(workItemTitle) });
  await option.waitFor({ state: 'visible' });
  await option.click();
  await expect(pom.pickerStep2Modal()).toBeVisible();
  const row = pom.pickerBudgetLineRow(escapeRe(budgetLineDescription));
  await row.waitFor({ state: 'visible' });
  await row.click();
  await expect(pom.pickerStep2Modal()).not.toBeVisible();
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixture seeding for the AutoItemizePage scenarios
// ─────────────────────────────────────────────────────────────────────────────

interface Seed {
  vendorId: string;
  invoiceId: string;
  workItemId: string;
  categoryAId: string;
  categoryBId: string;
  categoryAName: string;
  categoryBName: string;
  sourceId: string;
  sourceName: string;
  lineAId: string;
  lineBId: string;
  descA: string;
  descB: string;
  workItemTitle: string;
}

async function seedAutoItemize(page: Page, testPrefix: string, tag: string): Promise<Seed> {
  const categoryAName = `${testPrefix} ${tag} Cat A`;
  const categoryBName = `${testPrefix} ${tag} Cat B`;
  const sourceName = `${testPrefix} ${tag} Source`;
  const workItemTitle = `${testPrefix} ${tag} WI`;
  const descA = `${testPrefix} ${tag} Orig A`;
  const descB = `${testPrefix} ${tag} Orig B`;

  const vendorId = await createVendorViaApi(page, `${testPrefix} ${tag} Vendor`);
  const invoiceId = await createInvoiceViaApi(page, vendorId, 1700);
  const workItemId = await createWorkItemViaApi(page, { title: workItemTitle });
  const categoryAId = await createCategoryViaApi(page, categoryAName);
  const categoryBId = await createCategoryViaApi(page, categoryBName);
  const sourceId = await createBudgetSourceViaApi(page, { name: sourceName, totalAmount: 100000 });
  const lineAId = await createBudgetLineViaApi(page, 'work-items', workItemId, {
    description: descA,
    plannedAmount: 5000,
    quantity: 2,
    budgetCategoryId: categoryAId,
    budgetSourceId: sourceId,
  });
  const lineBId = await createBudgetLineViaApi(page, 'work-items', workItemId, {
    description: descB,
    plannedAmount: 3000,
    budgetCategoryId: categoryBId,
    budgetSourceId: sourceId,
  });
  return {
    vendorId,
    invoiceId,
    workItemId,
    categoryAId,
    categoryBId,
    categoryAName,
    categoryBName,
    sourceId,
    sourceName,
    lineAId,
    lineBId,
    descA,
    descB,
    workItemTitle,
  };
}

async function cleanupSeed(page: Page, seed: Partial<Seed>): Promise<void> {
  if (seed.invoiceId && seed.vendorId)
    await deleteInvoiceViaApi(page, seed.vendorId, seed.invoiceId);
  if (seed.vendorId) await deleteVendorViaApi(page, seed.vendorId);
  if (seed.workItemId) await deleteWorkItemViaApi(page, seed.workItemId);
  if (seed.sourceId) await deleteBudgetSourceViaApi(page, seed.sourceId);
  if (seed.categoryAId) await deleteCategoryViaApi(page, seed.categoryAId);
  if (seed.categoryBId) await deleteCategoryViaApi(page, seed.categoryBId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1
// ─────────────────────────────────────────────────────────────────────────────

test(
  'Scenario 1 [smoke]: linking an existing work item budget line shows its original values read-only and Save links without modifying it',
  { tag: '@smoke' },
  async ({ page, testPrefix }) => {
    if ((page.viewportSize()?.width ?? 1440) < 600) {
      test.skip(true, 'Functional test — desktop/tablet only (≥600px)');
      return;
    }
    test.setTimeout(60_000);

    const autoItemizePage = new AutoItemizePage(page);
    const seed: Partial<Seed> = {};
    try {
      Object.assign(seed, await seedAutoItemize(page, testPrefix, 'LE-S1'));
      const s = seed as Seed;
      const docId = 150001;
      await linkDocumentToInvoiceViaApi(page, s.invoiceId, docId);
      await mockConfigEnabled(page);
      await mockPaperlessDocument(page, docId);
      await mockDryRun(
        page,
        s.invoiceId,
        extractedLine({ description: 'Extracted differing text', categoryId: s.categoryBId }),
      );

      await openAutoItemizePage(page, autoItemizePage, s.invoiceId, docId);

      await pickWorkItemBudgetLine(
        autoItemizePage,
        autoItemizePage.lineAssignButton(0),
        s.workItemTitle,
        s.descA,
      );

      // Read-only ORIGINAL values of the linked line (not the extracted ones)
      await expect(autoItemizePage.lineLinkedValues(0)).toBeVisible();
      await expect(autoItemizePage.lineLinkedCategory(0)).toHaveText(s.categoryAName);
      await expect(autoItemizePage.lineLinkedSource(0)).toHaveText(s.sourceName);
      await expect(autoItemizePage.lineLinkedPlanned(0)).toContainText(/5[.,]?000/);

      // Editable description / VAT / category controls are gone
      await expect(autoItemizePage.lineDescription(0)).toHaveCount(0);
      await expect(autoItemizePage.lineVatCheckbox(0)).toHaveCount(0);
      await expect(autoItemizePage.getLineCardCategorySelect(0)).toHaveCount(0);

      // Only editable amount: gross invoiced amount (extracted 1200 net -> 1428 gross)
      await expect(autoItemizePage.lineItemizedAmountInput(0)).toBeVisible();
      await autoItemizePage.lineItemizedAmountInput(0).fill('1100');
      await expect(autoItemizePage.lineItemizedAmountInput(0)).toHaveValue('1100');

      const commitDone = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/invoices/${s.invoiceId}/auto-itemize`) &&
          resp.request().method() === 'POST' &&
          !(resp.request().postDataJSON() as { dryRun?: boolean })?.dryRun,
      );
      await autoItemizePage.saveButton.click();
      const commitResp = await commitDone;
      expect(
        commitResp.ok(),
        `commit failed ${commitResp.status()}: ${await commitResp.text().catch(() => '')}`,
      ).toBeTruthy();
      await expect(page).toHaveURL(/\/budget\/invoices\/[^/]+$/);

      // Budget line untouched; count unchanged
      await expect
        .poll(async () => (await listBudgetLinesViaApi(page, 'work-items', s.workItemId)).length)
        .toBe(2);
      const lines = await listBudgetLinesViaApi(page, 'work-items', s.workItemId);
      const lineA = lines.find((l) => l.id === s.lineAId)!;
      expect(lineA.description).toBe(s.descA);
      expect(lineA.plannedAmount).toBe(5000);
      expect(lineA.quantity).toBe(2);
      expect(lineA.budgetCategory?.id).toBe(s.categoryAId);
      expect(lineA.budgetSource?.id).toBe(s.sourceId);

      // Junction carries the edited gross amount
      await expect
        .poll(async () => {
          const links = await listInvoiceBudgetLinesViaApi(page, s.invoiceId);
          return links.find((l) => l.workItemBudgetId === s.lineAId)?.itemizedAmount;
        })
        .toBe(1100);
    } finally {
      await cleanupSeed(page, seed);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2
// ─────────────────────────────────────────────────────────────────────────────

test('Scenario 2: clearing the assignment restores the editable extracted values and focuses Assign', async ({
  page,
  testPrefix,
}) => {
  if ((page.viewportSize()?.width ?? 1440) < 600) {
    test.skip(true, 'Functional test — desktop/tablet only (≥600px)');
    return;
  }
  test.setTimeout(60_000);

  const autoItemizePage = new AutoItemizePage(page);
  const seed: Partial<Seed> = {};
  try {
    Object.assign(seed, await seedAutoItemize(page, testPrefix, 'LE-S2'));
    const s = seed as Seed;
    const docId = 150002;
    const extractedDescription = `${testPrefix} LE-S2 Extracted`;
    await mockConfigEnabled(page);
    await mockPaperlessDocument(page, docId);
    await mockDryRun(
      page,
      s.invoiceId,
      extractedLine({ description: extractedDescription, categoryId: s.categoryBId }),
    );

    await openAutoItemizePage(page, autoItemizePage, s.invoiceId, docId);
    await pickWorkItemBudgetLine(
      autoItemizePage,
      autoItemizePage.lineAssignButton(0),
      s.workItemTitle,
      s.descA,
    );
    await expect(autoItemizePage.lineLinkedValues(0)).toBeVisible();

    await autoItemizePage.lineClearAssignButton(0).click();

    // Editable fields are back, holding the ORIGINAL extracted values
    await expect(autoItemizePage.lineLinkedValues(0)).toHaveCount(0);
    await expect(autoItemizePage.lineDescription(0)).toHaveValue(extractedDescription);
    await expect(autoItemizePage.lineTotal(0)).toHaveValue('1200');
    await expect(autoItemizePage.lineVatCheckbox(0)).toBeVisible();
    await expect(autoItemizePage.lineVatCheckbox(0)).not.toBeChecked();
    await expect(autoItemizePage.getLineCardCategorySelect(0)).toHaveValue(s.categoryBId);

    // Focus moved to the re-mounted Assign button
    await expect(autoItemizePage.lineAssignButton(0)).toBeFocused();
  } finally {
    await cleanupSeed(page, seed);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3
// ─────────────────────────────────────────────────────────────────────────────

test('Scenario 3: Change swaps the linked line, updates read-only values and focuses Change', async ({
  page,
  testPrefix,
}) => {
  if ((page.viewportSize()?.width ?? 1440) < 600) {
    test.skip(true, 'Functional test — desktop/tablet only (≥600px)');
    return;
  }
  test.setTimeout(60_000);

  const autoItemizePage = new AutoItemizePage(page);
  const seed: Partial<Seed> = {};
  try {
    Object.assign(seed, await seedAutoItemize(page, testPrefix, 'LE-S3'));
    const s = seed as Seed;
    const docId = 150003;
    await mockConfigEnabled(page);
    await mockPaperlessDocument(page, docId);
    await mockDryRun(
      page,
      s.invoiceId,
      extractedLine({ description: 'Extracted S3', categoryId: s.categoryBId }),
    );

    await openAutoItemizePage(page, autoItemizePage, s.invoiceId, docId);
    await pickWorkItemBudgetLine(
      autoItemizePage,
      autoItemizePage.lineAssignButton(0),
      s.workItemTitle,
      s.descA,
    );
    await expect(autoItemizePage.lineLinkedCategory(0)).toHaveText(s.categoryAName);
    await expect(autoItemizePage.lineLinkedPlanned(0)).toContainText(/5[.,]?000/);

    await pickWorkItemBudgetLine(
      autoItemizePage,
      autoItemizePage.lineChangeAssignButton(0),
      s.workItemTitle,
      s.descB,
    );

    await expect(autoItemizePage.lineLinkedCategory(0)).toHaveText(s.categoryBName);
    await expect(autoItemizePage.lineLinkedPlanned(0)).toContainText(/3[.,]?000/);
    await expect(autoItemizePage.lineAssignedDescription(0)).toContainText(s.descB);
    await expect(autoItemizePage.lineChangeAssignButton(0)).toBeFocused();
  } finally {
    await cleanupSeed(page, seed);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: PaperlessInvoiceReviewPage + household item line
// ─────────────────────────────────────────────────────────────────────────────

test('Scenario 4: Paperless review page links an existing household item budget line without modifying it', async ({
  page,
  testPrefix,
}) => {
  if ((page.viewportSize()?.width ?? 1440) < 600) {
    test.skip(true, 'Functional test — desktop/tablet only (≥600px)');
    return;
  }
  test.slow();

  let vendorId = '';
  let householdItemId = '';
  // Household item budget lines always get the system category; the server ignores any
  // provided budgetCategoryId (householdItemBudgetService).
  const householdCategoryId = 'bc-household-items';
  let sourceId = '';
  const hiName = `${testPrefix} LE-S4 HI`;
  const desc = `${testPrefix} LE-S4 Orig HI`;

  try {
    vendorId = await createVendorViaApi(page, `${testPrefix} LE-S4 Vendor`);
    householdItemId = await createHouseholdItemViaApi(page, { name: hiName });
    sourceId = await createBudgetSourceViaApi(page, {
      name: `${testPrefix} LE-S4 Source`,
      totalAmount: 100000,
    });
    const lineId = await createBudgetLineViaApi(page, 'household-items', householdItemId, {
      description: desc,
      plannedAmount: 700,
      budgetCategoryId: householdCategoryId,
      budgetSourceId: sourceId,
    });

    const paperlessUrl = 'http://paperless.local:8000';
    const doc = {
      id: 9101,
      title: `${testPrefix} LE-S4 Doc`,
      content: 'x',
      tags: [],
      created: '2026-01-15',
      added: '2026-01-15T10:00:00Z',
      modified: '2026-01-15T10:00:00Z',
      correspondent: 'Builder Co',
      documentType: 'Invoice',
      archiveSerialNumber: 9101,
      originalFileName: 'invoice.pdf',
      pageCount: 1,
      searchHit: null,
    };
    await page.route('**/api/paperless/status', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configured: true,
          reachable: true,
          error: null,
          paperlessUrl,
          filterTag: null,
        }),
      }),
    );
    await mockConfigEnabled(page);
    await page.route('**/paperless/correspondents', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ correspondents: [] }),
      }),
    );
    await page.route('**/api/paperless/tags', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tags: [] }),
      }),
    );
    await page.route('**/api/document-links/linked-ids', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ paperlessDocumentIds: [] }),
      }),
    );
    await page.route('**/paperless/documents**', async (route: Route) => {
      const url = route.request().url();
      if (
        route.request().method() !== 'GET' ||
        url.includes('/thumb') ||
        url.includes('/preview')
      ) {
        await route.continue();
        return;
      }
      const isDetail = new URL(url).pathname.endsWith(`/documents/${doc.id}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          isDetail
            ? { document: doc }
            : {
                documents: [doc],
                pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
              },
        ),
      });
    });
    await page.route('**/api/invoices/auto-itemize/preview', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          lines: [
            extractedLine({ description: 'Extracted HI text', categoryId: householdCategoryId }),
          ],
          warnings: [],
          suggestedVendorId: vendorId,
          extractedTotal: 1000,
          extractedInvoiceDate: '2026-01-15',
          extractedInvoiceNumber: `${testPrefix}-LE-S4`,
          extractedNotes: null,
          extractedDueDate: null,
        }),
      }),
    );

    const invoicesPage = new InvoicesPage(page);
    await invoicesPage.goto();
    await invoicesPage.waitForLoaded();
    await invoicesPage.clickNewInvoice();
    const pickerModal = await invoicesPage.waitForPickerModal();
    await pickerModal.selectDocument(doc.title);
    await page.waitForURL('**/budget/invoices/new/paperless');
    const reviewPage = new PaperlessInvoiceReviewPage(page);
    await reviewPage.waitForExtractionComplete();

    // Link the household item budget line
    await reviewPage.lineAssignButton(0).click();
    await expect(reviewPage.pickerModal).toBeVisible();
    await reviewPage.pickerModal.getByRole('tab', { name: /Household Item/i }).click();
    await reviewPage.pickerModal.getByPlaceholder('Household Item').fill(hiName);
    const option = reviewPage.pickerPortalDropdown.getByRole('option', { name: escapeRe(hiName) });
    await option.waitFor({ state: 'visible' });
    await option.click();
    const row = reviewPage.pickerBudgetLineRow(escapeRe(desc));
    await row.waitFor({ state: 'visible' });
    await row.click();

    await expect(reviewPage.lineLinkedValues(0)).toBeVisible();
    await expect(reviewPage.lineLinkedCategory(0)).toHaveText('Household Items');
    await expect(reviewPage.lineLinkedSource(0)).toHaveText(`${testPrefix} LE-S4 Source`);
    await expect(reviewPage.lineLinkedPlanned(0)).toContainText(/700/);
    await expect(reviewPage.lineItemizedAmountInput(0)).toBeVisible();

    // Paperless-first commit requires a configured Paperless instance (503 otherwise), so it
    // is mocked and the request payload asserted. The server-side guarantee that an
    // assign-existing line is never modified is covered by the integration tests.
    const captured: { body?: { lines: Array<Record<string, unknown>> } } = {};
    await page.route('**/api/invoices/auto-itemize/commit', async (route: Route) => {
      captured.body = route.request().postDataJSON() as typeof captured.body;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          invoice: {
            id: 'mock-invoice-2149',
            invoiceNumber: `${testPrefix}-LE-S4`,
            amount: 1000,
            date: '2026-01-15',
            dueDate: null,
            status: 'pending',
            notes: null,
            vendorId,
            vendor: { id: vendorId, name: `${testPrefix} LE-S4 Vendor` },
            createdAt: '2026-06-15T00:00:00.000Z',
            updatedAt: '2026-06-15T00:00:00.000Z',
          },
          budgetLines: [],
          remainingAmount: 0,
        }),
      });
    });
    const commitRequest = page.waitForRequest(
      (req) => req.url().includes('/api/invoices/auto-itemize/commit') && req.method() === 'POST',
    );
    await reviewPage.confirmButton.click();
    await commitRequest;

    expect(captured.body).toBeDefined();
    const sentLines = captured.body!.lines;
    expect(sentLines).toHaveLength(1);
    const sent = sentLines[0]!;
    expect(sent.assignmentMode).toBe('assign-existing');
    expect(sent.assignedBudgetLineId).toBe(lineId);
    expect(sent.assignedBudgetLineType).toBe('household_item');
    // Linked row commits the gross itemized amount (extracted 1200 net -> 1428 gross)
    // as an already-VAT-inclusive total.
    expect(sent.includesVat).toBe(true);
    expect(sent.totalAmount as number).toBeCloseTo(1428, 2);
    expect(sent).not.toHaveProperty('linkedItemizedAmount');
    expect(sent).not.toHaveProperty('assignedBudgetLineSnapshot');
  } finally {
    if (vendorId) await deleteVendorViaApi(page, vendorId);
    if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
    if (sourceId) await deleteBudgetSourceViaApi(page, sourceId);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: responsive + dark mode (runs once, on the desktop project)
// ─────────────────────────────────────────────────────────────────────────────

test('Scenario 5: linked read-only values are visible, stacked on mobile, without horizontal overflow, and readable in dark mode', async ({
  page,
  testPrefix,
}) => {
  if ((page.viewportSize()?.width ?? 1440) < 1024) {
    test.skip(true, 'Sets its own viewports — run once on the desktop project');
    return;
  }
  test.setTimeout(60_000);

  const autoItemizePage = new AutoItemizePage(page);
  const seed: Partial<Seed> = {};
  try {
    Object.assign(seed, await seedAutoItemize(page, testPrefix, 'LE-S5'));
    const s = seed as Seed;
    const docId = 150005;
    await mockConfigEnabled(page);
    await mockPaperlessDocument(page, docId);
    await mockDryRun(
      page,
      s.invoiceId,
      extractedLine({ description: 'Extracted S5', categoryId: s.categoryBId }),
    );

    await openAutoItemizePage(page, autoItemizePage, s.invoiceId, docId);
    await pickWorkItemBudgetLine(
      autoItemizePage,
      autoItemizePage.lineAssignButton(0),
      s.workItemTitle,
      s.descA,
    );
    await expect(autoItemizePage.lineLinkedValues(0)).toBeVisible();

    // Mobile: stacked single column, no horizontal overflow
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(autoItemizePage.lineLinkedValues(0)).toBeVisible();
    await expect(autoItemizePage.lineLinkedCategory(0)).toBeVisible();
    await expect(autoItemizePage.lineLinkedSource(0)).toBeVisible();
    await expect(autoItemizePage.lineLinkedPlanned(0)).toBeVisible();
    await expect(autoItemizePage.lineItemizedAmountInput(0)).toBeVisible();

    const cat = await autoItemizePage.lineLinkedCategory(0).boundingBox();
    const src = await autoItemizePage.lineLinkedSource(0).boundingBox();
    const planned = await autoItemizePage.lineLinkedPlanned(0).boundingBox();
    expect(cat && src && planned).toBeTruthy();
    expect(src!.y).toBeGreaterThan(cat!.y);
    expect(planned!.y).toBeGreaterThan(src!.y);

    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);

    // Dark mode
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await expect(autoItemizePage.lineLinkedCategory(0)).toBeVisible();
    await expect(autoItemizePage.lineLinkedCategory(0)).toHaveText(s.categoryAName);
    await expect(autoItemizePage.lineLinkedPlanned(0)).toBeVisible();
  } finally {
    await cleanupSeed(page, seed);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: a budget line cannot be linked twice
// ─────────────────────────────────────────────────────────────────────────────

test('Scenario 6: the picker hides budget lines linked to another invoice or already chosen by another row', async ({
  page,
  testPrefix,
}) => {
  if ((page.viewportSize()?.width ?? 1440) < 600) {
    test.skip(true, 'Functional test — desktop/tablet only (≥600px)');
    return;
  }
  test.setTimeout(60_000);

  const autoItemizePage = new AutoItemizePage(page);
  const seed: Partial<Seed> = {};
  let otherInvoiceId: string | undefined;
  try {
    Object.assign(seed, await seedAutoItemize(page, testPrefix, 'LE-S6'));
    const s = seed as Seed;
    const docId = 150006;

    // Line A is already linked to a different invoice
    otherInvoiceId = await createInvoiceViaApi(page, s.vendorId, 500);
    const linkResp = await page.request.post(`/api/invoices/${otherInvoiceId}/budget-lines`, {
      data: { workItemBudgetId: s.lineAId, itemizedAmount: 100 },
    });
    expect(linkResp.ok(), `POST invoice budget-line failed: ${linkResp.status()}`).toBeTruthy();

    await mockConfigEnabled(page);
    await mockPaperlessDocument(page, docId);
    await mockDryRun(page, s.invoiceId, [
      extractedLine({ description: 'Extracted S6 row 0', categoryId: s.categoryBId }),
      extractedLine({ description: 'Extracted S6 row 1', categoryId: s.categoryBId }),
    ]);

    await openAutoItemizePage(page, autoItemizePage, s.invoiceId, docId);

    // Row 0: line A (linked elsewhere) is hidden, line B is offered; choose B
    await autoItemizePage.lineAssignButton(0).click();
    await expect(autoItemizePage.pickerModal).toBeVisible();
    await autoItemizePage.pickerWorkItemSearchInput.fill(s.workItemTitle);
    const option0 = autoItemizePage.pickerPortalDropdown.getByRole('option', {
      name: escapeRe(s.workItemTitle),
    });
    await option0.waitFor({ state: 'visible' });
    await option0.click();
    await expect(autoItemizePage.pickerStep2Modal()).toBeVisible();
    const rowB = autoItemizePage.pickerBudgetLineRow(escapeRe(s.descB));
    await rowB.waitFor({ state: 'visible' });
    await expect(autoItemizePage.pickerBudgetLineRow(escapeRe(s.descA))).toHaveCount(0);
    await rowB.click();
    await expect(autoItemizePage.pickerStep2Modal()).not.toBeVisible();
    await expect(autoItemizePage.lineLinkedValues(0)).toBeVisible();

    // Row 1: A is linked to another invoice, B is chosen by row 0 -> nothing left
    await autoItemizePage.lineAssignButton(1).click();
    await expect(autoItemizePage.pickerModal).toBeVisible();
    await autoItemizePage.pickerWorkItemSearchInput.fill(s.workItemTitle);
    const option1 = autoItemizePage.pickerPortalDropdown.getByRole('option', {
      name: escapeRe(s.workItemTitle),
    });
    await option1.waitFor({ state: 'visible' });
    await option1.click();
    await expect(autoItemizePage.pickerStep2Modal()).toBeVisible();
    await expect(autoItemizePage.pickerEmptyState()).toBeVisible();
    await expect(autoItemizePage.pickerBudgetLineRow(escapeRe(s.descA))).toHaveCount(0);
    await expect(autoItemizePage.pickerBudgetLineRow(escapeRe(s.descB))).toHaveCount(0);
  } finally {
    if (otherInvoiceId && seed.vendorId) {
      await deleteInvoiceViaApi(page, seed.vendorId, otherInvoiceId);
    }
    await cleanupSeed(page, seed);
  }
});
