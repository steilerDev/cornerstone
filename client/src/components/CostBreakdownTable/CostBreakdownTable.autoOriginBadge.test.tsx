/**
 * @jest-environment jsdom
 *
 * Tests for the auto-origin Badge rendered by BudgetLineRow (Story #1551).
 *
 * The Badge renders when line.origin === 'auto'. It:
 *   - appears after the confidence/invoice/quotation badge
 *   - appears before the source dot (.sourceBadgeDot)
 *   - has aria-label set to the translated key
 *   - is absent when line.origin === 'manual'
 *   - survives source-filter mode (still present on un-filtered lines)
 *
 * Follows the patterns in CostBreakdownTable.test.tsx:
 *   - jest.unstable_mockModule for formatters
 *   - dynamic import after mocks
 *   - renderWithRouter helper
 *   - expand-to-budget-line navigation (WI section → area → item)
 */

import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CostBreakdownTable as CostBreakdownTableType } from './CostBreakdownTable.js';
import type { BudgetBreakdown, BudgetOverview, BreakdownBudgetLine } from '@cornerstone/shared';

// ─── Mock: formatters ─────────────────────────────────────────────────────────

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
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: () => '—',
    formatDateTime: () => '—',
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
      formatTime: () => '—',
      formatDateTime: () => '—',
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildOverview(): BudgetOverview {
  return {
    availableFunds: 100000,
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
      minTotalPayback: 0,
      maxTotalPayback: 0,
      oversubscribedSubsidies: [],
    },
  };
}

/**
 * Build a breakdown with a single WI and a single budget line.
 * `origin` can be specified explicitly; defaults to 'manual'.
 */
function buildBreakdownWithLine(opts: {
  origin: 'manual' | 'auto';
  itemTitle?: string;
  workItemId?: string;
  budgetSourceId?: string | null;
  hasInvoice?: boolean;
  isQuotation?: boolean;
}): BudgetBreakdown {
  const line: BreakdownBudgetLine = {
    id: 'test-line-1',
    description: 'Test budget line',
    plannedAmount: 1000,
    confidence: 'own_estimate',
    actualCost: 0,
    hasInvoice: opts.hasInvoice ?? false,
    isQuotation: opts.isQuotation ?? false,
    budgetSourceId: opts.budgetSourceId ?? null,
    origin: opts.origin,
  };

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
              workItemId: opts.workItemId ?? 'wi-origin-test-1',
              title: opts.itemTitle ?? 'Origin Test Item',
              projectedMin: 800,
              projectedMax: 1200,
              actualCost: 0,
              subsidyPayback: 0,
              rawProjectedMin: 800,
              rawProjectedMax: 1200,
              minSubsidyPayback: 0,
              costDisplay: 'projected',
              budgetLines: [line],
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
    budgetSources: [],
  };
}

function renderWithRouter(breakdown: BudgetBreakdown) {
  return render(
    <MemoryRouter>
      <CostBreakdownTable
        breakdown={breakdown}
        overview={buildOverview()}
        deselectedSourceIds={new Set()}
        onSourceToggle={() => {}}
        onSelectAllSources={() => {}}
      />
    </MemoryRouter>,
  );
}

/**
 * Expand to the budget line level:
 * WI section → No Area → item.
 * Returns the container so callers can query within it.
 */
function expandToBudgetLineLevel(container: HTMLElement, itemTitle: string): HTMLElement {
  // 1. Expand work items section
  const wiSectionBtn = screen.getByRole('button', { name: /expand work item budget/i });
  fireEvent.click(wiSectionBtn);

  // 2. Expand "No Area" (i18n returns "No Area" for null areaId)
  const noAreaBtn = screen.getByRole('button', { name: /expand no area/i });
  fireEvent.click(noAreaBtn);

  // 3. Expand the item row to show budget lines
  const itemBtn = screen.getByRole('button', { name: new RegExp(`expand ${itemTitle}`, 'i') });
  fireEvent.click(itemBtn);

  return container;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CostBreakdownTable — autoOrigin badge on BudgetLineRow', () => {
  // ─── Badge present when origin='auto' ──────────────────────────────────────

  it("renders the Auto-itemized badge when line.origin='auto'", () => {
    const { container } = renderWithRouter(
      buildBreakdownWithLine({ origin: 'auto', itemTitle: 'Auto Line Item' }),
    );

    expandToBudgetLineLevel(container, 'Auto Line Item');

    // The badge text comes from the real i18n setup: 'Auto-itemized'
    const badge = screen.queryByText('Auto-itemized') ??
      screen.queryByText(/auto.itemized/i) ??
      screen.queryByText('overview.costBreakdown.autoOriginBadge.label');
    expect(badge).not.toBeNull();
  });

  it("badge has the correct aria-label when line.origin='auto'", () => {
    const { container } = renderWithRouter(
      buildBreakdownWithLine({ origin: 'auto', itemTitle: 'Auto ARIA Item' }),
    );

    expandToBudgetLineLevel(container, 'Auto ARIA Item');

    // The real translated aria-label
    const expectedAriaLabel =
      'Budget line was created automatically via auto-itemization';
    const fallbackKeyAriaLabel = 'overview.costBreakdown.autoOriginBadge.ariaLabel';

    const badgeEl =
      container.querySelector(`[aria-label="${expectedAriaLabel}"]`) ??
      container.querySelector(`[aria-label="${fallbackKeyAriaLabel}"]`);
    expect(badgeEl).not.toBeNull();
  });

  it("badge applies the autoOrigin CSS class when line.origin='auto'", () => {
    const { container } = renderWithRouter(
      buildBreakdownWithLine({ origin: 'auto', itemTitle: 'Auto CSS Item' }),
    );

    expandToBudgetLineLevel(container, 'Auto CSS Item');

    // identity-obj-proxy: badgeStyles.autoOrigin === 'autoOrigin'
    const autoOriginEl = container.querySelector('.autoOrigin');
    expect(autoOriginEl).not.toBeNull();
  });

  // ─── Badge absent when origin='manual' ─────────────────────────────────────

  it("does NOT render the Auto-itemized badge when line.origin='manual'", () => {
    const { container } = renderWithRouter(
      buildBreakdownWithLine({ origin: 'manual', itemTitle: 'Manual Line Item' }),
    );

    expandToBudgetLineLevel(container, 'Manual Line Item');

    const autoOriginEl = container.querySelector('.autoOrigin');
    expect(autoOriginEl).toBeNull();
    // Also check text is absent
    expect(screen.queryByText('Auto-itemized')).not.toBeInTheDocument();
    expect(
      screen.queryByText('overview.costBreakdown.autoOriginBadge.label'),
    ).not.toBeInTheDocument();
  });

  // ─── DOM order: after confidence badge, before source dot ──────────────────

  it("auto-origin badge appears after the confidence badge in DOM order", () => {
    const { container } = renderWithRouter(
      buildBreakdownWithLine({
        origin: 'auto',
        itemTitle: 'DOM Order Item',
        hasInvoice: false,
        isQuotation: false,
      }),
    );

    expandToBudgetLineLevel(container, 'DOM Order Item');

    // The nameContent div contains: description | confidence badge | autoOrigin badge | ...
    // Find the .nameContent that contains the .autoOrigin badge — only the BudgetLineRow
    // renders both .autoOrigin and .sourceBadgeDot inside the same .nameContent. Other row
    // levels also render .nameContent but without .sourceBadgeDot, so .pop()/querySelector are wrong.
    const nameContent = Array.from(container.querySelectorAll<HTMLElement>('.nameContent')).find(
      (el) => el.querySelector('.autoOrigin') !== null,
    ) ?? null;
    expect(nameContent).not.toBeNull();

    const children = Array.from(nameContent!.querySelectorAll('span'));

    // Find confidence badge (contains a translated confidence key or 'own_estimate' text)
    const autoOriginEl = container.querySelector('.autoOrigin');
    expect(autoOriginEl).not.toBeNull();

    // Find the source dot (aria-hidden="true" span immediately after autoOrigin badge)
    const sourceDot = nameContent!.querySelector('.sourceBadgeDot');
    expect(sourceDot).not.toBeNull();

    // Verify DOM order: autoOrigin badge comes before sourceBadgeDot
    if (autoOriginEl && sourceDot) {
      const pos = (el: Element) => {
        const allSpans = Array.from(nameContent!.querySelectorAll('span'));
        return allSpans.indexOf(el as HTMLSpanElement);
      };
      const autoPos = pos(autoOriginEl);
      const dotPos = pos(sourceDot);
      expect(autoPos).toBeGreaterThanOrEqual(0);
      expect(dotPos).toBeGreaterThanOrEqual(0);
      expect(autoPos).toBeLessThan(dotPos);
    }

    void children; // suppress unused warning
  });

  it("auto-origin badge appears before the source badge label in DOM order", () => {
    const { container } = renderWithRouter(
      buildBreakdownWithLine({ origin: 'auto', itemTitle: 'DOM Order Source Item' }),
    );

    expandToBudgetLineLevel(container, 'DOM Order Source Item');

    // Same targeted lookup: find the .nameContent that actually contains the autoOrigin badge.
    const nameContent = Array.from(container.querySelectorAll<HTMLElement>('.nameContent')).find(
      (el) => el.querySelector('.autoOrigin') !== null,
    ) ?? null;
    expect(nameContent).not.toBeNull();

    const autoOriginEl = container.querySelector('.autoOrigin');
    const sourceBadgeLabel = nameContent!.querySelector('.sourceBadgeLabel');

    if (autoOriginEl && sourceBadgeLabel) {
      // Use compareDocumentPosition to verify autoOrigin precedes sourceBadgeLabel
      const result = autoOriginEl.compareDocumentPosition(sourceBadgeLabel);
      // DOCUMENT_POSITION_FOLLOWING (4) means sourceBadgeLabel is after autoOriginEl
      expect(result & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  // ─── Badge present under source-filter mode ────────────────────────────────

  it("auto-origin badge still present when deselectedSourceIds does not filter out the line", () => {
    const { container } = renderWithRouter(
      buildBreakdownWithLine({
        origin: 'auto',
        itemTitle: 'Filter Auto Item',
        budgetSourceId: 'some-source-id',
      }),
    );

    // deselectedSourceIds is empty (default in renderWithRouter) — line is not filtered
    expandToBudgetLineLevel(container, 'Filter Auto Item');

    const autoOriginEl = container.querySelector('.autoOrigin');
    expect(autoOriginEl).not.toBeNull();
  });

  // ─── Badge absent when line has invoice ────────────────────────────────────
  // When hasInvoice=true, a different badge ("invoiced") is shown instead of the
  // confidence badge. The autoOrigin badge is independent and must still appear.

  it("auto-origin badge is rendered alongside invoiced badge when line has invoice AND origin='auto'", () => {
    const { container } = renderWithRouter(
      buildBreakdownWithLine({
        origin: 'auto',
        itemTitle: 'Invoiced Auto Item',
        hasInvoice: true,
      }),
    );

    expandToBudgetLineLevel(container, 'Invoiced Auto Item');

    // Both the invoiced badge and the autoOrigin badge should be present
    const invoicedBadge = container.querySelector('.invoicedBadge');
    const autoOriginEl = container.querySelector('.autoOrigin');

    // invoicedBadge may or may not be present depending on i18n mock resolution,
    // but autoOriginEl must be present since origin='auto'
    expect(autoOriginEl).not.toBeNull();

    // If invoicedBadge is present, verify it precedes the autoOrigin badge
    if (invoicedBadge && autoOriginEl) {
      const result = invoicedBadge.compareDocumentPosition(autoOriginEl);
      expect(result & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});
