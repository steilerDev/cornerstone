/**
 * E2E tests for Story #2210 — Search service (API level, no UI yet; the UI lands in #2211).
 *
 * Proves, against the production Docker build:
 *   S1 — GET /api/search is protected (401 when signed out)
 *   S2 — accent-folded matching works, i.e. the native build registered the `fold()` SQL
 *        function: "mueller" and "müller" both find both spellings of a company name
 *   S3 — bad input is rejected with 400 (query too short, unknown `types` value)
 *
 * Desktop project only: API-level checks are viewport-independent. Synthetic names only.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { API } from '../../fixtures/testData.js';
import { createVendorViaApi, deleteVendorViaApi } from '../../fixtures/apiHelpers.js';

interface SearchBody {
  query: string;
  groups: Array<{ type: string; items: Array<{ id: string }> }>;
}

async function searchVendorIds(page: Page, q: string): Promise<string[]> {
  const params = new URLSearchParams({ q, types: 'vendor', limit: '20' });
  const response = await page.request.get(`${API.search}?${params.toString()}`);
  expect(response.status(), `GET search q="${q}"`).toBe(200);
  const body = (await response.json()) as SearchBody;
  const group = body.groups.find((g) => g.type === 'vendor');
  expect(group, 'vendor group present').toBeDefined();
  return group!.items.map((i) => i.id);
}

test.describe('Search API (#2210)', () => {
  test.beforeEach(({ testPrefix: _testPrefix }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'API-level spec runs on desktop only');
  });

  test('S1: returns 401 when signed out', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const response = await context.request.get(`${API.search}?q=ab`);
      expect(response.status()).toBe(401);
    } finally {
      await context.close();
    }
  });

  test('S2: finds both spellings of a company name via either spelling', async ({
    authenticatedPage: page,
  }) => {
    const token = Math.random().toString(36).slice(2, 10);
    const ids: string[] = [];
    try {
      const umlautId = await createVendorViaApi(page, { name: `E2E Müller ${token}` });
      ids.push(umlautId);
      const asciiId = await createVendorViaApi(page, { name: `E2E Mueller ${token}` });
      ids.push(asciiId);

      for (const q of [`mueller ${token}`, `müller ${token}`]) {
        const found = await searchVendorIds(page, q);
        expect(found, `results for "${q}"`).toEqual(expect.arrayContaining([umlautId, asciiId]));
      }
    } finally {
      for (const id of ids) {
        await deleteVendorViaApi(page, id);
      }
    }
  });

  test('S3: rejects bad input with 400', async ({ authenticatedPage: page }) => {
    const tooShort = await page.request.get(`${API.search}?q=a`);
    expect(tooShort.status()).toBe(400);
    const tooShortBody = (await tooShort.json()) as { error: { code: string } };
    expect(tooShortBody.error.code).toBe('VALIDATION_ERROR');

    const unknownType = await page.request.get(`${API.search}?q=ab&types=nope`);
    expect(unknownType.status()).toBe(400);
    const unknownTypeBody = (await unknownType.json()) as { error: { code: string } };
    expect(unknownTypeBody.error.code).toBe('VALIDATION_ERROR');
  });
});
