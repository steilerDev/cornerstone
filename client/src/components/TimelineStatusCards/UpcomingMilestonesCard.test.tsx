/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils.js';
import type { TimelineMilestone } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

// Dynamic import — must happen after any jest.unstable_mockModule calls.
// UpcomingMilestonesCard has no context deps so no mocks are needed before the import.
let UpcomingMilestonesCard: React.ComponentType<{ milestones: TimelineMilestone[] }>;

const baseMilestone: TimelineMilestone = {
  id: 1,
  title: 'Foundation Complete',
  targetDate: '2026-06-15',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItemIds: [],
  projectedDate: null,
  isCritical: false,
};

describe('UpcomingMilestonesCard', () => {
  beforeEach(async () => {
    if (!UpcomingMilestonesCard) {
      const module = await import('./UpcomingMilestonesCard.js');
      UpcomingMilestonesCard = module.UpcomingMilestonesCard;
    }
  });

  // ── Test 1: Empty state when milestones array is empty ────────────────────

  it('shows empty state with data-testid="milestone-empty" when milestones array is empty', () => {
    renderWithRouter(<UpcomingMilestonesCard milestones={[]} />);

    const el = screen.getByTestId('milestone-empty');
    expect(el).toBeInTheDocument();
  });

  // ── Test 2: Empty state when all milestones are completed ─────────────────

  it('shows empty state when all milestones are completed', () => {
    const milestones: TimelineMilestone[] = [
      { ...baseMilestone, id: 1, isCompleted: true, completedAt: '2026-01-01T00:00:00.000Z' },
      { ...baseMilestone, id: 2, isCompleted: true, completedAt: '2026-02-01T00:00:00.000Z' },
    ];

    renderWithRouter(<UpcomingMilestonesCard milestones={milestones} />);

    const el = screen.getByTestId('milestone-empty');
    expect(el).toBeInTheDocument();
    expect(screen.queryByTestId('milestone-row')).toBeNull();
  });

  // ── Test 3: Renders one milestone-row per incomplete milestone ────────────

  it('renders one data-testid="milestone-row" per incomplete milestone', () => {
    const milestones: TimelineMilestone[] = [
      { ...baseMilestone, id: 1, title: 'Milestone A', targetDate: '2026-07-01' },
      { ...baseMilestone, id: 2, title: 'Milestone B', targetDate: '2026-08-01' },
      { ...baseMilestone, id: 3, title: 'Milestone C', targetDate: '2026-09-01' },
      { ...baseMilestone, id: 4, title: 'Completed', isCompleted: true, completedAt: '2026-01-01T00:00:00.000Z' },
    ];

    renderWithRouter(<UpcomingMilestonesCard milestones={milestones} />);

    const rows = screen.getAllByTestId('milestone-row');
    expect(rows).toHaveLength(3);
  });

  // ── Test 4: Shows max 5 milestones when more than 5 incomplete exist ──────

  it('shows at most 5 milestone-rows when more than 5 incomplete milestones exist', () => {
    const milestones: TimelineMilestone[] = [
      { ...baseMilestone, id: 1, title: 'M1', targetDate: '2026-06-01' },
      { ...baseMilestone, id: 2, title: 'M2', targetDate: '2026-06-02' },
      { ...baseMilestone, id: 3, title: 'M3', targetDate: '2026-06-03' },
      { ...baseMilestone, id: 4, title: 'M4', targetDate: '2026-06-04' },
      { ...baseMilestone, id: 5, title: 'M5', targetDate: '2026-06-05' },
      { ...baseMilestone, id: 6, title: 'M6', targetDate: '2026-06-06' },
      { ...baseMilestone, id: 7, title: 'M7', targetDate: '2026-06-07' },
    ];

    renderWithRouter(<UpcomingMilestonesCard milestones={milestones} />);

    const rows = screen.getAllByTestId('milestone-row');
    expect(rows).toHaveLength(5);
  });

  // ── Test 5: Sorts milestones by targetDate ascending ─────────────────────

  it('sorts milestone rows by targetDate ascending so the earliest date appears first', () => {
    const milestones: TimelineMilestone[] = [
      { ...baseMilestone, id: 1, title: 'Later Milestone', targetDate: '2026-12-01' },
      { ...baseMilestone, id: 2, title: 'Earlier Milestone', targetDate: '2026-06-01' },
      { ...baseMilestone, id: 3, title: 'Middle Milestone', targetDate: '2026-09-01' },
    ];

    renderWithRouter(<UpcomingMilestonesCard milestones={milestones} />);

    const rows = screen.getAllByTestId('milestone-row');
    expect(rows[0]).toHaveTextContent('Earlier Milestone');
    expect(rows[1]).toHaveTextContent('Middle Milestone');
    expect(rows[2]).toHaveTextContent('Later Milestone');
  });

  // ── Test 6: Displays milestone title text within the row ──────────────────

  it('displays the milestone title text within each row', () => {
    const milestones: TimelineMilestone[] = [
      { ...baseMilestone, id: 1, title: 'Foundation Complete', targetDate: '2026-06-15' },
    ];

    renderWithRouter(<UpcomingMilestonesCard milestones={milestones} />);

    expect(screen.getByText('Foundation Complete')).toBeInTheDocument();
  });

  // ── Test 7: Displays formatted target date within the row ─────────────────

  it('displays a formatted target date within each milestone row', () => {
    const milestones: TimelineMilestone[] = [
      { ...baseMilestone, id: 1, title: 'Roof Complete', targetDate: '2026-06-15' },
    ];

    renderWithRouter(<UpcomingMilestonesCard milestones={milestones} />);

    // formatDate('2026-06-15') → "Jun 15, 2026"
    expect(screen.getByText('Jun 15, 2026')).toBeInTheDocument();
  });

  // ── Test 8: Shows "On Track" badge when projectedDate is null ────────────

  it('shows "On Track" health badge when projectedDate is null (no projected date)', () => {
    const milestones: TimelineMilestone[] = [
      { ...baseMilestone, id: 1, projectedDate: null },
    ];

    renderWithRouter(<UpcomingMilestonesCard milestones={milestones} />);

    const healthBadge = screen.getByTestId('milestone-health');
    expect(healthBadge).toHaveTextContent('On Track');
  });

  // ── Test 9: Shows "On Track" badge when projectedDate <= targetDate ───────

  it('shows "On Track" health badge when projectedDate is on or before targetDate', () => {
    const milestones: TimelineMilestone[] = [
      {
        ...baseMilestone,
        id: 1,
        targetDate: '2026-06-15',
        projectedDate: '2026-06-10', // projected before target → on track
      },
    ];

    renderWithRouter(<UpcomingMilestonesCard milestones={milestones} />);

    const healthBadge = screen.getByTestId('milestone-health');
    expect(healthBadge).toHaveTextContent('On Track');
  });

  // ── Test 10: Shows "Delayed" badge when projectedDate > targetDate ────────

  it('shows "Delayed" health badge when projectedDate is after targetDate', () => {
    const milestones: TimelineMilestone[] = [
      {
        ...baseMilestone,
        id: 1,
        targetDate: '2026-06-15',
        projectedDate: '2026-07-01', // projected after target → delayed
      },
    ];

    renderWithRouter(<UpcomingMilestonesCard milestones={milestones} />);

    const healthBadge = screen.getByTestId('milestone-health');
    expect(healthBadge).toHaveTextContent('Delayed');
  });
});
