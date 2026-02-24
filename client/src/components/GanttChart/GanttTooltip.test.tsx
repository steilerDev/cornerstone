/**
 * @jest-environment jsdom
 *
 * Unit tests for GanttTooltip — tooltip rendering, positioning, and portal output.
 * Tests all status variants, date formatting, duration display, and overflow-flip logic.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { GanttTooltip } from './GanttTooltip.js';
import type { GanttTooltipWorkItemData, GanttTooltipPosition } from './GanttTooltip.js';
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
      { status: 'blocked', expectedLabel: 'Blocked' },
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
      // Viewport height = 800. If y + 130 + 8 > 800 - 8, flip.
      // y=700: 700 + 8 = 708, 708 + 130 = 838 > 792 → flip
      renderTooltip({}, { x: 100, y: 700 });
      const tooltip = screen.getByTestId('gantt-tooltip');
      // When flipped: top = 700 - 130 - 8 = 562
      expect(tooltip).toHaveStyle({ top: '562px' });
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
      // Both should be flipped
      expect(tooltip).toHaveStyle({ left: '948px' });
      expect(tooltip).toHaveStyle({ top: '562px' });
    });
  });
});
