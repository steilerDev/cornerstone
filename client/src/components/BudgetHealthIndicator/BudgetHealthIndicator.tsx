import styles from './BudgetHealthIndicator.module.css';

interface BudgetHealthIndicatorProps {
  remainingVsProjectedMax: number;
  availableFunds: number;
}

type HealthStatus = 'on-budget' | 'at-risk' | 'over-budget';

interface HealthConfig {
  status: HealthStatus;
  label: string;
  cssClass: string;
}

function resolveHealth(remainingVsProjectedMax: number, availableFunds: number): HealthConfig {
  if (remainingVsProjectedMax < 0) {
    return {
      status: 'over-budget',
      label: 'Over Budget',
      cssClass: styles.overBudget,
    };
  }

  // Special case: both are exactly zero — treat as at-risk
  if (availableFunds === 0) {
    return {
      status: 'at-risk',
      label: 'At Risk',
      cssClass: styles.atRisk,
    };
  }

  const margin = remainingVsProjectedMax / availableFunds;

  if (margin > 0.1) {
    return {
      status: 'on-budget',
      label: 'On Budget',
      cssClass: styles.onBudget,
    };
  }

  return {
    status: 'at-risk',
    label: 'At Risk',
    cssClass: styles.atRisk,
  };
}

export function BudgetHealthIndicator({
  remainingVsProjectedMax,
  availableFunds,
}: BudgetHealthIndicatorProps) {
  const { label, cssClass } = resolveHealth(remainingVsProjectedMax, availableFunds);

  return (
    <span className={`${styles.badge} ${cssClass}`} role="status">
      {label}
    </span>
  );
}
