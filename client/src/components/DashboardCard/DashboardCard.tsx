import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../Skeleton/index.js';
import { EmptyState } from '../EmptyState/index.js';
import styles from './DashboardCard.module.css';

export interface DashboardCardProps {
  /** Unique identifier for the card (used for aria-labelledby) */
  id: string;
  /** Card title displayed in the header */
  title: string;
  /** Called when the dismiss button is clicked */
  onDismiss: () => void;
  /** Whether the card is loading data */
  isLoading?: boolean;
  /** Error message to display, if any */
  error?: string | null;
  /** Called when the retry button is clicked */
  onRetry?: () => void;
  /** Whether the card should show the empty state */
  isEmpty?: boolean;
  /** Message displayed in the empty state */
  emptyMessage?: string;
  /** Optional action link for the empty state */
  emptyAction?: {
    label: string;
    href: string;
  };
  /** Card content */
  children: ReactNode;
}

export function DashboardCard({
  id,
  title,
  onDismiss,
  isLoading = false,
  error = null,
  onRetry,
  isEmpty = false,
  emptyMessage = 'No data available',
  emptyAction,
  children,
}: DashboardCardProps) {
  const { t } = useTranslation('dashboard');

  return (
    <article className={styles.card} aria-labelledby={`card-${id}-title`}>
      {/* Card header with title and dismiss button */}
      <div className={styles.cardHeader}>
        <h2 id={`card-${id}-title`} className={styles.cardTitle}>
          {title}
        </h2>
        <button
          type="button"
          className={styles.dismissButton}
          onClick={onDismiss}
          aria-label={`Hide ${title} card`}
          title={`Hide ${title} card`}
        >
          ✕
        </button>
      </div>

      {/* Content area */}
      <div className={styles.cardContent}>
        {/* Loading state */}
        {isLoading && <Skeleton loadingLabel={`Loading ${title} data`} />}

        {/* Error state */}
        {!isLoading && error && (
          <div className={styles.errorState} role="alert">
            <p className={styles.errorMessage}>{error}</p>
            {onRetry && (
              <button type="button" className={styles.retryButton} onClick={onRetry}>
                {t('cards.common.retry')}
              </button>
            )}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && isEmpty && (
          <EmptyState
            message={emptyMessage || 'No data available'}
            action={emptyAction ? { label: emptyAction.label, href: emptyAction.href } : undefined}
          />
        )}

        {/* Normal content */}
        {!isLoading && !error && !isEmpty && children}
      </div>
    </article>
  );
}

export default DashboardCard;
