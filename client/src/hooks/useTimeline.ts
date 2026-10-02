import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TimelineResponse } from '@cornerstone/shared';
import { getTimeline } from '../lib/timelineApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import { translateApiError } from '../lib/errorTranslation.js';

export interface UseTimelineResult {
  data: TimelineResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches timeline data for the Gantt chart.
 * Returns loading, error, and data states following the project's hook conventions.
 */
export function useTimeline(): UseTimelineResult {
  const { t } = useTranslation('schedule');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadTimeline() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getTimeline();
        if (!cancelled) {
          setData(response);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiClientError) {
            setError(translateApiError(err.error.code, tErrors));
          } else if (err instanceof NetworkError) {
            setError(tCommon('requestErrors.network'));
          } else {
            setError(t('timeline.errors.loadFailed'));
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadTimeline();

    return () => {
      cancelled = true;
    };
  }, [fetchCount, t, tCommon, tErrors]);

  function refetch() {
    setFetchCount((c) => c + 1);
  }

  return { data, isLoading, error, refetch };
}
