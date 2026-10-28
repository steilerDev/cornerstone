/**
 * E2E tests for the "No Area" sentinel filter on the Household Items list page (Issue #1277)
 *
 * Selecting the "No area" special option filters for items where areaId IS NULL
 * (`?areaId=__none__`).
 *
 * NOTE (#2246): the sentinel is the "No area" special option of the Area EntityPicker in the
 * Filters panel (the DataTable column filter is gone).
 * URL-based scenarios (2, 3, 4) bypass the UI entirely and navigate directly.
 *
 * Scenarios covered:
 * 1.  "No area" special option is offered by the Area picker
 * 2.  ?areaId=__none__ shows only unassigned items
 * 3.  A legacy comma-separated ?areaId=__none__,<areaId> is absorbed (first id shown)
 * 4.  Empty state when none of this test's own items are unassigned and
 *     ?areaId=__none__ applied — see the note on Scenario 4 below for why the
 *     assertion is scoped with `&q=` instead of assuming a suite-global state.
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
  '"No area" option is offered by the Area filter picker (Scenario 1)',
  { tag: '@responsive' },
  () => {
    test('Area filter picker offers a "No area" option', async ({ page }) => {
      const listPage = new HouseholdItemsPage(page);

      await listPage.goto();
      await listPage.waitForLoaded();
      await listPage.openFilters();
      await listPage.areaFilter.input.click();

      // The special option is listed in the open picker
      await expect(listPage.areaFilter.optionNamed('No area')).toBeVisible();
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

        await page.goto(
          `${HOUSEHOLD_ITEMS_ROUTE}?areaId=__none__&q=${encodeURIComponent(`${testPrefix} HI NoArea Sc2`)}`,
        );
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

        itemIds.push(
          await createHouseholdItemViaApi(page, { name: itemAlphaName, areaId: areaAlphaId }),
        );
        itemIds.push(await createHouseholdItemViaApi(page, { name: itemUnassignedName }));
        itemIds.push(
          await createHouseholdItemViaApi(page, { name: itemBetaName, areaId: areaBetaId }),
        );

        const csvFilter = `__none__,${areaAlphaId}`;
        await page.goto(
          `${HOUSEHOLD_ITEMS_ROUTE}?areaId=${encodeURIComponent(csvFilter)}&q=${encodeURIComponent(`${testPrefix} HI NoArea Sc3`)}`,
        );
        await listPage.heading.waitFor({ state: 'visible' });
        await listPage.waitForLoaded();

        // A legacy comma-separated areaId (#2246 D25) is absorbed: the list renders without an
        // error, the picker shows its first id ("No area"), and the item of the other area is
        // excluded. (Whether the unassigned item alone or the old union is listed is not pinned.)
        await expect(async () => {
          const names = await listPage.getItemNames();
          expect(names).toContain(itemUnassignedName);
          expect(names).not.toContain(itemBetaName);
        }).toPass({ timeout: 30_000 });
        await expect(listPage.olist.retryButton).toHaveCount(0);
        await listPage.openFilters();
        await expect(listPage.filtersSelected).toContainText('No area');
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
// Scenario 4: Empty state when none of this test's items are unassigned and
// ?areaId=__none__ applied
//
// This assertion must NOT be phrased as "no unassigned household item exists
// anywhere", which is what it used to do: `?areaId=__none__` alone lists every
// area-less item in the shared DB, and 48 of the suite's 62
// `createHouseholdItemViaApi()` calls — spread over 12 spec files — pass no areaId
// (area-filter.spec.ts:185, :318 and :377 each hold one for the length of a long
// scenario). Under `fullyParallel: true` a single foreign area-less item makes the
// empty state unreachable, so the test only ever passed while no such spec happened
// to share its shard — it broke the moment #1957's worker-hash change moved this
// file from shard 15 into shard 14, whose other members are area-filter.spec.ts,
// household-items-list.spec.ts, household-item-create/-detail/-edit.spec.ts.
//
// The sibling `e2e/tests/work-items/no-area-filter.spec.ts:223` already solves this
// the same way and has been green in shards 7/12/16 while co-resident with five
// area-less work-item creators — this file was simply never given the same
// treatment.
//
// Fix: AND the sentinel filter with a `q=` search for this scenario's own name
// token (`useTableState` hydrates `q` from the URL and householdItemService ANDs
// it with the areaId condition), so only items this test created can satisfy the
// list. `q` also counts towards DataTable's `hasActiveFilters`, so the filtered
// empty-state message and Clear Filters button are still the correct expectations.
// A positive control runs first: the same `q` without the sentinel must list the
// area-assigned item, which rules out the empty state passing vacuously because
// the search matched nothing at all.
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  '?areaId=__none__ shows filtered empty state when no matching household item is unassigned (Scenario 4)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ timeout: 90_000 });

    test('Empty state with Clear Filters button when the only matching item is area-assigned', async ({
      page,
      testPrefix,
    }) => {
      const listPage = new HouseholdItemsPage(page);
      const areaIds: string[] = [];
      const itemIds: string[] = [];

      // Search token that scopes every assertion below to this test's own data.
      // Unique per worker+project via testPrefix, and no other test uses this
      // scenario suffix.
      const scopeToken = `${testPrefix} HI NoArea Sc4`;
      const areaName = `${scopeToken} Area`;
      const itemAssignedName = `${scopeToken} Assigned`;

      try {
        const areaId = await createAreaViaApi(page, { name: areaName });
        areaIds.push(areaId);
        itemIds.push(await createHouseholdItemViaApi(page, { name: itemAssignedName, areaId }));

        // Positive control: the search token alone must find the area-assigned item.
        // Without this, an empty result below would be indistinguishable from "the
        // search matched nothing", and the empty-state assertion would pass even if
        // the sentinel filter did nothing.
        await page.goto(`${HOUSEHOLD_ITEMS_ROUTE}?q=${encodeURIComponent(scopeToken)}`);
        await listPage.heading.waitFor({ state: 'visible' });
        await listPage.waitForLoaded();
        await expect(async () => {
          const names = await listPage.getItemNames();
          expect(names).toContain(itemAssignedName);
        }).toPass({ timeout: 30_000 });

        // Now add the sentinel: the one matching item has an area, so the filtered
        // result must be empty regardless of what other specs are doing concurrently.
        await page.goto(
          `${HOUSEHOLD_ITEMS_ROUTE}?areaId=__none__&q=${encodeURIComponent(scopeToken)}`,
        );
        await listPage.heading.waitFor({ state: 'visible' });

        // Both filters must survive the SPA's URL round-trip (handleStateChange
        // rewrites the query string from table state), otherwise the empty state
        // below could be caused by a different filter set than the one under test.
        const url = new URL(page.url());
        expect(url.searchParams.get('areaId')).toBe('__none__');
        expect(url.searchParams.get('q')).toBe(scopeToken);

        // Wait for the filter empty state
        await expect(async () => {
          await expect(listPage.emptyState).toBeVisible();
        }).toPass({ timeout: 30_000 });

        // Empty state message must indicate filtered no-results
        await expect(listPage.emptyState).toContainText('No purchases match.');

        // "Clear filters" must be offered in the empty state
        const clearButton = listPage.emptyState.getByRole('button', {
          name: /Clear filters/i,
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
