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
import type {
  TimelineWorkItem,
  TimelineMilestone,
  TimelineHouseholdItem,
  TimelineHoldsUp,
} from '@cornerstone/shared';
import type * as I18nTypes from '../../i18n/index.js';
import type * as FormattersTypes from '../../lib/formatters.js';
import type * as CalendarViewTypes from './CalendarView.js';
import { CreateMenuProvider, useCreatePrefill } from '../CreateMenu/CreateMenuContext.js';

// ─── Mock: LocaleContext — CalendarView uses useLocale() directly ─────────────

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWorkItem(id: string, startDate: string, endDate: string): TimelineWorkItem {
  return {
    id,
    projectedStartDate: startDate,
    projectedEndDate: endDate,
    isLate: false,
    lateDays: null,
    isHeldUp: false,
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
    assignedVendor: null,
    area: null,
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
    isLate: false,
    lateDays: null,
    isEarly: false,
    earlyDays: null,
    isCritical: false,
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
  const [, monthName, dayStr, yearStr] = match as [string, string, string, string];
  const month = MONTH_NAME_TO_NUMBER[monthName];
  if (!month) throw new Error(`Unknown month name: "${monthName}"`);
  return new Date(Date.UTC(Number(yearStr), month - 1, Number(dayStr)));
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let CalendarView: typeof CalendarViewTypes.CalendarView;
// Loaded lazily: static imports would evaluate the real LocaleContext before the mock is registered.
let i18n: typeof I18nTypes.default;
let formatDayRange: typeof FormattersTypes.formatDayRange;

beforeEach(async () => {
  if (!CalendarView) {
    const module = await import('./CalendarView.js');
    CalendarView = module.CalendarView;
    i18n = (await import('../../i18n/index.js')).default;
    formatDayRange = (await import('../../lib/formatters.js')).formatDayRange;
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
  householdItems?: TimelineHouseholdItem[];
  onMilestoneClick?: jest.Mock;
  initialSearchParams?: string;
  isEmpty?: boolean;
}) {
  const {
    workItems = [],
    milestones = [],
    householdItems,
    onMilestoneClick,
    initialSearchParams = '',
    isEmpty,
  } = props;
  const initialEntry = initialSearchParams ? `/?${initialSearchParams}` : '/';
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CalendarView
        workItems={workItems}
        milestones={milestones}
        householdItems={householdItems}
        onMilestoneClick={onMilestoneClick}
        isEmpty={isEmpty}
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
      expect(screen.getByRole('button', { name: /^today$/i })).toBeInTheDocument();
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
      // MonthGrid has role="grid" with aria-label "Calendar for <Month> <year>"
      const grid = screen.getByRole('grid');
      expect(grid.getAttribute('aria-label')).toMatch(/^Calendar for [A-Z][a-z]+ \d{4}$/);
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
      fireEvent.click(screen.getByRole('button', { name: /^today$/i }));
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
      const firstDayLabel = cells[0]!.getAttribute('aria-label')!;

      fireEvent.click(screen.getByRole('button', { name: /previous week/i }));

      const newCells = screen.getAllByRole('gridcell');
      const newFirstDayLabel = newCells[0]!.getAttribute('aria-label')!;
      expect(newFirstDayLabel).not.toBe(firstDayLabel);
      // The previous Sunday should be 7 days earlier
      const original = parseCellAriaLabel(firstDayLabel);
      const expected = parseCellAriaLabel(newFirstDayLabel);
      expect(original.getTime() - expected.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('navigates to next week when Next button is clicked', () => {
      const cells = screen.getAllByRole('gridcell');
      const firstDayLabel = cells[0]!.getAttribute('aria-label')!;

      fireEvent.click(screen.getByRole('button', { name: /next week/i }));

      const newCells = screen.getAllByRole('gridcell');
      const newFirstDayLabel = newCells[0]!.getAttribute('aria-label')!;
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
      fireEvent.click(screen.getByRole('button', { name: /^today$/i }));

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

    it('shows week range in week mode', () => {
      renderCalendar({ initialSearchParams: 'calendarMode=week' });
      const heading = screen.getByRole('heading', { level: 2 });
      // Same month: "March 10–16, 2024" | Cross month: "March 29 – April 4, 2026"
      expect(heading.textContent).toMatch(/[A-Z][a-z]+ \d+\s*[–-]\s*([A-Z][a-z]+ )?\d+, \d{4}/);
    });

    it('week label is the formatDayRange of the displayed Sunday-Saturday cells', () => {
      renderCalendar({ initialSearchParams: 'calendarMode=week' });
      const cells = screen.getAllByRole('gridcell');
      const first = parseCellAriaLabel(cells[0]!.getAttribute('aria-label')!);
      const last = parseCellAriaLabel(cells[6]!.getAttribute('aria-label')!);
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
        formatDayRange(first, last, 'en-US'),
      );
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

  // ── Empty state (#2198) ───────────────────────────────────────────────────

  describe('empty state', () => {
    it('renders the empty state with message, description and an Add a task link, and no grid', () => {
      renderCalendar({ isEmpty: true });
      const empty = screen.getByTestId('calendar-empty');
      expect(empty).toHaveTextContent('Nothing is scheduled yet');
      expect(empty).toHaveTextContent(
        'Tasks, milestones and purchases appear here as soon as a task has dates.',
      );
      const link = screen.getByRole('link', { name: 'Add a task' });
      expect(link).toHaveAttribute('href', '/project/work-items/new');
      expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    });

    it('keeps the toolbar usable: Next still changes the period label', () => {
      renderCalendar({ isEmpty: true });
      const before = screen.getByRole('heading', { level: 2 }).textContent;
      fireEvent.click(screen.getByRole('button', { name: /next month/i }));
      expect(screen.getByRole('heading', { level: 2 }).textContent).not.toBe(before);
      expect(screen.getByTestId('calendar-empty')).toBeInTheDocument();
    });

    it('shows the empty state in week mode as well', () => {
      renderCalendar({ isEmpty: true, initialSearchParams: 'calendarMode=week' });
      expect(screen.getByTestId('calendar-empty')).toBeInTheDocument();
      expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    });

    it('renders the grid when isEmpty is false, even with empty arrays', () => {
      renderCalendar({ isEmpty: false, workItems: [], milestones: [] });
      expect(screen.queryByTestId('calendar-empty')).not.toBeInTheDocument();
      expect(screen.getByRole('grid')).toBeInTheDocument();
    });

    it('renders the grid when isEmpty is omitted', () => {
      renderCalendar({});
      expect(screen.queryByTestId('calendar-empty')).not.toBeInTheDocument();
    });
  });

  // ── Localised aria-labels (#2198) ─────────────────────────────────────────

  describe('grid area aria-label from t()', () => {
    afterEach(async () => {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    });

    it('week mode reads "Woche vom ..." in German', async () => {
      await act(async () => {
        await i18n.changeLanguage('de');
      });
      renderCalendar({ initialSearchParams: 'calendarMode=week' });
      const gridArea = screen.getByRole('grid').parentElement;
      expect(gridArea?.getAttribute('aria-label')).toMatch(/^Woche vom /);
    });

    it('week mode reads "Week of ..." in English', () => {
      renderCalendar({ initialSearchParams: 'calendarMode=week' });
      const gridArea = screen.getByRole('grid').parentElement;
      expect(gridArea?.getAttribute('aria-label')).toMatch(/^Week of /);
    });

    it('month grid reads "Kalender für ..." in German', async () => {
      await act(async () => {
        await i18n.changeLanguage('de');
      });
      renderCalendar({});
      expect(screen.getByRole('grid').getAttribute('aria-label')).toMatch(/^Kalender für /);
    });
  });

  // ── Tooltip content: area, company, purchase (#2198) ──────────────────────

  describe('tooltip content from the shared builders', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    function thisMonthDate(day: number): string {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    it('shows the area path and the Company when hovering a task with both', () => {
      const item: TimelineWorkItem = {
        ...makeWorkItem('wi-area', thisMonthDate(5), thisMonthDate(5)),
        title: 'Test Tiling',
        area: {
          id: 'a-kitchen',
          name: 'Test Kitchen',
          color: null,
          ancestors: [{ id: 'a-root', name: 'Test House', color: null }],
        },
        assignedVendor: { id: 'v1', name: 'Sample Tiling Ltd', trade: null },
      };
      renderCalendar({ workItems: [item] });
      fireEvent.mouseEnter(screen.getByTestId('calendar-item'), { clientX: 300, clientY: 200 });
      act(() => {
        jest.advanceTimersByTime(150);
      });
      const tooltip = screen.getByTestId('gantt-tooltip');
      expect(screen.getByTestId('gantt-tooltip-area')).toHaveTextContent(
        'Test House › Test Kitchen',
      );
      expect(screen.getByTestId('gantt-tooltip-company')).toHaveTextContent('Sample Tiling Ltd');
      expect(tooltip).toHaveTextContent('Test Tiling');
    });

    it('shows a Waits for / Holds up grouping built from the dependencies', () => {
      const a = { ...makeWorkItem('a', thisMonthDate(3), thisMonthDate(3)), title: 'Test Before' };
      const b = { ...makeWorkItem('b', thisMonthDate(5), thisMonthDate(5)), title: 'Test Middle' };
      const c = { ...makeWorkItem('c', thisMonthDate(7), thisMonthDate(7)), title: 'Test After' };
      render(
        <MemoryRouter>
          <CalendarView
            workItems={[a, b, c]}
            milestones={[]}
            dependencies={[
              {
                predecessorId: 'a',
                successorId: 'b',
                dependencyType: 'finish_to_start',
                leadLagDays: 0,
              },
              {
                predecessorId: 'b',
                successorId: 'c',
                dependencyType: 'finish_to_start',
                leadLagDays: 0,
              },
            ]}
          />
        </MemoryRouter>,
      );
      const middle = screen
        .getAllByTestId('calendar-item')
        .find((el) => el.textContent?.includes('Test Middle'))!;
      fireEvent.mouseEnter(middle, { clientX: 300, clientY: 200 });
      act(() => {
        jest.advanceTimersByTime(150);
      });
      expect(screen.getByTestId('gantt-tooltip-waits-for')).toHaveTextContent('Test Before');
      expect(screen.getByTestId('gantt-tooltip-holds-up')).toHaveTextContent('Test After');
    });

    it('shows the purchase status word and area when hovering a purchase chip', () => {
      const purchase: TimelineHouseholdItem = {
        id: 'hi-1',
        name: 'Sample Sofa',
        category: 'furniture',
        status: 'purchased',
        targetDeliveryDate: thisMonthDate(9),
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        actualDeliveryDate: null,
        isLate: false,
        dependencyIds: [],
        area: { id: 'a-living', name: 'Test Living Room', color: null, ancestors: [] },
      };
      renderCalendar({ householdItems: [purchase] });
      fireEvent.mouseEnter(screen.getByTestId('calendar-hi-item'), { clientX: 300, clientY: 200 });
      act(() => {
        jest.advanceTimersByTime(150);
      });
      const tooltip = screen.getByTestId('gantt-tooltip');
      expect(tooltip).toHaveTextContent('Ordered');
      expect(screen.getByTestId('gantt-tooltip-area')).toHaveTextContent('Test Living Room');
    });

    it('shows the tooltip when an item receives keyboard focus', () => {
      const item = makeWorkItem('wi-focus', thisMonthDate(6), thisMonthDate(6));
      renderCalendar({ workItems: [item] });
      fireEvent.focus(screen.getByTestId('calendar-item'));
      act(() => {
        jest.advanceTimersByTime(150);
      });
      expect(screen.getByTestId('gantt-tooltip')).toBeInTheDocument();
    });

    it('hides the tooltip when the focused item is blurred', () => {
      const item = makeWorkItem('wi-blur', thisMonthDate(6), thisMonthDate(6));
      renderCalendar({ workItems: [item] });
      const el = screen.getByTestId('calendar-item');
      fireEvent.focus(el);
      act(() => {
        jest.advanceTimersByTime(150);
      });
      fireEvent.blur(el);
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(screen.queryByTestId('gantt-tooltip')).not.toBeInTheDocument();
    });
  });

  // ── Touch two-tap and linked items (#2198) ────────────────────────────────

  describe('touch device and linked purchases', () => {
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
      jest.useFakeTimers();
      window.matchMedia = ((query: string) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
      jest.useRealTimers();
    });

    function thisMonthDate(day: number): string {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function makePurchase(overrides: Partial<TimelineHouseholdItem> = {}): TimelineHouseholdItem {
      return {
        id: 'hi-1',
        name: 'Sample Sofa',
        category: 'furniture',
        status: 'scheduled',
        targetDeliveryDate: thisMonthDate(9),
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        actualDeliveryDate: null,
        isLate: false,
        dependencyIds: [],
        ...overrides,
      };
    }

    it('the first tap on a task shows its tooltip with area and Company instead of navigating', () => {
      const item: TimelineWorkItem = {
        ...makeWorkItem('wi-touch', thisMonthDate(5), thisMonthDate(5)),
        area: { id: 'a1', name: 'Test Kitchen', color: null, ancestors: [] },
        assignedVendor: { id: 'v1', name: 'Sample Tiling Ltd', trade: null },
      };
      renderCalendar({ workItems: [item] });
      fireEvent.click(screen.getByTestId('calendar-item'));
      expect(screen.getByTestId('gantt-tooltip-area')).toHaveTextContent('Test Kitchen');
      expect(screen.getByTestId('gantt-tooltip-company')).toHaveTextContent('Sample Tiling Ltd');
    });

    it('the second tap on the same task hides the tooltip again', () => {
      const item = makeWorkItem('wi-touch2', thisMonthDate(5), thisMonthDate(5));
      renderCalendar({ workItems: [item] });
      const el = screen.getByTestId('calendar-item');
      fireEvent.click(el);
      expect(screen.getByTestId('gantt-tooltip')).toBeInTheDocument();
      fireEvent.click(el);
      expect(screen.queryByTestId('gantt-tooltip')).not.toBeInTheDocument();
    });

    it('the first tap on a purchase shows its tooltip with the status word and linked tasks', () => {
      const predecessor = {
        ...makeWorkItem('wi-pre', thisMonthDate(3), thisMonthDate(3)),
        title: 'Test Prep',
      };
      const purchase = makePurchase({
        area: { id: 'a2', name: 'Test Living Room', color: null, ancestors: [] },
        dependencyIds: [
          { predecessorType: 'work_item', predecessorId: 'wi-pre' },
          { predecessorType: 'milestone', predecessorId: '4' },
          { predecessorType: 'work_item', predecessorId: 'wi-missing' },
        ],
      });
      renderCalendar({
        workItems: [predecessor],
        milestones: [{ ...makeMilestone(4, thisMonthDate(2)), title: 'Test Shell Done' }],
        householdItems: [purchase],
      });
      fireEvent.click(screen.getByTestId('calendar-hi-item'));
      const tooltip = screen.getByTestId('gantt-tooltip');
      expect(tooltip).toHaveTextContent('Delivery scheduled');
      expect(screen.getByTestId('gantt-tooltip-area')).toHaveTextContent('Test Living Room');
      expect(tooltip).toHaveTextContent('Test Prep');
      expect(tooltip).toHaveTextContent('Test Shell Done');
    });

    it('hovering a purchase with linked tasks lists them in the tooltip (pointer devices)', () => {
      window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;
      const predecessor = {
        ...makeWorkItem('wi-pre', thisMonthDate(3), thisMonthDate(3)),
        title: 'Test Prep',
      };
      renderCalendar({
        workItems: [predecessor],
        householdItems: [
          makePurchase({
            dependencyIds: [{ predecessorType: 'work_item', predecessorId: 'wi-pre' }],
          }),
        ],
      });
      fireEvent.mouseEnter(screen.getByTestId('calendar-hi-item'), { clientX: 10, clientY: 10 });
      act(() => {
        jest.advanceTimersByTime(150);
      });
      expect(screen.getByTestId('gantt-tooltip')).toHaveTextContent('Test Prep');
    });
  });
});

// ---------------------------------------------------------------------------
// New menu context (#2212): the visible date pre-fills New > Milestone / Diary entry
// ---------------------------------------------------------------------------

describe('CalendarView create context (#2212)', () => {
  function PrefillProbe() {
    return <output data-testid="prefill">{JSON.stringify(useCreatePrefill())}</output>;
  }

  function renderWithMenu(searchParams = '') {
    return render(
      <MemoryRouter initialEntries={[searchParams ? `/?${searchParams}` : '/']}>
        <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={() => {}}>
          <CalendarView workItems={[]} milestones={[]} />
          <PrefillProbe />
        </CreateMenuProvider>
      </MemoryRouter>,
    );
  }

  const prefill = () => JSON.parse(screen.getByTestId('prefill').textContent ?? '{}');

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 2, 18, 12, 0, 0) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('month mode on the current month: today', () => {
    renderWithMenu();
    expect(prefill()).toEqual({ date: '2026-03-18' });
  });

  it('month mode on another month: the first day of the displayed month', () => {
    renderWithMenu();
    fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
    expect(prefill()).toEqual({ date: '2026-02-01' });
    fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    fireEvent.click(screen.getByRole('button', { name: /next month/i }));
    expect(prefill()).toEqual({ date: '2026-04-01' });
  });

  it('returns to today when navigating back to the current month', () => {
    renderWithMenu();
    fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
    fireEvent.click(screen.getByRole('button', { name: /^today$/i }));
    expect(prefill()).toEqual({ date: '2026-03-18' });
  });

  it('week mode on the current week: today', () => {
    renderWithMenu('calendarMode=week');
    expect(prefill()).toEqual({ date: '2026-03-18' });
  });

  it('week mode on another week: the first day of the displayed week', () => {
    renderWithMenu('calendarMode=week');
    fireEvent.click(screen.getByRole('button', { name: /previous week/i }));
    expect(prefill()).toEqual({ date: '2026-03-08' });
  });

  it('never carries an area or a company (the calendar has neither)', () => {
    renderWithMenu();
    expect(Object.keys(prefill())).toEqual(['date']);
  });

  it('clears the context when the calendar unmounts', () => {
    const { rerender } = renderWithMenu();
    rerender(
      <MemoryRouter>
        <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={() => {}}>
          <PrefillProbe />
        </CreateMenuProvider>
      </MemoryRouter>,
    );
    expect(prefill()).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Story #2232 — "Holds up n tasks" comes from the server's holdsUp counts
// ---------------------------------------------------------------------------

describe('CalendarView — holds-up count from the holdsUp prop (#2232)', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  function monthDay(day: string) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${day}`;
  }

  function renderWithHoldsUp(holdsUp: TimelineHoldsUp | undefined) {
    const item = makeWorkItem('wi-h', monthDay('06'), monthDay('06'));
    const dependent = makeWorkItem('wi-dep', monthDay('20'), monthDay('20'));
    dependent.requiredMilestoneIds = [10];
    const milestone = makeMilestone(10, monthDay('12'));
    return render(
      <MemoryRouter>
        <CalendarView workItems={[item, dependent]} milestones={[milestone]} holdsUp={holdsUp} />
      </MemoryRouter>,
    );
  }

  const COUNTS: TimelineHoldsUp = {
    workItems: { 'wi-h': { count: 3, startingWithin14Days: 1 } },
    milestones: { '10': { count: 5, startingWithin14Days: 0 } },
  };

  it('hovering a task shows the server count', () => {
    renderWithHoldsUp(COUNTS);
    fireEvent.mouseEnter(screen.getAllByTestId('calendar-item')[0]!, {
      clientX: 300,
      clientY: 200,
    });
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(screen.getByTestId('gantt-tooltip-holds-up')).toHaveTextContent('Holds up 3 tasks');
  });

  it('hovering a milestone shows the server count for that milestone', () => {
    renderWithHoldsUp(COUNTS);
    fireEvent.mouseEnter(screen.getByTestId('calendar-milestone'), { clientX: 200, clientY: 150 });
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(screen.getByTestId('gantt-tooltip')).toHaveTextContent('Holds up 5 tasks');
  });

  it('falls back to 0 without the holdsUp prop', () => {
    renderWithHoldsUp(undefined);
    fireEvent.mouseEnter(screen.getByTestId('calendar-milestone'), { clientX: 200, clientY: 150 });
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(screen.getByTestId('gantt-tooltip')).toHaveTextContent('Holds up 0 tasks');
  });

  it('falls back to 0 for a task missing from holdsUp', () => {
    renderWithHoldsUp({ workItems: {}, milestones: {} });
    fireEvent.mouseEnter(screen.getAllByTestId('calendar-item')[0]!, {
      clientX: 300,
      clientY: 200,
    });
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(screen.getByTestId('gantt-tooltip')).not.toHaveTextContent(/Holds up [1-9]/);
  });
});

describe('CalendarView — hover timing and tooltip link edge cases (#2232 coverage)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function monthDay(day: number) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function purchase(id: string, overrides: Partial<TimelineHouseholdItem> = {}) {
    return {
      id,
      name: `Test ${id}`,
      category: 'furniture',
      status: 'scheduled',
      targetDeliveryDate: monthDay(9),
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      actualDeliveryDate: null,
      isLate: false,
      dependencyIds: [],
      ...overrides,
    } as TimelineHouseholdItem;
  }

  function itemByTitle(title: string): HTMLElement {
    const el = screen
      .getAllByTestId('calendar-item')
      .find((e) => (e.textContent ?? '').includes(title));
    if (!el) throw new Error(`No calendar item with title ${title}`);
    return el;
  }

  function show(el: HTMLElement) {
    fireEvent.mouseEnter(el, { clientX: 300, clientY: 200 });
    act(() => {
      jest.advanceTimersByTime(150);
    });
  }

  it('re-entering an item before the leave delay ends keeps its tooltip', () => {
    const item = makeWorkItem('wi-flicker', monthDay(5), monthDay(5));
    renderCalendar({ workItems: [item] });
    const el = screen.getByTestId('calendar-item');

    fireEvent.mouseEnter(el, { clientX: 300, clientY: 200 });
    fireEvent.mouseLeave(el);
    fireEvent.mouseEnter(el, { clientX: 300, clientY: 200 });
    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(screen.getByTestId('gantt-tooltip')).toBeInTheDocument();
  });

  it('moving the pointer over an item and over a milestone keeps its tooltip open', () => {
    renderCalendar({
      workItems: [makeWorkItem('wi-move', monthDay(5), monthDay(5))],
      milestones: [makeMilestone(3, monthDay(12))],
    });
    show(screen.getByTestId('calendar-item'));
    fireEvent.mouseMove(screen.getByTestId('calendar-item'), { clientX: 320, clientY: 210 });
    expect(screen.getByTestId('gantt-tooltip')).toBeInTheDocument();

    const diamond = screen.getByTestId('calendar-milestone');
    show(diamond);
    fireEvent.mouseMove(diamond, { clientX: 330, clientY: 220 });
    fireEvent.mouseLeave(diamond);
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(screen.queryByTestId('gantt-tooltip')).not.toBeInTheDocument();
  });

  it('hovering a milestone again before the hide delay ends keeps it showing', () => {
    renderCalendar({ milestones: [makeMilestone(4, monthDay(12))] });
    const diamond = screen.getByTestId('calendar-milestone');
    show(diamond);
    fireEvent.mouseLeave(diamond);
    fireEvent.mouseEnter(diamond, { clientX: 200, clientY: 150 });
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(screen.getByTestId('gantt-tooltip')).toHaveTextContent('Milestone 4');
  });

  it('lists predecessors and successors in a task tooltip and ignores edges to unknown tasks', () => {
    const a = { ...makeWorkItem('wi-a', monthDay(5), monthDay(5)), title: 'Test Alpha' };
    const b = { ...makeWorkItem('wi-b', monthDay(7), monthDay(7)), title: 'Test Beta' };
    render(
      <MemoryRouter>
        <CalendarView
          workItems={[a, b]}
          milestones={[]}
          dependencies={[
            {
              predecessorId: 'wi-a',
              successorId: 'wi-b',
              dependencyType: 'finish_to_start',
              leadLagDays: 0,
            },
            {
              predecessorId: 'wi-a',
              successorId: 'wi-ghost',
              dependencyType: 'finish_to_start',
              leadLagDays: 0,
            },
            {
              predecessorId: 'wi-ghost',
              successorId: 'wi-b',
              dependencyType: 'finish_to_start',
              leadLagDays: 0,
            },
            {
              predecessorId: 'wi-ghost',
              successorId: 'wi-ghost-2',
              dependencyType: 'finish_to_start',
              leadLagDays: 0,
            },
          ]}
        />
      </MemoryRouter>,
    );

    show(itemByTitle('Test Alpha'));
    expect(screen.getByTestId('gantt-tooltip')).toHaveTextContent('Test Beta');
    expect(screen.getByTestId('gantt-tooltip')).not.toHaveTextContent('wi-ghost');

    show(itemByTitle('Test Beta'));
    expect(screen.getByTestId('gantt-tooltip')).toHaveTextContent('Test Alpha');
    expect(screen.getByTestId('gantt-tooltip')).not.toHaveTextContent('wi-ghost');
  });

  it('lists every task that depends on a milestone and skips linked tasks that are missing', () => {
    const first = {
      ...makeWorkItem('wi-r1', monthDay(14), monthDay(14)),
      title: 'Test Needs One',
      requiredMilestoneIds: [10],
    };
    const second = {
      ...makeWorkItem('wi-r2', monthDay(16), monthDay(16)),
      title: 'Test Needs Two',
      requiredMilestoneIds: [10],
    };
    const linked = { ...makeWorkItem('wi-l', monthDay(3), monthDay(3)), title: 'Test Feeds It' };
    const milestone = { ...makeMilestone(10, monthDay(12)), workItemIds: ['wi-l', 'wi-ghost'] };
    renderCalendar({ workItems: [first, second, linked], milestones: [milestone] });

    show(screen.getByTestId('calendar-milestone'));

    const tip = screen.getByTestId('gantt-tooltip');
    expect(tip).toHaveTextContent('Test Needs One');
    expect(tip).toHaveTextContent('Test Needs Two');
    expect(tip).toHaveTextContent('Test Feeds It');
    expect(tip).not.toHaveTextContent('wi-ghost');
  });

  it('shows a milestone tooltip when the milestone lists no linked tasks field', () => {
    const milestone = {
      ...makeMilestone(11, monthDay(12)),
      workItemIds: undefined,
    } as unknown as TimelineMilestone;
    renderCalendar({ milestones: [milestone] });
    show(screen.getByTestId('calendar-milestone'));
    expect(screen.getByTestId('gantt-tooltip')).toHaveTextContent('Milestone 11');
  });

  it('shows a purchase tooltip without links when its predecessors are unknown or missing', () => {
    const lone = purchase('hi-lone', {
      dependencyIds: [
        { predecessorType: 'work_item', predecessorId: 'wi-ghost' },
        { predecessorType: 'milestone', predecessorId: '99' },
      ],
    });
    const solo = purchase('hi-solo', { targetDeliveryDate: monthDay(11) });
    renderCalendar({ householdItems: [lone, solo] });

    const items = screen.getAllByTestId('calendar-hi-item');
    show(items[0]!);

    expect(screen.getByTestId('gantt-tooltip')).toHaveTextContent('Test hi-lone');
    expect(screen.getByTestId('gantt-tooltip')).not.toHaveTextContent('wi-ghost');
  });

  it('links a purchase to a known milestone in its tooltip', () => {
    const linkedPurchase = purchase('hi-ms', {
      dependencyIds: [{ predecessorType: 'milestone', predecessorId: '10' }],
    });
    renderCalendar({
      milestones: [makeMilestone(10, monthDay(2))],
      householdItems: [linkedPurchase],
    });

    show(screen.getAllByTestId('calendar-hi-item')[0]!);

    expect(screen.getByTestId('gantt-tooltip')).toHaveTextContent('Milestone 10');
  });
});
