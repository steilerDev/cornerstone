import { Link } from 'react-router-dom';
import type { TimelineWorkItem } from '@cornerstone/shared';
import styles from './TimelineStatusCards.module.css';

interface AtRiskItemsCardProps {
  workItems: TimelineWorkItem[];
}

interface AtRiskItem {
  id: string;
  title: string;
  reason: 'Overdue' | 'Late Start';
  sortDate: string;
}

export function AtRiskItemsCard({ workItems }: AtRiskItemsCardProps) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Find at-risk items
  const atRiskItems: AtRiskItem[] = [];

  for (const item of workItems) {
    if (item.status === 'in_progress' && item.endDate && item.endDate < today) {
      // Overdue: in progress and end date is in the past
      atRiskItems.push({
        id: item.id,
        title: item.title,
        reason: 'Overdue',
        sortDate: item.endDate,
      });
    } else if (item.status === 'not_started' && item.startDate && item.startDate < today) {
      // Late Start: not started and start date is in the past
      atRiskItems.push({
        id: item.id,
        title: item.title,
        reason: 'Late Start',
        sortDate: item.startDate,
      });
    }
  }

  // Sort by date ascending (most overdue first), take first 5
  atRiskItems.sort((a, b) => a.sortDate.localeCompare(b.sortDate));
  const topRisks = atRiskItems.slice(0, 5);

  if (topRisks.length === 0) {
    return (
      <div className={styles.cardSection}>
        <h3 className={styles.sectionHeader}>At Risk Items</h3>
        <p data-testid="risk-empty" className={styles.emptyState}>
          All items on track
        </p>
      </div>
    );
  }

  return (
    <div className={styles.cardSection}>
      <h3 className={styles.sectionHeader}>At Risk Items</h3>
      <ul className={styles.list}>
        {topRisks.map((item) => (
          <li key={item.id} data-testid="risk-row" className={styles.listItem}>
            <Link to={`/work-items/${item.id}`} className={styles.link}>
              {item.title}
            </Link>
            <span data-testid="risk-reason" className={`${styles.badge} ${styles.badgeRed}`}>
              {item.reason}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
