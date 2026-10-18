import { routeUrl } from '@cornerstone/shared';
import { Navigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLayoutEffect, useRef } from 'react';
import { useRealLocation } from '../../navigation/realLocation.js';
import { loginUrlFor } from '../../navigation/nextParam.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { AuthCheckFailed } from './AuthCheckFailed.js';
import styles from './AuthGuard.module.css';

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
