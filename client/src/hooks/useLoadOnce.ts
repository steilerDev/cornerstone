import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseLoadOnceResult<T> {
  data: T | null;
  status: 'loading' | 'ready' | 'error';
  /** Loads again and shows the skeleton (the retry button of an error state). */
  reload: () => void;
  /** Loads again but keeps what is on screen (after the user changed something). */
  refresh: () => void;
}

/**
 * Loads one resource on mount. `load` must be a stable function (module level or memoized), so
 * the load never depends on a translation function. Stale responses are ignored.
 */
export function useLoadOnce<T>(load: () => Promise<T>): UseLoadOnceResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  const hasDataRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (showSkeleton: boolean) => {
      const requestId = ++requestRef.current;
      if (showSkeleton) setStatus('loading');
      try {
        const result = await load();
        if (!mountedRef.current || requestId !== requestRef.current) return;
        hasDataRef.current = true;
        setData(result);
        setStatus('ready');
      } catch {
        if (!mountedRef.current || requestId !== requestRef.current) return;
        // A failed silent refresh keeps what is on screen.
        if (!showSkeleton && hasDataRef.current) return;
        setStatus('error');
      }
    },
    [load],
  );

  useEffect(() => {
    void run(true);
  }, [run]);

  const reload = useCallback(() => {
    void run(true);
  }, [run]);
  const refresh = useCallback(() => {
    void run(false);
  }, [run]);

  return { data, status, reload, refresh };
}
