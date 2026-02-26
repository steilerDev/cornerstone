import type { WorkItemStatus } from '@cornerstone/shared';
import styles from './StatusBadge.module.css';

interface StatusBadgeProps {
  status: WorkItemStatus;
}

const STATUS_LABELS: Record<WorkItemStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`${styles.badge} ${styles[status]}`}>{STATUS_LABELS[status]}</span>;
}
