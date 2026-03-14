import { Link } from 'react-router-dom';
import type { BudgetOverview } from '@cornerstone/shared';
import { BudgetBar, type BudgetBarSegment } from '../BudgetBar/BudgetBar.js';
import { BudgetHealthIndicator } from '../BudgetHealthIndicator/BudgetHealthIndicator.js';
import { formatCurrency } from '../../lib/formatters.js';
import styles from './BudgetSummaryCard.module.css';

interface BudgetSummaryCardProps {
  overview: BudgetOverview;
}

export function BudgetSummaryCard({ overview }: BudgetSummaryCardProps) {
  const {
    availableFunds,
    minPlanned,
    maxPlanned,
    actualCost,
    remainingVsActualCost,
    remainingVsMaxPlanned,
    subsidySummary,
  } = overview;

  // Build budget bar segments
  const segments: BudgetBarSegment[] = [
    {
      key: 'actual-cost',
      value: Math.max(0, actualCost),
      color: 'var(--color-budget-paid)',
      label: 'Actual Spend',
    },
  ];

  // Add remaining segment or overflow
  if (remainingVsActualCost >= 0) {
    segments.push({
      key: 'remaining',
      value: remainingVsActualCost,
      color: 'var(--color-budget-track)',
      label: 'Remaining',
    });
  }

  const overflow = remainingVsActualCost < 0 ? Math.abs(remainingVsActualCost) : 0;

  return (
    <div className={styles.content}>
      {/* Primary metric */}
      <div className={styles.primaryMetric}>
        <span className={styles.metricLabel}>Remaining Budget</span>
        <span className={styles.metricValue} data-testid="remaining-budget">
          {formatCurrency(remainingVsActualCost)}
        </span>
      </div>

      {/* Budget bar */}
      <BudgetBar
        segments={segments}
        maxValue={availableFunds > 0 ? availableFunds : 1}
        overflow={overflow}
        height="sm"
        formatValue={formatCurrency}
      />

      {/* Health row */}
      <div className={styles.healthRow}>
        <BudgetHealthIndicator
          remainingVsProjectedMax={remainingVsMaxPlanned}
          availableFunds={availableFunds}
        />
      </div>

      {/* Metrics grid */}
      <dl className={styles.metricsGrid}>
        <div className={styles.metricItem}>
          <dt className={styles.metricItemLabel}>Planned Cost Range</dt>
          <dd className={styles.metricItemValue} data-testid="planned-cost-range">
            {formatCurrency(minPlanned)} – {formatCurrency(maxPlanned)}
          </dd>
        </div>

        <div className={styles.metricItem}>
          <dt className={styles.metricItemLabel}>Actual Spend</dt>
          <dd className={styles.metricItemValue} data-testid="actual-spend">
            {formatCurrency(actualCost)}
          </dd>
        </div>

        {subsidySummary.totalReductions > 0 && (
          <div className={styles.metricItem}>
            <dt className={styles.metricItemLabel}>Subsidy Savings</dt>
            <dd className={styles.metricItemValue} data-testid="subsidy-impact">
              {formatCurrency(subsidySummary.totalReductions)}
            </dd>
          </div>
        )}
      </dl>

      {/* Footer */}
      <div className={styles.footer}>
        <Link to="/budget/overview" className={styles.footerLink}>
          View Budget Overview →
        </Link>
      </div>
    </div>
  );
}
