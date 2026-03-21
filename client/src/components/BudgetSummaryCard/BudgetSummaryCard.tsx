import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BudgetOverview } from '@cornerstone/shared';
import { BudgetBar, type BudgetBarSegment } from '../BudgetBar/BudgetBar.js';
import { BudgetHealthIndicator } from '../BudgetHealthIndicator/BudgetHealthIndicator.js';
import { useFormatters } from '../../lib/formatters.js';
import styles from './BudgetSummaryCard.module.css';

interface BudgetSummaryCardProps {
  overview: BudgetOverview;
}

export function BudgetSummaryCard({ overview }: BudgetSummaryCardProps) {
  const { formatCurrency } = useFormatters();
  const { t } = useTranslation('dashboard');

  const {
    availableFunds,
    minPlanned,
    maxPlanned,
    actualCost,
    remainingVsMinPlanned,
    remainingVsMaxPlanned,
    subsidySummary,
  } = overview;

  // Medium net remaining: average of min and max remaining
  const mediumNetRemaining = (remainingVsMinPlanned + remainingVsMaxPlanned) / 2;

  // Build budget bar segments
  const segments: BudgetBarSegment[] = [
    {
      key: 'actual-cost',
      value: Math.max(0, actualCost),
      color: 'var(--color-budget-paid)',
      label: t('cards.budgetSummary.actualSpend'),
    },
  ];

  // Add remaining segment or overflow
  if (mediumNetRemaining >= 0) {
    segments.push({
      key: 'remaining',
      value: mediumNetRemaining,
      color: 'var(--color-budget-track)',
      label: t('cards.budgetSummary.remainingBudget'),
    });
  }

  const overflow = mediumNetRemaining < 0 ? Math.abs(mediumNetRemaining) : 0;

  return (
    <div className={styles.content}>
      {/* Primary metric */}
      <div className={styles.primaryMetric}>
        <span className={styles.metricLabel}>{t('cards.budgetSummary.remainingBudget')}</span>
        <span className={styles.metricValue} data-testid="remaining-budget">
          {formatCurrency(mediumNetRemaining)}
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
          <dt className={styles.metricItemLabel}>{t('cards.budgetSummary.plannedCostRange')}</dt>
          <dd className={styles.metricItemValue} data-testid="planned-cost-range">
            {formatCurrency(minPlanned)} – {formatCurrency(maxPlanned)}
          </dd>
        </div>

        <div className={styles.metricItem}>
          <dt className={styles.metricItemLabel}>{t('cards.budgetSummary.actualSpend')}</dt>
          <dd className={styles.metricItemValue} data-testid="actual-spend">
            {formatCurrency(actualCost)}
          </dd>
        </div>

        {subsidySummary.maxTotalPayback > 0 && (
          <div className={styles.metricItem}>
            <dt className={styles.metricItemLabel}>{t('cards.budgetSummary.subsidySavings')}</dt>
            <dd className={styles.metricItemValue} data-testid="subsidy-impact">
              {formatCurrency(subsidySummary.maxTotalPayback)}
            </dd>
          </div>
        )}

        {subsidySummary.oversubscribedSubsidies?.length > 0 && (
          <div className={styles.metricItem}>
            <dd className={styles.oversubscribedWarning} data-testid="oversubscribed-warning">
              {t('cards.budgetSummary.subsidiesOversubscribed')}
            </dd>
          </div>
        )}
      </dl>

      {/* Footer */}
      <div className={styles.footer}>
        <Link to="/budget/overview" className={styles.footerLink}>
          {t('cards.budgetSummary.viewBudgetOverview')}
        </Link>
      </div>
    </div>
  );
}
