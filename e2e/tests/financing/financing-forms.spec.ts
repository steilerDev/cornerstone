/**
 * E2E: the New funding source and New grant dialogs (#2242, EPIC-21 P4.10), plus the grant chips on
 * the task and purchase lists.
 *
 * Scenarios
 * F6 (AC5, @responsive) New grant: no type selector, provider, fixed amount or payout field; Save with no
 *                       items shows the focused error "Choose at least one task or purchase"; Status
 *                       (before Rate), Rate, cap, Deadline and the items picker are essentials, More
 *                       details holds Cost categories, Description, Eligibility and Notes (#2255 E1);
 *                       two picks (keys only) give a grant covering both, persisted values asserted
 *                       through the API (#2255 E2); the cap is optional; Rate and cap are validated
 * F6b (AC2/AC3)         New funding source: name, type, amount, rate and status are essentials; the types
 *                       offered exclude Own funds; the amount must be above 0; a saved source lands on
 *                       its page and the persisted record is asserted through the API (#2255 E2)
 * F7 (AC6, @responsive) the task and purchase list rows of a covered item show "‹name› · 40%"; two
 *                       grants show the first chip and "+1"; chips are plain labels, not links
 *
 * Real data through the API (synthetic names with the `testPrefix`), removed in `finally`.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import type { BudgetSource } from '../../../shared/src/types/budgetSource.js';
import type { SubsidyProgram } from '../../../shared/src/types/subsidyProgram.js';
import { createPurchase, createTask, newCleanup, runCleanup } from '../../fixtures/costLineSeed.js';
import { createGrant, deleteGrant } from '../../fixtures/financingSeed.js';
import { API } from '../../fixtures/testData.js';
import { FinancingFormDialog } from '../../pages/FinancingFormDialog.js';
import { FinancingPage } from '../../pages/FinancingPage.js';
import { GrantPage } from '../../pages/GrantPage.js';
import { HouseholdItemsPage } from '../../pages/HouseholdItemsPage.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';

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

  test('F6: Status, Rate, cap, Deadline and the items are essentials; More details holds Cost categories, Description, Eligibility and Notes', async ({
    page,
  }) => {
    const financing = new FinancingPage(page);
    const dialog = new FinancingFormDialog(page, 'grant');
    await financing.goto();
    await financing.addGrant.click();
    await dialog.waitForOpen();

    // Visible before More details is opened
    await expect(dialog.name).toBeVisible();
    await expect(dialog.grantStatus).toBeVisible();
    await expect(dialog.rate).toBeVisible();
    await expect(dialog.cap).toBeVisible();
    await expect(dialog.deadline).toBeVisible();
    await expect(dialog.items.input).toBeVisible();
    await expect(dialog.dialog.getByLabel('Status', { exact: true })).toBeVisible();
    await expect(dialog.dialog.getByLabel('Deadline', { exact: true })).toBeVisible();
    // Status comes before Rate in the form
    const statusBeforeRate = await dialog.dialog.evaluate((root) => {
      const status = root.querySelector('#applicationStatus');
      const rate = root.querySelector('#reductionValue');
      return Boolean(
        status && rate && status.compareDocumentPosition(rate) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    expect(statusBeforeRate).toBe(true);
    // The hints name what Rate and the cap mean
    await expect(
      dialog.dialog.getByText('Share of the covered costs the grant pays'),
    ).toBeVisible();
    await expect(
      dialog.dialog.getByText('Only costs up to this amount count. Leave empty for no limit.'),
    ).toBeVisible();

    // Behind More details
    await expect(dialog.categories.input).toBeHidden();
    await expect(dialog.field('description')).toBeHidden();
    await expect(dialog.field('eligibility')).toBeHidden();
    await expect(dialog.field('notes')).toBeHidden();
    await dialog.expandMoreDetails();
    await expect(dialog.categories.input).toBeVisible();
    await expect(dialog.field('description')).toBeVisible();
    await expect(dialog.field('eligibility')).toBeVisible();
    await expect(dialog.field('notes')).toBeVisible();
    // Status and Deadline are not duplicated behind it
    await expect(dialog.grantStatus).toHaveCount(1);
    await expect(dialog.deadline).toHaveCount(1);

    // No fixed amount, payout or provider field anywhere
    await expect(dialog.dialog.getByLabel('Fixed reduction')).toHaveCount(0);
    await expect(dialog.dialog.getByLabel(/payout/i)).toHaveCount(0);
    await expect(dialog.dialog.getByLabel('Provider')).toHaveCount(0);
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
      const grantName = `${testPrefix} F6 Grant`;
      await dialog.fillGrant({
        name: grantName,
        rate: 40,
        cap: 2500,
        status: 'applied',
        deadline: '2031-05-20',
      });
      await dialog.pickItems([taskTitle, purchaseName]);
      await expect(dialog.itemChips.getByRole('listitem')).toHaveCount(2);
      await dialog.save();

      await expect(page).toHaveURL((url) =>
        /\/budget\/financing\/grants\/[^/]+$/.test(url.pathname),
      );
      const createdGrantId = new URL(page.url()).pathname.split('/').pop()!;
      await expect(grant.heading).toBeFocused();
      cleanup.fns.push(() => deleteGrant(page, createdGrantId));

      // The persisted record, not just the page
      const stored = await page.request.get(`${API.subsidyPrograms}/${createdGrantId}`);
      expect(stored.ok()).toBeTruthy();
      const record = ((await stored.json()) as { subsidyProgram: SubsidyProgram }).subsidyProgram;
      expect(record).toMatchObject({
        name: grantName,
        reductionType: 'percentage',
        reductionValue: 40,
        maximumAmount: 2500,
        applicationStatus: 'applied',
        applicationDeadline: '2031-05-20',
      });
      const covered = await page.request.get(`${API.subsidyPrograms}/${createdGrantId}/items`);
      const { items } = (await covered.json()) as {
        items: Array<{ type: string; id: string }>;
      };
      expect(items).toHaveLength(2);
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'work_item', id: taskId }),
          expect.objectContaining({ type: 'household_item', id: purchaseId }),
        ]),
      );

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

  test('F6: the cap is optional: a grant saved without it has no cap, the default status and no deadline', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const financing = new FinancingPage(page);
      const dialog = new FinancingFormDialog(page, 'grant');
      const taskTitle = `${testPrefix} F6 NoCap Task`;
      await createTask(page, cleanup, taskTitle);
      await financing.goto();
      await financing.addGrant.click();
      await dialog.waitForOpen();
      await dialog.fillGrant({ name: `${testPrefix} F6 NoCap`, rate: 12.5 });
      await dialog.pickItems([taskTitle]);
      await dialog.save();

      await expect(page).toHaveURL((url) =>
        /\/budget\/financing\/grants\/[^/?#]+$/.test(url.pathname),
      );
      const createdId = new URL(page.url()).pathname.split('/').pop()!;
      cleanup.fns.push(() => deleteGrant(page, createdId));
      const stored = await page.request.get(`${API.subsidyPrograms}/${createdId}`);
      const record = ((await stored.json()) as { subsidyProgram: SubsidyProgram }).subsidyProgram;
      expect(record).toMatchObject({
        reductionType: 'percentage',
        reductionValue: 12.5,
        maximumAmount: null,
        applicationStatus: 'eligible',
        applicationDeadline: null,
      });
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F6: Rate and cap are validated', async ({ page }) => {
    const financing = new FinancingPage(page);
    const dialog = new FinancingFormDialog(page, 'grant');
    await financing.goto();
    await financing.addGrant.click();
    await dialog.waitForOpen();
    await dialog.fillGrant({ name: 'F6 Bad Numbers', rate: 150, cap: 0 });
    await dialog.save();
    await expect(dialog.fieldError('reductionValue')).toHaveText(
      'Enter a rate above 0 and up to 100.',
    );
    await expect(dialog.fieldError('maximumAmount')).toHaveText('Enter an amount greater than 0.');
    await expect(dialog.dialog).toBeVisible();
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

    // Name, Type, Amount, Interest rate and Status are all visible without More details
    await expect(dialog.name).toBeVisible();
    await expect(dialog.sourceType).toBeVisible();
    await expect(dialog.amount).toBeVisible();
    await expect(dialog.interestRate).toBeVisible();
    await expect(dialog.sourceStatus).toBeVisible();
    await expect(dialog.field('terms')).toBeHidden();

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

    // The amount must be above 0
    await dialog.name.fill('F6b Bad Rate');
    await dialog.amount.fill('0');
    await dialog.save();
    await expect(dialog.fieldError('totalAmount')).toHaveText('Enter an amount greater than 0.');

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
      await dialog.fillSource({
        name,
        amount: 15000,
        type: 'bank_loan',
        interestRate: 3.25,
        status: 'exhausted',
      });
      await dialog.save();

      await expect(page).toHaveURL((url) =>
        /\/budget\/financing\/sources\/[^/]+$/.test(url.pathname),
      );
      createdId = new URL(page.url()).pathname.split('/').pop()!;

      // The persisted record, not just the page
      const stored = await page.request.get(`${API.budgetSources}/${createdId}`);
      expect(stored.ok()).toBeTruthy();
      const record = ((await stored.json()) as { budgetSource: BudgetSource }).budgetSource;
      expect(record).toMatchObject({
        name,
        sourceType: 'bank_loan',
        totalAmount: 15000,
        interestRate: 3.25,
        status: 'exhausted',
      });

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

      // The Tasks list shows the grant chip under the title on the table; cards omit it (#2245)
      const tasks = new WorkItemsPage(page);
      await tasks.openSearch(taskTitle);
      if (await tasks.isTableSurface()) {
        const taskChip = tasks.grantChips(taskId);
        await expect(taskChip).toBeVisible();
        await expect(taskChip).toContainText(`${grantName} · 40%`);
        await expect(taskChip.getByRole('link')).toHaveCount(0);
        await expect(page.getByTestId(`work-item-grants-${taskId}-more`)).toHaveCount(0);
      }

      const purchases = new HouseholdItemsPage(page);
      await purchases.openSearch(purchaseName);
      // The grant chips sit under the name on the table; the card surface shows three facts only
      if (await purchases.isTableSurface()) {
        const purchaseChip = chips(page, 'household-item-grants', purchaseId);
        await expect(purchaseChip).toBeVisible();
        await expect(purchaseChip).toContainText(`${grantName} · 40%`);
      }
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

      const tasks = new WorkItemsPage(page);
      await tasks.openSearch(taskTitle);
      test.skip(!(await tasks.isTableSurface()), 'Grant chips are on the table surface only');
      const chip = tasks.grantChips(taskId);
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
      const tasks = new WorkItemsPage(page);
      await tasks.openSearch(taskTitle);
      await expect(tasks.title(taskId)).toBeVisible();
      await expect(tasks.grantChips(taskId)).toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });
});
