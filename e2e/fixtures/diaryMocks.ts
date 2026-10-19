/**
 * Mock helpers for specs that fake `GET /api/diary-entries`.
 *
 * Since #2225 the Site diary makes TWO list requests on load: the feed (`status=saved`) and the
 * "Unfinished" row (`status=draft&pageSize=3`). A blanket mock of `**\/api/diary-entries*` would
 * answer both with the same entries (they would also show up as "Unfinished" drafts) and count
 * both in request counters. Register `stubUnfinishedEmpty` AFTER the main mock (Playwright runs
 * the most recently registered matching handler first): it answers only the draft request.
 */

import type { Page } from '@playwright/test';

/** A draft-list request: `GET /api/diary-entries?...status=draft...` */
function isDraftListRequest(url: URL, method: string): boolean {
  return (
    method === 'GET' &&
    url.pathname === '/api/diary-entries' &&
    url.searchParams.get('status') === 'draft'
  );
}

/**
 * Answer the Unfinished row's request (and any other `status=draft` list request) with an empty
 * page, so a mocked feed neither shows up as drafts nor inflates request counters.
 */
export async function stubUnfinishedEmpty(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/diary-entries' && url.searchParams.get('status') === 'draft',
    async (route) => {
      if (!isDraftListRequest(new URL(route.request().url()), route.request().method())) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          pagination: { page: 1, pageSize: 3, totalItems: 0, totalPages: 0 },
        }),
      });
    },
  );
}

/** The five manual types, in the order the Filters surface lists them. */
export const MANUAL_TYPES = [
  'daily_log',
  'site_visit',
  'delivery',
  'issue',
  'general_note',
] as const;

/**
 * Fix the sources of the Filters surface (`GET /api/diary-entries/filter-options`). The real
 * endpoint reflects the shared E2E database, so the Type field (hidden when at most one type is in
 * use) and the Area / Company fields would otherwise depend on what other tests have created.
 */
export async function stubFilterOptions(
  page: Page,
  options: {
    types?: readonly string[];
    areas?: unknown[];
    companies?: Array<{ id: string; name: string }>;
  } = {},
): Promise<void> {
  await page.route('**/api/diary-entries/filter-options', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        types: options.types ?? MANUAL_TYPES,
        areas: options.areas ?? [],
        companies: options.companies ?? [],
      }),
    });
  });
}
