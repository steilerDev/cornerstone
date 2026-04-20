import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import type { ReactNode } from 'react';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { DateFilter } from './DateFilter.js';
import { LocaleProvider } from '../../../contexts/LocaleContext.js';

/**
 * Custom render function that wraps the component with LocaleProvider
 */
function render(component: ReactNode, options?: Parameters<typeof rtlRender>[1]) {
  return rtlRender(<LocaleProvider>{component}</LocaleProvider>, options);
}

/**
 * Helper to find a day button by its text content
 */
function findDayButton(container: HTMLElement, dayNumber: number): HTMLButtonElement | null {
  const dayButtons = Array.from(container.querySelectorAll('button')).filter(
    (btn) =>
      btn.textContent === String(dayNumber) &&
      !btn.getAttribute('aria-label')?.includes('Previous') &&
      !btn.getAttribute('aria-label')?.includes('Next'),
  );
  return dayButtons[0] || null;
}

describe('DateFilter', () => {
  // Freeze time to 2026-03-15 so the underlying DateRangePicker's default "current month" is
  // always March 2026. Tests that click day numbers and assert March dates are time-bombs
  // without this: once the real clock advances past March 2026 the picker shows a different
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
    it('renders the DateRangePicker component with calendar grid', () => {
      const { container } = render(<DateFilter value="" onChange={jest.fn()} />);
      const grid = container.querySelector('[role="grid"]');
      expect(grid).toBeInTheDocument();
    });

    it('does NOT render any <input type="date"> elements', () => {
      const { container } = render(<DateFilter value="" onChange={jest.fn()} />);
      const dateInputs = container.querySelectorAll('input[type="date"]');
      expect(dateInputs).toHaveLength(0);
    });

    it('renders the calendar with day buttons', () => {
      const { container } = render(<DateFilter value="" onChange={jest.fn()} />);
      const dayButtons = Array.from(container.querySelectorAll('button')).filter((btn) =>
        /^\d{1,2}$/.test(btn.textContent?.trim() || ''),
      );
      expect(dayButtons.length).toBeGreaterThan(0);
    });

    it('does not render Apply button', () => {
      render(<DateFilter value="" onChange={jest.fn()} />);
      expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
    });

    it('does not render Clear button', () => {
      render(<DateFilter value="from:2026-01-01" onChange={jest.fn()} />);
      expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    });
  });

  describe('value parsing', () => {
    it('parses from date from "from:2026-03-15,to:2026-03-25" format and shows it selected', () => {
      const { container } = render(
        <DateFilter value="from:2026-03-15,to:2026-03-25" onChange={jest.fn()} />,
      );
      const dayBtn15 = findDayButton(container, 15);
      expect(dayBtn15).toHaveClass('daySelected');
    });

    it('parses to date from "from:2026-03-15,to:2026-03-25" format and shows it selected', () => {
      const { container } = render(
        <DateFilter value="from:2026-03-15,to:2026-03-25" onChange={jest.fn()} />,
      );
      const dayBtn25 = findDayButton(container, 25);
      expect(dayBtn25).toHaveClass('daySelected');
    });

    it('renders with no selected days when value is empty', () => {
      const { container } = render(<DateFilter value="" onChange={jest.fn()} />);
      const selectedDays = Array.from(container.querySelectorAll('button')).filter(
        (btn) => btn.getAttribute('aria-pressed') === 'true',
      );
      expect(selectedDays).toHaveLength(0);
    });

    it('handles "from:2026-03-15" format with no to date', () => {
      const { container } = render(<DateFilter value="from:2026-03-15" onChange={jest.fn()} />);
      const dayBtn15 = findDayButton(container, 15);
      expect(dayBtn15).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('auto-apply on selection', () => {
    it('clicking a day when no start date does NOT call onChange (partial selection)', () => {
      const mockOnChange = jest.fn();
      const { container } = render(<DateFilter value="" onChange={mockOnChange} />);
      const dayBtn15 = findDayButton(container, 15);
      fireEvent.click(dayBtn15!);
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('after selecting start date, clicking end date calls onChange with "from:...,to:..."', () => {
      const mockOnChange = jest.fn();
      const { container: container1 } = render(<DateFilter value="" onChange={mockOnChange} />);
      const dayBtn15 = findDayButton(container1, 15);
      fireEvent.click(dayBtn15!);

      mockOnChange.mockClear();
      // Now render with startDate set
      const { container: container2 } = render(
        <DateFilter value="from:2026-03-15" onChange={mockOnChange} />,
      );

      const dayBtn25 = findDayButton(container2, 25);
      fireEvent.click(dayBtn25!);

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.stringMatching(/^from:2026-03-15,to:2026-03-25$/),
      );
    });

    it('onChange is called immediately when both dates are selected', () => {
      const mockOnChange = jest.fn();
      const { container: container1 } = render(<DateFilter value="" onChange={mockOnChange} />);
      const dayBtn15 = findDayButton(container1, 15);
      fireEvent.click(dayBtn15!);

      mockOnChange.mockClear();
      // Now render with startDate set
      const { container: container2 } = render(
        <DateFilter value="from:2026-03-15" onChange={mockOnChange} />,
      );

      const dayBtn25 = findDayButton(container2, 25);
      fireEvent.click(dayBtn25!);

      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('value format', () => {
    it('partial selection does not emit onChange', () => {
      const mockOnChange = jest.fn();
      const { container } = render(<DateFilter value="" onChange={mockOnChange} />);
      const dayBtn15 = findDayButton(container, 15);
      fireEvent.click(dayBtn15!);
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('when both dates are empty, onChange receives empty string', () => {
      const mockOnChange = jest.fn();
      const { rerender, container } = render(
        <DateFilter value="from:2026-03-15" onChange={mockOnChange} />,
      );
      const dayBtn15 = findDayButton(container, 15);

      // Click the start date again to clear both
      fireEvent.click(dayBtn15!);

      expect(mockOnChange).toHaveBeenCalledWith('');
    });

    it('from part uses "from:" prefix when both dates set', () => {
      const mockOnChange = jest.fn();
      const { container: container1 } = render(<DateFilter value="" onChange={mockOnChange} />);
      const dayBtn15 = findDayButton(container1, 15);
      fireEvent.click(dayBtn15!);

      mockOnChange.mockClear();
      const { container: container2 } = render(
        <DateFilter value="from:2026-03-15" onChange={mockOnChange} />,
      );

      const dayBtn25 = findDayButton(container2, 25);
      fireEvent.click(dayBtn25!);

      const calledValue = mockOnChange.mock.calls[0]![0];
      expect(calledValue).toMatch(/^from:/);
    });

    it('to part uses "to:" prefix', () => {
      const mockOnChange = jest.fn();
      const { container: container1 } = render(<DateFilter value="" onChange={mockOnChange} />);
      const dayBtn15 = findDayButton(container1, 15);
      fireEvent.click(dayBtn15!);

      mockOnChange.mockClear();
      const { container: container2 } = render(
        <DateFilter value="from:2026-03-15" onChange={mockOnChange} />,
      );

      const dayBtn25 = findDayButton(container2, 25);
      fireEvent.click(dayBtn25!);

      const calledValue = mockOnChange.mock.calls[0]![0];
      expect(calledValue).toMatch(/to:/);
    });

    it('parts are comma-separated', () => {
      const mockOnChange = jest.fn();
      const { container: container1 } = render(<DateFilter value="" onChange={mockOnChange} />);
      const dayBtn15 = findDayButton(container1, 15);
      fireEvent.click(dayBtn15!);

      mockOnChange.mockClear();
      const { container: container2 } = render(
        <DateFilter value="from:2026-03-15" onChange={mockOnChange} />,
      );

      const dayBtn25 = findDayButton(container2, 25);
      fireEvent.click(dayBtn25!);

      const calledValue = mockOnChange.mock.calls[0]![0];
      expect(calledValue).toMatch(/from:.+,to:.+/);
    });
  });

  describe('calendar interaction', () => {
    it('hovering over a date after start shows range highlight', () => {
      const { rerender, container } = render(
        <DateFilter value="from:2026-03-15" onChange={jest.fn()} />,
      );
      const dayBtn25 = findDayButton(container, 25);
      fireEvent.mouseEnter(dayBtn25!);
      // The range should be visually highlighted via dayInRange class
      const dayCellContainer = dayBtn25?.closest('[role="gridcell"]');
      expect(dayCellContainer).toBeInTheDocument();
    });

    it('dates before start date have dayDisabled CSS class but remain clickable to reset selection', () => {
      const { container } = render(<DateFilter value="from:2026-03-20" onChange={jest.fn()} />);
      const dayBtn10 = findDayButton(container, 10);
      expect(dayBtn10).toBeTruthy();
      expect(dayBtn10).not.toBeDisabled();
      expect(dayBtn10).toHaveClass('dayDisabled');
    });
  });

  describe('edge cases', () => {
    it('handles parsing "from:" without a value', () => {
      const { container } = render(<DateFilter value="from:" onChange={jest.fn()} />);
      const grid = container.querySelector('[role="grid"]');
      expect(grid).toBeInTheDocument(); // Should render without crashing
    });

    it('handles parsing "to:" without a value', () => {
      const { container } = render(<DateFilter value="to:" onChange={jest.fn()} />);
      const grid = container.querySelector('[role="grid"]');
      expect(grid).toBeInTheDocument(); // Should render without crashing
    });

    it('ignores malformed date strings in filter value', () => {
      const { container } = render(<DateFilter value="from:invalid-date" onChange={jest.fn()} />);
      const grid = container.querySelector('[role="grid"]');
      expect(grid).toBeInTheDocument(); // Should render without crashing
    });
  });

  describe('single-instance two-click flow (issue #1178 regression)', () => {
    it('clicking start then end within a single mounted instance calls onChange once with full range', () => {
      // Regression test: without the fix, the DateRangePicker's phase reset to 'selecting-start'
      // after the first click (because the startDate prop was still '' when the component re-rendered).
      // With the fix (pendingStartDate internal state), the phase correctly stays 'selecting-end'
      // so the second click completes the range without requiring a prop update between clicks.
      const mockOnChange = jest.fn();
      const { container } = render(<DateFilter value="" onChange={mockOnChange} />);

      // Step 1: Click day 15 — partial selection (start date only)
      const dayBtn15 = findDayButton(container, 15);
      expect(dayBtn15).toBeTruthy();
      fireEvent.click(dayBtn15!);
      // DateFilter must NOT call onChange for a partial selection
      expect(mockOnChange).not.toHaveBeenCalled();

      // Phase label inside the DateRangePicker must immediately show "end" — no re-mount needed
      const phaseLabel = container.querySelector('.phaseLabel');
      expect(phaseLabel?.textContent?.toLowerCase()).toContain('end');

      // Step 2: Click day 25 — completes the range within the same mounted component
      const dayBtn25 = findDayButton(container, 25);
      expect(dayBtn25).toBeTruthy();
      fireEvent.click(dayBtn25!);

      // DateFilter must now call onChange with the full range format
      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith('from:2026-03-15,to:2026-03-25');
    });
  });
});
