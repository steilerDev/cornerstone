import { useLayoutEffect, useRef } from 'react';
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
  const buttonFocusedRef = useRef(false);
  const endOfListRef = useRef<HTMLDivElement | null>(null);

  // When the list ends, the button unmounts; hand focus to the end-of-list message instead
  // of letting it fall back to <body>. Unmounting a node fires no blur, so the ref is still true.
  useLayoutEffect(() => {
    if (status === 'done' && buttonFocusedRef.current) {
      buttonFocusedRef.current = false;
      endOfListRef.current?.focus();
    }
  }, [status]);

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
        <div
          ref={endOfListRef}
          tabIndex={-1}
          className={styles.endOfList}
          data-testid={`${testIdPrefix}-end-of-list`}
        >
          {endOfListMessage}
        </div>
      ) : (
        <button
          type="button"
          className={`${shared.btnSecondary} ${styles.loadMoreButton}`}
          aria-disabled={status === 'loading' ? 'true' : undefined}
          onFocus={() => {
            buttonFocusedRef.current = true;
          }}
          onBlur={() => {
            buttonFocusedRef.current = false;
          }}
          onClick={() => {
            if (status === 'loading') return;
            if (status === 'error') onRetry();
            else onLoadMore();
          }}
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
