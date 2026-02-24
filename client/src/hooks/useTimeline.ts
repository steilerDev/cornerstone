import { useState, useEffect, useCallback } from 'react';
import type { TimelineResponse } from '@cornerstone/shared';
import { getTimeline } from '../lib/timelineApi.js';
import { updateWorkItem } from '../lib/workItemsApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';

export interface UseTimelineResult {
  data: TimelineResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  /**
   * Optimistically updates a work item's dates and persists via PATCH.
   * Returns a promise resolving to true on success, false on failure.
   * On failure, the optimistic update is reverted.
   */
  updateItemDates: (
    itemId: string,
    startDate: string,
    endDate: string,
  ) => Promise<boolean>;
}

/**
 * Fetches timeline data for the Gantt chart.
 * Returns loading, error, and data states following the project's hook conventions.
 * Also exposes updateItemDates for drag-and-drop rescheduling.
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

  /**
   * Optimistically applies date changes to the local data, then persists via PATCH.
   * Reverts on failure.
   */
  const updateItemDates = useCallback(
    async (itemId: string, startDate: string, endDate: string): Promise<boolean> => {
      if (!data) return false;

      // Compute duration in days
      const [sy, sm, sd] = startDate.split('-').map(Number);
      const [ey, em, ed] = endDate.split('-').map(Number);
      const start = new Date(sy, sm - 1, sd, 12);
      const end = new Date(ey, em - 1, ed, 12);
      const msPerDay = 24 * 60 * 60 * 1000;
      const durationDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / msPerDay));

      // Snapshot for revert
      const previousData = data;

      // Optimistic update
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workItems: prev.workItems.map((item) =>
            item.id === itemId
              ? { ...item, startDate, endDate, durationDays }
              : item,
          ),
        };
      });

      try {
        await updateWorkItem(itemId, { startDate, endDate, durationDays });
        // Background refetch to sync any server-side changes (e.g., critical path recompute)
        setFetchCount((c) => c + 1);
        return true;
      } catch {
        // Revert optimistic update
        setData(previousData);
        return false;
      }
    },
    [data],
  );

  return { data, isLoading, error, refetch, updateItemDates };
}
