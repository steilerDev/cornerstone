import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAttention } from '../hooks/useAttention.js';
import { useRealLocationKey } from '../navigation/realLocation.js';
import { AttentionContext, ATTENTION_STALE_MS } from './attentionContext.js';
import type { ShellAttention } from './attentionContext.js';

/**
 * Owns the single attention state of the signed-in shell. Refreshes are silent: on a real route
 * change and when the tab becomes visible or focused (at most once a minute), on bell open and on
 * Home mount (through `refreshStale`). There is no polling.
 */
export function AttentionProvider({ children }: { children: ReactNode }) {
  const attention = useAttention();
  const {
    refresh: baseRefresh,
    retry: baseRetry,
    setIncludeSnoozed: baseSetIncludeSnoozed,
  } = attention;
  const lastRequestAtRef = useRef(0);

  // The hook's first load starts on mount. A layout effect runs before any passive effect, so a
  // child's mount-time refreshStale (Home) already sees the stamp.
  useLayoutEffect(() => {
    lastRequestAtRef.current = Date.now();
  }, []);

  const refresh = useCallback(() => {
    lastRequestAtRef.current = Date.now();
    baseRefresh();
  }, [baseRefresh]);
  const retry = useCallback(() => {
    lastRequestAtRef.current = Date.now();
    baseRetry();
  }, [baseRetry]);
  const setIncludeSnoozed = useCallback(
    (on: boolean) => {
      lastRequestAtRef.current = Date.now();
      baseSetIncludeSnoozed(on);
    },
    [baseSetIncludeSnoozed],
  );
  const refreshStale = useCallback(
    (maxAgeMs: number) => {
      if (Date.now() - lastRequestAtRef.current < maxAgeMs) return;
      refresh();
    },
    [refresh],
  );

  const realKey = useRealLocationKey();
  const previousKeyRef = useRef(realKey);
  useEffect(() => {
    if (previousKeyRef.current === realKey) return;
    previousKeyRef.current = realKey;
    refreshStale(ATTENTION_STALE_MS);
  }, [realKey, refreshStale]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshStale(ATTENTION_STALE_MS);
    };
    const onFocus = () => refreshStale(ATTENTION_STALE_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshStale]);

  const homeHeadingRef = useRef<HTMLHeadingElement>(null);

  const value = useMemo<ShellAttention>(
    () => ({ ...attention, refresh, retry, setIncludeSnoozed, refreshStale, homeHeadingRef }),
    [attention, refresh, retry, setIncludeSnoozed, refreshStale],
  );

  return <AttentionContext value={value}>{children}</AttentionContext>;
}
