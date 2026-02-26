/**
 * @jest-environment jsdom
 *
 * Unit tests for GanttArrows — arrow hover highlighting feature (Issue #287).
 *
 * Covers:
 *   - buildDependencyDescription (all 7 description variants)
 *   - Arrow hover state management (onArrowHover / onArrowLeave callbacks)
 *   - Arrow mouse-move callback
 *   - Keyboard accessibility (focus/blur trigger same behavior as mouseenter/mouseleave)
 *   - CSS class application for hovered/dimmed arrow groups
 *   - Milestone contributing and required arrow descriptions
 *   - Implicit critical path connection descriptions
 *   - aria-label correctness on each arrow group
 *   - tabIndex controlled by the visible prop
 *   - Rendering returns null when no arrows are computable
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { GanttArrows } from './GanttArrows.js';
import type { GanttArrowsProps, ArrowColors } from './GanttArrows.js';
import type { TimelineDependency } from '@cornerstone/shared';
import type { BarRect } from './arrowUtils.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COLORS: ArrowColors = {
  defaultArrow: '#6b7280',
  criticalArrow: '#fb923c',
  milestoneArrow: '#a855f7',
};

/** A minimal BarRect — positioned so arrows are always computable. */
function makeBarRect(x: number, width: number, rowIndex: number): BarRect {
  return { x, width, rowIndex };
}

/** A minimal dependency between two work items. */
function makeDep(
  predecessorId: string,
  successorId: string,
  dependencyType: TimelineDependency['dependencyType'],
): TimelineDependency {
  return { predecessorId, successorId, dependencyType, leadLagDays: 0 };
}

// Default bar positions: pred at row 0 x=100 w=200, succ at row 1 x=350 w=200
const DEFAULT_BAR_RECTS: ReadonlyMap<string, BarRect> = new Map([
  ['wi-pred', makeBarRect(100, 200, 0)],
  ['wi-succ', makeBarRect(350, 200, 1)],
  ['wi-a', makeBarRect(100, 150, 0)],
  ['wi-b', makeBarRect(300, 150, 1)],
  ['wi-c', makeBarRect(500, 150, 2)],
]);

const DEFAULT_TITLES: ReadonlyMap<string, string> = new Map([
  ['wi-pred', 'Install Plumbing'],
  ['wi-succ', 'Paint Walls'],
  ['wi-a', 'Foundation'],
  ['wi-b', 'Framing'],
  ['wi-c', 'Roofing'],
]);

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderArrows(overrides: Partial<GanttArrowsProps> = {}) {
  const deps: TimelineDependency[] = [makeDep('wi-pred', 'wi-succ', 'finish_to_start')];
  const props: GanttArrowsProps = {
    dependencies: deps,
    criticalPathSet: new Set<string>(),
    criticalPathOrder: [],
    barRects: DEFAULT_BAR_RECTS,
    workItemTitles: DEFAULT_TITLES,
    colors: COLORS,
    visible: true,
    ...overrides,
  };
  return render(
    <svg>
      <GanttArrows {...props} />
    </svg>,
  );
}

// ---------------------------------------------------------------------------
// buildDependencyDescription — tested indirectly through aria-label
// ---------------------------------------------------------------------------

describe('buildDependencyDescription — via aria-label', () => {
  it('FS: "[Pred] must finish before [Succ] can start"', () => {
    renderArrows({
      dependencies: [makeDep('wi-pred', 'wi-succ', 'finish_to_start')],
    });
    const arrows = screen.getAllByRole('graphics-symbol');
    const fsArrow = arrows.find((el) =>
      el.getAttribute('aria-label')?.includes('must finish before'),
    );
    expect(fsArrow).toBeDefined();
    expect(fsArrow!.getAttribute('aria-label')).toBe(
      'Install Plumbing must finish before Paint Walls can start',
    );
  });

  it('SS: "[Pred] and [Succ] must start together"', () => {
    renderArrows({
      dependencies: [makeDep('wi-pred', 'wi-succ', 'start_to_start')],
    });
    const arrows = screen.getAllByRole('graphics-symbol');
    const ssArrow = arrows.find((el) =>
      el.getAttribute('aria-label')?.includes('must start together'),
    );
    expect(ssArrow).toBeDefined();
    expect(ssArrow!.getAttribute('aria-label')).toBe(
      'Install Plumbing and Paint Walls must start together',
    );
  });

  it('FF: "[Pred] and [Succ] must finish together"', () => {
    renderArrows({
      dependencies: [makeDep('wi-pred', 'wi-succ', 'finish_to_finish')],
    });
    const arrows = screen.getAllByRole('graphics-symbol');
    const ffArrow = arrows.find((el) =>
      el.getAttribute('aria-label')?.includes('must finish together'),
    );
    expect(ffArrow).toBeDefined();
    expect(ffArrow!.getAttribute('aria-label')).toBe(
      'Install Plumbing and Paint Walls must finish together',
    );
  });

  it('SF: "[Succ] cannot finish until [Pred] starts"', () => {
    renderArrows({
      dependencies: [makeDep('wi-pred', 'wi-succ', 'start_to_finish')],
    });
    const arrows = screen.getAllByRole('graphics-symbol');
    const sfArrow = arrows.find((el) =>
      el.getAttribute('aria-label')?.includes('cannot finish until'),
    );
    expect(sfArrow).toBeDefined();
    expect(sfArrow!.getAttribute('aria-label')).toBe(
      'Paint Walls cannot finish until Install Plumbing starts',
    );
  });

  it('falls back to ID when predecessor title is missing from the titles map', () => {
    const barRects: ReadonlyMap<string, BarRect> = new Map([
      ['wi-unknown', makeBarRect(100, 200, 0)],
      ['wi-succ', makeBarRect(350, 200, 1)],
    ]);
    const titles: ReadonlyMap<string, string> = new Map([['wi-succ', 'Paint Walls']]);
    renderArrows({
      dependencies: [makeDep('wi-unknown', 'wi-succ', 'finish_to_start')],
      barRects,
      workItemTitles: titles,
    });
    const arrows = screen.getAllByRole('graphics-symbol');
    expect(arrows[0].getAttribute('aria-label')).toContain('wi-unknown');
  });

  it('falls back to ID when successor title is missing from the titles map', () => {
    const barRects: ReadonlyMap<string, BarRect> = new Map([
      ['wi-pred', makeBarRect(100, 200, 0)],
      ['wi-unknown-succ', makeBarRect(350, 200, 1)],
    ]);
    const titles: ReadonlyMap<string, string> = new Map([['wi-pred', 'Install Plumbing']]);
    renderArrows({
      dependencies: [makeDep('wi-pred', 'wi-unknown-succ', 'finish_to_start')],
      barRects,
      workItemTitles: titles,
    });
    const arrows = screen.getAllByRole('graphics-symbol');
    expect(arrows[0].getAttribute('aria-label')).toContain('wi-unknown-succ');
  });
});

// ---------------------------------------------------------------------------
// Milestone arrow descriptions — tested indirectly through aria-label
// ---------------------------------------------------------------------------

describe('Milestone arrow descriptions — via aria-label', () => {
  const MILESTONE_POINTS = new Map([[1, { x: 600, y: 60 }]]);
  const MILESTONE_CONTRIBUTORS = new Map([[1, ['wi-pred'] as readonly string[]]]);
  const MILESTONE_REQUIRED = new Map([['wi-succ', [1] as readonly number[]]]);
  const MILESTONE_TITLES = new Map([[1, 'Foundation Complete']]);

  it('contributing arrow: "[WI] contributes to milestone [MS]"', () => {
    renderArrows({
      dependencies: [],
      milestonePoints: MILESTONE_POINTS,
      milestoneContributors: MILESTONE_CONTRIBUTORS,
      workItemRequiredMilestones: new Map(),
      milestoneTitles: MILESTONE_TITLES,
    });
    const arrows = screen.getAllByRole('graphics-symbol');
    const contribArrow = arrows.find((el) =>
      el.getAttribute('aria-label')?.includes('contributes to milestone'),
    );
    expect(contribArrow).toBeDefined();
    expect(contribArrow!.getAttribute('aria-label')).toBe(
      'Install Plumbing contributes to milestone Foundation Complete',
    );
  });

  it('required arrow: "[MS] is a required milestone for [WI]"', () => {
    renderArrows({
      dependencies: [],
      milestonePoints: MILESTONE_POINTS,
      milestoneContributors: new Map(),
      workItemRequiredMilestones: MILESTONE_REQUIRED,
      milestoneTitles: MILESTONE_TITLES,
    });
    const arrows = screen.getAllByRole('graphics-symbol');
    const reqArrow = arrows.find((el) =>
      el.getAttribute('aria-label')?.includes('is a required milestone for'),
    );
    expect(reqArrow).toBeDefined();
    expect(reqArrow!.getAttribute('aria-label')).toBe(
      'Foundation Complete is a required milestone for Paint Walls',
    );
  });

  it('falls back to "Milestone <id>" when milestone title is not in the titles map', () => {
    renderArrows({
      dependencies: [],
      milestonePoints: MILESTONE_POINTS,
      milestoneContributors: MILESTONE_CONTRIBUTORS,
      workItemRequiredMilestones: new Map(),
      // omitting milestoneTitles — should fall back to "Milestone 1"
    });
    const arrows = screen.getAllByRole('graphics-symbol');
    expect(arrows[0].getAttribute('aria-label')).toContain('Milestone 1');
  });
});

// ---------------------------------------------------------------------------
// Implicit critical path connection descriptions
// ---------------------------------------------------------------------------

describe('Implicit critical path connection descriptions — via aria-label', () => {
  it('implicit critical: "[A] and [B] are consecutive on the critical path"', () => {
    renderArrows({
      // No explicit dependency between wi-a and wi-b so an implicit connection is created
      dependencies: [],
      criticalPathSet: new Set(['wi-a', 'wi-b']),
      criticalPathOrder: ['wi-a', 'wi-b'],
      barRects: DEFAULT_BAR_RECTS,
      workItemTitles: DEFAULT_TITLES,
    });
    const arrows = screen.getAllByRole('graphics-symbol');
    const implicitArrow = arrows.find((el) =>
      el.getAttribute('aria-label')?.includes('consecutive on the critical path'),
    );
    expect(implicitArrow).toBeDefined();
    expect(implicitArrow!.getAttribute('aria-label')).toBe(
      'Foundation and Framing are consecutive on the critical path',
    );
  });

  it('does not render implicit connection when explicit dependency exists between items', () => {
    renderArrows({
      dependencies: [makeDep('wi-a', 'wi-b', 'finish_to_start')],
      criticalPathSet: new Set(['wi-a', 'wi-b']),
      criticalPathOrder: ['wi-a', 'wi-b'],
      barRects: DEFAULT_BAR_RECTS,
      workItemTitles: DEFAULT_TITLES,
    });
    const arrows = screen.getAllByRole('graphics-symbol');
    const implicitArrow = arrows.find((el) =>
      el.getAttribute('aria-label')?.includes('consecutive on the critical path'),
    );
    // The explicit dependency exists, so no implicit connection should be drawn
    expect(implicitArrow).toBeUndefined();
  });

  it('does not render implicit connections when criticalPathOrder has fewer than 2 items', () => {
    renderArrows({
      dependencies: [],
      criticalPathSet: new Set(['wi-a']),
      criticalPathOrder: ['wi-a'],
      barRects: DEFAULT_BAR_RECTS,
      workItemTitles: DEFAULT_TITLES,
    });
    // No arrows from dependencies, no implicit arrows from single item critical path
    // Component returns null when there are no arrows — container should have no arrows layer
    const layer = screen.queryByTestId('gantt-arrows');
    expect(layer).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Arrow hover callbacks (onArrowHover, onArrowMouseMove, onArrowLeave)
// ---------------------------------------------------------------------------

describe('Arrow hover callbacks', () => {
  it('calls onArrowHover when mouse enters a non-critical arrow', () => {
    const onArrowHover = jest.fn<NonNullable<GanttArrowsProps['onArrowHover']>>();
    renderArrows({ onArrowHover });

    const [arrowGroup] = screen.getAllByRole('graphics-symbol');
    fireEvent.mouseEnter(arrowGroup, { clientX: 200, clientY: 100 });

    expect(onArrowHover).toHaveBeenCalledTimes(1);
    const [connectedIds, description, mouseEvent] = (
      onArrowHover as jest.MockedFunction<typeof onArrowHover>
    ).mock.calls[0] as [ReadonlySet<string>, string, { clientX: number; clientY: number }];

    // Connected IDs must include both endpoints
    expect(connectedIds.has('wi-pred')).toBe(true);
    expect(connectedIds.has('wi-succ')).toBe(true);

    // Description should be the FS sentence
    expect(description).toBe('Install Plumbing must finish before Paint Walls can start');

    // Mouse event coords should be passed through
    expect(mouseEvent.clientX).toBe(200);
    expect(mouseEvent.clientY).toBe(100);
  });

  it('calls onArrowLeave when mouse leaves an arrow', () => {
    const onArrowLeave = jest.fn<() => void>();
    renderArrows({ onArrowLeave });

    const [arrowGroup] = screen.getAllByRole('graphics-symbol');
    fireEvent.mouseEnter(arrowGroup);
    fireEvent.mouseLeave(arrowGroup);

    expect(onArrowLeave).toHaveBeenCalledTimes(1);
  });

  it('calls onArrowMouseMove when mouse moves over an arrow', () => {
    const onArrowMouseMove = jest.fn<NonNullable<GanttArrowsProps['onArrowMouseMove']>>();
    renderArrows({ onArrowMouseMove });

    const [arrowGroup] = screen.getAllByRole('graphics-symbol');
    fireEvent.mouseMove(arrowGroup, { clientX: 300, clientY: 150 });

    expect(onArrowMouseMove).toHaveBeenCalledTimes(1);
    const [mouseEvent] = (onArrowMouseMove as jest.MockedFunction<typeof onArrowMouseMove>).mock
      .calls[0] as [{ clientX: number; clientY: number }];
    expect(mouseEvent.clientX).toBe(300);
    expect(mouseEvent.clientY).toBe(150);
  });

  it('does not throw when optional callbacks are not provided', () => {
    renderArrows({
      onArrowHover: undefined,
      onArrowMouseMove: undefined,
      onArrowLeave: undefined,
    });
    const [arrowGroup] = screen.getAllByRole('graphics-symbol');
    expect(() => {
      fireEvent.mouseEnter(arrowGroup);
      fireEvent.mouseMove(arrowGroup);
      fireEvent.mouseLeave(arrowGroup);
    }).not.toThrow();
  });

  it('calls onArrowHover for a critical path arrow with its connected IDs', () => {
    const onArrowHover = jest.fn<NonNullable<GanttArrowsProps['onArrowHover']>>();
    renderArrows({
      dependencies: [makeDep('wi-pred', 'wi-succ', 'finish_to_start')],
      criticalPathSet: new Set(['wi-pred', 'wi-succ']),
      criticalPathOrder: ['wi-pred', 'wi-succ'],
      onArrowHover,
    });

    const arrows = screen.getAllByRole('graphics-symbol');
    fireEvent.mouseEnter(arrows[0], { clientX: 100, clientY: 50 });

    expect(onArrowHover).toHaveBeenCalledTimes(1);
    const [connectedIds] = (onArrowHover as jest.MockedFunction<typeof onArrowHover>).mock
      .calls[0] as [ReadonlySet<string>, string, { clientX: number; clientY: number }];
    expect(connectedIds.has('wi-pred')).toBe(true);
    expect(connectedIds.has('wi-succ')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Keyboard accessibility — focus/blur mirror mouseenter/mouseleave behavior
// ---------------------------------------------------------------------------

describe('Keyboard accessibility — focus/blur', () => {
  it('calls onArrowHover when an arrow group receives focus', () => {
    const onArrowHover = jest.fn<NonNullable<GanttArrowsProps['onArrowHover']>>();
    renderArrows({ onArrowHover });

    const [arrowGroup] = screen.getAllByRole('graphics-symbol');
    // jsdom focus events use getBoundingClientRect — provide a non-zero rect
    Object.defineProperty(arrowGroup, 'getBoundingClientRect', {
      value: () => ({ left: 200, top: 50, width: 100, height: 10 }),
    });
    fireEvent.focus(arrowGroup);

    expect(onArrowHover).toHaveBeenCalledTimes(1);
    const [connectedIds, description] = (onArrowHover as jest.MockedFunction<typeof onArrowHover>)
      .mock.calls[0] as [ReadonlySet<string>, string, { clientX: number; clientY: number }];
    expect(connectedIds.has('wi-pred')).toBe(true);
    expect(connectedIds.has('wi-succ')).toBe(true);
    expect(description).toBe('Install Plumbing must finish before Paint Walls can start');
  });

  it('calls onArrowLeave when an arrow group loses focus (blur)', () => {
    const onArrowLeave = jest.fn<() => void>();
    renderArrows({ onArrowLeave });

    const [arrowGroup] = screen.getAllByRole('graphics-symbol');
    fireEvent.focus(arrowGroup);
    fireEvent.blur(arrowGroup);

    expect(onArrowLeave).toHaveBeenCalledTimes(1);
  });

  it('calls onArrowHover with coords derived from the element bounding rect on focus', () => {
    const onArrowHover = jest.fn<NonNullable<GanttArrowsProps['onArrowHover']>>();
    renderArrows({ onArrowHover });

    const [arrowGroup] = screen.getAllByRole('graphics-symbol');
    Object.defineProperty(arrowGroup, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 40, width: 200, height: 20 }),
    });
    fireEvent.focus(arrowGroup);

    const [, , mouseEvent] = (onArrowHover as jest.MockedFunction<typeof onArrowHover>).mock
      .calls[0] as [ReadonlySet<string>, string, { clientX: number; clientY: number }];
    // Center x = left + width / 2 = 100 + 100 = 200
    // Center y = top + height / 2 = 40 + 10 = 50
    expect(mouseEvent.clientX).toBe(200);
    expect(mouseEvent.clientY).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Arrow CSS class application (hovered/dimmed state via internal hoveredArrowKey)
// ---------------------------------------------------------------------------

describe('Arrow group CSS class application (hover/dim state)', () => {
  it('applies arrowGroupHovered class to the hovered arrow', () => {
    // identity-obj-proxy returns the class name as a string for CSS modules.
    // SVG elements in jsdom expose className as an SVGAnimatedString — use getAttribute('class').
    renderArrows({
      dependencies: [
        makeDep('wi-a', 'wi-b', 'finish_to_start'),
        makeDep('wi-b', 'wi-c', 'finish_to_start'),
      ],
      criticalPathSet: new Set<string>(),
      criticalPathOrder: [],
    });

    const arrows = screen.getAllByRole('graphics-symbol');
    expect(arrows.length).toBeGreaterThanOrEqual(2);

    // Hover the first arrow
    fireEvent.mouseEnter(arrows[0]);

    // After hover, hovered arrow should have the hovered class
    expect(arrows[0].getAttribute('class')).toContain('arrowGroupHovered');
  });

  it('applies arrowGroupDimmed class to non-hovered arrows when one is hovered', () => {
    renderArrows({
      dependencies: [
        makeDep('wi-a', 'wi-b', 'finish_to_start'),
        makeDep('wi-b', 'wi-c', 'finish_to_start'),
      ],
      criticalPathSet: new Set<string>(),
      criticalPathOrder: [],
    });

    const arrows = screen.getAllByRole('graphics-symbol');
    expect(arrows.length).toBeGreaterThanOrEqual(2);

    // Hover the first arrow
    fireEvent.mouseEnter(arrows[0]);

    // The second arrow should be dimmed
    expect(arrows[1].getAttribute('class')).toContain('arrowGroupDimmed');
  });

  it('removes hovered/dimmed classes when mouse leaves the arrow', () => {
    renderArrows({
      dependencies: [
        makeDep('wi-a', 'wi-b', 'finish_to_start'),
        makeDep('wi-b', 'wi-c', 'finish_to_start'),
      ],
      criticalPathSet: new Set<string>(),
      criticalPathOrder: [],
    });

    const arrows = screen.getAllByRole('graphics-symbol');

    fireEvent.mouseEnter(arrows[0]);
    fireEvent.mouseLeave(arrows[0]);

    // After leave — neither hovered nor dimmed classes
    expect(arrows[0].getAttribute('class')).not.toContain('arrowGroupHovered');
    expect(arrows[0].getAttribute('class')).not.toContain('arrowGroupDimmed');
    expect(arrows[1].getAttribute('class')).not.toContain('arrowGroupDimmed');
  });

  it('only arrowGroup class is applied when no arrow is hovered (default state)', () => {
    renderArrows({
      dependencies: [makeDep('wi-a', 'wi-b', 'finish_to_start')],
      criticalPathSet: new Set<string>(),
      criticalPathOrder: [],
    });

    const arrows = screen.getAllByRole('graphics-symbol');
    expect(arrows[0].getAttribute('class')).toContain('arrowGroup');
    expect(arrows[0].getAttribute('class')).not.toContain('arrowGroupHovered');
    expect(arrows[0].getAttribute('class')).not.toContain('arrowGroupDimmed');
  });
});

// ---------------------------------------------------------------------------
// tabIndex controlled by visible prop
// ---------------------------------------------------------------------------

describe('tabIndex controlled by visible prop', () => {
  it('sets tabIndex=0 when visible=true', () => {
    renderArrows({ visible: true });
    const arrows = screen.getAllByRole('graphics-symbol');
    expect(arrows[0].getAttribute('tabindex')).toBe('0');
  });

  it('sets tabIndex=-1 when visible=false', () => {
    renderArrows({ visible: false });
    // When not visible arrows are aria-hidden but still rendered; query by attribute
    const svgContainer = document.querySelector('svg');
    const arrowGroups = svgContainer?.querySelectorAll('[role="graphics-symbol"]');
    expect(arrowGroups).toBeDefined();
    if (arrowGroups && arrowGroups.length > 0) {
      expect(arrowGroups[0].getAttribute('tabindex')).toBe('-1');
    }
  });
});

// ---------------------------------------------------------------------------
// Returns null when no arrows are computable
// ---------------------------------------------------------------------------

describe('renders null when no arrows are computable', () => {
  it('returns null when dependencies list is empty and no milestones or critical path', () => {
    const { container } = renderArrows({
      dependencies: [],
      criticalPathSet: new Set<string>(),
      criticalPathOrder: [],
      milestonePoints: undefined,
      milestoneContributors: undefined,
      workItemRequiredMilestones: undefined,
    });
    expect(container.querySelector('[data-testid="gantt-arrows"]')).not.toBeInTheDocument();
  });

  it('returns null when barRects are missing for all dependencies', () => {
    const emptyBarRects: ReadonlyMap<string, BarRect> = new Map();
    const { container } = renderArrows({
      dependencies: [makeDep('wi-pred', 'wi-succ', 'finish_to_start')],
      barRects: emptyBarRects,
    });
    expect(container.querySelector('[data-testid="gantt-arrows"]')).not.toBeInTheDocument();
  });

  it('skips an individual dependency when one endpoint is missing from barRects', () => {
    const partialBarRects: ReadonlyMap<string, BarRect> = new Map([
      ['wi-pred', makeBarRect(100, 200, 0)],
      // wi-succ missing
    ]);
    const { container } = renderArrows({
      dependencies: [makeDep('wi-pred', 'wi-succ', 'finish_to_start')],
      barRects: partialBarRects,
    });
    // Only the missing endpoint dependency is skipped, no arrows rendered
    expect(container.querySelector('[data-testid="gantt-arrows"]')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Milestone arrow connectedIds encoding
// ---------------------------------------------------------------------------

describe('Milestone arrow connectedIds encoding', () => {
  it('contributing arrow connectedIds includes "milestone:<id>" encoded key', () => {
    const onArrowHover = jest.fn<NonNullable<GanttArrowsProps['onArrowHover']>>();
    const milestonePoints = new Map([[42, { x: 600, y: 60 }]]);
    const milestoneContributors = new Map([[42, ['wi-pred'] as readonly string[]]]);
    renderArrows({
      dependencies: [],
      milestonePoints,
      milestoneContributors,
      workItemRequiredMilestones: new Map(),
      milestoneTitles: new Map([[42, 'Milestone Alpha']]),
      onArrowHover,
    });

    const arrows = screen.getAllByRole('graphics-symbol');
    fireEvent.mouseEnter(arrows[0], { clientX: 100, clientY: 50 });

    expect(onArrowHover).toHaveBeenCalledTimes(1);
    const [connectedIds] = (onArrowHover as jest.MockedFunction<typeof onArrowHover>).mock
      .calls[0] as [ReadonlySet<string>, string, { clientX: number; clientY: number }];
    expect(connectedIds.has('milestone:42')).toBe(true);
    expect(connectedIds.has('wi-pred')).toBe(true);
  });

  it('required arrow connectedIds includes "milestone:<id>" encoded key', () => {
    const onArrowHover = jest.fn<NonNullable<GanttArrowsProps['onArrowHover']>>();
    const milestonePoints = new Map([[7, { x: 200, y: 60 }]]);
    const workItemRequiredMilestones = new Map([['wi-succ', [7] as readonly number[]]]);
    renderArrows({
      dependencies: [],
      milestonePoints,
      milestoneContributors: new Map(),
      workItemRequiredMilestones,
      milestoneTitles: new Map([[7, 'Gate Review']]),
      onArrowHover,
    });

    const arrows = screen.getAllByRole('graphics-symbol');
    fireEvent.mouseEnter(arrows[0], { clientX: 100, clientY: 50 });

    expect(onArrowHover).toHaveBeenCalledTimes(1);
    const [connectedIds] = (onArrowHover as jest.MockedFunction<typeof onArrowHover>).mock
      .calls[0] as [ReadonlySet<string>, string, { clientX: number; clientY: number }];
    expect(connectedIds.has('milestone:7')).toBe(true);
    expect(connectedIds.has('wi-succ')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Aria-hidden controlled by visible prop
// ---------------------------------------------------------------------------

describe('aria-hidden controlled by visible prop', () => {
  it('does not set aria-hidden when visible=true', () => {
    renderArrows({ visible: true });
    const layer = document.querySelector('[data-testid="gantt-arrows"]');
    expect(layer?.getAttribute('aria-hidden')).toBeNull();
  });

  it('sets aria-hidden=true when visible=false', () => {
    renderArrows({ visible: false });
    const layer = document.querySelector('[data-testid="gantt-arrows"]');
    // When visible=false, aria-hidden should be set
    expect(layer?.getAttribute('aria-hidden')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// Multiple dependencies — arrow rendering completeness
// ---------------------------------------------------------------------------

describe('Multiple dependencies rendering', () => {
  it('renders one arrow group per computable dependency', () => {
    renderArrows({
      dependencies: [
        makeDep('wi-a', 'wi-b', 'finish_to_start'),
        makeDep('wi-b', 'wi-c', 'finish_to_start'),
      ],
      criticalPathSet: new Set<string>(),
      criticalPathOrder: [],
    });
    const arrows = screen.getAllByRole('graphics-symbol');
    expect(arrows).toHaveLength(2);
  });

  it('renders critical arrows after non-critical (critical overlays)', () => {
    renderArrows({
      dependencies: [
        makeDep('wi-a', 'wi-b', 'finish_to_start'), // non-critical
        makeDep('wi-b', 'wi-c', 'finish_to_start'), // critical (both in set)
      ],
      criticalPathSet: new Set(['wi-b', 'wi-c']),
      criticalPathOrder: ['wi-b', 'wi-c'],
    });
    const arrows = screen.getAllByRole('graphics-symbol');
    expect(arrows).toHaveLength(2);
    // Critical arrow has drop-shadow filter
    const criticalArrow = arrows.find((el) => el.getAttribute('filter') !== null);
    expect(criticalArrow).toBeDefined();
  });

  it('a non-critical arrow has no drop-shadow filter attribute', () => {
    renderArrows({
      dependencies: [makeDep('wi-a', 'wi-b', 'finish_to_start')],
      criticalPathSet: new Set<string>(),
      criticalPathOrder: [],
    });
    const arrows = screen.getAllByRole('graphics-symbol');
    expect(arrows[0].getAttribute('filter')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Data test-id
// ---------------------------------------------------------------------------

describe('data-testid="gantt-arrows"', () => {
  it('renders the arrows container with the gantt-arrows test id', () => {
    renderArrows();
    expect(screen.getByTestId('gantt-arrows')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Implicit critical path: skips items with no bar rect
// ---------------------------------------------------------------------------

describe('Implicit critical path skips missing barRects', () => {
  it('does not throw when criticalPathOrder contains an id not in barRects', () => {
    expect(() => {
      renderArrows({
        dependencies: [],
        criticalPathSet: new Set(['wi-a', 'wi-missing']),
        criticalPathOrder: ['wi-a', 'wi-missing'],
      });
    }).not.toThrow();
  });
});
