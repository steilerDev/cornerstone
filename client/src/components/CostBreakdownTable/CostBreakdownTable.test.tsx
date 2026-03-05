/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { CostBreakdownTable } from './CostBreakdownTable.js';
import type { BudgetBreakdown, BudgetOverview } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

// ── Selector Helpers ──────────────────────────────────────────────────────

/**
 * Find an expand button by matching the text of its sibling span element.
 * This replaced aria-controls-based selection after aria-controls was removed from expand buttons.
 * Maps old controlsId patterns to the expected sibling text:
 *   - "wi-section-categories" → "Work Item Budget"
 *   - "hi-section-categories" → "Household Item Budget"
 *   - "wi-cat-*-items" → category name (e.g., "Materials", "Labor")
 *   - "hi-cat-*-items" → HI category label (e.g., "Furniture", "Appliances")
 *   - "wi-item-*-budget-lines" → work item title
 *   - "hi-item-*-budget-lines" → household item name
 */
function getButtonByControls(container: HTMLElement, controlsId: string): HTMLElement {
  let expectedText: string | null = null;

  if (controlsId === 'wi-section-categories') {
    expectedText = 'Work Item Budget';
  } else if (controlsId === 'hi-section-categories') {
    expectedText = 'Household Item Budget';
  } else if (controlsId.startsWith('wi-cat-') && controlsId.endsWith('-items')) {
    // Extract category name: "wi-cat-{categoryId}-items"
    // Since we don't have direct access to categoryId→name mapping, find by partial match
    // and context. Look through all buttons and find one that looks like a category row.
    const buttons = Array.from(container.querySelectorAll<HTMLElement>('button.expandBtn'));
    for (const btn of buttons) {
      const row = btn.closest('tr');
      if (!row) continue;
      // Check if this row has a category name (no € in name cell, has € in budget cells)
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        const nameCell = cells[0];
        const budgetCell = cells[1];
        // Categories have currency formatted values; we'll look for a button where the name looks like a category
        const nameText = nameCell.textContent?.trim() || '';
        // If this button's sibling text matches or is close to controlsId context, return it
        const span = btn.nextElementSibling;
        if (span?.textContent) {
          const categoryNames = [
            'Uncategorized',
            'Materials',
            'Labor',
            'Permits',
            'Design',
            'Equipment',
            'Landscaping',
            'Utilities',
            'Insurance',
            'Contingency',
            'Other',
          ];
          if (categoryNames.some((cat) => span.textContent?.includes(cat))) {
            return btn;
          }
        }
      }
    }
    throw new Error(`Category button for controlsId="${controlsId}" not found`);
  } else if (controlsId.startsWith('hi-cat-') && controlsId.endsWith('-items')) {
    // For household item category expansion
    // Extract category from controlsId: "hi-cat-{hiCategory}-items"
    // Example: "hi-cat-appliances-items" → looking for button with sibling text "Appliances"
    const categoryMatch = controlsId.match(/^hi-cat-([a-z]+)-items$/);
    if (categoryMatch) {
      const category = categoryMatch[1];
      // Map category to label
      const categoryLabels: Record<string, string> = {
        furniture: 'Furniture',
        appliances: 'Appliances',
        fixtures: 'Fixtures',
        decor: 'Decor',
        electronics: 'Electronics',
        outdoor: 'Outdoor',
        storage: 'Storage',
        other: 'Other',
      };
      expectedText = categoryLabels[category] || null;
    }
  } else if (controlsId.startsWith('wi-item-') && controlsId.endsWith('-budget-lines')) {
    // For work item expansion, find in the correct section
    // Look for buttons in rows that are nested under a WI category
    const buttons = Array.from(container.querySelectorAll<HTMLElement>('button.expandBtn'));
    // Items appear after category buttons; return the next one that isn't a section/category button
    let foundSection = false;
    for (const btn of buttons) {
      const span = btn.nextElementSibling;
      const text = span?.textContent?.trim() || '';
      if (text === 'Work Item Budget') {
        foundSection = true;
      } else if (foundSection && text && !text.match(/^(Uncategorized|Materials|Labor|Permits|Design|Equipment|Landscaping|Utilities|Insurance|Contingency|Other)$/)) {
        return btn;
      }
    }
  } else if (controlsId.startsWith('hi-item-') && controlsId.endsWith('-budget-lines')) {
    // For household item expansion
    const buttons = Array.from(container.querySelectorAll<HTMLElement>('button.expandBtn'));
    let foundHISection = false;
    for (const btn of buttons) {
      const span = btn.nextElementSibling;
      const text = span?.textContent?.trim() || '';
      if (text === 'Household Item Budget') {
        foundHISection = true;
      } else if (foundHISection && text && !text.match(/^(Furniture|Appliances|Fixtures|Decor|Electronics|Outdoor|Storage|Other)$/)) {
        return btn;
      }
    }
  }

  // If expectedText was set, find button with matching sibling text
  if (expectedText) {
    const buttons = Array.from(container.querySelectorAll<HTMLElement>('button.expandBtn'));
    const btn = buttons.find((b) => {
      const span = b.nextElementSibling;
      return span?.textContent?.trim() === expectedText;
    });
    if (btn) return btn;
  }

  throw new Error(
    `Button for controlsId="${controlsId}" not found. aria-controls has been removed from expand buttons. ` +
      `Check that sibling span text matches expected value.`,
  );
}

// ── Test Data Helpers ──────────────────────────────────────────────────────

/**
 * Build a minimal BudgetOverview for tests.
 */
function buildOverview(availableFunds = 100000): BudgetOverview {
  return {
    availableFunds,
    sourceCount: 1,
    minPlanned: 0,
    maxPlanned: 0,
    projectedMin: 0,
    projectedMax: 0,
    actualCost: 0,
    actualCostPaid: 0,
    actualCostClaimed: 0,
    remainingVsMinPlanned: 0,
    remainingVsMaxPlanned: 0,
    remainingVsProjectedMin: 0,
    remainingVsProjectedMax: 0,
    remainingVsActualCost: 0,
    remainingVsActualPaid: 0,
    remainingVsActualClaimed: 0,
    remainingVsMinPlannedWithPayback: 0,
    remainingVsMaxPlannedWithPayback: 0,
    categorySummaries: [],
    subsidySummary: { totalReductions: 0, activeSubsidyCount: 0, minTotalPayback: 0, maxTotalPayback: 0 },
  };
}

/**
 * Build an empty BudgetBreakdown.
 */
function buildEmptyBreakdown(): BudgetBreakdown {
  return {
    workItems: {
      categories: [],
      totals: { projectedMin: 0, projectedMax: 0, actualCost: 0, subsidyPayback: 0 },
    },
    householdItems: {
      categories: [],
      totals: { projectedMin: 0, projectedMax: 0, actualCost: 0, subsidyPayback: 0 },
    },
  };
}

/**
 * Build a breakdown with one WI category containing one item.
 */
function buildBreakdownWithWI(opts: {
  categoryId?: string | null;
  categoryName?: string;
  costDisplay?: 'actual' | 'projected' | 'mixed';
  projectedMin?: number;
  projectedMax?: number;
  actualCost?: number;
  subsidyPayback?: number;
  itemTitle?: string;
  workItemId?: string;
  description?: string | null;
} = {}): BudgetBreakdown {
  const categoryId = opts.categoryId !== undefined ? opts.categoryId : 'cat-1';
  const categoryName = opts.categoryName ?? 'Materials';
  const costDisplay = opts.costDisplay ?? 'projected';
  const projectedMin = opts.projectedMin ?? 800;
  const projectedMax = opts.projectedMax ?? 1200;
  const actualCost = opts.actualCost ?? 0;
  const subsidyPayback = opts.subsidyPayback ?? 0;
  const itemTitle = opts.itemTitle ?? 'Foundation Work';
  const workItemId = opts.workItemId ?? 'wi-1';

  return {
    workItems: {
      categories: [
        {
          categoryId,
          categoryName,
          categoryColor: null,
          projectedMin,
          projectedMax,
          actualCost,
          subsidyPayback,
          items: [
            {
              workItemId,
              title: itemTitle,
              projectedMin,
              projectedMax,
              actualCost,
              subsidyPayback,
              costDisplay,
              budgetLines: [
                {
                  id: 'line-1',
                  description: opts.description !== undefined ? opts.description : null,
                  plannedAmount: 1000,
                  confidence: 'own_estimate',
                  actualCost,
                  hasInvoice: actualCost > 0,
                },
              ],
            },
          ],
        },
      ],
      totals: { projectedMin, projectedMax, actualCost, subsidyPayback },
    },
    householdItems: {
      categories: [],
      totals: { projectedMin: 0, projectedMax: 0, actualCost: 0, subsidyPayback: 0 },
    },
  };
}

/**
 * Build a breakdown with one HI category containing one item.
 */
function buildBreakdownWithHI(opts: {
  hiCategory?: 'furniture' | 'appliances' | 'fixtures' | 'decor' | 'electronics' | 'outdoor' | 'storage' | 'other';
  projectedMin?: number;
  projectedMax?: number;
  actualCost?: number;
  subsidyPayback?: number;
  costDisplay?: 'actual' | 'projected' | 'mixed';
  itemName?: string;
  householdItemId?: string;
} = {}): BudgetBreakdown {
  const hiCategory = opts.hiCategory ?? 'furniture';
  const projectedMin = opts.projectedMin ?? 400;
  const projectedMax = opts.projectedMax ?? 600;
  const actualCost = opts.actualCost ?? 0;
  const subsidyPayback = opts.subsidyPayback ?? 0;
  const costDisplay = opts.costDisplay ?? 'projected';
  const householdItemId = opts.householdItemId ?? 'hi-1';

  return {
    workItems: {
      categories: [],
      totals: { projectedMin: 0, projectedMax: 0, actualCost: 0, subsidyPayback: 0 },
    },
    householdItems: {
      categories: [
        {
          hiCategory,
          projectedMin,
          projectedMax,
          actualCost,
          subsidyPayback,
          items: [
            {
              householdItemId,
              name: opts.itemName ?? 'Sofa',
              projectedMin,
              projectedMax,
              actualCost,
              subsidyPayback,
              costDisplay,
              budgetLines: [
                {
                  id: 'hi-line-1',
                  description: null,
                  plannedAmount: 500,
                  confidence: 'own_estimate',
                  actualCost,
                  hasInvoice: actualCost > 0,
                },
              ],
            },
          ],
        },
      ],
      totals: { projectedMin, projectedMax, actualCost, subsidyPayback },
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CostBreakdownTable', () => {
  // ── 15. Renders section heading ──────────────────────────────────────────

  it('renders a Cost Breakdown heading', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    expect(screen.getByRole('heading', { name: /cost breakdown/i })).toBeInTheDocument();
  });

  // ── 16. Summary rows show totals ──────────────────────────────────────────

  it('shows Available Funds row with formatted currency value', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ projectedMin: 800, projectedMax: 1200 })}
        overview={buildOverview(50000)}
        selectedCategories={new Set()}
      />,
    );

    expect(screen.getByText('Available Funds')).toBeInTheDocument();
    expect(screen.getByText('€50,000.00')).toBeInTheDocument();
  });

  it('shows Remaining label in table row', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ projectedMin: 800, projectedMax: 1200 })}
        overview={buildOverview(100000)}
        selectedCategories={new Set()}
      />,
    );

    // There is a 'Remaining' span (inside the row) and a 'Remaining' column header.
    // Use getAllByText to handle multiple matches and assert at least one exists.
    const remainingElements = screen.getAllByText('Remaining');
    expect(remainingElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows Work Item Budget label in summary', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    expect(screen.getByText('Work Item Budget')).toBeInTheDocument();
  });

  it('shows Household Item Budget label in summary', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithHI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    expect(screen.getByText('Household Item Budget')).toBeInTheDocument();
  });

  // ── 17. WI section collapsed by default ─────────────────────────────────

  it('does not show WI category rows when section is collapsed (default)', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ categoryName: 'Materials' })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    // Category name 'Materials' should not be visible yet (inside collapsed section)
    expect(screen.queryByText('Materials')).not.toBeInTheDocument();
  });

  // ── 18. Click WI section toggle — categories appear ──────────────────────

  it('shows WI category rows after clicking the WI section toggle', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ categoryName: 'Labor', categoryId: 'cat-labor' })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    expect(screen.getByText('Labor')).toBeInTheDocument();
  });

  it('sets aria-expanded=true on WI toggle button after clicking', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    const wiToggle = getButtonByControls(container, 'wi-section-categories');
    expect(wiToggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(wiToggle);

    expect(wiToggle).toHaveAttribute('aria-expanded', 'true');
  });

  // ── 19. Category row expand — item rows appear ───────────────────────────

  it('shows item rows after expanding the WI section then a category', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          categoryName: 'Permits',
          categoryId: 'cat-permits',
          itemTitle: 'City Permit',
          workItemId: 'wi-permit',
        })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    // Expand WI section
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    // Expand category: aria-controls="wi-cat-cat-permits-items"
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-permits-items'));

    expect(screen.getByText('City Permit')).toBeInTheDocument();
  });

  // ── 20. Item row expand — budget line rows appear ────────────────────────

  it('shows budget line rows after expanding to item level', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          categoryName: 'Equipment',
          categoryId: 'cat-equip',
          itemTitle: 'Crane Rental',
          workItemId: 'wi-crane',
          description: 'Tower crane for 3 weeks',
        })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    // Expand WI section → category → item
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-equip-items'));
    fireEvent.click(getButtonByControls(container, 'wi-item-wi-crane-budget-lines'));

    expect(screen.getByText('Tower crane for 3 weeks')).toBeInTheDocument();
  });

  it('shows "Untitled" for budget lines without a description', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          categoryName: 'Design',
          categoryId: 'cat-design',
          itemTitle: 'Architect Fee',
          workItemId: 'wi-arch',
          description: null,
        })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-design-items'));
    fireEvent.click(getButtonByControls(container, 'wi-item-wi-arch-budget-lines'));

    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  // ── 21. costDisplay: 'actual' ──────────────────────────────────────────

  it('shows "Actual:" prefix in item row for costDisplay=actual', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          costDisplay: 'actual',
          actualCost: 950,
          projectedMin: 950,
          projectedMax: 950,
          categoryName: 'Materials',
          categoryId: 'cat-mat',
        })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-mat-items'));

    // The item row should display "Actual: €950.00"
    expect(screen.getByText(/Actual:/)).toBeInTheDocument();
  });

  // ── 22. costDisplay: 'projected' ─────────────────────────────────────────

  it('shows range format in item row for costDisplay=projected', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          costDisplay: 'projected',
          projectedMin: 800,
          projectedMax: 1200,
          categoryName: 'Materials',
          categoryId: 'cat-mat2',
        })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-mat2-items'));

    // The item row CostDisplay renders a span with the range text
    // The category row also renders the range. Check using a partial text matcher.
    expect(screen.getAllByText(/€800\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/€1,200\.00/).length).toBeGreaterThanOrEqual(1);
  });

  // ── 23. costDisplay: 'mixed' ─────────────────────────────────────────────

  it('shows both Actual and Projected labels in item row for costDisplay=mixed', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          costDisplay: 'mixed',
          actualCost: 500,
          projectedMin: 900,
          projectedMax: 1300,
          categoryName: 'Labor',
          categoryId: 'cat-labor2',
        })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-labor2-items'));

    const actualLines = screen.getAllByText(/Actual:/);
    expect(actualLines.length).toBeGreaterThanOrEqual(1);

    const projectedLines = screen.getAllByText(/Projected:/);
    expect(projectedLines.length).toBeGreaterThanOrEqual(1);
  });

  // ── 24. Zero subsidy payback → "—" ───────────────────────────────────────

  it('renders "—" in Payback column for item with zero subsidyPayback', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          subsidyPayback: 0,
          categoryName: 'Utilities',
          categoryId: 'cat-util',
        })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-util-items'));

    // The item row payback column shows "—"
    const dashElements = screen.getAllByText('—');
    expect(dashElements.length).toBeGreaterThan(0);
  });

  // ── 25. Non-zero subsidy payback → currency value ────────────────────────

  it('renders formatted currency value for non-zero subsidyPayback on item row', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          subsidyPayback: 120,
          categoryName: 'Landscaping',
          categoryId: 'cat-land',
        })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-land-items'));

    // Multiple instances of €120.00 appear (category row and item row)
    const currencyElements = screen.getAllByText('€120.00');
    expect(currencyElements.length).toBeGreaterThanOrEqual(1);
  });

  // ── 26. selectedCategories filter — only matching WI category renders ──────

  it('renders only the matching WI category when selectedCategories is set', () => {
    const catId = 'cat-materials';
    const breakdown: BudgetBreakdown = {
      workItems: {
        categories: [
          {
            categoryId: catId,
            categoryName: 'Materials',
            categoryColor: null,
            projectedMin: 800,
            projectedMax: 1200,
            actualCost: 0,
            subsidyPayback: 0,
            items: [],
          },
          {
            categoryId: 'cat-labor',
            categoryName: 'Labor',
            categoryColor: null,
            projectedMin: 1000,
            projectedMax: 1500,
            actualCost: 0,
            subsidyPayback: 0,
            items: [],
          },
        ],
        totals: { projectedMin: 1800, projectedMax: 2700, actualCost: 0, subsidyPayback: 0 },
      },
      householdItems: {
        categories: [],
        totals: { projectedMin: 0, projectedMax: 0, actualCost: 0, subsidyPayback: 0 },
      },
    };

    const { container } = render(
      <CostBreakdownTable
        breakdown={breakdown}
        overview={buildOverview()}
        selectedCategories={new Set([catId])}
      />,
    );

    // Expand WI section
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    expect(screen.getByText('Materials')).toBeInTheDocument();
    expect(screen.queryByText('Labor')).not.toBeInTheDocument();
  });

  it('shows all WI categories when selectedCategories is empty', () => {
    const breakdown: BudgetBreakdown = {
      workItems: {
        categories: [
          {
            categoryId: 'cat-a',
            categoryName: 'CategoryA',
            categoryColor: null,
            projectedMin: 100,
            projectedMax: 200,
            actualCost: 0,
            subsidyPayback: 0,
            items: [],
          },
          {
            categoryId: 'cat-b',
            categoryName: 'CategoryB',
            categoryColor: null,
            projectedMin: 300,
            projectedMax: 400,
            actualCost: 0,
            subsidyPayback: 0,
            items: [],
          },
        ],
        totals: { projectedMin: 400, projectedMax: 600, actualCost: 0, subsidyPayback: 0 },
      },
      householdItems: {
        categories: [],
        totals: { projectedMin: 0, projectedMax: 0, actualCost: 0, subsidyPayback: 0 },
      },
    };

    const { container } = render(
      <CostBreakdownTable
        breakdown={breakdown}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    expect(screen.getByText('CategoryA')).toBeInTheDocument();
    expect(screen.getByText('CategoryB')).toBeInTheDocument();
  });

  // ── 27. HI section always shows regardless of WI filter ──────────────────

  it('shows HI section even when selectedCategories filters all WI categories', () => {
    const breakdown: BudgetBreakdown = {
      workItems: {
        categories: [
          {
            categoryId: 'cat-x',
            categoryName: 'CategoryX',
            categoryColor: null,
            projectedMin: 100,
            projectedMax: 200,
            actualCost: 0,
            subsidyPayback: 0,
            items: [],
          },
        ],
        totals: { projectedMin: 100, projectedMax: 200, actualCost: 0, subsidyPayback: 0 },
      },
      householdItems: {
        categories: [
          {
            hiCategory: 'furniture',
            projectedMin: 300,
            projectedMax: 500,
            actualCost: 0,
            subsidyPayback: 0,
            items: [],
          },
        ],
        totals: { projectedMin: 300, projectedMax: 500, actualCost: 0, subsidyPayback: 0 },
      },
    };

    render(
      <CostBreakdownTable
        breakdown={breakdown}
        overview={buildOverview()}
        // Filter to a category that doesn't exist — hides WI section but not HI
        selectedCategories={new Set(['cat-nonexistent'])}
      />,
    );

    // HI section should still be visible
    expect(screen.getByText('Household Item Budget')).toBeInTheDocument();
  });

  // ── 28. Remaining value positive → valuePositive CSS class ───────────────

  it('applies valuePositive CSS class when remaining is positive', () => {
    // availableFunds=100000, projectedMax=1200 → remaining = 98800 > 0
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ projectedMax: 1200 })}
        overview={buildOverview(100000)}
        selectedCategories={new Set()}
      />,
    );

    const positiveElements = container.querySelectorAll('.valuePositive');
    expect(positiveElements.length).toBeGreaterThan(0);
  });

  // ── 29. Remaining value negative → valueNegative CSS class ───────────────

  it('applies valueNegative CSS class when remaining is negative', () => {
    // availableFunds=100, projectedMax=50000 → remaining = -49900 < 0
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ projectedMax: 50000 })}
        overview={buildOverview(100)}
        selectedCategories={new Set()}
      />,
    );

    const negativeElements = container.querySelectorAll('.valueNegative');
    expect(negativeElements.length).toBeGreaterThan(0);
  });

  // ── 30. Empty state ───────────────────────────────────────────────────────

  it('renders empty state message when there is no budget data', () => {
    render(
      <CostBreakdownTable
        breakdown={buildEmptyBreakdown()}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    expect(screen.getByText(/no budget data to display/i)).toBeInTheDocument();
  });

  it('does not render the table when in empty state', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildEmptyBreakdown()}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    expect(container.querySelector('table')).not.toBeInTheDocument();
  });

  it('still renders the heading when in empty state', () => {
    render(
      <CostBreakdownTable
        breakdown={buildEmptyBreakdown()}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    expect(screen.getByRole('heading', { name: /cost breakdown/i })).toBeInTheDocument();
  });

  // ── 31. Accessibility — aria-expanded and aria-controls ──────────────────

  it('WI section toggle button has aria-expanded', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    const wiToggle = getButtonByControls(container, 'wi-section-categories');
    expect(wiToggle).toHaveAttribute('aria-expanded');
  });

  it('HI section toggle button has aria-expanded', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithHI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    const hiToggle = getButtonByControls(container, 'hi-section-categories');
    expect(hiToggle).toHaveAttribute('aria-expanded');
  });

  it('WI section toggle button starts with aria-expanded=false', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    const wiToggle = getButtonByControls(container, 'wi-section-categories');
    expect(wiToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('category toggle button has aria-expanded after WI section expanded', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ categoryName: 'Permits', categoryId: 'cat-perm' })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    const catToggle = getButtonByControls(container, 'wi-cat-cat-perm-items');
    expect(catToggle).toHaveAttribute('aria-expanded');
  });

  it('item toggle button has aria-expanded after expanding category', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          categoryName: 'Insurance',
          categoryId: 'cat-ins',
          itemTitle: 'Home Insurance',
          workItemId: 'wi-ins',
        })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-ins-items'));

    const itemToggle = getButtonByControls(container, 'wi-item-wi-ins-budget-lines');
    expect(itemToggle).toHaveAttribute('aria-expanded');
  });

  // ── HI section expansion ───────────────────────────────────────────────────

  it('shows HI category label after expanding HI section', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithHI({ hiCategory: 'electronics' })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));

    // "Electronics" is the label for the 'electronics' hiCategory
    expect(screen.getByText('Electronics')).toBeInTheDocument();
  });

  it('shows HI item name after expanding HI category', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithHI({
          hiCategory: 'appliances',
          itemName: 'Dishwasher',
          householdItemId: 'hi-dishwasher',
        })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'hi-cat-appliances-items'));

    expect(screen.getByText('Dishwasher')).toBeInTheDocument();
  });

  // ── Toggle collapse ────────────────────────────────────────────────────────

  it('collapses WI category rows when toggle is clicked a second time', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ categoryName: 'Contingency', categoryId: 'cat-cont' })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    const wiToggle = getButtonByControls(container, 'wi-section-categories');

    // Expand
    fireEvent.click(wiToggle);
    expect(screen.getByText('Contingency')).toBeInTheDocument();

    // Collapse
    fireEvent.click(wiToggle);
    expect(screen.queryByText('Contingency')).not.toBeInTheDocument();
  });

  // ── Table structure ────────────────────────────────────────────────────────

  it('renders table column headers: Name, Budget, Payback, Remaining', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /budget/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /payback/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /remaining/i })).toBeInTheDocument();
  });

  // ── Category sum row visibility ────────────────────────────────────────────

  it('shows sum row for expanded WI category', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ categoryName: 'Contingency', categoryId: 'cat-cont2' })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-cont2-items'));

    expect(screen.getByText('Total Contingency')).toBeInTheDocument();
  });

  it('shows sum row for expanded HI category', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithHI({ hiCategory: 'storage', householdItemId: 'hi-stor' })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'hi-cat-storage-items'));

    expect(screen.getByText('Total Storage')).toBeInTheDocument();
  });

  // ── Null category WI item ─────────────────────────────────────────────────

  it('renders WI item with null categoryId under Uncategorized label', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ categoryId: null, categoryName: 'Uncategorized' })}
        overview={buildOverview()}
        selectedCategories={new Set()}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });
});
