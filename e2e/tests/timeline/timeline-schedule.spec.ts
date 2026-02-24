/**
 * E2E tests for the Auto-schedule feature on the Timeline page (/timeline)
 *
 * Scenarios covered:
 * 1.  Auto-schedule button opens the preview dialog (mocked schedule response)
 * 2.  Dialog shows count of affected work items
 * 3.  Cancel discards changes and closes dialog
 * 4.  Confirm applies changes and closes dialog
 * 5.  Dialog disabled confirm button when no changes (all items already optimal)
 * 6.  Error state when schedule API fails
 */

import { test, expect } from '../../fixtures/auth.js';
import { TimelinePage, TIMELINE_ROUTE } from '../../pages/TimelinePage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock data helpers
// ─────────────────────────────────────────────────────────────────────────────

const today = new Date();
const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

const MOCK_TIMELINE_WITH_ITEMS = {
  workItems: [
    {
      id: 'schedule-item-1',
      title: 'Foundation Work',
      status: 'not_started',
      startDate,
      endDate,
      durationDays: 30,
      dependencies: [],
      assignedUser: null,
      isCriticalPath: true,
    },
    {
      id: 'schedule-item-2',
      title: 'Framing',
      status: 'not_started',
      startDate,
      endDate,
      durationDays: 30,
      dependencies: ['schedule-item-1'],
      assignedUser: null,
      isCriticalPath: false,
    },
  ],
  dependencies: [{ fromId: 'schedule-item-1', toId: 'schedule-item-2', type: 'finish_to_start' }],
  criticalPath: ['schedule-item-1'],
  milestones: [],
  dateRange: { earliest: startDate, latest: endDate },
};

const MOCK_SCHEDULE_RESPONSE_WITH_CHANGES = {
  scheduledItems: [
    {
      workItemId: 'schedule-item-1',
      previousStartDate: startDate,
      previousEndDate: endDate,
      scheduledStartDate: startDate,
      scheduledEndDate: endDate,
    },
    {
      workItemId: 'schedule-item-2',
      previousStartDate: startDate,
      previousEndDate: endDate,
      scheduledStartDate: endDate, // changed — pushed out after item-1
      scheduledEndDate: new Date(today.getFullYear(), today.getMonth() + 2, 0)
        .toISOString()
        .slice(0, 10),
    },
  ],
};

const MOCK_SCHEDULE_RESPONSE_NO_CHANGES = {
  scheduledItems: [
    {
      workItemId: 'schedule-item-1',
      previousStartDate: startDate,
      previousEndDate: endDate,
      scheduledStartDate: startDate,
      scheduledEndDate: endDate,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Auto-schedule dialog opens
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Auto-schedule dialog opens (Scenario 1)', () => {
  test('Auto-schedule button is visible in Gantt view', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await expect(timelinePage.autoScheduleButton).toBeVisible();
    await expect(timelinePage.autoScheduleButton).toContainText('Auto-schedule');
  });

  test('Auto-schedule button is NOT visible in Calendar view', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    await expect(timelinePage.autoScheduleButton).not.toBeVisible();
  });

  test('Clicking Auto-schedule calls POST /api/schedule and opens the dialog', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_TIMELINE_WITH_ITEMS),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/schedule', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SCHEDULE_RESPONSE_WITH_CHANGES),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      await timelinePage.openAutoScheduleDialog();

      await expect(timelinePage.autoScheduleDialog).toBeVisible();
      await expect(timelinePage.autoScheduleDialog).toHaveAttribute('role', 'dialog');
      await expect(timelinePage.autoScheduleDialog).toHaveAttribute('aria-modal', 'true');
    } finally {
      await page.unroute('**/api/timeline');
      await page.unroute('**/api/schedule');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Dialog shows affected items count
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dialog shows affected item count (Scenario 2)', () => {
  test('Dialog description mentions the count of items with date changes', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_TIMELINE_WITH_ITEMS),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/schedule', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SCHEDULE_RESPONSE_WITH_CHANGES),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();
      await timelinePage.openAutoScheduleDialog();

      // Dialog body should contain the count of changed items
      const dialogText = await timelinePage.autoScheduleDialog.textContent();
      expect(dialogText).toContain('1 work item'); // 1 item changed (schedule-item-2)
    } finally {
      await page.unroute('**/api/timeline');
      await page.unroute('**/api/schedule');
    }
  });

  test('Dialog title is "Auto-Schedule Preview"', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_TIMELINE_WITH_ITEMS),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/schedule', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SCHEDULE_RESPONSE_WITH_CHANGES),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();
      await timelinePage.openAutoScheduleDialog();

      await expect(
        timelinePage.autoScheduleDialog.getByRole('heading', {
          name: /Auto-Schedule Preview/i,
        }),
      ).toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
      await page.unroute('**/api/schedule');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Cancel discards changes
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Cancel auto-schedule (Scenario 3)', () => {
  test('Clicking Cancel closes the dialog without making changes', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_TIMELINE_WITH_ITEMS),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/schedule', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SCHEDULE_RESPONSE_WITH_CHANGES),
        });
      } else {
        await route.continue();
      }
    });

    // Track whether any PATCH requests are made
    const patchRequests: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'PATCH') {
        patchRequests.push(req.url());
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();
      await timelinePage.openAutoScheduleDialog();
      await expect(timelinePage.autoScheduleDialog).toBeVisible();

      // Cancel
      await timelinePage.autoScheduleCancelButton.click();
      await timelinePage.autoScheduleDialog.waitFor({ state: 'hidden' });

      // Dialog closed, no PATCH requests made
      expect(patchRequests).toHaveLength(0);
      await expect(timelinePage.autoScheduleDialog).not.toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
      await page.unroute('**/api/schedule');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Confirm applies changes
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Confirm auto-schedule (Scenario 4)', () => {
  test('Clicking Confirm sends PATCH requests and closes the dialog', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_TIMELINE_WITH_ITEMS),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/schedule', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SCHEDULE_RESPONSE_WITH_CHANGES),
        });
      } else {
        await route.continue();
      }
    });

    // Mock the PATCH endpoint
    await page.route('**/api/work-items/**', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'schedule-item-2' }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();
      await timelinePage.openAutoScheduleDialog();
      await expect(timelinePage.autoScheduleDialog).toBeVisible();

      // Confirm button text should mention the number of changes
      await expect(timelinePage.autoScheduleConfirmButton).toContainText('Apply');
      await expect(timelinePage.autoScheduleConfirmButton).not.toBeDisabled();

      // Click confirm
      const patchPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/work-items/') && resp.request().method() === 'PATCH',
      );
      await timelinePage.autoScheduleConfirmButton.click();
      await patchPromise;

      await timelinePage.autoScheduleDialog.waitFor({ state: 'hidden' });
      await expect(timelinePage.autoScheduleDialog).not.toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
      await page.unroute('**/api/schedule');
      await page.unroute('**/api/work-items/**');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Confirm button disabled when no changes
// ─────────────────────────────────────────────────────────────────────────────

test.describe('No changes — confirm disabled (Scenario 5)', () => {
  test('Confirm button is disabled when schedule produces no date changes', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_TIMELINE_WITH_ITEMS),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/schedule', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SCHEDULE_RESPONSE_NO_CHANGES),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();
      await timelinePage.openAutoScheduleDialog();

      // Dialog says no changes needed
      const dialogText = await timelinePage.autoScheduleDialog.textContent();
      expect(dialogText).toContain('No date changes are needed');

      // Confirm button should be disabled
      await expect(timelinePage.autoScheduleConfirmButton).toBeDisabled();
    } finally {
      await page.unroute('**/api/timeline');
      await page.unroute('**/api/schedule');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Error state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Schedule API error (Scenario 6)', () => {
  test('Error message shown when schedule API returns 500', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_TIMELINE_WITH_ITEMS),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/schedule', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'INTERNAL_ERROR', message: 'Scheduling engine failed' },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      // Click auto-schedule button
      await timelinePage.autoScheduleButton.click();

      // Wait for the error to appear (no dialog, an inline error)
      const scheduleError = page.locator('[class*="scheduleError"]');
      await scheduleError.waitFor({ state: 'visible' });

      // Dialog should NOT appear
      await expect(timelinePage.autoScheduleDialog).not.toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
      await page.unroute('**/api/schedule');
    }
  });

  test('Auto-schedule button has accessible label', async ({ page }) => {
    await page.goto(TIMELINE_ROUTE);
    const timelinePage = new TimelinePage(page);
    await timelinePage.heading.waitFor({ state: 'visible' });

    const ariaLabel = await timelinePage.autoScheduleButton.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel).toMatch(/auto-schedule/i);
  });
});
