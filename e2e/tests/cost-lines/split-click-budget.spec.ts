/**
 * E2E click budget for splitting an offer (#2235, EPIC-21 P4.3, AC7).
 *
 * Starting on the Invoices list, a 50-line synthetic offer is split into cost lines in at most
 * 10 clicks with one spreadsheet paste. Every pointer action goes through `ClickCounter`, so the
 * count is what a user would do. The expected path is 5 clicks:
 *   1 the offer in the list        2 Split
 *   (paste 50 rows: keyboard)      3 focus "Assign all to"
 *   4 pick the task                5 Save
 * Picking the task is done with the keyboard but is still counted, to keep the budget honest.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Locator } from '@playwright/test';
import {
  createFundingSource,
  createInvoice,
  createTask,
  createVendor,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import type { SeedCleanup } from '../../fixtures/costLineSeed.js';
import { CostLineGridDialog } from '../../pages/components/CostLineGridDialog.js';
import { CostLinesPanel } from '../../pages/components/CostLinesPanel.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';

const LINES = 50;
const BUDGET = 10;

class ClickCounter {
  clicks = 0;
  async click(target: Locator): Promise<void> {
    this.clicks += 1;
    await target.click();
  }
}

let cleanup: SeedCleanup;

test.beforeEach(() => {
  cleanup = newCleanup();
});

test.afterEach(async () => {
  await runCleanup(cleanup);
});

test.describe('Split an offer - click budget (AC7)', { tag: '@responsive' }, () => {
  test('a 50-line offer is split in at most 10 clicks with one paste', async ({
    page,
    testPrefix,
  }) => {
    // 50 lines x 1 pcs x 10.00 net = 500.00 net = 595.00 gross: the offer is worth exactly that
    await createFundingSource(page, cleanup, `${testPrefix} Savings`);
    const taskName = `${testPrefix} Kitchen task`;
    await createTask(page, cleanup, taskName);
    const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Joinery Ltd`);
    const number = `${testPrefix}-OFFER50`;
    await createInvoice(page, cleanup, vendorId, {
      amount: 595,
      status: 'quotation',
      invoiceNumber: number,
    });

    const clicks = new ClickCounter();
    const invoices = new InvoicesPage(page);
    const panel = new CostLinesPanel(page);
    const grid = new CostLineGridDialog(page, /^Split /);

    // Start: the Invoices list, narrowed to the offer by the URL (not a click)
    await invoices.search(number);
    // 1 - the offer
    await clicks.click(
      invoices.tableBody
        .getByRole('link', { name: number })
        .or(invoices.cardsContainer.getByRole('link', { name: number }))
        .filter({ visible: true })
        .first(),
    );
    await panel.waitForLoaded();

    // 2 - Split (the offer has no lines yet: the empty state offers it)
    await clicks.click(panel.emptySplitButton());
    await grid.waitForOpen();
    await expect(grid.description(1)).toBeFocused();

    // One paste of 50 rows (keyboard): Description, Quantity, Unit, Unit price
    const text = Array.from({ length: LINES }, (_unused, index) => {
      const n = String(index + 1).padStart(2, '0');
      return `Cabinet part ${n}\t1\tpcs\t10`;
    }).join('\n');
    await grid.paste(text);
    await expect.poll(() => grid.filledRowCount()).toBe(LINES);
    await expect(grid.total).toHaveText('€595.00');
    await expect(grid.remainder).toHaveCount(0);

    // 3 - Assign all to, 4 - the task
    await clicks.click(grid.assignAllInput);
    clicks.clicks += 1; // choosing the task is counted as a click although it is a key press
    await grid.assignAll.pick(taskName);

    // 5 - Save
    await clicks.click(grid.saveButton);
    await expect(grid.dialog).toBeHidden();

    await expect(panel.status).toHaveText(`${LINES} lines saved.`);
    await expect(panel.rows()).toHaveCount(LINES);
    await expect(panel.notYetSplit()).toHaveCount(0);
    await expect(panel.over()).toHaveCount(0);
    await expect(panel.total()).toHaveText('€595.00');
    await expect(panel.stateChip(panel.row('Cabinet part 01'))).toHaveText('Offered');

    expect(clicks.clicks, 'clicks used').toBeLessThanOrEqual(BUDGET);
    expect(clicks.clicks, 'expected path').toBe(5);
  });
});
