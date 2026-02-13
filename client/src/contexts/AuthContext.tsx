import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getAuthMe, type AuthMeResponse } from '../lib/authApi.js';
import type { UserResponse } from '@cornerstone/shared';

export interface AuthContextValue {
  user: UserResponse | null;
  oidcEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
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

  const loadAuth = async () => {
    try {
      const response: AuthMeResponse = await getAuthMe();
      setAuthState({
        user: response.user,
        oidcEnabled: response.oidcEnabled,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setAuthState({
        user: null,
        oidcEnabled: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load authentication state',
      });
    }
  };

  useEffect(() => {
    void loadAuth();
  }, []);

  const refreshAuth = async () => {
    await loadAuth();
  };

  return (
    <AuthContext.Provider value={{ ...authState, refreshAuth }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
