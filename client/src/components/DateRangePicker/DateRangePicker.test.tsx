import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import type { ReactNode } from 'react';
import { render as rtlRender, screen, fireEvent, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateRangePicker } from './DateRangePicker.js';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import styles from './DateRangePicker.module.css';

/**
 * Custom render function that wraps the component with LocaleProvider
 */
function render(component: ReactNode, options?: Parameters<typeof rtlRender>[1]) {
  return rtlRender(<LocaleProvider>{component}</LocaleProvider>, options);
}

/**
 * Helper to get month label text from the picker
 */
function getMonthLabel(container: HTMLElement): string {
  const monthLabel = container.querySelector('.monthLabel');
  return monthLabel?.textContent || '';
}

/**
 * Helper to get all day buttons
 */
function getDayButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll(`.${styles.dayButton}`));
}

/**
 * Helper to find a day button by its text content
 */
function findDayButton(container: HTMLElement, dayNumber: number): HTMLButtonElement | null {
  return getDayButtons(container).find((btn) => btn.textContent === String(dayNumber)) || null;
}

/**
 * Helper to check if element has a specific class
 */
function hasClass(element: Element, className: string): boolean {
  return element.className.includes(className);
}

/**
 * Helper to get the phase label text
 */
function getPhaseLabel(container: HTMLElement): string {
  const phaseLabel = container.querySelector(`.${styles.phaseLabel}`);
  return phaseLabel?.textContent || '';
}

describe('DateRangePicker', () => {
  // Freeze time to 2026-03-15 so the picker's default "current month" is always March 2026.
  // Without this, tests that click specific day numbers (e.g. day 15) and assert a March date
  // become time-bombs: once the real clock advances to April 2026+ the picker shows a different
  // month and the expected date strings no longer match.
  // doNotFake preserves real async timers so React Testing Library's findBy* and internal
  // microtasks (act, etc.) continue to work correctly.
  beforeAll(() => {
    jest.useFakeTimers({
      doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'performance'],
    });
    jest.setSystemTime(new Date('2026-03-15T12:00:00Z'));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  describe('rendering', () => {
    it('renders a calendar grid with 7 day header columns', () => {
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={jest.fn()} />,
      );
      const dayHeaders = container.querySelectorAll(`.${styles.dayHeader}`);
      expect(dayHeaders).toHaveLength(7);
    });

    it('renders navigation buttons for previous and next month', () => {
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={jest.fn()} />,
      );
      const navButtons = container.querySelectorAll(`.${styles.navButton}`);
      expect(navButtons).toHaveLength(2);
    });

    it('renders the month/year heading', () => {
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={jest.fn()} />,
      );
      const monthLabel = container.querySelector(`.${styles.monthLabel}`);
      expect(monthLabel).toBeInTheDocument();
      expect(monthLabel?.textContent).toMatch(/^\w+\s\d{4}$/); // "Month YYYY"
    });

    it('renders day buttons for the month grid (approximately 40-42 cells for 6-row layout)', () => {
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={jest.fn()} />,
      );
      const dayButtons = getDayButtons(container);
      expect(dayButtons.length).toBeGreaterThanOrEqual(35); // Minimum 5 full weeks
      expect(dayButtons.length).toBeLessThanOrEqual(42); // Maximum 6 full weeks
    });

    it('renders with no selected day when startDate="" and endDate=""', () => {
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={jest.fn()} />,
      );
      const selectedButtons = getDayButtons(container).filter((btn) =>
        hasClass(btn, styles.daySelected!),
      );
      expect(selectedButtons).toHaveLength(0);
    });

    it('applies selected styling to the start date day button', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const dayBtn = findDayButton(container, 15);
      expect(dayBtn).toHaveClass(styles.daySelected!);
    });

    it('applies selected styling to both start and end date buttons when both are set', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="2026-03-25" onChange={jest.fn()} />,
      );
      const dayBtn15 = findDayButton(container, 15);
      const dayBtn25 = findDayButton(container, 25);
      expect(dayBtn15).toHaveClass(styles.daySelected!);
      expect(dayBtn25).toHaveClass(styles.daySelected!);
    });

    it('applies in-range styling to days strictly between start and end dates', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="2026-03-25" onChange={jest.fn()} />,
      );
      const dayBtn20 = findDayButton(container, 20);
      const dayCellContainer = dayBtn20?.closest(`.${styles.dayCell}`);
      expect(dayCellContainer).toHaveClass(styles.dayInRange!);
    });

    it('applies other-month styling to days outside current month', () => {
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={jest.fn()} />,
      );
      const otherMonthBtns = getDayButtons(container).filter((btn) =>
        hasClass(btn, styles.dayOtherMonth!),
      );
      expect(otherMonthBtns.length).toBeGreaterThan(0);
    });

    it("applies today styling to today's date", () => {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={jest.fn()} />,
      );
      const todayBtn = findDayButton(container, today.getDate());
      expect(todayBtn).toHaveClass(styles.dayToday!);
    });
  });

  describe('selection phase', () => {
    it('shows phase label "Select start date" when startDate=""', () => {
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={jest.fn()} />,
      );
      const phaseLabel = getPhaseLabel(container);
      expect(phaseLabel.toLowerCase()).toContain('start');
    });

    it('shows phase label "Select end date" when startDate is set', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const phaseLabel = getPhaseLabel(container);
      expect(phaseLabel.toLowerCase()).toContain('end');
    });

    it('clicking a day when startDate="" calls onChange with the clicked date and empty end', () => {
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />,
      );
      const dayBtn = findDayButton(container, 15);
      expect(dayBtn).toBeTruthy();
      fireEvent.click(dayBtn!);
      expect(mockOnChange).toHaveBeenCalledWith('2026-03-15', '');
    });

    it('advances to selecting-end phase after clicking start date (single mounted instance)', () => {
      // Regression: phase must update within the same mounted instance — no re-render needed
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />,
      );
      const dayBtn = findDayButton(container, 15);
      fireEvent.click(dayBtn!);
      expect(mockOnChange).toHaveBeenCalledWith('2026-03-15', '');

      // Phase label must show "end" immediately — within the same mounted component
      const phaseLabel = getPhaseLabel(container);
      expect(phaseLabel.toLowerCase()).toContain('end');
    });
  });

  describe('phase: selecting-end', () => {
    it('with startDate set, hovering a later day shows range highlight', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      // A day strictly between start and hover should show in-range
      const dayBtn20 = findDayButton(container, 20);
      fireEvent.mouseEnter(dayBtn20!);
      // When hovering 2026-03-20 with start=2026-03-15, day 18 is between them
      const dayBtn18 = findDayButton(container, 18);
      const dayCellContainer = dayBtn18?.closest(`.${styles.dayCell}`);
      expect(dayCellContainer).toHaveClass(styles.dayInRange!);
    });

    it('clicking a day after start calls onChange with start and clicked day', () => {
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={mockOnChange} />,
      );
      const dayBtn25 = findDayButton(container, 25);
      fireEvent.click(dayBtn25!);
      expect(mockOnChange).toHaveBeenCalledWith('2026-03-15', '2026-03-25');
    });

    it('days before start date have dayDisabled class during selecting-end phase', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-20" endDate="" onChange={jest.fn()} />,
      );
      // Day 10 is before day 20, so it should have the dayDisabled CSS class but remain clickable
      const dayBtn10 = findDayButton(container, 10);
      expect(dayBtn10).toBeTruthy();
      expect(dayBtn10).not.toBeDisabled();
      expect(dayBtn10).toHaveClass(styles.dayDisabled!);
    });

    it('clicking the startDate day again calls onChange with empty start and end (clear both)', () => {
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={mockOnChange} />,
      );
      const dayBtn15 = findDayButton(container, 15);
      fireEvent.click(dayBtn15!);
      expect(mockOnChange).toHaveBeenCalledWith('', '');
    });

    it('mouseleave clears hover preview', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const dayBtn20 = findDayButton(container, 20);
      fireEvent.mouseEnter(dayBtn20!);
      // Day 18 is between 15 and 20, should have in-range class during hover
      const dayBtn18 = findDayButton(container, 18);
      let dayCellContainer = dayBtn18?.closest(`.${styles.dayCell}`);
      expect(dayCellContainer).toHaveClass(styles.dayInRange!);

      // After mouse leave, should not have in-range
      fireEvent.mouseLeave(dayBtn20!);
      dayCellContainer = dayBtn18?.closest(`.${styles.dayCell}`);
      expect(dayCellContainer).not.toHaveClass(styles.dayInRange!);
    });

    it('days before start date have dayDisabled CSS class (visually styled, not disabled)', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const dayBtn10 = findDayButton(container, 10);
      expect(dayBtn10).toHaveClass(styles.dayDisabled!);
      expect(dayBtn10).not.toBeDisabled();
    });
  });

  describe('navigation', () => {
    it('clicking previous month button shows previous month', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const initialLabel = getMonthLabel(container);
      expect(initialLabel).toContain('March');

      const prevBtn = container.querySelector(`.${styles.navButton}`);
      fireEvent.click(prevBtn!);

      const newLabel = getMonthLabel(container);
      expect(newLabel).toContain('February');
    });

    it('clicking next month button shows next month', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const initialLabel = getMonthLabel(container);
      expect(initialLabel).toContain('March');

      const navButtons = container.querySelectorAll(`.${styles.navButton}`);
      const nextBtn = navButtons[navButtons.length - 1]!;
      fireEvent.click(nextBtn);

      const newLabel = getMonthLabel(container);
      expect(newLabel).toContain('April');
    });

    it('month/year heading updates when navigating months', () => {
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={jest.fn()} />,
      );
      const nextBtn = container.querySelectorAll(`.${styles.navButton}`)[1]!;

      fireEvent.click(nextBtn);
      const monthLabel = getMonthLabel(container);
      expect(monthLabel).toMatch(/^\w+\s\d{4}$/);
    });
  });

  describe('keyboard navigation', () => {
    it('ArrowRight moves focus to next day', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const grid = container.querySelector(`.${styles.grid}`);

      // Initial focused button should be on startDate (2026-03-15)
      const initialFocused = container.querySelector('button[tabindex="0"]');
      expect(initialFocused).toHaveAttribute('aria-label', expect.stringContaining('15'));

      // Fire ArrowRight keyboard event on grid
      fireEvent.keyDown(grid!, { key: 'ArrowRight' });

      // Now focused button should be on 2026-03-16
      const newFocused = container.querySelector('button[tabindex="0"]');
      expect(newFocused).not.toBe(initialFocused);
      expect(newFocused).toHaveAttribute('aria-label', expect.stringContaining('16'));
    });

    it('ArrowLeft moves focus to previous day', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const grid = container.querySelector(`.${styles.grid}`);

      // Initial focused button should be on startDate (2026-03-15)
      const initialFocused = container.querySelector('button[tabindex="0"]');
      expect(initialFocused).toHaveAttribute('aria-label', expect.stringContaining('15'));

      // Fire ArrowLeft keyboard event on grid
      fireEvent.keyDown(grid!, { key: 'ArrowLeft' });

      // Now focused button should be on 2026-03-14
      const newFocused = container.querySelector('button[tabindex="0"]');
      expect(newFocused).not.toBe(initialFocused);
      expect(newFocused).toHaveAttribute('aria-label', expect.stringContaining('14'));
    });

    it('ArrowDown moves focus 7 days forward', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const grid = container.querySelector(`.${styles.grid}`);

      // Initial focused button should be on startDate (2026-03-15)
      const initialFocused = container.querySelector('button[tabindex="0"]');
      expect(initialFocused).toHaveAttribute('aria-label', expect.stringContaining('15'));

      // Fire ArrowDown keyboard event on grid
      fireEvent.keyDown(grid!, { key: 'ArrowDown' });

      // Now focused button should be on 2026-03-22 (7 days later)
      const newFocused = container.querySelector('button[tabindex="0"]');
      expect(newFocused).not.toBe(initialFocused);
      expect(newFocused).toHaveAttribute('aria-label', expect.stringContaining('22'));
    });

    it('ArrowUp moves focus 7 days backward', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const grid = container.querySelector(`.${styles.grid}`);

      // Initial focused button should be on startDate (2026-03-15)
      const initialFocused = container.querySelector('button[tabindex="0"]');
      expect(initialFocused).toHaveAttribute('aria-label', expect.stringContaining('15'));

      // Fire ArrowUp keyboard event on grid
      fireEvent.keyDown(grid!, { key: 'ArrowUp' });

      // Now focused button should be on 2026-03-08 (7 days earlier)
      const newFocused = container.querySelector('button[tabindex="0"]');
      expect(newFocused).not.toBe(initialFocused);
      expect(newFocused).toHaveAttribute('aria-label', expect.stringContaining('8'));
    });

    it('Enter on a focused day triggers selection', () => {
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />,
      );
      const grid = container.querySelector(`.${styles.grid}`);

      // Fire Enter on the grid (keyboard navigation handler)
      fireEvent.keyDown(grid!, { key: 'Enter' });

      expect(mockOnChange).toHaveBeenCalled();
    });

    it('Space on a focused day triggers selection', () => {
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />,
      );
      const grid = container.querySelector(`.${styles.grid}`);

      // Fire Space on the grid (keyboard navigation handler)
      fireEvent.keyDown(grid!, { key: ' ' });

      expect(mockOnChange).toHaveBeenCalled();
    });

    it('Escape during selecting-end phase cancels selection and resets both dates', () => {
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={mockOnChange} />,
      );
      const grid = container.querySelector('[role="grid"]');
      expect(grid).toBeTruthy();

      // Fire Escape key on grid
      fireEvent.keyDown(grid!, { key: 'Escape' });

      // Expect onChange to be called with both dates cleared
      expect(mockOnChange).toHaveBeenCalledWith('', '');
    });

    it('Escape during selecting-start phase does not call onChange', () => {
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />,
      );
      const grid = container.querySelector('[role="grid"]');
      expect(grid).toBeTruthy();

      // Fire Escape key on grid
      fireEvent.keyDown(grid!, { key: 'Escape' });

      // Expect onChange to NOT have been called
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe('props sync', () => {
    it('when both startDate and endDate props are externally cleared to "", phase resets to selecting-start', () => {
      // Phase is internally managed. Mount with non-empty startDate so useState initializes
      // phase to 'selecting-end'. Then rerender with both props empty so the useEffect
      // fires (deps changed from non-empty to '') and resets phase to selecting-start.
      const mockOnChange = jest.fn();
      const { container, rerender } = rtlRender(
        <LocaleProvider>
          <DateRangePicker startDate="2026-03-15" endDate="2026-03-25" onChange={mockOnChange} />
        </LocaleProvider>,
      );
      // Initial phase is selecting-end (startDate non-empty → useState initializer)
      expect(getPhaseLabel(container).toLowerCase()).toContain('end');

      // Simulate external clear: parent rerenders with both props empty
      rerender(
        <LocaleProvider>
          <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />
        </LocaleProvider>,
      );
      expect(getPhaseLabel(container).toLowerCase()).toContain('start');
    });

    it('when both startDate and endDate props are set externally, phase initializes to selecting-end', () => {
      // When startDate is non-empty, useState initializes phase to 'selecting-end' (line 92-94 of component).
      // This means phase reflects readiness to pick an end date when a start is already set.
      const { container: container1 } = render(
        <DateRangePicker startDate="2026-03-15" endDate="2026-03-25" onChange={jest.fn()} />,
      );
      const phaseLabel1 = getPhaseLabel(container1);
      expect(phaseLabel1.toLowerCase()).toContain('end');

      // Mounting with only startDate set also starts at selecting-end
      const { container: container2 } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const phaseLabel2 = getPhaseLabel(container2);
      expect(phaseLabel2.toLowerCase()).toContain('end');
    });

    it('partial prop update (only startDate changes) does NOT reset phase to selecting-start', () => {
      // After clicking a day, phase becomes selecting-end.
      // When parent reflects onChange by setting startDate prop, phase must NOT reset.
      const mockOnChange = jest.fn();
      const { container, rerender } = rtlRender(
        <LocaleProvider>
          <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />
        </LocaleProvider>,
      );
      // Click day 15 → enters selecting-end phase
      const dayBtn15 = findDayButton(container, 15);
      fireEvent.click(dayBtn15!);
      expect(getPhaseLabel(container).toLowerCase()).toContain('end');

      // Parent reflects the onChange call by updating startDate prop only (endDate still empty)
      rerender(
        <LocaleProvider>
          <DateRangePicker startDate="2026-03-15" endDate="" onChange={mockOnChange} />
        </LocaleProvider>,
      );
      // Phase must remain 'selecting-end' — NOT reset to 'selecting-start'
      expect(getPhaseLabel(container).toLowerCase()).toContain('end');
    });
  });

  describe('accessibility', () => {
    it('calendar grid has role="grid" with aria-label', () => {
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={jest.fn()} />,
      );
      const grid = container.querySelector(`.${styles.grid}`);
      expect(grid).toHaveAttribute('role', 'grid');
    });

    it('week rows have role="row"', () => {
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={jest.fn()} />,
      );
      const weekRows = container.querySelectorAll(`.${styles.weekRow}`);
      weekRows.forEach((row) => {
        expect(row).toHaveAttribute('role', 'row');
      });
    });

    it('day cells have role="gridcell"', () => {
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={jest.fn()} />,
      );
      const dayCells = container.querySelectorAll(`.${styles.dayCell}`);
      expect(dayCells.length).toBeGreaterThan(0);
      dayCells.forEach((cell) => {
        expect(cell).toHaveAttribute('role', 'gridcell');
      });
    });

    it('day buttons have aria-label with formatted date', () => {
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={jest.fn()} />,
      );
      const dayBtn15 = findDayButton(container, 15);
      expect(dayBtn15).toHaveAttribute('aria-label');
      const label = dayBtn15?.getAttribute('aria-label');
      expect(label).toMatch(/\d+/); // Should contain a number
    });

    it('selected day has aria-pressed="true"', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const dayBtn15 = findDayButton(container, 15);
      expect(dayBtn15).toHaveAttribute('aria-pressed', 'true');
    });

    it('unselected day has aria-pressed="false"', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const dayBtn10 = findDayButton(container, 10);
      expect(dayBtn10).toHaveAttribute('aria-pressed', 'false');
    });

    it('nav buttons have aria-label', () => {
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={jest.fn()} />,
      );
      const navButtons = container.querySelectorAll(`.${styles.navButton}`);
      navButtons.forEach((btn) => {
        expect(btn).toHaveAttribute('aria-label');
      });
    });
  });

  describe('edge cases', () => {
    it('handles year transitions when navigating backwards from January', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-01-15" endDate="" onChange={jest.fn()} />,
      );
      const prevBtn = container.querySelector(`.${styles.navButton}`);
      fireEvent.click(prevBtn!);
      const monthLabel = getMonthLabel(container);
      expect(monthLabel).toContain('2025');
      expect(monthLabel).toContain('December');
    });

    it('handles year transitions when navigating forward from December', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-12-15" endDate="" onChange={jest.fn()} />,
      );
      const navButtons = container.querySelectorAll(`.${styles.navButton}`);
      const nextBtn = navButtons[navButtons.length - 1]!;
      fireEvent.click(nextBtn);
      const monthLabel = getMonthLabel(container);
      expect(monthLabel).toContain('2027');
      expect(monthLabel).toContain('January');
    });

    it('renders correctly for leap year dates', () => {
      const { container } = render(
        <DateRangePicker startDate="2024-02-29" endDate="" onChange={jest.fn()} />,
      );
      const monthLabel = getMonthLabel(container);
      expect(monthLabel).toContain('February');
      expect(monthLabel).toContain('2024');
    });

    it('handles range selection from end-of-month to next month', () => {
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="2026-03-31" endDate="" onChange={mockOnChange} />,
      );
      const navButtons = container.querySelectorAll(`.${styles.navButton}`);
      const nextBtn = navButtons[navButtons.length - 1]!;
      fireEvent.click(nextBtn);
      const dayBtn1 = findDayButton(container, 1);
      fireEvent.click(dayBtn1!);
      expect(mockOnChange).toHaveBeenCalledWith('2026-03-31', '2026-04-01');
    });
  });

  describe('range styling', () => {
    it('applies dayRangeStart styling to the start date with proper background gradient', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="2026-03-25" onChange={jest.fn()} />,
      );
      const dayBtn15 = findDayButton(container, 15);
      const dayCellContainer = dayBtn15?.closest(`.${styles.dayCell}`);
      expect(dayCellContainer).toHaveClass(styles.dayRangeStart!);
    });

    it('applies dayRangeEnd styling to the end date with proper background gradient', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="2026-03-25" onChange={jest.fn()} />,
      );
      const dayBtn25 = findDayButton(container, 25);
      const dayCellContainer = dayBtn25?.closest(`.${styles.dayCell}`);
      expect(dayCellContainer).toHaveClass(styles.dayRangeEnd!);
    });

    it('does not apply range styling when only start date is selected', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const dayBtn20 = findDayButton(container, 20);
      const dayCellContainer = dayBtn20?.closest(`.${styles.dayCell}`);
      expect(dayCellContainer).not.toHaveClass(styles.dayInRange!);
    });

    it('shows hover preview when hovering over day after start date during selecting-end phase', () => {
      const { container } = render(
        <DateRangePicker startDate="2026-03-15" endDate="" onChange={jest.fn()} />,
      );
      const dayBtn25 = findDayButton(container, 25);
      fireEvent.mouseEnter(dayBtn25!);
      // Day 20 is between 15 (start) and 25 (hover), should show in-range
      const dayBtn20 = findDayButton(container, 20);
      const dayCellContainer = dayBtn20?.closest(`.${styles.dayCell}`);
      expect(dayCellContainer).toHaveClass(styles.dayInRange!);
    });
  });

  describe('pendingStartDate regression tests (issue #1178)', () => {
    it('phase persists as selecting-end immediately after clicking start date without re-render', () => {
      // Regression: previously the phase reset to selecting-start after clicking a start date
      // because phase depended on the startDate *prop* which hadn't been updated yet.
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />,
      );
      // Click day 15 as the start date
      const dayBtn15 = findDayButton(container, 15);
      fireEvent.click(dayBtn15!);
      // onChange emits partial selection
      expect(mockOnChange).toHaveBeenCalledWith('2026-03-15', '');
      // Phase label must immediately show "end" within the same mounted instance
      // (props have NOT been updated — parent hasn't called setState yet)
      expect(getPhaseLabel(container).toLowerCase()).toContain('end');
    });

    it('hover range preview uses pendingStartDate after clicking start (not the prop)', () => {
      // After clicking day 10, pendingStartDate='2026-03-10', phase=selecting-end.
      // Hovering day 20 should show day 15 (between 10 and 20) as in-range.
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />,
      );
      // Click day 10 — startDate prop is still '' but pendingStartDate is now '2026-03-10'
      const dayBtn10 = findDayButton(container, 10);
      fireEvent.click(dayBtn10!);
      expect(getPhaseLabel(container).toLowerCase()).toContain('end');

      // Hover over day 20
      const dayBtn20 = findDayButton(container, 20);
      fireEvent.mouseEnter(dayBtn20!);

      // Day 15 is strictly between 10 and 20, so it must show dayInRange
      const dayBtn15 = findDayButton(container, 15);
      const dayCellContainer = dayBtn15?.closest(`.${styles.dayCell}`);
      expect(dayCellContainer).toHaveClass(styles.dayInRange!);
    });

    it('dayDisabled uses pendingStartDate (not prop) after clicking start date', () => {
      // After clicking day 20, pendingStartDate='2026-03-20'.
      // Day 10 must have dayDisabled class even though startDate prop is still ''.
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />,
      );
      // Click day 20 — startDate prop remains ''
      const dayBtn20 = findDayButton(container, 20);
      fireEvent.click(dayBtn20!);
      expect(getPhaseLabel(container).toLowerCase()).toContain('end');

      // Day 10 is before pendingStartDate ('2026-03-20'), so it must be visually disabled
      const dayBtn10 = findDayButton(container, 10);
      expect(dayBtn10).toHaveClass(styles.dayDisabled!);
      expect(dayBtn10).not.toBeDisabled(); // Visually styled, not functionally disabled
    });

    it('completing selection within single instance: click start then click end calls onChange correctly', () => {
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />,
      );
      // First click: start date
      const dayBtn10 = findDayButton(container, 10);
      fireEvent.click(dayBtn10!);
      expect(mockOnChange).toHaveBeenNthCalledWith(1, '2026-03-10', '');

      // Second click: end date (startDate prop still '' but pendingStartDate='2026-03-10')
      const dayBtn20 = findDayButton(container, 20);
      fireEvent.click(dayBtn20!);
      expect(mockOnChange).toHaveBeenNthCalledWith(2, '2026-03-10', '2026-03-20');

      // After completing selection, phase resets to selecting-start
      expect(getPhaseLabel(container).toLowerCase()).toContain('start');
    });

    it('Escape key during selecting-end resets pendingStartDate and phase to selecting-start', () => {
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />,
      );
      // Click day 15 to enter selecting-end phase
      const dayBtn15 = findDayButton(container, 15);
      fireEvent.click(dayBtn15!);
      expect(getPhaseLabel(container).toLowerCase()).toContain('end');

      // Press Escape on the grid
      const grid = container.querySelector('[role="grid"]');
      fireEvent.keyDown(grid!, { key: 'Escape' });

      // onChange called with both dates cleared
      expect(mockOnChange).toHaveBeenLastCalledWith('', '');
      // Phase resets to selecting-start
      expect(getPhaseLabel(container).toLowerCase()).toContain('start');
    });

    it('clicking before pendingStartDate during selecting-end resets to new start and stays in selecting-end', () => {
      // Click day 20 as start, then click day 10 (before start).
      // Expected: onChange('2026-03-10', '') and phase remains selecting-end.
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />,
      );
      // Click day 20 — enters selecting-end
      const dayBtn20 = findDayButton(container, 20);
      fireEvent.click(dayBtn20!);
      expect(mockOnChange).toHaveBeenCalledWith('2026-03-20', '');
      expect(getPhaseLabel(container).toLowerCase()).toContain('end');

      // Click day 10 — before pendingStartDate, so it resets to new start
      const dayBtn10 = findDayButton(container, 10);
      fireEvent.click(dayBtn10!);
      expect(mockOnChange).toHaveBeenLastCalledWith('2026-03-10', '');
      // Phase must stay in selecting-end (new start selected, awaiting end)
      expect(getPhaseLabel(container).toLowerCase()).toContain('end');
    });

    it('clicking exactly on pendingStartDate during selecting-end clears both dates', () => {
      const mockOnChange = jest.fn();
      const { container } = render(
        <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />,
      );
      // Click day 15 to enter selecting-end
      const dayBtn15 = findDayButton(container, 15);
      fireEvent.click(dayBtn15!);
      expect(getPhaseLabel(container).toLowerCase()).toContain('end');

      // Click day 15 again — same as pendingStartDate, clears everything
      fireEvent.click(dayBtn15!);
      expect(mockOnChange).toHaveBeenLastCalledWith('', '');
      expect(getPhaseLabel(container).toLowerCase()).toContain('start');
    });

    it('external clear (both props set to empty string) resets phase via rerender', () => {
      // Simulates parent calling setState({startDate:'', endDate:''}) after a clear action.
      // Mount with non-empty startDate so useState initializes phase to 'selecting-end'.
      // Rerender with both empty so the useEffect fires (deps changed) and resets phase.
      const mockOnChange = jest.fn();
      const { container, rerender } = rtlRender(
        <LocaleProvider>
          <DateRangePicker startDate="2026-03-10" endDate="2026-03-20" onChange={mockOnChange} />
        </LocaleProvider>,
      );
      // Initial phase is selecting-end (startDate non-empty)
      expect(getPhaseLabel(container).toLowerCase()).toContain('end');

      // Parent clears both props simultaneously — effect fires (deps changed), resets phase
      rerender(
        <LocaleProvider>
          <DateRangePicker startDate="" endDate="" onChange={mockOnChange} />
        </LocaleProvider>,
      );
      expect(getPhaseLabel(container).toLowerCase()).toContain('start');
    });
  });
});
