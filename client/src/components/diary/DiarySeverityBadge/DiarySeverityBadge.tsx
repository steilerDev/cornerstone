import type { DiaryIssueSeverity } from '@cornerstone/shared';
import styles from './DiarySeverityBadge.module.css';

interface DiarySeverityBadgeProps {
  severity: DiaryIssueSeverity;
}

const SEVERITY_LABELS: Record<DiaryIssueSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export function DiarySeverityBadge({ severity }: DiarySeverityBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[severity]}`} data-testid={`severity-${severity}`}>
      {SEVERITY_LABELS[severity]}
    </span>
  );
}
