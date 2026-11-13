/**
 * E2E tests for the "Waits for" rows of the purchase page (Story #1273, reshaped by #2249)
 *
 * The old dependency list rendered a compact area breadcrumb under a task predecessor. On the
 * purchase page (Timing tab) a predecessor is a shared RelatedList row: the title links to the
 * task or milestone page, the muted fact line names the kind and its end date ("Task · date",
 * "Milestone · date"), a task row carries its status badge. A row shows no area path.
 *
 *   Scenario 1: work_item predecessor with an area -> a Task row that links to the task page,
 *               with no area path in the row
 *   Scenario 2: work_item predecessor without an area -> a Task row, no "No area" text
 *   Scenario 3: milestone predecessor -> a Milestone row that links to the milestone page,
 *               with no area path
 *
 * Setup path: create the purchase and the predecessor through the API, link them with
 * POST /api/household-items/:id/dependencies, open the Timing tab, read the row.
 *
 * The list renders on every viewport (rows, no responsive restructuring), so no @responsive tag.
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
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
// Scenario 1: work_item predecessor with area
// ─────────────────────────────────────────────────────────────────────────────

test.describe('HI dependency - work_item predecessor with area (Scenario 1)', () => {
  test('The Waits for row names the task, links to it and shows no area path', async ({
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

      await detailPage.goto(householdItemId, { tab: 'timing' });

      const row = detailPage.waitsFor.row(`work_item:${workItemId}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(wiTitle);
      await expect(row).toContainText('Task');
      await expect(detailPage.waitsFor.link(`work_item:${workItemId}`)).toHaveAttribute(
        'href',
        routeUrl('workItem', { id: workItemId }),
      );
      await expect(row).not.toContainText(rootName);
      await expect(row).not.toContainText(childName);
      await expect(row.locator('[class*="compact"]')).toHaveCount(0);
    } finally {
      if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (childAreaId) await deleteAreaViaApi(page, childAreaId);
      if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: work_item predecessor without area
// ─────────────────────────────────────────────────────────────────────────────

test.describe('HI dependency - work_item predecessor without area (Scenario 2)', () => {
  test('A task without an area is a plain Task row: no "No area" text', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new HouseholdItemDetailPage(page);

    let workItemId: string | null = null;
    let householdItemId: string | null = null;

    const wiTitle = `${testPrefix} Dep WI No Area`;
    const hiName = `${testPrefix} HI Dep Test 2`;

    try {
      workItemId = await createWorkItemViaApi(page, { title: wiTitle });
      householdItemId = await createHouseholdItemViaApi(page, { name: hiName });

      await createHouseholdItemDepViaApi(page, householdItemId, {
        predecessorType: 'work_item',
        predecessorId: workItemId,
      });

      await detailPage.goto(householdItemId, { tab: 'timing' });

      const row = detailPage.waitsFor.row(`work_item:${workItemId}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(wiTitle);
      await expect(row.getByText('No area', { exact: true })).toHaveCount(0);
    } finally {
      if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: milestone predecessor
// ─────────────────────────────────────────────────────────────────────────────

test.describe('HI dependency - milestone predecessor (Scenario 3)', () => {
  test('A milestone row says Milestone, links to the milestone page and has no area path', async ({
    page,
    testPrefix,
  }) => {
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

      await detailPage.goto(householdItemId, { tab: 'timing' });

      const row = detailPage.waitsFor.row(`milestone:${milestoneId}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(milestoneTitle);
      await expect(row).toContainText('Milestone');
      await expect(detailPage.waitsFor.link(`milestone:${milestoneId}`)).toHaveAttribute(
        'href',
        routeUrl('milestone', { id: milestoneId }),
      );
      await expect(row.locator('[class*="compact"]')).toHaveCount(0);
      await expect(row.getByText('No area', { exact: true })).toHaveCount(0);
    } finally {
      if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
      if (milestoneId) await deleteMilestoneViaApi(page, milestoneId);
    }
  });
});
