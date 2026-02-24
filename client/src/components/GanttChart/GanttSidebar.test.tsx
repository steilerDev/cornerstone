/**
 * @jest-environment jsdom
 *
 * Unit tests for GanttSidebar — fixed left panel with work item titles.
 * Tests item rendering, muted state for undated items, click/keyboard interactions,
 * and accessibility attributes.
 */
import { jest, describe, it, expect } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { GanttSidebar } from './GanttSidebar.js';
import { ROW_HEIGHT, HEADER_HEIGHT } from './ganttUtils.js';
import type { TimelineWorkItem } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

// Minimal TimelineWorkItem factory
function makeItem(overrides: Partial<TimelineWorkItem> = {}): TimelineWorkItem {
  return {
    id: 'wi-1',
    title: 'Foundation Work',
    status: 'not_started',
    startDate: '2024-06-01',
    endDate: '2024-07-31',
    durationDays: 60,
    startAfter: null,
    startBefore: null,
    assignedUser: null,
    tags: [],
    ...overrides,
  };
}

describe('GanttSidebar', () => {
  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders with data-testid="gantt-sidebar"', () => {
    render(<GanttSidebar items={[]} />);
    expect(screen.getByTestId('gantt-sidebar')).toBeInTheDocument();
  });

  it('renders the "Work Item" header', () => {
    render(<GanttSidebar items={[]} />);
    expect(screen.getByText('Work Item')).toBeInTheDocument();
  });

  it('header has height matching HEADER_HEIGHT', () => {
    const { container } = render(<GanttSidebar items={[]} />);
    // The header div has aria-hidden="true" and style height
    const header = container.querySelector('[aria-hidden="true"]');
    expect(header).toHaveStyle({ height: `${HEADER_HEIGHT}px` });
  });

  it('renders nothing in the rows container when items is empty', () => {
    const { container } = render(<GanttSidebar items={[]} />);
    // sidebarRows div should exist but have no child rows
    const rows = container.querySelectorAll('[data-testid^="gantt-sidebar-row-"]');
    expect(rows).toHaveLength(0);
  });

  it('renders one row per work item', () => {
    const items = [makeItem({ id: 'wi-1' }), makeItem({ id: 'wi-2' }), makeItem({ id: 'wi-3' })];
    render(<GanttSidebar items={items} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
  });

  it('renders correct titles for all items', () => {
    const items = [
      makeItem({ id: 'wi-1', title: 'Foundation' }),
      makeItem({ id: 'wi-2', title: 'Framing' }),
    ];
    render(<GanttSidebar items={items} />);
    expect(screen.getByText('Foundation')).toBeInTheDocument();
    expect(screen.getByText('Framing')).toBeInTheDocument();
  });

  it('each row has correct data-testid', () => {
    const items = [makeItem({ id: 'item-abc' })];
    render(<GanttSidebar items={items} />);
    expect(screen.getByTestId('gantt-sidebar-row-item-abc')).toBeInTheDocument();
  });

  it('each row has height matching ROW_HEIGHT', () => {
    const items = [makeItem({ id: 'wi-1' })];
    const { container } = render(<GanttSidebar items={items} />);
    const row = container.querySelector('[data-testid="gantt-sidebar-row-wi-1"]');
    expect(row).toHaveStyle({ height: `${ROW_HEIGHT}px` });
  });

  // ── Muted / no-dates state ─────────────────────────────────────────────────

  it('applies muted label style when item has no startDate and no endDate', () => {
    const item = makeItem({ id: 'wi-nodates', startDate: null, endDate: null });
    const { container } = render(<GanttSidebar items={[item]} />);
    const label = container.querySelector('.sidebarRowLabelMuted');
    expect(label).toBeInTheDocument();
  });

  it('does not apply muted label style when item has a startDate', () => {
    const item = makeItem({ id: 'wi-withstart', startDate: '2024-06-01', endDate: null });
    const { container } = render(<GanttSidebar items={[item]} />);
    const label = container.querySelector('.sidebarRowLabelMuted');
    expect(label).not.toBeInTheDocument();
  });

  it('does not apply muted label style when item has an endDate', () => {
    const item = makeItem({ id: 'wi-withend', startDate: null, endDate: '2024-07-31' });
    const { container } = render(<GanttSidebar items={[item]} />);
    const label = container.querySelector('.sidebarRowLabelMuted');
    expect(label).not.toBeInTheDocument();
  });

  it('does not apply muted label style when item has both dates', () => {
    const item = makeItem({ id: 'wi-bothdates', startDate: '2024-06-01', endDate: '2024-07-31' });
    const { container } = render(<GanttSidebar items={[item]} />);
    const label = container.querySelector('.sidebarRowLabelMuted');
    expect(label).not.toBeInTheDocument();
  });

  // ── Alternating row stripes ────────────────────────────────────────────────

  it('even rows have sidebarRowEven class', () => {
    const items = [makeItem({ id: 'wi-0' }), makeItem({ id: 'wi-1' }), makeItem({ id: 'wi-2' })];
    const { container } = render(<GanttSidebar items={items} />);
    const evenRows = container.querySelectorAll('.sidebarRowEven');
    // Indices 0 and 2 are even
    expect(evenRows).toHaveLength(2);
  });

  it('odd rows have sidebarRowOdd class', () => {
    const items = [makeItem({ id: 'wi-0' }), makeItem({ id: 'wi-1' }), makeItem({ id: 'wi-2' })];
    const { container } = render(<GanttSidebar items={items} />);
    const oddRows = container.querySelectorAll('.sidebarRowOdd');
    // Only index 1 is odd
    expect(oddRows).toHaveLength(1);
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  it('each row has role="listitem"', () => {
    const items = [makeItem({ id: 'wi-1' }), makeItem({ id: 'wi-2' })];
    render(<GanttSidebar items={items} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
  });

  it('each row has aria-label describing the work item', () => {
    const item = makeItem({ id: 'wi-1', title: 'Electrical Work' });
    render(<GanttSidebar items={[item]} />);
    const row = screen.getByTestId('gantt-sidebar-row-wi-1');
    expect(row).toHaveAttribute('aria-label', 'Work item: Electrical Work');
  });

  it('each row is keyboard-focusable (tabIndex=0)', () => {
    const item = makeItem({ id: 'wi-focus' });
    render(<GanttSidebar items={[item]} />);
    const row = screen.getByTestId('gantt-sidebar-row-wi-focus');
    expect(row).toHaveAttribute('tabIndex', '0');
  });

  it('row title span has title attribute for overflow tooltip', () => {
    const item = makeItem({
      id: 'wi-title',
      title: 'Very Long Work Item Name That Might Overflow',
    });
    const { container } = render(<GanttSidebar items={[item]} />);
    const span = container.querySelector('span.sidebarRowLabel');
    expect(span).toHaveAttribute('title', 'Very Long Work Item Name That Might Overflow');
  });

  // ── Click interactions ─────────────────────────────────────────────────────

  it('calls onItemClick with item id when row is clicked', () => {
    const handleClick = jest.fn<(id: string) => void>();
    const item = makeItem({ id: 'wi-click' });
    render(<GanttSidebar items={[item]} onItemClick={handleClick} />);

    fireEvent.click(screen.getByTestId('gantt-sidebar-row-wi-click'));

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith('wi-click');
  });

  it('does not throw when onItemClick is not provided', () => {
    const item = makeItem({ id: 'wi-nohandler' });
    render(<GanttSidebar items={[item]} />);
    expect(() => {
      fireEvent.click(screen.getByTestId('gantt-sidebar-row-wi-nohandler'));
    }).not.toThrow();
  });

  // ── Keyboard interactions ──────────────────────────────────────────────────

  it('calls onItemClick when Enter key is pressed on a row', () => {
    const handleClick = jest.fn<(id: string) => void>();
    const item = makeItem({ id: 'wi-enter' });
    render(<GanttSidebar items={[item]} onItemClick={handleClick} />);

    fireEvent.keyDown(screen.getByTestId('gantt-sidebar-row-wi-enter'), { key: 'Enter' });

    expect(handleClick).toHaveBeenCalledWith('wi-enter');
  });

  it('calls onItemClick when Space key is pressed on a row', () => {
    const handleClick = jest.fn<(id: string) => void>();
    const item = makeItem({ id: 'wi-space' });
    render(<GanttSidebar items={[item]} onItemClick={handleClick} />);

    fireEvent.keyDown(screen.getByTestId('gantt-sidebar-row-wi-space'), { key: ' ' });

    expect(handleClick).toHaveBeenCalledWith('wi-space');
  });

  it('does not call onItemClick for other keys', () => {
    const handleClick = jest.fn<(id: string) => void>();
    const item = makeItem({ id: 'wi-key' });
    render(<GanttSidebar items={[item]} onItemClick={handleClick} />);

    const row = screen.getByTestId('gantt-sidebar-row-wi-key');
    fireEvent.keyDown(row, { key: 'Tab' });
    fireEvent.keyDown(row, { key: 'Escape' });
    fireEvent.keyDown(row, { key: 'ArrowDown' });

    expect(handleClick).not.toHaveBeenCalled();
  });

  // ── Large datasets ─────────────────────────────────────────────────────────

  it('renders 50+ items without errors', () => {
    const items = Array.from({ length: 55 }, (_, i) =>
      makeItem({ id: `wi-${i}`, title: `Work Item ${i + 1}` }),
    );
    render(<GanttSidebar items={items} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(55);
  });

  // ── Ref forwarding ─────────────────────────────────────────────────────────

  it('forwards ref to the inner scrollable rows container', () => {
    const ref = { current: null } as React.RefObject<HTMLDivElement | null>;
    render(<GanttSidebar items={[makeItem()]} ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
