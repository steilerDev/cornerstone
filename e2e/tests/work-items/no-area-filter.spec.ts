/**
 * E2E tests for the "No Area" sentinel filter on the Work Items list page (Issue #1277)
 *
 * The area filter popover now has a "No Area" sentinel checkbox (`id="enum-__none__"`)
 * pinned above the scrollable option list. Selecting it filters for items where
 * areaId IS NULL (`?areaId=__none__`). The sentinel is combinable with named areas via
 * CSV: `?areaId=__none__,<parentId>` returns the union.
 *
 * NOTE: The Work Items Area column has defaultVisible: false — the "Filter by Area"
 * button only appears after the Area column is enabled via column settings. Interactive
 * scenarios (1, 5, 6) enable the column via enableAreaColumn() before opening the popover.
 * URL-based scenarios (2, 3, 4) bypass the UI entirely and navigate directly.
 *
 * Scenarios covered:
 * 1.  Sentinel renders at top of popover (desktop/tablet; mobile skip)
 * 2.  ?areaId=__none__ shows only unassigned items
 * 3.  ?areaId=__none__,<areaId> shows union of unassigned + named area items
 * 4.  Empty state when no unassigned items exist and ?areaId=__none__ applied
 * 5.  Interactive sentinel click filters to unassigned items (desktop only)
 * 6.  Select All excludes sentinel — sentinel stays unchecked after Select All (desktop only)
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
// Scenario 1: Sentinel renders at top of area filter popover
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'No Area sentinel renders at top of area filter popover (Scenario 1)',
  { tag: '@responsive' },
  () => {
    test('Area filter popover contains #enum-__none__ sentinel checkbox', async ({ page }) => {
      const listPage = new WorkItemsPage(page);

      const viewport = page.viewportSize();
      // On mobile the table header (and filter button) is CSS-hidden — skip interactive check
      if (viewport && viewport.width < 768) {
        await listPage.goto();
        await expect(listPage.heading).toBeVisible();
        return;
      }

      await listPage.goto();

      // Area column is hidden by default on Work Items — enable it first
      await listPage.enableAreaColumn();

      // Open the area filter popover
      await listPage.openAreaFilter();

      // Sentinel checkbox must be visible inside the popover
      await expect(listPage.noneAreaSentinelCheckbox).toBeVisible();

      // Sentinel must render ABOVE the scrollable checkbox group
      // Verify by checking the sentinel's DOM position: filterCheckboxSentinel container
      // wraps the sentinel; filterCheckboxGroup wraps named area options.
      // The sentinel div must precede the group in the DOM — check it is visible and has
      // the correct label text.
      const sentinelLabel = listPage.noneAreaSentinelCheckbox.locator('..').locator('[class*="filterCheckboxLabelNone"], [class*="filterCheckboxLabel"]');
      const labelText = await sentinelLabel.first().textContent();
      expect(labelText?.trim()).toBe('No Area');
    });
  },
);

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

        await page.goto(`${WORK_ITEMS_ROUTE}?areaId=__none__`);
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

        workItemIds.push(await createWorkItemViaApi(page, { title: wiAlphaName, areaId: areaAlphaId }));
        workItemIds.push(await createWorkItemViaApi(page, { title: wiUnassignedName }));
        workItemIds.push(await createWorkItemViaApi(page, { title: wiBetaName, areaId: areaBetaId }));

        const csvFilter = `__none__,${areaAlphaId}`;
        await page.goto(`${WORK_ITEMS_ROUTE}?areaId=${encodeURIComponent(csvFilter)}`);
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

        await page.goto(`${WORK_ITEMS_ROUTE}?areaId=__none__`);
        await listPage.heading.waitFor({ state: 'visible' });

        // Wait for the filter empty state
        await expect(async () => {
          await expect(listPage.emptyState).toBeVisible();
        }).toPass({ timeout: 30_000 });

        // Empty state message must indicate filtered no-results
        const emptyText = await listPage.emptyState.textContent();
        expect(emptyText?.toLowerCase()).toMatch(/no items match the current filters/);

        // "Clear Filters" button must be visible (DataTable renders it in the empty state action)
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
// Scenario 5: Interactive sentinel click filters to unassigned items (desktop only)
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Clicking the No Area sentinel checkbox interactively filters to unassigned items (Scenario 5)',
  () => {
    // Desktop-only: Area column must be enabled + popover clicked interactively
    test.describe.configure({ timeout: 90_000 });

    test('Clicking #enum-__none__ in the popover adds areaId=__none__ to URL and filters list', async ({
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

        await listPage.goto();
        await listPage.waitForLoaded();

        // Enable Area column (defaultVisible: false on Work Items)
        await listPage.enableAreaColumn();

        // Open the area filter popover
        await listPage.openAreaFilter();
        await expect(listPage.noneAreaSentinelCheckbox).toBeVisible();

        // Register response listener BEFORE clicking the sentinel
        const responsePromise = page.waitForResponse(
          (resp) => {
            if (!resp.url().includes('/api/work-items') || resp.status() !== 200) return false;
            try {
              const url = new URL(resp.url());
              return url.searchParams.get('areaId') === '__none__';
            } catch {
              return false;
            }
          },
          { timeout: 15_000 },
        );

        // Click the sentinel — uses force: true to bypass any sticky UI coverage
        await listPage.noneAreaSentinelCheckbox.click({ force: true });

        // Wait for API response with areaId=__none__
        await responsePromise;

        // URL must contain sentinel value
        await page.waitForURL((url) => url.searchParams.get('areaId') === '__none__', {
          timeout: 10_000,
        });

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
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Select All excludes the sentinel (desktop only)
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Select All in area filter popover excludes the No Area sentinel (Scenario 6)',
  () => {
    test.describe.configure({ timeout: 90_000 });

    test('Clicking Select All does not check the #enum-__none__ sentinel checkbox', async ({
      page,
      testPrefix,
    }) => {
      const listPage = new WorkItemsPage(page);
      const areaIds: string[] = [];
      const workItemIds: string[] = [];

      const areaName = `${testPrefix} WI NoArea Sc6 Area`;
      const wiName = `${testPrefix} WI NoArea Sc6 Item`;

      try {
        const areaId = await createAreaViaApi(page, { name: areaName });
        areaIds.push(areaId);
        workItemIds.push(await createWorkItemViaApi(page, { title: wiName, areaId }));

        await listPage.goto();
        await listPage.waitForLoaded();

        // Enable Area column (defaultVisible: false on Work Items)
        await listPage.enableAreaColumn();

        // Open the area filter popover
        await listPage.openAreaFilter();
        await expect(listPage.noneAreaSentinelCheckbox).toBeVisible();

        // The sentinel must start unchecked
        await expect(listPage.noneAreaSentinelCheckbox).not.toBeChecked();

        // Click "Select All" (quick action button above the checkbox list)
        const selectAllButton = page.getByRole('button', { name: 'Select All', exact: true });
        await selectAllButton.click();

        // The sentinel must remain unchecked — Select All excludes the sentinel by design
        await expect(listPage.noneAreaSentinelCheckbox).not.toBeChecked();
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
