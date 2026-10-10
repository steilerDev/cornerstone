/**
 * E2E tests for Story #2194 [P0.3] Money truth (EPIC-21).
 *
 * Scenarios (AC numbers refer to the story):
 *   1. AC1 — over-allocated source: Sources page + Home show "Over-allocated by", the striped
 *      overflow segment has a real width (not clipped), dark mode keeps the note visible, and the
 *      note wraps under the bar.
 *   2. AC2 — company "Still to pay": paid + claimed invoices give 0 without danger colour; a
 *      pending invoice with a paid progress payment shows the remainder in both places.
 *   3. AC3 — new invoices default to "To pay" (pending) from the Invoices page and company page.
 *   4. AC4 — bank-report step 1 Claim card helper reads "to pay or paid" / "not yet submitted".
 *   5. AC5 — a net-entered linked line shows the same Planned figure on the invoice page and on
 *      the item page's invoice group.
 *   6. AC6 — invoice picker "Remaining to allocate" is the server remainder minus ticked lines.
 *   7. AC7 — Link to Invoice modal: compact rows, first invoice with remaining preselected, no
 *      warning styling on open, "Nothing left to link", keyboard reachability, neutral
 *      "Fully allocated" state with disabled link button.
 *   8. AC8 — Budget › Overview › Add › Add Invoice opens the create modal with status pending.
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
import { DashboardPage } from '../../pages/DashboardPage.js';
import { VendorDetailPage } from '../../pages/VendorDetailPage.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { BudgetOverviewPage } from '../../pages/BudgetOverviewPage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { ReportWizardPage } from '../../pages/ReportWizardPage.js';

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
    'Sources page and Home state "Over-allocated by 250" with a visible overflow segment',
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

      // Home › Source utilization
      const dashboard = new DashboardPage(page);
      await dashboard.goto();
      await dashboard.waitForCardsLoaded();
      await dashboard.openBudgetDetailsIfCollapsed();

      await expect(dashboard.sourceRow(sourceName)).toBeVisible();
      const homeNote = dashboard.sourceOverAllocatedNote(sourceName);
      await expect(homeNote).toBeVisible();
      await expect(homeNote).toContainText('Over-allocated by');
      await expect(homeNote).toContainText(amountRegex(250));

      await setDarkMode(page);
      await expect(homeNote).toBeVisible();
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
// Scenario 5 (AC5): one Planned figure for net-entered lines
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money truth — Planned figure agrees across pages (AC5)', () => {
  test('Invoice page Planned cell equals the item page invoice-group Planned for a net-entered line', async ({
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
    const plannedCell = invoiceDetail.budgetLinesSection.locator('td[class*="tdPlanned"]').first();
    await expect(plannedCell).toBeVisible();
    const invoicePlanned = ((await plannedCell.textContent()) ?? '').trim();

    const workItemDetail = new WorkItemDetailPage(page);
    await workItemDetail.goto(workItemId);
    const groupPlanned = workItemDetail.budgetSection
      .locator('[class*="amountValueMuted"]')
      .first();
    await expect(groupPlanned).toBeVisible();
    const itemPlanned = ((await groupPlanned.textContent()) ?? '').trim();

    expect(invoicePlanned).not.toBe('');
    expect(invoicePlanned).toBe(itemPlanned);
    // The net 100 is grossed up consistently, so the figure is not the raw net amount
    expect(invoicePlanned).not.toMatch(/^\D*100[.,]00\D*$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 (AC6): Remaining to allocate in the invoice picker
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money truth — Remaining to allocate (AC6)', () => {
  test('Ticking a 100 line on an invoice of 1000 with 600 already linked shows 300 remaining', async ({
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
    const pickWi = await makeWorkItem(page, pickWiTitle);
    const pickLine = await makeBudgetLine(page, pickWi, {
      plannedAmount: 100,
      includesVat: true,
      description: 'Line to tick',
    });

    const detail = new InvoiceDetailPage(page);
    await detail.goto(invoiceId);
    await expect(detail.pickerAddBudgetLineButton).toBeVisible();
    await detail.pickerAddBudgetLineButton.click();

    const modal = detail.budgetLinePickerModal;
    await modal.waitFor({ state: 'visible' });
    await modal.getByPlaceholder('Search work items...').fill(pickWiTitle);
    await page.getByRole('option', { name: pickWiTitle }).click();

    const row = page.getByTestId(`budget-line-row-${pickLine}`);
    await expect(row).toBeVisible();
    await row.getByRole('checkbox').check();

    await expect(modal.locator('[class*="remainingIndicator"]')).toContainText(amountRegex(300));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7 (AC7): Link to Invoice modal
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Money truth — Link to Invoice modal (AC7)', { tag: '@responsive' }, () => {
  interface LinkSetup {
    workItemId: string;
    fullInvoiceId: string;
    remInvoiceId: string;
    remInvoiceNumber: string;
    otherInvoiceId: string;
  }

  /**
   * One company, three invoices dated in 2099 so they sort first (date desc) regardless of other
   * data: FULL (fully allocated), REM (500 left), OTHER (400 left). The work item under test has
   * one unlinked 100 line.
   */
  async function setupLinkModal(page: Page, testPrefix: string): Promise<LinkSetup> {
    const stamp = Date.now();
    const vendorId = await makeVendor(page, `${testPrefix} Link Co ${stamp}`);
    const fullInvoiceId = await makeInvoice(page, vendorId, {
      invoiceNumber: `${testPrefix}-LF-${stamp}`,
      amount: 300,
      date: '2099-12-31',
    });
    const remInvoiceNumber = `${testPrefix}-LR-${stamp}`;
    const remInvoiceId = await makeInvoice(page, vendorId, {
      invoiceNumber: remInvoiceNumber,
      amount: 500,
      date: '2099-12-30',
    });
    const otherInvoiceId = await makeInvoice(page, vendorId, {
      invoiceNumber: `${testPrefix}-LO-${stamp}`,
      amount: 400,
      date: '2099-12-29',
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

    return { workItemId, fullInvoiceId, remInvoiceId, remInvoiceNumber, otherInvoiceId };
  }

  test(
    'Compact rows, first invoice with room preselected, no warning styling, "Nothing left to link", keyboard reachable',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const s = await setupLinkModal(page, testPrefix);
      const wi = new WorkItemDetailPage(page);
      await wi.goto(s.workItemId);
      await wi.linkToInvoiceButton.click();
      const modal = wi.invoiceLinkModal;
      await expect(modal).toBeVisible();

      // Preselected: the first invoice that still has room (FULL is skipped)
      const search = modal.locator('#invoice-search');
      await expect(search).toHaveValue(new RegExp(s.remInvoiceNumber));
      await expect(modal.getByText(/available on this invoice/i)).toBeVisible();

      // No warning styling on open
      await expect(modal.locator('[class*="Warning"]')).toHaveCount(0);

      // Open the list: rows are compact and several fit
      await search.focus();
      const list = modal.locator('[class*="dropdownList"]');
      await expect(list).toBeVisible();
      const rows = list.locator('[data-testid^="invoice-link-option-"]');
      await expect(rows.first()).toBeVisible();

      const listBox = await list.boundingBox();
      expect(listBox).not.toBeNull();
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThanOrEqual(3);

      let fullyVisible = 0;
      for (let i = 0; i < Math.min(rowCount, 6); i++) {
        const box = await rows.nth(i).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeLessThanOrEqual(56);
        if (box!.y + box!.height <= listBox!.y + listBox!.height + 1) fullyVisible++;
      }
      expect(fullyVisible).toBeGreaterThan(2);

      // The fully allocated row says so; the others show their remaining amount
      await expect(wi.invoiceLinkOption(s.fullInvoiceId)).toContainText('Nothing left to link');
      await expect(wi.invoiceLinkOption(s.remInvoiceId)).toContainText(amountRegex(500));
      await expect(wi.invoiceLinkOption(s.remInvoiceId)).not.toContainText('Nothing left to link');

      // Row amount stays on the same line as the invoice number (no wrapping, also at 375px)
      const numberBox = await wi
        .invoiceLinkOption(s.remInvoiceId)
        .locator('[class*="dropdownItemNumber"]')
        .boundingBox();
      const amountBox = await wi
        .invoiceLinkOption(s.remInvoiceId)
        .locator('[class*="dropdownItemAmount"]')
        .boundingBox();
      expect(numberBox).not.toBeNull();
      expect(amountBox).not.toBeNull();
      const numberMid = numberBox!.y + numberBox!.height / 2;
      const amountMid = amountBox!.y + amountBox!.height / 2;
      expect(Math.abs(numberMid - amountMid)).toBeLessThanOrEqual(6);

      // Keyboard: Tab from the search lands on the first row button
      await search.focus();
      await page.keyboard.press('Tab');
      await expect(rows.first()).toBeFocused();
    },
  );

  test('Selecting a fully allocated invoice shows a neutral note and disables linking', async ({
    page,
    testPrefix,
  }) => {
    const s = await setupLinkModal(page, testPrefix);
    const wi = new WorkItemDetailPage(page);
    await wi.goto(s.workItemId);
    await wi.linkToInvoiceButton.click();
    const modal = wi.invoiceLinkModal;
    await expect(modal).toBeVisible();

    await modal.locator('#invoice-search').focus();
    await wi.invoiceLinkOption(s.fullInvoiceId).click();

    await expect(modal.getByText(/Fully allocated/)).toBeVisible();
    await expect(
      modal.getByRole('button', { name: 'Link to Invoice', exact: true }),
    ).toBeDisabled();
    // Neutral: neither the over-allocation warning nor the red amount indicator is present
    await expect(modal.locator('[class*="Warning"]')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8 (AC8): Budget › Overview › Add › Add Invoice
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Money truth — Add Invoice from Budget overview (AC8)',
  { tag: '@responsive' },
  () => {
    test('D-35: Add > Add Invoice opens the manual create modal with status pending', async ({
      page,
    }) => {
      // The test environment has no Paperless + AI, so the manual modal is expected
      await page.goto(ROUTES.budget);
      const overview = new BudgetOverviewPage(page);
      await expect(overview.addButton).toBeVisible();

      await overview.addButton.click();
      await overview.addInvoiceMenuItem.click();

      await page.waitForURL(/\/budget\/invoices/);
      const invoicesPage = new InvoicesPage(page);
      await expect(invoicesPage.createModal).toBeVisible();
      await expect(invoicesPage.createStatusSelect).toHaveValue('pending');
      // The one-shot ?create=1 trigger is consumed
      expect(page.url()).not.toContain('create=1');
    });
  },
);
