/**
 * E2E tests for the full edit and "move" of a cost line (Issue #1553, rebuilt on the cost line
 * form in #2235).
 *
 * "Edit" on a cost line opens the cost line form: Description, the amount and, under More
 * details, Belongs to. Changing Belongs to moves the line to another task or purchase while it
 * stays on the same offer/invoice (a linked line may move between tasks and purchases).
 *
 * Scenarios covered:
 *   1. Edit the description and the amount of a linked line
 *   2. Move a line from one task to another: the line moves under the other task's group heading
 *   3. Move a line from a task to a purchase: both pages agree
 *   4. Move to a task that already has a line on the same invoice: both lines sit under it
 *   5. Edit on the task page opens the form with the current values and Belongs to
 *   6. A phone: the edit form is usable at 375px
 *
 * API used: PATCH /api/invoices/:invoiceId/budget-lines/:id (edit-and-move).
 * All resources are created through the API with the per-test `testPrefix`; names are invented.
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createCostLine,
  createFundingSource,
  createInvoice,
  createLinkedCostLine,
  createPurchase,
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

async function seedInvoice(page: Parameters<typeof createTask>[0], prefix: string, amount = 2000) {
  const sourceId = await createFundingSource(page, cleanup, `${prefix} Savings`);
  const vendorId = await createVendor(page, cleanup, `${prefix} Vendor`);
  const invoice = await createInvoice(page, cleanup, vendorId, { amount, date: '2026-06-01' });
  return { sourceId, invoice };
}

test.describe('Full edit - description and amount (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Edit description and amount of a linked line -> the row reflects both',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const { sourceId, invoice } = await seedInvoice(page, testPrefix);
      const taskId = await createTask(page, cleanup, `${testPrefix} Full Edit Task`);
      await createLinkedCostLine(page, invoice.id, {
        kind: 'work_item',
        hostId: taskId,
        budgetSourceId: sourceId,
        description: `${testPrefix} Original`,
        plannedAmount: 500,
        includesVat: true,
        itemizedAmount: 500,
      });
      const panel = new CostLinesPanel(page);
      const form = new CostLineFormDialog(page, 'Edit cost line');
      await page.goto(routeUrl('invoice', { id: invoice.id }));
      await panel.waitForLoaded();

      await panel.chooseAction(panel.row(`${testPrefix} Original`), 'Edit');
      await form.waitForOpen();
      await form.description.fill(`${testPrefix} Renamed`);
      await form.expandMoreDetails();
      if ((await form.pricing.inputValue()) !== 'direct') await form.pricing.selectOption('direct');
      await form.amount.fill('650');
      await form.save();
      await form.waitForClosed();

      await expect(panel.row(`${testPrefix} Original`)).toHaveCount(0);
      const row = panel.row(`${testPrefix} Renamed`);
      await expect(panel.gross(row)).toHaveText('€650.00');
      await expect(panel.notYetSplit()).toHaveText('Not yet split · €1,350.00');
    },
  );
});

test.describe('Move between tasks (Scenario 2)', { tag: '@responsive' }, () => {
  test(
    'Move a line from task A to task B -> the line sits under task B',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const { sourceId, invoice } = await seedInvoice(page, testPrefix);
      const taskA = await createTask(page, cleanup, `${testPrefix} Task A Source`);
      await createTask(page, cleanup, `${testPrefix} Task B Target`);
      await createLinkedCostLine(page, invoice.id, {
        kind: 'work_item',
        hostId: taskA,
        budgetSourceId: sourceId,
        description: `${testPrefix} Mover`,
        plannedAmount: 500,
        includesVat: true,
        itemizedAmount: 500,
      });
      const panel = new CostLinesPanel(page);
      const form = new CostLineFormDialog(page, 'Edit cost line');
      await page.goto(routeUrl('invoice', { id: invoice.id }));
      await panel.waitForLoaded();

      const row = panel.row(`${testPrefix} Mover`);
      // Document mode: the task is the group heading, not a cell of the row
      await expect(panel.groupHeading('Task A Source')).toBeVisible();
      await panel.chooseAction(row, 'Edit');
      await form.waitForOpen();
      await form.changeTarget(`${testPrefix} Task B Target`);
      const patched = page.waitForResponse(
        (resp) =>
          resp.url().includes('/budget-lines/') &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 200,
      );
      await form.save();
      await patched;
      await form.waitForClosed();

      await expect(panel.row(`${testPrefix} Mover`)).toBeVisible();
      await expect(panel.groupHeading('Task B Target')).toBeVisible();
      await expect(panel.groupHeading('Task A Source')).toHaveCount(0);
    },
  );
});

test.describe('Move from a task to a purchase (Scenario 3)', { tag: '@responsive' }, () => {
  test('Move a line from a task to a purchase -> the purchase shows it, the task does not', async ({
    page,
    testPrefix,
  }) => {
    const { sourceId, invoice } = await seedInvoice(page, testPrefix);
    const taskId = await createTask(page, cleanup, `${testPrefix} Cross Task`);
    const purchaseId = await createPurchase(page, cleanup, `${testPrefix} Cross Purchase`);
    await createLinkedCostLine(page, invoice.id, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Cross Line`,
      plannedAmount: 400,
      includesVat: true,
      itemizedAmount: 400,
    });
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'Edit cost line');
    await page.goto(routeUrl('invoice', { id: invoice.id }));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(`${testPrefix} Cross Line`), 'Edit');
    await form.waitForOpen();
    await form.changeTarget(`${testPrefix} Cross Purchase`);
    await form.save();
    await form.waitForClosed();
    await expect(panel.row(`${testPrefix} Cross Line`)).toBeVisible();
    await expect(panel.groupHeading('Cross Purchase')).toBeVisible();
    await expect(panel.groupHeading('Cross Task')).toHaveCount(0);

    await page.goto(routeUrl('householdItem', { id: purchaseId }));
    await panel.waitForLoaded();
    await expect(panel.row(`${testPrefix} Cross Line`)).toBeVisible();
    await expect(panel.stateChip(panel.row(`${testPrefix} Cross Line`))).toHaveText('Invoiced');

    await page.goto(routeUrl('workItem', { id: taskId }, { tab: 'cost' }));
    await panel.waitForLoaded();
    await expect(panel.row(`${testPrefix} Cross Line`)).toHaveCount(0);
  });
});

test.describe(
  'Move to a task that already has a line on this invoice (Scenario 4)',
  { tag: '@responsive' },
  () => {
    test('Move task A line to task B (which has a line on this invoice) -> both lines under task B', async ({
      page,
      testPrefix,
    }) => {
      const { sourceId, invoice } = await seedInvoice(page, testPrefix);
      const taskA = await createTask(page, cleanup, `${testPrefix} Same A`);
      const taskB = await createTask(page, cleanup, `${testPrefix} Same B`);
      const base = { kind: 'work_item' as const, budgetSourceId: sourceId };
      await createLinkedCostLine(page, invoice.id, {
        ...base,
        hostId: taskA,
        description: `${testPrefix} Line A`,
        plannedAmount: 300,
        includesVat: true,
        itemizedAmount: 300,
      });
      await createLinkedCostLine(page, invoice.id, {
        ...base,
        hostId: taskB,
        description: `${testPrefix} Line B`,
        plannedAmount: 200,
        includesVat: true,
        itemizedAmount: 200,
      });
      const panel = new CostLinesPanel(page);
      const form = new CostLineFormDialog(page, 'Edit cost line');
      await page.goto(routeUrl('invoice', { id: invoice.id }));
      await panel.waitForLoaded();

      await panel.chooseAction(panel.row(`${testPrefix} Line A`), 'Edit');
      await form.waitForOpen();
      await form.changeTarget(`${testPrefix} Same B`);
      await form.save();
      await form.waitForClosed();

      // Both lines now sit under one group, task B; task A's group is gone
      await expect(panel.groupHeading('Same B')).toHaveCount(1);
      await expect(panel.groupHeading('Same A')).toHaveCount(0);
      await expect(panel.row(`${testPrefix} Line A`)).toBeVisible();
      await expect(panel.row(`${testPrefix} Line B`)).toBeVisible();

      await page.goto(routeUrl('workItem', { id: taskB }, { tab: 'cost' }));
      await panel.waitForLoaded();
      await expect(panel.rows()).toHaveCount(2);
    });
  },
);

test.describe('Edit on the task page (Scenario 5)', { tag: '@responsive' }, () => {
  test('Edit on the task page opens the form with the current values and Belongs to', async ({
    page,
    testPrefix,
  }) => {
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Savings`);
    const taskId = await createTask(page, cleanup, `${testPrefix} Inline Task`);
    await createCostLine(page, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Inline Desc`,
      plannedAmount: 600,
      includesVat: true,
    });
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'Edit cost line');
    await page.goto(routeUrl('workItem', { id: taskId }, { tab: 'cost' }));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(`${testPrefix} Inline Desc`), 'Edit');
    await form.waitForOpen();
    await expect(form.description).toHaveValue(`${testPrefix} Inline Desc`);
    await form.expandMoreDetails();
    // Belongs to shows the current task
    await expect(form.dialog).toContainText(`${testPrefix} Inline Task`);

    await form.description.fill(`${testPrefix} Inline Updated`);
    const saved = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/work-items/${taskId}/budgets`) &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
    );
    await form.save();
    await saved;
    await form.waitForClosed();
    await expect(panel.row(`${testPrefix} Inline Updated`)).toBeVisible();
  });
});

test.describe('Full edit on a phone (Scenario 6)', { tag: '@responsive' }, () => {
  test('the edit form is usable at 375px', async ({ page, testPrefix }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const { sourceId, invoice } = await seedInvoice(page, testPrefix, 800);
    const taskId = await createTask(page, cleanup, `${testPrefix} Phone Task`);
    await createLinkedCostLine(page, invoice.id, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Phone Desc`,
      plannedAmount: 300,
      includesVat: true,
      itemizedAmount: 300,
    });
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'Edit cost line');
    await page.goto(routeUrl('invoice', { id: invoice.id }));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(`${testPrefix} Phone Desc`), 'Edit');
    await form.waitForOpen();
    await expect(page.getByTestId('cost-line-form-sheet')).toBeVisible();
    const box = await form.saveButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(36);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    await form.description.fill(`${testPrefix} Phone Edited`);
    await form.save();
    await form.waitForClosed();
    await expect(panel.row(`${testPrefix} Phone Edited`)).toBeVisible();
  });
});
