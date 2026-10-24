/**
 * E2E tests for the cost line grid dialog (#2235, EPIC-21 P4.3, AC6).
 *
 * "Add lines (grid)" on a task or purchase adds Estimates; "Split" on an offer or invoice adds
 * lines linked to it (Assign all to + one transaction). Covered here:
 * - keyboard rows: Enter / Shift+Enter move down / up a column, Ctrl/⌘+D duplicates the row,
 *   Remove has an Undo toast;
 * - spreadsheet paste through a dispatched `paste` event (`text/plain`, tab separated): 4 columns
 *   insert at once, 3 columns open the "Check pasted rows" mapping preview first;
 * - validation: Save with a bad row focuses the first invalid cell and counts rows to fix;
 * - the document preview beside the grid (Paperless mocked on) and none with Paperless off;
 * - a full-screen sheet at 320px without horizontal scroll; dark mode.
 *
 * Data is created through the API with the per-test `testPrefix`; all names are invented.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
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
import { enableDarkTheme, expectLegibleInDark } from '../../fixtures/darkMode.js';
import { mockKeptDocumentLinks, mockPaperlessConfigured } from '../../fixtures/paperlessMocks.js';
import { CostLineGridDialog } from '../../pages/components/CostLineGridDialog.js';
import { CostLinesPanel } from '../../pages/components/CostLinesPanel.js';
import { ToastRegion } from '../../pages/components/ToastRegion.js';

let cleanup: SeedCleanup;

test.beforeEach(() => {
  cleanup = newCleanup();
});

test.afterEach(async () => {
  await runCleanup(cleanup);
});

async function openTaskGrid(page: Page, prefix: string) {
  await createFundingSource(page, cleanup, `${prefix} Savings`);
  const taskId = await createTask(page, cleanup, `${prefix} Hall task`);
  const panel = new CostLinesPanel(page);
  const grid = new CostLineGridDialog(page, 'Add lines');
  await page.goto(routeUrl('workItem', { id: taskId }));
  await panel.waitForLoaded();
  await panel.addGridButton.click();
  await grid.waitForOpen();
  return { taskId, panel, grid };
}

async function openOfferGrid(page: Page, prefix: string, amount = 1000) {
  await createFundingSource(page, cleanup, `${prefix} Savings`);
  const taskId = await createTask(page, cleanup, `${prefix} Hall task`);
  const vendorId = await createVendor(page, cleanup, `${prefix} Example Joinery Ltd`);
  const offer = await createInvoice(page, cleanup, vendorId, { amount, status: 'quotation' });
  const panel = new CostLinesPanel(page);
  await page.goto(routeUrl('invoice', { id: offer.id }));
  await panel.waitForLoaded();
  return { taskId, offer, panel };
}

test.describe('Cost line grid - keyboard rows (AC6)', { tag: '@responsive' }, () => {
  test('the first description is focused; Enter and Shift+Enter move down and up a column', async ({
    page,
    testPrefix,
  }) => {
    const { grid } = await openTaskGrid(page, testPrefix);

    await expect(grid.description(1)).toBeFocused();
    await grid.description(1).fill(`${testPrefix} Skirting`);
    await page.keyboard.press('Enter');
    await expect(grid.description(2)).toBeFocused();
    await grid.description(2).fill(`${testPrefix} Paint`);
    await page.keyboard.press('Shift+Enter');
    await expect(grid.description(1)).toBeFocused();
    // Enter on the last row adds a blank row and enters it
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(grid.description(3)).toBeFocused();
    // A blank row is always kept at the end
    await expect(grid.rows()).toHaveCount(3);
    await expect(grid.description(3)).toHaveValue('');
  });

  test('Ctrl/⌘+D duplicates the row and focuses the copy', async ({ page, testPrefix }) => {
    const { grid } = await openTaskGrid(page, testPrefix);

    await grid.description(1).fill(`${testPrefix} Socket`);
    await grid.cell('Quantity', 1).fill('3');
    await grid.cell('Unit price', 1).fill('12');
    await page.keyboard.press('ControlOrMeta+d');

    await expect(grid.description(2)).toBeFocused();
    await expect(grid.description(2)).toHaveValue(`${testPrefix} Socket`);
    await expect(grid.cell('Quantity', 2)).toHaveValue('3');
    await expect(grid.cell('Unit price', 2)).toHaveValue('12');
    await expect.poll(() => grid.filledRowCount()).toBe(2);
    // 3 x 12 = 36 net = 42.84 gross, per row
    await expect(grid.gross(1)).toHaveText('€42.84');
    await expect(grid.gross(2)).toHaveText('€42.84');
  });

  test('Remove shows an Undo toast; Undo brings the row back', async ({ page, testPrefix }) => {
    const { grid } = await openTaskGrid(page, testPrefix);
    const toasts = new ToastRegion(page);

    await grid.description(1).fill(`${testPrefix} Doorbell`);
    await grid.cell('Unit price', 1).fill('20');
    await grid.description(2).fill(`${testPrefix} Letterbox`);
    await grid.removeButton(1).click();

    await expect(grid.description(1)).toHaveValue(`${testPrefix} Letterbox`);
    await expect(toasts.undoToastWith('Row 1 removed.')).toBeVisible();
    await toasts.undoViaButton();
    await expect(grid.description(1)).toHaveValue(`${testPrefix} Doorbell`);
    await expect(grid.description(2)).toHaveValue(`${testPrefix} Letterbox`);
  });
});

test.describe('Cost line grid - paste (AC6)', { tag: '@responsive' }, () => {
  test('four columns (Description, Quantity, Unit, Unit price) are inserted at once', async ({
    page,
    testPrefix,
  }) => {
    const { grid } = await openTaskGrid(page, testPrefix);

    await grid.paste(
      [
        `${testPrefix} Beam\t4\tpcs\t25`,
        `${testPrefix} Plank\t10\tm\t3.5`,
        `${testPrefix} Screws\t1\tbox\t8`,
      ].join('\n'),
    );

    await expect(grid.pasteDialog).toHaveCount(0);
    await expect.poll(() => grid.filledRowCount()).toBe(3);
    await expect(grid.description(1)).toHaveValue(`${testPrefix} Beam`);
    await expect(grid.cell('Quantity', 2)).toHaveValue('10');
    await expect(grid.cell('Unit', 2)).toHaveValue('m');
    await expect(grid.cell('Unit price', 2)).toHaveValue('3.5');
    // 4 x 25 = 100 net -> 119.00 gross
    await expect(grid.gross(1)).toHaveText('€119.00');
    await expect(grid.liveStatus).toContainText('Pasted 3 rows');
  });

  test('three columns open the mapping preview first; Insert adds the lines', async ({
    page,
    testPrefix,
  }) => {
    const { grid } = await openTaskGrid(page, testPrefix);

    await grid.paste([`${testPrefix} Gutter\t2\t40`, `${testPrefix} Downpipe\t3\t15`].join('\n'));

    await expect(grid.pasteDialog).toBeVisible();
    await expect(grid.pasteStatus).toContainText('2 rows');
    await expect(grid.pasteInsert).toHaveText('Insert 2 lines');
    await grid.pasteInsert.click();
    await expect(grid.pasteDialog).toBeHidden();

    await expect.poll(() => grid.filledRowCount()).toBe(2);
    await expect(grid.description(2)).toHaveValue(`${testPrefix} Downpipe`);
    // Three columns map to Description, Quantity, Unit price
    await expect(grid.cell('Quantity', 1)).toHaveValue('2');
    await expect(grid.cell('Unit price', 1)).toHaveValue('40');
  });

  test('a single value is pasted as text, not as rows', async ({ page, testPrefix }) => {
    const { grid } = await openTaskGrid(page, testPrefix);

    await grid.paste(`${testPrefix} Just text`);
    await expect(grid.pasteDialog).toHaveCount(0);
    await expect.poll(() => grid.filledRowCount()).toBe(0);
  });
});

test.describe('Cost line grid - saving and validation', { tag: '@responsive' }, () => {
  test('Save adds the rows as Estimates on the task and reports the count', async ({
    page,
    testPrefix,
  }) => {
    const { grid, panel } = await openTaskGrid(page, testPrefix);

    await grid.paste(
      [`${testPrefix} Hinge\t6\tpcs\t4`, `${testPrefix} Handle\t2\tpcs\t9`].join('\n'),
    );
    await expect.poll(() => grid.filledRowCount()).toBe(2);
    await expect(grid.statusBar).toContainText('2 lines');
    await grid.save();
    await expect(grid.dialog).toBeHidden();

    await expect(panel.status).toHaveText('2 lines saved.');
    await expect(panel.rows()).toHaveCount(2);
    await expect(panel.stateChip(panel.row(`${testPrefix} Hinge`))).toHaveText('Estimate');
    await expect(panel.gross(panel.row(`${testPrefix} Hinge`))).toHaveText(/28\.56/);
  });

  test('Save with a row that needs fixing focuses the first invalid cell', async ({
    page,
    testPrefix,
  }) => {
    const { grid, panel } = await openTaskGrid(page, testPrefix);

    await grid.description(1).fill(`${testPrefix} No price`);
    await grid.cell('Quantity', 1).fill('2');
    await grid.save();

    await expect(grid.dialog).toBeVisible();
    await expect(grid.errors().first()).toContainText('Enter a unit price');
    await expect(grid.cell('Unit price', 1)).toBeFocused();
    await expect(grid.statusBar).toContainText('1 row needs attention');

    // Fixing the cell clears the error and the save goes through
    await grid.cell('Unit price', 1).fill('5');
    await grid.save();
    await expect(grid.dialog).toBeHidden();
    await expect(panel.row(`${testPrefix} No price`)).toBeVisible();
  });

  test('Cancel on a dirty grid asks before discarding', async ({ page, testPrefix }) => {
    const { grid, panel } = await openTaskGrid(page, testPrefix);

    await grid.description(1).fill(`${testPrefix} Unsaved`);
    await grid.cancelButton.click();
    await grid.discard.waitForOpen();
    await grid.discard.cancel();
    await expect(grid.dialog).toBeVisible();
    await expect(grid.description(1)).toHaveValue(`${testPrefix} Unsaved`);

    await grid.cancelButton.click();
    await grid.discard.waitForOpen();
    await grid.discard.confirmAndWaitClosed();
    await expect(grid.dialog).toBeHidden();
    await expect(panel.rows()).toHaveCount(0);
  });

  test('Split on an offer needs a task or purchase for every row', async ({ page, testPrefix }) => {
    const { panel, offer } = await openOfferGrid(page, testPrefix);
    const grid = new CostLineGridDialog(page, /^Split /);

    await panel.emptySplitButton().click();
    await grid.waitForOpen();
    await expect(grid.description(1)).toBeFocused();
    await grid.paste(`${testPrefix} Door\t1\tpcs\t100`);
    await grid.save();

    await expect(grid.dialog).toBeVisible();
    await expect(grid.errors().first()).toContainText('Pick a task or purchase');
    expect(offer.id).not.toBe('');
  });

  test('Split with Assign all to links every row to the offer and shows what is left', async ({
    page,
    testPrefix,
  }) => {
    const { panel } = await openOfferGrid(page, testPrefix, 1000);
    const grid = new CostLineGridDialog(page, /^Split /);

    await panel.emptySplitButton().click();
    await grid.waitForOpen();
    await grid.paste(
      [`${testPrefix} Door\t1\tpcs\t100`, `${testPrefix} Frame\t2\tpcs\t50`].join('\n'),
    );
    await grid.assignAllInput.click();
    await grid.assignAll.pick(`${testPrefix} Hall task`);
    // 200 net -> 238 gross of 1000
    await expect(grid.total).toHaveText('€238.00');
    await expect(grid.remainder).toContainText('Not yet split · €762.00');
    await grid.save();
    await expect(grid.dialog).toBeHidden();

    await expect(panel.rows()).toHaveCount(2);
    await expect(panel.stateChip(panel.row(`${testPrefix} Door`))).toHaveText('Offered');
    await expect(panel.row(`${testPrefix} Door`)).toContainText(`${testPrefix} Hall task`);
    await expect(panel.notYetSplit()).toHaveText('Not yet split · €762.00');
  });
});

test.describe('Cost line grid - document preview and surfaces', { tag: '@responsive' }, () => {
  test('with Paperless off there is no document preview', async ({ page, testPrefix }) => {
    const { panel } = await openOfferGrid(page, testPrefix);
    const grid = new CostLineGridDialog(page, /^Split /);

    await panel.emptySplitButton().click();
    await grid.waitForOpen();
    await expect(grid.preview).toHaveCount(0);
    await expect(grid.showDocumentButton).toHaveCount(0);
  });

  test('with a linked document and Paperless on, the document shows beside the grid or in a sheet', async ({
    page,
    testPrefix,
  }) => {
    await mockPaperlessConfigured(page);
    await page.route('**/paperless/documents/*/preview', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Synthetic document</p>' }),
    );
    const { panel, offer } = await openOfferGrid(page, testPrefix);
    await mockKeptDocumentLinks(page, 'invoice', offer.id, 1);
    await page.reload();
    await panel.waitForLoaded();
    const grid = new CostLineGridDialog(page, /^Split /);

    await panel.emptySplitButton().click();
    await grid.waitForOpen();
    const width = page.viewportSize()?.width ?? 1280;
    if (width >= 1024) {
      await expect(grid.preview).toBeVisible();
      await expect(grid.showDocumentButton).toHaveCount(0);
    } else {
      await expect(grid.preview).toHaveCount(0);
      await expect(grid.showDocumentButton).toBeVisible();
      await grid.showDocumentButton.click();
      await expect(grid.preview).toBeVisible();
    }
  });

  test('at 320px the grid is a full-screen sheet without horizontal scroll', async ({
    page,
    testPrefix,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const { grid } = await openTaskGrid(page, testPrefix);

    await expect(page.getByTestId('cost-line-grid-sheet')).toBeVisible();
    await grid.paste(`${testPrefix} Narrow\t1\tpcs\t10`);
    await expect(grid.description(1)).toHaveValue(`${testPrefix} Narrow`);
    const overflow = await page
      .getByTestId('cost-line-grid-sheet')
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflow, 'the sheet scrolls only vertically').toBe(false);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    await expect(grid.saveButton).toBeVisible();
  });

  test('dark mode: the grid, its inputs and the footer stay legible', async ({
    page,
    testPrefix,
  }) => {
    const { grid } = await openTaskGrid(page, testPrefix);
    await enableDarkTheme(page);

    await grid.paste(`${testPrefix} Night\t2\tpcs\t10`);
    await expectLegibleInDark(grid.description(1));
    await expectLegibleInDark(grid.gross(1));
    await expectLegibleInDark(grid.statusBar);
    await expectLegibleInDark(grid.saveButton);
  });
});
