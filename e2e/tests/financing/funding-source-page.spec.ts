/**
 * E2E: the Funding source page (/budget/financing/sources/:id, #2242, EPIC-21 P4.10).
 *
 * Scenarios
 * F8  (AC8, @responsive)  header status chip; the strip's seven facts (six for Own funds); tabs
 *                         Overview · Cost (n) · History; the Cost tree area › item › line with
 *                         tri-state checkboxes; selecting an item group and a line then Move to
 *                         another source moves the lines (real data); the over-allocation warning's
 *                         "Move lines…" opens Cost with the first checkbox focused; History shows the
 *                         bank-report batch row
 * F8b                     the claimed-invoice warning gates the Move confirm; a 409 keeps the dialog
 * F4  (AC3)               Own funds page: no Delete in ⋯, type locked, six strip facts
 * F8c                     Details: explicit-Save edit, validation messages, persistence; Delete with
 *                         the ConfirmDialog; an unknown id shows the not-found alert
 *
 * Ported from budget-sources / budget-source-lines / budget-source-move (the old page). Real data
 * through the API; only the claimed-line and 409 cases mock the budget-lines / move endpoints.
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createCostLine,
  createInvoice,
  createPurchase,
  createTask,
  createVendor,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import { createSource, findOwnFundsId, readFinancing } from '../../fixtures/financingSeed.js';
import { mockPaperlessConfigured } from '../../fixtures/paperlessMocks.js';
import { linesUrl, mockSourceLines, mockSourceMove } from '../../fixtures/sourceLineMocks.js';
import { API } from '../../fixtures/testData.js';
import { FinancingPage } from '../../pages/FinancingPage.js';
import { FundingSourcePage } from '../../pages/FundingSourcePage.js';

test.describe('Funding source page: overview', { tag: '@responsive' }, () => {
  test('F8: header chip, seven strip facts and the three tabs', async ({ page, testPrefix }) => {
    const cleanup = newCleanup();
    try {
      const source = new FundingSourcePage(page);
      const name = `${testPrefix} F8 Loan`;
      const sourceId = await createSource(page, cleanup, {
        name,
        totalAmount: 80000,
        interestRate: 2,
      });
      await mockPaperlessConfigured(page);
      await source.goto(sourceId);

      await expect(source.heading).toHaveText(name);
      await expect(source.statusBadge).toHaveText('Active');
      // A loan's one primary is Prepare bank report, scoped to the source
      await expect(source.bankReportPrimary).toHaveAttribute(
        'href',
        routeUrl('bankReport', undefined, { type: 'claim', sourceId }),
      );

      await expect
        .poll(() => source.summary.factIds())
        .toEqual(['amount', 'allocated', 'paid', 'submitted', 'unallocated', 'rate', 'documents']);
      await expect(source.summary.figure('paid')).toHaveCount(1);

      await expect(source.tabs.tab('overview')).toHaveText('Overview');
      await expect(source.tabs.tab('cost')).toHaveText(/^Cost/);
      await expect(source.tabs.tab('history')).toHaveText('History');
      await expect(source.tabs.tab('overview')).toHaveAttribute('aria-selected', 'true');
      await expect(source.allocationCard).toBeVisible();
      await expect(source.allocationLegend).toBeVisible();
      await expect(source.detailsCard).toBeVisible();
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F8: a loan keeps Paid and Submitted as links to the Cost tab', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const source = new FundingSourcePage(page);
      const sourceId = await createSource(page, cleanup, {
        name: `${testPrefix} F8 Fact Links`,
        totalAmount: 1000,
      });
      await source.goto(sourceId);
      await source.summary.fact('paid').click();
      await expect(source.tabs.tab('cost')).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveURL((url) => url.searchParams.get('tab') === 'cost');
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F8: the over-allocation warning offers Move lines…, which opens Cost with the first checkbox focused', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const source = new FundingSourcePage(page);
      const sourceId = await createSource(page, cleanup, {
        name: `${testPrefix} F8 Overdrawn`,
        sourceType: 'savings',
        totalAmount: 1000,
      });
      const taskId = await createTask(page, cleanup, `${testPrefix} F8 Overrun Task`);
      await createCostLine(page, {
        kind: 'work_item',
        hostId: taskId,
        budgetSourceId: sourceId,
        description: 'F8 line over the source',
        plannedAmount: 1250,
        includesVat: true,
      });

      await source.goto(sourceId);
      await expect(source.overAllocatedWarning).toBeVisible();
      await expect(source.overAllocatedWarning).toContainText('Over-allocated by');
      // A signed figure: the strip shows Unallocated as a negative amount
      await expect(source.summary.fact('unallocated')).toHaveText(/^[-−]/);

      await source.moveLines.click();
      await expect(source.tabs.tab('cost')).toHaveAttribute('aria-selected', 'true');
      await expect(source.linesPanel(sourceId).getByRole('checkbox').first()).toBeFocused();
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F4: the Own funds page has no Delete, a locked type and six strip facts', async ({
    page,
  }) => {
    const source = new FundingSourcePage(page);
    const ownId = await findOwnFundsId(page);
    await mockPaperlessConfigured(page);
    await source.goto(ownId);

    await expect(source.heading).toHaveText('Own funds');
    await expect
      .poll(() => source.summary.factIds())
      .toEqual(['amount', 'allocated', 'paid', 'submitted', 'unallocated', 'documents']);
    // No Prepare bank report either: Own funds is not a loan
    await expect(source.bankReportPrimary).toHaveCount(0);

    // Whatever else the ⋯ menu holds, it never holds Delete
    if (await source.header.menuTrigger.isVisible()) {
      await source.header.openMenu();
      await expect(source.header.menuItem('object-header-delete')).toHaveCount(0);
      await page.keyboard.press('Escape');
    }

    // Details: the type is not editable for the system source
    await source.openDetailsEdit();
    await expect(source.typeSelect).toHaveCount(0);
    await source.detailsCancel.click();
  });
});

test.describe('Funding source page: Cost tab', { tag: '@responsive' }, () => {
  test('F8: the Cost tree is area › item › line with the kind word on the item', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const source = new FundingSourcePage(page);
      const sourceId = await createSource(page, cleanup, {
        name: `${testPrefix} F8 Tree`,
        sourceType: 'savings',
        totalAmount: 50000,
      });
      const taskTitle = `${testPrefix} F8 Tree Task`;
      const purchaseName = `${testPrefix} F8 Tree Purchase`;
      const taskId = await createTask(page, cleanup, taskTitle);
      const purchaseId = await createPurchase(page, cleanup, purchaseName);
      await createCostLine(page, {
        kind: 'work_item',
        hostId: taskId,
        budgetSourceId: sourceId,
        description: 'F8 tree task line A',
        plannedAmount: 100,
      });
      await createCostLine(page, {
        kind: 'work_item',
        hostId: taskId,
        budgetSourceId: sourceId,
        description: 'F8 tree task line B',
        plannedAmount: 200,
      });
      await createCostLine(page, {
        kind: 'household_item',
        hostId: purchaseId,
        budgetSourceId: sourceId,
        description: 'F8 tree purchase line',
        plannedAmount: 300,
      });

      await source.goto(sourceId, { tab: 'cost' });
      await expect(source.tabs.tab('cost')).toHaveText('Cost (3)');

      // One combined tree: tasks and purchases share the area heading; the item heading names the kind
      await expect(source.areaHeadings(sourceId)).toHaveCount(1);
      await expect(source.areaHeadings(sourceId)).toHaveText('No Area');
      await expect(source.itemHeadings(sourceId)).toHaveCount(2);
      await expect(source.itemHeadings(sourceId).filter({ hasText: taskTitle })).toContainText(
        'Task',
      );
      await expect(source.itemHeadings(sourceId).filter({ hasText: purchaseName })).toContainText(
        'Purchase',
      );
      await expect(source.itemLink(sourceId, taskTitle)).toHaveAttribute(
        'href',
        routeUrl('workItem', { id: taskId }),
      );
      await expect(source.itemLink(sourceId, purchaseName)).toHaveAttribute(
        'href',
        routeUrl('householdItem', { id: purchaseId }),
      );
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F8: selecting an item group and a line then Move to another source moves the lines', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const source = new FundingSourcePage(page);
      const nameA = `${testPrefix} F8 Move From`;
      const nameB = `${testPrefix} F8 Move To`;
      const fromId = await createSource(page, cleanup, {
        name: nameA,
        sourceType: 'savings',
        totalAmount: 50000,
      });
      const toId = await createSource(page, cleanup, {
        name: nameB,
        sourceType: 'savings',
        totalAmount: 50000,
      });
      const taskTitle = `${testPrefix} F8 Move Task`;
      const purchaseName = `${testPrefix} F8 Move Purchase`;
      const taskId = await createTask(page, cleanup, taskTitle);
      const purchaseId = await createPurchase(page, cleanup, purchaseName);
      for (const description of ['F8 move task line A', 'F8 move task line B']) {
        await createCostLine(page, {
          kind: 'work_item',
          hostId: taskId,
          budgetSourceId: fromId,
          description,
          plannedAmount: 100,
        });
      }
      await createCostLine(page, {
        kind: 'household_item',
        hostId: purchaseId,
        budgetSourceId: fromId,
        description: 'F8 move purchase line',
        plannedAmount: 300,
      });

      await source.goto(fromId, { tab: 'cost' });
      await expect(source.selectionBar(fromId)).toHaveCount(0);

      // Tri-state: ticking one line of the task leaves its group and the area mixed
      await source.lineCheckbox(fromId, 'F8 move task line A').check();
      await expect(source.selectionBar(fromId)).toContainText('1 line selected');
      await expect(source.itemCheckbox(fromId, taskTitle)).toHaveJSProperty('indeterminate', true);
      await expect(source.areaCheckbox(fromId, 'No Area')).toHaveJSProperty('indeterminate', true);

      // The item group selects all of its lines; the purchase's single line joins by itself
      await source.itemCheckbox(fromId, taskTitle).check();
      await expect(source.selectionBar(fromId)).toContainText('2 lines selected');
      await source.lineCheckbox(fromId, 'F8 move purchase line').check();
      await expect(source.selectionBar(fromId)).toContainText('3 lines selected');
      await expect(source.areaCheckbox(fromId, 'No Area')).toBeChecked();

      await source.openMoveModal(fromId);
      await expect(source.moveModalConfirmButton).toBeDisabled();
      await source.selectMoveTarget(nameB);
      await expect(source.moveModalConfirmButton).toBeEnabled();
      await source.confirmMove();
      await expect(source.moveModal).toBeHidden();

      await expect(
        page.getByTestId('toast-success').filter({ hasText: /Moved 3 lines to/ }),
      ).toContainText(nameB);
      await expect(source.tabs.tab('cost')).toHaveText('Cost (0)');
      await expect(source.selectionBar(fromId)).toHaveCount(0);

      // The lines now belong to the target
      const moved = await page.request.get(`${API.budgetSources}/${toId}/budget-lines`);
      expect(moved.ok()).toBeTruthy();
      const body = (await moved.json()) as {
        workItemLines: unknown[];
        householdItemLines: unknown[];
      };
      expect(body.workItemLines).toHaveLength(2);
      expect(body.householdItemLines).toHaveLength(1);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F8: a source with no lines shows the empty state on the Cost tab', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const source = new FundingSourcePage(page);
      const sourceId = await createSource(page, cleanup, {
        name: `${testPrefix} F8 Empty Cost`,
        sourceType: 'savings',
        totalAmount: 1000,
      });
      await source.goto(sourceId, { tab: 'cost' });
      await expect(source.tabs.tab('cost')).toHaveText('Cost (0)');
      await expect(source.linesPanel(sourceId)).toContainText('No budget lines assigned');
      await expect(source.selectionBar(sourceId)).toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F8: a failing lines request shows an error with Retry that loads the lines', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const source = new FundingSourcePage(page);
      const sourceId = await createSource(page, cleanup, {
        name: `${testPrefix} F8 Lines Error`,
        sourceType: 'savings',
        totalAmount: 1000,
      });
      let failing = true;
      await page.route(linesUrl(sourceId), async (route) => {
        if (!failing) {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
        });
      });

      await source.goto(sourceId, { tab: 'cost' });
      const panel = source.linesPanel(sourceId);
      await expect(panel.getByRole('alert')).toBeVisible();
      failing = false;
      await panel.getByRole('button', { name: 'Retry' }).click();
      await expect(panel).toContainText('No budget lines assigned');
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F8: the Move dialog lists the other sources and never the current one', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const source = new FundingSourcePage(page);
      const nameA = `${testPrefix} F8 Esc From`;
      const nameB = `${testPrefix} F8 Esc To`;
      const fromId = await createSource(page, cleanup, { name: nameA, totalAmount: 50000 });
      await createSource(page, cleanup, { name: nameB, totalAmount: 50000 });
      await mockSourceLines(page, fromId, {
        tasks: [
          {
            id: `wil-esc-${fromId}`,
            description: 'Esc line',
            plannedAmount: 100,
            parentId: `wi-esc-${fromId}`,
            parentName: 'Esc task',
            areaName: 'Kitchen',
          },
        ],
      });

      await source.goto(fromId, { tab: 'cost' });
      await source.lineCheckbox(fromId, 'Esc line').check();
      await source.openMoveModal(fromId);
      const input = source.moveModalSearchInput;
      await input.click();
      await input.fill(`${testPrefix} F8 Esc`);
      await expect(page.getByRole('option', { name: nameB })).toBeVisible();
      await expect(page.getByRole('option', { name: nameA })).toHaveCount(0);
      // The open list covers the footer: a click on the title blurs the input and closes it
      await source.moveModal.getByRole('heading', { level: 2 }).click();
      await expect(page.getByRole('option')).toHaveCount(0);
      await source.moveModalCancelButton.click();
      await expect(source.moveModal).toBeHidden();
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F8b: a line with a submitted invoice gates the confirm behind "I understand"', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const source = new FundingSourcePage(page);
      const nameB = `${testPrefix} F8b Claimed To`;
      const fromId = await createSource(page, cleanup, {
        name: `${testPrefix} F8b Claimed From`,
        totalAmount: 30000,
      });
      await createSource(page, cleanup, { name: nameB, totalAmount: 20000 });
      await mockSourceLines(page, fromId, {
        tasks: [
          {
            id: `wil-claimed-${fromId}`,
            description: 'Claimed invoice line',
            plannedAmount: 5000,
            parentId: `wi-claimed-${fromId}`,
            parentName: 'Electrical',
            areaName: 'Living Room',
            hasClaimedInvoice: true,
          },
        ],
      });

      await source.goto(fromId, { tab: 'cost' });
      await source.lineCheckbox(fromId, 'Claimed invoice line').check();
      await source.openMoveModal(fromId);
      await source.selectMoveTarget(nameB);

      await expect(source.moveModalWarningBlock).toBeVisible();
      await expect(source.moveModalWarningBlock).toContainText('submitted invoice');
      await expect(source.moveModalConfirmButton).toBeDisabled();

      // The label text is clicked, not the nested input (WebKit double-fires on the input)
      await source.clickUnderstoodLabel();
      await expect(source.moveModalUnderstoodCheckbox).toBeChecked();
      await expect(source.moveModalConfirmButton).toBeEnabled();

      await source.moveModalCancelButton.click();
      await expect(source.moveModal).toBeHidden();
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F8b: a 409 from the move endpoint shows an error in the dialog and keeps it open', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const source = new FundingSourcePage(page);
      const nameB = `${testPrefix} F8b Stale To`;
      const fromId = await createSource(page, cleanup, {
        name: `${testPrefix} F8b Stale From`,
        totalAmount: 30000,
      });
      await createSource(page, cleanup, { name: nameB, totalAmount: 20000 });
      await mockSourceLines(page, fromId, {
        tasks: [
          {
            id: `wil-stale-${fromId}`,
            description: 'Stale line',
            plannedAmount: 1500,
            parentId: `wi-stale-${fromId}`,
            parentName: 'Flooring',
            areaName: 'Kitchen',
          },
        ],
      });
      await mockSourceMove(page, fromId, { status: 409, code: 'STALE_OWNERSHIP' });

      await source.goto(fromId, { tab: 'cost' });
      await source.lineCheckbox(fromId, 'Stale line').check();
      await source.openMoveModal(fromId);
      await source.selectMoveTarget(nameB);
      await source.confirmMove();

      await expect(source.moveModalFormError).toBeVisible();
      await expect(source.moveModal).toBeVisible();
      await source.moveModalCancelButton.click();
      await expect(source.moveModal).toBeHidden();
    } finally {
      await runCleanup(cleanup);
    }
  });
});

test.describe('Funding source page: History', () => {
  test('F8: History shows the bank-report batch of the source', async ({ page, testPrefix }) => {
    const cleanup = newCleanup();
    try {
      const source = new FundingSourcePage(page);
      const sourceId = await createSource(page, cleanup, {
        name: `${testPrefix} F8 History Bank`,
        totalAmount: 50000,
      });
      const vendorId = await createVendor(page, cleanup, `${testPrefix} F8 History Co`);
      const invoiceA = await createInvoice(page, cleanup, vendorId, {
        amount: 1000,
        invoiceNumber: `${testPrefix}-HA`,
      });
      const invoiceB = await createInvoice(page, cleanup, vendorId, {
        amount: 500,
        invoiceNumber: `${testPrefix}-HB`,
      });
      const claim = await page.request.post(API.sourceReportsMarkClaimed, {
        data: { sourceId, invoiceIds: [invoiceA.id, invoiceB.id], depositIds: [] },
      });
      expect(claim.ok(), `POST mark-claimed: ${claim.status()}`).toBeTruthy();

      await source.goto(sourceId, { tab: 'history' });
      await expect(source.history).toBeVisible();
      await expect(source.history).toContainText('submitted to the bank');
      // One batch row is the whole history: "Show all in History" appears only when more exist
      await expect(source.historyShowAll).toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });
});

test.describe('Funding source page: details and delete', () => {
  test('F8c: the Details card edits with an explicit Save and the change persists', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const source = new FundingSourcePage(page);
      const sourceId = await createSource(page, cleanup, {
        name: `${testPrefix} F8c Edit`,
        totalAmount: 10000,
        interestRate: 1.5,
      });
      await source.goto(sourceId);

      await source.openDetailsEdit();
      const renamed = `${testPrefix} F8c Renamed`;
      await source.nameInput.fill(renamed);
      await source.amountInput.fill('20000');
      await source.interestInput.fill('2.5');
      await source.referenceInput.fill('REF-F8C');
      // Nothing is saved before Save
      const before = await page.request.get(`${API.budgetSources}/${sourceId}`);
      expect(
        ((await before.json()) as { budgetSource: { name: string } }).budgetSource.name,
      ).not.toBe(renamed);

      await source.detailsSave.click();
      await expect(source.heading).toHaveText(renamed);
      await expect(source.summary.fact('amount')).toContainText(/20,000\.00/);

      await page.reload();
      await expect(source.heading).toHaveText(renamed);
      await expect(page.getByTestId('source-detail-reference')).toHaveText('REF-F8C');
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F8c: Details validates name, amount and interest rate before saving', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const source = new FundingSourcePage(page);
      const sourceId = await createSource(page, cleanup, {
        name: `${testPrefix} F8c Validate`,
        totalAmount: 10000,
      });
      await source.goto(sourceId);

      await source.openDetailsEdit();
      await source.nameInput.fill('   ');
      await source.amountInput.fill('0');
      await source.interestInput.fill('150');
      await source.detailsSave.click();

      await expect(source.detailsCard.getByText('Enter a name.')).toBeVisible();
      await expect(source.detailsCard.getByText('Enter an amount greater than 0.')).toBeVisible();
      await expect(source.detailsCard.getByText('Enter a rate between 0 and 100.')).toBeVisible();
      // Nothing was sent: the stored name is unchanged
      const stored = await page.request.get(`${API.budgetSources}/${sourceId}`);
      expect(
        ((await stored.json()) as { budgetSource: { name: string } }).budgetSource.name,
      ).toContain('F8c Validate');
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F8c: Delete asks to confirm, removes the source and returns to Financing', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    const source = new FundingSourcePage(page);
    const financing = new FinancingPage(page);
    const name = `${testPrefix} F8c Delete`;
    const sourceId = await createSource(page, cleanup, { name, totalAmount: 1000 });
    try {
      await source.goto(sourceId);
      await source.openDelete();
      // Cancel keeps it
      await source.deleteDialog.cancel();
      await expect(source.heading).toHaveText(name);

      await source.openDelete();
      await source.deleteDialog.confirmAndWaitClosed();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('financing'));
      await financing.waitForLoaded();
      await expect(financing.sourceCard(sourceId)).toHaveCount(0);
      await expect(
        page.getByTestId('toast-success').filter({ hasText: `${name} deleted.` }),
      ).toBeVisible();
      const gone = await page.request.get(`${API.budgetSources}/${sourceId}`);
      expect(gone.status()).toBe(404);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F8c: an unknown funding source shows a not-found alert and a way back', async ({
    page,
  }) => {
    await page.goto(routeUrl('fundingSource', { id: 'does-not-exist-f8c' }));
    const source = new FundingSourcePage(page);
    await expect(source.errorCard).toContainText('This funding source could not be found.');
    await page.getByRole('button', { name: /^Back to/ }).click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('financing'));
  });

  test("F8c: the strip's Amount is the money service's Amount", async ({ page, testPrefix }) => {
    const cleanup = newCleanup();
    try {
      const source = new FundingSourcePage(page);
      const sourceId = await createSource(page, cleanup, {
        name: `${testPrefix} F8c Agree`,
        sourceType: 'savings',
        totalAmount: 7777,
      });
      const api = (await readFinancing(page)).sources.find((entry) => entry.id === sourceId)!;
      expect(api.amount).toBe(7777);
      await source.goto(sourceId);
      await expect(source.summary.fact('amount')).toContainText(/7,777\.00/);
    } finally {
      await runCleanup(cleanup);
    }
  });
});
