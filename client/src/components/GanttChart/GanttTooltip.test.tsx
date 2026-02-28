/**
 * @jest-environment jsdom
 *
 * Unit tests for GanttTooltip — tooltip rendering, positioning, and portal output.
 * Tests all status variants, date formatting, duration display, overflow-flip logic,
 * and ArrowTooltipContent (Issue #287: arrow hover highlighting).
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { GanttTooltip } from './GanttTooltip.js';
import type {
  GanttTooltipWorkItemData,
  GanttTooltipArrowData,
  GanttTooltipMilestoneData,
  GanttTooltipPosition,
} from './GanttTooltip.js';
import type { WorkItemStatus } from '@cornerstone/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_DATA: GanttTooltipWorkItemData = {
  kind: 'work-item',
  title: 'Foundation Work',
  status: 'in_progress',
  startDate: '2024-06-01',
  endDate: '2024-06-15',
  durationDays: 14,
  assignedUserName: 'Jane Doe',
};

const DEFAULT_POSITION: GanttTooltipPosition = {
  x: 100,
  y: 200,
};

function renderTooltip(
  data: Partial<GanttTooltipWorkItemData> = {},
  position: Partial<GanttTooltipPosition> = {},
  id?: string,
) {
  return render(
    <GanttTooltip
      data={{ ...DEFAULT_DATA, ...data }}
      position={{ ...DEFAULT_POSITION, ...position }}
      id={id}
    />,
  );
}

// ---------------------------------------------------------------------------
// Rendering — basic content
// ---------------------------------------------------------------------------

describe('GanttTooltip', () => {
  beforeEach(() => {
    // Set up a stable viewport for positioning tests
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  });

  afterEach(() => {
    // Restore defaults
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  });

  describe('basic rendering', () => {
    it('renders into the document (via portal)', () => {
      renderTooltip();
      expect(screen.getByTestId('gantt-tooltip')).toBeInTheDocument();
    });

    it('has role="tooltip"', () => {
      renderTooltip();
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    it('renders the title text', () => {
      renderTooltip({ title: 'Roof Installation' });
      expect(screen.getByText('Roof Installation')).toBeInTheDocument();
    });

    it('renders start and end labels', () => {
      renderTooltip();
      expect(screen.getByText('Start')).toBeInTheDocument();
      expect(screen.getByText('End')).toBeInTheDocument();
    });

    it('renders the Duration label', () => {
      renderTooltip();
      expect(screen.getByText('Duration')).toBeInTheDocument();
    });

    it('renders the Owner label when assignedUserName is provided', () => {
      renderTooltip({ assignedUserName: 'John Smith' });
      expect(screen.getByText('Owner')).toBeInTheDocument();
    });

    it('does not render Owner row when assignedUserName is null', () => {
      renderTooltip({ assignedUserName: null });
      expect(screen.queryByText('Owner')).not.toBeInTheDocument();
    });

    it('renders the assigned user name', () => {
      renderTooltip({ assignedUserName: 'Alice Johnson' });
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Status badge rendering
  // ---------------------------------------------------------------------------

  describe('status badges', () => {
    const statuses: { status: WorkItemStatus; expectedLabel: string }[] = [
      { status: 'not_started', expectedLabel: 'Not started' },
      { status: 'in_progress', expectedLabel: 'In progress' },
      { status: 'completed', expectedLabel: 'Completed' },
    ];

    statuses.forEach(({ status, expectedLabel }) => {
      it(`renders "${expectedLabel}" label for status "${status}"`, () => {
        renderTooltip({ status });
        expect(screen.getByText(expectedLabel)).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Date formatting
  // ---------------------------------------------------------------------------

  describe('date formatting', () => {
    it('formats a start date from ISO string to readable form', () => {
      renderTooltip({ startDate: '2024-06-01', endDate: '2024-06-15' });
      // "Jun 1, 2024" or equivalent en-US short format — may match multiple elements
      const monthMatches = screen.getAllByText(/Jun/);
      expect(monthMatches.length).toBeGreaterThanOrEqual(1);
    });

    it('renders em dash for null start date', () => {
      renderTooltip({ startDate: null });
      // The em dash character "—" should appear for null dates
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it('renders em dash for null end date', () => {
      renderTooltip({ endDate: null });
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it('renders em dash for both null start and end dates', () => {
      renderTooltip({ startDate: null, endDate: null });
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });

    it('formats a December date correctly', () => {
      renderTooltip({ startDate: '2024-12-25', endDate: '2024-12-31' });
      // Both start and end are in December — at least one should show "Dec"
      const decMatches = screen.getAllByText(/Dec/);
      expect(decMatches.length).toBeGreaterThanOrEqual(1);
    });

    it('renders the year in the formatted date', () => {
      renderTooltip({ startDate: '2025-03-01', endDate: '2025-04-01' });
      // Both dates are in 2025 — at least one should contain "2025"
      const yearMatches = screen.getAllByText(/2025/);
      expect(yearMatches.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Duration formatting
  // ---------------------------------------------------------------------------

  describe('duration formatting', () => {
    it('renders "1 day" for durationDays=1', () => {
      renderTooltip({ durationDays: 1 });
      expect(screen.getByText('1 day')).toBeInTheDocument();
    });

    it('renders "N days" for durationDays > 1', () => {
      renderTooltip({ durationDays: 14 });
      expect(screen.getByText('14 days')).toBeInTheDocument();
    });

    it('renders "7 days" for durationDays=7', () => {
      renderTooltip({ durationDays: 7 });
      expect(screen.getByText('7 days')).toBeInTheDocument();
    });

    it('renders "30 days" for durationDays=30', () => {
      renderTooltip({ durationDays: 30 });
      expect(screen.getByText('30 days')).toBeInTheDocument();
    });

    it('renders em dash for null durationDays', () => {
      renderTooltip({ durationDays: null });
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it('renders "2 days" (plural) not "2 day"', () => {
      renderTooltip({ durationDays: 2 });
      expect(screen.getByText('2 days')).toBeInTheDocument();
      expect(screen.queryByText('2 day')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Positioning logic
  // ---------------------------------------------------------------------------

  describe('positioning', () => {
    it('sets left style for normal position (right of cursor)', () => {
      renderTooltip({}, { x: 100, y: 200 });
      const tooltip = screen.getByTestId('gantt-tooltip');
      // Default: tooltip appears to the right of cursor (100 + 12 = 112)
      expect(tooltip).toHaveStyle({ left: '112px' });
    });

    it('sets top style for normal position (below cursor)', () => {
      renderTooltip({}, { x: 100, y: 200 });
      const tooltip = screen.getByTestId('gantt-tooltip');
      // Default: tooltip appears below cursor (200 + 8 = 208)
      expect(tooltip).toHaveStyle({ top: '208px' });
    });

    it('flips horizontally when tooltip would overflow right viewport edge', () => {
      // Viewport width = 1280. If x + 240 + 12 > 1280 - 8, it flips.
      // tooltip x = 1200 + 12 = 1212, TOOLTIP_WIDTH = 240 => 1212 + 240 = 1452 > 1272 → flip
      renderTooltip({}, { x: 1200, y: 100 });
      const tooltip = screen.getByTestId('gantt-tooltip');
      // When flipped: left = 1200 - 240 - 12 = 948
      expect(tooltip).toHaveStyle({ left: '948px' });
    });

    it('does not flip horizontally when tooltip fits within viewport', () => {
      // x=100: 100 + 12 = 112, 112 + 240 = 352 < 1272 → no flip
      renderTooltip({}, { x: 100, y: 100 });
      const tooltip = screen.getByTestId('gantt-tooltip');
      expect(tooltip).toHaveStyle({ left: '112px' });
    });

    it('flips vertically when tooltip would overflow bottom viewport edge', () => {
      // Viewport height = 800. TOOLTIP_HEIGHT_ESTIMATE = 200, OFFSET_Y = 8.
      // y=700: tooltipY = 700 + 8 = 708, 708 + 200 = 908 > 792 → flip
      renderTooltip({}, { x: 100, y: 700 });
      const tooltip = screen.getByTestId('gantt-tooltip');
      // When flipped: top = 700 - 200 - 8 = 492
      expect(tooltip).toHaveStyle({ top: '492px' });
    });

    it('does not flip vertically when tooltip fits within viewport height', () => {
      // y=200: 200 + 8 = 208, 208 + 130 = 338 < 792 → no flip
      renderTooltip({}, { x: 100, y: 200 });
      const tooltip = screen.getByTestId('gantt-tooltip');
      expect(tooltip).toHaveStyle({ top: '208px' });
    });

    it('sets width style to TOOLTIP_WIDTH (240)', () => {
      renderTooltip();
      const tooltip = screen.getByTestId('gantt-tooltip');
      expect(tooltip).toHaveStyle({ width: '240px' });
    });
  });

  // ---------------------------------------------------------------------------
  // Portal rendering
  // ---------------------------------------------------------------------------

  describe('portal rendering', () => {
    it('renders into document.body (not the test container)', () => {
      const { container } = renderTooltip();
      // The tooltip should NOT be inside the test container
      expect(container.querySelector('[data-testid="gantt-tooltip"]')).not.toBeInTheDocument();
      // But it should be in the document overall
      expect(document.querySelector('[data-testid="gantt-tooltip"]')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // id prop for aria-describedby (Story 6.9)
  // ---------------------------------------------------------------------------

  describe('id prop', () => {
    it('applies the id attribute to the tooltip element when provided', () => {
      renderTooltip({}, {}, 'gantt-chart-tooltip');
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveAttribute('id', 'gantt-chart-tooltip');
    });

    it('does not set an id attribute when id prop is omitted', () => {
      renderTooltip();
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).not.toHaveAttribute('id');
    });

    it('does not set an id attribute when id prop is undefined', () => {
      renderTooltip({}, {}, undefined);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).not.toHaveAttribute('id');
    });

    it('id on tooltip element matches the triggering bar aria-describedby contract', () => {
      // Verify that passing a specific id string creates an element with that id,
      // so that a GanttBar using aria-describedby with the same id resolves correctly.
      const tooltipId = 'gantt-chart-tooltip';
      renderTooltip({}, {}, tooltipId);
      // The element with this id should be the tooltip
      const tooltipById = document.getElementById(tooltipId);
      expect(tooltipById).not.toBeNull();
      expect(tooltipById).toHaveAttribute('role', 'tooltip');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('renders correctly with all null fields', () => {
      renderTooltip({
        startDate: null,
        endDate: null,
        durationDays: null,
        assignedUserName: null,
      });
      expect(screen.getByTestId('gantt-tooltip')).toBeInTheDocument();
      expect(screen.getByText('Foundation Work')).toBeInTheDocument();
    });

    it('renders long titles without crashing', () => {
      const longTitle = 'A'.repeat(200);
      renderTooltip({ title: longTitle });
      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it('handles position at viewport origin (0,0)', () => {
      renderTooltip({}, { x: 0, y: 0 });
      const tooltip = screen.getByTestId('gantt-tooltip');
      expect(tooltip).toBeInTheDocument();
      // x=0: 0+12=12 → 12 + 240 = 252 < 1272 → no flip
      expect(tooltip).toHaveStyle({ left: '12px' });
    });

    it('handles x position requiring both horizontal and vertical flip simultaneously', () => {
      renderTooltip({}, { x: 1200, y: 700 });
      const tooltip = screen.getByTestId('gantt-tooltip');
      // Both should be flipped:
      // - horizontal: 1200 - 240 - 12 = 948
      // - vertical:   700 - 200 - 8 = 492 (TOOLTIP_HEIGHT_ESTIMATE = 200)
      expect(tooltip).toHaveStyle({ left: '948px' });
      expect(tooltip).toHaveStyle({ top: '492px' });
    });
  });
});

// ---------------------------------------------------------------------------
// GanttTooltipArrowData / ArrowTooltipContent (Issue #287: arrow hover highlighting)
// ---------------------------------------------------------------------------

const DEFAULT_ARROW_DATA: GanttTooltipArrowData = {
  kind: 'arrow',
  description: 'Install Plumbing must finish before Paint Walls can start',
};

const ARROW_DEFAULT_POSITION: GanttTooltipPosition = { x: 100, y: 200 };

function renderArrowTooltip(
  data: Partial<GanttTooltipArrowData> = {},
  position: Partial<GanttTooltipPosition> = {},
  id?: string,
) {
  return render(
    <GanttTooltip
      data={{ ...DEFAULT_ARROW_DATA, ...data }}
      position={{ ...ARROW_DEFAULT_POSITION, ...position }}
      id={id}
    />,
  );
}

describe('GanttTooltip — arrow kind', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  });

  it('renders into the document (via portal)', () => {
    renderArrowTooltip();
    expect(screen.getByTestId('gantt-tooltip')).toBeInTheDocument();
  });

  it('has role="tooltip" on the container', () => {
    renderArrowTooltip();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('renders the arrow description text', () => {
    renderArrowTooltip();
    expect(
      screen.getByText('Install Plumbing must finish before Paint Walls can start'),
    ).toBeInTheDocument();
  });

  it('renders the description in a role="status" element', () => {
    renderArrowTooltip();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).toBe(
      'Install Plumbing must finish before Paint Walls can start',
    );
  });

  it('renders a custom description string correctly', () => {
    renderArrowTooltip({
      description: 'Foundation and Framing are consecutive on the critical path',
    });
    expect(
      screen.getByText('Foundation and Framing are consecutive on the critical path'),
    ).toBeInTheDocument();
  });

  it('renders a milestone contributing description', () => {
    renderArrowTooltip({ description: 'Framing contributes to milestone Foundation Complete' });
    expect(
      screen.getByText('Framing contributes to milestone Foundation Complete'),
    ).toBeInTheDocument();
  });

  it('renders a milestone required description', () => {
    renderArrowTooltip({ description: 'Gate Review is a required milestone for Electrical' });
    expect(
      screen.getByText('Gate Review is a required milestone for Electrical'),
    ).toBeInTheDocument();
  });

  it('does not render work-item-specific labels (Start, End, Duration) for arrow kind', () => {
    renderArrowTooltip();
    expect(screen.queryByText('Start')).not.toBeInTheDocument();
    expect(screen.queryByText('End')).not.toBeInTheDocument();
    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
  });

  it('does not render milestone-specific labels (Target, Linked) for arrow kind', () => {
    renderArrowTooltip();
    expect(screen.queryByText('Target')).not.toBeInTheDocument();
    expect(screen.queryByText(/Linked/)).not.toBeInTheDocument();
  });

  it('applies the id attribute to the tooltip element when provided', () => {
    renderArrowTooltip({}, {}, 'gantt-chart-tooltip');
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveAttribute('id', 'gantt-chart-tooltip');
  });

  it('positions the arrow tooltip to the right of the cursor by default', () => {
    renderArrowTooltip({}, { x: 100, y: 200 });
    const tooltip = screen.getByTestId('gantt-tooltip');
    expect(tooltip).toHaveStyle({ left: '112px' }); // 100 + 12 = 112
  });

  it('flips the arrow tooltip horizontally when near the right edge', () => {
    renderArrowTooltip({}, { x: 1200, y: 100 });
    const tooltip = screen.getByTestId('gantt-tooltip');
    expect(tooltip).toHaveStyle({ left: '948px' }); // flipped
  });

  it('renders an empty description without crashing', () => {
    renderArrowTooltip({ description: '' });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('renders a very long description without crashing', () => {
    const longDescription = 'A'.repeat(300);
    renderArrowTooltip({ description: longDescription });
    expect(screen.getByText(longDescription)).toBeInTheDocument();
  });

  it('GanttTooltipArrowData has kind="arrow" discriminator', () => {
    // Type-level check: ensure the data union has the arrow variant
    const data: GanttTooltipArrowData = {
      kind: 'arrow',
      description: 'test',
    };
    expect(data.kind).toBe('arrow');
  });
});

// ---------------------------------------------------------------------------
// GanttTooltip — work item kind with dependencies (Issue #295: AC-4, AC-5, AC-6)
//
// AC-4: When a work item bar is hovered and the tooltip appears, when the work
//       item has at least one predecessor or successor dependency, then the tooltip
//       displays a "Dependencies" section listing each dependency with the connected
//       item's title and the dependency type (e.g., "Finish-to-Start").
//
// AC-5: When the work item has more than 5 total dependencies (predecessors +
//       successors), only the first 5 are shown followed by a "+N more" overflow
//       indicator.
//
// AC-6: When the work item has zero dependencies, no "Dependencies" section
//       appears in the tooltip.
// ---------------------------------------------------------------------------

type WorkItemDependency = NonNullable<GanttTooltipWorkItemData['dependencies']>[0];

const BASE_WORK_ITEM_DATA: GanttTooltipWorkItemData = {
  kind: 'work-item',
  title: 'Foundation Work',
  status: 'in_progress',
  startDate: '2024-06-01',
  endDate: '2024-06-15',
  durationDays: 14,
  assignedUserName: null,
};

const DEFAULT_DEP_POSITION: GanttTooltipPosition = { x: 100, y: 200 };

function renderWorkItemWithDeps(
  dependencies: WorkItemDependency[] | undefined,
  position: Partial<GanttTooltipPosition> = {},
) {
  return render(
    <GanttTooltip
      data={{ ...BASE_WORK_ITEM_DATA, dependencies }}
      position={{ ...DEFAULT_DEP_POSITION, ...position }}
    />,
  );
}

describe('GanttTooltip — work item dependencies section (Issue #295)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  });

  // ── AC-6: no dependencies → no section ──────────────────────────────────

  it('AC-6: does not render Dependencies section when dependencies is undefined', () => {
    renderWorkItemWithDeps(undefined);
    expect(screen.queryByText(/Dependencies/i)).not.toBeInTheDocument();
  });

  it('AC-6: does not render Dependencies section when dependencies is an empty array', () => {
    renderWorkItemWithDeps([]);
    expect(screen.queryByText(/Dependencies/i)).not.toBeInTheDocument();
  });

  // ── AC-4: with dependencies → shows section ──────────────────────────────

  it('AC-4: renders a Dependencies section heading when work item has one dependency', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'Framing', dependencyType: 'finish_to_start', role: 'successor' },
    ]);
    expect(screen.getByText(/Dependencies/i)).toBeInTheDocument();
  });

  it('AC-4: renders the connected item title for a predecessor dependency', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'Site Prep', dependencyType: 'finish_to_start', role: 'predecessor' },
    ]);
    expect(screen.getByText('Site Prep')).toBeInTheDocument();
  });

  it('AC-4: renders the connected item title for a successor dependency', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'Framing', dependencyType: 'finish_to_start', role: 'successor' },
    ]);
    expect(screen.getByText('Framing')).toBeInTheDocument();
  });

  it('AC-4: renders a dependency type label "Finish-to-Start" for finish_to_start', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'Framing', dependencyType: 'finish_to_start', role: 'successor' },
    ]);
    expect(screen.getByText(/Finish.to.Start/i)).toBeInTheDocument();
  });

  it('AC-4: renders a dependency type label "Start-to-Start" for start_to_start', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'Electrical', dependencyType: 'start_to_start', role: 'successor' },
    ]);
    expect(screen.getByText(/Start.to.Start/i)).toBeInTheDocument();
  });

  it('AC-4: renders a dependency type label "Finish-to-Finish" for finish_to_finish', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'HVAC', dependencyType: 'finish_to_finish', role: 'successor' },
    ]);
    expect(screen.getByText(/Finish.to.Finish/i)).toBeInTheDocument();
  });

  it('AC-4: renders a dependency type label "Start-to-Finish" for start_to_finish', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'Inspection', dependencyType: 'start_to_finish', role: 'successor' },
    ]);
    expect(screen.getByText(/Start.to.Finish/i)).toBeInTheDocument();
  });

  it('AC-4: renders a role label distinguishing predecessor from successor', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'Site Prep', dependencyType: 'finish_to_start', role: 'predecessor' },
      { relatedTitle: 'Framing', dependencyType: 'finish_to_start', role: 'successor' },
    ]);
    // Both should be visible
    expect(screen.getByText('Site Prep')).toBeInTheDocument();
    expect(screen.getByText('Framing')).toBeInTheDocument();
  });

  it('AC-4: renders multiple dependencies when count <= 5', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'Item A', dependencyType: 'finish_to_start', role: 'predecessor' },
      { relatedTitle: 'Item B', dependencyType: 'finish_to_start', role: 'successor' },
      { relatedTitle: 'Item C', dependencyType: 'start_to_start', role: 'successor' },
    ]);
    expect(screen.getByText('Item A')).toBeInTheDocument();
    expect(screen.getByText('Item B')).toBeInTheDocument();
    expect(screen.getByText('Item C')).toBeInTheDocument();
    // No overflow indicator with only 3
    expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument();
  });

  it('AC-4: renders all 5 dependencies when exactly 5 are provided (no overflow)', () => {
    const fiveDeps: WorkItemDependency[] = [
      { relatedTitle: 'Item A', dependencyType: 'finish_to_start', role: 'predecessor' },
      { relatedTitle: 'Item B', dependencyType: 'finish_to_start', role: 'successor' },
      { relatedTitle: 'Item C', dependencyType: 'finish_to_start', role: 'successor' },
      { relatedTitle: 'Item D', dependencyType: 'finish_to_start', role: 'successor' },
      { relatedTitle: 'Item E', dependencyType: 'finish_to_start', role: 'successor' },
    ];
    renderWorkItemWithDeps(fiveDeps);
    for (const dep of fiveDeps) {
      expect(screen.getByText(dep.relatedTitle)).toBeInTheDocument();
    }
    // No overflow for exactly 5
    expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument();
  });

  // ── AC-5: overflow indicator ──────────────────────────────────────────────

  it('AC-5: shows "+1 more" overflow when 6 dependencies provided (shows first 5)', () => {
    const sixDeps: WorkItemDependency[] = [
      { relatedTitle: 'Item A', dependencyType: 'finish_to_start', role: 'predecessor' },
      { relatedTitle: 'Item B', dependencyType: 'finish_to_start', role: 'successor' },
      { relatedTitle: 'Item C', dependencyType: 'finish_to_start', role: 'successor' },
      { relatedTitle: 'Item D', dependencyType: 'finish_to_start', role: 'successor' },
      { relatedTitle: 'Item E', dependencyType: 'finish_to_start', role: 'successor' },
      { relatedTitle: 'Item F', dependencyType: 'finish_to_start', role: 'successor' },
    ];
    renderWorkItemWithDeps(sixDeps);
    // First 5 should be shown
    expect(screen.getByText('Item A')).toBeInTheDocument();
    expect(screen.getByText('Item E')).toBeInTheDocument();
    // Item F (6th) should NOT be shown as a list item
    expect(screen.queryByText('Item F')).not.toBeInTheDocument();
    // Overflow indicator shows +1
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('AC-5: shows "+N more" with correct count for 10 dependencies (shows first 5)', () => {
    const tenDeps: WorkItemDependency[] = Array.from({ length: 10 }, (_, i) => ({
      relatedTitle: `Item ${i + 1}`,
      dependencyType: 'finish_to_start' as const,
      role: (i < 5 ? 'predecessor' : 'successor') as 'predecessor' | 'successor',
    }));
    renderWorkItemWithDeps(tenDeps);
    // First 5 visible
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 5')).toBeInTheDocument();
    // Items 6-10 not shown individually
    expect(screen.queryByText('Item 6')).not.toBeInTheDocument();
    // Overflow indicator shows +5
    expect(screen.getByText('+5 more')).toBeInTheDocument();
  });

  it('AC-5: shows "+2 more" when exactly 7 dependencies are provided', () => {
    const sevenDeps: WorkItemDependency[] = Array.from({ length: 7 }, (_, i) => ({
      relatedTitle: `Dep ${i + 1}`,
      dependencyType: 'finish_to_start' as const,
      role: 'successor' as const,
    }));
    renderWorkItemWithDeps(sevenDeps);
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  // ── Overall tooltip still renders non-dependency fields ───────────────────

  it('dependencies section coexists with other work item fields (Start, End, Duration)', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'Framing', dependencyType: 'finish_to_start', role: 'successor' },
    ]);
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Framing')).toBeInTheDocument();
  });

  it('tooltip with dependencies still renders the work item title', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'Framing', dependencyType: 'finish_to_start', role: 'successor' },
    ]);
    expect(screen.getByText('Foundation Work')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// GanttTooltip — milestone kind with linked work items (existing coverage
// extended to verify dependencies section does NOT appear on milestone tooltips)
// ---------------------------------------------------------------------------

describe('GanttTooltip — milestone kind (no dependencies section)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  });

  const MILESTONE_DATA: GanttTooltipMilestoneData = {
    kind: 'milestone',
    title: 'Foundation Complete',
    targetDate: '2024-07-01',
    projectedDate: null,
    isCompleted: false,
    isLate: false,
    completedAt: null,
    linkedWorkItems: [],
  };

  it('does not render a "Dependencies" section label for milestone tooltips', () => {
    render(<GanttTooltip data={MILESTONE_DATA} position={{ x: 100, y: 200 }} />);
    expect(screen.queryByText(/^Dependencies$/i)).not.toBeInTheDocument();
  });

  it('milestone tooltip renders target date label', () => {
    render(<GanttTooltip data={MILESTONE_DATA} position={{ x: 100, y: 200 }} />);
    expect(screen.getByText('Target')).toBeInTheDocument();
  });

  it('milestone tooltip with linkedWorkItems shows "Blocked by this (N)" label', () => {
    const msWithItems: GanttTooltipMilestoneData = {
      ...MILESTONE_DATA,
      linkedWorkItems: [
        { id: 'wi-1', title: 'Site Prep' },
        { id: 'wi-2', title: 'Foundation Dig' },
      ],
    };
    render(<GanttTooltip data={msWithItems} position={{ x: 100, y: 200 }} />);
    expect(screen.getByText(/Blocked by this \(2\)/)).toBeInTheDocument();
  });

  it('milestone tooltip linked items overflow indicator shows "+N more" when > 5 linked items', () => {
    const msWithSixItems: GanttTooltipMilestoneData = {
      ...MILESTONE_DATA,
      linkedWorkItems: Array.from({ length: 6 }, (_, i) => ({
        id: `wi-${i}`,
        title: `Work Item ${i + 1}`,
      })),
    };
    render(<GanttTooltip data={msWithSixItems} position={{ x: 100, y: 200 }} />);
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('milestone tooltip with no linked items shows "Blocked / None" row', () => {
    render(<GanttTooltip data={MILESTONE_DATA} position={{ x: 100, y: 200 }} />);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// GanttTooltip — planned/actual duration and variance display (#333)
// ---------------------------------------------------------------------------

describe('GanttTooltip — planned/actual duration and variance (#333)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  });

  it('shows "Planned" and "Actual" rows when both plannedDurationDays and actualDurationDays are provided', () => {
    renderTooltip({ plannedDurationDays: 14, actualDurationDays: 14, durationDays: 14 });
    expect(screen.getByText('Planned')).toBeInTheDocument();
    expect(screen.getByText('Actual')).toBeInTheDocument();
  });

  it('shows "Variance" row when both plannedDurationDays and actualDurationDays are provided', () => {
    renderTooltip({ plannedDurationDays: 14, actualDurationDays: 16, durationDays: 14 });
    expect(screen.getByText('Variance')).toBeInTheDocument();
  });

  it('shows "On plan" variance when actual equals planned', () => {
    renderTooltip({ plannedDurationDays: 14, actualDurationDays: 14, durationDays: 14 });
    expect(screen.getByText('On plan')).toBeInTheDocument();
  });

  it('shows "+N days" variance when actual exceeds planned (over plan)', () => {
    renderTooltip({ plannedDurationDays: 10, actualDurationDays: 13, durationDays: 10 });
    expect(screen.getByText('+3 days')).toBeInTheDocument();
  });

  it('shows "-N days" variance when actual is less than planned (under plan)', () => {
    renderTooltip({ plannedDurationDays: 10, actualDurationDays: 7, durationDays: 10 });
    expect(screen.getByText('-3 days')).toBeInTheDocument();
  });

  it('uses singular "day" when variance is exactly 1', () => {
    renderTooltip({ plannedDurationDays: 10, actualDurationDays: 11, durationDays: 10 });
    expect(screen.getByText('+1 day')).toBeInTheDocument();
  });

  it('falls back to "Planned" row only when only plannedDurationDays is set', () => {
    renderTooltip({ plannedDurationDays: 10, actualDurationDays: undefined, durationDays: 10 });
    expect(screen.getByText('Planned')).toBeInTheDocument();
    expect(screen.queryByText('Actual')).not.toBeInTheDocument();
    expect(screen.queryByText('Variance')).not.toBeInTheDocument();
  });

  it('falls back to "Duration" row when neither plannedDurationDays nor actualDurationDays is set', () => {
    renderTooltip({
      plannedDurationDays: undefined,
      actualDurationDays: undefined,
      durationDays: 14,
    });
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.queryByText('Planned')).not.toBeInTheDocument();
    expect(screen.queryByText('Actual')).not.toBeInTheDocument();
  });

  it('does NOT show delay info for work items (delay removed in #330)', () => {
    // The delayDays field exists for type compatibility only — no UI shows it
    renderTooltip({
      durationDays: 14,
      plannedDurationDays: undefined,
      actualDurationDays: undefined,
    });
    expect(screen.queryByText(/Delay/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Late/i)).not.toBeInTheDocument();
  });
});
