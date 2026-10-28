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
 *   - Gantt chart: data-testid="gantt-chart", role="group" (#2247)
 *   - Gantt SVG: data-testid="gantt-svg"
 *   - Gantt sidebar: data-testid="gantt-sidebar"
 *   - Sidebar rows list: role="list", aria-label="Tasks, milestones and purchases"
 *   - Sidebar row: data-testid="gantt-sidebar-row-{id}" on the row <button> (#2247)
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

import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { AppShellPage } from './AppShellPage.js';
import type { TimelineResponse } from '@cornerstone/shared';
import { routeUrl } from '../../shared/src/routes/index.js';

export const TIMELINE_ROUTE = routeUrl('scheduleGantt');

export class TimelinePage {
  readonly page: Page;

  // ── Page header ────────────────────────────────────────────────────────────
  /** Gantt view h1 "Schedule" (the Calendar view's h1 is `calendarHeading`). */
  readonly heading: Locator;
  /** Calendar view h1 "Calendar" (#2202). */
  readonly calendarHeading: Locator;

  // ── Toolbar controls (#2247) ───────────────────────────────────────────────
  /** Day / Week / Month segmented group (role=group, aria-label="Zoom"). */
  readonly zoomToolbar: Locator;
  /** The toolbar group (aria-label="Schedule tools"). */
  readonly toolbar: Locator;
  /** Show ▾ menu button; its accessible name reads "Show" or "Show · n changed". */
  readonly showTrigger: Locator;
  readonly showMenu: Locator;
  /** Group ▾ menu button ("Group: Time" / "Group: Area"). */
  readonly groupTrigger: Locator;
  readonly groupMenu: Locator;
  /** Area chip: "All areas" or the chosen area's name. */
  readonly areaChip: Locator;
  /** The second "All areas" chip with ×, present only while an area is set. */
  readonly areaClear: Locator;
  /** The area picker dialog. */
  readonly areaPicker: Locator;
  readonly todayButton: Locator;
  readonly moreTrigger: Locator;
  readonly moreMenu: Locator;
  /** "Subscribe in calendar app" menu item. */
  readonly subscribeItem: Locator;
  readonly legendToggle: Locator;
  /** Legend strip (desktop/tablet) or bottom sheet (phone). */
  readonly legend: Locator;
  readonly legendDoneHidden: Locator;
  /** Phone-only Agenda / Chart switch. */
  readonly phoneViewAgenda: Locator;
  readonly phoneViewChart: Locator;
  /**
   * Schedule (Gantt) view entry (#2205: replaces the in-page tab row). >= 1024px: the sidebar
   * link; below 1024px (#2207): the item in the title menu, which exists only while the menu
   * is open, so call `AppShellPage.revealViews()` before asserting visibility.
   */
  get ganttViewButton(): Locator {
    return new AppShellPage(this.page).viewLink('scheduleGantt');
  }
  /** Calendar view entry (see `ganttViewButton`). */
  get calendarViewButton(): Locator {
    return new AppShellPage(this.page).viewLink('scheduleCalendar');
  }
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
  /** Banner above the kept chart when a refetch failed (D19). */
  readonly refreshError: Locator;
  /** Everything is filtered out (Show / area). */
  readonly filteredEmpty: Locator;
  /** The phone agenda. */
  readonly agenda: Locator;
  /** Today chip in the chart header. */
  readonly todayChip: Locator;
  /** The vertical today line in the chart grid. */
  readonly todayMarker: Locator;

  // ── Item panel (docked aside or Sheet) ─────────────────────────────────────
  readonly panel: Locator;
  readonly panelClose: Locator;
  /** Dim layer behind the Sheet (absent while the panel is docked). */
  readonly panelBackdrop: Locator;
  readonly panelOpenLink: Locator;
  readonly panelStatus: Locator;
  readonly panelSignal: Locator;
  readonly panelCritical: Locator;
  readonly panelWhen: Locator;
  readonly panelWho: Locator;
  readonly panelCompany: Locator;
  readonly panelCall: Locator;
  readonly panelWaitsFor: Locator;
  readonly panelHoldsUp: Locator;
  readonly panelHoldsUpFigure: Locator;
  readonly panelReschedule: Locator;
  readonly rescheduleBack: Locator;

  // ── Reschedule view inside the panel ───────────────────────────────────────
  readonly reschedule: Locator;
  readonly rescheduleStart: Locator;
  readonly rescheduleEnd: Locator;
  readonly rescheduleDuration: Locator;
  readonly reschedulePreview: Locator;
  readonly reschedulePreviewHoldsUp: Locator;
  readonly reschedulePreviewSummary: Locator;
  readonly rescheduleShowAll: Locator;
  readonly rescheduleRetry: Locator;
  readonly rescheduleSave: Locator;
  readonly rescheduleCancel: Locator;

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
  /** Empty state shown instead of the grid when nothing is scheduled (#2198). */
  readonly calendarEmpty: Locator;
  /** One per week row of the month grid. */
  readonly calendarWeekRows: Locator;
  /** Task segments (one per week row an item touches). */
  readonly calendarItems: Locator;
  /** Purchase chips. */
  readonly calendarPurchases: Locator;
  /** Milestone markers. */
  readonly calendarMilestones: Locator;

  // ── Tooltip rows (#2198) ───────────────────────────────────────────────────
  readonly tooltipCompany: Locator;
  readonly tooltipArea: Locator;
  readonly tooltipWaitsFor: Locator;
  readonly tooltipHoldsUp: Locator;
  /** The "Holds up n tasks" label inside the holds-up group (#2232). */
  readonly tooltipHoldsUpFigure: Locator;
  /** Late / Held up chip in the work-item tooltip (#2199). */
  readonly tooltipScheduleSignal: Locator;
  /** "Planned" dates row, rendered only when the forecast differs from the plan (#2199). */
  readonly tooltipPlanned: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page header
    this.heading = page.getByRole('heading', { level: 1, name: 'Schedule', exact: true });
    this.calendarHeading = page.getByRole('heading', { level: 1, name: 'Calendar', exact: true });

    // Toolbar controls
    this.zoomToolbar = page.getByTestId('schedule-zoom');
    this.toolbar = page.getByRole('group', { name: 'Schedule tools' });
    this.showTrigger = page.getByTestId('schedule-show-trigger');
    this.showMenu = page.getByTestId('schedule-show-menu');
    this.groupTrigger = page.getByTestId('schedule-group-trigger');
    this.groupMenu = page.getByTestId('schedule-group-menu');
    this.areaChip = page.getByTestId('schedule-area-area');
    this.areaClear = page.getByTestId('schedule-area-clear');
    this.areaPicker = page.getByTestId('schedule-area-picker');
    this.todayButton = page.getByTestId('schedule-today');
    this.moreTrigger = page.getByTestId('schedule-more-trigger');
    this.moreMenu = page.getByTestId('schedule-more-menu');
    this.subscribeItem = page.getByTestId('schedule-subscribe');
    this.legendToggle = page.getByTestId('schedule-legend-toggle');
    this.legend = page.getByTestId('schedule-legend');
    this.legendDoneHidden = page.getByTestId('schedule-legend-done-hidden');
    this.phoneViewAgenda = page.getByTestId('schedule-phone-view-agenda');
    this.phoneViewChart = page.getByTestId('schedule-phone-view-chart');

    // Chart area states
    this.ganttChart = page.getByTestId('gantt-chart');
    this.ganttSvg = page.getByTestId('gantt-svg');
    this.ganttSkeleton = page.getByTestId('gantt-chart-skeleton');
    this.emptyState = page.getByTestId('timeline-empty');
    this.noDatesState = page.getByTestId('timeline-no-dates');
    this.errorBanner = page.getByTestId('timeline-error');
    this.refreshError = page.getByTestId('schedule-refresh-error');
    this.filteredEmpty = page.getByTestId('schedule-filtered-empty');
    this.agenda = page.getByTestId('schedule-agenda');
    this.todayChip = page.getByTestId('gantt-today-chip');
    this.todayMarker = page.getByTestId('gantt-today-marker');

    // Item panel
    this.panel = page.getByTestId('schedule-panel');
    this.panelClose = page.getByTestId('schedule-panel-close');
    this.panelBackdrop = page.getByTestId('schedule-panel-backdrop');
    this.panelOpenLink = page.getByTestId('schedule-panel-open-link');
    this.panelStatus = page.getByTestId('schedule-panel-status');
    this.panelSignal = page.getByTestId('schedule-panel-signal');
    this.panelCritical = page.getByTestId('schedule-panel-critical');
    this.panelWhen = page.getByTestId('schedule-panel-when');
    this.panelWho = page.getByTestId('schedule-panel-who');
    this.panelCompany = page.getByTestId('schedule-panel-company');
    this.panelCall = page.getByTestId('schedule-panel-call');
    this.panelWaitsFor = page.getByTestId('schedule-panel-waits-for');
    this.panelHoldsUp = page.getByTestId('schedule-panel-holds-up');
    this.panelHoldsUpFigure = page.getByTestId('schedule-panel-holds-up-figure');
    this.panelReschedule = page.getByTestId('schedule-panel-reschedule');
    this.rescheduleBack = page.getByTestId('reschedule-back');

    // Reschedule view
    this.reschedule = page.getByTestId('reschedule-panel');
    this.rescheduleStart = page.getByTestId('reschedule-start');
    this.rescheduleEnd = page.getByTestId('reschedule-end');
    this.rescheduleDuration = page.getByTestId('reschedule-duration');
    this.reschedulePreview = page.getByTestId('reschedule-preview');
    this.reschedulePreviewHoldsUp = page.getByTestId('reschedule-preview-holds-up');
    this.reschedulePreviewSummary = page.getByTestId('reschedule-preview-summary');
    this.rescheduleShowAll = page.getByTestId('reschedule-show-all');
    this.rescheduleRetry = page.getByTestId('reschedule-retry');
    this.rescheduleSave = page.getByTestId('reschedule-save');
    this.rescheduleCancel = page.getByTestId('reschedule-cancel');

    // Gantt sidebar
    this.ganttSidebar = page.getByTestId('gantt-sidebar');
    this.ganttSidebarRowsList = page.getByRole('list', {
      name: 'Tasks, milestones and purchases',
    });
    this.ganttHeader = page.getByTestId('gantt-header');

    // Gantt bars
    this.ganttBarsGroup = page.getByRole('list', { name: 'Task bars' });

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
    this.calendarEmpty = page.getByTestId('calendar-empty');
    this.calendarWeekRows = page.getByTestId('calendar-week-row');
    this.calendarItems = page.getByTestId('calendar-item');
    this.calendarPurchases = page.getByTestId('calendar-hi-item');
    this.calendarMilestones = page.getByTestId('calendar-milestone');

    // Tooltip rows
    this.tooltipCompany = page.getByTestId('gantt-tooltip-company');
    this.tooltipArea = page.getByTestId('gantt-tooltip-area');
    this.tooltipWaitsFor = page.getByTestId('gantt-tooltip-waits-for');
    this.tooltipHoldsUp = page.getByTestId('gantt-tooltip-holds-up');
    this.tooltipHoldsUpFigure = this.tooltipHoldsUp.locator('[data-figure="holds-up"]');
    this.tooltipScheduleSignal = page.getByTestId('gantt-tooltip-schedule-signal');
    this.tooltipPlanned = page.getByTestId('gantt-tooltip-planned');
  }

  // ── Mocked data ────────────────────────────────────────────────────────────

  /**
   * Serve a synthetic `GET /api/timeline` response (other methods pass through).
   * Callers must call {@link unmockTimeline} in a `finally` block.
   */
  async mockTimeline(payload: TimelineResponse): Promise<void> {
    await this.page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(payload),
        });
      } else {
        await route.continue();
      }
    });
  }

  /** Remove the route installed by {@link mockTimeline}. */
  async unmockTimeline(): Promise<void> {
    await this.page.unroute('**/api/timeline');
  }

  // ── Sidebar row helpers ────────────────────────────────────────────────────

  /**
   * Return the sidebar row element for a specific work item by its ID.
   *
   * Sidebar rows for work items use data-testid="gantt-sidebar-row-{id}".
   * Used for assertions on title and breadcrumb content within the row.
   */
  ganttSidebarRow(workItemId: string): Locator {
    return this.page.getByTestId(`gantt-sidebar-row-${workItemId}`);
  }

  /**
   * Return the SVG bar group element for a specific work item by its ID.
   *
   * Gantt bars use data-testid="gantt-bar-{id}" on the SVG <g> element.
   * Used for hover assertions (tooltip) on the chart canvas.
   */
  ganttBar(workItemId: string): Locator {
    return this.page.getByTestId(`gantt-bar-${workItemId}`);
  }

  /** Calendar task segments whose accessible name (title, status, dates) mentions the title. */
  calendarItemByTitle(title: string): Locator {
    return this.calendarItems.and(this.page.locator(`[aria-label*="${title}"]`));
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  /** Navigate to the Schedule page and wait for the heading. */
  async goto(): Promise<void> {
    await this.page.goto(TIMELINE_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Navigate to schedule in calendar view. */
  async gotoCalendar(): Promise<void> {
    await this.page.goto(routeUrl('scheduleCalendar'));
    await this.calendarHeading.waitFor({ state: 'visible' });
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
      this.agenda.waitFor({ state: 'visible' }),
      this.filteredEmpty.waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Wait for the data and report which surface rendered: the phone agenda or the chart. Tests
   * branch on this, never on the viewport name.
   */
  async surface(): Promise<'agenda' | 'chart'> {
    await Promise.race([
      this.ganttChart.waitFor({ state: 'visible' }),
      this.agenda.waitFor({ state: 'visible' }),
    ]);
    return (await this.agenda.isVisible()) ? 'agenda' : 'chart';
  }

  /**
   * Make sure the chart is the rendered surface: on the phone the Agenda is the default and the
   * Chart is one tap away; elsewhere the chart is already there. Waits for the chart.
   */
  async showChart(): Promise<void> {
    if ((await this.surface()) === 'agenda') await this.phoneViewChart.click();
    await this.ganttChart.waitFor({ state: 'visible' });
  }

  /**
   * Forget the stored Schedule view (zoom, Show, Group, area, legend, phone view) of the
   * signed-in user, so a test starts from the defaults. Call it only for a dedicated
   * (isolated) user: the row is per user and shared by every concurrent test of the admin.
   */
  async resetViewPreference(): Promise<void> {
    await this.page.request.delete('/api/users/me/preferences/schedule.view');
  }

  /** The stored Schedule view as the server holds it (null = never saved). */
  async storedView(): Promise<Record<string, unknown> | null> {
    const response = await this.page.request.get('/api/users/me/preferences');
    const body = (await response.json()) as { preferences: Array<{ key: string; value: string }> };
    const pref = body.preferences.find((entry) => entry.key === 'schedule.view');
    return pref ? (JSON.parse(pref.value) as Record<string, unknown>) : null;
  }

  /** Whether the Today chip sits inside the canvas' visible width. */
  async todayInView(): Promise<boolean> {
    const chip = await this.todayChip.boundingBox();
    const canvas = await this.canvasScroll.boundingBox();
    if (!chip || !canvas) return false;
    return chip.x >= canvas.x - 1 && chip.x + chip.width <= canvas.x + canvas.width + 1;
  }

  /** Whether the item panel is the docked aside (>= 1440 px) rather than a Sheet. */
  async panelIsDocked(): Promise<boolean> {
    return this.page.locator('aside[data-testid="schedule-panel"]').isVisible();
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────

  /** Click a zoom level button ('Day', 'Week', or 'Month'). */
  async setZoom(level: 'Day' | 'Week' | 'Month'): Promise<void> {
    await this.zoomButton(level).click();
  }

  /** One zoom button. */
  zoomButton(level: 'Day' | 'Week' | 'Month'): Locator {
    return this.page.getByTestId(`schedule-zoom-${level.toLowerCase()}`);
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
    await new AppShellPage(this.page).revealViews();
    await this.calendarViewButton.click();
    await this.calendarView.waitFor({ state: 'visible' });
  }

  /** Switch to Gantt view. */
  async switchToGantt(): Promise<void> {
    await new AppShellPage(this.page).revealViews();
    await this.ganttViewButton.click();
    // The phone renders the Agenda instead of the chart (#2247)
    await Promise.race([
      this.ganttChart.waitFor({ state: 'visible' }),
      this.agenda.waitFor({ state: 'visible' }),
      this.emptyState.waitFor({ state: 'visible' }),
      this.noDatesState.waitFor({ state: 'visible' }),
      this.filteredEmpty.waitFor({ state: 'visible' }),
    ]);
  }

  // ── Show / Group / area menus ──────────────────────────────────────────────

  /** One Show ▾ item (role menuitemcheckbox). Keys: tasks, milestones, purchases, arrows, critical, done. */
  showItem(key: 'tasks' | 'milestones' | 'purchases' | 'arrows' | 'critical' | 'done'): Locator {
    return this.page.getByTestId(`schedule-show-${key}`);
  }

  /** Open the Show menu (a no-op when it is already open: a toggle can leave it open). */
  async openShowMenu(): Promise<void> {
    if (await this.showMenu.isVisible()) return;
    await this.showTrigger.click();
    await this.showMenu.waitFor({ state: 'visible' });
  }

  /** Click one Show item, opening the menu first when needed. */
  async toggleShow(
    key: 'tasks' | 'milestones' | 'purchases' | 'arrows' | 'critical' | 'done',
  ): Promise<void> {
    await this.openShowMenu();
    await this.showItem(key).click();
  }

  /** Close an open toolbar menu with Escape. */
  async closeMenus(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  /** Choose Group ▾ › Time or Area. */
  async setGroup(group: 'time' | 'area'): Promise<void> {
    if (!(await this.groupMenu.isVisible())) {
      await this.groupTrigger.click();
      await this.groupMenu.waitFor({ state: 'visible' });
    }
    await this.page.getByTestId(`schedule-group-${group}`).click();
  }

  /**
   * Open the area picker from the chip and pick one area. `name` is the option's accessible name:
   * the area's path ("Wing, Room" for a child). The picker is a Modal (wide) or a bottom Sheet, and
   * its result list is portaled, so everything is located page-wide.
   */
  async chooseArea(name: string): Promise<void> {
    await this.areaChip.click();
    const input = this.page.locator('input[aria-label="Show one area"]');
    await input.waitFor({ state: 'visible' });
    await input.fill(name.split(', ').pop()!);
    const option = this.page
      .locator('[data-search-picker-dropdown]')
      .getByRole('option', { name, exact: true });
    // A search answer can re-render the rows under the click: retry until the picker closes
    await expect(async () => {
      if (await input.isVisible()) await option.click();
      await expect(input).toBeHidden();
    }).toPass();
  }

  // ── Rows, panel and agenda ─────────────────────────────────────────────────

  /** A sidebar milestone row. */
  ganttSidebarMilestone(id: number | string): Locator {
    return this.page.getByTestId(`gantt-sidebar-milestone-${id}`);
  }

  /** A sidebar purchase row. */
  ganttSidebarPurchase(id: string): Locator {
    return this.page.getByTestId(`gantt-sidebar-hi-${id}`);
  }

  /** A diamond on the chart, found by its accessible name. */
  milestoneDiamond(title: string): Locator {
    return this.page
      .locator(`[data-testid="gantt-milestone-diamond"][aria-label*="${title}"]`)
      .first();
  }

  /** A delivery marker on the chart, found by its accessible name. */
  deliveryMarker(name: string): Locator {
    return this.page.locator(`[data-testid="gantt-hi-circle"][aria-label*="${name}"]`).first();
  }

  /** The group header button of an area group (or "none"). */
  groupHeader(groupId: string): Locator {
    return this.page.getByTestId(`gantt-group-${groupId}`);
  }

  /** The agenda row of a row key such as `task:<id>` (first week it appears in). */
  agendaRow(rowKey: string): Locator {
    return this.page.locator(`[data-testid^="schedule-agenda-row-${rowKey}-"]`).first();
  }

  /** Every week header of the agenda. */
  get agendaWeeks(): Locator {
    return this.page.locator('[data-testid^="schedule-agenda-week-"]');
  }

  /**
   * The list row of a subject on whichever surface rendered: the agenda row on the phone agenda,
   * the sidebar row button on the chart. `rowKey` is `task:<id>`, `milestone:<id>` or
   * `purchase:<id>`.
   */
  rowFor(rowKey: string): Locator {
    const colon = rowKey.indexOf(':');
    const kind = rowKey.slice(0, colon);
    const id = rowKey.slice(colon + 1);
    const sidebar =
      kind === 'task'
        ? this.ganttSidebarRow(id)
        : kind === 'milestone'
          ? this.ganttSidebarMilestone(id)
          : this.ganttSidebarPurchase(id);
    return this.agendaRow(rowKey).or(sidebar).first();
  }

  /** The list row of a task (see {@link rowFor}). */
  taskRow(id: string): Locator {
    return this.rowFor(`task:${id}`);
  }

  /** Click a row (any subject) and wait for the panel. */
  async openRowPanel(rowKey: string): Promise<void> {
    const row = this.rowFor(rowKey);
    await row.waitFor({ state: 'visible' });
    await row.click();
    await this.panel.waitFor({ state: 'visible' });
  }

  /** Click a task row and wait for the panel. */
  async openTaskPanel(id: string): Promise<void> {
    await this.openRowPanel(`task:${id}`);
  }

  /** From an open panel: follow "Open task" to the task page. */
  async openTaskPage(): Promise<void> {
    await this.panelOpenLink.click();
  }

  /** Close the panel with its close button. */
  async closePanel(): Promise<void> {
    await this.panelClose.click();
    await this.panel.waitFor({ state: 'hidden' });
  }

  /** A relation row in the panel's Waits for / Holds up lists. */
  panelRelation(rowKey: string): Locator {
    return this.page.getByTestId(`schedule-panel-relation-${rowKey}`);
  }

  /** The canvas scroller (the SVG's parent). */
  get canvasScroll(): Locator {
    return this.ganttSvg.locator('..');
  }

  /**
   * The label of the header cell under the canvas' left edge (the "date at the scroll
   * position") plus the raw offsets, so a test can note it and compare after a change.
   */
  async scrollPosition(): Promise<{ label: string; left: number; top: number }> {
    return this.canvasScroll.evaluate((canvas) => {
      const edge = canvas.getBoundingClientRect().left + 1;
      const cells = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="gantt-header"] > div'),
      );
      const hit = cells.find((cell) => {
        if (cell.getAttribute('data-testid') === 'gantt-today-chip') return false;
        const rect = cell.getBoundingClientRect();
        return rect.width > 0 && rect.left <= edge && rect.right > edge;
      });
      return {
        label: (hit?.textContent ?? '').trim(),
        left: canvas.scrollLeft,
        top: canvas.scrollTop,
      };
    });
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────

  /** Returns the text labels of all sidebar rows. */
  async getSidebarItemLabels(): Promise<string[]> {
    // The rows are <button aria-label> inside list items since #2247
    const rows = await this.ganttSidebarRowsList.locator('button[aria-label]').all();
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
