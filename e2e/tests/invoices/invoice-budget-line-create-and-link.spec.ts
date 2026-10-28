/**
 * E2E tests for creating a cost line on an offer or invoice (Issue #1401, rebuilt in #2235).
 *
 * "Add cost line" on the Invoice page opens the cost line form with Belongs to (a task or
 * purchase, searched). Save creates the line on that task or purchase AND links it to the
 * offer/invoice in one transaction (`POST /api/budget-lines/batch`): the gross amount of the line
 * is its amount on the document, and a failure leaves nothing behind.
 *
 * Scenarios covered:
 *   1. Unit pricing on a task: the row shows quantity × price and the gross; Not yet split updates
 *   2. A second line from a non-empty list with a direct amount
 *   3. The amount is more than the document is worth: an error on the field, nothing created
 *   4. A phone: the form is a full-screen sheet and usable
 *   5. Escape closes the form
 *
 * All resources are created through the API with the per-test `testPrefix`; names are invented.
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createFundingSource,
  createInvoice,
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

async function seed(page: Parameters<typeof createTask>[0], prefix: string, amount: number) {
  await createFundingSource(page, cleanup, `${prefix} Savings`);
  const taskName = `${prefix} Create Task`;
  const taskId = await createTask(page, cleanup, taskName);
  const vendorId = await createVendor(page, cleanup, `${prefix} Vendor`);
  const invoice = await createInvoice(page, cleanup, vendorId, { amount, date: '2026-06-03' });
  return { taskName, taskId, invoice };
}

test.describe(
  'Create and link cost line - unit pricing (Scenario 1)',
  { tag: '@responsive' },
  () => {
    test('a unit-priced line created on the invoice shows quantity × price and its gross', async ({
      page,
      testPrefix,
    }) => {
      const { taskName, taskId, invoice } = await seed(page, testPrefix, 1000);
      const panel = new CostLinesPanel(page);
      const form = new CostLineFormDialog(page, 'New cost line');
      await page.goto(routeUrl('invoice', { id: invoice.id }));
      await panel.waitForLoaded();

      await panel.emptySplitButton().waitFor();
      await panel.addButton.click();
      await form.waitForOpen();
      await form.target.pick(taskName);
      await form.fillUnitPriced({
        description: `${testPrefix} Window`,
        quantity: '4',
        unit: 'pcs',
        unitPrice: '100',
      });
      // 4 x 100 = 400 net = 476 gross
      await expect(form.result).toContainText('Gross €476.00');
      await form.save();
      await form.waitForClosed();

      const row = panel.row(`${testPrefix} Window`);
      await expect(row).toBeVisible();
      await expect(panel.gross(row)).toHaveText('€476.00');
      await expect(panel.stateChip(row)).toHaveText('Invoiced');
      await expect(panel.groupHeading(taskName)).toBeVisible();
      if (!(await panel.showsCards())) await expect(row).toContainText('4 pcs × €100.00');
      await expect(panel.notYetSplit()).toHaveText('Not yet split · €524.00');

      // The same line is a cost line of the task
      await page.goto(routeUrl('workItem', { id: taskId }, { tab: 'cost' }));
      await panel.waitForLoaded();
      await expect(panel.row(`${testPrefix} Window`)).toBeVisible();
    });
  },
);

test.describe(
  'Create and link cost line - from a non-empty list (Scenario 2)',
  { tag: '@responsive' },
  () => {
    test('Add cost line below existing lines creates a direct-amount line', async ({
      page,
      testPrefix,
    }) => {
      const { taskName, invoice } = await seed(page, testPrefix, 1000);
      const panel = new CostLinesPanel(page);
      const form = new CostLineFormDialog(page, 'New cost line');
      await page.goto(routeUrl('invoice', { id: invoice.id }));
      await panel.waitForLoaded();

      for (const [label, amount] of [
        ['First', '100'],
        ['Second', '200'],
      ] as const) {
        await panel.addButton.click();
        await form.waitForOpen();
        await form.target.pick(taskName);
        await form.fillDirect(`${testPrefix} ${label}`, amount);
        await form.enteredGross.check();
        await form.save();
        await form.waitForClosed();
        await expect(panel.row(`${testPrefix} ${label}`)).toBeVisible();
      }

      await expect(panel.rows()).toHaveCount(2);
      await expect(panel.total()).toHaveText('€300.00');
      await expect(panel.notYetSplit()).toHaveText('Not yet split · €700.00');
    });
  },
);

test.describe(
  'Create and link cost line - more than the document (Scenario 3)',
  { tag: '@responsive' },
  () => {
    test('an amount above what is left shows an error and creates nothing', async ({
      page,
      testPrefix,
    }) => {
      const { taskName, taskId, invoice } = await seed(page, testPrefix, 100);
      const panel = new CostLinesPanel(page);
      const form = new CostLineFormDialog(page, 'New cost line');
      await page.goto(routeUrl('invoice', { id: invoice.id }));
      await panel.waitForLoaded();

      await panel.addButton.click();
      await form.waitForOpen();
      await form.target.pick(taskName);
      await form.fillDirect(`${testPrefix} Excess Line`, '200');
      await form.enteredGross.check();
      await form.save();

      // The form stays open with the error on the amount; the batch is atomic
      await expect(form.dialog).toBeVisible();
      await expect(form.fieldError('amount')).toContainText(
        'more than this offer or invoice is worth',
      );
      await form.cancel();
      if (await form.discardConfirm.dialog.isVisible())
        await form.discardConfirm.confirmAndWaitClosed();
      await form.waitForClosed();
      await expect(panel.rows()).toHaveCount(0);

      await page.goto(routeUrl('workItem', { id: taskId }, { tab: 'cost' }));
      await panel.waitForLoaded();
      await expect(panel.row(`${testPrefix} Excess Line`)).toHaveCount(0);
    });
  },
);

test.describe('Create and link cost line - phone (Scenario 4)', { tag: '@responsive' }, () => {
  test('the form is a full-screen sheet on a phone and can be completed', async ({
    page,
    testPrefix,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { taskName, invoice } = await seed(page, testPrefix, 500);
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'New cost line');
    await page.goto(routeUrl('invoice', { id: invoice.id }));
    await panel.waitForLoaded();

    await panel.addButton.click();
    await form.waitForOpen();
    await expect(page.getByTestId('cost-line-form-sheet')).toBeVisible();
    await form.target.pick(taskName);
    await form.fillUnitPriced({
      description: `${testPrefix} Mobile Line`,
      quantity: '1',
      unitPrice: '50',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    await form.save();
    await form.waitForClosed();

    await expect(panel.row(`${testPrefix} Mobile Line`)).toBeVisible();
  });
});

test.describe('Create and link cost line - Escape (Scenario 5)', { tag: '@responsive' }, () => {
  test('Escape closes an untouched form without creating anything', async ({
    page,
    testPrefix,
  }) => {
    const { invoice } = await seed(page, testPrefix, 500);
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'New cost line');
    await page.goto(routeUrl('invoice', { id: invoice.id }));
    await panel.waitForLoaded();

    await panel.addButton.click();
    await form.waitForOpen();
    await page.keyboard.press('Escape');
    await form.waitForClosed();
    await expect(panel.addButton).toBeFocused();
    await expect(panel.rows()).toHaveCount(0);
  });
});
