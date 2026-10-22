import { useCallback, useEffect, useRef, useState } from 'react';
import type { AttentionResponse, AttentionRow } from '@cornerstone/shared';
import { ApiClientError } from '../lib/apiClient.js';
import { getAttention } from '../lib/attentionApi.js';

export interface UseAttentionResult {
  data: AttentionResponse | null;
  status: 'loading' | 'ready' | 'error';
  /** Error descriptor; translate at render time (never keyed on `t`). */
  error: { code: string | null } | null;
  includeSnoozed: boolean;
  /** Also lists the rows hidden by "Not now"; refetches. */
  setIncludeSnoozed: (on: boolean) => void;
  /** Refetch without a skeleton: data stays on screen, a failed refresh keeps the old data. */
  refresh: () => void;
  /** Hard retry from the error state (shows the skeleton again). */
  retry: () => void;
  /** Optimistic removal after an action or "Not now"; adjusts count, snoozedCount and catchUp. */
  removeRow: (key: string, reason: 'done' | 'notNow') => void;
}

const N2_ITEM_KEY = /^N2:work_item:(.+)$/;

function isLateTaskRow(row: AttentionRow): boolean {
  return row.params.rule === 'N1' || (row.params.rule === 'N2' && row.params.kind === 'task');
}

/** Pure optimistic removal of one row (or one member of an N2 group) from a response. */
export function removeAttentionRow(
  data: AttentionResponse,
  key: string,
  reason: 'done' | 'notNow',
): AttentionResponse {
  let count = data.count;
  let lateTaskCount = data.catchUp?.lateTaskCount ?? 0;
  let rows = data.rows;
  let tidyUp = data.tidyUp;
  let removed = false;

  const inRows = data.rows.find((row) => row.key === key);
  if (inRows) {
    removed = true;
    rows = data.rows.filter((row) => row.key !== key);
    if (inRows.snoozedUntil === null) {
      count = Math.max(0, count - 1);
      if (isLateTaskRow(inRows)) lateTaskCount -= 1;
      else if (inRows.params.rule === 'N2' && inRows.params.kind === 'group') {
        lateTaskCount -= inRows.params.items.length;
      }
    }
  } else if (data.tidyUp.some((row) => row.key === key)) {
    removed = true;
    tidyUp = data.tidyUp.filter((row) => row.key !== key);
  } else {
    // A synthesized catch-up row: one member of an N2 group.
    const memberId = N2_ITEM_KEY.exec(key)?.[1];
    if (memberId) {
      rows = data.rows.flatMap((row) => {
        if (row.params.rule !== 'N2' || row.params.kind !== 'group') return [row];
        const group = row.params;
        if (!group.items.some((item) => item.id === memberId)) return [row];
        removed = true;
        lateTaskCount -= 1;
        const items = group.items.filter((item) => item.id !== memberId);
        if (items.length === 0) {
          count = Math.max(0, count - 1);
          return [];
        }
        return [{ ...row, params: { ...group, items } }];
      });
    }
  }

  if (!removed) return data;
  return {
    ...data,
    count,
    snoozedCount: reason === 'notNow' ? data.snoozedCount + 1 : data.snoozedCount,
    rows,
    tidyUp,
    catchUp: data.catchUp !== null && lateTaskCount >= 3 ? { lateTaskCount } : null,
  };
}

/**
 * The attention rows (Home now, the shell bell in 3.4). Loads once on mount; `refresh` refetches
 * silently after every action so the optimistic state is replaced by the server's.
 */
export function useAttention(): UseAttentionResult {
  const [data, setData] = useState<AttentionResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<{ code: string | null } | null>(null);
  const [includeSnoozed, setIncludeSnoozed] = useState(false);
  const requestRef = useRef(0);
  const dataRef = useRef<AttentionResponse | null>(null);
  const includeSnoozedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (showSkeleton: boolean) => {
    const requestId = ++requestRef.current;
    if (showSkeleton) {
      setStatus('loading');
      setError(null);
    }
    try {
      const response = await getAttention({ includeSnoozed: includeSnoozedRef.current });
      if (!mountedRef.current || requestId !== requestRef.current) return;
      setData(response);
      setStatus('ready');
      setError(null);
    } catch (err) {
      if (!mountedRef.current || requestId !== requestRef.current) return;
      // A failed silent refresh keeps what is on screen.
      if (!showSkeleton && dataRef.current !== null) return;
      setError({ code: err instanceof ApiClientError ? err.error.code : null });
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const changeIncludeSnoozed = useCallback(
    (on: boolean) => {
      includeSnoozedRef.current = on;
      setIncludeSnoozed(on);
      void load(false);
    },
    [load],
  );

  const refresh = useCallback(() => {
    void load(false);
  }, [load]);

  const retry = useCallback(() => {
    void load(true);
  }, [load]);

  const removeRow = useCallback((key: string, reason: 'done' | 'notNow') => {
    setData((prev) => (prev ? removeAttentionRow(prev, key, reason) : prev));
  }, []);

  return {
    data,
    status,
    error,
    includeSnoozed,
    setIncludeSnoozed: changeIncludeSnoozed,
    refresh,
    retry,
    removeRow,
  };
}
