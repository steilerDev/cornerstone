import { useState, useEffect, useCallback } from 'react';
import type { UserPreference } from '@cornerstone/shared';
import {
  listPreferences,
  upsertPreference,
  deletePreference,
} from '../lib/preferencesApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';

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
            setError(err.error.message ?? 'Failed to load preferences.');
          } else if (err instanceof NetworkError) {
            setError('Network error: Unable to connect to the server.');
          } else {
            setError('An unexpected error occurred.');
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
  }, [fetchCount]);

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
