/**
 * @jest-environment jsdom
 *
 * Unit tests for MonthGrid component.
 * Verifies: 7 column headers (Sun–Sat), 6 week rows, day cells with date numbers,
 * work items rendered in correct cells, milestones rendered on their target date,
 * today/other-month CSS classes, and milestone click callback.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TimelineWorkItem, TimelineMilestone } from '@cornerstone/shared';
import { DAY_NAMES } from './calendarUtils.js';
import type * as MonthGridTypes from './MonthGrid.js';

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
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let MonthGrid: typeof MonthGridTypes.MonthGrid;

beforeEach(async () => {
  if (!MonthGrid) {
    const module = await import('./MonthGrid.js');
    MonthGrid = module.MonthGrid;
  }
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderGrid(props: {
  year?: number;
  month?: number;
  workItems?: TimelineWorkItem[];
  milestones?: TimelineMilestone[];
  onMilestoneClick?: jest.Mock;
}) {
  return render(
    <MemoryRouter>
      <MonthGrid
        year={props.year ?? 2024}
        month={props.month ?? 3}
        workItems={props.workItems ?? []}
        milestones={props.milestones ?? []}
        onMilestoneClick={props.onMilestoneClick}
      />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MonthGrid', () => {
  // ── Header row ─────────────────────────────────────────────────────────────

  describe('column headers', () => {
    it('renders 7 column header cells', () => {
      renderGrid({});
      expect(screen.getAllByRole('columnheader')).toHaveLength(7);
    });

    it('renders all day names (Sun–Sat)', () => {
      renderGrid({});
      for (const name of DAY_NAMES) {
        // Each day name appears once in the full-name span (visible on tablet+)
        // We use getAllBy because the narrow initial might repeat letter S
        expect(screen.getAllByText(name).length).toBeGreaterThanOrEqual(1);
      }
    });

    it('first column header is Sunday', () => {
      renderGrid({});
      const headers = screen.getAllByRole('columnheader');
      expect(headers[0]).toHaveAttribute('aria-label', 'Sun');
    });

    it('last column header is Saturday', () => {
      renderGrid({});
      const headers = screen.getAllByRole('columnheader');
      expect(headers[6]).toHaveAttribute('aria-label', 'Sat');
    });
  });

  // ── Grid structure ─────────────────────────────────────────────────────────

  describe('grid structure', () => {
    it('has role="grid" on the outer container', () => {
      renderGrid({});
      expect(screen.getByRole('grid')).toBeInTheDocument();
    });

    it('renders 42 gridcell elements (6 rows × 7 columns)', () => {
      renderGrid({});
      expect(screen.getAllByRole('gridcell')).toHaveLength(42);
    });

    it('each gridcell has aria-label matching its date string', () => {
      renderGrid({ year: 2024, month: 3 });
      // March 1, 2024 should be a cell
      const cells = screen.getAllByRole('gridcell');
      const march1Cell = cells.find((c) => c.getAttribute('aria-label') === '2024-03-01');
      expect(march1Cell).toBeDefined();
    });

    it('aria-label on grid matches year and month', () => {
      renderGrid({ year: 2024, month: 3 });
      expect(screen.getByRole('grid')).toHaveAttribute('aria-label', 'Calendar for 2024-03');
    });
  });

  // ── Date numbers ───────────────────────────────────────────────────────────

  describe('date numbers', () => {
    it('renders day 1 through 31 for March 2024 (31-day month)', () => {
      renderGrid({ year: 2024, month: 3 });
      for (let day = 1; day <= 31; day++) {
        // Multiple cells may show the same number (e.g. day 1 from prev/next month)
        const matches = screen.getAllByText(String(day));
        expect(matches.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('renders day 1 as the first in-month cell', () => {
      // Sept 2024 starts on Sunday — cell[0] is day 1
      renderGrid({ year: 2024, month: 9 });
      const cells = screen.getAllByRole('gridcell');
      // First cell should have aria-label 2024-09-01
      expect(cells[0]).toHaveAttribute('aria-label', '2024-09-01');
    });
  });

  // ── Work items rendered in correct cells ────────────────────────────────────

  describe('work items', () => {
    it('renders CalendarItem elements for items spanning a day', () => {
      // Item spans all of March 2024
      const item = makeWorkItem('a', '2024-03-01', '2024-03-31', 'Foundation Work');
      renderGrid({ year: 2024, month: 3, workItems: [item] });
      // 31 days in March → 31 calendar-item elements
      const calendarItems = screen.getAllByTestId('calendar-item');
      expect(calendarItems.length).toBe(31);
    });

    it('does not render CalendarItem for item outside displayed month', () => {
      const item = makeWorkItem('b', '2024-04-01', '2024-04-30', 'April Only');
      renderGrid({ year: 2024, month: 3, workItems: [item] });
      // Item is in April, grid shows March — item should appear in trailing cells
      // but trailing cells of a 6-row March grid may include April 1
      // Let's check the total: trailing days of March 2024 include April 1-10
      // The item starts April 1 → it appears only in April cells in the grid
      // March 2024 ends on Sunday, so trailing days are April 1+ → item DOES appear
      // in those trailing cells. Test that it does NOT appear for March-only cells:
      const marchCells = screen.getAllByRole('gridcell').filter((c) => {
        const label = c.getAttribute('aria-label') ?? '';
        return label.startsWith('2024-03-');
      });
      // None of the March cells should contain a calendar-item for this April item
      for (const cell of marchCells) {
        expect(cell.querySelector('[data-testid="calendar-item"]')).toBeNull();
      }
    });

    it('renders item in every cell it spans within the grid', () => {
      // Item spans March 10–12 (3 days)
      const item = makeWorkItem('c', '2024-03-10', '2024-03-12', 'Short Task');
      renderGrid({ year: 2024, month: 3, workItems: [item] });
      const calendarItems = screen.getAllByTestId('calendar-item');
      expect(calendarItems.length).toBe(3);
    });

    it('renders multiple items per day when items overlap', () => {
      const itemA = makeWorkItem('a', '2024-03-15', '2024-03-15', 'Task A');
      const itemB = makeWorkItem('b', '2024-03-15', '2024-03-15', 'Task B');
      renderGrid({ year: 2024, month: 3, workItems: [itemA, itemB] });
      const calendarItems = screen.getAllByTestId('calendar-item');
      expect(calendarItems.length).toBe(2);
    });

    it('renders no CalendarItem elements when workItems is empty', () => {
      renderGrid({ year: 2024, month: 3, workItems: [] });
      expect(screen.queryAllByTestId('calendar-item')).toHaveLength(0);
    });
  });

  // ── Milestones ─────────────────────────────────────────────────────────────

  describe('milestones', () => {
    it('renders CalendarMilestone for a milestone in the displayed month', () => {
      const m = makeMilestone(1, '2024-03-15', 'Foundation Complete');
      renderGrid({ year: 2024, month: 3, milestones: [m] });
      expect(screen.getAllByTestId('calendar-milestone')).toHaveLength(1);
    });

    it('renders milestone title text', () => {
      const m = makeMilestone(1, '2024-03-20', 'Framing Done');
      renderGrid({ year: 2024, month: 3, milestones: [m] });
      expect(screen.getByText('Framing Done')).toBeInTheDocument();
    });

    it('renders no CalendarMilestone when milestones list is empty', () => {
      renderGrid({ year: 2024, month: 3, milestones: [] });
      expect(screen.queryAllByTestId('calendar-milestone')).toHaveLength(0);
    });

    it('calls onMilestoneClick when milestone diamond is clicked', () => {
      const onMilestoneClick = jest.fn();
      const m = makeMilestone(99, '2024-03-10', 'Test Milestone');
      renderGrid({ year: 2024, month: 3, milestones: [m], onMilestoneClick });

      fireEvent.click(screen.getByTestId('calendar-milestone'));

      expect(onMilestoneClick).toHaveBeenCalledWith(99);
    });

    it('renders multiple milestones on different days', () => {
      const m1 = makeMilestone(1, '2024-03-05');
      const m2 = makeMilestone(2, '2024-03-20');
      renderGrid({ year: 2024, month: 3, milestones: [m1, m2] });
      expect(screen.getAllByTestId('calendar-milestone')).toHaveLength(2);
    });

    it('renders multiple milestones on the same day', () => {
      const m1 = makeMilestone(1, '2024-03-15');
      const m2 = makeMilestone(2, '2024-03-15');
      renderGrid({ year: 2024, month: 3, milestones: [m1, m2] });
      expect(screen.getAllByTestId('calendar-milestone')).toHaveLength(2);
    });
  });

  // ── CSS classes on cells ───────────────────────────────────────────────────

  describe('cell CSS classes', () => {
    it('applies "otherMonth" class to cells outside the current month', () => {
      // September 2024 starts on Sunday, so the first week has no leading days.
      // June 2024 starts on Saturday, so 6 leading days from May.
      renderGrid({ year: 2024, month: 6 });
      const cells = screen.getAllByRole('gridcell');
      // First 6 cells should have the otherMonth class
      const firstCell = cells[0];
      expect(firstCell.className).toContain('otherMonth');
    });

    it('does not apply "otherMonth" class to in-month cells', () => {
      // September 2024 starts on Sunday
      renderGrid({ year: 2024, month: 9 });
      const cells = screen.getAllByRole('gridcell');
      // First cell is Sep 1 (in-month)
      expect(cells[0].className).not.toContain('otherMonth');
    });
  });

  // ── Responsive day name display ────────────────────────────────────────────

  describe('responsive day name display', () => {
    it('renders narrow day initials for mobile display', () => {
      renderGrid({});
      // Narrow names: S M T W T F S — look for 'M' which is unique
      expect(screen.getAllByText('M').length).toBeGreaterThanOrEqual(1);
    });
  });
});
