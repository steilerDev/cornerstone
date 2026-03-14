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

  // ── Test 1: Remaining Budget ──────────────────────────────────────────────

  it('renders remaining budget formatted as EUR currency', () => {
    renderWithRouter(
      <BudgetSummaryCard overview={{ ...baseOverview, remainingVsActualCost: 50000 }} />,
    );

    const el = screen.getByTestId('remaining-budget');
    expect(el).toHaveTextContent('€50,000.00');
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

  // ── Test 4: Subsidy savings shown when totalReductions > 0 ────────────────

  it('renders subsidy savings section when totalReductions is greater than zero', () => {
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

  // ── Test 5: Subsidy savings hidden when totalReductions = 0 ───────────────

  it('does not render subsidy impact section when totalReductions is zero', () => {
    renderWithRouter(<BudgetSummaryCard overview={baseOverview} />);

    expect(screen.queryByTestId('subsidy-impact')).toBeNull();
  });

  // ── Test 6: Footer link to /budget/overview ───────────────────────────────

  it('renders a footer link to /budget/overview', () => {
    renderWithRouter(<BudgetSummaryCard overview={baseOverview} />);

    const link = screen.getByRole('link', { name: /view budget overview/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/budget/overview');
  });

  // ── Test 7: BudgetHealthIndicator — On Budget ──────────────────────────────

  it('renders BudgetHealthIndicator showing On Budget when margin is above 10%', () => {
    // margin = remainingVsMaxPlanned / availableFunds = 15000 / 100000 = 0.15 > 0.10 → On Budget
    renderWithRouter(
      <BudgetSummaryCard
        overview={{ ...baseOverview, availableFunds: 100000, remainingVsMaxPlanned: 15000 }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('On Budget');
  });

  // ── Test 8: BudgetBar renders ──────────────────────────────────────────────

  it('renders BudgetBar with role="img"', () => {
    renderWithRouter(<BudgetSummaryCard overview={baseOverview} />);

    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});
