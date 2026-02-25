import { useState, useEffect } from 'react';
import type { TimelineResponse } from '@cornerstone/shared';
import { getTimeline } from '../lib/timelineApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';

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
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
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
            setError(err.error.message ?? 'Failed to load timeline data.');
          } else if (err instanceof NetworkError) {
            setError(
              'Network error: Unable to connect to the server. Please check your connection.',
            );
          } else {
            setError('An unexpected error occurred while loading the timeline.');
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetch();

    return () => {
      cancelled = true;
    };
  }, [fetchCount]);

  function refetch() {
    setFetchCount((c) => c + 1);
  }

  return { data, isLoading, error, refetch };
}
