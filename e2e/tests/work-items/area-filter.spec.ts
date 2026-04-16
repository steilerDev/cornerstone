/**
 * E2E tests for the Work Items area filter (Issue #1241)
 *
 * The Work Items list page supports filtering by area via the ?areaId=<csv> URL parameter.
 * The DataTable EnumFilter serialises selections as CSV; the server now correctly expands
 * descendant areas from CSV input (previously a single-ID mismatch caused zero results when
 * a parent area was selected).
 *
 * Scenarios covered:
 * 1.  Selecting a parent area shows descendant work items (hierarchy expansion)
 * 2.  Multi-area CSV filter shows the union of items from both areas
 * 3.  Unknown areaId shows the filter empty state with "Clear Filters" button
 * 4.  No area filter: baseline sanity — unfiltered page shows items with no area
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
// Scenario 1: Selecting a parent area shows descendant work items
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Parent area selection includes descendant work items (Scenario 1)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 90_000 });

    test('Navigating with ?areaId=<parent> shows items in parent and child areas', async ({
      page,
      testPrefix,
    }) => {
      const listPage = new WorkItemsPage(page);
      const areaIds: string[] = [];
      const workItemIds: string[] = [];

      const parentAreaName = `${testPrefix} WI Parent Area`;
      const childAreaName = `${testPrefix} WI Child Area`;
      const wiParentName = `${testPrefix} Wi-Parent`;
      const wiChildName = `${testPrefix} Wi-Child`;
      const wiOtherName = `${testPrefix} Wi-Other`;

      try {
        // Create parent area (root), then child area under it
        const parentAreaId = await createAreaViaApi(page, { name: parentAreaName });
        areaIds.push(parentAreaId);
        const childAreaId = await createAreaViaApi(page, {
          name: childAreaName,
          parentId: parentAreaId,
        });
        areaIds.push(childAreaId);

        // Create work items: one per area + one with no area
        workItemIds.push(
          await createWorkItemViaApi(page, {
            title: wiParentName,
            areaId: parentAreaId,
          }),
        );
        workItemIds.push(
          await createWorkItemViaApi(page, {
            title: wiChildName,
            areaId: childAreaId,
          }),
        );
        workItemIds.push(
          await createWorkItemViaApi(page, {
            title: wiOtherName,
          }),
        );

        // Navigate with the parent area filter in the URL.
        // The server must expand to include the child area's items.
        await page.goto(`${WORK_ITEMS_ROUTE}?areaId=${encodeURIComponent(parentAreaId)}`);
        await listPage.heading.waitFor({ state: 'visible' });
        await listPage.waitForLoaded();

        // URL must preserve areaId= pointing to the parent area
        const url = new URL(page.url());
        expect(url.searchParams.get('areaId')).toBe(parentAreaId);

        // Both the parent-area item and the child-area item must be visible
        await expect(async () => {
          const titles = await listPage.getWorkItemTitles();
          expect(titles).toContain(wiParentName);
          expect(titles).toContain(wiChildName);
          expect(titles).not.toContain(wiOtherName);
        }).toPass({ timeout: 30_000 });

        // Area filter button is visible on tablet and desktop (CSS-hidden on mobile < 768px)
        const viewport = page.viewportSize();
        if (viewport && viewport.width >= 768) {
          await expect(listPage.areaFilter).toBeVisible();
        }
      } finally {
        for (const id of workItemIds) {
          await deleteWorkItemViaApi(page, id);
        }
        // Delete children before parents (foreign key constraint)
        for (const id of [...areaIds].reverse()) {
          await deleteAreaViaApi(page, id);
        }
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Multi-area CSV filter shows the union of items from both areas
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Multi-area CSV filter shows union of matching work items (Scenario 2)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 90_000 });

    test('Navigating with ?areaId=<alpha>,<beta> shows items from both areas', async ({
      page,
      testPrefix,
    }) => {
      const listPage = new WorkItemsPage(page);
      const areaIds: string[] = [];
      const workItemIds: string[] = [];

      const areaAlphaName = `${testPrefix} WI Area Alpha`;
      const areaBetaName = `${testPrefix} WI Area Beta`;
      const wiAlphaName = `${testPrefix} Wi-Alpha`;
      const wiBetaName = `${testPrefix} Wi-Beta`;
      const wiNoneName = `${testPrefix} Wi-None`;

      try {
        // Create two sibling root areas
        const areaAlphaId = await createAreaViaApi(page, { name: areaAlphaName });
        areaIds.push(areaAlphaId);
        const areaBetaId = await createAreaViaApi(page, { name: areaBetaName });
        areaIds.push(areaBetaId);

        // Create one work item per area, plus one with no area
        workItemIds.push(
          await createWorkItemViaApi(page, { title: wiAlphaName, areaId: areaAlphaId }),
        );
        workItemIds.push(
          await createWorkItemViaApi(page, { title: wiBetaName, areaId: areaBetaId }),
        );
        workItemIds.push(await createWorkItemViaApi(page, { title: wiNoneName }));

        // Navigate with a CSV areaId — the server must union both area result sets
        const csvAreaId = `${areaAlphaId},${areaBetaId}`;
        await page.goto(`${WORK_ITEMS_ROUTE}?areaId=${encodeURIComponent(csvAreaId)}`);
        await listPage.heading.waitFor({ state: 'visible' });
        await listPage.waitForLoaded();

        // URL must contain the CSV areaId
        const url = new URL(page.url());
        expect(url.searchParams.get('areaId')).toBe(csvAreaId);

        // Items from both areas must appear; item with no area must not
        await expect(async () => {
          const titles = await listPage.getWorkItemTitles();
          expect(titles).toContain(wiAlphaName);
          expect(titles).toContain(wiBetaName);
          expect(titles).not.toContain(wiNoneName);
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
// Scenario 3: Unknown areaId shows filter empty state
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Unknown areaId shows filter empty state with Clear Filters button (Scenario 3)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 90_000 });

    test('?areaId=non-existent-uuid shows filter empty state and Clear Filters button', async ({
      page,
    }) => {
      const listPage = new WorkItemsPage(page);

      // Use a well-formed but non-existent UUID as the area filter value
      await page.goto(`${WORK_ITEMS_ROUTE}?areaId=non-existent-area-uuid`);
      await listPage.heading.waitFor({ state: 'visible' });

      // Wait for the filter empty state to appear
      await expect(async () => {
        await expect(listPage.emptyState).toBeVisible();
      }).toPass({ timeout: 30_000 });

      // The filtered empty state message must match DataTable's filteredMessage key
      const emptyText = await listPage.emptyState.textContent();
      expect(emptyText?.toLowerCase()).toMatch(/no items match the current filters/);

      // DataTable renders a "Clear Filters" button inside the empty state when filters are active.
      // Use .first() — it may also appear in the toolbar simultaneously.
      const clearButton = listPage.emptyState.getByRole('button', {
        name: /Clear Filters/i,
      });
      await expect(clearButton).toBeVisible();
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: No area filter — baseline sanity
// ─────────────────────────────────────────────────────────────────────────────
test.describe('No area filter — work items with no area are visible (Scenario 4)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 90_000 });

  test('Work item with no area appears when no area filter is applied', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new WorkItemsPage(page);
    const workItemIds: string[] = [];

    const wiName = `${testPrefix} Wi-Unfiltered-No-Area`;

    try {
      workItemIds.push(await createWorkItemViaApi(page, { title: wiName }));

      // Navigate without any areaId param — all items should be visible
      await listPage.goto();
      await listPage.waitForLoaded();

      // areaId must not appear in the URL (no filter applied)
      const url = new URL(page.url());
      expect(url.searchParams.has('areaId')).toBe(false);

      // The item with no area must appear in the list
      await expect(async () => {
        const titles = await listPage.getWorkItemTitles();
        expect(titles).toContain(wiName);
      }).toPass({ timeout: 30_000 });
    } finally {
      for (const id of workItemIds) {
        await deleteWorkItemViaApi(page, id);
      }
    }
  });
});
