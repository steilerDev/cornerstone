import { Link } from 'react-router-dom';
import type { TimelineMilestone } from '@cornerstone/shared';
import { formatDate } from '../../lib/formatters.js';
import styles from './TimelineStatusCards.module.css';

interface UpcomingMilestonesCardProps {
  milestones: TimelineMilestone[];
}

export function UpcomingMilestonesCard({ milestones }: UpcomingMilestonesCardProps) {
  // Filter out completed milestones, sort by targetDate ascending, take first 5
  const upcoming = milestones
    .filter((m) => !m.isCompleted)
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
    .slice(0, 5);

  if (upcoming.length === 0) {
    return (
      <p data-testid="milestone-empty" className={styles.emptyState}>
        No upcoming milestones
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
          const healthText = isOnTrack ? 'On Track' : 'Delayed';

          return (
            <li key={milestone.id} data-testid="milestone-row" className={styles.listItem}>
              <Link to={`/schedule/milestones/${milestone.id}`} className={styles.link}>
                {milestone.title}
              </Link>
              <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {formatDate(milestone.targetDate)}
                </span>
                <span
                  data-testid="milestone-health"
                  className={`${styles.badge} ${isOnTrack ? styles.badgeGreen : styles.badgeRed}`}
                >
                  {healthText}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
