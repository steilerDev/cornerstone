/**
 * @jest-environment jsdom
 *
 * Unit tests for GanttHeader — date label row above the Gantt chart canvas.
 * Tests cell rendering, today highlighting, today triangle, and zoom mode differences.
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { GanttHeader } from './GanttHeader.js';
import type { HeaderCell } from './ganttUtils.js';
import { COLUMN_WIDTHS } from './ganttUtils.js';

// CSS modules mocked via identity-obj-proxy

// Factory for HeaderCell
function makeCell(overrides: Partial<HeaderCell> = {}): HeaderCell {
  return {
    x: 0,
    width: COLUMN_WIDTHS.month,
    label: 'June 2024',
    isToday: false,
    date: new Date(2024, 5, 1, 12), // June 1, 2024
    ...overrides,
  };
}

describe('GanttHeader', () => {
  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders with data-testid="gantt-header"', () => {
    render(
      <GanttHeader cells={[]} zoom="month" totalWidth={1000} todayX={null} todayColor="#ef4444" />,
    );
    expect(screen.getByTestId('gantt-header')).toBeInTheDocument();
  });

  it('has aria-hidden="true" (decorative element)', () => {
    render(
      <GanttHeader cells={[]} zoom="month" totalWidth={1000} todayX={null} todayColor="#ef4444" />,
    );
    const header = screen.getByTestId('gantt-header');
    expect(header).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies totalWidth as inline style width', () => {
    render(
      <GanttHeader cells={[]} zoom="month" totalWidth={2400} todayX={null} todayColor="#ef4444" />,
    );
    expect(screen.getByTestId('gantt-header')).toHaveStyle({ width: '2400px' });
  });

  it('renders no cells when cells array is empty', () => {
    const { container } = render(
      <GanttHeader cells={[]} zoom="month" totalWidth={1000} todayX={null} todayColor="#ef4444" />,
    );
    const header = screen.getByTestId('gantt-header');
    // Should only contain no header-cell divs
    const cellDivs = container.querySelectorAll('.headerCell');
    expect(cellDivs).toHaveLength(0);
  });

  // ── Month zoom cells ───────────────────────────────────────────────────────

  it('renders one cell div per HeaderCell (month zoom)', () => {
    const cells = [
      makeCell({ label: 'January 2024', x: 0, width: 190 }),
      makeCell({ label: 'February 2024', x: 190, width: 170 }),
      makeCell({ label: 'March 2024', x: 360, width: 190 }),
    ];
    const { container } = render(
      <GanttHeader
        cells={cells}
        zoom="month"
        totalWidth={550}
        todayX={null}
        todayColor="#ef4444"
      />,
    );
    const cellDivs = container.querySelectorAll('.headerCell');
    expect(cellDivs).toHaveLength(3);
  });

  it('renders label text inside cells (month zoom)', () => {
    const cells = [
      makeCell({ label: 'June 2024', x: 0, width: 180 }),
      makeCell({ label: 'July 2024', x: 180, width: 185 }),
    ];
    render(
      <GanttHeader
        cells={cells}
        zoom="month"
        totalWidth={365}
        todayX={null}
        todayColor="#ef4444"
      />,
    );
    expect(screen.getByText('June 2024')).toBeInTheDocument();
    expect(screen.getByText('July 2024')).toBeInTheDocument();
  });

  it('applies left style to each cell (month zoom)', () => {
    const cells = [makeCell({ x: 100, label: 'June 2024' })];
    const { container } = render(
      <GanttHeader
        cells={cells}
        zoom="month"
        totalWidth={500}
        todayX={null}
        todayColor="#ef4444"
      />,
    );
    const cell = container.querySelector('.headerCell') as HTMLElement;
    expect(cell).toHaveStyle({ left: '100px' });
  });

  it('applies width style to each cell (month zoom)', () => {
    const cells = [makeCell({ width: 175, label: 'June 2024' })];
    const { container } = render(
      <GanttHeader
        cells={cells}
        zoom="month"
        totalWidth={500}
        todayX={null}
        todayColor="#ef4444"
      />,
    );
    const cell = container.querySelector('.headerCell') as HTMLElement;
    expect(cell).toHaveStyle({ width: '175px' });
  });

  it('applies headerCellToday class for today cell (month zoom)', () => {
    const cells = [
      makeCell({ label: 'May 2024', isToday: false }),
      makeCell({ label: 'June 2024', isToday: true, x: 180 }),
      makeCell({ label: 'July 2024', isToday: false, x: 360 }),
    ];
    const { container } = render(
      <GanttHeader
        cells={cells}
        zoom="month"
        totalWidth={550}
        todayX={null}
        todayColor="#ef4444"
      />,
    );
    const todayCells = container.querySelectorAll('.headerCellToday');
    expect(todayCells).toHaveLength(1);
  });

  it('does not apply headerCellToday class to non-today cells (month zoom)', () => {
    const cells = [
      makeCell({ label: 'April 2024', isToday: false }),
      makeCell({ label: 'May 2024', isToday: false, x: 185 }),
    ];
    const { container } = render(
      <GanttHeader
        cells={cells}
        zoom="month"
        totalWidth={370}
        todayX={null}
        todayColor="#ef4444"
      />,
    );
    const todayCells = container.querySelectorAll('.headerCellToday');
    expect(todayCells).toHaveLength(0);
  });

  // ── Day zoom cells ─────────────────────────────────────────────────────────

  it('renders sublabel span for day zoom cells', () => {
    const cells = [
      makeCell({
        label: '10',
        sublabel: 'Mon',
        zoom: 'day',
        x: 0,
        width: COLUMN_WIDTHS.day,
        date: new Date(2024, 5, 10, 12),
      } as HeaderCell & { zoom: 'day' }),
    ];
    const { container } = render(
      <GanttHeader cells={cells} zoom="day" totalWidth={40} todayX={null} todayColor="#ef4444" />,
    );
    const sublabel = container.querySelector('.headerCellSublabel');
    expect(sublabel).toBeInTheDocument();
    expect(sublabel!.textContent).toBe('Mon');
  });

  it('renders label span in day zoom', () => {
    const cells = [
      makeCell({
        label: '15',
        sublabel: 'Sat',
        x: 0,
        width: COLUMN_WIDTHS.day,
        date: new Date(2024, 5, 15, 12),
      }),
    ];
    render(
      <GanttHeader cells={cells} zoom="day" totalWidth={40} todayX={null} todayColor="#ef4444" />,
    );
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
  });

  it('day zoom cell has aria-label with localized date', () => {
    const cellDate = new Date(2024, 5, 10, 12); // June 10, 2024 Monday
    const cells = [
      makeCell({
        label: '10',
        sublabel: 'Mon',
        x: 0,
        width: COLUMN_WIDTHS.day,
        date: cellDate,
      }),
    ];
    const { container } = render(
      <GanttHeader cells={cells} zoom="day" totalWidth={40} todayX={null} todayColor="#ef4444" />,
    );
    const cell = container.querySelector('.headerCell') as HTMLElement;
    const ariaLabel = cell.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel).toContain('Jun');
    expect(ariaLabel).toContain('10');
  });

  // ── Week zoom cells ────────────────────────────────────────────────────────

  it('renders label text for week zoom', () => {
    const cells = [
      makeCell({
        label: 'Jun 10–16',
        x: 0,
        width: COLUMN_WIDTHS.week,
        date: new Date(2024, 5, 10, 12),
      }),
    ];
    render(
      <GanttHeader cells={cells} zoom="week" totalWidth={110} todayX={null} todayColor="#ef4444" />,
    );
    expect(screen.getByText('Jun 10–16')).toBeInTheDocument();
  });

  it('week zoom cell does not have sublabel span', () => {
    const cells = [
      makeCell({
        label: 'Jun 10–16',
        sublabel: undefined,
        x: 0,
        width: COLUMN_WIDTHS.week,
        date: new Date(2024, 5, 10, 12),
      }),
    ];
    const { container } = render(
      <GanttHeader cells={cells} zoom="week" totalWidth={110} todayX={null} todayColor="#ef4444" />,
    );
    const sublabel = container.querySelector('.headerCellSublabel');
    expect(sublabel).not.toBeInTheDocument();
  });

  // ── Today marker triangle ──────────────────────────────────────────────────

  it('renders today triangle when todayX is provided', () => {
    const { container } = render(
      <GanttHeader
        cells={[makeCell()]}
        zoom="month"
        totalWidth={1000}
        todayX={300}
        todayColor="#ef4444"
      />,
    );
    const triangle = container.querySelector('.todayTriangle');
    expect(triangle).toBeInTheDocument();
  });

  it('does not render today triangle when todayX is null', () => {
    const { container } = render(
      <GanttHeader
        cells={[makeCell()]}
        zoom="month"
        totalWidth={1000}
        todayX={null}
        todayColor="#ef4444"
      />,
    );
    const triangle = container.querySelector('.todayTriangle');
    expect(triangle).not.toBeInTheDocument();
  });

  it('today triangle left position is todayX - 4', () => {
    const { container } = render(
      <GanttHeader
        cells={[makeCell()]}
        zoom="month"
        totalWidth={1000}
        todayX={250}
        todayColor="#ef4444"
      />,
    );
    const triangle = container.querySelector('.todayTriangle') as HTMLElement;
    expect(triangle).toHaveStyle({ left: `${250 - 4}px` });
  });

  it('today triangle uses todayColor for borderTopColor', () => {
    const { container } = render(
      <GanttHeader
        cells={[makeCell()]}
        zoom="month"
        totalWidth={1000}
        todayX={200}
        todayColor="rgb(239, 68, 68)"
      />,
    );
    const triangle = container.querySelector('.todayTriangle') as HTMLElement;
    expect(triangle).toHaveStyle({ borderTopColor: 'rgb(239, 68, 68)' });
  });

  it('today triangle has aria-hidden="true"', () => {
    const { container } = render(
      <GanttHeader
        cells={[makeCell()]}
        zoom="month"
        totalWidth={1000}
        todayX={200}
        todayColor="#ef4444"
      />,
    );
    const triangle = container.querySelector('.todayTriangle');
    expect(triangle).toHaveAttribute('aria-hidden', 'true');
  });

  // ── Multiple cells integration ─────────────────────────────────────────────

  it('renders 12 cells for a full year in month zoom', () => {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const cells = months.map((month, i) =>
      makeCell({ label: `${month} 2024`, x: i * 180, width: 180, isToday: i === 5 }),
    );
    const { container } = render(
      <GanttHeader
        cells={cells}
        zoom="month"
        totalWidth={12 * 180}
        todayX={5 * 180 + 90}
        todayColor="#ef4444"
      />,
    );
    const cellDivs = container.querySelectorAll('.headerCell');
    expect(cellDivs).toHaveLength(12);
  });
});
