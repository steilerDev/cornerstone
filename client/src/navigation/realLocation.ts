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
