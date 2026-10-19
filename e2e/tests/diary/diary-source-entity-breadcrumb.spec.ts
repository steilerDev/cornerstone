/**
 * E2E tests for the diary entry source entity section (Story #1271), reworked for #2223.
 *
 * #2223 removed the nested "Related to" source section (source link and area breadcrumb) from
 * system events: the event row carries one "Open <object>" link instead. This file now guards the
 * removal, so the area breadcrumb cannot silently come back on automatic entries:
 *
 *   Scenario 1: work_item event for a task with an area -> link row only, no source section
 *   Scenario 2: work_item event for a task without an area -> link row only, no "No area" text
 *   Scenario 3: invoice event (mock) -> "Open invoice" link, no source section
 *
 * Scenarios 1 and 2 trigger the real event by patching the work item status.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createAreaViaApi,
  deleteAreaViaApi,
} from '../../fixtures/apiHelpers.js';
import { mockSystemEvent } from '../../fixtures/systemEventMocks.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: patch work item status to trigger automatic diary entry
// ─────────────────────────────────────────────────────────────────────────────

async function patchWorkItemStatus(page: Page, workItemId: string, status: string): Promise<void> {
  const response = await page.request.patch(`${API.workItems}/${workItemId}`, {
    data: { status },
  });
  expect(response.ok(), `PATCH work item ${workItemId} status to ${status}`).toBeTruthy();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: find the automatic diary entry created for a given work item ID
// ─────────────────────────────────────────────────────────────────────────────

async function findAutoDiaryEntryId(page: Page, workItemId: string): Promise<string> {
  // GET /api/diary-entries uses "type" query param (not "entryType") for filtering
  const response = await page.request.get(`${API.diaryEntries}?type=work_item_status&pageSize=50`);
  expect(response.ok(), 'GET diary entries for work_item_status').toBeTruthy();
  const body = (await response.json()) as {
    items: Array<{ id: string; sourceEntityId: string | null }>;
  };
  const found = body.items.find((e) => e.sourceEntityId === workItemId);
  if (!found) {
    throw new Error(`No automatic diary entry found for workItemId=${workItemId}`);
  }
  return found.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: work_item source with area → compact breadcrumb visible
// ─────────────────────────────────────────────────────────────────────────────

test.describe('System event link — work_item with area (Scenario 1)', () => {
  test('Event detail shows the link row and no source section or area breadcrumb for a task with an area', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);

    let rootAreaId: string | null = null;
    let childAreaId: string | null = null;
    let workItemId: string | null = null;

    const rootName = `${testPrefix} Roof`;
    const childName = `${testPrefix} Attic`;
    const wiTitle = `${testPrefix} Diary WI With Area`;

    try {
      rootAreaId = await createAreaViaApi(page, { name: rootName });
      childAreaId = await createAreaViaApi(page, { name: childName, parentId: rootAreaId });
      workItemId = await createWorkItemViaApi(page, {
        title: wiTitle,
        areaId: childAreaId,
        // Start with not_started so we can change it to trigger auto event
        status: 'not_started',
      });

      // Trigger automatic diary entry by changing work item status
      await patchWorkItemStatus(page, workItemId, 'in_progress');

      // Find the generated diary entry
      const diaryEntryId = await findAutoDiaryEntryId(page, workItemId);

      await detailPage.goto(diaryEntryId);
      await expect(detailPage.loaded).toBeVisible();

      await expect(detailPage.systemEventLink(diaryEntryId)).toHaveText(/Open task/);
      await expect(detailPage.sourceSection).toHaveCount(0);
      await expect(page.getByText(childName)).toHaveCount(0);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (childAreaId) await deleteAreaViaApi(page, childAreaId);
      if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: work_item source without area → "No area" text visible
// ─────────────────────────────────────────────────────────────────────────────

test.describe('System event link — work_item without area (Scenario 2)', () => {
  test('Event detail shows the link row and no "No area" text for a task without an area', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);

    let workItemId: string | null = null;

    const wiTitle = `${testPrefix} Diary WI No Area`;

    try {
      // Work item with no area
      workItemId = await createWorkItemViaApi(page, {
        title: wiTitle,
        status: 'not_started',
      });

      // Trigger automatic diary entry
      await patchWorkItemStatus(page, workItemId, 'in_progress');

      const diaryEntryId = await findAutoDiaryEntryId(page, workItemId);

      await detailPage.goto(diaryEntryId);
      await expect(detailPage.loaded).toBeVisible();

      await expect(detailPage.systemEventLink(diaryEntryId)).toHaveText(/Open task/);
      await expect(detailPage.sourceSection).toHaveCount(0);
      await expect(page.getByText('No area', { exact: true })).toHaveCount(0);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: non-work_item source → no breadcrumb in source section
// ─────────────────────────────────────────────────────────────────────────────

test.describe('System event link — invoice source (Scenario 3)', () => {
  test('An invoice event shows "Open invoice" and no source section', async ({ page }) => {
    const detailPage = new DiaryEntryDetailPage(page);

    // Use a mock to test a non-work_item source type (e.g., invoice_status)
    // The AreaBreadcrumb is only rendered when sourceEntityType === 'work_item'.
    const mockId = 'mock-diary-invoice-source-001';
    const mockEntry = mockSystemEvent({
      id: mockId,
      entryType: 'invoice_status',
      entryDate: '2026-01-15',
      createdAt: '2026-01-15T09:00:00.000Z',
      sourceEntityType: 'invoice',
      sourceEntityId: 'invoice-001',
      sourceEntityTitle: 'INV-001',
      metadata: {
        v: 1,
        event: 'status_changed',
        from: 'pending',
        to: 'paid',
        subjectLabel: 'INV-001',
      },
    });

    await page.route(`**/api/photos*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ photos: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`${API.diaryEntries}/${mockId}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockEntry),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await detailPage.goto(mockId);
      await expect(detailPage.loaded).toBeVisible();

      await expect(detailPage.systemEventLink(mockId)).toHaveText(/Open invoice/);
      await expect(detailPage.sourceSection).toHaveCount(0);
    } finally {
      await page.unroute(`${API.diaryEntries}/${mockId}`);
      await page.unroute('**/api/photos*');
    }
  });
});
