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

/**
 * Returns a YYYY-MM-DD string for Monday of the current week + n days.
 * n=0 → Monday, n=1 → Tuesday, ..., n=6 → Sunday.
 */
function daysFromMonday(n: number): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...6=Sat
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysToMonday);
  monday.setDate(monday.getDate() + n);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
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
  startDate: daysFromMonday(1),
  endDate: daysFromMonday(4),
  actualStartDate: null,
  actualEndDate: null,
  durationDays: 3,
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
    expect(el).toHaveTextContent('No work items scheduled this week');
  });

  // ── Test 2: Empty state — items exist but outside the weekly window ──────────

  it('shows empty state when all work items have dates beyond the weekly window', () => {
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

  it('renders an SVG element when there is at least one work item within the weekly window', () => {
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
        {
          ...baseWorkItem,
          id: 'wi-001',
          title: 'Item 1',
          startDate: daysFromMonday(1),
          endDate: daysFromMonday(2),
        },
        {
          ...baseWorkItem,
          id: 'wi-002',
          title: 'Item 2',
          startDate: daysFromMonday(3),
          endDate: daysFromMonday(5),
        },
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

  it('renders a polygon element for a milestone whose targetDate is within the weekly window', () => {
    const timeline: TimelineResponse = {
      ...emptyTimeline,
      workItems: [{ ...baseWorkItem }],
      milestones: [
        {
          id: 1,
          title: 'Foundation Complete',
          targetDate: daysFromMonday(2),
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

  it('does not render a polygon when the only milestone is beyond the weekly window', () => {
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

  it('renders a clickable container with keyboard accessibility for /schedule navigation', () => {
    const timeline: TimelineResponse = {
      ...emptyTimeline,
      workItems: [{ ...baseWorkItem }],
    };

    renderWithRouter(<MiniGanttCard timeline={timeline} />);

    const button = screen.getByRole('button', { name: 'View full schedule' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('tabindex', '0');
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
          startDate: daysFromMonday(1),
          endDate: daysFromMonday(3),
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

  // ── Story #478: SVG accessibility — role="img" and aria-label ───────────────

  it('SVG has role="img" and aria-label containing work item count and "this week"', () => {
    const timeline: TimelineResponse = {
      ...emptyTimeline,
      workItems: [
        {
          ...baseWorkItem,
          id: 'wi-001',
          title: 'Item A',
          startDate: daysFromMonday(1),
          endDate: daysFromMonday(3),
        },
        {
          ...baseWorkItem,
          id: 'wi-002',
          title: 'Item B',
          startDate: daysFromMonday(3),
          endDate: daysFromMonday(5),
        },
      ],
      milestones: [
        {
          id: 1,
          title: 'Phase 1 Complete',
          targetDate: daysFromMonday(4),
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

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('role', 'img');

    const ariaLabel = svg?.getAttribute('aria-label') ?? '';
    expect(ariaLabel).toContain('2 work items');
    expect(ariaLabel).toContain('1 milestone');
    expect(ariaLabel).toContain('this week');
  });

  // ── Test 10: Grid line count — 8 grid lines + today marker (no dependency arrows) ──

  it('renders exactly 8 grid lines for day boundaries regardless of whether dependencies exist', () => {
    // Without dependencies
    const timelineNoDeps: TimelineResponse = {
      ...emptyTimeline,
      workItems: [
        {
          ...baseWorkItem,
          id: 'wi-pred',
          title: 'Predecessor',
          startDate: daysFromMonday(0),
          endDate: daysFromMonday(2),
        },
        {
          ...baseWorkItem,
          id: 'wi-succ',
          title: 'Successor',
          startDate: daysFromMonday(3),
          endDate: daysFromMonday(5),
        },
      ],
      dependencies: [],
    };

    // With dependencies between the two items
    const timelineWithDeps: TimelineResponse = {
      ...timelineNoDeps,
      dependencies: [
        {
          predecessorId: 'wi-pred',
          successorId: 'wi-succ',
          dependencyType: 'finish_to_start',
          leadLagDays: 0,
        },
      ],
    };

    // Render without dependencies
    const { container: containerNoDeps } = renderWithRouter(
      <MiniGanttCard timeline={timelineNoDeps} />,
    );
    const linesNoDeps = containerNoDeps.querySelectorAll('svg line');

    // Render with dependencies — dependency arrows were removed, so line count must be the same
    const { container: containerWithDeps } = renderWithRouter(
      <MiniGanttCard timeline={timelineWithDeps} />,
    );
    const linesWithDeps = containerWithDeps.querySelectorAll('svg line');

    // 8 grid lines + 1 today marker = 9 maximum; dependency arrows are NOT rendered
    expect(linesWithDeps.length).toBe(linesNoDeps.length);

    // The grid alone must produce at least 8 lines
    expect(linesNoDeps.length).toBeGreaterThanOrEqual(8);
  });
});
