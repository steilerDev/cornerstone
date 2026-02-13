import { Navigate, Outlet } from 'react-router-dom';
import { getAuthMe } from '../../lib/authApi.js';
import { useState, useEffect } from 'react';
import styles from './AuthGuard.module.css';

export function AuthGuard() {
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
        <p>Loading...</p>
      </div>
    );
  }

  if (authState.setupRequired) {
    return <Navigate to="/setup" replace />;
  }

  if (!authState.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export default AuthGuard;
