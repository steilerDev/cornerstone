/**
 * @jest-environment jsdom
 *
 * GanttSidebar (#2247): one button per row inside a listitem, group headers, late chips,
 * arrow-key navigation, selection and focus highlighting.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { makeArea, makeMilestone, makePurchase, makeTask } from '../../test/scheduleFixtures.js';
import type { GanttRow } from './ganttUtils.js';
import { ROW_HEIGHT, HEADER_HEIGHT } from './ganttUtils.js';

jest.unstable_mockModule('../../lib/localDate.js', () => ({
  todayLocalIsoDate: () => '2026-03-10',
}));

const { GanttSidebar } = await import('./GanttSidebar.js');

const taskRow = (...args: Parameters<typeof makeTask>): GanttRow => ({
  kind: 'workItem',
  key: `task:${args[0]}`,
  item: makeTask(...args),
});
const milestoneRow = (id: number, o: Parameters<typeof makeMilestone>[1] = {}): GanttRow => ({
  kind: 'milestone',
  key: `milestone:${id}`,
  milestone: makeMilestone(id, o),
});
const purchaseRow = (id: string, o: Parameters<typeof makePurchase>[1] = {}): GanttRow => ({
  kind: 'householdItem',
  key: `purchase:${id}`,
  item: makePurchase(id, o),
});
const groupRow = (o: Partial<Extract<GanttRow, { kind: 'group' }>> = {}): GanttRow => ({
  kind: 'group',
  groupId: 'g1',
  name: 'Kitchen',
  count: 3,
  collapsed: false,
  ...o,
});

type SidebarProps = Parameters<typeof GanttSidebar>[0];

function setup(rows: GanttRow[], props: Partial<SidebarProps> = {}) {
  const handlers = {
    onSelect: jest.fn<NonNullable<SidebarProps['onSelect']>>(),
    onToggleGroup: jest.fn<(id: string) => void>(),
    onRowFocus: jest.fn<NonNullable<SidebarProps['onRowFocus']>>(),
    onRowBlur: jest.fn<() => void>(),
    onScroll: jest.fn<() => void>(),
  };
  const utils = render(
    <GanttSidebar
      rows={rows}
      criticalWorkItemIds={new Set()}
      criticalMilestoneIds={new Set()}
      {...handlers}
      {...props}
    />,
  );
  return { ...utils, ...handlers };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GanttSidebar structure', () => {
  it('renders a header cell sized like the time header, aria-hidden', () => {
    setup([]);
    const header = document.getElementById('gantt-sidebar-header')!;
    expect(header).toHaveAttribute('aria-hidden', 'true');
    expect(header).toHaveStyle({ height: `${HEADER_HEIGHT}px` });
    expect(header).toHaveTextContent('Items');
  });

  it('is a labelled list with one listitem per row, each ROW_HEIGHT tall', () => {
    setup([taskRow('a'), milestoneRow(1), purchaseRow('p'), groupRow()]);
    const list = screen.getByRole('list', { name: 'Tasks, milestones and purchases' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    items.forEach((item) => expect(item).toHaveStyle({ height: `${ROW_HEIGHT}px` }));
  });

  it('puts every row in a button inside the listitem, with its row key', () => {
    setup([taskRow('a'), milestoneRow(7), purchaseRow('p')]);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('data-gantt-row-key'))).toEqual([
      'task:a',
      'milestone:7',
      'purchase:p',
    ]);
    buttons.forEach((b) => expect(b.closest('[role="listitem"]')).not.toBeNull());
  });

  it('forwards the scroll event and a function ref and an object ref to the rows container', () => {
    const fnRef = jest.fn<(node: HTMLDivElement | null) => void>();
    const { onScroll, rerender } = setup([taskRow('a')], { ref: fnRef });
    const rows = screen.getByRole('list');
    expect(fnRef.mock.calls[0]![0]).toBe(rows);
    fireEvent.scroll(rows);
    expect(onScroll).toHaveBeenCalledTimes(1);
    const objRef = { current: null as HTMLDivElement | null };
    rerender(
      <GanttSidebar
        rows={[taskRow('a')]}
        criticalWorkItemIds={new Set()}
        criticalMilestoneIds={new Set()}
        ref={objRef}
      />,
    );
    expect(objRef.current).toBe(screen.getByRole('list'));
  });
});

describe('GanttSidebar task rows', () => {
  it('shows the title and an area and company subline', () => {
    setup([
      taskRow('a', {
        title: 'Roof',
        area: makeArea('k', ['house']),
        assignedVendor: { id: 'v', name: 'Roof Co', trade: null },
      }),
    ]);
    const row = screen.getByTestId('gantt-sidebar-row-a');
    expect(row).toHaveTextContent('Roof');
    expect(row).toHaveTextContent('Area k · Roof Co');
    expect(row).toHaveAccessibleName('Task: Roof, Area house › Area k, Roof Co');
  });

  it('has no subline without area or company', () => {
    setup([taskRow('a')]);
    expect(
      screen.getByTestId('gantt-sidebar-row-a').querySelector('[class*="subline"]'),
    ).toBeNull();
  });

  it('mutes an undated task and names it "no dates set"', () => {
    setup([taskRow('a', { projectedStartDate: null, projectedEndDate: null })]);
    const row = screen.getByTestId('gantt-sidebar-row-a');
    expect(row).toHaveAccessibleName('Task: Task a, no dates set');
    expect(row.querySelector('[class*="sidebarRowLabelMuted"]')).not.toBeNull();
  });

  it('a late task carries the Late chip and its name; a held-up one the Held up chip', () => {
    setup([
      taskRow('late', { isLate: true, lateDays: 3 }),
      taskRow('held', { isHeldUp: true }),
      taskRow('done', { status: 'completed', isLate: true, lateDays: 3 }),
    ]);
    expect(screen.getByTestId('gantt-late-late')).toHaveTextContent(/Late/);
    expect(screen.getByTestId('gantt-sidebar-row-late').getAttribute('aria-label')).toMatch(/Late/);
    expect(screen.getByTestId('gantt-late-held')).toHaveTextContent(/Held up/);
    expect(screen.queryByTestId('gantt-late-done')).toBeNull();
  });

  it('names a critical task as Critical', () => {
    setup([taskRow('a')], { criticalWorkItemIds: new Set(['a']) });
    expect(screen.getByTestId('gantt-sidebar-row-a').getAttribute('aria-label')).toMatch(
      /Critical/,
    );
  });
});

describe('GanttSidebar milestone and purchase rows', () => {
  it('shows a milestone with a diamond icon and names it; Critical when on the path', () => {
    setup([milestoneRow(4, { title: 'Dry shell' })], { criticalMilestoneIds: new Set([4]) });
    const row = screen.getByTestId('gantt-sidebar-milestone-4');
    expect(row).toHaveTextContent('Dry shell');
    expect(row.getAttribute('aria-label')).toMatch(/^Milestone: Dry shell, .*Critical/);
    expect(row.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('a milestone off the critical path is not named Critical', () => {
    setup([milestoneRow(4, { title: 'Dry shell' })]);
    expect(screen.getByTestId('gantt-sidebar-milestone-4')).toHaveAccessibleName(
      'Milestone: Dry shell',
    );
  });

  it('shows a purchase with its area name', () => {
    setup([purchaseRow('p', { name: 'Sofa', area: makeArea('k', ['house']) })]);
    const row = screen.getByTestId('gantt-sidebar-hi-p');
    expect(row).toHaveTextContent('Sofa');
    expect(row).toHaveTextContent('Area k');
    expect(row).toHaveAccessibleName('Purchase: Sofa, Area house › Area k');
  });

  it('a purchase without area has no subline', () => {
    setup([purchaseRow('p', { name: 'Sofa' })]);
    expect(screen.getByTestId('gantt-sidebar-hi-p')).toHaveAccessibleName('Purchase: Sofa');
  });

  it('a late purchase carries the Late chip with the days since its latest delivery', () => {
    setup([purchaseRow('p', { isLate: true, latestDeliveryDate: '2026-03-05' })]);
    expect(screen.getByTestId('gantt-late-hi-p')).toHaveTextContent(/5/);
    expect(screen.getByTestId('gantt-sidebar-hi-p').getAttribute('aria-label')).toMatch(/Late/);
  });

  it('an on-time purchase has no chip', () => {
    setup([purchaseRow('p')]);
    expect(screen.queryByTestId('gantt-late-hi-p')).toBeNull();
  });
});

describe('GanttSidebar group headers', () => {
  it('is an expanded toggle button naming the group and its row count', () => {
    setup([groupRow()]);
    const button = screen.getByTestId('gantt-group-g1');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAccessibleName('Kitchen, 3 rows');
  });

  it('a collapsed group reports aria-expanded=false', () => {
    setup([groupRow({ collapsed: true })]);
    expect(screen.getByTestId('gantt-group-g1')).toHaveAttribute('aria-expanded', 'false');
  });

  it('clicking a header toggles that group', () => {
    const { onToggleGroup } = setup([groupRow()]);
    fireEvent.click(screen.getByTestId('gantt-group-g1'));
    expect(onToggleGroup).toHaveBeenCalledWith('g1');
  });

  it('without a handler a click does nothing', () => {
    render(
      <GanttSidebar
        rows={[groupRow()]}
        criticalWorkItemIds={new Set()}
        criticalMilestoneIds={new Set()}
      />,
    );
    fireEvent.click(screen.getByTestId('gantt-group-g1'));
    expect(screen.getByTestId('gantt-group-g1')).toBeInTheDocument();
  });
});

describe('GanttSidebar interaction', () => {
  it('selecting a row passes its key and the row button as the opener', () => {
    const { onSelect } = setup([taskRow('a'), milestoneRow(2), purchaseRow('p')]);
    fireEvent.click(screen.getByTestId('gantt-sidebar-row-a'));
    expect(onSelect.mock.lastCall![0]).toBe('task:a');
    expect(onSelect.mock.lastCall![1]).toBe(screen.getByTestId('gantt-sidebar-row-a'));
    fireEvent.click(screen.getByTestId('gantt-sidebar-milestone-2'));
    expect(onSelect.mock.lastCall![0]).toBe('milestone:2');
    expect(onSelect.mock.lastCall![1]).toBe(screen.getByTestId('gantt-sidebar-milestone-2'));
    fireEvent.click(screen.getByTestId('gantt-sidebar-hi-p'));
    expect(onSelect.mock.lastCall![0]).toBe('purchase:p');
    expect(onSelect.mock.lastCall![1]).toBe(screen.getByTestId('gantt-sidebar-hi-p'));
  });

  it('marks only the selected row with aria-current', () => {
    setup([taskRow('a'), taskRow('b')], { selectedKey: 'task:b' });
    expect(screen.getByTestId('gantt-sidebar-row-b')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('gantt-sidebar-row-a')).not.toHaveAttribute('aria-current');
  });

  it('focusing a row announces it for the link highlight, and blurring clears it', () => {
    const { onRowFocus, onRowBlur } = setup([taskRow('a')]);
    const row = screen.getByTestId('gantt-sidebar-row-a');
    fireEvent.focus(row);
    expect(onRowFocus).toHaveBeenCalledWith('task:a');
    fireEvent.blur(row);
    expect(onRowBlur).toHaveBeenCalledTimes(1);
  });

  it('works without any handlers', () => {
    render(
      <GanttSidebar
        rows={[taskRow('a')]}
        criticalWorkItemIds={new Set()}
        criticalMilestoneIds={new Set()}
      />,
    );
    const row = screen.getByTestId('gantt-sidebar-row-a');
    fireEvent.click(row);
    fireEvent.focus(row);
    fireEvent.blur(row);
    expect(row).toBeInTheDocument();
  });
});

describe('GanttSidebar keyboard', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = jest.fn() as never;
  });

  const rows = () => [groupRow(), taskRow('a'), milestoneRow(2)];

  it('ArrowDown and ArrowUp move between rows, group headers included', () => {
    setup(rows());
    const group = screen.getByTestId('gantt-group-g1');
    group.focus();
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(screen.getByTestId('gantt-sidebar-row-a')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('gantt-sidebar-row-a'), { key: 'ArrowDown' });
    expect(screen.getByTestId('gantt-sidebar-milestone-2')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('gantt-sidebar-milestone-2'), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByTestId('gantt-sidebar-row-a'), { key: 'ArrowUp' });
    expect(group).toHaveFocus();
  });

  it('scrolls the newly focused row into view', () => {
    setup(rows());
    fireEvent.keyDown(screen.getByTestId('gantt-group-g1'), { key: 'ArrowDown' });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('stops at the first and last row', () => {
    setup(rows());
    const first = screen.getByTestId('gantt-group-g1');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(first).toHaveFocus();
    const last = screen.getByTestId('gantt-sidebar-milestone-2');
    last.focus();
    fireEvent.keyDown(last, { key: 'ArrowDown' });
    expect(last).toHaveFocus();
  });

  it('prevents the default for arrows and ignores other keys', () => {
    setup(rows());
    const row = screen.getByTestId('gantt-sidebar-row-a');
    expect(fireEvent.keyDown(row, { key: 'ArrowDown' })).toBe(false);
    expect(fireEvent.keyDown(row, { key: 'x' })).toBe(true);
    expect(fireEvent.keyDown(row, { key: 'Enter' })).toBe(true);
  });
});
