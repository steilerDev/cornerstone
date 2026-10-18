import { routeUrl } from '@cornerstone/shared';
import { Navigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLayoutEffect, useRef, useState } from 'react';
import { useRealLocation } from '../../navigation/realLocation.js';
import { loginUrlFor } from '../../navigation/nextParam.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import styles from './AuthGuard.module.css';

type RetryStatus = 'idle' | 'retrying' | 'failed';

function AuthCheckFailed() {
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

  return (
    <div className={styles.page}>
      <EmptyState
        messageAs="h1"
        message={t('authGuard.errorHeading')}
        description={error ?? undefined}
        action={{ label: t('authGuard.retry'), onClick: () => void handleRetry() }}
      />
      <p role="status" className={styles.retryStatus}>
        {statusText}
      </p>
    </div>
  );
}

export function AuthGuard() {
  const { t } = useTranslation('common');
  // The real URL, not the page displayed behind a dialog route: `next` is what was requested.
  const location = useRealLocation();
  const { status } = useAuth();
  const previousStatusRef = useRef(status);

  // After a successful retry the panel (and its focused button) unmounts: move focus to main.
  useLayoutEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = status;
    if (previous !== 'error' || status !== 'authenticated') return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const main = document.querySelector<HTMLElement>('main');
    if (!main) return;
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
  }, [status]);

  if (status === 'loading' || status === 'signingOut') {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>{t('loading')}</p>
      </div>
    );
  }

  if (status === 'setupRequired') {
    return <Navigate to={routeUrl('setup')} replace />;
  }

  if (status === 'signedOut') {
    return <Navigate to={loginUrlFor(location)} replace />;
  }

  if (status === 'error') {
    return <AuthCheckFailed />;
  }

  return <Outlet />;
}

export default AuthGuard;
