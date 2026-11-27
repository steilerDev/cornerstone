/**
 * Mocks that open the Split with AI gate (#2262).
 *
 * The router redirects `/budget/invoices/:id/auto-itemize/:documentId` to the invoice's Cost tab
 * unless Paperless is configured (GET /api/paperless/status) and AI is on (GET /api/config
 * `llmEnabled`). The E2E container sets neither PAPERLESS_* nor LLM_*, so every spec that opens the
 * page must mock both. All data is synthetic.
 */

import type { Page, Route } from '@playwright/test';
import { mockPaperlessConfigured } from './paperlessMocks.js';

/**
 * Intercept GET /api/config and set `autoItemizeEnabled` and `llmEnabled`, keeping every other
 * field from the real response.
 */
export async function mockAiConfig(
  page: Page,
  opts: { autoItemizeEnabled?: boolean; llmEnabled?: boolean } = {},
): Promise<void> {
  const autoItemizeEnabled = opts.autoItemizeEnabled ?? true;
  const llmEnabled = opts.llmEnabled ?? true;
  await page.route('**/api/config', async (route: Route) => {
    try {
      const realResp = await route.fetch();
      const realBody = (await realResp.json()) as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...realBody, autoItemizeEnabled, llmEnabled }),
      });
    } catch {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'EUR', autoItemizeEnabled, llmEnabled }),
      });
    }
  });
}

/**
 * Open the Split with AI gate: Paperless configured and reachable, AI on.
 * Register it before any test-specific `/api/config` mock: routes registered later win, so a
 * per-test config mock keeps control of the values it sets (it must set `llmEnabled` itself).
 */
export async function mockAutoItemizeGate(
  page: Page,
  opts: { autoItemizeEnabled?: boolean } = {},
): Promise<void> {
  await mockPaperlessConfigured(page);
  await mockAiConfig(page, opts);
}
