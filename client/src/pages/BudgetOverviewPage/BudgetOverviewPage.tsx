import { useState, useEffect, useRef, useCallback } from 'react';
import type { BudgetOverview, CategoryBudgetSummary } from '@cornerstone/shared';
import { fetchBudgetOverview } from '../../lib/budgetOverviewApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { formatCurrency } from '../../lib/formatters.js';
import { BudgetSubNav } from '../../components/BudgetSubNav/BudgetSubNav.js';
import { BudgetBar } from '../../components/BudgetBar/BudgetBar.js';
import type { BudgetBarSegment } from '../../components/BudgetBar/BudgetBar.js';
import { BudgetHealthIndicator } from '../../components/BudgetHealthIndicator/BudgetHealthIndicator.js';
import { Tooltip } from '../../components/Tooltip/Tooltip.js';
import styles from './BudgetOverviewPage.module.css';

// ---- Helpers ----

function formatShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `€${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `€${(value / 1_000).toFixed(0)}K`;
  }
  return formatCurrency(value);
}

function formatPct(value: number, total: number): string {
  if (total <= 0) return '0.0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

// ---- Category Filter Dropdown ----

interface CategoryFilterProps {
  categories: CategoryBudgetSummary[];
  selectedIds: Set<string | null>;
  onChange: (ids: Set<string | null>) => void;
}

function CategoryFilter({ categories, selectedIds, onChange }: CategoryFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const allSelected = selectedIds.size === categories.length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  function toggleCategory(id: string | null) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  }

  function selectAll() {
    onChange(new Set(categories.map((c) => c.categoryId)));
  }

  function clearAll() {
    onChange(new Set());
  }

  // Button label
  let label: string;
  if (allSelected) {
    label = 'All categories';
  } else if (selectedIds.size === 0) {
    label = 'No categories';
  } else if (selectedIds.size <= 2) {
    label = categories
      .filter((c) => selectedIds.has(c.categoryId))
      .map((c) => c.categoryName)
      .join(', ');
  } else {
    label = `${selectedIds.size} of ${categories.length} categories`;
  }

  return (
    <div className={styles.categoryFilter} ref={containerRef}>
      <button
        type="button"
        className={styles.categoryFilterButton}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>Categories: {label}</span>
        <span className={styles.categoryFilterChevron} aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className={styles.categoryDropdown} role="listbox" aria-multiselectable="true">
          {/* Select All / Clear All */}
          <div className={styles.categoryDropdownActions}>
            <button type="button" className={styles.dropdownAction} onClick={selectAll}>
              Select All
            </button>
            <button type="button" className={styles.dropdownAction} onClick={clearAll}>
              Clear All
            </button>
          </div>

          <div className={styles.categoryDropdownDivider} />

          {categories.map((cat) => {
            const checked = selectedIds.has(cat.categoryId);
            const id = `cat-filter-${cat.categoryId ?? '__uncategorized__'}`;
            return (
              <label key={cat.categoryId ?? '__uncategorized__'} className={styles.categoryOption}>
                <input
                  id={id}
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCategory(cat.categoryId)}
                  className={styles.categoryOptionCheckbox}
                />
                {cat.categoryColor ? (
                  <span
                    className={styles.categoryDot}
                    style={{ backgroundColor: cat.categoryColor }}
                    aria-hidden="true"
                  />
                ) : (
                  <span className={styles.categoryDot} aria-hidden="true" />
                )}
                <span className={styles.categoryOptionName}>{cat.categoryName}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Remaining Detail Panel ----

interface RemainingDetail {
  label: string;
  value: number;
}

interface RemainingDetailPanelProps {
  items: RemainingDetail[];
}

function RemainingDetailPanel({ items }: RemainingDetailPanelProps) {
  return (
    <div className={styles.remainingPanel}>
      {items.map((item) => {
        const isPositive = item.value >= 0;
        return (
          <div key={item.label} className={styles.remainingPanelRow}>
            <span className={styles.remainingPanelLabel}>{item.label}</span>
            <span
              className={`${styles.remainingPanelValue} ${isPositive ? styles.remainingPositive : styles.remainingNegative}`}
            >
              {formatCurrency(item.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Mobile bar detail panel ----

interface MobileBarDetailProps {
  segments: BudgetBarSegment[];
  overflow: number;
  availableFunds: number;
}

function MobileBarDetail({ segments, overflow, availableFunds }: MobileBarDetailProps) {
  const rows = segments.filter((s) => s.value > 0);
  return (
    <div className={styles.mobileBarDetail}>
      {rows.map((seg) => {
        const displayValue = seg.totalValue ?? seg.value;
        return (
          <div key={seg.key} className={styles.mobileBarDetailRow}>
            <span
              className={styles.mobileBarDetailDot}
              style={{ backgroundColor: seg.color }}
              aria-hidden="true"
            />
            <span className={styles.mobileBarDetailLabel}>{seg.label}</span>
            <span className={styles.mobileBarDetailValue}>{formatCurrency(displayValue)}</span>
            <span className={styles.mobileBarDetailPct}>
              ({formatPct(displayValue, availableFunds)})
            </span>
          </div>
        );
      })}
      {overflow > 0 && (
        <div className={styles.mobileBarDetailRow}>
          <span
            className={styles.mobileBarDetailDot}
            style={{ backgroundColor: 'var(--color-budget-overflow)' }}
            aria-hidden="true"
          />
          <span className={styles.mobileBarDetailLabel}>Overflow</span>
          <span className={styles.mobileBarDetailValue}>{formatCurrency(overflow)}</span>
          <span className={styles.mobileBarDetailPct}>({formatPct(overflow, availableFunds)})</span>
        </div>
      )}
    </div>
  );
}

// ---- Hover tooltip content ----

interface SegmentTooltipProps {
  segment: BudgetBarSegment;
  availableFunds: number;
}

function SegmentTooltipContent({ segment, availableFunds }: SegmentTooltipProps) {
  const displayValue = segment.totalValue ?? segment.value;
  return (
    <div className={styles.segmentTooltip}>
      <span className={styles.segmentTooltipLabel}>{segment.label}</span>
      <span className={styles.segmentTooltipValue}>{formatCurrency(displayValue)}</span>
      <span className={styles.segmentTooltipPct}>
        {formatPct(displayValue, availableFunds)} of available funds
      </span>
    </div>
  );
}

// ---- Computed filtered totals ----

interface FilteredTotals {
  actualCostClaimed: number;
  actualCostPaid: number;
  actualCost: number;
  projectedMin: number;
  projectedMax: number;
}

function computeFilteredTotals(
  overview: BudgetOverview,
  selectedIds: Set<string | null>,
): FilteredTotals {
  // If all selected — use the global totals (avoids floating point from summing categories)
  if (selectedIds.size === overview.categorySummaries.length) {
    return {
      actualCostClaimed: overview.actualCostClaimed,
      actualCostPaid: overview.actualCostPaid,
      actualCost: overview.actualCost,
      projectedMin: overview.projectedMin,
      projectedMax: overview.projectedMax,
    };
  }

  const selected = overview.categorySummaries.filter((c) => selectedIds.has(c.categoryId));
  return {
    actualCostClaimed: selected.reduce((s, c) => s + c.actualCostClaimed, 0),
    actualCostPaid: selected.reduce((s, c) => s + c.actualCostPaid, 0),
    actualCost: selected.reduce((s, c) => s + c.actualCost, 0),
    projectedMin: selected.reduce((s, c) => s + c.projectedMin, 0),
    projectedMax: selected.reduce((s, c) => s + c.projectedMax, 0),
  };
}

// ---- Main component ----

export function BudgetOverviewPage() {
  const [overview, setOverview] = useState<BudgetOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Category filter state — set once overview loads
  const [selectedCategories, setSelectedCategories] = useState<Set<string | null>>(new Set());

  // Hovered bar segment (desktop tooltip)
  const [hoveredSegment, setHoveredSegment] = useState<BudgetBarSegment | null>(null);

  // Mobile bar detail open
  const [mobileBarOpen, setMobileBarOpen] = useState(false);

  // Remaining detail open (hover or tap)
  const [remainingDetailOpen, setRemainingDetailOpen] = useState(false);

  useEffect(() => {
    void loadOverview();
  }, []);

  const loadOverview = async () => {
    setIsLoading(true);
    setError('');

    try {
      const data = await fetchBudgetOverview();
      setOverview(data);
      // Initialise filter — all selected
      setSelectedCategories(new Set(data.categorySummaries.map((c) => c.categoryId)));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to load budget overview. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSegmentHover = useCallback((segment: BudgetBarSegment | null) => {
    setHoveredSegment(segment);
  }, []);

  const handleSegmentClick = useCallback((_segment: BudgetBarSegment | null) => {
    setMobileBarOpen((v) => !v);
  }, []);

  // ---- Loading state ----
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Budget</h1>
          </div>
          <BudgetSubNav />
          <div className={styles.loading} role="status" aria-label="Loading budget overview">
            Loading budget overview...
          </div>
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Budget</h1>
          </div>
          <BudgetSubNav />
          <div className={styles.errorCard} role="alert">
            <h2 className={styles.errorTitle}>Error</h2>
            <p>{error}</p>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => void loadOverview()}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!overview) {
    return null;
  }

  const hasData =
    overview.minPlanned > 0 ||
    overview.actualCost > 0 ||
    overview.categorySummaries.length > 0 ||
    overview.sourceCount > 0;

  // Compute filtered totals based on selected categories
  const filtered = computeFilteredTotals(overview, selectedCategories);

  // Segment values
  const claimedVal = filtered.actualCostClaimed;
  const paidVal = Math.max(0, filtered.actualCostPaid - filtered.actualCostClaimed);
  const pendingVal = Math.max(0, filtered.actualCost - filtered.actualCostPaid);
  const projMinVal = Math.max(0, filtered.projectedMin - filtered.actualCost);
  const projMaxVal = Math.max(0, filtered.projectedMax - filtered.projectedMin);
  const overflow = Math.max(0, filtered.projectedMax - overview.availableFunds);

  // Remaining vs projected (using filtered totals)
  const filteredRemainingVsProjectedMin = overview.availableFunds - filtered.projectedMin;
  const filteredRemainingVsProjectedMax = overview.availableFunds - filtered.projectedMax;

  // BudgetHealthIndicator uses filtered projected max
  const healthRemainingVsProjectedMax = filteredRemainingVsProjectedMax;

  // Bar segments
  const segments: BudgetBarSegment[] = [
    {
      key: 'claimed',
      value: claimedVal,
      color: 'var(--color-budget-claimed)',
      label: 'Claimed Invoices',
      totalValue: filtered.actualCostClaimed,
    },
    {
      key: 'paid',
      value: paidVal,
      color: 'var(--color-budget-paid)',
      label: 'Paid Invoices',
      totalValue: filtered.actualCostPaid,
    },
    {
      key: 'pending',
      value: pendingVal,
      color: 'var(--color-budget-pending)',
      label: 'Pending Invoices',
      totalValue: filtered.actualCost,
    },
    {
      key: 'proj-min',
      value: projMinVal,
      color: 'var(--color-budget-projected)',
      label: 'Projected (optimistic)',
      totalValue: filtered.projectedMin,
    },
    {
      key: 'proj-max',
      value: projMaxVal,
      // Projected max layer is fainter — achieved via inline opacity on color
      color: 'var(--color-budget-projected)',
      label: 'Projected (pessimistic)',
      totalValue: filtered.projectedMax,
    },
  ];

  // Remaining perspectives detail items (uses filtered where sensible)
  const remainingDetailItems: RemainingDetail[] = [
    { label: 'Remaining vs Min Planned', value: overview.remainingVsMinPlanned },
    { label: 'Remaining vs Max Planned', value: overview.remainingVsMaxPlanned },
    { label: 'Remaining vs Projected Min', value: filteredRemainingVsProjectedMin },
    { label: 'Remaining vs Projected Max', value: filteredRemainingVsProjectedMax },
    { label: 'Remaining vs Actual Cost', value: overview.remainingVsActualCost },
    { label: 'Remaining vs Actual Paid', value: overview.remainingVsActualPaid },
  ];

  // Format projected max segment with reduced opacity
  const segmentsForBar = segments.map((seg) => {
    if (seg.key === 'proj-max') {
      return {
        ...seg,
        // Pass as a CSS color with opacity via a wrapper style; BudgetBar accepts inline style via color string
        // We encode it via a known CSS pattern — opacity half of projected
        color: `color-mix(in srgb, var(--color-budget-projected) 50%, transparent)`,
      };
    }
    return seg;
  });

  const remainingTooltipContent = <RemainingDetailPanel items={remainingDetailItems} />;

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Budget</h1>
        </div>

        {/* Budget sub-navigation */}
        <BudgetSubNav />

        {/* Empty state */}
        {!hasData && (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateTitle}>No budget data yet</p>
            <p className={styles.emptyStateDescription}>
              Start by adding budget categories, work items with planned costs, and financing
              sources. Your project budget overview will appear here once data is entered.
            </p>
          </div>
        )}

        {/* ========================================================
         * Budget Health Hero Card
         * ======================================================== */}
        <section className={styles.heroCard} aria-labelledby="budget-health-heading">
          {/* Header row */}
          <div className={styles.heroHeader}>
            <h2 id="budget-health-heading" className={styles.heroTitle}>
              Budget Health
            </h2>
            <BudgetHealthIndicator
              remainingVsProjectedMax={healthRemainingVsProjectedMax}
              availableFunds={overview.availableFunds}
            />
          </div>

          {/* Key metrics row */}
          <div className={styles.metricsRow}>
            {/* Available Funds */}
            <div className={styles.metricGroup}>
              <span className={styles.metricLabel}>Available Funds</span>
              <span className={styles.metricValue}>{formatCurrency(overview.availableFunds)}</span>
            </div>

            {/* Projected Cost Range */}
            <div className={styles.metricGroup}>
              <span className={styles.metricLabel}>Projected Cost Range</span>
              <span className={styles.metricValue}>
                <span className={styles.metricRange}>
                  {formatShort(filtered.projectedMin)}
                  <span className={styles.metricRangeSep}>&ndash;</span>
                  {formatShort(filtered.projectedMax)}
                </span>
              </span>
            </div>

            {/* Remaining (best/worst) — with detail on hover/tap */}
            <div className={styles.metricGroup}>
              <span className={styles.metricLabel}>Remaining</span>
              <Tooltip content={remainingTooltipContent}>
                <button
                  type="button"
                  className={`${styles.metricValue} ${styles.metricValueInteractive}`}
                  aria-label="Remaining budget — tap for details"
                  onClick={() => setRemainingDetailOpen((v) => !v)}
                >
                  <span
                    className={
                      filteredRemainingVsProjectedMin >= 0
                        ? styles.metricPositive
                        : styles.metricNegative
                    }
                  >
                    {formatShort(filteredRemainingVsProjectedMin)}
                  </span>
                  <span className={styles.metricRangeSep}>&ndash;</span>
                  <span
                    className={
                      filteredRemainingVsProjectedMax >= 0
                        ? styles.metricPositive
                        : styles.metricNegative
                    }
                  >
                    {formatShort(filteredRemainingVsProjectedMax)}
                  </span>
                  <span className={styles.metricHint} aria-hidden="true">
                    &#9432;
                  </span>
                </button>
              </Tooltip>

              {/* Mobile inline remaining detail — toggled by tap */}
              <div
                className={`${styles.remainingDetailPanel} ${remainingDetailOpen ? styles.remainingDetailPanelOpen : ''}`}
                aria-hidden={!remainingDetailOpen}
              >
                <RemainingDetailPanel items={remainingDetailItems} />
              </div>
            </div>
          </div>

          {/* Stacked bar */}
          <div className={styles.barWrapper}>
            <BudgetBar
              segments={segmentsForBar}
              maxValue={Math.max(overview.availableFunds, filtered.projectedMax, 1)}
              overflow={overflow}
              height="lg"
              onSegmentHover={handleSegmentHover}
              onSegmentClick={handleSegmentClick}
              formatValue={formatCurrency}
            />

            {/* Desktop floating tooltip anchored below bar */}
            {hoveredSegment && (
              <div className={styles.barTooltipAnchor} role="status" aria-live="polite">
                <SegmentTooltipContent
                  segment={hoveredSegment}
                  availableFunds={overview.availableFunds}
                />
              </div>
            )}
          </div>

          {/* Mobile bar detail panel */}
          <div
            className={`${styles.mobileDetail} ${mobileBarOpen ? styles.mobileDetailOpen : ''}`}
            aria-hidden={!mobileBarOpen}
          >
            <MobileBarDetail
              segments={segmentsForBar}
              overflow={overflow}
              availableFunds={overview.availableFunds}
            />
          </div>

          {/* Footer row */}
          <div className={styles.heroFooter}>
            <span className={styles.footerItem}>
              Subsidies: <strong>{formatCurrency(overview.subsidySummary.totalReductions)}</strong>
              {' ('}
              {overview.subsidySummary.activeSubsidyCount}{' '}
              {overview.subsidySummary.activeSubsidyCount === 1 ? 'program' : 'programs'}
              {')'}
            </span>
            <span className={styles.footerItem}>
              Sources: <strong>{overview.sourceCount}</strong>
            </span>
          </div>

          {/* Category filter */}
          {overview.categorySummaries.length > 0 && (
            <div className={styles.categoryFilterRow}>
              <CategoryFilter
                categories={overview.categorySummaries}
                selectedIds={selectedCategories}
                onChange={setSelectedCategories}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default BudgetOverviewPage;
