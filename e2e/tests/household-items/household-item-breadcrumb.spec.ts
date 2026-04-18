/**
 * E2E tests for AreaBreadcrumb on household-item pages (Story #1240)
 *
 * Validates that the AreaBreadcrumb component renders correctly on:
 *  - Household Items list page  (compact variant — tooltip span with full path)
 *  - Household Item detail page (default variant — <nav aria-label="Area path">)
 *  - HouseholdItemPicker dropdown (renderSecondary compact breadcrumb in search results)
 *
 * Scenarios covered:
 * 1. List page — breadcrumb with ancestors shows ancestor + area name (desktop, tablet, mobile)
 * 2. Detail page — breadcrumb nav shows ancestor + area name segments
 * 3. Mobile list — tooltip becomes visible on focus (any viewport — scoped to compact span)
 * 4. List page — null area shows "No area" text in row
 * 5. Detail page — null area shows "No area" text; nav NOT visible
 * 6. HouseholdItemPicker — renderSecondary breadcrumb visible in search dropdown (smoke)
 */

import { test, expect } from '../../fixtures/auth.js';
import { HouseholdItemsPage } from '../../pages/HouseholdItemsPage.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import {
  createAreaViaApi,
  deleteAreaViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';

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

        const viewport = page.viewportSize();
        const tableVisible = viewport ? viewport.width >= 768 : true;

        if (tableVisible) {
          const row = listPage.tableBody.locator('tr').filter({ hasText: itemName });
          // The name column renders <div class*="titleCell"> containing compact AreaBreadcrumb
          const breadcrumbSpan = row.locator('[class*="compact"]');
          await expect(breadcrumbSpan).toBeVisible();
          const breadcrumbText = await breadcrumbSpan.textContent();
          expect(breadcrumbText).toContain(rootName);
          expect(breadcrumbText).toContain(childName);
        } else {
          const card = listPage.cardsContainer
            .locator('[class*="card"]')
            .filter({ hasText: itemName });
          const breadcrumbSpan = card.locator('[class*="compact"]');
          await expect(breadcrumbSpan).toBeVisible();
          const breadcrumbText = await breadcrumbSpan.textContent();
          expect(breadcrumbText).toContain(rootName);
          expect(breadcrumbText).toContain(childName);
        }
      } finally {
        if (itemId) await deleteHouseholdItemViaApi(page, itemId);
        if (childAreaId) await deleteAreaViaApi(page, childAreaId);
        if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Detail page — breadcrumb nav with ancestors
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Detail page — area path breadcrumb nav (Scenario 2)', { tag: '@responsive' }, () => {
  test('Detail header shows nav "Area path" with ancestor and area name segments', async ({
    page,
    testPrefix,
  }) => {
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

      // Default variant renders <nav aria-label="Area path"> inside .titleBreadcrumb div
      await expect(detailPage.areaBreadcrumbNav).toBeVisible();

      // Verify both ancestor and area name appear inside the nav
      const navText = await detailPage.areaBreadcrumbNav.textContent();
      expect(navText).toContain(rootName);
      expect(navText).toContain(childName);

      // Verify individual segments via list items (li[class*="segment"])
      const segments = detailPage.areaBreadcrumbNav.locator('[class*="segment"]');
      const segmentTexts = await segments.allTextContents();
      expect(segmentTexts).toContain(rootName);
      expect(segmentTexts).toContain(childName);
    } finally {
      if (itemId) await deleteHouseholdItemViaApi(page, itemId);
      if (childAreaId) await deleteAreaViaApi(page, childAreaId);
      if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Compact breadcrumb tooltip on focus
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Compact breadcrumb tooltip on focus (Scenario 3)', () => {
  test('Focusing the compact breadcrumb span reveals the tooltip with full path', async ({
    page,
    testPrefix,
  }) => {
    // This test validates the tooltip focus interaction.
    // The Tooltip component shows on onFocus (and onMouseEnter).
    // Tooltip content = the full path string (e.g. "Root › Child › Grandchild").
    // Tooltip uses CSS opacity: 0 → 1 (not display:none), so toBeVisible() works.
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
    const itemName = `${testPrefix} Tooltip HI Test`;

    try {
      rootAreaId = await createAreaViaApi(page, { name: rootName });
      child1Id = await createAreaViaApi(page, { name: houseName, parentId: rootAreaId });
      child2Id = await createAreaViaApi(page, { name: floorName, parentId: child1Id });
      child3Id = await createAreaViaApi(page, { name: kitchenName, parentId: child2Id });
      itemId = await createHouseholdItemViaApi(page, { name: itemName, areaId: child3Id });

      await listPage.search(itemName);

      // Find the compact breadcrumb span (tabIndex=0) for this item.
      // Works in both table rows (desktop/tablet) and cards (mobile).
      const viewport = page.viewportSize();
      const tableVisible = viewport ? viewport.width >= 768 : true;

      let breadcrumbSpan;
      if (tableVisible) {
        const row = listPage.tableBody.locator('tr').filter({ hasText: itemName });
        breadcrumbSpan = row.locator('[tabIndex="0"][class*="compact"]');
      } else {
        const card = listPage.cardsContainer
          .locator('[class*="card"]')
          .filter({ hasText: itemName });
        breadcrumbSpan = card.locator('[tabIndex="0"][class*="compact"]');
      }

      await expect(breadcrumbSpan).toBeVisible();

      // Scroll into view and focus — this triggers the Tooltip onFocus handler
      await breadcrumbSpan.scrollIntoViewIfNeeded();
      await breadcrumbSpan.focus();

      // The tooltip element (role="tooltip") should become visible (opacity: 1)
      // The tooltip content is the full path: "HI Property › HI House › HI Floor › HI Kitchen"
      const tooltip = page.getByRole('tooltip');
      await expect(tooltip).toBeVisible();

      const tooltipText = await tooltip.textContent();
      expect(tooltipText).toContain(rootName);
      expect(tooltipText).toContain(kitchenName);
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
      const viewport = page.viewportSize();
      const tableVisible = viewport ? viewport.width >= 768 : true;

      if (tableVisible) {
        const row = listPage.tableBody.locator('tr').filter({ hasText: itemName });
        await expect(row.getByText('No area', { exact: true })).toBeVisible();
      } else {
        const card = listPage.cardsContainer
          .locator('[class*="card"]')
          .filter({ hasText: itemName });
        await expect(card.getByText('No area', { exact: true })).toBeVisible();
      }
    } finally {
      if (itemId) await deleteHouseholdItemViaApi(page, itemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Detail page — null area shows "No area"
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Detail page — null area shows "No area" (Scenario 5)',
  { tag: '@responsive' },
  () => {
    test('Household item with no area assigned shows "No area" text in detail header', async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new HouseholdItemDetailPage(page);
      let itemId: string | null = null;
      const itemName = `${testPrefix} No Area HI Detail`;

      try {
        itemId = await createHouseholdItemViaApi(page, { name: itemName });

        await detailPage.goto(itemId);

        // Null area renders <span class*="muted">No area</span> (no nav)
        // Use .first() to pick the first occurrence in case multiple muted spans exist
        await expect(page.getByText('No area', { exact: true }).first()).toBeVisible();

        // The nav element should NOT be present (area is null → no nav rendered)
        await expect(detailPage.areaBreadcrumbNav).not.toBeVisible();
      } finally {
        if (itemId) await deleteHouseholdItemViaApi(page, itemId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: HouseholdItemPicker — renderSecondary breadcrumb in dropdown
// ─────────────────────────────────────────────────────────────────────────────
test.describe('HouseholdItemPicker — renderSecondary breadcrumb in search dropdown (Scenario 6)', () => {
  test('Opening the HI picker and searching shows compact area breadcrumb in dropdown result', async ({
    page,
    testPrefix,
  }) => {
    // The HouseholdItemPicker is used on the InvoiceDetailPage to link household items
    // to invoice budget lines. We create a vendor and invoice via API, navigate to the
    // invoice detail page, open the "Add Budget Line" modal, and confirm the compact
    // AreaBreadcrumb renders for the result in the HouseholdItemPicker dropdown.
    //
    // Note: showItemsOnFocus=true means the picker populates results on focus without
    // needing to type — we focus then also fill the query to narrow results reliably.

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

      // Create vendor and invoice via inline API calls (no shared helper for these yet)
      const vendorResp = await page.request.post(API.vendors, {
        data: { name: `${testPrefix} Picker Vendor` },
      });
      expect(vendorResp.ok()).toBeTruthy();
      const vendorBody = (await vendorResp.json()) as { vendor: { id: string } };
      vendorId = vendorBody.vendor.id;

      // Invoice status must be one of the valid API enum values: 'pending', 'paid', 'claimed', 'quotation'.
      // 'draft' was used here incorrectly and caused a 400 validation error from Fastify.
      const invoiceResp = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
        data: { amount: 100, date: '2026-01-15', status: 'pending' },
      });
      expect(invoiceResp.ok()).toBeTruthy();
      const invoiceBody = (await invoiceResp.json()) as { invoice: { id: string } };
      invoiceId = invoiceBody.invoice.id;

      // Navigate to invoice detail page where HouseholdItemPicker is rendered in the
      // "Add Budget Line" modal
      await page.goto(`/budget/invoices/${invoiceId}`);
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

      // Open the "Add Budget Line" modal
      const addBudgetLineButton = page.getByRole('button', {
        name: '+ Add Budget Line',
        exact: true,
      });
      await addBudgetLineButton.waitFor({ state: 'visible' });
      await addBudgetLineButton.click();

      // The modal (role=dialog aria-labelledby="picker-title") opens with Step 1
      const modal = page.getByRole('dialog', { name: 'Add Budget Line' });
      await expect(modal).toBeVisible();

      // The HouseholdItemPicker is rendered in the "Household Item" tab with
      // placeholder="Search household items..." and showItemsOnFocus=true.
      const pickerInput = modal.getByPlaceholder('Search household items...');
      await pickerInput.waitFor({ state: 'visible' });

      // Fill the query to find the specific item
      await pickerInput.fill(itemName);

      // Wait for the listbox to appear
      const listbox = page.getByRole('listbox');
      await expect(listbox).toBeVisible();

      // Find the option matching our item
      const option = listbox.getByRole('option', { name: new RegExp(itemName) });
      await expect(option).toBeVisible();

      // The renderSecondary prop renders a compact AreaBreadcrumb inside each option.
      // The compact variant renders a <span class*="compact"> containing the area path text.
      // Verify the breadcrumb text appears in the option — both ancestor and leaf name.
      const secondaryBreadcrumb = option.locator('[class*="compact"]');
      await expect(secondaryBreadcrumb).toBeVisible();
      const breadcrumbText = await secondaryBreadcrumb.textContent();
      expect(breadcrumbText).toContain(rootName);
      expect(breadcrumbText).toContain(childName);
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
