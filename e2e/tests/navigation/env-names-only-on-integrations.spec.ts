/**
 * E2E: environment variable names appear only on Settings > Integrations (Story #2217, AC5).
 *
 * Operator language belongs in one place. Every other page, in every state, must say what is
 * wrong or missing in plain words and, for an admin, link to Integrations, never name a variable
 * such as PAPERLESS_URL or BACKUP_CADENCE.
 *
 * The list of names is not hand-written: it is the union of every `required` and `optional` list
 * the server returns from `GET /api/settings/integrations`. For each page that takes no
 * parameters (every served page of the route map except Integrations itself) plus three seeded
 * detail pages (task, purchase, invoice), the test reads the page text and every `title`,
 * `aria-label`, `placeholder` and `alt` attribute and asserts that no name occurs. A positive
 * control then opens Integrations and finds the names there, so the check cannot pass on an
 * empty list.
 *
 * Run twice: unconfigured (the real container: Paperless off, AI off) and configured (mocked
 * Paperless status, AI and auto-itemize switched on in /api/config), because several pages grow
 * Paperless and AI controls only when configured.
 *
 * Synthetic data only; the seeded task, purchase and invoice are removed in afterAll.
 */

import type { Browser, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { ROUTE_MAP, routeUrl } from '../../../shared/src/routes/index.js';
import {
  createHouseholdItemViaApi,
  createWorkItemViaApi,
  deleteHouseholdItemViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { API, ROUTES } from '../../fixtures/testData.js';
import { PAPERLESS_PROBE } from '../../fixtures/integrationsMocks.js';

interface RouteEntry {
  id?: string;
  kind: string;
  stage: string;
  section: string;
  interim?: string;
}

/** Served pages that need no parameters, as `[id, url]`. */
function parameterlessPages(): Array<[string, string]> {
  const pages: Array<[string, string]> = [];
  for (const entry of ROUTE_MAP as unknown as ReadonlyArray<RouteEntry>) {
    if (
      entry.id === undefined ||
      entry.stage === 'planned' ||
      entry.section === 'Auth' ||
      !(entry.kind === 'page' || entry.interim === 'page') ||
      entry.id === 'settingsIntegrations'
    ) {
      continue;
    }
    try {
      pages.push([entry.id, (routeUrl as (id: string) => string)(entry.id)]);
    } catch {
      // The page needs a parameter: covered by the seeded detail pages below
    }
  }
  return pages;
}

const seed = { workItemId: '', householdItemId: '', vendorId: '', invoiceId: '' };
let envNames: string[] = [];

async function adminPage(browser: Browser): Promise<{
  page: Page;
  close: () => Promise<void>;
}> {
  const context = await browser.newContext({ storageState: 'test-results/.auth/admin.json' });
  return { page: await context.newPage(), close: () => context.close() };
}

/** Page text plus every title, aria-label, placeholder and alt attribute. */
async function visibleStrings(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const strings = [document.body.innerText, document.title];
    for (const el of Array.from(
      document.querySelectorAll('[title],[aria-label],[placeholder],[alt]'),
    )) {
      for (const attr of ['title', 'aria-label', 'placeholder', 'alt']) {
        const value = el.getAttribute(attr);
        if (value) strings.push(value);
      }
    }
    return strings;
  });
}

function findNames(strings: string[]): string[] {
  const joined = strings.join('\n');
  return envNames.filter((name) => new RegExp(`\\b${name}\\b`).test(joined));
}

async function settle(page: Page): Promise<void> {
  await expect(page.locator('main').first()).toBeVisible();
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/** Paperless connected and AI switched on, for the "configured" run. */
async function mockConfigured(page: Page): Promise<void> {
  await page.route('**/api/paperless/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PAPERLESS_PROBE.reachable),
    }),
  );
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      response,
      json: { ...config, llmEnabled: true, autoItemizeEnabled: true },
    });
  });
}

test.describe('Environment names only on Integrations (#2217, AC5)', { tag: '@responsive' }, () => {
  test.beforeAll(async ({ browser }) => {
    const { page, close } = await adminPage(browser);
    try {
      const response = await page.request.get(API.integrations);
      expect(response.ok()).toBeTruthy();
      const body = (await response.json()) as Record<
        string,
        { env: { required: string[]; optional: string[] } }
      >;
      envNames = [
        ...new Set(
          Object.values(body).flatMap((card) => [...card.env.required, ...card.env.optional]),
        ),
      ].sort();
      expect(envNames.length).toBeGreaterThan(10);

      seed.workItemId = await createWorkItemViaApi(page, {
        title: `E2E EnvSweep ${Date.now().toString(36)} task`,
      });
      seed.householdItemId = await createHouseholdItemViaApi(page, {
        name: `E2E EnvSweep ${Date.now().toString(36)} purchase`,
      });
      const vendor = await page.request.post(API.vendors, {
        data: { name: `E2E EnvSweep ${Date.now().toString(36)} company` },
      });
      seed.vendorId = ((await vendor.json()) as { vendor: { id: string } }).vendor.id;
      const invoice = await page.request.post(`${API.vendors}/${seed.vendorId}/invoices`, {
        data: {
          invoiceNumber: `ES-${Date.now().toString(36)}`,
          amount: 100,
          date: '2026-01-15',
          status: 'pending',
        },
      });
      seed.invoiceId = ((await invoice.json()) as { invoice: { id: string } }).invoice.id;
    } finally {
      await close();
    }
  });

  test.afterAll(async ({ browser }) => {
    const { page, close } = await adminPage(browser);
    try {
      if (seed.workItemId) await deleteWorkItemViaApi(page, seed.workItemId).catch(() => undefined);
      if (seed.householdItemId) {
        await deleteHouseholdItemViaApi(page, seed.householdItemId).catch(() => undefined);
      }
      if (seed.vendorId) await page.request.delete(`${API.vendors}/${seed.vendorId}`);
    } finally {
      await close();
    }
  });

  for (const configured of [false, true]) {
    const state = configured ? 'configured' : 'unconfigured';

    test.describe(`${state} Paperless and AI`, () => {
      test.slow();

      for (const [id, url] of parameterlessPages()) {
        test(`${id} names no environment variable`, async ({ page }) => {
          if (configured) await mockConfigured(page);

          await page.goto(url);
          await settle(page);

          expect(findNames(await visibleStrings(page)), `${id} (${url})`).toEqual([]);
        });
      }

      const detailPages: Array<[string, () => string]> = [
        ['workItem', () => routeUrl('workItem', { id: seed.workItemId })],
        ['householdItem', () => routeUrl('householdItem', { id: seed.householdItemId })],
        ['invoice', () => routeUrl('invoice', { id: seed.invoiceId })],
      ];
      for (const [id, url] of detailPages) {
        test(`${id} (seeded) names no environment variable`, async ({ page }) => {
          if (configured) await mockConfigured(page);

          await page.goto(url());
          await settle(page);

          expect(findNames(await visibleStrings(page)), `${id} (${url()})`).toEqual([]);
        });
      }
    });
  }

  test('Positive control: Integrations itself names the variables', async ({ page }) => {
    await page.goto(ROUTES.integrations);
    await expect(page.getByTestId('integration-paperless-env')).toBeVisible();

    const found = findNames(await visibleStrings(page));

    expect(found.length).toBeGreaterThan(10);
    expect(found).toContain('PAPERLESS_URL');
    expect(found).toContain('BACKUP_CADENCE');
  });
});
