import type { TimelineWorkItem } from '@cornerstone/shared';
import styles from './TimelineStatusCards.module.css';

interface WorkItemProgressCardProps {
  workItems: TimelineWorkItem[];
}

export function WorkItemProgressCard({ workItems }: WorkItemProgressCardProps) {
  if (workItems.length === 0) {
    return (
      <p data-testid="progress-empty" className={styles.emptyState}>
        No work items
      </p>
    );
  }

  // Count work items by status
  const counts = {
    not_started: workItems.filter((w) => w.status === 'not_started').length,
    in_progress: workItems.filter((w) => w.status === 'in_progress').length,
    completed: workItems.filter((w) => w.status === 'completed').length,
  };

  const total = workItems.length;

  // Compute donut segments
  const circumference = 2 * Math.PI * 40; // radius 40
  const segments = [
    {
      status: 'not_started' as const,
      count: counts.not_started,
      color: 'var(--color-text-muted)',
    },
    {
      status: 'in_progress' as const,
      count: counts.in_progress,
      color: 'var(--color-primary)',
    },
    {
      status: 'completed' as const,
      count: counts.completed,
      color: 'var(--color-success)',
    },
  ];

  // Build SVG circles with accumulated offset
  let accumulatedOffset = 0;
  const circles = segments.map((segment) => {
    const segmentLength = (segment.count / total) * circumference;
    const strokeDasharray = `${segmentLength} ${circumference - segmentLength}`;
    const strokeDashoffset = -accumulatedOffset;
    const circle = (
      <circle
        key={segment.status}
        cx="52"
        cy="52"
        r="40"
        fill="none"
        stroke={segment.color}
        strokeWidth="24"
        strokeDasharray={strokeDasharray}
        strokeDashoffset={strokeDashoffset}
      />
    );
    accumulatedOffset += segmentLength;
    return circle;
  });

  const statusLabels = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    completed: 'Completed',
  };

  const statusColors = {
    not_started: 'var(--color-text-muted)',
    in_progress: 'var(--color-primary)',
    completed: 'var(--color-success)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg
        viewBox="0 0 104 104"
        width="120"
        height="120"
        data-testid="progress-donut"
        role="img"
        aria-label={`Work item progress: ${counts.completed} completed, ${counts.in_progress} in progress, ${counts.not_started} not started`}
      >
        {/* Background circle */}
        <circle cx="52" cy="52" r="40" fill="none" stroke="var(--color-border)" strokeWidth="24" />

        {/* Rotated group for clockwise rotation from top */}
        <g transform="rotate(-90 52 52)">{circles}</g>

        {/* Center text */}
        <text
          x="52"
          y="52"
          textAnchor="middle"
          dy="0.3em"
          fontSize="24"
          fontWeight="600"
          fill="var(--color-text-primary)"
          data-testid="progress-total"
        >
          {total}
        </text>
      </svg>

      {/* Legend */}
      <div className={styles.legend} data-testid="progress-legend">
        {segments.map((segment) => (
          <div key={segment.status} className={styles.legendItem}>
            <div
              className={styles.legendDot}
              style={{ backgroundColor: statusColors[segment.status] }}
            />
            <span>{statusLabels[segment.status]}</span>
            <span className={styles.legendCount}>{segment.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
