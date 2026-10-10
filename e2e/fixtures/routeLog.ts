/**
 * Route log: records every URL-changing history call the app makes.
 *
 * Wraps history.pushState/replaceState (installed before any page script runs) so tests can
 * assert how the router navigated: a redirect must `replace`, a tab or filter change must
 * `replace`, nothing may `push` on mount. (`framenavigated` does not fire for same-document
 * navigations, so the history calls are the only reliable record.)
 *
 * Shared by legacy-url-walk.spec.ts (#2201) and page-identity-tasks.spec.ts (#2202).
 */

import type { Page } from '@playwright/test';

export interface RouteLogEntry {
  kind: 'pushState' | 'replaceState';
  url: string;
}

/**
 * Install the log for every document the page loads. Calls without a URL argument (router
 * bookkeeping such as scroll/state idx) do not change the URL and are not logged.
 */
export async function installRouteLog(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __routeLog: Array<{ kind: string; url: string }> };
    w.__routeLog = [];
    for (const kind of ['pushState', 'replaceState'] as const) {
      const original = history[kind].bind(history);
      history[kind] = (data: unknown, unused: string, url?: string | URL | null) => {
        if (url !== undefined && url !== null) {
          w.__routeLog.push({ kind, url: new URL(String(url), location.href).href });
        }
        original(data, unused, url);
      };
    }
  });
}

/** The entries logged since the current document loaded. */
export async function readRouteLog(page: Page): Promise<RouteLogEntry[]> {
  return page.evaluate(
    () => (window as unknown as { __routeLog: RouteLogEntry[] }).__routeLog ?? [],
  );
}

/** Empty the log (use between phases of one test, after the page has settled). */
export async function clearRouteLog(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __routeLog: unknown[] }).__routeLog = [];
  });
}
