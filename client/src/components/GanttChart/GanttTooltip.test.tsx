/**
 * @jest-environment jsdom
 *
 * Unit tests for GanttTooltip — tooltip rendering, positioning, and portal output.
 * Tests all status variants, date formatting, duration display, overflow-flip logic,
 * and ArrowTooltipContent (Issue #287: arrow hover highlighting).
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import type { ReactElement } from 'react';
import { GanttTooltip } from './GanttTooltip.js';
import type {
  GanttTooltipWorkItemData,
  GanttTooltipArrowData,
  GanttTooltipMilestoneData,
  GanttTooltipHouseholdItemData,
  GanttTooltipPosition,
} from './GanttTooltip.js';
import type { WorkItemStatus } from '@cornerstone/shared';
import { LocaleProvider } from '../../contexts/LocaleContext.js';

/**
 * Custom render function that wraps the component tree with LocaleProvider —
 * GanttTooltip's sub-components use useFormatters() (via useLocale()), which
 * throws outside a LocaleProvider. See DateRangePicker.test.tsx for the
 * reference pattern. Works regardless of whether `ui` already includes a
 * MemoryRouter, since LocaleProvider simply wraps whatever is passed in.
 */
function render(ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) {
  return rtlRender(<LocaleProvider>{ui}</LocaleProvider>, options);
}

// Reset the locale preference after every test in this file so a `de` locale
// set by one test (see the "de-DE locale" describe block below) never bleeds
// into subsequent tests via jsdom's persistent localStorage.
afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_DATA: GanttTooltipWorkItemData = {
  kind: 'work-item',
  title: 'Foundation Work',
  status: 'in_progress',
  startDate: '2024-06-01',
  endDate: '2024-06-15',
  plannedStartDate: null,
  plannedEndDate: null,
  scheduleSignal: null,
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
    <MemoryRouter>
      <GanttTooltip
        data={{ ...DEFAULT_DATA, ...data }}
        position={{ ...DEFAULT_POSITION, ...position }}
        id={id}
      />
    </MemoryRouter>,
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
      { status: 'completed', expectedLabel: 'Done' },
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

  describe('household item status uses the canonical purchase words (#2195)', () => {
    const base: GanttTooltipHouseholdItemData = {
      kind: 'household-item',
      name: 'Sample Cabinets',
      status: 'planned',
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      targetDeliveryDate: null,
      actualDeliveryDate: null,
      isLate: false,
    };

    it.each([
      ['planned', 'Planned'],
      ['purchased', 'Ordered'],
      ['scheduled', 'Delivery scheduled'],
      ['arrived', 'Delivered'],
    ] as const)('%s reads %s, never the raw status value', (status, word) => {
      render(<GanttTooltip data={{ ...base, status }} position={DEFAULT_POSITION} />);
      expect(screen.getByText(word)).toBeInTheDocument();
      if (status === 'scheduled') expect(screen.queryByText('scheduled')).not.toBeInTheDocument();
    });
  });

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
      // Viewport height = 800. A plain work item tooltip is estimated at 165px (OFFSET_Y = 8).
      // y=700: tooltipY = 700 + 8 = 708, 708 + 165 = 873 > 792 → flip
      renderTooltip({}, { x: 100, y: 700 });
      const tooltip = screen.getByTestId('gantt-tooltip');
      // When flipped: top = 700 - 165 - 8 = 527
      expect(tooltip).toHaveStyle({ top: '527px' });
    });

    it('a plain work item tooltip still fits below the cursor at y=605', () => {
      // y=605: 613 + 165 = 778 <= 792 → stays below the cursor
      renderTooltip({}, { x: 100, y: 605 });
      expect(screen.getByTestId('gantt-tooltip')).toHaveStyle({ top: '613px' });
    });

    it('flips with the taller estimate when a Company row is present', () => {
      // y=605: 613 + 183 = 796 > 792 → flip: top = 605 - 183 - 8 = 414
      renderTooltip({ assignedVendorName: 'Sample Tiling Ltd' }, { x: 100, y: 605 });
      expect(screen.getByTestId('gantt-tooltip')).toHaveStyle({ top: '414px' });
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
      // - vertical:   700 - 165 - 8 = 527 (work item base height estimate = 165)
      expect(tooltip).toHaveStyle({ left: '948px' });
      expect(tooltip).toHaveStyle({ top: '527px' });
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
    <MemoryRouter>
      <GanttTooltip
        data={{ ...DEFAULT_ARROW_DATA, ...data }}
        position={{ ...ARROW_DEFAULT_POSITION, ...position }}
        id={id}
      />
    </MemoryRouter>,
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
  plannedStartDate: null,
  plannedEndDate: null,
  scheduleSignal: null,
  durationDays: 14,
  assignedUserName: null,
};

const DEFAULT_DEP_POSITION: GanttTooltipPosition = { x: 100, y: 200 };

function renderWorkItemWithDeps(
  dependencies: WorkItemDependency[] | undefined,
  position: Partial<GanttTooltipPosition> = {},
) {
  return render(
    <MemoryRouter>
      <GanttTooltip
        data={{ ...BASE_WORK_ITEM_DATA, dependencies }}
        position={{ ...DEFAULT_DEP_POSITION, ...position }}
      />
    </MemoryRouter>,
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

  it('the word "Dependencies" never appears; the groups are named Waits for / Holds up (#2198)', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'Site Prep', dependencyType: 'finish_to_start', role: 'predecessor' },
      { relatedTitle: 'Framing', dependencyType: 'finish_to_start', role: 'successor' },
    ]);
    expect(screen.queryByText(/Dependencies/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('gantt-tooltip-waits-for')).toHaveTextContent('Waits for (1)');
    expect(screen.getByTestId('gantt-tooltip-holds-up')).toHaveTextContent('Holds up (1)');
  });

  it('groups: two predecessors and one successor give Waits for (2) before Holds up (1)', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'Pred One', dependencyType: 'finish_to_start', role: 'predecessor' },
      { relatedTitle: 'Succ One', dependencyType: 'finish_to_start', role: 'successor' },
      { relatedTitle: 'Pred Two', dependencyType: 'finish_to_start', role: 'predecessor' },
    ]);
    const waits = screen.getByTestId('gantt-tooltip-waits-for');
    const holds = screen.getByTestId('gantt-tooltip-holds-up');
    expect(waits).toHaveTextContent('Waits for (2)');
    expect(holds).toHaveTextContent('Holds up (1)');
    // Mutation caught: swapping `role` in either filter puts the titles in the wrong group.
    expect(within(waits).getByText(/Pred One/)).toBeInTheDocument();
    expect(within(waits).getByText(/Pred Two/)).toBeInTheDocument();
    expect(within(waits).queryByText(/Succ One/)).not.toBeInTheDocument();
    expect(within(holds).getByText(/Succ One/)).toBeInTheDocument();
    expect(within(holds).queryByText(/Pred/)).not.toBeInTheDocument();
    // Mutation caught: rendering Holds up before Waits for.
    expect(waits.compareDocumentPosition(holds) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('groups: only successors render no Waits for section', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'Succ One', dependencyType: 'finish_to_start', role: 'successor' },
    ]);
    expect(screen.queryByTestId('gantt-tooltip-waits-for')).not.toBeInTheDocument();
    expect(screen.queryByText(/Waits for/)).not.toBeInTheDocument();
    expect(screen.getByTestId('gantt-tooltip-holds-up')).toBeInTheDocument();
  });

  it('groups: only predecessors render no Holds up section', () => {
    renderWorkItemWithDeps([
      { relatedTitle: 'Pred One', dependencyType: 'finish_to_start', role: 'predecessor' },
    ]);
    expect(screen.queryByTestId('gantt-tooltip-holds-up')).not.toBeInTheDocument();
    expect(screen.queryByText(/Holds up/)).not.toBeInTheDocument();
  });

  it('groups: 7 predecessors show 5 plus "+2 more" inside Waits for only', () => {
    const deps: WorkItemDependency[] = Array.from({ length: 7 }, (_, i) => ({
      relatedTitle: `Pred ${i + 1}`,
      dependencyType: 'finish_to_start' as const,
      role: 'predecessor' as const,
    }));
    deps.push({ relatedTitle: 'Succ 1', dependencyType: 'finish_to_start', role: 'successor' });
    renderWorkItemWithDeps(deps);
    const waits = screen.getByTestId('gantt-tooltip-waits-for');
    expect(waits).toHaveTextContent('Waits for (7)');
    expect(within(waits).getByText(/Pred 5/)).toBeInTheDocument();
    expect(within(waits).queryByText(/Pred 6/)).not.toBeInTheDocument();
    expect(within(waits).getByText('+2 more')).toBeInTheDocument();
    expect(within(screen.getByTestId('gantt-tooltip-holds-up')).queryByText(/more/)).toBeNull();
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

  it('AC-5: the limit of 5 applies per group, so 5 + 5 shows everything without overflow', () => {
    const deps: WorkItemDependency[] = Array.from({ length: 10 }, (_, i) => ({
      relatedTitle: `Both ${i + 1}`,
      dependencyType: 'finish_to_start' as const,
      role: (i < 5 ? 'predecessor' : 'successor') as 'predecessor' | 'successor',
    }));
    renderWorkItemWithDeps(deps);
    expect(screen.getByText(/Both 10/)).toBeInTheDocument();
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

  it('AC-5: shows "+1 more" overflow when a group has 6 entries (shows first 5)', () => {
    const sixDeps: WorkItemDependency[] = [
      { relatedTitle: 'Item A', dependencyType: 'finish_to_start', role: 'predecessor' },
      { relatedTitle: 'Item B', dependencyType: 'finish_to_start', role: 'predecessor' },
      { relatedTitle: 'Item C', dependencyType: 'finish_to_start', role: 'predecessor' },
      { relatedTitle: 'Item D', dependencyType: 'finish_to_start', role: 'predecessor' },
      { relatedTitle: 'Item E', dependencyType: 'finish_to_start', role: 'predecessor' },
      { relatedTitle: 'Item F', dependencyType: 'finish_to_start', role: 'predecessor' },
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

  it('AC-5: shows "+N more" with correct count for a group of 10 (shows first 5)', () => {
    const tenDeps: WorkItemDependency[] = Array.from({ length: 10 }, (_, i) => ({
      relatedTitle: `Item ${i + 1}`,
      dependencyType: 'finish_to_start' as const,
      role: 'predecessor' as const,
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
    dependentWorkItems: [],
  };

  it.each([
    ['upcoming', {}, 'Upcoming'],
    ['reached', { isCompleted: true, completedAt: '2024-07-01T10:00:00.000Z' }, 'Reached'],
    ['late', { projectedDate: '2024-07-06', isLate: true }, 'Late · 5 d'],
    ['early', { projectedDate: '2024-06-28' }, 'Early · 3 d'],
  ] as const)(
    'milestone tooltip status badge reads the canonical word for %s (%s)',
    (_state, overrides, word) => {
      render(
        <GanttTooltip data={{ ...MILESTONE_DATA, ...overrides }} position={{ x: 100, y: 200 }} />,
      );
      expect(screen.getByText(word)).toBeInTheDocument();
      expect(screen.queryByText(/^(Completed|Pending|On Track|Ahead)$/)).not.toBeInTheDocument();
    },
  );

  it('does not render a "Dependencies" section label for milestone tooltips', () => {
    render(<GanttTooltip data={MILESTONE_DATA} position={{ x: 100, y: 200 }} />);
    expect(screen.queryByText(/^Dependencies$/i)).not.toBeInTheDocument();
  });

  it('milestone tooltip renders target date label', () => {
    render(<GanttTooltip data={MILESTONE_DATA} position={{ x: 100, y: 200 }} />);
    expect(screen.getByText('Target')).toBeInTheDocument();
  });

  it('milestone tooltip with dependentWorkItems shows "Holds up (N)" label', () => {
    const msWithDependents: GanttTooltipMilestoneData = {
      ...MILESTONE_DATA,
      dependentWorkItems: [
        { id: 'wi-1', title: 'Framing' },
        { id: 'wi-2', title: 'Electrical Rough-in' },
      ],
    };
    render(<GanttTooltip data={msWithDependents} position={{ x: 100, y: 200 }} />);
    expect(screen.getByText(/Holds up \(2\)/)).toBeInTheDocument();
  });

  it('milestone tooltip with linkedWorkItems shows "Contributing (N)" label', () => {
    const msWithLinked: GanttTooltipMilestoneData = {
      ...MILESTONE_DATA,
      linkedWorkItems: [
        { id: 'wi-1', title: 'Site Prep' },
        { id: 'wi-2', title: 'Foundation Dig' },
      ],
    };
    render(<GanttTooltip data={msWithLinked} position={{ x: 100, y: 200 }} />);
    expect(screen.getByText(/Contributing \(2\)/)).toBeInTheDocument();
  });

  it('milestone tooltip shows both Contributing and Holds up sections when both lists are populated', () => {
    const msWithBoth: GanttTooltipMilestoneData = {
      ...MILESTONE_DATA,
      linkedWorkItems: [{ id: 'wi-1', title: 'Site Prep' }],
      dependentWorkItems: [{ id: 'wi-2', title: 'Framing' }],
    };
    render(<GanttTooltip data={msWithBoth} position={{ x: 100, y: 200 }} />);
    expect(screen.getByText(/Contributing \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Holds up \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('Site Prep')).toBeInTheDocument();
    expect(screen.getByText('Framing')).toBeInTheDocument();
  });

  it('milestone tooltip dependent items overflow indicator shows "+N more" when > 5 dependent items', () => {
    const msWithSixDependents: GanttTooltipMilestoneData = {
      ...MILESTONE_DATA,
      dependentWorkItems: Array.from({ length: 6 }, (_, i) => ({
        id: `wi-${i}`,
        title: `Work Item ${i + 1}`,
      })),
    };
    render(<GanttTooltip data={msWithSixDependents} position={{ x: 100, y: 200 }} />);
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('milestone tooltip linked items overflow indicator shows "+N more" when > 5 contributing items', () => {
    const msWithSixLinked: GanttTooltipMilestoneData = {
      ...MILESTONE_DATA,
      linkedWorkItems: Array.from({ length: 6 }, (_, i) => ({
        id: `wi-${i}`,
        title: `Work Item ${i + 1}`,
      })),
    };
    render(<GanttTooltip data={msWithSixLinked} position={{ x: 100, y: 200 }} />);
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('milestone tooltip with both lists empty shows a single "No linked items" row (None label)', () => {
    render(<GanttTooltip data={MILESTONE_DATA} position={{ x: 100, y: 200 }} />);
    // When both lists are empty, hasBothEmpty = true — shows single "Linked / None" row
    expect(screen.getByText('Linked Items')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('milestone tooltip with only contributing items shows "None" for the Holds up section', () => {
    const msWithLinkedOnly: GanttTooltipMilestoneData = {
      ...MILESTONE_DATA,
      linkedWorkItems: [{ id: 'wi-1', title: 'Site Prep' }],
    };
    render(<GanttTooltip data={msWithLinkedOnly} position={{ x: 100, y: 200 }} />);
    expect(screen.getByText(/Contributing \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('Holds up')).toBeInTheDocument();
    expect(screen.queryByText(/Blocked by this/)).not.toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('milestone tooltip with only dependent items shows "None" for Contributing section', () => {
    const msWithDependentsOnly: GanttTooltipMilestoneData = {
      ...MILESTONE_DATA,
      dependentWorkItems: [{ id: 'wi-1', title: 'Framing' }],
    };
    render(<GanttTooltip data={msWithDependentsOnly} position={{ x: 100, y: 200 }} />);
    expect(screen.getByText('Contributing')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.getByText(/Holds up \(1\)/)).toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// GanttTooltip — double separator fix (#342)
//
// The bug: when hasBothDurations=true AND assignedUserName=null AND
// dependencies.length > 0, two consecutive separators appeared (one from
// the variance block, one from the deps block).
// Fix: separator between variance section and owner only emitted when
// hasBothDurations && hasOwner. The deps block always emits its own leading
// separator.
// ---------------------------------------------------------------------------

describe('GanttTooltip — double separator fix (#342)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  });

  function renderSeparatorTest(data: Partial<GanttTooltipWorkItemData>) {
    const base: GanttTooltipWorkItemData = {
      kind: 'work-item',
      title: 'Test Item',
      status: 'in_progress',
      startDate: '2024-06-01',
      endDate: '2024-06-15',
      plannedStartDate: null,
      plannedEndDate: null,
      scheduleSignal: null,
      durationDays: 14,
      assignedUserName: null,
    };
    render(
      <MemoryRouter>
        <GanttTooltip data={{ ...base, ...data }} position={{ x: 100, y: 200 }} />
      </MemoryRouter>,
    );
  }

  // The original bug scenario: hasBothDurations + !hasOwner + deps → double separator
  it('renders exactly one separator between variance section and dependencies (no owner)', () => {
    renderSeparatorTest({
      plannedDurationDays: 10,
      actualDurationDays: 14,
      assignedUserName: null,
      dependencies: [
        { relatedTitle: 'Site Prep', dependencyType: 'finish_to_start', role: 'predecessor' },
      ],
    });
    // aria-hidden separators count — verify only expected separators exist
    const separators = document.querySelectorAll('[aria-hidden="true"]');
    // Expected separators:
    //   1. After header (always present)
    //   2. Before planned/actual section (always present when hasBothDurations)
    //   3. Before dependencies (always present when deps.length > 0)
    // No extra separator should appear between variance and deps when no owner
    expect(separators.length).toBe(3);
  });

  it('renders correct separator structure when hasBothDurations AND hasOwner AND deps present', () => {
    renderSeparatorTest({
      plannedDurationDays: 10,
      actualDurationDays: 14,
      assignedUserName: 'Jane Doe',
      dependencies: [
        { relatedTitle: 'Site Prep', dependencyType: 'finish_to_start', role: 'predecessor' },
      ],
    });
    // Expected separators:
    //   1. After header
    //   2. Before planned/actual section
    //   3. Between variance and owner (hasBothDurations && hasOwner)
    //   4. Before dependencies
    const separators = document.querySelectorAll('[aria-hidden="true"]');
    expect(separators.length).toBe(4);
  });

  it('renders correct separator count when hasBothDurations AND !hasOwner AND no deps', () => {
    renderSeparatorTest({
      plannedDurationDays: 10,
      actualDurationDays: 14,
      assignedUserName: null,
      dependencies: [],
    });
    // Expected separators:
    //   1. After header
    //   2. Before planned/actual section
    // No separator between variance and (absent) owner, no deps separator
    const separators = document.querySelectorAll('[aria-hidden="true"]');
    expect(separators.length).toBe(2);
  });

  it('renders correct separator count when !hasBothDurations AND hasOwner AND deps present', () => {
    renderSeparatorTest({
      plannedDurationDays: undefined,
      actualDurationDays: undefined,
      durationDays: 14,
      assignedUserName: 'John Smith',
      dependencies: [
        { relatedTitle: 'Foundation', dependencyType: 'finish_to_start', role: 'predecessor' },
      ],
    });
    // Expected separators:
    //   1. After header
    //   2. Before dependencies
    const separators = document.querySelectorAll('[aria-hidden="true"]');
    expect(separators.length).toBe(2);
  });

  it('renders correctly when no owner, no deps, no variance (minimal data)', () => {
    renderSeparatorTest({
      plannedDurationDays: undefined,
      actualDurationDays: undefined,
      durationDays: 7,
      assignedUserName: null,
      dependencies: [],
    });
    // Only 1 separator: after header
    const separators = document.querySelectorAll('[aria-hidden="true"]');
    expect(separators.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GanttTooltip — touch device navigation affordance (#342)
//
// On pointer: coarse (touch) devices, when isTouchDevice=true and
// workItemId/milestoneId is provided, a "View item" link/button is shown.
// ---------------------------------------------------------------------------

describe('GanttTooltip — touch device navigation affordance (#342)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
  });

  const WORK_ITEM_DATA: GanttTooltipWorkItemData = {
    kind: 'work-item',
    title: 'Foundation Work',
    status: 'in_progress',
    startDate: '2024-06-01',
    endDate: '2024-06-15',
    plannedStartDate: null,
    plannedEndDate: null,
    scheduleSignal: null,
    durationDays: 14,
    assignedUserName: null,
    workItemId: 'wi-abc-123',
  };

  const MILESTONE_DATA: GanttTooltipMilestoneData = {
    kind: 'milestone',
    title: 'Foundation Complete',
    targetDate: '2024-07-01',
    projectedDate: null,
    isCompleted: false,
    isLate: false,
    completedAt: null,
    linkedWorkItems: [],
    dependentWorkItems: [],
    milestoneId: 42,
  };

  it('does not render "View item" link when isTouchDevice is false (default desktop)', () => {
    render(
      <MemoryRouter>
        <GanttTooltip data={WORK_ITEM_DATA} position={{ x: 100, y: 200 }} isTouchDevice={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('View item')).not.toBeInTheDocument();
  });

  it('does not render "View item" link when isTouchDevice is undefined', () => {
    render(
      <MemoryRouter>
        <GanttTooltip data={WORK_ITEM_DATA} position={{ x: 100, y: 200 }} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('View item')).not.toBeInTheDocument();
  });

  it('renders "View item" link on work item tooltip when isTouchDevice is true and workItemId provided', () => {
    render(
      <MemoryRouter>
        <GanttTooltip data={WORK_ITEM_DATA} position={{ x: 100, y: 200 }} isTouchDevice={true} />
      </MemoryRouter>,
    );
    expect(screen.getByText('View item')).toBeInTheDocument();
  });

  it('"View item" link points to /project/work-items/:workItemId', () => {
    render(
      <MemoryRouter>
        <GanttTooltip data={WORK_ITEM_DATA} position={{ x: 100, y: 200 }} isTouchDevice={true} />
      </MemoryRouter>,
    );
    const link = screen.getByText('View item');
    expect(link).toHaveAttribute('href', '/project/work-items/wi-abc-123');
  });

  it('"View item" link has aria-label describing the work item title', () => {
    render(
      <MemoryRouter>
        <GanttTooltip data={WORK_ITEM_DATA} position={{ x: 100, y: 200 }} isTouchDevice={true} />
      </MemoryRouter>,
    );
    const link = screen.getByText('View item');
    expect(link).toHaveAttribute('aria-label', `View item ${WORK_ITEM_DATA.title}`);
  });

  it('does not render "View item" when isTouchDevice is true but workItemId is absent', () => {
    const dataWithoutId: GanttTooltipWorkItemData = { ...WORK_ITEM_DATA, workItemId: undefined };
    render(
      <MemoryRouter>
        <GanttTooltip data={dataWithoutId} position={{ x: 100, y: 200 }} isTouchDevice={true} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('View item')).not.toBeInTheDocument();
  });

  it('renders "View item" button on milestone tooltip when isTouchDevice is true and milestoneId provided', () => {
    const mockNavigate = jest.fn<(id: number) => void>();
    render(
      <MemoryRouter>
        <GanttTooltip
          data={MILESTONE_DATA}
          position={{ x: 100, y: 200 }}
          isTouchDevice={true}
          onMilestoneNavigate={mockNavigate}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('View item')).toBeInTheDocument();
  });

  it('"View item" button calls onMilestoneNavigate with milestoneId on click', async () => {
    const user = userEvent.setup();
    const mockNavigate = jest.fn<(id: number) => void>();
    render(
      <MemoryRouter>
        <GanttTooltip
          data={MILESTONE_DATA}
          position={{ x: 100, y: 200 }}
          isTouchDevice={true}
          onMilestoneNavigate={mockNavigate}
        />
      </MemoryRouter>,
    );
    const btn = screen.getByText('View item');
    await user.click(btn);
    expect(mockNavigate).toHaveBeenCalledWith(42);
  });

  it('does not render "View item" button when isTouchDevice is false on milestone', () => {
    render(
      <MemoryRouter>
        <GanttTooltip data={MILESTONE_DATA} position={{ x: 100, y: 200 }} isTouchDevice={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('View item')).not.toBeInTheDocument();
  });

  it('does not render "View item" button when milestoneId is absent', () => {
    const dataWithoutId: GanttTooltipMilestoneData = { ...MILESTONE_DATA, milestoneId: undefined };
    const mockNavigate = jest.fn<(id: number) => void>();
    render(
      <MemoryRouter>
        <GanttTooltip
          data={dataWithoutId}
          position={{ x: 100, y: 200 }}
          isTouchDevice={true}
          onMilestoneNavigate={mockNavigate}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText('View item')).not.toBeInTheDocument();
  });

  it('does not render "View item" button when onMilestoneNavigate is absent', () => {
    render(
      <MemoryRouter>
        <GanttTooltip data={MILESTONE_DATA} position={{ x: 100, y: 200 }} isTouchDevice={true} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('View item')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// GanttTooltip — de-DE locale (Issue #1813)
// ---------------------------------------------------------------------------

describe('GanttTooltip — de-DE locale', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
    localStorage.setItem('locale', 'de');
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 800 });
    localStorage.clear();
  });

  it('work item tooltip renders German-formatted start/end dates (May diverges: "Mai")', () => {
    render(
      <MemoryRouter>
        <GanttTooltip
          data={{ ...DEFAULT_DATA, startDate: '2026-05-01', endDate: '2026-05-15' }}
          position={DEFAULT_POSITION}
        />
      </MemoryRouter>,
    );
    const maiMatches = screen.getAllByText(/Mai/);
    expect(maiMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/\bMay\b/)).not.toBeInTheDocument();
  });

  it('milestone tooltip renders German-formatted target date consistently with work item tooltip', () => {
    const milestoneData: GanttTooltipMilestoneData = {
      kind: 'milestone',
      title: 'Foundation Complete',
      targetDate: '2026-05-01',
      projectedDate: null,
      isCompleted: false,
      isLate: false,
      completedAt: null,
      linkedWorkItems: [],
      dependentWorkItems: [],
    };
    render(<GanttTooltip data={milestoneData} position={{ x: 100, y: 200 }} />);
    expect(screen.getAllByText(/Mai/).length).toBeGreaterThanOrEqual(1);
  });

  it('household item tooltip renders German-formatted delivery dates consistently', () => {
    const hiData: GanttTooltipHouseholdItemData = {
      kind: 'household-item',
      name: 'Kitchen Cabinets',
      status: 'scheduled',
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      targetDeliveryDate: '2026-05-01',
      actualDeliveryDate: null,
      isLate: false,
    };
    render(<GanttTooltip data={hiData} position={{ x: 100, y: 200 }} />);
    expect(screen.getAllByText(/Mai/).length).toBeGreaterThanOrEqual(1);
  });

  it('does not throw or render undefined/NaN for a work item tooltip under de-DE locale', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <GanttTooltip data={DEFAULT_DATA} position={DEFAULT_POSITION} />
        </MemoryRouter>,
      ),
    ).not.toThrow();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// GanttTooltip — Company row, purchase chip/area, milestone chips (#2198)
// ---------------------------------------------------------------------------

describe('GanttTooltip — Company and Owner rows (#2198)', () => {
  it('shows a Company row with the vendor name and no Owner row when only a vendor is assigned', () => {
    renderTooltip({ assignedUserName: null, assignedVendorName: 'Sample Tiling Ltd' });
    const company = screen.getByTestId('gantt-tooltip-company');
    expect(company).toHaveTextContent('Company');
    expect(company).toHaveTextContent('Sample Tiling Ltd');
    expect(screen.queryByText('Owner')).not.toBeInTheDocument();
  });

  it('shows Owner without a Company row when only a user is assigned', () => {
    renderTooltip({ assignedUserName: 'Alex Example', assignedVendorName: null });
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Alex Example')).toBeInTheDocument();
    expect(screen.queryByTestId('gantt-tooltip-company')).not.toBeInTheDocument();
    expect(screen.queryByText('Company')).not.toBeInTheDocument();
  });

  it('shows both rows when a user and a vendor are assigned', () => {
    renderTooltip({ assignedUserName: 'Alex Example', assignedVendorName: 'Sample Tiling Ltd' });
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByTestId('gantt-tooltip-company')).toHaveTextContent('Sample Tiling Ltd');
  });

  it('shows neither row when nobody is assigned', () => {
    renderTooltip({ assignedUserName: null, assignedVendorName: null });
    expect(screen.queryByText('Owner')).not.toBeInTheDocument();
    expect(screen.queryByText('Company')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gantt-tooltip-company')).not.toBeInTheDocument();
  });

  it('shows the Area row for a task only when areaName is set', () => {
    renderTooltip({ areaName: 'Test House › Test Kitchen' });
    expect(screen.getByTestId('gantt-tooltip-area')).toHaveTextContent('Test House › Test Kitchen');
  });

  it('shows no Area row for a task without areaName', () => {
    renderTooltip({ areaName: null });
    expect(screen.queryByTestId('gantt-tooltip-area')).not.toBeInTheDocument();
  });

  it('uses the Badge task class for the status chip', () => {
    renderTooltip({ status: 'in_progress' });
    expect(screen.getByText('In progress').className).toContain('inProgress');
  });
});

describe('GanttTooltip — purchase header and rows (#2198)', () => {
  const PURCHASE: GanttTooltipHouseholdItemData = {
    kind: 'household-item',
    name: 'Sample Cabinets',
    status: 'planned',
    earliestDeliveryDate: null,
    latestDeliveryDate: null,
    targetDeliveryDate: '2026-03-10',
    actualDeliveryDate: null,
    isLate: false,
  };

  it.each([
    ['planned', 'Planned', 'planned'],
    ['purchased', 'Ordered', 'purchased'],
    ['scheduled', 'Delivery scheduled', 'scheduled'],
    ['arrived', 'Delivered', 'arrived'],
  ] as const)(
    'the header chip for %s shows "%s" with the Badge purchase class %s',
    (status, word, badgeClass) => {
      render(<GanttTooltip data={{ ...PURCHASE, status }} position={DEFAULT_POSITION} />);
      const chip = screen.getByText(word);
      expect(chip.className).toContain(badgeClass);
      expect(chip).not.toHaveAttribute('style');
    },
  );

  it('has no separate Status row', () => {
    render(<GanttTooltip data={PURCHASE} position={DEFAULT_POSITION} />);
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
  });

  it('shows the Area row only when areaName is given', () => {
    const { unmount } = render(
      <GanttTooltip
        data={{ ...PURCHASE, areaName: 'Test House › Test Kitchen' }}
        position={DEFAULT_POSITION}
      />,
    );
    const area = screen.getByTestId('gantt-tooltip-area');
    expect(area).toHaveTextContent('Area');
    expect(area).toHaveTextContent('Test House › Test Kitchen');
    unmount();

    render(<GanttTooltip data={{ ...PURCHASE, areaName: null }} position={DEFAULT_POSITION} />);
    expect(screen.queryByTestId('gantt-tooltip-area')).not.toBeInTheDocument();
  });

  it('shows the delivery dates, floored-to-today note and capped linked items', () => {
    render(
      <GanttTooltip
        data={{
          ...PURCHASE,
          earliestDeliveryDate: '2026-03-08',
          latestDeliveryDate: '2026-03-14',
          actualDeliveryDate: '2026-03-11',
          isLate: true,
          linkedItems: Array.from({ length: 6 }, (_, i) => ({
            id: `wi-${i}`,
            title: `Linked ${i + 1}`,
            type: 'work_item' as const,
          })),
        }}
        position={DEFAULT_POSITION}
      />,
    );
    expect(screen.getByText('Earliest')).toBeInTheDocument();
    expect(screen.getByText('Target')).toBeInTheDocument();
    expect(screen.getByText('Latest')).toBeInTheDocument();
    expect(screen.getByText('Actual')).toBeInTheDocument();
    expect(screen.getByText('Linked 5')).toBeInTheDocument();
    expect(screen.queryByText('Linked 6')).not.toBeInTheDocument();
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('shows a View item button on touch devices that navigates through the callback', async () => {
    const onHiNavigate = jest.fn();
    render(
      <GanttTooltip
        data={{ ...PURCHASE, householdItemId: 'hi-1' }}
        position={DEFAULT_POSITION}
        isTouchDevice
        onHiNavigate={onHiNavigate}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'View item' }));
    expect(onHiNavigate).toHaveBeenCalledWith('hi-1');
  });
});

describe('GanttTooltip — milestone chip and labels (#2198)', () => {
  const MS: GanttTooltipMilestoneData = {
    kind: 'milestone',
    title: 'Foundation Complete',
    targetDate: '2024-07-01',
    projectedDate: null,
    isCompleted: false,
    isLate: false,
    completedAt: null,
    linkedWorkItems: [],
    dependentWorkItems: [],
  };

  it.each([
    ['upcoming', {}, 'Upcoming', 'milestoneUpcoming'],
    [
      'reached',
      { isCompleted: true, completedAt: '2024-07-01T10:00:00.000Z' },
      'Reached',
      'milestoneReached',
    ],
    ['late', { projectedDate: '2024-07-06', isLate: true }, 'Late · 5 d', 'milestoneLate'],
    ['early', { projectedDate: '2024-06-28' }, 'Early · 3 d', 'milestoneEarly'],
  ] as const)('the %s chip carries the Badge class %s', (_s, overrides, word, badgeClass) => {
    render(<GanttTooltip data={{ ...MS, ...overrides }} position={DEFAULT_POSITION} />);
    expect(screen.getByText(word).className).toContain(badgeClass);
  });

  it('names the successor list "Holds up" with the new aria-label, via t()', () => {
    render(
      <GanttTooltip
        data={{
          ...MS,
          dependentWorkItems: Array.from({ length: 7 }, (_, i) => ({
            id: `wi-${i}`,
            title: `Task ${i + 1}`,
          })),
        }}
        position={DEFAULT_POSITION}
      />,
    );
    expect(screen.getByText(/Holds up \(7\)/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Tasks this milestone holds up' })).toBeInTheDocument();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('shows a View item button on touch devices that calls onMilestoneNavigate', async () => {
    const onMilestoneNavigate = jest.fn();
    render(
      <GanttTooltip
        data={{ ...MS, milestoneId: 7 }}
        position={DEFAULT_POSITION}
        isTouchDevice
        onMilestoneNavigate={onMilestoneNavigate}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /View item/ }));
    expect(onMilestoneNavigate).toHaveBeenCalledWith(7);
  });
});

describe('GanttTooltip — de-DE group labels (#2198)', () => {
  beforeEach(() => {
    localStorage.setItem('locale', 'de');
  });

  it('names the task groups "Wartet auf" and "Hält auf" and shows "Firma"', () => {
    renderTooltip({
      assignedVendorName: 'Sample Tiling Ltd',
      dependencies: [
        { relatedTitle: 'Pred One', dependencyType: 'finish_to_start', role: 'predecessor' },
        { relatedTitle: 'Succ One', dependencyType: 'finish_to_start', role: 'successor' },
      ],
    });
    expect(screen.getByTestId('gantt-tooltip-waits-for')).toHaveTextContent('Wartet auf (1)');
    expect(screen.getByTestId('gantt-tooltip-holds-up')).toHaveTextContent('Hält auf (1)');
    expect(screen.getByTestId('gantt-tooltip-company')).toHaveTextContent('Firma');
  });
});

describe('GanttTooltip — schedule signal and planned row (#2199)', () => {
  it('shows the Late chip with the day count', () => {
    renderTooltip({ scheduleSignal: { signal: 'late', days: 5 } });
    expect(screen.getByTestId('gantt-tooltip-schedule-signal')).toHaveTextContent('Late · 5 d');
  });

  it('shows the Held up chip', () => {
    renderTooltip({ scheduleSignal: { signal: 'held_up' } });
    expect(screen.getByTestId('gantt-tooltip-schedule-signal')).toHaveTextContent('Held up');
  });

  it('shows no chip when the item is on time', () => {
    renderTooltip({ scheduleSignal: null });
    expect(screen.queryByTestId('gantt-tooltip-schedule-signal')).not.toBeInTheDocument();
  });

  it('shows the planned dates as a range when they differ from the shown dates', () => {
    renderTooltip({
      startDate: '2024-06-05',
      endDate: '2024-06-19',
      plannedStartDate: '2024-06-01',
      plannedEndDate: '2024-06-15',
    });
    const row = screen.getByTestId('gantt-tooltip-planned');
    expect(row).toHaveTextContent('Planned');
    expect(row).toHaveTextContent(/1.*15/);
  });

  it('shows the row when only the end differs (in progress, late)', () => {
    renderTooltip({
      startDate: '2024-06-01',
      endDate: '2024-06-19',
      plannedStartDate: '2024-06-01',
      plannedEndDate: '2024-06-15',
    });
    expect(screen.getByTestId('gantt-tooltip-planned')).toBeInTheDocument();
  });

  it('omits the row when the planned dates equal the shown dates (on time)', () => {
    renderTooltip({
      startDate: '2024-06-01',
      endDate: '2024-06-15',
      plannedStartDate: '2024-06-01',
      plannedEndDate: '2024-06-15',
    });
    expect(screen.queryByTestId('gantt-tooltip-planned')).not.toBeInTheDocument();
  });

  it('shows a single planned date when only the end is set and the shown dates differ', () => {
    renderTooltip({
      startDate: '2024-06-05',
      endDate: '2024-06-19',
      plannedStartDate: null,
      plannedEndDate: '2024-06-15',
    });
    expect(screen.getByTestId('gantt-tooltip-planned')).toBeInTheDocument();
  });

  it('shows a single planned date when only the start is set and the shown dates differ', () => {
    renderTooltip({
      startDate: '2024-06-05',
      endDate: '2024-06-19',
      plannedStartDate: '2024-06-01',
      plannedEndDate: null,
    });
    expect(screen.getByTestId('gantt-tooltip-planned')).toBeInTheDocument();
  });

  it('omits the Planned row when both planned dates are null (undated task)', () => {
    renderTooltip({ plannedStartDate: null, plannedEndDate: null });
    expect(screen.queryByTestId('gantt-tooltip-planned')).not.toBeInTheDocument();
  });

  it('uses the German labels', () => {
    localStorage.setItem('locale', 'de');
    renderTooltip({
      startDate: '2024-06-05',
      endDate: '2024-06-19',
      plannedStartDate: '2024-06-01',
      plannedEndDate: '2024-06-15',
      scheduleSignal: { signal: 'late', days: 3 },
    });
    expect(screen.getByTestId('gantt-tooltip-schedule-signal')).toHaveTextContent(
      'Verspätet · 3 T',
    );
    expect(screen.getByTestId('gantt-tooltip-planned')).toHaveTextContent('Geplant');
  });
});

// ---------------------------------------------------------------------------
// Origin (#2202): the touch "View item" link carries the schedule URL
// ---------------------------------------------------------------------------

describe('GanttTooltip — origin on the "View item" link (#2202)', () => {
  const DATA: GanttTooltipWorkItemData = {
    kind: 'work-item',
    title: 'Foundation Work',
    status: 'in_progress',
    startDate: '2024-06-01',
    endDate: '2024-06-15',
    plannedStartDate: null,
    plannedEndDate: null,
    scheduleSignal: null,
    durationDays: 14,
    assignedUserName: null,
    workItemId: 'wi-origin',
  };

  it('opens the task with the Gantt URL (incl. query) as origin, no name', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/schedule/gantt?filter=tasks']}>
        <GanttTooltip data={DATA} position={{ x: 100, y: 200 }} isTouchDevice={true} />
        <OriginProbe />
      </MemoryRouter>,
    );

    await user.click(screen.getByText('View item'));

    expect(probedPath()).toBe('/project/work-items/wi-origin');
    expect(probedOrigin()).toEqual({ to: '/schedule/gantt?filter=tasks' });
  });
});
