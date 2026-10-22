/**
 * @jest-environment jsdom
 *
 * Smoke tests for TimelinePage — verifies the page renders without crashing
 * in a router context. Comprehensive tests for the Gantt chart functionality
 * are owned by the qa-integration-tester agent.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

    it('passes the response holdsUp counts to the calendar tooltips (#2232)', async () => {
      mockGetTimeline.mockResolvedValue({
        ...EMPTY_TIMELINE,
        workItems: [TASK],
        holdsUp: {
          workItems: { 'wi-origin': { count: 7, startingWithin14Days: 2 } },
          milestones: {},
        },
      });
      renderWithRouter(['/schedule/calendar?calendarMode=week']);

      fireEvent.mouseEnter((await screen.findAllByTestId('calendar-item'))[0]!, {
        clientX: 300,
        clientY: 200,
      });

      expect(await screen.findByTestId('gantt-tooltip-holds-up')).toHaveTextContent(
        'Holds up 7 tasks',
      );
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
    ])('the New menu item %s carries the Gantt URL as origin and background', (testId, path) => {
      renderWithRouter(['/schedule/gantt?filter=tasks']);
      fireEvent.click(screen.getByTestId('timeline-add-button'));

      fireEvent.click(screen.getByTestId(testId));

      expect(screen.getByTestId('location-display')).toHaveTextContent(path);
      expect(stateOf()).toEqual({
        origin: { to: '/schedule/gantt?filter=tasks' },
        background: {
          pathname: '/schedule/gantt',
          search: '?filter=tasks',
          hash: '',
          state: null,
          key: expect.any(String),
        },
      });
    });

    it('does not push a history entry on mount', async () => {
      renderWithRouter(['/schedule/gantt']);

      await screen.findByRole('heading', { name: 'Schedule', level: 1 });
      expect(screen.getByTestId('location-type')).toHaveTextContent('POP');
    });
  });

  // ---------------------------------------------------------------------------
  // Gantt view with data, toolbar controls, error state (#2232 coverage)
  // ---------------------------------------------------------------------------

  describe('Gantt view with data', () => {
    const GANTT_TASK: TimelineResponse['workItems'][number] = {
      id: 'wi-gantt',
      title: 'Gantt Test Task',
      status: 'in_progress',
      startDate: '2026-03-02',
      endDate: '2026-03-20',
      projectedStartDate: '2026-03-02',
      projectedEndDate: '2026-03-20',
      isLate: false,
      lateDays: null,
      isHeldUp: false,
      durationDays: 18,
      actualStartDate: null,
      actualEndDate: null,
      startAfter: null,
      startBefore: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
    };
    const GANTT_MILESTONE: TimelineResponse['milestones'][number] = {
      id: 7,
      title: 'Gantt Test Milestone',
      targetDate: '2026-03-25',
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
    const GANTT_PURCHASE: TimelineResponse['householdItems'][number] = {
      id: 'hi-gantt',
      name: 'Gantt Test Purchase',
      category: 'furniture',
      status: 'planned',
      targetDeliveryDate: '2026-03-15',
      earliestDeliveryDate: '2026-03-14',
      latestDeliveryDate: '2026-03-16',
      actualDeliveryDate: null,
      isLate: false,
      dependencyIds: [],
    };
    const FULL: TimelineResponse = {
      ...EMPTY_TIMELINE,
      workItems: [GANTT_TASK],
      milestones: [GANTT_MILESTONE],
      householdItems: [GANTT_PURCHASE],
      dateRange: { earliest: '2026-03-01', latest: '2026-03-31' },
    };

    it('renders the chart for a task and navigates to it from the sidebar with origin state', async () => {
      mockGetTimeline.mockResolvedValue(FULL);
      renderWithRouter(['/schedule/gantt']);

      fireEvent.click(await screen.findByTestId('gantt-sidebar-row-wi-gantt'));

      expect(screen.getByTestId('location-display')).toHaveTextContent(
        '/project/work-items/wi-gantt',
      );
      expect(JSON.parse(screen.getByTestId('location-state').textContent ?? 'null')).toEqual({
        origin: { to: '/schedule/gantt' },
      });
    });

    it('navigates to a milestone from the Gantt sidebar', async () => {
      mockGetTimeline.mockResolvedValue(FULL);
      renderWithRouter(['/schedule/gantt']);

      fireEvent.click(await screen.findByTestId('gantt-sidebar-milestone-7'));

      expect(screen.getByTestId('location-display')).toHaveTextContent('/project/milestones/7');
    });

    it('navigates to a purchase from the Gantt sidebar', async () => {
      mockGetTimeline.mockResolvedValue(FULL);
      renderWithRouter(['/schedule/gantt']);

      fireEvent.click(await screen.findByTestId('gantt-sidebar-hi-hi-gantt'));

      expect(screen.getByTestId('location-display')).toHaveTextContent(
        '/project/household-items/hi-gantt',
      );
    });

    it('hides milestones and purchases from the chart when only tasks are shown', async () => {
      mockGetTimeline.mockResolvedValue(FULL);
      renderWithRouter(['/schedule/gantt?filter=work-items']);

      await screen.findByTestId('gantt-sidebar-row-wi-gantt');
      expect(screen.queryByTestId('gantt-sidebar-milestone-7')).not.toBeInTheDocument();
      expect(screen.queryByTestId('gantt-sidebar-hi-hi-gantt')).not.toBeInTheDocument();
    });

    it('toggles the dependency arrows button label and pressed state', async () => {
      mockGetTimeline.mockResolvedValue(FULL);
      renderWithRouter(['/schedule/gantt']);
      await screen.findByTestId('gantt-chart');

      const hide = screen.getByRole('button', { name: 'Hide dependency arrows' });
      expect(hide).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(hide);

      const show = screen.getByRole('button', { name: 'Show dependency arrows' });
      expect(show).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(show);
      expect(screen.getByRole('button', { name: 'Hide dependency arrows' })).toBeInTheDocument();
    });

    it('toggles the critical path highlight button label and pressed state', async () => {
      mockGetTimeline.mockResolvedValue(FULL);
      renderWithRouter(['/schedule/gantt']);
      await screen.findByTestId('gantt-chart');

      const toggle = screen.getByTestId('critical-path-toggle');
      expect(toggle).toHaveAttribute('aria-label', 'Hide critical path highlighting');
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute('aria-label', 'Show critical path highlighting');
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(toggle).toHaveAttribute('title', 'Show critical path highlighting');
    });

    it('switches the zoom level between Day, Week and Month', async () => {
      mockGetTimeline.mockResolvedValue(FULL);
      renderWithRouter(['/schedule/gantt']);
      await screen.findByTestId('gantt-chart');
      const toolbar = screen.getByRole('toolbar', { name: /zoom level/i });
      const buttons = Array.from(toolbar.querySelectorAll('button'));
      const byText = (name: string) => buttons.find((b) => b.textContent === name)!;

      fireEvent.click(byText('Day'));
      expect(byText('Day')).toHaveAttribute('aria-pressed', 'true');
      expect(byText('Month')).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(byText('Week'));
      expect(byText('Week')).toHaveAttribute('aria-pressed', 'true');
      expect(byText('Day')).toHaveAttribute('aria-pressed', 'false');
    });

    it('zooms the columns in until the maximum disables the + button, and back out to the minimum', async () => {
      mockGetTimeline.mockResolvedValue(FULL);
      renderWithRouter(['/schedule/gantt']);
      await screen.findByTestId('gantt-chart');
      const zoomIn = screen.getByRole('button', { name: 'Zoom in columns' });
      const zoomOut = screen.getByRole('button', { name: 'Zoom out columns' });

      expect(zoomIn).toBeEnabled();
      for (let i = 0; i < 20 && !(zoomIn as HTMLButtonElement).disabled; i++) {
        fireEvent.click(zoomIn);
      }
      expect(zoomIn).toBeDisabled();
      expect(zoomOut).toBeEnabled();

      for (let i = 0; i < 60 && !(zoomOut as HTMLButtonElement).disabled; i++) {
        fireEvent.click(zoomOut);
      }
      expect(zoomOut).toBeDisabled();
      expect(zoomIn).toBeEnabled();
    });

    it('zooms the columns with Ctrl+= and Ctrl+- and ignores keys without Ctrl', async () => {
      mockGetTimeline.mockResolvedValue(FULL);
      renderWithRouter(['/schedule/gantt']);
      await screen.findByTestId('gantt-chart');
      const zoomIn = screen.getByRole('button', { name: 'Zoom in columns' });
      const zoomOut = screen.getByRole('button', { name: 'Zoom out columns' });

      for (let i = 0; i < 25; i++) fireEvent.keyDown(document, { key: '=', ctrlKey: true });
      expect(zoomIn).toBeDisabled();

      for (let i = 0; i < 60; i++) fireEvent.keyDown(document, { key: '-', ctrlKey: true });
      expect(zoomOut).toBeDisabled();

      // '+' also zooms in; plain keys and other Ctrl keys do nothing
      fireEvent.keyDown(document, { key: '+', ctrlKey: true });
      expect(zoomOut).toBeEnabled();
      const before = zoomOut.hasAttribute('disabled');
      fireEvent.keyDown(document, { key: '-' });
      fireEvent.keyDown(document, { key: 'a', ctrlKey: true });
      expect(zoomOut.hasAttribute('disabled')).toBe(before);
    });

    it('zooms the columns with Ctrl+wheel over the chart', async () => {
      mockGetTimeline.mockResolvedValue(FULL);
      renderWithRouter(['/schedule/gantt']);
      const svg = await screen.findByTestId('gantt-svg');
      const zoomIn = screen.getByRole('button', { name: 'Zoom in columns' });
      const zoomOut = screen.getByRole('button', { name: 'Zoom out columns' });
      const scroller = svg.parentElement!;

      for (let i = 0; i < 60; i++) fireEvent.wheel(scroller, { deltaY: 100, ctrlKey: true });
      expect(zoomOut).toBeDisabled();
      fireEvent.wheel(scroller, { deltaY: -100, ctrlKey: true });
      expect(zoomOut).toBeEnabled();
      expect(zoomIn).toBeEnabled();
    });

    it('shows the empty state with a link to Work Items when there are no tasks', async () => {
      renderWithRouter(['/schedule/gantt']);

      expect(await screen.findByTestId('timeline-empty')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Go to Work Items' })).toHaveAttribute(
        'href',
        '/project/work-items',
      );
      expect(screen.queryByTestId('gantt-chart')).not.toBeInTheDocument();
    });

    it('shows the load error and retries when Try again is pressed', async () => {
      // Persistent rejection: the hook refetches when the translation function changes
      mockGetTimeline.mockRejectedValue(new Error('boom'));
      renderWithRouter(['/schedule/gantt']);

      expect(await screen.findByTestId('timeline-error')).toBeInTheDocument();
      mockGetTimeline.mockResolvedValue(FULL);
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByTestId('gantt-chart')).toBeInTheDocument();
      expect(screen.queryByTestId('timeline-error')).not.toBeInTheDocument();
    });

    it('shows a calendar milestone tooltip without task names when the Work items filter is off', async () => {
      const thisMonth = new Date();
      const day = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}-10`;
      mockGetTimeline.mockResolvedValue({
        ...FULL,
        workItems: [
          {
            ...GANTT_TASK,
            startDate: day,
            endDate: day,
            projectedStartDate: day,
            projectedEndDate: day,
            requiredMilestoneIds: [7],
          },
        ],
        milestones: [{ ...GANTT_MILESTONE, targetDate: day, workItemIds: ['wi-gantt'] }],
      });
      renderWithRouter(['/schedule/calendar?filter=milestones']);

      fireEvent.mouseEnter(await screen.findByTestId('calendar-milestone'), {
        clientX: 200,
        clientY: 150,
      });
      const tip = await screen.findByTestId('gantt-tooltip');

      expect(tip).toHaveTextContent('Gantt Test Milestone');
      expect(tip).not.toHaveTextContent('Gantt Test Task');
    });

    it('reloads the timeline silently when a task is created elsewhere', async () => {
      mockGetTimeline.mockResolvedValue(FULL);
      renderWithRouter(['/schedule/gantt']);
      await screen.findByTestId('gantt-chart');
      const calls = mockGetTimeline.mock.calls.length;

      act(() => {
        window.dispatchEvent(
          new CustomEvent('cornerstone:object-created', { detail: { kind: 'task' } }),
        );
      });

      await waitFor(() => expect(mockGetTimeline.mock.calls.length).toBe(calls + 1));
      expect(screen.getByTestId('gantt-chart')).toBeInTheDocument();
    });
  });
});
