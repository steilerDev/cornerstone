/**
 * E2E: the New funding source and New grant dialogs (#2242, EPIC-21 P4.10), plus the grant chips on
 * the task and purchase lists.
 *
 * Scenarios
 * F6 (AC5, @responsive) New grant: no type selector and no provider; Save with no items shows the focused
 *                       error "Choose at least one task or purchase"; More details holds Cost
 *                       categories, Status and Deadline; two picks (keys only) give a grant covering
 *                       both; Cancel on a dirty form asks to discard
 * F6b (AC2/AC3)         New funding source: the types offered exclude Own funds; validation messages;
 *                       a saved source lands on its page
 * F7 (AC6, @responsive) the task and purchase list rows of a covered item show "‹name› · 40%"; two
 *                       grants show the first chip and "+1"; chips are plain labels, not links
 *
 * Real data through the API (synthetic names with the `testPrefix`), removed in `finally`.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { createPurchase, createTask, newCleanup, runCleanup } from '../../fixtures/costLineSeed.js';
import { createGrant, deleteGrant } from '../../fixtures/financingSeed.js';
import { API } from '../../fixtures/testData.js';
import { FinancingFormDialog } from '../../pages/FinancingFormDialog.js';
import { FinancingPage } from '../../pages/FinancingPage.js';
import { GrantPage } from '../../pages/GrantPage.js';

test.describe('New grant dialog', { tag: '@responsive' }, () => {
  test('F6: the dialog has no type selector and no provider; Save with no items asks for one', async ({
    page,
  }) => {
    const financing = new FinancingPage(page);
    const dialog = new FinancingFormDialog(page, 'grant');
    await financing.goto();
    await financing.addGrant.click();
    await dialog.waitForOpen();
    await dialog.settled();

    // Percentage grants only, and no provider
    await expect(dialog.dialog.locator('#reductionType')).toHaveCount(0);
    await expect(dialog.dialog.locator('#provider')).toHaveCount(0);
    await expect(dialog.dialog.getByLabel('Type', { exact: true })).toHaveCount(0);
    await expect(dialog.dialog.getByLabel('Provider')).toHaveCount(0);

    await dialog.fillGrant({ name: 'F6 Missing Items', rate: 20 });
    await dialog.save();

    const error = dialog.fieldError('items');
    await expect(error).toBeVisible();
    await expect(error).toHaveText('Choose at least one task or purchase');
    // The error is reached: focus is on the items field
    await expect(dialog.items.input).toBeFocused();
    await expect(dialog.dialog).toBeVisible();
  });

  test('F6: More details holds Cost categories, Status and Deadline', async ({ page }) => {
    const financing = new FinancingPage(page);
    const dialog = new FinancingFormDialog(page, 'grant');
    await financing.goto();
    await financing.addGrant.click();
    await dialog.waitForOpen();

    await expect(dialog.categories.input).toBeHidden();
    await expect(dialog.grantStatus).toBeHidden();
    await expect(dialog.deadline).toBeHidden();
    await dialog.expandMoreDetails();
    await expect(dialog.categories.input).toBeVisible();
    await expect(dialog.grantStatus).toBeVisible();
    await expect(dialog.deadline).toBeVisible();
  });

  test('F6: two picks (keys only) give a grant that covers both items', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const financing = new FinancingPage(page);
      const dialog = new FinancingFormDialog(page, 'grant');
      const grant = new GrantPage(page);
      const taskTitle = `${testPrefix} F6 Pick Task`;
      const purchaseName = `${testPrefix} F6 Pick Purchase`;
      const taskId = await createTask(page, cleanup, taskTitle);
      const purchaseId = await createPurchase(page, cleanup, purchaseName);

      await financing.goto();
      await financing.addGrant.click();
      await dialog.waitForOpen();
      await dialog.fillGrant({ name: `${testPrefix} F6 Grant`, rate: 40 });
      await dialog.pickItems([taskTitle, purchaseName]);
      await expect(dialog.itemChips.getByRole('listitem')).toHaveCount(2);
      await dialog.save();

      await expect(page).toHaveURL((url) =>
        /\/budget\/financing\/grants\/[^/]+$/.test(url.pathname),
      );
      const createdGrantId = new URL(page.url()).pathname.split('/').pop()!;
      await expect(grant.heading).toBeFocused();
      cleanup.fns.push(() => deleteGrant(page, createdGrantId));

      await grant.openWorkTab();
      await expect(grant.coveredItems.rows).toHaveCount(2);
      await expect(grant.coveredItems.row(GrantPage.rowId('work_item', taskId))).toBeVisible();
      await expect(
        grant.coveredItems.row(GrantPage.rowId('household_item', purchaseId)),
      ).toBeVisible();
      await expect(grant.summary.fact('rate')).toHaveText('40%');
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F6: a picked item can be removed again from its chip', async ({ page, testPrefix }) => {
    const cleanup = newCleanup();
    try {
      const financing = new FinancingPage(page);
      const dialog = new FinancingFormDialog(page, 'grant');
      const taskTitle = `${testPrefix} F6 Chip Task`;
      await createTask(page, cleanup, taskTitle);
      await financing.goto();
      await financing.addGrant.click();
      await dialog.waitForOpen();
      await dialog.pickItems([taskTitle]);
      await expect(dialog.itemChips.getByRole('listitem')).toHaveCount(1);
      await dialog.itemChips.getByRole('button', { name: `Remove ${taskTitle}` }).click();
      await expect(dialog.itemChips.getByRole('listitem')).toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });
});

test.describe('New funding source dialog', { tag: '@responsive' }, () => {
  test('F6b: the types exclude Own funds and validation names the fields', async ({ page }) => {
    const financing = new FinancingPage(page);
    const dialog = new FinancingFormDialog(page, 'source');
    await financing.goto();
    await financing.addSource.click();
    await dialog.waitForOpen();

    await expect(dialog.sourceType.locator('option')).toHaveText([
      'Bank loan',
      'Credit line',
      'Savings',
      'Other',
    ]);

    await dialog.save();
    await expect(dialog.fieldError('name')).toHaveText('Enter a name.');
    await expect(dialog.fieldError('totalAmount')).toHaveText('Enter an amount greater than 0.');
    await expect(dialog.name).toBeFocused();

    await dialog.name.fill('F6b Bad Rate');
    await dialog.amount.fill('1000');
    await dialog.interestRate.fill('150');
    await dialog.save();
    await expect(dialog.fieldError('interestRate')).toHaveText('Enter a rate between 0 and 100.');
    await dialog.cancel();
  });

  test('F6b: a saved loan lands on its page showing the entered figures', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    try {
      const financing = new FinancingPage(page);
      const dialog = new FinancingFormDialog(page, 'source');
      const name = `${testPrefix} F6b Loan`;
      await financing.goto();
      await financing.addSource.click();
      await dialog.waitForOpen();
      await dialog.fillSource({ name, amount: 15000, type: 'bank_loan', interestRate: 3.25 });
      await dialog.save();

      await expect(page).toHaveURL((url) =>
        /\/budget\/financing\/sources\/[^/]+$/.test(url.pathname),
      );
      createdId = new URL(page.url()).pathname.split('/').pop()!;
      await expect(page.getByRole('heading', { level: 1, name })).toBeFocused();
      await expect(
        page.getByTestId('source-summary').getByTestId('summary-fact-amount'),
      ).toContainText(/15,000\.00/);
      await expect(page.getByTestId('source-summary').getByTestId('summary-fact-rate')).toHaveText(
        '3.25%',
      );
    } finally {
      if (createdId) await page.request.delete(`${API.budgetSources}/${createdId}`);
    }
  });
});

test.describe('Grant chips on the lists', { tag: '@responsive' }, () => {
  /** The grants chip of a row: the table and the card surface are both mounted, one is visible. */
  const chips = (page: Page, prefix: string, id: string) =>
    page
      .locator(`[data-testid="${prefix}-${id}"], [data-testid="${prefix}-mobile-${id}"]`)
      .filter({ visible: true });

  test('F7: a covered task and purchase show "‹name› · 40%"; chips are not links', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const taskTitle = `${testPrefix} F7 Chip Task`;
      const purchaseName = `${testPrefix} F7 Chip Purchase`;
      const taskId = await createTask(page, cleanup, taskTitle);
      const purchaseId = await createPurchase(page, cleanup, purchaseName);
      const grantName = `${testPrefix} F7 Grant`;
      await createGrant(page, cleanup, {
        name: grantName,
        reductionValue: 40,
        applicationStatus: 'approved',
        items: [
          { type: 'work_item', id: taskId },
          { type: 'household_item', id: purchaseId },
        ],
      });

      await page.goto(`${routeUrl('workItems')}?q=${encodeURIComponent(taskTitle)}`);
      const taskChip = chips(page, 'work-item-grants', taskId);
      await expect(taskChip).toBeVisible();
      await expect(taskChip).toContainText(`${grantName} · 40%`);
      await expect(taskChip.getByRole('link')).toHaveCount(0);
      await expect(page.getByTestId(`work-item-grants-${taskId}-more`)).toHaveCount(0);

      await page.goto(`${routeUrl('householdItems')}?q=${encodeURIComponent(purchaseName)}`);
      const purchaseChip = chips(page, 'household-item-grants', purchaseId);
      await expect(purchaseChip).toBeVisible();
      await expect(purchaseChip).toContainText(`${grantName} · 40%`);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F7: two grants show the first chip and "+1" naming both', async ({ page, testPrefix }) => {
    const cleanup = newCleanup();
    try {
      const taskTitle = `${testPrefix} F7 Two Task`;
      const taskId = await createTask(page, cleanup, taskTitle);
      const first = `${testPrefix} F7 Alpha Grant`;
      const second = `${testPrefix} F7 Beta Grant`;
      for (const [name, rate] of [
        [first, 40],
        [second, 10],
      ] as const) {
        await createGrant(page, cleanup, {
          name,
          reductionValue: rate,
          applicationStatus: 'approved',
          items: [{ type: 'work_item', id: taskId }],
        });
      }

      await page.goto(`${routeUrl('workItems')}?q=${encodeURIComponent(taskTitle)}`);
      const chip = chips(page, 'work-item-grants', taskId);
      await expect(chip).toBeVisible();
      // Sorted by name: Alpha first, then "+1"
      await expect(chip).toContainText(`${first} · 40%`);
      await expect(chip).toContainText('+1');
      // The whole list is the accessible name of the "+1"
      await expect(chip).toContainText(`Grants: ${first}, ${second}`);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F7: a rejected grant is not shown on the row', async ({ page, testPrefix }) => {
    const cleanup = newCleanup();
    try {
      const taskTitle = `${testPrefix} F7 Rejected Task`;
      const taskId = await createTask(page, cleanup, taskTitle);
      await createGrant(page, cleanup, {
        name: `${testPrefix} F7 Rejected Grant`,
        reductionValue: 40,
        applicationStatus: 'rejected',
        items: [{ type: 'work_item', id: taskId }],
      });
      await page.goto(`${routeUrl('workItems')}?q=${encodeURIComponent(taskTitle)}`);
      await expect(
        page.getByRole('link', { name: taskTitle }).filter({ visible: true }),
      ).toBeVisible();
      await expect(chips(page, 'work-item-grants', taskId)).toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });
});
