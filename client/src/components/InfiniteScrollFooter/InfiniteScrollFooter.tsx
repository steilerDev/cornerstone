import { useTranslation } from 'react-i18next';
import { Spinner } from '../Spinner/Spinner.js';
import { FormError } from '../FormError/FormError.js';
import shared from '../../styles/shared.module.css';
import styles from './InfiniteScrollFooter.module.css';

export interface InfiniteScrollFooterProps {
  status: 'idle' | 'loading' | 'error' | 'done';
  hasMore: boolean;
  sentinelRef: (node: HTMLDivElement | null) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}

export function InfiniteScrollFooter({
  status,
  sentinelRef,
  onLoadMore,
  onRetry,
}: InfiniteScrollFooterProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.footer} data-testid="diary-infinite-scroll-footer">
      <div
        ref={sentinelRef}
        aria-hidden="true"
        className={styles.sentinel}
        data-testid="infinite-scroll-sentinel"
      />
      {status === 'error' && <FormError message={t('diary:infiniteScroll.errorMessage')} />}
      {status === 'loading' && (
        <div className={styles.statusRow}>
          <Spinner size="md" color="muted" label={t('diary:infiniteScroll.loadingMoreAriaLabel')} />
          <span>{t('diary:infiniteScroll.loadingMore')}</span>
        </div>
      )}
      {status === 'done' ? (
        <div className={styles.endOfList} data-testid="diary-end-of-list">
          {t('diary:infiniteScroll.endOfList')}
        </div>
      ) : (
        <button
          type="button"
          className={`${shared.btnSecondary} ${styles.loadMoreButton}`}
          disabled={status === 'loading'}
          onClick={status === 'error' ? onRetry : onLoadMore}
          data-testid="diary-load-more-button"
        >
          {status === 'loading' ? (
            <>
              <Spinner size="sm" color="muted" />
              {t('diary:infiniteScroll.loadingMore')}
            </>
          ) : status === 'error' ? (
            t('diary:infiniteScroll.retryButton')
          ) : (
            t('diary:infiniteScroll.loadMoreButton')
          )}
        </button>
      )}
    </div>
  );
}

export default InfiniteScrollFooter;
