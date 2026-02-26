/**
 * @jest-environment jsdom
 *
 * Unit tests for GanttMilestones — diamond marker rendering, positioning,
 * keyboard/click accessibility, and MilestoneInteractionState CSS class application
 * (Issue #287: arrow hover highlighting).
 */
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { GanttMilestones, computeMilestoneStatus } from './GanttMilestones.js';
import type {
  GanttMilestonesProps,
  MilestoneColors,
  MilestoneInteractionState,
} from './GanttMilestones.js';
import type { TimelineMilestone } from '@cornerstone/shared';
import { COLUMN_WIDTHS, ROW_HEIGHT } from './ganttUtils.js';
import type { ChartRange } from './ganttUtils.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COLORS: MilestoneColors = {
  incompleteFill: '#3B82F6',
  incompleteStroke: '#1D4ED8',
  completeFill: '#22C55E',
  completeStroke: '#15803D',
  lateFill: '#DC2626',
  lateStroke: '#B91C1C',
  hoverGlow: 'rgba(59,130,246,0.3)',
  completeHoverGlow: 'rgba(34,197,94,0.3)',
  lateHoverGlow: 'rgba(220,38,38,0.25)',
};

// Chart range: 2024-06-01 to 2024-12-31 (day zoom)
const CHART_RANGE: ChartRange = {
  start: new Date(2024, 5, 1, 12, 0, 0, 0), // June 1 2024
  end: new Date(2024, 11, 31, 12, 0, 0, 0), // Dec 31 2024
  totalDays: 213,
};

const MILESTONE_INCOMPLETE: TimelineMilestone = {
  id: 1,
  title: 'Foundation Complete',
  targetDate: '2024-07-01',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItemIds: ['wi-1', 'wi-2'],
  projectedDate: null,
};

const MILESTONE_COMPLETE: TimelineMilestone = {
  id: 2,
  title: 'Framing Done',
  targetDate: '2024-09-15',
  isCompleted: true,
  completedAt: '2024-09-14T10:00:00Z',
  color: '#EF4444',
  workItemIds: [],
  projectedDate: null,
};

// projectedDate after targetDate → late
const MILESTONE_LATE: TimelineMilestone = {
  id: 3,
  title: 'Late Milestone',
  targetDate: '2024-08-01',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItemIds: ['wi-3'],
  projectedDate: '2024-09-01', // projected > target → late
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * GanttMilestones renders SVG elements. jsdom supports SVG,
 * but we must wrap it in an <svg> container for valid DOM structure.
 */
function renderMilestones(overrides: Partial<GanttMilestonesProps> = {}) {
  const props: GanttMilestonesProps = {
    milestones: [MILESTONE_INCOMPLETE],
    chartRange: CHART_RANGE,
    zoom: 'day',
    milestoneRowIndices: new Map([[1, 3]]),
    colors: COLORS,
    ...overrides,
  };
  return render(
    <svg>
      <GanttMilestones {...props} />
    </svg>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// computeMilestoneStatus unit tests
// ---------------------------------------------------------------------------

describe('computeMilestoneStatus', () => {
  it('returns "completed" when isCompleted is true regardless of projectedDate', () => {
    expect(computeMilestoneStatus({ ...MILESTONE_COMPLETE, projectedDate: '2024-12-01' })).toBe(
      'completed',
    );
  });

  it('returns "completed" when isCompleted is true and projectedDate is null', () => {
    expect(computeMilestoneStatus(MILESTONE_COMPLETE)).toBe('completed');
  });

  it('returns "late" when projectedDate > targetDate and not completed', () => {
    expect(computeMilestoneStatus(MILESTONE_LATE)).toBe('late');
  });

  it('returns "on_track" when projectedDate equals targetDate', () => {
    const ms: TimelineMilestone = {
      ...MILESTONE_INCOMPLETE,
      projectedDate: '2024-07-01', // same as targetDate
    };
    expect(computeMilestoneStatus(ms)).toBe('on_track');
  });

  it('returns "on_track" when projectedDate < targetDate', () => {
    const ms: TimelineMilestone = {
      ...MILESTONE_INCOMPLETE,
      targetDate: '2024-08-01',
      projectedDate: '2024-07-15', // before target
    };
    expect(computeMilestoneStatus(ms)).toBe('on_track');
  });

  it('returns "on_track" when projectedDate is null and not completed', () => {
    expect(computeMilestoneStatus(MILESTONE_INCOMPLETE)).toBe('on_track');
  });

  it('does not return "late" for a completed milestone even when projectedDate > targetDate', () => {
    const ms: TimelineMilestone = {
      ...MILESTONE_COMPLETE,
      projectedDate: '2024-12-31', // well past target
    };
    // Completed takes priority
    expect(computeMilestoneStatus(ms)).toBe('completed');
  });
});

describe('GanttMilestones', () => {
  // ── Empty state ────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('renders nothing when milestones array is empty', () => {
      const { container } = renderMilestones({ milestones: [] });
      expect(
        container.querySelector('[data-testid="gantt-milestones-layer"]'),
      ).not.toBeInTheDocument();
    });

    it('returns null for empty milestones (no SVG elements added)', () => {
      const { container } = renderMilestones({ milestones: [] });
      expect(container.querySelectorAll('[data-testid="gantt-milestone-diamond"]')).toHaveLength(0);
    });
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the milestones layer group', () => {
      renderMilestones();
      expect(screen.getByTestId('gantt-milestones-layer')).toBeInTheDocument();
    });

    it('renders a diamond marker for each milestone', () => {
      renderMilestones({ milestones: [MILESTONE_INCOMPLETE, MILESTONE_COMPLETE] });
      const diamonds = screen.getAllByTestId('gantt-milestone-diamond');
      expect(diamonds).toHaveLength(2);
    });

    it('renders one diamond for single milestone', () => {
      renderMilestones({ milestones: [MILESTONE_INCOMPLETE] });
      const diamonds = screen.getAllByTestId('gantt-milestone-diamond');
      expect(diamonds).toHaveLength(1);
    });

    it('layer aria-label includes milestone count', () => {
      renderMilestones({ milestones: [MILESTONE_INCOMPLETE, MILESTONE_COMPLETE] });
      const layer = screen.getByTestId('gantt-milestones-layer');
      expect(layer.getAttribute('aria-label')).toContain('2');
    });

    it('diamond has role="graphics-symbol"', () => {
      renderMilestones();
      const diamond = screen.getByTestId('gantt-milestone-diamond');
      expect(diamond.getAttribute('role')).toBe('graphics-symbol');
    });

    it('diamond has aria-label including milestone title', () => {
      renderMilestones();
      const diamond = screen.getByTestId('gantt-milestone-diamond');
      const label = diamond.getAttribute('aria-label') ?? '';
      expect(label).toContain('Foundation Complete');
    });

    it('incomplete diamond aria-label includes "incomplete"', () => {
      renderMilestones({ milestones: [MILESTONE_INCOMPLETE] });
      const diamond = screen.getByTestId('gantt-milestone-diamond');
      const label = diamond.getAttribute('aria-label') ?? '';
      expect(label.toLowerCase()).toContain('incomplete');
    });

    it('completed diamond aria-label includes "completed"', () => {
      renderMilestones({ milestones: [MILESTONE_COMPLETE] });
      const diamond = screen.getByTestId('gantt-milestone-diamond');
      const label = diamond.getAttribute('aria-label') ?? '';
      expect(label.toLowerCase()).toContain('completed');
    });

    it('diamond aria-label includes target date', () => {
      renderMilestones();
      const diamond = screen.getByTestId('gantt-milestone-diamond');
      const label = diamond.getAttribute('aria-label') ?? '';
      expect(label).toContain('2024-07-01');
    });

    it('diamond is keyboard-focusable (tabIndex=0)', () => {
      renderMilestones();
      const diamond = screen.getByTestId('gantt-milestone-diamond');
      expect(diamond.getAttribute('tabindex')).toBe('0');
    });
  });

  // ── Positioning ────────────────────────────────────────────────────────────

  describe('positioning', () => {
    it('positions diamond at correct x for day zoom', () => {
      // 2024-07-01 is 30 days from 2024-06-01, x = 30 * 40 = 1200
      renderMilestones({ zoom: 'day' });
      const layer = screen.getByTestId('gantt-milestones-layer');
      // Check the polygon has expected x coordinates embedded in points attribute
      const polygon = layer.querySelector('polygon');
      const points = polygon?.getAttribute('points') ?? '';
      // Diamond center x should be 1200 (at 2024-07-01 from 2024-06-01, 30 days * 40px)
      const expectedX = 30 * COLUMN_WIDTHS['day'];
      expect(points).toContain(`${expectedX},`);
    });

    it('positions diamond y at its assigned row index', () => {
      // milestoneRowIndices maps milestone 1 to row 3 => y = 3 * 40 + ROW_HEIGHT/2 = 140
      renderMilestones({ milestoneRowIndices: new Map([[1, 3]]) });
      const layer = screen.getByTestId('gantt-milestones-layer');
      const polygon = layer.querySelector('polygon');
      const points = polygon?.getAttribute('points') ?? '';
      const expectedY = 3 * ROW_HEIGHT + ROW_HEIGHT / 2;
      // The polygon's topmost point is y - 8; check that y value appears
      expect(points).toContain(`,${expectedY - 8}`); // top point
    });

    it('uses y=ROW_HEIGHT/2 when row index is 0', () => {
      renderMilestones({ milestoneRowIndices: new Map([[1, 0]]) });
      const layer = screen.getByTestId('gantt-milestones-layer');
      const polygon = layer.querySelector('polygon');
      const points = polygon?.getAttribute('points') ?? '';
      // row 0 => rowY=0, y=0+ROW_HEIGHT/2=20
      const expectedY = ROW_HEIGHT / 2;
      expect(points).toContain(`,${expectedY - 8}`); // top point
    });

    it('positions diamond correctly for week zoom', () => {
      // 2024-07-01 is 30 days from 2024-06-01, x = (30/7) * 110
      renderMilestones({ zoom: 'week' });
      const layer = screen.getByTestId('gantt-milestones-layer');
      const polygon = layer.querySelector('polygon');
      const points = polygon?.getAttribute('points') ?? '';
      const expectedX = (30 / 7) * COLUMN_WIDTHS['week'];
      expect(points).toContain(`${expectedX},`);
    });
  });

  // ── Events ─────────────────────────────────────────────────────────────────

  describe('events', () => {
    it('calls onMilestoneClick when diamond is clicked', () => {
      const onMilestoneClick = jest.fn();
      renderMilestones({ onMilestoneClick });

      const diamond = screen.getByTestId('gantt-milestone-diamond');
      fireEvent.click(diamond);

      expect(onMilestoneClick).toHaveBeenCalledWith(MILESTONE_INCOMPLETE.id);
    });

    it('calls onMilestoneClick with correct milestone id for second diamond', () => {
      const onMilestoneClick = jest.fn();
      renderMilestones({
        milestones: [MILESTONE_INCOMPLETE, MILESTONE_COMPLETE],
        onMilestoneClick,
      });

      const diamonds = screen.getAllByTestId('gantt-milestone-diamond');
      fireEvent.click(diamonds[1]);

      expect(onMilestoneClick).toHaveBeenCalledWith(MILESTONE_COMPLETE.id);
    });

    it('calls onMilestoneClick on Enter key press', () => {
      const onMilestoneClick = jest.fn();
      renderMilestones({ onMilestoneClick });

      const diamond = screen.getByTestId('gantt-milestone-diamond');
      fireEvent.keyDown(diamond, { key: 'Enter', code: 'Enter' });

      expect(onMilestoneClick).toHaveBeenCalledWith(MILESTONE_INCOMPLETE.id);
    });

    it('calls onMilestoneClick on Space key press', () => {
      const onMilestoneClick = jest.fn();
      renderMilestones({ onMilestoneClick });

      const diamond = screen.getByTestId('gantt-milestone-diamond');
      fireEvent.keyDown(diamond, { key: ' ', code: 'Space' });

      expect(onMilestoneClick).toHaveBeenCalledWith(MILESTONE_INCOMPLETE.id);
    });

    it('does not call onMilestoneClick on other key press (Tab)', () => {
      const onMilestoneClick = jest.fn();
      renderMilestones({ onMilestoneClick });

      const diamond = screen.getByTestId('gantt-milestone-diamond');
      fireEvent.keyDown(diamond, { key: 'Tab', code: 'Tab' });

      expect(onMilestoneClick).not.toHaveBeenCalled();
    });

    it('calls onMilestoneMouseEnter when mouse enters diamond', () => {
      const onMilestoneMouseEnter = jest.fn();
      renderMilestones({ onMilestoneMouseEnter });

      const diamond = screen.getByTestId('gantt-milestone-diamond');
      fireEvent.mouseEnter(diamond);

      expect(onMilestoneMouseEnter).toHaveBeenCalledWith(MILESTONE_INCOMPLETE, expect.any(Object));
    });

    it('calls onMilestoneMouseLeave when mouse leaves diamond', () => {
      const onMilestoneMouseLeave = jest.fn();
      renderMilestones({ onMilestoneMouseLeave });

      const diamond = screen.getByTestId('gantt-milestone-diamond');
      fireEvent.mouseLeave(diamond);

      expect(onMilestoneMouseLeave).toHaveBeenCalledWith(MILESTONE_INCOMPLETE);
    });

    it('calls onMilestoneMouseMove when mouse moves over diamond', () => {
      const onMilestoneMouseMove = jest.fn();
      renderMilestones({ onMilestoneMouseMove });

      const diamond = screen.getByTestId('gantt-milestone-diamond');
      fireEvent.mouseMove(diamond);

      expect(onMilestoneMouseMove).toHaveBeenCalled();
    });

    it('does not throw when optional event handlers are not provided', () => {
      renderMilestones({
        onMilestoneClick: undefined,
        onMilestoneMouseEnter: undefined,
        onMilestoneMouseLeave: undefined,
        onMilestoneMouseMove: undefined,
      });

      const diamond = screen.getByTestId('gantt-milestone-diamond');
      expect(() => {
        fireEvent.click(diamond);
        fireEvent.mouseEnter(diamond);
        fireEvent.mouseLeave(diamond);
        fireEvent.mouseMove(diamond);
        fireEvent.keyDown(diamond, { key: 'Enter' });
      }).not.toThrow();
    });
  });

  // ── Diamond polygon content ────────────────────────────────────────────────

  describe('diamond polygon', () => {
    it('renders polygon element for each diamond', () => {
      renderMilestones();
      const layer = screen.getByTestId('gantt-milestones-layer');
      expect(layer.querySelectorAll('polygon')).toHaveLength(1);
    });

    it('polygon has fill color set', () => {
      renderMilestones({ milestones: [MILESTONE_INCOMPLETE] });
      const layer = screen.getByTestId('gantt-milestones-layer');
      const polygon = layer.querySelector('polygon');
      expect(polygon?.getAttribute('fill')).toBe(COLORS.incompleteFill);
    });

    it('completed milestone polygon uses complete fill color', () => {
      renderMilestones({ milestones: [MILESTONE_COMPLETE] });
      const layer = screen.getByTestId('gantt-milestones-layer');
      const polygon = layer.querySelector('polygon');
      expect(polygon?.getAttribute('fill')).toBe(COLORS.completeFill);
    });

    it('polygon has strokeWidth of 2', () => {
      renderMilestones();
      const layer = screen.getByTestId('gantt-milestones-layer');
      const polygon = layer.querySelector('polygon');
      expect(polygon?.getAttribute('stroke-width')).toBe('2');
    });

    it('late milestone polygon uses late fill color', () => {
      renderMilestones({ milestones: [MILESTONE_LATE] });
      const layer = screen.getByTestId('gantt-milestones-layer');
      // For late milestones, the first polygon is the ghost (transparent) at the target date,
      // and the second polygon is the active diamond at the projected date with the late fill.
      const polygons = layer.querySelectorAll('polygon');
      const activeDiamond = polygons[polygons.length - 1];
      expect(activeDiamond?.getAttribute('fill')).toBe(COLORS.lateFill);
    });

    it('late milestone polygon uses late stroke color', () => {
      renderMilestones({ milestones: [MILESTONE_LATE] });
      const layer = screen.getByTestId('gantt-milestones-layer');
      // The active diamond (last polygon) uses the late stroke color.
      const polygons = layer.querySelectorAll('polygon');
      const activeDiamond = polygons[polygons.length - 1];
      expect(activeDiamond?.getAttribute('stroke')).toBe(COLORS.lateStroke);
    });
  });

  // ── Late milestone status ──────────────────────────────────────────────────

  describe('late milestone rendering', () => {
    it('late diamond aria-label includes "late"', () => {
      renderMilestones({ milestones: [MILESTONE_LATE] });
      const diamond = screen.getByTestId('gantt-milestone-diamond');
      const label = diamond.getAttribute('aria-label') ?? '';
      expect(label.toLowerCase()).toContain('late');
    });

    it('on_track milestone with null projectedDate renders with incomplete fill', () => {
      renderMilestones({ milestones: [MILESTONE_INCOMPLETE] });
      const layer = screen.getByTestId('gantt-milestones-layer');
      const polygon = layer.querySelector('polygon');
      expect(polygon?.getAttribute('fill')).toBe(COLORS.incompleteFill);
    });

    it('renders correct status for all three statuses in one chart', () => {
      renderMilestones({ milestones: [MILESTONE_INCOMPLETE, MILESTONE_COMPLETE, MILESTONE_LATE] });
      const diamonds = screen.getAllByTestId('gantt-milestone-diamond');
      expect(diamonds).toHaveLength(3);

      // Verify layer renders all three
      const layer = screen.getByTestId('gantt-milestones-layer');
      const polygons = layer.querySelectorAll('polygon');
      const fills = Array.from(polygons).map((p) => p.getAttribute('fill'));

      expect(fills).toContain(COLORS.incompleteFill);
      expect(fills).toContain(COLORS.completeFill);
      expect(fills).toContain(COLORS.lateFill);
    });
  });
});

// ---------------------------------------------------------------------------
// MilestoneInteractionState CSS classes (Issue #287: arrow hover highlighting)
// ---------------------------------------------------------------------------

describe('MilestoneInteractionState CSS classes', () => {
  it('applies no interaction class when milestoneInteractionStates is undefined', () => {
    // SVG elements expose className as SVGAnimatedString; use getAttribute('class').
    renderMilestones({ milestoneInteractionStates: undefined });
    const diamond = screen.getByTestId('gantt-milestone-diamond');
    expect(diamond.getAttribute('class')).not.toContain('milestoneHighlighted');
    expect(diamond.getAttribute('class')).not.toContain('milestoneDimmed');
  });

  it('applies milestoneHighlighted class when state is "highlighted"', () => {
    const interactionStates: ReadonlyMap<number, MilestoneInteractionState> = new Map([
      [MILESTONE_INCOMPLETE.id, 'highlighted'],
    ]);
    renderMilestones({ milestoneInteractionStates: interactionStates });
    const diamond = screen.getByTestId('gantt-milestone-diamond');
    expect(diamond.getAttribute('class')).toContain('milestoneHighlighted');
  });

  it('applies milestoneDimmed class when state is "dimmed"', () => {
    const interactionStates: ReadonlyMap<number, MilestoneInteractionState> = new Map([
      [MILESTONE_INCOMPLETE.id, 'dimmed'],
    ]);
    renderMilestones({ milestoneInteractionStates: interactionStates });
    const diamond = screen.getByTestId('gantt-milestone-diamond');
    expect(diamond.getAttribute('class')).toContain('milestoneDimmed');
  });

  it('applies no extra class when state is "default" (empty string class)', () => {
    const interactionStates: ReadonlyMap<number, MilestoneInteractionState> = new Map([
      [MILESTONE_INCOMPLETE.id, 'default'],
    ]);
    renderMilestones({ milestoneInteractionStates: interactionStates });
    const diamond = screen.getByTestId('gantt-milestone-diamond');
    expect(diamond.getAttribute('class')).not.toContain('milestoneHighlighted');
    expect(diamond.getAttribute('class')).not.toContain('milestoneDimmed');
  });

  it('uses "default" state when milestoneInteractionStates map does not contain the milestone id', () => {
    // Map exists but does not have an entry for MILESTONE_INCOMPLETE.id
    const interactionStates: ReadonlyMap<number, MilestoneInteractionState> = new Map([
      [999, 'highlighted'], // different milestone id
    ]);
    renderMilestones({ milestoneInteractionStates: interactionStates });
    const diamond = screen.getByTestId('gantt-milestone-diamond');
    expect(diamond.getAttribute('class')).not.toContain('milestoneHighlighted');
    expect(diamond.getAttribute('class')).not.toContain('milestoneDimmed');
  });

  it('independently applies interaction state to each milestone in a multi-milestone render', () => {
    const interactionStates: ReadonlyMap<number, MilestoneInteractionState> = new Map([
      [MILESTONE_INCOMPLETE.id, 'highlighted'], // milestone 1
      [MILESTONE_COMPLETE.id, 'dimmed'], // milestone 2
    ]);
    renderMilestones({
      milestones: [MILESTONE_INCOMPLETE, MILESTONE_COMPLETE],
      milestoneRowIndices: new Map([
        [MILESTONE_INCOMPLETE.id, 0],
        [MILESTONE_COMPLETE.id, 1],
      ]),
      milestoneInteractionStates: interactionStates,
    });
    const diamonds = screen.getAllByTestId('gantt-milestone-diamond');
    expect(diamonds).toHaveLength(2);

    // First diamond (MILESTONE_INCOMPLETE) should be highlighted
    expect(diamonds[0].getAttribute('class')).toContain('milestoneHighlighted');
    // Second diamond (MILESTONE_COMPLETE) should be dimmed
    expect(diamonds[1].getAttribute('class')).toContain('milestoneDimmed');
  });

  it('MilestoneInteractionState type includes exactly highlighted, dimmed, default', () => {
    const states: MilestoneInteractionState[] = ['highlighted', 'dimmed', 'default'];
    for (const state of states) {
      const interactionStates: ReadonlyMap<number, MilestoneInteractionState> = new Map([
        [MILESTONE_INCOMPLETE.id, state],
      ]);
      expect(() => {
        renderMilestones({ milestoneInteractionStates: interactionStates });
      }).not.toThrow();
    }
  });

  it('late milestone active diamond respects highlighted state', () => {
    const interactionStates: ReadonlyMap<number, MilestoneInteractionState> = new Map([
      [MILESTONE_LATE.id, 'highlighted'],
    ]);
    renderMilestones({
      milestones: [MILESTONE_LATE],
      milestoneRowIndices: new Map([[MILESTONE_LATE.id, 0]]),
      milestoneInteractionStates: interactionStates,
    });
    const diamond = screen.getByTestId('gantt-milestone-diamond');
    expect(diamond.getAttribute('class')).toContain('milestoneHighlighted');
  });

  it('late milestone connector line reduces strokeOpacity when state is "dimmed"', () => {
    const interactionStates: ReadonlyMap<number, MilestoneInteractionState> = new Map([
      [MILESTONE_LATE.id, 'dimmed'],
    ]);
    renderMilestones({
      milestones: [MILESTONE_LATE],
      milestoneRowIndices: new Map([[MILESTONE_LATE.id, 0]]),
      milestoneInteractionStates: interactionStates,
    });
    const layer = screen.getByTestId('gantt-milestones-layer');
    const line = layer.querySelector('line');
    // Dimmed state sets strokeOpacity to 0.2
    expect(line?.getAttribute('stroke-opacity')).toBe('0.2');
  });

  it('late milestone connector line has strokeOpacity 0.6 in default state', () => {
    renderMilestones({
      milestones: [MILESTONE_LATE],
      milestoneRowIndices: new Map([[MILESTONE_LATE.id, 0]]),
    });
    const layer = screen.getByTestId('gantt-milestones-layer');
    const line = layer.querySelector('line');
    expect(line?.getAttribute('stroke-opacity')).toBe('0.6');
  });
});
