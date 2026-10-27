/**
 * E2E: the History page (/history, #2224, EPIC-21 P2.5).
 *
 * Events land in the shared E2E database next to every other test's events, and the test prefix
 * is per worker, not per test. So each test seeds its own fixtures under a per-test unique tag
 * (`uniq`, part of every task title, invoice number and the funding source name) and isolates its
 * rows with the History `q` filter. No assertion counts global rows. The "nothing at all" empty
 * state, paging and failures are only reachable through `page.route` mocks of GET /api/history.
 * Synthetic data only.
 *
 * Scenarios
 * - H1  Sidebar / More sheet -> History: h1, URL; the fixture's events sit newest first under a
 *       "Today" heading (all viewports) [smoke]
 * - H2  A bank submission is one row: both badges, the sentence, both invoice numbers, and the
 *       "Open ‹source›" link to the funding source page
 * - H3  Type chips: Payment, pressed again clears, Submission
 * - H4  Object filter: pick a task, only its rows, survives a reload, Escape returns focus
 * - H5  From / To limit the rows; "Include site diary entries" adds a saved entry to the day group
 * - H6  A task row's "Open task" link and Back to History with the filters intact
 * - H7  Infinite scroll (mocked): the second page appends; a failing page 2 shows the error and
 *       Retry works
 * - H8  States (mocked): empty, filtered-empty with Clear filters (focus on the first chip),
 *       first-load error with Try again
 * - H9  Responsive: below 768px the type chips scroll sideways and the other filters sit behind
 *       "Filters"; from 768px they are always shown; dark mode keeps the row readable
 * - H10 German: h1 "Verlauf" and the German type chips
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createBudgetSourceViaApi,
  createDiaryEntryViaApi,
  createVendorViaApi,
  createWorkItemViaApi,
  deleteBudgetSourceViaApi,
  deleteDiaryEntryViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { openAsLocaleUser } from '../../fixtures/localeUser.js';
import { mockSystemEvent } from '../../fixtures/systemEventMocks.js';
import { API } from '../../fixtures/testData.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { BreadcrumbsBar } from '../../pages/BreadcrumbsBar.js';
import { HistoryPage } from '../../pages/HistoryPage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

interface Seed {
  /** Unique per test; part of every fixture name, so `q=uniq` isolates this test's rows. */
  uniq: string;
  taskId: string;
  taskTitle: string;
  vendorId: string;
  sourceId: string;
  sourceName: string;
  paidInvoiceId: string;
  paidInvoiceNumber: string;
  invoiceAId: string;
  invoiceANumber: string;
  invoiceBId: string;
  invoiceBNumber: string;
}

async function createInvoice(
  page: Page,
  vendorId: string,
  invoiceNumber: string,
  amount: number,
): Promise<string> {
  const response = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { invoiceNumber, amount, date: '2026-03-01', status: 'pending' },
  });
  expect(response.ok(), `POST invoice ${invoiceNumber}: ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { invoice: { id: string } }).invoice.id;
}

/**
 * The three fixtures of the recipe, in this order (so the newest event is the submission):
 * a task status change, an invoice marked paid, and a two-invoice bank submission.
 */
async function seedFixtures(page: Page, testPrefix: string): Promise<Seed> {
  const uniq = `${testPrefix}-${Date.now().toString(36)}`;

  const taskTitle = `${uniq} Task`;
  const taskId = await createWorkItemViaApi(page, { title: taskTitle, status: 'not_started' });
  const status = await page.request.patch(`${API.workItems}/${taskId}`, {
    data: { status: 'in_progress' },
  });
  expect(status.ok(), `PATCH task status: ${status.status()}`).toBeTruthy();

  const vendorId = await createVendorViaApi(page, { name: `${uniq} Vendor` });

  const paidInvoiceNumber = `${uniq}-PAY`;
  const paidInvoiceId = await createInvoice(page, vendorId, paidInvoiceNumber, 400);
  const paid = await page.request.patch(`${API.vendors}/${vendorId}/invoices/${paidInvoiceId}`, {
    data: { status: 'paid' },
  });
  expect(paid.ok(), `PATCH invoice paid: ${paid.status()}`).toBeTruthy();

  const sourceName = `${uniq} Bank`;
  const sourceId = await createBudgetSourceViaApi(page, { name: sourceName, totalAmount: 50000 });
  const invoiceANumber = `${uniq}-A`;
  const invoiceBNumber = `${uniq}-B`;
  const invoiceAId = await createInvoice(page, vendorId, invoiceANumber, 1000);
  const invoiceBId = await createInvoice(page, vendorId, invoiceBNumber, 500);
  const claim = await page.request.post(API.sourceReportsMarkClaimed, {
    data: { sourceId, invoiceIds: [invoiceAId, invoiceBId], depositIds: [] },
  });
  expect(claim.ok(), `POST mark-claimed: ${claim.status()}`).toBeTruthy();

  return {
    uniq,
    taskId,
    taskTitle,
    vendorId,
    sourceId,
    sourceName,
    paidInvoiceId,
    paidInvoiceNumber,
    invoiceAId,
    invoiceANumber,
    invoiceBId,
    invoiceBNumber,
  };
}

async function cleanupFixtures(page: Page, seed: Seed | null): Promise<void> {
  if (!seed) return;
  for (const id of [seed.paidInvoiceId, seed.invoiceAId, seed.invoiceBId]) {
    await page.request.delete(`${API.vendors}/${seed.vendorId}/invoices/${id}`);
  }
  await deleteVendorViaApi(page, seed.vendorId);
  await deleteBudgetSourceViaApi(page, seed.sourceId);
  await deleteWorkItemViaApi(page, seed.taskId);
}

/** The browser's local calendar day (what History groups system events by), offset in days. */
function localDay(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function viewportWidth(page: Page): number {
  return page.viewportSize()?.width ?? 1920;
}

/** A GET /api/history response body for mocked scenarios. */
function historyBody(
  items: Array<Record<string, unknown>>,
  paging: { page?: number; totalPages?: number; totalItems?: number } = {},
): Record<string, unknown> {
  return {
    items,
    pagination: {
      page: paging.page ?? 1,
      pageSize: 25,
      totalItems: paging.totalItems ?? items.length,
      totalPages: paging.totalPages ?? 1,
    },
    hiddenCount: 0,
    object: null,
  };
}

/** `count` mocked task-status events with ids `<prefix>-<n>`, newest first. */
function mockEvents(prefix: string, count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, n) =>
    mockSystemEvent({
      id: `${prefix}-${n}`,
      createdAt: `2026-03-14T${String(23 - Math.floor(n / 4)).padStart(2, '0')}:${String(
        59 - (n % 4) * 10,
      ).padStart(2, '0')}:00.000Z`,
      metadata: {
        v: 1,
        event: 'status_changed',
        from: 'not_started',
        to: 'in_progress',
        subjectLabel: `Mock task ${prefix} ${n}`,
      },
    }),
  );
}

const HISTORY_API = '**/api/history*';

// ─────────────────────────────────────────────────────────────────────────────
// H1: reach History from the shell
// ─────────────────────────────────────────────────────────────────────────────

test.describe('History: reach and order (H1)', { tag: '@responsive' }, () => {
  test(
    'H1: the shell opens History; the fixture events sit newest first under "Today"',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      let seed: Seed | null = null;
      try {
        seed = await seedFixtures(page, testPrefix);
        const history = new HistoryPage(page);
        const appShell = new AppShellPage(page);

        // Sidebar (desktop) / More sheet (phone, tablet)
        await page.goto(routeUrl('home'));
        await expect(page.locator('main h1').first()).toBeVisible();
        await appShell.navigateTo('history');
        await expect(page).toHaveURL((url) => url.pathname === routeUrl('history'));
        await expect(history.heading).toBeVisible();
        await expect(
          page.getByText('Everything that changed in your project, newest first.'),
        ).toBeVisible();

        // This test's events only
        await history.goto({ q: seed.uniq });
        const submission = history.eventRows().filter({ hasText: 'submitted to the bank' });
        const payment = history
          .eventRows()
          .filter({ hasText: seed.paidInvoiceNumber })
          .filter({ hasText: 'Paid' });
        const taskStatus = history.eventRows().filter({ hasText: 'Task status' });
        await expect(submission).toHaveCount(1);
        await expect(payment).toHaveCount(1);
        await expect(taskStatus).toHaveCount(1);

        await expect(history.groupHeadingOf(submission)).toContainText('Today');
        await expect(history.dateGroup(localDay())).toBeVisible();
        await expect(history.dateGroups()).toHaveCount(1);

        // Newest first: submission (seeded last), then the payment, then the task status
        const texts = await history.eventRows().allTextContents();
        const indexOf = (needle: string) => texts.findIndex((text) => text.includes(needle));
        expect(indexOf('submitted to the bank')).toBeLessThan(indexOf(seed.paidInvoiceNumber));
        expect(indexOf('Task status')).toBeGreaterThan(indexOf(seed.paidInvoiceNumber));
      } finally {
        await cleanupFixtures(page, seed);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// H2: a bank submission is one row
// ─────────────────────────────────────────────────────────────────────────────

test.describe('History: bank submission row (H2)', { tag: '@responsive' }, () => {
  test('H2: two invoices submitted together are one row with a link to the funding source', async ({
    page,
    testPrefix,
  }) => {
    let seed: Seed | null = null;
    try {
      seed = await seedFixtures(page, testPrefix);
      const history = new HistoryPage(page);
      await history.goto({ q: seed.uniq, type: 'submission' });

      // Exactly one row for the whole batch
      const rows = history.eventRows();
      await expect(rows).toHaveCount(1);
      const row = rows.first();

      await expect(row).toContainText('Invoice status');
      await expect(row).toContainText('Submission');
      await expect(row).toContainText(/2 invoices submitted to the bank, .*1,500\.00/);
      await expect(row).toContainText(seed.invoiceANumber);
      await expect(row).toContainText(seed.invoiceBNumber);

      // The link row goes to the funding source's own page (#2243: no longer the bank report)
      const link = row.getByRole('link', { name: `Open ${seed.sourceName}` });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', routeUrl('fundingSource', { id: seed.sourceId }));
      await link.click();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('fundingSource', { id: seed?.sourceId ?? '' }),
      );
    } finally {
      await cleanupFixtures(page, seed);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H3: type chips
// ─────────────────────────────────────────────────────────────────────────────

test.describe('History: type chips (H3)', { tag: '@responsive' }, () => {
  test('H3: Payment shows the payment, pressing it again clears; Submission shows the batch', async ({
    page,
    testPrefix,
  }) => {
    let seed: Seed | null = null;
    try {
      seed = await seedFixtures(page, testPrefix);
      const history = new HistoryPage(page);
      await history.goto({ q: seed.uniq });

      const taskRow = history.eventRows().filter({ hasText: 'Task status' });
      const paymentRow = history.eventRows().filter({ hasText: seed.paidInvoiceNumber });
      const submissionRow = history.eventRows().filter({ hasText: 'submitted to the bank' });
      await expect(taskRow).toHaveCount(1);

      // Payment
      await history.typeChip('payment').click();
      await expect(history.typeChip('payment')).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(/[?&]type=payment/);
      await expect(paymentRow.filter({ hasText: 'Payment' })).toHaveCount(1);
      await expect(taskRow).toHaveCount(0);
      await expect(submissionRow).toHaveCount(0);

      // Pressed again: the filter clears and the task row is back
      await history.typeChip('payment').click();
      await expect(history.typeChip('payment')).toHaveAttribute('aria-pressed', 'false');
      await expect(page).not.toHaveURL(/[?&]type=/);
      await expect(taskRow).toHaveCount(1);

      // Submission
      await history.typeChip('submission').click();
      await expect(history.typeChip('submission')).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(/[?&]type=submission/);
      await expect(history.eventRows()).toHaveCount(1);
      await expect(submissionRow).toHaveCount(1);
      await expect(taskRow).toHaveCount(0);
    } finally {
      await cleanupFixtures(page, seed);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H4: object filter
// ─────────────────────────────────────────────────────────────────────────────

test.describe('History: object filter (H4)', { tag: '@responsive' }, () => {
  test('H4: picking a task shows only its rows, survives a reload and Escape returns to the chip', async ({
    page,
    testPrefix,
  }) => {
    let seed: Seed | null = null;
    try {
      seed = await seedFixtures(page, testPrefix);
      const history = new HistoryPage(page);
      await history.goto();

      // Escape in the open picker closes it and returns focus to the chip
      await history.openFiltersIfCollapsed();
      await history.objectChip.click();
      await expect(history.objectChip).toHaveAttribute('aria-expanded', 'true');
      await history.objectPickerInput.waitFor({ state: 'visible' });
      await history.objectPickerInput.focus();
      await page.keyboard.press('Escape');
      await expect(history.objectChip).toBeFocused();
      await expect(history.objectChip).toHaveAttribute('aria-expanded', 'false');

      await history.pickObject(seed.taskTitle);
      await expect(page).toHaveURL(
        (url) => url.searchParams.get('object') === `work_item:${seed?.taskId}`,
      );
      await expect(history.objectChip).toContainText(`Object · ${seed.taskTitle}`);

      // Only that task's rows: its one status event
      await expect(history.eventRows()).toHaveCount(1);
      await expect(history.eventRows().first()).toContainText(seed.taskTitle);

      // The chip names the task again after a reload (the API echoes the object back)
      await page.reload();
      await history.heading.waitFor({ state: 'visible' });
      await history.openFiltersIfCollapsed();
      await expect(history.objectChip).toContainText(`Object · ${seed.taskTitle}`);
      await expect(history.eventRows()).toHaveCount(1);

      // Clearing: the chip opens the picker with the selection and its "Clear selection" button
      await history.objectChip.click();
      await expect(history.objectChip).toHaveAttribute('aria-expanded', 'true');
      await history.objectPicker.clearButton.click();
      await expect(page).not.toHaveURL(/[?&]object=/);
      await expect(history.objectChip).not.toContainText('Object ·');
    } finally {
      await cleanupFixtures(page, seed);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H5: dates and "Include site diary entries"
// ─────────────────────────────────────────────────────────────────────────────

test.describe('History: dates and include toggle (H5)', { tag: '@responsive' }, () => {
  test('H5a: From and To limit the rows', async ({ page, testPrefix }) => {
    let seed: Seed | null = null;
    try {
      seed = await seedFixtures(page, testPrefix);
      const history = new HistoryPage(page);
      await history.goto({ q: seed.uniq });
      await history.openFiltersIfCollapsed();
      await expect(history.eventRows().first()).toBeVisible();

      // From after today: nothing left
      await history.setDate('from', localDay(2));
      await expect(history.eventRows()).toHaveCount(0);
      await expect(history.emptyState).toContainText('No changes match these filters');

      // To before today (From cleared): nothing either
      await history.setDate('from', '');
      await history.setDate('to', localDay(-3));
      await expect(history.eventRows()).toHaveCount(0);
      await expect(history.emptyState).toContainText('No changes match these filters');

      // A window around today brings the rows back
      await history.setDate('to', localDay(1));
      await history.setDate('from', localDay(-1));
      await expect(history.eventRows().filter({ hasText: 'Task status' })).toHaveCount(1);
      await expect(page).toHaveURL(/dateFrom=/);
      await expect(page).toHaveURL(/dateTo=/);
    } finally {
      await cleanupFixtures(page, seed);
    }
  });

  test('H5b: "Include site diary entries" adds a saved entry as a card in the same day group', async ({
    page,
    testPrefix,
  }) => {
    let seed: Seed | null = null;
    let entryId = '';
    try {
      seed = await seedFixtures(page, testPrefix);
      entryId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: localDay(),
        title: `${seed.uniq} Site note`,
        body: 'Synthetic note for the History include toggle.',
      });
      const history = new HistoryPage(page);
      await history.goto({ q: seed.uniq });

      // Off by default: system events only
      await expect(history.eventRows().first()).toBeVisible();
      await expect(history.diaryCards()).toHaveCount(0);

      await history.openFiltersIfCollapsed();
      await history.includeDiaryCheckbox.check();
      await expect(history.includeDiaryCheckbox).toBeChecked();
      await expect(page).toHaveURL(/[?&]include=diary/);

      const card = history.diaryCards();
      await expect(card).toHaveCount(1);
      await expect(card).toContainText(`${seed.uniq} Site note`);
      // Same day group as the events
      const group = history.dateGroup(localDay());
      await expect(group.locator('li[data-testid^="diary-entry-"]')).toHaveCount(1);
      await expect(group.locator('li[data-testid^="system-event-"]').first()).toBeVisible();
      await expect(history.dateGroups()).toHaveCount(1);

      // Off again: the card goes
      await history.includeDiaryCheckbox.uncheck();
      await expect(history.includeDiaryCheckbox).not.toBeChecked();
      await expect(history.diaryCards()).toHaveCount(0);
      await expect(page).not.toHaveURL(/include=/);
    } finally {
      if (entryId) await deleteDiaryEntryViaApi(page, entryId);
      await cleanupFixtures(page, seed);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H6: row link and Back
// ─────────────────────────────────────────────────────────────────────────────

test.describe('History: row link and Back (H6)', { tag: '@responsive' }, () => {
  test('H6: "Open task" opens the task; Back returns to History with the filters intact', async ({
    page,
    testPrefix,
  }) => {
    let seed: Seed | null = null;
    try {
      seed = await seedFixtures(page, testPrefix);
      const history = new HistoryPage(page);
      await history.goto({ q: seed.uniq, type: 'work_item_status' });

      const row = history.eventRows().filter({ hasText: seed.taskTitle });
      await expect(row).toHaveCount(1);
      const link = row.getByRole('link', { name: /^Open task/ });
      await expect(link).toHaveText(/Open task/);
      await link.click();

      await expect(page).toHaveURL((url) => url.pathname.endsWith(`/${seed?.taskId}`));
      const breadcrumbs = new BreadcrumbsBar(page);
      await breadcrumbs.expectBack('History');
      await breadcrumbs.backLink.click();

      await expect(page).toHaveURL(
        (url) =>
          url.pathname === routeUrl('history') &&
          url.searchParams.get('q') === seed?.uniq &&
          url.searchParams.get('type') === 'work_item_status',
      );
      await expect(history.heading).toBeVisible();
      await expect(history.typeChip('work_item_status')).toHaveAttribute('aria-pressed', 'true');
      await expect(history.eventRows().filter({ hasText: seed.taskTitle })).toHaveCount(1);
    } finally {
      await cleanupFixtures(page, seed);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H7: infinite scroll (mocked)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('History: infinite scroll (H7)', { tag: '@responsive' }, () => {
  test('H7a: the second page appends on scroll and the list ends', async ({ page }) => {
    const history = new HistoryPage(page);
    const pageOne = mockEvents('hist-p1', 25);
    const pageTwo = mockEvents('hist-p2', 3);
    const requestedPages: string[] = [];

    await page.route(HISTORY_API, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const requested = new URL(route.request().url()).searchParams.get('page') ?? '1';
      requestedPages.push(requested);
      const second = requested === '2';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          historyBody(second ? pageTwo : pageOne, {
            page: second ? 2 : 1,
            totalPages: 2,
            totalItems: 28,
          }),
        ),
      });
    });

    try {
      await history.goto();
      await expect(history.systemEventRow('hist-p1-0')).toBeVisible();

      await history.scrollToBottom();
      await expect(history.systemEventRow('hist-p2-0')).toBeVisible();
      await expect(history.systemEventRow('hist-p1-0')).toHaveCount(1);
      await expect(history.eventRows()).toHaveCount(28);
      await expect(history.endOfListMessage).toBeVisible();
      await expect(history.endOfListMessage).toContainText(
        "You've reached the start of the history.",
      );
      expect(requestedPages).toEqual(['1', '2']);
    } finally {
      await page.unroute(HISTORY_API);
    }
  });

  test('H7b: a failing second page shows the error and Retry loads it', async ({ page }) => {
    const history = new HistoryPage(page);
    const pageOne = mockEvents('hist-f1', 25);
    const pageTwo = mockEvents('hist-f2', 3);
    let failSecondPage = true;

    await page.route(HISTORY_API, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const second = new URL(route.request().url()).searchParams.get('page') === '2';
      if (second && failSecondPage) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          historyBody(second ? pageTwo : pageOne, {
            page: second ? 2 : 1,
            totalPages: 2,
            totalItems: 28,
          }),
        ),
      });
    });

    try {
      await history.goto();
      await expect(history.systemEventRow('hist-f1-0')).toBeVisible();

      await history.scrollToBottom();
      await expect(history.footerError).toBeVisible();
      await expect(history.footerError).toContainText("Couldn't load more changes.");
      await expect(history.loadMoreButton).toHaveText('Retry');
      await expect(history.systemEventRow('hist-f2-0')).toHaveCount(0);
      // The first page stays on screen
      await expect(history.systemEventRow('hist-f1-0')).toHaveCount(1);

      failSecondPage = false;
      await history.loadMoreButton.click();
      await expect(history.systemEventRow('hist-f2-0')).toBeVisible();
      await expect(history.footerError).toBeHidden();
      await expect(history.endOfListMessage).toBeVisible();
    } finally {
      await page.unroute(HISTORY_API);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H8: states (mocked)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('History: states (H8)', { tag: '@responsive' }, () => {
  test('H8a: nothing at all shows "Nothing has changed yet" under the h1', async ({ page }) => {
    const history = new HistoryPage(page);
    await page.route(HISTORY_API, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(historyBody([])),
      });
    });

    try {
      await history.goto();
      await expect(history.emptyState).toContainText('Nothing has changed yet');
      await expect(history.emptyState).toContainText(
        'When a task, invoice, grant or milestone changes, it shows up here by itself.',
      );
      await expect(history.emptyStateClearButton).toHaveCount(0);
      await expect(history.footer).toHaveCount(0);
      // The filters stay in the empty state
      await expect(history.typeChip('payment')).toBeVisible();
    } finally {
      await page.unroute(HISTORY_API);
    }
  });

  test('H8b: filtered-empty offers Clear filters, which focuses the first type chip', async ({
    page,
  }) => {
    const history = new HistoryPage(page);
    await page.route(HISTORY_API, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const filtered = new URL(route.request().url()).searchParams.has('type');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(historyBody(filtered ? [] : mockEvents('hist-clr', 2))),
      });
    });

    try {
      await history.goto({ type: 'payment' });
      await expect(history.emptyState).toContainText('No changes match these filters');
      await expect(history.emptyState).toContainText(
        'Try another type or other dates, or clear the filters.',
      );
      await expect(history.typeChip('payment')).toHaveAttribute('aria-pressed', 'true');

      await history.emptyStateClearButton.click();
      await expect(page).not.toHaveURL(/[?&]type=/);
      await expect(history.systemEventRow('hist-clr-0')).toBeVisible();
      await expect(history.typeChip('payment')).toHaveAttribute('aria-pressed', 'false');
      await expect(history.typeChip('work_item_status')).toBeFocused();
    } finally {
      await page.unroute(HISTORY_API);
    }
  });

  test('H8c: a first-load error keeps the h1, shows the message and Try again recovers', async ({
    page,
  }) => {
    const history = new HistoryPage(page);
    let failing = true;
    await page.route(HISTORY_API, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      if (failing) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(historyBody(mockEvents('hist-err', 2))),
      });
    });

    try {
      await history.goto();
      await expect(history.heading).toBeVisible();
      await expect(
        page.getByRole('alert').filter({ hasText: "Couldn't load History." }),
      ).toBeVisible();
      await expect(history.tryAgainButton).toBeVisible();
      await expect(page.getByText('Server error')).toHaveCount(0);
      // The filters stay usable
      await expect(history.typeChip('payment')).toBeVisible();

      failing = false;
      await history.tryAgainButton.click();
      await expect(history.systemEventRow('hist-err-0')).toBeVisible();
      await expect(history.tryAgainButton).toHaveCount(0);
    } finally {
      await page.unroute(HISTORY_API);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H9: responsive and dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('History: responsive layout (H9)', { tag: '@responsive' }, () => {
  test('H9a: below 768px the type chips scroll sideways and the other filters sit behind "Filters"', async ({
    page,
  }) => {
    test.skip(viewportWidth(page) >= 768, 'phone layout only');
    const history = new HistoryPage(page);
    await history.goto();

    // Nine chips do not fit: the group scrolls sideways, the page itself does not
    const scrolls = await history.typeChipGroup.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrolls, 'the type chips scroll sideways').toBe(true);
    const pageScrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(pageScrolls, 'no sideways page scroll').toBe(false);

    // The other filters are hidden until "Filters" is pressed
    await expect(history.filtersToggle).toBeVisible();
    await expect(history.filtersToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(history.searchInput).toBeHidden();
    await expect(history.includeDiaryCheckbox).toBeHidden();

    await history.filtersToggle.click();
    await expect(history.filtersToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(history.filtersToggle).toBeFocused();
    await expect(history.searchInput).toBeVisible();
    await expect(history.objectChip).toBeVisible();
    await expect(history.dateFromInput).toBeVisible();
    await expect(history.dateToInput).toBeVisible();
    await expect(history.includeDiaryCheckbox).toBeVisible();

    await history.filtersToggle.click();
    await expect(history.filtersToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(history.searchInput).toBeHidden();
  });

  test('H9b: from 768px every filter is shown and there is no "Filters" button', async ({
    page,
  }) => {
    test.skip(viewportWidth(page) < 768, 'tablet and desktop layout only');
    const history = new HistoryPage(page);
    await history.goto();

    await expect(history.filtersToggle).toBeHidden();
    await expect(history.searchInput).toBeVisible();
    await expect(history.objectChip).toBeVisible();
    await expect(history.dateFromInput).toBeVisible();
    await expect(history.dateToInput).toBeVisible();
    await expect(history.includeDiaryCheckbox).toBeVisible();
    await expect(history.typeChip('payment')).toBeVisible();

    const pageScrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(pageScrolls, 'no sideways page scroll').toBe(false);
  });

  test('H9c: dark mode keeps the row stripe and text visible against the background', async ({
    page,
  }) => {
    const history = new HistoryPage(page);
    await page.route(HISTORY_API, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(historyBody(mockEvents('hist-dark', 2))),
      });
    });

    try {
      await history.goto();
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      const row = history.systemEventRow('hist-dark-0');
      await expect(row).toBeVisible();

      const colors = await row.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          text: style.color,
          stripe: style.borderLeftColor,
          stripeWidth: style.borderLeftWidth,
          background: getComputedStyle(document.body).backgroundColor,
        };
      });
      expect(colors.text, 'row text differs from the page background').not.toBe(colors.background);
      expect(colors.stripe, 'row stripe differs from the page background').not.toBe(
        colors.background,
      );
      expect(colors.stripeWidth).not.toBe('0px');

      const pageScrolls = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(pageScrolls).toBe(false);
    } finally {
      await page.unroute(HISTORY_API);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H10: German
// ─────────────────────────────────────────────────────────────────────────────

test.describe('History: German (H10)', { tag: '@responsive' }, () => {
  test('H10: a German user sees "Verlauf" and the German type chips, no raw keys', async ({
    page,
    browser,
    testPrefix,
  }) => {
    const session = { dispose: async () => {} };
    try {
      const german = await openAsLocaleUser(browser, page, testPrefix, '/history', 'de');
      session.dispose = german.dispose;
      const history = new HistoryPage(german.page);

      await expect(
        german.page.getByRole('heading', { level: 1, name: 'Verlauf', exact: true }),
      ).toBeVisible();
      await expect(history.typeChip('work_item_status')).toHaveText('Aufgabenstatus');
      await expect(history.typeChip('payment')).toHaveText('Zahlung');
      await expect(history.typeChip('submission')).toHaveText('Einreichung');
      await expect(history.typeChip('auto_reschedule')).toHaveText('Zeitplanänderung');
      await expect(
        german.page.getByText('Alles, was sich in deinem Projekt geändert hat, neueste zuerst.'),
      ).toBeVisible();

      // No raw translation keys anywhere on the page
      await expect(german.page.getByText(/filters\.(type|object|include)/)).toHaveCount(0);
      await expect(german.page.getByText(/^history:/)).toHaveCount(0);
    } finally {
      await session.dispose();
    }
  });
});
