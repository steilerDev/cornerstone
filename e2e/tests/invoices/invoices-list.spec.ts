/**
 * E2E tests for Money › Invoices and offers (#2238, EPIC-21 P4.6): the first page on the
 * ObjectList template. One list for invoices and offers with the chips To pay · Offers · Paid ·
 * Submitted · All, the Filters panel (Show only flags, company, date ranges, amount), filtered
 * totals, the To pay footer, bulk Mark paid and progress payments as child rows.
 *
 * Scenarios (acceptance criteria named in the titles):
 *   L1  AC1/AC9   To pay is pressed by default; counts; heading "Invoices (n)" / "(n of m)"
 *   L2  AC2       the old offers URL and /invoices?status=quotation land on the Offers chip
 *   L3  AC3       the Offers chip shows the Offers summary and the offer columns
 *   L4  AC4       searching an offer from To pay: "Searching all · 1 more in Offers"
 *   L5  AC5       the Show-only flags, the note row, Clear filters
 *   L6  AC6       row Mark paid + Undo + focus; bulk Mark paid (invoices only); the footer
 *   L7  D-30      no stat cards, no "Ready to submit" on the page
 *   L8  AC10      paging is retired
 *   L9  AC11      cards, links, selection bar, print, light and dark (all projects)
 *   L10           Invoice date / Due date / Amount filters narrow the list
 *
 * Data is synthetic, created through the API and scoped to a unique company per test (the
 * database is shared with parallel workers); every list is narrowed with `?vendorId=`.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page, Route } from '@playwright/test';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { ToastRegion } from '../../pages/components/ToastRegion.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { parseMoney } from '../../fixtures/figureSurfaces.js';
import { API } from '../../fixtures/testData.js';
import {
  createFundingSource,
  createLinkedCostLine,
  createTask,
  createVendor,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import type { SeedCleanup } from '../../fixtures/costLineSeed.js';

// ─────────────────────────────────────────────────────────────────────────────
// Seeding helpers
// ─────────────────────────────────────────────────────────────────────────────

function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type Status = 'pending' | 'paid' | 'claimed' | 'quotation';

async function seedInvoice(
  page: Page,
  cleanup: SeedCleanup,
  vendorId: string,
  data: {
    invoiceNumber: string;
    amount: number;
    status?: Status;
    date?: string;
    dueDate?: string;
  },
): Promise<string> {
  const response = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', date: dayOffset(-60), ...data },
  });
  expect(response.ok(), `POST invoice ${data.invoiceNumber}: ${response.status()}`).toBeTruthy();
  const id = ((await response.json()) as { invoice: { id: string } }).invoice.id;
  cleanup.fns.push(async () => {
    await page.request.delete(`${API.vendors}/${vendorId}/invoices/${id}`);
  });
  return id;
}

async function seedEntry(
  page: Page,
  invoiceId: string,
  data: {
    amount: number;
    dueDate: string;
    status?: 'pending' | 'paid';
    entryType?: 'deposit' | 'refund';
  },
): Promise<string> {
  const response = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
    data: { status: 'pending', entryType: 'deposit', ...data },
  });
  expect(response.ok(), `POST deposit: ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { deposit: { id: string } }).deposit.id;
}

interface ListApi {
  invoices: Array<{ id: string; openAmount: number }>;
  summary: { openPayable: { totalAmount: number } };
  listTotals: {
    openPayable: { totalAmount: number };
    offers: { count: number; amount: number; paid: number; remainingOnOffer: number };
  };
}

async function listApi(page: Page, query: string): Promise<ListApi> {
  const response = await page.request.get(`/api/invoices?${query}`);
  expect(response.ok(), `GET /api/invoices?${query}: ${response.status()}`).toBeTruthy();
  return (await response.json()) as ListApi;
}

function cents(amount: number): number {
  return Math.round(amount * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// L1 — chips, counts, heading (AC1, AC9)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices list — chips and counts (AC1, AC9)', { tag: '@responsive' }, () => {
  test('AC1/AC9: To pay is pressed by default with counts; an offer with a progress payment to pay is listed on To pay and expanded; the heading says "(n of m)" only with a search or filter', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} Chips Co`);
      const invoice = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-CH-INV`,
        amount: 400,
        dueDate: dayOffset(20),
      });
      const offer = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-CH-OFR`,
        amount: 3000,
        status: 'quotation',
      });
      const progress = await seedEntry(page, offer, { amount: 300, dueDate: dayOffset(10) });
      await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-CH-PAID`,
        amount: 90,
        status: 'paid',
      });

      const list = new InvoicesPage(page);
      // Unscoped first: the default list has no filter, so the heading carries only "(n)"
      await list.goto();
      await list.waitForLoaded();
      await expect(list.chip('pending')).toHaveAttribute('aria-pressed', 'true');
      expect((await list.headingCounts())?.total).toBeNull();
      expect(new URL(page.url()).searchParams.has('status')).toBe(false);

      // Scoped to the company: the chips count what matches
      await list.gotoChip('pending', `vendorId=${vendorId}`);
      await expect(list.chip('pending')).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => list.chipCount('pending')).toBe(2);
      await expect.poll(() => list.chipCount('quotation')).toBe(1);
      await expect.poll(() => list.chipCount('paid')).toBe(1);
      await expect.poll(() => list.chipCount('claimed')).toBe(0);
      await expect.poll(() => list.chipCount('all')).toBe(3);
      await expect(list.chip('pending')).toHaveText(/^To pay \(2\)$/);

      // The invoice and the offer (via its progress payment) are on To pay; the paid one is not
      await expect(list.title(invoice)).toBeVisible();
      await expect(list.title(offer)).toBeVisible();
      await expect(list.titleLinks).toHaveCount(2);
      await expect(list.expandToggle(offer)).toHaveAttribute('aria-expanded', 'true');
      await expect(list.childStatus(progress)).toBeVisible();

      // A filter is active: "(n of m)" with the global total
      const counts = await list.headingCounts();
      expect(counts?.shown).toBe(2);
      expect(counts?.total).toBeGreaterThanOrEqual(2);
      await expect(list.heading).toContainText(' of ');
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L2 — the old offers URL (AC2)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices list — offers URLs (AC2)', () => {
  test('AC2: the old offers URL /budget/invoices?status=quotation, /invoices?status=quotation and ?openOnly=true land on their chips', async ({
    page,
  }) => {
    const list = new InvoicesPage(page);

    await page.goto('/budget/invoices?status=quotation');
    await list.heading.waitFor({ state: 'visible' });
    await expect(list.chip('quotation')).toHaveAttribute('aria-pressed', 'true');
    await expect(list.chip('pending')).toHaveAttribute('aria-pressed', 'false');

    // The shorter path is a legacy redirect that carries the query
    await page.goto('/invoices?status=quotation');
    await list.heading.waitFor({ state: 'visible' });
    await expect(page).toHaveURL((url) => url.pathname === '/budget/invoices');
    await expect(list.chip('quotation')).toHaveAttribute('aria-pressed', 'true');

    // The old open-items URL is the To pay chip
    await page.goto('/budget/invoices?openOnly=true');
    await list.heading.waitFor({ state: 'visible' });
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('status') === 'pending' && !url.searchParams.has('openOnly'),
    );
    await expect(list.chip('pending')).toHaveAttribute('aria-pressed', 'true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L3 — Offers chip: summary and columns (AC3)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices list — Offers chip (AC3)', { tag: '@responsive' }, () => {
  test('AC3: the Offers chip shows the Offers summary with four facts equal to the server totals, and the offer columns; the To pay chip shows neither', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} Offers Co`);
      const offerA = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-OF-A`,
        amount: 5000,
        status: 'quotation',
      });
      await seedEntry(page, offerA, { amount: 500, dueDate: dayOffset(-3), status: 'paid' });
      await seedEntry(page, offerA, { amount: 700, dueDate: dayOffset(14) });
      await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-OF-B`,
        amount: 1200,
        status: 'quotation',
      });

      const list = new InvoicesPage(page);
      await list.gotoChip('quotation', `vendorId=${vendorId}`);
      await expect(list.titleLinks).toHaveCount(2);

      // Four facts; the values are the server's offer totals for exactly these offers
      await expect(list.offersSummary).toBeVisible();
      const totals = (await listApi(page, `status=quotation&vendorId=${vendorId}`)).listTotals
        .offers;
      await expect(list.offersFact('count')).toHaveText(String(totals.count));
      expect(totals.count).toBe(2);
      for (const [fact, value] of [
        ['offered', totals.amount],
        ['paid', totals.paid],
        ['remaining', totals.remainingOnOffer],
      ] as const) {
        await expect
          .poll(async () => parseMoney(await list.offersFact(fact).innerText()))
          .toBe(cents(value));
      }
      // The summary is not a project figure: it carries no figure marker
      await expect(list.offersSummary.locator('[data-figure]')).toHaveCount(0);

      // The offer columns (table surface only)
      if (await list.isTableSurface()) {
        for (const label of ['Offered', 'Paid', 'Remaining on offer', 'Progress payments']) {
          await expect(list.columnHeader(new RegExp(`^${label}`))).toBeVisible();
        }
      } else {
        // Cards: the three facts of an offer
        await expect(list.row(offerA)).toContainText('remaining on offer');
        await expect(list.row(offerA)).toContainText('offered');
      }

      // To pay: no summary, no offer columns
      await list.gotoChip('pending', `vendorId=${vendorId}`);
      await expect(list.offersSummary).toHaveCount(0);
      if (await list.isTableSurface()) {
        await expect(list.columnHeader(/^Offered/)).toHaveCount(0);
        await expect(list.columnHeader(/^Remaining on offer/)).toHaveCount(0);
      }
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L4 — searching all (AC4)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices list — searching all (AC4)', { tag: '@responsive' }, () => {
  test('AC4: searching an offer number from To pay presses no chip, says "Searching all · 1 more in Offers" and finds the row', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} SearchAll Co`);
      const offer = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-SA-OFR`,
        amount: 800,
        status: 'quotation',
      });

      const list = new InvoicesPage(page);
      await list.goto();
      await list.waitForLoaded();
      await expect(list.chip('pending')).toHaveAttribute('aria-pressed', 'true');

      await list.typeSearch(`${testPrefix}-SA-OFR`);

      await expect(list.searchingAllNote).toHaveText('Searching all · 1 more in Offers');
      for (const chip of ['pending', 'quotation', 'paid', 'claimed', 'all'] as const) {
        await expect(list.chip(chip)).toHaveAttribute('aria-pressed', 'false');
      }
      await expect(list.title(offer)).toBeVisible();
      await expect(list.titleLinks).toHaveCount(1);
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L5 — Filters panel: Show-only flags (AC5)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices list — Filters (AC5)', { tag: '@responsive' }, () => {
  test('AC5: Not yet split, Due or overdue and Refunds due narrow the list, the note row names the active flags, and Clear filters resets them', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} Flags Co`);
      // SPLIT: fully itemized, due in 30 days; the rest have no cost lines (not yet split)
      const split = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-FL-SPLIT`,
        amount: 200,
        dueDate: dayOffset(30),
      });
      const taskId = await createTask(page, cleanup, `${testPrefix} Flags task`);
      const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Flags source`);
      await createLinkedCostLine(page, split, {
        kind: 'work_item',
        hostId: taskId,
        budgetSourceId: sourceId,
        description: `${testPrefix} Flags line`,
        plannedAmount: 200,
        itemizedAmount: 200,
      });
      const soon = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-FL-SOON`,
        amount: 210,
        dueDate: dayOffset(3),
      });
      const late = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-FL-LATE`,
        amount: 220,
        date: dayOffset(-90),
        dueDate: dayOffset(-20),
      });
      const refund = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-FL-REFUND`,
        amount: 230,
        dueDate: dayOffset(40),
      });
      await seedEntry(page, refund, {
        amount: 30,
        dueDate: dayOffset(5),
        entryType: 'refund',
      });

      const list = new InvoicesPage(page);
      await list.gotoChip('all', `vendorId=${vendorId}`);
      await expect(list.titleLinks).toHaveCount(4);

      // Not yet split: everything except the fully itemized invoice
      await list.setShowOnly('notYetSplit', true);
      await expect(page).toHaveURL((url) => url.searchParams.get('notYetSplit') === '1');
      await expect(list.titleLinks).toHaveCount(3);
      await expect(list.title(split)).toHaveCount(0);
      await expect(list.note).toHaveText('Showing only: Not yet split');
      if (await list.isTableSurface()) {
        await expect(list.notYetSplitBadge(soon)).toHaveText('Not yet split');
      }

      // Due or overdue: the invoice due in 3 days and the overdue one (and no refund-only row)
      await list.setShowOnly('notYetSplit', false);
      await list.setShowOnly('due', true);
      await expect(page).toHaveURL(
        (url) => url.searchParams.get('due') === '1' && !url.searchParams.has('notYetSplit'),
      );
      await expect(list.titleLinks).toHaveCount(2);
      await expect(list.title(soon)).toBeVisible();
      await expect(list.title(late)).toBeVisible();
      await expect(list.note).toHaveText('Showing only: Due or overdue');

      // Two flags at once: the note names both, in panel order
      await list.setShowOnly('notYetSplit', true);
      await expect(list.note).toHaveText('Showing only: Not yet split, Due or overdue');
      await list.setShowOnly('due', false);

      // Refunds due: offered with a count and an amount while a refund is due
      await list.setShowOnly('notYetSplit', false);
      await expect(list.showOnly('refundsDue')).toBeVisible();
      await expect(list.filtersSurface).toContainText(/Refunds due \(\d+ · /);
      await list.setShowOnly('refundsDue', true);
      await expect(list.titleLinks).toHaveCount(1);
      await expect(list.title(refund)).toBeVisible();
      await expect(list.note).toHaveText('Showing only: Refunds due');

      // Clear filters resets the flags (and the company scope with them)
      await list.closeFilters();
      await list.clearFiltersButton.click();
      await expect(page).toHaveURL(
        (url) => !url.searchParams.has('refundsDue') && !url.searchParams.has('vendorId'),
      );
      await expect(list.note).toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('AC5: "Refunds due" is offered only while a refund is due (or the flag is on)', async ({
    page,
  }) => {
    // The shared database may hold refunds from other tests: serve a response with none
    await page.route('**/api/invoices?**', async (route: Route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      const body = (await response.json()) as {
        summary: { refundsDue: { count: number; totalAmount: number } };
      };
      body.summary.refundsDue = { count: 0, totalAmount: 0 };
      await route.fulfill({ response, json: body });
    });

    const list = new InvoicesPage(page);
    await list.goto();
    await list.waitForLoaded();
    await list.openFilters();
    await expect(list.showOnly('notYetSplit')).toBeVisible();
    await expect(list.showOnly('refundsDue')).toHaveCount(0);
  });

  test('AC5: "Without document" is offered only while Paperless is configured, and a URL flag is named in the note', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} NoDoc Co`);
      const own = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-ND-1`,
        amount: 55,
      });

      const list = new InvoicesPage(page);
      // Paperless is not configured in the test environment: the checkbox is not offered
      await list.gotoChip('pending', `vendorId=${vendorId}`);
      await list.openFilters();
      await expect(list.showOnly('withoutDocument')).toHaveCount(0);
      await list.closeFilters();

      // Configured (mocked status): it is offered, and checking it filters on the server
      await page.route('**/api/paperless/status', async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            configured: true,
            reachable: true,
            error: null,
            paperlessUrl: 'https://paperless.example.test',
            filterTag: null,
          }),
        });
      });
      await list.gotoChip('pending', `vendorId=${vendorId}`);
      await list.setShowOnly('withoutDocument', true);
      await expect(page).toHaveURL((url) => url.searchParams.get('withoutDocument') === '1');
      await expect(list.note).toHaveText('Showing only: Without document');
      // The seeded invoice has no document, so it stays in the list
      await expect(list.title(own)).toBeVisible();
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L6 — Mark paid, Undo, bulk, footer (AC6)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices list — Mark paid and the footer (AC6)', { tag: '@responsive' }, () => {
  test('AC6: row Mark paid shows an Undo toast, the row leaves To pay, focus lands on the next row title, and Undo restores the row', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} MarkPaid Co`);
      const first = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-MP-1`,
        amount: 110,
        dueDate: dayOffset(5),
      });
      const second = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-MP-2`,
        amount: 120,
        dueDate: dayOffset(10),
      });

      const list = new InvoicesPage(page);
      const toast = new ToastRegion(page);
      await list.gotoChip('pending', `vendorId=${vendorId}`);
      await expect
        .poll(() => list.getInvoiceNumbers())
        .toEqual([`${testPrefix}-MP-1`, `${testPrefix}-MP-2`]);
      if (await list.isTableSurface()) {
        // The accessible name starts with the visible text; the rest names the row
        await expect(list.markPaidCommand(first)).toHaveAccessibleName(
          new RegExp(`^Mark paid, ${testPrefix}-MP-1, ${testPrefix} MarkPaid Co`),
        );
      }

      await list.markPaid(first);

      await expect(toast.undoToast).toBeVisible();
      await expect(list.title(first)).toHaveCount(0);
      await expect(list.title(second)).toBeFocused();

      await toast.undoButton.click();
      await expect(list.title(first)).toBeVisible();
      await expect(list.statusBadge(first)).toHaveText('To pay');
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('AC6: bulk Mark paid covers invoices only: 2 invoices and 1 offer selected show "Mark paid (2)" and the skipped reason; one click marks 2 with one Undo', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} Bulk Co`);
      const a = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-BK-A`,
        amount: 100,
      });
      const b = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-BK-B`,
        amount: 200,
      });
      const offer = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-BK-OFR`,
        amount: 300,
        status: 'quotation',
      });

      const list = new InvoicesPage(page);
      const toast = new ToastRegion(page);
      await list.gotoChip('all', `vendorId=${vendorId}`);
      await expect(list.titleLinks).toHaveCount(3);

      for (const id of [a, b, offer]) await list.rowCheckbox(id).check();
      await expect(list.selectionBar).toBeVisible();
      await expect(list.bulkMarkPaid).toHaveText('Mark paid (2)');
      await expect(list.bulkMarkPaid).toHaveAccessibleDescription(
        "1 selected row can't be marked paid",
      );

      await list.bulkMarkPaid.click();

      await expect(toast.undoToast).toContainText('2 invoices are now “Paid”.');
      await expect(list.statusBadge(a)).toHaveText('Paid');
      await expect(list.statusBadge(b)).toHaveText('Paid');
      await expect(list.statusBadge(offer)).toHaveText('Offer');
      await expect(list.selectionBar).toHaveCount(0);

      // One Undo restores both
      await toast.undoButton.click();
      await expect(list.statusBadge(a)).toHaveText('To pay');
      await expect(list.statusBadge(b)).toHaveText('To pay');
      await expect(list.statusBadge(offer)).toHaveText('Offer');
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('AC6: with only offers selected, "Mark paid (0)" is aria-disabled and says why', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} BulkNone Co`);
      const offer = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-BN-OFR`,
        amount: 300,
        status: 'quotation',
      });

      const list = new InvoicesPage(page);
      await list.gotoChip('quotation', `vendorId=${vendorId}`);
      await list.rowCheckbox(offer).check();

      await expect(list.bulkMarkPaid).toHaveText('Mark paid (0)');
      await expect(list.bulkMarkPaid).toHaveAttribute('aria-disabled', 'true');
      await expect(list.bulkMarkPaid).not.toHaveAttribute('disabled', /.*/);
      await expect(list.bulkMarkPaid).toHaveAccessibleDescription(
        'None of the selected rows can be marked paid',
      );
      // Playwright does not click an aria-disabled button: force it, the click must do nothing
      await list.bulkMarkPaid.click({ force: true });
      await expect(list.statusBadge(offer)).toHaveText('Offer');
      await expect(list.selectionBar).toBeVisible();
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('AC6: the To pay footer says "Still to pay" with the server open payable total; with a search or filter it says "in this list" and carries no figure marker', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} Footer Co`);
      await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-FT-1`,
        amount: 321,
      });

      const list = new InvoicesPage(page);
      // Other workers change the total constantly: the footer is checked against the totals the
      // responses that fed it carried (`summary` and `listTotals` of one unfiltered response are
      // the same number by construction).
      const served: number[] = [];
      const mismatched: string[] = [];
      page.on('response', (resp) => {
        const url = new URL(resp.url());
        if (url.pathname !== '/api/invoices' || resp.request().method() !== 'GET') return;
        if (url.searchParams.has('vendorId') || url.searchParams.has('q')) return;
        void resp
          .json()
          .then((body: ListApi) => {
            served.push(body.summary.openPayable.totalAmount);
            if (body.summary.openPayable.totalAmount !== body.listTotals.openPayable.totalAmount) {
              mismatched.push(
                `${body.summary.openPayable.totalAmount} vs ${body.listTotals.openPayable.totalAmount}`,
              );
            }
          })
          .catch(() => undefined);
      });
      await list.goto();
      await list.waitForLoaded();
      await expect(list.footerLabel).toHaveText('Still to pay');
      await expect(list.footerFigure).toHaveAttribute('data-figure', 'still-to-pay');
      await expect
        .poll(async () => {
          const shown = parseMoney(await list.footerFigure.innerText());
          return served.map(cents).includes(shown as number);
        })
        .toBe(true);
      expect(mismatched, 'summary.openPayable equals listTotals.openPayable').toEqual([]);

      // A search on the To pay chip: the figure is of this list, not the project figure
      // (an explicit chip keeps it from being "searching all")
      await list.goto(`status=pending&q=${encodeURIComponent(`${testPrefix}-FT-1`)}`);
      await list.waitForLoaded();
      await expect(list.footerLabel).toHaveText('Still to pay in this list');
      await expect(list.footerFigure).not.toHaveAttribute('data-figure', /.+/);
      await expect(list.figure('still-to-pay')).toHaveCount(0);
      expect(parseMoney(await list.footerFigure.innerText())).toBe(32100);

      // A company filter: same
      await list.gotoChip('pending', `vendorId=${vendorId}`);
      await expect(list.footerLabel).toHaveText('Still to pay in this list');
      await expect(list.figure('still-to-pay')).toHaveCount(0);

      // Other chips have no footer
      await list.gotoChip('paid', `vendorId=${vendorId}`);
      await expect(list.footer).toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L7 — D-30: the stat cards are gone
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices list — stat cards retired (D-30)', { tag: '@responsive' }, () => {
  test('D-30: the invoices page shows no stat cards and no "Ready to submit" figure', async ({
    page,
  }) => {
    const list = new InvoicesPage(page);
    for (const chip of ['pending', 'quotation', 'paid', 'claimed', 'all'] as const) {
      await list.gotoChip(chip);
      await expect(page.locator('[data-testid^="summary-card-"]')).toHaveCount(0);
      await expect(page.getByRole('main')).not.toContainText('Ready to submit');
      await expect(page.locator('[data-figure="ready-to-submit"]')).toHaveCount(0);
    }
    // The only summary strip is the Offers one, on the Offers chip
    await list.gotoChip('quotation');
    await expect(page.getByRole('region', { name: 'Offers summary' })).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L8 — paging retired (AC10)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices list — paging retired (AC10)', { tag: '@responsive' }, () => {
  test('AC10: ?page=3&pageSize=10 opens without error, the params are removed, and there is no pagination or page-size control', async ({
    page,
  }) => {
    const list = new InvoicesPage(page);
    await page.goto('/budget/invoices?page=3&pageSize=10');
    await list.heading.waitFor({ state: 'visible' });
    await list.waitForLoaded();

    await expect(list.retryButton).toHaveCount(0);
    await expect
      .poll(() => {
        const params = new URL(page.url()).searchParams;
        return params.has('page') || params.has('pageSize');
      })
      .toBe(false);
    await expect(page.getByLabel('Previous')).toHaveCount(0);
    await expect(page.getByLabel('Next')).toHaveCount(0);
    await expect(
      page.getByRole('combobox', { name: /page size|per page|items per page/i }),
    ).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L9 — responsive, links, selection bar, print, themes (AC11)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices list — layout and links (AC11)', { tag: '@responsive' }, () => {
  test('AC11: below 768 px of list width, rows are two-line cards with the company link; a plain title click navigates in place', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} Cards Co`);
      const id = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-CD-1`,
        amount: 640,
        dueDate: dayOffset(12),
      });

      // 700 px: the list is narrower than 768 px on every project, so the card surface shows
      await page.setViewportSize({ width: 700, height: 900 });
      const list = new InvoicesPage(page);
      await list.gotoChip('pending', `vendorId=${vendorId}`);

      await expect(list.tableSurface).toBeHidden();
      const card = list.row(id);
      await expect(card).toBeVisible();
      await expect(page.getByTestId(`invoices-row-${id}`)).toBeHidden();
      // Exactly two lines: the title line and the facts line
      await expect(card.locator(':scope > div')).toHaveCount(2);
      // Line 2: company link, due date, amount
      const facts = card.locator(':scope > div').nth(1);
      await expect(facts.getByTestId(`invoices-company-mobile-${id}`)).toHaveText(
        `${testPrefix} Cards Co`,
      );
      await expect(facts).toContainText('Due');
      await expect(facts).toContainText('640.00');

      // A plain click navigates in place (same page, no new tab)
      const pagesBefore = page.context().pages().length;
      await list.title(id).click();
      await expect(page).toHaveURL((url) => url.pathname === `/budget/invoices/${id}`);
      await expect(new InvoiceDetailPage(page).heading).toBeVisible();
      expect(page.context().pages().length).toBe(pagesBefore);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('AC11: Ctrl/⌘-click and middle-click on the title open a new page, and the anchor has no target attribute', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} NewTab Co`);
      const id = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-NT-1`,
        amount: 77,
      });

      const list = new InvoicesPage(page);
      await list.gotoChip('pending', `vendorId=${vendorId}`);
      const title = list.title(id);
      await expect(title).toBeVisible();
      await expect(title).not.toHaveAttribute('target', /.*/);
      await expect(title).toHaveAttribute('href', `/budget/invoices/${id}`);

      const [viaModifier] = await Promise.all([
        page.context().waitForEvent('page'),
        title.click({ modifiers: ['ControlOrMeta'] }),
      ]);
      await viaModifier.waitForURL(`**/budget/invoices/${id}`);
      await viaModifier.close();

      const [viaMiddle] = await Promise.all([
        page.context().waitForEvent('page'),
        title.click({ button: 'middle' }),
      ]);
      await viaMiddle.waitForURL(`**/budget/invoices/${id}`);
      await viaMiddle.close();

      // The list itself stayed where it was
      await expect(page).toHaveURL((url) => url.pathname === '/budget/invoices');
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('AC11: the selection bar is visible and "Mark paid (n)" is reachable', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} Bar Co`);
      const id = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-BR-1`,
        amount: 88,
      });

      const list = new InvoicesPage(page);
      await list.gotoChip('pending', `vendorId=${vendorId}`);
      await list.rowCheckbox(id).check();

      await expect(list.selectionBar).toBeVisible();
      await expect(list.bulkMarkPaid).toBeVisible();
      await expect(list.bulkMarkPaid).toBeInViewport();
      await expect(list.bulkMarkPaid).toHaveText('Mark paid (1)');
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('AC11: on a phone the selection bar pins above the bottom bar, with "Mark paid (n)" not covered', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} Pin Co`);
      const id = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-PN-1`,
        amount: 66,
      });

      const list = new InvoicesPage(page);
      await list.gotoChip('pending', `vendorId=${vendorId}`);
      const bottomBar = new AppShellPage(page).bottomBar;
      test.skip(!(await bottomBar.isVisible()), 'The bottom bar exists on the phone shell only');
      await list.rowCheckbox(id).check();
      await expect(list.selectionBar).toBeVisible();
      // The bar slides in: measure it once the animation has finished
      await list.selectionBar.evaluate((el) =>
        Promise.all(el.getAnimations().map((animation) => animation.finished)),
      );

      const button = await list.bulkMarkPaid.boundingBox();
      const bottom = await bottomBar.boundingBox();
      expect(button).not.toBeNull();
      expect(bottom).not.toBeNull();
      expect(
        button!.y + button!.height,
        'the Mark paid button ends above the bottom bar',
      ).toBeLessThanOrEqual(bottom!.y + 1);
      const covered = await list.bulkMarkPaid.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return hit === null || !el.contains(hit);
      });
      expect(covered, 'nothing covers the Mark paid button').toBe(false);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('AC11: the fixed selection bar leaves the page end reachable (spacer) and toasts sit above it', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} Spacer Co`);
      const a = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-SP-A`,
        amount: 70,
        dueDate: dayOffset(4),
      });
      const b = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-SP-B`,
        amount: 80,
        dueDate: dayOffset(8),
      });

      const list = new InvoicesPage(page);
      const toast = new ToastRegion(page);
      await list.gotoChip('pending', `vendorId=${vendorId}`);
      await list.rowCheckbox(a).check();
      await expect(list.selectionBar).toBeVisible();

      // The bar slides in: measure it once the animation has finished
      await list.selectionBar.evaluate((el) =>
        Promise.all(el.getAnimations().map((animation) => animation.finished)),
      );

      // Spacer: at the end of the page the footer (the last content) ends above the bar
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.evaluate(() => {
        const main = document.querySelector('main');
        if (main) main.scrollTop = main.scrollHeight;
      });
      await expect(list.footer).toBeInViewport();
      await expect
        .poll(async () => {
          const footer = await list.footer.boundingBox();
          const bar = await list.selectionBar.boundingBox();
          return footer !== null && bar !== null && footer.y + footer.height <= bar.y + 1;
        })
        .toBe(true);

      // The bar is fixed above the phone bottom bar: nothing of it lies under that bar
      const bottomBar = new AppShellPage(page).bottomBar;
      if (await bottomBar.isVisible()) {
        const bar = await list.selectionBar.boundingBox();
        const bottom = await bottomBar.boundingBox();
        expect(bar!.y + bar!.height).toBeLessThanOrEqual(bottom!.y + 1);
      }

      // A toast (Mark paid on the other row; row A stays selected) sits above the bar
      await list.markPaid(b);
      await expect(toast.undoToast).toBeVisible();
      await expect(list.selectionBar).toBeVisible();
      const toastBox = await toast.undoToast.boundingBox();
      const barBox = await list.selectionBar.boundingBox();
      expect(toastBox!.y + toastBox!.height, 'the toast ends above the bar').toBeLessThanOrEqual(
        barBox!.y + 1,
      );
      await expect(toast.undoButton).toBeVisible();
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('AC11: print shows the h1, the table, the Offers summary and the footer, and hides the toolbar and the checkboxes', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} Print Co`);
      await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-PR-INV`,
        amount: 99,
      });
      const offer = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-PR-OFR`,
        amount: 500,
        status: 'quotation',
      });

      const list = new InvoicesPage(page);
      await list.gotoChip('pending', `vendorId=${vendorId}`);
      await page.emulateMedia({ media: 'print' });
      await expect(list.heading).toBeVisible();
      await expect(list.tableSurface).toBeVisible();
      await expect(list.footer).toBeVisible();
      await expect(page.getByTestId('invoices-toolbar')).toBeHidden();
      await expect(page.locator('[data-testid^="invoices-select-"]:visible')).toHaveCount(0);

      await page.emulateMedia({ media: 'screen' });
      await list.gotoChip('quotation', `vendorId=${vendorId}`);
      await expect(list.title(offer)).toBeVisible();
      await page.emulateMedia({ media: 'print' });
      await expect(list.heading).toBeVisible();
      await expect(list.tableSurface).toBeVisible();
      await expect(list.offersSummary).toBeVisible();
      await expect(page.getByTestId('invoices-toolbar')).toBeHidden();
      await expect(page.locator('[data-testid^="invoices-select-"]:visible')).toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`AC11: in ${scheme} theme the Overdue and Refund badges show their words`, async ({
      page,
      testPrefix,
    }) => {
      const cleanup = newCleanup();
      try {
        const vendorId = await createVendor(page, cleanup, `${testPrefix} Theme Co`);
        const late = await seedInvoice(page, cleanup, vendorId, {
          invoiceNumber: `${testPrefix}-TH-LATE`,
          amount: 150,
          date: dayOffset(-90),
          dueDate: dayOffset(-15),
        });
        const withRefund = await seedInvoice(page, cleanup, vendorId, {
          invoiceNumber: `${testPrefix}-TH-REF`,
          amount: 250,
          dueDate: dayOffset(30),
        });
        const refund = await seedEntry(page, withRefund, {
          amount: 40,
          dueDate: dayOffset(7),
          entryType: 'refund',
        });

        await page.emulateMedia({ colorScheme: scheme });
        const list = new InvoicesPage(page);
        await list.gotoChip('pending', `vendorId=${vendorId}`);
        await page.evaluate((value) => {
          document.documentElement.setAttribute('data-theme', value);
        }, scheme);

        await expect(list.flagBadge(late)).toHaveText('Overdue');
        const bg = await list
          .flagBadge(late)
          .evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(bg).not.toBe('rgba(0, 0, 0, 0)');
        await expect(list.childStatus(refund)).toBeVisible();
        // The refund is a word, never a colour alone (table: the child row; cards: the card)
        const refundScope = (await list.isTableSurface())
          ? list.childRow(refund)
          : list.row(withRefund);
        await expect(refundScope.getByText('Refund', { exact: true })).toBeVisible();
      } finally {
        await runCleanup(cleanup);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// L10 — Invoice date, Due date and Amount filters
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoices list — range filters', { tag: '@responsive' }, () => {
  test('Filters › Invoice date, Due date and Amount narrow the list and write their URL params', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} Ranges Co`);
      const early = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-RG-EARLY`,
        amount: 100,
        date: '2026-01-10',
        dueDate: '2026-01-20',
      });
      const middle = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-RG-MID`,
        amount: 500,
        date: '2026-03-10',
        dueDate: '2026-03-25',
      });
      const late = await seedInvoice(page, cleanup, vendorId, {
        invoiceNumber: `${testPrefix}-RG-LATE`,
        amount: 900,
        date: '2026-05-10',
        dueDate: '2026-05-30',
      });

      const list = new InvoicesPage(page);
      await list.gotoChip('all', `vendorId=${vendorId}`);
      await expect(list.titleLinks).toHaveCount(3);

      // Invoice date: from March
      await list.openFilters();
      await list.rangeInput('date', 'from').fill('2026-03-01');
      await expect(page).toHaveURL((url) => url.searchParams.get('date') === 'from:2026-03-01');
      await expect(list.titleLinks).toHaveCount(2);
      await expect(list.title(early)).toHaveCount(0);
      await list.rangeInput('date', 'to').fill('2026-04-01');
      await expect(page).toHaveURL(
        (url) => url.searchParams.get('date') === 'from:2026-03-01,to:2026-04-01',
      );
      await expect(list.titleLinks).toHaveCount(1);
      await expect(list.title(middle)).toBeVisible();

      // The date range empties again; Due date: until the end of March
      await list.rangeInput('date', 'from').fill('');
      await list.rangeInput('date', 'to').fill('');
      await expect(page).toHaveURL((url) => !url.searchParams.has('date'));
      await expect(list.titleLinks).toHaveCount(3);
      await list.rangeInput('dueDate', 'to').fill('2026-03-31');
      await expect(page).toHaveURL((url) => url.searchParams.get('dueDate') === 'to:2026-03-31');
      await expect(list.titleLinks).toHaveCount(2);
      await expect(list.title(late)).toHaveCount(0);
      await list.rangeInput('dueDate', 'to').fill('');
      await expect(page).toHaveURL((url) => !url.searchParams.has('dueDate'));
      await expect(list.titleLinks).toHaveCount(3);

      // Amount: at least 400 (committed on Enter)
      await list.rangeInput('amount', 'min').fill('400');
      await list.rangeInput('amount', 'min').press('Enter');
      await expect(page).toHaveURL((url) => url.searchParams.get('amount') === 'min:400');
      await expect(list.titleLinks).toHaveCount(2);
      await expect(list.title(early)).toHaveCount(0);
      await list.rangeInput('amount', 'max').fill('600');
      await list.rangeInput('amount', 'max').press('Enter');
      await expect(page).toHaveURL((url) => url.searchParams.get('amount') === 'min:400,max:600');
      await expect(list.titleLinks).toHaveCount(1);
      await expect(list.title(middle)).toBeVisible();
    } finally {
      await runCleanup(cleanup);
    }
  });
});
