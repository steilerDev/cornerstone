import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isRouteServed } from '@cornerstone/shared';
import { useSectionHashFocus } from '../../hooks/useSectionHashFocus.js';
import { navHref } from '../../navigation/navActive.js';
import { useRealLocationKey } from '../../navigation/realLocation.js';

/** Legacy ?tab= values → section anchors (route map query maps, served by this page). */
export const LEGACY_TAB_ANCHORS: Readonly<Record<string, string>> = {
  household: 'house',
  orientations: 'orientations',
  'budget-categories': 'cost-categories',
  'hi-categories': 'purchase-categories',
  trades: 'trades',
  areas: 'areas',
};

export const PROJECT_SETUP_ANCHORS = [
  'house',
  'cost-categories',
  'purchase-categories',
  'orientations',
  'areas',
  'trades',
] as const;

export type LegacyTabResolution =
  | { readonly kind: 'none' }
  /** Unknown tab: drop the query parameter. */
  | { readonly kind: 'drop' }
  | { readonly kind: 'anchor'; readonly anchor: string }
  | { readonly kind: 'areasPage' };

export function resolveLegacyTab(tab: string | null, areasServed: boolean): LegacyTabResolution {
  if (tab === null) return { kind: 'none' };
  if (tab === 'areas' && areasServed) return { kind: 'areasPage' };
  if (Object.hasOwn(LEGACY_TAB_ANCHORS, tab)) {
    return { kind: 'anchor', anchor: LEGACY_TAB_ANCHORS[tab]! };
  }
  return { kind: 'drop' };
}

/**
 * Location behaviour of the Project setup page. A legacy `?tab=x` becomes `#x` by history
 * replace; a section hash moves focus to that section's heading and scrolls it into view (again
 * once `settled` flips, so the layout shift from loading skeletons does not leave it off-screen).
 * Nothing is ever pushed, and plain loading, scrolling and dialogs write nothing to the URL.
 */
export function useProjectSetupLocation({ settled }: { settled: boolean }): void {
  const { pathname, search, hash, key } = useLocation();
  const navigate = useNavigate();
  const realKey = useRealLocationKey();

  useEffect(() => {
    // A dialog route open over this page has a different real location: replacing now would close it.
    if (realKey !== key) return;
    const params = new URLSearchParams(search);
    const resolution = resolveLegacyTab(params.get('tab'), isRouteServed('areas'));
    if (resolution.kind === 'none') return;
    params.delete('tab');
    const rest = params.toString();
    const nextSearch = rest ? `?${rest}` : '';
    if (resolution.kind === 'areasPage') {
      navigate(navHref('areas'), { replace: true });
    } else if (resolution.kind === 'anchor') {
      navigate({ pathname, search: nextSearch, hash: `#${resolution.anchor}` }, { replace: true });
    } else {
      navigate({ pathname, search: nextSearch, hash }, { replace: true });
    }
  }, [realKey, key, pathname, search, hash, navigate]);

  useSectionHashFocus(PROJECT_SETUP_ANCHORS, settled);
}
