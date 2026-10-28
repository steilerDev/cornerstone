/**
 * E2E tests for the Tasks list page (/project/work-items): the page basics.
 *
 * The full ObjectList behaviour (groups, filters, row commands, bulk edits) is in
 * `tasks-list.spec.ts`; this file keeps the original scenarios on the new list:
 * 1.  Page loads with h1 "Tasks"
 * 2.  Empty state (mock API) and the filtered empty state
 * 3.  "New task" opens the create dialog over the list
 * 4.  Search filters tasks
 * 5.  A task created via API appears in the list
 * 6.  Delete dialog - confirm removes the task
 * 7.  Delete dialog - cancel leaves the task
 * 8.  No page controls: the list loads by scrolling (pagination is gone)
 * 9.  Responsive - no horizontal scroll; table or card surface by width
 * 10. Dark mode rendering
 * 11. Status chips use the canonical words and a coloured background
 */

import { test, expect } from '../../fixtures/auth.js';
import { WorkItemsPage, WORK_ITEMS_ROUTE } from '../../pages/WorkItemsPage.js';
import { API } from '../../fixtures/testData.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Page loads with h1 "Tasks"
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page load (Scenario 1)', { tag: '@responsive' }, () => {
  test('Tasks list page loads with h1 "Tasks"', { tag: '@smoke' }, async ({ page }) => {
    const workItemsPage = new WorkItemsPage(page);

    await workItemsPage.goto();

    await expect(workItemsPage.heading).toBeVisible();
    await expect(workItemsPage.heading).toHaveText('Tasks');
  });

  test('Page URL is /project/work-items', async ({ page }) => {
    await page.goto(WORK_ITEMS_ROUTE);
    await page.waitForURL('/project/work-items');
    expect(page.url()).toContain('/project/work-items');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Empty state
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state (Scenario 2)', { tag: '@responsive' }, () => {
  test('Empty state shown when no tasks exist (mocked empty response), without a create action', async ({
    page,
  }) => {
    const workItemsPage = new WorkItemsPage(page);

    await page.route(`**${API.workItems}?*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [],
            pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
            groupCounts: { late: 0, this_week: 0, next_two_weeks: 0, later: 0, done: 0 },
            scopeTotal: 0,
          }),
        });
      } else {
        await route.continue();
      }
    });

    await workItemsPage.goto();

    await expect(workItemsPage.emptyState).toBeVisible();
    await expect(workItemsPage.emptyState).toContainText('No tasks yet');
    // The header "New task" is the one create action; the empty state has none
    await expect(workItemsPage.emptyState.getByRole('button')).toHaveCount(0);
    await expect(workItemsPage.newWorkItemButton).toBeVisible();
  });

  test('Filtered empty state shown when search matches nothing', async ({ page, testPrefix }) => {
    const workItemsPage = new WorkItemsPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Filter Empty Test` });

      await workItemsPage.goto();
      await workItemsPage.waitForLoaded();
      await workItemsPage.search('ZZZNOMATCH99999XYZABC');

      await expect(workItemsPage.emptyState).toBeVisible();
      await expect(workItemsPage.emptyState).toContainText('No tasks match.');
      await expect(
        workItemsPage.emptyState.getByRole('button', { name: /Clear Filters/i }),
      ).toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: "New task" opens the create dialog
// ─────────────────────────────────────────────────────────────────────────────
test.describe('"New task" (Scenario 3)', { tag: '@responsive' }, () => {
  test('"New task" opens the create dialog at /project/work-items/new', async ({ page }) => {
    const workItemsPage = new WorkItemsPage(page);

    await workItemsPage.goto();
    await expect(workItemsPage.newWorkItemButton).toBeVisible();
    await expect(workItemsPage.newWorkItemButton).toHaveText('New task');

    await workItemsPage.newWorkItemButton.click();

    await page.waitForURL('**/project/work-items/new');
    expect(page.url()).toContain('/project/work-items/new');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Search
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Search filters (Scenario 4)', { tag: '@responsive' }, () => {
  test('Search by partial title filters list to matching items only', async ({
    page,
    testPrefix,
  }) => {
    const workItemsPage = new WorkItemsPage(page);
    const created: string[] = [];
    const alphaTitle = `${testPrefix} Alpha Work Item`;
    const betaTitle = `${testPrefix} Beta Work Item`;

    try {
      created.push(await createWorkItemViaApi(page, { title: alphaTitle }));
      created.push(await createWorkItemViaApi(page, { title: betaTitle }));

      await workItemsPage.goto();
      await workItemsPage.waitForLoaded();
      await workItemsPage.search(`${testPrefix} Alpha`);

      await expect(workItemsPage.titleLinks.filter({ hasText: alphaTitle })).toHaveCount(1);
      await expect(workItemsPage.titleLinks.filter({ hasText: betaTitle })).toHaveCount(0);
    } finally {
      for (const id of created) {
        await deleteWorkItemViaApi(page, id);
      }
    }
  });

  test('Clearing search restores the full list', async ({ page, testPrefix }) => {
    const workItemsPage = new WorkItemsPage(page);
    const created: string[] = [];
    const alphaTitle = `${testPrefix} Clear Search Alpha`;
    const betaTitle = `${testPrefix} Clear Search Beta`;

    try {
      created.push(await createWorkItemViaApi(page, { title: alphaTitle }));
      created.push(await createWorkItemViaApi(page, { title: betaTitle }));

      await workItemsPage.goto();
      await workItemsPage.waitForLoaded();

      await workItemsPage.search(alphaTitle);
      await expect(workItemsPage.titleLinks.filter({ hasText: alphaTitle })).toHaveCount(1);
      await expect(workItemsPage.titleLinks.filter({ hasText: betaTitle })).toHaveCount(0);

      await workItemsPage.clearSearch();
      await workItemsPage.search(testPrefix);
      await expect(workItemsPage.titleLinks.filter({ hasText: alphaTitle })).toHaveCount(1);
      await expect(workItemsPage.titleLinks.filter({ hasText: betaTitle })).toHaveCount(1);
    } finally {
      for (const id of created) {
        await deleteWorkItemViaApi(page, id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: A task created via API appears in the list
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Task appears in list after API creation (Scenario 5)',
  { tag: '@responsive' },
  () => {
    test('Task created via API appears in the list', async ({ page, testPrefix }) => {
      const workItemsPage = new WorkItemsPage(page);
      let createdId: string | null = null;
      const title = `${testPrefix} API Created Item`;

      try {
        createdId = await createWorkItemViaApi(page, { title });

        await workItemsPage.openSearch(title);

        await expect.poll(() => workItemsPage.getWorkItemTitles()).toContain(title);
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('Table shows the Task, Dates, Who, Expected cost, Waits for / Holds up and Status columns on a wide list', async ({
      page,
      testPrefix,
    }) => {
      const workItemsPage = new WorkItemsPage(page);
      let createdId: string | null = null;
      const title = `${testPrefix} Table Info Test`;

      try {
        createdId = await createWorkItemViaApi(page, { title });

        await workItemsPage.openSearch(title);
        test.skip(!(await workItemsPage.isTableSurface()), 'Cards below 768 px of list width');

        for (const name of [
          'Task',
          'Dates',
          'Who',
          'Expected cost',
          'Waits for / Holds up',
          'Status',
        ]) {
          await expect(workItemsPage.columnHeader(name)).toBeVisible();
        }
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Delete dialog - confirm removes the task
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete dialog - confirm (Scenario 6)', { tag: '@responsive' }, () => {
  test('Confirming delete removes the task from the list', async ({ page, testPrefix }) => {
    const workItemsPage = new WorkItemsPage(page);
    const title = `${testPrefix} Delete Confirm Item`;

    await createWorkItemViaApi(page, { title });

    await workItemsPage.openSearch(title);
    await expect.poll(() => workItemsPage.getWorkItemTitles()).toContain(title);

    await workItemsPage.openDeleteModal(title);
    await expect(workItemsPage.deleteModal).toBeVisible();
    await expect(workItemsPage.deleteModal).toContainText(title);

    await workItemsPage.confirmDelete();

    // The task is gone from the list (no reload needed)
    await expect.poll(() => workItemsPage.getWorkItemTitles()).not.toContain(title);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Delete dialog - cancel leaves the task
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete dialog - cancel (Scenario 7)', { tag: '@responsive' }, () => {
  test('Cancelling the delete dialog leaves the task in the list', async ({ page, testPrefix }) => {
    const workItemsPage = new WorkItemsPage(page);
    let createdId: string | null = null;
    const title = `${testPrefix} Cancel Delete Item`;

    try {
      createdId = await createWorkItemViaApi(page, { title });

      await workItemsPage.openSearch(title);
      await workItemsPage.openDeleteModal(title);
      await workItemsPage.cancelDelete();

      await expect.poll(() => workItemsPage.getWorkItemTitles()).toContain(title);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: No pagination controls
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Loading by scrolling (Scenario 8)', { tag: '@responsive' }, () => {
  test('A single batch shows no page controls', async ({ page, testPrefix }) => {
    const workItemsPage = new WorkItemsPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Single Batch` });
      await workItemsPage.openSearch(`${testPrefix} Single Batch`);

      await expect(page.getByLabel('Previous', { exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Next', { exact: true })).toHaveCount(0);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Responsive
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 9)', { tag: '@responsive' }, () => {
  test('Tasks list page renders without horizontal scroll on current viewport', async ({
    page,
  }) => {
    const workItemsPage = new WorkItemsPage(page);

    await workItemsPage.goto();
    await workItemsPage.waitForLoaded();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('Exactly one surface (table or cards) shows the rows, and phones use cards', async ({
    page,
    testPrefix,
  }) => {
    const workItemsPage = new WorkItemsPage(page);
    let createdId: string | null = null;
    const title = `${testPrefix} Surface Item`;

    try {
      createdId = await createWorkItemViaApi(page, { title });
      await workItemsPage.openSearch(title);

      await expect(workItemsPage.workItemRow(title)).toHaveCount(1);
      const viewport = page.viewportSize();
      if (viewport && viewport.width < 768) {
        expect(await workItemsPage.isTableSurface()).toBe(false);
      }
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Dark mode
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering (Scenario 10)', { tag: '@responsive' }, () => {
  test('Tasks list page renders correctly in dark mode', async ({ page }) => {
    const workItemsPage = new WorkItemsPage(page);

    await page.goto(WORK_ITEMS_ROUTE);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await expect(workItemsPage.heading).toBeVisible();
    await expect(workItemsPage.searchInput).toBeVisible();
    await expect(workItemsPage.filtersButton).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11 (Story #2195, AC2): status chips are coloured and use the canonical words
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Status chip colour and wording (Story #2195, AC2)', { tag: '@responsive' }, () => {
  test('Task status chips read "In progress" / "Done" and have a non-transparent background', async ({
    page,
    testPrefix,
  }) => {
    const workItemsPage = new WorkItemsPage(page);
    const created: string[] = [];

    try {
      const active = await createWorkItemViaApi(page, {
        title: `${testPrefix} Chip Active`,
        status: 'in_progress',
      });
      created.push(active);
      const finished = await createWorkItemViaApi(page, {
        title: `${testPrefix} Chip Finished`,
        status: 'completed',
      });
      created.push(finished);

      await workItemsPage.openSearch(`${testPrefix} Chip`);
      // Done is collapsed while other groups have rows
      await workItemsPage.expandGroup('done');

      for (const [id, label] of [
        [active, 'In progress'],
        [finished, 'Done'],
      ] as const) {
        const chip = workItemsPage.statusBadge(id);
        await expect(chip).toHaveText(label);
        const bg = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(
          bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)',
          `"${label}" chip background "${bg}" must not be transparent`,
        ).toBe(true);
      }
    } finally {
      for (const id of created) await deleteWorkItemViaApi(page, id);
    }
  });
});
