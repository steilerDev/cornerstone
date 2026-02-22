import { useState, useEffect } from 'react';
import type { BudgetOverview } from '@cornerstone/shared';
import { fetchBudgetOverview } from '../../lib/budgetOverviewApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { formatCurrency } from '../../lib/formatters.js';
import { BudgetSubNav } from '../../components/BudgetSubNav/BudgetSubNav.js';
import styles from './BudgetOverviewPage.module.css';

// ---- Sub-components ----

interface SummaryCardProps {
  title: string;
  children: React.ReactNode;
}

function SummaryCard({ title, children }: SummaryCardProps) {
  return (
    <section
      className={styles.summaryCard}
      aria-labelledby={`card-${title.replace(/\s+/g, '-').toLowerCase()}`}
    >
      <h2 id={`card-${title.replace(/\s+/g, '-').toLowerCase()}`} className={styles.cardTitle}>
        {title}
      </h2>
      <div className={styles.cardBody}>{children}</div>
    </section>
  );
}

interface StatRowProps {
  label: string;
  value: string;
  variant?: 'default' | 'positive' | 'negative' | 'muted';
}

function StatRow({ label, value, variant = 'default' }: StatRowProps) {
  const valueClass = [
    styles.statValue,
    variant === 'positive' && styles.statValuePositive,
    variant === 'negative' && styles.statValueNegative,
    variant === 'muted' && styles.statValueMuted,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.statRow}>
      <span className={styles.statLabel}>{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

// ---- Main component ----

export function BudgetOverviewPage() {
  const [overview, setOverview] = useState<BudgetOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    void loadOverview();
  }, []);

  const loadOverview = async () => {
    setIsLoading(true);
    setError('');

    try {
      const data = await fetchBudgetOverview();
      setOverview(data);
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

  const remainingOptimisticVariant = overview.remainingVsMinPlanned >= 0 ? 'positive' : 'negative';
  const remainingPessimisticVariant = overview.remainingVsMaxPlanned >= 0 ? 'positive' : 'negative';
  const remainingVsActualCostVariant =
    overview.remainingVsActualCost >= 0 ? 'positive' : 'negative';
  const remainingVsActualPaidVariant =
    overview.remainingVsActualPaid >= 0 ? 'positive' : 'negative';
  const remainingVsProjectedMinVariant =
    overview.remainingVsProjectedMin >= 0 ? 'positive' : 'negative';
  const remainingVsProjectedMaxVariant =
    overview.remainingVsProjectedMax >= 0 ? 'positive' : 'negative';
  const hasData =
    overview.minPlanned > 0 ||
    overview.actualCost > 0 ||
    overview.categorySummaries.length > 0 ||
    overview.sourceCount > 0;

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

        {/* Summary cards grid */}
        <div className={styles.cardsGrid}>
          {/* Planned Budget card (confidence range) */}
          <SummaryCard title="Planned Budget">
            <StatRow label="Min (optimistic)" value={formatCurrency(overview.minPlanned)} />
            <StatRow label="Max (pessimistic)" value={formatCurrency(overview.maxPlanned)} />
          </SummaryCard>

          {/* Projected Budget card (blended: invoiced lines use actual cost) */}
          <SummaryCard title="Projected Budget">
            <StatRow
              label="Projected Min (optimistic)"
              value={formatCurrency(overview.projectedMin)}
            />
            <StatRow
              label="Projected Max (pessimistic)"
              value={formatCurrency(overview.projectedMax)}
            />
            <div className={styles.cardDivider} />
            <StatRow
              label="Remaining (proj. optimistic)"
              value={formatCurrency(overview.remainingVsProjectedMin)}
              variant={remainingVsProjectedMinVariant}
            />
            <StatRow
              label="Remaining (proj. pessimistic)"
              value={formatCurrency(overview.remainingVsProjectedMax)}
              variant={remainingVsProjectedMaxVariant}
            />
          </SummaryCard>

          {/* Actual Cost card */}
          <SummaryCard title="Actual Cost">
            <StatRow label="Invoiced" value={formatCurrency(overview.actualCost)} />
            <StatRow label="Paid" value={formatCurrency(overview.actualCostPaid)} />
          </SummaryCard>

          {/* Financing card */}
          <SummaryCard title="Financing">
            <StatRow label="Available Funds" value={formatCurrency(overview.availableFunds)} />
            <div className={styles.cardDivider} />
            <StatRow
              label="Remaining (vs min planned)"
              value={formatCurrency(overview.remainingVsMinPlanned)}
              variant={remainingOptimisticVariant}
            />
            <StatRow
              label="Remaining (vs max planned)"
              value={formatCurrency(overview.remainingVsMaxPlanned)}
              variant={remainingPessimisticVariant}
            />
            <StatRow
              label="Remaining (vs actual cost)"
              value={formatCurrency(overview.remainingVsActualCost)}
              variant={remainingVsActualCostVariant}
            />
            <StatRow
              label="Remaining (vs actual paid)"
              value={formatCurrency(overview.remainingVsActualPaid)}
              variant={remainingVsActualPaidVariant}
            />
            <p className={styles.cardNote}>
              {overview.sourceCount} {overview.sourceCount === 1 ? 'source' : 'sources'}
            </p>
          </SummaryCard>

          {/* Subsidies card */}
          <SummaryCard title="Subsidies">
            <StatRow
              label="Total Reductions"
              value={formatCurrency(overview.subsidySummary.totalReductions)}
              variant={overview.subsidySummary.totalReductions > 0 ? 'positive' : 'default'}
            />
            <p className={styles.cardNote}>
              {overview.subsidySummary.activeSubsidyCount} active{' '}
              {overview.subsidySummary.activeSubsidyCount === 1 ? 'program' : 'programs'}
            </p>
          </SummaryCard>
        </div>

        {/* Category Breakdown table */}
        <section className={styles.tableSection} aria-labelledby="category-breakdown-heading">
          <h2 id="category-breakdown-heading" className={styles.sectionTitle}>
            Category Breakdown
          </h2>

          {overview.categorySummaries.length === 0 ? (
            <p className={styles.tableEmptyState}>
              No budget categories found. Add categories and assign them to work items to see a
              breakdown here.
            </p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col" className={styles.thCategory}>
                      Category
                    </th>
                    <th scope="col" className={styles.thNumber}>
                      Min Planned
                    </th>
                    <th scope="col" className={styles.thNumber}>
                      Max Planned
                    </th>
                    <th scope="col" className={styles.thNumber}>
                      Actual Cost
                    </th>
                    <th scope="col" className={styles.thNumber}>
                      Actual Paid
                    </th>
                    <th scope="col" className={styles.thNumber}>
                      Projected Min
                    </th>
                    <th scope="col" className={styles.thNumber}>
                      Projected Max
                    </th>
                    <th scope="col" className={styles.thNumber}>
                      Budget Lines
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overview.categorySummaries.map((cat) => (
                    <tr key={cat.categoryId ?? '__uncategorized__'} className={styles.tableRow}>
                      <td className={styles.tdCategory}>
                        <div className={styles.categoryCell}>
                          <span
                            className={styles.categoryDot}
                            style={
                              cat.categoryColor ? { backgroundColor: cat.categoryColor } : undefined
                            }
                            aria-hidden="true"
                          />
                          <span className={styles.categoryName}>{cat.categoryName}</span>
                        </div>
                      </td>
                      <td className={styles.tdNumber}>
                        <span className={styles.currencyValue}>
                          {formatCurrency(cat.minPlanned)}
                        </span>
                      </td>
                      <td className={styles.tdNumber}>
                        <span className={styles.currencyValue}>
                          {formatCurrency(cat.maxPlanned)}
                        </span>
                      </td>
                      <td className={styles.tdNumber}>
                        <span className={styles.currencyValue}>
                          {formatCurrency(cat.actualCost)}
                        </span>
                      </td>
                      <td className={styles.tdNumber}>
                        <span className={styles.currencyValue}>
                          {formatCurrency(cat.actualCostPaid)}
                        </span>
                      </td>
                      <td className={styles.tdNumber}>
                        <span className={styles.currencyValue}>
                          {formatCurrency(cat.projectedMin)}
                        </span>
                      </td>
                      <td className={styles.tdNumber}>
                        <span className={styles.currencyValue}>
                          {formatCurrency(cat.projectedMax)}
                        </span>
                      </td>
                      <td className={styles.tdNumber}>
                        <span className={styles.workItemCount}>{cat.budgetLineCount}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={styles.tableFooter}>
                    <th scope="row" className={styles.tfootLabel}>
                      Total
                    </th>
                    <td className={styles.tdNumber}>
                      <span className={styles.currencyValueBold}>
                        {formatCurrency(overview.minPlanned)}
                      </span>
                    </td>
                    <td className={styles.tdNumber}>
                      <span className={styles.currencyValueBold}>
                        {formatCurrency(overview.maxPlanned)}
                      </span>
                    </td>
                    <td className={styles.tdNumber}>
                      <span className={styles.currencyValueBold}>
                        {formatCurrency(overview.actualCost)}
                      </span>
                    </td>
                    <td className={styles.tdNumber}>
                      <span className={styles.currencyValueBold}>
                        {formatCurrency(overview.actualCostPaid)}
                      </span>
                    </td>
                    <td className={styles.tdNumber}>
                      <span className={styles.currencyValueBold}>
                        {formatCurrency(overview.projectedMin)}
                      </span>
                    </td>
                    <td className={styles.tdNumber}>
                      <span className={styles.currencyValueBold}>
                        {formatCurrency(overview.projectedMax)}
                      </span>
                    </td>
                    <td className={styles.tdNumber}>
                      <span className={styles.workItemCount}>
                        {overview.categorySummaries.reduce((sum, c) => sum + c.budgetLineCount, 0)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default BudgetOverviewPage;
