/**
 * E2E tests for the Offer and invoice page on the detail template (#2239, EPIC-21 P4.7).
 *
 * Header (h1, company link, status chip, one primary, at most one secondary, ⋯ menu), the summary
 * strip, the Cost / Payments / History tabs and the layout rules (AC7 / AC8). Payments and refunds
 * are covered in invoice-deposits.spec.ts, the `?payment=` deep link in
 * invoice-payment-target.spec.ts, the offer → invoice conversion in
 * invoice-quotation-conversion.spec.ts and the registry figures in
 * consistency/figure-consistency.spec.ts (FC6).
 *
 * Scenarios (numbering follows the E2E spec of #2239):
 *   E1  Invoice (To pay): h1, company link and Back, chip, primary Mark paid, secondary, ⋯ order
 *   E2  Mark paid via the primary: chip Paid, Undo toast, Prepare bank report, Undo restores it
 *   E4  Strip: fact values, Paid opens Payments (replace, panel focus), Split opens Cost, Funding
 *       source href, Documents fact (absent without Paperless, present with it)
 *   E5  Tabs: Cost is the default, counts, arrow keys, reload keeps History
 *   E8  Cost tab: one group per task with area breadcrumbs, no Belongs to column
 *   E9  History: a status change appears as a row; Show all in History carries object=invoice:<id>
 *   E10 @responsive Desktop 1280x800 and phone 390x844: the strip stays compact, light and dark
 *   E11 @responsive No orphan cells: the last fact of each row ends at the strip's right edge
 *   E12 Delete from ⋯ with counts → Invoices; Back does not return to the deleted page
 *   E13 Breadcrumb "Money › Invoices"; opened from a company page shows "Back to <company>"
 *
 * Synthetic data only; every record is removed in afterEach.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { createAreaViaApi, deleteAreaViaApi } from '../../fixtures/apiHelpers.js';
import {
  createFundingSource,
  createLinkedCostLine,
  createTask,
  createVendor,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import type { SeedCleanup } from '../../fixtures/costLineSeed.js';
import { mockPaperlessConfigured } from '../../fixtures/paperlessMocks.js';
import { API } from '../../fixtures/testData.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';

let cleanup: SeedCleanup;

test.beforeEach(() => {
  cleanup = newCleanup();
});

test.afterEach(async () => {
  await runCleanup(cleanup);
});

interface Seeded {
  readonly vendorId: string;
  readonly invoiceId: string;
  readonly company: string;
  readonly number: string;
}

/** A company with one invoice (default `pending`). */
async function seedInvoice(
  page: Page,
  prefix: string,
  options: {
    amount?: number;
    status?: 'quotation' | 'pending' | 'paid' | 'claimed';
    notes?: string;
    dueDate?: string;
  } = {},
): Promise<Seeded> {
  const company = `${prefix} Page Company`;
  const number = `${prefix}-PG`;
  const vendorId = await createVendor(page, cleanup, company);
  const response = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: {
      invoiceNumber: number,
      amount: options.amount ?? 1500,
      date: '2026-06-01',
      status: options.status ?? 'pending',
      ...(options.notes ? { notes: options.notes } : {}),
      ...(options.dueDate ? { dueDate: options.dueDate } : {}),
    },
  });
  expect(response.ok(), `POST invoice failed: ${response.status()}`).toBeTruthy();
  const invoiceId = ((await response.json()) as { invoice: { id: string } }).invoice.id;
  cleanup.fns.push(async () => {
    await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoiceId}`);
  });
  return { vendorId, invoiceId, company, number };
}

async function addDeposit(
  page: Page,
  invoiceId: string,
  data: { amount: number; dueDate: string; paid?: boolean },
): Promise<string> {
  const created = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
    data: { amount: data.amount, dueDate: data.dueDate, status: 'pending' },
  });
  expect(created.ok(), `POST deposit failed: ${created.status()}`).toBeTruthy();
  const id = ((await created.json()) as { deposit: { id: string } }).deposit.id;
  if (data.paid) {
    const paid = await page.request.patch(`/api/invoices/${invoiceId}/deposits/${id}`, {
      data: { status: 'paid', paidDate: '2026-06-20' },
    });
    expect(paid.ok(), `PATCH deposit paid failed: ${paid.status()}`).toBeTruthy();
  }
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// E1: the header of an invoice
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice page header (E1)', { tag: '@responsive' }, () => {
  test(
    'E1: h1, company link with Back, chip, Mark paid primary, secondary and ⋯ order',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const seed = await seedInvoice(page, testPrefix, { notes: `${testPrefix} synthetic note` });
      const detail = new InvoiceDetailPage(page);
      await detail.goto(seed.invoiceId);

      await expect(detail.heading).toHaveText(`${seed.company} · ${seed.number}`);
      await expect(detail.header.description).toContainText(`${testPrefix} synthetic note`);
      await expect(detail.statusBadge).toHaveText('To pay');
      await expect(detail.markPaid.trigger).toHaveText(/^Mark paid/);
      await expect(detail.addPaymentSecondary).toHaveText('Add progress payment');
      // Exactly one primary at a time: no Convert, bank report or add-payment primary
      await expect(detail.convertButton).toHaveCount(0);
      await expect(detail.bankReportLink).toHaveCount(0);
      await expect(detail.addPaymentPrimary).toHaveCount(0);

      // ⋯ menu: Copy link, Print, Edit details, separator, Delete
      await detail.header.openMenu();
      expect(await detail.header.menuLabels()).toEqual([
        'Copy link',
        'Print',
        'Edit details',
        'Delete',
      ]);
      await expect(page.getByRole('separator')).toHaveCount(1);
      await page.keyboard.press('Escape');

      // The company link opens the Company page; Back returns to the invoice
      await expect(detail.companyLink).toHaveText(seed.company);
      await detail.companyLink.click();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('company', { id: seed.vendorId }),
      );
      await page.goBack();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('invoice', { id: seed.invoiceId }),
      );
      await expect(detail.heading).toHaveText(`${seed.company} · ${seed.number}`);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// E2: Mark paid with Undo
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice page Mark paid (E2)', { tag: '@responsive' }, () => {
  test('E2: Mark paid applies at once; the primary becomes Prepare bank report; Undo restores it', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedInvoice(page, testPrefix);
    // One funding source, so the bank report link carries it
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Savings`);
    const taskId = await createTask(page, cleanup, `${testPrefix} Bank report task`);
    await createLinkedCostLine(page, seed.invoiceId, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Bank report line`,
      plannedAmount: 500,
      includesVat: true,
      itemizedAmount: 500,
    });

    const detail = new InvoiceDetailPage(page);
    await detail.goto(seed.invoiceId);
    await detail.costLines.waitForLoaded();
    await expect(detail.markPaid.trigger).toHaveText(/^Mark paid/);

    await detail.markPaid.trigger.click();

    // No date step for an invoice: it is paid at once, with an Undo toast
    await expect(detail.statusBadge).toHaveText('Paid');
    await expect(detail.toasts.undoToast).toBeVisible();
    await expect(detail.bankReportLink).toHaveText('Prepare bank report');
    await expect(detail.bankReportLink).toHaveAttribute(
      'href',
      new RegExp(`/budget/reports\\?type=claim&sourceId=${sourceId}$`),
    );
    await expect(detail.markPaid.trigger).toHaveCount(0);

    await detail.toasts.undoViaButton();
    await expect(detail.statusBadge).toHaveText('To pay');
    await expect(detail.markPaid.trigger).toHaveText(/^Mark paid/);
    await expect(detail.bankReportLink).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E4: the summary strip
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice page summary strip (E4)', { tag: '@responsive' }, () => {
  test('E4: facts show the record; Paid opens Payments, Split opens Cost; Funding source links', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedInvoice(page, testPrefix, { amount: 1500, dueDate: '2099-01-15' });
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Strip Savings`);
    const taskId = await createTask(page, cleanup, `${testPrefix} Strip task`);
    await createLinkedCostLine(page, seed.invoiceId, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Strip line`,
      plannedAmount: 500,
      includesVat: true,
      itemizedAmount: 500,
    });
    await addDeposit(page, seed.invoiceId, { amount: 200, dueDate: '2026-06-20', paid: true });

    const detail = new InvoiceDetailPage(page);
    await detail.goto(seed.invoiceId);
    await detail.costLines.waitForLoaded();
    const strip = detail.summary;

    await expect(strip.fact('amount')).toContainText('1,500.00');
    await expect(strip.fact('paid')).toContainText('200.00');
    await expect(strip.fact('stillToPay')).toContainText('1,300.00');
    await expect(strip.fact('due')).not.toHaveText('');
    await expect(strip.fact('split')).toContainText('33%');
    await expect(strip.fact('fundingSource')).toHaveText(`${testPrefix} Strip Savings`);
    await expect(strip.fact('fundingSource')).toHaveAttribute(
      'href',
      routeUrl('fundingSource', { id: sourceId }),
    );
    // The same markers the consistency test reads
    await expect(strip.figure('paid')).toHaveCount(1);
    await expect(strip.figure('still-to-pay')).toHaveCount(1);

    // Paid opens Payments with a replace navigation and moves focus into the panel
    const historyBefore = await page.evaluate(() => window.history.length);
    await strip.fact('paid').click();
    await expect(detail.tabs.tab('payments')).toHaveAttribute('aria-selected', 'true');
    expect(new URL(page.url()).searchParams.get('tab')).toBe('payments');
    await expect(
      detail.tabs.panel('payments').getByRole('heading', { level: 2 }).first(),
    ).toBeFocused();
    expect(await page.evaluate(() => window.history.length)).toBe(historyBefore);

    // Split opens Cost
    await strip.fact('split').click();
    await expect(detail.tabs.tab('cost')).toHaveAttribute('aria-selected', 'true');
    await expect(detail.costLines.section).toBeVisible();
  });

  test('E4: the Documents fact is absent without Paperless, present and opening the panel with it', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedInvoice(page, testPrefix);
    const detail = new InvoiceDetailPage(page);

    // The default environment has no Paperless: no fact, no panel
    await detail.goto(seed.invoiceId);
    await detail.costLines.waitForLoaded();
    await expect(detail.documentsFact).toHaveCount(0);

    // With Paperless available the fact opens the Documents panel
    await mockPaperlessConfigured(page);
    await page.reload();
    await expect(detail.documentsFact).toBeVisible();
    await expect(detail.documentsFact).toHaveText('0');
    await detail.openDocuments();
    await expect(detail.documents.title).toHaveText('Documents (0)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E5: tabs
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice page tabs (E5)', { tag: '@responsive' }, () => {
  test('E5: Cost is the default; counts; arrow keys move; reload keeps History', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedInvoice(page, testPrefix);
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Tabs Savings`);
    const taskId = await createTask(page, cleanup, `${testPrefix} Tabs task`);
    for (const letter of ['A', 'B']) {
      await createLinkedCostLine(page, seed.invoiceId, {
        kind: 'work_item',
        hostId: taskId,
        budgetSourceId: sourceId,
        description: `${testPrefix} Tabs line ${letter}`,
        plannedAmount: 100,
        includesVat: true,
        itemizedAmount: 100,
      });
    }
    await addDeposit(page, seed.invoiceId, { amount: 100, dueDate: '2026-06-20' });

    const detail = new InvoiceDetailPage(page);
    await detail.goto(seed.invoiceId);

    // Cost is selected with no ?tab= parameter
    await expect(detail.tabs.tab('cost')).toHaveAttribute('aria-selected', 'true');
    expect(new URL(page.url()).searchParams.get('tab')).toBeNull();
    await expect(detail.tabs.tab('cost')).toHaveText('Cost (2)');
    await expect(detail.tabs.tab('payments')).toHaveText('Payments (1)');
    await expect(detail.tabs.tab('history')).toHaveText('History');

    // Arrow keys move selection and focus; Home returns to the first tab
    await detail.tabs.tab('cost').focus();
    await page.keyboard.press('ArrowRight');
    await expect(detail.tabs.tab('payments')).toHaveAttribute('aria-selected', 'true');
    await expect(detail.tabs.tab('payments')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(detail.tabs.tab('history')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(detail.tabs.tab('cost')).toHaveAttribute('aria-selected', 'true');

    // The selected tab survives a reload
    await detail.tabs.select('history');
    expect(new URL(page.url()).searchParams.get('tab')).toBe('history');
    await page.reload();
    await expect(detail.heading).toBeVisible();
    await expect(detail.tabs.tab('history')).toHaveAttribute('aria-selected', 'true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E8: Cost tab grouped by task
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice page Cost tab (E8)', { tag: '@responsive' }, () => {
  test('E8: one group per task with the area breadcrumb; no Belongs to column', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedInvoice(page, testPrefix, { amount: 2000 });
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Group Savings`);
    const rootName = `${testPrefix} Group Structure`;
    const childName = `${testPrefix} Group Foundation`;
    const rootAreaId = await createAreaViaApi(page, { name: rootName });
    const childAreaId = await createAreaViaApi(page, { name: childName, parentId: rootAreaId });
    cleanup.fns.push(async () => {
      await deleteAreaViaApi(page, childAreaId);
      await deleteAreaViaApi(page, rootAreaId);
    });
    const taskWithArea = `${testPrefix} Group task with area`;
    const taskNoArea = `${testPrefix} Group task no area`;
    const taskAId = await createTaskWithArea(page, taskWithArea, childAreaId);
    const taskBId = await createTask(page, cleanup, taskNoArea);
    cleanup.fns.push(async () => {
      await page.request.delete(`${API.workItems}/${taskAId}`);
    });
    for (const [hostId, name] of [
      [taskAId, 'Beam'],
      [taskBId, 'Slab'],
    ] as const) {
      await createLinkedCostLine(page, seed.invoiceId, {
        kind: 'work_item',
        hostId,
        budgetSourceId: sourceId,
        description: `${testPrefix} Group ${name}`,
        plannedAmount: 300,
        includesVat: true,
        itemizedAmount: 300,
      });
    }

    const detail = new InvoiceDetailPage(page);
    await detail.goto(seed.invoiceId);
    await detail.costLines.waitForLoaded();

    const withArea = detail.costLines.groupHeading(taskWithArea);
    const noArea = detail.costLines.groupHeading(taskNoArea);
    await expect(withArea).toBeVisible();
    await expect(noArea).toBeVisible();
    await expect(withArea.getByRole('link', { name: taskWithArea })).toBeVisible();
    // The compact breadcrumb carries the area path; an item without an area says "No area"
    await expect(withArea.locator('[class*="compact"]')).toContainText(rootName);
    await expect(withArea.locator('[class*="compact"]')).toContainText(childName);
    await expect(noArea.getByText('No area', { exact: true })).toBeVisible();

    // Each line is a row under its own group; there is no Belongs to column in document mode
    await expect(detail.costLines.rows()).toHaveCount(2);
    await expect(
      detail.costLines.root.getByRole('columnheader', { name: 'Belongs to' }),
    ).toHaveCount(0);
  });
});

async function createTaskWithArea(page: Page, title: string, areaId: string): Promise<string> {
  const response = await page.request.post(API.workItems, { data: { title, areaId } });
  expect(response.ok(), `POST work item failed: ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { id: string }).id;
}

// ─────────────────────────────────────────────────────────────────────────────
// E9: History tab
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice page History tab (E9)', () => {
  test('E9: a status change appears as a row', async ({ page, testPrefix }) => {
    const seed = await seedInvoice(page, testPrefix);
    const detail = new InvoiceDetailPage(page);
    await detail.goto(seed.invoiceId);

    await detail.markPaid.trigger.click();
    await expect(detail.statusBadge).toHaveText('Paid');

    await detail.openHistory();
    const panel = detail.tabs.panel('history');
    await expect(panel.getByRole('listitem').first()).toBeVisible();
    await expect(panel.getByRole('listitem').first()).toContainText(/Paid/);
    // With few events there is no "Show all"
    await expect(detail.historyShowAll).toHaveCount(0);
  });

  test('E9: with more events than the panel shows, Show all in History carries object=invoice:<id>', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedInvoice(page, testPrefix);
    const detail = new InvoiceDetailPage(page);
    await detail.goto(seed.invoiceId);
    await detail.markPaid.trigger.click();
    await expect(detail.statusBadge).toHaveText('Paid');

    // The real list, reported as longer than one page (the panel asks for 20 rows)
    await page.route(
      (url) => url.pathname === '/api/history',
      async (route) => {
        const response = await route.fetch();
        const body = (await response.json()) as {
          items: unknown[];
          pagination: { totalItems: number };
        };
        body.pagination.totalItems = body.items.length + 5;
        await route.fulfill({ response, json: body });
      },
    );
    await detail.openHistory();

    await expect(detail.historyShowAll).toBeVisible();
    await expect(detail.historyShowAll).toHaveText('Show all in History');
    const href = (await detail.historyShowAll.getAttribute('href')) ?? '';
    expect(decodeURIComponent(href)).toContain(`object=invoice:${seed.invoiceId}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E10 / E11: layout (AC7 / AC8) in light and dark
// ─────────────────────────────────────────────────────────────────────────────

const LONG_NOTES =
  'Synthetic long description for the layout check. It repeats itself on purpose so that the ' +
  'header description would wrap over several lines if the layout did not hold it to the space ' +
  'it has. It repeats itself on purpose so that the header description would wrap over several ' +
  'lines if the layout did not hold it to the space it has.';

test.describe('Invoice page layout (E10 and E11)', { tag: '@responsive' }, () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`E10: desktop 1280x800 keeps the strip compact in ${scheme} mode`, async ({
      page,
      testPrefix,
    }) => {
      test.skip(test.info().project.name !== 'desktop', 'sets its own viewport; run once');
      const seed = await seedInvoice(page, testPrefix, { notes: LONG_NOTES });
      await addDeposit(page, seed.invoiceId, { amount: 100, dueDate: '2026-06-20' });
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 1280, height: 800 });
      const detail = new InvoiceDetailPage(page);
      await detail.goto(seed.invoiceId);
      await detail.costLines.waitForLoaded();

      const strip = await detail.summary.stripBox();
      expect(strip.bottom, 'strip bottom').toBeLessThanOrEqual(450);
      expect(await detail.summary.rowCount(), 'distinct fact rows').toBe(2);
      const tablist = await detail.tabs.tablist.boundingBox();
      expect(tablist, 'tablist box').not.toBeNull();
      expect(tablist!.y, 'tablist top').toBeLessThanOrEqual(900);
    });

    test(`E10: phone 390x844 fits header and strip in ${scheme} mode`, async ({
      page,
      testPrefix,
    }) => {
      test.skip(test.info().project.name !== 'mobile', 'sets its own viewport; run once');
      const seed = await seedInvoice(page, testPrefix, { notes: LONG_NOTES });
      await addDeposit(page, seed.invoiceId, { amount: 100, dueDate: '2026-06-20' });
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 390, height: 844 });
      const detail = new InvoiceDetailPage(page);
      await detail.goto(seed.invoiceId);
      await detail.costLines.waitForLoaded();

      const strip = await detail.summary.stripBox();
      expect(strip.bottom, 'header and strip bottom').toBeLessThanOrEqual(844);
      expect(await detail.summary.columnCount(), 'distinct fact columns').toBe(2);
      // The tab list starts above the bottom bar
      const tablist = await detail.tabs.tablist.boundingBox();
      const bottomBar = await page.getByTestId('bottom-bar').boundingBox();
      expect(tablist, 'tablist box').not.toBeNull();
      expect(bottomBar, 'bottom bar box').not.toBeNull();
      expect(tablist!.y, 'tablist top is inside the viewport').toBeLessThan(bottomBar!.y);
    });
  }

  test('E10: an offer on a phone keeps both header buttons inside the viewport and the strip compact', async ({
    page,
    testPrefix,
  }) => {
    test.skip(test.info().project.name !== 'mobile', 'sets its own viewport; run once');
    const seed = await seedInvoice(page, testPrefix, { status: 'quotation', notes: LONG_NOTES });
    await page.setViewportSize({ width: 390, height: 844 });
    const detail = new InvoiceDetailPage(page);
    await detail.goto(seed.invoiceId);
    await detail.costLines.waitForLoaded();

    for (const button of [detail.addPaymentPrimary, detail.convertButton]) {
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box, 'header button box').not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    const strip = await detail.summary.stripBox();
    expect(strip.bottom, 'header and strip bottom').toBeLessThanOrEqual(844);
    expect(await detail.summary.columnCount(), 'distinct fact columns').toBe(2);
  });

  for (const width of [1280, 390]) {
    for (const withDocuments of [true, false]) {
      test(`E11: the last fact of every row ends at the strip's right edge (${width}px, ${withDocuments ? 7 : 6} facts)`, async ({
        page,
        testPrefix,
      }) => {
        test.skip(
          test.info().project.name !== (width === 1280 ? 'desktop' : 'mobile'),
          'sets its own viewport; run once',
        );
        const seed = await seedInvoice(page, testPrefix);
        if (withDocuments) await mockPaperlessConfigured(page);
        await page.setViewportSize({ width, height: 900 });
        const detail = new InvoiceDetailPage(page);
        await detail.goto(seed.invoiceId);
        await detail.costLines.waitForLoaded();
        if (withDocuments) await expect(detail.documentsFact).toBeVisible();
        else await expect(detail.documentsFact).toHaveCount(0);

        const boxes = await detail.summary.boxes();
        expect(boxes).toHaveLength(withDocuments ? 7 : 6);
        const edge = Math.max(...boxes.map((box) => box.right));
        // Group by row; the right-most cell of each row reaches the strip's inner right edge
        const rows = new Map<number, number>();
        for (const box of boxes) {
          const key = Math.round(box.y / 4);
          rows.set(key, Math.max(rows.get(key) ?? 0, box.right));
        }
        for (const [row, right] of rows) {
          expect(Math.abs(right - edge), `row ${row} ends at the right edge`).toBeLessThanOrEqual(
            2,
          );
        }
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// E12: delete
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice page delete (E12)', { tag: '@responsive' }, () => {
  test('E12: ⋯ › Delete shows the counts, deletes, and Back does not return to the page', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedInvoice(page, testPrefix);
    await addDeposit(page, seed.invoiceId, { amount: 100, dueDate: '2026-06-20' });
    const detail = new InvoiceDetailPage(page);
    await page.goto(routeUrl('invoices'));
    // Let the list settle before the next goto: its load can otherwise be interrupted mid-flight
    await expect(page.getByRole('heading', { level: 1, name: /^Invoices/ })).toBeVisible();
    await page.goto(routeUrl('invoice', { id: seed.invoiceId }));
    await expect(detail.heading).toBeVisible();

    await detail.openDeleteModal();
    await expect(detail.deleteConfirmButton).toBeEnabled();
    await detail.confirmDelete();

    await expect(page).toHaveURL((url) => url.pathname === routeUrl('invoices'));
    await page.goBack();
    // The deleted page was replaced in history: Back never lands on it
    await expect(page).not.toHaveURL(
      (url) => url.pathname === routeUrl('invoice', { id: seed.invoiceId }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E13: breadcrumbs
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice page breadcrumbs (E13)', { tag: '@responsive' }, () => {
  test('E13: "Money › Invoices" on a fresh visit; "Back to <company>" from a company page', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedInvoice(page, testPrefix);
    const detail = new InvoiceDetailPage(page);

    await detail.goto(seed.invoiceId);
    await detail.breadcrumbs.expectTrail(['Money', 'Invoices']);
    await detail.breadcrumbs.expectNoBack();

    // Opened through the company link: the origin Back appears
    await detail.companyLink.click();
    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('company', { id: seed.vendorId }),
    );
    await page.goBack();
    await expect(detail.heading).toBeVisible();

    await page.goto(routeUrl('company', { id: seed.vendorId }));
    await page.getByRole('button', { name: `Edit invoice ${seed.number}` }).click();
    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('invoice', { id: seed.invoiceId }),
    );
    await detail.breadcrumbs.expectBack(seed.company);
  });
});
