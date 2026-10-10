/**
 * @jest-environment jsdom
 *
 * Unit tests for GanttChart — item-hover dependency highlighting (Issue #295).
 *
 * Tests the new hover state management added for story #295:
 *
 * AC-1: When hovering a work item bar, connected arrows become highlighted.
 * AC-2: Unrelated items dim when any item is hovered.
 * AC-3: Connected work items / milestones receive 'highlighted' interaction state.
 * AC-7: Hovering a milestone highlights connected milestone linkage arrows.
 * AC-8: Keyboard focus triggers same highlighting as hover.
 * AC-9: On mouse-leave / blur, all items return to default state.
 * AC-10: No hover active → all items in default visual state.
 *
 * GanttChart renders SVG elements inside a container with aria-hidden="true" on the SVG.
 * Arrow groups (role="graphics-symbol") inside aria-hidden SVG are NOT accessible to
 * screen.getAllByRole(), so we query them directly via the DOM using
 * document.querySelector('[data-testid="gantt-arrows"] [role="graphics-symbol"]').
 */
import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GanttChart as GanttChartType, GanttChartProps } from './GanttChart.js';
import type { TimelineResponse } from '@cornerstone/shared';

// ─── Mock: LocaleContext — GanttHeader (rendered by GanttChart) uses useLocale() ──

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ─── Mock: formatters — provides computeActualDuration ──────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => ({
  computeActualDuration: jest.fn(() => null),
  useFormatters: jest.fn(() => ({
    formatCurrency: (n: number) => `€${n.toFixed(2)}`,
    formatDate: (d: string | null) => d ?? '—',
    formatTime: (d: string | null) => d ?? '—',
    formatDateTime: (d: string | null) => d ?? '—',
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
  })),
  formatCurrency: (n: number) => `€${n.toFixed(2)}`,
  formatDate: (d: string | null) => d ?? '—',
  formatPercent: (n: number) => `${n.toFixed(2)}%`,
  formatWeekdayMonthDay: (d: Date) => d.toISOString().slice(0, 10),
  toBcp47Locale: (locale: string) => (locale === 'de' ? 'de-DE' : 'en-US'),
  formatDayRange: (start: Date, end: Date) =>
    `${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}`,
}));

// Dynamic import — must happen after jest.unstable_mockModule calls.
let GanttChart: typeof GanttChartType;

// ---------------------------------------------------------------------------
// Minimal TimelineResponse fixture
// ---------------------------------------------------------------------------

function makeTimeline(overrides: Partial<TimelineResponse> = {}): TimelineResponse {
  return {
    workItems: [
      {
        id: 'wi-1',
        title: 'Foundation Work',
        status: 'in_progress',
        startDate: '2024-07-01',
        endDate: '2024-07-31',
        projectedStartDate: '2024-07-01',
        projectedEndDate: '2024-07-31',
        isLate: false,
        lateDays: null,
        isHeldUp: false,
        durationDays: 30,
        actualStartDate: null,
        actualEndDate: null,
        startAfter: null,
        startBefore: null,
        assignedUser: null,
        assignedVendor: null,
        area: null,
      },
      {
        id: 'wi-2',
        title: 'Framing',
        status: 'not_started',
        startDate: '2024-08-01',
        endDate: '2024-09-15',
        projectedStartDate: '2024-08-01',
        projectedEndDate: '2024-09-15',
        isLate: false,
        lateDays: null,
        isHeldUp: false,
        durationDays: 45,
        actualStartDate: null,
        actualEndDate: null,
        startAfter: null,
        startBefore: null,
        assignedUser: null,
        assignedVendor: null,
        area: null,
      },
      {
        id: 'wi-3',
        title: 'Electrical',
        status: 'not_started',
        startDate: '2024-09-16',
        endDate: '2024-10-15',
        projectedStartDate: '2024-09-16',
        projectedEndDate: '2024-10-15',
        isLate: false,
        lateDays: null,
        isHeldUp: false,
        durationDays: 30,
        actualStartDate: null,
        actualEndDate: null,
        startAfter: null,
        startBefore: null,
        assignedUser: null,
        assignedVendor: null,
        area: null,
      },
    ],
    dependencies: [
      {
        predecessorId: 'wi-1',
        successorId: 'wi-2',
        dependencyType: 'finish_to_start',
        leadLagDays: 0,
      },
      {
        predecessorId: 'wi-2',
        successorId: 'wi-3',
        dependencyType: 'finish_to_start',
        leadLagDays: 0,
      },
    ],
    milestones: [],
    householdItems: [],
    criticalPath: [],
    dateRange: {
      earliest: '2024-07-01',
      latest: '2024-10-15',
    },
    ...overrides,
  };
}

function makeTimelineWithMilestones(): TimelineResponse {
  return {
    ...makeTimeline(),
    milestones: [
      {
        id: 1,
        title: 'Foundation Complete',
        targetDate: '2024-07-31',
        isCompleted: false,
        completedAt: null,
        color: null,
        workItemIds: ['wi-1'],
        projectedDate: null,
        isLate: false,
        lateDays: null,
        isEarly: false,
        earlyDays: null,
        isCritical: false,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderGanttChart(props: Partial<GanttChartProps> = {}) {
  const defaultData = makeTimeline();
  return render(
    <GanttChart
      data={defaultData}
      zoom="month"
      showArrows={true}
      highlightCriticalPath={false}
      {...props}
    />,
  );
}

// ---------------------------------------------------------------------------
// DOM query helpers — SVG is aria-hidden so we use direct DOM queries
// ---------------------------------------------------------------------------

/**
 * Returns all arrow group elements rendered inside the gantt-arrows container.
 * Because the SVG is aria-hidden="true", these elements are not accessible to
 * screen.getAllByRole(); we query them directly via the DOM.
 */
function getArrowGroups(): Element[] {
  const arrowsLayer = document.querySelector('[data-testid="gantt-arrows"]');
  if (!arrowsLayer) return [];
  return Array.from(arrowsLayer.querySelectorAll('[role="graphics-symbol"]'));
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const module = await import('./GanttChart.js');
  GanttChart = module.GanttChart;
});

beforeEach(() => {
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 0;
  });
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  jest.spyOn(MutationObserver.prototype, 'observe');
  jest.spyOn(MutationObserver.prototype, 'disconnect');
});

afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
});

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------

describe('GanttChart — basic rendering', () => {
  it('renders the chart root element', () => {
    renderGanttChart();
    expect(screen.getByTestId('gantt-chart')).toBeInTheDocument();
  });

  it('renders the gantt SVG canvas', () => {
    renderGanttChart();
    expect(screen.getByTestId('gantt-svg')).toBeInTheDocument();
  });

  it('renders one bar per work item', () => {
    renderGanttChart();
    const bars = screen.getAllByTestId(/^gantt-bar-/);
    expect(bars).toHaveLength(3);
  });

  it('renders bar for each work item id', () => {
    renderGanttChart();
    expect(screen.getByTestId('gantt-bar-wi-1')).toBeInTheDocument();
    expect(screen.getByTestId('gantt-bar-wi-2')).toBeInTheDocument();
    expect(screen.getByTestId('gantt-bar-wi-3')).toBeInTheDocument();
  });

  it('renders dependency arrows when showArrows=true', () => {
    renderGanttChart({ showArrows: true });
    expect(screen.getByTestId('gantt-arrows')).toBeInTheDocument();
  });

  it('renders no arrows layer visible when showArrows=false (aria-hidden)', () => {
    renderGanttChart({ showArrows: false });
    const arrowsLayer = screen.queryByTestId('gantt-arrows');
    if (arrowsLayer) {
      expect(arrowsLayer.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

// ---------------------------------------------------------------------------
// AC-10: Default state — no hover active
// ---------------------------------------------------------------------------

describe('AC-10: Default state — no item hovered', () => {
  it('all bars are in default (neither highlighted nor dimmed) on initial render', () => {
    renderGanttChart();
    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    const bar2 = screen.getByTestId('gantt-bar-wi-2');
    const bar3 = screen.getByTestId('gantt-bar-wi-3');

    expect(bar1.getAttribute('class')).not.toContain('highlighted');
    expect(bar1.getAttribute('class')).not.toContain('dimmed');
    expect(bar2.getAttribute('class')).not.toContain('highlighted');
    expect(bar2.getAttribute('class')).not.toContain('dimmed');
    expect(bar3.getAttribute('class')).not.toContain('highlighted');
    expect(bar3.getAttribute('class')).not.toContain('dimmed');
  });

  it('AC-10: arrow groups have no hovered/dimmed classes on initial render', () => {
    renderGanttChart();
    const arrowGroups = getArrowGroups();
    expect(arrowGroups.length).toBeGreaterThanOrEqual(2);
    for (const arrow of arrowGroups) {
      expect(arrow.getAttribute('class')).not.toContain('arrowGroupHovered');
      expect(arrow.getAttribute('class')).not.toContain('arrowGroupDimmed');
    }
  });
});

// ---------------------------------------------------------------------------
// AC-1, AC-2, AC-3: Work item bar hover
// ---------------------------------------------------------------------------

describe('AC-1/2/3: Work item bar hover — item-hover dependency highlighting', () => {
  it('AC-3: connected bars receive highlighted state when wi-1 is hovered', () => {
    renderGanttChart();

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    fireEvent.mouseEnter(bar1, { clientX: 300, clientY: 100 });

    // wi-2 (successor of wi-1) should be highlighted
    const bar2 = screen.getByTestId('gantt-bar-wi-2');
    expect(bar2.getAttribute('class')).toContain('highlighted');
  });

  it('AC-2: unrelated bars become dimmed when wi-1 is hovered', () => {
    renderGanttChart();

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    fireEvent.mouseEnter(bar1, { clientX: 300, clientY: 100 });

    // wi-3 is NOT directly connected to wi-1 → should be dimmed
    const bar3 = screen.getByTestId('gantt-bar-wi-3');
    expect(bar3.getAttribute('class')).toContain('dimmed');
  });

  it('AC-2: the hovered bar itself receives highlighted state (it is a connected endpoint)', () => {
    renderGanttChart();

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    fireEvent.mouseEnter(bar1, { clientX: 300, clientY: 100 });

    // wi-1 itself as predecessor should be highlighted
    expect(bar1.getAttribute('class')).toContain('highlighted');
  });

  it('AC-1: dependency arrow connected to hovered bar receives highlighted class', () => {
    renderGanttChart();

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    fireEvent.mouseEnter(bar1, { clientX: 300, clientY: 100 });

    const arrowGroups = getArrowGroups();
    expect(arrowGroups.length).toBeGreaterThanOrEqual(2);

    // The arrow from wi-1→wi-2 should be highlighted
    const connectedArrow = arrowGroups.find((el) =>
      el.getAttribute('aria-label')?.includes('Foundation Work'),
    );
    expect(connectedArrow).toBeDefined();
    expect(connectedArrow!.getAttribute('class')).toContain('arrowGroupHovered');
  });

  it('AC-2: arrow not connected to hovered bar receives dimmed class', () => {
    renderGanttChart();

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    fireEvent.mouseEnter(bar1, { clientX: 300, clientY: 100 });

    const arrowGroups = getArrowGroups();
    // wi-2→wi-3 arrow should be dimmed when wi-1 is hovered
    const unrelatedArrow = arrowGroups.find((el) => {
      const label = el.getAttribute('aria-label') ?? '';
      return label.includes('Framing') && label.includes('Electrical');
    });
    expect(unrelatedArrow).toBeDefined();
    expect(unrelatedArrow!.getAttribute('class')).toContain('arrowGroupDimmed');
  });

  it('AC-3: wi-2 hover highlights both wi-1 and wi-3 (predecessor and successor)', () => {
    renderGanttChart();

    const bar2 = screen.getByTestId('gantt-bar-wi-2');
    fireEvent.mouseEnter(bar2, { clientX: 400, clientY: 100 });

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    const bar3 = screen.getByTestId('gantt-bar-wi-3');

    expect(bar1.getAttribute('class')).toContain('highlighted');
    expect(bar3.getAttribute('class')).toContain('highlighted');
  });

  it('AC-2: wi-2 hover with all bars connected results in no dimmed bars', () => {
    renderGanttChart();

    const bar2 = screen.getByTestId('gantt-bar-wi-2');
    fireEvent.mouseEnter(bar2, { clientX: 400, clientY: 100 });

    // wi-1, wi-2, wi-3 are all directly connected to wi-2
    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    const bar3 = screen.getByTestId('gantt-bar-wi-3');
    expect(bar1.getAttribute('class')).not.toContain('dimmed');
    expect(bar2.getAttribute('class')).not.toContain('dimmed');
    expect(bar3.getAttribute('class')).not.toContain('dimmed');
  });

  it('AC-1: both arrows are highlighted when hovering the middle item (wi-2)', () => {
    renderGanttChart();

    const bar2 = screen.getByTestId('gantt-bar-wi-2');
    fireEvent.mouseEnter(bar2, { clientX: 400, clientY: 100 });

    const arrowGroups = getArrowGroups();
    // Both wi-1→wi-2 and wi-2→wi-3 arrows should be highlighted
    for (const arrow of arrowGroups) {
      expect(arrow.getAttribute('class')).toContain('arrowGroupHovered');
    }
  });
});

// ---------------------------------------------------------------------------
// AC-9: Hover-end restores default state
// ---------------------------------------------------------------------------

describe('AC-9: Mouse-leave restores default visual state', () => {
  it('all bars return to default state after mouseleave', () => {
    renderGanttChart();

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    fireEvent.mouseEnter(bar1, { clientX: 300, clientY: 100 });

    // Verify highlighting is active
    const bar2 = screen.getByTestId('gantt-bar-wi-2');
    expect(bar2.getAttribute('class')).toContain('highlighted');

    // Now leave — item hover state clears synchronously on mouseLeave
    fireEvent.mouseLeave(bar1);

    // All items should be back to default
    const bar3 = screen.getByTestId('gantt-bar-wi-3');
    expect(bar2.getAttribute('class')).not.toContain('highlighted');
    expect(bar2.getAttribute('class')).not.toContain('dimmed');
    expect(bar3.getAttribute('class')).not.toContain('highlighted');
    expect(bar3.getAttribute('class')).not.toContain('dimmed');
  });

  it('arrows return to default state after bar mouseleave', () => {
    renderGanttChart();

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    fireEvent.mouseEnter(bar1, { clientX: 300, clientY: 100 });
    fireEvent.mouseLeave(bar1);

    const arrowGroups = getArrowGroups();
    expect(arrowGroups.length).toBeGreaterThanOrEqual(1);
    for (const arrow of arrowGroups) {
      expect(arrow.getAttribute('class')).not.toContain('arrowGroupHovered');
      expect(arrow.getAttribute('class')).not.toContain('arrowGroupDimmed');
    }
  });
});

// ---------------------------------------------------------------------------
// AC-8: Keyboard focus triggers same highlight/dim behavior as hover
// ---------------------------------------------------------------------------

describe('AC-8: Keyboard focus — same highlighting behavior as hover', () => {
  it('bars receive highlighted/dimmed state when a bar is focused via keyboard', () => {
    renderGanttChart();

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    fireEvent.focus(bar1);

    // wi-2 (connected) should be highlighted
    const bar2 = screen.getByTestId('gantt-bar-wi-2');
    expect(bar2.getAttribute('class')).toContain('highlighted');

    // wi-3 (unrelated to wi-1) should be dimmed
    const bar3 = screen.getByTestId('gantt-bar-wi-3');
    expect(bar3.getAttribute('class')).toContain('dimmed');
  });

  it('arrow connected to focused bar receives highlighted class', () => {
    renderGanttChart();

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    fireEvent.focus(bar1);

    const arrowGroups = getArrowGroups();
    const connectedArrow = arrowGroups.find((el) =>
      el.getAttribute('aria-label')?.includes('Foundation Work'),
    );
    expect(connectedArrow).toBeDefined();
    expect(connectedArrow!.getAttribute('class')).toContain('arrowGroupHovered');
  });

  it('AC-9: blur restores default state for all bars', () => {
    renderGanttChart();

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    fireEvent.focus(bar1);
    fireEvent.blur(bar1);

    const bar2 = screen.getByTestId('gantt-bar-wi-2');
    const bar3 = screen.getByTestId('gantt-bar-wi-3');
    expect(bar2.getAttribute('class')).not.toContain('highlighted');
    expect(bar2.getAttribute('class')).not.toContain('dimmed');
    expect(bar3.getAttribute('class')).not.toContain('highlighted');
    expect(bar3.getAttribute('class')).not.toContain('dimmed');
  });

  it('AC-9: blur restores all arrows to default state', () => {
    renderGanttChart();

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    fireEvent.focus(bar1);
    fireEvent.blur(bar1);

    const arrowGroups = getArrowGroups();
    for (const arrow of arrowGroups) {
      expect(arrow.getAttribute('class')).not.toContain('arrowGroupHovered');
      expect(arrow.getAttribute('class')).not.toContain('arrowGroupDimmed');
    }
  });
});

// ---------------------------------------------------------------------------
// Arrow hover vs. item hover — arrow hover clears item hover state
// ---------------------------------------------------------------------------

describe('Arrow hover and item hover do not conflict', () => {
  it('hovering an arrow after hovering a bar does not throw', () => {
    renderGanttChart();

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    fireEvent.mouseEnter(bar1, { clientX: 300, clientY: 100 });

    const arrowGroups = getArrowGroups();
    if (arrowGroups.length > 0) {
      fireEvent.mouseEnter(arrowGroups[0]!, { clientX: 350, clientY: 120 });
      fireEvent.mouseLeave(bar1!);
    }

    expect(screen.getByTestId('gantt-chart')).toBeInTheDocument();
  });

  it('hovering an arrow clears the item hover state (arrow takes precedence)', () => {
    renderGanttChart();

    // First hover a bar to set item hover state
    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    fireEvent.mouseEnter(bar1, { clientX: 300, clientY: 100 });

    const bar3 = screen.getByTestId('gantt-bar-wi-3');
    expect(bar3.getAttribute('class')).toContain('dimmed');

    // Now hover an arrow — this should clear item hover and set arrow hover
    const arrowGroups = getArrowGroups();
    if (arrowGroups.length > 0) {
      const firstArrow = arrowGroups[0]!;
      Object.defineProperty(firstArrow, 'getBoundingClientRect', {
        value: () => ({ left: 300, top: 100, width: 100, height: 10 }),
        configurable: true,
      });
      fireEvent.mouseEnter(firstArrow, { clientX: 350, clientY: 120 });

      // After arrow hover, the arrow-hover-driven dimming should apply,
      // not the item-hover-driven dimming
      expect(firstArrow.getAttribute('class')).toContain('arrowGroupHovered');
    }
  });
});

// ---------------------------------------------------------------------------
// AC-7: Milestone hover — milestone linkage arrows highlighted
// ---------------------------------------------------------------------------

describe('AC-7: Milestone hover — linked arrows highlighted', () => {
  it('renders milestone diamonds when milestones are present', () => {
    renderGanttChart({ data: makeTimelineWithMilestones() });
    expect(screen.getByTestId('gantt-milestones-layer')).toBeInTheDocument();
  });

  it('AC-7: diamond mouseenter sets highlighted state on the milestone linkage arrow', () => {
    renderGanttChart({ data: makeTimelineWithMilestones() });

    const diamond = screen.getByTestId('gantt-milestone-diamond');
    fireEvent.mouseEnter(diamond, { clientX: 500, clientY: 150 });

    // The milestone-contrib arrow (wi-1 contributes to milestone 1) should be highlighted
    const arrowGroups = getArrowGroups();
    const milestoneArrow = arrowGroups.find((el) => {
      const label = el.getAttribute('aria-label') ?? '';
      return label.includes('Foundation Work') && label.includes('Foundation Complete');
    });
    expect(milestoneArrow).toBeDefined();
    expect(milestoneArrow!.getAttribute('class')).toContain('arrowGroupHovered');
  });

  it('AC-9: milestone diamond mouseleave restores all arrows to default', () => {
    renderGanttChart({ data: makeTimelineWithMilestones() });

    const diamond = screen.getByTestId('gantt-milestone-diamond');
    fireEvent.mouseEnter(diamond, { clientX: 500, clientY: 150 });
    fireEvent.mouseLeave(diamond);

    const arrowGroups = getArrowGroups();
    for (const arrow of arrowGroups) {
      expect(arrow.getAttribute('class')).not.toContain('arrowGroupHovered');
      expect(arrow.getAttribute('class')).not.toContain('arrowGroupDimmed');
    }
  });

  it('AC-7: hovering a milestone dims unrelated work item bars', () => {
    // Add more work items so some are unrelated to the milestone
    const data: TimelineResponse = {
      ...makeTimelineWithMilestones(),
      milestones: [
        {
          id: 1,
          title: 'Foundation Complete',
          targetDate: '2024-07-31',
          isCompleted: false,
          completedAt: null,
          color: null,
          workItemIds: ['wi-1'], // only wi-1 is linked
          projectedDate: null,
          isLate: false,
          lateDays: null,
          isEarly: false,
          earlyDays: null,
          isCritical: false,
        },
      ],
    };
    renderGanttChart({ data });

    const diamond = screen.getByTestId('gantt-milestone-diamond');
    fireEvent.mouseEnter(diamond, { clientX: 500, clientY: 150 });

    // wi-2 is NOT linked to milestone 1 → should be dimmed
    const bar2 = screen.getByTestId('gantt-bar-wi-2');
    expect(bar2.getAttribute('class')).toContain('dimmed');
  });
});

// ---------------------------------------------------------------------------
// GanttChart — no dependencies
// ---------------------------------------------------------------------------

describe('GanttChart — no dependencies', () => {
  it('renders without arrows when there are no dependencies', () => {
    renderGanttChart({
      data: makeTimeline({ dependencies: [] }),
    });
    expect(screen.getByTestId('gantt-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('gantt-arrows')).not.toBeInTheDocument();
  });

  it('hovering a bar does not crash when there are no dependencies', () => {
    renderGanttChart({
      data: makeTimeline({ dependencies: [] }),
    });

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    expect(() => {
      fireEvent.mouseEnter(bar1, { clientX: 300, clientY: 100 });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GanttChart — empty data
// ---------------------------------------------------------------------------

describe('GanttChart — empty data', () => {
  it('renders without crashing when workItems is empty', () => {
    renderGanttChart({
      data: makeTimeline({
        workItems: [],
        dependencies: [],
        milestones: [],
        criticalPath: [],
        dateRange: null,
      }),
    });
    expect(screen.getByTestId('gantt-chart')).toBeInTheDocument();
  });

  it('renders no bars when workItems is empty', () => {
    renderGanttChart({
      data: makeTimeline({
        workItems: [],
        dependencies: [],
        milestones: [],
        criticalPath: [],
        dateRange: null,
      }),
    });
    expect(screen.queryAllByTestId(/^gantt-bar-/)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GanttChart — onItemClick callback
// ---------------------------------------------------------------------------

describe('GanttChart — onItemClick integration', () => {
  it('calls onItemClick with the correct work item id when a bar is clicked', () => {
    const onItemClick = jest.fn<(id: string) => void>();
    renderGanttChart({ onItemClick });

    const bar1 = screen.getByTestId('gantt-bar-wi-1');
    fireEvent.click(bar1);

    expect(onItemClick).toHaveBeenCalledWith('wi-1');
  });

  it('calls onItemClick with the correct id for a different bar', () => {
    const onItemClick = jest.fn<(id: string) => void>();
    renderGanttChart({ onItemClick });

    const bar3 = screen.getByTestId('gantt-bar-wi-3');
    fireEvent.click(bar3);

    expect(onItemClick).toHaveBeenCalledWith('wi-3');
  });
});

// ---------------------------------------------------------------------------
// GanttChart — onHouseholdItemClick integration (Issue #449)
// ---------------------------------------------------------------------------

describe('GanttChart — onHouseholdItemClick integration', () => {
  it('renders household item circles when householdItems are present', () => {
    const data = makeTimeline({
      householdItems: [
        {
          id: 'hi-1',
          name: 'Kitchen Appliances',
          category: 'appliances',
          status: 'planned',
          targetDeliveryDate: '2024-08-15',
          earliestDeliveryDate: '2024-08-10',
          latestDeliveryDate: '2024-08-20',
          actualDeliveryDate: null,
          isLate: false,
          dependencyIds: [],
        },
      ],
    });
    renderGanttChart({ data });
    expect(screen.getByTestId('gantt-hi-layer')).toBeInTheDocument();
  });

  it('clicking a household item circle calls onHouseholdItemClick with correct id — Issue #449', () => {
    const onHouseholdItemClick = jest.fn<(id: string) => void>();
    const data = makeTimeline({
      householdItems: [
        {
          id: 'hi-1',
          name: 'Kitchen Appliances',
          category: 'appliances',
          status: 'planned',
          targetDeliveryDate: '2024-08-15',
          earliestDeliveryDate: '2024-08-10',
          latestDeliveryDate: '2024-08-20',
          actualDeliveryDate: null,
          isLate: false,
          dependencyIds: [],
        },
      ],
    });
    renderGanttChart({ data, onHouseholdItemClick });

    const hiCircles = screen.getAllByTestId('gantt-hi-circle');
    expect(hiCircles.length).toBeGreaterThan(0);
    fireEvent.click(hiCircles[0]!);

    expect(onHouseholdItemClick).toHaveBeenCalledWith('hi-1');
  });

  it('clicking different household item circles calls onHouseholdItemClick with correct id', () => {
    const onHouseholdItemClick = jest.fn<(id: string) => void>();
    const data = makeTimeline({
      householdItems: [
        {
          id: 'hi-kitchen',
          name: 'Kitchen Appliances',
          category: 'appliances',
          status: 'planned',
          targetDeliveryDate: '2024-08-15',
          earliestDeliveryDate: '2024-08-10',
          latestDeliveryDate: '2024-08-20',
          actualDeliveryDate: null,
          isLate: false,
          dependencyIds: [],
        },
        {
          id: 'hi-flooring',
          name: 'Flooring Materials',
          category: 'fixtures',
          status: 'planned',
          targetDeliveryDate: '2024-09-01',
          earliestDeliveryDate: '2024-08-25',
          latestDeliveryDate: '2024-09-05',
          actualDeliveryDate: null,
          isLate: false,
          dependencyIds: [],
        },
      ],
    });
    renderGanttChart({ data, onHouseholdItemClick });

    const hiCircles = screen.getAllByTestId('gantt-hi-circle');
    expect(hiCircles.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(hiCircles[1]!);

    expect(onHouseholdItemClick).toHaveBeenCalledWith('hi-flooring');
  });

  it('does not throw when onHouseholdItemClick is not provided and HI circle is clicked', () => {
    const data = makeTimeline({
      householdItems: [
        {
          id: 'hi-1',
          name: 'Kitchen Appliances',
          category: 'appliances',
          status: 'planned',
          targetDeliveryDate: '2024-08-15',
          earliestDeliveryDate: '2024-08-10',
          latestDeliveryDate: '2024-08-20',
          actualDeliveryDate: null,
          isLate: false,
          dependencyIds: [],
        },
      ],
    });
    renderGanttChart({ data });

    expect(() => {
      const hiCircles = screen.getAllByTestId('gantt-hi-circle');
      if (hiCircles.length > 0) {
        fireEvent.click(hiCircles[0]!);
      }
    }).not.toThrow();
  });

  it('calls onHouseholdItemClick when HI sidebar row is clicked — Issue #449', () => {
    const onHouseholdItemClick = jest.fn<(id: string) => void>();
    const data = makeTimeline({
      householdItems: [
        {
          id: 'hi-1',
          name: 'Kitchen Appliances',
          category: 'appliances',
          status: 'planned',
          targetDeliveryDate: '2024-08-15',
          earliestDeliveryDate: '2024-08-10',
          latestDeliveryDate: '2024-08-20',
          actualDeliveryDate: null,
          isLate: false,
          dependencyIds: [],
        },
      ],
    });
    renderGanttChart({ data, onHouseholdItemClick });

    const hiSidebarRow = screen.getByTestId('gantt-sidebar-hi-hi-1');
    fireEvent.click(hiSidebarRow);

    expect(onHouseholdItemClick).toHaveBeenCalledWith('hi-1');
  });

  it('calls onHouseholdItemClick when Enter key is pressed on HI sidebar row', () => {
    const onHouseholdItemClick = jest.fn<(id: string) => void>();
    const data = makeTimeline({
      householdItems: [
        {
          id: 'hi-1',
          name: 'Kitchen Appliances',
          category: 'appliances',
          status: 'planned',
          targetDeliveryDate: '2024-08-15',
          earliestDeliveryDate: '2024-08-10',
          latestDeliveryDate: '2024-08-20',
          actualDeliveryDate: null,
          isLate: false,
          dependencyIds: [],
        },
      ],
    });
    renderGanttChart({ data, onHouseholdItemClick });

    const hiSidebarRow = screen.getByTestId('gantt-sidebar-hi-hi-1');
    fireEvent.keyDown(hiSidebarRow, { key: 'Enter' });

    expect(onHouseholdItemClick).toHaveBeenCalledWith('hi-1');
  });

  it('does not throw when onHouseholdItemClick is not provided and HI sidebar row is clicked', () => {
    const data = makeTimeline({
      householdItems: [
        {
          id: 'hi-1',
          name: 'Kitchen Appliances',
          category: 'appliances',
          status: 'planned',
          targetDeliveryDate: '2024-08-15',
          earliestDeliveryDate: '2024-08-10',
          latestDeliveryDate: '2024-08-20',
          actualDeliveryDate: null,
          isLate: false,
          dependencyIds: [],
        },
      ],
    });
    renderGanttChart({ data });

    expect(() => {
      const hiSidebarRow = screen.getByTestId('gantt-sidebar-hi-hi-1');
      fireEvent.click(hiSidebarRow);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GanttChartSkeleton — basic smoke test
// ---------------------------------------------------------------------------

describe('GanttChartSkeleton', () => {
  it('renders the skeleton placeholder', async () => {
    const { GanttChartSkeleton } = await import('./GanttChart.js');
    render(<GanttChartSkeleton />);
    expect(screen.getByTestId('gantt-chart-skeleton')).toBeInTheDocument();
  });

  it('skeleton has aria-busy=true', async () => {
    const { GanttChartSkeleton } = await import('./GanttChart.js');
    render(<GanttChartSkeleton />);
    const skeleton = screen.getByTestId('gantt-chart-skeleton');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
  });
});

// ---------------------------------------------------------------------------
// Issue #1239 — areaName in tooltip data
// ---------------------------------------------------------------------------

describe('GanttChart — areaName in work item tooltip data (Issue #1239)', () => {
  /**
   * The tooltip is shown after TOOLTIP_SHOW_DELAY (120ms). We use fake timers
   * so we don't have to wait real time, and act() wraps the timer advance so
   * React flushes the resulting state update.
   */
  it('tooltip displays full area path when work item has ancestors', async () => {
    const { act } = await import('react');
    const data = makeTimeline({
      workItems: [
        {
          id: 'wi-area',
          title: 'Electrical Work',
          status: 'in_progress',
          startDate: '2024-07-01',
          endDate: '2024-07-31',
          projectedStartDate: '2024-07-01',
          projectedEndDate: '2024-07-31',
          isLate: false,
          lateDays: null,
          isHeldUp: false,
          durationDays: 30,
          actualStartDate: null,
          actualEndDate: null,
          startAfter: null,
          startBefore: null,
          assignedUser: null,
          assignedVendor: null,
          area: {
            id: 'area-3',
            name: 'Living Room',
            color: null,
            ancestors: [
              { id: 'area-1', name: 'Ground Floor', color: null },
              { id: 'area-2', name: 'West Wing', color: null },
            ],
          },
        },
      ],
      dependencies: [],
    });

    jest.useFakeTimers();
    try {
      renderGanttChart({ data });

      const bar = screen.getByTestId('gantt-bar-wi-area');
      fireEvent.mouseEnter(bar, { clientX: 300, clientY: 100 });

      // Advance past TOOLTIP_SHOW_DELAY (120ms)
      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // The tooltip should be visible with the full path
      const tooltip = screen.queryByTestId('gantt-tooltip');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent('Ground Floor › West Wing › Living Room');
    } finally {
      jest.useRealTimers();
    }
  });

  it('tooltip does not display area row when work item area is null', async () => {
    const { act } = await import('react');
    const data = makeTimeline({
      workItems: [
        {
          id: 'wi-no-area',
          title: 'Foundation Work',
          status: 'in_progress',
          startDate: '2024-07-01',
          endDate: '2024-07-31',
          projectedStartDate: '2024-07-01',
          projectedEndDate: '2024-07-31',
          isLate: false,
          lateDays: null,
          isHeldUp: false,
          durationDays: 30,
          actualStartDate: null,
          actualEndDate: null,
          startAfter: null,
          startBefore: null,
          assignedUser: null,
          assignedVendor: null,
          area: null,
        },
      ],
      dependencies: [],
    });

    jest.useFakeTimers();
    try {
      renderGanttChart({ data });

      const bar = screen.getByTestId('gantt-bar-wi-no-area');
      fireEvent.mouseEnter(bar, { clientX: 300, clientY: 100 });

      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // Tooltip visible but no area label row
      const tooltip = screen.queryByTestId('gantt-tooltip');
      expect(tooltip).toBeInTheDocument();
      // The tooltip should NOT contain any area label
      expect(tooltip?.textContent).not.toMatch(/Area/i);
    } finally {
      jest.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Story #2198 — tooltip data built by the shared builders (vendor, groups, purchase area)
// ---------------------------------------------------------------------------

describe('GanttChart — tooltip data from the shared builders (#2198)', () => {
  function wi(id: string, title: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      title,
      status: 'in_progress' as const,
      startDate: '2024-07-01',
      endDate: '2024-07-31',
      projectedStartDate: '2024-07-01',
      projectedEndDate: '2024-07-31',
      isLate: false,
      lateDays: null,
      isHeldUp: false,
      durationDays: 30,
      actualStartDate: null,
      actualEndDate: null,
      startAfter: null,
      startBefore: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
      ...overrides,
    };
  }

  it('shows the Company and the Waits for / Holds up groups when hovering a task bar', async () => {
    const { act } = await import('react');
    const data = makeTimeline({
      workItems: [
        wi('wi-a', 'Test Before'),
        wi('wi-b', 'Test Middle', {
          assignedVendor: { id: 'v1', name: 'Sample Tiling Ltd', trade: null },
        }),
        wi('wi-c', 'Test After'),
      ],
      dependencies: [
        {
          predecessorId: 'wi-a',
          successorId: 'wi-b',
          dependencyType: 'finish_to_start',
          leadLagDays: 0,
        },
        {
          predecessorId: 'wi-b',
          successorId: 'wi-c',
          dependencyType: 'finish_to_start',
          leadLagDays: 0,
        },
      ],
    });
    jest.useFakeTimers();
    try {
      renderGanttChart({ data });
      fireEvent.mouseEnter(screen.getByTestId('gantt-bar-wi-b'), { clientX: 300, clientY: 100 });
      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      expect(screen.getByTestId('gantt-tooltip-company')).toHaveTextContent('Sample Tiling Ltd');
      expect(screen.getByTestId('gantt-tooltip-waits-for')).toHaveTextContent('Test Before');
      expect(screen.getByTestId('gantt-tooltip-holds-up')).toHaveTextContent('Test After');
      expect(screen.getByTestId('gantt-tooltip').textContent).not.toMatch(
        /Dependencies|Blocks|Downstream/,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the status word and the area path when hovering a purchase circle', async () => {
    const { act } = await import('react');
    const data = makeTimeline({
      householdItems: [
        {
          id: 'hi-area',
          name: 'Sample Cabinets',
          category: 'furniture',
          status: 'purchased',
          targetDeliveryDate: '2024-08-15',
          earliestDeliveryDate: '2024-08-10',
          latestDeliveryDate: '2024-08-20',
          actualDeliveryDate: null,
          isLate: false,
          dependencyIds: [],
          area: {
            id: 'area-k',
            name: 'Test Kitchen',
            color: null,
            ancestors: [{ id: 'area-h', name: 'Test House', color: null }],
          },
        },
      ],
    });
    jest.useFakeTimers();
    try {
      renderGanttChart({ data });
      fireEvent.mouseEnter(screen.getByTestId('gantt-hi-circle'), { clientX: 300, clientY: 100 });
      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      const tooltip = screen.getByTestId('gantt-tooltip');
      expect(tooltip).toHaveTextContent('Ordered');
      expect(screen.getByTestId('gantt-tooltip-area')).toHaveTextContent(
        'Test House › Test Kitchen',
      );
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('GanttChart — keyboard focus and touch use the same tooltip builders (#2198)', () => {
  const purchase = {
    id: 'hi-focus',
    name: 'Sample Cabinets',
    category: 'furniture' as const,
    status: 'scheduled' as const,
    targetDeliveryDate: '2024-08-15',
    earliestDeliveryDate: null,
    latestDeliveryDate: null,
    actualDeliveryDate: null,
    isLate: false,
    dependencyIds: [],
    area: { id: 'area-k', name: 'Test Kitchen', color: null, ancestors: [] },
  };

  const task = {
    id: 'wi-focus',
    title: 'Test Focus Task',
    status: 'in_progress' as const,
    startDate: '2024-07-01',
    endDate: '2024-07-31',
    projectedStartDate: '2024-07-01',
    projectedEndDate: '2024-07-31',
    isLate: false,
    lateDays: null,
    isHeldUp: false,
    durationDays: 30,
    actualStartDate: null,
    actualEndDate: null,
    startAfter: null,
    startBefore: null,
    assignedUser: null,
    assignedVendor: { id: 'v1', name: 'Sample Tiling Ltd', trade: null },
    area: null,
  };

  it('focusing a task bar shows the tooltip with the Company', async () => {
    const { act } = await import('react');
    jest.useFakeTimers();
    try {
      renderGanttChart({ data: makeTimeline({ workItems: [task], dependencies: [] }) });
      fireEvent.focus(screen.getByTestId('gantt-bar-wi-focus'));
      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      expect(screen.getByTestId('gantt-tooltip-company')).toHaveTextContent('Sample Tiling Ltd');
    } finally {
      jest.useRealTimers();
    }
  });

  it('focusing a purchase circle shows the tooltip with the area', async () => {
    const { act } = await import('react');
    jest.useFakeTimers();
    try {
      renderGanttChart({ data: makeTimeline({ householdItems: [purchase] }) });
      fireEvent.focus(screen.getByTestId('gantt-hi-circle'));
      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      expect(screen.getByTestId('gantt-tooltip-area')).toHaveTextContent('Test Kitchen');
      expect(screen.getByTestId('gantt-tooltip')).toHaveTextContent('Delivery scheduled');
    } finally {
      jest.useRealTimers();
    }
  });

  it('the first touch tap on a purchase circle shows its tooltip with the area', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      renderGanttChart({ data: makeTimeline({ householdItems: [purchase] }) });
      fireEvent.click(screen.getByTestId('gantt-hi-circle'));
      expect(screen.getByTestId('gantt-tooltip-area')).toHaveTextContent('Test Kitchen');
    } finally {
      window.matchMedia = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Story #2199 — bars, order and tooltip follow the forecast (contract 4)
// ---------------------------------------------------------------------------

describe('GanttChart — schedule truth (forecast geometry, #2199)', () => {
  function task(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      title: `Test ${id}`,
      status: 'not_started' as const,
      startDate: '2024-07-10',
      endDate: '2024-07-20',
      projectedStartDate: '2024-07-10',
      projectedEndDate: '2024-07-20',
      isLate: false,
      lateDays: null,
      isHeldUp: false,
      durationDays: 10,
      actualStartDate: null,
      actualEndDate: null,
      startAfter: null,
      startBefore: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
      ...overrides,
    };
  }

  function barX(id: string): number {
    const rect = screen.getByTestId(`gantt-bar-${id}`).querySelector('rect');
    expect(rect).not.toBeNull();
    return Number(rect!.getAttribute('x'));
  }

  const lateTask = (id: string) =>
    task(id, {
      startDate: '2024-07-01',
      endDate: '2024-07-11',
      projectedStartDate: '2024-07-15',
      projectedEndDate: '2024-07-25',
      isLate: true,
      lateDays: 14,
    });

  it('draws a late task from its forecast start, not its planned start', () => {
    renderGanttChart({
      data: makeTimeline({
        workItems: [
          lateTask('wi-late'),
          task('wi-forecast-ref', { projectedStartDate: '2024-07-15' }),
          task('wi-planned-ref', { projectedStartDate: '2024-07-01' }),
        ],
        dependencies: [],
      }),
    });
    // Same forecast start => same x; a planned-start bar would sit 14 days further left.
    expect(barX('wi-late')).toBe(barX('wi-forecast-ref'));
    expect(barX('wi-late')).toBeGreaterThan(barX('wi-planned-ref'));
  });

  it('keeps an on-time task at its planned (= forecast) start', () => {
    renderGanttChart({
      data: makeTimeline({
        workItems: [task('wi-a'), task('wi-b', { startDate: '2024-07-10' })],
        dependencies: [],
      }),
    });
    expect(barX('wi-a')).toBe(barX('wi-b'));
  });

  it('prefers actual dates over the forecast for the bar start', () => {
    renderGanttChart({
      data: makeTimeline({
        workItems: [
          task('wi-act', {
            status: 'in_progress',
            actualStartDate: '2024-07-05',
            projectedStartDate: '2024-07-05',
          }),
          task('wi-ref', { projectedStartDate: '2024-07-05' }),
        ],
        dependencies: [],
      }),
    });
    expect(barX('wi-act')).toBe(barX('wi-ref'));
  });

  it('orders rows by forecast start', () => {
    // Planned order would be [late, early]; the forecast order is [early, late].
    renderGanttChart({
      data: makeTimeline({
        workItems: [lateTask('wi-late'), task('wi-early', { projectedStartDate: '2024-07-10' })],
        dependencies: [],
      }),
    });
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid^="gantt-sidebar-row-"]'),
    ).map((el) => el.getAttribute('data-testid'));
    expect(rows).toEqual(['gantt-sidebar-row-wi-early', 'gantt-sidebar-row-wi-late']);
  });

  it('shows the chip, the planned row and the forecast Start in the tooltip of a late task', async () => {
    const { act } = await import('react');
    jest.useFakeTimers();
    try {
      renderGanttChart({
        data: makeTimeline({ workItems: [lateTask('wi-late')], dependencies: [] }),
      });
      fireEvent.mouseEnter(screen.getByTestId('gantt-bar-wi-late'), { clientX: 300, clientY: 100 });
      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      expect(screen.getByTestId('gantt-tooltip-schedule-signal')).toBeInTheDocument();
      expect(screen.getByTestId('gantt-tooltip-planned')).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows no chip in the tooltip of an on-time task', async () => {
    const { act } = await import('react');
    jest.useFakeTimers();
    try {
      renderGanttChart({ data: makeTimeline({ workItems: [task('wi-ok')], dependencies: [] }) });
      fireEvent.mouseEnter(screen.getByTestId('gantt-bar-wi-ok'), { clientX: 300, clientY: 100 });
      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      expect(screen.getByTestId('gantt-tooltip')).toBeInTheDocument();
      expect(screen.queryByTestId('gantt-tooltip-schedule-signal')).not.toBeInTheDocument();
      expect(screen.queryByTestId('gantt-tooltip-planned')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
