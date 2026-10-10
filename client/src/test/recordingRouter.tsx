import { useMemo, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import { Router } from 'react-router-dom';
import type { Location, Navigator, To } from 'react-router-dom';

/**
 * Test helper (#2203): a low-level `<Router>` over a tiny in-memory history that records every
 * navigation with its history action. A data router cannot be used: jsdom has no global
 * `Request`. A pushed entry shows as `PUSH`, a replaced one as `REPLACE`, `navigate(-1)` as `GO -1`.
 */
export interface RouterLog {
  /** Every navigation in order, e.g. `REPLACE /budget/invoices`, `PUSH /x`, `GO -1`. */
  readonly actions: string[];
  /** The `state` passed with each PUSH/REPLACE, in the same order (GO entries have none). */
  readonly states: unknown[];
  /** Current history stack, oldest first. */
  readonly entries: string[];
  /** Index of the current entry in `entries`. */
  index: number;
}

export function createRouterLog(): RouterLog {
  return { actions: [], states: [], entries: [], index: 0 };
}

function toText(to: To): string {
  if (typeof to === 'string') return to;
  return `${to.pathname ?? ''}${to.search ?? ''}${to.hash ?? ''}`;
}

function toLocation(text: string, state: unknown, key: string): Location {
  const [beforeHash = '', hash = ''] = text.split('#');
  const [pathname = '', search = ''] = beforeHash.split('?');
  return {
    pathname,
    search: search ? `?${search}` : '',
    hash: hash ? `#${hash}` : '',
    state: state ?? null,
    key,
  };
}

interface RecordingRouterProps {
  /** Initial history entries (the last one is current unless `initialIndex` says otherwise). */
  entries: ReadonlyArray<string | { url: string; state?: unknown }>;
  initialIndex?: number;
  log: RouterLog;
  children: ReactNode;
}

export function RecordingRouter({ entries, initialIndex, log, children }: RecordingRouterProps) {
  const counterRef = useRef(0);
  const stackRef = useRef(
    entries.map((e) => {
      const url = typeof e === 'string' ? e : e.url;
      const state = typeof e === 'string' ? null : (e.state ?? null);
      return toLocation(url, state, `k${counterRef.current++}`);
    }),
  );
  const indexRef = useRef(initialIndex ?? entries.length - 1);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const navigator = useMemo<Navigator>(
    () => ({
      createHref: (to) => toText(to),
      go: (delta) => {
        log.actions.push(`GO ${delta}`);
        indexRef.current = Math.min(
          Math.max(indexRef.current + delta, 0),
          stackRef.current.length - 1,
        );
        rerender();
      },
      push: (to, state) => {
        log.actions.push(`PUSH ${toText(to)}`);
        log.states.push(state);
        stackRef.current = stackRef.current.slice(0, indexRef.current + 1);
        stackRef.current.push(toLocation(toText(to), state, `k${counterRef.current++}`));
        indexRef.current = stackRef.current.length - 1;
        rerender();
      },
      replace: (to, state) => {
        log.actions.push(`REPLACE ${toText(to)}`);
        log.states.push(state);
        stackRef.current[indexRef.current] = toLocation(
          toText(to),
          state,
          `k${counterRef.current++}`,
        );
        rerender();
      },
    }),
    [log],
  );

  log.entries.length = 0;
  for (const l of stackRef.current) log.entries.push(`${l.pathname}${l.search}${l.hash}`);
  log.index = indexRef.current;

  const location = stackRef.current[indexRef.current] ?? stackRef.current[0]!;
  return (
    <Router location={location} navigator={navigator}>
      {children}
    </Router>
  );
}
