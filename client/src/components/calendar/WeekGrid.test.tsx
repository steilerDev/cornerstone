/**
 * @jest-environment jsdom
 *
 * Unit tests for WeekGrid component.
 * Verifies: 7 column headers, day cells, work items rendered in correct cells,
 * milestones rendered on target date, empty placeholder, today styling,
 * and milestone click callback.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TimelineWorkItem, TimelineMilestone } from '@cornerstone/shared';
import type * as WeekGridTypes from './WeekGrid.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWorkItem(
  id: string,
  startDate: string | null,
  endDate: string | null,
  title = `Item ${id}`,
): TimelineWorkItem {
  return {
    id,
    title,
    status: 'not_started',
    startDate,
    endDate,
    durationDays: null,
    actualStartDate: null,
    actualEndDate: null,
    startAfter: null,
    startBefore: null,
    assignedUser: null,
    tags: [],
  };
}

function makeMilestone(id: number, targetDate: string, title = `M${id}`): TimelineMilestone {
  return {
    id,
    title,
    targetDate,
    isCompleted: false,
    completedAt: null,
    color: null,
    workItemIds: [],
    projectedDate: null,
  };
}

// A week in March 2024: Sun Mar 10 – Sat Mar 16
const WEEK_DATE = new Date(Date.UTC(2024, 2, 13)); // Wednesday March 13 2024

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let WeekGrid: typeof WeekGridTypes.WeekGrid;

beforeEach(async () => {
  if (!WeekGrid) {
    const module = await import('./WeekGrid.js');
    WeekGrid = module.WeekGrid;
  }
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderGrid(props: {
  weekDate?: Date;
  workItems?: TimelineWorkItem[];
  milestones?: TimelineMilestone[];
  onMilestoneClick?: jest.Mock;
  onItemMouseEnter?: jest.Mock;
  onItemMouseLeave?: jest.Mock;
  onItemMouseMove?: jest.Mock;
  onMilestoneMouseEnter?: jest.Mock;
  onMilestoneMouseLeave?: jest.Mock;
  onMilestoneMouseMove?: jest.Mock;
}) {
  return render(
    <MemoryRouter>
      <WeekGrid
        weekDate={props.weekDate ?? WEEK_DATE}
        workItems={props.workItems ?? []}
        milestones={props.milestones ?? []}
        onMilestoneClick={props.onMilestoneClick}
        onItemMouseEnter={props.onItemMouseEnter}
        onItemMouseLeave={props.onItemMouseLeave}
        onItemMouseMove={props.onItemMouseMove}
        onMilestoneMouseEnter={props.onMilestoneMouseEnter}
        onMilestoneMouseLeave={props.onMilestoneMouseLeave}
        onMilestoneMouseMove={props.onMilestoneMouseMove}
      />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WeekGrid', () => {
  // ── Grid structure ─────────────────────────────────────────────────────────

  describe('grid structure', () => {
    it('has role="grid" on the outer container with aria-label "Weekly calendar"', () => {
      renderGrid({});
      expect(screen.getByRole('grid', { name: /weekly calendar/i })).toBeInTheDocument();
    });

    it('renders exactly 7 column header cells', () => {
      renderGrid({});
      expect(screen.getAllByRole('columnheader')).toHaveLength(7);
    });

    it('renders exactly 7 gridcell elements (one per day)', () => {
      renderGrid({});
      expect(screen.getAllByRole('gridcell')).toHaveLength(7);
    });

    it('first column header is Sunday', () => {
      renderGrid({});
      const headers = screen.getAllByRole('columnheader');
      // aria-label format: "Sun 10 March"
      expect(headers[0].getAttribute('aria-label')).toMatch(/^Sun/);
    });

    it('last column header is Saturday', () => {
      renderGrid({});
      const headers = screen.getAllByRole('columnheader');
      expect(headers[6].getAttribute('aria-label')).toMatch(/^Sat/);
    });

    it('column headers display day names', () => {
      renderGrid({});
      // DAY_NAMES[0] = 'Sun' should appear in the header text
      expect(screen.getAllByText('Sun').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Mon').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Week dates ─────────────────────────────────────────────────────────────

  describe('week dates', () => {
    it('renders 7 days spanning Sunday to Saturday of the given week', () => {
      // WEEK_DATE = Wednesday March 13 → week is Sun Mar 10 – Sat Mar 16
      renderGrid({});
      const cells = screen.getAllByRole('gridcell');
      expect(cells[0]).toHaveAttribute('aria-label', 'Sunday, March 10, 2024'); // Sunday
      expect(cells[6]).toHaveAttribute('aria-label', 'Saturday, March 16, 2024'); // Saturday
    });

    it('renders correct days for a different input weekDate', () => {
      const satDate = new Date(Date.UTC(2024, 5, 22)); // Saturday June 22 2024
      // Week: Sun Jun 16 – Sat Jun 22
      renderGrid({ weekDate: satDate });
      const cells = screen.getAllByRole('gridcell');
      expect(cells[0]).toHaveAttribute('aria-label', 'Sunday, June 16, 2024');
      expect(cells[6]).toHaveAttribute('aria-label', 'Saturday, June 22, 2024');
    });

    it('column header includes month name', () => {
      renderGrid({});
      // Headers: "Sun 10 March", "Mon 11 March", etc.
      const headers = screen.getAllByRole('columnheader');
      expect(headers[0].getAttribute('aria-label')).toContain('March');
    });
  });

  // ── Work items ─────────────────────────────────────────────────────────────

  describe('work items', () => {
    it('renders CalendarItem for an item on a day within the week', () => {
      const item = makeWorkItem('a', '2024-03-12', '2024-03-12', 'Tuesday Task');
      renderGrid({ workItems: [item] });
      expect(screen.getAllByTestId('calendar-item')).toHaveLength(1);
    });

    it('renders CalendarItem in multiple cells when item spans multiple days', () => {
      // Item spans Mon–Wed (3 days within the week)
      const item = makeWorkItem('b', '2024-03-11', '2024-03-13', 'Multi-day Task');
      renderGrid({ workItems: [item] });
      expect(screen.getAllByTestId('calendar-item')).toHaveLength(3);
    });

    it('does not render CalendarItem for item outside the week', () => {
      const item = makeWorkItem('c', '2024-04-01', '2024-04-30', 'April Task');
      renderGrid({ workItems: [item] });
      expect(screen.queryAllByTestId('calendar-item')).toHaveLength(0);
    });

    it('renders CalendarItem with title text on start day', () => {
      const item = makeWorkItem('d', '2024-03-11', '2024-03-13', 'Plumbing Work');
      renderGrid({ workItems: [item] });
      // Title is shown because isStart=true for the start day cell
      expect(screen.getByText('Plumbing Work')).toBeInTheDocument();
    });

    it('renders multiple items on the same day', () => {
      const itemA = makeWorkItem('a', '2024-03-11', '2024-03-11', 'Task A');
      const itemB = makeWorkItem('b', '2024-03-11', '2024-03-11', 'Task B');
      renderGrid({ workItems: [itemA, itemB] });
      expect(screen.getAllByTestId('calendar-item')).toHaveLength(2);
    });

    it('renders no CalendarItem elements when workItems is empty', () => {
      renderGrid({ workItems: [] });
      expect(screen.queryAllByTestId('calendar-item')).toHaveLength(0);
    });
  });

  // ── Milestones ─────────────────────────────────────────────────────────────

  describe('milestones', () => {
    it('renders CalendarMilestone for a milestone on a day in the week', () => {
      const m = makeMilestone(1, '2024-03-14', 'Framing Complete'); // Thursday
      renderGrid({ milestones: [m] });
      expect(screen.getAllByTestId('calendar-milestone')).toHaveLength(1);
    });

    it('renders milestone title', () => {
      const m = makeMilestone(2, '2024-03-12', 'Foundation Done');
      renderGrid({ milestones: [m] });
      expect(screen.getByText('Foundation Done')).toBeInTheDocument();
    });

    it('renders no CalendarMilestone when milestones list is empty', () => {
      renderGrid({ milestones: [] });
      expect(screen.queryAllByTestId('calendar-milestone')).toHaveLength(0);
    });

    it('renders no CalendarMilestone for milestone outside the displayed week', () => {
      const m = makeMilestone(3, '2024-03-20', 'Future Milestone');
      renderGrid({ milestones: [m] });
      expect(screen.queryAllByTestId('calendar-milestone')).toHaveLength(0);
    });

    it('calls onMilestoneClick when milestone is clicked', () => {
      const onMilestoneClick = jest.fn();
      const m = makeMilestone(55, '2024-03-14', 'Click Me');
      renderGrid({ milestones: [m], onMilestoneClick });

      fireEvent.click(screen.getByTestId('calendar-milestone'));

      expect(onMilestoneClick).toHaveBeenCalledWith(55);
    });

    it('renders multiple milestones in the week', () => {
      const m1 = makeMilestone(1, '2024-03-11');
      const m2 = makeMilestone(2, '2024-03-14');
      renderGrid({ milestones: [m1, m2] });
      expect(screen.getAllByTestId('calendar-milestone')).toHaveLength(2);
    });
  });

  // ── Empty placeholder ──────────────────────────────────────────────────────

  describe('empty day placeholder', () => {
    it('renders empty placeholder div for days with no items or milestones', () => {
      // No work items or milestones → all 7 days get empty placeholders
      renderGrid({ workItems: [], milestones: [] });
      const cells = screen.getAllByRole('gridcell');
      // Each empty cell should contain the emptyDay div (aria-hidden)
      let emptyDayCount = 0;
      for (const cell of cells) {
        if (cell.querySelector('[aria-hidden="true"]')) {
          emptyDayCount++;
        }
      }
      expect(emptyDayCount).toBe(7);
    });

    it('does not render empty placeholder when a day has items', () => {
      const item = makeWorkItem('x', '2024-03-10', '2024-03-16', 'Full Week');
      renderGrid({ workItems: [item] });
      // All 7 days have the item, so no empty placeholders
      const cells = screen.getAllByRole('gridcell');
      let emptyDayCount = 0;
      for (const cell of cells) {
        // Only check for the specific emptyDay div (which is the direct aria-hidden child)
        // Calendar items also have aria-hidden on SVG inside them, so filter carefully
        const directAriaHiddenDivs = Array.from(cell.children).filter(
          (child) => child.getAttribute('aria-hidden') === 'true',
        );
        if (directAriaHiddenDivs.length > 0) {
          emptyDayCount++;
        }
      }
      expect(emptyDayCount).toBe(0);
    });
  });

  // ── Day number display ─────────────────────────────────────────────────────

  describe('day numbers in headers', () => {
    it('renders the day-of-month number in each column header', () => {
      // Week of March 10–16: Sun=10, Mon=11, Tue=12, Wed=13, Thu=14, Fri=15, Sat=16
      renderGrid({});
      const headers = screen.getAllByRole('columnheader');
      // Each header should contain the day-of-month digit
      expect(headers[0]).toHaveTextContent('10'); // Sunday Mar 10
      expect(headers[6]).toHaveTextContent('16'); // Saturday Mar 16
    });
  });

  // ── Week spanning a month boundary ─────────────────────────────────────────

  describe('week spanning month boundary', () => {
    it('correctly renders a week that spans two months', () => {
      // March 31, 2024 is a Sunday. Week: Mar 31 – Apr 6
      const weekDate = new Date(Date.UTC(2024, 2, 31)); // March 31 (Sunday)
      renderGrid({ weekDate });
      const cells = screen.getAllByRole('gridcell');
      expect(cells[0]).toHaveAttribute('aria-label', 'Sunday, March 31, 2024');
      expect(cells[6]).toHaveAttribute('aria-label', 'Saturday, April 6, 2024');
    });

    it('renders column header with correct month name for cross-month weeks', () => {
      const weekDate = new Date(Date.UTC(2024, 2, 31));
      renderGrid({ weekDate });
      const headers = screen.getAllByRole('columnheader');
      // First header (Sunday March 31) should say March
      expect(headers[0].getAttribute('aria-label')).toContain('March');
      // Last header (Saturday April 6) should say April
      expect(headers[6].getAttribute('aria-label')).toContain('April');
    });
  });

  // ── Mouse event callback propagation ──────────────────────────────────────

  describe('mouse event callback propagation', () => {
    it('propagates onItemMouseEnter to CalendarItem components', () => {
      const onItemMouseEnter = jest.fn();
      const item = makeWorkItem('a', '2024-03-12', '2024-03-12', 'Tuesday Task');
      renderGrid({ workItems: [item], onItemMouseEnter });

      const calendarItem = screen.getByTestId('calendar-item');
      fireEvent.mouseEnter(calendarItem, { clientX: 100, clientY: 200 });

      expect(onItemMouseEnter).toHaveBeenCalledWith('a', 100, 200);
    });

    it('propagates onItemMouseLeave to CalendarItem components', () => {
      const onItemMouseLeave = jest.fn();
      const item = makeWorkItem('b', '2024-03-12', '2024-03-12', 'Task B');
      renderGrid({ workItems: [item], onItemMouseLeave });

      fireEvent.mouseLeave(screen.getByTestId('calendar-item'));

      expect(onItemMouseLeave).toHaveBeenCalledTimes(1);
    });

    it('propagates onItemMouseMove to CalendarItem components', () => {
      const onItemMouseMove = jest.fn();
      const item = makeWorkItem('c', '2024-03-12', '2024-03-12', 'Task C');
      renderGrid({ workItems: [item], onItemMouseMove });

      fireEvent.mouseMove(screen.getByTestId('calendar-item'), { clientX: 300, clientY: 400 });

      expect(onItemMouseMove).toHaveBeenCalledWith(300, 400);
    });

    it('propagates onMilestoneMouseEnter to CalendarMilestone components', () => {
      const onMilestoneMouseEnter = jest.fn();
      const m = makeMilestone(55, '2024-03-14', 'Framing Done');
      renderGrid({ milestones: [m], onMilestoneMouseEnter });

      const calendarMilestone = screen.getByTestId('calendar-milestone');
      fireEvent.mouseEnter(calendarMilestone, { clientX: 50, clientY: 75 });

      expect(onMilestoneMouseEnter).toHaveBeenCalledWith(55, 50, 75);
    });

    it('propagates onMilestoneMouseLeave to CalendarMilestone components', () => {
      const onMilestoneMouseLeave = jest.fn();
      const m = makeMilestone(66, '2024-03-14', 'Milestone Leave');
      renderGrid({ milestones: [m], onMilestoneMouseLeave });

      fireEvent.mouseLeave(screen.getByTestId('calendar-milestone'));

      expect(onMilestoneMouseLeave).toHaveBeenCalledTimes(1);
    });

    it('propagates onMilestoneMouseMove to CalendarMilestone components', () => {
      const onMilestoneMouseMove = jest.fn();
      const m = makeMilestone(77, '2024-03-14', 'Milestone Move');
      renderGrid({ milestones: [m], onMilestoneMouseMove });

      fireEvent.mouseMove(screen.getByTestId('calendar-milestone'), { clientX: 200, clientY: 300 });

      expect(onMilestoneMouseMove).toHaveBeenCalledWith(200, 300);
    });
  });

  // ── No data-column-size attribute ─────────────────────────────────────────

  describe('no data-column-size attribute (toggle removed)', () => {
    it('does not set data-column-size on the grid element', () => {
      renderGrid({});
      const grid = screen.getByRole('grid');
      expect(grid).not.toHaveAttribute('data-column-size');
    });
  });
});
