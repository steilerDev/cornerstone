import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import styles from './AuthGuard.module.css';

type RetryStatus = 'idle' | 'retrying' | 'failed';

export interface AuthCheckFailedProps {
  /** Render inside an existing card/page (no full-page wrapper), e.g. on the setup page. */
  embedded?: boolean;
}

/** The session check failed (not signed out): heading, translated reason and a Try again retry. */
export function AuthCheckFailed({ embedded = false }: AuthCheckFailedProps) {
  const { t } = useTranslation('common');
  const { error, refreshAuth } = useAuth();
  const [retryStatus, setRetryStatus] = useState<RetryStatus>('idle');
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useDocumentTitle(t('authGuard.errorHeading'), { section: false, house: false });

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The button is never disabled or unmounted while retrying, so focus stays on it.
  const handleRetry = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setRetryStatus('retrying');
    try {
      await refreshAuth();
    } finally {
      inFlightRef.current = false;
      // Still mounted means the check did not succeed (success unmounts this panel).
      if (mountedRef.current) setRetryStatus('failed');
    }
  };

  const statusText =
    retryStatus === 'retrying'
      ? t('authGuard.retrying')
      : retryStatus === 'failed'
        ? t('authGuard.retryFailed')
        : '';

  const content = (
    <>
      <EmptyState
        messageAs="h1"
        message={t('authGuard.errorHeading')}
        description={error ?? undefined}
        action={{ label: t('authGuard.retry'), onClick: () => void handleRetry() }}
      />
      <p role="status" className={styles.retryStatus}>
        {statusText}
      </p>
    </>
  );

  return embedded ? content : <div className={styles.page}>{content}</div>;
}
