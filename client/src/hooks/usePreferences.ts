import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback } from 'react';
import type { UserPreference } from '@cornerstone/shared';
import { listPreferences, upsertPreference, deletePreference } from '../lib/preferencesApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import { translateApiError } from '../lib/errorTranslation.js';

export interface UsePreferencesResult {
  preferences: UserPreference[];
  isLoading: boolean;
  error: string | null;
  upsert: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
  refresh: () => void;
}

/**
 * Manages user preferences for the authenticated user.
 * Handles fetching the list, upserting, and removing preferences.
 */
export function usePreferences(): UsePreferencesResult {
  const { t } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const [preferences, setPreferences] = useState<UserPreference[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  // Fetch preferences on mount and when refresh is called
  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      setIsLoading(true);
      setError(null);

      try {
        const fetchedPreferences = await listPreferences();
        if (!cancelled) {
          setPreferences(fetchedPreferences);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiClientError) {
            setError(translateApiError(err.error.code, tErrors));
          } else if (err instanceof NetworkError) {
            setError(t('requestErrors.network'));
          } else {
            setError(t('requestErrors.unexpected'));
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [fetchCount, t, tErrors]);

  const upsert = useCallback(async (key: string, value: string) => {
    await upsertPreference(key, value);
    // Update local state optimistically
    setPreferences((prev) => {
      const existing = prev.find((p) => p.key === key);
      if (existing) {
        return prev.map((p) =>
          p.key === key ? { ...p, value, updatedAt: new Date().toISOString() } : p,
        );
      }
      return [...prev, { key, value, updatedAt: new Date().toISOString() }];
    });
  }, []);

  const remove = useCallback(async (key: string) => {
    await deletePreference(key);
    // Optimistically remove from local state
    setPreferences((prev) => prev.filter((p) => p.key !== key));
  }, []);

  const refresh = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  return {
    preferences,
    isLoading,
    error,
    upsert,
    remove,
    refresh,
  };
}
