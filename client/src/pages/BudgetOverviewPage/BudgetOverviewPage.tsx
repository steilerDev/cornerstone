import { useState, useEffect } from 'react';
import type { BudgetOverview } from '@cornerstone/shared';
import { fetchBudgetOverview } from '../../lib/budgetOverviewApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import styles from './BudgetOverviewPage.module.css';

// ---- Formatting helpers ----

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

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
        <div className={styles.loading} role="status" aria-label="Loading budget overview">
          Loading budget overview...
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>Error</h2>
          <p>{error}</p>
          <button type="button" className={styles.retryButton} onClick={() => void loadOverview()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!overview) {
    return null;
  }

  const varianceVariant = overview.totalVariance >= 0 ? 'positive' : 'negative';
  const remainingVariant = overview.financingSummary.totalRemaining >= 0 ? 'positive' : 'negative';
  const hasData =
    overview.totalPlannedBudget > 0 ||
    overview.totalActualCost > 0 ||
    overview.categorySummaries.length > 0 ||
    overview.financingSummary.sourceCount > 0;

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Budget Overview</h1>
        </div>

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
          {/* Total Budget card */}
          <SummaryCard title="Total Budget">
            <StatRow label="Planned" value={formatCurrency(overview.totalPlannedBudget)} />
            <StatRow label="Actual Cost" value={formatCurrency(overview.totalActualCost)} />
            <div className={styles.cardDivider} />
            <StatRow
              label="Variance"
              value={formatCurrency(overview.totalVariance)}
              variant={varianceVariant}
            />
            {overview.totalVariance >= 0 ? (
              <p className={styles.cardNote}>Under budget</p>
            ) : (
              <p className={`${styles.cardNote} ${styles.cardNoteNegative}`}>Over budget</p>
            )}
          </SummaryCard>

          {/* Financing card */}
          <SummaryCard title="Financing">
            <StatRow
              label="Total Available"
              value={formatCurrency(overview.financingSummary.totalAvailable)}
            />
            <StatRow label="Used" value={formatCurrency(overview.financingSummary.totalUsed)} />
            <div className={styles.cardDivider} />
            <StatRow
              label="Remaining"
              value={formatCurrency(overview.financingSummary.totalRemaining)}
              variant={remainingVariant}
            />
            <p className={styles.cardNote}>
              {overview.financingSummary.sourceCount}{' '}
              {overview.financingSummary.sourceCount === 1 ? 'source' : 'sources'}
            </p>
          </SummaryCard>

          {/* Vendors card */}
          <SummaryCard title="Vendors">
            <StatRow label="Total Paid" value={formatCurrency(overview.vendorSummary.totalPaid)} />
            <StatRow
              label="Outstanding"
              value={formatCurrency(overview.vendorSummary.totalOutstanding)}
              variant={overview.vendorSummary.totalOutstanding > 0 ? 'negative' : 'default'}
            />
            <p className={styles.cardNote}>
              {overview.vendorSummary.vendorCount}{' '}
              {overview.vendorSummary.vendorCount === 1 ? 'vendor' : 'vendors'}
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
                      Planned Budget
                    </th>
                    <th scope="col" className={styles.thNumber}>
                      Actual Cost
                    </th>
                    <th scope="col" className={styles.thNumber}>
                      Variance
                    </th>
                    <th scope="col" className={styles.thNumber}>
                      Work Items
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overview.categorySummaries.map((cat) => (
                    <tr key={cat.categoryId} className={styles.tableRow}>
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
                          {formatCurrency(cat.plannedBudget)}
                        </span>
                      </td>
                      <td className={styles.tdNumber}>
                        <span className={styles.currencyValue}>
                          {formatCurrency(cat.actualCost)}
                        </span>
                      </td>
                      <td className={styles.tdNumber}>
                        <span
                          className={
                            cat.variance >= 0 ? styles.variancePositive : styles.varianceNegative
                          }
                        >
                          {cat.variance >= 0 ? '+' : ''}
                          {formatCurrency(cat.variance)}
                        </span>
                      </td>
                      <td className={styles.tdNumber}>
                        <span className={styles.workItemCount}>{cat.workItemCount}</span>
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
                        {formatCurrency(overview.totalPlannedBudget)}
                      </span>
                    </td>
                    <td className={styles.tdNumber}>
                      <span className={styles.currencyValueBold}>
                        {formatCurrency(overview.totalActualCost)}
                      </span>
                    </td>
                    <td className={styles.tdNumber}>
                      <span
                        className={
                          overview.totalVariance >= 0
                            ? `${styles.variancePositive} ${styles.currencyValueBold}`
                            : `${styles.varianceNegative} ${styles.currencyValueBold}`
                        }
                      >
                        {overview.totalVariance >= 0 ? '+' : ''}
                        {formatCurrency(overview.totalVariance)}
                      </span>
                    </td>
                    <td className={styles.tdNumber}>
                      <span className={styles.workItemCount}>
                        {overview.categorySummaries.reduce((sum, c) => sum + c.workItemCount, 0)}
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
