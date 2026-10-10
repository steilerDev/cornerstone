/**
 * E2E legacy-URL walk (Story #2201 / EPIC-21, ADR-038, D-24, PLT-011, PLT-012)
 *
 * Browser counterpart of the Jest walk in `client/src/navigation/legacyUrlWalk.test.ts`.
 * Every URL the shared route map still serves is opened in a real browser and must land
 * where the map says, in ONE hop, with its query string and hash intact.
 *
 * Scenarios:
 * - E0  The map and the frozen table of today's 26 live redirects agree (fails when a route
 *       is added to / removed from the map without updating this walk)
 * - E1  Every live redirect lands on its target in one hop (bare, and with ?q=walk#walk)
 * - E1b Every page the map serves (every id'd route, 'interim: page' included) loads on its
 *       own URL without a redirect hop; planned routes are not served; planned query maps
 *       keep rendering today's page with the query intact
 * - E2  /login?error= and /login?next= are left alone; an unauthenticated legacy URL lands on
 *       /login without ever touching its target
 * - E3  Permanent URLs (vCard /companies/:id, /budget/vendors/:id, calendar-entry URLs) work
 * - E4  Conditional redirect: Paperless off sends the review page to the New invoice dialog
 *
 * Desktop project only: a route walk is viewport-independent.
 *
 * The signed-in scenarios use the shared admin storage state (no extra logins, so the login
 * rate limit is untouched); E2 uses a context without any session.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Browser, BrowserContext, Page, Route } from '@playwright/test';
import {
  LIVE_REDIRECT_ROUTES,
  ROUTE_MAP,
  baseFrom,
  effectiveTarget,
  liveConditionalRules,
  routeUrl,
} from '../../../shared/src/routes/index.js';
import type { RouteId, RouteMapEntry } from '../../../shared/src/routes/index.js';

/** The route map as plain entries (the literal tuple type is too narrow to filter on). */
const ENTRIES: readonly RouteMapEntry[] = ROUTE_MAP;
import { API } from '../../fixtures/testData.js';
import {
  createDiaryEntryViaApi,
  createHouseholdItemViaApi,
  createMilestoneViaApi,
  createVendorViaApi,
  createWorkItemViaApi,
  deleteDiaryEntryViaApi,
  deleteHouseholdItemViaApi,
  deleteMilestoneViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { mockConfig, mockPaperlessConfigured } from '../../fixtures/paperlessInvoiceMocks.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { LoginPage } from '../../pages/LoginPage.js';
import { NotFoundPage } from '../../pages/NotFoundPage.js';
import { PaperlessInvoiceReviewPage } from '../../pages/PaperlessInvoiceReviewPage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Frozen expectations (written out by hand on purpose, NOT derived from the map)
// ─────────────────────────────────────────────────────────────────────────────

/** Today's 26 live redirects: legacy/section path -> landing path (query/hash handled apart). */
const LIVE_REDIRECTS: ReadonlyArray<readonly [string, string]> = [
  // Section roots (PLT-012)
  ['/', '/project/overview'],
  ['/project', '/project/overview'],
  ['/budget', '/budget/overview'],
  ['/schedule', '/schedule/gantt'],
  ['/settings', '/settings/profile'],
  // Legacy paths
  ['/work-items', '/project/work-items'],
  ['/work-items/new', '/project/work-items/new'],
  ['/work-items/:id', '/project/work-items/:id'],
  ['/household-items', '/project/household-items'],
  ['/household-items/new', '/project/household-items/new'],
  ['/household-items/:id', '/project/household-items/:id'],
  ['/household-items/:id/edit', '/project/household-items/:id/edit'],
  ['/invoices', '/budget/invoices'],
  ['/invoices/:id', '/budget/invoices/:id'],
  ['/timeline', '/schedule/gantt'],
  ['/manage', '/settings/manage'],
  ['/tags', '/settings/manage'],
  ['/profile', '/settings/profile'],
  ['/admin/users', '/settings/users'],
  ['/budget/categories', '/settings/manage'],
  ['/budget/vendors', '/settings/vendors'],
  ['/budget/vendors/:id', '/settings/vendors/:id'],
  // Repairs
  ['/schedule/milestones', '/project/milestones'],
  ['/schedule/milestones/:id', '/project/milestones/:id'],
  // Interim redirects for the Companies pages (vCard URLs are permanent)
  ['/companies', '/settings/vendors'],
  ['/companies/:id', '/settings/vendors/:id'],
];

/** Landing paths whose target carries its own query pair (checked in addition to ?q=walk). */
const TARGET_QUERY: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  '/budget/categories': { tab: 'budget-categories' },
};

const GROUPS: ReadonlyArray<{ name: string; from: readonly string[] }> = [
  {
    name: 'section roots',
    from: ['/', '/project', '/budget', '/schedule', '/settings'],
  },
  {
    name: 'legacy paths',
    from: [
      '/work-items',
      '/work-items/new',
      '/work-items/:id',
      '/household-items',
      '/household-items/new',
      '/household-items/:id',
      '/household-items/:id/edit',
      '/invoices',
      '/invoices/:id',
      '/timeline',
      '/manage',
      '/tags',
      '/profile',
      '/admin/users',
      '/budget/categories',
      '/budget/vendors',
      '/budget/vendors/:id',
    ],
  },
  { name: 'repairs', from: ['/schedule/milestones', '/schedule/milestones/:id'] },
  { name: 'companies', from: ['/companies', '/companies/:id'] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Landing log: records every URL-changing history call the app makes
// ─────────────────────────────────────────────────────────────────────────────

interface RouteLogEntry {
  kind: 'pushState' | 'replaceState';
  url: string;
}

/**
 * Wraps history.pushState/replaceState so every navigation the router performs is recorded
 * (framenavigated does not fire for same-document navigations). Calls without a URL argument
 * (router bookkeeping such as scroll/state idx) do not change the URL and are not logged.
 */
async function installRouteLog(page: Page): Promise<void> {
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

async function readRouteLog(page: Page): Promise<RouteLogEntry[]> {
  return page.evaluate(
    () => (window as unknown as { __routeLog: RouteLogEntry[] }).__routeLog ?? [],
  );
}

/**
 * Single hop: the router never pushed, and every URL it set has the landing pathname (no
 * intermediate redirect path ever appeared). With `mustHop`, at least one URL was set.
 */
async function expectSingleHop(
  page: Page,
  landingPathname: string,
  mustHop: boolean,
): Promise<void> {
  const log = await readRouteLog(page);
  const pathnames = log.map((entry) => new URL(entry.url).pathname);
  expect(
    log.filter((entry) => entry.kind === 'pushState'),
    'the router must replace, never push, while redirecting',
  ).toEqual([]);
  expect(
    pathnames.filter((pathname) => pathname !== landingPathname),
    `no intermediate redirect path may appear (log: ${pathnames.join(' -> ') || 'empty'})`,
  ).toEqual([]);
  if (mustHop) {
    expect(pathnames.length, 'a redirect must have replaced the URL').toBeGreaterThan(0);
  }
}

/** Waits until the app shell is rendered, i.e. the routed page is mounted. */
async function waitForShell(page: Page): Promise<void> {
  await expect(page.getByRole('main')).toBeVisible();
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed data (synthetic names, created once as admin, removed in afterAll)
// ─────────────────────────────────────────────────────────────────────────────

const runId = Date.now().toString(36);
const NAMES = {
  task: `Route walk task ${runId}`,
  milestone: `Route walk milestone ${runId}`,
  household: `Route walk purchase ${runId}`,
  company: `Route walk company ${runId}`,
};

const seed = {
  workItemId: '',
  milestoneId: 0,
  householdItemId: '',
  vendorId: '',
  invoiceId: '',
  diaryEntryId: '',
};

const NONEXISTENT_UUID = '00000000-0000-4000-8000-000000000000';

/** Fills `:name` params of a route-map path with seeded ids. Throws for an unknown param. */
function fill(pattern: string, strict: boolean): string {
  return pattern.replace(/:([A-Za-z]+)/g, (_match, name: string) => {
    switch (name) {
      case 'id':
        return `__ID__`;
      case 'areaKey':
        return NONEXISTENT_UUID;
      case 'orientationKey':
        return 'none';
      default:
        if (!strict) return NONEXISTENT_UUID;
        throw new Error(
          `legacy-url-walk has no sample value for route param ':${name}' in ${pattern}; add one`,
        );
    }
  });
}

/** Resolves the `:id` of a pattern to the seeded entity the pattern is about. */
function withSeed(pattern: string, strict = true): string {
  const path = fill(pattern, strict);
  if (!path.includes('__ID__')) return path;
  let id: string | number;
  if (/(^|\/)(work-items)\//.test(path)) id = seed.workItemId;
  else if (/(^|\/)milestones\//.test(path)) id = seed.milestoneId;
  else if (/(^|\/)household-items\//.test(path)) id = seed.householdItemId;
  else if (/(^|\/)(vendors|companies)\//.test(path)) id = seed.vendorId;
  else if (/(^|\/)invoices\//.test(path)) id = seed.invoiceId;
  else if (/^\/diary\//.test(path)) id = seed.diaryEntryId;
  else if (!strict) id = NONEXISTENT_UUID;
  else {
    throw new Error(
      `legacy-url-walk has no seeded entity for ${pattern}; seed one in beforeAll and map it here`,
    );
  }
  return path.replace('__ID__', encodeURIComponent(String(id)));
}

function skipUnlessDesktop(): void {
  test.skip(test.info().project.name !== 'desktop', 'route walk is viewport-independent');
}

test.describe('Legacy URL walk (route map)', () => {
  test.beforeAll(async ({ browser }) => {
    skipUnlessDesktop();
    const context = await browser.newContext({ storageState: 'test-results/.auth/admin.json' });
    const page = await context.newPage();
    try {
      seed.workItemId = await createWorkItemViaApi(page, { title: NAMES.task });
      seed.milestoneId = await createMilestoneViaApi(page, {
        title: NAMES.milestone,
        targetDate: '2026-12-01',
      });
      seed.householdItemId = await createHouseholdItemViaApi(page, { name: NAMES.household });
      seed.vendorId = await createVendorViaApi(page, { name: NAMES.company });
      const invoiceResp = await page.request.post(`${API.vendors}/${seed.vendorId}/invoices`, {
        data: {
          invoiceNumber: `RW-${runId}`,
          amount: 100,
          date: '2026-02-01',
          status: 'pending',
        },
      });
      expect(invoiceResp.ok(), `POST invoice failed: ${invoiceResp.status()}`).toBeTruthy();
      seed.invoiceId = ((await invoiceResp.json()) as { invoice: { id: string } }).invoice.id;
      seed.diaryEntryId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-01-15',
        body: `Route walk diary entry ${runId}`,
      });
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (test.info().project.name !== 'desktop') return;
    const context = await browser.newContext({ storageState: 'test-results/.auth/admin.json' });
    const page = await context.newPage();
    try {
      if (seed.diaryEntryId) await deleteDiaryEntryViaApi(page, seed.diaryEntryId);
      if (seed.invoiceId) await page.request.delete(`/api/invoices/${seed.invoiceId}`);
      if (seed.householdItemId) await deleteHouseholdItemViaApi(page, seed.householdItemId);
      if (seed.milestoneId) await deleteMilestoneViaApi(page, seed.milestoneId);
      if (seed.workItemId) await deleteWorkItemViaApi(page, seed.workItemId);
      if (seed.vendorId) await deleteVendorViaApi(page, seed.vendorId);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(() => {
    skipUnlessDesktop();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E0 — the map and this walk agree
  // ───────────────────────────────────────────────────────────────────────────

  test('E0: the live redirects of the route map are exactly the 26 frozen below', () => {
    expect(LIVE_REDIRECTS).toHaveLength(26);
    // Same set of source paths, same count: an unmapped (or newly mapped) route fails here.
    expect(LIVE_REDIRECT_ROUTES.map((rule) => rule.from).sort()).toEqual(
      LIVE_REDIRECTS.map(([from]) => from).sort(),
    );
    // Same landing path for every one of them (query part of a target is ignored here).
    for (const [from, landing] of LIVE_REDIRECTS) {
      const rule = LIVE_REDIRECT_ROUTES.find((candidate) => candidate.from === from);
      expect(rule, `${from} must be a live redirect in the route map`).toBeDefined();
      expect(rule?.target.split(/[?#]/)[0], `target of ${from}`).toBe(landing);
    }
    // The groups below cover every one of the 26.
    expect(GROUPS.flatMap((group) => group.from).sort()).toEqual(
      LIVE_REDIRECTS.map(([from]) => from).sort(),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E1 — every live redirect, one hop, query and hash carried
  // ───────────────────────────────────────────────────────────────────────────

  for (const group of GROUPS) {
    test(`E1: ${group.name} land on their target in one hop, query and hash carried`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await installRouteLog(page);

      for (const from of group.from) {
        const landing = LIVE_REDIRECTS.find(([source]) => source === from)?.[1] ?? '';
        const landingPath = withSeed(landing);
        const startPath = withSeed(from);
        const targetQuery = TARGET_QUERY[from] ?? {};

        // Bare variant: no query, no hash
        await page.goto(startPath);
        await expect(page, `${from} (bare)`).toHaveURL(
          (url) =>
            url.pathname === landingPath &&
            Object.entries(targetQuery).every(
              ([key, value]) => url.searchParams.get(key) === value,
            ),
        );
        await waitForShell(page);
        await expectSingleHop(page, landingPath, true);

        // Variant with a query string and a hash: both must survive the redirect
        await page.goto(`${startPath}?q=walk#walk`);
        await expect(page, `${from} (?q=walk#walk)`).toHaveURL(
          (url) =>
            url.pathname === landingPath &&
            url.searchParams.get('q') === 'walk' &&
            url.hash === '#walk' &&
            Object.entries(targetQuery).every(
              ([key, value]) => url.searchParams.get(key) === value,
            ),
        );
        await waitForShell(page);
        await expectSingleHop(page, landingPath, true);
      }
    });
  }

  test('E1: /budget/categories keeps its own tab and the incoming query side by side', async ({
    page,
  }) => {
    await page.goto('/budget/categories?q=walk');
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('settingsManage') &&
        url.searchParams.get('tab') === 'budget-categories' &&
        url.searchParams.get('q') === 'walk',
    );
  });

  test('E1: /schedule?view=calendar keeps its query and still lands on the Gantt (D-11 is later)', async ({
    page,
  }) => {
    await installRouteLog(page);
    await page.goto('/schedule?view=calendar');
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('scheduleGantt') && url.searchParams.get('view') === 'calendar',
    );
    await waitForShell(page);
    await expectSingleHop(page, routeUrl('scheduleGantt'), true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E1b — served pages stay put, planned routes are not served
  // ───────────────────────────────────────────────────────────────────────────

  /** Path entries the router serves as a page (stage done/interim, no redirect form). */
  function servedPageEntries(): RouteMapEntry[] {
    return ENTRIES.filter(
      (entry) =>
        entry.stage !== 'planned' &&
        entry.match === undefined &&
        entry.id !== undefined &&
        liveConditionalRules(entry.id as RouteId).length === 0 &&
        entry.from !== '*' &&
        // needs a Paperless document and AI; walked by the auto-itemize specs
        !entry.from.includes(':documentId') &&
        entry.from !== routeUrl('login') &&
        entry.from !== routeUrl('setup') &&
        effectiveTarget(entry) === null,
    );
  }

  test('E1b: every page the route map serves loads on its own URL without a redirect', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await installRouteLog(page);

    const entries = servedPageEntries();
    // 36 page routes in total, minus /login and /setup (covered by E2 / the auth specs)
    expect(entries.length, 'served page routes in the map').toBeGreaterThanOrEqual(30);

    for (const entry of entries) {
      const path = withSeed(entry.from);
      await page.goto(path);
      await waitForShell(page);
      await expect(page, `${entry.from} must stay on its own URL`).toHaveURL(
        (url) => url.pathname === path,
      );
      await expectSingleHop(page, path, false);
    }
  });

  test('E1b: planned routes are not served yet and render the not-found page', async ({ page }) => {
    const planned = ENTRIES.filter(
      (entry) => entry.stage === 'planned' && entry.match === undefined,
    );
    expect(planned.length).toBeGreaterThan(0);
    const notFound = new NotFoundPage(page);

    for (const entry of planned) {
      const path = withSeed(entry.from, false);
      await page.goto(path);
      await expect(notFound.heading, `${entry.from} is planned, not served`).toBeVisible();
      await expect(page).toHaveURL((url) => url.pathname === path);
    }
  });

  test('E1b: planned query maps keep rendering today’s page with the query intact', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await installRouteLog(page);

    const queryMaps = ENTRIES.filter(
      (entry) => entry.stage === 'planned' && entry.match?.query !== undefined,
    );
    expect(queryMaps.length, 'query-map entries in the route map').toBe(10);

    for (const entry of queryMaps) {
      const query = entry.match?.query ?? {};
      const pairs = Object.entries(query).map(([key, value]) => [
        key,
        value === true ? 'walk' : value,
      ]) as Array<[string, string]>;
      const path = withSeed(baseFrom(entry.from), false);
      const search = `?${new URLSearchParams(pairs).toString()}`;

      await page.goto(`${path}${search}`);
      await waitForShell(page);
      await expect(page, `${entry.from} keeps today's page`).toHaveURL(
        (url) =>
          url.pathname === path &&
          pairs.every(([key, value]) => url.searchParams.get(key) === value),
      );
      await expectSingleHop(page, path, false);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E3 — permanent URLs
  // ───────────────────────────────────────────────────────────────────────────

  test('E3: calendar-entry URLs (task, milestone, purchase) are permanent and render their entity', async ({
    page,
  }) => {
    await installRouteLog(page);

    const cases: ReadonlyArray<readonly [string, string]> = [
      [routeUrl('workItem', { id: seed.workItemId }), NAMES.task],
      [routeUrl('milestone', { id: seed.milestoneId }), NAMES.milestone],
      [routeUrl('householdItem', { id: seed.householdItemId }), NAMES.household],
    ];

    for (const [path, name] of cases) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      await expect(page).toHaveURL((url) => url.pathname === path);
      await expectSingleHop(page, path, false);
    }
  });

  test('E3: vCard URLs /companies/:id and /budget/vendors/:id land on the company in one hop', async ({
    page,
  }) => {
    await installRouteLog(page);
    const landing = routeUrl('vendor', { id: seed.vendorId });

    for (const start of [
      routeUrl('company', { id: seed.vendorId }),
      `/budget/vendors/${seed.vendorId}`,
    ]) {
      await page.goto(start);
      await expect(page, start).toHaveURL((url) => url.pathname === landing);
      await expect(page.getByRole('heading', { level: 1, name: NAMES.company })).toBeVisible();
      await expectSingleHop(page, landing, true);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E4 — conditional redirect (Paperless off)
  // ───────────────────────────────────────────────────────────────────────────

  test('E4: with Paperless off the review page sends you to the New invoice dialog, query kept', async ({
    page,
  }) => {
    await installRouteLog(page);
    await page.route('**/api/paperless/status', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configured: false,
          reachable: false,
          error: null,
          paperlessUrl: null,
          filterTag: null,
        }),
      }),
    );

    await page.goto(`${routeUrl('invoicePaperlessReview')}?documentId=7`);

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('invoices') &&
        url.searchParams.get('create') === '1' &&
        url.searchParams.get('documentId') === '7',
    );
    const invoicesPage = new InvoicesPage(page);
    await expect(invoicesPage.createModal).toBeVisible();
    await expectSingleHop(page, routeUrl('invoices'), true);
  });

  test('E4: with Paperless configured the review page renders and the URL is unchanged', async ({
    page,
  }) => {
    await installRouteLog(page);
    await mockPaperlessConfigured(page);
    await mockConfig(page, true);

    const reviewPage = new PaperlessInvoiceReviewPage(page);
    await reviewPage.goto();

    await expect(reviewPage.heading).toHaveText('No document chosen');
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('invoicePaperlessReview'));
    await expectSingleHop(page, routeUrl('invoicePaperlessReview'), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E2 — ?error= / ?next= and unauthenticated legacy URLs (fresh context, no session)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Legacy URL walk — unauthenticated', () => {
  async function openAnonymous(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
    const baseURL = test.info().project.use.baseURL;
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await installRouteLog(page);
    return { context, page };
  }

  test.beforeEach(() => {
    skipUnlessDesktop();
  });

  test('E2: /login?error=oidc_error is left alone and shows the login form', async ({
    browser,
  }) => {
    const { context, page } = await openAnonymous(browser);
    try {
      await page.goto('/login?error=oidc_error');
      await expect(new LoginPage(page).heading).toBeVisible();
      await expect(page).toHaveURL(
        (url) => url.pathname === '/login' && url.searchParams.get('error') === 'oidc_error',
      );
      expect(await readRouteLog(page)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('E2: /login?next=%2Fproject%2Fwork-items is left alone and shows the login form', async ({
    browser,
  }) => {
    const { context, page } = await openAnonymous(browser);
    try {
      await page.goto('/login?next=%2Fproject%2Fwork-items');
      await expect(new LoginPage(page).heading).toBeVisible();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === '/login' && url.searchParams.get('next') === '/project/work-items',
      );
      expect(await readRouteLog(page)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('E2: an unauthenticated legacy URL lands on /login and never reaches its target', async ({
    browser,
  }) => {
    const { context, page } = await openAnonymous(browser);
    try {
      await page.goto('/work-items');
      await expect(new LoginPage(page).heading).toBeVisible();
      await expect(page).toHaveURL((url) => url.pathname === '/login');
      const log = await readRouteLog(page);
      expect(
        log.filter((entry) => new URL(entry.url).pathname.startsWith('/project')),
        'the redirect target must never be visited before sign-in',
      ).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
