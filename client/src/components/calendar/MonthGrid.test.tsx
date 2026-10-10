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
import type {
  TimelineWorkItem,
  TimelineMilestone,
  TimelineHouseholdItem,
} from '@cornerstone/shared';
import { DAY_NAMES } from './calendarUtils.js';
import type * as MonthGridTypes from './MonthGrid.js';

// Mock LocaleContext so the component can call useLocale() without a provider.
// The resolved locale is 'en' so day names render in English via Intl.DateTimeFormat('en-US').
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    resolvedLocale: 'en',
    vatRate: 0.19,
    locale: 'en',
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
}));

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
    assignedVendor: null,
    area: null,
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
    isCritical: false,
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
  onItemMouseEnter?: jest.Mock;
  onItemMouseLeave?: jest.Mock;
  onItemMouseMove?: jest.Mock;
  onMilestoneMouseEnter?: jest.Mock;
  onMilestoneMouseLeave?: jest.Mock;
  onMilestoneMouseMove?: jest.Mock;
}) {
  return render(
    <MemoryRouter>
      <MonthGrid
        year={props.year ?? 2024}
        month={props.month ?? 3}
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
      expect(headers[0]!).toHaveAttribute('aria-label', 'Sun');
    });

    it('last column header is Saturday', () => {
      renderGrid({});
      const headers = screen.getAllByRole('columnheader');
      expect(headers[6]!).toHaveAttribute('aria-label', 'Sat');
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

    it('each gridcell has aria-label matching its human-readable date', () => {
      renderGrid({ year: 2024, month: 3 });
      // March 1, 2024 is a Friday
      const cells = screen.getAllByRole('gridcell');
      const march1Cell = cells.find(
        (c) => c.getAttribute('aria-label') === 'Friday, March 1, 2024',
      );
      expect(march1Cell).toBeDefined();
    });

    it('aria-label on grid matches year and month', () => {
      renderGrid({ year: 2024, month: 3 });
      expect(screen.getByRole('grid')).toHaveAttribute('aria-label', 'Calendar for March 2024');
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
      // First cell should be Sunday, September 1, 2024
      expect(cells[0]!).toHaveAttribute('aria-label', 'Sunday, September 1, 2024');
    });
  });

  // ── Work items rendered in correct cells ────────────────────────────────────

  describe('work items', () => {
    it('renders CalendarItem elements for items spanning a day', () => {
      // Item spans all of March 2024
      const item = makeWorkItem('a', '2024-03-01', '2024-03-31', 'Foundation Work');
      renderGrid({ year: 2024, month: 3, workItems: [item] });
      // One segment per week row (March 2024 spans 6 week rows), not one element per day
      const calendarItems = screen.getAllByTestId('calendar-item');
      expect(calendarItems.length).toBe(6);
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
        return label.includes('March') && label.includes('2024');
      });
      // None of the March cells should contain a calendar-item for this April item
      for (const cell of marchCells) {
        expect(cell.querySelector('[data-testid="calendar-item"]')).toBeNull();
      }
    });

    it('renders one segment for an item that stays within a week', () => {
      // Item spans March 10–12 (Sun–Tue of one week) → a single 3-column segment
      const item = makeWorkItem('c', '2024-03-10', '2024-03-12', 'Short Task');
      renderGrid({ year: 2024, month: 3, workItems: [item] });
      const calendarItems = screen.getAllByTestId('calendar-item');
      expect(calendarItems.length).toBe(1);
      expect(calendarItems[0]!.style.right).toBe('calc(-2 * (100% + 1px))');
    });

    it('cuts an item across 3 weeks into exactly 3 segments, one per week row', () => {
      const item = makeWorkItem('long', '2024-03-06', '2024-03-19', 'Long Task');
      renderGrid({ year: 2024, month: 3, workItems: [item] });
      const segments = screen.getAllByTestId('calendar-item');
      expect(segments).toHaveLength(3);
      const rows = segments.map((el) => el.closest('[data-testid="calendar-week-row"]'));
      expect(new Set(rows).size).toBe(3);
      for (const el of segments) {
        expect(el).toHaveTextContent('Long Task');
        expect(el).toHaveAttribute('data-status', 'not_started');
      }
      const labels = segments.map((el) => el.getAttribute('aria-label'));
      expect(new Set(labels).size).toBe(1);
    });

    it('marks the first segment as the start and the last as the end (continuation arrows)', () => {
      const item = makeWorkItem('long', '2024-03-06', '2024-03-19', 'Long Task');
      renderGrid({ year: 2024, month: 3, workItems: [item] });
      const [first, middle, last] = screen.getAllByTestId('calendar-item');
      expect(first!.textContent).toContain('→');
      expect(first!.textContent).not.toContain('←');
      expect(middle!.textContent).toContain('←');
      expect(middle!.textContent).toContain('→');
      expect(last!.textContent).toContain('←');
      expect(last!.textContent).not.toContain('→');
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

  // ── Row height with milestones and purchases (#2198) ──────────────────────

  describe('week row container height', () => {
    function makePurchase(id: string, targetDeliveryDate: string): TimelineHouseholdItem {
      return {
        id,
        name: `Purchase ${id}`,
        category: 'furniture',
        status: 'planned',
        targetDeliveryDate,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        actualDeliveryDate: null,
        isLate: false,
        dependencyIds: [],
      };
    }

    function containerHeights(): string[] {
      return screen
        .getAllByTestId('calendar-week-row')
        .flatMap((row) => [...row.querySelectorAll<HTMLElement>('[class*="itemsContainer"]')])
        .map((el) => el.style.height);
    }

    it('sizes every container of a row for its lanes plus its busiest day of milestones and purchases', () => {
      render(
        <MemoryRouter>
          <MonthGrid
            year={2024}
            month={3}
            workItems={[
              makeWorkItem('a', '2024-03-11', '2024-03-13'),
              makeWorkItem('b', '2024-03-12', '2024-03-14'),
            ]}
            milestones={[makeMilestone(1, '2024-03-15')]}
            householdItems={[makePurchase('p1', '2024-03-15'), makePurchase('p2', '2024-03-15')]}
          />
        </MemoryRouter>,
      );
      const rows = screen.getAllByTestId('calendar-week-row');
      // Row of Mar 10-16: 2 lanes + (1 milestone + 2 purchases on Fri) = 5 lanes of 20px
      const target = rows[2]!;
      const containers = target.querySelectorAll<HTMLElement>('[class*="itemsContainer"]');
      expect(containers).toHaveLength(7);
      for (const container of containers) {
        expect(container.style.height).toBe(`${(2 + 3) * 20}px`);
      }
    });

    it('leaves rows without any items unaffected', () => {
      render(
        <MemoryRouter>
          <MonthGrid
            year={2024}
            month={3}
            workItems={[makeWorkItem('a', '2024-03-11', '2024-03-13')]}
            milestones={[]}
            householdItems={[makePurchase('p1', '2024-03-15')]}
          />
        </MemoryRouter>,
      );
      const heights = containerHeights();
      // 6 rows × 7 containers; only the Mar 10-16 row is sized: 1 lane + 1 purchase
      expect(heights).toHaveLength(42);
      const sized = heights.filter((h) => h !== '');
      expect(sized).toHaveLength(7);
      expect(new Set(sized)).toEqual(new Set([`${2 * 20}px`]));
    });

    it('a row with only a milestone gets one lane of height', () => {
      renderGrid({ year: 2024, month: 3, milestones: [makeMilestone(1, '2024-03-15')] });
      const sized = containerHeights().filter((h) => h !== '');
      expect(new Set(sized)).toEqual(new Set(['20px']));
    });

    it('stacks purchases below the milestone on the same day', () => {
      render(
        <MemoryRouter>
          <MonthGrid
            year={2024}
            month={3}
            workItems={[]}
            milestones={[makeMilestone(1, '2024-03-15')]}
            householdItems={[makePurchase('p1', '2024-03-15')]}
          />
        </MemoryRouter>,
      );
      const purchase = screen.getByTestId('calendar-hi-item').parentElement!;
      const milestone = screen.getByTestId('calendar-milestone').parentElement!;
      expect(milestone.style.top).toBe('0px');
      expect(purchase.style.top).toBe('20px');
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
      const firstCell = cells[0]!;
      expect(firstCell.className).toContain('otherMonth');
    });

    it('does not apply "otherMonth" class to in-month cells', () => {
      // September 2024 starts on Sunday
      renderGrid({ year: 2024, month: 9 });
      const cells = screen.getAllByRole('gridcell');
      // First cell is Sep 1 (in-month)
      expect(cells[0]!.className).not.toContain('otherMonth');
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

  // ── Mouse event callback propagation ──────────────────────────────────────

  describe('mouse event callback propagation', () => {
    it('propagates onItemMouseEnter to CalendarItem components', () => {
      const onItemMouseEnter = jest.fn();
      const item = makeWorkItem('a', '2024-03-15', '2024-03-15', 'Task A');
      renderGrid({ year: 2024, month: 3, workItems: [item], onItemMouseEnter });

      const calendarItem = screen.getByTestId('calendar-item');
      fireEvent.mouseEnter(calendarItem, { clientX: 100, clientY: 200 });

      expect(onItemMouseEnter).toHaveBeenCalledWith('a', 100, 200);
    });

    it('propagates onItemMouseLeave to CalendarItem components', () => {
      const onItemMouseLeave = jest.fn();
      const item = makeWorkItem('b', '2024-03-15', '2024-03-15', 'Task B');
      renderGrid({ year: 2024, month: 3, workItems: [item], onItemMouseLeave });

      fireEvent.mouseLeave(screen.getByTestId('calendar-item'));

      expect(onItemMouseLeave).toHaveBeenCalledTimes(1);
    });

    it('propagates onItemMouseMove to CalendarItem components', () => {
      const onItemMouseMove = jest.fn();
      const item = makeWorkItem('c', '2024-03-15', '2024-03-15', 'Task C');
      renderGrid({ year: 2024, month: 3, workItems: [item], onItemMouseMove });

      fireEvent.mouseMove(screen.getByTestId('calendar-item'), { clientX: 300, clientY: 400 });

      expect(onItemMouseMove).toHaveBeenCalledWith(300, 400);
    });

    it('propagates onMilestoneMouseEnter to CalendarMilestone components', () => {
      const onMilestoneMouseEnter = jest.fn();
      const m = makeMilestone(77, '2024-03-10', 'Test Milestone');
      renderGrid({ year: 2024, month: 3, milestones: [m], onMilestoneMouseEnter });

      const calendarMilestone = screen.getByTestId('calendar-milestone');
      fireEvent.mouseEnter(calendarMilestone, { clientX: 50, clientY: 75 });

      expect(onMilestoneMouseEnter).toHaveBeenCalledWith(77, 50, 75);
    });

    it('propagates onMilestoneMouseLeave to CalendarMilestone components', () => {
      const onMilestoneMouseLeave = jest.fn();
      const m = makeMilestone(88, '2024-03-10', 'Milestone Leave');
      renderGrid({ year: 2024, month: 3, milestones: [m], onMilestoneMouseLeave });

      fireEvent.mouseLeave(screen.getByTestId('calendar-milestone'));

      expect(onMilestoneMouseLeave).toHaveBeenCalledTimes(1);
    });

    it('propagates onMilestoneMouseMove to CalendarMilestone components', () => {
      const onMilestoneMouseMove = jest.fn();
      const m = makeMilestone(99, '2024-03-10', 'Milestone Move');
      renderGrid({ year: 2024, month: 3, milestones: [m], onMilestoneMouseMove });

      fireEvent.mouseMove(screen.getByTestId('calendar-milestone'), { clientX: 200, clientY: 300 });

      expect(onMilestoneMouseMove).toHaveBeenCalledWith(200, 300);
    });
  });

  // ── No data-column-size attribute ─────────────────────────────────────────

  describe('no data-column-size attribute (toggle removed)', () => {
    it('does not set data-column-size on the grid element', () => {
      renderGrid({ year: 2024, month: 3 });
      const grid = screen.getByRole('grid');
      expect(grid).not.toHaveAttribute('data-column-size');
    });
  });
});
