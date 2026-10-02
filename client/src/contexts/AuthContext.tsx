import { createContext, use, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getAuthMe, logout as logoutApi, type AuthMeResponse } from '../lib/authApi.js';
import type { UserResponse } from '@cornerstone/shared';
import { useTranslation } from 'react-i18next';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import { translateApiError } from '../lib/errorTranslation.js';

export interface AuthContextValue {
  user: UserResponse | null;
  oidcEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { t } = useTranslation('auth');
  const { t: tErrors } = useTranslation('errors');
  const { t: tCommon } = useTranslation('common');
  const [authState, setAuthState] = useState<{
    user: UserResponse | null;
    oidcEnabled: boolean;
    isLoading: boolean;
    error: string | null;
  }>({
    user: null,
    oidcEnabled: false,
    isLoading: true,
    error: null,
  });

  const loadAuth = useCallback(async () => {
    try {
      const response: AuthMeResponse = await getAuthMe();
      setAuthState({
        user: response.user,
        oidcEnabled: response.oidcEnabled,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      let message: string;
      if (error instanceof ApiClientError) {
        message = translateApiError(error.error.code, tErrors);
      } else if (error instanceof NetworkError) {
        message = tCommon('requestErrors.network');
      } else {
        message = t('session.loadError');
      }
      setAuthState({
        user: null,
        oidcEnabled: false,
        isLoading: false,
        error: message,
      });
    }
  }, [t, tErrors, tCommon]);

  useEffect(() => {
    void loadAuth();
  }, [loadAuth]);

  const refreshAuth = async () => {
    await loadAuth();
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch {
      // Ignore errors - clear local state even if server logout fails (e.g., session expired)
    } finally {
      setAuthState({
        user: null,
        oidcEnabled: false,
        isLoading: false,
        error: null,
      });
      // Force full page reload to /login so AuthGuard re-runs its mount check
      window.location.assign('/login');
    }
  };

  return <AuthContext value={{ ...authState, refreshAuth, logout }}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
