import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { UserPreference } from '@cornerstone/shared';
import { listPreferences, upsertPreference, deletePreference } from '../lib/preferencesApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import { translateApiError } from '../lib/errorTranslation.js';

export interface UsePreferencesResult {
  preferences: UserPreference[];
  /** True from the first render until the first fetch settles, and during a `refresh`. */
  isLoading: boolean;
  /** The first fetch has settled (success or failure): never false again once true. */
  hasLoaded: boolean;
  error: string | null;
  upsert: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
  refresh: () => void;
}

type LoadError = { kind: 'api'; code: string } | { kind: 'network' } | { kind: 'unexpected' };

/**
 * Manages user preferences for the authenticated user.
 * Handles fetching the list, upserting, and removing preferences. Loads once per mount (and on
 * `refresh`); the load never depends on the translation functions, so a late-loading namespace
 * cannot trigger a second request.
 */
export function usePreferences(): UsePreferencesResult {
  const { t } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const [preferences, setPreferences] = useState<UserPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const fetchedPreferences = await listPreferences();
        if (!cancelled) {
          setPreferences(fetchedPreferences);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiClientError) {
            setLoadError({ kind: 'api', code: err.error.code });
          } else if (err instanceof NetworkError) {
            setLoadError({ kind: 'network' });
          } else {
            setLoadError({ kind: 'unexpected' });
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setHasLoaded(true);
        }
      }
    }

    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [fetchCount]);

  const error = useMemo(() => {
    if (loadError === null) return null;
    if (loadError.kind === 'api') return translateApiError(loadError.code, tErrors);
    return loadError.kind === 'network'
      ? t('requestErrors.network')
      : t('requestErrors.unexpected');
  }, [loadError, t, tErrors]);

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
    hasLoaded,
    error,
    upsert,
    remove,
    refresh,
  };
}
