/**
 * E2E tests for Bug #1603: invoice-linked cost lines are editable from the task and purchase
 * pages (rebuilt on the cost line table and form in #2235).
 *
 * A line linked to an offer or invoice is a row in its own group on the task or purchase page.
 * "Edit" in its ⋯ menu opens the cost line form; saving calls
 * PATCH /api/invoices/:invoiceId/budget-lines/:invoiceBudgetLineId.
 *
 * Scenarios:
 *   1.  [Task - happy path] @smoke @responsive: Edit opens pre-filled, saving patches the
 *       description and the amount, the group total updates without a reload
 *   2.  [Task - cancel] Cancel on a changed form asks, discarding keeps the values
 *   3.  [Task - Escape] Escape closes an untouched form
 *   4.  [Task - server error] PATCH answers 500: an error banner shows, the form stays open
 *   5.  [Task - move] Edit -> Belongs to another task: the line leaves the first task's page
 *   6.  [Purchase - happy path] @smoke @responsive: the same on a purchase page
 *   7.  [Offer] a line linked to an offer can be edited and saved
 *   8.  [Invoice page] editing from the invoice page still opens the form and saves
 *   9.  [Phone] @smoke @responsive: scenario 1 at 375px
 *
 * All resources are created through the API with the per-test `testPrefix`; names are invented.
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createFundingSource,
  createInvoice,
  createLinkedCostLine,
  createPurchase,
  createTask,
  createVendor,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import type { CostLineHostKind, InvoiceStatus, SeedCleanup } from '../../fixtures/costLineSeed.js';
import { CostLineFormDialog } from '../../pages/components/CostLineFormDialog.js';
import { CostLinesPanel } from '../../pages/components/CostLinesPanel.js';

let cleanup: SeedCleanup;

test.beforeEach(() => {
  cleanup = newCleanup();
});

test.afterEach(async () => {
  await runCleanup(cleanup);
});

interface Seeded {
  readonly hostId: string;
  readonly invoiceId: string;
  readonly description: string;
}

async function seedLine(
  page: Parameters<typeof createTask>[0],
  prefix: string,
  kind: CostLineHostKind,
  status: InvoiceStatus = 'pending',
): Promise<Seeded> {
  const sourceId = await createFundingSource(page, cleanup, `${prefix} Savings`);
  const vendorId = await createVendor(page, cleanup, `${prefix} ILE Vendor`);
  const invoice = await createInvoice(page, cleanup, vendorId, {
    amount: 1000,
    date: '2026-06-01',
    status,
    invoiceNumber: `${prefix}-ILE-001`,
  });
  const hostId =
    kind === 'work_item'
      ? await createTask(page, cleanup, `${prefix} ILE Item`)
      : await createPurchase(page, cleanup, `${prefix} ILE Item`);
  const description = `${prefix} ILE Line`;
  await createLinkedCostLine(page, invoice.id, {
    kind,
    hostId,
    budgetSourceId: sourceId,
    description,
    plannedAmount: 500,
    includesVat: true,
    itemizedAmount: 300,
  });
  return { hostId, invoiceId: invoice.id, description };
}

function hostUrl(kind: CostLineHostKind, id: string): string {
  return kind === 'work_item'
    ? routeUrl('workItem', { id }, { tab: 'cost' })
    : routeUrl('householdItem', { id });
}

async function expectPrefilled(form: CostLineFormDialog, description: string): Promise<void> {
  await expect(form.description).toHaveValue(description);
  // A linked line shows its itemized amount as one gross figure
  await form.expandMoreDetails();
  if ((await form.pricing.inputValue()) !== 'direct') await form.pricing.selectOption('direct');
  await expect(form.amount).toHaveValue('300');
  await expect(form.enteredGross).toBeChecked();
}

for (const [kind, label, tags] of [
  ['work_item', 'Task', ['@smoke'] as string[]],
  ['household_item', 'Purchase', ['@smoke'] as string[]],
] as const) {
  test.describe(`${label} page - invoice-linked line edit`, { tag: '@responsive' }, () => {
    test(
      `Edit an invoice-linked line from the ${label.toLowerCase()} page -> pre-filled, saved with PATCH, group total updates`,
      { tag: [...tags] },
      async ({ page, testPrefix }) => {
        const { hostId, description } = await seedLine(page, testPrefix, kind);
        const panel = new CostLinesPanel(page);
        const form = new CostLineFormDialog(page, 'Edit cost line');
        await page.goto(hostUrl(kind, hostId));
        await panel.waitForLoaded();
        await expect(panel.row(description)).toBeVisible();

        await panel.chooseAction(panel.row(description), 'Edit');
        await form.waitForOpen();
        await expectPrefilled(form, description);

        await form.description.fill(`${testPrefix} ILE Updated`);
        await form.amount.fill('420');
        const patched = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budget-lines/') &&
            resp.request().method() === 'PATCH' &&
            resp.status() === 200,
        );
        await form.save();
        await patched;
        await form.waitForClosed();

        const row = panel.row(`${testPrefix} ILE Updated`);
        await expect(panel.gross(row)).toHaveText(/420\.00/);
        await expect(panel.groupHeading(/^Invoice /)).toContainText('Total €420.00');
      },
    );
  });
}

test.describe(
  'Task page - edit form cancel and Escape (Scenarios 2 and 3)',
  { tag: '@responsive' },
  () => {
    test('Cancel on a changed form asks first; discarding keeps the values', async ({
      page,
      testPrefix,
    }) => {
      const { hostId, description } = await seedLine(page, testPrefix, 'work_item');
      const panel = new CostLinesPanel(page);
      const form = new CostLineFormDialog(page, 'Edit cost line');
      await page.goto(hostUrl('work_item', hostId));
      await panel.waitForLoaded();

      await panel.chooseAction(panel.row(description), 'Edit');
      await form.waitForOpen();
      await form.description.fill(`${testPrefix} Never Saved`);
      await form.cancel();
      await form.discardConfirm.waitForOpen();
      await form.discardConfirm.confirmAndWaitClosed();
      await form.waitForClosed();

      await expect(panel.row(description)).toBeVisible();
      await expect(panel.row(`${testPrefix} Never Saved`)).toHaveCount(0);
    });

    test('Escape closes an untouched form', async ({ page, testPrefix }) => {
      const { hostId, description } = await seedLine(page, testPrefix, 'work_item');
      const panel = new CostLinesPanel(page);
      const form = new CostLineFormDialog(page, 'Edit cost line');
      await page.goto(hostUrl('work_item', hostId));
      await panel.waitForLoaded();

      await panel.chooseAction(panel.row(description), 'Edit');
      await form.waitForOpen();
      await page.keyboard.press('Escape');
      await form.waitForClosed();
      await expect(panel.row(description)).toBeVisible();
    });
  },
);

test.describe('Task page - edit server error (Scenario 4)', { tag: '@responsive' }, () => {
  test('a failing PATCH shows an error banner and keeps the form open', async ({
    page,
    testPrefix,
  }) => {
    const { hostId, description } = await seedLine(page, testPrefix, 'work_item');
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'Edit cost line');
    await page.goto(hostUrl('work_item', hostId));
    await panel.waitForLoaded();

    await page.route('**/api/invoices/*/budget-lines/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
          })
        : route.continue(),
    );
    await panel.chooseAction(panel.row(description), 'Edit');
    await form.waitForOpen();
    await form.description.fill(`${testPrefix} Will Fail`);
    await form.save();

    await expect(form.errorBanner).toBeVisible();
    await expect(form.dialog).toBeVisible();
    await page.unroute('**/api/invoices/*/budget-lines/*');
  });
});

test.describe('Task page - move to another task (Scenario 5)', { tag: '@responsive' }, () => {
  test('Edit -> Belongs to another task: the line leaves this task and shows on the other', async ({
    page,
    testPrefix,
  }) => {
    const { hostId, description } = await seedLine(page, testPrefix, 'work_item');
    const otherId = await createTask(page, cleanup, `${testPrefix} ILE Other`);
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'Edit cost line');
    await page.goto(hostUrl('work_item', hostId));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(description), 'Edit');
    await form.waitForOpen();
    await form.changeTarget(`${testPrefix} ILE Other`);
    const patched = page.waitForResponse(
      (resp) =>
        resp.url().includes('/budget-lines/') &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
    );
    await form.save();
    await patched;
    await form.waitForClosed();

    await expect(panel.row(description)).toHaveCount(0);
    await page.goto(hostUrl('work_item', otherId));
    await panel.waitForLoaded();
    await expect(panel.row(description)).toBeVisible();
  });
});

test.describe('Offer - edit a linked line (Scenario 7)', { tag: '@responsive' }, () => {
  test('a line linked to an offer can be edited and saved', async ({ page, testPrefix }) => {
    const { hostId, description } = await seedLine(page, testPrefix, 'work_item', 'quotation');
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'Edit cost line');
    await page.goto(hostUrl('work_item', hostId));
    await panel.waitForLoaded();

    await expect(panel.stateChip(panel.row(description))).toHaveText('Offered');
    await panel.chooseAction(panel.row(description), 'Edit');
    await form.waitForOpen();
    await form.description.fill(`${testPrefix} Offer Edited`);
    await form.save();
    await form.waitForClosed();
    await expect(panel.row(`${testPrefix} Offer Edited`)).toBeVisible();
  });
});

test.describe('Invoice page - edit regression guard (Scenario 8)', { tag: '@responsive' }, () => {
  test('editing from the invoice page still opens the form and saves', async ({
    page,
    testPrefix,
  }) => {
    const { invoiceId, description } = await seedLine(page, testPrefix, 'work_item');
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'Edit cost line');
    await page.goto(routeUrl('invoice', { id: invoiceId }));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(description), 'Edit');
    await form.waitForOpen();
    await form.description.fill(`${testPrefix} Edited On Invoice`);
    await form.save();
    await form.waitForClosed();
    await expect(panel.row(`${testPrefix} Edited On Invoice`)).toBeVisible();
  });
});

test.describe('Phone - invoice-linked line edit (Scenario 9)', { tag: '@responsive' }, () => {
  test('Edit an invoice-linked line at 375px', { tag: '@smoke' }, async ({ page, testPrefix }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const { hostId, description } = await seedLine(page, testPrefix, 'work_item');
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'Edit cost line');
    await page.goto(hostUrl('work_item', hostId));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(description), 'Edit');
    await form.waitForOpen();
    await expect(page.getByTestId('cost-line-form-sheet')).toBeVisible();
    await form.description.fill(`${testPrefix} Phone Updated`);
    await form.save();
    await form.waitForClosed();
    await expect(panel.row(`${testPrefix} Phone Updated`)).toBeVisible();
  });
});
