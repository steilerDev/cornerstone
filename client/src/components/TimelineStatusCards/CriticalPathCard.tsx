import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TimelineWorkItem } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import styles from './TimelineStatusCards.module.css';

interface CriticalPathCardProps {
  criticalPath: string[];
  workItems: TimelineWorkItem[];
}

export function CriticalPathCard({ criticalPath, workItems }: CriticalPathCardProps) {
  const { t } = useTranslation('dashboard');
  const { formatDate } = useFormatters();

  // Filter work items to those on the critical path
  const criticalItems = workItems.filter((item) => criticalPath.includes(item.id));

  if (criticalItems.length === 0) {
    return (
      <p data-testid="critical-empty" className={styles.emptyState}>
        {t('cards.criticalPath.emptyNoDefined')}
      </p>
    );
  }

  // Find the next incomplete critical item with the earliest endDate
  const incompleteCritical = criticalItems
    .filter((item) => item.status !== 'completed' && item.endDate)
    .sort((a, b) => (a.endDate || '').localeCompare(b.endDate || ''));

  if (incompleteCritical.length === 0) {
    return (
      <p data-testid="critical-empty" className={styles.emptyState}>
        {t('cards.criticalPath.emptyAllCompleted')}
      </p>
    );
  }

  const nextItem = incompleteCritical[0]!; // guarded by length check at line 32
  const deadline = nextItem.endDate;

  // Compute days remaining
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let daysRemaining = 0;
  if (deadline) {
    const parts = deadline.split('-').map(Number);
    const year = parts[0]!; // split ensures at least 1 part or throws
    const month = parts[1]!; // must be YYYY-MM-DD format
    const day = parts[2]!; // must be YYYY-MM-DD format
    const deadlineDate = new Date(year, month - 1, day);
    const diff = deadlineDate.getTime() - today.getTime();
    daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  // Determine health indicator
  let healthClass = styles.badgeGreen; // green >14 days
  let healthLabel = t('cards.criticalPath.health.onTrack');
  if (daysRemaining < 0) {
    healthClass = styles.badgeRed; // red: overdue
    healthLabel = t('cards.criticalPath.health.overdue');
  } else if (daysRemaining < 7) {
    healthClass = styles.badgeRed; // red <7 days
    healthLabel = t('cards.criticalPath.health.critical');
  } else if (daysRemaining <= 14) {
    healthClass = styles.badgeYellow; // yellow 7-14 days
    healthLabel = t('cards.criticalPath.health.warning');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
      <div>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
          {t('cards.criticalPath.itemsOnPath')}
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
          {t('cards.criticalPath.nextDeadline')}
        </span>
        <div
          data-testid="critical-deadline"
          style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}
        >
          <Link to={`/work-items/${nextItem.id}`} className={styles.link}>
            {formatDate(deadline)}
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
            {t('cards.criticalPath.daysRemaining')}
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
  );
}
