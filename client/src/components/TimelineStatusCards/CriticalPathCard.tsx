import type { TimelineWorkItem } from '@cornerstone/shared';
import { formatDate } from '../../lib/formatters.js';
import styles from './TimelineStatusCards.module.css';

interface CriticalPathCardProps {
  criticalPath: string[];
  workItems: TimelineWorkItem[];
}

export function CriticalPathCard({ criticalPath, workItems }: CriticalPathCardProps) {
  // Filter work items to those on the critical path
  const criticalItems = workItems.filter((item) => criticalPath.includes(item.id));

  if (criticalItems.length === 0) {
    return (
      <div className={styles.cardSection}>
        <h3 className={styles.sectionHeader}>Critical Path</h3>
        <p data-testid="critical-empty" className={styles.emptyState}>
          No critical path defined
        </p>
      </div>
    );
  }

  // Find the next incomplete critical item with the earliest endDate
  const incompleteCritical = criticalItems
    .filter((item) => item.status !== 'completed' && item.endDate)
    .sort((a, b) => (a.endDate || '').localeCompare(b.endDate || ''));

  if (incompleteCritical.length === 0) {
    return (
      <div className={styles.cardSection}>
        <h3 className={styles.sectionHeader}>Critical Path</h3>
        <p data-testid="critical-empty" className={styles.emptyState}>
          All critical items completed
        </p>
      </div>
    );
  }

  const nextItem = incompleteCritical[0];
  const deadline = nextItem.endDate;

  // Compute days remaining
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let daysRemaining = 0;
  if (deadline) {
    const [year, month, day] = deadline.split('-').map(Number);
    const deadlineDate = new Date(year, month - 1, day);
    const diff = deadlineDate.getTime() - today.getTime();
    daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  // Determine health indicator
  let healthClass = styles.badgeGreen; // green >14 days
  let healthLabel = 'On Track';
  if (daysRemaining < 0) {
    healthClass = styles.badgeRed; // red: overdue
    healthLabel = 'Overdue';
  } else if (daysRemaining < 7) {
    healthClass = styles.badgeRed; // red <7 days
    healthLabel = 'Critical';
  } else if (daysRemaining <= 14) {
    healthClass = styles.badgeYellow; // yellow 7-14 days
    healthLabel = 'Warning';
  }

  return (
    <div className={styles.cardSection}>
      <h3 className={styles.sectionHeader}>Critical Path</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
        <div>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
            Items on Path
          </span>
          <div
            data-testid="critical-count"
            style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)' }}
          >
            {criticalItems.length}
          </div>
        </div>

        <div>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
            Next Deadline
          </span>
          <div
            data-testid="critical-deadline"
            style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}
          >
            {formatDate(deadline)}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
              Days Remaining
            </span>
            <div
              data-testid="critical-days"
              style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)' }}
            >
              {daysRemaining}
            </div>
          </div>
          <div data-testid="critical-health" className={`${styles.badge} ${healthClass}`}>
            {healthLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
