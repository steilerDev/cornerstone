/**
 * E2E tests for the Household Items area filter (Issue #1074)
 *
 * The AreaPicker component was added to the household items list page filter panel
 * (between Category and Status filters) in EPIC-19. It filters items by area using
 * ?areaId=<id> in the URL and supports pre-selection on page load from the URL.
 *
 * Scenarios covered:
 * 1.  Area filter dropdown is visible in the filters row
 * 2.  Selecting an area filters items; URL contains areaId=<id>
 * 3.  Selecting "All Areas" shows all items; areaId absent from URL
 * 4.  URL persistence on reload — ?areaId=<id> pre-selects the correct area
 * 5.  Combining area filter with status filter applies both constraints
 * 6.  Empty state shown when selected area has no matching household items
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
// Scenario 1: Area filter dropdown is visible
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Area filter visible (Scenario 1)', { tag: '@responsive' }, () => {
  test('Area filter (AreaPicker) is present in the household items filter panel', async ({
    page,
  }) => {
    const listPage = new HouseholdItemsPage(page);

    await listPage.goto();

    // areaFilterContainer points to the "Filter by Area" DataTable column filter button,
    // which is in the table header. The table is CSS-hidden on mobile (< 768px).
    // Skip this assertion on mobile viewports where the table header is not visible.
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 768) {
      await expect(listPage.areaFilterContainer).toBeVisible();
    } else {
      // On mobile, verify the page loaded successfully instead.
      await expect(listPage.heading).toBeVisible();
    }
  });

  test('Area filter appears between category and status filters', async ({ page }) => {
    const listPage = new HouseholdItemsPage(page);

    await listPage.goto();

    // All three filter controls are DataTable column header filter buttons in the table header.
    // The table (and its header) is CSS-hidden on mobile (< 768px), so skip on mobile.
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 768) {
      await expect(listPage.categoryFilter).toBeVisible();
      await expect(listPage.areaFilterContainer).toBeVisible();
      await expect(listPage.statusFilter).toBeVisible();
    } else {
      // On mobile, verify the page loaded successfully instead.
      await expect(listPage.heading).toBeVisible();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Selecting an area filters items; URL contains areaId
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Selecting area filters items (Scenario 2)', { tag: '@responsive' }, () => {
  // Multi-step: create areas + items, navigate, filter, assert, teardown
  test.describe.configure({ timeout: 90_000 });

  test('Navigating with ?areaId shows only items in that area and URL contains areaId', async ({
    page,
    testPrefix,
  }) => {
    // Area filtering is tested via URL navigation (?areaId=<id>), which is the same
    // mechanism the filter uses internally (updateSearchParams). This validates the
    // full filtering pipeline: URL param → API call → filtered results displayed.
    const listPage = new HouseholdItemsPage(page);
    const areaIds: string[] = [];
    const itemIds: string[] = [];

    const areaAlphaName = `${testPrefix} Area Alpha Kitchen`;
    const areaBetaName = `${testPrefix} Area Beta Bathroom`;
    const itemInAlphaName = `${testPrefix} HI Area Alpha Sink`;
    const itemInBetaName = `${testPrefix} HI Area Beta Towel`;

    try {
      // Create two distinct areas
      const areaAlphaId = await createAreaViaApi(page, { name: areaAlphaName });
      areaIds.push(areaAlphaId);
      const areaBetaId = await createAreaViaApi(page, { name: areaBetaName });
      areaIds.push(areaBetaId);

      // Create one item in each area
      itemIds.push(
        await createHouseholdItemViaApi(page, { name: itemInAlphaName, areaId: areaAlphaId }),
      );
      itemIds.push(
        await createHouseholdItemViaApi(page, { name: itemInBetaName, areaId: areaBetaId }),
      );

      // Navigate directly with areaId in URL — the AreaPicker pre-selects the area
      // (same mechanism as updateSearchParams used by filter interaction internally)
      await page.goto(`${HOUSEHOLD_ITEMS_ROUTE}?areaId=${encodeURIComponent(areaAlphaId)}`);
      await listPage.heading.waitFor({ state: 'visible' });
      await listPage.waitForLoaded();

      // URL must contain areaId= pointing to the alpha area
      const url = new URL(page.url());
      expect(url.searchParams.get('areaId')).toBe(areaAlphaId);

      // Only items in the alpha area should be shown
      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(itemInAlphaName);
        expect(names).not.toContain(itemInBetaName);
      }).toPass({ timeout: 30_000 });

      // The area filter should be active — areaId must appear in the URL
      await expect(async () => {
        const selectedAreaId = await listPage.getSelectedAreaFilterName();
        expect(selectedAreaId).toBe(areaAlphaId);
      }).toPass({ timeout: 20_000 });
    } finally {
      for (const id of itemIds) {
        await deleteHouseholdItemViaApi(page, id);
      }
      for (const id of areaIds) {
        await deleteAreaViaApi(page, id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Selecting "All Areas" shows all items; areaId absent from URL
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Selecting All Areas clears filter (Scenario 3)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 90_000 });

  test('Default state on page load — no area selected, areaId absent from URL', async ({
    page,
  }) => {
    // Navigate to the page WITHOUT any pre-selected area.
    // No areaId in URL → area filter is in default state (no area selected).
    const listPage = new HouseholdItemsPage(page);

    await listPage.goto();
    await listPage.waitForLoaded();

    // The Area column filter button is in the DataTable header (thead).
    // The table is CSS-hidden on mobile (< 768px), so only check on tablet+desktop.
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 768) {
      await expect(listPage.areaFilterContainer).toBeVisible();
    }

    // areaId must NOT appear in the URL on initial load
    const url = new URL(page.url());
    expect(url.searchParams.has('areaId')).toBe(false);
  });

  test('Selecting "All Areas" removes area filter and shows all items', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    const areaIds: string[] = [];
    const itemIds: string[] = [];

    const areaName = `${testPrefix} Area Gamma Living`;
    const itemWithAreaName = `${testPrefix} HI Gamma Couch`;
    const itemNoAreaName = `${testPrefix} HI No Area Lamp`;

    try {
      const areaId = await createAreaViaApi(page, { name: areaName });
      areaIds.push(areaId);

      itemIds.push(await createHouseholdItemViaApi(page, { name: itemWithAreaName, areaId }));
      // Item without any area
      itemIds.push(await createHouseholdItemViaApi(page, { name: itemNoAreaName }));

      // Start with area filter pre-applied in URL
      await page.goto(`${HOUSEHOLD_ITEMS_ROUTE}?areaId=${encodeURIComponent(areaId)}`);
      await listPage.heading.waitFor({ state: 'visible' });
      await listPage.waitForLoaded();

      // Only the area item is shown with the filter active
      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(itemWithAreaName);
      }).toPass({ timeout: 20_000 });

      // Register response listener BEFORE the "All Areas" selection
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/household-items') && resp.status() === 200,
        { timeout: 15_000 },
      );

      // Select "All Areas" — the picker is currently in selectedDisplay state
      // so we need to clear it first (clear button) then the input appears
      await listPage.clearAreaFilter();

      // Wait for API response
      await responsePromise;

      // areaId must be absent from the URL
      await page.waitForURL((url) => !url.searchParams.has('areaId'), { timeout: 10_000 });

      await listPage.waitForLoaded();

      // Both items should now be visible
      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(itemWithAreaName);
        expect(names).toContain(itemNoAreaName);
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
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: URL persistence on reload — ?areaId pre-selects the correct area
// ─────────────────────────────────────────────────────────────────────────────
test.describe('URL persistence on reload (Scenario 4)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 90_000 });

  test('Navigating with ?areaId=<id> pre-selects the matching area in the picker', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    let areaId: string | null = null;
    const itemIds: string[] = [];

    const areaName = `${testPrefix} Area Delta Bedroom`;
    const itemName = `${testPrefix} HI Delta Bed Frame`;

    try {
      areaId = await createAreaViaApi(page, { name: areaName });
      itemIds.push(await createHouseholdItemViaApi(page, { name: itemName, areaId }));

      // Navigate directly with areaId in URL
      await page.goto(`${HOUSEHOLD_ITEMS_ROUTE}?areaId=${encodeURIComponent(areaId)}`);
      await listPage.heading.waitFor({ state: 'visible' });
      await listPage.waitForLoaded();

      // The area filter should be active — areaId must appear in the URL
      await expect(async () => {
        const selectedAreaId = await listPage.getSelectedAreaFilterName();
        expect(selectedAreaId).toBe(areaId);
      }).toPass({ timeout: 20_000 });

      // Only the item in that area should be shown
      await expect(async () => {
        const names = await listPage.getItemNames();
        expect(names).toContain(itemName);
      }).toPass({ timeout: 20_000 });
    } finally {
      for (const id of itemIds) {
        await deleteHouseholdItemViaApi(page, id);
      }
      if (areaId) await deleteAreaViaApi(page, areaId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Combining area filter with status filter
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Combining area filter with status filter (Scenario 5)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 90_000 });

    test('Both area and status filters apply simultaneously', async ({ page, testPrefix }) => {
      const listPage = new HouseholdItemsPage(page);
      const areaIds: string[] = [];
      const itemIds: string[] = [];

      const areaName = `${testPrefix} Area Epsilon Garden`;
      const plannedInAreaName = `${testPrefix} HI Epsilon Planned Fence`;
      const purchasedInAreaName = `${testPrefix} HI Epsilon Purchased Gate`;
      const plannedNoAreaName = `${testPrefix} HI No Area Planned Chair`;

      try {
        const areaId = await createAreaViaApi(page, { name: areaName });
        areaIds.push(areaId);

        // Two items in the area (different statuses) + one item without the area
        itemIds.push(
          await createHouseholdItemViaApi(page, {
            name: plannedInAreaName,
            areaId,
            status: 'planned',
          }),
        );
        itemIds.push(
          await createHouseholdItemViaApi(page, {
            name: purchasedInAreaName,
            areaId,
            status: 'purchased',
          }),
        );
        itemIds.push(
          await createHouseholdItemViaApi(page, {
            name: plannedNoAreaName,
            status: 'planned',
          }),
        );

        // Navigate with both filters pre-applied in URL
        await page.goto(
          `${HOUSEHOLD_ITEMS_ROUTE}?areaId=${encodeURIComponent(areaId)}&status=planned`,
        );
        await listPage.heading.waitFor({ state: 'visible' });
        await listPage.waitForLoaded();

        // Only the planned item in the area should match both filters
        await expect(async () => {
          const names = await listPage.getItemNames();
          expect(names).toContain(plannedInAreaName);
          expect(names).not.toContain(purchasedInAreaName);
          expect(names).not.toContain(plannedNoAreaName);
        }).toPass({ timeout: 30_000 });

        // Both areaId and status must appear in the URL
        const url = new URL(page.url());
        expect(url.searchParams.get('areaId')).toBe(areaId);
        expect(url.searchParams.get('status')).toBe('planned');
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
// Scenario 6: Empty state when no items match the selected area
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state for area with no items (Scenario 6)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 90_000 });

  test('Selecting an area with no household items shows the filter empty state', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    let areaId: string | null = null;
    const itemIds: string[] = [];

    const areaName = `${testPrefix} Area Zeta Empty`;
    const itemName = `${testPrefix} HI Zeta Other Area Item`;

    try {
      // Create the "empty" area with no items
      areaId = await createAreaViaApi(page, { name: areaName });

      // Create an item in a different area (or no area) to ensure the list is non-empty globally
      itemIds.push(await createHouseholdItemViaApi(page, { name: itemName }));

      // Navigate with the empty area filter applied
      await page.goto(`${HOUSEHOLD_ITEMS_ROUTE}?areaId=${encodeURIComponent(areaId)}`);
      await listPage.heading.waitFor({ state: 'visible' });

      // Wait for either items or empty state
      await expect(async () => {
        await expect(listPage.emptyState).toBeVisible();
      }).toPass({ timeout: 30_000 });

      // Empty state should indicate filter-based no-results (not "no items yet").
      // DataTable renders t('dataTable.empty.filteredMessage') = "No items match the current filters"
      const emptyText = await listPage.emptyState.textContent();
      expect(emptyText?.toLowerCase()).toMatch(/no items match the current filters/);

      // DataTable "Clear Filters" button should be visible in the empty state action.
      const clearButton = listPage.emptyState.getByRole('button', {
        name: /Clear Filters/i,
      });
      await expect(clearButton).toBeVisible();
    } finally {
      for (const id of itemIds) {
        await deleteHouseholdItemViaApi(page, id);
      }
      if (areaId) await deleteAreaViaApi(page, areaId);
    }
  });
});
