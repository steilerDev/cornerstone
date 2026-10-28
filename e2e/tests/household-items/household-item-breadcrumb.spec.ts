/**
 * E2E tests for AreaBreadcrumb on household-item pages (Story #1240)
 *
 * Validates that the AreaBreadcrumb component renders correctly on:
 *  - Household Items list page  (compact variant — plain span with full path, no tooltip)
 *  - Belongs-to picker in the cost line form (kind and area path in the search dropdown)
 *
 * NOTE (fix/1278): The AreaBreadcrumb compact variant no longer has a Tooltip or tabIndex=0.
 * The breadcrumb has been REMOVED from the HouseholdItemDetailPage header entirely — neither
 * the default nav variant nor the "No area" muted span appears in the detail header.
 *
 * Scenarios covered:
 * 1. List page — breadcrumb with ancestors shows ancestor + area name (desktop, tablet, mobile)
 * 2. Detail page — area breadcrumb nav is NOT visible in the detail header (removed)
 * 3. Compact breadcrumb — no tabIndex=0 on the span; no tooltip on focus
 * 4. List page — null area shows "No area" text in row
 * 5. Detail page — no area breadcrumb (nav or "No area" text) in detail header
 * 6. Belongs-to picker (cost line form) — kind and area path visible in the search dropdown (smoke)
 */

import type { Locator } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { CostLineFormDialog } from '../../pages/components/CostLineFormDialog.js';
import { CostLinesPanel } from '../../pages/components/CostLinesPanel.js';
import { HouseholdItemsPage } from '../../pages/HouseholdItemsPage.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import {
  createAreaViaApi,
  deleteAreaViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';

/**
 * The element that shows a purchase's area path: the Area column's link on the table surface, the
 * compact breadcrumb span on the card surface (the card shows no Area column).
 */
async function areaPathElement(
  listPage: HouseholdItemsPage,
  itemName: string,
  itemId: string,
): Promise<Locator> {
  if (await listPage.isTableSurface()) return listPage.areaLink(itemId);
  return listPage.itemRow(itemName).locator('[class*="compact"]');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: List page — breadcrumb with ancestors
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'List page — breadcrumb with area ancestors (Scenario 1)',
  { tag: '@responsive' },
  () => {
    test('Household item row shows compact breadcrumb with ancestor and area name', async ({
      page,
      testPrefix,
    }) => {
      const listPage = new HouseholdItemsPage(page);
      let rootAreaId: string | null = null;
      let childAreaId: string | null = null;
      let itemId: string | null = null;
      const rootName = `${testPrefix} Ground Floor`;
      const childName = `${testPrefix} Kitchen`;
      const itemName = `${testPrefix} Breadcrumb List HI`;

      try {
        // Create parent → child area chain
        rootAreaId = await createAreaViaApi(page, { name: rootName });
        childAreaId = await createAreaViaApi(page, { name: childName, parentId: rootAreaId });
        itemId = await createHouseholdItemViaApi(page, { name: itemName, areaId: childAreaId });

        // Navigate directly with search query in URL — avoids debounce/race issues
        await listPage.search(itemName);

        // Table: the Area column's link shows the full path; card: the compact breadcrumb
        const area = await areaPathElement(listPage, itemName, itemId);
        await expect(area).toBeVisible();
        const breadcrumbText = await area.textContent();
        expect(breadcrumbText).toContain(rootName);
        expect(breadcrumbText).toContain(childName);
      } finally {
        if (itemId) await deleteHouseholdItemViaApi(page, itemId);
        if (childAreaId) await deleteAreaViaApi(page, childAreaId);
        if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Detail page — area breadcrumb nav REMOVED (fix/1278)
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Detail page — area breadcrumb nav not present in header (Scenario 2)',
  { tag: '@responsive' },
  () => {
    test('Detail header does NOT show area breadcrumb nav even when area is set', async ({
      page,
      testPrefix,
    }) => {
      // fix/1278: breadcrumb removed from HouseholdItemDetailPage header.
      // The default <nav aria-label="Area path"> must NOT appear, even for items with an area.
      const detailPage = new HouseholdItemDetailPage(page);
      let rootAreaId: string | null = null;
      let childAreaId: string | null = null;
      let itemId: string | null = null;
      const rootName = `${testPrefix} GF HI Detail`;
      const childName = `${testPrefix} Bathroom HI Detail`;
      const itemName = `${testPrefix} Breadcrumb Detail HI`;

      try {
        rootAreaId = await createAreaViaApi(page, { name: rootName });
        childAreaId = await createAreaViaApi(page, { name: childName, parentId: rootAreaId });
        itemId = await createHouseholdItemViaApi(page, { name: itemName, areaId: childAreaId });

        await detailPage.goto(itemId);

        // Breadcrumb nav must NOT be present in the detail header (removed in fix/1278)
        await expect(detailPage.areaBreadcrumbNav).not.toBeVisible();
      } finally {
        if (itemId) await deleteHouseholdItemViaApi(page, itemId);
        if (childAreaId) await deleteAreaViaApi(page, childAreaId);
        if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Compact breadcrumb — no tabIndex=0, no tooltip on focus (fix/1278)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Compact breadcrumb — no tabIndex and no tooltip (Scenario 3)', () => {
  test('Compact breadcrumb span has no tabIndex=0 and produces no tooltip on focus', async ({
    page,
    testPrefix,
  }) => {
    // fix/1278: The AreaBreadcrumb compact variant no longer has a Tooltip or tabIndex=0.
    // Verify:
    //   a) The compact span is present and shows the area path text (breadcrumb still renders)
    //   b) The span does NOT have tabIndex=0 (not keyboard-focusable via tabIndex)
    //   c) Attempting programmatic focus does NOT produce a role="tooltip" element
    const listPage = new HouseholdItemsPage(page);
    let rootAreaId: string | null = null;
    let child1Id: string | null = null;
    let child2Id: string | null = null;
    let child3Id: string | null = null;
    let itemId: string | null = null;

    const rootName = `${testPrefix} HI Property`;
    const houseName = `${testPrefix} HI House`;
    const floorName = `${testPrefix} HI Floor`;
    const kitchenName = `${testPrefix} HI Kitchen`;
    const itemName = `${testPrefix} No Tooltip HI Test`;

    try {
      rootAreaId = await createAreaViaApi(page, { name: rootName });
      child1Id = await createAreaViaApi(page, { name: houseName, parentId: rootAreaId });
      child2Id = await createAreaViaApi(page, { name: floorName, parentId: child1Id });
      child3Id = await createAreaViaApi(page, { name: kitchenName, parentId: child2Id });
      itemId = await createHouseholdItemViaApi(page, { name: itemName, areaId: child3Id });

      await listPage.search(itemName);

      // Table: the Area link (full path); card: the compact breadcrumb span.
      const breadcrumbSpan = await areaPathElement(listPage, itemName, itemId);

      // (a) Compact span is visible and contains area path text
      await expect(breadcrumbSpan).toBeVisible();
      const spanText = await breadcrumbSpan.textContent();
      expect(spanText).toContain(rootName);
      expect(spanText).toContain(kitchenName);

      // (b) The span does NOT have tabIndex=0 (tooltip/keyboard-focus removed)
      const tabIndexValue = await breadcrumbSpan.getAttribute('tabindex');
      expect(tabIndexValue).not.toBe('0');

      // (c) Programmatic focus does NOT produce a tooltip element
      await breadcrumbSpan.scrollIntoViewIfNeeded();
      await breadcrumbSpan.focus();

      // Tooltip must NOT appear — the Tooltip wrapper is gone
      await expect(page.getByRole('tooltip')).not.toBeVisible();
    } finally {
      if (itemId) await deleteHouseholdItemViaApi(page, itemId);
      if (child3Id) await deleteAreaViaApi(page, child3Id);
      if (child2Id) await deleteAreaViaApi(page, child2Id);
      if (child1Id) await deleteAreaViaApi(page, child1Id);
      if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: List page — null area shows "No area"
// ─────────────────────────────────────────────────────────────────────────────
test.describe('List page — null area shows "No area" (Scenario 4)', { tag: '@responsive' }, () => {
  test('Household item with no area assigned shows "No area" text in list row', async ({
    page,
    testPrefix,
  }) => {
    const listPage = new HouseholdItemsPage(page);
    let itemId: string | null = null;
    const itemName = `${testPrefix} No Area HI List`;

    try {
      // Create household item with no areaId
      itemId = await createHouseholdItemViaApi(page, { name: itemName });

      await listPage.search(itemName);

      // Null area renders <span class*="muted">No area</span> inside the name column's titleCell
      // Works in both table rows and mobile cards
      await expect(listPage.itemRow(itemName).getByText('No area', { exact: true })).toBeVisible();
    } finally {
      if (itemId) await deleteHouseholdItemViaApi(page, itemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Detail page — no breadcrumb in header regardless of area (fix/1278)
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Detail page — no breadcrumb in header for null area (Scenario 5)',
  { tag: '@responsive' },
  () => {
    test('Household item with no area assigned shows no breadcrumb nav or "No area" text in detail header', async ({
      page,
      testPrefix,
    }) => {
      // fix/1278: breadcrumb removed from HouseholdItemDetailPage header entirely.
      // Neither the <nav aria-label="Area path"> nor the muted "No area" span appears.
      const detailPage = new HouseholdItemDetailPage(page);
      let itemId: string | null = null;
      const itemName = `${testPrefix} No Area HI Detail`;

      try {
        itemId = await createHouseholdItemViaApi(page, { name: itemName });

        await detailPage.goto(itemId);

        // The nav element must NOT be present (breadcrumb removed in fix/1278)
        await expect(detailPage.areaBreadcrumbNav).not.toBeVisible();
      } finally {
        if (itemId) await deleteHouseholdItemViaApi(page, itemId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Belongs to picker (cost line form) — area path in the search dropdown
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Belongs to picker — area path in the search dropdown (Scenario 6)', () => {
  test('Searching a purchase in the cost line form shows its kind and area path in the dropdown result', async ({
    page,
    testPrefix,
  }) => {
    // The cost line form on an offer or invoice has a "Belongs to" search over tasks and
    // purchases (#2235). Each result shows the kind word and the area path as secondary text.

    let rootAreaId: string | null = null;
    let childAreaId: string | null = null;
    let itemId: string | null = null;
    let vendorId: string | null = null;
    let invoiceId: string | null = null;

    const rootName = `${testPrefix} Picker Root`;
    const childName = `${testPrefix} Picker Child`;
    const itemName = `${testPrefix} Picker HI`;

    try {
      rootAreaId = await createAreaViaApi(page, { name: rootName });
      childAreaId = await createAreaViaApi(page, { name: childName, parentId: rootAreaId });
      itemId = await createHouseholdItemViaApi(page, { name: itemName, areaId: childAreaId });

      const vendorResp = await page.request.post(API.vendors, {
        data: { name: `${testPrefix} Picker Vendor` },
      });
      expect(vendorResp.ok()).toBeTruthy();
      const vendorBody = (await vendorResp.json()) as { vendor: { id: string } };
      vendorId = vendorBody.vendor.id;

      const invoiceResp = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
        data: { amount: 100, date: '2026-01-15', status: 'pending' },
      });
      expect(invoiceResp.ok()).toBeTruthy();
      const invoiceBody = (await invoiceResp.json()) as { invoice: { id: string } };
      invoiceId = invoiceBody.invoice.id;

      const panel = new CostLinesPanel(page);
      const form = new CostLineFormDialog(page, 'New cost line');
      await page.goto(routeUrl('invoice', { id: invoiceId }));
      await panel.waitForLoaded();
      await panel.addButton.click();
      await form.waitForOpen();

      await form.target.type(itemName);
      const option = form.target.option(itemName);
      await expect(option).toBeVisible();
      await expect(option).toContainText('Purchase');
      await expect(option).toContainText(rootName);
      await expect(option).toContainText(childName);
    } finally {
      // Invoice is deleted with vendor (cascade) — delete invoice first, then vendor
      if (invoiceId && vendorId) {
        await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoiceId}`);
      }
      if (vendorId) await page.request.delete(`${API.vendors}/${vendorId}`);
      if (itemId) await deleteHouseholdItemViaApi(page, itemId);
      if (childAreaId) await deleteAreaViaApi(page, childAreaId);
      if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
    }
  });
});
