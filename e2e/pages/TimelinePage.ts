/**
 * Page Object Model for the Timeline page (/timeline)
 *
 * The Timeline page hosts:
 *   - A page header with h1 "Timeline" and a toolbar
 *   - Gantt chart view (default): sidebar + scrollable SVG chart
 *   - Calendar view: month/week grids with navigation
 *   - Milestone panel (slide-in dialog via portal)
 *   - Auto-schedule confirmation dialog
 *
 * DOM observations (from TimelinePage.tsx, GanttChart.tsx, etc.):
 *   - Page root: data-testid="timeline-page"
 *   - Gantt chart: data-testid="gantt-chart", role="img"
 *   - Gantt SVG: data-testid="gantt-svg"
 *   - Gantt sidebar: data-testid="gantt-sidebar"
 *   - Sidebar rows list: role="list", aria-label="Work items"
 *   - Sidebar row: data-testid="gantt-sidebar-row-{id}"
 *   - Gantt header: data-testid="gantt-header"
 *   - Gantt skeleton: data-testid="gantt-chart-skeleton"
 *   - Work item bars group: role="list", aria-label="Work item bars"
 *   - Milestone diamond: data-testid="gantt-milestone-diamond"
 *   - Milestones layer: data-testid="gantt-milestones-layer"
 *   - Tooltip: data-testid="gantt-tooltip"
 *   - Auto-schedule button: data-testid="auto-schedule-button"
 *   - Auto-schedule dialog: data-testid="auto-schedule-dialog"
 *   - Auto-schedule confirm: data-testid="auto-schedule-confirm"
 *   - Milestone panel button: data-testid="milestones-panel-button"
 *   - Milestone filter button: data-testid="milestone-filter-button"
 *   - Milestone filter dropdown: data-testid="milestone-filter-dropdown"
 *   - Milestone panel: data-testid="milestone-panel" (portal on body)
 *   - Milestone list empty: data-testid="milestone-list-empty"
 *   - Milestone list item: data-testid="milestone-list-item"
 *   - Milestone new button: data-testid="milestone-new-button"
 *   - Milestone form: data-testid="milestone-form"
 *   - Milestone form submit: data-testid="milestone-form-submit"
 *   - Milestone delete confirm: data-testid="milestone-delete-confirm"
 *   - Calendar view: data-testid="calendar-view"
 *   - Timeline empty: data-testid="timeline-empty"
 *   - Timeline no-dates: data-testid="timeline-no-dates"
 *   - Timeline error: data-testid="timeline-error"
 */

import type { Page, Locator } from '@playwright/test';

export const TIMELINE_ROUTE = '/timeline';

export class TimelinePage {
  readonly page: Page;

  // ── Page header ────────────────────────────────────────────────────────────
  readonly heading: Locator;

  // ── Toolbar controls ───────────────────────────────────────────────────────
  /** Auto-schedule button (Gantt view only). */
  readonly autoScheduleButton: Locator;
  /** Arrows toggle button. */
  readonly arrowsToggleButton: Locator;
  /** Zoom toolbar (role=toolbar, aria-label="Zoom level"). */
  readonly zoomToolbar: Locator;
  /** Gantt view toggle button. */
  readonly ganttViewButton: Locator;
  /** Calendar view toggle button. */
  readonly calendarViewButton: Locator;
  /** Milestones panel open button. */
  readonly milestonePanelButton: Locator;

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

  // ── Auto-schedule dialog ───────────────────────────────────────────────────
  readonly autoScheduleDialog: Locator;
  readonly autoScheduleConfirmButton: Locator;
  readonly autoScheduleCancelButton: Locator;

  // ── Milestone panel (portal) ───────────────────────────────────────────────
  readonly milestonePanel: Locator;
  readonly milestonePanelCloseButton: Locator;
  readonly milestoneListEmpty: Locator;
  readonly milestoneListItems: Locator;
  readonly milestoneNewButton: Locator;
  readonly milestoneForm: Locator;
  readonly milestoneFormSubmit: Locator;
  readonly milestoneNameInput: Locator;
  readonly milestoneDateInput: Locator;
  readonly milestoneDescriptionInput: Locator;
  readonly milestoneDeleteConfirm: Locator;

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
    this.heading = page.getByRole('heading', { level: 1, name: 'Timeline', exact: true });

    // Toolbar controls
    this.autoScheduleButton = page.getByTestId('auto-schedule-button');
    this.arrowsToggleButton = page.getByLabel(/dependency arrows/i);
    this.zoomToolbar = page.getByRole('toolbar', { name: 'Zoom level' });
    this.ganttViewButton = page.getByLabel('Gantt view');
    this.calendarViewButton = page.getByLabel('Calendar view');
    this.milestonePanelButton = page.getByTestId('milestones-panel-button');

    // Chart area states
    this.ganttChart = page.getByTestId('gantt-chart');
    this.ganttSvg = page.getByTestId('gantt-svg');
    this.ganttSkeleton = page.getByTestId('gantt-chart-skeleton');
    this.emptyState = page.getByTestId('timeline-empty');
    this.noDatesState = page.getByTestId('timeline-no-dates');
    this.errorBanner = page.getByTestId('timeline-error');

    // Gantt sidebar
    this.ganttSidebar = page.getByTestId('gantt-sidebar');
    this.ganttSidebarRowsList = page.getByRole('list', { name: 'Work items' });
    this.ganttHeader = page.getByTestId('gantt-header');

    // Gantt bars
    this.ganttBarsGroup = page.getByRole('list', { name: 'Work item bars' });

    // Milestones on chart
    this.ganttMilestonesLayer = page.getByTestId('gantt-milestones-layer');
    this.ganttMilestoneDiamonds = page.getByTestId('gantt-milestone-diamond');

    // Tooltip
    this.tooltip = page.getByTestId('gantt-tooltip');

    // Auto-schedule dialog
    this.autoScheduleDialog = page.getByTestId('auto-schedule-dialog');
    this.autoScheduleConfirmButton = page.getByTestId('auto-schedule-confirm');
    this.autoScheduleCancelButton = this.autoScheduleDialog.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });

    // Milestone panel (portal — attached to body, not inside page root)
    this.milestonePanel = page.getByTestId('milestone-panel');
    this.milestonePanelCloseButton = this.milestonePanel.getByLabel('Close milestones panel');
    this.milestoneListEmpty = page.getByTestId('milestone-list-empty');
    this.milestoneListItems = page.getByTestId('milestone-list-item');
    this.milestoneNewButton = page.getByTestId('milestone-new-button');
    this.milestoneForm = page.getByTestId('milestone-form');
    this.milestoneFormSubmit = page.getByTestId('milestone-form-submit');
    this.milestoneNameInput = page.locator('#milestone-title');
    this.milestoneDateInput = page.locator('#milestone-target-date');
    this.milestoneDescriptionInput = page.locator('#milestone-description');
    this.milestoneDeleteConfirm = page.getByTestId('milestone-delete-confirm');

    // Calendar view
    this.calendarView = page.getByTestId('calendar-view');
    this.calendarMonthButton = page.getByRole('button', { name: 'Month', exact: true });
    this.calendarWeekButton = page.getByRole('button', { name: 'Week', exact: true });
    this.calendarPrevButton = page.getByLabel(/Previous month|Previous week/);
    this.calendarNextButton = page.getByLabel(/Next month|Next week/);
    this.calendarTodayButton = page.getByLabel('Go to today');
    this.calendarPeriodLabel = page.locator('[class*="periodLabel"]');
    this.calendarGridArea = page.locator('[class*="gridArea"]');
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  /** Navigate to the Timeline page and wait for the heading. */
  async goto(): Promise<void> {
    await this.page.goto(TIMELINE_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Navigate to timeline in calendar view. */
  async gotoCalendar(): Promise<void> {
    await this.page.goto(`${TIMELINE_ROUTE}?view=calendar`);
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

  // ── Auto-schedule ─────────────────────────────────────────────────────────

  /**
   * Click the Auto-schedule button and wait for the preview dialog to appear.
   * Registers a network response listener before clicking to avoid races.
   */
  async openAutoScheduleDialog(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/schedule') && resp.status() === 200,
    );
    await this.autoScheduleButton.click();
    await responsePromise;
    await this.autoScheduleDialog.waitFor({ state: 'visible' });
  }

  /** Confirm the auto-schedule dialog and wait for it to close. */
  async confirmAutoSchedule(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/work-items/') && resp.request().method() === 'PATCH',
    );
    await this.autoScheduleConfirmButton.click();
    await responsePromise;
    await this.autoScheduleDialog.waitFor({ state: 'hidden' });
  }

  /** Cancel the auto-schedule dialog. */
  async cancelAutoSchedule(): Promise<void> {
    await this.autoScheduleCancelButton.click();
    await this.autoScheduleDialog.waitFor({ state: 'hidden' });
  }

  // ── Milestone panel ────────────────────────────────────────────────────────

  /** Open the milestones panel and wait for it to appear. */
  async openMilestonePanel(): Promise<void> {
    await this.milestonePanelButton.click();
    await this.milestonePanel.waitFor({ state: 'visible' });
  }

  /** Close the milestones panel. */
  async closeMilestonePanel(): Promise<void> {
    await this.milestonePanelCloseButton.click();
    await this.milestonePanel.waitFor({ state: 'hidden' });
  }

  /**
   * Create a milestone via the panel UI.
   * Assumes the panel is already open and in list view.
   */
  async createMilestoneViaPanel(title: string, date: string, description?: string): Promise<void> {
    await this.milestoneNewButton.click();
    await this.milestoneForm.waitFor({ state: 'visible' });
    await this.milestoneNameInput.fill(title);
    await this.milestoneDateInput.fill(date);
    if (description) {
      await this.milestoneDescriptionInput.fill(description);
    }
    const saveResponsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/milestones') && resp.status() === 201,
    );
    await this.milestoneFormSubmit.click();
    await saveResponsePromise;
    // After save, the form should close and return to list view
    await this.milestoneForm.waitFor({ state: 'hidden' });
  }

  /**
   * Delete the first milestone in the list that matches the given title.
   * Assumes the panel is open and in list view.
   */
  async deleteMilestoneByTitle(title: string): Promise<void> {
    const items = await this.milestoneListItems.all();
    for (const item of items) {
      const text = await item.textContent();
      if (text?.includes(title)) {
        const deleteBtn = item.getByLabel(`Delete ${title}`);
        await deleteBtn.click();
        // Confirm in the delete dialog
        await this.milestoneDeleteConfirm.waitFor({ state: 'visible' });
        const deleteResponsePromise = this.page.waitForResponse(
          (resp) => resp.url().includes('/api/milestones') && resp.request().method() === 'DELETE',
        );
        await this.milestoneDeleteConfirm.click();
        await deleteResponsePromise;
        return;
      }
    }
    throw new Error(`Milestone with title "${title}" not found in panel`);
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
