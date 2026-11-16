/**
 * E2E quick-create schemas: tasks, purchases, milestones (Story #2254 / EPIC-21, P5.10a)
 *
 * One schema per object: the New task / New purchase / New milestone dialog and the matching
 * detail-page cards render the same fields (same labels, hints and validation messages).
 *
 * Scenarios:
 * - Q1  AC1    New task: Title, Area, Who, Planned cost, Duration are essential; Status is behind
 *              More details; Planned cost creates the first cost line (Net, no category, no
 *              funding source) and the Who company is saved
 * - Q2  AC1.1  No amount creates no cost line; an amount of 0 creates a zero line
 * - Q3  AC1.2  A failing first cost line keeps the task and shows the dismissible banner (with a
 *              failing dependency too, both messages show)
 * - Q4  AC2    New purchase: Waits for and the delivery window are essential, Ordered on and
 *              Description are behind More details; the chosen task becomes a dependency; a
 *              failing dependency keeps the purchase and shows the error
 * - Q5  AC3    New milestone: Title and Target date, Description behind More details, no colour
 * - Q6  AC4    The detail-page cards use the dialog's labels and validation messages
 * - Q7  AC5.1  The `/…/new` deep links (and the legacy ones) open the dialog over the list
 *
 * Data: synthetic names under the per-worker `testPrefix`, removed through the API.
 */

import type { Page, Route } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createHouseholdItemViaApi,
  createMilestoneViaApi,
  createVendorViaApi,
  createWorkItemViaApi,
  deleteHouseholdItemViaApi,
  deleteMilestoneViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import { HouseholdItemCreatePage } from '../../pages/HouseholdItemCreatePage.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import { MilestoneCreatePage } from '../../pages/MilestoneCreatePage.js';
import { MilestoneDetailPage } from '../../pages/MilestoneDetailPage.js';
import { WorkItemCreatePage } from '../../pages/WorkItemCreatePage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TASK_URL = new RegExp(`/project/work-items/${UUID}$`);
const PURCHASE_URL = new RegExp(`/project/household-items/${UUID}$`);

const COST_LINE_FAILED =
  "Task created, but its planned cost couldn't be saved. Add it on the Cost tab.";

interface BudgetLine {
  description: string;
  plannedAmount: number;
  includesVat: boolean | null;
  budgetCategoryId: string | null;
  budgetSourceId: string | null;
}

async function fetchBudgets(page: Page, taskId: string): Promise<BudgetLine[]> {
  const response = await page.request.get(`${API.workItems}/${taskId}/budgets`);
  expect(response.ok(), `GET budgets: ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { budgets: BudgetLine[] }).budgets;
}

function idFromUrl(page: Page): string {
  return new URL(page.url()).pathname.split('/').pop() ?? '';
}

const created = {
  tasks: [] as string[],
  purchases: [] as string[],
  milestones: [] as number[],
  vendors: [] as string[],
};

test.afterEach(async ({ page }) => {
  for (const id of created.tasks.splice(0)) await deleteWorkItemViaApi(page, id);
  for (const id of created.purchases.splice(0)) await deleteHouseholdItemViaApi(page, id);
  for (const id of created.milestones.splice(0)) await deleteMilestoneViaApi(page, id);
  for (const id of created.vendors.splice(0)) await deleteVendorViaApi(page, id);
});

// ─────────────────────────────────────────────────────────────────────────────
// Q1-Q3: New task
// ─────────────────────────────────────────────────────────────────────────────
test.describe('New task: Planned cost (Q1-Q3, AC1)', { tag: '@responsive' }, () => {
  test('Q1: essentials, Status behind More details; Planned cost creates the first cost line', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} Test plaster wall`;
    const vendorName = `${testPrefix} Plaster Crew`;
    const vendorId = await createVendorViaApi(page, { name: vendorName });
    created.vendors.push(vendorId);
    const create = new WorkItemCreatePage(page);

    await create.goto();
    await expect(create.titleInput).toBeVisible();
    await expect(create.dialog.locator('label[for="area"]')).toHaveText('Area');
    await expect(create.dialog.locator('label[for="assignment"]')).toHaveText('Who');
    await expect(create.dialog.locator('label[for="plannedAmount"]')).toHaveText('Planned cost');
    await expect(create.plannedCostInput).toBeVisible();
    await expect(create.enteredAsNet).toBeChecked();
    await expect(create.dialog.locator('label[for="durationDays"]')).toHaveText('Duration (days)');
    await expect(create.durationInput).toBeVisible();
    await expect(create.statusSelect).toBeHidden();
    await create.expandMoreDetails();
    await expect(create.statusSelect).toBeVisible();

    await create.fillTitle(title);
    await create.assignmentPicker.pick(vendorName);
    await create.plannedCostInput.fill('1500');
    await expect(create.costResult).not.toBeEmpty();
    await create.submit();

    await page.waitForURL(TASK_URL);
    const taskId = idFromUrl(page);
    created.tasks.push(taskId);

    const budgets = await fetchBudgets(page, taskId);
    expect(budgets).toHaveLength(1);
    expect(budgets[0]).toMatchObject({
      description: title,
      plannedAmount: 1500,
      includesVat: false,
      budgetCategoryId: null,
      budgetSourceId: null,
    });
    const task = (await (await page.request.get(`${API.workItems}/${taskId}`)).json()) as {
      assignedVendor: { id: string } | null;
    };
    expect(task.assignedVendor?.id).toBe(vendorId);
  });

  test('Q2: an empty Planned cost creates no cost line; 0 creates a zero line', async ({
    page,
    testPrefix,
  }) => {
    const create = new WorkItemCreatePage(page);

    await create.goto();
    await create.fillTitle(`${testPrefix} Test empty cost`);
    await create.submit();
    await page.waitForURL(TASK_URL);
    const emptyId = idFromUrl(page);
    created.tasks.push(emptyId);
    expect(await fetchBudgets(page, emptyId)).toEqual([]);

    // A second fresh visit: never a same-URL goto
    const second = await page.context().newPage();
    try {
      const createZero = new WorkItemCreatePage(second);
      await createZero.goto();
      await createZero.fillTitle(`${testPrefix} Test zero cost`);
      await createZero.plannedCostInput.fill('0');
      await createZero.submit();
      await second.waitForURL(TASK_URL);
      const zeroId = idFromUrl(second);
      created.tasks.push(zeroId);
      const budgets = await fetchBudgets(second, zeroId);
      expect(budgets).toHaveLength(1);
      expect(budgets[0]?.plannedAmount).toBe(0);
    } finally {
      await second.close();
    }
  });

  test('Q3: a failed first cost line keeps the task and shows a dismissible banner', async ({
    page,
    testPrefix,
  }) => {
    await page.route('**/api/work-items/*/budgets', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
          })
        : route.continue(),
    );
    const create = new WorkItemCreatePage(page);

    await create.goto();
    await create.fillTitle(`${testPrefix} Test cost fails`);
    await create.plannedCostInput.fill('800');
    await create.submit();

    await page.waitForURL(TASK_URL);
    created.tasks.push(idFromUrl(page));
    expect(page.url()).not.toContain('costLineFailed');
    const banner = page.getByText(COST_LINE_FAILED);
    await expect(banner).toBeVisible();
    await page.getByTestId('task-cost-line-error-dismiss').click();
    await expect(banner).toBeHidden();
  });

  test('Q3b: with a failing dependency too, both messages show', async ({ page, testPrefix }) => {
    const predecessorTitle = `${testPrefix} Test predecessor`;
    created.tasks.push(await createWorkItemViaApi(page, { title: predecessorTitle }));
    const fail = (route: Route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
          })
        : route.continue();
    await page.route('**/api/work-items/*/budgets', fail);
    await page.route('**/api/work-items/*/dependencies', fail);
    const create = new WorkItemCreatePage(page);

    await create.goto();
    await create.fillTitle(`${testPrefix} Test both fail`);
    await create.plannedCostInput.fill('800');
    await create.expandMoreDetails();
    await create.waitsForPicker.pick(predecessorTitle);
    await create.submit();

    await page.waitForURL(TASK_URL);
    created.tasks.push(idFromUrl(page));
    await expect(page.getByText(COST_LINE_FAILED)).toBeVisible();
    await expect(
      page.getByText(`Couldn't add these dependencies: ${predecessorTitle}`),
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Q4: New purchase
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'New purchase: Waits for and delivery window (Q4, AC2)',
  { tag: '@responsive' },
  () => {
    test('Q4: Waits for and the delivery window are essential; the chosen task becomes a dependency', async ({
      page,
      testPrefix,
    }) => {
      const taskTitle = `${testPrefix} Test install windows`;
      created.tasks.push(await createWorkItemViaApi(page, { title: taskTitle }));
      const create = new HouseholdItemCreatePage(page);

      await create.goto();
      await expect(create.dialog.locator('label[for="waitsFor"]')).toHaveText('Waits for');
      await expect(create.waitsForPicker.input).toBeVisible();
      await expect(create.earliestDeliveryDateInput).toBeVisible();
      await expect(create.latestDeliveryDateInput).toBeVisible();
      await expect(create.orderDateInput).toBeHidden();
      await expect(create.descriptionInput).toBeHidden();
      await create.expandMoreDetails();
      await expect(create.orderDateInput).toBeVisible();
      await expect(create.descriptionInput).toBeVisible();

      await create.nameInput.fill(`${testPrefix} Test window set`);
      await create.waitsForPicker.pick(taskTitle);
      await create.earliestDeliveryDateInput.fill('2027-05-01');
      await create.latestDeliveryDateInput.fill('2027-06-01');
      await create.submit();

      await page.waitForURL(PURCHASE_URL);
      created.purchases.push(idFromUrl(page));
      const purchase = new HouseholdItemDetailPage(page);
      await purchase.openTab('timing');
      await expect(purchase.waitsFor.rowWith(taskTitle)).toBeVisible();
      await expect(purchase.delivery('earliest')).not.toBeEmpty();
      await expect(purchase.delivery('latest')).not.toBeEmpty();
    });

    test('Q4b: a failed dependency keeps the purchase and shows the error on the Timing tab', async ({
      page,
      testPrefix,
    }) => {
      const taskTitle = `${testPrefix} Test failing link`;
      created.tasks.push(await createWorkItemViaApi(page, { title: taskTitle }));
      await page.route('**/api/household-items/*/dependencies', (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
            })
          : route.continue(),
      );
      const create = new HouseholdItemCreatePage(page);

      await create.goto();
      await create.nameInput.fill(`${testPrefix} Test link fails`);
      await create.waitsForPicker.pick(taskTitle);
      await create.submit();

      await page.waitForURL(PURCHASE_URL);
      created.purchases.push(idFromUrl(page));
      await expect(page.getByText(`Couldn't add these dependencies: ${taskTitle}`)).toBeVisible();
      const purchase = new HouseholdItemDetailPage(page);
      expect(await purchase.getHeadingText()).toContain('Test link fails');
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Q5: New milestone
// ─────────────────────────────────────────────────────────────────────────────
test.describe('New milestone: title and target date (Q5, AC3)', { tag: '@responsive' }, () => {
  test('Q5: Title and Target date are essential; Description is behind More details; no colour', async ({
    page,
    testPrefix,
  }) => {
    const create = new MilestoneCreatePage(page);

    await create.goto();
    await expect(create.titleInput).toBeVisible();
    await expect(create.targetDateInput).toBeVisible();
    await expect(create.descriptionInput).toBeHidden();
    await create.expandMoreDetails();
    await expect(create.descriptionInput).toBeVisible();
    await expect(create.dialog.getByText('Color', { exact: true })).toHaveCount(0);

    await create.fillForm({ title: `${testPrefix} Test roof tight`, targetDate: '2027-09-15' });
    await create.submit();
    await page.waitForURL(new RegExp('/project/milestones/\\d+$'));
    created.milestones.push(Number(idFromUrl(page)));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Test roof tight');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Q6: cards use the dialog's schema
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Detail cards share the dialog schema (Q6, AC4)', { tag: '@responsive' }, () => {
  test('Task: the Details card says "Title is required"; the Dates card labels Duration (days)', async ({
    page,
    testPrefix,
  }) => {
    const id = await createWorkItemViaApi(page, { title: `${testPrefix} Test card task` });
    created.tasks.push(id);
    const task = new WorkItemDetailPage(page);

    await task.goto(id);
    await task.detailsCard.startEdit();
    await task.titleInput.fill('');
    await task.detailsCard.saveButton.click();
    await expect(task.detailsCard.form.getByText('Title is required')).toBeVisible();
    await task.detailsCard.cancelButton.click();
    await expect(task.detailsCard.form).toBeHidden();

    // The dialog's label for the same field
    const create = new WorkItemCreatePage(await page.context().newPage());
    try {
      await create.goto();
      await expect(create.dialog.locator('label[for="durationDays"]')).toHaveText(
        'Duration (days)',
      );
    } finally {
      await create.page.close();
    }
    await task.goto(id, { tab: 'timing' });
    await task.datesCard.startEdit();
    await expect(task.datesCard.form.getByLabel('Duration (days)')).toBeVisible();
  });

  test('Purchase: the Delivery card rejects a latest date before the earliest', async ({
    page,
    testPrefix,
  }) => {
    const id = await createHouseholdItemViaApi(page, { name: `${testPrefix} Test card purchase` });
    created.purchases.push(id);
    const purchase = new HouseholdItemDetailPage(page);

    await purchase.goto(id, { tab: 'timing' });
    await purchase.deliveryCard.startEdit();
    await page.getByTestId('purchase-earliest-input').fill('2027-06-10');
    await page.getByTestId('purchase-latest-input').fill('2027-06-01');
    await purchase.deliveryCard.saveButton.click();
    await expect(
      purchase.deliveryCard.form.getByText("Latest delivery can't be before earliest delivery."),
    ).toBeVisible();
    await expect(purchase.deliveryCard.form).toBeVisible();
  });

  test('Milestone: the Details card says "Target date is required."', async ({
    page,
    testPrefix,
  }) => {
    const id = await createMilestoneViaApi(page, {
      title: `${testPrefix} Test card milestone`,
      targetDate: '2027-09-15',
    });
    created.milestones.push(id);
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id);
    await milestone.detailsCard.startEdit();
    await milestone.targetDateInput.fill('');
    await milestone.detailsCard.saveButton.click();
    await expect(milestone.detailsCard.form.getByText('Target date is required.')).toBeVisible();
    await expect(milestone.detailsCard.form).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Q7: deep links and entry points
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Deep links open the dialog over the list (Q7, AC5.1)',
  { tag: '@responsive' },
  () => {
    const cases = [
      {
        name: 'tasks',
        route: routeUrl('workItemNew'),
        dialog: 'New task',
        list: /^Tasks(\s|$)/,
      },
      {
        name: 'purchases',
        route: routeUrl('householdItemNew'),
        dialog: 'New purchase',
        list: /^Purchases(\s|$)/,
      },
      {
        name: 'milestones',
        route: routeUrl('milestoneNew'),
        dialog: 'New milestone',
        list: /^Milestones(\s|$)/,
      },
    ];

    for (const { name, route, dialog, list } of cases) {
      test(`${route} opens "${dialog}" over the ${name} list`, async ({ page }) => {
        await page.goto(route);
        await expect(page.getByRole('dialog', { name: dialog, exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { level: 1, name: list })).toBeVisible();
        expect(new URL(page.url()).pathname).toBe(route);
      });
    }

    for (const [legacy, dialog] of [
      ['/work-items/new', 'New task'],
      ['/household-items/new', 'New purchase'],
    ] as const) {
      test(`legacy ${legacy} still ends in "${dialog}"`, async ({ page }) => {
        await page.goto(legacy);
        await expect(page.getByRole('dialog', { name: dialog, exact: true })).toBeVisible();
      });
    }
  },
);
