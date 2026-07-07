import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, type BadgeVariantMap } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';

interface BudgetHealthIndicatorProps {
  remainingVsProjectedMax: number;
  availableFunds: number;
}

type HealthStatus = 'on-budget' | 'at-risk' | 'over-budget';

function resolveHealthStatus(
  remainingVsProjectedMax: number,
  availableFunds: number,
): HealthStatus {
  if (remainingVsProjectedMax < 0) {
    return 'over-budget';
  }

  // Special case: both are exactly zero — treat as at-risk
  if (availableFunds === 0) {
    return 'at-risk';
  }

  const margin = remainingVsProjectedMax / availableFunds;

  if (margin > 0.1) {
    return 'on-budget';
  }

  return 'at-risk';
}

export function BudgetHealthIndicator({
  remainingVsProjectedMax,
  availableFunds,
}: BudgetHealthIndicatorProps) {
  const { t } = useTranslation('budget');
  const status = resolveHealthStatus(remainingVsProjectedMax, availableFunds);

  const variants = useMemo(
    (): BadgeVariantMap => ({
      'on-budget': { label: t('health.onBudget'), className: badgeStyles.budgetHealthOnBudget! },
      'at-risk': { label: t('health.atRisk'), className: badgeStyles.budgetHealthAtRisk! },
      'over-budget': {
        label: t('health.overBudget'),
        className: badgeStyles.budgetHealthOverBudget!,
      },
    }),
    [t],
  );

  return (
    <span role="status">
      <Badge variants={variants} value={status} />
    </span>
  );
}
