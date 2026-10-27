import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useHref, useLocation, useSearchParams } from 'react-router-dom';
import { isObjectTabId, orderObjectTabs } from './objectTabIds.js';
import type { ObjectTabId } from './objectTabIds.js';

export interface ObjectTabsController {
  /** Applicable tabs in canonical order. */
  readonly tabs: readonly ObjectTabId[];
  readonly active: ObjectTabId;
  /** Replace-navigation; keeps other params; the first tab removes the param. */
  readonly select: (id: ObjectTabId, options?: { focusPanel?: boolean }) => void;
  /** Href of a tab (pathname + merged params), for anchors such as SummaryStrip tab facts. */
  readonly hrefFor: (id: ObjectTabId) => string;
  /** Internal: ObjectTabs focuses this tab's panel heading once, then clears it. */
  readonly pendingPanelFocus: RefObject<ObjectTabId | null>;
}

/**
 * `?tab=` state of an object page. The first applicable tab is the canonical "no param" state:
 * an absent param shows it without rewriting the URL, an unknown param is removed (replace), and
 * selecting the first tab removes the param. Every write is a replace navigation.
 */
export function useObjectTabs(available: readonly ObjectTabId[]): ObjectTabsController {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const baseHref = useHref(location.pathname);
  const pendingPanelFocusRef = useRef<ObjectTabId | null>(null);

  const tabs = orderObjectTabs(available);
  const first = tabs[0] ?? 'overview';

  const raw = searchParams.get('tab');
  const requested = isObjectTabId(raw) && tabs.includes(raw) ? raw : null;
  const active = requested ?? first;

  useEffect(() => {
    if (raw === null || requested !== null) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('tab');
        return next;
      },
      { replace: true },
    );
  }, [raw, requested, setSearchParams]);

  const paramsFor = useCallback(
    (id: ObjectTabId) => {
      const next = new URLSearchParams(searchParams);
      if (id === first) next.delete('tab');
      else next.set('tab', id);
      return next;
    },
    [searchParams, first],
  );

  const select = useCallback<ObjectTabsController['select']>(
    (id, options) => {
      pendingPanelFocusRef.current = options?.focusPanel ? id : null;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id === first) next.delete('tab');
          else next.set('tab', id);
          return next;
        },
        { replace: true, state: location.state },
      );
    },
    [first, setSearchParams, location.state],
  );

  const hrefFor = useCallback(
    (id: ObjectTabId) => {
      const query = paramsFor(id).toString();
      return query ? `${baseHref}?${query}` : baseHref;
    },
    [paramsFor, baseHref],
  );

  return { tabs, active, select, hrefFor, pendingPanelFocus: pendingPanelFocusRef };
}
