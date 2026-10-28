/**
 * E2E tests for Unlink and Remove with Undo on cost lines (#2236, EPIC-21).
 *
 * Unlink (task and purchase pages) and "Remove from offer / invoice" (offer and invoice pages) act
 * at once: no dialog, an Undo toast, and focus moves to the next row's ⋯ (else the previous row's,
 * else the section's fallback). Undo restores the link and focuses the restored row's ⋯. Delete of
 * an unlinked line still asks first. The h2 reads "Cost lines (n)".
 *
 * Scenarios:
 *   U1  Task page Unlink: no dialog, toast "‹line› unlinked from Invoice ‹number›.", the line
 *       becomes an Estimate; Undo restores the link, also after a reload
 *   U2  Invoice page Remove: toast, the row leaves, the h2 count changes; Undo brings both back
 *   U2b Click-Undo: row restored, focus not on the body
 *   U3  Focus after Remove: next row's ⋯, then the previous row's (last row), then the fallback
 *   U4  Delete on an unlinked line still opens the ConfirmDialog
 *   U5  409: the line is linked elsewhere through the API, then Undo shows "changed since"
 *
 * All data is created through the API with the per-test `testPrefix`; names are invented.
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createCostLine,
  createFundingSource,
  createInvoice,
  createLinkedCostLine,
  createTask,
  createVendor,
  linkCostLine,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import type { SeedCleanup } from '../../fixtures/costLineSeed.js';
import { CostLinesPanel } from '../../pages/components/CostLinesPanel.js';

let cleanup: SeedCleanup;

test.beforeEach(() => {
  cleanup = newCleanup();
});

test.afterEach(async () => {
  await runCleanup(cleanup);
});

type Page = Parameters<typeof createTask>[0];

/** A task with an invoice and `count` lines (A, B, C, ...) linked to it. */
async function seedLinked(page: Page, prefix: string, count: number) {
  const sourceId = await createFundingSource(page, cleanup, `${prefix} Savings`);
  const taskId = await createTask(page, cleanup, `${prefix} Kitchen task`);
  const vendorId = await createVendor(page, cleanup, `${prefix} Example Joinery Ltd`);
  const invoiceNumber = `${prefix}-INV`;
  const invoice = await createInvoice(page, cleanup, vendorId, {
    amount: 1000,
    status: 'pending',
    invoiceNumber,
  });
  const names: string[] = [];
  const lineIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const name = `${prefix} Line ${String.fromCharCode(65 + i)}`;
    const { lineId } = await createLinkedCostLine(page, invoice.id, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: name,
      plannedAmount: 100,
      includesVat: true,
      itemizedAmount: 100,
    });
    names.push(name);
    lineIds.push(lineId);
  }
  return { sourceId, taskId, vendorId, invoice, invoiceNumber, names, lineIds };
}

test.describe('Cost line Unlink with Undo - task page (U1)', { tag: '@responsive' }, () => {
  test('U1: Unlink needs no dialog, shows an Undo toast; Undo restores the link', async ({
    page,
    testPrefix,
  }) => {
    const { taskId, invoiceNumber, names } = await seedLinked(page, testPrefix, 1);
    const line = names[0]!;
    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('workItem', { id: taskId }, { tab: 'cost' }));
    await panel.waitForLoaded();
    await expect(panel.groupHeading(`Invoice ${invoiceNumber}`)).toBeVisible();

    await panel.chooseAction(panel.row(line), 'Unlink');

    // No dialog; a toast names the line and the invoice; the line is an Estimate again
    await expect(panel.deleteDialog.dialog).toBeHidden();
    await expect(
      panel.toasts.undoToastWith(`${line} unlinked from Invoice ${invoiceNumber}.`),
    ).toBeVisible();
    await expect(panel.stateChip(panel.row(line))).toHaveText('Estimate');
    await expect(panel.groupHeading(`Invoice ${invoiceNumber}`)).toHaveCount(0);

    // Undo restores the link (and the invoice group)
    await panel.toasts.undoViaButton();
    await expect(panel.groupHeading(`Invoice ${invoiceNumber}`)).toBeVisible();
    await expect(panel.stateChip(panel.row(line))).not.toHaveText('Estimate');

    // ...and it is real: a reload shows the link
    await page.reload();
    await panel.waitForLoaded();
    await expect(panel.groupHeading(`Invoice ${invoiceNumber}`)).toBeVisible();
    await expect(panel.stateChip(panel.row(line))).not.toHaveText('Estimate');
  });
});

test.describe('Cost line Remove with Undo - invoice page (U2)', { tag: '@responsive' }, () => {
  test('U2: Remove shows a toast and changes the h2 count; Undo restores row and count', async ({
    page,
    testPrefix,
  }) => {
    const { invoice, names } = await seedLinked(page, testPrefix, 2);
    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('invoice', { id: invoice.id }));
    await panel.waitForLoaded();
    await expect(panel.heading).toHaveText('Cost lines (2)');

    await panel.chooseAction(panel.row(names[0]!), 'Remove from invoice');
    await expect(panel.toasts.undoToastWith(`${names[0]} removed from`)).toBeVisible();
    await expect(panel.row(names[0]!)).toHaveCount(0);
    await expect(panel.heading).toHaveText('Cost lines (1)');

    // Focus is inside the section after Remove, so the keyboard Undo returns it to the restored
    // row's menu. (A click on the toast's Undo button leaves focus in the toast; it then goes to
    // the section's fallback, never to the body: see U2b.)
    await panel.toasts.undoViaShortcut('Control');
    await expect(panel.row(names[0]!)).toBeVisible();
    await expect(panel.heading).toHaveText('Cost lines (2)');
    await expect(panel.menuTrigger(panel.row(names[0]!))).toBeFocused();
  });

  test('U2b: Undo by clicking the toast restores the row and focus never falls to the body', async ({
    page,
    testPrefix,
  }) => {
    const { invoice, names } = await seedLinked(page, testPrefix, 2);
    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('invoice', { id: invoice.id }));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(names[0]!), 'Remove from invoice');
    await expect(panel.row(names[0]!)).toHaveCount(0);
    await panel.toasts.undoViaButton();
    await expect(panel.row(names[0]!)).toBeVisible();
    await expect(panel.heading).toHaveText('Cost lines (2)');
    await expect
      .poll(() => page.evaluate(() => document.activeElement === document.body))
      .toBe(false);
  });
});

test.describe('Cost line Remove - focus (U3)', { tag: '@responsive' }, () => {
  test('U3: focus goes to the next row, then the previous row, then the section fallback', async ({
    page,
    testPrefix,
  }) => {
    // Each Remove leaves an Undo toast for 6 s. The section sits low on the page, so on a phone the
    // menu item that was just clicked lies under where the toast appears: the pointer is then over
    // the toast, and hovering pauses an Undo toast's clock (moving the pointer away did not lift
    // the pause reliably on the mobile project: CI #2341). The next menu would be covered by the
    // toast, so close it through its own dismiss control instead of waiting for the clock.
    test.setTimeout(60_000);
    const panel = new CostLinesPanel(page);
    const waitForUndoToastGone = async () => {
      await panel.toasts.dismissUndoToasts();
      await expect(panel.toasts.undoToast).toHaveCount(0);
    };
    const { invoice } = await seedLinked(page, testPrefix, 3);
    await page.goto(routeUrl('invoice', { id: invoice.id }));
    await panel.waitForLoaded();
    await expect(panel.rows()).toHaveCount(3);
    const order = async () =>
      (await panel.rows().allTextContents()).map((text) => /Line [A-C]/.exec(text)?.[0] ?? text);

    // Remove the FIRST row: focus goes to the (new) first row's menu, the old second row
    let rows = await order();
    await panel.chooseAction(panel.row(rows[0]!), 'Remove from invoice');
    await expect(panel.row(rows[0]!)).toHaveCount(0);
    await expect(panel.menuTrigger(panel.row(rows[1]!))).toBeFocused();

    // Remove the LAST row: focus goes to the previous row's menu
    rows = await order();
    expect(rows).toHaveLength(2);
    await waitForUndoToastGone();
    await panel.chooseAction(panel.row(rows[1]!), 'Remove from invoice');
    await expect(panel.row(rows[1]!)).toHaveCount(0);
    await expect(panel.menuTrigger(panel.row(rows[0]!))).toBeFocused();

    // Remove the ONLY row: focus goes to the section's fallback (Add cost line, else the heading)
    rows = await order();
    expect(rows).toHaveLength(1);
    await waitForUndoToastGone();
    await panel.chooseAction(panel.row(rows[0]!), 'Remove from invoice');
    await expect(panel.rows()).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const active = document.activeElement;
          return (
            active?.getAttribute('data-testid') === 'cost-lines-add' ||
            (active?.tagName === 'H2' && /^Cost lines/.test(active.textContent ?? ''))
          );
        }),
      )
      .toBe(true);
  });
});

test.describe('Cost line Delete still asks (U4)', { tag: '@responsive' }, () => {
  test('U4: Delete on an unlinked line opens the ConfirmDialog; Cancel keeps the line', async ({
    page,
    testPrefix,
  }) => {
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Savings`);
    const taskId = await createTask(page, cleanup, `${testPrefix} Garden task`);
    const name = `${testPrefix} Loose line`;
    await createCostLine(page, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: name,
      plannedAmount: 50,
      includesVat: true,
    });
    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('workItem', { id: taskId }, { tab: 'cost' }));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(name), 'Delete');
    await panel.deleteDialog.waitForOpen();
    await panel.deleteDialog.cancel();
    await expect(panel.deleteDialog.dialog).toBeHidden();
    await expect(panel.row(name)).toBeVisible();
    await expect(panel.toasts.undoToast).toHaveCount(0);
  });
});

test.describe('Cost line Undo - conflict (U5)', { tag: '@responsive' }, () => {
  test('U5: Undo after the line was linked elsewhere says it changed since', async ({
    page,
    testPrefix,
  }) => {
    const { taskId, vendorId, invoiceNumber, names, lineIds } = await seedLinked(
      page,
      testPrefix,
      1,
    );
    const line = names[0]!;
    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('workItem', { id: taskId }, { tab: 'cost' }));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(line), 'Unlink');
    await expect(
      panel.toasts.undoToastWith(`${line} unlinked from Invoice ${invoiceNumber}.`),
    ).toBeVisible();
    await expect(panel.stateChip(panel.row(line))).toHaveText('Estimate');

    // Link the same line to another invoice through the API, so the snapshot no longer fits
    const other = await createInvoice(page, cleanup, vendorId, {
      amount: 500,
      status: 'pending',
      invoiceNumber: `${testPrefix}-OTHER`,
    });
    await linkCostLine(page, other.id, 'work_item', lineIds[0]!, 100);

    await panel.toasts.undoButton.click();
    await expect(
      panel.toasts.errorToast.filter({ hasText: "This changed since, so it can't be undone." }),
    ).toBeVisible();
  });
});
