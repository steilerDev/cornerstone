import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TimelineMilestone } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { Badge, type BadgeVariantMap } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';
import styles from './TimelineStatusCards.module.css';

interface UpcomingMilestonesCardProps {
  milestones: TimelineMilestone[];
}

export function UpcomingMilestonesCard({ milestones }: UpcomingMilestonesCardProps) {
  const { t } = useTranslation('dashboard');
  const { formatDate } = useFormatters();

  // Filter out completed milestones, sort by targetDate ascending, take first 5
  const upcoming = milestones
    .filter((m) => !m.isCompleted)
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
    .slice(0, 5);

  const healthVariants = useMemo(
    (): BadgeVariantMap => ({
      onTrack: {
        label: t('cards.upcomingMilestones.onTrack'),
        className: badgeStyles.scheduleOnTrack!,
      },
      delayed: {
        label: t('cards.upcomingMilestones.delayed'),
        className: badgeStyles.scheduleAtRisk!,
      },
    }),
    [t],
  );

  if (upcoming.length === 0) {
    return (
      <p data-testid="milestone-empty" className={styles.emptyState}>
        {t('cards.upcomingMilestones.emptyMessage')}
      </p>
    );
  }

  return (
    <>
      <ul className={styles.list}>
        {upcoming.map((milestone) => {
          // Determine health: "On Track" if projectedDate <= targetDate or no projectedDate
          const isOnTrack =
            !milestone.projectedDate || milestone.projectedDate <= milestone.targetDate;

          return (
            <li key={milestone.id} data-testid="milestone-row" className={styles.listItem}>
              <Link to={`/schedule/milestones/${milestone.id}`} className={styles.link}>
                {milestone.title}
              </Link>
              <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {formatDate(milestone.targetDate)}
                </span>
                <Badge
                  testId="milestone-health"
                  variants={healthVariants}
                  value={isOnTrack ? 'onTrack' : 'delayed'}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
