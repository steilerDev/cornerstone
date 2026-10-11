import { createContext, use } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Key of the real router location. Inside `<Routes location={display}>` `useLocation()` returns
 * the display location (the page behind a dialog), so App provides the real key here.
 */
export const RealLocationKeyContext = createContext<string | null>(null);

/** The real location key; falls back to the current location's key outside a provider. */
export function useRealLocationKey(): string {
  const provided = use(RealLocationKeyContext);
  const { key } = useLocation();
  return provided ?? key;
}

/** The real router location: where the URL bar points, as opposed to the page being displayed. */
export interface RealLocation {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly key: string;
}

/** Provided by App; carries the full real location (path, search, hash and key). */
export const RealLocationContext = createContext<RealLocation | null>(null);

/**
 * The real location, also inside `<Routes location={display}>`, where `useLocation()` returns the
 * page behind a dialog. Use it for anything that must name the URL the user asked for (the login
 * `next`). Falls back to `useLocation()` outside a provider.
 */
export function useRealLocation(): RealLocation {
  const provided = use(RealLocationContext);
  const { pathname, search, hash, key } = useLocation();
  return provided ?? { pathname, search, hash, key };
}
