import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { originStateFor } from './origin.js';
import type { OriginState } from './origin.js';

/** Router state that makes the opened page offer "Back to <this page>". Pass the object name on object pages. */
export function useOriginState(name?: string | null): OriginState {
  const { pathname, search, hash } = useLocation();
  return useMemo(
    () => originStateFor({ pathname, search, hash }, name),
    [pathname, search, hash, name],
  );
}
