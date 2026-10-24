/**
 * E2E tests for editing and removing a cost line on an offer or invoice (Issue #1425, rebuilt on
 * the cost line table and form in #2235).
 *
 * Each row of the Cost lines table has a ⋯ menu (Edit, Duplicate, Remove from invoice, Assign):
 *   - "Edit" opens the cost line form; a linked line's amount is one gross figure
 *   - "Remove from invoice" asks first (ConfirmDialog) and keeps the line on its task
 *
 * Scenarios covered:
 *   1. Edit the amount -> the row and what is left on the invoice reflect it
 *   2. Remove from invoice -> confirm -> the row disappears
 *   3. Edit can be cancelled without saving
 *   4. Remove can be cancelled without removing the line
 *   5. An amount beyond the invoice total shows an error in the form
 *   6. A phone: edit and remove work from the card
 *
 * All resources are created through the API with the per-test `testPrefix`; names are invented.
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createFundingSource,
  createInvoice,
  createLinkedCostLine,
  createTask,
  createVendor,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import type { SeedCleanup } from '../../fixtures/costLineSeed.js';
import { CostLineFormDialog } from '../../pages/components/CostLineFormDialog.js';
import { CostLinesPanel } from '../../pages/components/CostLinesPanel.js';

let cleanup: SeedCleanup;

test.beforeEach(() => {
  cleanup = newCleanup();
});

test.afterEach(async () => {
  await runCleanup(cleanup);
});

/** An invoice of `amount` with one gross-entered line of `itemized` linked to a task. */
async function seedLinked(
  page: Parameters<typeof createTask>[0],
  prefix: string,
  amount: number,
  itemized: number,
  description: string,
) {
  const sourceId = await createFundingSource(page, cleanup, `${prefix} Savings`);
  const taskId = await createTask(page, cleanup, `${prefix} Linked Task`);
  const vendorId = await createVendor(page, cleanup, `${prefix} Vendor`);
  const invoice = await createInvoice(page, cleanup, vendorId, { amount, date: '2026-06-01' });
  await createLinkedCostLine(page, invoice.id, {
    kind: 'work_item',
    hostId: taskId,
    budgetSourceId: sourceId,
    description,
    plannedAmount: itemized,
    includesVat: true,
    itemizedAmount: itemized,
  });
  return { invoice, taskId };
}

test.describe('Cost line edit (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Edit the amount through the form -> row and what is left on the invoice reflect it',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const description = `${testPrefix} Edit Me`;
      const { invoice } = await seedLinked(page, testPrefix, 1000, 300, description);
      const panel = new CostLinesPanel(page);
      const form = new CostLineFormDialog(page, 'Edit cost line');
      await page.goto(routeUrl('invoice', { id: invoice.id }));
      await panel.waitForLoaded();

      await expect(panel.gross(panel.row(description))).toHaveText('€300.00');
      await expect(panel.notYetSplit()).toHaveText('Not yet split · €700.00');

      await panel.chooseAction(panel.row(description), 'Edit');
      await form.waitForOpen();
      await form.expandMoreDetails();
      if ((await form.pricing.inputValue()) !== 'direct') await form.pricing.selectOption('direct');
      await expect(form.amount).toHaveValue('300');
      await form.amount.fill('450');

      const patched = page.waitForResponse(
        (resp) =>
          resp.url().includes('/budget-lines/') &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 200,
      );
      await form.save();
      await patched;
      await form.waitForClosed();

      await expect(panel.gross(panel.row(description))).toHaveText('€450.00');
      await expect(panel.notYetSplit()).toHaveText('Not yet split · €550.00');
    },
  );
});

test.describe('Cost line remove (Scenario 2)', { tag: '@responsive' }, () => {
  test(
    'Remove from invoice -> confirm -> the row disappears and the amount is unsplit again',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const description = `${testPrefix} Remove Me`;
      const { invoice } = await seedLinked(page, testPrefix, 800, 250, description);
      const panel = new CostLinesPanel(page);
      await page.goto(routeUrl('invoice', { id: invoice.id }));
      await panel.waitForLoaded();

      await panel.chooseAction(panel.row(description), 'Remove from invoice');
      await panel.removeDialog.waitForOpen();
      await panel.removeDialog.confirmAndWaitClosed();

      await expect(panel.row(description)).toHaveCount(0);
      await expect(panel.emptyTitle).toBeVisible();
    },
  );
});

test.describe('Cost line edit - cancel (Scenario 3)', { tag: '@responsive' }, () => {
  test('Cancelling the form leaves the row amount unchanged', async ({ page, testPrefix }) => {
    const description = `${testPrefix} Keep Me`;
    const { invoice } = await seedLinked(page, testPrefix, 1000, 300, description);
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'Edit cost line');
    await page.goto(routeUrl('invoice', { id: invoice.id }));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(description), 'Edit');
    await form.waitForOpen();
    await form.expandMoreDetails();
    if ((await form.pricing.inputValue()) !== 'direct') await form.pricing.selectOption('direct');
    await form.amount.fill('999');
    await form.cancel();
    // A changed form asks before it is discarded
    await form.discardConfirm.waitForOpen();
    await form.discardConfirm.confirmAndWaitClosed();
    await form.waitForClosed();

    await expect(panel.gross(panel.row(description))).toHaveText('€300.00');
  });
});

test.describe('Cost line remove - cancel (Scenario 4)', { tag: '@responsive' }, () => {
  test('Cancelling the remove dialog keeps the line', async ({ page, testPrefix }) => {
    const description = `${testPrefix} Stay Put`;
    const { invoice } = await seedLinked(page, testPrefix, 800, 250, description);
    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('invoice', { id: invoice.id }));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(description), 'Remove from invoice');
    await panel.removeDialog.waitForOpen();
    await panel.removeDialog.cancel();
    await expect(panel.removeDialog.dialog).toBeHidden();

    await expect(panel.row(description)).toBeVisible();
    await expect(panel.menuTrigger(panel.row(description))).toBeFocused();
  });
});

test.describe(
  'Cost line edit - beyond the invoice total (Scenario 5)',
  { tag: '@responsive' },
  () => {
    test('an amount above the invoice shows an error and keeps the form open', async ({
      page,
      testPrefix,
    }) => {
      const description = `${testPrefix} Too Much`;
      const { invoice } = await seedLinked(page, testPrefix, 500, 300, description);
      const panel = new CostLinesPanel(page);
      const form = new CostLineFormDialog(page, 'Edit cost line');
      await page.goto(routeUrl('invoice', { id: invoice.id }));
      await panel.waitForLoaded();

      await panel.chooseAction(panel.row(description), 'Edit');
      await form.waitForOpen();
      await form.expandMoreDetails();
      if ((await form.pricing.inputValue()) !== 'direct') await form.pricing.selectOption('direct');
      await form.amount.fill('900');
      await form.save();

      await expect(form.dialog).toBeVisible();
      await expect(form.fieldError('amount')).toContainText(
        'more than this offer or invoice is worth',
      );
      await form.cancel();
      await form.discardConfirm.waitForOpen();
      await form.discardConfirm.confirmAndWaitClosed();
      await expect(panel.gross(panel.row(description))).toHaveText('€300.00');
    });
  },
);

test.describe('Cost line edit and remove - phone (Scenario 6)', { tag: '@responsive' }, () => {
  test('edit and remove are usable on a phone viewport', async ({ page, testPrefix }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const description = `${testPrefix} Phone Line`;
    const { invoice } = await seedLinked(page, testPrefix, 600, 200, description);
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'Edit cost line');
    await page.goto(routeUrl('invoice', { id: invoice.id }));
    await panel.waitForLoaded();

    await expect.poll(() => panel.showsCards()).toBe(true);
    await panel.chooseAction(panel.row(description), 'Edit');
    await form.waitForOpen();
    await expect(page.getByTestId('cost-line-form-sheet')).toBeVisible();
    await form.cancel();
    await form.waitForClosed();

    await panel.chooseAction(panel.row(description), 'Remove from invoice');
    await panel.removeDialog.waitForOpen();
    await panel.removeDialog.confirmAndWaitClosed();
    await expect(panel.row(description)).toHaveCount(0);
  });
});
