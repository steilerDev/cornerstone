/**
 * E2E tests for Issue #2046 — open items with progress payments as expandable child rows —
 * rebuilt on the Invoices list of #2238 (ObjectList, EPIC-21 P4.6).
 *
 * The retired "Show only open items" toggle and `?openOnly=true` are now the To pay chip (the
 * default, no URL param). Open means: status 'pending', applied independently to invoices and
 * progress payments (deposit-type entries); refunds are listed but never counted as still to pay.
 * Overdue (pending + due date in the past) is a FLAG, not a status or a chip.
 *
 *   S1  (AC1)      — To pay lists A, B, C, E, F; excludes the paid D
 *   S2  (AC6)      — the chip persists across reload and Back (it is the URL)
 *   S3  (AC2, AC10)— an offer with a pending progress payment is listed on To pay
 *   S4  (AC9)      — child rows are pending entries only; no expand w/o entries
 *   S5  (AC11)     — expanded by default; collapse is local, not URL state
 *   S6  (AC13-15)  — Still to pay vs Amount; per-invoice sum equals the footer
 *   S7  (AC16)     — the footer figure: global when unfiltered, "in this list" when filtered
 *   S8  (AC18-20)  — refunds: signed, badged, excluded from Still to pay
 *   S9  (AC21,25)  — overdue progress payment flag; status unchanged; no "Overdue" chip
 *   S10 (AC22-23)  — default order: earliest open due date asc, undated last
 *   S11 (AC24)     — an explicit sort overrides the default order
 *   S12 (AC7)      — chips are exclusive and the default chip writes no param
 *   S13 (AC8)      — composes with a company filter
 *   S14 (AC26)     — positive "nothing to pay" empty state
 *   S15 (AC27)     — filtered-to-nothing uses the generic empty state
 *   S16 (AC28)     — mobile (320px): card-nested progress payments, no overflow
 *   S17 (AC30-31)  — keyboard operability + accessible names
 *   S18 (AC29)     — tablet/desktop, light/dark: rows remain visible
 *   S19 (AC12,33)  — other chips are collapsed by default and list every entry
 *   S21 (AC4)      — the count and rows are invoices only, not progress payment rows
 *
 * S20 (DataTable inertness on other pages) and S18's colour judgement are QA/visual concerns.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page, Locator } from '@playwright/test';
import { InvoicesPage, INVOICES_ROUTE } from '../../pages/InvoicesPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { API } from '../../fixtures/testData.js';
import { emptyInvoiceListResponse } from '../../fixtures/invoiceListMocks.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { createVendorViaApi } from '../../fixtures/apiHelpers.js';

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

/**
 * Strict cleanup: the server rejects (409) deleting a vendor that still has invoices, and the
 * shared deleteVendorViaApi ignores the status — which would leak this spec's pending invoices
 * into the global open-payable total. Delete the invoices first, then the vendor, asserting each.
 */
async function deleteVendorWithInvoices(page: Page, vendorId: string): Promise<void> {
  const listResp = await page.request.get(`${API.vendors}/${vendorId}/invoices`);
  expect(listResp.ok(), `GET invoices of vendor ${vendorId}`).toBeTruthy();
  const { invoices } = (await listResp.json()) as { invoices: Array<{ id: string }> };
  for (const inv of invoices) {
    const delInv = await page.request.delete(`${API.vendors}/${vendorId}/invoices/${inv.id}`);
    expect(delInv.ok(), `DELETE invoice ${inv.id}: ${delInv.status()}`).toBeTruthy();
  }
  const delVendor = await page.request.delete(`${API.vendors}/${vendorId}`);
  expect(delVendor.ok(), `DELETE vendor ${vendorId}: ${delVendor.status()}`).toBeTruthy();
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

/** Open the To pay chip (the default) scoped to one company, and wait for the rows. */
async function openToPay(page: Page, vendorId: string, extra = ''): Promise<InvoicesPage> {
  const invoicesPage = new InvoicesPage(page);
  await invoicesPage.gotoChip('pending', `vendorId=${vendorId}${extra ? `&${extra}` : ''}`);
  return invoicesPage;
}

// ─────────────────────────────────────────────────────────────────────────────
// S1/AC1 — To pay lists A, B, C, E, F; excludes the paid D
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — the To pay chip shows only open invoices and entries (Scenario 1, AC1)', () => {
  test('The To pay chip lists A, B, C, E, F and excludes the paid D', async ({
    page,
    testPrefix,
  }) => {
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Open Vendor` });

      // A: pending, 2 pending progress payments + 1 paid
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

      // B: pending, no progress payments
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-B`,
        amount: 500,
        date: daysAgo(60),
        status: 'pending',
      });

      // C: offer, 1 pending progress payment
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

      // Scope to our own company via its filter param so parallel workers' invoices never
      // dilute this page's contents.
      const invoicesPage = await openToPay(page, vendorId);
      await expect(invoicesPage.chip('pending')).toHaveAttribute('aria-pressed', 'true');

      await expect
        .poll(async () => (await invoicesPage.getInvoiceNumbers()).sort())
        .toEqual([
          `${testPrefix}-A`,
          `${testPrefix}-B`,
          `${testPrefix}-C`,
          `${testPrefix}-E`,
          `${testPrefix}-F`,
        ]);
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S2/AC6 — the chip persists across reload and Back
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — the chip persists across reload and back navigation (Scenario 2, AC6)', () => {
  test('The Offers chip stays pressed after a full reload and after Back from another page', async ({
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
        status: 'quotation',
      });

      await invoicesPage.gotoChip('quotation', `vendorId=${vendorId}`);
      await expect(invoicesPage.chip('quotation')).toHaveAttribute('aria-pressed', 'true');
      const numbersBefore = await invoicesPage.getInvoiceNumbers();
      expect(numbersBefore).toContain(`${testPrefix}-PERSIST`);

      // Full page reload — the chip is restored from the URL, not from memory.
      await page.reload();
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await expect(invoicesPage.chip('quotation')).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => invoicesPage.getInvoiceNumbers()).toEqual(numbersBefore);

      // Navigate away and back via Back — same restoration.
      await page.goto(routeUrl('companies'));
      await page.goBack();
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await expect(invoicesPage.chip('quotation')).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => invoicesPage.getInvoiceNumbers()).toEqual(numbersBefore);
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S3/AC2, AC10 — an offer with a pending progress payment is on To pay
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — an offer with a progress payment to pay (Scenario 3, AC2, AC10)', () => {
  test('An offer with a pending progress payment is listed on To pay; its own face value is excluded from what is still to pay', async ({
    page,
    testPrefix,
  }) => {
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

      const invoicesPage = await openToPay(page, vendorId);

      // Real status badge unchanged (Offer); the table adds "Progress payments only"
      await expect(invoicesPage.statusBadge(c.id)).toContainText('Offer');
      if (await invoicesPage.isTableSurface()) {
        await expect(invoicesPage.progressOnlyBadge(c.id)).toBeVisible();
      }

      // The offer's 5000 face value contributes nothing — only the 75 progress payment does.
      const resp = await page.request.get(`/api/invoices?openOnly=true&vendorId=${vendorId}`);
      expect(resp.ok()).toBeTruthy();
      const body = (await resp.json()) as {
        invoices: Array<{ id: string; openAmount?: number }>;
      };
      const listed = body.invoices.find((i) => i.id === c.id);
      expect(listed?.openAmount).toBe(deposit.amount);
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S4/AC9 — child rows are pending entries only; no expand control without them
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — expandable rows show only pending entries (Scenario 4, AC9)', () => {
  test('A parent with 2 pending + 1 paid progress payment shows exactly the 2 pending; a parent with none has no expand control', async ({
    page,
    testPrefix,
  }) => {
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Rows Vendor` });
      const a = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-ROWS-A`,
        amount: 1000,
        date: daysAgo(30),
        status: 'pending',
      });
      const d1 = await createDepositViaApi(page, a.id, { amount: 100, dueDate: daysFromNow(5) });
      const d2 = await createDepositViaApi(page, a.id, { amount: 100, dueDate: daysFromNow(15) });
      const dPaid = await createDepositViaApi(page, a.id, {
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

      const invoicesPage = await openToPay(page, vendorId);

      await expect(invoicesPage.childStatus(d1.id)).toBeVisible();
      await expect(invoicesPage.childStatus(d2.id)).toBeVisible();
      await expect(invoicesPage.childStatus(dPaid.id)).toHaveCount(0);
      await expect(invoicesPage.expandToggle(a.id)).toBeVisible();
      await expect(invoicesPage.expandToggle(b.id)).toHaveCount(0);
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S5/AC11 — expanded by default; collapse is local, not URL state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — default expansion is local, not URL state (Scenario 5, AC11)', () => {
  test('A parent with pending entries is expanded by default; collapsing hides children without changing the URL; reload re-expands', async ({
    page,
    testPrefix,
  }) => {
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Expand Vendor` });
      const a = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-EXP`,
        amount: 500,
        date: daysAgo(30),
        status: 'pending',
      });
      const dep = await createDepositViaApi(page, a.id, { amount: 50, dueDate: daysFromNow(5) });

      const invoicesPage = await openToPay(page, vendorId);

      // Expanded by default
      await expect(invoicesPage.childStatus(dep.id)).toBeVisible();
      await expect(invoicesPage.expandToggle(a.id)).toHaveAttribute('aria-expanded', 'true');

      const urlBefore = page.url();
      await invoicesPage.expandToggle(a.id).click();
      await expect(invoicesPage.expandToggle(a.id)).toHaveAttribute('aria-expanded', 'false');
      await expect(invoicesPage.childStatus(dep.id)).toHaveCount(0);
      expect(page.url()).toBe(urlBefore);

      await page.reload();
      await invoicesPage.heading.waitFor({ state: 'visible' });
      await expect(invoicesPage.expandToggle(a.id)).toHaveAttribute('aria-expanded', 'true');
      await expect(invoicesPage.childStatus(dep.id)).toBeVisible();
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S6/AC13-15 — Still to pay vs Amount; per-invoice sum equals the open total
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — Still to pay vs Amount, and the anti-double-counting sum (Scenario 6, AC13-15)', () => {
  test('The Still to pay cell reflects paid/pending entries, the Amount cell stays the full total, and per-invoice open amounts sum to the open payable total', async ({
    page,
    testPrefix,
  }) => {
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
      // still to pay = max(0, 1000 - (200+150)) + 150 = 650 + 150 = 800

      const invoicesPage = await openToPay(page, vendorId);

      expect(await invoicesPage.cellText(a.id, 'Still to pay')).toMatch(/800/);
      expect(await invoicesPage.cellText(a.id, 'Amount')).toMatch(/1,000/);

      // AC15 cross-check inside one API snapshot of this company: Σ per-invoice openAmount
      // equals listTotals.openPayable.totalAmount EXACTLY.
      const scoped = await page.request.get(
        `/api/invoices?openOnly=true&vendorId=${vendorId}&pageSize=100`,
      );
      expect(scoped.ok()).toBeTruthy();
      const scopedBody = (await scoped.json()) as {
        invoices: Array<{ openAmount: number }>;
        listTotals: { openPayable: { totalAmount: number } };
      };
      const scopedSum = scopedBody.invoices.reduce((s, inv) => s + inv.openAmount, 0);
      expect(scopedSum).toBeCloseTo(scopedBody.listTotals.openPayable.totalAmount, 2);
      expect(scopedSum).toBeCloseTo(800, 2);
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S7/AC16 — the To pay footer: global when unfiltered, "in this list" when filtered
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — the "Still to pay" footer (Scenario 7, AC16)', () => {
  test('Unfiltered, the footer figure is the server open payable total; with a company filter it is labelled "in this list" and carries no figure marker', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';
    let otherVendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} GlobalTile Vendor` });
      otherVendorId = await createVendorViaApi(page, { name: `${testPrefix} GlobalTile Other` });
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-GT`,
        amount: 250,
        date: daysAgo(10),
        status: 'pending',
      });
      await createInvoiceViaApi(page, otherVendorId, {
        invoiceNumber: `${testPrefix}-GT-OTHER`,
        amount: 777,
        date: daysAgo(10),
        status: 'pending',
      });
      // Both invoices stay open for the whole test, so the global total includes them.
      const ownMinimum = 250 + 777;

      // Other workers change the total concurrently, so the figure shown is compared with the
      // totals the responses that rendered it carried.
      const served: number[] = [];
      page.on('response', (resp) => {
        if (new URL(resp.url()).pathname === '/api/invoices' && resp.request().method() === 'GET') {
          void resp
            .json()
            .then((body: { listTotals?: { openPayable: { totalAmount: number } } }) => {
              if (body.listTotals) served.push(body.listTotals.openPayable.totalAmount);
            })
            .catch(() => undefined);
        }
      });
      const shown = async (): Promise<number> =>
        Number(((await invoicesPage.footerFigure.textContent()) ?? '').replace(/[^0-9.]/g, ''));

      // Unfiltered: the labelled, marked figure
      await invoicesPage.goto();
      await invoicesPage.waitForLoaded();
      await expect(invoicesPage.footerFigure).toHaveAttribute('data-figure', 'still-to-pay');
      await expect(invoicesPage.footerLabel).toHaveText('Still to pay');
      await expect
        .poll(async () => {
          const value = await shown();
          return served.some((t) => Math.abs(t - value) < 0.005);
        })
        .toBe(true);
      expect(await shown()).toBeGreaterThanOrEqual(ownMinimum);

      // Filtered to one company: the figure is that company's only, and is not the project figure
      await invoicesPage.gotoChip('pending', `vendorId=${vendorId}`);
      await expect(invoicesPage.footerLabel).toHaveText('Still to pay in this list');
      await expect(invoicesPage.footerFigure).not.toHaveAttribute('data-figure', /.+/);
      await expect(invoicesPage.footerFigure).toHaveText(/250\.00/);
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
      if (otherVendorId) await deleteVendorWithInvoices(page, otherVendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S8/AC18-20 — refunds: signed, badged, excluded from Still to pay / payable
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — refunds render distinctly and are excluded from the payable total (Scenario 8, AC18-19)', () => {
  test('A pending refund renders as a signed, badged child row excluded from Still to pay; Filters offers "Refunds due"', async ({
    page,
    testPrefix,
  }) => {
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

      const invoicesPage = await openToPay(page, vendorId);

      // The refund child: a Refund badge and a signed amount, in the table row or the card
      await expect(invoicesPage.childStatus(refund.id)).toBeVisible();
      await expect(invoicesPage.expandToggle(f.id)).toHaveAttribute('aria-expanded', 'true');
      if (await invoicesPage.isTableSurface()) {
        const childRow = invoicesPage.childRow(refund.id);
        await expect(childRow.getByText('Refund', { exact: true })).toBeVisible();
        await expect(childRow).toContainText('-');
        await expect(childRow).toContainText('150');
        // Still to pay excludes the refund entirely: the full invoice amount
        expect(await invoicesPage.cellText(f.id, 'Still to pay')).toMatch(/800/);
      }

      // Refunds due is offered in Filters with a count and an amount (a global figure: floor only)
      await invoicesPage.openFilters();
      await expect(invoicesPage.showOnly('refundsDue')).toBeVisible();
      await expect(invoicesPage.filtersSurface).toContainText(/Refunds due \(\d+ · /);
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});

test.describe('Open items — a refund-only open item has zero open payable amount (Scenario 8, AC20)', () => {
  test('A paid invoice whose only open entry is a pending refund is listed with openAmount 0', async ({
    page,
    testPrefix,
  }) => {
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

      const invoicesPage = await openToPay(page, vendorId);

      // Listed (via its pending refund) even though its own status is 'paid'
      await expect(invoicesPage.title(g.id)).toBeVisible();
      await expect(invoicesPage.statusBadge(g.id)).toContainText('Paid');
      if (await invoicesPage.isTableSurface()) {
        await expect(invoicesPage.progressOnlyBadge(g.id)).toBeVisible();
      }

      const resp = await page.request.get(`/api/invoices?openOnly=true&vendorId=${vendorId}`);
      expect(resp.ok()).toBeTruthy();
      const body = (await resp.json()) as {
        invoices: Array<{ id: string; openAmount?: number }>;
      };
      const listed = body.invoices.find((i) => i.id === g.id);
      expect(listed?.openAmount).toBe(0);
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S9/AC21, AC25 — overdue flag; status unchanged; no "Overdue" chip
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — overdue progress payments are flagged without changing status; discoverable when collapsed (Scenario 9, AC21, AC25)', () => {
  test('An overdue pending progress payment shows the flag and keeps its To pay status; the parent flags it even when collapsed', async ({
    page,
    testPrefix,
  }) => {
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

      const invoicesPage = await openToPay(page, vendorId);

      await expect(invoicesPage.childFlag(dep.id)).toHaveText('Overdue');
      await expect(invoicesPage.childStatus(dep.id)).toContainText('To pay');

      // Collapse the parent — "Progress payment overdue" stays discoverable on the parent row
      // (table). The invoice itself is not overdue (its due date is in the future).
      await invoicesPage.expandToggle(h.id).click();
      await expect(invoicesPage.childStatus(dep.id)).toHaveCount(0);
      if (await invoicesPage.isTableSurface()) {
        await expect(invoicesPage.progressOverdueBadge(h.id)).toHaveText(
          'Progress payment overdue',
        );
      }
      await expect(invoicesPage.flagBadge(h.id)).toHaveCount(0);
      await expect(invoicesPage.statusBadge(h.id)).toContainText('To pay');
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });

  test('There is no "Overdue" chip: the chips are To pay, Offers, Paid, Submitted and All', async ({
    page,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    await invoicesPage.goto();
    await invoicesPage.waitForLoaded();

    await expect(
      page.getByRole('group', { name: 'Filter by status' }).getByRole('button'),
    ).toHaveCount(5);
    await expect(page.getByRole('button', { name: /^Overdue/ })).toHaveCount(0);
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
      // P3: pending, no dueDate at all, no progress payments — no open due date anywhere
      await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-P3`,
        amount: 200,
        date: daysAgo(30),
        status: 'pending',
      });
      // P4: offer — only its pending progress payment's due date counts
      const p4 = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-P4`,
        amount: 300,
        date: daysAgo(30),
        status: 'quotation',
      });
      await createDepositViaApi(page, p4.id, { amount: 50, dueDate: daysFromNow(5) });

      const invoicesPage = await openToPay(page, vendorId);

      await expect
        .poll(() => invoicesPage.getInvoiceNumbers())
        .toEqual([
          `${testPrefix}-P2`, // due in 2 days
          `${testPrefix}-P4`, // progress payment due in 5 days
          `${testPrefix}-P1`, // due in 10 days
          `${testPrefix}-P3`, // no due date anywhere — sorts last
        ]);
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S11/AC24 — an explicit sort overrides the default order
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — an explicit sort overrides the default ordering (Scenario 11, AC24)', () => {
  test('Sorting by Amount overrides the earliest-due-date default; the To pay chip stays pressed', async ({
    page,
    testPrefix,
  }) => {
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

      const invoicesPage = await openToPay(page, vendorId);

      // Default (no explicit sort): ascending by earliest open due date
      await expect
        .poll(() => invoicesPage.getInvoiceNumbers())
        .toEqual([`${testPrefix}-S2`, `${testPrefix}-S3`, `${testPrefix}-S1`]);

      // Explicit sort: the Amount header (table) cycles none -> asc -> desc
      await page.getByTestId('invoices-sort-header-amount').click();
      await page.getByTestId('invoices-sort-header-amount').click();

      await expect
        .poll(() => invoicesPage.getInvoiceNumbers())
        .toEqual([`${testPrefix}-S1`, `${testPrefix}-S3`, `${testPrefix}-S2`]); // 300, 200, 100 desc

      await expect(invoicesPage.chip('pending')).toHaveAttribute('aria-pressed', 'true');
      expect(page.url()).toContain('sortBy=amount');
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S12/AC7 — chips are exclusive; the default chip writes no param
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — status chips are exclusive and follow the status param (Scenario 12, AC7)', () => {
  test('Pressing Paid unpresses To pay and writes status=paid; pressing To pay again removes the param', async ({
    page,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    await invoicesPage.goto();
    await invoicesPage.waitForLoaded();
    await expect(invoicesPage.chip('pending')).toHaveAttribute('aria-pressed', 'true');

    await invoicesPage.selectChip('paid');
    await expect(invoicesPage.chip('pending')).toHaveAttribute('aria-pressed', 'false');
    expect(new URL(page.url()).searchParams.get('status')).toBe('paid');

    await invoicesPage.selectChip('pending');
    await expect(invoicesPage.chip('paid')).toHaveAttribute('aria-pressed', 'false');
    // The default chip is the absence of the param
    expect(new URL(page.url()).searchParams.has('status')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S13/AC8 — composes with a company filter
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — composes with a company filter (Scenario 13, AC8)', () => {
  test("To pay + a company filter shows only that company's open invoice", async ({
    page,
    testPrefix,
  }) => {
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

      const invoicesPage = await openToPay(page, vendorAId);

      const numbers = await invoicesPage.getInvoiceNumbers();
      expect(numbers).toContain(`${testPrefix}-COMPA`);
      expect(numbers).not.toContain(`${testPrefix}-COMPB`);
    } finally {
      if (vendorAId) await deleteVendorWithInvoices(page, vendorAId);
      if (vendorBId) await deleteVendorWithInvoices(page, vendorBId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S14/AC26 — positive "nothing to pay" empty state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — positive "nothing to pay" empty state (Scenario 14, AC26)', () => {
  test('When nothing is to pay, a positive empty state renders without the "add first invoice" CTA', async ({
    page,
  }) => {
    const invoicesPage = new InvoicesPage(page);

    // A genuinely empty "nothing to pay across the whole system" state cannot be guaranteed in a
    // shared, parallel-worker database — mock the response for this one deterministic assertion.
    await page.route('/api/invoices*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptyInvoiceListResponse()),
      });
    });

    await page.goto(INVOICES_ROUTE);
    await invoicesPage.heading.waitFor({ state: 'visible' });

    await expect(invoicesPage.emptyState).toBeVisible();
    await expect(invoicesPage.emptyState).toContainText('Nothing to pay right now');
    await expect(invoicesPage.emptyState).toContainText(
      'Every invoice and progress payment is paid or submitted.',
    );
    await expect(invoicesPage.emptyState.getByRole('button', { name: /add/i })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S15/AC27 — filtered-to-nothing uses the generic empty state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — filtered-to-nothing shows the generic empty state (Scenario 15, AC27)', () => {
  test('To pay + a company filter matching nothing shows "No invoices match." with Clear filters', async ({
    page,
    testPrefix,
  }) => {
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} EmptyFilter Vendor` });
      // Deliberately no invoices under this company.

      const invoicesPage = await openToPay(page, vendorId);

      await expect(invoicesPage.emptyState).toBeVisible();
      await expect(invoicesPage.emptyState).toContainText('No invoices match.');
      await expect(
        invoicesPage.emptyState.getByRole('button', { name: /clear filters/i }),
      ).toBeVisible();
      await expect(invoicesPage.emptyState).not.toContainText('Nothing to pay right now');
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S16/AC28 — mobile (320px): card-nested progress payments, no overflow
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Open items — mobile card progress payments (Scenario 16, AC28)',
  { tag: '@responsive' },
  () => {
    test('At 320px, a card contains its progress payments, its own expand button toggles them, and there is no horizontal overflow', async ({
      page,
      testPrefix,
    }) => {
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
        const invoicesPage = await openToPay(page, vendorId);

        const card = invoicesPage.row(a.id);
        await expect(card).toBeVisible();

        // Both progress payments render as descendants of the SAME card (containment)
        await expect(card.getByTestId(`invoices-child-status-mobile-${d1.id}`)).toBeVisible();
        await expect(card.getByTestId(`invoices-child-status-mobile-${d2.id}`)).toBeVisible();

        // The card's own expand button toggles them
        const expandButton = invoicesPage.expandToggle(a.id);
        await expandButton.click();
        await expect(card.getByTestId(`invoices-child-status-mobile-${d1.id}`)).not.toBeVisible();
        await expandButton.click();
        await expect(card.getByTestId(`invoices-child-status-mobile-${d1.id}`)).toBeVisible();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflow).toBe(false);
      } finally {
        if (vendorId) await deleteVendorWithInvoices(page, vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// S17/AC30-31 — keyboard operability + accessible names
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — keyboard operability of the expand control and chips (Scenario 17, AC30-31)', () => {
  test('The expand button is focusable with a visible focus ring and toggles via Space and Enter; it and the chips have accessible names and states', async ({
    page,
    testPrefix,
  }) => {
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

      const invoicesPage = await openToPay(page, vendorId);

      const button = invoicesPage.expandToggle(a.id);
      // Real keyboard Tab navigation, not a programmatic `.focus()` call: Chromium's
      // `:focus-visible` heuristic doesn't treat a script-triggered focus() as
      // keyboard-originated, so the CSS focus-ring rule never applies in that case.
      // Bounded so an unreachable element fails fast instead of hanging.
      let tabs = 0;
      while (!(await button.evaluate((el) => el === document.activeElement)) && tabs < 60) {
        await page.keyboard.press('Tab');
        tabs++;
      }
      await expect(button).toBeFocused();

      const focusBoxShadow = await button.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(focusBoxShadow).not.toBe('none');

      // Default expanded — Space collapses, Enter expands again
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(button).toHaveAccessibleName(`Hide 1 progress payment of ${testPrefix}-KBD`);
      await page.keyboard.press('Space');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(button).toHaveAccessibleName(`Show 1 progress payment of ${testPrefix}-KBD`);
      await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('aria-expanded', 'true');

      // The chips: a pressed state and a name that starts with the word
      await expect(invoicesPage.chip('pending')).toHaveAttribute('aria-pressed', 'true');
      await expect(invoicesPage.chip('pending')).toHaveAccessibleName(/^To pay/);
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
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
        test(`${viewport.name} @ ${colorScheme}: child row and overdue flag render visibly with a non-transparent background`, async ({
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

            const invoicesPage = await openToPay(page, vendorId);

            await expect(invoicesPage.childStatus(dep.id)).toBeVisible();
            if (await invoicesPage.isTableSurface()) {
              const bg = await invoicesPage
                .childRow(dep.id)
                .evaluate((el) => getComputedStyle(el).backgroundColor);
              expect(bg).not.toBe('rgba(0, 0, 0, 0)');
              expect(bg).not.toBe('transparent');
            }

            // The overdue flag shows its word in both themes (colour is a visual concern)
            await expect(invoicesPage.childFlag(dep.id)).toHaveText('Overdue');
          } finally {
            if (vendorId) await deleteVendorWithInvoices(page, vendorId);
            await context.close();
          }
        });
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// S19/AC12, AC33 — the other chips are collapsed by default and list every entry
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — other chips collapse the entries and list all of them (Scenario 19, AC12, AC33)', () => {
  test('On the All chip a row with a paid and a pending progress payment is collapsed; expanding shows both', async ({
    page,
    testPrefix,
  }) => {
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} AllChip Vendor` });
      const a = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-ALL`,
        amount: 600,
        date: daysAgo(30),
        status: 'pending',
      });
      const paid = await createDepositViaApi(page, a.id, {
        amount: 100,
        dueDate: daysAgo(5),
        status: 'paid',
      });
      const pending = await createDepositViaApi(page, a.id, {
        amount: 100,
        dueDate: daysFromNow(5),
      });

      const invoicesPage = new InvoicesPage(page);
      await invoicesPage.gotoChip('all', `vendorId=${vendorId}`);

      await expect(invoicesPage.expandToggle(a.id)).toHaveAttribute('aria-expanded', 'false');
      await expect(invoicesPage.childStatus(paid.id)).toHaveCount(0);

      await invoicesPage.expandToggle(a.id).click();
      await expect(invoicesPage.childStatus(paid.id)).toBeVisible();
      await expect(invoicesPage.childStatus(pending.id)).toBeVisible();
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S21/AC4 — the count and rows are invoices only, not progress payment rows
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open items — the count and rows are invoices only, not progress payment rows (Scenario 21, AC4)', () => {
  test('26 open invoices each with a progress payment: the heading counts 26 and 26 title rows show (no paging)', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
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

      const invoicesPage = await openToPay(page, vendorId);

      // The list loads up to 100 rows at once; progress payments are children, not rows
      await expect(invoicesPage.titleLinks).toHaveCount(26);
      const counts = await invoicesPage.headingCounts();
      expect(counts?.shown).toBe(26);
      // The company filter is active, so the heading reads "26 of m" with the global total m
      expect(counts?.total).toBeGreaterThanOrEqual(26);
      // No pagination controls exist any more
      await expect(page.getByLabel('Previous')).toHaveCount(0);
      await expect(page.getByLabel('Next')).toHaveCount(0);
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Story #2195 — canonical status chips (AC1 colours, detail header, due-soon flag)
// ─────────────────────────────────────────────────────────────────────────────

/** True when a computed colour string is fully transparent (or unset). */
function isTransparent(color: string): boolean {
  return color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
}

/** Resolves a design token to a computed rgb() string via a throwaway probe element. */
async function resolveTokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, token);
}

test.describe(
  'Status chips — Offer / To pay / Paid / Submitted colours (Story #2195, AC1)',
  { tag: '@responsive' },
  () => {
    test('Each invoice status chip has its canonical label and a non-transparent background; Submitted carries a check icon', async ({
      page,
      testPrefix,
    }) => {
      const invoicesPage = new InvoicesPage(page);
      let vendorId = '';

      try {
        vendorId = await createVendorViaApi(page, { name: `${testPrefix} Chip Vendor` });
        const offer = await createInvoiceViaApi(page, vendorId, {
          invoiceNumber: `${testPrefix}-CHIP-OFFER`,
          amount: 400,
          date: daysAgo(10),
          status: 'quotation',
        });
        const toPay = await createInvoiceViaApi(page, vendorId, {
          invoiceNumber: `${testPrefix}-CHIP-PAY`,
          amount: 300,
          date: daysAgo(10),
          status: 'pending',
        });
        const paid = await createInvoiceViaApi(page, vendorId, {
          invoiceNumber: `${testPrefix}-CHIP-PAID`,
          amount: 200,
          date: daysAgo(10),
          status: 'paid',
        });
        const submitted = await createInvoiceViaApi(page, vendorId, {
          invoiceNumber: `${testPrefix}-CHIP-SUB`,
          amount: 100,
          date: daysAgo(10),
          status: 'claimed',
        });

        await invoicesPage.gotoChip('all', `vendorId=${vendorId}`);

        // Table (desktop) and card (mobile) testids differ; exactly one surface is visible.
        const chip = (id: string): Locator => invoicesPage.statusBadge(id);
        const background = (loc: Locator): Promise<string> =>
          loc.evaluate((el) => getComputedStyle(el).backgroundColor);

        await expect(chip(offer.id)).toHaveText('Offer');
        await expect(chip(toPay.id)).toHaveText('To pay');
        await expect(chip(paid.id)).toHaveText('Paid');
        await expect(chip(submitted.id)).toHaveText('Submitted');

        const offerBg = await background(chip(offer.id));
        const toPayBg = await background(chip(toPay.id));
        const paidBg = await background(chip(paid.id));
        const submittedBg = await background(chip(submitted.id));
        for (const bg of [offerBg, toPayBg, paidBg, submittedBg]) {
          expect(isTransparent(bg), `chip background "${bg}" must not be transparent`).toBe(false);
        }
        // CSS-module class misses (the #2046 regression) collapse every chip to one style.
        expect(offerBg).not.toBe(toPayBg);

        // Submitted = success tone + decorative check icon; the others carry no icon.
        await expect(chip(submitted.id).locator('svg[aria-hidden="true"]')).toHaveCount(1);
        await expect(chip(toPay.id).locator('svg')).toHaveCount(0);

        // Dark theme: the Offer chip is info blue, never the danger red.
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        const darkOfferBg = await background(chip(offer.id));
        expect(isTransparent(darkOfferBg)).toBe(false);
        expect(darkOfferBg).not.toBe(await resolveTokenColor(page, '--color-danger'));
      } finally {
        if (vendorId) await deleteVendorWithInvoices(page, vendorId);
      }
    });

    test('The invoice page header chip reads "To pay" with a non-transparent background; an offer has no chip', async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';

      try {
        vendorId = await createVendorViaApi(page, { name: `${testPrefix} ChipDetail Vendor` });
        const offer = await createInvoiceViaApi(page, vendorId, {
          invoiceNumber: `${testPrefix}-CHIPD-001`,
          amount: 400,
          date: daysAgo(10),
          status: 'quotation',
        });
        const invoice = await createInvoiceViaApi(page, vendorId, {
          invoiceNumber: `${testPrefix}-CHIPD-002`,
          amount: 400,
          date: daysAgo(10),
          status: 'pending',
        });

        // #2239: an offer's header has no status chip (Convert is its secondary)
        await detailPage.goto(offer.id);
        await expect(detailPage.convertButton).toBeVisible();
        await expect(detailPage.statusBadge).toHaveCount(0);

        await detailPage.goto(invoice.id);
        await expect(detailPage.statusBadge).toHaveText('To pay');
        const bg = await detailPage.statusBadge.evaluate(
          (el) => getComputedStyle(el).backgroundColor,
        );
        expect(isTransparent(bg), `badge background "${bg}" must not be transparent`).toBe(false);
      } finally {
        if (vendorId) await deleteVendorWithInvoices(page, vendorId);
      }
    });
  },
);

test.describe('Status chips — Due soon flag on To pay (Story #2195)', () => {
  test('An invoice and a progress payment due within 7 days show "Due soon"; one due later does not', async ({
    page,
    testPrefix,
  }) => {
    const invoicesPage = new InvoicesPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} DueSoon Vendor` });
      const soon = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-SOON`,
        amount: 500,
        date: daysAgo(20),
        dueDate: daysFromNow(3),
        status: 'pending',
      });
      const soonDeposit = await createDepositViaApi(page, soon.id, {
        amount: 100,
        dueDate: daysFromNow(4),
      });
      const later = await createInvoiceViaApi(page, vendorId, {
        invoiceNumber: `${testPrefix}-LATER`,
        amount: 500,
        date: daysAgo(20),
        dueDate: daysFromNow(30),
        status: 'pending',
      });

      await openToPay(page, vendorId);

      await expect(invoicesPage.flagBadge(soon.id)).toHaveText('Due soon');
      await expect(invoicesPage.childFlag(soonDeposit.id)).toHaveText('Due soon');
      await expect(invoicesPage.statusBadge(soon.id)).toHaveText('To pay');
      await expect(invoicesPage.flagBadge(later.id)).toHaveCount(0);
    } finally {
      if (vendorId) await deleteVendorWithInvoices(page, vendorId);
    }
  });
});
