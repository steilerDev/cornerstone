/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { BudgetHealthIndicator } from './BudgetHealthIndicator.js';

// CSS modules mocked via identity-obj-proxy

describe('BudgetHealthIndicator', () => {
  // ── role="status" ────────────────────────────────────────────────────────

  it('has role="status"', () => {
    render(<BudgetHealthIndicator remainingVsProjectedMax={10000} availableFunds={100000} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // ── On Budget ────────────────────────────────────────────────────────────

  it('shows "On Budget" when margin > 10%', () => {
    // margin = 15000 / 100000 = 0.15 > 0.10 → On Budget
    render(<BudgetHealthIndicator remainingVsProjectedMax={15000} availableFunds={100000} />);

    expect(screen.getByRole('status')).toHaveTextContent('On Budget');
  });

  it('shows "On Budget" when margin is exactly above 10%', () => {
    // margin = 11000 / 100000 = 0.11 > 0.10 → On Budget
    render(<BudgetHealthIndicator remainingVsProjectedMax={11000} availableFunds={100000} />);

    expect(screen.getByRole('status')).toHaveTextContent('On Budget');
  });

  it('applies onBudget CSS class when margin > 10%', () => {
    render(<BudgetHealthIndicator remainingVsProjectedMax={50000} availableFunds={100000} />);

    expect(screen.getByRole('status')).toHaveClass('onBudget');
  });

  // ── At Risk ──────────────────────────────────────────────────────────────

  it('shows "At Risk" when margin <= 10% but remaining is positive', () => {
    // margin = 10000 / 100000 = 0.10 → At Risk (not strictly > 0.10)
    render(<BudgetHealthIndicator remainingVsProjectedMax={10000} availableFunds={100000} />);

    expect(screen.getByRole('status')).toHaveTextContent('At Risk');
  });

  it('shows "At Risk" when margin is between 0% and 10%', () => {
    // margin = 5000 / 100000 = 0.05 → At Risk
    render(<BudgetHealthIndicator remainingVsProjectedMax={5000} availableFunds={100000} />);

    expect(screen.getByRole('status')).toHaveTextContent('At Risk');
  });

  it('shows "At Risk" when remaining is 0 but not negative (availableFunds > 0)', () => {
    // remaining = 0, availableFunds = 100000 → margin = 0 → At Risk
    render(<BudgetHealthIndicator remainingVsProjectedMax={0} availableFunds={100000} />);

    expect(screen.getByRole('status')).toHaveTextContent('At Risk');
  });

  it('shows "At Risk" when availableFunds is 0 (special case)', () => {
    // Special case: availableFunds = 0, remaining = 0 → At Risk
    render(<BudgetHealthIndicator remainingVsProjectedMax={0} availableFunds={0} />);

    expect(screen.getByRole('status')).toHaveTextContent('At Risk');
  });

  it('applies atRisk CSS class when margin <= 10%', () => {
    render(<BudgetHealthIndicator remainingVsProjectedMax={9000} availableFunds={100000} />);

    expect(screen.getByRole('status')).toHaveClass('atRisk');
  });

  // ── Over Budget ──────────────────────────────────────────────────────────

  it('shows "Over Budget" when remaining is negative', () => {
    render(<BudgetHealthIndicator remainingVsProjectedMax={-1} availableFunds={100000} />);

    expect(screen.getByRole('status')).toHaveTextContent('Over Budget');
  });

  it('shows "Over Budget" when remaining is significantly negative', () => {
    render(<BudgetHealthIndicator remainingVsProjectedMax={-50000} availableFunds={100000} />);

    expect(screen.getByRole('status')).toHaveTextContent('Over Budget');
  });

  it('applies overBudget CSS class when remaining is negative', () => {
    render(<BudgetHealthIndicator remainingVsProjectedMax={-5000} availableFunds={100000} />);

    expect(screen.getByRole('status')).toHaveClass('overBudget');
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('shows "Over Budget" when remaining is negative even with availableFunds = 0', () => {
    render(<BudgetHealthIndicator remainingVsProjectedMax={-100} availableFunds={0} />);

    expect(screen.getByRole('status')).toHaveTextContent('Over Budget');
  });

  it('shows "On Budget" with very large funds and large positive remaining', () => {
    // margin = 1000000 / 5000000 = 0.20 > 0.10 → On Budget
    render(<BudgetHealthIndicator remainingVsProjectedMax={1000000} availableFunds={5000000} />);

    expect(screen.getByRole('status')).toHaveTextContent('On Budget');
  });

  it('renders as a span element', () => {
    const { container } = render(
      <BudgetHealthIndicator remainingVsProjectedMax={10000} availableFunds={100000} />,
    );

    expect(container.querySelector('span')).toBeInTheDocument();
  });
});
