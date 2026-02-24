/**
 * @jest-environment jsdom
 *
 * Unit tests for GanttBar — SVG bar component for work items.
 * Tests bar positioning, status coloring, text label rendering, and accessibility.
 */
import { jest, describe, it, expect } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { GanttBar } from './GanttBar.js';
import { BAR_HEIGHT, BAR_OFFSET_Y, ROW_HEIGHT, TEXT_LABEL_MIN_WIDTH } from './ganttUtils.js';
import type { WorkItemStatus } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

// Helper to render GanttBar inside an SVG (required for SVG elements in jsdom)
function renderInSvg(props: React.ComponentProps<typeof GanttBar>): ReturnType<typeof render> {
  return render(
    <svg>
      <GanttBar {...props} />
    </svg>,
  );
}

// Default props for most tests
const DEFAULT_PROPS = {
  id: 'test-item-1',
  title: 'Foundation Work',
  status: 'in_progress' as WorkItemStatus,
  x: 100,
  width: 200,
  rowIndex: 0,
  fill: '#3b82f6',
};

describe('GanttBar', () => {
  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders without crashing', () => {
    const { container } = renderInSvg(DEFAULT_PROPS);
    expect(container.querySelector('g')).toBeInTheDocument();
  });

  it('renders a rect element for the bar', () => {
    const { container } = renderInSvg(DEFAULT_PROPS);
    const rect = container.querySelector('rect.rect');
    expect(rect).toBeInTheDocument();
  });

  it('sets bar rect x attribute correctly', () => {
    const { container } = renderInSvg({ ...DEFAULT_PROPS, x: 150 });
    // There are two rects: one for clip path, one for the bar itself
    const rects = container.querySelectorAll('rect');
    // The visible bar rect has class 'rect' (via CSS module)
    const barRect = container.querySelector('rect.rect');
    expect(barRect).toHaveAttribute('x', '150');
  });

  it('sets bar rect y attribute based on rowIndex and BAR_OFFSET_Y', () => {
    const { container } = renderInSvg({ ...DEFAULT_PROPS, rowIndex: 2 });
    const barRect = container.querySelector('rect.rect');
    const expectedY = 2 * ROW_HEIGHT + BAR_OFFSET_Y;
    expect(barRect).toHaveAttribute('y', String(expectedY));
  });

  it('sets bar rect width attribute correctly', () => {
    const { container } = renderInSvg({ ...DEFAULT_PROPS, width: 180 });
    const barRect = container.querySelector('rect.rect');
    expect(barRect).toHaveAttribute('width', '180');
  });

  it('sets bar rect height to BAR_HEIGHT', () => {
    const { container } = renderInSvg(DEFAULT_PROPS);
    const barRect = container.querySelector('rect.rect');
    expect(barRect).toHaveAttribute('height', String(BAR_HEIGHT));
  });

  it('sets bar rect fill to the fill prop', () => {
    const { container } = renderInSvg({ ...DEFAULT_PROPS, fill: '#ef4444' });
    const barRect = container.querySelector('rect.rect');
    expect(barRect).toHaveAttribute('fill', '#ef4444');
  });

  it('renders with rounded corners (rx=4)', () => {
    const { container } = renderInSvg(DEFAULT_PROPS);
    const barRect = container.querySelector('rect.rect');
    expect(barRect).toHaveAttribute('rx', '4');
  });

  // ── Text label ─────────────────────────────────────────────────────────────

  it('shows text label when width >= TEXT_LABEL_MIN_WIDTH', () => {
    const { container } = renderInSvg({
      ...DEFAULT_PROPS,
      width: TEXT_LABEL_MIN_WIDTH,
      title: 'Foundation Work',
    });
    const text = container.querySelector('text');
    expect(text).toBeInTheDocument();
    expect(text!.textContent).toBe('Foundation Work');
  });

  it('hides text label when width < TEXT_LABEL_MIN_WIDTH', () => {
    const { container } = renderInSvg({
      ...DEFAULT_PROPS,
      width: TEXT_LABEL_MIN_WIDTH - 1,
      title: 'Foundation Work',
    });
    const text = container.querySelector('text');
    expect(text).not.toBeInTheDocument();
  });

  it('text label x is bar x + 8 (padding)', () => {
    const barX = 80;
    const { container } = renderInSvg({ ...DEFAULT_PROPS, x: barX, width: 120 });
    const text = container.querySelector('text');
    expect(text).toHaveAttribute('x', String(barX + 8));
  });

  it('text label y is centered in the row', () => {
    const rowIndex = 1;
    const expectedTextY = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
    const { container } = renderInSvg({ ...DEFAULT_PROPS, rowIndex, width: 120 });
    const text = container.querySelector('text');
    expect(text).toHaveAttribute('y', String(expectedTextY));
  });

  it('text label uses dominantBaseline="central" for vertical centering', () => {
    const { container } = renderInSvg({ ...DEFAULT_PROPS, width: 120 });
    const text = container.querySelector('text');
    expect(text).toHaveAttribute('dominant-baseline', 'central');
  });

  // ── Clip path ──────────────────────────────────────────────────────────────

  it('renders a clipPath element with correct id', () => {
    const { container } = renderInSvg({ ...DEFAULT_PROPS, id: 'my-item' });
    const clipPath = container.querySelector('clipPath');
    expect(clipPath).toBeInTheDocument();
    expect(clipPath).toHaveAttribute('id', 'bar-clip-my-item');
  });

  it('text element references the clip path', () => {
    const { container } = renderInSvg({ ...DEFAULT_PROPS, id: 'clip-test', width: 120 });
    const text = container.querySelector('text');
    expect(text).toHaveAttribute('clip-path', 'url(#bar-clip-clip-test)');
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  it('has role="graphics-symbol" on the group element', () => {
    renderInSvg(DEFAULT_PROPS);
    // The g element has role="graphics-symbol" and aria-label, so we can query by it
    const group = screen.getByRole('graphics-symbol');
    expect(group).toBeInTheDocument();
  });

  it('has tabIndex=0 for keyboard navigation', () => {
    renderInSvg(DEFAULT_PROPS);
    const group = screen.getByRole('graphics-symbol');
    // SVG elements use lowercase 'tabindex' attribute (per SVG spec),
    // unlike HTML elements which use 'tabIndex'.
    expect(group).toHaveAttribute('tabindex', '0');
  });

  it('builds aria-label from title and status', () => {
    renderInSvg({ ...DEFAULT_PROPS, title: 'Roof Installation', status: 'completed' });
    const group = screen.getByRole('graphics-symbol');
    expect(group).toHaveAttribute('aria-label', 'Work item: Roof Installation, Completed');
  });

  it('aria-label maps not_started status correctly', () => {
    renderInSvg({ ...DEFAULT_PROPS, status: 'not_started' });
    const group = screen.getByRole('graphics-symbol');
    expect(group).toHaveAttribute('aria-label', expect.stringContaining('Not started'));
  });

  it('aria-label maps in_progress status correctly', () => {
    renderInSvg({ ...DEFAULT_PROPS, status: 'in_progress' });
    const group = screen.getByRole('graphics-symbol');
    expect(group).toHaveAttribute('aria-label', expect.stringContaining('In progress'));
  });

  it('aria-label maps blocked status correctly', () => {
    renderInSvg({ ...DEFAULT_PROPS, status: 'blocked' });
    const group = screen.getByRole('graphics-symbol');
    expect(group).toHaveAttribute('aria-label', expect.stringContaining('Blocked'));
  });

  // ── Enriched aria-label with dates (Story 6.9) ────────────────────────────

  it('aria-label includes date range when both startDate and endDate are provided', () => {
    renderInSvg({
      ...DEFAULT_PROPS,
      title: 'Foundation Work',
      status: 'in_progress',
      startDate: '2024-06-01',
      endDate: '2024-07-31',
    });
    const group = screen.getByRole('graphics-symbol');
    expect(group).toHaveAttribute(
      'aria-label',
      'Work item: Foundation Work, In progress, 2024-06-01 to 2024-07-31',
    );
  });

  it('aria-label includes "from startDate" when only startDate is provided', () => {
    renderInSvg({
      ...DEFAULT_PROPS,
      title: 'Framing',
      status: 'not_started',
      startDate: '2024-05-01',
      endDate: null,
    });
    const group = screen.getByRole('graphics-symbol');
    expect(group).toHaveAttribute('aria-label', 'Work item: Framing, Not started, from 2024-05-01');
  });

  it('aria-label has no date segment when neither startDate nor endDate is provided', () => {
    renderInSvg({
      ...DEFAULT_PROPS,
      title: 'Electrical',
      status: 'not_started',
      startDate: null,
      endDate: null,
    });
    const group = screen.getByRole('graphics-symbol');
    expect(group).toHaveAttribute('aria-label', 'Work item: Electrical, Not started');
  });

  it('aria-label has no date segment when startDate and endDate are both undefined', () => {
    // DEFAULT_PROPS has no startDate/endDate — omitting both props
    renderInSvg({ ...DEFAULT_PROPS, title: 'Plumbing', status: 'blocked' });
    const group = screen.getByRole('graphics-symbol');
    expect(group).toHaveAttribute('aria-label', 'Work item: Plumbing, Blocked');
  });

  it('aria-label includes critical path suffix after date range', () => {
    renderInSvg({
      ...DEFAULT_PROPS,
      title: 'Roofing',
      status: 'in_progress',
      startDate: '2024-08-01',
      endDate: '2024-08-15',
      isCritical: true,
    });
    const group = screen.getByRole('graphics-symbol');
    expect(group).toHaveAttribute(
      'aria-label',
      'Work item: Roofing, In progress, 2024-08-01 to 2024-08-15, critical path',
    );
  });

  it('aria-label includes critical path suffix without dates when dates are absent', () => {
    renderInSvg({
      ...DEFAULT_PROPS,
      title: 'Insulation',
      status: 'not_started',
      startDate: null,
      endDate: null,
      isCritical: true,
    });
    const group = screen.getByRole('graphics-symbol');
    expect(group).toHaveAttribute(
      'aria-label',
      'Work item: Insulation, Not started, critical path',
    );
  });

  // ── aria-describedby / tooltipId (Story 6.9) ──────────────────────────────

  it('sets aria-describedby to tooltipId when tooltipId is provided', () => {
    renderInSvg({ ...DEFAULT_PROPS, tooltipId: 'gantt-chart-tooltip' });
    const group = screen.getByRole('graphics-symbol');
    expect(group).toHaveAttribute('aria-describedby', 'gantt-chart-tooltip');
  });

  it('does not set aria-describedby when tooltipId is not provided', () => {
    renderInSvg({ ...DEFAULT_PROPS });
    const group = screen.getByRole('graphics-symbol');
    expect(group).not.toHaveAttribute('aria-describedby');
  });

  it('does not set aria-describedby when tooltipId is undefined', () => {
    renderInSvg({ ...DEFAULT_PROPS, tooltipId: undefined });
    const group = screen.getByRole('graphics-symbol');
    expect(group).not.toHaveAttribute('aria-describedby');
  });

  it('has data-testid attribute matching "gantt-bar-{id}"', () => {
    renderInSvg({ ...DEFAULT_PROPS, id: 'wi-abc123' });
    expect(screen.getByTestId('gantt-bar-wi-abc123')).toBeInTheDocument();
  });

  // ── Click interactions ─────────────────────────────────────────────────────

  it('calls onClick with item id when clicked', () => {
    const handleClick = jest.fn<(id: string) => void>();
    renderInSvg({ ...DEFAULT_PROPS, id: 'wi-click-test', onClick: handleClick });

    fireEvent.click(screen.getByTestId('gantt-bar-wi-click-test'));

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith('wi-click-test');
  });

  it('does not throw when onClick is not provided', () => {
    const { container } = renderInSvg({ ...DEFAULT_PROPS, onClick: undefined });
    const group = container.querySelector('g');
    expect(() => {
      fireEvent.click(group!);
    }).not.toThrow();
  });

  // ── Keyboard interactions ──────────────────────────────────────────────────

  it('calls onClick with item id when Enter key is pressed', () => {
    const handleClick = jest.fn<(id: string) => void>();
    renderInSvg({ ...DEFAULT_PROPS, id: 'wi-enter-test', onClick: handleClick });

    const group = screen.getByTestId('gantt-bar-wi-enter-test');
    fireEvent.keyDown(group, { key: 'Enter' });

    expect(handleClick).toHaveBeenCalledWith('wi-enter-test');
  });

  it('calls onClick with item id when Space key is pressed', () => {
    const handleClick = jest.fn<(id: string) => void>();
    renderInSvg({ ...DEFAULT_PROPS, id: 'wi-space-test', onClick: handleClick });

    const group = screen.getByTestId('gantt-bar-wi-space-test');
    fireEvent.keyDown(group, { key: ' ' });

    expect(handleClick).toHaveBeenCalledWith('wi-space-test');
  });

  it('does not call onClick for other keys', () => {
    const handleClick = jest.fn<(id: string) => void>();
    renderInSvg({ ...DEFAULT_PROPS, onClick: handleClick });

    const group = screen.getByRole('graphics-symbol');
    fireEvent.keyDown(group, { key: 'Escape' });
    fireEvent.keyDown(group, { key: 'Tab' });

    expect(handleClick).not.toHaveBeenCalled();
  });

  // ── Row positioning ────────────────────────────────────────────────────────

  it('rowIndex 0 positions bar at top of chart', () => {
    const { container } = renderInSvg({ ...DEFAULT_PROPS, rowIndex: 0 });
    const barRect = container.querySelector('rect.rect');
    expect(barRect).toHaveAttribute('y', String(BAR_OFFSET_Y));
  });

  it('rowIndex 3 positions bar 3 rows down', () => {
    const { container } = renderInSvg({ ...DEFAULT_PROPS, rowIndex: 3 });
    const barRect = container.querySelector('rect.rect');
    expect(barRect).toHaveAttribute('y', String(3 * ROW_HEIGHT + BAR_OFFSET_Y));
  });
});
