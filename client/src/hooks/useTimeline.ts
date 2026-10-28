import { useState, useEffect } from 'react';
import type { TimelineResponse } from '@cornerstone/shared';
import { getTimeline } from '../lib/timelineApi.js';
import { toFetchFailure } from '../lib/fetchFailure.js';
import type { FetchFailure } from '../lib/fetchFailure.js';

export interface UseTimelineResult {
  data: TimelineResponse | null;
  /** True until the first response or failure; a refetch never sets it again. */
  isLoading: boolean;
  /** Why the latest load failed. A failure while data exists keeps `data`. */
  failure: FetchFailure | null;
  /** Reloads in place: the current data stays until the response arrives. */
  refetch: () => void;
}

/**
 * Fetches the schedule data. Stale-while-revalidate: only the first load is a loading state.
 * The failure is data (not a message), so the effect never depends on the translator.
 */
export function useTimeline(): UseTimelineResult {
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failure, setFailure] = useState<FetchFailure | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadTimeline() {
      try {
        const response = await getTimeline();
        if (!cancelled) {
          setData(response);
          setFailure(null);
        }
      } catch (err) {
        if (!cancelled) setFailure(toFetchFailure(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadTimeline();

    return () => {
      cancelled = true;
    };
  }, [fetchCount]);

  function refetch() {
    setFetchCount((c) => c + 1);
  }

  return { data, isLoading, failure, refetch };
}
