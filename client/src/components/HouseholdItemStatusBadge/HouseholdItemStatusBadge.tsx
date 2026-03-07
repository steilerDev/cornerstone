import type { HouseholdItemStatus } from '@cornerstone/shared';
import styles from './HouseholdItemStatusBadge.module.css';

interface HouseholdItemStatusBadgeProps {
  status: HouseholdItemStatus;
}

const STATUS_LABELS: Record<HouseholdItemStatus, string> = {
  planned: 'Planned',
  purchased: 'Purchased',
  scheduled: 'Scheduled',
  arrived: 'Arrived',
};

export function HouseholdItemStatusBadge({ status }: HouseholdItemStatusBadgeProps) {
  return <span className={`${styles.badge} ${styles[status]}`}>{STATUS_LABELS[status]}</span>;
}
