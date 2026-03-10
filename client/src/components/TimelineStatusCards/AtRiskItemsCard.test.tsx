/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils.js';
import type { TimelineWorkItem } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

// Dynamic import — must happen after any jest.unstable_mockModule calls.
// AtRiskItemsCard has no context deps so no mocks are needed before the import.
let AtRiskItemsCard: React.ComponentType<{ workItems: TimelineWorkItem[] }>;

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

// Use clearly past/future dates to avoid flaky tests:
// Past date: '2020-01-01' — well before any possible test execution date
// Future date: '2099-12-31' — well after any possible test execution date

describe('AtRiskItemsCard', () => {
  beforeEach(async () => {
    if (!AtRiskItemsCard) {
      const module = await import('./AtRiskItemsCard.js');
      AtRiskItemsCard = module.AtRiskItemsCard;
    }
  });

  // ── Test 1: Empty state when workItems is empty ───────────────────────────

  it('shows empty state with data-testid="risk-empty" and "All items on track" when workItems is empty', () => {
    renderWithRouter(<AtRiskItemsCard workItems={[]} />);

    const el = screen.getByTestId('risk-empty');
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent('All items on track');
  });

  // ── Test 2: Empty state when no items are at risk ─────────────────────────

  it('shows empty state when no items are at risk (all have future dates or are completed)', () => {
    const workItems: TimelineWorkItem[] = [
      {
        ...baseWorkItem,
        id: 'wi-1',
        status: 'in_progress',
        endDate: '2099-12-31', // far future — not overdue
      },
      {
        ...baseWorkItem,
        id: 'wi-2',
        status: 'not_started',
        startDate: '2099-12-31', // far future — not late start
      },
      {
        ...baseWorkItem,
        id: 'wi-3',
        status: 'completed',
        endDate: '2020-01-01', // past, but completed → not at risk
      },
    ];

    renderWithRouter(<AtRiskItemsCard workItems={workItems} />);

    const el = screen.getByTestId('risk-empty');
    expect(el).toBeInTheDocument();
    expect(screen.queryByTestId('risk-row')).toBeNull();
  });

  // ── Test 3: Shows overdue in_progress items (endDate in past) ────────────

  it('shows a risk-row for in_progress items with an endDate in the past', () => {
    const workItems: TimelineWorkItem[] = [
      {
        ...baseWorkItem,
        id: 'wi-overdue',
        title: 'Overdue Task',
        status: 'in_progress',
        endDate: '2020-01-01', // clearly in the past
      },
    ];

    renderWithRouter(<AtRiskItemsCard workItems={workItems} />);

    const rows = screen.getAllByTestId('risk-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Overdue Task');
  });

  // ── Test 4: Shows late start not_started items (startDate in past) ────────

  it('shows a risk-row for not_started items with a startDate in the past', () => {
    const workItems: TimelineWorkItem[] = [
      {
        ...baseWorkItem,
        id: 'wi-late',
        title: 'Late Start Task',
        status: 'not_started',
        startDate: '2020-01-01', // clearly in the past
      },
    ];

    renderWithRouter(<AtRiskItemsCard workItems={workItems} />);

    const rows = screen.getAllByTestId('risk-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Late Start Task');
  });

  // ── Test 5: Does NOT show completed items even if endDate is past ─────────

  it('does not show risk-row for completed items even when endDate is in the past', () => {
    const workItems: TimelineWorkItem[] = [
      {
        ...baseWorkItem,
        id: 'wi-completed',
        title: 'Completed Task',
        status: 'completed',
        endDate: '2020-01-01', // past, but completed → never at risk
      },
    ];

    renderWithRouter(<AtRiskItemsCard workItems={workItems} />);

    // Should show empty state since the completed item is not at risk
    expect(screen.getByTestId('risk-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('risk-row')).toBeNull();
  });

  // ── Test 6: Shows "Overdue" reason badge for overdue items ───────────────

  it('shows "Overdue" text in the data-testid="risk-reason" badge for overdue in_progress items', () => {
    const workItems: TimelineWorkItem[] = [
      {
        ...baseWorkItem,
        id: 'wi-overdue',
        title: 'Overdue Task',
        status: 'in_progress',
        endDate: '2020-01-01',
      },
    ];

    renderWithRouter(<AtRiskItemsCard workItems={workItems} />);

    const reasonBadge = screen.getByTestId('risk-reason');
    expect(reasonBadge).toHaveTextContent('Overdue');
  });

  // ── Test 7: Shows "Late Start" reason badge for late start items ──────────

  it('shows "Late Start" text in the data-testid="risk-reason" badge for not_started items with past startDate', () => {
    const workItems: TimelineWorkItem[] = [
      {
        ...baseWorkItem,
        id: 'wi-late',
        title: 'Late Start Task',
        status: 'not_started',
        startDate: '2020-01-01',
      },
    ];

    renderWithRouter(<AtRiskItemsCard workItems={workItems} />);

    const reasonBadge = screen.getByTestId('risk-reason');
    expect(reasonBadge).toHaveTextContent('Late Start');
  });

  // ── Test 8: Shows max 5 items when more than 5 at-risk exist ─────────────

  it('shows at most 5 risk-rows when more than 5 at-risk items exist', () => {
    const workItems: TimelineWorkItem[] = [
      { ...baseWorkItem, id: 'wi-1', title: 'Overdue 1', status: 'in_progress', endDate: '2020-01-01' },
      { ...baseWorkItem, id: 'wi-2', title: 'Overdue 2', status: 'in_progress', endDate: '2020-01-02' },
      { ...baseWorkItem, id: 'wi-3', title: 'Overdue 3', status: 'in_progress', endDate: '2020-01-03' },
      { ...baseWorkItem, id: 'wi-4', title: 'Overdue 4', status: 'in_progress', endDate: '2020-01-04' },
      { ...baseWorkItem, id: 'wi-5', title: 'Overdue 5', status: 'in_progress', endDate: '2020-01-05' },
      { ...baseWorkItem, id: 'wi-6', title: 'Overdue 6', status: 'in_progress', endDate: '2020-01-06' },
      { ...baseWorkItem, id: 'wi-7', title: 'Overdue 7', status: 'in_progress', endDate: '2020-01-07' },
    ];

    renderWithRouter(<AtRiskItemsCard workItems={workItems} />);

    const rows = screen.getAllByTestId('risk-row');
    expect(rows).toHaveLength(5);
  });

  // ── Test 9: Work item title is rendered as a link ─────────────────────────

  it('renders the work item title as a link within the risk-row', () => {
    const workItems: TimelineWorkItem[] = [
      {
        ...baseWorkItem,
        id: 'wi-overdue',
        title: 'Overdue Task Link',
        status: 'in_progress',
        endDate: '2020-01-01',
      },
    ];

    renderWithRouter(<AtRiskItemsCard workItems={workItems} />);

    const link = screen.getByRole('link', { name: 'Overdue Task Link' });
    expect(link).toBeInTheDocument();
  });

  // ── Test 10: Items are sorted — most overdue first (earliest date first) ──

  it('sorts at-risk items with the most overdue (earliest date) appearing first', () => {
    const workItems: TimelineWorkItem[] = [
      {
        ...baseWorkItem,
        id: 'wi-newer',
        title: 'Less Overdue',
        status: 'in_progress',
        endDate: '2020-06-01', // overdue but more recent
      },
      {
        ...baseWorkItem,
        id: 'wi-oldest',
        title: 'Most Overdue',
        status: 'in_progress',
        endDate: '2020-01-01', // oldest overdue date → should appear first
      },
      {
        ...baseWorkItem,
        id: 'wi-middle',
        title: 'Middle Overdue',
        status: 'in_progress',
        endDate: '2020-03-15',
      },
    ];

    renderWithRouter(<AtRiskItemsCard workItems={workItems} />);

    const rows = screen.getAllByTestId('risk-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Most Overdue');
    expect(rows[1]).toHaveTextContent('Middle Overdue');
    expect(rows[2]).toHaveTextContent('Less Overdue');
  });
});
