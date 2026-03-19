/**
 * Page Object Model for the Schedule page (/schedule)
 *
 * The Schedule page hosts:
 *   - A page header with h1 "Schedule" and a toolbar
 *   - Gantt chart view (default): sidebar + scrollable SVG chart
 *   - Calendar view: month/week grids with navigation
 *
 * Note: Milestones now have their own dedicated page at /project/milestones.
 * The Gantt chart still renders milestone diamond markers from the timeline API.
 *
 * DOM observations (from TimelinePage.tsx, GanttChart.tsx, etc.):
 *   - Page root: data-testid="timeline-page"
 *   - Gantt chart: data-testid="gantt-chart", role="img"
 *   - Gantt SVG: data-testid="gantt-svg"
 *   - Gantt sidebar: data-testid="gantt-sidebar"
 *   - Sidebar rows list: role="list", aria-label="Work items and milestones"
 *   - Sidebar row: data-testid="gantt-sidebar-row-{id}"
 *   - Gantt header: data-testid="gantt-header"
 *   - Gantt skeleton: data-testid="gantt-chart-skeleton"
 *   - Work item bars group: role="list", aria-label="Work item bars"
 *   - Milestone diamond: data-testid="gantt-milestone-diamond"
 *   - Milestones layer: data-testid="gantt-milestones-layer"
 *   - Tooltip: data-testid="gantt-tooltip"
 *   - Calendar view: data-testid="calendar-view"
 *   - Timeline empty: data-testid="timeline-empty"
 *   - Timeline no-dates: data-testid="timeline-no-dates"
 *   - Timeline error: data-testid="timeline-error"
 */

import type { Page, Locator } from '@playwright/test';

export const TIMELINE_ROUTE = '/schedule/gantt';

export class TimelinePage {
  readonly page: Page;

  // ── Page header ────────────────────────────────────────────────────────────
  readonly heading: Locator;

  // ── Toolbar controls ───────────────────────────────────────────────────────
  /** Arrows toggle button. */
  readonly arrowsToggleButton: Locator;
  /** Zoom toolbar (role=toolbar, aria-label="Zoom level"). */
  readonly zoomToolbar: Locator;
  /** Gantt view toggle button. */
  readonly ganttViewButton: Locator;
  /** Calendar view toggle button. */
  readonly calendarViewButton: Locator;
  /**
   * "Add" dropdown trigger button (data-testid="timeline-add-button").
   * Previously labelled "New" — renamed in issue #1050.
   */
  readonly addButton: Locator;

  // ── Chart area states ──────────────────────────────────────────────────────
  /** Gantt chart container. */
  readonly ganttChart: Locator;
  /** Gantt chart SVG element. */
  readonly ganttSvg: Locator;
  /** Gantt chart skeleton (loading state). */
  readonly ganttSkeleton: Locator;
  /** Empty state: no work items at all. */
  readonly emptyState: Locator;
  /** Empty state: work items exist but none have dates. */
  readonly noDatesState: Locator;
  /** Error banner. */
  readonly errorBanner: Locator;

  // ── Gantt sidebar ─────────────────────────────────────────────────────────
  readonly ganttSidebar: Locator;
  readonly ganttSidebarRowsList: Locator;
  readonly ganttHeader: Locator;

  // ── Gantt bars ─────────────────────────────────────────────────────────────
  /** SVG group containing all work item bars. */
  readonly ganttBarsGroup: Locator;

  // ── Gantt milestones ───────────────────────────────────────────────────────
  readonly ganttMilestonesLayer: Locator;
  readonly ganttMilestoneDiamonds: Locator;

  // ── Tooltip ────────────────────────────────────────────────────────────────
  readonly tooltip: Locator;

  // ── Calendar view ──────────────────────────────────────────────────────────
  readonly calendarView: Locator;
  readonly calendarMonthButton: Locator;
  readonly calendarWeekButton: Locator;
  readonly calendarPrevButton: Locator;
  readonly calendarNextButton: Locator;
  readonly calendarTodayButton: Locator;
  readonly calendarPeriodLabel: Locator;
  readonly calendarGridArea: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page header
    this.heading = page.getByRole('heading', { level: 1, name: 'Schedule', exact: true });

    // Toolbar controls
    this.arrowsToggleButton = page.getByLabel(/dependency arrows/i);
    this.zoomToolbar = page.getByRole('toolbar', { name: 'Zoom level' });
    this.ganttViewButton = page.getByTestId('schedule-view-gantt');
    this.calendarViewButton = page.getByTestId('schedule-view-calendar');
    this.addButton = page.getByTestId('timeline-add-button');

    // Chart area states
    this.ganttChart = page.getByTestId('gantt-chart');
    this.ganttSvg = page.getByTestId('gantt-svg');
    this.ganttSkeleton = page.getByTestId('gantt-chart-skeleton');
    this.emptyState = page.getByTestId('timeline-empty');
    this.noDatesState = page.getByTestId('timeline-no-dates');
    this.errorBanner = page.getByTestId('timeline-error');

    // Gantt sidebar
    this.ganttSidebar = page.getByTestId('gantt-sidebar');
    // Updated in EPIC-18: aria-label now includes household items
    this.ganttSidebarRowsList = page.getByRole('list', {
      name: 'Work items, milestones, and household items',
    });
    this.ganttHeader = page.getByTestId('gantt-header');

    // Gantt bars
    this.ganttBarsGroup = page.getByRole('list', { name: 'Work item bars' });

    // Milestones on chart
    this.ganttMilestonesLayer = page.getByTestId('gantt-milestones-layer');
    this.ganttMilestoneDiamonds = page.getByTestId('gantt-milestone-diamond');

    // Tooltip
    this.tooltip = page.getByTestId('gantt-tooltip');

    // Calendar view
    this.calendarView = page.getByTestId('calendar-view');
    this.calendarMonthButton = page.getByRole('button', { name: 'Month', exact: true });
    this.calendarWeekButton = page.getByRole('button', { name: 'Week', exact: true });
    this.calendarPrevButton = page.getByLabel(/Previous month|Previous week/);
    this.calendarNextButton = page.getByLabel(/Next month|Next week/);
    // i18n: button label is now just "Today" (from calendar.navigation.today in schedule.json)
    this.calendarTodayButton = page.getByLabel('Today');
    this.calendarPeriodLabel = page.locator('[class*="periodLabel"]');
    this.calendarGridArea = page.locator('[class*="gridArea"]');
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  /** Navigate to the Schedule page and wait for the heading. */
  async goto(): Promise<void> {
    await this.page.goto(TIMELINE_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Navigate to schedule in calendar view. */
  async gotoCalendar(): Promise<void> {
    await this.page.goto('/schedule/calendar');
    await this.heading.waitFor({ state: 'visible' });
    await this.calendarView.waitFor({ state: 'visible' });
  }

  /**
   * Wait for either the Gantt chart or empty/no-dates state to become visible,
   * indicating the data load has completed.
   */
  async waitForLoaded(): Promise<void> {
    await Promise.race([
      this.ganttChart.waitFor({ state: 'visible' }),
      this.emptyState.waitFor({ state: 'visible' }),
      this.noDatesState.waitFor({ state: 'visible' }),
      this.calendarView.waitFor({ state: 'visible' }),
    ]);
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────

  /** Click a zoom level button ('Day', 'Week', or 'Month'). */
  async setZoom(level: 'Day' | 'Week' | 'Month'): Promise<void> {
    await this.zoomToolbar.getByRole('button', { name: level, exact: true }).click();
  }

  /** Returns the currently active zoom level label. */
  async getActiveZoom(): Promise<string | null> {
    const buttons = await this.zoomToolbar.getByRole('button').all();
    for (const btn of buttons) {
      const pressed = await btn.getAttribute('aria-pressed');
      if (pressed === 'true') {
        return btn.textContent();
      }
    }
    return null;
  }

  // ── View toggle ────────────────────────────────────────────────────────────

  /** Switch to Calendar view. */
  async switchToCalendar(): Promise<void> {
    await this.calendarViewButton.click();
    await this.calendarView.waitFor({ state: 'visible' });
  }

  /** Switch to Gantt view. */
  async switchToGantt(): Promise<void> {
    await this.ganttViewButton.click();
    await Promise.race([
      this.ganttChart.waitFor({ state: 'visible' }),
      this.emptyState.waitFor({ state: 'visible' }),
      this.noDatesState.waitFor({ state: 'visible' }),
    ]);
  }

  // ── Arrows toggle ─────────────────────────────────────────────────────────

  /** Toggle dependency arrows on/off and return the new pressed state. */
  async toggleArrows(): Promise<boolean> {
    await this.arrowsToggleButton.click();
    const pressed = await this.arrowsToggleButton.getAttribute('aria-pressed');
    return pressed === 'true';
  }

  /** Returns whether dependency arrows are currently shown. */
  async arrowsVisible(): Promise<boolean> {
    const pressed = await this.arrowsToggleButton.getAttribute('aria-pressed');
    return pressed === 'true';
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────

  /** Returns the text labels of all sidebar rows. */
  async getSidebarItemLabels(): Promise<string[]> {
    const rows = await this.ganttSidebarRowsList.getByRole('listitem').all();
    const labels: string[] = [];
    for (const row of rows) {
      const label = await row.getAttribute('aria-label');
      if (label) labels.push(label);
    }
    return labels;
  }

  // ── Calendar view helpers ─────────────────────────────────────────────────

  /** Navigate to the previous month/week in calendar view. */
  async calendarPrev(): Promise<void> {
    await this.calendarPrevButton.click();
  }

  /** Navigate to the next month/week in calendar view. */
  async calendarNext(): Promise<void> {
    await this.calendarNextButton.click();
  }

  /** Click the "Today" button in calendar view. */
  async calendarGoToToday(): Promise<void> {
    await this.calendarTodayButton.click();
  }

  /** Get the current period label text (e.g. "March 2024" or "Mar 4–10, 2024"). */
  async getCalendarPeriodLabel(): Promise<string | null> {
    return this.calendarPeriodLabel.textContent();
  }
}
