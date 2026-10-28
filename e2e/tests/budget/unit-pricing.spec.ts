/**
 * E2E tests for unit pricing on the cost line form (Story #741, rebuilt on the cost line form in
 * #2235).
 *
 * The form opens in unit pricing (Quantity, Unit, Unit price) with Entered as Net, and shows the
 * live result line "Gross €x (net … + VAT …)". Scenarios:
 * 1. WI unit pricing, entered as Gross: qty=10, unit="m²", unitPrice=50 -> gross 500.00
 * 2. WI unit pricing, entered as Net: qty=10, unitPrice=50 -> gross 595.00 (x1.19)
 * 3. HI unit pricing: the same flow on a purchase
 * 4. Edit re-opens a unit-priced line in unit pricing with its values
 * 5. Switching Pricing to Direct amount shows Amount and hides the unit fields (and back)
 * 6. The form heading is "New cost line" / "Edit cost line" (an h2, no inner h3 heading)
 */

import { test, expect } from '../../fixtures/auth.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import { CostLineFormDialog } from '../../pages/components/CostLineFormDialog.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
} from '../../fixtures/apiHelpers.js';

test.describe('WI unit pricing create (entered as Gross, Scenario 1)', () => {
  test('unit pricing entered as gross: result = qty × price, saved line shows correct amount', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    const form = new CostLineFormDialog(page, 'New cost line');
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Unit Pricing VAT Test`,
      });
      await detailPage.goto(workItemId, { tab: 'cost' });
      await detailPage.costLines.waitForLoaded();

      await detailPage.costLines.addButton.click();
      await form.waitForOpen();
      await form.fillUnitPriced({
        description: `${testPrefix} Floor`,
        quantity: '10',
        unit: 'm²',
        unitPrice: '50',
      });
      await form.enteredGross.check();

      // 10 × 50 = 500.00 gross; the VAT note for net prices is gone
      await expect(form.result).toContainText('Gross €500.00');
      await expect(form.dialog.getByText('VAT at 19% is added to net prices.')).toHaveCount(0);

      await form.save();
      await form.waitForClosed();

      const row = detailPage.costLines.row(`${testPrefix} Floor`);
      await expect(detailPage.costLines.gross(row)).toHaveText(/500\.00/);
      await expect(row).toContainText('10 m² × €50.00');
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

test.describe('WI unit pricing create (entered as Net, Scenario 2)', () => {
  test('unit pricing entered as net: gross = qty × price × 1.19, saved line shows correct amount', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    const form = new CostLineFormDialog(page, 'New cost line');
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Unit Pricing No VAT Test`,
      });
      await detailPage.goto(workItemId, { tab: 'cost' });
      await detailPage.costLines.waitForLoaded();

      await detailPage.costLines.addButton.click();
      await form.waitForOpen();
      await form.fillUnitPriced({
        description: `${testPrefix} Tiles`,
        quantity: '10',
        unit: 'pcs',
        unitPrice: '50',
      });
      // Net is the default: the VAT note is shown
      await expect(form.enteredNet).toBeChecked();
      await expect(form.dialog.getByText('VAT at 19% is added to net prices.')).toBeVisible();
      // 10 × 50 × 1.19 = 595.00
      await expect(form.result).toContainText('Gross €595.00');
      await expect(form.result).toContainText('net €500.00');

      await form.save();
      await form.waitForClosed();

      await expect(
        detailPage.costLines.gross(detailPage.costLines.row(`${testPrefix} Tiles`)),
      ).toHaveText(/595\.00/);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

test.describe('HI unit pricing create (Scenario 3)', () => {
  test('unit pricing on a purchase: result and saved amount are correct', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new HouseholdItemDetailPage(page);
    const form = new CostLineFormDialog(page, 'New cost line');
    let hiId: string | null = null;

    try {
      hiId = await createHouseholdItemViaApi(page, { name: `${testPrefix} HI Unit Pricing Test` });
      await detailPage.goto(hiId);
      await detailPage.costLines.waitForLoaded();

      await detailPage.costLines.addButton.click();
      await form.waitForOpen();
      await form.fillUnitPriced({
        description: `${testPrefix} Chairs`,
        quantity: '10',
        unit: 'm²',
        unitPrice: '50',
      });
      await form.enteredGross.check();
      await expect(form.result).toContainText('Gross €500.00');

      await form.save();
      await form.waitForClosed();

      await expect(
        detailPage.costLines.gross(detailPage.costLines.row(`${testPrefix} Chairs`)),
      ).toHaveText(/500\.00/);
    } finally {
      if (hiId) await deleteHouseholdItemViaApi(page, hiId);
    }
  });
});

test.describe('Edit re-opens in unit pricing mode (Scenario 4)', () => {
  test('editing a unit-priced line opens the form pre-filled in unit pricing', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    const newForm = new CostLineFormDialog(page, 'New cost line');
    const editForm = new CostLineFormDialog(page, 'Edit cost line');
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Edit Unit Pricing Mode Test`,
      });
      await detailPage.goto(workItemId, { tab: 'cost' });
      await detailPage.costLines.waitForLoaded();

      await detailPage.costLines.addButton.click();
      await newForm.waitForOpen();
      await newForm.fillUnitPriced({
        description: `${testPrefix} Labour`,
        quantity: '5',
        unit: 'hr',
        unitPrice: '80',
      });
      await newForm.save();
      await newForm.waitForClosed();

      await detailPage.costLines.chooseAction(
        detailPage.costLines.row(`${testPrefix} Labour`),
        'Edit',
      );
      await editForm.waitForOpen();

      await expect(editForm.quantity).toHaveValue('5');
      await expect(editForm.unit).toHaveValue('hr');
      await expect(editForm.unitPrice).toHaveValue('80');
      // Unit pricing: no direct Amount field
      await expect(editForm.amount).toHaveCount(0);
      await expect(editForm.enteredNet).toBeChecked();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

test.describe('Switch back to direct amount mode (Scenario 5)', () => {
  test('switching Pricing to Direct amount shows Amount and hides the unit fields', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    const form = new CostLineFormDialog(page, 'New cost line');
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} Mode Switch Test` });
      await detailPage.goto(workItemId, { tab: 'cost' });
      await detailPage.costLines.waitForLoaded();

      await detailPage.costLines.addButton.click();
      await form.waitForOpen();
      await expect(form.quantity).toBeVisible();
      await expect(form.unitPrice).toBeVisible();

      await form.expandMoreDetails();
      await form.pricing.selectOption('direct');
      await expect(form.amount).toBeVisible();
      await expect(form.quantity).toHaveCount(0);
      await expect(form.unitPrice).toHaveCount(0);

      await form.pricing.selectOption('unit');
      await expect(form.quantity).toBeVisible();
      await expect(form.amount).toHaveCount(0);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

test.describe('Cost line form heading (Scenario 6)', () => {
  test('the form is titled "New cost line" / "Edit cost line" with no inner h3 heading', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    const newForm = new CostLineFormDialog(page, 'New cost line');
    const editForm = new CostLineFormDialog(page, 'Edit cost line');
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} No Form Heading Test`,
      });
      await detailPage.goto(workItemId, { tab: 'cost' });
      await detailPage.costLines.waitForLoaded();

      await detailPage.costLines.addButton.click();
      await newForm.waitForOpen();
      await expect(newForm.heading).toHaveText('New cost line');
      await expect(newForm.dialog.getByRole('heading', { level: 3 })).toHaveCount(0);

      await newForm.fillDirect(`${testPrefix} Direct`, '100');
      await newForm.save();
      await newForm.waitForClosed();

      await detailPage.costLines.chooseAction(
        detailPage.costLines.row(`${testPrefix} Direct`),
        'Edit',
      );
      await editForm.waitForOpen();
      await expect(editForm.heading).toHaveText('Edit cost line');
      await expect(editForm.dialog.getByRole('heading', { level: 3 })).toHaveCount(0);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});
