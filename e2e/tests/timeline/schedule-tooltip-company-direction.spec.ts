/**
 * E2E tests for the Schedule chart tooltip (#2198, AC4)
 *
 * Scenarios covered (synthetic data, mocked GET /api/timeline):
 * 1. A task assigned to a company shows a "Company" row; a task assigned to a person shows
 *    "Owner" and no company row
 * 2. Dependencies are grouped by direction: "Waits for" (what must finish first) and
 *    "Holds up" (what is waiting on this task), with no "Dependencies" / "Blocks" / "Downstream"
 *    wording
 *
 * Hover tooltips on the Gantt chart are a desktop-only interaction.
 */

import { test, expect } from '../../fixtures/auth.js';
import { TimelinePage } from '../../pages/TimelinePage.js';
import {
  buildTimeline,
  dayOfCurrentMonth,
  mockDependency,
  mockWorkItem,
} from '../../fixtures/timelineMocks.js';

const A = { id: 'test-tooltip-a', title: 'Test Tiling Task' };
const B = { id: 'test-tooltip-b', title: 'Test Painting Task' };
const C = { id: 'test-tooltip-c', title: 'Test Cleanup Task' };

test.describe('Schedule tooltip company and dependency direction (Scenario 1 + 2)', () => {
  test.beforeEach(({ page }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    test.skip(viewportWidth < 1200, 'Gantt tooltips on hover are desktop-only');
  });

  async function mockThreeTasks(timelinePage: TimelinePage): Promise<void> {
    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          mockWorkItem({
            ...A,
            startDate: dayOfCurrentMonth(2),
            endDate: dayOfCurrentMonth(5),
            durationDays: 4,
            assignedVendor: { id: 'test-company-1', name: 'Sample Tiling Ltd', trade: null },
          }),
          mockWorkItem({
            ...B,
            startDate: dayOfCurrentMonth(8),
            endDate: dayOfCurrentMonth(11),
            durationDays: 4,
            assignedUser: {
              id: 'test-user-1',
              displayName: 'Alex Example',
              email: 'alex@example.test',
            },
          }),
          mockWorkItem({
            ...C,
            status: 'not_started',
            startDate: dayOfCurrentMonth(14),
            endDate: dayOfCurrentMonth(16),
            durationDays: 3,
          }),
        ],
        dependencies: [mockDependency(A.id, B.id), mockDependency(B.id, C.id)],
      }),
    );
  }

  test('D-33: A task in the middle shows its owner, what it waits for and what it holds up', async ({
    page,
  }) => {
    const timelinePage = new TimelinePage(page);
    await mockThreeTasks(timelinePage);

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      const bar = timelinePage.ganttBar(B.id);
      await bar.waitFor({ state: 'visible' });
      await bar.hover();

      await expect(timelinePage.tooltip).toBeVisible();
      await expect(timelinePage.tooltip).toContainText('Owner');
      await expect(timelinePage.tooltip).toContainText('Alex Example');
      await expect(timelinePage.tooltipCompany).toHaveCount(0);

      await expect(timelinePage.tooltipWaitsFor).toContainText('Waits for');
      await expect(timelinePage.tooltipWaitsFor).toContainText(A.title);
      await expect(timelinePage.tooltipHoldsUp).toContainText('Holds up');
      await expect(timelinePage.tooltipHoldsUp).toContainText(C.title);
      // Each group lists only its own direction
      await expect(timelinePage.tooltipWaitsFor).not.toContainText(C.title);
      await expect(timelinePage.tooltipHoldsUp).not.toContainText(A.title);

      await expect(timelinePage.tooltip).not.toContainText(/Dependencies|Blocks|Downstream/);
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test('D-33: A task for a company shows the company and only a "Holds up" group', async ({
    page,
  }) => {
    const timelinePage = new TimelinePage(page);
    await mockThreeTasks(timelinePage);

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      const bar = timelinePage.ganttBar(A.id);
      await bar.waitFor({ state: 'visible' });
      await bar.hover();

      await expect(timelinePage.tooltip).toBeVisible();
      await expect(timelinePage.tooltipCompany).toContainText('Company');
      await expect(timelinePage.tooltipCompany).toContainText('Sample Tiling Ltd');
      // A company-assigned task has no owner row
      await expect(timelinePage.tooltip).not.toContainText('Owner');

      await expect(timelinePage.tooltipHoldsUp).toContainText(B.title);
      await expect(timelinePage.tooltipWaitsFor).toHaveCount(0);

      await expect(timelinePage.tooltip).not.toContainText(/Dependencies|Blocks|Downstream/);
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});
