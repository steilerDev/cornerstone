/**
 * E2E: Money › Financing (#2242, EPIC-21 P4.10), the cards page that replaced Funding sources and
 * Grants.
 *
 * Scenarios
 * F1 (AC1, @responsive)  cards show type, status, rate and the five figures; an over-allocated source
 *                        shows a negative Unallocated, "Over-allocated by" and a drawn overflow; a
 *                        loan shows "Ready to submit n · €x"; Paperless on shows "Documents (n) · Link"
 *                        and Link opens the panel in the Link document view; Paperless off shows neither
 * F2 (AC1)               the four legacy URLs land in one hop on Financing with the right group heading
 *                        focused and the query kept
 * F3 (AC2)               exactly one primary (Prepare bank report → /budget/reports); Add funding source
 *                        and Add grant open the dialogs; Save lands on the new page with the h1 focused;
 *                        ?create=1&kind=… opens the dialog
 * F4 (AC3, @responsive)  Own funds: named "Own funds", no Ready to submit, no ⋯ on its card
 * F5 (AC4/AC7, @responsive) grant card: status, rate, "No cap", Expected, Covered items link to the Work
 *                        tab, deadline + Overdue; an API-seeded fixed grant shows its amount and no "%"
 *
 * Real data through the API (synthetic names with the `testPrefix`), removed in `finally`. Paperless
 * is off in the E2E container; "on" is a mock of its status route.
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createCostLine,
  createInvoice,
  createLinkedCostLine,
  createPurchase,
  createTask,
  createVendor,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import {
  createGrant,
  createSource,
  findOwnFundsId,
  readFinancing,
} from '../../fixtures/financingSeed.js';
import { mockPaperlessConfigured } from '../../fixtures/paperlessMocks.js';
import { DocumentsPanel } from '../../pages/DocumentsPanel.js';
import { FinancingFormDialog } from '../../pages/FinancingFormDialog.js';
import { FinancingPage } from '../../pages/FinancingPage.js';
import { API } from '../../fixtures/testData.js';

test.describe('Financing: cards', { tag: '@responsive' }, () => {
  test('F1: a loan card shows type, status, rate, the five figures and Ready to submit', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const financing = new FinancingPage(page);
      const name = `${testPrefix} F1 Loan`;
      const sourceId = await createSource(page, cleanup, {
        name,
        totalAmount: 100000,
        interestRate: 3.5,
      });
      // One paid, not yet submitted invoice on the loan: it is ready to submit
      const vendorId = await createVendor(page, cleanup, `${testPrefix} F1 Company`);
      const taskId = await createTask(page, cleanup, `${testPrefix} F1 Task`);
      const invoice = await createInvoice(page, cleanup, vendorId, {
        amount: 500,
        status: 'paid',
        invoiceNumber: `${testPrefix}-F1`,
      });
      await createLinkedCostLine(page, invoice.id, {
        kind: 'work_item',
        hostId: taskId,
        budgetSourceId: sourceId,
        description: 'F1 line',
        plannedAmount: 500,
        itemizedAmount: 500,
      });

      await financing.goto();
      const card = financing.sourceCard(sourceId);
      await expect(card).toBeVisible();
      await expect(card.getByRole('heading', { level: 3 })).toHaveText(name);
      await expect(card).toContainText('Bank loan');
      await expect(card).toContainText('Active');
      await expect(card).toContainText('3.50%');
      for (const label of ['Amount', 'Allocated', 'Paid', 'Submitted', 'Unallocated']) {
        await expect(
          card.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }),
        ).toBeVisible();
      }

      // Ready to submit n · amount: the money service's answer
      const api = (await readFinancing(page)).sources.find((source) => source.id === sourceId)!;
      await expect(card).toContainText('Ready to submit');
      await expect(financing.readyCount(sourceId)).toHaveText(String(api.readyToSubmit.count));
      expect(api.readyToSubmit.count).toBeGreaterThan(0);
      await expect(financing.readyAmount(sourceId)).toContainText(
        (api.readyToSubmit.amount / 1).toFixed(2).replace(/\.00$/, ''),
      );
      // Not over-allocated: no note, no overflow
      await expect(financing.overAllocatedNote(sourceId)).toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F1: an over-allocated source shows a negative Unallocated, the note and a drawn overflow', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const financing = new FinancingPage(page);
      const sourceId = await createSource(page, cleanup, {
        name: `${testPrefix} F1 Overdrawn`,
        sourceType: 'savings',
        totalAmount: 1000,
      });
      const taskId = await createTask(page, cleanup, `${testPrefix} F1 Overrun Task`);
      await createCostLine(page, {
        kind: 'work_item',
        hostId: taskId,
        budgetSourceId: sourceId,
        description: 'F1 line over the source',
        plannedAmount: 1250,
        includesVat: true,
      });

      await financing.goto();
      await expect(financing.unallocated(sourceId)).toHaveText(/^[-−]/);
      await expect(financing.unallocated(sourceId)).toContainText(/250[.,]00/);
      const note = financing.overAllocatedNote(sourceId);
      await expect(note).toBeVisible();
      await expect(note).toContainText('Over-allocated by');
      await expect(note).toContainText(/250[.,]00/);

      // The overflow is drawn (not clipped) and the note sits under the bar, on screen
      const segment = financing.overflowSegment(sourceId);
      await expect(segment).toBeVisible();
      const segmentBox = await segment.boundingBox();
      expect(segmentBox?.width ?? 0).toBeGreaterThan(0);
      const barBox = await financing.bar(sourceId).boundingBox();
      const noteBox = await note.boundingBox();
      expect(noteBox!.y).toBeGreaterThanOrEqual(barBox!.y + barBox!.height - 1);
      const viewport = page.viewportSize()!;
      expect(noteBox!.x + noteBox!.width).toBeLessThanOrEqual(viewport.width + 1);
      // A savings card has no Ready to submit
      await expect(financing.readyCount(sourceId)).toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F1: Paperless on shows "Documents (n) · Link" and Link opens the Link document view', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const financing = new FinancingPage(page);
      const sourceId = await createSource(page, cleanup, {
        name: `${testPrefix} F1 Docs Loan`,
        totalAmount: 5000,
      });
      await mockPaperlessConfigured(page);
      await financing.goto();

      await expect(financing.docsButton(sourceId)).toHaveText('Documents (0)');
      await expect(financing.docsLink(sourceId)).toBeVisible();
      await financing.docsLink(sourceId).click();
      const panel = new DocumentsPanel(page);
      await expect(panel.title).toHaveText('Link document');
      await panel.closeButton.click();
      await expect(panel.dialog).toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F1: Paperless off shows neither Documents nor Link on a card', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const financing = new FinancingPage(page);
      const sourceId = await createSource(page, cleanup, {
        name: `${testPrefix} F1 No Docs`,
        totalAmount: 5000,
      });
      const statusSeen = page.waitForResponse((response) =>
        response.url().includes('/api/paperless/status'),
      );
      await financing.goto();
      await statusSeen;
      await expect(financing.sourceCard(sourceId)).toBeVisible();
      await expect(financing.docsButton(sourceId)).toHaveCount(0);
      await expect(financing.docsLink(sourceId)).toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F4: Own funds is named "Own funds", has no Ready to submit and no card menu', async ({
    page,
  }) => {
    const financing = new FinancingPage(page);
    const ownId = await findOwnFundsId(page);
    await financing.goto();

    const card = financing.sourceCard(ownId);
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { level: 3 })).toHaveText('Own funds');
    // The element is omitted, not shown as 0
    await expect(financing.readyCount(ownId)).toHaveCount(0);
    await expect(card.getByText('Ready to submit')).toHaveCount(0);
    await expect(financing.cardMenu(ownId)).toHaveCount(0);
    // No rate on Own funds
    await expect(card.getByText(/^Rate /)).toHaveCount(0);
  });

  test('F5: a grant card shows status, rate, cap, Expected, Covered items and an overdue deadline', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const financing = new FinancingPage(page);
      const taskId = await createTask(page, cleanup, `${testPrefix} F5 Task`);
      const name = `${testPrefix} F5 Grant`;
      const grantId = await createGrant(page, cleanup, {
        name,
        reductionValue: 20,
        applicationStatus: 'applied',
        applicationDeadline: '2020-01-15',
        items: [{ type: 'work_item', id: taskId }],
      });

      await financing.goto();
      const card = financing.grantCard(grantId);
      await expect(card).toBeVisible();
      await expect(card.getByRole('heading', { level: 3 })).toHaveText(name);
      await expect(card).toContainText('Applied');
      await expect(financing.grantRate(grantId)).toHaveText('20%');
      await expect(card).toContainText('No cap');
      await expect(financing.grantExpected(grantId)).toContainText(/[\d.,]+/);
      // Covered items link to the Work tab of the grant
      await expect(financing.grantCovered(grantId)).toHaveText('1 item');
      await expect(financing.grantCovered(grantId)).toHaveAttribute(
        'href',
        routeUrl('grant', { id: grantId }, { tab: 'work' }),
      );
      // A deadline in the past on an open grant is overdue
      await expect(financing.grantDeadline(grantId)).toContainText('Overdue');
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F5: a legacy fixed grant (API-seeded) shows its amount and no "%"', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const financing = new FinancingPage(page);
      const grantId = await createGrant(page, cleanup, {
        name: `${testPrefix} F5 Fixed Grant`,
        reductionType: 'fixed',
        reductionValue: 500,
        applicationStatus: 'approved',
      });

      await financing.goto();
      const rate = financing.grantRate(grantId);
      await expect(rate).toBeVisible();
      await expect(rate).toContainText('500');
      await expect(rate).not.toContainText('%');
      // The accessible name carries the kind: "Fixed reduction"
      await expect(financing.grantCard(grantId)).toContainText('Fixed reduction');
      await expect(financing.grantCard(grantId)).toContainText('Approved');
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F5: a purchase-covered grant counts its covered items', async ({ page, testPrefix }) => {
    const cleanup = newCleanup();
    try {
      const financing = new FinancingPage(page);
      const taskId = await createTask(page, cleanup, `${testPrefix} F5b Task`);
      const purchaseId = await createPurchase(page, cleanup, `${testPrefix} F5b Purchase`);
      const grantId = await createGrant(page, cleanup, {
        name: `${testPrefix} F5b Grant`,
        reductionValue: 10,
        items: [
          { type: 'work_item', id: taskId },
          { type: 'household_item', id: purchaseId },
        ],
      });
      await financing.goto();
      await expect(financing.grantCovered(grantId)).toHaveText('2 items');
    } finally {
      await runCleanup(cleanup);
    }
  });
});

test.describe('Financing: legacy URLs and actions', () => {
  const REDIRECTS: ReadonlyArray<readonly [string, '#sources' | '#grants']> = [
    ['/budget/sources', '#sources'],
    ['/budget/subsidies', '#grants'],
    ['/budget/financing/sources', '#sources'],
    ['/budget/financing/grants', '#grants'],
  ];

  for (const [from, hash] of REDIRECTS) {
    test(`F2: ${from} lands on Financing with the ${hash.slice(1)} heading focused and the query kept`, async ({
      page,
    }) => {
      const financing = new FinancingPage(page);
      await page.goto(`${from}?q=walk`);
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === routeUrl('financing') &&
          url.hash === hash &&
          url.searchParams.get('q') === 'walk',
      );
      await financing.waitForLoaded();
      await expect(
        hash === '#sources' ? financing.sourcesHeading : financing.grantsHeading,
      ).toBeFocused();
    });
  }

  test('F3: Prepare bank report is the one primary and leads to the report wizard', async ({
    page,
  }) => {
    const financing = new FinancingPage(page);
    await financing.goto();

    await expect(financing.prepareBankReport).toBeVisible();
    await expect(financing.prepareBankReport).toHaveText('Prepare bank report');
    // The Add buttons are secondary: nothing else on the page is styled as a primary button
    await expect(page.locator('main [class*="btnPrimary"]')).toHaveCount(0);
    await financing.prepareBankReport.click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('bankReport'));
  });

  test('F3: Add funding source opens the dialog; Save lands on the new page with the h1 focused', async ({
    page,
    testPrefix,
  }) => {
    const financing = new FinancingPage(page);
    const dialog = new FinancingFormDialog(page, 'source');
    const name = `${testPrefix} F3 Savings`;
    let createdId: string | null = null;
    try {
      await financing.goto();
      await financing.addSource.click();
      await dialog.waitForOpen();
      await expect(dialog.name).toBeFocused();

      await dialog.fillSource({ name, amount: 12345, type: 'savings' });
      await dialog.save();

      await expect(page).toHaveURL((url) =>
        /\/budget\/financing\/sources\/[^/]+$/.test(url.pathname),
      );
      createdId = new URL(page.url()).pathname.split('/').pop()!;
      const heading = page.getByRole('heading', { level: 1, name });
      await expect(heading).toBeVisible();
      await expect(heading).toBeFocused();
    } finally {
      if (createdId) await page.request.delete(`${API.budgetSources}/${createdId}`);
    }
  });

  test('F3: Add grant opens the New grant dialog and Cancel closes it', async ({ page }) => {
    const financing = new FinancingPage(page);
    const dialog = new FinancingFormDialog(page, 'grant');
    await financing.goto();
    await financing.addGrant.click();
    await dialog.waitForOpen();
    await dialog.cancel();
    await dialog.waitForClosed();
    await expect(financing.addGrant).toBeFocused();
  });

  for (const kind of ['source', 'grant'] as const) {
    test(`F3: ?create=1&kind=${kind} opens the dialog over Financing and the query is consumed`, async ({
      page,
    }) => {
      const dialog = new FinancingFormDialog(page, kind);
      await page.goto(`${routeUrl('financing')}?create=1&kind=${kind}`);
      await dialog.waitForOpen();
      await expect.poll(() => new URL(page.url()).search).toBe('');
    });
  }

  test('F3: a loan card ⋯ menu offers Prepare bank report for that source', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const financing = new FinancingPage(page);
      const sourceId = await createSource(page, cleanup, {
        name: `${testPrefix} F3 Menu Loan`,
        totalAmount: 5000,
      });
      await financing.goto();
      await financing.openCardMenu(sourceId);
      await financing.cardMenuBankReport(sourceId).click();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === routeUrl('bankReport') && url.searchParams.get('sourceId') === sourceId,
      );
    } finally {
      await runCleanup(cleanup);
    }
  });
});
