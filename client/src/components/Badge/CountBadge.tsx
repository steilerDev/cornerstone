import styles from './CountBadge.module.css';

export interface CountBadgeProps {
  count: number;
  /** Highest number shown; above it the badge reads "‹max›+" (default 99). */
  max?: number;
  /** Position class from the host (the badge has no position of its own). */
  className?: string;
  testId?: string;
}

/**
 * Decorative count pill. The host's accessible name carries the exact count, so the badge is
 * hidden from assistive technology. Renders nothing at 0.
 */
export function CountBadge({ count, max = 99, className, testId }: CountBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      className={className ? `${styles.badge} ${className}` : styles.badge}
      aria-hidden="true"
      data-testid={testId}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}

export default CountBadge;
