import { routeUrl } from '@cornerstone/shared';
import {
  createContext,
  use,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { getAuthMe, logout as logoutApi, type AuthMeResponse } from '../lib/authApi.js';
import type { UserResponse } from '@cornerstone/shared';
import { useTranslation } from 'react-i18next';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import { translateApiError } from '../lib/errorTranslation.js';
import { isSignedOutError } from '../lib/authFailure.js';

export type AuthStatus =
  'loading' | 'authenticated' | 'signedOut' | 'setupRequired' | 'error' | 'signingOut';

export interface AuthContextValue {
  user: UserResponse | null;
  status: AuthStatus;
  setupRequired: boolean;
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

interface AuthState {
  user: UserResponse | null;
  status: AuthStatus;
  oidcEnabled: boolean;
  error: string | null;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { t } = useTranslation('auth');
  const { t: tErrors } = useTranslation('errors');
  const { t: tCommon } = useTranslation('common');
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    status: 'loading',
    oidcEnabled: false,
    error: null,
  });
  const controllerRef = useRef<AbortController | null>(null);
  // Latest translate functions: keeps loadAuth stable so the mount check runs exactly once.
  const translateRef = useRef({ t, tErrors, tCommon });
  translateRef.current = { t, tErrors, tCommon };

  const loadAuth = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response: AuthMeResponse = await getAuthMe({ signal: controller.signal });
      if (controller.signal.aborted) return;
      setAuthState({
        user: response.user,
        status: response.setupRequired
          ? 'setupRequired'
          : response.user
            ? 'authenticated'
            : 'signedOut',
        oidcEnabled: response.oidcEnabled,
        error: null,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (isSignedOutError(error)) {
        setAuthState({ user: null, status: 'signedOut', oidcEnabled: false, error: null });
        return;
      }
      const { t, tErrors, tCommon } = translateRef.current;
      let message: string;
      if (error instanceof ApiClientError) {
        message = translateApiError(error.error.code, tErrors);
      } else if (error instanceof NetworkError) {
        message = tCommon('requestErrors.network');
      } else {
        message = t('session.loadError');
      }
      // A failed refresh of a known session is not a sign-out: keep the user.
      setAuthState((prev) =>
        prev.user !== null
          ? prev
          : { user: null, status: 'error', oidcEnabled: false, error: message },
      );
    }
  }, []);

  useEffect(() => {
    void loadAuth();
  }, [loadAuth]);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const refreshAuth = async () => {
    await loadAuth();
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch {
      // Ignore errors - clear local state even if server logout fails (e.g., session expired)
    } finally {
      setAuthState({ user: null, status: 'signingOut', oidcEnabled: false, error: null });
      // Force full page reload to /login so AuthGuard re-runs its mount check
      window.location.assign(routeUrl('login'));
    }
  };

  return (
    <AuthContext
      value={{
        ...authState,
        setupRequired: authState.status === 'setupRequired',
        isLoading: authState.status === 'loading',
        refreshAuth,
        logout,
      }}
    >
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
