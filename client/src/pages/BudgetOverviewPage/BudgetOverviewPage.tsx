import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  BudgetOverview,
  BudgetBreakdown,
  CategoryBudgetSummary,
  BudgetSource,
} from '@cornerstone/shared';
import { fetchBudgetOverview, fetchBudgetBreakdown } from '../../lib/budgetOverviewApi.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useFormatters } from '../../lib/formatters.js';
import { BudgetSubNav } from '../../components/BudgetSubNav/BudgetSubNav.js';
import { BudgetBar } from '../../components/BudgetBar/BudgetBar.js';
import type { BudgetBarSegment } from '../../components/BudgetBar/BudgetBar.js';
import { Tooltip } from '../../components/Tooltip/Tooltip.js';
import { CostBreakdownTable } from '../../components/CostBreakdownTable/CostBreakdownTable.js';
import styles from './BudgetOverviewPage.module.css';

/** Stable empty set passed to CostBreakdownTable so it always shows all categories. */
const emptyCategories = new Set<string | null>();

// ---- Helpers ----

// formatShort is defined inside the component to access formatCurrency from useFormatters()

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
  const { t } = useTranslation('budget');
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
    label = t('overview.allCategories');
  } else if (selectedIds.size === 0) {
    label = t('overview.noCategories');
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
        <span>
          {t('overview.categories')}: {label}
        </span>
        <span className={styles.categoryFilterChevron} aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className={styles.categoryDropdown} role="listbox" aria-multiselectable="true">
          {/* Select All / Clear All */}
          <div className={styles.categoryDropdownActions}>
            <button type="button" className={styles.dropdownAction} onClick={selectAll}>
              {t('overview.selectAll')}
            </button>
            <button type="button" className={styles.dropdownAction} onClick={clearAll}>
              {t('overview.clearAll')}
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
  formatCurrency: (value: number) => string;
}

function RemainingDetailPanel({ items, formatCurrency }: RemainingDetailPanelProps) {
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
  formatCurrency: (value: number) => string;
}

function MobileBarDetail({
  segments,
  overflow,
  availableFunds,
  formatCurrency,
}: MobileBarDetailProps) {
  const { t } = useTranslation('budget');
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
          <span className={styles.mobileBarDetailLabel}>{t('overview.bars.overflow')}</span>
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
  formatCurrency: (value: number) => string;
}

function SegmentTooltipContent({ segment, availableFunds, formatCurrency }: SegmentTooltipProps) {
  const { t } = useTranslation('budget');
  const displayValue = segment.totalValue ?? segment.value;
  return (
    <div className={styles.segmentTooltip}>
      <span className={styles.segmentTooltipLabel}>{segment.label}</span>
      <span className={styles.segmentTooltipValue}>{formatCurrency(displayValue)}</span>
      <span className={styles.segmentTooltipPct}>
        {formatPct(displayValue, availableFunds)} {t('overview.ofAvailableFunds')}
      </span>
    </div>
  );
}

// ---- Computed filtered totals ----

interface FilteredTotals {
  actualCostClaimed: number;
  actualCostPaid: number;
  actualCost: number;
  minPlanned: number;
  maxPlanned: number;
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
      minPlanned: overview.minPlanned,
      maxPlanned: overview.maxPlanned,
    };
  }

  const selected = overview.categorySummaries.filter((c) => selectedIds.has(c.categoryId));
  return {
    actualCostClaimed: selected.reduce((s, c) => s + c.actualCostClaimed, 0),
    actualCostPaid: selected.reduce((s, c) => s + c.actualCostPaid, 0),
    actualCost: selected.reduce((s, c) => s + c.actualCost, 0),
    minPlanned: selected.reduce((s, c) => s + c.minPlanned, 0),
    maxPlanned: selected.reduce((s, c) => s + c.maxPlanned, 0),
  };
}

// ---- Main component ----

export function BudgetOverviewPage() {
  const { t } = useTranslation('budget');
  const navigate = useNavigate();
  const { formatCurrency } = useFormatters();

  function formatShort(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
    return formatCurrency(value);
  }

  const [overview, setOverview] = useState<BudgetOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Auto-scroll to top when error appears
  useEffect(() => {
    if (error) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [error]);

  // Breakdown state
  const [breakdown, setBreakdown] = useState<BudgetBreakdown | null>(null);
  const [isBreakdownLoading, setIsBreakdownLoading] = useState(false);

  // Budget sources state
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);

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

      // Fetch breakdown data (non-critical, so silent failure)
      setIsBreakdownLoading(true);
      try {
        const bd = await fetchBudgetBreakdown();
        setBreakdown(bd);
      } catch {
        // breakdown is non-critical; silently fail and show empty state if it fails
      } finally {
        setIsBreakdownLoading(false);
      }

      // Fetch budget sources (non-critical, so silent failure)
      try {
        const sourcesData = await fetchBudgetSources();
        setBudgetSources(sourcesData.budgetSources);
      } catch {
        // sources is non-critical; silently fail
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('overview.errorMessage'));
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
            <h1 className={styles.pageTitle}>{t('overview.title')}</h1>
            <div className={styles.actionButtons}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => navigate('/budget/invoices')}
                data-testid="budget-overview-add-invoice"
                aria-label={t('overview.actions.addInvoice')}
              >
                {t('overview.actions.addInvoice')}
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => navigate('/budget/vendors')}
                data-testid="budget-overview-add-vendor"
                aria-label={t('overview.actions.addVendor')}
              >
                {t('overview.actions.addVendor')}
              </button>
            </div>
          </div>
          <BudgetSubNav />
          <div className={styles.loading} role="status" aria-label={t('overview.loading')}>
            {t('overview.loading')}
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
            <h1 className={styles.pageTitle}>{t('overview.title')}</h1>
            <div className={styles.actionButtons}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => navigate('/budget/invoices')}
                data-testid="budget-overview-add-invoice"
                aria-label={t('overview.actions.addInvoice')}
              >
                {t('overview.actions.addInvoice')}
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => navigate('/budget/vendors')}
                data-testid="budget-overview-add-vendor"
                aria-label={t('overview.actions.addVendor')}
              >
                {t('overview.actions.addVendor')}
              </button>
            </div>
          </div>
          <BudgetSubNav />
          <div className={styles.errorCard} role="alert">
            <h2 className={styles.errorTitle}>{t('overview.error')}</h2>
            <p>{error}</p>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => void loadOverview()}
            >
              {t('overview.retry')}
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
  const projMinVal = Math.max(0, filtered.minPlanned - filtered.actualCost);
  const projMaxVal = Math.max(0, filtered.maxPlanned - filtered.minPlanned);
  const overflow = Math.max(0, filtered.maxPlanned - overview.availableFunds);

  // Remaining vs projected (using filtered totals)
  const filteredRemainingVsProjectedMin = overview.availableFunds - filtered.minPlanned;
  const filteredRemainingVsProjectedMax = overview.availableFunds - filtered.maxPlanned;

  // Bar segments
  const segments: BudgetBarSegment[] = [
    {
      key: 'claimed',
      value: claimedVal,
      color: 'var(--color-budget-claimed)',
      label: t('overview.bars.claimedInvoices'),
      totalValue: filtered.actualCostClaimed,
    },
    {
      key: 'paid',
      value: paidVal,
      color: 'var(--color-budget-paid)',
      label: t('overview.bars.paidInvoices'),
      totalValue: filtered.actualCostPaid,
    },
    {
      key: 'pending',
      value: pendingVal,
      color: 'var(--color-budget-pending)',
      label: t('overview.bars.pendingInvoices'),
      totalValue: filtered.actualCost,
    },
    {
      key: 'proj-min',
      value: projMinVal,
      color: 'var(--color-budget-projected)',
      label: t('overview.bars.projectedOptimistic'),
      totalValue: filtered.minPlanned,
    },
    {
      key: 'proj-max',
      value: projMaxVal,
      // Projected max layer is fainter — achieved via inline opacity on color
      color: 'var(--color-budget-projected)',
      label: t('overview.bars.projectedPessimistic'),
      totalValue: filtered.maxPlanned,
    },
  ];

  // Payback visibility flag
  const hasPayback = overview.subsidySummary.maxTotalPayback > 0;

  // Determine remaining values for health indicator
  const remainingMin = hasPayback
    ? overview.remainingVsMinPlannedWithPayback
    : overview.remainingVsMinPlanned;
  const remainingMax = hasPayback
    ? overview.remainingVsMaxPlannedWithPayback
    : overview.remainingVsMaxPlanned;

  // Remaining perspectives detail items (uses filtered where sensible)
  const remainingDetailItems: RemainingDetail[] = [
    {
      label: t('overview.remainingPerspectives.vsMinPlanned'),
      value: overview.remainingVsMinPlanned,
    },
    {
      label: t('overview.remainingPerspectives.vsMaxPlanned'),
      value: overview.remainingVsMaxPlanned,
    },
    {
      label: t('overview.remainingPerspectives.vsProjectedMin'),
      value: filteredRemainingVsProjectedMin,
    },
    {
      label: t('overview.remainingPerspectives.vsProjectedMax'),
      value: filteredRemainingVsProjectedMax,
    },
    {
      label: t('overview.remainingPerspectives.vsActualCost'),
      value: overview.remainingVsActualCost,
    },
    {
      label: t('overview.remainingPerspectives.vsActualPaid'),
      value: overview.remainingVsActualPaid,
    },
    ...(hasPayback
      ? [
          {
            label: t('overview.remainingPerspectives.vsMinPlannedWithPayback'),
            value: overview.remainingVsMinPlannedWithPayback,
          },
          {
            label: t('overview.remainingPerspectives.vsMaxPlannedWithPayback'),
            value: overview.remainingVsMaxPlannedWithPayback,
          },
        ]
      : []),
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

  const remainingTooltipContent = (
    <RemainingDetailPanel items={remainingDetailItems} formatCurrency={formatCurrency} />
  );

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{t('overview.title')}</h1>
          <div className={styles.actionButtons}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => navigate('/budget/invoices')}
              data-testid="budget-overview-add-invoice"
              aria-label={t('overview.actions.addInvoice')}
            >
              {t('overview.actions.addInvoice')}
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => navigate('/budget/vendors')}
              data-testid="budget-overview-add-vendor"
              aria-label={t('overview.actions.addVendor')}
            >
              {t('overview.actions.addVendor')}
            </button>
          </div>
        </div>

        {/* Budget sub-navigation */}
        <BudgetSubNav />

        {/* Empty state */}
        {!hasData && (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateTitle}>{t('overview.emptyStateTitle')}</p>
            <p className={styles.emptyStateDescription}>{t('overview.emptyStateDescription')}</p>
          </div>
        )}

        {/* ========================================================
         * Budget Health Hero Card
         * ======================================================== */}
        <section className={styles.heroCard} aria-label="Budget overview">
          {/* Key metrics row */}
          <div className={`${styles.metricsRow} ${hasPayback ? styles.metricsRowWithPayback : ''}`}>
            {/* Available Funds */}
            <div className={styles.metricGroup}>
              <span className={styles.metricLabel}>{t('overview.availableFunds')}</span>
              <span className={styles.metricValue}>{formatCurrency(overview.availableFunds)}</span>
            </div>

            {/* Projected Cost Range */}
            <div className={styles.metricGroup}>
              <span className={styles.metricLabel}>{t('overview.projectedCostRange')}</span>
              <span className={styles.metricValue}>
                <span className={styles.metricRange}>
                  {formatShort(filtered.minPlanned)}
                  <span className={styles.metricRangeSep}>&ndash;</span>
                  {formatShort(filtered.maxPlanned)}
                </span>
              </span>
            </div>

            {/* Expected Payback (only when hasPayback) */}
            {hasPayback && (
              <div className={styles.metricGroup}>
                <span className={styles.metricLabel}>{t('overview.expectedPayback')}</span>
                <span
                  className={`${styles.metricValue} ${styles.metricPaybackValue}`}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span className={styles.metricRange}>
                    {formatShort(overview.subsidySummary.minTotalPayback)}
                    {overview.subsidySummary.minTotalPayback !==
                    overview.subsidySummary.maxTotalPayback ? (
                      <>
                        <span className={styles.metricRangeSep}>&ndash;</span>
                        {formatShort(overview.subsidySummary.maxTotalPayback)}
                      </>
                    ) : null}
                  </span>
                </span>
              </div>
            )}

            {/* Remaining (best/worst) — with detail on hover/tap */}
            <div className={styles.metricGroup}>
              <span className={styles.metricLabel}>{t('overview.remaining')}</span>
              <Tooltip content={remainingTooltipContent}>
                <button
                  type="button"
                  className={`${styles.metricValue} ${styles.metricValueInteractive}`}
                  aria-label={t('overview.remainingDetail')}
                  onClick={() => setRemainingDetailOpen((v) => !v)}
                >
                  <span
                    className={remainingMin >= 0 ? styles.metricPositive : styles.metricNegative}
                  >
                    {formatShort(remainingMin)}
                  </span>
                  <span className={styles.metricRangeSep}>&ndash;</span>
                  <span
                    className={remainingMax >= 0 ? styles.metricPositive : styles.metricNegative}
                  >
                    {formatShort(remainingMax)}
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
                <RemainingDetailPanel
                  items={remainingDetailItems}
                  formatCurrency={formatCurrency}
                />
              </div>
            </div>
          </div>

          {/* Stacked bar */}
          <div className={styles.barWrapper}>
            <BudgetBar
              segments={segmentsForBar}
              maxValue={Math.max(overview.availableFunds, filtered.maxPlanned, 1)}
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
                  formatCurrency={formatCurrency}
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
              formatCurrency={formatCurrency}
            />
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

        {/* Cost Breakdown Table */}
        {overview &&
          (isBreakdownLoading ? (
            <div
              className={styles.breakdownLoading}
              role="status"
              aria-label={t('overview.costBreakdown.loading')}
            >
              <p>{t('overview.costBreakdown.loading')}</p>
            </div>
          ) : breakdown ? (
            <CostBreakdownTable
              breakdown={breakdown}
              overview={overview}
              selectedCategories={emptyCategories}
              budgetSources={budgetSources}
            />
          ) : null)}
      </div>
    </div>
  );
}

export default BudgetOverviewPage;
