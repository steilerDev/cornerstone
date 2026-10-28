/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { GanttGhosts } from './GanttGhosts.js';
import type { GanttGhostShape } from './GanttGhosts.js';
import { BAR_HEIGHT, BAR_OFFSET_Y, ROW_HEIGHT } from './ganttUtils.js';

const bar = (o: Partial<GanttGhostShape> = {}): GanttGhostShape => ({
  testId: 'ghost-bar',
  shape: 'bar',
  x: 100,
  width: 80,
  rowIndex: 2,
  ...o,
});

function renderGhosts(
  ghosts: readonly GanttGhostShape[],
  variant: 'planned' | 'preview' = 'planned',
) {
  return render(
    <svg>
      <GanttGhosts ghosts={ghosts} stroke="#123456" variant={variant} />
    </svg>,
  );
}

describe('GanttGhosts', () => {
  it('renders nothing for an empty list', () => {
    renderGhosts([]);
    expect(screen.queryByTestId('gantt-ghosts-planned')).toBeNull();
  });

  it('groups the outlines in an aria-hidden layer named after the variant', () => {
    renderGhosts([bar()], 'preview');
    const layer = screen.getByTestId('gantt-ghosts-preview');
    expect(layer.tagName.toLowerCase()).toBe('g');
    expect(layer).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws a bar as a dashed, unfilled rounded rect inside its row, ignoring the pointer', () => {
    renderGhosts([bar()]);
    const rect = screen.getByTestId('ghost-bar');
    expect(rect.tagName.toLowerCase()).toBe('rect');
    expect(rect.getAttribute('x')).toBe('100');
    expect(rect.getAttribute('y')).toBe(String(2 * ROW_HEIGHT + BAR_OFFSET_Y));
    expect(rect.getAttribute('width')).toBe('80');
    expect(rect.getAttribute('height')).toBe(String(BAR_HEIGHT));
    expect(rect.getAttribute('rx')).toBe('4');
    expect(rect.getAttribute('fill')).toBe('none');
    expect(rect.getAttribute('stroke')).toBe('#123456');
    expect(rect.getAttribute('stroke-dasharray')).toBe('4 3');
    expect(rect.getAttribute('pointer-events')).toBe('none');
  });

  it('the preview outline is thicker than the planned ghost', () => {
    const planned = renderGhosts([bar()], 'planned');
    expect(screen.getByTestId('ghost-bar').getAttribute('stroke-width')).toBe('1.5');
    planned.unmount();
    renderGhosts([bar()], 'preview');
    expect(screen.getByTestId('ghost-bar').getAttribute('stroke-width')).toBe('2');
  });

  it('draws a milestone as a diamond centred on x in the middle of its row', () => {
    renderGhosts([bar({ testId: 'ghost-diamond', shape: 'diamond', x: 50, rowIndex: 1 })]);
    const diamond = screen.getByTestId('ghost-diamond');
    expect(diamond.tagName.toLowerCase()).toBe('polygon');
    const y = ROW_HEIGHT + ROW_HEIGHT / 2;
    expect(diamond.getAttribute('points')).toBe(`50,${y - 8} 58,${y} 50,${y + 8} 42,${y}`);
    expect(diamond.getAttribute('fill')).toBe('none');
    expect(diamond.getAttribute('stroke-dasharray')).toBe('4 3');
    expect(diamond.getAttribute('pointer-events')).toBe('none');
  });

  it('renders every ghost of a mixed list', () => {
    renderGhosts([bar({ testId: 'a' }), bar({ testId: 'b', shape: 'diamond' })]);
    expect(screen.getByTestId('a')).toBeInTheDocument();
    expect(screen.getByTestId('b')).toBeInTheDocument();
  });
});
