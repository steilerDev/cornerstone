import { useTranslation } from 'react-i18next';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  /** Number of skeleton lines to render (default: 3) */
  lines?: number;
  /** Optional array of width percentages for each line (e.g., ['100%', '80%', '60%']) */
  widths?: string[];
  /** Optional loading label for aria-label */
  loadingLabel?: string;
  /** Additional CSS class */
  className?: string;
}

export function Skeleton({ lines = 3, widths, loadingLabel, className }: SkeletonProps) {
  const { t } = useTranslation('common');
  const resolvedLabel = loadingLabel ?? t('loading');

  const lineArray = Array.from({ length: lines }, (_, i) => {
    // Use provided widths, or alternate between 100%, 80%, 60%
    if (widths && widths[i]) {
      return widths[i];
    }
    const defaultWidths = ['100%', '80%', '60%'];
    return defaultWidths[i % defaultWidths.length];
  });

  return (
    <div
      className={`${styles.skeleton} ${className || ''}`}
      role="status"
      aria-busy="true"
      aria-label={resolvedLabel}
    >
      {lineArray.map((width, i) => (
        <div key={i} className={styles.line} style={{ width }} aria-hidden="true" />
      ))}
    </div>
  );
}

export default Skeleton;
