/**
 * E2E tests for the Schedule calendar (#2198, EPIC-21 P0.7)
 *
 * Scenarios covered (all data is synthetic, served through a mocked GET /api/timeline):
 * 1. A multi-week task renders as one labelled segment per week row, and nothing spills out of
 *    its week row (AC1)
 * 2. Phone week view: day columns align with their headers, segments stay tappable (AC2)
 * 3. Colour follows the status, not the id; the tooltip names the area; keyboard focus opens the
 *    tooltip (AC3)
 * 4. Empty calendar shows an empty state with an "Add a task" link (AC5)
 * 5. Calendar milestones open the milestone page (WRK-117)
 *
 * The tooltip content of the Schedule chart (Company, Waits for / Holds up) lives in
 * schedule-tooltip-company-direction.spec.ts.
 */

import { test, expect } from '../../fixtures/auth.js';
import { TimelinePage } from '../../pages/TimelinePage.js';
import type { Locator } from '@playwright/test';
import {
  buildTimeline,
  dayOfCurrentMonth,
  daysFromToday,
  isoLocal,
  mockMilestone,
  mockPurchase,
  mockWorkItem,
} from '../../fixtures/timelineMocks.js';

/** Index of the month-grid week row (Sunday first) that holds `day` of the current month. */
function weekRowIndexOfDay(day: number): number {
  const now = new Date();
  const startDow = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  return Math.floor((day - 1 + startDow) / 7);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: segments stay in their week row
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Calendar week segments (Scenario 1)', { tag: '@responsive' }, () => {
  test('A long task is one labelled segment per week row and nothing overflows its row', async ({
    page,
  }) => {
    const timelinePage = new TimelinePage(page);
    const longTitle = 'Test Long Renovation';
    const busyDay = 10;

    const expectedSegments = weekRowIndexOfDay(24) - weekRowIndexOfDay(3) + 1;

    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          mockWorkItem({
            id: 'test-long-task',
            title: longTitle,
            status: 'in_progress',
            startDate: dayOfCurrentMonth(3),
            endDate: dayOfCurrentMonth(24),
            durationDays: 22,
          }),
          ...[1, 2, 3, 4].map((n) =>
            mockWorkItem({
              id: `test-single-${n}`,
              title: `Test Single Day Task ${n}`,
              status: 'not_started',
              startDate: dayOfCurrentMonth(busyDay),
              endDate: dayOfCurrentMonth(busyDay),
              durationDays: 1,
            }),
          ),
        ],
        milestones: [
          mockMilestone({
            id: 501,
            title: 'Test Busy Milestone',
            targetDate: dayOfCurrentMonth(busyDay),
          }),
        ],
        householdItems: [
          mockPurchase({
            id: 'test-purchase-1',
            name: 'Test Sofa',
            targetDeliveryDate: dayOfCurrentMonth(busyDay),
          }),
          mockPurchase({
            id: 'test-purchase-2',
            name: 'Test Lamp',
            status: 'scheduled',
            targetDeliveryDate: dayOfCurrentMonth(busyDay),
          }),
        ],
      }),
    );

    try {
      await timelinePage.gotoCalendar();

      const segments = timelinePage.calendarItems.filter({ hasText: longTitle });
      await expect(segments).toHaveCount(expectedSegments);

      // Every segment carries the title and the same accessible label
      const labels: Array<string | null> = [];
      for (const segment of await segments.all()) {
        await expect(segment).toContainText(longTitle);
        labels.push(await segment.getAttribute('aria-label'));
      }
      expect(labels[0]).toContain(longTitle);
      expect(new Set(labels).size).toBe(1);

      // The busy week really does hold the stacked content (guards against a vacuous pass)
      const rows = await timelinePage.calendarWeekRows.all();
      expect(rows.length).toBeGreaterThanOrEqual(4);
      const busyRow = rows[weekRowIndexOfDay(busyDay)]!;
      await expect(busyRow.getByTestId('calendar-hi-item')).toHaveCount(2);
      await expect(busyRow.getByTestId('calendar-milestone')).toHaveCount(1);

      // Nothing inside a week row spills past the row's top or bottom edge
      for (const [rowIdx, row] of rows.entries()) {
        const rowBox = await row.boundingBox();
        expect(rowBox, `week row ${rowIdx} has a box`).not.toBeNull();
        const contents: Locator[] = [
          ...(await row.getByTestId('calendar-item').all()),
          ...(await row.getByTestId('calendar-hi-item').all()),
          ...(await row.getByTestId('calendar-milestone').all()),
        ];
        for (const content of contents) {
          const box = await content.boundingBox();
          expect(box, `content in week row ${rowIdx} has a box`).not.toBeNull();
          expect(box!.y, `content top in week row ${rowIdx}`).toBeGreaterThanOrEqual(rowBox!.y - 1);
          expect(box!.y + box!.height, `content bottom in week row ${rowIdx}`).toBeLessThanOrEqual(
            rowBox!.y + rowBox!.height + 1,
          );
        }
      }
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: phone week view alignment
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Calendar week view on a phone (Scenario 2)', { tag: '@responsive' }, () => {
  test('Day columns align with their headers and the segment is tappable', async ({ page }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    test.skip(viewportWidth >= 768, 'Phone layout only');

    const timelinePage = new TimelinePage(page);
    const title = 'TestUnbrokenTitle'.repeat(4);

    // Monday to Wednesday of the displayed (current) week; weeks start on Sunday
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1);
    const wednesday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2);

    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          mockWorkItem({
            id: 'test-unbroken-task',
            title,
            startDate: isoLocal(monday),
            endDate: isoLocal(wednesday),
            durationDays: 3,
          }),
        ],
      }),
    );

    try {
      await timelinePage.gotoCalendar();
      await timelinePage.calendarWeekButton.click();
      await expect(timelinePage.calendarWeekButton).toHaveAttribute('aria-pressed', 'true');

      const grid = page.getByRole('grid');
      const headers = grid.getByRole('columnheader');
      const cells = grid.getByRole('gridcell');
      await expect(headers).toHaveCount(7);
      await expect(cells).toHaveCount(7);

      for (let i = 0; i < 7; i++) {
        const headerBox = await headers.nth(i).boundingBox();
        const cellBox = await cells.nth(i).boundingBox();
        expect(headerBox, `column header ${i} has a box`).not.toBeNull();
        expect(cellBox, `grid cell ${i} has a box`).not.toBeNull();
        expect(Math.abs(headerBox!.x - cellBox!.x), `column ${i} x offset`).toBeLessThanOrEqual(1);
        expect(
          Math.abs(headerBox!.width - cellBox!.width),
          `column ${i} width difference`,
        ).toBeLessThanOrEqual(1);
      }

      const segment = timelinePage.calendarItems.filter({ hasText: title }).first();
      await expect(segment).toBeVisible();
      const segmentBox = await segment.boundingBox();
      expect(segmentBox!.height).toBeGreaterThanOrEqual(44);
      expect(segmentBox!.width).toBeGreaterThanOrEqual(44);

      // The long unbroken title does not push the page sideways
      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: colour by status, area in the tooltip, keyboard tooltip
// (not tagged @responsive: hover and focus tooltips are checked on desktop only)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Calendar status colours and tooltips (Scenario 3)', () => {
  const area = {
    id: 'test-area-kitchen',
    name: 'Test Kitchen',
    color: null,
    ancestors: [{ id: 'test-area-root', name: 'Test House', color: null }],
  };

  test('Items are coloured by status, not by id', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    const single = (id: string, title: string, day: number, status: 'in_progress' | 'completed') =>
      mockWorkItem({
        id,
        title,
        status,
        startDate: dayOfCurrentMonth(day),
        endDate: dayOfCurrentMonth(day),
        durationDays: 1,
      });

    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          single('test-id-aaa', 'Test Progress A', 5, 'in_progress'),
          single('test-id-zzz-9', 'Test Progress B', 6, 'in_progress'),
          single('test-id-mmm-42', 'Test Progress C', 7, 'in_progress'),
          single('test-id-done', 'Test Finished', 8, 'completed'),
        ],
      }),
    );

    try {
      await timelinePage.gotoCalendar();

      const itemFor = (title: string): Locator =>
        timelinePage.calendarItems.filter({ hasText: title }).first();
      const colourOf = async (title: string): Promise<string> => {
        const item = itemFor(title);
        await expect(item).toBeVisible();
        return item.evaluate((el) => getComputedStyle(el).backgroundColor);
      };

      const a = await colourOf('Test Progress A');
      const b = await colourOf('Test Progress B');
      const c = await colourOf('Test Progress C');
      const done = await colourOf('Test Finished');
      expect(b).toBe(a);
      expect(c).toBe(a);
      expect(done).not.toBe(a);

      await expect(itemFor('Test Progress A')).toHaveAttribute('data-status', 'in_progress');
      await expect(itemFor('Test Finished')).toHaveAttribute('data-status', 'completed');
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test('A task tooltip names the area, and so does its label', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          mockWorkItem({
            id: 'test-kitchen-task',
            title: 'Test Kitchen Task',
            startDate: dayOfCurrentMonth(12),
            endDate: dayOfCurrentMonth(12),
            durationDays: 1,
            area,
          }),
        ],
      }),
    );

    try {
      await timelinePage.gotoCalendar();

      const item = timelinePage.calendarItems.filter({ hasText: 'Test Kitchen Task' }).first();
      await expect(item).toBeVisible();
      await expect(item).toHaveAttribute(
        'aria-label',
        /Test Kitchen Task.*In progress.*Test Kitchen/,
      );

      await item.hover();
      await expect(timelinePage.tooltip).toBeVisible();
      await expect(timelinePage.tooltipArea).toContainText('Test House › Test Kitchen');
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test('A purchase tooltip shows the status word and the area', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await timelinePage.mockTimeline(
      buildTimeline({
        householdItems: [
          mockPurchase({
            id: 'test-garage-purchase',
            name: 'Test Workbench',
            status: 'purchased',
            targetDeliveryDate: dayOfCurrentMonth(14),
            area: {
              id: 'test-area-garage',
              name: 'Test Garage',
              color: null,
              ancestors: [{ id: 'test-area-root', name: 'Test House', color: null }],
            },
          }),
        ],
      }),
    );

    try {
      await timelinePage.gotoCalendar();

      const chip = timelinePage.calendarPurchases.filter({ hasText: 'Test Workbench' }).first();
      await expect(chip).toBeVisible();
      await expect(chip).toHaveAttribute('aria-label', /Test Workbench.*Ordered.*Test Garage/);

      await chip.hover();
      await expect(timelinePage.tooltip).toBeVisible();
      // The status is the word in the header, not a separate "Status" row
      await expect(timelinePage.tooltip).toContainText('Ordered');
      await expect(timelinePage.tooltip).not.toContainText('Status');
      await expect(timelinePage.tooltipArea).toContainText('Test House › Test Garage');
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test('Focusing an item with the keyboard shows its tooltip', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          mockWorkItem({
            id: 'test-keyboard-task',
            title: 'Test Keyboard Task',
            startDate: dayOfCurrentMonth(9),
            endDate: dayOfCurrentMonth(9),
            durationDays: 1,
            area,
          }),
        ],
      }),
    );

    try {
      await timelinePage.gotoCalendar();

      const item = timelinePage.calendarItems.filter({ hasText: 'Test Keyboard Task' }).first();
      await expect(item).toBeVisible();
      // Tab until the item has focus (the toolbar controls come first)
      for (let i = 0; i < 30; i++) {
        if (await item.evaluate((el) => el === document.activeElement)) break;
        await page.keyboard.press('Tab');
      }
      await expect(item).toBeFocused();

      await expect(timelinePage.tooltip).toBeVisible();
      await expect(timelinePage.tooltip).toContainText('Test Keyboard Task');

      // Moving focus away closes it again
      await page.keyboard.press('Tab');
      await expect(timelinePage.tooltip).toBeHidden();
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: empty calendar
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Calendar empty state (Scenario 4)', { tag: '@responsive' }, () => {
  test('Nothing scheduled shows the empty state with a link to add a task', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildTimeline());

    try {
      await timelinePage.gotoCalendar();

      await expect(timelinePage.calendarEmpty).toBeVisible();
      await expect(timelinePage.calendarEmpty).toContainText('Nothing is scheduled yet');
      await expect(page.getByRole('grid')).toHaveCount(0);

      const addTask = timelinePage.calendarEmpty.getByRole('link', { name: 'Add a task' });
      await expect(addTask).toHaveAttribute('href', '/project/work-items/new');

      // The toolbar still works on an empty calendar
      const monthLabel = await timelinePage.getCalendarPeriodLabel();
      await timelinePage.calendarNext();
      await expect(timelinePage.calendarPeriodLabel).not.toHaveText(monthLabel ?? '');
      await expect(timelinePage.calendarEmpty).toBeVisible();

      await timelinePage.calendarWeekButton.click();
      await expect(timelinePage.calendarWeekButton).toHaveAttribute('aria-pressed', 'true');
      await expect(timelinePage.calendarEmpty).toBeVisible();
      await expect(page.getByRole('grid')).toHaveCount(0);

      await addTask.click();
      await page.waitForURL(/\/project\/work-items\/new$/);
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: milestones open the milestone page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Calendar milestone navigation (Scenario 5)', () => {
  test('Clicking a calendar milestone opens the milestone page', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await timelinePage.mockTimeline(
      buildTimeline({
        milestones: [
          mockMilestone({ id: 77, title: 'Test Roof Milestone', targetDate: daysFromToday(0) }),
        ],
      }),
    );

    try {
      await timelinePage.gotoCalendar();

      const milestone = timelinePage.calendarMilestones.filter({ hasText: 'Test Roof Milestone' });
      await expect(milestone.first()).toBeVisible();
      await milestone.first().click();

      await page.waitForURL(/\/project\/milestones\/77$/);
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});
