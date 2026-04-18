/**
 * E2E tests for the "No Area" sentinel filter on the Household Items list page (Issue #1277)
 *
 * The area filter popover now has a "No Area" sentinel checkbox (`id="enum-__none__"`)
 * pinned above the scrollable option list. Selecting it filters for items where
 * areaId IS NULL (`?areaId=__none__`). The sentinel is combinable with named areas via
 * CSV: `?areaId=__none__,<parentId>` returns the union.
 *
 * NOTE: The Household Items Area column has defaultVisible: true — the "Filter by Area"
 * button is always present in the table header on desktop/tablet. Interactive scenarios
 * (1) can open the popover directly without enabling the column first.
 * URL-based scenarios (2, 3, 4) bypass the UI entirely and navigate directly.
 *
 * Scenarios covered:
 * 1.  Sentinel renders at top of popover (desktop/tablet; mobile skip)
 * 2.  ?areaId=__none__ shows only unassigned items
 * 3.  ?areaId=__none__,<areaId> shows union of unassigned + named area items
 * 4.  Empty state when no unassigned items exist and ?areaId=__none__ applied
 */

import { test, expect } from '../../fixtures/auth.js';
import { HouseholdItemsPage, HOUSEHOLD_ITEMS_ROUTE } from '../../pages/HouseholdItemsPage.js';
import {
  createAreaViaApi,
  deleteAreaViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
} from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Sentinel renders at top of area filter popover
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'No Area sentinel renders at top of area filter popover (Scenario 1)',
  { tag: '@responsive' },
  () => {
    test('Area filter popover contains #enum-__none__ sentinel checkbox', async ({ page }) => {
      const listPage = new HouseholdItemsPage(page);

      const viewport = page.viewportSize();
      // On mobile the table header (and filter button) is CSS-hidden — skip interactive check
      if (viewport && viewport.width < 768) {
        await listPage.goto();
        await expect(listPage.heading).toBeVisible();
        return;
      }

      await listPage.goto();

      // Area column has defaultVisible: true on Household Items — filter button is present
      await listPage.openAreaFilter();

      // Sentinel checkbox must be visible inside the popover
      await expect(listPage.noneAreaSentinelCheckbox).toBeVisible();

      // Verify sentinel renders above the scrollable group — check its label text
      const sentinelLabel = listPage.noneAreaSentinelCheckbox
        .locator('..')
        .locator('[class*="filterCheckboxLabelNone"], [class*="filterCheckboxLabel"]');
      const labelText = await sentinelLabel.first().textContent();
      expect(labelText?.trim()).toBe('No Area');
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: ?areaId=__none__ shows only unassigned household items
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  '?areaId=__none__ shows only household items with no area assignment (Scenario 2)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 90_000 });

    test('Navigating with ?areaId=__none__ shows only unassigned items and URL is preserved', async ({
      page,
      testPrefix,
    }) => {
      const listPage = new HouseholdItemsPage(page);
      const areaIds: string[] = [];
      const itemIds: string[] = [];

      const areaName = `${testPrefix} HI NoArea Sc2 Area`;
      const itemInAreaName = `${testPrefix} HI NoArea Sc2 InArea`;
      const itemNoAreaName = `${testPrefix} HI NoArea Sc2 NoArea`;

      try {
        const areaId = await createAreaViaApi(page, { name: areaName });
        areaIds.push(areaId);

        itemIds.push(await createHouseholdItemViaApi(page, { name: itemInAreaName, areaId }));
        itemIds.push(await createHouseholdItemViaApi(page, { name: itemNoAreaName }));

        await page.goto(`${HOUSEHOLD_ITEMS_ROUTE}?areaId=__none__`);
        await listPage.heading.waitFor({ state: 'visible' });
        await listPage.waitForLoaded();

        // URL must preserve the sentinel value
        const url = new URL(page.url());
        expect(url.searchParams.get('areaId')).toBe('__none__');

        // Only the unassigned item must appear
        await expect(async () => {
          const names = await listPage.getItemNames();
          expect(names).toContain(itemNoAreaName);
          expect(names).not.toContain(itemInAreaName);
        }).toPass({ timeout: 30_000 });
      } finally {
        for (const id of itemIds) {
          await deleteHouseholdItemViaApi(page, id);
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
  '?areaId=__none__,<areaId> shows union of unassigned and named-area household items (Scenario 3)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 90_000 });

    test('CSV sentinel+area filter shows unassigned and Alpha items; Beta item excluded', async ({
      page,
      testPrefix,
    }) => {
      const listPage = new HouseholdItemsPage(page);
      const areaIds: string[] = [];
      const itemIds: string[] = [];

      const areaAlphaName = `${testPrefix} HI NoArea Sc3 Alpha`;
      const areaBetaName = `${testPrefix} HI NoArea Sc3 Beta`;
      const itemAlphaName = `${testPrefix} HI NoArea Sc3 InAlpha`;
      const itemUnassignedName = `${testPrefix} HI NoArea Sc3 NoArea`;
      const itemBetaName = `${testPrefix} HI NoArea Sc3 InBeta`;

      try {
        const areaAlphaId = await createAreaViaApi(page, { name: areaAlphaName });
        areaIds.push(areaAlphaId);
        const areaBetaId = await createAreaViaApi(page, { name: areaBetaName });
        areaIds.push(areaBetaId);

        itemIds.push(await createHouseholdItemViaApi(page, { name: itemAlphaName, areaId: areaAlphaId }));
        itemIds.push(await createHouseholdItemViaApi(page, { name: itemUnassignedName }));
        itemIds.push(await createHouseholdItemViaApi(page, { name: itemBetaName, areaId: areaBetaId }));

        const csvFilter = `__none__,${areaAlphaId}`;
        await page.goto(`${HOUSEHOLD_ITEMS_ROUTE}?areaId=${encodeURIComponent(csvFilter)}`);
        await listPage.heading.waitFor({ state: 'visible' });
        await listPage.waitForLoaded();

        // URL must contain the CSV filter value
        const url = new URL(page.url());
        expect(url.searchParams.get('areaId')).toBe(csvFilter);

        // Alpha and unassigned items visible; Beta item excluded
        await expect(async () => {
          const names = await listPage.getItemNames();
          expect(names).toContain(itemAlphaName);
          expect(names).toContain(itemUnassignedName);
          expect(names).not.toContain(itemBetaName);
        }).toPass({ timeout: 30_000 });
      } finally {
        for (const id of itemIds) {
          await deleteHouseholdItemViaApi(page, id);
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
  '?areaId=__none__ shows filtered empty state when no unassigned household items exist (Scenario 4)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 90_000 });

    test('Empty state with Clear Filters button when all items are area-assigned', async ({
      page,
      testPrefix,
    }) => {
      const listPage = new HouseholdItemsPage(page);
      const areaIds: string[] = [];
      const itemIds: string[] = [];

      const areaName = `${testPrefix} HI NoArea Sc4 Area`;
      const itemAssignedName = `${testPrefix} HI NoArea Sc4 Assigned`;

      try {
        const areaId = await createAreaViaApi(page, { name: areaName });
        areaIds.push(areaId);
        itemIds.push(await createHouseholdItemViaApi(page, { name: itemAssignedName, areaId }));

        await page.goto(`${HOUSEHOLD_ITEMS_ROUTE}?areaId=__none__`);
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
        for (const id of itemIds) {
          await deleteHouseholdItemViaApi(page, id);
        }
        for (const id of areaIds) {
          await deleteAreaViaApi(page, id);
        }
      }
    });
  },
);
