/**
 * E2E tests for AreaBreadcrumb in work item embeds and pickers (Story #1239)
 *
 * Validates that the AreaBreadcrumb compact variant renders correctly in contexts
 * where work items are referenced:
 *   - Milestone detail — linked WI list (compact breadcrumb below title)
 *   - Milestone detail — item search dropdown (compact breadcrumb in results)
 *   - WorkItemPicker / DependencySentenceBuilder — compact breadcrumb in search results
 *   - Gantt sidebar — compact breadcrumb below WI title in sidebar row
 *   - Gantt bar hover tooltip — full area path text in tooltip body
 *
 * Scenarios:
 * 1. Milestone detail — linked WI breadcrumb (desktop + responsive)
 * 2. Milestone detail — null area "No area" in linked WI list
 * 3. WorkItemPicker — breadcrumb in dependency builder search result (desktop)
 * 4. Gantt sidebar — WI row shows breadcrumb (desktop only)
 * 5. Gantt bar hover — tooltip contains full path (desktop only)
 * 6. Gantt sidebar — null area "No area" in sidebar row (desktop only)
 */

import { test, expect } from '../../fixtures/auth.js';
import { MilestoneDetailPage } from '../../pages/MilestoneDetailPage.js';
import { TimelinePage } from '../../pages/TimelinePage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createAreaViaApi,
  deleteAreaViaApi,
  createMilestoneViaApi,
  deleteMilestoneViaApi,
} from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: link a work item to a milestone via the API
// ─────────────────────────────────────────────────────────────────────────────

async function linkWorkItemToMilestone(
  page: import('@playwright/test').Page,
  milestoneId: number,
  workItemId: string,
): Promise<void> {
  const response = await page.request.post(`/api/milestones/${milestoneId}/work-items`, {
    data: { workItemId },
  });
  expect(response.ok(), `Link WI ${workItemId} to milestone ${milestoneId}`).toBeTruthy();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Milestone detail — linked WI breadcrumb
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Milestone detail — linked WI compact breadcrumb (Scenario 1)',
  { tag: '@responsive' },
  () => {
    test('Linked work item row shows compact breadcrumb with ancestor chain', async ({
      page,
      testPrefix,
    }) => {
      const milestoneDetailPage = new MilestoneDetailPage(page);

      let rootAreaId: string | null = null;
      let childAreaId: string | null = null;
      let workItemId: string | null = null;
      let milestoneId: number | null = null;

      const rootName = `${testPrefix} Ground Floor`;
      const childName = `${testPrefix} Kitchen`;
      const wiTitle = `${testPrefix} Install tiles`;

      try {
        rootAreaId = await createAreaViaApi(page, { name: rootName });
        childAreaId = await createAreaViaApi(page, { name: childName, parentId: rootAreaId });
        workItemId = await createWorkItemViaApi(page, { title: wiTitle, areaId: childAreaId });
        milestoneId = await createMilestoneViaApi(page, {
          title: `${testPrefix} Milestone 1`,
          targetDate: '2026-12-31',
        });
        await linkWorkItemToMilestone(page, milestoneId, workItemId);

        await milestoneDetailPage.goto(milestoneId);

        // The linked work items list renders inside the viewCard.
        // Each linked WI row contains: typeBadge, workItemTitleCell (link + AreaBreadcrumb compact), unlinkButton.
        const linkedRow = milestoneDetailPage.linkedWorkItemRow(wiTitle);
        await expect(linkedRow).toBeVisible();

        // Compact breadcrumb is the span[class*="compact"] inside the row
        const breadcrumbSpan = linkedRow.locator('[class*="compact"]');
        await expect(breadcrumbSpan).toBeVisible();

        const breadcrumbText = await breadcrumbSpan.textContent();
        expect(breadcrumbText).toContain(rootName);
        expect(breadcrumbText).toContain(childName);
        // Separator character ›
        expect(breadcrumbText).toContain('›');
      } finally {
        if (milestoneId) await deleteMilestoneViaApi(page, milestoneId);
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        if (childAreaId) await deleteAreaViaApi(page, childAreaId);
        if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Milestone detail — null area "No area" in linked WI list
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestone detail — null area "No area" in linked WI (Scenario 2)', () => {
  test('"No area" fallback text visible in linked WI row when work item has no area', async ({
    page,
    testPrefix,
  }) => {
    const milestoneDetailPage = new MilestoneDetailPage(page);

    let workItemId: string | null = null;
    let milestoneId: number | null = null;

    const wiTitle = `${testPrefix} No Area Embed WI`;

    try {
      // Work item with no area
      workItemId = await createWorkItemViaApi(page, { title: wiTitle });
      milestoneId = await createMilestoneViaApi(page, {
        title: `${testPrefix} Milestone NoArea`,
        targetDate: '2026-12-31',
      });
      await linkWorkItemToMilestone(page, milestoneId, workItemId);

      await milestoneDetailPage.goto(milestoneId);

      const linkedRow = milestoneDetailPage.linkedWorkItemRow(wiTitle);
      await expect(linkedRow).toBeVisible();

      // Null area renders <span class*="muted">No area</span>
      await expect(linkedRow.getByText('No area', { exact: true })).toBeVisible();
    } finally {
      if (milestoneId) await deleteMilestoneViaApi(page, milestoneId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: WorkItemPicker — breadcrumb in DependencySentenceBuilder result
// ─────────────────────────────────────────────────────────────────────────────

test.describe('WorkItemPicker — compact breadcrumb in search result (Scenario 3)', () => {
  test('Dependency builder picker shows compact breadcrumb under WI title in dropdown', async ({
    page,
    testPrefix,
  }) => {
    // Desktop-only: picker dropdown is consistently reliable on desktop
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1200) test.skip();

    const wiDetailPage = new WorkItemDetailPage(page);

    let rootAreaId: string | null = null;
    let childAreaId: string | null = null;
    let mainWorkItemId: string | null = null;
    let targetWorkItemId: string | null = null;

    const rootName = `${testPrefix} GF Picker`;
    const childName = `${testPrefix} Bathroom Picker`;
    const mainTitle = `${testPrefix} Main WI Picker`;
    const targetTitle = `${testPrefix} Target WI Picker`;

    try {
      rootAreaId = await createAreaViaApi(page, { name: rootName });
      childAreaId = await createAreaViaApi(page, { name: childName, parentId: rootAreaId });
      // The target WI has an area — this is what should show the breadcrumb in picker results
      targetWorkItemId = await createWorkItemViaApi(page, {
        title: targetTitle,
        areaId: childAreaId,
      });
      // The main WI has no area — we navigate to its detail page and use the dependency builder
      mainWorkItemId = await createWorkItemViaApi(page, { title: mainTitle });

      await wiDetailPage.goto(mainWorkItemId);
      await expect(wiDetailPage.heading).toBeVisible();

      // The DependencySentenceBuilder renders two WorkItemPickers (slot1 + slot2).
      // Slot 1 starts empty; we type in it to search.
      // The SearchPicker input has placeholder from t('picker.placeholder') in workItems namespace.
      // Both pickers have the same placeholder — use the first visible one inside the constraints section.
      const constraintsSection = page.locator('[class*="constraintSubsection"]').filter({
        hasText: /Dependencies/i,
      });
      await constraintsSection.waitFor({ state: 'visible' });

      // Get the first SearchPicker input (slot1) in the dependency builder
      const pickerInput = constraintsSection.locator('input[type="text"]').first();
      await pickerInput.scrollIntoViewIfNeeded();
      await pickerInput.waitFor({ state: 'visible' });
      await pickerInput.fill(targetTitle);

      // Wait for the listbox to open with results
      const listbox = page.getByRole('listbox').first();
      await expect(listbox).toBeVisible();

      // The result option that matches targetTitle
      const resultOption = listbox.locator('[role="option"]').filter({ hasText: targetTitle });
      await expect(resultOption).toBeVisible();

      // The renderSecondary slot renders inside resultSecondary span inside resultContent span
      // AreaBreadcrumb compact renders <span class*="compact"> inside resultSecondary
      const breadcrumbSpan = resultOption.locator('[class*="compact"]');
      await expect(breadcrumbSpan).toBeVisible();

      const breadcrumbText = await breadcrumbSpan.textContent();
      expect(breadcrumbText).toContain(rootName);
      expect(breadcrumbText).toContain(childName);
    } finally {
      if (mainWorkItemId) await deleteWorkItemViaApi(page, mainWorkItemId);
      if (targetWorkItemId) await deleteWorkItemViaApi(page, targetWorkItemId);
      if (childAreaId) await deleteAreaViaApi(page, childAreaId);
      if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Gantt sidebar — WI row breadcrumb (desktop only)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Gantt sidebar — WI row compact breadcrumb (Scenario 4)', () => {
  test('Sidebar row shows compact breadcrumb below WI title', async ({ page, testPrefix }) => {
    // Gantt collapses on mobile/tablet — skip non-desktop viewports
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1200) test.skip();

    const timelinePage = new TimelinePage(page);

    let rootAreaId: string | null = null;
    let childAreaId: string | null = null;
    let workItemId: string | null = null;

    const rootName = `${testPrefix} House Gantt`;
    const childName = `${testPrefix} Living Room Gantt`;
    const wiTitle = `${testPrefix} Gantt Sidebar WI`;

    try {
      rootAreaId = await createAreaViaApi(page, { name: rootName });
      childAreaId = await createAreaViaApi(page, { name: childName, parentId: rootAreaId });

      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0)
        .toISOString()
        .slice(0, 10);

      workItemId = await createWorkItemViaApi(page, {
        title: wiTitle,
        areaId: childAreaId,
        startDate,
        endDate,
      });

      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      // Find the sidebar row for this specific work item
      const sidebarRow = timelinePage.ganttSidebarRow(workItemId);
      await sidebarRow.waitFor({ state: 'visible' });

      // Compact breadcrumb inside sidebarRowContent div
      const breadcrumbSpan = sidebarRow.locator('[class*="compact"]');
      await expect(breadcrumbSpan).toBeVisible();

      const breadcrumbText = await breadcrumbSpan.textContent();
      expect(breadcrumbText).toContain(rootName);
      expect(breadcrumbText).toContain(childName);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (childAreaId) await deleteAreaViaApi(page, childAreaId);
      if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Gantt bar hover — tooltip contains full area path (desktop only)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Gantt bar hover — tooltip shows full area path (Scenario 5)', () => {
  test('Hovering a Gantt bar opens tooltip containing the full area path text', async ({
    page,
    testPrefix,
  }) => {
    // Gantt tooltips on hover are desktop-only
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1200) test.skip();

    const timelinePage = new TimelinePage(page);

    let rootAreaId: string | null = null;
    let childAreaId: string | null = null;
    let workItemId: string | null = null;

    const rootName = `${testPrefix} House Bar`;
    const childName = `${testPrefix} Basement Bar`;
    const wiTitle = `${testPrefix} Gantt Bar Hover WI`;

    try {
      rootAreaId = await createAreaViaApi(page, { name: rootName });
      childAreaId = await createAreaViaApi(page, { name: childName, parentId: rootAreaId });

      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0)
        .toISOString()
        .slice(0, 10);

      workItemId = await createWorkItemViaApi(page, {
        title: wiTitle,
        areaId: childAreaId,
        startDate,
        endDate,
      });

      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      // Locate the Gantt bar for the work item via data-testid="gantt-bar-{id}"
      const barGroup = page.getByTestId(`gantt-bar-${workItemId}`);
      await barGroup.waitFor({ state: 'visible' });

      // Hover the bar to trigger the tooltip
      await barGroup.hover();

      // The tooltip is data-testid="gantt-tooltip"
      await expect(timelinePage.tooltip).toBeVisible();

      const tooltipText = await timelinePage.tooltip.textContent();
      // The areaName is formatted as "House Bar › Basement Bar" (full path joined with › separator)
      expect(tooltipText).toContain(rootName);
      expect(tooltipText).toContain(childName);
      // Separator character ›
      expect(tooltipText).toContain('›');
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (childAreaId) await deleteAreaViaApi(page, childAreaId);
      if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Gantt sidebar — null area "No area" in sidebar row (desktop only)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Gantt sidebar — null area shows "No area" (Scenario 6)', () => {
  test('"No area" fallback visible in sidebar row when WI has no area and has dates', async ({
    page,
    testPrefix,
  }) => {
    // Gantt collapses on mobile/tablet — skip non-desktop viewports
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1200) test.skip();

    const timelinePage = new TimelinePage(page);
    let workItemId: string | null = null;

    const wiTitle = `${testPrefix} No Area Gantt Sidebar`;

    try {
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0)
        .toISOString()
        .slice(0, 10);

      workItemId = await createWorkItemViaApi(page, {
        title: wiTitle,
        startDate,
        endDate,
      });

      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      const sidebarRow = timelinePage.ganttSidebarRow(workItemId);
      await sidebarRow.waitFor({ state: 'visible' });

      // Null area renders <span class*="muted">No area</span>
      await expect(sidebarRow.getByText('No area', { exact: true })).toBeVisible();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});
