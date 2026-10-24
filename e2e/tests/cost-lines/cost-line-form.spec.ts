/**
 * E2E tests for the cost line form and the row actions (#2235, EPIC-21 P4.3).
 *
 * - AC5 defaults (unit pricing, Entered as Net, live Gross line) and Add another;
 * - AC2 Basis: a select for an Estimate, read-only with its reason once the line is linked;
 * - editing a linked line updates what is left on the offer; moving a line to another task;
 * - Link to invoice from a task; Unlink and Remove from invoice ask first (ConfirmDialog);
 * - Delete asks first; a linked line offers no Delete;
 * - dark mode: the form stays legible.
 *
 * Data is created through the API with the per-test `testPrefix`; all names are invented.
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
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import type { SeedCleanup } from '../../fixtures/costLineSeed.js';
import { enableDarkTheme, expectLegibleInDark } from '../../fixtures/darkMode.js';
import { CostLineFormDialog } from '../../pages/components/CostLineFormDialog.js';
import { CostLinesPanel } from '../../pages/components/CostLinesPanel.js';
import { ObjectFormDialog } from '../../pages/components/ObjectFormDialog.js';
import { SearchPickerControl } from '../../pages/components/SearchPickerControl.js';

let cleanup: SeedCleanup;

test.beforeEach(() => {
  cleanup = newCleanup();
});

test.afterEach(async () => {
  await runCleanup(cleanup);
});

async function seedTask(page: Parameters<typeof createTask>[0], prefix: string) {
  const sourceId = await createFundingSource(page, cleanup, `${prefix} Savings`);
  const taskId = await createTask(page, cleanup, `${prefix} Bathroom task`);
  return { sourceId, taskId };
}

test.describe('Cost line form - create (AC5)', { tag: '@responsive' }, () => {
  test('opens with unit pricing and Entered as Net; a unit-priced line shows its gross', async ({
    page,
    testPrefix,
  }) => {
    const { taskId } = await seedTask(page, testPrefix);
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'New cost line');
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    await panel.addButton.click();
    await form.waitForOpen();
    // Defaults: unit pricing fields are shown, Net is selected, no Amount yet
    await expect(form.quantity).toBeVisible();
    await expect(form.unitPrice).toBeVisible();
    await expect(form.amount).toHaveCount(0);
    await expect(form.enteredNet).toBeChecked();
    await expect(form.enteredGross).not.toBeChecked();

    await form.fillUnitPriced({
      description: `${testPrefix} Tap set`,
      quantity: '2',
      unit: 'pcs',
      unitPrice: '50',
    });
    // 2 x 50 = 100 net, 119 gross at the default VAT rate
    await expect(form.result).toContainText('Gross €119.00');
    await expect(form.result).toContainText('net €100.00');

    await form.save();
    await form.waitForClosed();
    const row = panel.row(`${testPrefix} Tap set`);
    await expect(row).toBeVisible();
    await expect(panel.gross(row)).toHaveText(/119\.00/);
    await expect(row).toContainText('2 pcs × €50.00');
  });

  test('Entered as Gross: the figure typed is the gross amount', async ({ page, testPrefix }) => {
    const { taskId } = await seedTask(page, testPrefix);
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'New cost line');
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    await panel.addButton.click();
    await form.waitForOpen();
    await form.fillUnitPriced({
      description: `${testPrefix} Mirror`,
      quantity: '1',
      unitPrice: '119',
    });
    await form.enteredGross.check();
    await expect(form.result).toContainText('Gross €119.00');
    await expect(form.result).toContainText('net €100.00');

    await form.save();
    await form.waitForClosed();
    await expect(panel.gross(panel.row(`${testPrefix} Mirror`))).toHaveText(/119\.00/);
  });

  test('Add another saves the line and keeps the form open for the next one', async ({
    page,
    testPrefix,
  }) => {
    const { taskId } = await seedTask(page, testPrefix);
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'New cost line');
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    await panel.addButton.click();
    await form.waitForOpen();
    await form.addAnotherCheckbox.check();
    await form.fillUnitPriced({
      description: `${testPrefix} First line`,
      quantity: '1',
      unitPrice: '10',
    });
    await form.save();

    await expect(form.addedStatus).toContainText('Saved. Add the next line.');
    await expect(form.dialog).toBeVisible();
    await expect(form.description).toHaveValue('');
    await expect(form.addAnotherCheckbox).toBeChecked();

    await form.addAnotherCheckbox.uncheck();
    await form.fillUnitPriced({
      description: `${testPrefix} Second line`,
      quantity: '1',
      unitPrice: '20',
    });
    await form.save();
    await form.waitForClosed();

    await expect(panel.rows()).toHaveCount(2);
    await expect(panel.row(`${testPrefix} First line`)).toBeVisible();
    await expect(panel.row(`${testPrefix} Second line`)).toBeVisible();
  });

  test('a missing description shows an error and keeps the form open', async ({
    page,
    testPrefix,
  }) => {
    const { taskId } = await seedTask(page, testPrefix);
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'New cost line');
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    await panel.addButton.click();
    await form.waitForOpen();
    await form.save();

    await expect(form.fieldError('description')).toHaveText('Enter a description.');
    await expect(form.dialog).toBeVisible();
    await expect(panel.rows()).toHaveCount(0);
  });

  test('dark mode: the form stays legible', async ({ page, testPrefix }) => {
    const { taskId } = await seedTask(page, testPrefix);
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'New cost line');
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();
    await enableDarkTheme(page);

    await panel.addButton.click();
    await form.waitForOpen();
    await form.fillUnitPriced({
      description: `${testPrefix} Dark`,
      quantity: '1',
      unitPrice: '10',
    });
    await expectLegibleInDark(form.heading);
    await expectLegibleInDark(form.result);
    await expectLegibleInDark(form.dialog.locator('label[for="description"]'));
  });
});

test.describe('Cost line form - Basis and editing (AC2)', { tag: '@responsive' }, () => {
  test('Basis is a select for an Estimate and read-only text with its reason once linked', async ({
    page,
    testPrefix,
  }) => {
    const { sourceId, taskId } = await seedTask(page, testPrefix);
    const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Plumbing Ltd`);
    const offer = await createInvoice(page, cleanup, vendorId, {
      amount: 1000,
      status: 'quotation',
    });
    const base = { kind: 'work_item' as const, hostId: taskId, budgetSourceId: sourceId };
    await createCostLine(page, {
      ...base,
      description: `${testPrefix} Estimate`,
      plannedAmount: 100,
    });
    await createLinkedCostLine(page, offer.id, {
      ...base,
      description: `${testPrefix} On offer`,
      plannedAmount: 400,
      includesVat: true,
      itemizedAmount: 400,
    });

    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'Edit cost line');
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(`${testPrefix} Estimate`), 'Edit');
    await form.waitForOpen();
    await form.expandMoreDetails();
    await expect(form.basis).toBeVisible();
    await expect(form.basis).toHaveValue('own_estimate');
    await expect(form.basis.locator('option')).toHaveText([
      'Own estimate',
      'Professional estimate',
    ]);
    await form.cancel();
    await form.waitForClosed();

    await panel.chooseAction(panel.row(`${testPrefix} On offer`), 'Edit');
    await form.waitForOpen();
    await form.expandMoreDetails();
    await expect(form.basis).toHaveCount(0);
    await expect(form.basisLocked).toHaveValue('Offer');
    await expect(form.dialog).toContainText('Set by the linked offer');
  });

  test('changing the amount of a linked line updates what is left on the offer', async ({
    page,
    testPrefix,
  }) => {
    const { sourceId, taskId } = await seedTask(page, testPrefix);
    const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Plumbing Ltd`);
    const offer = await createInvoice(page, cleanup, vendorId, {
      amount: 1000,
      status: 'quotation',
    });
    await createLinkedCostLine(page, offer.id, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Linked`,
      plannedAmount: 400,
      includesVat: true,
      itemizedAmount: 400,
    });

    const taskPanel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'Edit cost line');
    await page.goto(routeUrl('workItem', { id: taskId }));
    await taskPanel.waitForLoaded();

    await taskPanel.chooseAction(taskPanel.row(`${testPrefix} Linked`), 'Edit');
    await form.waitForOpen();
    await form.expandMoreDetails();
    if ((await form.pricing.inputValue()) !== 'direct') await form.pricing.selectOption('direct');
    await form.enteredGross.check();
    await form.amount.fill('500');
    await form.save();
    await form.waitForClosed();

    await expect(taskPanel.gross(taskPanel.row(`${testPrefix} Linked`))).toHaveText(/500\.00/);

    const offerPanel = new CostLinesPanel(page);
    await page.goto(routeUrl('invoice', { id: offer.id }));
    await offerPanel.waitForLoaded();
    await expect(offerPanel.gross(offerPanel.row(`${testPrefix} Linked`))).toHaveText('€500.00');
    await expect(offerPanel.notYetSplit()).toHaveText('Not yet split · €500.00');
  });

  test('a line moves to another task', async ({ page, testPrefix }) => {
    const { sourceId, taskId } = await seedTask(page, testPrefix);
    const otherTaskId = await createTask(page, cleanup, `${testPrefix} Garden task`);
    await createCostLine(page, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Movable`,
      plannedAmount: 100,
    });

    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'Edit cost line');
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(`${testPrefix} Movable`), 'Edit');
    await form.waitForOpen();
    await form.expandMoreDetails();
    const clear = form.dialog.getByRole('button', { name: 'Clear selection' });
    if (await clear.count()) await clear.click();
    await form.target.pick(`${testPrefix} Garden task`);
    await form.save();
    await form.waitForClosed();

    await expect(panel.row(`${testPrefix} Movable`)).toHaveCount(0);
    await page.goto(routeUrl('workItem', { id: otherTaskId }));
    await panel.waitForLoaded();
    await expect(panel.row(`${testPrefix} Movable`)).toBeVisible();
  });
});

test.describe('Cost line actions - link, unlink, remove, delete', { tag: '@responsive' }, () => {
  test('Link to invoice from a task links the line and shows its new state', async ({
    page,
    testPrefix,
  }) => {
    const { sourceId, taskId } = await seedTask(page, testPrefix);
    const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Plumbing Ltd`);
    const invoice = await createInvoice(page, cleanup, vendorId, {
      amount: 900,
      status: 'pending',
      invoiceNumber: `${testPrefix}-LINK`,
    });
    await createCostLine(page, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} To link`,
      plannedAmount: 300,
      includesVat: true,
      vendorId,
    });

    const panel = new CostLinesPanel(page);
    const link = new ObjectFormDialog(page, 'Link to invoice', 'link-invoice-form');
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(`${testPrefix} To link`), 'Link to invoice');
    await link.waitForOpen();
    await new SearchPickerControl(page, 'invoiceId', link.dialog).pick(`${testPrefix}-LINK`);
    await expect(link.field('itemizedAmount')).toHaveValue('300');
    await link.save();
    await link.waitForClosed();

    await expect(panel.stateChip(panel.row(`${testPrefix} To link`))).toHaveText('Invoiced');
    await expect(panel.groupHeading(`Invoice ${testPrefix}-LINK`)).toBeVisible();

    await page.goto(routeUrl('invoice', { id: invoice.id }));
    await panel.waitForLoaded();
    await expect(panel.row(`${testPrefix} To link`)).toBeVisible();
    await expect(panel.notYetSplit()).toHaveText('Not yet split · €600.00');
  });

  test('Unlink asks first; confirming turns the line back into an Estimate', async ({
    page,
    testPrefix,
  }) => {
    const { sourceId, taskId } = await seedTask(page, testPrefix);
    const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Plumbing Ltd`);
    const offer = await createInvoice(page, cleanup, vendorId, {
      amount: 500,
      status: 'quotation',
      invoiceNumber: `${testPrefix}-OFFER`,
    });
    await createLinkedCostLine(page, offer.id, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Linked`,
      plannedAmount: 200,
      includesVat: true,
      itemizedAmount: 200,
    });

    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    // Cancel leaves the line linked
    await panel.chooseAction(panel.row(`${testPrefix} Linked`), 'Unlink');
    await panel.unlinkDialog.waitForOpen();
    await expect(panel.unlinkDialog.dialog).toContainText(`Unlink ${testPrefix} Linked from`);
    await expect(panel.unlinkDialog.dialog).toContainText('The line stays here as an estimate.');
    await panel.unlinkDialog.cancel();
    await expect(panel.unlinkDialog.dialog).toBeHidden();
    await expect(panel.stateChip(panel.row(`${testPrefix} Linked`))).toHaveText('Offered');

    // Confirm unlinks it
    await panel.chooseAction(panel.row(`${testPrefix} Linked`), 'Unlink');
    await panel.unlinkDialog.waitForOpen();
    await panel.unlinkDialog.confirmAndWaitClosed();
    await expect(panel.stateChip(panel.row(`${testPrefix} Linked`))).toHaveText('Estimate');
    await expect(panel.groupHeading(`Offer ${testPrefix}-OFFER`)).toHaveCount(0);
  });

  test('Remove from invoice asks first; the line stays on its task as an estimate', async ({
    page,
    testPrefix,
  }) => {
    const { sourceId, taskId } = await seedTask(page, testPrefix);
    const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Plumbing Ltd`);
    const invoice = await createInvoice(page, cleanup, vendorId, {
      amount: 500,
      status: 'pending',
    });
    await createLinkedCostLine(page, invoice.id, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Removable`,
      plannedAmount: 200,
      includesVat: true,
      itemizedAmount: 200,
    });

    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('invoice', { id: invoice.id }));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(`${testPrefix} Removable`), 'Remove from invoice');
    await panel.removeDialog.waitForOpen();
    await expect(panel.removeDialog.dialog).toContainText(`Remove ${testPrefix} Removable from`);
    await expect(panel.removeDialog.dialog).toContainText('stays on');
    await panel.removeDialog.cancel();
    await expect(panel.removeDialog.dialog).toBeHidden();
    await expect(panel.row(`${testPrefix} Removable`)).toBeVisible();

    await panel.chooseAction(panel.row(`${testPrefix} Removable`), 'Remove from invoice');
    await panel.removeDialog.waitForOpen();
    await panel.removeDialog.confirmAndWaitClosed();
    await expect(panel.row(`${testPrefix} Removable`)).toHaveCount(0);

    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();
    await expect(panel.stateChip(panel.row(`${testPrefix} Removable`))).toHaveText('Estimate');
  });

  test('Delete asks first; a line with an offer or invoice offers no Delete', async ({
    page,
    testPrefix,
  }) => {
    const { sourceId, taskId } = await seedTask(page, testPrefix);
    const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Plumbing Ltd`);
    const offer = await createInvoice(page, cleanup, vendorId, {
      amount: 500,
      status: 'quotation',
    });
    const base = { kind: 'work_item' as const, hostId: taskId, budgetSourceId: sourceId };
    await createCostLine(page, {
      ...base,
      description: `${testPrefix} Disposable`,
      plannedAmount: 50,
    });
    await createLinkedCostLine(page, offer.id, {
      ...base,
      description: `${testPrefix} Locked`,
      plannedAmount: 200,
      includesVat: true,
      itemizedAmount: 200,
    });

    const panel = new CostLinesPanel(page);
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    // A linked line has Unlink, not Delete
    await panel.menuTrigger(panel.row(`${testPrefix} Locked`)).click();
    await expect(panel.menuItem('Unlink')).toBeVisible();
    await expect(panel.menuItem('Delete')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await panel.chooseAction(panel.row(`${testPrefix} Disposable`), 'Delete');
    await panel.deleteDialog.waitForOpen();
    await panel.deleteDialog.cancel();
    await expect(panel.deleteDialog.dialog).toBeHidden();
    await expect(panel.row(`${testPrefix} Disposable`)).toBeVisible();

    await panel.chooseAction(panel.row(`${testPrefix} Disposable`), 'Delete');
    await panel.deleteDialog.waitForOpen();
    await panel.deleteDialog.confirmAndWaitClosed();
    await expect(panel.row(`${testPrefix} Disposable`)).toHaveCount(0);
    await expect(panel.row(`${testPrefix} Locked`)).toBeVisible();
  });

  test('Duplicate opens a new-line form pre-filled from the row', async ({ page, testPrefix }) => {
    const { sourceId, taskId } = await seedTask(page, testPrefix);
    await createCostLine(page, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} Original`,
      plannedAmount: 100,
    });

    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'New cost line');
    await page.goto(routeUrl('workItem', { id: taskId }));
    await panel.waitForLoaded();

    await panel.chooseAction(panel.row(`${testPrefix} Original`), 'Duplicate');
    await form.waitForOpen();
    await expect(form.description).toHaveValue(`${testPrefix} Original`);
    await form.save();
    await form.waitForClosed();
    await expect(panel.rows()).toHaveCount(2);
  });
});
