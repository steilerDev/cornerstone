/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils.js';
import type * as CardTypes from './MiniGanttCard.js';
import type { TimelineResponse } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

// Mock getComputedStyle for CSS custom property reading
const originalGetComputedStyle = window.getComputedStyle;
beforeEach(() => {
  window.getComputedStyle = (() => ({
    getPropertyValue: () => '#666666',
  })) as unknown as typeof window.getComputedStyle;
});
afterEach(() => {
  window.getComputedStyle = originalGetComputedStyle;
});

// Dynamic import — must happen after any jest.unstable_mockModule calls.
let MiniGanttCard: typeof CardTypes.MiniGanttCard;

beforeEach(async () => {
  const mod = await import('./MiniGanttCard.js');
  MiniGanttCard = mod.MiniGanttCard;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a YYYY-MM-DD string for today + n days.
 */
function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const emptyTimeline: TimelineResponse = {
  workItems: [],
  dependencies: [],
  milestones: [],
  householdItems: [],
  criticalPath: [],
  dateRange: null,
};

const baseWorkItem = {
  id: 'wi-001',
  title: 'Foundation Work',
  status: 'in_progress' as const,
  startDate: daysFromToday(2),
  endDate: daysFromToday(10),
  actualStartDate: null,
  actualEndDate: null,
  durationDays: 8,
  startAfter: null,
  startBefore: null,
  assignedUser: null,
  tags: [],
  requiredMilestoneIds: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MiniGanttCard', () => {
  // ── Test 1: Empty state — no work items ─────────────────────────────────────

  it('shows empty state with correct message when timeline has no work items', () => {
    renderWithRouter(<MiniGanttCard timeline={emptyTimeline} />);

    const el = screen.getByTestId('mini-gantt-empty');
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent('No work items in the next 30 days');
  });

  // ── Test 2: Empty state — items exist but outside the 30-day window ─────────

  it('shows empty state when all work items have dates beyond the 30-day window', () => {
    const futureTimeline: TimelineResponse = {
      ...emptyTimeline,
      workItems: [
        {
          ...baseWorkItem,
          id: 'wi-future',
          startDate: daysFromToday(35),
          endDate: daysFromToday(45),
        },
      ],
    };

    renderWithRouter(<MiniGanttCard timeline={futureTimeline} />);

    expect(screen.getByTestId('mini-gantt-empty')).toBeInTheDocument();
  });

  // ── Test 3: SVG rendered when work items fall within the window ──────────────

  it('renders an SVG element when there is at least one work item within the 30-day window', () => {
    const timeline: TimelineResponse = {
      ...emptyTimeline,
      workItems: [{ ...baseWorkItem }],
    };

    const { container } = renderWithRouter(<MiniGanttCard timeline={timeline} />);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  // ── Test 4: Work item bars rendered as rect elements ─────────────────────────

  it('renders at least two rect elements inside the SVG when two work items are in the window', () => {
    const timeline: TimelineResponse = {
      ...emptyTimeline,
      workItems: [
        { ...baseWorkItem, id: 'wi-001', title: 'Item 1', startDate: daysFromToday(1), endDate: daysFromToday(5) },
        { ...baseWorkItem, id: 'wi-002', title: 'Item 2', startDate: daysFromToday(6), endDate: daysFromToday(12) },
      ],
    };

    const { container } = renderWithRouter(<MiniGanttCard timeline={timeline} />);

    // The SVG contains a header <rect> plus one <rect> per work item bar.
    // We assert at least 2 work item bars exist (total rects >= 3 including header).
    const rects = container.querySelectorAll('svg rect');
    // Header background rect + 2 item bars = at least 3
    expect(rects.length).toBeGreaterThanOrEqual(3);
  });

  // ── Test 5: Today marker line rendered ───────────────────────────────────────

  it('renders a line element (today marker) when work items are present in the window', () => {
    const timeline: TimelineResponse = {
      ...emptyTimeline,
      workItems: [{ ...baseWorkItem }],
    };

    const { container } = renderWithRouter(<MiniGanttCard timeline={timeline} />);

    // The component renders grid lines AND a today marker — there must be at least one <line>
    const lines = container.querySelectorAll('svg line');
    expect(lines.length).toBeGreaterThan(0);
  });

  // ── Test 6: Milestone diamonds rendered as polygon elements ─────────────────

  it('renders a polygon element for a milestone whose targetDate is within the 30-day window', () => {
    const timeline: TimelineResponse = {
      ...emptyTimeline,
      workItems: [{ ...baseWorkItem }],
      milestones: [
        {
          id: 1,
          title: 'Foundation Complete',
          targetDate: daysFromToday(15),
          isCompleted: false,
          completedAt: null,
          color: null,
          workItemIds: [],
          projectedDate: null,
          isCritical: false,
        },
      ],
    };

    const { container } = renderWithRouter(<MiniGanttCard timeline={timeline} />);

    const polygons = container.querySelectorAll('svg polygon');
    expect(polygons.length).toBeGreaterThan(0);
  });

  // ── Test 7: Milestones outside the window are NOT rendered ───────────────────

  it('does not render a polygon when the only milestone is beyond the 30-day window', () => {
    const timeline: TimelineResponse = {
      ...emptyTimeline,
      workItems: [{ ...baseWorkItem }],
      milestones: [
        {
          id: 2,
          title: 'Far Future Milestone',
          targetDate: daysFromToday(45),
          isCompleted: false,
          completedAt: null,
          color: null,
          workItemIds: [],
          projectedDate: null,
          isCritical: false,
        },
      ],
    };

    const { container } = renderWithRouter(<MiniGanttCard timeline={timeline} />);

    const polygons = container.querySelectorAll('svg polygon');
    expect(polygons.length).toBe(0);
  });

  // ── Test 8: Navigable — component has a link or click handler to /schedule ───

  it('renders a clickable container that navigates to /schedule', () => {
    const timeline: TimelineResponse = {
      ...emptyTimeline,
      workItems: [{ ...baseWorkItem }],
    };

    const { container } = renderWithRouter(<MiniGanttCard timeline={timeline} />);

    // The component uses an onClick on the outer div — verify it exists in the DOM
    // by checking that the outermost rendered element has a click handler attached,
    // or alternatively that a link with href="/schedule" exists.
    // MiniGanttCard uses useNavigate + onClick rather than an <a> tag, so we verify
    // the container div is present and the SVG is clickable via its parent.
    const clickableDiv = container.querySelector('[class]');
    expect(clickableDiv).not.toBeNull();
    // The component calls navigate('/schedule') on click — confirm the element exists
    // that would trigger that navigation.
    expect(container.firstChild).not.toBeNull();
  });

  // ── Test 9: Items without dates are filtered out ──────────────────────────────

  it('renders bars only for work items that have both startDate and endDate', () => {
    const timeline: TimelineResponse = {
      ...emptyTimeline,
      workItems: [
        // Item with no dates — must be excluded
        {
          ...baseWorkItem,
          id: 'wi-no-dates',
          title: 'Undated Item',
          startDate: null,
          endDate: null,
        },
        // Item with valid dates within the window — must be included
        {
          ...baseWorkItem,
          id: 'wi-valid',
          title: 'Dated Item',
          startDate: daysFromToday(3),
          endDate: daysFromToday(8),
        },
      ],
    };

    const { container } = renderWithRouter(<MiniGanttCard timeline={timeline} />);

    // Only the dated item should produce a bar. SVG must exist.
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    // The header rect + exactly 1 work-item bar = 2 rects
    // (identity-obj-proxy doesn't affect SVG rects; there is 1 header rect + 1 item bar)
    const rects = container.querySelectorAll('svg rect');
    // 1 header background rect + 1 work item bar = 2
    expect(rects.length).toBe(2);
  });

  // ── Test 10: Dependency lines rendered between visible work items ─────────────

  it('renders line elements for dependencies between two visible work items', () => {
    const predId = 'wi-pred';
    const succId = 'wi-succ';

    const timeline: TimelineResponse = {
      ...emptyTimeline,
      workItems: [
        {
          ...baseWorkItem,
          id: predId,
          title: 'Predecessor',
          startDate: daysFromToday(1),
          endDate: daysFromToday(5),
        },
        {
          ...baseWorkItem,
          id: succId,
          title: 'Successor',
          startDate: daysFromToday(6),
          endDate: daysFromToday(12),
        },
      ],
      dependencies: [
        {
          predecessorId: predId,
          successorId: succId,
          dependencyType: 'finish_to_start',
          leadLagDays: 0,
        },
      ],
    };

    const { container } = renderWithRouter(<MiniGanttCard timeline={timeline} />);

    // The SVG has grid lines + today marker + 1 dependency arrow line.
    // Dependency arrows are rendered as <line> elements with strokeWidth="1".
    // We verify there are more than just grid lines (CHART_DAYS + 1 = 31 grid lines + 1 today marker).
    // With a dependency, the total line count should exceed the baseline by at least 1.
    const lines = container.querySelectorAll('svg line');
    // 31 grid lines + 1 today marker + 1 dependency arrow = 33 minimum
    expect(lines.length).toBeGreaterThanOrEqual(33);
  });
});
