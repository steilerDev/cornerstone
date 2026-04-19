/**
 * E2E tests for AreaBreadcrumb in household item dependency list (Story #1273)
 *
 * When a household item dependency has predecessorType === 'work_item', the dep row in the
 * ul[role="list"][class*="depList"] renders a compact AreaBreadcrumb beneath the work item link.
 * When predecessorType === 'milestone', no breadcrumb is rendered.
 *
 *   Scenario 1: work_item predecessor with area → breadcrumb visible in dep list row
 *   Scenario 2: work_item predecessor without area → "No area" visible in dep row
 *   Scenario 3: milestone predecessor → no breadcrumb in milestone dep row
 *
 * Setup path:
 *   1. Create household item
 *   2. Create area (for Scenario 1)
 *   3. Create work item or milestone predecessor
 *   4. Create dependency via POST /api/household-items/:id/dependencies
 *   5. Navigate to household item detail page
 *   6. Assert breadcrumb in dependency list row
 *
 * DOM structure of the dependency list (HouseholdItemDetailPage.tsx):
 *   <ul role="list" class*="depList">
 *     <li role="listitem" class*="depRow">
 *       <span class*="predTypeWorkItem | predTypeMilestone">Work Item | Milestone</span>
 *       <!-- work_item: -->
 *       <a href="/project/work-items/:id" class*="depPredLink">{dep.predecessor.title}</a>
 *       <AreaBreadcrumb area={dep.predecessor.area ?? null} variant="compact" />
 *       <!-- milestone: -->
 *       <span class*="depPredLabel">{dep.predecessor.title}</span>
 *       <button class*="unlinkButton">×</button>
 *     </li>
 *   </ul>
 *
 * The dependency list renders identically across all viewports (no responsive restructuring),
 * so no @responsive tag is needed.
 */

import { test, expect } from '../../fixtures/auth.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createAreaViaApi,
  deleteAreaViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
  createMilestoneViaApi,
  deleteMilestoneViaApi,
} from '../../fixtures/apiHelpers.js';
import type { Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a household item dependency via the REST API
// POST /api/household-items/:id/dependencies
// ─────────────────────────────────────────────────────────────────────────────

async function createHouseholdItemDepViaApi(
  page: Page,
  householdItemId: string,
  data: {
    predecessorType: 'work_item' | 'milestone';
    predecessorId: string;
  },
): Promise<void> {
  const response = await page.request.post(`/api/household-items/${householdItemId}/dependencies`, {
    data,
  });
  expect(
    response.ok(),
    `POST HI dep ${householdItemId} → ${data.predecessorType}:${data.predecessorId}`,
  ).toBeTruthy();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: work_item predecessor with area → breadcrumb visible in dep row
// ─────────────────────────────────────────────────────────────────────────────

test.describe('HI dependency — work_item predecessor with area (Scenario 1)', () => {
  test('Dep list row shows compact breadcrumb when work item predecessor has an area', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new HouseholdItemDetailPage(page);

    let rootAreaId: string | null = null;
    let childAreaId: string | null = null;
    let workItemId: string | null = null;
    let householdItemId: string | null = null;

    const rootName = `${testPrefix} Exterior`;
    const childName = `${testPrefix} Garage`;
    const wiTitle = `${testPrefix} Dep WI With Area`;
    const hiName = `${testPrefix} HI Dep Test 1`;

    try {
      rootAreaId = await createAreaViaApi(page, { name: rootName });
      childAreaId = await createAreaViaApi(page, { name: childName, parentId: rootAreaId });
      workItemId = await createWorkItemViaApi(page, { title: wiTitle, areaId: childAreaId });
      householdItemId = await createHouseholdItemViaApi(page, { name: hiName });

      await createHouseholdItemDepViaApi(page, householdItemId, {
        predecessorType: 'work_item',
        predecessorId: workItemId,
      });

      await detailPage.goto(householdItemId);
      await expect(detailPage.heading).toBeVisible();

      // The dependency list
      const depList = page.getByRole('list').filter({ has: page.locator('[class*="depRow"]') });
      await expect(depList).toBeVisible();

      // Find the dep row for our work item
      const depRow = depList.locator('[class*="depRow"]').filter({ hasText: wiTitle });
      await expect(depRow).toBeVisible();

      // Compact breadcrumb inside the dep row (work_item predecessor)
      const breadcrumbSpan = depRow.locator('[class*="compact"]');
      await expect(breadcrumbSpan).toBeVisible();

      const breadcrumbText = await breadcrumbSpan.textContent();
      expect(breadcrumbText).toContain(rootName);
      expect(breadcrumbText).toContain(childName);
      expect(breadcrumbText).toContain('›');
    } finally {
      if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (childAreaId) await deleteAreaViaApi(page, childAreaId);
      if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: work_item predecessor without area → "No area" visible in dep row
// ─────────────────────────────────────────────────────────────────────────────

test.describe('HI dependency — work_item predecessor without area (Scenario 2)', () => {
  test('"No area" fallback text visible in dep row when work item predecessor has no area', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new HouseholdItemDetailPage(page);

    let workItemId: string | null = null;
    let householdItemId: string | null = null;

    const wiTitle = `${testPrefix} Dep WI No Area`;
    const hiName = `${testPrefix} HI Dep Test 2`;

    try {
      // Work item with no area
      workItemId = await createWorkItemViaApi(page, { title: wiTitle });
      householdItemId = await createHouseholdItemViaApi(page, { name: hiName });

      await createHouseholdItemDepViaApi(page, householdItemId, {
        predecessorType: 'work_item',
        predecessorId: workItemId,
      });

      await detailPage.goto(householdItemId);
      await expect(detailPage.heading).toBeVisible();

      const depList = page.getByRole('list').filter({ has: page.locator('[class*="depRow"]') });
      await expect(depList).toBeVisible();

      const depRow = depList.locator('[class*="depRow"]').filter({ hasText: wiTitle });
      await expect(depRow).toBeVisible();

      // "No area" muted text rendered by AreaBreadcrumb when area is null
      await expect(depRow.getByText('No area', { exact: true })).toBeVisible();
    } finally {
      if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: milestone predecessor → no breadcrumb in milestone dep row
// ─────────────────────────────────────────────────────────────────────────────

test.describe('HI dependency — milestone predecessor has no breadcrumb (Scenario 3)', () => {
  test('Milestone dep row does not contain a compact breadcrumb', async ({ page, testPrefix }) => {
    const detailPage = new HouseholdItemDetailPage(page);

    let milestoneId: number | null = null;
    let householdItemId: string | null = null;

    const milestoneTitle = `${testPrefix} Dep Milestone`;
    const hiName = `${testPrefix} HI Dep Test 3`;

    try {
      milestoneId = await createMilestoneViaApi(page, {
        title: milestoneTitle,
        targetDate: '2026-12-31',
      });
      householdItemId = await createHouseholdItemViaApi(page, { name: hiName });

      await createHouseholdItemDepViaApi(page, householdItemId, {
        predecessorType: 'milestone',
        predecessorId: String(milestoneId),
      });

      await detailPage.goto(householdItemId);
      await expect(detailPage.heading).toBeVisible();

      const depList = page.getByRole('list').filter({ has: page.locator('[class*="depRow"]') });
      await expect(depList).toBeVisible();

      // The milestone dep row — identified by the milestone title text
      const depRow = depList.locator('[class*="depRow"]').filter({ hasText: milestoneTitle });
      await expect(depRow).toBeVisible();

      // Milestone rows render a <span class*="depPredLabel"> — no AreaBreadcrumb
      const breadcrumbSpan = depRow.locator('[class*="compact"]');
      await expect(breadcrumbSpan).not.toBeVisible();

      // Also confirm "No area" is not present for milestone rows
      await expect(depRow.getByText('No area', { exact: true })).not.toBeVisible();
    } finally {
      if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
      if (milestoneId) await deleteMilestoneViaApi(page, milestoneId);
    }
  });
});
