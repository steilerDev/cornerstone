import { routeUrl } from '@cornerstone/shared';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loginUrlFor } from '../../navigation/nextParam.js';
import { getAuthMe } from '../../lib/authApi.js';
import { useState, useEffect } from 'react';
import styles from './AuthGuard.module.css';

export function AuthGuard() {
  const { t } = useTranslation('common');
  const location = useLocation();
  const [authState, setAuthState] = useState<{
    isLoading: boolean;
    setupRequired: boolean;
    isAuthenticated: boolean;
  }>({
    isLoading: true,
    setupRequired: false,
    isAuthenticated: false,
  });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await getAuthMe();

        if (response.setupRequired) {
          setAuthState({
            isLoading: false,
            setupRequired: true,
            isAuthenticated: false,
          });
          return;
        }

        setAuthState({
          isLoading: false,
          setupRequired: false,
          isAuthenticated: response.user !== null,
        });
      } catch {
        // If getAuthMe fails, treat as not authenticated
        setAuthState({
          isLoading: false,
          setupRequired: false,
          isAuthenticated: false,
        });
      }
    };

    void checkAuth();
  }, []);

  if (authState.isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>{t('loading')}</p>
      </div>
    );
  }

  if (authState.setupRequired) {
    return <Navigate to={routeUrl('setup')} replace />;
  }

  if (!authState.isAuthenticated) {
    return <Navigate to={loginUrlFor(location)} replace />;
  }

  return <Outlet />;
}

export default AuthGuard;
