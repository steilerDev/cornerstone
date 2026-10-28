/**
 * E2E tests for the "No area" filter on the Tasks list page (Issue #1277, rebuilt in #2245)
 *
 * The Filters panel's Area picker offers a special "No area" option. Choosing it filters for
 * tasks where areaId IS NULL (`?areaId=__none__`). A legacy CSV value in the URL
 * (`?areaId=__none__,<areaId>`) still returns the union.
 *
 * Scenarios covered:
 * 1.  The Area picker in the Filters panel offers "No area"
 * 2.  ?areaId=__none__ shows only unassigned items
 * 3.  ?areaId=__none__,<areaId> (legacy CSV) shows the union of unassigned + named area items
 * 4.  Empty state when no unassigned items exist and ?areaId=__none__ applied
 * 5.  Choosing "No area" interactively filters to unassigned items
 */

import { test, expect } from '../../fixtures/auth.js';
import { WorkItemsPage, WORK_ITEMS_ROUTE } from '../../pages/WorkItemsPage.js';
import {
  createAreaViaApi,
  deleteAreaViaApi,
  createWorkItemViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: The Area filter offers No area
// ─────────────────────────────────────────────────────────────────────────────
test.describe('The Area filter offers No area (Scenario 1)', { tag: '@responsive' }, () => {
  test('The Area picker in Filters offers a "No area" option', async ({ page }) => {
    const listPage = new WorkItemsPage(page);

    await listPage.goto();
    await listPage.waitForLoaded();
    await listPage.openFilters();

    await listPage.areaFilter.input.click();
    await expect(listPage.areaFilter.optionNamed('No area')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: ?areaId=__none__ shows only unassigned work items
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  '?areaId=__none__ shows only items with no area assignment (Scenario 2)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 90_000 });

    test('Navigating with ?areaId=__none__ shows only unassigned items and URL is preserved', async ({
      page,
      testPrefix,
    }) => {
      const listPage = new WorkItemsPage(page);
      const areaIds: string[] = [];
      const workItemIds: string[] = [];

      const areaName = `${testPrefix} WI NoArea Sc2 Area`;
      const wiInAreaName = `${testPrefix} WI NoArea Sc2 InArea`;
      const wiNoAreaName = `${testPrefix} WI NoArea Sc2 NoArea`;

      try {
        const areaId = await createAreaViaApi(page, { name: areaName });
        areaIds.push(areaId);

        workItemIds.push(await createWorkItemViaApi(page, { title: wiInAreaName, areaId }));
        workItemIds.push(await createWorkItemViaApi(page, { title: wiNoAreaName }));

        await page.goto(`${WORK_ITEMS_ROUTE}?areaId=__none__&q=${encodeURIComponent(testPrefix)}`);
        await listPage.heading.waitFor({ state: 'visible' });
        await listPage.waitForLoaded();

        // URL must preserve the sentinel value
        const url = new URL(page.url());
        expect(url.searchParams.get('areaId')).toBe('__none__');

        // Only the unassigned item must appear
        await expect(async () => {
          const titles = await listPage.getWorkItemTitles();
          expect(titles).toContain(wiNoAreaName);
          expect(titles).not.toContain(wiInAreaName);
        }).toPass({ timeout: 30_000 });
      } finally {
        for (const id of workItemIds) {
          await deleteWorkItemViaApi(page, id);
        }
        for (const id of areaIds) {
          await deleteAreaViaApi(page, id);
        }
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: ?areaId=__none__,<areaId> shows union of unassigned + area items
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  '?areaId=__none__,<areaId> shows union of unassigned and named-area items (Scenario 3)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 90_000 });

    test('CSV sentinel+area filter shows unassigned and Alpha items; Beta item excluded', async ({
      page,
      testPrefix,
    }) => {
      const listPage = new WorkItemsPage(page);
      const areaIds: string[] = [];
      const workItemIds: string[] = [];

      const areaAlphaName = `${testPrefix} WI NoArea Sc3 Alpha`;
      const areaBetaName = `${testPrefix} WI NoArea Sc3 Beta`;
      const wiAlphaName = `${testPrefix} WI NoArea Sc3 WiAlpha`;
      const wiUnassignedName = `${testPrefix} WI NoArea Sc3 WiNone`;
      const wiBetaName = `${testPrefix} WI NoArea Sc3 WiBeta`;

      try {
        const areaAlphaId = await createAreaViaApi(page, { name: areaAlphaName });
        areaIds.push(areaAlphaId);
        const areaBetaId = await createAreaViaApi(page, { name: areaBetaName });
        areaIds.push(areaBetaId);

        workItemIds.push(
          await createWorkItemViaApi(page, { title: wiAlphaName, areaId: areaAlphaId }),
        );
        workItemIds.push(await createWorkItemViaApi(page, { title: wiUnassignedName }));
        workItemIds.push(
          await createWorkItemViaApi(page, { title: wiBetaName, areaId: areaBetaId }),
        );

        const csvFilter = `__none__,${areaAlphaId}`;
        await page.goto(
          `${WORK_ITEMS_ROUTE}?areaId=${encodeURIComponent(csvFilter)}&q=${encodeURIComponent(testPrefix)}`,
        );
        await listPage.heading.waitFor({ state: 'visible' });
        await listPage.waitForLoaded();

        // URL must contain the CSV filter value
        const url = new URL(page.url());
        expect(url.searchParams.get('areaId')).toBe(csvFilter);

        // Alpha and unassigned items visible; Beta item excluded
        await expect(async () => {
          const titles = await listPage.getWorkItemTitles();
          expect(titles).toContain(wiAlphaName);
          expect(titles).toContain(wiUnassignedName);
          expect(titles).not.toContain(wiBetaName);
        }).toPass({ timeout: 30_000 });
      } finally {
        for (const id of workItemIds) {
          await deleteWorkItemViaApi(page, id);
        }
        for (const id of [...areaIds].reverse()) {
          await deleteAreaViaApi(page, id);
        }
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Empty state when no unassigned items and ?areaId=__none__ applied
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  '?areaId=__none__ shows filtered empty state when no unassigned items exist (Scenario 4)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 90_000 });

    test('Empty state with Clear Filters button when all items are area-assigned', async ({
      page,
      testPrefix,
    }) => {
      const listPage = new WorkItemsPage(page);
      const areaIds: string[] = [];
      const workItemIds: string[] = [];

      const areaName = `${testPrefix} WI NoArea Sc4 Area`;
      const wiAssignedName = `${testPrefix} WI NoArea Sc4 Assigned`;

      try {
        const areaId = await createAreaViaApi(page, { name: areaName });
        areaIds.push(areaId);
        workItemIds.push(await createWorkItemViaApi(page, { title: wiAssignedName, areaId }));

        // Combine areaId=__none__ with a search scoped to this worker's testPrefix so that
        // unassigned items created by other parallel workers do not appear in the result set.
        // This worker's only item (wiAssignedName) has an areaId, so the intersection must
        // always be empty regardless of how many other workers are running concurrently.
        await page.goto(`${WORK_ITEMS_ROUTE}?areaId=__none__&q=${encodeURIComponent(testPrefix)}`);
        await listPage.heading.waitFor({ state: 'visible' });

        // Wait for the filter empty state
        await expect(async () => {
          await expect(listPage.emptyState).toBeVisible();
        }).toPass({ timeout: 30_000 });

        // Empty state message must indicate filtered no-results
        await expect(listPage.emptyState).toContainText('No tasks match.');

        // "Clear Filters" button must be visible — hasActiveFilters is true because BOTH
        // the search query and the area filter are active.
        const clearButton = listPage.emptyState.getByRole('button', {
          name: /Clear Filters/i,
        });
        await expect(clearButton).toBeVisible();
      } finally {
        for (const id of workItemIds) {
          await deleteWorkItemViaApi(page, id);
        }
        for (const id of areaIds) {
          await deleteAreaViaApi(page, id);
        }
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Choosing No area interactively filters to unassigned items
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Choosing No area interactively filters to unassigned items (Scenario 5)', () => {
  test.describe.configure({ timeout: 90_000 });

  test('Choosing No area adds areaId=__none__ to the URL and filters the list', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new WorkItemsPage(page);
    const areaIds: string[] = [];
    const workItemIds: string[] = [];

    const areaName = `${testPrefix} WI NoArea Sc5 Area`;
    const wiInAreaName = `${testPrefix} WI NoArea Sc5 InArea`;
    const wiNoAreaName = `${testPrefix} WI NoArea Sc5 NoArea`;

    try {
      const areaId = await createAreaViaApi(page, { name: areaName });
      areaIds.push(areaId);
      workItemIds.push(await createWorkItemViaApi(page, { title: wiInAreaName, areaId }));
      workItemIds.push(await createWorkItemViaApi(page, { title: wiNoAreaName }));

      await listPage.openSearch(testPrefix);

      // Choose "No area" in Filters > Area
      const responsePromise = page.waitForResponse((resp) => {
        if (!resp.url().includes('/api/work-items') || resp.status() !== 200) return false;
        try {
          return new URL(resp.url()).searchParams.get('areaId') === '__none__';
        } catch {
          return false;
        }
      });
      await listPage.pickAreaFilter('No area');
      await responsePromise;

      await page.waitForURL((url) => url.searchParams.get('areaId') === '__none__');

      // Only the unassigned item must be visible
      await expect(async () => {
        const titles = await listPage.getWorkItemTitles();
        expect(titles).toContain(wiNoAreaName);
        expect(titles).not.toContain(wiInAreaName);
      }).toPass({ timeout: 30_000 });
    } finally {
      for (const id of workItemIds) {
        await deleteWorkItemViaApi(page, id);
      }
      for (const id of areaIds) {
        await deleteAreaViaApi(page, id);
      }
    }
  });
});
