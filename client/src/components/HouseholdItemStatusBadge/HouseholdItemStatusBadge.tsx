import type { HouseholdItemStatus } from '@cornerstone/shared';
import styles from './HouseholdItemStatusBadge.module.css';

interface HouseholdItemStatusBadgeProps {
  status: HouseholdItemStatus;
}

const STATUS_LABELS: Record<HouseholdItemStatus, string> = {
  not_ordered: 'Not Ordered',
  ordered: 'Ordered',
  in_transit: 'In Transit',
  delivered: 'Delivered',
};

export function HouseholdItemStatusBadge({ status }: HouseholdItemStatusBadgeProps) {
  return <span className={`${styles.badge} ${styles[status]}`}>{STATUS_LABELS[status]}</span>;
}
