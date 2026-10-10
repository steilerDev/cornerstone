import { createContext, useCallback, useEffect, useRef } from 'react';

/** Reads the pathname of the history entry one step back; null when unknown. */
export const PreviousPathContext = createContext<() => string | null>(() => null);

/** React Router's BrowserRouter keeps the entry index in `history.state.idx`; 0 when unknown. */
export function historyIndex(): number {
  const state: unknown = window.history.state;
  if (typeof state === 'object' && state !== null && 'idx' in state) {
    const { idx } = state;
    return typeof idx === 'number' ? idx : 0;
  }
  return 0;
}

/**
 * Records the pathname shown at each history index this session. The returned getter (read
 * lazily, at click time, never in render) gives the pathname of the entry at idx - 1, or null
 * if unknown (e.g. after a reload). A replace overwrites its own index, so it never counts as
 * the previous page.
 */
export function useTrackPreviousPath(pathname: string, locationKey: string): () => string | null {
  const pathsRef = useRef(new Map<number, string>());

  useEffect(() => {
    pathsRef.current.set(historyIndex(), pathname);
  }, [pathname, locationKey]);

  return useCallback(() => {
    const idx = historyIndex();
    return idx > 0 ? (pathsRef.current.get(idx - 1) ?? null) : null;
  }, []);
}
