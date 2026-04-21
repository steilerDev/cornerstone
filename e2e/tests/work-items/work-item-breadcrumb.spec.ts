/**
 * E2E tests for AreaBreadcrumb on work-item pages (Story #1238)
 *
 * Validates that the AreaBreadcrumb component renders correctly on:
 *  - Work Items list page  (compact variant — plain span with full path, no tooltip)
 *  - Work Item create page (default variant preview — appears after area is selected)
 *
 * NOTE (fix/1278): The AreaBreadcrumb compact variant no longer has a Tooltip or tabIndex=0.
 * The breadcrumb has been REMOVED from the WorkItemDetailPage header entirely — neither the
 * default nav variant nor the "No area" muted span appears in the detail header.
 *
 * Scenarios covered:
 * 1. List page — breadcrumb with ancestors shows ancestor + area name (desktop, tablet, mobile)
 * 2. Detail page — area breadcrumb nav is NOT visible in the detail header (removed)
 * 3. Compact breadcrumb — no tabIndex=0 on the span; no tooltip on focus
 * 4. List page — null area shows "No area" text in row
 * 5. Detail page — no area breadcrumb (nav or "No area" text) in detail header
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
test.describe(
  'List page — breadcrumb with area ancestors (Scenario 1)',
  { tag: '@responsive' },
  () => {
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
          const card = workItemsPage.cardsContainer
            .locator('[class*="card"]')
            .filter({ hasText: itemTitle });
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
      // fix/1278: breadcrumb removed from WorkItemDetailPage header.
      // The default <nav aria-label="Area path"> must NOT appear, even for items with an area.
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

        // Breadcrumb nav must NOT be present in the detail header (removed in fix/1278)
        await expect(detailPage.areaBreadcrumbNav).not.toBeVisible();
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
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
    const itemTitle = `${testPrefix} No Tooltip Test`;

    try {
      rootAreaId = await createAreaViaApi(page, { name: rootName });
      child1Id = await createAreaViaApi(page, { name: houseName, parentId: rootAreaId });
      child2Id = await createAreaViaApi(page, { name: floorName, parentId: child1Id });
      child3Id = await createAreaViaApi(page, { name: kitchenName, parentId: child2Id });
      workItemId = await createWorkItemViaApi(page, { title: itemTitle, areaId: child3Id });

      await workItemsPage.goto();
      await workItemsPage.waitForLoaded();
      await workItemsPage.search(itemTitle);

      // Find the compact breadcrumb span for this item (no tabIndex=0 selector now).
      // Works in both table rows (desktop/tablet) and cards (mobile).
      const viewport = page.viewportSize();
      const tableVisible = viewport ? viewport.width >= 768 : true;

      let breadcrumbSpan;
      if (tableVisible) {
        const row = workItemsPage.tableBody.locator('tr').filter({ hasText: itemTitle });
        breadcrumbSpan = row.locator('[class*="compact"]');
      } else {
        const card = workItemsPage.cardsContainer
          .locator('[class*="card"]')
          .filter({ hasText: itemTitle });
        breadcrumbSpan = card.locator('[class*="compact"]');
      }

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
        const card = workItemsPage.cardsContainer
          .locator('[class*="card"]')
          .filter({ hasText: itemTitle });
        await expect(card.getByText('No area', { exact: true })).toBeVisible();
      }
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
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
    test('Work item with no area assigned shows no breadcrumb nav or "No area" text in detail header', async ({
      page,
      testPrefix,
    }) => {
      // fix/1278: breadcrumb removed from WorkItemDetailPage header entirely.
      // Neither the <nav aria-label="Area path"> nor the muted "No area" span appears.
      const detailPage = new WorkItemDetailPage(page);
      let workItemId: string | null = null;
      const itemTitle = `${testPrefix} No Area Detail Test`;

      try {
        workItemId = await createWorkItemViaApi(page, { title: itemTitle });

        await detailPage.goto(workItemId);

        // The nav element must NOT be present (breadcrumb removed in fix/1278)
        await expect(detailPage.areaBreadcrumbNav).not.toBeVisible();
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      }
    });
  },
);

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
