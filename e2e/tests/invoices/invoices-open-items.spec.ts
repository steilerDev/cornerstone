/**
 * E2E tests for Issue #2046 — Invoices "Show only open items" view with open
 * deposits as expandable child rows.
 *
 * "Open" (fixed, not open for re-litigation): status === 'pending', applied
 * independently to invoices and deposits. Overdue (pending + dueDate in the past)
 * is a FLAG, not a status/bucket.
 *
 * UAT scenarios covered (S20 — DataTable inertness on other pages — and S18's
 * colour judgement are QA/visual-inspection concerns out of scope here; S18's
 * viewport/theme visibility requirement IS covered below):
 *   S1  (AC1)      — toggle on lists A, B, C, E, F; excludes D
 *   S2  (AC6)      — toggle state persists across reload and Back/Forward
 *   S3  (AC2, AC10)— quotation invoice with a pending deposit is a container
 *   S4  (AC9)      — child rows are pending deposits only; no expand w/o deposits
 *   S5  (AC11)     — expanded by default; collapse is local, not URL state
 *   S6  (AC13-15)  — Still due vs Amount; per-invoice sum equals the open total
 *   S7  (AC16)     — Open (payable) tile is global/filter-independent
 *   S8  (AC18-20)  — refunds: signed, badged, excluded from Still due/payable
 *   S9  (AC21,25)  — overdue deposit flag; status unchanged; no "Overdue" filter option
 *   S10 (AC22-23)  — default order: earliest open due date asc, undated last
 *   S11 (AC24)     — an explicit sort overrides the default order
 *   S12 (AC7)      — toggle vs. Status filter mutual exclusivity
 *   S13 (AC8)      — composes with a vendor filter
 *   S14 (AC26)     — positive "nothing open" empty state
 *   S15 (AC27)     — filtered-to-nothing uses the generic empty state
 *   S16 (AC28)     — mobile (320px): card-nested deposits, no overflow
 *   S17 (AC30-31)  — keyboard operability + accessible names
 *   S18 (AC29)     — tablet/desktop, light/dark: rows remain visible
 *   S19 (AC12,33)  — toggle off regresses to exactly today's behaviour
 *   S21 (AC4)      — pagination counts invoices only, not deposit rows
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page, Locator } from '@playwright/test';
import { InvoicesPage, INVOICES_ROUTE } from '../../pages/InvoicesPage.js';
import { API } from '../../fixtures/testData.js';
import { createVendorViaApi, deleteVendorViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers — never hardcode dates; "overdue" is evaluated against the real
// clock at run time.
// ─────────────────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// API helpers (mirrors invoices-overdue.spec.ts / invoice-deposits.spec.ts)
// ─────────────────────────────────────────────────────────────────────────────

interface InvoiceApiResponse {
  id: string;
  invoiceNumber: string | null;
  amount: number;
  status: string;
  vendorId: string;
  dueDate: string | null;
}

interface DepositApiResponse {
  id: string;
  status: string;
  amount: number;
  entryType?: string;
}

async function createInvoiceViaApi(
  page: Page,
  vendorId: string,
  data: {
    invoiceNumber?: string;
    amount: number;
    date: string;
    dueDate?: string;
    status?: 'pending' | 'paid' | 'claimed' | 'quotation';
  },
): Promise<InvoiceApiResponse> {
  const response = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', ...data },
  });
  expect(response.ok(), `POST invoice failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { invoice: InvoiceApiResponse };
  return body.invoice;
}

async function createDepositViaApi(
  page: Page,
  invoiceId: string,
  data: {
    amount: number;
    dueDate: string;
    status?: 'pending' | 'paid' | 'claimed';
    entryType?: 'deposit' | 'refund';
  },
): Promise<DepositApiResponse> {
  const response = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
    data: { status: 'pending', entryType: 'deposit', ...data },
  });
  expect(response.ok(), `POST deposit failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { deposit: DepositApiResponse };
  return body.deposit;
}

/** The Status column's filter trigger button, located via its header (name-independent
 * of the aria-label's disabled-hint text, which changes while the open-items toggle is on). */
function statusFilterButton(page: Page): Locator {
  return page.getByRole('columnheader', { name: /^Status\b/ }).locator('button');
}

// ─────────────────────────────────────────────────────────────────────────────
// S1/AC1 — toggle on lists A, B, C, E, F; excludes D
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — toggle shows only open invoices/deposits (Scenario 1, AC1)', () => {
  test('Toggling "Show only open items" lists A, B, C, E, F and excludes D', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Open Vendor` });

      // A: pending, 2 pending deposits + 1 paid deposit
      const a = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-A`,
        amount: 1000,
        date: daysAgo(60),
        status: 'pending',
      });
      await createDepositViaApi(page, a.id, { amount: 100, dueDate: daysFromNow(10) });
      await createDepositViaApi(page, a.id, { amount: 100, dueDate: daysFromNow(20) });
      await createDepositViaApi(page, a.id, {
        amount: 200,
        dueDate: daysAgo(10),
        status: 'paid',
      });

      // B: pending, no deposits
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-B`,
        amount: 500,
        date: daysAgo(60),
        status: 'pending',
      });

      // C: quotation, 1 pending deposit
      const c = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-C`,
        amount: 300,
        date: daysAgo(60),
        status: 'quotation',
      });
      await createDepositViaApi(page, c.id, { amount: 50, dueDate: daysFromNow(5) });

      // D: fully settled — excluded
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-D`,
        amount: 400,
        date: daysAgo(60),
        status: 'paid',
      });

      // E: pending, small amount
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-E`,
        amount: 10,
        date: daysAgo(60),
        status: 'pending',
      });

      // F: pending, with a pending refund
      const f = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-F`,
        amount: 800,
        date: daysAgo(60),
        status: 'pending',
      });
      await createDepositViaApi(page, f.id, {
        amount: 150,
        dueDate: daysFromNow(3),
        entryType: 'refund',
      });

      // Scope to our own vendor via URL (a real, existing filter — AC8) so parallel
      // workers' invoices never dilute this page's contents, then exercise the
      // toggle itself via the UI.
      await page.goto(`${INVOICES_ROUTE}?vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();
      await invoicesPage.setOpenItemsOnly(true);

      const numbers = await invoicesPage.getInvoiceNumbers();
      expect(numbers).toContain(`${testPrefix}-A`);
      expect(numbers).toContain(`${testPrefix}-B`);
      expect(numbers).toContain(`${testPrefix}-C`);
      expect(numbers).toContain(`${testPrefix}-E`);
      expect(numbers).toContain(`${testPrefix}-F`);
      expect(numbers).not.toContain(`${testPrefix}-D`);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S2/AC6 — toggle state persists across reload and Back/Forward
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — toggle persists across reload and back navigation (Scenario 2, AC6)', () => {
  test('Toggle stays ON after a full reload and after Back from another page', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Persist Vendor` });
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-PERSIST`,
        amount: 100,
        date: daysAgo(30),
        status: 'pending',
      });

      await page.goto(`${INVOICES_ROUTE}?vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();
      await invoicesPage.setOpenItemsOnly(true);

      const numbersBefore = await invoicesPage.getInvoiceNumbers();
      expect(numbersBefore).toContain(`${testPrefix}-PERSIST`);

      // Full page reload — the toggle is restored from the URL, not from memory.
      await page.reload();
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await expect(invoicesPage.openItemsToggle).toBeChecked();
      await expect.poll(() => invoicesPage.getInvoiceNumbers()).toEqual(numbersBefore);

      // Navigate away and back via Back — same restoration.
      await page.goto('/budget/vendors');
      await page.goBack();
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await expect(invoicesPage.openItemsToggle).toBeChecked();
      await expect.poll(() => invoicesPage.getInvoiceNumbers()).toEqual(numbersBefore);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S3/AC2, AC10 — quotation invoice with a pending deposit is a container
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — quotation invoice as a deposit container (Scenario 3, AC2, AC10)', () => {
  test('A quotation invoice with a pending deposit is listed as a container; its own face value is excluded from the open total', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Quote Vendor` });
      const c = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-QUOTE`,
        amount: 5000,
        date: daysAgo(30),
        status: 'quotation',
      });
      const deposit = await createDepositViaApi(page, c.id, {
        amount: 75,
        dueDate: daysFromNow(10),
      });

      await page.goto(`${INVOICES_ROUTE}?vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();
      await invoicesPage.setOpenItemsOnly(true);

      // Real status badge unchanged, plus the container flag
      await expect(page.getByTestId(`invoice-status-${c.id}`)).toContainText('Quotation');
      await expect(invoicesPage.containerChip(c.id)).toBeVisible();

      // The invoice's 5000 face value contributes nothing — only the 75 deposit does.
      const resp = await page.request.get(`/api/invoices?openOnly=true&vendorId=${vendorId}`);
      expect(resp.ok()).toBeTruthy();
      const body = (await resp.json()) as {
        invoices: Array<{ id: string; openAmount?: number }>;
      };
      const listed = body.invoices.find((i) => i.id === c.id);
      expect(listed?.openAmount).toBe(deposit.amount);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S4/AC9 — child rows are pending deposits only; no expand control without them
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — expandable rows show only pending deposits (Scenario 4, AC9)', () => {
  test('A parent with 2 pending + 1 paid deposit shows exactly 2 child rows; a parent with no deposits has no expand control', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Rows Vendor` });
      const a = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-ROWS-A`,
        amount: 1000,
        date: daysAgo(30),
        status: 'pending',
      });
      await createDepositViaApi(page, a.id, { amount: 100, dueDate: daysFromNow(5) });
      await createDepositViaApi(page, a.id, { amount: 100, dueDate: daysFromNow(15) });
      await createDepositViaApi(page, a.id, {
        amount: 300,
        dueDate: daysAgo(5),
        status: 'paid',
      });

      const b = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-ROWS-B`,
        amount: 200,
        date: daysAgo(30),
        status: 'pending',
      });

      await page.goto(`${INVOICES_ROUTE}?vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();
      await invoicesPage.setOpenItemsOnly(true);

      await expect(invoicesPage.childRows(a.id)).toHaveCount(2);
      await expect(invoicesPage.expandButton(b.id)).toHaveCount(0);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S5/AC11 — expanded by default; collapse is local, not URL state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — default expansion is local, not URL state (Scenario 5, AC11)', () => {
  test('A parent with pending deposits is expanded by default; collapsing hides children without changing the URL; reload re-expands', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Expand Vendor` });
      const a = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-EXP`,
        amount: 500,
        date: daysAgo(30),
        status: 'pending',
      });
      await createDepositViaApi(page, a.id, { amount: 50, dueDate: daysFromNow(5) });

      await page.goto(`${INVOICES_ROUTE}?vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();
      await invoicesPage.setOpenItemsOnly(true);

      // Expanded by default
      await expect(invoicesPage.childRows(a.id)).toHaveCount(1);
      await expect(invoicesPage.expandButton(a.id)).toHaveAttribute('aria-expanded', 'true');

      const urlBefore = page.url();
      await invoicesPage.expandButton(a.id).click();
      await expect(invoicesPage.expandButton(a.id)).toHaveAttribute('aria-expanded', 'false');
      await expect(invoicesPage.childRows(a.id)).toHaveCount(0);
      expect(page.url()).toBe(urlBefore);

      await page.reload();
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await expect(invoicesPage.expandButton(a.id)).toHaveAttribute('aria-expanded', 'true');
      await expect(invoicesPage.childRows(a.id)).toHaveCount(1);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S6/AC13-15 — Still due vs Amount; per-invoice sum equals the open total
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — Still due vs Amount, and the anti-double-counting sum (Scenario 6, AC13-15)', () => {
  test('The Still due cell reflects paid/pending deposits, the Amount cell stays the full total, and per-invoice open amounts sum to the open payable total', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} StillDue Vendor` });
      const a = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-SD`,
        amount: 1000,
        date: daysAgo(30),
        status: 'pending',
      });
      await createDepositViaApi(page, a.id, {
        amount: 200,
        dueDate: daysAgo(5),
        status: 'paid',
      });
      await createDepositViaApi(page, a.id, { amount: 150, dueDate: daysFromNow(10) });
      // still due = max(0, 1000 - (200+150)) + 150 = 650 + 150 = 800

      await page.goto(`${INVOICES_ROUTE}?vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();
      await invoicesPage.setOpenItemsOnly(true);

      const stillDue = await invoicesPage.stillDueCell(a.id);
      await expect(stillDue).toHaveText(/800/);
      const amount = await invoicesPage.amountCell(a.id);
      await expect(amount).toHaveText(/1,000/);

      // AC15 cross-check: Σ per-invoice openAmount across the FULL result set (all
      // pages, unfiltered) equals summary.openPayable.totalAmount EXACTLY, computed
      // within one API snapshot — immune to other workers' concurrent data since both
      // figures are derived from the exact same request/response.
      let pageNum = 1;
      let sum = 0;
      let openPayableTotal = 0;
      for (;;) {
        const resp = await page.request.get(
          `/api/invoices?openOnly=true&page=${pageNum}&pageSize=100`,
        );
        expect(resp.ok()).toBeTruthy();
        const body = (await resp.json()) as {
          invoices: Array<{ openAmount?: number }>;
          pagination: { totalPages: number };
          summary: { openPayable: { totalAmount: number } };
        };
        sum += body.invoices.reduce((s, inv) => s + (inv.openAmount ?? 0), 0);
        openPayableTotal = body.summary.openPayable.totalAmount;
        if (pageNum >= body.pagination.totalPages) break;
        pageNum++;
      }
      expect(sum).toBeCloseTo(openPayableTotal, 2);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S7/AC16 — Open (payable) tile is global/filter-independent
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — the "Open (payable)" tile is global (Scenario 7, AC16)', () => {
  test('The tile value is identical with the toggle off, on, and with a vendor filter applied', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} GlobalTile Vendor` });
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-GT`,
        amount: 250,
        date: daysAgo(10),
        status: 'pending',
      });

      await invoicesPage.goto();
      await invoicesPage.waitForLoaded();
      const amountOff = await invoicesPage.openPayableCard
        .locator('[class*="summaryAmount"]')
        .textContent();

      await invoicesPage.setOpenItemsOnly(true);
      const amountOn = await invoicesPage.openPayableCard
        .locator('[class*="summaryAmount"]')
        .textContent();
      expect(amountOn).toBe(amountOff);

      await page.goto(`${INVOICES_ROUTE}?openOnly=true&vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();
      const amountFiltered = await invoicesPage.openPayableCard
        .locator('[class*="summaryAmount"]')
        .textContent();
      expect(amountFiltered).toBe(amountOff);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S8/AC18-20 — refunds: signed, badged, excluded from Still due/payable
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — refunds render distinctly and are excluded from the payable total (Scenario 8, AC18-19)', () => {
  test('A pending refund renders as a signed, badged child row excluded from Still due; the refunds tile reflects it', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Refund Vendor` });
      const f = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-REFUND`,
        amount: 800,
        date: daysAgo(30),
        status: 'pending',
      });
      const refund = await createDepositViaApi(page, f.id, {
        amount: 150,
        dueDate: daysFromNow(3),
        entryType: 'refund',
      });

      await page.goto(`${INVOICES_ROUTE}?vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();
      await invoicesPage.setOpenItemsOnly(true);

      const childRow = invoicesPage.rowGroup(f.id).locator('tr[class*="childRow"]');
      await expect(childRow.getByText('Refund', { exact: true })).toBeVisible();
      await expect(childRow.locator('[class*="childCaption"]')).toHaveText(
        'Reported separately below',
      );
      const amountText =
        (await childRow.locator('[class*="childAmount"]').textContent())?.trim() ?? '';
      expect(amountText.startsWith('-')).toBe(true);
      expect(amountText).toContain('150');

      // Still due excludes the refund entirely: with no deposit-type entries, still
      // due equals the full invoice amount.
      const stillDue = await invoicesPage.stillDueCell(f.id);
      await expect(stillDue).toHaveText(/800/);

      // Refunds tile surfaces the refund total. This is a GLOBAL figure (like AC16's
      // open payable tile), so assert presence + a floor rather than exact equality —
      // other concurrent test data may also contribute pending refunds.
      await expect(invoicesPage.refundsDueCard).toBeVisible();
      const refundsText =
        (await invoicesPage.refundsDueCard.locator('[class*="summaryAmount"]').textContent()) ?? '';
      const refundsAmount = parseFloat(refundsText.replace(/[^0-9.]/g, ''));
      expect(refundsAmount).toBeGreaterThanOrEqual(refund.amount);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

test.describe('Open items — a refund-only open item has zero open payable amount (Scenario 8, AC20)', () => {
  test('An invoice whose only open entry is a pending refund appears with openAmount 0', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} RefundOnly Vendor` });
      const g = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-REFONLY`,
        amount: 400,
        date: daysAgo(30),
        status: 'paid',
      });
      await createDepositViaApi(page, g.id, {
        amount: 60,
        dueDate: daysFromNow(3),
        entryType: 'refund',
      });

      await page.goto(`${INVOICES_ROUTE}?vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();
      await invoicesPage.setOpenItemsOnly(true);

      // Listed (via its pending refund) even though its own status is 'paid'
      await expect(invoicesPage.containerChip(g.id)).toBeVisible();

      const resp = await page.request.get(`/api/invoices?openOnly=true&vendorId=${vendorId}`);
      expect(resp.ok()).toBeTruthy();
      const body = (await resp.json()) as {
        invoices: Array<{ id: string; openAmount?: number }>;
      };
      const listed = body.invoices.find((i) => i.id === g.id);
      expect(listed?.openAmount).toBe(0);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S9/AC21, AC25 — overdue deposit flag; status unchanged; no "Overdue" filter option
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — overdue deposits are flagged without changing status; discoverable when collapsed (Scenario 9, AC21, AC25)', () => {
  test('An overdue pending deposit shows the overdue chip and keeps its Pending status; the parent shows a flag chip even when collapsed', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} OverdueDep Vendor` });
      const h = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-ODEP`,
        amount: 500,
        date: daysAgo(60),
        dueDate: daysFromNow(10),
        status: 'pending',
      });
      const dep = await createDepositViaApi(page, h.id, { amount: 100, dueDate: daysAgo(5) });

      await page.goto(`${INVOICES_ROUTE}?vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();
      await invoicesPage.setOpenItemsOnly(true);

      await expect(invoicesPage.depositOverdueChip(dep.id)).toBeVisible();
      await expect(invoicesPage.depositStatusBadge(dep.id)).toContainText('Pending');

      // Collapse the parent — the overdue flag remains discoverable on the parent row
      await invoicesPage.expandButton(h.id).click();
      await expect(invoicesPage.childRows(h.id)).toHaveCount(0);
      await expect(invoicesPage.overdueChip(h.id)).toBeVisible();
      // The invoice itself is not overdue (its own dueDate is in the future) — its own
      // status badge stays "Pending", never replaced by a new status.
      await expect(page.getByTestId(`invoice-status-${h.id}`)).toContainText('Pending');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('The Status column filter never offers an "Overdue" option', async ({ page }) => {
    const invoicesPage = new InvoicesPage(page);
    await invoicesPage.goto();
    await invoicesPage.waitForLoaded();

    await statusFilterButton(page).click();

    await expect(page.getByRole('checkbox', { name: 'Pending' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Paid' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Claimed' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Quotation' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Overdue' })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S10/AC22-23 — default order: earliest open due date asc, undated last
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — default ordering is earliest open due date ascending, undated last (Scenario 10, AC22-23)', () => {
  test('Invoices sort by earliest open due date ascending; a fully-undated invoice sorts last', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Order Vendor` });

      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-P1`,
        amount: 100,
        date: daysAgo(30),
        dueDate: daysFromNow(10),
        status: 'pending',
      });
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-P2`,
        amount: 400,
        date: daysAgo(30),
        dueDate: daysFromNow(2),
        status: 'pending',
      });
      // P3: pending, no dueDate at all, no deposits — no open due date anywhere
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-P3`,
        amount: 200,
        date: daysAgo(30),
        status: 'pending',
      });
      // P4: quotation container — only its pending deposit's due date counts
      const p4 = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-P4`,
        amount: 300,
        date: daysAgo(30),
        status: 'quotation',
      });
      await createDepositViaApi(page, p4.id, { amount: 50, dueDate: daysFromNow(5) });

      await page.goto(`${INVOICES_ROUTE}?vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();
      await invoicesPage.setOpenItemsOnly(true);

      await expect
        .poll(() => invoicesPage.getInvoiceNumbers())
        .toEqual([
          `${testPrefix}-P2`, // due in 2 days
          `${testPrefix}-P4`, // deposit due in 5 days
          `${testPrefix}-P1`, // due in 10 days
          `${testPrefix}-P3`, // no due date anywhere — sorts last
        ]);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S11/AC24 — an explicit sort overrides the default order
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — an explicit sort overrides the default ordering (Scenario 11, AC24)', () => {
  test('Sorting by Amount overrides the earliest-due-date default; the toggle and openOnly stay on', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} SortOverride Vendor` });
      // Due-date order (asc): S2(2d), S3(6d), S1(10d) — deliberately NOT the same
      // sequence as amount-desc order, so an actual override is provable.
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-S1`,
        amount: 300,
        date: daysAgo(30),
        dueDate: daysFromNow(10),
        status: 'pending',
      });
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-S2`,
        amount: 100,
        date: daysAgo(30),
        dueDate: daysFromNow(2),
        status: 'pending',
      });
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-S3`,
        amount: 200,
        date: daysAgo(30),
        dueDate: daysFromNow(6),
        status: 'pending',
      });

      await page.goto(`${INVOICES_ROUTE}?vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();
      await invoicesPage.setOpenItemsOnly(true);

      // Default (no explicit sort): ascending by earliest open due date
      await expect
        .poll(() => invoicesPage.getInvoiceNumbers())
        .toEqual([`${testPrefix}-S2`, `${testPrefix}-S3`, `${testPrefix}-S1`]);

      // Explicit sort: click the Amount header's label twice (none -> asc -> desc)
      const amountHeader = page.getByRole('columnheader', { name: 'Amount' });
      const amountLabel = amountHeader.locator('[class*="tableHeaderLabel"]');
      await amountLabel.click();
      await amountLabel.click();

      await expect
        .poll(() => invoicesPage.getInvoiceNumbers())
        .toEqual([`${testPrefix}-S1`, `${testPrefix}-S3`, `${testPrefix}-S2`]); // 300, 200, 100 desc

      await expect(invoicesPage.openItemsToggle).toBeChecked();
      expect(page.url()).toContain('openOnly=true');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S12/AC7 — toggle vs. Status filter mutual exclusivity
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — toggle and Status filter are mutually exclusive (Scenario 12, AC7)', () => {
  test('Checking the toggle while status=paid is active clears the status filter and disables its control; unchecking re-enables it', async ({
    page,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    await page.goto(`${INVOICES_ROUTE}?status=paid`);
    await invoicesPage.heading.waitFor({ state: 'visible' });
    await invoicesPage.waitForLoaded();

    await expect(statusFilterButton(page)).toBeEnabled();

    await invoicesPage.setOpenItemsOnly(true);

    expect(page.url()).not.toContain('status=paid');
    expect(page.url()).toContain('openOnly=true');
    await expect(statusFilterButton(page)).toBeDisabled();

    await invoicesPage.setOpenItemsOnly(false);
    await expect(statusFilterButton(page)).toBeEnabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S13/AC8 — composes with a vendor filter
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — composes with a vendor filter (Scenario 13, AC8)', () => {
  test("Toggle on + a vendor filter shows only that vendor's open invoice", async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorAId = '';
    let vendorBId = '';

    try {
      vendorAId = await createVendorViaApi(page, { name: `${testPrefix} ComposeA Vendor` });
      vendorBId = await createVendorViaApi(page, { name: `${testPrefix} ComposeB Vendor` });
      await createInvoiceViaApi(page, vendorAId, {
        invoiceNumber: `${testPrefix}-COMPA`,
        amount: 100,
        date: daysAgo(10),
        status: 'pending',
      });
      await createInvoiceViaApi(page, vendorBId, {
        invoiceNumber: `${testPrefix}-COMPB`,
        amount: 200,
        date: daysAgo(10),
        status: 'pending',
      });

      await page.goto(`${INVOICES_ROUTE}?openOnly=true&vendorId=${vendorAId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();

      const numbers = await invoicesPage.getInvoiceNumbers();
      expect(numbers).toContain(`${testPrefix}-COMPA`);
      expect(numbers).not.toContain(`${testPrefix}-COMPB`);
    } finally {
      if (vendorAId) await deleteVendorViaApi(page, vendorAId);
      if (vendorBId) await deleteVendorViaApi(page, vendorBId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S14/AC26 — positive "nothing open" empty state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — positive "nothing open" empty state (Scenario 14, AC26)', () => {
  test('When no open items exist, a positive empty state renders without the "add first invoice" CTA', async ({
    page,
  }) => {
    const invoicesPage = new InvoicesPage(page);

    // A genuinely empty "nothing open across the whole system" state cannot be
    // guaranteed in a shared, parallel-worker database — mock the response for
    // this one deterministic assertion (matches the existing empty-state test's
    // pattern in invoices.spec.ts).
    await page.route('/api/invoices*', async (route) => {
      const request = route.request();
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }
      const url = new URL(request.url());
      if (url.searchParams.get('openOnly') !== 'true') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          invoices: [],
          pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
          summary: {
            pending: { count: 0, totalAmount: 0 },
            paid: { count: 0, totalAmount: 0 },
            claimed: { count: 0, totalAmount: 0 },
            quotation: { count: 0, totalAmount: 0 },
            overdue: { count: 0, totalAmount: 0 },
            claimable: { count: 0, totalAmount: 0 },
            quotationCoveredByDeposits: 0,
            openPayable: { count: 0, totalAmount: 0 },
            refundsDue: { count: 0, totalAmount: 0 },
          },
        }),
      });
    });

    await page.goto(`${INVOICES_ROUTE}?openOnly=true`);
    await invoicesPage.heading.waitFor({ state: 'visible' });

    await expect(invoicesPage.emptyState).toBeVisible();
    await expect(invoicesPage.emptyState).toContainText('Nothing open right now');
    await expect(invoicesPage.emptyState.getByRole('button', { name: /add/i })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S15/AC27 — filtered-to-nothing uses the generic empty state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — filtered-to-nothing shows the generic empty state (Scenario 15, AC27)', () => {
  test('Toggle on + a vendor filter matching nothing shows the standard "no results for filters" empty state', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} EmptyFilter Vendor` });
      // Deliberately no invoices under this vendor.

      await page.goto(`${INVOICES_ROUTE}?openOnly=true&vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });

      await expect(invoicesPage.emptyState).toBeVisible();
      await expect(
        invoicesPage.emptyState.getByRole('button', { name: /clear filters/i }),
      ).toBeVisible();
      await expect(invoicesPage.emptyState).not.toContainText('Nothing open right now');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S16/AC28 — mobile (320px): card-nested deposits, no overflow
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Open items — mobile card deposits (Scenario 16, AC28)',
  { tag: '@responsive' },
  () => {
    test('At 320px, a card contains its deposit entries, its own expand button toggles them, and there is no horizontal overflow', async ({
      page,
      testPrefix,
    }) => {
      const invoicesPage = new InvoicesPage(page);
      let vendorId = '';

      try {
        vendorId = await createVendorViaApi(page, { name: `${testPrefix} Mobile Vendor` });
        const a = await createInvoiceViaApi(page, vendorId, {
          invoiceNumber: `${testPrefix}-MOB`,
          amount: 500,
          date: daysAgo(30),
          status: 'pending',
        });
        const d1 = await createDepositViaApi(page, a.id, { amount: 50, dueDate: daysFromNow(5) });
        const d2 = await createDepositViaApi(page, a.id, {
          amount: 60,
          dueDate: daysFromNow(15),
        });

        await page.setViewportSize({ width: 320, height: 800 });
        await page.goto(`${INVOICES_ROUTE}?vendorId=${vendorId}`);
        await invoicesPage.heading.waitFor({ state: 'visible' });
        await invoicesPage.waitForLoaded();
        await invoicesPage.setOpenItemsOnly(true);

        // `[class*="card_"]` (trailing underscore) matches only the production-build
        // .card class, not its many card* descendants (cardHeader, cardContent, ...).
        const card = invoicesPage.cardsContainer
          .locator('[class*="card_"]')
          .filter({ hasText: `${testPrefix}-MOB` })
          .first();
        await expect(card).toBeVisible();

        // Both deposits render as descendants of the SAME card (containment)
        await expect(card.getByTestId(`deposit-status-mobile-${d1.id}`)).toBeVisible();
        await expect(card.getByTestId(`deposit-status-mobile-${d2.id}`)).toBeVisible();

        // The card's own expand button toggles them
        const expandButton = card.locator('button[aria-expanded]');
        await expandButton.click();
        await expect(card.getByTestId(`deposit-status-mobile-${d1.id}`)).not.toBeVisible();
        await expandButton.click();
        await expect(card.getByTestId(`deposit-status-mobile-${d1.id}`)).toBeVisible();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflow).toBe(false);
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// S17/AC30-31 — keyboard operability + accessible names
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — keyboard operability of the expand control and toggle (Scenario 17, AC30-31)', () => {
  test('The expand button is focusable with a visible focus ring and toggles via Space and Enter; the toggle has an accessible name and checked state', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Keyboard Vendor` });
      const a = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-KBD`,
        amount: 500,
        date: daysAgo(30),
        status: 'pending',
      });
      await createDepositViaApi(page, a.id, { amount: 50, dueDate: daysFromNow(5) });

      await page.goto(`${INVOICES_ROUTE}?vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();
      await invoicesPage.setOpenItemsOnly(true);

      const button = invoicesPage.expandButton(a.id);
      // Real keyboard Tab navigation, not a programmatic `.focus()` call: Chromium's
      // `:focus-visible` heuristic doesn't treat a script-triggered focus() as
      // keyboard-originated, so the CSS `:focus-visible` focus-ring rule never
      // applies in that case — the box-shadow assertion below needs the actual
      // keyboard-focus code path to be meaningful. Bounded so an unreachable
      // element fails fast instead of hanging.
      let tabs = 0;
      while (!(await button.evaluate((el) => el === document.activeElement)) && tabs < 40) {
        await page.keyboard.press('Tab');
        tabs++;
      }
      await expect(button).toBeFocused();

      const focusBoxShadow = await button.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(focusBoxShadow).not.toBe('none');

      // Default expanded — Space collapses, Enter expands again
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Space');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('aria-expanded', 'true');

      // Toggle: accessible name + checked state
      await expect(invoicesPage.openItemsToggle).toHaveAccessibleName('Show only open items');
      await expect(invoicesPage.openItemsToggle).toBeChecked();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S18/AC29 — tablet/desktop, light/dark: rows remain visible
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Open items — child rows and flags remain visible across viewports and themes (Scenario 18, AC29)',
  { tag: '@responsive' },
  () => {
    const viewports = [
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 },
    ] as const;
    const themes = ['light', 'dark'] as const;

    for (const viewport of viewports) {
      for (const colorScheme of themes) {
        test(`${viewport.name} @ ${colorScheme}: child row and overdue chip render visibly with a non-transparent background`, async ({
          browser,
          testPrefix,
        }) => {
          let vendorId = '';
          const context = await browser.newContext({
            colorScheme,
            viewport: { width: viewport.width, height: viewport.height },
            storageState: 'test-results/.auth/admin.json',
          });
          const page = await context.newPage();
          const invoicesPage = new InvoicesPage(page);

          try {
            vendorId = await createVendorViaApi(page, {
              name: `${testPrefix} Theme-${viewport.name}-${colorScheme} Vendor`,
            });
            const a = await createInvoiceViaApi(page, vendorId, {
              invoiceNumber: `${testPrefix}-THEME`,
              amount: 500,
              date: daysAgo(30),
              status: 'pending',
            });
            const dep = await createDepositViaApi(page, a.id, {
              amount: 50,
              dueDate: daysAgo(2), // overdue
            });

            await page.goto(`${INVOICES_ROUTE}?vendorId=${vendorId}`);
            await invoicesPage.heading.waitFor({ state: 'visible' });
            await invoicesPage.waitForLoaded();
            await invoicesPage.setOpenItemsOnly(true);

            const childRow = invoicesPage.rowGroup(a.id).locator('tr[class*="childRow"]');
            await expect(childRow).toBeVisible();
            const bg = await childRow.evaluate((el) => getComputedStyle(el).backgroundColor);
            expect(bg).not.toBe('rgba(0, 0, 0, 0)');
            expect(bg).not.toBe('transparent');

            // Overdue flag is legible in both themes — checked for presence/visibility,
            // not colour (colour judgement is a UX-designer/screenshot concern).
            await expect(invoicesPage.depositOverdueChip(dep.id)).toBeVisible();
          } finally {
            if (vendorId) await deleteVendorViaApi(page, vendorId);
            await context.close();
          }
        });
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// S19/AC12, AC33 — toggle off regresses to exactly today's behaviour
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — toggle off behaves exactly as before (Scenario 19, AC12, AC33)', () => {
  test('With the toggle off, there are no expand controls, no Still due column, and filters behave as before', async ({
    page,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    await invoicesPage.goto();
    await invoicesPage.waitForLoaded();

    await expect(invoicesPage.openItemsToggle).not.toBeChecked();
    // Scoped to the table (not a bare page-wide locator): DataTableColumnSettings'
    // column-settings gear button also carries its own unrelated `aria-expanded`
    // for its popover state and is always present regardless of this toggle — the
    // same collision the Jest suite works around in DataTable.test.tsx by querying
    // within `table` rather than the whole rendered output.
    await expect(invoicesPage.tableContainer.locator('[aria-expanded]')).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Still due' })).toHaveCount(0);
    await expect(statusFilterButton(page)).toBeEnabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S21/AC4 — pagination counts invoices only, not deposit rows
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — pagination counts invoices only, not deposit child rows (Scenario 21, AC4)', () => {
  test('26 open invoices at page size 25 shows 25 parent rows on page 1 and reports 26 total', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Page Vendor` });
      for (let i = 0; i < 26; i++) {
        const inv = await createInvoiceViaApi(page, vendorId, {
          invoiceNumber: `${testPrefix}-PG${String(i).padStart(2, '0')}`,
          amount: 100 + i,
          date: daysAgo(30),
          dueDate: daysFromNow(i + 1),
          status: 'pending',
        });
        await createDepositViaApi(page, inv.id, { amount: 10, dueDate: daysFromNow(i + 1) });
      }

      await page.goto(`${INVOICES_ROUTE}?openOnly=true&vendorId=${vendorId}`);
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await invoicesPage.waitForLoaded();

      // Scoped to the desktop table body — the mobile card DOM tree is also mounted
      // (hidden via CSS at this viewport) and would otherwise double the count.
      await expect(invoicesPage.tableBody.locator('[class*="invoiceLink"]')).toHaveCount(25);
      const paginationText = await invoicesPage.getPaginationInfoText();
      expect(paginationText).toContain('26');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});
