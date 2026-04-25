/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CostBreakdownTable as CostBreakdownTableType } from './CostBreakdownTable.js';
import type { BudgetBreakdown, BudgetOverview } from '@cornerstone/shared';
import type { BudgetSourceSummaryBreakdown } from '@cornerstone/shared';

// CSS modules mocked via identity-obj-proxy

// ─── Mock: formatters — provides useFormatters() hook used by this component ──

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
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
  const fmtTime = (ts: string | null | undefined, fallback = '—') => {
    if (!ts) return fallback;
    try {
      return new Date(ts).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return fallback;
    }
  };
  const fmtDateTime = (ts: string | null | undefined, fallback = '—') => {
    if (!ts) return fallback;
    try {
      const d = new Date(ts);
      return (
        d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) +
        ' at ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      );
    } catch {
      return fallback;
    }
  };
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: fmtTime,
    formatDateTime: fmtDateTime,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
      formatTime: fmtTime,
      formatDateTime: fmtDateTime,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// Dynamic import — must happen after jest.unstable_mockModule calls.
let CostBreakdownTable: typeof CostBreakdownTableType;

beforeAll(async () => {
  const module = await import('./CostBreakdownTable.js');
  CostBreakdownTable = module.CostBreakdownTable;
});

/**
 * Render CostBreakdownTable inside a MemoryRouter.
 * Required for tests that expand to item rows (which contain <Link> elements).
 */
function renderWithRouter(
  breakdown: BudgetBreakdown,
  overview: BudgetOverview,
  opts: {
    selectedSourceIds?: Set<string>;
    onSourceToggle?: (sourceId: string | null) => void;
    onClearSources?: () => void;
  } = {},
) {
  return render(
    <MemoryRouter>
      <CostBreakdownTable
        breakdown={breakdown}
        overview={overview}
        selectedSourceIds={opts.selectedSourceIds ?? new Set()}
        onSourceToggle={opts.onSourceToggle ?? (() => {})}
        onClearSources={opts.onClearSources ?? (() => {})}
      />
    </MemoryRouter>,
  );
}

// ── Selector Helpers ──────────────────────────────────────────────────────

/**
 * Find an expand button (collapsed initial state) by aria-label in the rendered output.
 * Maps logical keys to the aria-labels used by the new area-hierarchy CostBreakdownTable.
 * Both WI and HI area rows render with aria-label="Expand {name}" when collapsed (the
 * initial state), and aria-label="Collapse {name}" when expanded.
 *
 * This helper always resolves to the COLLAPSED-state label ("Expand {name}").
 * If you need to find a button that is already expanded (e.g. to collapse it again),
 * use getButtonByLabel('Collapse {name}') directly.
 *
 *   'wi-section'           → "Expand work item budget by area"
 *   'hi-section'           → "Expand household item budget by area"
 *   'area:{name}'          → "Expand {name}"  (WI area in collapsed state)
 *   'hi-area:{name}'       → "Expand {name}"  (HI area in collapsed state — same pattern as WI)
 *   'wi-item:{title}'      → "Expand {title}" (WI item row)
 *   'hi-item:{name}'       → "Expand {name}"  (HI item row)
 */
function getButtonByControls(_container: HTMLElement, controlsId: string): HTMLElement {
  let ariaLabel: string | null = null;

  if (controlsId === 'wi-section-categories' || controlsId === 'wi-section') {
    ariaLabel = 'Expand work item budget by area';
  } else if (controlsId === 'hi-section-categories' || controlsId === 'hi-section') {
    ariaLabel = 'Expand household item budget by area';
  } else if (controlsId === 'avail-funds') {
    ariaLabel = 'Expand available funds sources';
  } else if (controlsId.startsWith('area:')) {
    // area:{areaName} — WI area in collapsed state (aria-label = "Expand {name}")
    ariaLabel = `Expand ${controlsId.slice('area:'.length)}`;
  } else if (controlsId.startsWith('hi-area:')) {
    // hi-area:{areaName} — HI area in collapsed state (aria-label = "Expand {name}")
    // Both WorkItemAreaSection and HouseholdItemAreaSection now use the same toggle pattern:
    // collapsed → "Expand {name}", expanded → "Collapse {name}". Initial state is collapsed.
    ariaLabel = `Expand ${controlsId.slice('hi-area:'.length)}`;
  } else if (controlsId.startsWith('wi-item:')) {
    // wi-item:{title} — work item row expand button
    ariaLabel = `Expand ${controlsId.slice('wi-item:'.length)}`;
  } else if (controlsId.startsWith('hi-item:')) {
    // hi-item:{name} — household item row expand button
    ariaLabel = `Expand ${controlsId.slice('hi-item:'.length)}`;
  } else if (controlsId.startsWith('wi-cat-') && controlsId.endsWith('-items')) {
    // Legacy format: the area name is the areaName passed to the test, which for null-area items
    // is 'No Area'. Map "wi-cat-*-items" → "Expand No Area" (single area in most tests).
    ariaLabel = 'Expand No Area';
  } else if (controlsId.startsWith('hi-cat-') && controlsId.endsWith('-items')) {
    // Legacy HI category format: extract name from "hi-cat-{name}-items".
    // HI area sections now use the same pattern as WI: initial collapsed state = "Expand {name}".
    const inner = controlsId.slice('hi-cat-'.length, -'-items'.length);
    ariaLabel = `Expand ${inner}`;
  } else if (controlsId.startsWith('wi-item-') && controlsId.endsWith('-budget-lines')) {
    // Legacy WI item format: "wi-item-{workItemId}-budget-lines" — not directly mappable to title.
    // Fall through to throw below.
  } else if (controlsId.startsWith('hi-item-') && controlsId.endsWith('-budget-lines')) {
    // Legacy HI item format: similar issue.
    // Fall through to throw below.
  }

  if (ariaLabel) {
    const btn = screen.queryByRole('button', { name: ariaLabel });
    if (btn) return btn as HTMLElement;
  }

  throw new Error(
    `Button for controlsId="${controlsId}" not found (aria-label="${ariaLabel ?? 'unknown'}"). ` +
      `Use getButtonByLabel() for item-level expand buttons by work item title or HI name.`,
  );
}

/**
 * Find an expand button by its exact aria-label text.
 * Used for item-level expand buttons whose aria-label is "Expand {title}".
 */
function getButtonByLabel(ariaLabel: string): HTMLElement {
  const btn = screen.getByRole('button', { name: ariaLabel });
  return btn as HTMLElement;
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
    actualCost: 0,
    actualCostPaid: 0,
    actualCostClaimed: 0,
    remainingVsMinPlanned: 0,
    remainingVsMaxPlanned: 0,
    remainingVsActualCost: 0,
    remainingVsActualPaid: 0,
    remainingVsActualClaimed: 0,
    remainingVsMinPlannedWithPayback: 0,
    remainingVsMaxPlannedWithPayback: 0,
    subsidySummary: {
      totalReductions: 0,
      activeSubsidyCount: 0,
      minTotalPayback: opts.minTotalPayback ?? 0,
      maxTotalPayback: opts.maxTotalPayback ?? 0,
      oversubscribedSubsidies: [],
    },
  };
}

/**
 * Build an empty BudgetBreakdown.
 */
function buildEmptyBreakdown(): BudgetBreakdown {
  return {
    workItems: {
      areas: [],
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
      areas: [],
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
    subsidyAdjustments: [],
    budgetSources: [],
  };
}

/**
 * Build a breakdown with one WI area (No Area) containing one item.
 * All items have null areaId so they land in the synthetic "No Area" bucket.
 */
function buildBreakdownWithWI(
  opts: {
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
    // Legacy params — kept for backward compat but ignored (area is always No Area)
    categoryId?: string | null;
    categoryName?: string;
  } = {},
): BudgetBreakdown {
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
      areas: [
        {
          areaId: null,
          name: 'Unassigned',
          parentId: null,
          color: null,
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
                  isQuotation: false,
                  budgetSourceId: null,
                },
              ],
            },
          ],
          children: [],
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
      areas: [],
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
    subsidyAdjustments: [],
    budgetSources: [],
  };
}

/**
 * Build a breakdown with one HI area containing one item.
 * When hiCategory is provided, an area node with that name is created (non-null areaId).
 * When hiCategory is omitted, items land in the "No Area" bucket (null areaId).
 */
function buildBreakdownWithHI(
  opts: {
    /** When provided, creates a named area node with this name (areaId='area-hi-1'). */
    hiCategory?: string;
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
  const areaName = opts.hiCategory ?? 'Unassigned';
  const areaId = opts.hiCategory ? 'area-hi-1' : null;
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
      areas: [],
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
      areas: [
        {
          areaId,
          name: areaName,
          parentId: null,
          color: null,
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
                  isQuotation: false,
                  budgetSourceId: null,
                },
              ],
            },
          ],
          children: [],
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
    subsidyAdjustments: [],
    budgetSources: [],
  };
}

/**
 * Build a BudgetSourceSummaryBreakdown for tests.
 */
function buildSourceSummary(
  opts: {
    id?: string;
    name?: string;
    totalAmount?: number;
    projectedMin?: number;
    projectedMax?: number;
  } = {},
): BudgetSourceSummaryBreakdown {
  return {
    id: opts.id ?? 'src-1',
    name: opts.name ?? 'Bank Loan',
    totalAmount: opts.totalAmount ?? 100000,
    projectedMin: opts.projectedMin ?? 5000,
    projectedMax: opts.projectedMax ?? 8000,
  };
}

/**
 * Build a breakdown with one WI item whose budget line has a specific budgetSourceId.
 * Used for source badge and filter tests.
 */
function buildBreakdownWithSourcedWI(opts: {
  budgetSourceId: string | null;
  lineId?: string;
  budgetSources?: BudgetSourceSummaryBreakdown[];
}): BudgetBreakdown {
  return {
    workItems: {
      areas: [
        {
          areaId: null,
          name: 'Unassigned',
          parentId: null,
          color: null,
          projectedMin: 800,
          projectedMax: 1200,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 800,
          rawProjectedMax: 1200,
          minSubsidyPayback: 0,
          items: [
            {
              workItemId: 'wi-src-1',
              title: 'Sourced Work Item',
              projectedMin: 800,
              projectedMax: 1200,
              actualCost: 0,
              subsidyPayback: 0,
              rawProjectedMin: 800,
              rawProjectedMax: 1200,
              minSubsidyPayback: 0,
              costDisplay: 'projected',
              budgetLines: [
                {
                  id: opts.lineId ?? 'sourced-line-1',
                  description: 'Sourced budget line',
                  plannedAmount: 1000,
                  confidence: 'own_estimate',
                  actualCost: 0,
                  hasInvoice: false,
                  isQuotation: false,
                  budgetSourceId: opts.budgetSourceId,
                },
              ],
            },
          ],
          children: [],
        },
      ],
      totals: {
        projectedMin: 800,
        projectedMax: 1200,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 800,
        rawProjectedMax: 1200,
        minSubsidyPayback: 0,
      },
    },
    householdItems: {
      areas: [],
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
    subsidyAdjustments: [],
    budgetSources: opts.budgetSources ?? [],
  };
}

/**
 * Build a breakdown with two WI items in the same area — one with a source, one without.
 */
function buildBreakdownWithMixedSourceLines(opts: {
  sourceId: string;
  sourceName: string;
}): BudgetBreakdown {
  return {
    workItems: {
      areas: [
        {
          areaId: null,
          name: 'Unassigned',
          parentId: null,
          color: null,
          projectedMin: 1600,
          projectedMax: 2400,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 1600,
          rawProjectedMax: 2400,
          minSubsidyPayback: 0,
          items: [
            {
              workItemId: 'wi-mix-1',
              title: 'With Source',
              projectedMin: 800,
              projectedMax: 1200,
              actualCost: 0,
              subsidyPayback: 0,
              rawProjectedMin: 800,
              rawProjectedMax: 1200,
              minSubsidyPayback: 0,
              costDisplay: 'projected',
              budgetLines: [
                {
                  id: 'mix-line-src',
                  description: 'Line with source',
                  plannedAmount: 1000,
                  confidence: 'own_estimate',
                  actualCost: 0,
                  hasInvoice: false,
                  isQuotation: false,
                  budgetSourceId: opts.sourceId,
                },
              ],
            },
            {
              workItemId: 'wi-mix-2',
              title: 'Without Source',
              projectedMin: 800,
              projectedMax: 1200,
              actualCost: 0,
              subsidyPayback: 0,
              rawProjectedMin: 800,
              rawProjectedMax: 1200,
              minSubsidyPayback: 0,
              costDisplay: 'projected',
              budgetLines: [
                {
                  id: 'mix-line-null',
                  description: 'Unassigned line',
                  plannedAmount: 1000,
                  confidence: 'own_estimate',
                  actualCost: 0,
                  hasInvoice: false,
                  isQuotation: false,
                  budgetSourceId: null,
                },
              ],
            },
          ],
          children: [],
        },
      ],
      totals: {
        projectedMin: 1600,
        projectedMax: 2400,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 1600,
        rawProjectedMax: 2400,
        minSubsidyPayback: 0,
      },
    },
    householdItems: {
      areas: [],
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
    subsidyAdjustments: [],
    budgetSources: [
      {
        id: opts.sourceId,
        name: opts.sourceName,
        totalAmount: 100000,
        projectedMin: 800,
        projectedMax: 1200,
      },
    ],
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    expect(screen.getByText('Available funds')).toBeInTheDocument();
    expect(screen.getByText('€50,000.00')).toBeInTheDocument();
  });

  it('shows Sum and Remaining labels in bottom totals rows', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ projectedMin: 800, projectedMax: 1200 })}
        overview={buildOverview(100000)}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    // The bottom totals section has a 'Sum' row and a 'Remaining Budget' row.
    expect(screen.getByText('Sum')).toBeInTheDocument();
    expect(screen.getByText('Remaining Budget')).toBeInTheDocument();
  });

  it('shows Work Items label in summary', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    expect(screen.getByText('Work Items')).toBeInTheDocument();
  });

  it('shows Household Items label in summary', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithHI()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    expect(screen.getByText('Household Items')).toBeInTheDocument();
  });

  // ── 17. WI section collapsed by default ─────────────────────────────────

  it('does not show WI category rows when section is collapsed (default)', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    // Area name 'No Area' should not be visible yet (inside collapsed section)
    expect(screen.queryByText('No Area')).not.toBeInTheDocument();
  });

  // ── 18. Click WI section toggle — area rows appear ───────────────────────

  it('shows WI area rows after clicking the WI section toggle', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    // buildBreakdownWithWI places items in the "No Area" node
    expect(screen.getByText('No Area')).toBeInTheDocument();
  });

  it('sets aria-expanded=true on WI toggle button after clicking', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    const wiToggle = getButtonByControls(container, 'wi-section-categories');
    expect(wiToggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(wiToggle);

    expect(wiToggle).toHaveAttribute('aria-expanded', 'true');
  });

  // ── 19. Area row expand — item rows appear ───────────────────────────────

  it('shows item rows after expanding the WI section then an area', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({ itemTitle: 'City Permit', workItemId: 'wi-permit' }),
      buildOverview(),
    );

    // Expand WI section
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    // Expand No Area: aria-label="Expand No Area"
    fireEvent.click(getButtonByControls(container, 'area:No Area'));

    expect(screen.getByText('City Permit')).toBeInTheDocument();
  });

  // ── 20. Item row expand — budget line rows appear ────────────────────────

  it('shows budget line rows after expanding to item level', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        itemTitle: 'Crane Rental',
        workItemId: 'wi-crane',
        description: 'Tower crane for 3 weeks',
      }),
      buildOverview(),
    );

    // Expand WI section → area → item
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'area:No Area'));
    fireEvent.click(getButtonByLabel('Expand Crane Rental'));

    expect(screen.getByText('Tower crane for 3 weeks')).toBeInTheDocument();
  });

  it('shows "Untitled" for budget lines without a description', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        itemTitle: 'Architect Fee',
        workItemId: 'wi-arch',
        description: null,
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'area:No Area'));
    fireEvent.click(getButtonByLabel('Expand Architect Fee'));

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
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'area:No Area'));

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

  it('shows projected cost value in item row for costDisplay=mixed (no rowMixed class)', () => {
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

    // rowMixed class is no longer applied to item rows (green tinting removed)
    const mixedRows = container.querySelectorAll('tr.rowMixed');
    expect(mixedRows.length).toBe(0);
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

  // ── 26. Multiple WI areas render after expanding WI section ──────────────

  it('renders both area nodes after expanding WI section', () => {
    const breakdown: BudgetBreakdown = {
      workItems: {
        areas: [
          {
            areaId: 'area-kitchen',
            name: 'Kitchen',
            parentId: null,
            color: null,
            projectedMin: 800,
            projectedMax: 1200,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 800,
            rawProjectedMax: 1200,
            minSubsidyPayback: 0,
            items: [],
            children: [],
          },
          {
            areaId: 'area-bathroom',
            name: 'Bathroom',
            parentId: null,
            color: null,
            projectedMin: 500,
            projectedMax: 700,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 500,
            rawProjectedMax: 700,
            minSubsidyPayback: 0,
            items: [],
            children: [],
          },
        ],
        totals: {
          projectedMin: 1300,
          projectedMax: 1900,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 1300,
          rawProjectedMax: 1900,
          minSubsidyPayback: 0,
        },
      },
      householdItems: {
        areas: [],
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
      subsidyAdjustments: [],
      budgetSources: [],
    };

    const { container } = render(
      <CostBreakdownTable
        breakdown={breakdown}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    // Expand WI section
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Bathroom')).toBeInTheDocument();
  });

  it('renders "No Area" area node when items have no area', () => {
    const breakdown: BudgetBreakdown = {
      workItems: {
        areas: [
          {
            areaId: null,
            name: 'Unassigned',
            parentId: null,
            color: null,
            projectedMin: 400,
            projectedMax: 600,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 400,
            rawProjectedMax: 600,
            minSubsidyPayback: 0,
            items: [],
            children: [],
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
        areas: [],
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
      subsidyAdjustments: [],
      budgetSources: [],
    };

    const { container } = render(
      <CostBreakdownTable
        breakdown={breakdown}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    expect(screen.getByText('No Area')).toBeInTheDocument();
  });

  // ── 27. HI section shows alongside WI section ──────────────────────────────

  it('shows HI section even when WI section has no areas', () => {
    const breakdown: BudgetBreakdown = {
      workItems: {
        areas: [],
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
        areas: [
          {
            areaId: 'area-hi-lr',
            name: 'Living Room',
            parentId: null,
            color: null,
            projectedMin: 300,
            projectedMax: 500,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 300,
            rawProjectedMax: 500,
            minSubsidyPayback: 0,
            items: [],
            children: [],
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
      subsidyAdjustments: [],
      budgetSources: [],
    };

    render(
      <CostBreakdownTable
        breakdown={breakdown}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    // HI section should still be visible
    expect(screen.getByText('Household Items')).toBeInTheDocument();
  });

  // ── 28. Remaining value positive → valuePositive CSS class ───────────────

  it('applies valuePositive CSS class when remaining is positive', () => {
    // availableFunds=100000, projectedMax=1200 → remaining = 98800 > 0
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({ projectedMax: 1200 })}
        overview={buildOverview(100000)}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    expect(screen.getByText(/no budget data to display/i)).toBeInTheDocument();
  });

  it('does not render the table when in empty state', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildEmptyBreakdown()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    expect(container.querySelector('table')).not.toBeInTheDocument();
  });

  it('still renders the heading when in empty state', () => {
    render(
      <CostBreakdownTable
        breakdown={buildEmptyBreakdown()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    const wiToggle = getButtonByControls(container, 'wi-section-categories');
    expect(wiToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('area toggle button has aria-expanded after WI section expanded', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    const areaToggle = getButtonByControls(container, 'area:No Area');
    expect(areaToggle).toHaveAttribute('aria-expanded');
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
    fireEvent.click(getButtonByControls(container, 'area:No Area'));

    const itemToggle = getButtonByLabel('Expand Home Insurance');
    expect(itemToggle).toHaveAttribute('aria-expanded');
  });

  // ── HI section expansion ───────────────────────────────────────────────────

  it('shows HI category label after expanding HI section', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithHI({ hiCategory: 'Home Office' })}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));

    // "Home Office" is the user-defined category name used directly as the display label
    expect(screen.getByText('Home Office')).toBeInTheDocument();
  });

  it('shows HI item name after expanding HI section and HI area', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithHI({
        hiCategory: 'Kitchen',
        itemName: 'Dishwasher',
        householdItemId: 'hi-dishwasher',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));
    // HI area expand button is initially collapsed → aria-label="Expand {name}"
    fireEvent.click(getButtonByControls(container, 'hi-area:Kitchen'));

    expect(screen.getByText('Dishwasher')).toBeInTheDocument();
  });

  // ── Toggle collapse ────────────────────────────────────────────────────────

  it('collapses WI area rows when toggle is clicked a second time', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    const wiToggle = getButtonByControls(container, 'wi-section-categories');

    // Expand
    fireEvent.click(wiToggle);
    expect(screen.getByText('No Area')).toBeInTheDocument();

    // Collapse
    fireEvent.click(wiToggle);
    expect(screen.queryByText('No Area')).not.toBeInTheDocument();
  });

  // ── Table structure — Column Headers ──────────────────────────────────────

  // Scenario 7: Cost column header says "Cost" (not "Budget")
  it('renders "Cost" as the cost column header (not "Budget")', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /^net$/i })).toBeInTheDocument();
  });

  it('renders table column headers: Name, Cost, Payback, Net', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^cost$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /payback/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^net$/i })).toBeInTheDocument();
  });

  // ── Level-0 Row Names (Scenario 9) ────────────────────────────────────────

  it('level-0 rows are labeled "Work Items", "Household Items", "Sum", "Available funds", "Remaining Budget"', () => {
    const breakdown: BudgetBreakdown = {
      workItems: {
        areas: [
          {
            areaId: 'area-1',
            name: 'Kitchen',
            parentId: null,
            color: null,
            projectedMin: 500,
            projectedMax: 700,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 500,
            rawProjectedMax: 700,
            minSubsidyPayback: 0,
            items: [],
            children: [],
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
        areas: [
          {
            areaId: 'area-hi-1',
            name: 'Living Room',
            parentId: null,
            color: null,
            projectedMin: 200,
            projectedMax: 300,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 200,
            rawProjectedMax: 300,
            minSubsidyPayback: 0,
            items: [],
            children: [],
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
      subsidyAdjustments: [],
      budgetSources: [],
    };

    render(
      <CostBreakdownTable
        breakdown={breakdown}
        overview={buildOverview(100000)}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    expect(screen.getByText('Work Items')).toBeInTheDocument();
    expect(screen.getByText('Household Items')).toBeInTheDocument();
    expect(screen.getByText('Sum')).toBeInTheDocument();
    expect(screen.getByText('Available funds')).toBeInTheDocument();
    expect(screen.getByText('Remaining Budget')).toBeInTheDocument();
  });

  // ── Category sum row visibility — Bug #585 fix ────────────────────────────
  // After Bug #585 was fixed, the "Total {category}" sum row no longer renders.
  // The category header row still shows the category name with cost values.

  it('does not show a "Total {area}" sum row after expanding a WI area (Bug #585)', () => {
    const { container } = renderWithRouter(buildBreakdownWithWI(), buildOverview());

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'area:No Area'));

    // Area header row still shows the area name
    expect(screen.getByText('No Area')).toBeInTheDocument();
    // But no "Total No Area" sum row should appear
    expect(screen.queryByText('Total No Area')).not.toBeInTheDocument();
  });

  it('does not show a "Total {area}" sum row after expanding an HI area (Bug #585)', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithHI({ hiCategory: 'Garage', householdItemId: 'hi-stor' }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'hi-area:Garage'));

    // Area header row still shows the area name
    expect(screen.getByText('Garage')).toBeInTheDocument();
    // But no "Total Garage" sum row should appear
    expect(screen.queryByText('Total Garage')).not.toBeInTheDocument();
  });

  // ── "No Area" node for null-area WI items ────────────────────────────────

  it('renders WI item with null areaId under "No Area" label', () => {
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    expect(screen.getByText('No Area')).toBeInTheDocument();
  });

  // ── Perspective Toggle (Scenarios 1–6) ────────────────────────────────────

  // Scenario 1: "Avg" is active by default
  it('renders with "Avg" segment active by default (aria-checked="true")', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
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

  // Scenario 10: costDisplay === 'actual' → NO rowActual CSS class on <tr> (green tinting removed)
  // Instead, an "invoiced" badge is shown next to the item title.
  it('work item with costDisplay=actual does NOT have rowActual CSS class on its row', () => {
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

    // rowActual class is no longer applied to work item rows (green tinting removed)
    const level2Rows = container.querySelectorAll('.rowLevel2');
    expect(level2Rows.length).toBeGreaterThan(0);
    level2Rows.forEach((row) => {
      expect(row.getAttribute('class') ?? '').not.toContain('rowActual');
    });
  });

  // Scenario 11: costDisplay === 'mixed' → NO rowMixed CSS class on <tr> (green tinting removed)
  it('work item with costDisplay=mixed does NOT have rowMixed CSS class on its row', () => {
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

    // rowMixed class is no longer applied (green tinting removed)
    const mixedRows = container.querySelectorAll('.rowMixed');
    expect(mixedRows.length).toBe(0);
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

  // Scenario 13: budget line with hasInvoice===true → "invoiced" badge shown, NO rowActual class
  it('budget line with hasInvoice=true shows "invoiced" badge and does NOT have rowActual CSS class', () => {
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
    fireEvent.click(getButtonByControls(container, 'area:No Area'));
    fireEvent.click(getButtonByLabel('Expand Foundation Work'));

    // Budget line row (level 3) with hasInvoice shows "invoiced" badge (not rowActual class)
    const invoicedBadges = container.querySelectorAll('.invoicedBadge');
    expect(invoicedBadges.length).toBeGreaterThan(0);

    // rowActual class is no longer applied to budget line rows (green tinting removed)
    const level3Rows = container.querySelectorAll('.rowLevel3');
    expect(level3Rows.length).toBeGreaterThan(0);
    level3Rows.forEach((row) => {
      expect(row.getAttribute('class') ?? '').not.toContain('rowActual');
    });
  });

  // ── Available Funds Expansion (Scenarios 14–17) ───────────────────────────

  // Scenario 14: no budgetSources → no expand button on Available Funds
  it('Available Funds row has no expand button when budgetSources is empty', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview(100000)}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
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
        breakdown={{
          ...buildBreakdownWithWI(),
          budgetSources: [
            buildSourceSummary({ id: 'src-1', name: 'Bank Loan', totalAmount: 80000 }),
          ],
        }}
        overview={buildOverview(100000)}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
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
        breakdown={{
          ...buildBreakdownWithWI(),
          budgetSources: [
            buildSourceSummary({ id: 'src-1', name: 'Savings Account', totalAmount: 50000 }),
            buildSourceSummary({ id: 'src-2', name: 'Bank Loan', totalAmount: 80000 }),
          ],
        }}
        overview={buildOverview(130000)}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    const expandBtn = screen.getByRole('button', { name: /expand available funds/i });
    fireEvent.click(expandBtn);

    // Source names appear in both chip strip AND sub-rows — 2 of each
    expect(screen.getAllByText('Savings Account')).toHaveLength(2);
    expect(screen.getAllByText('Bank Loan')).toHaveLength(2);

    // Sub-row totalAmount values are unique to the sub-rows
    expect(screen.getByText('€50,000.00')).toBeInTheDocument();
    expect(screen.getByText('€80,000.00')).toBeInTheDocument();
  });

  // Scenario 17: clicking expand again collapses source rows
  it('clicking Available Funds expand again collapses source sub-rows', () => {
    render(
      <CostBreakdownTable
        breakdown={{
          ...buildBreakdownWithWI(),
          budgetSources: [
            buildSourceSummary({ id: 'src-1', name: 'Credit Line', totalAmount: 60000 }),
          ],
        }}
        overview={buildOverview(100000)}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    const expandBtn = screen.getByRole('button', { name: /expand available funds/i });

    // Expand: source name appears in both chip strip and sub-row
    fireEvent.click(expandBtn);
    expect(screen.getAllByText('Credit Line')).toHaveLength(2);

    // Collapse: chip strip and sub-row both unmount (both gated by availFundsExpanded)
    fireEvent.click(expandBtn);
    expect(screen.queryByText('Credit Line')).not.toBeInTheDocument();
  });

  // ── Remaining Row Calculation (Scenarios 18–21) ──────────────────────────
  // Note: these values now appear in the Remaining row (not Sum row).
  // Remaining Cost = availableFunds - totalRawProjected
  // Remaining Net  = availableFunds - totalRawProjected + totalPayback (from breakdown totals)

  // Scenario 18: Remaining Net for default Avg perspective
  // Remaining Net uses perspective-resolved payback: resolveProjected(minPayback, maxPayback, perspective)
  it('Remaining Net = availableFunds - avgRawProjected + resolvedPayback for default Avg perspective', () => {
    // availableFunds=10000
    // rawProjectedMin=3000, rawProjectedMax=5000 → avgRaw=4000
    // minSubsidyPayback=800, subsidyPayback=1200 → avgPayback=resolveProjected(800,1200,'avg')=1000
    // Remaining Net = 10000 - 4000 + 1000 = 7000
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    // Default perspective is Avg: Remaining Net = 10000 - 4000 + 1000 = 7000
    expect(screen.getByText('€7,000.00')).toBeInTheDocument();
  });

  // Scenario 19: Max perspective uses subsidyPayback (max) and rawProjectedMax
  it('Max perspective uses subsidyPayback and rawProjectedMax for Remaining Net', () => {
    // availableFunds=20000
    // rawProjectedMax=8000, subsidyPayback=2000
    // Remaining Net (Max) = 20000 - 8000 + 2000 = 14000
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    // Switch to Max perspective
    fireEvent.click(screen.getByRole('radio', { name: 'Max' }));

    // Remaining Net (Max) = 20000 - 8000 + 2000 = 14000
    expect(screen.getByText('€14,000.00')).toBeInTheDocument();
  });

  // Scenario 20: Min perspective uses rawProjectedMin and minSubsidyPayback for Remaining Net
  it('Min perspective: Remaining Net = availableFunds - rawProjectedMin + minSubsidyPayback', () => {
    // availableFunds=20000
    // rawProjectedMin=5000; minSubsidyPayback=1000 → resolveProjected(1000, 2000, 'min') = 1000
    // Remaining Net (Min) = 20000 - 5000 + 1000 = 16000
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Min' }));

    // Remaining Net (Min) = 20000 - 5000 + 1000 = 16000
    expect(screen.getByText('€16,000.00')).toBeInTheDocument();
  });

  // Scenario 21: Avg perspective averages both rawProjected and payback for Remaining Net
  it('Avg perspective averages both rawProjected and payback for Remaining Net', () => {
    // availableFunds=20000
    // rawProjectedMin=5000, rawProjectedMax=8000 → avgRaw=resolveProjected(5000,8000,'avg')=6500
    // minSubsidyPayback=1000, subsidyPayback=2000 → avgPayback=resolveProjected(1000,2000,'avg')=1500
    // Remaining Net (Avg) = 20000 - 6500 + 1500 = 15000
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    // Avg is default — no need to click
    // Remaining Net (Avg) = 20000 - 6500 + 1500 = 15000
    expect(screen.getByText('€15,000.00')).toBeInTheDocument();
  });

  // ── New Scenarios (Issue #493) ─────────────────────────────────────────────

  // Scenario 8: Toggle order — Min first, Avg second, Max third
  it('perspective toggle renders buttons in order: Min, Avg, Max', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
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
  it('work item name in item row is an anchor link to /project/work-items/{workItemId}', () => {
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
    expect(link).toHaveAttribute('href', '/project/work-items/wi-link-test');
  });

  // Scenario 12: Household item name is a link with correct href
  it('household item name in item row is an anchor link to /project/household-items/{householdItemId}', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithHI({
        hiCategory: 'Bathroom',
        householdItemId: 'hi-link-test',
        itemName: 'Bathroom Sink',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'hi-cat-Bathroom-items'));

    const link = screen.getByRole('link', { name: 'Bathroom Sink' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/project/household-items/hi-link-test');
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

  // Regression: user-defined HI category name is used directly as the display label
  it('shows user-defined HI category name after expanding HI section', () => {
    const { container } = render(
      <MemoryRouter>
        <CostBreakdownTable
          breakdown={buildBreakdownWithHI({ hiCategory: 'Master Bedroom' })}
          overview={buildOverview()}
          selectedSourceIds={new Set()}
          onSourceToggle={() => {}}
          onClearSources={() => {}}
        />
      </MemoryRouter>,
    );

    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));
    expect(screen.getByText('Master Bedroom')).toBeInTheDocument();
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
    // Net (Avg) = payback - rawCost = 90 - 1000 = -910 → "-€910.00"
    const netCells = container.querySelectorAll('td.colRemaining');
    const nonEmptyNetCells = Array.from(netCells).filter((td) => td.textContent?.trim() !== '');
    expect(nonEmptyNetCells.length).toBeGreaterThan(0);
    // No range format — single value only
    expect(container.textContent).not.toContain('€900.00 – €920.00');
    expect(container.textContent).toContain('-€910.00');
  });

  // Scenario 17: "Sum" label appears AND "Remaining Budget" row also appears
  it('"Sum" label appears in summary section and "Remaining Budget" row is also present', () => {
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI()}
        overview={buildOverview()}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    expect(screen.getByText('Sum')).toBeInTheDocument();
    expect(screen.getByText('Remaining Budget')).toBeInTheDocument();
  });

  // Scenario 18: Sum row Cost = -totalRawProjected (Avg default)
  it('Sum row Cost column = negative totalRawProjected for Avg perspective', () => {
    // availableFunds=10000, rawProjectedMin=3000, rawProjectedMax=5000
    // Avg raw = (3000+5000)/2 = 4000
    // Sum Cost = -€4,000.00 (formatCost of totalRawProjected)
    // Remaining Cost = 10000 - 4000 = 6000 → €6,000.00
    render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          projectedMin: 3000,
          projectedMax: 5000,
          rawProjectedMin: 3000,
          rawProjectedMax: 5000,
        })}
        overview={buildOverview(10000)}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    // Sum row Cost column shows "-€4,000.00" (negative raw projected cost)
    expect(screen.getAllByText('-€4,000.00').length).toBeGreaterThanOrEqual(1);
    // Remaining row Cost column shows "€6,000.00" (availableFunds - totalRawProjected)
    expect(screen.getAllByText('€6,000.00').length).toBeGreaterThanOrEqual(1);
  });

  // Scenario 19: Sum Net and Remaining Net (perspective-aware)
  it('Sum Net = resolvedPayback - totalRawProjected; Remaining Net = availableFunds - totalRawProjected + resolvedPayback', () => {
    // availableFunds=10000, rawProjectedMin=3000, rawProjectedMax=5000
    // Avg raw = resolveProjected(3000, 5000, 'avg') = 4000
    // minSubsidyPayback=100, subsidyPayback=200 → avgPayback=resolveProjected(100,200,'avg')=150
    // Sum Net = payback - rawCost = 150 - 4000 = -3850 → "-€3,850.00"
    // Remaining Net = 10000 - 4000 + 150 = 6150 → "€6,150.00"
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
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    // Sum Net = payback - rawCost = 150 - 4000 = -3850
    // (may appear multiple times across section rows and Sum row)
    expect(screen.getAllByText('-€3,850.00').length).toBeGreaterThanOrEqual(1);
    // Remaining Net = availableFunds - totalRawProjected + resolvedPayback = 10000 - 4000 + 150 = 6150
    expect(screen.getByText('€6,150.00')).toBeInTheDocument();
  });

  // Scenario 20: Remaining row Cost shows availableFunds - totalRawProjected with positive/negative coloring
  it('Remaining row Cost shows availableFunds - totalRawProjected with green color when positive', () => {
    // availableFunds=10000, rawProjectedMin=3000, rawProjectedMax=5000 → avgRaw=4000
    // Remaining Cost = 10000 - 4000 = 6000 → positive → valuePositive CSS class
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          projectedMin: 3000,
          projectedMax: 5000,
          rawProjectedMin: 3000,
          rawProjectedMax: 5000,
        })}
        overview={buildOverview(10000)}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    // Remaining Budget row Cost column shows "€6,000.00" (positive, so valuePositive class)
    const positiveSpan = container.querySelector('.valuePositive');
    expect(positiveSpan).not.toBeNull();
    expect(screen.getByText('Remaining Budget')).toBeInTheDocument();
    expect(screen.getAllByText('€6,000.00').length).toBeGreaterThanOrEqual(1);
  });

  it('Remaining row Cost shows availableFunds - totalRawProjected with red color when negative', () => {
    // availableFunds=100, rawProjectedMin=5000, rawProjectedMax=5000 → avgRaw=5000
    // Remaining Cost = 100 - 5000 = -4900 → negative → valueNegative CSS class
    const { container } = render(
      <CostBreakdownTable
        breakdown={buildBreakdownWithWI({
          projectedMin: 5000,
          projectedMax: 5000,
          rawProjectedMin: 5000,
          rawProjectedMax: 5000,
        })}
        overview={buildOverview(100)}
        selectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onClearSources={() => {}}
      />,
    );

    const negativeSpan = container.querySelector('.valueNegative');
    expect(negativeSpan).not.toBeNull();
    expect(screen.getByText('Remaining Budget')).toBeInTheDocument();
  });

  // ── Invoiced Badge (Issue #575) ────────────────────────────────────────────

  // Budget line: hasInvoice=true → "invoiced" badge; no confidence pill
  it('budget line with hasInvoice=true shows "invoiced" badge text', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'actual',
        actualCost: 600,
        projectedMin: 600,
        projectedMax: 600,
        hasInvoice: true,
        categoryName: 'Materials',
        categoryId: 'cat-inv-badge',
        workItemId: 'wi-inv-badge',
        description: 'Concrete supply',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'area:No Area'));
    fireEvent.click(getButtonByLabel('Expand Foundation Work'));

    // Both the work item row (costDisplay=actual) and the budget line row (hasInvoice=true)
    // show "invoiced" badges — verify at least one is present.
    const invoicedBadges = screen.getAllByText('invoiced');
    expect(invoicedBadges.length).toBeGreaterThanOrEqual(1);

    // Confirm at least one badge appears in a level-3 budget line row
    const level3Rows = container.querySelectorAll('.rowLevel3');
    expect(level3Rows.length).toBeGreaterThan(0);
    const level3HasInvoicedBadge = Array.from(level3Rows).some((row) =>
      row.textContent?.includes('invoiced'),
    );
    expect(level3HasInvoicedBadge).toBe(true);
  });

  // Budget line: hasInvoice=true → confidence text NOT shown in name cell
  it('budget line with hasInvoice=true does not show confidence text (e.g., "own estimate")', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'actual',
        actualCost: 700,
        projectedMin: 700,
        projectedMax: 700,
        hasInvoice: true,
        categoryName: 'Labor',
        categoryId: 'cat-no-conf',
        workItemId: 'wi-no-conf',
        description: 'Electrician',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'area:No Area'));
    fireEvent.click(getButtonByLabel('Expand Foundation Work'));

    // Confidence badge text "own estimate" must NOT appear when hasInvoice=true
    expect(screen.queryByText('own estimate')).not.toBeInTheDocument();
  });

  // Budget line: hasInvoice=false → confidence pill is shown, no "invoiced" badge
  it('budget line with hasInvoice=false shows confidence pill and no "invoiced" badge', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'projected',
        projectedMin: 800,
        projectedMax: 1200,
        hasInvoice: false,
        categoryName: 'Design',
        categoryId: 'cat-conf-pill',
        workItemId: 'wi-conf-pill',
        description: 'Architect plan',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'area:No Area'));
    fireEvent.click(getButtonByLabel('Expand Foundation Work'));

    // Confidence level "own_estimate" renders as "own estimate" in ConfidenceBadge
    expect(screen.getByText('own estimate')).toBeInTheDocument();
    // "invoiced" badge must NOT appear
    expect(screen.queryByText('invoiced')).not.toBeInTheDocument();
  });

  // Work item: costDisplay=actual → "invoiced" badge shown next to item title
  it('work item with costDisplay=actual shows "invoiced" badge next to its title', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'actual',
        actualCost: 1200,
        projectedMin: 1200,
        projectedMax: 1200,
        categoryName: 'Permits',
        categoryId: 'cat-wi-inv-badge',
        workItemId: 'wi-wi-inv-badge',
        itemTitle: 'Building Permit',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-wi-inv-badge-items'));

    // "invoiced" badge should appear in the work item row name cell
    expect(screen.getByText('invoiced')).toBeInTheDocument();
  });

  // Work item: costDisplay=mixed → NO "invoiced" badge next to item title
  it('work item with costDisplay=mixed does NOT show "invoiced" badge next to its title', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'mixed',
        actualCost: 400,
        projectedMin: 800,
        projectedMax: 1200,
        rawProjectedMin: 800,
        rawProjectedMax: 1200,
        categoryName: 'Utilities',
        categoryId: 'cat-wi-mixed-badge',
        workItemId: 'wi-mixed-badge',
        itemTitle: 'Plumbing Rough-in',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-wi-mixed-badge-items'));

    // "invoiced" badge must NOT appear for partially invoiced (mixed) items
    expect(screen.queryByText('invoiced')).not.toBeInTheDocument();
  });

  // Work item: costDisplay=projected → NO "invoiced" badge
  it('work item with costDisplay=projected does NOT show "invoiced" badge', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'projected',
        projectedMin: 500,
        projectedMax: 900,
        categoryName: 'Equipment',
        categoryId: 'cat-wi-proj-badge',
        workItemId: 'wi-proj-badge',
        itemTitle: 'Scaffolding Rental',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-wi-proj-badge-items'));

    expect(screen.queryByText('invoiced')).not.toBeInTheDocument();
  });

  // Household item: costDisplay=actual → "invoiced" badge shown next to item name
  it('household item with costDisplay=actual shows "invoiced" badge next to its name', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithHI({
        hiCategory: 'Kitchen',
        costDisplay: 'actual',
        actualCost: 2500,
        rawProjectedMin: 2500,
        rawProjectedMax: 2500,
        householdItemId: 'hi-inv-badge',
        itemName: 'Refrigerator',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'hi-cat-Kitchen-items'));

    // "invoiced" badge should appear in the household item row name cell
    expect(screen.getByText('invoiced')).toBeInTheDocument();
  });

  // Household item: costDisplay=mixed → NO "invoiced" badge
  it('household item with costDisplay=mixed does NOT show "invoiced" badge', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithHI({
        hiCategory: 'Bedroom',
        costDisplay: 'mixed',
        actualCost: 300,
        projectedMin: 600,
        projectedMax: 900,
        rawProjectedMin: 600,
        rawProjectedMax: 900,
        householdItemId: 'hi-mixed-badge',
        itemName: 'Wardrobe',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'hi-cat-Bedroom-items'));

    expect(screen.queryByText('invoiced')).not.toBeInTheDocument();
  });

  // No rowActual on level-3 rows regardless of hasInvoice (green tinting fully removed)
  it('budget line rows never have rowActual class regardless of hasInvoice value', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        costDisplay: 'actual',
        actualCost: 850,
        projectedMin: 850,
        projectedMax: 850,
        hasInvoice: true,
        categoryName: 'Landscaping',
        categoryId: 'cat-no-actual-cls',
        workItemId: 'wi-no-actual-cls',
        description: 'Garden irrigation',
      }),
      buildOverview(),
    );

    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'area:No Area'));
    fireEvent.click(getButtonByLabel('Expand Foundation Work'));

    const level3Rows = container.querySelectorAll('.rowLevel3');
    expect(level3Rows.length).toBeGreaterThan(0);
    level3Rows.forEach((row) => {
      expect(row.getAttribute('class') ?? '').not.toContain('rowActual');
    });
  });

  // ── Depth-driven indent (Issue #1295) ─────────────────────────────────────

  /**
   * Build a breakdown where the work item lives under a child area at depth 1.
   * Root area (depth 0, no items) → Child area (depth 1, one WI, optionally with budget lines).
   */
  function buildNestedBreakdownWithWI(opts: { budgetLines?: boolean } = {}): BudgetBreakdown {
    const budgetLines = opts.budgetLines ?? false;
    return {
      workItems: {
        areas: [
          {
            areaId: 'area-root',
            name: 'Root Area',
            parentId: null,
            color: null,
            projectedMin: 800,
            projectedMax: 1200,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 800,
            rawProjectedMax: 1200,
            minSubsidyPayback: 0,
            items: [],
            children: [
              {
                areaId: 'area-child',
                name: 'Child Area',
                parentId: 'area-root',
                color: null,
                projectedMin: 800,
                projectedMax: 1200,
                actualCost: 0,
                subsidyPayback: 0,
                rawProjectedMin: 800,
                rawProjectedMax: 1200,
                minSubsidyPayback: 0,
                items: [
                  {
                    workItemId: 'wi-nested',
                    title: 'Nested Work Item',
                    projectedMin: 800,
                    projectedMax: 1200,
                    actualCost: 0,
                    subsidyPayback: 0,
                    rawProjectedMin: 800,
                    rawProjectedMax: 1200,
                    minSubsidyPayback: 0,
                    costDisplay: 'projected',
                    budgetLines: budgetLines
                      ? [
                          {
                            id: 'line-nested-1',
                            description: 'Nested budget line',
                            plannedAmount: 1000,
                            confidence: 'own_estimate',
                            actualCost: 0,
                            hasInvoice: false,
                            isQuotation: false,
                            budgetSourceId: null,
                          },
                        ]
                      : [],
                  },
                ],
                children: [],
              },
            ],
          },
        ],
        totals: {
          projectedMin: 800,
          projectedMax: 1200,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 800,
          rawProjectedMax: 1200,
          minSubsidyPayback: 0,
        },
      },
      householdItems: {
        areas: [],
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
      subsidyAdjustments: [],
      budgetSources: [],
    };
  }

  /**
   * Build a breakdown where the household item lives under a child HI area at depth 1.
   */
  function buildNestedBreakdownWithHI(): BudgetBreakdown {
    return {
      workItems: {
        areas: [],
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
        areas: [
          {
            areaId: 'area-hi-root',
            name: 'HI Root Area',
            parentId: null,
            color: null,
            projectedMin: 400,
            projectedMax: 600,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 400,
            rawProjectedMax: 600,
            minSubsidyPayback: 0,
            items: [],
            children: [
              {
                areaId: 'area-hi-child',
                name: 'HI Child Area',
                parentId: 'area-hi-root',
                color: null,
                projectedMin: 400,
                projectedMax: 600,
                actualCost: 0,
                subsidyPayback: 0,
                rawProjectedMin: 400,
                rawProjectedMax: 600,
                minSubsidyPayback: 0,
                items: [
                  {
                    householdItemId: 'hi-nested',
                    name: 'Nested HI Item',
                    projectedMin: 400,
                    projectedMax: 600,
                    actualCost: 0,
                    subsidyPayback: 0,
                    rawProjectedMin: 400,
                    rawProjectedMax: 600,
                    minSubsidyPayback: 0,
                    costDisplay: 'projected',
                    budgetLines: [],
                  },
                ],
                children: [],
              },
            ],
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
      subsidyAdjustments: [],
      budgetSources: [],
    };
  }

  // Scenario A — Work item at depth 0 has `--item-depth: 0`
  it('Scenario A: work item at depth 0 renders name cell with --item-depth: 0', () => {
    const { container } = renderWithRouter(buildBreakdownWithWI(), buildOverview());

    // Expand WI section then the No Area node
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'area:No Area'));

    // The work item row name cell (cellLevel2Name) should have --item-depth: 0
    const nameCell = container.querySelector('td.cellLevel2Name');
    expect(nameCell).not.toBeNull();
    expect(nameCell).toHaveStyle({ '--item-depth': '0' });
  });

  // Scenario B — Work item in a depth-1 (nested) area has `--item-depth: 1`
  it('Scenario B: work item in a depth-1 child area renders name cell with --item-depth: 1', () => {
    const { container } = renderWithRouter(buildNestedBreakdownWithWI(), buildOverview());

    // Expand WI section → Root Area → Child Area
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByLabel('Expand Root Area'));
    fireEvent.click(getButtonByLabel('Expand Child Area'));

    // The work item row name cell should have --item-depth: 1 (child area depth)
    const nameCell = container.querySelector('td.cellLevel2Name');
    expect(nameCell).not.toBeNull();
    expect(nameCell).toHaveStyle({ '--item-depth': '1' });
  });

  // Scenario C — Budget line inherits parent work item's depth
  it('Scenario C: budget line in a depth-1 area renders name cell with --item-depth: 1', () => {
    const { container } = renderWithRouter(
      buildNestedBreakdownWithWI({ budgetLines: true }),
      buildOverview(),
    );

    // Expand WI section → Root Area → Child Area → work item
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByLabel('Expand Root Area'));
    fireEvent.click(getButtonByLabel('Expand Child Area'));
    fireEvent.click(getButtonByLabel('Expand Nested Work Item'));

    // The budget line row name cell (cellLevel3Name) should have --item-depth: 1
    const budgetLineNameCell = container.querySelector('td.cellLevel3Name');
    expect(budgetLineNameCell).not.toBeNull();
    expect(budgetLineNameCell).toHaveStyle({ '--item-depth': '1' });
  });

  // Scenario D — Household item at depth 1 has `--item-depth: 1`
  it('Scenario D: household item in a depth-1 child area renders name cell with --item-depth: 1', () => {
    const { container } = renderWithRouter(buildNestedBreakdownWithHI(), buildOverview());

    // Expand HI section → HI Root Area → HI Child Area
    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));
    fireEvent.click(getButtonByLabel('Expand HI Root Area'));
    fireEvent.click(getButtonByLabel('Expand HI Child Area'));

    // The household item row name cell should have --item-depth: 1
    const nameCell = container.querySelector('td.cellLevel2Name');
    expect(nameCell).not.toBeNull();
    expect(nameCell).toHaveStyle({ '--item-depth': '1' });
  });

  // Scenario E — "No Area" label renders in WI section after expansion (AC2 regression)
  it('Scenario E: "No Area" label renders in WI section after expansion and "Unassigned" is absent', () => {
    renderWithRouter(buildBreakdownWithWI(), buildOverview());

    // Expand WI section
    fireEvent.click(screen.getByRole('button', { name: 'Expand work item budget by area' }));

    // "No Area" should appear
    expect(screen.getByText('No Area')).toBeInTheDocument();
    // "Unassigned" must NOT appear anywhere in the rendered output
    expect(screen.queryByText('Unassigned')).not.toBeInTheDocument();
  });

  // Scenario F — "No Area" label renders in HI section after expansion (AC2 regression)
  it('Scenario F: "No Area" label renders in HI section after expansion', () => {
    renderWithRouter(buildBreakdownWithHI(), buildOverview());

    // Expand HI section
    fireEvent.click(screen.getByRole('button', { name: 'Expand household item budget by area' }));

    // "No Area" should appear
    expect(screen.getByText('No Area')).toBeInTheDocument();
  });
});

// ── Bug #585 — Sum row not rendered after category expansion ─────────────────

describe('Bug #585 — no "Total {category}" sum row after expand', () => {
  it('expanding WI section and a WI category does not render a "Total {category}" sum row', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithWI({
        categoryName: 'Permits',
        categoryId: 'cat-permits-585',
        itemTitle: 'City Permit',
        workItemId: 'wi-permit-585',
      }),
      buildOverview(),
    );

    // Expand WI section then the category
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'wi-cat-cat-permits-585-items'));

    // The item row is rendered (area-based UI — category name param is ignored, area is always No Area)
    expect(screen.getByText('City Permit')).toBeInTheDocument();

    // After the bug fix, no "Total Permits" sum row should appear
    expect(screen.queryByText(/^Total /)).not.toBeInTheDocument();
  });

  it('expanding HI section and an HI category does not render a "Total {hiCategory}" sum row', () => {
    const { container } = renderWithRouter(
      buildBreakdownWithHI({
        hiCategory: 'Appliances',
        householdItemId: 'hi-appl-585',
        itemName: 'Dishwasher',
      }),
      buildOverview(),
    );

    // Expand HI section then the category
    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'hi-cat-Appliances-items'));

    // The category header row still shows the category name
    expect(screen.getByText('Appliances')).toBeInTheDocument();

    // After the bug fix, no "Total Appliances" sum row should appear
    expect(screen.queryByText(/^Total /)).not.toBeInTheDocument();
  });
});

// ── Bug #586 — Independent expand state per category ─────────────────────────

describe('Bug #586 — item expand state is independent per category', () => {
  /**
   * Build a breakdown with two WI categories that both contain the same workItemId.
   * This is the scenario that triggered Bug #586: shared expand state via plain item key.
   */
  function buildBreakdownTwoWICategories(): BudgetBreakdown {
    const sharedItem = {
      workItemId: 'wi-shared',
      title: 'Shared Work Item',
      projectedMin: 500,
      projectedMax: 700,
      actualCost: 0,
      subsidyPayback: 0,
      rawProjectedMin: 500,
      rawProjectedMax: 700,
      minSubsidyPayback: 0,
      costDisplay: 'projected' as const,
      budgetLines: [
        {
          id: 'line-shared',
          description: 'Shared budget line',
          plannedAmount: 600,
          confidence: 'own_estimate' as const,
          actualCost: 0,
          hasInvoice: false,
          isQuotation: false,
          budgetSourceId: null,
        },
      ],
    };

    const areaBase = {
      projectedMin: 500,
      projectedMax: 700,
      actualCost: 0,
      subsidyPayback: 0,
      rawProjectedMin: 500,
      rawProjectedMax: 700,
      minSubsidyPayback: 0,
      parentId: null,
      color: null,
      children: [] as [],
    };

    return {
      workItems: {
        areas: [
          {
            ...areaBase,
            areaId: 'area-alpha',
            name: 'Alpha',
            items: [{ ...sharedItem }],
          },
          {
            ...areaBase,
            areaId: 'area-beta',
            name: 'Beta',
            items: [{ ...sharedItem }],
          },
        ],
        totals: {
          projectedMin: 1000,
          projectedMax: 1400,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 1000,
          rawProjectedMax: 1400,
          minSubsidyPayback: 0,
        },
      },
      householdItems: {
        areas: [],
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
      subsidyAdjustments: [],
      budgetSources: [],
    };
  }

  /**
   * Build a breakdown with two HI categories that both contain the same householdItemId.
   */
  function buildBreakdownTwoHICategories(): BudgetBreakdown {
    const sharedHIItem = {
      householdItemId: 'hi-shared',
      name: 'Shared HI Item',
      projectedMin: 300,
      projectedMax: 500,
      actualCost: 0,
      subsidyPayback: 0,
      rawProjectedMin: 300,
      rawProjectedMax: 500,
      minSubsidyPayback: 0,
      costDisplay: 'projected' as const,
      budgetLines: [
        {
          id: 'hi-line-shared',
          description: 'Shared HI budget line',
          plannedAmount: 400,
          confidence: 'own_estimate' as const,
          actualCost: 0,
          hasInvoice: false,
          isQuotation: false,
          budgetSourceId: null,
        },
      ],
    };

    const hiAreaBase = {
      projectedMin: 300,
      projectedMax: 500,
      actualCost: 0,
      subsidyPayback: 0,
      rawProjectedMin: 300,
      rawProjectedMax: 500,
      minSubsidyPayback: 0,
      parentId: null,
      color: null,
      children: [] as [],
    };

    return {
      workItems: {
        areas: [],
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
        areas: [
          {
            ...hiAreaBase,
            areaId: 'area-furniture',
            name: 'Furniture',
            items: [{ ...sharedHIItem }],
          },
          {
            ...hiAreaBase,
            areaId: 'area-appliances',
            name: 'Appliances',
            items: [{ ...sharedHIItem }],
          },
        ],
        totals: {
          projectedMin: 600,
          projectedMax: 1000,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 600,
          rawProjectedMax: 1000,
          minSubsidyPayback: 0,
        },
      },
      subsidyAdjustments: [],
      budgetSources: [],
    };
  }

  it('expanding item in cat-alpha does not auto-expand the same item in cat-beta (WI)', () => {
    const { container } = renderWithRouter(buildBreakdownTwoWICategories(), buildOverview());

    // Expand WI section
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    // Expand cat-alpha by clicking the button whose sibling text is "Alpha"
    const alphaBtn = Array.from(container.querySelectorAll<HTMLElement>('button.expandBtn')).find(
      (btn) => btn.nextElementSibling?.textContent?.trim() === 'Alpha',
    );
    expect(alphaBtn).not.toBeNull();
    fireEvent.click(alphaBtn!);

    // The item "Shared Work Item" is now visible under Alpha; expand it
    // The expand button has aria-label="Expand Shared Work Item"
    const expandItemBtns = screen.getAllByRole('button', { name: /Expand Shared Work Item/ });
    // Only one item row visible (Alpha is open, Beta is closed)
    expect(expandItemBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(expandItemBtns[0]!);

    // Budget line should be visible (item in alpha is expanded)
    expect(screen.getByText('Shared budget line')).toBeInTheDocument();

    // Now expand cat-beta
    const betaBtn = Array.from(container.querySelectorAll<HTMLElement>('button.expandBtn')).find(
      (btn) => btn.nextElementSibling?.textContent?.trim() === 'Beta',
    );
    expect(betaBtn).not.toBeNull();
    fireEvent.click(betaBtn!);

    // Beta is now expanded; the item row for "Shared Work Item" in Beta appears
    // but the budget lines under Beta's item must NOT be auto-expanded
    // There are now two expand buttons for "Shared Work Item" (one per category)
    const allItemBtns = screen.getAllByRole('button', { name: /Expand Shared Work Item/ });
    expect(allItemBtns.length).toBe(2);

    // The second button (Beta's item) must not be expanded (aria-expanded="false")
    expect(allItemBtns[1]).toHaveAttribute('aria-expanded', 'false');

    // There must be exactly one budget line visible (from Alpha's expanded item, not Beta's)
    const budgetLineCells = screen.getAllByText('Shared budget line');
    expect(budgetLineCells).toHaveLength(1);
  });

  it('expanding item in Furniture does not auto-expand the same item in Appliances (HI)', () => {
    const { container } = renderWithRouter(buildBreakdownTwoHICategories(), buildOverview());

    // Expand HI section
    fireEvent.click(getButtonByControls(container, 'hi-section-categories'));

    // Expand "Furniture" category
    fireEvent.click(getButtonByControls(container, 'hi-cat-Furniture-items'));

    // Expand the item in Furniture
    const itemBtnsAfterFurniture = screen.getAllByRole('button', { name: /Expand Shared HI Item/ });
    expect(itemBtnsAfterFurniture.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(itemBtnsAfterFurniture[0]!);

    // Budget line under Furniture's item is now visible
    expect(screen.getByText('Shared HI budget line')).toBeInTheDocument();

    // Expand "Appliances" category
    fireEvent.click(getButtonByControls(container, 'hi-cat-Appliances-items'));

    // Now two item expand buttons exist (Furniture's and Appliances's)
    const allItemBtns = screen.getAllByRole('button', { name: /Expand Shared HI Item/ });
    expect(allItemBtns.length).toBe(2);

    // The Appliances item (second button) must NOT be auto-expanded
    expect(allItemBtns[1]).toHaveAttribute('aria-expanded', 'false');

    // Only one budget line should be visible (from Furniture's expanded item)
    const budgetLineCells = screen.getAllByText('Shared HI budget line');
    expect(budgetLineCells).toHaveLength(1);
  });

  it('same item can be expanded independently in both categories simultaneously (WI)', () => {
    const { container } = renderWithRouter(buildBreakdownTwoWICategories(), buildOverview());

    // Expand WI section
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));

    // Expand both categories
    const alphaBtn = Array.from(container.querySelectorAll<HTMLElement>('button.expandBtn')).find(
      (btn) => btn.nextElementSibling?.textContent?.trim() === 'Alpha',
    );
    fireEvent.click(alphaBtn!);
    const betaBtn = Array.from(container.querySelectorAll<HTMLElement>('button.expandBtn')).find(
      (btn) => btn.nextElementSibling?.textContent?.trim() === 'Beta',
    );
    fireEvent.click(betaBtn!);

    // Both item rows are now visible; expand both
    const allItemBtns = screen.getAllByRole('button', { name: /Expand Shared Work Item/ });
    expect(allItemBtns.length).toBe(2);
    fireEvent.click(allItemBtns[0]!);
    fireEvent.click(allItemBtns[1]!);

    // Both items should now be expanded; budget lines appear twice (once per category)
    const budgetLineCells = screen.getAllByText('Shared budget line');
    expect(budgetLineCells).toHaveLength(2);

    // Both expand buttons should report aria-expanded="true"
    const expandedBtns = screen.getAllByRole('button', { name: /Expand Shared Work Item/ });
    expect(expandedBtns[0]).toHaveAttribute('aria-expanded', 'true');
    expect(expandedBtns[1]).toHaveAttribute('aria-expanded', 'true');
  });

  // ── Source badge rendering (scenario 22) ─────────────────────────────────

  it('renders a source badge on Level 3 budget line row when budgetSourceId is set', () => {
    const sourceId = 'src-bank-1';
    const sourceName = 'Bank Loan';
    const breakdown = buildBreakdownWithSourcedWI({
      budgetSourceId: sourceId,
      budgetSources: [buildSourceSummary({ id: sourceId, name: sourceName })],
    });

    const { container } = renderWithRouter(breakdown, buildOverview());

    // Expand WI section → area → item
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'area:No Area'));
    fireEvent.click(getButtonByLabel('Expand Sourced Work Item'));

    // The source badge should render with the source name (or truncated version)
    const badgeEl = screen.getByRole('generic', {
      name: new RegExp(`Budget source: ${sourceName}`, 'i'),
    });
    expect(badgeEl).toBeInTheDocument();
  });

  it('renders source badge with aria-label containing source name', () => {
    const sourceId = 'src-bank-1';
    const sourceName = 'Bank Loan';
    const breakdown = buildBreakdownWithSourcedWI({
      budgetSourceId: sourceId,
      budgetSources: [buildSourceSummary({ id: sourceId, name: sourceName })],
    });

    const { container } = renderWithRouter(breakdown, buildOverview());

    // Expand to line level
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'area:No Area'));
    fireEvent.click(getButtonByLabel('Expand Sourced Work Item'));

    // aria-label includes the full source name
    const badgeEl = container.querySelector(`[aria-label*="${sourceName}"]`);
    expect(badgeEl).toBeInTheDocument();
  });

  // ── Unassigned badge (scenario 23) ────────────────────────────────────────

  it('renders unassigned badge text for budget line with null budgetSourceId', () => {
    const breakdown = buildBreakdownWithSourcedWI({
      budgetSourceId: null,
      budgetSources: [],
    });

    const { container } = renderWithRouter(breakdown, buildOverview());

    // Expand to line level
    fireEvent.click(getButtonByControls(container, 'wi-section-categories'));
    fireEvent.click(getButtonByControls(container, 'area:No Area'));
    fireEvent.click(getButtonByLabel('Expand Sourced Work Item'));

    // The badge for a null source should show "Unassigned" (from translation)
    const unassignedBadge = container.querySelector('[aria-label*="Unassigned"]');
    expect(unassignedBadge).toBeInTheDocument();
  });

  // ── Filter strip (scenario 24) ─────────────────────────────────────────────

  it('renders chip strip when Available Funds is expanded and budgetSources is non-empty', () => {
    const sourceId = 'src-bank-1';
    const breakdown = buildBreakdownWithSourcedWI({
      budgetSourceId: sourceId,
      budgetSources: [buildSourceSummary({ id: sourceId, name: 'Bank Loan' })],
    });

    const { container } = renderWithRouter(breakdown, buildOverview());

    // Expand Available Funds section
    fireEvent.click(getButtonByControls(container, 'avail-funds'));

    // A chip for the named source should appear
    const chipBtn = screen.getByRole('button', { name: /Filter: Bank Loan/i });
    expect(chipBtn).toBeInTheDocument();
  });

  // ── Unassigned chip (scenario 25) ─────────────────────────────────────────

  it('shows Unassigned chip when at least one line has null budgetSourceId', () => {
    const sourceId = 'src-bank-1';
    const breakdown = buildBreakdownWithMixedSourceLines({
      sourceId,
      sourceName: 'Bank Loan',
    });

    const { container } = renderWithRouter(breakdown, buildOverview());

    // Expand Available Funds section
    fireEvent.click(getButtonByControls(container, 'avail-funds'));

    // The Unassigned chip should appear alongside the Bank Loan chip
    const unassignedChip = screen.getByRole('button', { name: /Filter: Unassigned/i });
    expect(unassignedChip).toBeInTheDocument();
  });

  // ── Filter toggle calls onSourceToggle (scenario 26) ─────────────────────

  it('calls onSourceToggle with the source ID when a chip is clicked', () => {
    const sourceId = 'src-bank-1';
    const onSourceToggle = jest.fn();
    const breakdown = buildBreakdownWithSourcedWI({
      budgetSourceId: sourceId,
      budgetSources: [buildSourceSummary({ id: sourceId, name: 'Bank Loan' })],
    });

    const { container } = renderWithRouter(breakdown, buildOverview(), { onSourceToggle });

    // Expand Available Funds to reveal chips
    fireEvent.click(getButtonByControls(container, 'avail-funds'));

    // Click the Bank Loan chip
    const chipBtn = screen.getByRole('button', { name: /Filter: Bank Loan/i });
    fireEvent.click(chipBtn);

    expect(onSourceToggle).toHaveBeenCalledTimes(1);
    expect(onSourceToggle).toHaveBeenCalledWith(sourceId);
  });

  // ── Clear button visible only when ≥1 source selected (scenario 27) ────────

  it('shows "All sources" clear button when selectedSourceIds is non-empty', () => {
    const sourceId = 'src-bank-1';
    const breakdown = buildBreakdownWithSourcedWI({
      budgetSourceId: sourceId,
      budgetSources: [buildSourceSummary({ id: sourceId, name: 'Bank Loan' })],
    });

    const { container } = renderWithRouter(breakdown, buildOverview(), {
      selectedSourceIds: new Set([sourceId]),
    });

    // Expand Available Funds to reveal chip strip
    fireEvent.click(getButtonByControls(container, 'avail-funds'));

    // Clear/All sources button should be visible
    const clearBtn = screen.getByRole('button', { name: /All sources/i });
    expect(clearBtn).toBeInTheDocument();
  });

  it('does not show "All sources" clear button when selectedSourceIds is empty', () => {
    const sourceId = 'src-bank-1';
    const breakdown = buildBreakdownWithSourcedWI({
      budgetSourceId: sourceId,
      budgetSources: [buildSourceSummary({ id: sourceId, name: 'Bank Loan' })],
    });

    const { container } = renderWithRouter(breakdown, buildOverview(), {
      selectedSourceIds: new Set(),
    });

    // Expand Available Funds
    fireEvent.click(getButtonByControls(container, 'avail-funds'));

    // Clear button should NOT be present
    expect(screen.queryByRole('button', { name: /All sources/i })).not.toBeInTheDocument();
  });

  // ── Filter empty state (scenario 28) ─────────────────────────────────────

  it('shows empty state message when filter is active but no lines match', () => {
    const sourceId = 'src-bank-1';
    const breakdown = buildBreakdownWithSourcedWI({
      budgetSourceId: null, // line has NO source
      budgetSources: [buildSourceSummary({ id: sourceId, name: 'Bank Loan' })],
    });

    // Select 'src-bank-1' but the line has budgetSourceId=null → no match
    renderWithRouter(breakdown, buildOverview(), {
      selectedSourceIds: new Set([sourceId]),
    });

    // The empty state should appear with the "no lines match" message
    expect(
      screen.getByText(/No budget lines match the selected source filter/i),
    ).toBeInTheDocument();
  });

  // ── Clear sources calls onClearSources (scenario 27b) ─────────────────────

  it('calls onClearSources when the clear button is clicked', () => {
    const sourceId = 'src-bank-1';
    const onClearSources = jest.fn();
    const breakdown = buildBreakdownWithSourcedWI({
      budgetSourceId: sourceId,
      budgetSources: [buildSourceSummary({ id: sourceId, name: 'Bank Loan' })],
    });

    const { container } = renderWithRouter(breakdown, buildOverview(), {
      selectedSourceIds: new Set([sourceId]),
      onClearSources,
    });

    // Expand Available Funds to reveal chip strip + clear button
    fireEvent.click(getButtonByControls(container, 'avail-funds'));

    const clearBtn = screen.getByRole('button', { name: /All sources/i });
    fireEvent.click(clearBtn);

    expect(onClearSources).toHaveBeenCalledTimes(1);
  });

  // ── Selected chip shows aria-pressed="true" ───────────────────────────────

  it('selected chip has aria-pressed="true"', () => {
    const sourceId = 'src-bank-1';
    const breakdown = buildBreakdownWithSourcedWI({
      budgetSourceId: sourceId,
      budgetSources: [buildSourceSummary({ id: sourceId, name: 'Bank Loan' })],
    });

    const { container } = renderWithRouter(breakdown, buildOverview(), {
      selectedSourceIds: new Set([sourceId]),
    });

    // Expand Available Funds
    fireEvent.click(getButtonByControls(container, 'avail-funds'));

    // The selected chip should be pressed
    const chipBtn = screen.getByRole('button', { name: /Filter: Bank Loan.*selected/i });
    expect(chipBtn).toHaveAttribute('aria-pressed', 'true');
  });

  // ── Escape key handler (Escape clears source filter via toolbar keyDown) ──

  it('pressing Escape in the chip toolbar when a source is selected calls onClearSources', () => {
    const sourceId = 'src-esc-1';
    const onClearSources = jest.fn();
    const breakdown = buildBreakdownWithSourcedWI({
      budgetSourceId: sourceId,
      budgetSources: [buildSourceSummary({ id: sourceId, name: 'Credit Line' })],
    });

    const { container } = renderWithRouter(breakdown, buildOverview(), {
      selectedSourceIds: new Set([sourceId]),
      onClearSources,
    });

    // Expand Available Funds to show the chip toolbar
    fireEvent.click(getButtonByControls(container, 'avail-funds'));

    // The toolbar should be visible
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toBeInTheDocument();

    // Fire Escape key on the toolbar — should call onClearSources
    fireEvent.keyDown(toolbar, { key: 'Escape' });
    expect(onClearSources).toHaveBeenCalledTimes(1);
  });

  it('pressing Escape in the chip toolbar when no source is selected does not call onClearSources', () => {
    const sourceId = 'src-esc-2';
    const onClearSources = jest.fn();
    const breakdown = buildBreakdownWithSourcedWI({
      budgetSourceId: sourceId,
      budgetSources: [buildSourceSummary({ id: sourceId, name: 'Savings' })],
    });

    const { container } = renderWithRouter(breakdown, buildOverview(), {
      selectedSourceIds: new Set(), // no source selected
      onClearSources,
    });

    // Expand Available Funds to show the chip toolbar
    fireEvent.click(getButtonByControls(container, 'avail-funds'));

    const toolbar = screen.getByRole('toolbar');

    // Escape with no selected sources should NOT call onClearSources
    fireEvent.keyDown(toolbar, { key: 'Escape' });
    expect(onClearSources).not.toHaveBeenCalled();
  });
});
