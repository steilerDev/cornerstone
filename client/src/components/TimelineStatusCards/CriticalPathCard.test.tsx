/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils.js';
import type { TimelineWorkItem } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

// ─── Mock: formatters — provides useFormatters() hook used by this component ──

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtDate = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return fallback;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatDateTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
      formatTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
      formatDateTime: (ts: string | null | undefined, fallback = '—') => ts ?? fallback,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// Dynamic import — must happen after jest.unstable_mockModule calls.
let CriticalPathCard: React.ComponentType<{
  criticalPath: string[];
  workItems: TimelineWorkItem[];
}>;

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
  assignedVendor: null,
  area: null,
};

// Fixed date for all time-sensitive tests: 2026-03-09 midnight local.
// The component parses endDate as new Date(year, month-1, day) — correct local date.
//
// Chosen endDate mappings (days from 2026-03-09):
//   '2020-01-01' → overdue (negative days)
//   '2026-04-30' → 52 days → On Track (>14)
//   '2026-03-19' → 10 days → Warning (7-14)
//   '2026-03-12' → 3 days  → Critical (<7)

describe('CriticalPathCard', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-09T00:00:00.000Z'));

    if (!CriticalPathCard) {
      const module = await import('./CriticalPathCard.js');
      CriticalPathCard = module.CriticalPathCard;
    }
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Test 1: Empty state when criticalPath is empty ────────────────────────

  it('shows empty state with data-testid="critical-empty" and "No critical path defined" when criticalPath is empty', () => {
    renderWithRouter(<CriticalPathCard criticalPath={[]} workItems={[]} />);

    const el = screen.getByTestId('critical-empty');
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent('No critical path defined');
  });

  // ── Test 2: Shows critical path item count ────────────────────────────────

  it('shows the count of critical path items with data-testid="critical-count"', () => {
    const workItems: TimelineWorkItem[] = [
      { ...baseWorkItem, id: 'wi-1', title: 'Critical 1', endDate: '2026-04-30' },
      { ...baseWorkItem, id: 'wi-2', title: 'Critical 2', endDate: '2026-04-30' },
      { ...baseWorkItem, id: 'wi-off', title: 'Not Critical', endDate: '2026-04-30' },
    ];

    renderWithRouter(<CriticalPathCard criticalPath={['wi-1', 'wi-2']} workItems={workItems} />);

    const countEl = screen.getByTestId('critical-count');
    expect(countEl).toHaveTextContent('2');
  });

  // ── Test 3: Shows next critical deadline date ─────────────────────────────

  it('shows the next critical deadline date with data-testid="critical-deadline"', () => {
    const workItems: TimelineWorkItem[] = [
      { ...baseWorkItem, id: 'wi-1', title: 'Critical Item', endDate: '2026-04-30' },
    ];

    renderWithRouter(<CriticalPathCard criticalPath={['wi-1']} workItems={workItems} />);

    const deadlineEl = screen.getByTestId('critical-deadline');
    expect(deadlineEl).toBeInTheDocument();
    // formatDate('2026-04-30') → "Apr 30, 2026"
    expect(deadlineEl).toHaveTextContent('Apr 30, 2026');
  });

  // ── Test 4: Shows days remaining ─────────────────────────────────────────

  it('shows the days remaining until the next critical deadline with data-testid="critical-days"', () => {
    const workItems: TimelineWorkItem[] = [
      // '2026-03-19' → March 19, 10 days from March 9
      { ...baseWorkItem, id: 'wi-1', title: 'Critical Item', endDate: '2026-03-19' },
    ];

    renderWithRouter(<CriticalPathCard criticalPath={['wi-1']} workItems={workItems} />);

    const daysEl = screen.getByTestId('critical-days');
    expect(daysEl).toBeInTheDocument();
    expect(daysEl).toHaveTextContent('10');
  });

  // ── Test 5: Green health badge when >14 days remaining ───────────────────

  it('shows "On Track" health badge when more than 14 days remain until the deadline', () => {
    const workItems: TimelineWorkItem[] = [
      // '2026-04-30' → April 30 → 52 days → green
      { ...baseWorkItem, id: 'wi-1', title: 'Critical Item', endDate: '2026-04-30' },
    ];

    renderWithRouter(<CriticalPathCard criticalPath={['wi-1']} workItems={workItems} />);

    const healthEl = screen.getByTestId('critical-health');
    expect(healthEl).toHaveTextContent('On Track');
  });

  // ── Test 6: Yellow health badge when 7-14 days remaining ─────────────────

  it('shows "Warning" health badge when 7 to 14 days remain until the deadline', () => {
    const workItems: TimelineWorkItem[] = [
      // '2026-03-19' → March 19 → 10 days → yellow
      { ...baseWorkItem, id: 'wi-1', title: 'Critical Item', endDate: '2026-03-19' },
    ];

    renderWithRouter(<CriticalPathCard criticalPath={['wi-1']} workItems={workItems} />);

    const healthEl = screen.getByTestId('critical-health');
    expect(healthEl).toHaveTextContent('Warning');
  });

  // ── Test 7: Red health badge when <7 days remaining ──────────────────────

  it('shows "Critical" health badge when fewer than 7 days remain until the deadline', () => {
    const workItems: TimelineWorkItem[] = [
      // '2026-03-12' → March 12 → 3 days → red
      { ...baseWorkItem, id: 'wi-1', title: 'Critical Item', endDate: '2026-03-12' },
    ];

    renderWithRouter(<CriticalPathCard criticalPath={['wi-1']} workItems={workItems} />);

    const healthEl = screen.getByTestId('critical-health');
    expect(healthEl).toHaveTextContent('Critical');
  });

  // ── Test 8: Red health badge when deadline is overdue (past date) ─────────

  it('shows "Overdue" health badge when the next critical deadline is in the past', () => {
    const workItems: TimelineWorkItem[] = [
      // '2020-01-01' → well in the past → overdue → red
      { ...baseWorkItem, id: 'wi-1', title: 'Critical Item', endDate: '2020-01-01' },
    ];

    renderWithRouter(<CriticalPathCard criticalPath={['wi-1']} workItems={workItems} />);

    const healthEl = screen.getByTestId('critical-health');
    expect(healthEl).toHaveTextContent('Overdue');
  });

  // ── Test 9: All critical path items completed → no next deadline ──────────

  it('shows "All critical items completed" empty state when all critical path items are completed', () => {
    const workItems: TimelineWorkItem[] = [
      {
        ...baseWorkItem,
        id: 'wi-1',
        title: 'Critical Done',
        status: 'completed',
        endDate: '2020-01-01',
      },
    ];

    renderWithRouter(<CriticalPathCard criticalPath={['wi-1']} workItems={workItems} />);

    const emptyEl = screen.getByTestId('critical-empty');
    expect(emptyEl).toBeInTheDocument();
    expect(emptyEl).toHaveTextContent('All critical items completed');
  });

  // ── Test 10: Correctly counts only work items in criticalPath array ────────

  it('counts only work items whose IDs appear in the criticalPath array', () => {
    const workItems: TimelineWorkItem[] = [
      { ...baseWorkItem, id: 'wi-critical-1', title: 'Critical A', endDate: '2026-04-30' },
      { ...baseWorkItem, id: 'wi-critical-2', title: 'Critical B', endDate: '2026-04-30' },
      { ...baseWorkItem, id: 'wi-not-critical', title: 'Not Critical', endDate: '2026-04-30' },
    ];

    renderWithRouter(
      <CriticalPathCard criticalPath={['wi-critical-1', 'wi-critical-2']} workItems={workItems} />,
    );

    // Only 2 items are on the critical path; the third must be excluded
    const countEl = screen.getByTestId('critical-count');
    expect(countEl).toHaveTextContent('2');
  });

  // ── Test 11: Next deadline is a link to /work-items/:id ──────────────────

  it('renders the next critical deadline as a link to /work-items/:id', () => {
    const workItems: TimelineWorkItem[] = [
      { ...baseWorkItem, id: 'wi-link', title: 'Critical Task', endDate: '2026-04-30' },
    ];

    renderWithRouter(<CriticalPathCard criticalPath={['wi-link']} workItems={workItems} />);

    const deadlineEl = screen.getByTestId('critical-deadline');
    const link = deadlineEl.querySelector('a');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute('href', '/work-items/wi-link');
  });
});
