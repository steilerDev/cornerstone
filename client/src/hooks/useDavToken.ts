import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback } from 'react';
import type { DavTokenStatus } from '@cornerstone/shared';
import { getDavTokenStatus, generateDavToken, revokeDavToken } from '../lib/davTokensApi.js';
import { ApiClientError } from '../lib/apiClient.js';
import { translateApiError } from '../lib/errorTranslation.js';

export interface UseDavTokenResult {
  status: DavTokenStatus | null;
  isLoading: boolean;
  error: string | null;
  newToken: string | null;
  generate: () => Promise<void>;
  revoke: () => Promise<void>;
  clearNewToken: () => void;
}

/** Stored instead of translated text so the message follows a language switch. */
interface DavErrorState {
  kind: 'loadFailed' | 'generateFailed' | 'revokeFailed';
  /** The ApiClientError code, or null for any other failure. Never server text. */
  code: string | null;
}

function toErrorState(kind: DavErrorState['kind'], err: unknown): DavErrorState {
  return { kind, code: err instanceof ApiClientError ? err.error.code : null };
}

/**
 * Hook to manage DAV token generation, revocation, and status.
 * Shows the token once after generation, then never again. Status loads once on mount.
 */
export function useDavToken(): UseDavTokenResult {
  const { t } = useTranslation('settings');
  const { t: tErrors } = useTranslation('errors');
  const [status, setStatus] = useState<DavTokenStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorState, setErrorState] = useState<DavErrorState | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);

  // Load token status once on mount
  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const data = await getDavTokenStatus();
        if (!cancelled) setStatus(data);
      } catch (err) {
        if (!cancelled) setErrorState(toErrorState('loadFailed', err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = useCallback(async () => {
    setErrorState(null);

    try {
      const response = await generateDavToken();
      setNewToken(response.token);
      // Refresh status after generation
      const updatedStatus = await getDavTokenStatus();
      setStatus(updatedStatus);
    } catch (err) {
      setErrorState(toErrorState('generateFailed', err));
      throw err;
    }
  }, []);

  const revoke = useCallback(async () => {
    setErrorState(null);

    try {
      await revokeDavToken();
      setNewToken(null);
      // Refresh status after revocation
      const updatedStatus = await getDavTokenStatus();
      setStatus(updatedStatus);
    } catch (err) {
      setErrorState(toErrorState('revokeFailed', err));
      throw err;
    }
  }, []);

  const clearNewToken = useCallback(() => {
    setNewToken(null);
  }, []);

  let error: string | null = null;
  if (errorState) {
    if (errorState.code) {
      error = translateApiError(errorState.code, tErrors);
    } else {
      switch (errorState.kind) {
        case 'loadFailed':
          error = t('dav.errors.loadFailed');
          break;
        case 'generateFailed':
          error = t('dav.errors.generateFailed');
          break;
        case 'revokeFailed':
          error = t('dav.errors.revokeFailed');
          break;
      }
    }
  }

  return {
    status,
    isLoading,
    error,
    newToken,
    generate,
    revoke,
    clearNewToken,
  };
}
