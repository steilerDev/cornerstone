import type { CategoryBudgetSummary } from '@cornerstone/shared';
import styles from './BudgetAlertsCard.module.css';

interface BudgetAlertsCardProps {
  categorySummaries: CategoryBudgetSummary[];
}

type AlertSeverity = 'red' | 'yellow';

interface AlertItem {
  categoryName: string;
  pctUsed: number;
  severity: AlertSeverity;
}

export function BudgetAlertsCard({ categorySummaries }: BudgetAlertsCardProps) {
  // Build alert list
  const alerts: AlertItem[] = [];

  for (const summary of categorySummaries) {
    // Skip categories with no budget lines
    if (summary.budgetLineCount === 0) {
      continue;
    }

    // Compute percentage used
    const pctUsed = summary.maxPlanned > 0 ? (summary.actualCost / summary.maxPlanned) * 100 : 0;

    // Determine severity
    let severity: AlertSeverity | null = null;
    if (summary.actualCost > summary.maxPlanned) {
      // Red alert: over budget
      severity = 'red';
    } else if (pctUsed >= 90) {
      // Yellow alert: 90-100% utilized
      severity = 'yellow';
    }

    if (severity) {
      alerts.push({
        categoryName: summary.categoryName,
        pctUsed,
        severity,
      });
    }
  }

  // Sort: red first, then yellow; within each group, descending by percentage
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'red' ? -1 : 1;
    }
    return b.pctUsed - a.pctUsed;
  });

  // If no alerts, show empty state
  if (alerts.length === 0) {
    return (
      <p data-testid="alert-empty" className={styles.emptyState}>
        All categories on track
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {alerts.map((alert) => (
        <li
          key={alert.categoryName}
          data-testid="alert-item"
          className={`${styles.item} ${alert.severity === 'red' ? styles.itemRed : styles.itemYellow}`}
        >
          <div
            className={`${styles.dot} ${alert.severity === 'red' ? styles.dotRed : styles.dotYellow}`}
            aria-hidden="true"
          />
          <span className={styles.categoryName}>{alert.categoryName}</span>
          <span
            className={`${styles.pctText} ${alert.severity === 'red' ? styles.pctRed : styles.pctYellow}`}
          >
            {alert.pctUsed.toFixed(1)}% of budget
          </span>
        </li>
      ))}
    </ul>
  );
}
