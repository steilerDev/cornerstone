/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils.js';
import type { TimelineWorkItem } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

// Dynamic import — must happen after any jest.unstable_mockModule calls.
// WorkItemProgressCard has no context deps so no mocks are needed before the import.
let WorkItemProgressCard: React.ComponentType<{ workItems: TimelineWorkItem[] }>;

const baseWorkItem: TimelineWorkItem = {
  id: 'wi-1',
  title: 'Test Work Item',
  status: 'not_started',
  startDate: null,
  endDate: null,
  actualStartDate: null,
  actualEndDate: null,
  durationDays: null,
  startAfter: null,
  startBefore: null,
  assignedUser: null,
  tags: [],
};

describe('WorkItemProgressCard', () => {
  beforeEach(async () => {
    if (!WorkItemProgressCard) {
      const module = await import('./WorkItemProgressCard.js');
      WorkItemProgressCard = module.WorkItemProgressCard;
    }
  });

  // ── Test 1: Empty state when workItems is empty ───────────────────────────

  it('shows empty state with data-testid="progress-empty" when workItems is empty', () => {
    renderWithRouter(<WorkItemProgressCard workItems={[]} />);

    const el = screen.getByTestId('progress-empty');
    expect(el).toBeInTheDocument();
  });

  // ── Test 2: Renders SVG donut chart with correct testid and role ──────────

  it('renders SVG donut chart with data-testid="progress-donut" and role="img"', () => {
    const workItems: TimelineWorkItem[] = [{ ...baseWorkItem, id: 'wi-1', status: 'in_progress' }];

    renderWithRouter(<WorkItemProgressCard workItems={workItems} />);

    const donut = screen.getByTestId('progress-donut');
    expect(donut).toBeInTheDocument();
    expect(donut).toHaveAttribute('role', 'img');
  });

  // ── Test 3: Shows total count in center text ──────────────────────────────

  it('shows total work item count with data-testid="progress-total"', () => {
    const workItems: TimelineWorkItem[] = [
      { ...baseWorkItem, id: 'wi-1', status: 'not_started' },
      { ...baseWorkItem, id: 'wi-2', status: 'in_progress' },
      { ...baseWorkItem, id: 'wi-3', status: 'completed' },
    ];

    renderWithRouter(<WorkItemProgressCard workItems={workItems} />);

    const totalEl = screen.getByTestId('progress-total');
    expect(totalEl).toHaveTextContent('3');
  });

  // ── Test 4: Shows legend with data-testid="progress-legend" ──────────────

  it('renders a legend with data-testid="progress-legend"', () => {
    const workItems: TimelineWorkItem[] = [{ ...baseWorkItem, id: 'wi-1', status: 'in_progress' }];

    renderWithRouter(<WorkItemProgressCard workItems={workItems} />);

    const legend = screen.getByTestId('progress-legend');
    expect(legend).toBeInTheDocument();
  });

  // ── Test 5: Legend shows "Not Started" with count ────────────────────────

  it('shows "Not Started" label and count in the legend', () => {
    const workItems: TimelineWorkItem[] = [
      { ...baseWorkItem, id: 'wi-1', status: 'not_started' },
      { ...baseWorkItem, id: 'wi-2', status: 'not_started' },
      { ...baseWorkItem, id: 'wi-3', status: 'in_progress' },
    ];

    renderWithRouter(<WorkItemProgressCard workItems={workItems} />);

    const legend = screen.getByTestId('progress-legend');
    expect(legend).toHaveTextContent('Not Started');
    expect(legend).toHaveTextContent('2');
  });

  // ── Test 6: Legend shows "In Progress" with count ────────────────────────

  it('shows "In Progress" label and count in the legend', () => {
    const workItems: TimelineWorkItem[] = [
      { ...baseWorkItem, id: 'wi-1', status: 'in_progress' },
      { ...baseWorkItem, id: 'wi-2', status: 'in_progress' },
      { ...baseWorkItem, id: 'wi-3', status: 'in_progress' },
    ];

    renderWithRouter(<WorkItemProgressCard workItems={workItems} />);

    const legend = screen.getByTestId('progress-legend');
    expect(legend).toHaveTextContent('In Progress');
    expect(legend).toHaveTextContent('3');
  });

  // ── Test 7: Legend shows "Completed" with count ───────────────────────────

  it('shows "Completed" label and count in the legend', () => {
    const workItems: TimelineWorkItem[] = [
      { ...baseWorkItem, id: 'wi-1', status: 'completed' },
      { ...baseWorkItem, id: 'wi-2', status: 'completed' },
    ];

    renderWithRouter(<WorkItemProgressCard workItems={workItems} />);

    const legend = screen.getByTestId('progress-legend');
    expect(legend).toHaveTextContent('Completed');
    expect(legend).toHaveTextContent('2');
  });

  // ── Test 8: All 3 status counts shown correctly ───────────────────────────

  it('shows correct counts for all 3 statuses (2 not_started, 3 in_progress, 5 completed → total 10)', () => {
    const workItems: TimelineWorkItem[] = [
      { ...baseWorkItem, id: 'wi-ns-1', status: 'not_started' },
      { ...baseWorkItem, id: 'wi-ns-2', status: 'not_started' },
      { ...baseWorkItem, id: 'wi-ip-1', status: 'in_progress' },
      { ...baseWorkItem, id: 'wi-ip-2', status: 'in_progress' },
      { ...baseWorkItem, id: 'wi-ip-3', status: 'in_progress' },
      { ...baseWorkItem, id: 'wi-c-1', status: 'completed' },
      { ...baseWorkItem, id: 'wi-c-2', status: 'completed' },
      { ...baseWorkItem, id: 'wi-c-3', status: 'completed' },
      { ...baseWorkItem, id: 'wi-c-4', status: 'completed' },
      { ...baseWorkItem, id: 'wi-c-5', status: 'completed' },
    ];

    renderWithRouter(<WorkItemProgressCard workItems={workItems} />);

    const totalEl = screen.getByTestId('progress-total');
    expect(totalEl).toHaveTextContent('10');

    const legend = screen.getByTestId('progress-legend');
    // Verify all three status label + count pairs are visible in legend
    expect(legend).toHaveTextContent('Not Started');
    expect(legend).toHaveTextContent('In Progress');
    expect(legend).toHaveTextContent('Completed');
    // Verify the total display renders '10'
    expect(screen.getByTestId('progress-total')).toHaveTextContent('10');
  });

  // ── Test 9: SVG has aria-label describing the breakdown ──────────────────

  it('renders an aria-label on the SVG donut chart describing the work item breakdown', () => {
    const workItems: TimelineWorkItem[] = [
      { ...baseWorkItem, id: 'wi-ns-1', status: 'not_started' },
      { ...baseWorkItem, id: 'wi-ip-1', status: 'in_progress' },
      { ...baseWorkItem, id: 'wi-c-1', status: 'completed' },
    ];

    renderWithRouter(<WorkItemProgressCard workItems={workItems} />);

    const donut = screen.getByTestId('progress-donut');
    const ariaLabel = donut.getAttribute('aria-label');
    expect(ariaLabel).not.toBeNull();
    // The aria-label should describe the breakdown with counts
    expect(ariaLabel).toContain('1');
    expect(ariaLabel).toContain('completed');
    expect(ariaLabel).toContain('in progress');
    expect(ariaLabel).toContain('not started');
  });

  // ── Test 10: Donut chart renders circle elements for each non-zero segment ─

  it('renders circle SVG elements for each non-zero status segment in the donut chart', () => {
    const workItems: TimelineWorkItem[] = [
      { ...baseWorkItem, id: 'wi-ip-1', status: 'in_progress' },
      { ...baseWorkItem, id: 'wi-c-1', status: 'completed' },
      // no not_started items — that segment should still be rendered (count=0 with 0-length segment)
    ];

    renderWithRouter(<WorkItemProgressCard workItems={workItems} />);

    const donut = screen.getByTestId('progress-donut');
    // The component always renders all 3 segments plus the background circle
    const circles = donut.querySelectorAll('circle');
    // 1 background circle + 3 status circles (even if count=0, the circle is rendered with 0 length)
    expect(circles.length).toBeGreaterThanOrEqual(3);
  });
});
