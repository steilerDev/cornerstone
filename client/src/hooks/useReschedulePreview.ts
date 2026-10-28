import { useEffect, useState } from 'react';
import type { ScheduleImpact } from '@cornerstone/shared';
import { previewSchedule } from '../lib/scheduleApi.js';

/** Wait after the last change before asking the server. */
export const RESCHEDULE_PREVIEW_DEBOUNCE_MS = 300;

export type ReschedulePreviewStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ReschedulePreview {
  readonly status: ReschedulePreviewStatus;
  readonly impact: ScheduleImpact | null;
  /** Asks again after an error. */
  readonly retry: () => void;
}

interface Settled {
  readonly key: string;
  readonly impact: ScheduleImpact | null;
}

/**
 * What would happen if the task took `durationDays`? Idle while `durationDays` is null.
 * Debounced; a response for an older request (or one that was aborted) is dropped.
 */
export function useReschedulePreview(
  taskId: string,
  durationDays: number | null,
): ReschedulePreview {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = `${taskId}|${durationDays}|${attempt}`;

  useEffect(() => {
    if (durationDays === null) return undefined;
    let stale = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      previewSchedule(
        {
          mode: 'cascade',
          anchorWorkItemId: taskId,
          overrides: [{ workItemId: taskId, durationDays }],
        },
        { signal: controller.signal },
      )
        .then((response) => {
          if (!stale) setSettled({ key, impact: response.impact });
        })
        .catch(() => {
          // An aborted request is stale by definition and is dropped here.
          if (!stale) setSettled({ key, impact: null });
        });
    }, RESCHEDULE_PREVIEW_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [taskId, durationDays, key]);

  const retry = () => setAttempt((n) => n + 1);

  if (durationDays === null) return { status: 'idle', impact: null, retry };
  if (settled?.key !== key) return { status: 'loading', impact: null, retry };
  return settled.impact
    ? { status: 'ready', impact: settled.impact, retry }
    : { status: 'error', impact: null, retry };
}
