/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { GanttGrid } from './GanttGrid.js';
import { ROW_HEIGHT } from './ganttUtils.js';
import type { GridLine } from './ganttUtils.js';

const COLORS = {
  rowEven: '#eee',
  rowOdd: '#ddd',
  borderMinor: '#aaa',
  borderMajor: '#555',
  todayMarker: '#f00',
  groupBand: '#abc',
};

function renderGrid(props: Partial<Parameters<typeof GanttGrid>[0]> = {}) {
  const gridLines: GridLine[] = [
    { x: 100, isMajor: true } as GridLine,
    { x: 200, isMajor: false } as GridLine,
  ];
  return render(
    <svg data-testid="svg">
      <GanttGrid
        width={500}
        height={4 * ROW_HEIGHT}
        rowCount={4}
        gridLines={gridLines}
        colors={COLORS}
        todayX={null}
        {...props}
      />
    </svg>,
  );
}

const rects = () => Array.from(document.querySelectorAll('rect'));
const lines = () => Array.from(document.querySelectorAll('line'));

describe('GanttGrid', () => {
  it('draws one stripe per row, alternating the two row colours, at ROW_HEIGHT steps', () => {
    renderGrid();
    expect(rects().map((r) => r.getAttribute('fill'))).toEqual(['#eee', '#ddd', '#eee', '#ddd']);
    expect(rects().map((r) => r.getAttribute('y'))).toEqual(
      [0, 1, 2, 3].map((i) => String(i * ROW_HEIGHT)),
    );
    expect(rects().every((r) => r.getAttribute('height') === String(ROW_HEIGHT))).toBe(true);
    expect(rects()[0]!.getAttribute('width')).toBe('500');
  });

  it('draws group header rows as a band instead of a stripe', () => {
    renderGrid({ groupRows: new Set([1, 2]) });
    expect(rects().map((r) => r.getAttribute('fill'))).toEqual(['#eee', '#abc', '#abc', '#ddd']);
  });

  it('draws rowCount + 1 faint horizontal separators', () => {
    renderGrid();
    const horizontal = lines().filter((l) => l.getAttribute('y1') === l.getAttribute('y2'));
    expect(horizontal).toHaveLength(5);
    expect(horizontal[0]!.getAttribute('stroke')).toBe('#aaa');
    expect(horizontal[0]!.getAttribute('stroke-opacity')).toBe('0.4');
    expect(horizontal[4]!.getAttribute('y1')).toBe(String(4 * ROW_HEIGHT));
  });

  it('draws vertical lines with the major colour and full opacity for major lines only', () => {
    renderGrid();
    const vertical = lines().filter((l) => l.getAttribute('x1') === l.getAttribute('x2'));
    expect(vertical).toHaveLength(2);
    expect(vertical[0]).toMatchObject({});
    expect(vertical[0]!.getAttribute('stroke')).toBe('#555');
    expect(vertical[0]!.getAttribute('stroke-opacity')).toBe('1');
    expect(vertical[1]!.getAttribute('stroke')).toBe('#aaa');
    expect(vertical[1]!.getAttribute('stroke-opacity')).toBe('0.5');
    expect(vertical[0]!.getAttribute('y2')).toBe(String(4 * ROW_HEIGHT));
  });

  it('draws the today marker only when today is in range', () => {
    const { unmount } = renderGrid({ todayX: null });
    expect(screen.queryByTestId('gantt-today-marker')).toBeNull();
    unmount();
    renderGrid({ todayX: 321 });
    const marker = screen.getByTestId('gantt-today-marker');
    expect(marker.getAttribute('x1')).toBe('321');
    expect(marker.getAttribute('stroke')).toBe('#f00');
  });

  it('draws nothing but the closing separator for an empty chart', () => {
    renderGrid({ rowCount: 0, gridLines: [] });
    expect(rects()).toHaveLength(0);
    expect(lines()).toHaveLength(1);
  });
});
