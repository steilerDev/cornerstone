import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TimelineWorkItem } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { Badge, type BadgeVariantMap } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';
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

  // Find the next incomplete critical item with the earliest endDate
  const incompleteCritical = criticalItems
    .filter((item) => item.status !== 'completed' && item.endDate)
    .sort((a, b) => (a.endDate || '').localeCompare(b.endDate || ''));

  const nextItem = incompleteCritical[0] ?? null;
  const deadline = nextItem?.endDate ?? null;

  // Compute days remaining — use useMemo so date construction is not in the render body.
  // All hooks must be called unconditionally before any early returns.
  const daysRemaining = useMemo(() => {
    if (!deadline) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const parts = deadline.split('-').map(Number);
    const year = parts[0]!; // split ensures at least 1 part or throws
    const month = parts[1]!; // must be YYYY-MM-DD format
    const day = parts[2]!; // must be YYYY-MM-DD format
    const deadlineDate = new Date(year, month - 1, day);
    const diff = deadlineDate.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [deadline]);

  type HealthStatus = 'onTrack' | 'warning' | 'critical' | 'overdue';

  let status: HealthStatus = 'onTrack';
  if (daysRemaining < 0) {
    status = 'overdue';
  } else if (daysRemaining < 7) {
    status = 'critical';
  } else if (daysRemaining <= 14) {
    status = 'warning';
  }

  const healthVariants = useMemo(
    (): BadgeVariantMap => ({
      onTrack: {
        label: t('cards.criticalPath.health.onTrack'),
        className: badgeStyles.scheduleOnTrack!,
      },
      warning: {
        label: t('cards.criticalPath.health.warning'),
        className: badgeStyles.scheduleWarning!,
      },
      critical: {
        label: t('cards.criticalPath.health.critical'),
        className: badgeStyles.scheduleAtRisk!,
      },
      overdue: {
        label: t('cards.criticalPath.health.overdue'),
        className: badgeStyles.scheduleAtRisk!,
      },
    }),
    [t],
  );

  if (criticalItems.length === 0) {
    return (
      <p data-testid="critical-empty" className={styles.emptyState}>
        {t('cards.criticalPath.emptyNoDefined')}
      </p>
    );
  }

  if (!nextItem) {
    return (
      <p data-testid="critical-empty" className={styles.emptyState}>
        {t('cards.criticalPath.emptyAllCompleted')}
      </p>
    );
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
        <Badge testId="critical-health" variants={healthVariants} value={status} />
      </div>
    </div>
  );
}
