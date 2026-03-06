/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CostBreakdownTable } from './CostBreakdownTable.js';
import type { BudgetBreakdown, BudgetOverview, BudgetSource } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

/**
 * Render CostBreakdownTable inside a MemoryRouter.
 * Required for tests that expand to item rows (which contain <Link> elements).
 */
function renderWithRouter(
  breakdown: BudgetBreakdown,
  overview: BudgetOverview,
  selectedCategories = new Set<string | null>(),
  budgetSources: BudgetSource[] = [],
) {
  return render(
    <MemoryRouter>
      <CostBreakdownTable
        breakdown={breakdown}
        overview={overview}
        selectedCategories={selectedCategories}
        budgetSources={budgetSources}
      />
    </MemoryRouter>,
  );
}

// ── Selector Helpers ──────────────────────────────────────────────────────

/**
 * Find an expand button by matching the text of its sibling span element.
 * This replaced aria-controls-based selection after aria-controls was removed from expand buttons.
 * Maps old controlsId patterns to the expected sibling text:
 *   - "wi-section-categories" → "Work items"
 *   - "hi-section-categories" → "Household items"
 *   - "avail-funds" → "Available funds"
 *   - "wi-cat-*-items" → category name (e.g., "Materials", "Labor")
 *   - "hi-cat-*-items" → HI category label (e.g., "Furniture", "Appliances")
 *   - "wi-item-*-budget-lines" → work item title
 *   - "hi-item-*-budget-lines" → household item name
 */
function getButtonByControls(container: HTMLElement, controlsId: string): HTMLElement {
  let expectedText: string | null = null;

  if (controlsId === 'wi-section-categories') {
    expectedText = 'Work items';
  } else if (controlsId === 'hi-section-categories') {
    expectedText = 'Household items';
  } else if (controlsId === 'avail-funds') {
    expectedText = 'Available funds';
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
        // Categories have currency formatted values; we'll look for a button where the name looks like a category
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
            'CategoryA',
            'CategoryB',
            'CategoryX',
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
      if (text === 'Work items') {
        foundSection = true;
      } else if (
        foundSection &&
        text &&
        !text.match(
          /^(Uncategorized|Materials|Labor|Permits|Design|Equipment|Landscaping|Utilities|Insurance|Contingency|Other|CategoryA|CategoryB|CategoryX)$/,
        )
      ) {
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
      if (text === 'Household items') {
        foundHISection = true;
      } else if (
        foundHISection &&
        text &&
        !text.match(/^(Furniture|Appliances|Fixtures|Decor|Electronics|Outdoor|Storage|Other)$/)
      ) {
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
function buildOverview(
  availableFunds = 100000,
  opts: {
    minTotalPayback?: number;
    maxTotalPayback?: number;
  } = {},
): BudgetOverview {
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
    subsidySummary: {
      totalReductions: 0,
      activeSubsidyCount: 0,
      minTotalPayback: opts.minTotalPayback ?? 0,
      maxTotalPayback: opts.maxTotalPayback ?? 0,
    },
  };
}

/**
 * Build an empty BudgetBreakdown.
 */
function buildEmptyBreakdown(): BudgetBreakdown {
  return {
    workItems: {
      categories: [],
      totals: {
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 0,
        rawProjectedMax: 0,
        minSubsidyPayback: 0,
      },
    },
    householdItems: {
      categories: [],
      totals: {
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 0,
        rawProjectedMax: 0,
        minSubsidyPayback: 0,
      },
    },
  };
}

/**
 * Build a breakdown with one WI category containing one item.
 */
function buildBreakdownWithWI(
  opts: {
    categoryId?: string | null;
    categoryName?: string;
    costDisplay?: 'actual' | 'projected' | 'mixed';
    projectedMin?: number;
    projectedMax?: number;
    actualCost?: number;
    subsidyPayback?: number;
    minSubsidyPayback?: number;
    rawProjectedMin?: number;
    rawProjectedMax?: number;
    itemTitle?: string;
    workItemId?: string;
    description?: string | null;
    hasInvoice?: boolean;
  } = {},
): BudgetBreakdown {
  const categoryId = opts.categoryId !== undefined ? opts.categoryId : 'cat-1';
  const categoryName = opts.categoryName ?? 'Materials';
  const costDisplay = opts.costDisplay ?? 'projected';
  const projectedMin = opts.projectedMin ?? 800;
  const projectedMax = opts.projectedMax ?? 1200;
  const actualCost = opts.actualCost ?? 0;
  const subsidyPayback = opts.subsidyPayback ?? 0;
  const minSubsidyPayback = opts.minSubsidyPayback ?? 0;
  const rawProjectedMin = opts.rawProjectedMin ?? projectedMin;
  const rawProjectedMax = opts.rawProjectedMax ?? projectedMax;
  const itemTitle = opts.itemTitle ?? 'Foundation Work';
  const workItemId = opts.workItemId ?? 'wi-1';
  const hasInvoice = opts.hasInvoice ?? actualCost > 0;

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
          rawProjectedMin,
          rawProjectedMax,
          minSubsidyPayback,
          items: [
            {
              workItemId,
              title: itemTitle,
              projectedMin,
              projectedMax,
              actualCost,
              subsidyPayback,
              rawProjectedMin,
              rawProjectedMax,
              minSubsidyPayback,
              costDisplay,
              budgetLines: [
                {
                  id: 'line-1',
                  description: opts.description !== undefined ? opts.description : null,
                  plannedAmount: 1000,
                  confidence: 'own_estimate',
                  actualCost,
                  hasInvoice,
                },
              ],
            },
          ],
        },
      ],
      totals: {
        projectedMin,
        projectedMax,
        actualCost,
        subsidyPayback,
        rawProjectedMin,
        rawProjectedMax,
        minSubsidyPayback,
      },
    },
    householdItems: {
      categories: [],
      totals: {
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 0,
        rawProjectedMax: 0,
        minSubsidyPayback: 0,
      },
    },
  };
}

/**
 * Build a breakdown with one HI category containing one item.
 */
function buildBreakdownWithHI(
  opts: {
    hiCategory?:
      | 'furniture'
      | 'appliances'
      | 'fixtures'
      | 'decor'
      | 'electronics'
      | 'outdoor'
      | 'storage'
      | 'other';
    projectedMin?: number;
    projectedMax?: number;
    actualCost?: number;
    subsidyPayback?: number;
    minSubsidyPayback?: number;
    rawProjectedMin?: number;
    rawProjectedMax?: number;
    costDisplay?: 'actual' | 'projected' | 'mixed';
    itemName?: string;
    householdItemId?: string;
  } = {},
): BudgetBreakdown {
  const hiCategory = opts.hiCategory ?? 'furniture';
  const projectedMin = opts.projectedMin ?? 400;
  const projectedMax = opts.projectedMax ?? 600;
  const actualCost = opts.actualCost ?? 0;
  const subsidyPayback = opts.subsidyPayback ?? 0;
  const minSubsidyPayback = opts.minSubsidyPayback ?? 0;
  const rawProjectedMin = opts.rawProjectedMin ?? projectedMin;
  const rawProjectedMax = opts.rawProjectedMax ?? projectedMax;
  const costDisplay = opts.costDisplay ?? 'projected';
  const householdItemId = opts.householdItemId ?? 'hi-1';

  return {
    workItems: {
      categories: [],
      totals: {
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 0,
        rawProjectedMax: 0,
        minSubsidyPayback: 0,
      },
    },
    householdItems: {
      categories: [
        {
          hiCategory,
          projectedMin,
          projectedMax,
          actualCost,
          subsidyPayback,
          rawProjectedMin,
          rawProjectedMax,
          minSubsidyPayback,
          items: [
            {
              householdItemId,
              name: opts.itemName ?? 'Sofa',
              projectedMin,
              projectedMax,
              actualCost,
              subsidyPayback,
              rawProjectedMin,
              rawProjectedMax,
              minSubsidyPayback,
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
      totals: {
        projectedMin,
        projectedMax,
        actualCost,
        subsidyPayback,
        rawProjectedMin,
        rawProjectedMax,
        minSubsidyPayback,
      },
    },
  };
}

/**
 * Build a minimal BudgetSource for tests.
 */
function buildBudgetSource(
  opts: { id?: string; name?: string; totalAmount?: number } = {},
): BudgetSource {
  return {
    id: opts.id ?? 'src-1',
    name: opts.name ?? 'Bank Loan',
    sourceType: 'bank_loan',
    totalAmount: opts.totalAmount ?? 80000,
    usedAmount: 0,
    availableAmount: opts.totalAmount ?? 80000,
    claimedAmount: 0,
    unclaimedAmount: 0,
    actualAvailableAmount: opts.totalAmount ?? 80000,
    interestRate: null,
    terms: null,
    notes: null,
    status: 'active',
    createdBy: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
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
        budgetSources={[]}
      />,
    );

    expect(screen.getByRole('heading', { name: /cost breakdown/i })).toBeInTheDocument();
  });

  // ── 16. Summary rows show totals ──────────────────────────────────────────

  it('shows Available funds row with formatted currency value', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ projectedMin: 800, projectedMax: 1200 })}
        overview={buildOverview(50000)}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    expect(screen.getByText('Available funds')).toBeInTheDocument();
    expect(screen.getByText('€50,000.00')).toBeInTheDocument();
  });

  it('shows Sum label in bottom totals row (not Remaining)', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ projectedMin: 800, projectedMax: 1200 })}
        overview={buildOverview(100000)}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    // The bottom totals row uses the label 'Sum'.
    expect(screen.getByText('Sum')).toBeInTheDocument();
    // 'Remaining' must NOT appear as a row label (it was replaced by 'Sum').
    expect(screen.queryByText('Remaining')).not.toBeInTheDocument();
  });

  it('shows Work items label in summary', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    expect(screen.getByText('Work items')).toBeInTheDocument();
  });

  it('shows Household items label in summary', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithHI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    expect(screen.getByText('Household items')).toBeInTheDocument();
  });

  // ── 17. WI section collapsed by default ─────────────────────────────────

  it('does not show WI category rows when section is collapsed (default)', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ categoryName: 'Materials' })}
        overview={buildOverview()}
        selectedCategories={new Set()}
        budgetSources={[]}
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
        budgetSources={[]}
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
        budgetSources={[]}
      />,
    );

    const wiToggle = getButtonByControls(container, 'wi-section-categories');
    expect(wiToggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(wiToggle);

    expect(wiToggle).toHaveAttribute('aria-expanded', 'true');
  });

  // ── 19. Category row expand — item rows appear ───────────────────────────

  it('shows item rows after expanding the WI section then a category', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        categoryName: 'Permits',
        categoryId: 'cat-permits',
        itemTitle: 'City Permit',
        workItemId: 'wi-permit',
      }),
      buildOverview(),
    );

    // Expand WI section
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    // Expand category: aria-controls="wi-cat-cat-permits-items"
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-permits-items'));

    expect(screen.getByText('City Permit')).toBeInTheDocument();
  });

  // ── 20. Item row expand — budget line rows appear ────────────────────────

  it('shows budget line rows after expanding to item level', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        categoryName: 'Equipment',
        categoryId: 'cat-equip',
        itemTitle: 'Crane Rental',
        workItemId: 'wi-crane',
        description: 'Tower crane for 3 weeks',
      }),
      buildOverview(),
    );

    // Expand WI section → category → item
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-equip-items'));
    fireEvent.click(getButtonByControls(container, 'wi-item-wi-crane-budget-lines'));

    expect(screen.getByText('Tower crane for 3 weeks')).toBeInTheDocument();
  });

  it('shows "Untitled" for budget lines without a description', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        categoryName: 'Design',
        categoryId: 'cat-design',
        itemTitle: 'Architect Fee',
        workItemId: 'wi-arch',
        description: null,
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-design-items'));
    fireEvent.click(getButtonByControls(container, 'wi-item-wi-arch-budget-lines'));

    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  // ── 21. costDisplay: 'actual' ──────────────────────────────────────────

  it('shows formatted cost in item row for costDisplay=actual (no "Actual:" label)', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'actual',
        actualCost: 950,
        projectedMin: 950,
        projectedMax: 950,
        categoryName: 'Materials',
        categoryId: 'cat-mat',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-mat-items'));

    // The item row Cost column shows "-€950.00" (formatCost) without "Actual:" label
    expect(screen.getAllByText('-€950.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Actual:/)).not.toBeInTheDocument();
  });

  // ── 22. costDisplay: 'projected' ─────────────────────────────────────────

  it('shows projected cost in item row using default Avg perspective', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'projected',
        projectedMin: 800,
        projectedMax: 1200,
        rawProjectedMin: 800,
        rawProjectedMax: 1200,
        categoryName: 'Materials',
        categoryId: 'cat-mat2',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-mat2-items'));

    // Default perspective is "Avg": (800 + 1200) / 2 = 1000.
    // The Cost column shows -€1,000.00 for the item row (raw cost with minus prefix).
    expect(screen.getAllByText(/€1,000\.00/).length).toBeGreaterThanOrEqual(1);
  });

  // ── 23. costDisplay: 'mixed' ─────────────────────────────────────────────
  // For mixed mode, the item row shows the projected cost value (same column as projected),
  // and the row has the rowMixed CSS class. The component does not show separate Actual/Projected
  // labels in the Cost column for mixed items — only for actual mode shows 'Actual:' label.

  it('shows projected cost value in item row for costDisplay=mixed (rowMixed class applied)', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'mixed',
        actualCost: 500,
        projectedMin: 900,
        projectedMax: 1300,
        rawProjectedMin: 900,
        rawProjectedMax: 1300,
        categoryName: 'Labor',
        categoryId: 'cat-labor2',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-labor2-items'));

    // Default perspective is Avg: (900 + 1300) / 2 = 1100
    const projectedAvg = screen.getAllByText(/€1,100\.00/);
    expect(projectedAvg.length).toBeGreaterThanOrEqual(1);

    // Item row must have rowMixed CSS class (visual indicator for mixed state)
    const mixedRows = container.querySelectorAll('tr.rowMixed');
    expect(mixedRows.length).toBeGreaterThanOrEqual(1);
  });

  // ── 24. Zero subsidy payback → "—" ───────────────────────────────────────

  it('renders "—" in Payback column for item with zero subsidyPayback', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        subsidyPayback: 0,
        categoryName: 'Utilities',
        categoryId: 'cat-util',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-util-items'));

    // The item row payback column shows "—"
    const dashElements = screen.getAllByText('—');
    expect(dashElements.length).toBeGreaterThan(0);
  });

  // ── 25. Non-zero subsidy payback → currency value ────────────────────────

  it('renders formatted currency value for non-zero subsidyPayback on item row', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        subsidyPayback: 120,
        minSubsidyPayback: 120, // same as max → renders single value, not a range
        categoryName: 'Landscaping',
        categoryId: 'cat-land',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-land-items'));

    // Payback column shows "€120.00" (no plus prefix) for both category row and item row
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
            rawProjectedMin: 800,
            rawProjectedMax: 1200,
            minSubsidyPayback: 0,
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
            rawProjectedMin: 1000,
            rawProjectedMax: 1500,
            minSubsidyPayback: 0,
            items: [],
          },
        ],
        totals: {
          projectedMin: 1800,
          projectedMax: 2700,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 1800,
          rawProjectedMax: 2700,
          minSubsidyPayback: 0,
        },
      },
      householdItems: {
        categories: [],
        totals: {
          projectedMin: 0,
          projectedMax: 0,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 0,
          rawProjectedMax: 0,
          minSubsidyPayback: 0,
        },
      },
    };

    const { container } = render(
      <CostBreakdownTable
        breakdown={breakdown}
        overview={buildOverview()}
        selectedCategories={new Set([catId])}
        budgetSources={[]}
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
            rawProjectedMin: 100,
            rawProjectedMax: 200,
            minSubsidyPayback: 0,
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
            rawProjectedMin: 300,
            rawProjectedMax: 400,
            minSubsidyPayback: 0,
            items: [],
          },
        ],
        totals: {
          projectedMin: 400,
          projectedMax: 600,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 400,
          rawProjectedMax: 600,
          minSubsidyPayback: 0,
        },
      },
      householdItems: {
        categories: [],
        totals: {
          projectedMin: 0,
          projectedMax: 0,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 0,
          rawProjectedMax: 0,
          minSubsidyPayback: 0,
        },
      },
    };

    const { container } = render(
      <CostBreakdownTable
        breakdown={breakdown}
        overview={buildOverview()}
        selectedCategories={new Set()}
        budgetSources={[]}
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
            rawProjectedMin: 100,
            rawProjectedMax: 200,
            minSubsidyPayback: 0,
            items: [],
          },
        ],
        totals: {
          projectedMin: 100,
          projectedMax: 200,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 100,
          rawProjectedMax: 200,
          minSubsidyPayback: 0,
        },
      },
      householdItems: {
        categories: [
          {
            hiCategory: 'furniture',
            projectedMin: 300,
            projectedMax: 500,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 300,
            rawProjectedMax: 500,
            minSubsidyPayback: 0,
            items: [],
          },
        ],
        totals: {
          projectedMin: 300,
          projectedMax: 500,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 300,
          rawProjectedMax: 500,
          minSubsidyPayback: 0,
        },
      },
    };

    render(
      <CostBreakdownTable
        breakdown={breakdown}
        overview={buildOverview()}
        // Filter to a category that doesn't exist — hides WI section but not HI
        selectedCategories={new Set(['cat-nonexistent'])}
        budgetSources={[]}
      />,
    );

    // HI section should still be visible
    expect(screen.getByText('Household items')).toBeInTheDocument();
  });

  // ── 28. Remaining value positive → valuePositive CSS class ───────────────

  it('applies valuePositive CSS class when remaining is positive', () => {
    // availableFunds=100000, projectedMax=1200 → remaining = 98800 > 0
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ projectedMax: 1200 })}
        overview={buildOverview(100000)}
        selectedCategories={new Set()}
        budgetSources={[]}
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
        budgetSources={[]}
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
        budgetSources={[]}
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
        budgetSources={[]}
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
        budgetSources={[]}
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
        budgetSources={[]}
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
        budgetSources={[]}
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
        budgetSources={[]}
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
        budgetSources={[]}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    const catToggle = getButtonByControls(container, 'wi-cat-cat-perm-items');
    expect(catToggle).toHaveAttribute('aria-expanded');
  });

  it('item toggle button has aria-expanded after expanding category', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        categoryName: 'Insurance',
        categoryId: 'cat-ins',
        itemTitle: 'Home Insurance',
        workItemId: 'wi-ins',
      }),
      buildOverview(),
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
        budgetSources={[]}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));

    // "Electronics" is the label for the 'electronics' hiCategory
    expect(screen.getByText('Electronics')).toBeInTheDocument();
  });

  it('shows HI item name after expanding HI category', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithHI({
        hiCategory: 'appliances',
        itemName: 'Dishwasher',
        householdItemId: 'hi-dishwasher',
      }),
      buildOverview(),
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
        budgetSources={[]}
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

  // ── Table structure — Column Headers ──────────────────────────────────────

  // Scenario 7: Cost column header says "Cost" (not "Budget")
  it('renders "Cost" as the cost column header (not "Budget")', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /^cost$/i })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^budget$/i })).not.toBeInTheDocument();
  });

  // Scenario 8: Net column header says "Net" (not "Remaining")
  it('renders "Net" as the net column header (not "Remaining")', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /^net$/i })).toBeInTheDocument();
  });

  it('renders table column headers: Name, Cost, Payback, Net', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^cost$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /payback/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^net$/i })).toBeInTheDocument();
  });

  // ── Level-0 Row Names (Scenario 9) ────────────────────────────────────────

  it('level-0 rows are labeled "Available funds", "Work items", "Household items", "Sum"', () => {
    const breakdown: BudgetBreakdown = {
      workItems: {
        categories: [
          {
            categoryId: 'cat-1',
            categoryName: 'Materials',
            categoryColor: null,
            projectedMin: 500,
            projectedMax: 700,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 500,
            rawProjectedMax: 700,
            minSubsidyPayback: 0,
            items: [],
          },
        ],
        totals: {
          projectedMin: 500,
          projectedMax: 700,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 500,
          rawProjectedMax: 700,
          minSubsidyPayback: 0,
        },
      },
      householdItems: {
        categories: [
          {
            hiCategory: 'furniture',
            projectedMin: 200,
            projectedMax: 300,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 200,
            rawProjectedMax: 300,
            minSubsidyPayback: 0,
            items: [],
          },
        ],
        totals: {
          projectedMin: 200,
          projectedMax: 300,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 200,
          rawProjectedMax: 300,
          minSubsidyPayback: 0,
        },
      },
    };

    render(
      <CostBreakdownTable
        breakdown={breakdown}
        overview={buildOverview(100000)}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    expect(screen.getByText('Available funds')).toBeInTheDocument();
    expect(screen.getByText('Work items')).toBeInTheDocument();
    expect(screen.getByText('Household items')).toBeInTheDocument();
    expect(screen.getByText('Sum')).toBeInTheDocument();
    expect(screen.queryByText('Remaining')).not.toBeInTheDocument();
  });

  // ── Category sum row visibility ────────────────────────────────────────────

  it('shows sum row for expanded WI category', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({ categoryName: 'Contingency', categoryId: 'cat-cont2' }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-cont2-items'));

    expect(screen.getByText('Total Contingency')).toBeInTheDocument();
  });

  it('shows sum row for expanded HI category', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithHI({ hiCategory: 'storage', householdItemId: 'hi-stor' }),
      buildOverview(),
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
        budgetSources={[]}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });

  // ── Perspective Toggle (Scenarios 1–6) ────────────────────────────────────

  // Scenario 1: "Avg" is active by default
  it('renders with "Avg" segment active by default (aria-checked="true")', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    const avgButton = screen.getByRole('radio', { name: 'Avg' });
    expect(avgButton).toHaveAttribute('aria-checked', 'true');

    const minButton = screen.getByRole('radio', { name: 'Min' });
    expect(minButton).toHaveAttribute('aria-checked', 'false');

    const maxButton = screen.getByRole('radio', { name: 'Max' });
    expect(maxButton).toHaveAttribute('aria-checked', 'false');
  });

  // Scenario 2: Clicking "Min" activates Min, shows projectedMin value for projected items
  it('clicking Min activates Min segment and shows projectedMin value for projected items', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'projected',
        projectedMin: 600,
        projectedMax: 1000,
        rawProjectedMin: 600,
        rawProjectedMax: 1000,
        categoryName: 'Labor',
        categoryId: 'cat-lab-min',
      }),
      buildOverview(),
    );

    // Switch to Min
    fireEvent.click(screen.getByRole('radio', { name: 'Min' }));

    expect(screen.getByRole('radio', { name: 'Min' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Max' })).toHaveAttribute('aria-checked', 'false');

    // Expand WI section and category to see item row
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-lab-min-items'));

    // projectedMin=600 should appear (not projectedMax=1000)
    expect(screen.getAllByText(/€600\.00/).length).toBeGreaterThanOrEqual(1);
  });

  // Scenario 3: Clicking "Avg" shows (projectedMin + projectedMax) / 2
  it('clicking Avg shows average of projectedMin and projectedMax for projected items', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'projected',
        projectedMin: 800,
        projectedMax: 1200,
        categoryName: 'Permits',
        categoryId: 'cat-perm-avg',
      }),
      buildOverview(),
    );

    // Switch to Avg — average of 800 and 1200 = 1000
    fireEvent.click(screen.getByRole('radio', { name: 'Avg' }));

    expect(screen.getByRole('radio', { name: 'Avg' })).toHaveAttribute('aria-checked', 'true');

    // Expand WI section and category to see item row
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-perm-avg-items'));

    // Average value €1,000.00
    expect(screen.getAllByText(/€1,000\.00/).length).toBeGreaterThanOrEqual(1);
  });

  // Scenario 4: ArrowRight from "Min" activates next option in order (Avg)
  // Toggle order is: Min (0), Avg (1), Max (2)
  it('ArrowRight keydown from Min activates Avg (next in order)', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    // First set focus to Min by clicking it
    const minButton = screen.getByRole('radio', { name: 'Min' });
    fireEvent.click(minButton);
    expect(minButton).toHaveAttribute('aria-checked', 'true');

    // ArrowRight from Min (index 0) → Avg (index 1)
    fireEvent.keyDown(minButton, { key: 'ArrowRight' });

    expect(screen.getByRole('radio', { name: 'Avg' })).toHaveAttribute('aria-checked', 'true');
    expect(minButton).toHaveAttribute('aria-checked', 'false');
  });

  // Scenario 5: ArrowLeft from "Min" wraps around to last option (Max)
  it('ArrowLeft keydown from Min wraps around to activate Max (last in order)', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    const minButton = screen.getByRole('radio', { name: 'Min' });
    fireEvent.click(minButton);
    expect(minButton).toHaveAttribute('aria-checked', 'true');

    // ArrowLeft from Min (index 0) wraps to Max (last, index 2)
    fireEvent.keyDown(minButton, { key: 'ArrowLeft' });

    expect(screen.getByRole('radio', { name: 'Max' })).toHaveAttribute('aria-checked', 'true');
    expect(minButton).toHaveAttribute('aria-checked', 'false');
  });

  // Scenario 6: Actual-cost items show actualCost regardless of perspective (no "Actual:" label)
  it('actual-cost items show actualCost value regardless of which perspective is active', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'actual',
        actualCost: 750,
        projectedMin: 750,
        projectedMax: 750,
        categoryName: 'Equipment',
        categoryId: 'cat-equip-actual',
      }),
      buildOverview(),
    );

    // Switch to Min perspective
    fireEvent.click(screen.getByRole('radio', { name: 'Min' }));

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-equip-actual-items'));

    // Actual cost shows "-€750.00" (formatCost), no "Actual:" label
    expect(screen.getAllByText('-€750.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Actual:/)).not.toBeInTheDocument();

    // Switch to Avg — still shows same actual cost
    fireEvent.click(screen.getByRole('radio', { name: 'Avg' }));
    expect(screen.getAllByText('-€750.00').length).toBeGreaterThanOrEqual(1);
  });

  // ── Row Highlighting (Scenarios 10–13) ────────────────────────────────────

  // Scenario 10: costDisplay === 'actual' → rowActual CSS class on <tr>
  it('work item with costDisplay=actual has rowActual CSS class on its row', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'actual',
        actualCost: 500,
        projectedMin: 500,
        projectedMax: 500,
        categoryName: 'Insurance',
        categoryId: 'cat-ins-actual',
        workItemId: 'wi-actual-row',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-ins-actual-items'));

    // The work item row (level 2) should have rowActual class
    const actualRows = container.querySelectorAll('.rowActual');
    expect(actualRows.length).toBeGreaterThan(0);
  });

  // Scenario 11: costDisplay === 'mixed' → rowMixed CSS class on <tr>
  it('work item with costDisplay=mixed has rowMixed CSS class on its row', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'mixed',
        actualCost: 300,
        projectedMin: 600,
        projectedMax: 900,
        categoryName: 'Design',
        categoryId: 'cat-des-mixed',
        workItemId: 'wi-mixed-row',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-des-mixed-items'));

    const mixedRows = container.querySelectorAll('.rowMixed');
    expect(mixedRows.length).toBeGreaterThan(0);
  });

  // Scenario 12: costDisplay === 'projected' → neither rowActual nor rowMixed
  it('work item with costDisplay=projected has neither rowActual nor rowMixed', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'projected',
        projectedMin: 400,
        projectedMax: 600,
        categoryName: 'Utilities',
        categoryId: 'cat-util-proj',
        workItemId: 'wi-proj-row',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-util-proj-items'));

    // The level-2 item rows should not have rowActual or rowMixed
    const level2Rows = container.querySelectorAll('.rowLevel2');
    expect(level2Rows.length).toBeGreaterThan(0);
    level2Rows.forEach((row) => {
      const cls = row.getAttribute('class') ?? '';
      expect(cls).not.toContain('rowActual');
      expect(cls).not.toContain('rowMixed');
    });
  });

  // Scenario 13: budget line with hasInvoice===true → rowActual CSS class
  it('budget line with hasInvoice=true has rowActual CSS class', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'actual',
        actualCost: 400,
        projectedMin: 400,
        projectedMax: 400,
        hasInvoice: true,
        categoryName: 'Labor',
        categoryId: 'cat-lab-inv',
        workItemId: 'wi-inv',
        description: 'Labour invoice',
      }),
      buildOverview(),
    );

    // Expand to budget line level
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-lab-inv-items'));
    fireEvent.click(getButtonByControls(container, 'wi-item-wi-inv-budget-lines'));

    // Budget line row (level 3) with hasInvoice should have rowActual
    const actualRows = container.querySelectorAll('.rowActual');
    expect(actualRows.length).toBeGreaterThan(0);
  });

  // ── Available Funds Expansion (Scenarios 14–17) ───────────────────────────

  // Scenario 14: no budgetSources → no expand button on Available Funds
  it('Available Funds row has no expand button when budgetSources is empty', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview(100000)}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    // The expand button for Available funds has a specific aria-label
    expect(
      screen.queryByRole('button', { name: /expand available funds/i }),
    ).not.toBeInTheDocument();
  });

  // Scenario 15: budgetSources has entries → expand button present, starts collapsed
  it('Available Funds row has an expand button with aria-expanded=false when sources exist', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview(100000)}
        selectedCategories={new Set()}
        budgetSources={[buildBudgetSource({ id: 'src-1', name: 'Bank Loan', totalAmount: 80000 })]}
      />,
    );

    const expandBtn = screen.getByRole('button', { name: /expand available funds/i });
    expect(expandBtn).toBeInTheDocument();
    expect(expandBtn).toHaveAttribute('aria-expanded', 'false');
  });

  // Scenario 16: clicking expand shows one sub-row per source with name and totalAmount
  it('clicking Available Funds expand shows source sub-rows with name and totalAmount', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview(130000)}
        selectedCategories={new Set()}
        budgetSources={[
          buildBudgetSource({ id: 'src-1', name: 'Savings Account', totalAmount: 50000 }),
          buildBudgetSource({ id: 'src-2', name: 'Bank Loan', totalAmount: 80000 }),
        ]}
      />,
    );

    const expandBtn = screen.getByRole('button', { name: /expand available funds/i });
    fireEvent.click(expandBtn);

    // Sub-rows should show source names
    expect(screen.getByText('Savings Account')).toBeInTheDocument();
    expect(screen.getByText('Bank Loan')).toBeInTheDocument();

    // And their totalAmount values as currency
    expect(screen.getByText('€50,000.00')).toBeInTheDocument();
    expect(screen.getByText('€80,000.00')).toBeInTheDocument();
  });

  // Scenario 17: clicking expand again collapses source rows
  it('clicking Available Funds expand again collapses source sub-rows', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview(100000)}
        selectedCategories={new Set()}
        budgetSources={[
          buildBudgetSource({ id: 'src-1', name: 'Credit Line', totalAmount: 60000 }),
        ]}
      />,
    );

    const expandBtn = screen.getByRole('button', { name: /expand available funds/i });

    // Expand
    fireEvent.click(expandBtn);
    expect(screen.getByText('Credit Line')).toBeInTheDocument();

    // Collapse
    fireEvent.click(expandBtn);
    expect(screen.queryByText('Credit Line')).not.toBeInTheDocument();
  });

  // ── Sum Row Calculation (Scenarios 18–21) ────────────────────────────────
  // Note: the Sum row uses breakdown totals for payback (not overview.subsidySummary).
  // Sum Cost = availableFunds - totalRawProjected
  // Sum Net  = availableFunds - totalRawProjected + totalPayback (from breakdown totals)

  // Scenario 18: Sum Net for default Avg perspective
  // Sum Net uses perspective-resolved payback: resolveProjected(minPayback, maxPayback, perspective)
  it('Sum Net = availableFunds - avgRawProjected + resolvedPayback for default Avg perspective', () => {
    // availableFunds=10000
    // rawProjectedMin=3000, rawProjectedMax=5000 → avgRaw=4000
    // minSubsidyPayback=800, subsidyPayback=1200 → avgPayback=resolveProjected(800,1200,'avg')=1000
    // Sum Net = 10000 - 4000 + 1000 = 7000
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          projectedMin: 3000,
          projectedMax: 5000,
          rawProjectedMin: 3000,
          rawProjectedMax: 5000,
          subsidyPayback: 1200,
          minSubsidyPayback: 800,
        })}
        overview={buildOverview(10000)}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    // Default perspective is Avg: Sum Net = 10000 - 4000 + 1000 = 7000
    expect(screen.getByText('€7,000.00')).toBeInTheDocument();
  });

  // Scenario 19: Max perspective uses subsidyPayback (max) and rawProjectedMax
  it('Max perspective uses subsidyPayback and rawProjectedMax for Sum Net', () => {
    // availableFunds=20000
    // rawProjectedMax=8000, subsidyPayback=2000
    // Sum Net (Max) = 20000 - 8000 + 2000 = 14000
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          projectedMin: 5000,
          projectedMax: 8000,
          rawProjectedMin: 5000,
          rawProjectedMax: 8000,
          subsidyPayback: 2000,
          minSubsidyPayback: 1000,
        })}
        overview={buildOverview(20000)}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    // Switch to Max perspective
    fireEvent.click(screen.getByRole('radio', { name: 'Max' }));

    // Sum Net (Max) = 20000 - 8000 + 2000 = 14000
    expect(screen.getByText('€14,000.00')).toBeInTheDocument();
  });

  // Scenario 20: Min perspective uses rawProjectedMin and minSubsidyPayback for Sum Net
  it('Min perspective: Sum Net = availableFunds - rawProjectedMin + minSubsidyPayback', () => {
    // availableFunds=20000
    // rawProjectedMin=5000; minSubsidyPayback=1000 → resolveProjected(1000, 2000, 'min') = 1000
    // Sum Net (Min) = 20000 - 5000 + 1000 = 16000
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          projectedMin: 5000,
          projectedMax: 8000,
          rawProjectedMin: 5000,
          rawProjectedMax: 8000,
          subsidyPayback: 2000,
          minSubsidyPayback: 1000,
        })}
        overview={buildOverview(20000)}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Min' }));

    // Sum Net (Min) = 20000 - 5000 + 1000 = 16000
    expect(screen.getByText('€16,000.00')).toBeInTheDocument();
  });

  // Scenario 21: Avg perspective averages both rawProjected and payback for Sum Net
  it('Avg perspective averages both rawProjected and payback for Sum Net', () => {
    // availableFunds=20000
    // rawProjectedMin=5000, rawProjectedMax=8000 → avgRaw=resolveProjected(5000,8000,'avg')=6500
    // minSubsidyPayback=1000, subsidyPayback=2000 → avgPayback=resolveProjected(1000,2000,'avg')=1500
    // Sum Net (Avg) = 20000 - 6500 + 1500 = 15000
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          projectedMin: 5000,
          projectedMax: 8000,
          rawProjectedMin: 5000,
          rawProjectedMax: 8000,
          subsidyPayback: 2000,
          minSubsidyPayback: 1000,
        })}
        overview={buildOverview(20000)}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    // Avg is default — no need to click
    // Sum Net (Avg) = 20000 - 6500 + 1500 = 15000
    expect(screen.getByText('€15,000.00')).toBeInTheDocument();
  });

  // ── New Scenarios (Issue #493) ─────────────────────────────────────────────

  // Scenario 8: Toggle order — Min first, Avg second, Max third
  it('perspective toggle renders buttons in order: Min, Avg, Max', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    const radioButtons = screen.getAllByRole('radio');
    expect(radioButtons).toHaveLength(3);
    expect(radioButtons[0]).toHaveAccessibleName('Min');
    expect(radioButtons[1]).toHaveAccessibleName('Avg');
    expect(radioButtons[2]).toHaveAccessibleName('Max');
  });

  // Scenario 9: Default perspective is "Avg" (aria-checked="true")
  it('default perspective is Avg with aria-checked="true"', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Avg' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Min' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Max' })).toHaveAttribute('aria-checked', 'false');
  });

  // Scenario 10: Payback column IS affected by perspective switch (uses resolveProjected)
  it('payback column changes with perspective when min !== max', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        subsidyPayback: 300,
        minSubsidyPayback: 100,
        projectedMin: 800,
        projectedMax: 1200,
        rawProjectedMin: 800,
        rawProjectedMax: 1200,
        categoryName: 'Materials',
        categoryId: 'cat-payback-persp',
      }),
      buildOverview(),
    );

    // Expand to see item row
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-payback-persp-items'));

    // Avg (default): resolveProjected(100, 300, 'avg') = 200 → €200.00
    const paybackAvg = screen.getAllByText('€200.00');
    expect(paybackAvg.length).toBeGreaterThanOrEqual(1);

    // Switch to Min: resolveProjected(100, 300, 'min') = 100 → €100.00
    fireEvent.click(screen.getByRole('radio', { name: 'Min' }));
    const paybackMin = screen.getAllByText('€100.00');
    expect(paybackMin.length).toBeGreaterThanOrEqual(1);

    // Switch to Max: resolveProjected(100, 300, 'max') = 300 → €300.00
    fireEvent.click(screen.getByRole('radio', { name: 'Max' }));
    const paybackMax = screen.getAllByText('€300.00');
    expect(paybackMax.length).toBeGreaterThanOrEqual(1);
  });

  // Scenario 11: Work item name is a link with correct href
  it('work item name in item row is an anchor link to /work-items/{workItemId}', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        workItemId: 'wi-link-test',
        itemTitle: 'Plumbing Work',
        categoryName: 'Materials',
        categoryId: 'cat-wi-link',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-wi-link-items'));

    const link = screen.getByRole('link', { name: 'Plumbing Work' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/work-items/wi-link-test');
  });

  // Scenario 12: Household item name is a link with correct href
  it('household item name in item row is an anchor link to /household-items/{householdItemId}', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithHI({
        hiCategory: 'fixtures',
        householdItemId: 'hi-link-test',
        itemName: 'Bathroom Sink',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'hi-cat-fixtures-items'));

    const link = screen.getByRole('link', { name: 'Bathroom Sink' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/household-items/hi-link-test');
  });

  // Scenario 13: Cost column shows "-€" prefix for projected items
  it('Cost column shows negative "-€" prefix for projected work item', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'projected',
        projectedMin: 1000,
        projectedMax: 1000,
        rawProjectedMin: 1000,
        rawProjectedMax: 1000,
        categoryName: 'Materials',
        categoryId: 'cat-cost-prefix',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-cost-prefix-items'));

    // The cost column for item rows shows "-€1,000.00" with explicit minus sign
    const costElements = screen.getAllByText('-€1,000.00');
    expect(costElements.length).toBeGreaterThanOrEqual(1);
  });

  // Scenario 14: Payback column shows currency value without "+" prefix
  it('Payback column shows currency value without "+" prefix when min equals max', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        subsidyPayback: 150,
        minSubsidyPayback: 150,
        categoryName: 'Labor',
        categoryId: 'cat-payback-single',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-payback-single-items'));

    // min === max → resolveProjected returns 150 regardless of perspective → "€150.00" (no "+" prefix)
    const singlePayback = screen.getAllByText('€150.00');
    expect(singlePayback.length).toBeGreaterThanOrEqual(1);
    // No "+" prefix should appear
    expect(screen.queryByText(/\+€/)).not.toBeInTheDocument();
  });

  // Scenario 15: Payback column shows perspective-resolved single value when min !== max
  it('Payback column shows perspective-resolved single value when minSubsidyPayback differs from subsidyPayback', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        subsidyPayback: 120,
        minSubsidyPayback: 80,
        categoryName: 'Design',
        categoryId: 'cat-payback-range',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-payback-range-items'));

    // Avg (default): resolveProjected(80, 120, 'avg') = 100 → "€100.00"
    const avgPayback = screen.getAllByText('€100.00');
    expect(avgPayback.length).toBeGreaterThanOrEqual(1);
    // No range separator "–" should appear in payback column
    expect(container.textContent).not.toContain('+€80.00 – +€120.00');

    // Switch to Min: resolveProjected(80, 120, 'min') = 80 → "€80.00"
    fireEvent.click(screen.getByRole('radio', { name: 'Min' }));
    const minPayback = screen.getAllByText('€80.00');
    expect(minPayback.length).toBeGreaterThanOrEqual(1);

    // Switch to Max: resolveProjected(80, 120, 'max') = 120 → "€120.00"
    fireEvent.click(screen.getByRole('radio', { name: 'Max' }));
    const maxPayback = screen.getAllByText('€120.00');
    expect(maxPayback.length).toBeGreaterThanOrEqual(1);
  });

  // Scenario 16: Net column renders a single perspective-resolved value on item rows
  it('Net column renders a single perspective-resolved value on item rows', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'projected',
        projectedMin: 800,
        projectedMax: 1200,
        rawProjectedMin: 800,
        rawProjectedMax: 1200,
        subsidyPayback: 100,
        minSubsidyPayback: 80,
        categoryName: 'Permits',
        categoryId: 'cat-net-col',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-net-col-items'));

    // The Net cell (colRemaining) for the item row must contain some currency value.
    // Avg rawCost = resolveProjected(800, 1200, 'avg') = 1000
    // Avg payback = resolveProjected(80, 100, 'avg') = 90
    // Net (Avg) = 1000 - 90 = 910 → "€910.00"
    const netCells = container.querySelectorAll('td.colRemaining');
    const nonEmptyNetCells = Array.from(netCells).filter((td) => td.textContent?.trim() !== '');
    expect(nonEmptyNetCells.length).toBeGreaterThan(0);
    // No range format — single value only
    expect(container.textContent).not.toContain('€900.00 – €920.00');
    expect(container.textContent).toContain('€910.00');
  });

  // Scenario 17: "Sum" label appears; "Remaining" is gone
  it('"Sum" label appears in bottom row and "Remaining" does not', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    expect(screen.getByText('Sum')).toBeInTheDocument();
    expect(screen.queryByText('Remaining')).not.toBeInTheDocument();
  });

  // Scenario 18: Sum row Cost = availableFunds − totalRawProjected (Avg default)
  it('Sum row Cost column = availableFunds - totalRawProjected for Avg perspective', () => {
    // availableFunds=10000, rawProjectedMin=3000, rawProjectedMax=5000
    // Avg raw = (3000+5000)/2 = 4000; Sum Cost = 10000 - 4000 = 6000
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          projectedMin: 3000,
          projectedMax: 5000,
          rawProjectedMin: 3000,
          rawProjectedMax: 5000,
        })}
        overview={buildOverview(10000)}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    // Sum Cost = 10000 - 4000 = 6000 — appears in the Sum row's Cost cell
    // (Note: with no subsidyPayback, Net also equals 6000, so multiple elements may match)
    const elements = screen.getAllByText('€6,000.00');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  // Scenario 19: Sum row Net = availableFunds - avgRawProjected + resolvedPayback
  it('Sum row Net = availableFunds - avgRawProjected + resolvedPayback (perspective-aware)', () => {
    // availableFunds=10000, rawProjectedMin=3000, rawProjectedMax=5000
    // Avg raw = resolveProjected(3000, 5000, 'avg') = 4000
    // minSubsidyPayback=100, subsidyPayback=200 → avgPayback=resolveProjected(100,200,'avg')=150
    // Sum Net = 10000 - 4000 + 150 = 6150
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          projectedMin: 3000,
          projectedMax: 5000,
          rawProjectedMin: 3000,
          rawProjectedMax: 5000,
          subsidyPayback: 200,
          minSubsidyPayback: 100,
        })}
        overview={buildOverview(10000)}
        selectedCategories={new Set()}
        budgetSources={[]}
      />,
    );

    // Sum Net = 10000 - 4000 + 150 = 6150
    expect(screen.getByText('€6,150.00')).toBeInTheDocument();
  });
});
