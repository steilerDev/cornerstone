/**
 * E2E tests for AreaBreadcrumb in diary entry source entity section (Story #1271)
 *
 * When a diary entry has sourceEntityType === 'work_item', the detail page renders a
 * compact AreaBreadcrumb below the source entity link. This test verifies:
 *
 *   Scenario 1: work_item source with area → compact breadcrumb with area name visible
 *   Scenario 2: work_item source without area → "No area" text visible in source section
 *   Scenario 3: non-work_item source → no compact breadcrumb in source section
 *
 * Automatic diary entries (sourceEntityType: 'work_item') are created by the server when
 * a work item's status changes via PATCH /api/work-items/:id. We trigger this in Scenarios
 * 1 and 2 by patching the work item status and then finding the resulting diary entry.
 *
 * Scenario 3 uses a mock response to avoid the complexity of triggering other automatic
 * event types (e.g. invoice_status) in a controlled manner.
 */

import { test, expect } from '../../fixtures/auth.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createAreaViaApi,
  deleteAreaViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: patch work item status to trigger automatic diary entry
// ─────────────────────────────────────────────────────────────────────────────

async function patchWorkItemStatus(
  page: import('@playwright/test').Page,
  workItemId: string,
  status: string,
): Promise<void> {
  const response = await page.request.patch(`${API.workItems}/${workItemId}`, {
    data: { status },
  });
  expect(response.ok(), `PATCH work item ${workItemId} status to ${status}`).toBeTruthy();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: find the automatic diary entry created for a given work item ID
// ─────────────────────────────────────────────────────────────────────────────

async function findAutoDiaryEntryId(
  page: import('@playwright/test').Page,
  workItemId: string,
): Promise<string> {
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

test.describe('Diary source entity — work_item with area (Scenario 1)', () => {
  test('Diary detail source section shows compact breadcrumb when work item has an area', async ({
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
      await expect(detailPage.backButton).toBeVisible();

      // Source section must be visible (sourceEntityType = 'work_item')
      await expect(detailPage.sourceSection).toBeVisible();

      // The compact breadcrumb is a span[class*="compact"] inside the source section
      const breadcrumbSpan = detailPage.sourceSection.locator('[class*="compact"]');
      await expect(breadcrumbSpan).toBeVisible();

      const breadcrumbText = await breadcrumbSpan.textContent();
      expect(breadcrumbText).toContain(rootName);
      expect(breadcrumbText).toContain(childName);
      // Separator character › (AreaBreadcrumb path separator)
      expect(breadcrumbText).toContain('›');
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

test.describe('Diary source entity — work_item without area (Scenario 2)', () => {
  test('"No area" fallback text visible in source section when work item has no area', async ({
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
      await expect(detailPage.backButton).toBeVisible();

      // Source section must be visible
      await expect(detailPage.sourceSection).toBeVisible();

      // Null area renders <span className={styles.muted}>No area</span> — not inside compact span.
      // AreaBreadcrumb returns the muted span directly when area === null.
      await expect(detailPage.sourceSection.getByText('No area', { exact: true })).toBeVisible();

      // No compact breadcrumb span should be present when area is null
      // (AreaBreadcrumb only renders [class*="compact"] when area !== null)
      await expect(detailPage.sourceSection.locator('[class*="compact"]')).not.toBeVisible();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: non-work_item source → no breadcrumb in source section
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Diary source entity — non-work_item source (Scenario 3)', () => {
  test('No compact breadcrumb in source section for non-work_item source entity type', async ({
    page,
  }) => {
    const detailPage = new DiaryEntryDetailPage(page);

    // Use a mock to test a non-work_item source type (e.g., invoice_status)
    // The AreaBreadcrumb is only rendered when sourceEntityType === 'work_item'.
    const mockId = 'mock-diary-invoice-source-001';
    const mockEntry = {
      id: mockId,
      entryType: 'invoice_status',
      entryDate: '2026-01-15',
      title: '[Invoice] Status changed to paid',
      body: 'Invoice #INV-001 status changed from pending to paid.',
      metadata: {
        changeSummary: 'Status changed from pending to paid.',
        previousValue: 'pending',
        newValue: 'paid',
      },
      isAutomatic: true,
      isSigned: false,
      sourceEntityType: 'invoice',
      sourceEntityId: 'invoice-001',
      sourceEntityTitle: '#INV-001',
      sourceEntityArea: null,
      photoCount: 0,
      createdBy: null,
      createdAt: '2026-01-15T09:00:00.000Z',
      updatedAt: '2026-01-15T09:00:00.000Z',
    };

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
      await expect(detailPage.backButton).toBeVisible();

      // Source section must be visible (there IS a source entity)
      await expect(detailPage.sourceSection).toBeVisible();

      // But no compact breadcrumb — AreaBreadcrumb is only rendered for work_item sourceType
      const breadcrumbSpan = detailPage.sourceSection.locator('[class*="compact"]');
      await expect(breadcrumbSpan).not.toBeVisible();
    } finally {
      await page.unroute(`${API.diaryEntries}/${mockId}`);
      await page.unroute('**/api/photos*');
    }
  });
});
