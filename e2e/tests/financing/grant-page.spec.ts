/**
 * E2E: the Grant page (/budget/financing/grants/:id, #2242, EPIC-21 P4.10).
 *
 * Scenarios
 * F9  (AC9/AC13, @responsive) strip Rate · Eligible costs up to · Expected · Deadline · Documents; header
 *                             status chip and the forward-status primary; Work tab: Link tasks / purchases
 *                             with two picks gives two rows (kind word, link, computed amount, no row Edit);
 *                             Remove then Undo restores; the empty state carries the covered-costs sentence
 * F10 (AC11)                  a category-only grant (API-seeded, nothing linked): Expected €0.00 on the card,
 *                             the strip and the money service's overview figure; no banner
 * F9b                         Details edit (explicit Save, validation, persistence), the cap and the
 *                             explanation sentence, the Eligibility text, Delete (blocked while tasks are
 *                             linked), an unknown id shows the not-found alert
 *
 * Ported from subsidy-programs / subsidy-max-amount (the old page). Real data through the API.
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createCostLine,
  createPurchase,
  createTask,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import { createGrant, findOwnFundsId } from '../../fixtures/financingSeed.js';
import { mockPaperlessConfigured } from '../../fixtures/paperlessMocks.js';
import { API } from '../../fixtures/testData.js';
import { FinancingPage } from '../../pages/FinancingPage.js';
import { GrantPage } from '../../pages/GrantPage.js';

const money = (amount: number): string =>
  amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test.describe('Grant page: overview and header', { tag: '@responsive' }, () => {
  test('F9: the strip shows five facts and the header the status chip and the forward primary', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const grant = new GrantPage(page);
      const name = `${testPrefix} F9 Grant`;
      const grantId = await createGrant(page, cleanup, {
        name,
        reductionValue: 30,
        maximumAmount: 5000,
        applicationStatus: 'eligible',
        applicationDeadline: '2031-06-30',
      });
      await mockPaperlessConfigured(page);
      await grant.goto(grantId);

      await expect(grant.heading).toHaveText(name);
      await expect(grant.statusBadge).toHaveText('Eligible');
      await expect
        .poll(() => grant.summary.factIds())
        .toEqual(['rate', 'cap', 'expected', 'deadline', 'documents']);
      await expect(grant.summary.fact('rate')).toHaveText('30%');
      await expect(grant.summary.fact('cap')).toContainText(/5,000\.00/);

      await expect(grant.tabs.tab('overview')).toHaveText('Overview');
      await expect(grant.tabs.tab('work')).toBeVisible();
      await expect(grant.tabs.tab('history')).toHaveText('History');

      // The one primary is the next status; it applies at once and the chip follows
      await expect(grant.statusPrimary).toBeVisible();
      await expect(grant.logPrimary).toHaveCount(0);
      await grant.statusPrimary.click();
      await expect(grant.statusBadge).toHaveText('Applied');
      await grant.toasts.dismissUndoToasts();
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F9: a rejected grant has no forward status, so Log is the primary', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const grant = new GrantPage(page);
      const grantId = await createGrant(page, cleanup, {
        name: `${testPrefix} F9 Rejected`,
        reductionValue: 10,
        applicationStatus: 'rejected',
      });
      await grant.goto(grantId);
      await expect(grant.statusBadge).toHaveText('Rejected');
      await expect(grant.statusPrimary).toHaveCount(0);
      await expect(grant.logPrimary).toBeVisible();
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F10: a category-only grant counts EUR 0.00 everywhere and shows no banner', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const grant = new GrantPage(page);
      const financing = new FinancingPage(page);
      const categories = await page.request.get(API.budgetCategories);
      expect(categories.ok()).toBeTruthy();
      const categoryId = ((await categories.json()) as { categories: Array<{ id: string }> })
        .categories[0]!.id;
      const grantId = await createGrant(page, cleanup, {
        name: `${testPrefix} F10 Category Only`,
        reductionValue: 25,
        applicationStatus: 'approved',
        categoryIds: [categoryId],
      });

      // The card
      await financing.goto();
      await expect(financing.grantExpected(grantId)).toContainText(/0\.00/);
      await expect(financing.grantCovered(grantId)).toHaveText('0 items');

      // The strip: Expected is zero and nothing is flagged
      await grant.goto(grantId);
      await expect(grant.summary.fact('expected')).toContainText(/0\.00/);
      await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);

      // The money service's overview figure for the grant
      const overview = await page.request.get(API.budgetOverview);
      const figures = (
        (await overview.json()) as {
          money: { grants: Array<{ id: string; expected: { expected: number } }> };
        }
      ).money.grants.find((entry) => entry.id === grantId);
      expect(figures?.expected.expected ?? 0).toBe(0);

      // The Work tab: nothing is covered; the sentence names what Expected counts
      await grant.openWorkTab();
      await expect(grant.coveredItems.emptyMessage('No covered items yet.')).toBeVisible();
      await expect(grant.coveredItems.root).toContainText('Expected counts');
    } finally {
      await runCleanup(cleanup);
    }
  });
});

test.describe('Grant page: Work tab', { tag: '@responsive' }, () => {
  test('F9: Link tasks / purchases with two picks shows both rows; Remove then Undo restores', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const grant = new GrantPage(page);
      const taskTitle = `${testPrefix} F9 Work Task`;
      const purchaseName = `${testPrefix} F9 Work Purchase`;
      const ownFunds = await findOwnFundsId(page);
      const taskId = await createTask(page, cleanup, taskTitle);
      const purchaseId = await createPurchase(page, cleanup, purchaseName);
      await createCostLine(page, {
        kind: 'work_item',
        hostId: taskId,
        budgetSourceId: ownFunds,
        description: 'F9 task line',
        plannedAmount: 1000,
      });
      const grantId = await createGrant(page, cleanup, {
        name: `${testPrefix} F9 Work Grant`,
        reductionValue: 10,
        applicationStatus: 'eligible',
      });

      await grant.goto(grantId, { tab: 'work' });
      await expect(grant.coveredItems.emptyMessage('No covered items yet.')).toBeVisible();

      await grant.linkItems([taskTitle, purchaseName]);
      await expect(
        page.getByTestId('toast-success').filter({ hasText: 'Linked 2 items.' }),
      ).toBeVisible();

      const taskRow = GrantPage.rowId('work_item', taskId);
      const purchaseRow = GrantPage.rowId('household_item', purchaseId);
      await expect(grant.coveredItems.rows).toHaveCount(2);
      await expect(grant.coveredItems.row(taskRow)).toContainText('Task');
      await expect(grant.coveredItems.row(purchaseRow)).toContainText('Purchase');
      await expect(grant.coveredItems.link(taskRow)).toHaveText(taskTitle);
      await expect(grant.coveredItems.link(taskRow)).toHaveAttribute(
        'href',
        routeUrl('workItem', { id: taskId }),
      );
      await expect(grant.coveredItems.link(purchaseRow)).toHaveAttribute(
        'href',
        routeUrl('householdItem', { id: purchaseId }),
      );
      // The amount is computed by the server (no stored amount, so no row Edit)
      const items = await page.request.get(`${API.subsidyPrograms}/${grantId}/items`);
      const covered = (
        (await items.json()) as { items: Array<{ id: string; covered: number }> }
      ).items.find((item) => item.id === taskId)!.covered;
      expect(covered).toBeGreaterThan(0);
      await expect(grant.coveredItems.row(taskRow)).toContainText(money(covered));
      await expect(grant.coveredItems.editButton(taskRow)).toHaveCount(0);

      // Remove acts at once with an Undo toast; Undo brings the row back
      await grant.coveredItems.remove(taskRow);
      await expect(grant.coveredItems.row(taskRow)).toHaveCount(0);
      await expect(grant.coveredItems.rows).toHaveCount(1);
      await grant.toasts.undoViaButton();
      await expect(grant.coveredItems.row(taskRow)).toBeVisible();
      await expect(grant.coveredItems.rows).toHaveCount(2);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F9: already covered items are not offered again in the Link picker', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const grant = new GrantPage(page);
      const taskTitle = `${testPrefix} F9 Excl Task`;
      const taskId = await createTask(page, cleanup, taskTitle);
      const grantId = await createGrant(page, cleanup, {
        name: `${testPrefix} F9 Excl Grant`,
        reductionValue: 10,
        items: [{ type: 'work_item', id: taskId }],
      });
      await grant.goto(grantId, { tab: 'work' });
      await expect(grant.coveredItems.rows).toHaveCount(1);

      await grant.coveredItems.addButton.click();
      await grant.linkPicker.waitFor({ state: 'visible' });
      await grant.linkPickerInput.fill(taskTitle);
      // Nothing to offer: the only match is already covered
      await expect(page.locator('[data-search-picker-dropdown]').getByRole('option')).toHaveCount(
        0,
      );
      await expect(grant.linkSubmit).toHaveAttribute('aria-disabled', 'true');
    } finally {
      await runCleanup(cleanup);
    }
  });
});

test.describe('Grant page: details and delete', () => {
  test('F9b: Details edits with an explicit Save; the cap shows in the strip and the explanation', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const grant = new GrantPage(page);
      const grantId = await createGrant(page, cleanup, {
        name: `${testPrefix} F9b Edit`,
        reductionValue: 10,
      });
      await grant.goto(grantId);
      await expect(grant.summary.fact('cap')).toHaveText('No cap');
      await expect(grant.explanationText).not.toContainText('up to');

      await grant.detailsEdit.click();
      const renamed = `${testPrefix} F9b Renamed`;
      await grant.nameInput.fill(renamed);
      await grant.rateInput.fill('15');
      await grant.capInput.fill('800');
      await grant.detailsSave.click();

      await expect(grant.heading).toHaveText(renamed);
      await expect(grant.summary.fact('rate')).toHaveText('15%');
      await expect(grant.summary.fact('cap')).toContainText(/800\.00/);
      await expect(grant.explanationText).toContainText('up to');

      // Clearing the cap again shows "No cap"
      await grant.detailsEdit.click();
      await grant.capInput.fill('');
      await grant.detailsSave.click();
      await expect(grant.summary.fact('cap')).toHaveText('No cap');

      await page.reload();
      await expect(grant.heading).toHaveText(renamed);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F9b: Details validates the name and the rate before saving', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const grant = new GrantPage(page);
      const grantId = await createGrant(page, cleanup, {
        name: `${testPrefix} F9b Validate`,
        reductionValue: 10,
      });
      await grant.goto(grantId);
      await grant.detailsEdit.click();
      await grant.nameInput.fill('  ');
      await grant.rateInput.fill('0');
      await grant.detailsSave.click();

      await expect(grant.detailsCard.getByText('Enter a name.')).toBeVisible();
      await expect(
        grant.detailsCard.getByText('Enter a rate above 0 and up to 100.'),
      ).toBeVisible();
      await grant.detailsCancel.click();
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F9b: the Eligibility text saves and persists', async ({ page, testPrefix }) => {
    const cleanup = newCleanup();
    try {
      const grant = new GrantPage(page);
      const grantId = await createGrant(page, cleanup, {
        name: `${testPrefix} F9b Eligibility`,
        reductionValue: 10,
      });
      await grant.goto(grantId);
      await grant.eligibilityEdit.click();
      await grant.eligibilityInput.fill('Owner-occupied homes only');
      await grant.eligibilitySave.click();
      await expect(page.getByTestId('grant-detail-eligibility')).toHaveText(
        'Owner-occupied homes only',
      );
      await page.reload();
      await expect(page.getByTestId('grant-detail-eligibility')).toHaveText(
        'Owner-occupied homes only',
      );
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F9b: Delete is blocked while tasks are linked and works once they are removed', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    const grant = new GrantPage(page);
    const taskId = await createTask(page, cleanup, `${testPrefix} F9b Blocked Task`);
    const grantId = await createGrant(page, cleanup, {
      name: `${testPrefix} F9b Delete`,
      reductionValue: 10,
      items: [{ type: 'work_item', id: taskId }],
    });
    try {
      await grant.goto(grantId);
      await grant.openDelete();
      await grant.deleteDialog.confirm();
      // 409 SUBSIDY_PROGRAM_IN_USE: the dialog stays open and says why
      await expect(grant.deleteDialog.dialog.getByRole('alert')).toBeVisible();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('grant', { id: grantId }));
      await grant.deleteDialog.cancel();

      // Unlink the task, then the delete goes through
      await grant.openWorkTab();
      await grant.coveredItems.remove(GrantPage.rowId('work_item', taskId));
      await expect(grant.coveredItems.rows).toHaveCount(0);
      await grant.toasts.dismissUndoToasts();

      await grant.openDelete();
      await grant.deleteDialog.confirmAndWaitClosed();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('financing'));
      const gone = await page.request.get(`${API.subsidyPrograms}/${grantId}`);
      expect(gone.status()).toBe(404);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F9b: an unknown grant shows a not-found alert and a way back', async ({ page }) => {
    await page.goto(routeUrl('grant', { id: 'does-not-exist-f9b' }));
    const grant = new GrantPage(page);
    await expect(grant.errorCard).toContainText('This grant could not be found.');
    await page.getByRole('button', { name: /^Back to/ }).click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('financing'));
  });
});
