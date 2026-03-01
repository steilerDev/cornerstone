/**
 * @jest-environment jsdom
 *
 * Unit tests for GanttBar — SVG bar component for work items.
 * Tests bar positioning, status coloring, text label rendering, and accessibility.
 * Also covers BarInteractionState CSS class application (Issue #287: arrow hover highlighting).
 */
import { jest, describe, it, expect } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { GanttBar } from './GanttBar.js';
import type { BarInteractionState } from './GanttBar.js';
import { BAR_HEIGHT, BAR_OFFSET_Y, ROW_HEIGHT } from './ganttUtils.js';
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
    renderInSvg({ ...DEFAULT_PROPS, title: 'Plumbing', status: 'not_started' });
    const group = screen.getByRole('graphics-symbol');
    expect(group).toHaveAttribute('aria-label', 'Work item: Plumbing, Not started');
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

  // ── BarInteractionState CSS classes (Issue #287: arrow hover highlighting) ─

  describe('interactionState CSS classes', () => {
    it('applies no extra class when interactionState is "default"', () => {
      // SVG elements expose className as SVGAnimatedString; use getAttribute('class') instead.
      const { container } = renderInSvg({
        ...DEFAULT_PROPS,
        interactionState: 'default' as BarInteractionState,
      });
      const group = container.querySelector('g');
      // identity-obj-proxy returns the class name itself, so "highlighted" should not appear
      expect(group?.getAttribute('class')).not.toContain('highlighted');
      expect(group?.getAttribute('class')).not.toContain('dimmed');
    });

    it('applies highlighted class when interactionState is "highlighted"', () => {
      const { container } = renderInSvg({
        ...DEFAULT_PROPS,
        interactionState: 'highlighted' as BarInteractionState,
      });
      const group = container.querySelector('g');
      expect(group?.getAttribute('class')).toContain('highlighted');
    });

    it('applies dimmed class when interactionState is "dimmed"', () => {
      const { container } = renderInSvg({
        ...DEFAULT_PROPS,
        interactionState: 'dimmed' as BarInteractionState,
      });
      const group = container.querySelector('g');
      expect(group?.getAttribute('class')).toContain('dimmed');
    });

    it('defaults to "default" interactionState when prop is omitted', () => {
      // Omit interactionState — should behave identically to "default"
      const { container } = renderInSvg({ ...DEFAULT_PROPS });
      const group = container.querySelector('g');
      expect(group?.getAttribute('class')).not.toContain('highlighted');
      expect(group?.getAttribute('class')).not.toContain('dimmed');
    });

    it('does not apply highlighted class when interactionState changes to "dimmed"', () => {
      const { container, rerender } = renderInSvg({
        ...DEFAULT_PROPS,
        interactionState: 'highlighted' as BarInteractionState,
      });
      const group = container.querySelector('g');
      expect(group?.getAttribute('class')).toContain('highlighted');

      // Re-render with dimmed state
      rerender(
        <svg>
          <GanttBar {...DEFAULT_PROPS} interactionState={'dimmed' as BarInteractionState} />
        </svg>,
      );
      expect(group?.getAttribute('class')).toContain('dimmed');
      expect(group?.getAttribute('class')).not.toContain('highlighted');
    });

    it('does not apply dimmed class when interactionState changes back to "default"', () => {
      const { container, rerender } = renderInSvg({
        ...DEFAULT_PROPS,
        interactionState: 'dimmed' as BarInteractionState,
      });
      const group = container.querySelector('g');
      expect(group?.getAttribute('class')).toContain('dimmed');

      // Re-render with default state
      rerender(
        <svg>
          <GanttBar {...DEFAULT_PROPS} interactionState={'default' as BarInteractionState} />
        </svg>,
      );
      expect(group?.getAttribute('class')).not.toContain('dimmed');
      expect(group?.getAttribute('class')).not.toContain('highlighted');
    });

    it('BarInteractionState type includes exactly highlighted, dimmed, default', () => {
      // Compile-time type check exercised at runtime: all 3 states render without error
      const states: BarInteractionState[] = ['highlighted', 'dimmed', 'default'];
      for (const state of states) {
        expect(() => {
          renderInSvg({ ...DEFAULT_PROPS, interactionState: state });
        }).not.toThrow();
      }
    });
  });

  // ── Mouse enter/leave callbacks (Issue #295: item-hover dependency highlighting) ──

  describe('onMouseEnter / onMouseLeave callbacks', () => {
    it('calls onMouseEnter with the mouse event when the bar group receives mouseenter', () => {
      const onMouseEnter = jest.fn<(event: React.MouseEvent<SVGGElement>) => void>();
      renderInSvg({ ...DEFAULT_PROPS, onMouseEnter });

      const group = screen.getByTestId('gantt-bar-test-item-1');
      fireEvent.mouseEnter(group, { clientX: 150, clientY: 80 });

      expect(onMouseEnter).toHaveBeenCalledTimes(1);
    });

    it('calls onMouseLeave when the bar group receives mouseleave', () => {
      const onMouseLeave = jest.fn<() => void>();
      renderInSvg({ ...DEFAULT_PROPS, onMouseLeave });

      const group = screen.getByTestId('gantt-bar-test-item-1');
      fireEvent.mouseEnter(group);
      fireEvent.mouseLeave(group);

      expect(onMouseLeave).toHaveBeenCalledTimes(1);
    });

    it('does not throw when onMouseEnter is not provided', () => {
      renderInSvg({ ...DEFAULT_PROPS, onMouseEnter: undefined });

      const group = screen.getByTestId('gantt-bar-test-item-1');
      expect(() => {
        fireEvent.mouseEnter(group);
      }).not.toThrow();
    });

    it('does not throw when onMouseLeave is not provided', () => {
      renderInSvg({ ...DEFAULT_PROPS, onMouseLeave: undefined });

      const group = screen.getByTestId('gantt-bar-test-item-1');
      expect(() => {
        fireEvent.mouseLeave(group);
      }).not.toThrow();
    });

    it('calls onMouseMove with the mouse event when the mouse moves over the bar', () => {
      const onMouseMove = jest.fn<(event: React.MouseEvent<SVGGElement>) => void>();
      renderInSvg({ ...DEFAULT_PROPS, onMouseMove });

      const group = screen.getByTestId('gantt-bar-test-item-1');
      fireEvent.mouseMove(group, { clientX: 175, clientY: 90 });

      expect(onMouseMove).toHaveBeenCalledTimes(1);
    });

    it('does not throw when onMouseMove is not provided', () => {
      renderInSvg({ ...DEFAULT_PROPS, onMouseMove: undefined });

      const group = screen.getByTestId('gantt-bar-test-item-1');
      expect(() => {
        fireEvent.mouseMove(group);
      }).not.toThrow();
    });
  });

  // ── onFocus / onBlur keyboard hover callbacks (Issue #295: AC-8) ─────────
  //
  // AC-8: Given a work item bar or milestone diamond is focused via keyboard (Tab),
  // when focus lands on the element, then the same highlighting/dimming behavior
  // as hover is applied, and the tooltip (including the dependencies list) is shown.
  //
  // The GanttBar component must expose onFocus and onBlur props so that GanttChart
  // can wire up the same hover state update logic used for mouseenter/mouseleave.

  describe('onFocus / onBlur keyboard callbacks (Issue #295 AC-8)', () => {
    it('calls onFocus with the focus event when the bar group receives focus', () => {
      const onFocus = jest.fn<(event: React.FocusEvent<SVGGElement>) => void>();
      renderInSvg({ ...DEFAULT_PROPS, onFocus });

      const group = screen.getByTestId('gantt-bar-test-item-1');
      fireEvent.focus(group);

      expect(onFocus).toHaveBeenCalledTimes(1);
    });

    it('calls onBlur when the bar group loses focus', () => {
      // onBlur on GanttBar is typed as () => void (no event parameter)
      const onBlur = jest.fn<() => void>();
      renderInSvg({ ...DEFAULT_PROPS, onBlur });

      const group = screen.getByTestId('gantt-bar-test-item-1');
      fireEvent.focus(group);
      fireEvent.blur(group);

      expect(onBlur).toHaveBeenCalledTimes(1);
    });

    it('does not throw when onFocus is not provided', () => {
      renderInSvg({ ...DEFAULT_PROPS, onFocus: undefined });

      const group = screen.getByTestId('gantt-bar-test-item-1');
      expect(() => {
        fireEvent.focus(group);
      }).not.toThrow();
    });

    it('does not throw when onBlur is not provided', () => {
      renderInSvg({ ...DEFAULT_PROPS, onBlur: undefined });

      const group = screen.getByTestId('gantt-bar-test-item-1');
      expect(() => {
        fireEvent.focus(group);
        fireEvent.blur(group);
      }).not.toThrow();
    });

    it('bar group still fires onClick on Enter when onFocus/onBlur are also wired', () => {
      const onClick = jest.fn<(id: string) => void>();
      const onFocus = jest.fn<(event: React.FocusEvent<SVGGElement>) => void>();
      const onBlur = jest.fn<() => void>();
      renderInSvg({ ...DEFAULT_PROPS, onClick, onFocus, onBlur });

      const group = screen.getByTestId('gantt-bar-test-item-1');
      fireEvent.focus(group);
      fireEvent.keyDown(group, { key: 'Enter' });
      fireEvent.blur(group);

      expect(onClick).toHaveBeenCalledWith(DEFAULT_PROPS.id);
      expect(onFocus).toHaveBeenCalledTimes(1);
      expect(onBlur).toHaveBeenCalledTimes(1);
    });

    it('onFocus is called before onBlur in a focus-then-blur sequence', () => {
      const callOrder: string[] = [];
      const onFocus = jest.fn<(event: React.FocusEvent<SVGGElement>) => void>(() => {
        callOrder.push('focus');
      });
      const onBlur = jest.fn<() => void>(() => {
        callOrder.push('blur');
      });
      renderInSvg({ ...DEFAULT_PROPS, onFocus, onBlur });

      const group = screen.getByTestId('gantt-bar-test-item-1');
      fireEvent.focus(group);
      fireEvent.blur(group);

      expect(callOrder).toEqual(['focus', 'blur']);
    });
  });
});
