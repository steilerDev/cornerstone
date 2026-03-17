import { useState, useEffect, useCallback } from 'react';
import type { DavTokenStatus } from '@cornerstone/shared';
import { getDavTokenStatus, generateDavToken, revokeDavToken } from '../lib/davTokensApi.js';
import { ApiClientError } from '../lib/apiClient.js';

export interface UseDavTokenResult {
  status: DavTokenStatus | null;
  isLoading: boolean;
  error: string | null;
  newToken: string | null;
  generate: () => Promise<void>;
  revoke: () => Promise<void>;
  clearNewToken: () => void;
}

/**
 * Hook to manage DAV token generation, revocation, and status.
 * Shows the token once after generation, then never again.
 */
export function useDavToken(): UseDavTokenResult {
  const [status, setStatus] = useState<DavTokenStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);

  // Load token status on mount
  useEffect(() => {
    const loadStatus = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getDavTokenStatus();
        setStatus(data);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.error.message);
        } else {
          setError('Failed to load token status. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadStatus();
  }, []);

  const generate = useCallback(async () => {
    setError(null);

    try {
      const response = await generateDavToken();
      setNewToken(response.token);
      // Refresh status after generation
      const updatedStatus = await getDavTokenStatus();
      setStatus(updatedStatus);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to generate token. Please try again.');
      }
      throw err;
    }
  }, []);

  const revoke = useCallback(async () => {
    setError(null);

    try {
      await revokeDavToken();
      setNewToken(null);
      // Refresh status after revocation
      const updatedStatus = await getDavTokenStatus();
      setStatus(updatedStatus);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to revoke token. Please try again.');
      }
      throw err;
    }
  }, []);

  const clearNewToken = useCallback(() => {
    setNewToken(null);
  }, []);

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
