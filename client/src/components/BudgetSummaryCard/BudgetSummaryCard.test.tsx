/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils.js';
import type { BudgetOverview } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

// Dynamic import — must happen after any jest.unstable_mockModule calls.
// BudgetSummaryCard has no context deps so no mocks are needed before the import.
let BudgetSummaryCard: React.ComponentType<{ overview: BudgetOverview }>;

const baseOverview: BudgetOverview = {
  availableFunds: 100000,
  sourceCount: 1,
  minPlanned: 80000,
  maxPlanned: 90000,
  actualCost: 50000,
  actualCostPaid: 40000,
  actualCostClaimed: 10000,
  remainingVsMinPlanned: 20000,
  remainingVsMaxPlanned: 10000,
  remainingVsActualCost: 50000,
  remainingVsActualPaid: 60000,
  remainingVsActualClaimed: 90000,
  remainingVsMinPlannedWithPayback: 20000,
  remainingVsMaxPlannedWithPayback: 10000,
  categorySummaries: [],
  subsidySummary: {
    totalReductions: 0,
    activeSubsidyCount: 0,
    minTotalPayback: 0,
    maxTotalPayback: 0,
  },
};

describe('BudgetSummaryCard', () => {
  beforeEach(async () => {
    if (!BudgetSummaryCard) {
      const module = await import('./BudgetSummaryCard.js');
      BudgetSummaryCard = module.BudgetSummaryCard;
    }
  });

  // ── Test 1: Available Funds ───────────────────────────────────────────────

  it('renders available funds formatted as EUR currency', () => {
    renderWithRouter(<BudgetSummaryCard overview={{ ...baseOverview, availableFunds: 100000 }} />);

    const el = screen.getByTestId('available-funds');
    expect(el).toHaveTextContent('€100,000.00');
  });

  // ── Test 2: Planned Cost Range ────────────────────────────────────────────

  it('renders planned cost range showing min and max values', () => {
    renderWithRouter(
      <BudgetSummaryCard overview={{ ...baseOverview, minPlanned: 80000, maxPlanned: 90000 }} />,
    );

    const el = screen.getByTestId('planned-cost-range');
    expect(el).toHaveTextContent('€80,000.00');
    expect(el).toHaveTextContent('€90,000.00');
  });

  // ── Test 3: Actual Spend ──────────────────────────────────────────────────

  it('renders actual spend formatted as EUR currency', () => {
    renderWithRouter(<BudgetSummaryCard overview={{ ...baseOverview, actualCost: 50000 }} />);

    const el = screen.getByTestId('actual-spend');
    expect(el).toHaveTextContent('€50,000.00');
  });

  // ── Test 4: Remaining pct — green (> 20%) ─────────────────────────────────

  it('shows green remaining percentage when remaining is above 20%', () => {
    // remainingPct = (100000 - 70000) / 100000 * 100 = 30.0%
    renderWithRouter(
      <BudgetSummaryCard
        overview={{ ...baseOverview, availableFunds: 100000, actualCost: 70000, remainingVsActualCost: 30000 }}
      />,
    );

    const el = screen.getByTestId('remaining-pct');
    expect(el).toHaveTextContent('30.0% remaining');
    expect(el.className).toContain('remainingGreen');
  });

  // ── Test 5: Remaining pct — yellow (5–20%) ────────────────────────────────

  it('shows yellow remaining percentage when remaining is between 5% and 20%', () => {
    // remainingPct = (100000 - 88000) / 100000 * 100 = 12.0%
    renderWithRouter(
      <BudgetSummaryCard
        overview={{ ...baseOverview, availableFunds: 100000, actualCost: 88000, remainingVsActualCost: 12000 }}
      />,
    );

    const el = screen.getByTestId('remaining-pct');
    expect(el).toHaveTextContent('12.0% remaining');
    expect(el.className).toContain('remainingYellow');
  });

  // ── Test 6: Remaining pct — red (< 5%) ────────────────────────────────────

  it('shows red remaining percentage when remaining is below 5%', () => {
    // remainingPct = (100000 - 97000) / 100000 * 100 = 3.0%
    renderWithRouter(
      <BudgetSummaryCard
        overview={{ ...baseOverview, availableFunds: 100000, actualCost: 97000, remainingVsActualCost: 3000 }}
      />,
    );

    const el = screen.getByTestId('remaining-pct');
    expect(el).toHaveTextContent('3.0% remaining');
    expect(el.className).toContain('remainingRed');
  });

  // ── Test 7: Remaining pct — red (zero funds) ──────────────────────────────

  it('shows red remaining percentage and 0.0% when availableFunds is zero', () => {
    // remainingPct defaults to 0 when availableFunds === 0
    renderWithRouter(
      <BudgetSummaryCard
        overview={{ ...baseOverview, availableFunds: 0, actualCost: 0, remainingVsActualCost: 0 }}
      />,
    );

    const el = screen.getByTestId('remaining-pct');
    expect(el).toHaveTextContent('0.0% remaining');
    expect(el.className).toContain('remainingRed');
  });

  // ── Test 8: Subsidy impact shown when totalReductions > 0 ────────────────

  it('renders subsidy impact section when totalReductions is greater than zero', () => {
    renderWithRouter(
      <BudgetSummaryCard
        overview={{
          ...baseOverview,
          subsidySummary: {
            totalReductions: 5000,
            activeSubsidyCount: 1,
            minTotalPayback: 0,
            maxTotalPayback: 0,
          },
        }}
      />,
    );

    const el = screen.getByTestId('subsidy-impact');
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent('€5,000.00');
  });

  // ── Test 9: Subsidy impact hidden when totalReductions = 0 ───────────────

  it('does not render subsidy impact section when totalReductions is zero', () => {
    renderWithRouter(<BudgetSummaryCard overview={baseOverview} />);

    expect(screen.queryByTestId('subsidy-impact')).toBeNull();
  });

  // ── Test 10: Footer link to /budget/overview ──────────────────────────────

  it('renders a footer link to /budget/overview', () => {
    renderWithRouter(<BudgetSummaryCard overview={baseOverview} />);

    const link = screen.getByRole('link', { name: /view budget overview/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/budget/overview');
  });

  // ── Test 11: BudgetHealthIndicator — On Budget ────────────────────────────

  it('renders BudgetHealthIndicator showing On Budget when margin is above 10%', () => {
    // margin = remainingVsMaxPlanned / availableFunds = 15000 / 100000 = 0.15 > 0.10 → On Budget
    renderWithRouter(
      <BudgetSummaryCard
        overview={{ ...baseOverview, availableFunds: 100000, remainingVsMaxPlanned: 15000 }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('On Budget');
  });

  // ── Test 12: BudgetBar renders ────────────────────────────────────────────

  it('renders BudgetBar with role="img"', () => {
    renderWithRouter(<BudgetSummaryCard overview={baseOverview} />);

    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});
