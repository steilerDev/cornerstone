import type { InfiniteScrollStatus } from '../../hooks/useInfiniteScroll.js';
import { Spinner } from '../Spinner/Spinner.js';
import { FormError } from '../FormError/FormError.js';
import shared from '../../styles/shared.module.css';
import styles from './InfiniteScrollFooter.module.css';

export interface InfiniteScrollFooterProps {
  status: InfiniteScrollStatus;
  loadingLabel: string;
  loadingAriaLabel: string;
  loadMoreLabel: string;
  retryLabel: string;
  errorMessage: string;
  endOfListMessage: string;
  sentinelRef: (node: HTMLDivElement | null) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  /** Prefix for all data-testid attributes. Defaults to 'infinite-scroll'. */
  testIdPrefix?: string;
}

export function InfiniteScrollFooter({
  status,
  loadingLabel,
  loadingAriaLabel,
  loadMoreLabel,
  retryLabel,
  errorMessage,
  endOfListMessage,
  sentinelRef,
  onLoadMore,
  onRetry,
  testIdPrefix = 'infinite-scroll',
}: InfiniteScrollFooterProps) {
  return (
    <div className={styles.footer} data-testid={`${testIdPrefix}-footer`}>
      <div
        ref={sentinelRef}
        aria-hidden="true"
        className={styles.sentinel}
        data-testid={`${testIdPrefix}-sentinel`}
      />
      {status === 'error' && <FormError message={errorMessage} />}
      {status === 'done' ? (
        <div className={styles.endOfList} data-testid={`${testIdPrefix}-end-of-list`}>
          {endOfListMessage}
        </div>
      ) : (
        <button
          type="button"
          className={`${shared.btnSecondary} ${styles.loadMoreButton}`}
          disabled={status === 'loading'}
          onClick={status === 'error' ? onRetry : onLoadMore}
          data-testid={`${testIdPrefix}-load-more-button`}
        >
          {status === 'loading' ? (
            <>
              <Spinner size="sm" color="muted" label={loadingAriaLabel} />
              {loadingLabel}
            </>
          ) : status === 'error' ? (
            retryLabel
          ) : (
            loadMoreLabel
          )}
        </button>
      )}
    </div>
  );
}

export default InfiniteScrollFooter;
