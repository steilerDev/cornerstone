/**
 * @jest-environment jsdom
 *
 * Smoke tests for TimelinePage — verifies the page renders without crashing
 * in a router context. Comprehensive tests for the Gantt chart functionality
 * are owned by the qa-integration-tester agent.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ownNavigations } from '../../test/navLandmarks.js';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import type * as TimelineApiTypes from '../../lib/timelineApi.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type { TimelineResponse } from '@cornerstone/shared';
import type React from 'react';
import { LocaleProvider } from '../../contexts/LocaleContext.js';

/** Renders the current router location pathname into a data-testid for navigation assertions. */
function LocationDisplay() {
  const location = useLocation();
  const type = useNavigationType();
  return (
    <>
      <div data-testid="location-display">{location.pathname}</div>
      <div data-testid="location-type">{type}</div>
      <div data-testid="location-state">{JSON.stringify(location.state)}</div>
    </>
  );
}

const mockGetTimeline = jest.fn<typeof TimelineApiTypes.getTimeline>();

jest.unstable_mockModule('../../lib/timelineApi.js', () => ({
  getTimeline: mockGetTimeline,
}));

// Mock milestonesApi so useMilestones doesn't make real network calls.
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
  getMilestone: jest.fn<typeof MilestonesApiTypes.getMilestone>(),
  createMilestone: jest.fn<typeof MilestonesApiTypes.createMilestone>(),
  updateMilestone: jest.fn<typeof MilestonesApiTypes.updateMilestone>(),
  deleteMilestone: jest.fn<typeof MilestonesApiTypes.deleteMilestone>(),
  linkWorkItem: jest.fn<typeof MilestonesApiTypes.linkWorkItem>(),
  unlinkWorkItem: jest.fn<typeof MilestonesApiTypes.unlinkWorkItem>(),
  addDependentWorkItem: jest.fn<typeof MilestonesApiTypes.addDependentWorkItem>(),
  removeDependentWorkItem: jest.fn<typeof MilestonesApiTypes.removeDependentWorkItem>(),
}));

// Mock useToast so TimelinePage can render without a ToastProvider wrapper.
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({
    toasts: [],
    showToast: jest.fn(),
    dismissToast: jest.fn(),
  }),
}));

const EMPTY_TIMELINE: TimelineResponse = {
  workItems: [],
  dependencies: [],
  milestones: [],
  householdItems: [],
  criticalPath: [],
  dateRange: null,
};

describe('TimelinePage', () => {
  let TimelinePage: React.ComponentType;
  let parseFilterParam: (raw: string | null) => ReadonlySet<string>;
  let serializeFilterParam: (active: ReadonlySet<string>) => string;

  beforeEach(async () => {
    if (!TimelinePage) {
      const module = await import('./TimelinePage.js');
      TimelinePage = module.TimelinePage;
      parseFilterParam = module.parseFilterParam as (raw: string | null) => ReadonlySet<string>;
      serializeFilterParam = module.serializeFilterParam as (active: ReadonlySet<string>) => string;
    }

    mockGetTimeline.mockResolvedValue(EMPTY_TIMELINE);
    mockListMilestones.mockResolvedValue([]);
  });

  function renderWithRouter(initialEntries?: string[]) {
    return render(
      <LocaleProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <TimelinePage />
          <LocationDisplay />
        </MemoryRouter>
      </LocaleProvider>,
    );
  }

  it('renders Schedule heading', () => {
    renderWithRouter();
    expect(screen.getByRole('heading', { name: /schedule/i })).toBeInTheDocument();
  });

  it('renders zoom level toggle controls', () => {
    renderWithRouter();
    expect(screen.getByRole('toolbar', { name: /zoom level/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /day/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /week/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /month/i })).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', () => {
    // Leave in loading state by never resolving the promise
    mockGetTimeline.mockReturnValue(new Promise(() => {}));
    renderWithRouter();
    expect(screen.getByTestId('gantt-chart-skeleton')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // parseFilterParam — unit tests for the exported helper
  // ---------------------------------------------------------------------------

  describe('parseFilterParam', () => {
    it('returns all 3 entity types when raw is null', () => {
      const result = parseFilterParam(null);
      expect(result.has('work-items')).toBe(true);
      expect(result.has('milestones')).toBe(true);
      expect(result.has('household-items')).toBe(true);
      expect(result.size).toBe(3);
    });

    it('parses "work-items,milestones" into a 2-element set', () => {
      const result = parseFilterParam('work-items,milestones');
      expect(result.has('work-items')).toBe(true);
      expect(result.has('milestones')).toBe(true);
      expect(result.has('household-items')).toBe(false);
      expect(result.size).toBe(2);
    });

    it('parses a single valid value "milestones"', () => {
      const result = parseFilterParam('milestones');
      expect(result.has('milestones')).toBe(true);
      expect(result.size).toBe(1);
    });

    it('falls back to all types when raw contains only invalid values', () => {
      const result = parseFilterParam('bad-value');
      expect(result.size).toBe(3);
      expect(result.has('work-items')).toBe(true);
      expect(result.has('milestones')).toBe(true);
      expect(result.has('household-items')).toBe(true);
    });

    it('filters out invalid tokens and keeps valid ones', () => {
      const result = parseFilterParam('work-items,bad-value,milestones');
      expect(result.has('work-items')).toBe(true);
      expect(result.has('milestones')).toBe(true);
      expect(result.has('household-items')).toBe(false);
      expect(result.size).toBe(2);
    });

    it('falls back to all types when raw is an empty string', () => {
      const result = parseFilterParam('');
      expect(result.size).toBe(3);
      expect(result.has('work-items')).toBe(true);
      expect(result.has('milestones')).toBe(true);
      expect(result.has('household-items')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // serializeFilterParam — unit tests for the exported helper
  // ---------------------------------------------------------------------------

  describe('serializeFilterParam', () => {
    it('serializes all 3 entity types in canonical order', () => {
      const result = serializeFilterParam(new Set(['work-items', 'milestones', 'household-items']));
      expect(result).toBe('work-items,milestones,household-items');
    });

    it('serializes a single entity type', () => {
      const result = serializeFilterParam(new Set(['milestones']));
      expect(result).toBe('milestones');
    });

    it('serializes an unordered set in canonical ALL_ENTITY_TYPES order', () => {
      // Set contains household-items before work-items, but output must follow canonical order
      const result = serializeFilterParam(new Set(['household-items', 'work-items']));
      expect(result).toBe('work-items,household-items');
    });
  });

  // ---------------------------------------------------------------------------
  // Entity filter group rendering
  // ---------------------------------------------------------------------------

  describe('entity filter group rendering', () => {
    it('renders a group with aria-label "Entity filter"', () => {
      renderWithRouter();
      expect(screen.getByRole('group', { name: /entity filter/i })).toBeInTheDocument();
    });

    it('renders three filter buttons all pressed by default', () => {
      renderWithRouter();
      const workItemsBtn = screen.getByTestId('entity-filter-work-items');
      const milestonesBtn = screen.getByTestId('entity-filter-milestones');
      const householdItemsBtn = screen.getByTestId('entity-filter-household-items');

      expect(workItemsBtn).toHaveAttribute('aria-pressed', 'true');
      expect(milestonesBtn).toHaveAttribute('aria-pressed', 'true');
      expect(householdItemsBtn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  // ---------------------------------------------------------------------------
  // Toggling entity filter buttons
  // ---------------------------------------------------------------------------

  describe('entity filter button toggling', () => {
    it('marks milestones button inactive after clicking it', () => {
      renderWithRouter();
      const milestonesBtn = screen.getByTestId('entity-filter-milestones');

      expect(milestonesBtn).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(milestonesBtn);
      expect(milestonesBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('disables the last-active button so the user cannot hide all entities', () => {
      renderWithRouter(['/schedule?filter=milestones']);
      const milestonesBtn = screen.getByTestId('entity-filter-milestones');
      const workItemsBtn = screen.getByTestId('entity-filter-work-items');
      const householdItemsBtn = screen.getByTestId('entity-filter-household-items');

      expect(milestonesBtn).toBeDisabled();
      expect(workItemsBtn).toHaveAttribute('aria-pressed', 'false');
      expect(householdItemsBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('restores an entity when its hidden button is clicked', () => {
      renderWithRouter(['/schedule?filter=work-items']);
      const milestonesBtn = screen.getByTestId('entity-filter-milestones');

      expect(milestonesBtn).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(milestonesBtn);
      expect(milestonesBtn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  // ---------------------------------------------------------------------------
  // URL param initialises filter state
  // ---------------------------------------------------------------------------

  describe('entity filter URL param initialisation', () => {
    it('shows only work items active when URL has ?filter=work-items', () => {
      renderWithRouter(['/schedule?filter=work-items']);
      expect(screen.getByTestId('entity-filter-work-items')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('entity-filter-milestones')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(screen.getByTestId('entity-filter-household-items')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('falls back to all entities shown when URL has an invalid filter param', () => {
      renderWithRouter(['/schedule?filter=invalid-value']);
      expect(screen.getByTestId('entity-filter-work-items')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('entity-filter-milestones')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('entity-filter-household-items')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Filter group visible in calendar view
  // ---------------------------------------------------------------------------

  describe('entity filter in calendar view', () => {
    it('shows the entity filter group when the route is /schedule/calendar', () => {
      renderWithRouter(['/schedule/calendar']);
      expect(screen.getByRole('group', { name: /entity filter/i })).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Add entity dropdown (renamed from "New" to "Add" in issue #1050)
  // ---------------------------------------------------------------------------

  describe('Add entity dropdown', () => {
    it('"Add" button renders on Gantt view', () => {
      renderWithRouter();
      expect(screen.getByTestId('timeline-add-button')).toBeInTheDocument();
    });

    it('"Add" button renders on Calendar view', () => {
      renderWithRouter(['/schedule/calendar']);
      expect(screen.getByTestId('timeline-add-button')).toBeInTheDocument();
    });

    it('"Add" button has text "Add"', () => {
      renderWithRouter();
      expect(screen.getByTestId('timeline-add-button')).toHaveTextContent('Add');
    });

    it('dropdown is initially closed — no menu in document', () => {
      renderWithRouter();
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('clicking "Add" opens the dropdown with menu items', () => {
      renderWithRouter();
      fireEvent.click(screen.getByTestId('timeline-add-button'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-add-work-item')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-add-household-item')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-add-milestone')).toBeInTheDocument();
    });

    it('menu items have "New ..." prefix labels', () => {
      renderWithRouter();
      fireEvent.click(screen.getByTestId('timeline-add-button'));
      expect(screen.getByTestId('timeline-add-work-item')).toHaveTextContent('New Work Item');
      expect(screen.getByTestId('timeline-add-household-item')).toHaveTextContent(
        'New Household Item',
      );
      expect(screen.getByTestId('timeline-add-milestone')).toHaveTextContent('New Milestone');
    });

    it('clicking "Add" again closes the dropdown (toggle)', () => {
      renderWithRouter();
      const addButton = screen.getByTestId('timeline-add-button');
      fireEvent.click(addButton);
      expect(screen.getByRole('menu')).toBeInTheDocument();
      fireEvent.click(addButton);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('pressing Escape closes the dropdown', () => {
      renderWithRouter();
      fireEvent.click(screen.getByTestId('timeline-add-button'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('clicking outside the dropdown closes it', () => {
      renderWithRouter();
      fireEvent.click(screen.getByTestId('timeline-add-button'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('"New Work Item" menu item navigates to /project/work-items/new', () => {
      renderWithRouter();
      fireEvent.click(screen.getByTestId('timeline-add-button'));
      fireEvent.click(screen.getByTestId('timeline-add-work-item'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(screen.getByTestId('location-display')).toHaveTextContent('/project/work-items/new');
    });

    it('"New Household Item" menu item navigates to /project/household-items/new', () => {
      renderWithRouter();
      fireEvent.click(screen.getByTestId('timeline-add-button'));
      fireEvent.click(screen.getByTestId('timeline-add-household-item'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(screen.getByTestId('location-display')).toHaveTextContent(
        '/project/household-items/new',
      );
    });

    it('"New Milestone" menu item navigates to /project/milestones/new', () => {
      renderWithRouter();
      fireEvent.click(screen.getByTestId('timeline-add-button'));
      fireEvent.click(screen.getByTestId('timeline-add-milestone'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(screen.getByTestId('location-display')).toHaveTextContent('/project/milestones/new');
    });

    it('"Add" button has aria-haspopup="menu"', () => {
      renderWithRouter();
      expect(screen.getByTestId('timeline-add-button')).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('"Add" button aria-expanded is false when closed', () => {
      renderWithRouter();
      expect(screen.getByTestId('timeline-add-button')).toHaveAttribute('aria-expanded', 'false');
    });

    it('"Add" button aria-expanded is true when open', () => {
      renderWithRouter();
      fireEvent.click(screen.getByTestId('timeline-add-button'));
      expect(screen.getByTestId('timeline-add-button')).toHaveAttribute('aria-expanded', 'true');
    });
  });

  // ---------------------------------------------------------------------------
  // View switching lives in the sidebar (#2205)
  // ---------------------------------------------------------------------------

  describe('no schedule tab row', () => {
    it('renders no Gantt/Calendar tab row of its own', () => {
      const { container } = renderWithRouter();
      expect(ownNavigations(container)).toEqual([]);
      expect(screen.queryByTestId('schedule-view-gantt')).toBeNull();
      expect(screen.queryByTestId('schedule-view-calendar')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Calendar empty state and milestone navigation (#2198)
  // ---------------------------------------------------------------------------

  describe('no-dates banner follows the shown dates (#2199)', () => {
    const UNDATED = {
      id: 'wi-undated',
      title: 'Test Undated',
      status: 'not_started' as const,
      startDate: null,
      endDate: null,
      projectedStartDate: '2026-03-10',
      projectedEndDate: '2026-03-12',
      isLate: false,
      lateDays: null,
      isHeldUp: false,
      durationDays: 2,
      actualStartDate: null,
      actualEndDate: null,
      startAfter: null,
      startBefore: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
    };

    it('shows no "no scheduled items" banner when only undated tasks with forecast dates exist', async () => {
      mockGetTimeline.mockResolvedValue({ ...EMPTY_TIMELINE, workItems: [UNDATED] });
      renderWithRouter(['/schedule']);
      await screen.findByRole('heading', { name: /schedule/i });
      await waitFor(() => {
        expect(mockGetTimeline).toHaveBeenCalled();
      });
      expect(screen.queryByTestId('timeline-no-dates')).not.toBeInTheDocument();
    });

    it('still shows the banner when a task has neither actual nor forecast dates', async () => {
      mockGetTimeline.mockResolvedValue({
        ...EMPTY_TIMELINE,
        workItems: [{ ...UNDATED, projectedStartDate: null, projectedEndDate: null }],
      });
      renderWithRouter(['/schedule']);
      expect(await screen.findByTestId('timeline-no-dates')).toBeInTheDocument();
    });
  });

  describe('calendar empty state and milestone click (#2198)', () => {
    function thisMonthDate(day: number): string {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    const MILESTONE: TimelineResponse['milestones'][number] = {
      id: 42,
      title: 'Test Shell Done',
      targetDate: thisMonthDate(10),
      isCompleted: false,
      completedAt: null,
      color: null,
      workItemIds: [],
      projectedDate: null,
      isLate: false,
      lateDays: null,
      isEarly: false,
      earlyDays: null,
      isCritical: false,
    };

    const WORK_ITEM: TimelineResponse['workItems'][number] = {
      id: 'wi-1',
      title: 'Test Task',
      status: 'not_started',
      startDate: thisMonthDate(5),
      endDate: thisMonthDate(6),
      projectedStartDate: thisMonthDate(5),
      projectedEndDate: thisMonthDate(6),
      isLate: false,
      lateDays: null,
      isHeldUp: false,
      durationDays: 2,
      actualStartDate: null,
      actualEndDate: null,
      startAfter: null,
      startBefore: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
    };

    it('shows the calendar empty state when tasks, milestones and purchases are all empty', async () => {
      renderWithRouter(['/schedule/calendar']);
      expect(await screen.findByTestId('calendar-empty')).toBeInTheDocument();
      expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    });

    it('does not show the empty state when only a milestone exists', async () => {
      mockGetTimeline.mockResolvedValue({ ...EMPTY_TIMELINE, milestones: [MILESTONE] });
      renderWithRouter(['/schedule/calendar']);
      expect(await screen.findByRole('grid')).toBeInTheDocument();
      expect(screen.queryByTestId('calendar-empty')).not.toBeInTheDocument();
    });

    it('does not show the empty state when entity filters hide everything that exists', async () => {
      mockGetTimeline.mockResolvedValue({ ...EMPTY_TIMELINE, workItems: [WORK_ITEM] });
      // Only milestones are shown, so the visible arrays are empty but the schedule is not
      renderWithRouter(['/schedule/calendar?filter=milestones']);
      expect(await screen.findByRole('grid')).toBeInTheDocument();
      expect(screen.queryByTestId('calendar-empty')).not.toBeInTheDocument();
      expect(screen.queryByTestId('calendar-item')).not.toBeInTheDocument();
    });

    it('clicking a calendar milestone navigates to /project/milestones/:id', async () => {
      mockGetTimeline.mockResolvedValue({ ...EMPTY_TIMELINE, milestones: [MILESTONE] });
      renderWithRouter(['/schedule/calendar']);
      fireEvent.click(await screen.findByTestId('calendar-milestone'));
      expect(screen.getByTestId('location-display')).toHaveTextContent('/project/milestones/42');
    });
  });

  // ── Page identity and origin (#2202) ───────────────────────────────────────

  describe('page identity and origin (#2202)', () => {
    // The calendar opens on the Sun-Sat week that contains "today", so fixtures anchored to fixed
    // days of the month only appeared when today's week happened to contain them (they vanished on
    // Sunday 11 Oct). Pin the clock and place every fixture on pinned-today or the day after.
    // Only Date is faked; timers stay real so findBy/waitFor keep working.
    const PINNED_NOW = new Date(2026, 9, 14, 12, 0, 0); // a Wednesday in mid-month

    const pinnedDay = (offset: number): string => {
      const d = new Date(
        PINNED_NOW.getFullYear(),
        PINNED_NOW.getMonth(),
        PINNED_NOW.getDate() + offset,
      );
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    beforeEach(() => {
      jest.useFakeTimers({
        now: PINNED_NOW,
        doNotFake: [
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'setImmediate',
          'clearImmediate',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'queueMicrotask',
          'nextTick',
          'performance',
          'requestIdleCallback',
          'cancelIdleCallback',
          'hrtime',
        ],
      } as never);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const MILESTONE: TimelineResponse['milestones'][number] = {
      id: 42,
      title: 'Origin Milestone',
      targetDate: pinnedDay(0),
      isCompleted: false,
      completedAt: null,
      color: null,
      workItemIds: [],
      projectedDate: null,
      isLate: false,
      lateDays: null,
      isEarly: false,
      earlyDays: null,
      isCritical: false,
    };

    const TASK: TimelineResponse['workItems'][number] = {
      id: 'wi-origin',
      title: 'Origin Task',
      status: 'not_started',
      startDate: pinnedDay(0),
      endDate: pinnedDay(1),
      projectedStartDate: pinnedDay(0),
      projectedEndDate: pinnedDay(1),
      isLate: false,
      lateDays: null,
      isHeldUp: false,
      durationDays: 2,
      actualStartDate: null,
      actualEndDate: null,
      startAfter: null,
      startBefore: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
    };

    const PURCHASE: TimelineResponse['householdItems'][number] = {
      id: 'hi-origin',
      name: 'Origin Purchase',
      category: 'furniture',
      status: 'planned',
      targetDeliveryDate: pinnedDay(0),
      earliestDeliveryDate: pinnedDay(0),
      latestDeliveryDate: pinnedDay(1),
      actualDeliveryDate: null,
      isLate: false,
      dependencyIds: [],
    };

    const stateOf = () =>
      JSON.parse(screen.getByTestId('location-state').textContent ?? 'null') as {
        origin: { to: string; name?: string };
      } | null;

    it('shows exactly one h1 "Schedule" on the Gantt view, with the tab title under Tasks', async () => {
      renderWithRouter(['/schedule/gantt']);

      expect(await screen.findByRole('heading', { name: 'Schedule', level: 1 })).toBeVisible();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      await waitFor(() => expect(document.title).toBe('Schedule · Tasks · Cornerstone'));
    });

    it('shows exactly one h1 "Calendar" on the Calendar view, with the tab title under Tasks', async () => {
      renderWithRouter(['/schedule/calendar']);

      expect(await screen.findByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      await waitFor(() => expect(document.title).toBe('Calendar · Tasks · Cornerstone'));
    });

    it('is a view: no trail and no Back link', async () => {
      renderWithRouter(['/schedule/calendar']);

      await screen.findByRole('heading', { name: 'Calendar', level: 1 });
      expect(screen.queryByTestId('breadcrumbs')).not.toBeInTheDocument();
    });

    it('opens a calendar milestone with the calendar URL (incl. query) as origin, no name', async () => {
      mockGetTimeline.mockResolvedValue({ ...EMPTY_TIMELINE, milestones: [MILESTONE] });
      renderWithRouter(['/schedule/calendar?calendarMode=week']);

      fireEvent.click(await screen.findByTestId('calendar-milestone'));

      expect(screen.getByTestId('location-display')).toHaveTextContent('/project/milestones/42');
      expect(stateOf()).toEqual({ origin: { to: '/schedule/calendar?calendarMode=week' } });
    });

    it('opens a calendar task with the calendar URL as origin (replacing the old from/view state)', async () => {
      mockGetTimeline.mockResolvedValue({ ...EMPTY_TIMELINE, workItems: [TASK] });
      renderWithRouter(['/schedule/calendar?calendarMode=week']);

      fireEvent.click((await screen.findAllByTestId('calendar-item'))[0]!);

      expect(screen.getByTestId('location-display')).toHaveTextContent(
        '/project/work-items/wi-origin',
      );
      const state = stateOf();
      expect(state).toEqual({ origin: { to: '/schedule/calendar?calendarMode=week' } });
      expect(JSON.stringify(state)).not.toContain('"from"');
    });

    it('opens a calendar purchase with the calendar URL as origin (it had none before)', async () => {
      mockGetTimeline.mockResolvedValue({ ...EMPTY_TIMELINE, householdItems: [PURCHASE] });
      renderWithRouter(['/schedule/calendar?calendarMode=week']);

      fireEvent.click((await screen.findAllByTestId('calendar-hi-item'))[0]!);

      expect(screen.getByTestId('location-display')).toHaveTextContent(
        '/project/household-items/hi-origin',
      );
      expect(stateOf()).toEqual({ origin: { to: '/schedule/calendar?calendarMode=week' } });
    });

    it.each([
      ['timeline-add-work-item', '/project/work-items/new'],
      ['timeline-add-household-item', '/project/household-items/new'],
      ['timeline-add-milestone', '/project/milestones/new'],
    ])('the New menu item %s carries the Gantt URL as origin', (testId, path) => {
      renderWithRouter(['/schedule/gantt?filter=tasks']);
      fireEvent.click(screen.getByTestId('timeline-add-button'));

      fireEvent.click(screen.getByTestId(testId));

      expect(screen.getByTestId('location-display')).toHaveTextContent(path);
      expect(stateOf()).toEqual({ origin: { to: '/schedule/gantt?filter=tasks' } });
    });

    it('does not push a history entry on mount', async () => {
      renderWithRouter(['/schedule/gantt']);

      await screen.findByRole('heading', { name: 'Schedule', level: 1 });
      expect(screen.getByTestId('location-type')).toHaveTextContent('POP');
    });
  });
});
