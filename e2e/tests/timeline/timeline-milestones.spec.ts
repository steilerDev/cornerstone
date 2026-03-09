/**
 * E2E tests for Milestone markers on the Gantt chart (/schedule)
 *
 * Scenarios covered:
 * 1.  Milestone diamond markers appear on the Gantt chart
 * 2.  Milestone diamond has correct aria-label
 *
 * Note: Milestone CRUD tests are in the milestones/ test directory,
 * since milestones now have their own dedicated page at /project/milestones.
 */

import { test, expect } from '../../fixtures/auth.js';
import { TimelinePage } from '../../pages/TimelinePage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Milestone diamond markers on the Gantt chart
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestone diamond markers on Gantt', () => {
  test('Milestone diamond markers appear on the Gantt chart when milestones exist', async ({
    page,
  }) => {
    const timelinePage = new TimelinePage(page);

    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    // Mock timeline data with a milestone
    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workItems: [
              {
                id: 'milestone-chart-item',
                title: 'Milestone Chart Item',
                status: 'not_started',
                startDate,
                endDate,
                durationDays: 30,
                dependencies: [],
                assignedUser: null,
                isCriticalPath: false,
              },
            ],
            dependencies: [],
            criticalPath: [],
            milestones: [
              {
                id: 1,
                title: 'Foundation Complete',
                targetDate: endDate,
                isCompleted: false,
                completedAt: null,
                workItemIds: [],
              },
            ],
            dateRange: { earliest: startDate, latest: endDate },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      // Milestones layer should exist
      await expect(timelinePage.ganttMilestonesLayer).toBeVisible();
      // Diamond markers should be present
      await expect(timelinePage.ganttMilestoneDiamonds.first()).toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
    }
  });

  test('Milestone diamond has correct aria-label', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    const today = new Date();
    const targetDate = new Date(today.getFullYear(), today.getMonth() + 1, 15)
      .toISOString()
      .slice(0, 10);
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workItems: [
              {
                id: 'aria-item',
                title: 'ARIA Test Item',
                status: 'not_started',
                startDate,
                endDate: targetDate,
                durationDays: 30,
                dependencies: [],
                assignedUser: null,
                isCriticalPath: false,
              },
            ],
            dependencies: [],
            criticalPath: [],
            milestones: [
              {
                id: 42,
                title: 'Phase 1 Done',
                targetDate,
                isCompleted: false,
                completedAt: null,
                workItemIds: [],
              },
            ],
            dateRange: { earliest: startDate, latest: targetDate },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      const diamond = timelinePage.ganttMilestoneDiamonds.first();
      await expect(diamond).toBeVisible();

      const ariaLabel = await diamond.getAttribute('aria-label');
      expect(ariaLabel).toContain('Phase 1 Done');
      expect(ariaLabel).toContain('incomplete');
    } finally {
      await page.unroute('**/api/timeline');
    }
  });
});
