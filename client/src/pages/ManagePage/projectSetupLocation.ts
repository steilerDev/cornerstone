import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isRouteServed } from '@cornerstone/shared';
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

function isProjectSetupAnchor(value: string): boolean {
  return PROJECT_SETUP_ANCHORS.some((anchor) => anchor === value);
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
  const handledHashRef = useRef<string | null>(null);

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

  useEffect(() => {
    const anchor = hash.slice(1);
    if (!isProjectSetupAnchor(anchor)) {
      handledHashRef.current = null;
      return;
    }
    // After focusPageHeadingWhenReady's first frame, so this focus wins.
    const frame = window.requestAnimationFrame(() => {
      const element =
        document.getElementById(`${anchor}-heading`) ?? document.getElementById(anchor);
      if (!element) return;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const scroll = () =>
        element.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      if (handledHashRef.current === hash) {
        // Re-run after the page settled: only re-scroll while the user has not moved on.
        if (document.activeElement === element) scroll();
        return;
      }
      handledHashRef.current = hash;
      element.focus({ preventScroll: true });
      scroll();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hash, settled]);
}
