/**
 * E2E tests for AreaBreadcrumb on work-item pages (Story #1238)
 *
 * Validates that the AreaBreadcrumb component renders correctly on:
 *  - Work Items list page  (compact variant — tooltip span with full path)
 *  - Work Item detail page (default variant — <nav aria-label="Area path">)
 *  - Work Item create page (default variant preview — appears after area is selected)
 *
 * Scenarios covered:
 * 1. List page — breadcrumb with ancestors shows ancestor + area name (desktop, tablet, mobile)
 * 2. Detail page — breadcrumb nav shows ancestor + area name segments
 * 3. Mobile list — tooltip becomes visible on focus
 * 4. List page — null area shows "No area" text in row
 * 5. Detail page — null area shows "No area" text in header
 * 6. Create page — preview appears after area is selected, disappears when cleared
 */

import { test, expect } from '../../fixtures/auth.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { WorkItemCreatePage } from '../../pages/WorkItemCreatePage.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createAreaViaApi,
  deleteAreaViaApi,
} from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: List page — breadcrumb with ancestors
// ─────────────────────────────────────────────────────────────────────────────
test.describe('List page — breadcrumb with area ancestors (Scenario 1)', { tag: '@responsive' }, () => {
  test('Work item row shows compact breadcrumb with ancestor and area name', async ({
    page,
    testPrefix,
  }) => {
    const workItemsPage = new WorkItemsPage(page);
    let rootAreaId: string | null = null;
    let childAreaId: string | null = null;
    let workItemId: string | null = null;
    const rootName = `${testPrefix} Ground Floor`;
    const childName = `${testPrefix} Kitchen`;
    const itemTitle = `${testPrefix} Breadcrumb List Test`;

    try {
      // Create parent → child area chain
      rootAreaId = await createAreaViaApi(page, { name: rootName });
      childAreaId = await createAreaViaApi(page, { name: childName, parentId: rootAreaId });
      workItemId = await createWorkItemViaApi(page, { title: itemTitle, areaId: childAreaId });

      await workItemsPage.goto();
      await workItemsPage.waitForLoaded();
      await workItemsPage.search(itemTitle);

      // The API response is used server-side to populate area.ancestors;
      // verify both ancestor and area name appear in the row's breadcrumb text.
      // On desktop/tablet the table row is visible; on mobile the card is used.
      const viewport = page.viewportSize();
      const tableVisible = viewport ? viewport.width >= 768 : true;

      if (tableVisible) {
        const row = workItemsPage.tableBody.locator('tr').filter({ hasText: itemTitle });
        const breadcrumbSpan = row.locator('[class*="compact"]');
        await expect(breadcrumbSpan).toBeVisible();
        const breadcrumbText = await breadcrumbSpan.textContent();
        expect(breadcrumbText).toContain(rootName);
        expect(breadcrumbText).toContain(childName);
      } else {
        const card = workItemsPage.cardsContainer.locator('[class*="card"]').filter({ hasText: itemTitle });
        const breadcrumbSpan = card.locator('[class*="compact"]');
        await expect(breadcrumbSpan).toBeVisible();
        const breadcrumbText = await breadcrumbSpan.textContent();
        expect(breadcrumbText).toContain(rootName);
        expect(breadcrumbText).toContain(childName);
      }
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (childAreaId) await deleteAreaViaApi(page, childAreaId);
      if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Detail page — breadcrumb nav with ancestors
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Detail page — area path breadcrumb nav (Scenario 2)', { tag: '@responsive' }, () => {
  test('Detail header shows nav "Area path" with ancestor and area name segments', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let rootAreaId: string | null = null;
    let childAreaId: string | null = null;
    let workItemId: string | null = null;
    const rootName = `${testPrefix} GF Detail`;
    const childName = `${testPrefix} Kitchen Detail`;
    const itemTitle = `${testPrefix} Breadcrumb Detail Test`;

    try {
      rootAreaId = await createAreaViaApi(page, { name: rootName });
      childAreaId = await createAreaViaApi(page, { name: childName, parentId: rootAreaId });
      workItemId = await createWorkItemViaApi(page, { title: itemTitle, areaId: childAreaId });

      await detailPage.goto(workItemId);

      // Default variant renders <nav aria-label="Area path">
      await expect(detailPage.areaBreadcrumbNav).toBeVisible();

      // Verify both ancestor and area name appear as list items inside the nav
      const navText = await detailPage.areaBreadcrumbNav.textContent();
      expect(navText).toContain(rootName);
      expect(navText).toContain(childName);

      // Verify individual segments via list items (li[class*="segment"])
      const segments = detailPage.areaBreadcrumbNav.locator('[class*="segment"]');
      const segmentTexts = await segments.allTextContents();
      expect(segmentTexts).toContain(rootName);
      expect(segmentTexts).toContain(childName);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (childAreaId) await deleteAreaViaApi(page, childAreaId);
      if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Mobile list — compact breadcrumb tooltip on focus
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Mobile list — compact breadcrumb tooltip on focus (Scenario 3)', () => {
  test('Focusing the compact breadcrumb span reveals the tooltip with full path', async ({
    page,
    testPrefix,
  }) => {
    // This test validates the tooltip focus interaction.
    // The Tooltip component shows on onFocus (and onMouseEnter).
    // Tooltip content = the full path string (e.g. "Root › Child").
    // Tooltip uses CSS opacity: 0 → 1 (not display:none), so toBeVisible()
    // correctly detects the transition.
    const workItemsPage = new WorkItemsPage(page);
    let rootAreaId: string | null = null;
    let child1Id: string | null = null;
    let child2Id: string | null = null;
    let child3Id: string | null = null;
    let workItemId: string | null = null;

    const rootName = `${testPrefix} Property`;
    const houseName = `${testPrefix} House`;
    const floorName = `${testPrefix} Floor`;
    const kitchenName = `${testPrefix} Kitchen`;
    const itemTitle = `${testPrefix} Tooltip Focus Test`;

    try {
      rootAreaId = await createAreaViaApi(page, { name: rootName });
      child1Id = await createAreaViaApi(page, { name: houseName, parentId: rootAreaId });
      child2Id = await createAreaViaApi(page, { name: floorName, parentId: child1Id });
      child3Id = await createAreaViaApi(page, { name: kitchenName, parentId: child2Id });
      workItemId = await createWorkItemViaApi(page, { title: itemTitle, areaId: child3Id });

      await workItemsPage.goto();
      await workItemsPage.waitForLoaded();
      await workItemsPage.search(itemTitle);

      // Find the compact breadcrumb span (tabIndex=0) for this item.
      // Works in both table rows (desktop/tablet) and cards (mobile).
      const viewport = page.viewportSize();
      const tableVisible = viewport ? viewport.width >= 768 : true;

      let breadcrumbSpan;
      if (tableVisible) {
        const row = workItemsPage.tableBody.locator('tr').filter({ hasText: itemTitle });
        breadcrumbSpan = row.locator('[tabIndex="0"][class*="compact"]');
      } else {
        const card = workItemsPage.cardsContainer.locator('[class*="card"]').filter({ hasText: itemTitle });
        breadcrumbSpan = card.locator('[tabIndex="0"][class*="compact"]');
      }

      await expect(breadcrumbSpan).toBeVisible();

      // Scroll into view and focus — this triggers the Tooltip onFocus handler
      await breadcrumbSpan.scrollIntoViewIfNeeded();
      await breadcrumbSpan.focus();

      // The tooltip element (role="tooltip") should become visible (opacity: 1)
      // The tooltip content is the full path: "Property › House › Floor › Kitchen"
      const tooltip = page.getByRole('tooltip');
      await expect(tooltip).toBeVisible();

      const tooltipText = await tooltip.textContent();
      expect(tooltipText).toContain(rootName);
      expect(tooltipText).toContain(kitchenName);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
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
  test('Work item with no area assigned shows "No area" text in list row', async ({
    page,
    testPrefix,
  }) => {
    const workItemsPage = new WorkItemsPage(page);
    let workItemId: string | null = null;
    const itemTitle = `${testPrefix} No Area List Test`;

    try {
      // Create work item with no areaId
      workItemId = await createWorkItemViaApi(page, { title: itemTitle });

      await workItemsPage.goto();
      await workItemsPage.waitForLoaded();
      await workItemsPage.search(itemTitle);

      // Null area renders <span class*="muted">No area</span>
      // This appears in both table rows and mobile cards
      const viewport = page.viewportSize();
      const tableVisible = viewport ? viewport.width >= 768 : true;

      if (tableVisible) {
        const row = workItemsPage.tableBody.locator('tr').filter({ hasText: itemTitle });
        // The "No area" span sits in the title cell
        await expect(row.getByText('No area', { exact: true })).toBeVisible();
      } else {
        const card = workItemsPage.cardsContainer.locator('[class*="card"]').filter({ hasText: itemTitle });
        await expect(card.getByText('No area', { exact: true })).toBeVisible();
      }
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Detail page — null area shows "No area"
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Detail page — null area shows "No area" (Scenario 5)', { tag: '@responsive' }, () => {
  test('Work item with no area assigned shows "No area" text in detail header', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let workItemId: string | null = null;
    const itemTitle = `${testPrefix} No Area Detail Test`;

    try {
      workItemId = await createWorkItemViaApi(page, { title: itemTitle });

      await detailPage.goto(workItemId);

      // Null area renders <span class*="muted">No area</span> (no nav)
      await expect(page.getByText('No area', { exact: true }).first()).toBeVisible();

      // The nav element should NOT be present (area is null → no nav rendered)
      await expect(detailPage.areaBreadcrumbNav).not.toBeVisible();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Create page — breadcrumb preview after area selection
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create page — area breadcrumb preview (Scenario 6)', { tag: '@responsive' }, () => {
  test('No breadcrumb nav visible before any area is selected', async ({ page }) => {
    const createPage = new WorkItemCreatePage(page);

    await createPage.goto();

    // Before selecting an area, the preview nav must NOT be present
    await expect(createPage.areaBreadcrumbPreview).not.toBeVisible();
  });

  test('Breadcrumb preview appears and shows full path after selecting an area', async ({
    page,
    testPrefix,
  }) => {
    const createPage = new WorkItemCreatePage(page);
    let rootAreaId: string | null = null;
    let childAreaId: string | null = null;

    const rootName = `${testPrefix} Create Root`;
    const childName = `${testPrefix} Create Child`;

    try {
      rootAreaId = await createAreaViaApi(page, { name: rootName });
      childAreaId = await createAreaViaApi(page, { name: childName, parentId: rootAreaId });

      await createPage.goto();

      // Before selection — no preview
      await expect(createPage.areaBreadcrumbPreview).not.toBeVisible();

      // Open the AreaPicker by clicking/focusing the input
      await createPage.areaPickerInput.scrollIntoViewIfNeeded();
      await createPage.areaPickerInput.waitFor({ state: 'visible' });
      await createPage.areaPickerInput.click();

      // Type the child area name to filter the dropdown options
      await createPage.areaPickerInput.fill(childName);

      // Wait for the listbox to appear with the option
      const listbox = page.getByRole('listbox');
      await expect(listbox).toBeVisible();

      // Select the child area option
      const option = listbox.getByRole('option', { name: new RegExp(childName) });
      await expect(option).toBeVisible();
      await option.click();

      // After selection — breadcrumb preview nav should appear with full path
      await expect(createPage.areaBreadcrumbPreview).toBeVisible();

      const previewText = await createPage.areaBreadcrumbPreview.textContent();
      expect(previewText).toContain(rootName);
      expect(previewText).toContain(childName);
    } finally {
      if (childAreaId) await deleteAreaViaApi(page, childAreaId);
      if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
    }
  });

  test('Breadcrumb preview disappears after clearing the area selection', async ({
    page,
    testPrefix,
  }) => {
    const createPage = new WorkItemCreatePage(page);
    let rootAreaId: string | null = null;

    const rootName = `${testPrefix} Create Clear Root`;

    try {
      rootAreaId = await createAreaViaApi(page, { name: rootName });

      await createPage.goto();

      // Select the root area
      await createPage.areaPickerInput.scrollIntoViewIfNeeded();
      await createPage.areaPickerInput.waitFor({ state: 'visible' });
      await createPage.areaPickerInput.click();
      await createPage.areaPickerInput.fill(rootName);

      const listbox = page.getByRole('listbox');
      await expect(listbox).toBeVisible();
      const option = listbox.getByRole('option', { name: new RegExp(rootName) });
      await expect(option).toBeVisible();
      await option.click();

      // Preview should be visible
      await expect(createPage.areaBreadcrumbPreview).toBeVisible();

      // Clear the selection using the SearchPicker's clear button.
      // After an area is selected, SearchPicker replaces the <input> with a selectedDisplay
      // chip + "Clear selection" button — areaPickerInput is absent from the DOM at this point.
      await createPage.clearAreaPicker();

      // After clearing — preview nav should NOT be present
      await expect(createPage.areaBreadcrumbPreview).not.toBeVisible();
    } finally {
      if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
    }
  });
});
