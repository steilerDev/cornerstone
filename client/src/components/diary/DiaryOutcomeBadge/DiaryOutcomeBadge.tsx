import type { DiaryInspectionOutcome } from '@cornerstone/shared';
import styles from './DiaryOutcomeBadge.module.css';

interface DiaryOutcomeBadgeProps {
  outcome: DiaryInspectionOutcome;
}

const OUTCOME_LABELS: Record<DiaryInspectionOutcome, string> = {
  pass: 'Pass',
  fail: 'Fail',
  conditional: 'Conditional',
};

export function DiaryOutcomeBadge({ outcome }: DiaryOutcomeBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[outcome]}`} data-testid={`outcome-${outcome}`}>
      {OUTCOME_LABELS[outcome]}
    </span>
  );
}
