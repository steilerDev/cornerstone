/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils.js';
import type { CategoryBudgetSummary } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

// Dynamic import — must happen after any jest.unstable_mockModule calls.
// BudgetAlertsCard has no context deps so no mocks are needed before the import.
let BudgetAlertsCard: React.ComponentType<{ categorySummaries: CategoryBudgetSummary[] }>;

const baseSummary: CategoryBudgetSummary = {
  categoryId: 'bc-construction',
  categoryName: 'Construction',
  categoryColor: '#ff0000',
  minPlanned: 10000,
  maxPlanned: 20000,
  actualCost: 0,
  actualCostPaid: 0,
  actualCostClaimed: 0,
  budgetLineCount: 1,
};

describe('BudgetAlertsCard', () => {
  beforeEach(async () => {
    if (!BudgetAlertsCard) {
      const module = await import('./BudgetAlertsCard.js');
      BudgetAlertsCard = module.BudgetAlertsCard;
    }
  });

  // ── Test 1: Empty state when no summaries ─────────────────────────────────

  it('shows empty state with "All categories on track" when categorySummaries is empty', () => {
    renderWithRouter(<BudgetAlertsCard categorySummaries={[]} />);

    const el = screen.getByTestId('alert-empty');
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent('All categories on track');
  });

  // ── Test 2: All on track — all categories under 90% ──────────────────────

  it('shows empty state when all categories are under 90% utilization', () => {
    const summaries: CategoryBudgetSummary[] = [
      {
        ...baseSummary,
        categoryName: 'Construction',
        maxPlanned: 20000,
        actualCost: 17000, // 85% — under threshold
        budgetLineCount: 1,
      },
      {
        ...baseSummary,
        categoryId: 'bc-materials',
        categoryName: 'Materials',
        maxPlanned: 10000,
        actualCost: 5000, // 50% — well under threshold
        budgetLineCount: 2,
      },
    ];

    renderWithRouter(<BudgetAlertsCard categorySummaries={summaries} />);

    expect(screen.getByTestId('alert-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('alert-item')).toBeNull();
  });

  // ── Test 3: Red alert — category over budget ──────────────────────────────

  it('renders one alert-item with percentage above 100% when a category is over budget', () => {
    const summaries: CategoryBudgetSummary[] = [
      {
        ...baseSummary,
        categoryName: 'Structural',
        maxPlanned: 10000,
        actualCost: 12000, // 120% — over budget → red
        budgetLineCount: 1,
      },
    ];

    renderWithRouter(<BudgetAlertsCard categorySummaries={summaries} />);

    const items = screen.getAllByTestId('alert-item');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('120.0% of budget');
    expect(items[0]).toHaveTextContent('Structural');
  });

  // ── Test 4: Yellow alert — category at 95% ────────────────────────────────

  it('renders one alert-item at 95% utilization with yellow severity', () => {
    const summaries: CategoryBudgetSummary[] = [
      {
        ...baseSummary,
        categoryName: 'Roofing',
        maxPlanned: 20000,
        actualCost: 19000, // 95% — near budget → yellow
        budgetLineCount: 1,
      },
    ];

    renderWithRouter(<BudgetAlertsCard categorySummaries={summaries} />);

    const items = screen.getAllByTestId('alert-item');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('95.0% of budget');
    expect(items[0]).toHaveTextContent('Roofing');
    // CSS class comes from identity-obj-proxy which returns the class name as-is
    expect(items[0].className).toContain('itemYellow');
  });

  // ── Test 5: Boundary — exactly 90% triggers yellow alert ─────────────────

  it('renders a yellow alert when actualCost is exactly 90% of maxPlanned', () => {
    const summaries: CategoryBudgetSummary[] = [
      {
        ...baseSummary,
        categoryName: 'Electrical',
        maxPlanned: 10000,
        actualCost: 9000, // exactly 90% → yellow
        budgetLineCount: 1,
      },
    ];

    renderWithRouter(<BudgetAlertsCard categorySummaries={summaries} />);

    const items = screen.getAllByTestId('alert-item');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('90.0% of budget');
    expect(items[0].className).toContain('itemYellow');
  });

  // ── Test 6: Boundary — exactly 100% triggers yellow alert (not red) ───────

  it('renders a yellow alert when actualCost equals maxPlanned (100% but not over)', () => {
    const summaries: CategoryBudgetSummary[] = [
      {
        ...baseSummary,
        categoryName: 'Plumbing',
        maxPlanned: 15000,
        actualCost: 15000, // exactly 100% — not over budget (>), pctUsed=100 which is <=100 and >=90
        budgetLineCount: 1,
      },
    ];

    renderWithRouter(<BudgetAlertsCard categorySummaries={summaries} />);

    const items = screen.getAllByTestId('alert-item');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('100.0% of budget');
    expect(items[0].className).toContain('itemYellow');
  });

  // ── Test 7: Sort order — red before yellow, descending pctUsed within group

  it('sorts red alerts before yellow, then by descending percentage within each group', () => {
    const summaries: CategoryBudgetSummary[] = [
      {
        ...baseSummary,
        categoryId: 'yellow-low',
        categoryName: 'Yellow Low',
        maxPlanned: 10000,
        actualCost: 9200, // 92% — yellow
        budgetLineCount: 1,
      },
      {
        ...baseSummary,
        categoryId: 'red-high',
        categoryName: 'Red High',
        maxPlanned: 10000,
        actualCost: 15000, // 150% — red
        budgetLineCount: 1,
      },
      {
        ...baseSummary,
        categoryId: 'yellow-high',
        categoryName: 'Yellow High',
        maxPlanned: 10000,
        actualCost: 9800, // 98% — yellow
        budgetLineCount: 1,
      },
      {
        ...baseSummary,
        categoryId: 'red-low',
        categoryName: 'Red Low',
        maxPlanned: 10000,
        actualCost: 11000, // 110% — red
        budgetLineCount: 1,
      },
    ];

    renderWithRouter(<BudgetAlertsCard categorySummaries={summaries} />);

    const items = screen.getAllByTestId('alert-item');
    expect(items).toHaveLength(4);

    // Expected order: Red High (150%), Red Low (110%), Yellow High (98%), Yellow Low (92%)
    expect(items[0]).toHaveTextContent('Red High');
    expect(items[0]).toHaveTextContent('150.0% of budget');

    expect(items[1]).toHaveTextContent('Red Low');
    expect(items[1]).toHaveTextContent('110.0% of budget');

    expect(items[2]).toHaveTextContent('Yellow High');
    expect(items[2]).toHaveTextContent('98.0% of budget');

    expect(items[3]).toHaveTextContent('Yellow Low');
    expect(items[3]).toHaveTextContent('92.0% of budget');
  });

  // ── Test 8: Zero maxPlanned — no alert rendered ───────────────────────────

  it('does not render an alert when maxPlanned is zero (pctUsed defaults to 0)', () => {
    const summaries: CategoryBudgetSummary[] = [
      {
        ...baseSummary,
        categoryName: 'Landscaping',
        maxPlanned: 0,
        actualCost: 0, // pctUsed = 0 when maxPlanned = 0
        budgetLineCount: 1,
      },
    ];

    renderWithRouter(<BudgetAlertsCard categorySummaries={summaries} />);

    expect(screen.getByTestId('alert-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('alert-item')).toBeNull();
  });

  // ── Test 9: budgetLineCount = 0 — category skipped ───────────────────────

  it('skips categories with budgetLineCount of 0 even if actualCost exceeds maxPlanned', () => {
    const summaries: CategoryBudgetSummary[] = [
      {
        ...baseSummary,
        categoryName: 'Empty Category',
        maxPlanned: 5000,
        actualCost: 10000, // would be red, but budgetLineCount=0
        budgetLineCount: 0, // no budget lines — must be skipped
      },
    ];

    renderWithRouter(<BudgetAlertsCard categorySummaries={summaries} />);

    expect(screen.getByTestId('alert-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('alert-item')).toBeNull();
  });

  // ── Test 10: Multiple red and yellow — verify count and ordering ──────────

  it('renders all qualifying alerts with correct count when multiple red and yellow are present', () => {
    const summaries: CategoryBudgetSummary[] = [
      {
        ...baseSummary,
        categoryId: 'bc-a',
        categoryName: 'Category A',
        maxPlanned: 10000,
        actualCost: 5000, // 50% — on track, no alert
        budgetLineCount: 1,
      },
      {
        ...baseSummary,
        categoryId: 'bc-b',
        categoryName: 'Category B',
        maxPlanned: 10000,
        actualCost: 12000, // 120% — red
        budgetLineCount: 2,
      },
      {
        ...baseSummary,
        categoryId: 'bc-c',
        categoryName: 'Category C',
        maxPlanned: 10000,
        actualCost: 11000, // 110% — red
        budgetLineCount: 1,
      },
      {
        ...baseSummary,
        categoryId: 'bc-d',
        categoryName: 'Category D',
        maxPlanned: 10000,
        actualCost: 9500, // 95% — yellow
        budgetLineCount: 3,
      },
      {
        ...baseSummary,
        categoryId: 'bc-e',
        categoryName: 'Category E',
        maxPlanned: 10000,
        actualCost: 9100, // 91% — yellow
        budgetLineCount: 1,
      },
    ];

    renderWithRouter(<BudgetAlertsCard categorySummaries={summaries} />);

    const items = screen.getAllByTestId('alert-item');
    // 4 alerts: B (red 120%), C (red 110%), D (yellow 95%), E (yellow 91%)
    expect(items).toHaveLength(4);

    // First two are red
    expect(items[0].className).toContain('itemRed');
    expect(items[1].className).toContain('itemRed');

    // Last two are yellow
    expect(items[2].className).toContain('itemYellow');
    expect(items[3].className).toContain('itemYellow');

    // Category A (50%) must NOT appear
    expect(screen.queryByText('Category A')).toBeNull();
  });
});
