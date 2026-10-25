/**
 * E2E tests for Story #2194 [P0.3] Money truth (EPIC-21).
 *
 * Scenarios (AC numbers refer to the story):
 *   1. AC1 — over-allocated source: Sources page shows "Over-allocated by" (Home no longer, #2230), the striped
 *      overflow segment has a real width (not clipped), dark mode keeps the note visible, and the
 *      note wraps under the bar.
 *   2. AC2 — company "Still to pay": paid + claimed invoices give 0 without danger colour; a
 *      pending invoice with a paid progress payment shows the remainder in both places.
 *   3. AC3 — new invoices default to "To pay" (pending) from the Invoices page and company page.
 *   4. AC4 — bank-report step 1 Claim card helper reads "to pay or paid" / "not yet submitted".
 *   5. AC5 — a net-entered linked line shows the same amount (and the same estimate) on the
 *      invoice page and on the item page (#2235: cost lines at face value).
 *   6. AC6 — what is left to split is the invoice amount minus the linked lines and the grid rows.
 *   7. AC7 — Link to offer or invoice form: compact rows with what is left, "Fully split", keyboard
 *      reachability, a refused link keeps the form open, an invoice beyond the first 50 is found.
 *   8. AC8 — Money › Overview › New › Invoice opens the create modal with status pending.
 *
 * Isolation: every entity is created with a unique synthetic name via the `testPrefix` fixture and
 * removed through the API in afterEach. All assertions are scoped to those entities because the
 * E2E database is shared.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { API, ROUTES } from '../../fixtures/testData.js';
import {
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
  createVendorViaApi,
  deleteVendorViaApi,
  createWorkItemViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { BudgetSourcesPage } from '../../pages/BudgetSourcesPage.js';
import { VendorDetailPage } from '../../pages/VendorDetailPage.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { BudgetOverviewPage } from '../../pages/BudgetOverviewPage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { ReportWizardPage } from '../../pages/ReportWizardPage.js';
import { CostLineGridDialog } from '../../pages/components/CostLineGridDialog.js';
import { CreateMenu } from '../../pages/components/CreateMenu.js';
import { ObjectFormDialog } from '../../pages/components/ObjectFormDialog.js';
import { SearchPickerControl } from '../../pages/components/SearchPickerControl.js';

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup registry + API helpers
// ─────────────────────────────────────────────────────────────────────────────

type Cleanup = () => Promise<void>;
let cleanups: Cleanup[] = [];

test.beforeEach(() => {
  cleanups = [];
});

test.afterEach(async () => {
  // Reverse order: links/invoices first, parents (vendor, work item, source) last
  for (const fn of cleanups.reverse()) {
    try {
      await fn();
    } catch {
      // best-effort cleanup; the shared DB tolerates leftovers thanks to unique names
    }
  }
});

async function makeSource(page: Page, name: string, totalAmount: number): Promise<string> {
  const id = await createBudgetSourceViaApi(page, { name, totalAmount });
  cleanups.push(() => deleteBudgetSourceViaApi(page, id));
  return id;
}

async function makeVendor(page: Page, name: string): Promise<string> {
  const id = await createVendorViaApi(page, { name });
  cleanups.push(() => deleteVendorViaApi(page, id));
  return id;
}

async function makeWorkItem(page: Page, title: string): Promise<string> {
  const id = await createWorkItemViaApi(page, { title });
  cleanups.push(() => deleteWorkItemViaApi(page, id));
  return id;
}

async function makeInvoice(
  page: Page,
  vendorId: string,
  data: {
    invoiceNumber?: string;
    amount: number;
    date: string;
    status?: 'pending' | 'paid' | 'claimed' | 'quotation';
  },
): Promise<string> {
  const resp = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', ...data },
  });
  expect(resp.ok(), `POST invoice failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { invoice: { id: string } };
  const id = body.invoice.id;
  cleanups.push(async () => {
    await page.request.delete(`${API.vendors}/${vendorId}/invoices/${id}`);
  });
  return id;
}

async function makeBudgetLine(
  page: Page,
  workItemId: string,
  data: {
    plannedAmount: number;
    description: string;
    budgetSourceId?: string;
    includesVat?: boolean;
  },
): Promise<string> {
  const resp = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
    // budgetSourceId is required by the API; default to the built-in discretionary source
    data: { confidence: 'own_estimate', budgetSourceId: 'discretionary-system', ...data },
  });
  expect(resp.ok(), `POST budget line failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { budget: { id: string } };
  return body.budget.id;
}

async function linkLine(
  page: Page,
  invoiceId: string,
  workItemBudgetId: string,
  itemizedAmount: number,
): Promise<void> {
  const resp = await page.request.post(`/api/invoices/${invoiceId}/budget-lines`, {
    data: { workItemBudgetId, itemizedAmount },
  });
  expect(resp.ok(), `POST invoice budget-line failed: ${resp.status()}`).toBeTruthy();
}

async function makePaidProgressPayment(
  page: Page,
  invoiceId: string,
  amount: number,
): Promise<void> {
  const resp = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
    data: { amount, dueDate: '2026-01-10', status: 'paid' },
  });
  expect(resp.ok(), `POST deposit failed: ${resp.status()}`).toBeTruthy();
}

async function setDarkMode(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
}

/** Matches a formatted amount like "250.00" / "250,00" regardless of locale/currency. */
function amountRegex(whole: number): RegExp {
  return new RegExp(`${whole}[.,]00`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 (AC1): over-allocated source
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money truth — over-allocated source (AC1)', { tag: '@responsive' }, () => {
  test(
    'Sources page states "Over-allocated by 250" with a visible overflow segment',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const sourceName = `${testPrefix} Money Truth Bank ${Date.now()}`;
      const sourceId = await makeSource(page, sourceName, 1000);
      const workItemId = await makeWorkItem(page, `${testPrefix} Overrun WI ${Date.now()}`);
      await makeBudgetLine(page, workItemId, {
        plannedAmount: 1250,
        includesVat: true,
        description: 'Gross line over source',
        budgetSourceId: sourceId,
      });

      // Budget › Sources
      const sourcesPage = new BudgetSourcesPage(page);
      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      const note = sourcesPage.overAllocatedNote(sourceName);
      await expect(note).toBeVisible();
      await expect(note).toContainText('Over-allocated by');
      await expect(note).toContainText(amountRegex(250));

      // The overflow segment is not clipped: it has a real, non-zero width
      const segment = sourcesPage.overflowSegment(sourceName);
      await expect(segment).toBeVisible();
      const segmentBox = await segment.boundingBox();
      expect(segmentBox).not.toBeNull();
      expect(segmentBox!.width).toBeGreaterThan(0);

      // The note sits under the bar (wraps below it, never beside/over it) and stays on screen
      const barBox = await sourcesPage.budgetBar(sourceName).boundingBox();
      const noteBox = await note.boundingBox();
      expect(barBox).not.toBeNull();
      expect(noteBox).not.toBeNull();
      expect(noteBox!.y).toBeGreaterThanOrEqual(barBox!.y + barBox!.height - 1);
      const viewport = page.viewportSize();
      if (viewport) {
        expect(noteBox!.x + noteBox!.width).toBeLessThanOrEqual(viewport.width + 1);
      }

      // Dark mode keeps the note visible
      await setDarkMode(page);
      await expect(note).toBeVisible();
      await expect(sourcesPage.overflowSegment(sourceName)).toBeVisible();

      // The Home source card is retired (#2230): the over-allocation note lives on Money only
    },
  );

  test('A source that is not over-allocated shows no overflow note', async ({
    page,
    testPrefix,
  }) => {
    const sourceName = `${testPrefix} Money Truth Fine ${Date.now()}`;
    const sourceId = await makeSource(page, sourceName, 1000);
    const workItemId = await makeWorkItem(page, `${testPrefix} Within WI ${Date.now()}`);
    await makeBudgetLine(page, workItemId, {
      plannedAmount: 400,
      includesVat: true,
      description: 'Line within source',
      budgetSourceId: sourceId,
    });

    const sourcesPage = new BudgetSourcesPage(page);
    await sourcesPage.goto();
    await sourcesPage.waitForSourcesLoaded();
    await expect(sourcesPage.sourceRow(sourceName)).toBeVisible();
    await expect(sourcesPage.overAllocatedNote(sourceName)).toHaveCount(0);
    await expect(sourcesPage.overflowSegment(sourceName)).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 (AC2): company "Still to pay"
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money truth — company Still to pay (AC2)', { tag: '@responsive' }, () => {
  test('D-06: Paid and claimed invoices give 0 without danger colour; pending minus paid progress payment gives 600', async ({
    page,
    testPrefix,
  }) => {
    const vendorId = await makeVendor(page, `${testPrefix} Money Truth Co ${Date.now()}`);
    await makeInvoice(page, vendorId, { amount: 800, date: '2026-01-05', status: 'paid' });
    await makeInvoice(page, vendorId, { amount: 700, date: '2026-01-06', status: 'claimed' });

    const vendorPage = new VendorDetailPage(page);
    await vendorPage.goto(vendorId);
    await expect(vendorPage.invoicesHeaderOutstanding).toBeVisible();

    // Both places show formatted 0
    await expect(vendorPage.outstandingBalanceValue).toContainText(/0[.,]00/);
    await expect(vendorPage.invoicesHeaderOutstanding).toContainText(/0[.,]00/);

    // No danger colour: zero values use the neutral colour of their non-danger reference
    const statColorZero = await vendorPage.outstandingBalanceValue.evaluate(
      (el) => getComputedStyle(el).color,
    );
    const neutralStatColor = await vendorPage.totalInvoicesStat
      .locator('[class*="statValue"]')
      .evaluate((el) => getComputedStyle(el).color);
    expect(statColorZero).toBe(neutralStatColor);

    const headerColorZero = await vendorPage.invoicesHeaderOutstanding.evaluate(
      (el) => getComputedStyle(el).color,
    );
    const headerNeutralColor = await vendorPage.invoicesHeaderOutstanding.evaluate(
      (el) => getComputedStyle(el.parentElement!).color,
    );
    expect(headerColorZero).toBe(headerNeutralColor);

    // Pending 1000 with a paid progress payment of 400 -> 600 still to pay
    const pendingId = await makeInvoice(page, vendorId, {
      amount: 1000,
      date: '2026-01-07',
      status: 'pending',
    });
    await makePaidProgressPayment(page, pendingId, 400);

    await page.reload();
    await expect(vendorPage.invoicesHeaderOutstanding).toContainText(amountRegex(600));
    await expect(vendorPage.outstandingBalanceValue).toContainText(amountRegex(600));

    // Non-zero is highlighted: colour now differs from the neutral reference
    const statColorOpen = await vendorPage.outstandingBalanceValue.evaluate(
      (el) => getComputedStyle(el).color,
    );
    expect(statColorOpen).not.toBe(neutralStatColor);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 (AC3): new invoices default to "To pay"
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money truth — new invoice default status (AC3)', { tag: '@responsive' }, () => {
  test('Invoices page Add Invoice defaults the status to pending', async ({ page }) => {
    const invoicesPage = new InvoicesPage(page);
    await invoicesPage.goto();
    await invoicesPage.openCreateModal();
    await expect(invoicesPage.createStatusSelect).toHaveValue('pending');
    await invoicesPage.closeCreateModal();
  });

  test('Company page Add Invoice defaults the status to pending', async ({ page, testPrefix }) => {
    const vendorId = await makeVendor(page, `${testPrefix} Default Status Co ${Date.now()}`);
    const vendorPage = new VendorDetailPage(page);
    await vendorPage.goto(vendorId);
    await vendorPage.addInvoiceButton.click();
    await expect(vendorPage.createInvoiceStatusSelect).toBeVisible();
    await expect(vendorPage.createInvoiceStatusSelect).toHaveValue('pending');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 (AC4): bank report wording
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money truth — bank report wording (AC4)', () => {
  test('Claim card helper reads "to pay or paid" and "not yet submitted"', async ({
    page,
    testPrefix,
  }) => {
    const sourceId = await makeSource(
      page,
      `${testPrefix} Report Wording Bank ${Date.now()}`,
      5000,
    );
    const wizard = new ReportWizardPage(page);
    await wizard.goto(sourceId);

    const claimCard = page
      .locator('label[class*="useCaseCard"]')
      .filter({ has: wizard.useCaseCard('claim') });
    await expect(claimCard).toBeVisible();
    await expect(claimCard).toContainText(/to pay or paid/i);
    await expect(claimCard).toContainText(/not yet submitted/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 (AC5): one amount for a linked, net-entered line on every page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money truth — one amount across pages (AC5)', { tag: '@responsive' }, () => {
  test('A net-entered linked line shows the same amount and estimate on the invoice page and the item page', async ({
    page,
    testPrefix,
  }) => {
    const vendorId = await makeVendor(page, `${testPrefix} Planned Co ${Date.now()}`);
    const invoiceId = await makeInvoice(page, vendorId, { amount: 500, date: '2026-02-01' });
    const workItemId = await makeWorkItem(page, `${testPrefix} Planned WI ${Date.now()}`);
    const lineId = await makeBudgetLine(page, workItemId, {
      plannedAmount: 100,
      includesVat: false,
      description: 'Net entered line',
    });
    await linkLine(page, invoiceId, lineId, 100);

    const invoiceDetail = new InvoiceDetailPage(page);
    await invoiceDetail.goto(invoiceId);
    await invoiceDetail.costLines.waitForLoaded();
    const invoiceRow = invoiceDetail.costLines.row('Net entered line');
    await expect(invoiceRow).toBeVisible();
    const invoiceAmount = (
      (await invoiceDetail.costLines.gross(invoiceRow).textContent()) ?? ''
    ).trim();

    const workItemDetail = new WorkItemDetailPage(page);
    await workItemDetail.goto(workItemId);
    await workItemDetail.costLines.waitForLoaded();
    const itemRow = workItemDetail.costLines.row('Net entered line');
    await expect(itemRow).toBeVisible();
    const itemAmount = ((await workItemDetail.costLines.gross(itemRow).textContent()) ?? '').trim();

    // A linked line counts at its amount on the invoice (face value, ADR-039)
    expect(invoiceAmount).toMatch(amountRegex(100));
    expect(itemAmount).toBe(invoiceAmount);
    // The net 100 is grossed up consistently: the estimate on both pages is the same 119.00
    await expect(invoiceRow).toContainText(/Estimate\s*€119\.00/);
    await expect(itemRow).toContainText(/Estimate\s*€119\.00/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 (AC6): what is left to split in the grid
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money truth — Remaining to allocate (AC6)', { tag: '@responsive' }, () => {
  test('A 100 row on an invoice of 1000 with 600 already linked leaves 300 in the grid', async ({
    page,
    testPrefix,
  }) => {
    const vendorId = await makeVendor(page, `${testPrefix} Remaining Co ${Date.now()}`);
    const invoiceId = await makeInvoice(page, vendorId, { amount: 1000, date: '2026-03-01' });

    const linkedWi = await makeWorkItem(page, `${testPrefix} Linked WI ${Date.now()}`);
    const linkedLine = await makeBudgetLine(page, linkedWi, {
      plannedAmount: 600,
      includesVat: true,
      description: 'Already linked line',
    });
    await linkLine(page, invoiceId, linkedLine, 600);

    const pickWiTitle = `${testPrefix} Pick WI ${Date.now()}`;
    await makeWorkItem(page, pickWiTitle);

    const detail = new InvoiceDetailPage(page);
    const grid = new CostLineGridDialog(page, /^Split /);
    await detail.goto(invoiceId);
    await detail.costLines.waitForLoaded();
    await expect(detail.costLines.notYetSplit()).toHaveText('Not yet split · €400.00');
    await detail.costLines.splitButton().click();
    await grid.waitForOpen();

    await grid.paste(`Line to tick\t1\tpcs\t100`);
    await grid.enteredAllGross.click();
    await grid.assignAllInput.click();
    await grid.assignAll.pick(pickWiTitle);

    await expect(grid.total).toHaveText('€100.00');
    await expect(grid.remainder).toContainText(amountRegex(300));
    await expect(grid.remainder).toContainText('Not yet split');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7 (AC7): Link to offer or invoice
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money truth — Link to offer or invoice (AC7)', { tag: '@responsive' }, () => {
  interface LinkSetup {
    workItemId: string;
    vendorId: string;
    fullInvoiceId: string;
    remInvoiceId: string;
    remInvoiceNumber: string;
    otherInvoiceId: string;
  }

  /**
   * One company, three invoices dated in 2099 so they sort first (date desc): FULL (fully split),
   * REM (500 left), OTHER (400 left). The work item under test has one unlinked 100 line.
   */
  async function setupLinkModal(page: Page, testPrefix: string): Promise<LinkSetup> {
    const stamp = Date.now();
    const vendorId = await makeVendor(page, `${testPrefix} Link Co ${stamp}`);
    const fullInvoiceId = await makeInvoice(page, vendorId, {
      invoiceNumber: `${testPrefix}-LF-${stamp}`,
      amount: 300,
      date: `2099-12-31`,
    });
    const remInvoiceNumber = `${testPrefix}-LR-${stamp}`;
    const remInvoiceId = await makeInvoice(page, vendorId, {
      invoiceNumber: remInvoiceNumber,
      amount: 500,
      date: `2099-12-30`,
    });
    const otherInvoiceId = await makeInvoice(page, vendorId, {
      invoiceNumber: `${testPrefix}-LO-${stamp}`,
      amount: 400,
      date: `2099-12-29`,
    });

    const allocWi = await makeWorkItem(page, `${testPrefix} Alloc WI ${stamp}`);
    const allocLine = await makeBudgetLine(page, allocWi, {
      plannedAmount: 300,
      includesVat: true,
      description: 'Fills invoice',
    });
    await linkLine(page, fullInvoiceId, allocLine, 300);

    const workItemId = await makeWorkItem(page, `${testPrefix} Link WI ${stamp}`);
    await makeBudgetLine(page, workItemId, {
      plannedAmount: 100,
      includesVat: true,
      description: 'Line to link',
    });

    return { workItemId, vendorId, fullInvoiceId, remInvoiceId, remInvoiceNumber, otherInvoiceId };
  }

  async function openLinkForm(page: Page, workItemId: string) {
    const wi = new WorkItemDetailPage(page);
    const link = new ObjectFormDialog(page, 'Link to offer or invoice', 'link-invoice-form');
    await wi.goto(workItemId);
    await wi.costLines.waitForLoaded();
    await wi.costLines.chooseAction(wi.costLines.row('Line to link'), 'Link to offer or invoice');
    await link.waitForOpen();
    return { wi, link, picker: new SearchPickerControl(page, 'invoiceId', link.dialog) };
  }

  test(
    'Compact rows, what is left on each invoice, "Fully split", keyboard reachable',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const s = await setupLinkModal(page, testPrefix);
      // Other workers create invoices in the shared database while this runs, and they could
      // sort ahead of ours or appear between two reads. The picker's list is therefore narrowed to
      // this test's own company (the real response, filtered), so the order is ours alone.
      await page.route(
        (url) => url.pathname === '/api/invoices',
        async (route) => {
          const response = await route.fetch();
          const body = (await response.json()) as { invoices: Array<{ vendorId: string }> };
          body.invoices = body.invoices.filter((invoice) => invoice.vendorId === s.vendorId);
          await route.fulfill({ response, json: body });
        },
      );
      const { link, picker } = await openLinkForm(page, s.workItemId);

      // Nothing is preselected; focusing the picker lists the invoices
      await picker.input.click();
      const list = picker.dropdown;
      await expect(list).toBeVisible();
      const rows = list.locator('[role="option"]');
      await expect(rows.first()).toBeVisible();
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThanOrEqual(3);

      // Compact rows, several visible without scrolling
      const listBox = await list.boundingBox();
      expect(listBox).not.toBeNull();
      let fullyVisible = 0;
      for (let i = 0; i < Math.min(rowCount, 6); i++) {
        const box = await rows.nth(i).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeLessThanOrEqual(64);
        if (box!.y + box!.height <= listBox!.y + listBox!.height + 1) fullyVisible++;
      }
      expect(fullyVisible).toBeGreaterThan(2);

      // Each row says what is left to split; the full one says "Fully split"
      const full = rows.filter({ hasText: `${testPrefix}-LF-` });
      const rem = rows.filter({ hasText: s.remInvoiceNumber });
      const other = rows.filter({ hasText: `${testPrefix}-LO-` });
      await expect(full).toContainText('Fully split');
      await expect(rem).toContainText('left to split');
      await expect(rem).toContainText(amountRegex(500));
      await expect(rem).not.toContainText('Fully split');
      await expect(other).toContainText(amountRegex(400));

      // Our own invoices keep their order: FULL before REM before OTHER
      const texts = await rows.allTextContents();
      const at = (needle: string) => texts.findIndex((text) => text.includes(needle));
      expect(at(`${testPrefix}-LF-`)).toBeGreaterThanOrEqual(0);
      expect(at(`${testPrefix}-LF-`)).toBeLessThan(at(s.remInvoiceNumber));
      expect(at(s.remInvoiceNumber)).toBeLessThan(at(`${testPrefix}-LO-`));

      // Keyboard: ArrowDown from the search input lands on the first row
      await picker.input.focus();
      await page.keyboard.press('ArrowDown');
      await expect(rows.first()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(link.dialog).toBeVisible();
    },
  );

  test('Picking a fully split invoice shows that nothing is left and the link is refused', async ({
    page,
    testPrefix,
  }) => {
    const s = await setupLinkModal(page, testPrefix);
    const { link, picker } = await openLinkForm(page, s.workItemId);

    await picker.pick(`${testPrefix}-LF-`);
    await expect(link.dialog).toContainText(/€0\.00 of this offer or invoice is not split yet/);

    await link.save();
    // Linking 100 to an invoice with nothing left is refused by the server: the form stays open
    await expect(link.dialog).toBeVisible();
    await expect(link.fieldError('itemizedAmount')).toContainText(
      'more than this offer or invoice is worth',
    );
  });

  test('An invoice beyond the first 50 is found by typing its number and can be linked', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const stamp = Date.now();
    const vendorId = await makeVendor(page, `${testPrefix} Far Co ${stamp}`);
    // 51 invoices dated after the target push it out of the 50 the list shows by default
    // (newest first). The shared database may hold more; it can only push the target further.
    const fillerNumbers = Array.from({ length: 51 }, (_, i) => `${testPrefix}-FF${i}-${stamp}`);
    for (let i = 0; i < fillerNumbers.length; i += 10) {
      await Promise.all(
        fillerNumbers
          .slice(i, i + 10)
          .map((invoiceNumber) =>
            makeInvoice(page, vendorId, { invoiceNumber, amount: 1, date: '2098-06-01' }),
          ),
      );
    }
    const farNumber = `${testPrefix}-FAR-${stamp}`;
    await makeInvoice(page, vendorId, {
      invoiceNumber: farNumber,
      amount: 500,
      date: '1990-01-01',
    });
    const workItemId = await makeWorkItem(page, `${testPrefix} Far WI ${stamp}`);
    await makeBudgetLine(page, workItemId, {
      plannedAmount: 100,
      includesVat: true,
      description: 'Line to link',
    });

    const { wi, link, picker } = await openLinkForm(page, workItemId);

    // The default list stops at 50 invoices: the far one is not in it
    await picker.input.click();
    await expect(picker.dropdown.getByRole('option').first()).toBeVisible();
    await expect(picker.option(farNumber)).toHaveCount(0);

    // Typing its number asks the server and finds it
    await picker.pick(farNumber);
    await expect(link.dialog).toContainText(/of this offer or invoice is not split yet/);

    await link.save();
    await link.waitForClosed();
    await expect(wi.costLines.stateChip(wi.costLines.row('Line to link'))).toHaveText('Invoiced');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8 (AC8): Money › Overview › New › Invoice
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Money truth — New invoice from the Money overview (AC8)',
  { tag: '@responsive' },
  () => {
    test('D-35: New › Invoice opens the manual create modal with status pending', async ({
      page,
    }) => {
      // The Money overview has no Add menu of its own (#2237): the global New menu creates
      // the invoice. The test environment has no Paperless + AI, so the manual modal is expected
      await page.goto(ROUTES.budget);
      const overview = new BudgetOverviewPage(page);
      await expect(overview.heading).toBeVisible();
      await overview.waitForLoaded();
      await expect(page.getByTestId('budget-overview-add-button')).toHaveCount(0);

      const createMenu = new CreateMenu(page);
      await createMenu.choose('invoice');

      await page.waitForURL(/\/budget\/invoices/);
      const invoicesPage = new InvoicesPage(page);
      await expect(invoicesPage.createModal).toBeVisible();
      await expect(invoicesPage.createStatusSelect).toHaveValue('pending');
      // The one-shot ?create=1 trigger is consumed
      expect(page.url()).not.toContain('create=1');
    });
  },
);
