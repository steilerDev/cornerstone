/**
 * @jest-environment jsdom
 *
 * Unit tests for CalendarView component.
 * Verifies: toolbar rendering, month/week toggle, navigation (prev/today/next),
 * period label display, mode persistence in URL search params, grid switching,
 * and milestone click callback propagation.
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from '@jest/globals';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TimelineWorkItem, TimelineMilestone } from '@cornerstone/shared';
import type * as CalendarViewTypes from './CalendarView.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWorkItem(id: string, startDate: string, endDate: string): TimelineWorkItem {
  return {
    id,
    title: `Item ${id}`,
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

function makeMilestone(id: number, targetDate: string): TimelineMilestone {
  return {
    id,
    title: `Milestone ${id}`,
    targetDate,
    isCompleted: false,
    completedAt: null,
    color: null,
    workItemIds: [],
    projectedDate: null,
  };
}

// ---------------------------------------------------------------------------
// Helper: parse human-readable aria-label back to a UTC midnight Date
// ---------------------------------------------------------------------------

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12,
};

/**
 * Parses a gridcell aria-label in format "Weekday, Month D, YYYY" to a UTC midnight Date.
 * E.g. "Sunday, March 10, 2024" → new Date(Date.UTC(2024, 2, 10))
 */
function parseCellAriaLabel(label: string): Date {
  // Format: "Weekday, Month D, YYYY"
  // Remove the weekday prefix: "Month D, YYYY"
  const withoutWeekday = label.replace(/^[A-Za-z]+, /, '');
  // Now: "March 10, 2024"
  const match = withoutWeekday.match(/^([A-Za-z]+) (\d+), (\d+)$/);
  if (!match) throw new Error(`Cannot parse aria-label: "${label}"`);
  const [, monthName, dayStr, yearStr] = match;
  const month = MONTH_NAME_TO_NUMBER[monthName];
  if (!month) throw new Error(`Unknown month name: "${monthName}"`);
  return new Date(Date.UTC(Number(yearStr), month - 1, Number(dayStr)));
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let CalendarView: typeof CalendarViewTypes.CalendarView;

beforeEach(async () => {
  if (!CalendarView) {
    const module = await import('./CalendarView.js');
    CalendarView = module.CalendarView;
  }
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderCalendar(props: {
  workItems?: TimelineWorkItem[];
  milestones?: TimelineMilestone[];
  onMilestoneClick?: jest.Mock;
  initialSearchParams?: string;
}) {
  const { workItems = [], milestones = [], onMilestoneClick, initialSearchParams = '' } = props;
  const initialEntry = initialSearchParams ? `/?${initialSearchParams}` : '/';
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CalendarView
        workItems={workItems}
        milestones={milestones}
        onMilestoneClick={onMilestoneClick}
      />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CalendarView', () => {
  // ── Rendering ──────────────────────────────────────────────────────────────

  describe('basic rendering', () => {
    it('renders with data-testid="calendar-view"', () => {
      renderCalendar({});
      expect(screen.getByTestId('calendar-view')).toBeInTheDocument();
    });

    it('renders the navigation toolbar', () => {
      renderCalendar({});
      // Prev / Today / Next buttons
      expect(screen.getByRole('button', { name: /previous month/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go to today/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next month/i })).toBeInTheDocument();
    });

    it('renders the Month/Week mode toggle toolbar', () => {
      renderCalendar({});
      expect(screen.getByRole('toolbar', { name: /calendar display mode/i })).toBeInTheDocument();
    });

    it('renders "Month" and "Week" mode buttons', () => {
      renderCalendar({});
      expect(screen.getByRole('button', { name: /^month$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^week$/i })).toBeInTheDocument();
    });

    it('renders a period label heading', () => {
      renderCalendar({});
      // The period label is an h2 with aria-live="polite"
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveAttribute('aria-live', 'polite');
    });

    it('renders the MonthGrid by default (month mode)', () => {
      renderCalendar({});
      // MonthGrid has role="grid" with aria-label matching "Calendar for YYYY-MM"
      const grid = screen.getByRole('grid');
      expect(grid.getAttribute('aria-label')).toMatch(/^Calendar for \d{4}-\d{2}$/);
    });
  });

  // ── Default mode (month) ───────────────────────────────────────────────────

  describe('default month mode', () => {
    it('month button has aria-pressed="true" by default', () => {
      renderCalendar({});
      expect(screen.getByRole('button', { name: /^month$/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('week button has aria-pressed="false" by default', () => {
      renderCalendar({});
      expect(screen.getByRole('button', { name: /^week$/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('period label shows month name and year', () => {
      renderCalendar({});
      const heading = screen.getByRole('heading', { level: 2 });
      // Format: "March 2024" — should contain a month name and a 4-digit year
      expect(heading.textContent).toMatch(/[A-Za-z]+ \d{4}/);
    });

    it('displays 42 gridcells (6×7 MonthGrid)', () => {
      renderCalendar({});
      expect(screen.getAllByRole('gridcell')).toHaveLength(42);
    });
  });

  // ── Mode toggle ────────────────────────────────────────────────────────────

  describe('mode toggle', () => {
    it('switches to week mode when Week button is clicked', () => {
      renderCalendar({});
      fireEvent.click(screen.getByRole('button', { name: /^week$/i }));
      // WeekGrid has role="grid" with aria-label "Weekly calendar"
      expect(screen.getByRole('grid', { name: /weekly calendar/i })).toBeInTheDocument();
    });

    it('week button has aria-pressed="true" after switching to week mode', () => {
      renderCalendar({});
      fireEvent.click(screen.getByRole('button', { name: /^week$/i }));
      expect(screen.getByRole('button', { name: /^week$/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('month button has aria-pressed="false" after switching to week mode', () => {
      renderCalendar({});
      fireEvent.click(screen.getByRole('button', { name: /^week$/i }));
      expect(screen.getByRole('button', { name: /^month$/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('switches back to month mode when Month button is clicked', () => {
      renderCalendar({});
      fireEvent.click(screen.getByRole('button', { name: /^week$/i }));
      fireEvent.click(screen.getByRole('button', { name: /^month$/i }));
      // Should show MonthGrid again
      const grid = screen.getByRole('grid');
      expect(grid.getAttribute('aria-label')).toMatch(/^Calendar for/);
    });

    it('reads calendarMode from URL param (week mode from URL)', () => {
      renderCalendar({ initialSearchParams: 'calendarMode=week' });
      expect(screen.getByRole('grid', { name: /weekly calendar/i })).toBeInTheDocument();
    });

    it('defaults to month mode for unrecognised calendarMode URL param', () => {
      renderCalendar({ initialSearchParams: 'calendarMode=unknown' });
      const grid = screen.getByRole('grid');
      expect(grid.getAttribute('aria-label')).toMatch(/^Calendar for/);
    });

    it('displays 7 gridcells (WeekGrid) after switching to week mode', () => {
      renderCalendar({});
      fireEvent.click(screen.getByRole('button', { name: /^week$/i }));
      expect(screen.getAllByRole('gridcell')).toHaveLength(7);
    });
  });

  // ── Month navigation ───────────────────────────────────────────────────────

  describe('month navigation', () => {
    it('navigates to previous month when Previous button is clicked', () => {
      renderCalendar({});
      const heading = screen.getByRole('heading', { level: 2 });
      const currentText = heading.textContent!;

      fireEvent.click(screen.getByRole('button', { name: /previous month/i }));

      const newText = screen.getByRole('heading', { level: 2 }).textContent!;
      expect(newText).not.toBe(currentText);
    });

    it('navigates to next month when Next button is clicked', () => {
      renderCalendar({});
      const heading = screen.getByRole('heading', { level: 2 });
      const currentText = heading.textContent!;

      fireEvent.click(screen.getByRole('button', { name: /next month/i }));

      const newText = screen.getByRole('heading', { level: 2 }).textContent!;
      expect(newText).not.toBe(currentText);
    });

    it('returns to current month when Today button is clicked after navigation', () => {
      renderCalendar({});
      const originalText = screen.getByRole('heading', { level: 2 }).textContent!;

      // Navigate away
      fireEvent.click(screen.getByRole('button', { name: /next month/i }));
      fireEvent.click(screen.getByRole('button', { name: /next month/i }));
      expect(screen.getByRole('heading', { level: 2 }).textContent).not.toBe(originalText);

      // Return to today
      fireEvent.click(screen.getByRole('button', { name: /go to today/i }));
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(originalText);
    });

    it('prev then next returns to same month', () => {
      renderCalendar({});
      const originalText = screen.getByRole('heading', { level: 2 }).textContent!;

      fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
      fireEvent.click(screen.getByRole('button', { name: /next month/i }));

      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(originalText);
    });

    it('prev button aria-label says "Previous month" in month mode', () => {
      renderCalendar({});
      expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
    });

    it('next button aria-label says "Next month" in month mode', () => {
      renderCalendar({});
      expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
    });
  });

  // ── Week navigation ────────────────────────────────────────────────────────

  describe('week navigation', () => {
    beforeEach(() => {
      renderCalendar({ initialSearchParams: 'calendarMode=week' });
    });

    it('navigates to previous week when Previous button is clicked', () => {
      const cells = screen.getAllByRole('gridcell');
      const firstDayLabel = cells[0].getAttribute('aria-label')!;

      fireEvent.click(screen.getByRole('button', { name: /previous week/i }));

      const newCells = screen.getAllByRole('gridcell');
      const newFirstDayLabel = newCells[0].getAttribute('aria-label')!;
      expect(newFirstDayLabel).not.toBe(firstDayLabel);
      // The previous Sunday should be 7 days earlier
      const original = parseCellAriaLabel(firstDayLabel);
      const expected = parseCellAriaLabel(newFirstDayLabel);
      expect(original.getTime() - expected.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('navigates to next week when Next button is clicked', () => {
      const cells = screen.getAllByRole('gridcell');
      const firstDayLabel = cells[0].getAttribute('aria-label')!;

      fireEvent.click(screen.getByRole('button', { name: /next week/i }));

      const newCells = screen.getAllByRole('gridcell');
      const newFirstDayLabel = newCells[0].getAttribute('aria-label')!;
      const original = parseCellAriaLabel(firstDayLabel);
      const expected = parseCellAriaLabel(newFirstDayLabel);
      expect(expected.getTime() - original.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('returns to current week when Today button is clicked', () => {
      const originalCells = screen
        .getAllByRole('gridcell')
        .map((c) => c.getAttribute('aria-label')!);

      // Navigate away two weeks
      fireEvent.click(screen.getByRole('button', { name: /next week/i }));
      fireEvent.click(screen.getByRole('button', { name: /next week/i }));

      const movedCells = screen.getAllByRole('gridcell').map((c) => c.getAttribute('aria-label')!);
      expect(movedCells).not.toEqual(originalCells);

      // Return
      fireEvent.click(screen.getByRole('button', { name: /go to today/i }));

      const returnedCells = screen
        .getAllByRole('gridcell')
        .map((c) => c.getAttribute('aria-label')!);
      expect(returnedCells).toEqual(originalCells);
    });

    it('prev button aria-label says "Previous week" in week mode', () => {
      expect(screen.getByRole('button', { name: 'Previous week' })).toBeInTheDocument();
    });

    it('next button aria-label says "Next week" in week mode', () => {
      expect(screen.getByRole('button', { name: 'Next week' })).toBeInTheDocument();
    });
  });

  // ── Period label ───────────────────────────────────────────────────────────

  describe('period label', () => {
    it('shows "Month Year" format in month mode (e.g. "January 2024")', () => {
      renderCalendar({});
      const heading = screen.getByRole('heading', { level: 2 });
      // Should match pattern like "February 2026" or current month
      expect(heading.textContent).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    });

    it('shows week range in week mode when both days in same month', () => {
      renderCalendar({ initialSearchParams: 'calendarMode=week' });
      const heading = screen.getByRole('heading', { level: 2 });
      // Format: "March 10–16, 2024" or similar — contains "–" range separator
      expect(heading.textContent).toMatch(/\d+[–-]\d+/);
    });

    it('updates period label after month navigation', () => {
      renderCalendar({});
      const initial = screen.getByRole('heading', { level: 2 }).textContent!;

      fireEvent.click(screen.getByRole('button', { name: /next month/i }));

      const updated = screen.getByRole('heading', { level: 2 }).textContent!;
      expect(updated).not.toBe(initial);
    });
  });

  // ── Work items and milestones passthrough ──────────────────────────────────

  describe('data passthrough', () => {
    it('passes work items to MonthGrid — CalendarItem elements appear', () => {
      // Use a work item in the current month
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const item = makeWorkItem('x', `${year}-${month}-05`, `${year}-${month}-05`);
      renderCalendar({ workItems: [item] });
      expect(screen.getAllByTestId('calendar-item').length).toBeGreaterThanOrEqual(1);
    });

    it('passes milestones to MonthGrid — CalendarMilestone elements appear', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const m = makeMilestone(1, `${year}-${month}-10`);
      renderCalendar({ milestones: [m] });
      expect(screen.getAllByTestId('calendar-milestone').length).toBeGreaterThanOrEqual(1);
    });

    it('calls onMilestoneClick when a milestone diamond is clicked in month mode', () => {
      const onMilestoneClick = jest.fn();
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const m = makeMilestone(77, `${year}-${month}-10`);
      renderCalendar({ milestones: [m], onMilestoneClick });

      fireEvent.click(screen.getByTestId('calendar-milestone'));

      expect(onMilestoneClick).toHaveBeenCalledWith(77);
    });

    it('calls onMilestoneClick when a milestone diamond is clicked in week mode', () => {
      const onMilestoneClick = jest.fn();
      // Use today's date as the milestone target to ensure it falls within current week
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const m = makeMilestone(88, `${year}-${month}-${day}`);
      renderCalendar({
        milestones: [m],
        onMilestoneClick,
        initialSearchParams: 'calendarMode=week',
      });

      expect(screen.getAllByTestId('calendar-milestone').length).toBe(1);
      fireEvent.click(screen.getByTestId('calendar-milestone'));

      expect(onMilestoneClick).toHaveBeenCalledWith(88);
    });
  });

  // ── Grid area aria-label ───────────────────────────────────────────────────

  describe('grid area accessibility', () => {
    it('grid area has aria-label containing month name and year in month mode', () => {
      renderCalendar({});
      // The gridArea div wraps the MonthGrid. It has an aria-label like "February 2026".
      // The MonthGrid itself has aria-label "Calendar for 2026-02", so we look at the
      // gridArea's parent container instead.
      const grid = screen.getByRole('grid');
      const gridArea = grid.parentElement;
      expect(gridArea?.getAttribute('aria-label')).toMatch(/[A-Z][a-z]+ \d{4}/);
    });

    it('grid area has aria-label containing "Week of" in week mode', () => {
      renderCalendar({ initialSearchParams: 'calendarMode=week' });
      // The gridArea aria-label in week mode is "Week of Sun 10, Mon 11, ..."
      const gridArea = screen.getByRole('grid').parentElement;
      expect(gridArea?.getAttribute('aria-label')).toMatch(/Week of/);
    });
  });

  // ── S/M/L column size toggle removal ──────────────────────────────────────

  describe('S/M/L column size toggle removed', () => {
    it('does not render any button with text "S"', () => {
      renderCalendar({});
      // The old compact column size toggle had a button labelled "S"
      const buttons = screen.queryAllByRole('button');
      const sButtons = buttons.filter((b) => b.textContent === 'S');
      expect(sButtons).toHaveLength(0);
    });

    it('does not render any button with text "M"', () => {
      renderCalendar({});
      // The old default column size toggle had a button labelled "M"
      const buttons = screen.queryAllByRole('button');
      const mButtons = buttons.filter((b) => b.textContent === 'M');
      expect(mButtons).toHaveLength(0);
    });

    it('does not render any button with text "L"', () => {
      renderCalendar({});
      // The old comfortable column size toggle had a button labelled "L"
      const buttons = screen.queryAllByRole('button');
      const lButtons = buttons.filter((b) => b.textContent === 'L');
      expect(lButtons).toHaveLength(0);
    });

    it('does not render a toolbar with "Column size" aria-label', () => {
      renderCalendar({});
      expect(screen.queryByRole('toolbar', { name: /column size/i })).not.toBeInTheDocument();
    });

    it('ignores calendarSize URL param — still renders the grid normally', () => {
      // Even if the old URL param calendarSize=compact is present, the grid should render
      renderCalendar({ initialSearchParams: 'calendarSize=compact' });
      // MonthGrid still renders (mode unchanged)
      const grid = screen.getByRole('grid');
      expect(grid.getAttribute('aria-label')).toMatch(/^Calendar for/);
    });

    it('ignores calendarSize=comfortable URL param — still renders the grid normally', () => {
      renderCalendar({ initialSearchParams: 'calendarSize=comfortable' });
      const grid = screen.getByRole('grid');
      expect(grid.getAttribute('aria-label')).toMatch(/^Calendar for/);
    });

    it('renders only the Month and Week buttons in the mode toggle toolbar', () => {
      renderCalendar({});
      const modeToolbar = screen.getByRole('toolbar', { name: /calendar display mode/i });
      const buttonsInToolbar = modeToolbar.querySelectorAll('button');
      // Only 2 buttons: Month and Week (no S/M/L)
      expect(buttonsInToolbar).toHaveLength(2);
      const labels = Array.from(buttonsInToolbar).map((b) => b.textContent);
      expect(labels).toContain('Month');
      expect(labels).toContain('Week');
    });
  });

  // ── Tooltip state management ───────────────────────────────────────────────

  describe('tooltip state management', () => {
    beforeAll(() => {
      jest.useFakeTimers();
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('does not render a tooltip before any hover', () => {
      renderCalendar({});
      expect(screen.queryByTestId('gantt-tooltip')).not.toBeInTheDocument();
    });

    it('shows tooltip for a work item after mouse enter and show delay elapses', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const item = makeWorkItem('wi-1', `${year}-${month}-05`, `${year}-${month}-05`);
      renderCalendar({ workItems: [item] });

      const calendarItem = screen.getByTestId('calendar-item');
      fireEvent.mouseEnter(calendarItem, { clientX: 300, clientY: 200 });

      // Tooltip should not appear yet (TOOLTIP_SHOW_DELAY = 120ms)
      expect(screen.queryByTestId('gantt-tooltip')).not.toBeInTheDocument();

      // Advance timers past the show delay
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(screen.getByTestId('gantt-tooltip')).toBeInTheDocument();
    });

    it('tooltip shows work item title after show delay', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const item = makeWorkItem('wi-2', `${year}-${month}-08`, `${year}-${month}-08`);
      item.title = 'Foundation Excavation';
      renderCalendar({ workItems: [item] });

      const calendarItem = screen.getByTestId('calendar-item');
      fireEvent.mouseEnter(calendarItem, { clientX: 300, clientY: 200 });

      act(() => {
        jest.advanceTimersByTime(150);
      });

      const tooltip = screen.getByTestId('gantt-tooltip');
      expect(tooltip).toBeInTheDocument();
      // The title appears inside the tooltip element
      expect(tooltip).toHaveTextContent('Foundation Excavation');
    });

    it('hides tooltip after mouse leave and hide delay elapses', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const item = makeWorkItem('wi-3', `${year}-${month}-10`, `${year}-${month}-10`);
      renderCalendar({ workItems: [item] });

      const calendarItem = screen.getByTestId('calendar-item');

      // Show the tooltip
      fireEvent.mouseEnter(calendarItem, { clientX: 300, clientY: 200 });
      act(() => {
        jest.advanceTimersByTime(150);
      });
      expect(screen.getByTestId('gantt-tooltip')).toBeInTheDocument();

      // Mouse leave
      fireEvent.mouseLeave(calendarItem);

      // Tooltip should still be visible immediately after leave (TOOLTIP_HIDE_DELAY = 80ms)
      // It remains visible until the hide delay passes
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(screen.queryByTestId('gantt-tooltip')).not.toBeInTheDocument();
    });

    it('shows tooltip for a milestone after mouse enter and show delay elapses', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const milestone = makeMilestone(10, `${year}-${month}-12`);
      milestone.title = 'Roof Complete';
      renderCalendar({ milestones: [milestone] });

      const calendarMilestone = screen.getByTestId('calendar-milestone');
      fireEvent.mouseEnter(calendarMilestone, { clientX: 200, clientY: 150 });

      // Tooltip not shown yet
      expect(screen.queryByTestId('gantt-tooltip')).not.toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(150);
      });

      const tooltip = screen.getByTestId('gantt-tooltip');
      expect(tooltip).toBeInTheDocument();
      // The milestone title appears inside the tooltip element
      expect(tooltip).toHaveTextContent('Roof Complete');
    });

    it('cancels pending show timer when mouse leaves before delay elapses', () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const item = makeWorkItem('wi-4', `${year}-${month}-15`, `${year}-${month}-15`);
      renderCalendar({ workItems: [item] });

      const calendarItem = screen.getByTestId('calendar-item');

      // Enter then immediately leave before show delay
      fireEvent.mouseEnter(calendarItem, { clientX: 300, clientY: 200 });

      act(() => {
        jest.advanceTimersByTime(50); // only 50ms of 120ms elapsed
      });

      fireEvent.mouseLeave(calendarItem);

      // Advance well past original show delay
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Tooltip should never have appeared
      expect(screen.queryByTestId('gantt-tooltip')).not.toBeInTheDocument();
    });
  });
});
