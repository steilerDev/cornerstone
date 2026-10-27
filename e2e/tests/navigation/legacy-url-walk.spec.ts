/**
 * E2E legacy-URL walk (Story #2201 / EPIC-21, ADR-038, D-24, PLT-011, PLT-012)
 *
 * Browser counterpart of the Jest walk in `client/src/navigation/legacyUrlWalk.test.ts`.
 * Every URL the shared route map still serves is opened in a real browser and must land
 * where the map says, in ONE hop, with its query string and hash intact.
 *
 * Scenarios:
 * - E0  The map and the frozen table of today's 30 live redirects agree (fails when a route
 *       is added to / removed from the map without updating this walk)
 * - E1  Every live redirect lands on its target in one hop (bare, and with ?q=walk#walk);
 *       /schedule?view=calendar is the one live query map (D-11, #2202) and lands on
 *       /schedule/calendar
 * - E1b Every page the map serves (every id'd route, 'interim: page' included) loads on its
 *       own URL without a redirect hop; planned routes are not served; planned query maps
 *       keep rendering today's page with the query intact
 * - E1c The six /settings/manage?tab=... links the Project setup page serves itself (#2215)
 *       land on their section anchor, `tab` removed, by exactly one replaceState
 * - E1d The two /diary?filterMode=automatic|all links the Site diary page serves itself (#2224)
 *       land on /history (and /history?include=diary), `types` becoming the first History type
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
  createBudgetSourceViaApi,
  createDiaryEntryViaApi,
  createHouseholdItemViaApi,
  createMilestoneViaApi,
  createSubsidyProgramViaApi,
  createVendorViaApi,
  createWorkItemViaApi,
  deleteBudgetSourceViaApi,
  deleteDiaryEntryViaApi,
  deleteHouseholdItemViaApi,
  deleteMilestoneViaApi,
  deleteSubsidyProgramViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import {
  MOCK_DOC,
  mockConfig,
  mockCorrespondents,
  mockDocumentDetail,
  mockDocuments,
  mockLinkedIds,
  mockPaperlessConfigured,
  mockTags,
} from '../../fixtures/paperlessInvoiceMocks.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { installRouteLog, readRouteLog } from '../../fixtures/routeLog.js';
import { LoginPage } from '../../pages/LoginPage.js';
import { NotFoundPage } from '../../pages/NotFoundPage.js';
import { PaperlessInvoiceReviewPage } from '../../pages/PaperlessInvoiceReviewPage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Frozen expectations (written out by hand on purpose, NOT derived from the map)
// ─────────────────────────────────────────────────────────────────────────────

/** Today's 30 live redirects: legacy/section path -> landing path (query/hash handled apart). */
const LIVE_REDIRECTS: ReadonlyArray<readonly [string, string]> = [
  // Section roots (PLT-012)
  // Home is served at `/` since #2230: the old dashboard URL and the Project root land on it
  ['/project/overview', '/'],
  ['/project', '/'],
  ['/budget', '/budget/overview'],
  ['/schedule', '/schedule/gantt'],
  ['/settings', '/settings/manage'],
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
  ['/tags', '/areas'],
  ['/profile', '/settings/profile'],
  ['/admin/users', '/settings/users'],
  ['/budget/categories', '/settings/manage'],
  ['/budget/vendors', '/companies'],
  ['/budget/vendors/:id', '/companies/:id'],
  // Repairs
  ['/schedule/milestones', '/project/milestones'],
  ['/schedule/milestones/:id', '/project/milestones/:id'],
  // Companies moved out of Settings (#2213); /companies and /companies/:id are served pages now
  ['/settings/vendors', '/companies'],
  ['/settings/vendors/:id', '/companies/:id'],
  // Funding sources and Grants merged into Financing (#2242): the group is the hash anchor
  ['/budget/sources', '/budget/financing'],
  ['/budget/subsidies', '/budget/financing'],
  ['/budget/financing/sources', '/budget/financing'],
  ['/budget/financing/grants', '/budget/financing'],
];

/**
 * Redirects whose target carries its own hash. The target hash wins over an incoming hash (the
 * ?q=walk#walk variant lands on it too), as `resolveRedirect` documents.
 */
const TARGET_HASH: Readonly<Record<string, string>> = {
  '/budget/categories': '#cost-categories',
  '/budget/sources': '#sources',
  '/budget/subsidies': '#grants',
  '/budget/financing/sources': '#sources',
  '/budget/financing/grants': '#grants',
};

/**
 * The five `?tab=` links the Project setup page serves as section anchors (#2215), written out by
 * hand: each lands on its section anchor with `tab` removed. The sixth, `?tab=areas`, leaves the
 * page for `/areas` (#2218); it has its own test.
 */
const PROJECT_SETUP_TABS: ReadonlyArray<readonly [string, string]> = [
  ['household', '#house'],
  ['orientations', '#orientations'],
  ['budget-categories', '#cost-categories'],
  ['hi-categories', '#purchase-categories'],
  ['trades', '#trades'],
];

const GROUPS: ReadonlyArray<{ name: string; from: readonly string[] }> = [
  {
    name: 'section roots',
    from: ['/project/overview', '/project', '/budget', '/schedule', '/settings'],
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
  { name: 'companies', from: ['/settings/vendors', '/settings/vendors/:id'] },
  {
    name: 'financing',
    from: [
      '/budget/sources',
      '/budget/subsidies',
      '/budget/financing/sources',
      '/budget/financing/grants',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Landing assertions (the history log itself lives in fixtures/routeLog.ts)
// ─────────────────────────────────────────────────────────────────────────────

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
  source: `Route walk loan ${runId}`,
  grant: `Route walk grant ${runId}`,
};

const seed = {
  workItemId: '',
  milestoneId: 0,
  householdItemId: '',
  vendorId: '',
  invoiceId: '',
  diaryEntryId: '',
  sourceId: '',
  grantId: '',
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
  else if (/^\/budget\/financing\/sources\//.test(path)) id = seed.sourceId;
  else if (/^\/budget\/financing\/grants\//.test(path)) id = seed.grantId;
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
      seed.sourceId = await createBudgetSourceViaApi(page, {
        name: NAMES.source,
        sourceType: 'bank_loan',
        totalAmount: 50000,
      });
      seed.grantId = await createSubsidyProgramViaApi(page, {
        name: NAMES.grant,
        reductionValue: 10,
      });
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
      if (seed.sourceId) await deleteBudgetSourceViaApi(page, seed.sourceId);
      if (seed.grantId) await deleteSubsidyProgramViaApi(page, seed.grantId);
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

  test('E0: the live redirects of the route map are exactly the 30 frozen below', () => {
    expect(LIVE_REDIRECTS).toHaveLength(30);
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
    // Live query maps (#2202): only /schedule has one, and it is the D-11 calendar map.
    const withMaps = LIVE_REDIRECT_ROUTES.filter((rule) => rule.queryMaps.length > 0);
    expect(withMaps.map((rule) => rule.from)).toEqual(['/schedule']);
    expect(withMaps[0]?.queryMaps).toEqual([
      { query: { view: 'calendar' }, target: routeUrl('scheduleCalendar') },
    ]);
    // The groups below cover every one of the 30.
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
        const targetHash = TARGET_HASH[from];

        // Bare variant: no query, no hash
        await page.goto(startPath);
        await expect(page, `${from} (bare)`).toHaveURL(
          (url) =>
            url.pathname === landingPath && (targetHash === undefined || url.hash === targetHash),
        );
        await waitForShell(page);
        await expectSingleHop(page, landingPath, true);

        // Variant with a query string and a hash: the query survives (and the hash, unless the target defines its own)
        await page.goto(`${startPath}?q=walk#walk`);
        await expect(page, `${from} (?q=walk#walk)`).toHaveURL(
          (url) =>
            url.pathname === landingPath &&
            url.searchParams.get('q') === 'walk' &&
            url.hash === (targetHash ?? '#walk'),
        );
        await waitForShell(page);
        await expectSingleHop(page, landingPath, true);
      }
    });
  }

  test('E1: /budget/categories lands on Cost categories, the incoming query kept and no ?tab=', async ({
    page,
  }) => {
    await page.goto('/budget/categories?q=walk');
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('settingsManage') &&
        url.hash === '#cost-categories' &&
        url.searchParams.get('q') === 'walk' &&
        !url.searchParams.has('tab'),
    );
  });

  test('E1: /schedule?view=calendar lands on /schedule/calendar in one hop (D-11, #2202)', async ({
    page,
  }) => {
    await installRouteLog(page);
    await page.goto('/schedule?view=calendar');
    // The query map consumes the matched view key; no other pair is invented.
    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('scheduleCalendar') && url.search === '',
    );
    await waitForShell(page);
    await expectSingleHop(page, routeUrl('scheduleCalendar'), true);
  });

  test('E1: /schedule?view=calendar&q=walk#walk consumes only view and carries the rest', async ({
    page,
  }) => {
    await installRouteLog(page);
    await page.goto('/schedule?view=calendar&q=walk#walk');
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('scheduleCalendar') &&
        url.searchParams.get('q') === 'walk' &&
        !url.searchParams.has('view') &&
        url.hash === '#walk',
    );
    await waitForShell(page);
    await expectSingleHop(page, routeUrl('scheduleCalendar'), true);
  });

  test('E1: /schedule?view=gantt keeps today’s behaviour (lands on the Gantt, query carried)', async ({
    page,
  }) => {
    await installRouteLog(page);
    await page.goto('/schedule?view=gantt');
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('scheduleGantt') && url.searchParams.get('view') === 'gantt',
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
    // 10 before #2215; the six Project setup tabs are served by that page now (E1c), the
    // two Site diary ?filterMode maps by the diary page (#2224, E1d) and the Invoices
    // ?openOnly=true map by the Invoices page (#2238, E1e)
    expect(queryMaps.length, 'planned query-map entries in the route map').toBe(1);

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
  // E1c — the six ?tab= links the Project setup page serves itself (#2215)
  // ───────────────────────────────────────────────────────────────────────────

  test('E1c: the route map marks the six Project setup tab links as served by the page (areas leaves it)', () => {
    const served = ENTRIES.filter(
      (entry) =>
        entry.from.startsWith('/settings/manage?tab=') &&
        entry.stage === 'interim' &&
        entry.interim === 'page',
    );
    expect(served.map((entry) => entry.from).sort()).toEqual(
      [...PROJECT_SETUP_TABS.map(([tab]) => tab), 'areas']
        .map((tab) => `/settings/manage?tab=${tab}`)
        .sort(),
    );
  });

  test('E1c: ?tab=areas replaces to the Areas page in a single hop (#2218)', async ({ page }) => {
    await installRouteLog(page);
    await page.goto(routeUrl('settingsManage', undefined, { tab: 'areas' }));
    await waitForShell(page);
    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('areas') && !url.searchParams.has('tab'),
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Areas', exact: true })).toBeVisible();

    const log = await readRouteLog(page);
    expect(
      log.map((entry) => entry.kind),
      '?tab=areas is rewritten by exactly one replaceState',
    ).toEqual(['replaceState']);
  });

  test('E1c: each Project setup tab link lands on its section anchor with one replaceState', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await installRouteLog(page);

    for (const [tab, anchor] of PROJECT_SETUP_TABS) {
      await page.goto(routeUrl('settingsManage', undefined, { tab }));
      await waitForShell(page);
      await expect(page, `?tab=${tab}`).toHaveURL(
        (url) =>
          url.pathname === routeUrl('settingsManage') &&
          url.hash === anchor &&
          !url.searchParams.has('tab'),
      );

      const log = await readRouteLog(page);
      expect(
        log.map((entry) => entry.kind),
        `?tab=${tab} is rewritten by exactly one replaceState`,
      ).toEqual(['replaceState']);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E1d — the two Site diary ?filterMode links the diary page serves itself (#2224)
  // ───────────────────────────────────────────────────────────────────────────

  test('E1d: the route map marks the two ?filterMode links as served by the diary page', () => {
    const served = ENTRIES.filter(
      (entry) =>
        entry.from.startsWith('/diary?filterMode=') &&
        entry.stage === 'interim' &&
        entry.interim === 'page',
    );
    expect(served.map((entry) => entry.from).sort()).toEqual([
      '/diary?filterMode=all',
      '/diary?filterMode=automatic',
    ]);
  });

  test('E1d: ?filterMode=automatic lands on /history, types become the first History type, one replaceState', async ({
    page,
  }) => {
    await installRouteLog(page);
    const from = `${routeUrl('diary')}?filterMode=automatic&types=daily_log,invoice_status,payment&q=walk&dateFrom=2026-01-05&dateTo=2026-02-06&other=dropped`;
    await page.goto(from);
    await waitForShell(page);

    await expect(page).toHaveURL((url) => {
      const params = url.searchParams;
      return (
        url.pathname === routeUrl('history') &&
        params.get('type') === 'invoice_status' &&
        params.get('q') === 'walk' &&
        params.get('dateFrom') === '2026-01-05' &&
        params.get('dateTo') === '2026-02-06' &&
        !params.has('filterMode') &&
        !params.has('types') &&
        !params.has('other') &&
        !params.has('include')
      );
    });
    await expectSingleHop(page, routeUrl('history'), true);
  });

  test('E1d: ?filterMode=all lands on /history?include=diary', async ({ page }) => {
    await installRouteLog(page);
    await page.goto(`${routeUrl('diary')}?filterMode=all`);
    await waitForShell(page);

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('history') &&
        url.searchParams.get('include') === 'diary' &&
        !url.searchParams.has('filterMode'),
    );
    await expectSingleHop(page, routeUrl('history'), true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E1e — the ?openOnly=true link the Invoices page serves itself (#2238)
  // ───────────────────────────────────────────────────────────────────────────

  test('E1e: the route map marks /budget/invoices?openOnly=true as served by the Invoices page', () => {
    const served = ENTRIES.filter(
      (entry) =>
        entry.from === '/budget/invoices?openOnly=true' &&
        entry.stage === 'interim' &&
        entry.interim === 'page',
    );
    expect(served.map((entry) => entry.from)).toEqual(['/budget/invoices?openOnly=true']);
  });

  test('E1e: ?openOnly=true&page=2&pageSize=50&q=walk lands on ?status=pending&q=walk with one replaceState', async ({
    page,
  }) => {
    await installRouteLog(page);
    await page.goto(`${routeUrl('invoices')}?openOnly=true&page=2&pageSize=50&q=walk`);
    await waitForShell(page);

    await expect(page).toHaveURL((url) => {
      const params = url.searchParams;
      return (
        url.pathname === routeUrl('invoices') &&
        params.get('status') === 'pending' &&
        params.get('q') === 'walk' &&
        !params.has('openOnly') &&
        !params.has('page') &&
        !params.has('pageSize')
      );
    });
    await expectSingleHop(page, routeUrl('invoices'), true);
    await new InvoicesPage(page).waitForLoaded();
    const log = await readRouteLog(page);
    expect(log.filter((entry) => entry.kind === 'replaceState')).toHaveLength(1);
  });

  test('E1e: an old offers link /budget/invoices?status=quotation lands on the Offers chip', async ({
    page,
  }) => {
    await page.goto(`${routeUrl('invoices')}?status=quotation`);
    await expect(new InvoicesPage(page).chip('quotation')).toHaveAttribute('aria-pressed', 'true');
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

  test('E3: vCard URLs /companies/:id and the legacy vendor URLs land on the company in one hop', async ({
    page,
  }) => {
    await installRouteLog(page);
    const landing = routeUrl('company', { id: seed.vendorId });

    // /companies/:id is served as it is (no hop); the legacy URLs redirect to it in one hop
    for (const [start, mustHop] of [
      [landing, false],
      [`/budget/vendors/${seed.vendorId}`, true],
      [`/settings/vendors/${seed.vendorId}`, true],
    ] as const) {
      await page.goto(start);
      await expect(page, start).toHaveURL((url) => url.pathname === landing);
      await expect(page.getByRole('heading', { level: 1, name: NAMES.company })).toBeVisible();
      await expectSingleHop(page, landing, mustHop);
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

    // One hop to the Invoices list, where the New invoice dialog opens. The `?create=1&documentId=`
    // request is consumed (replaced away) by the page, so the final URL is clean.
    const invoicesPage = new InvoicesPage(page);
    await expect(invoicesPage.createDialog.dialog).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('invoices'));
    await expectSingleHop(page, routeUrl('invoices'), true);
  });

  test('E4b: with Paperless on and AI off the review page sends you to the dialog with the document picked', async ({
    page,
  }) => {
    await installRouteLog(page);
    await mockPaperlessConfigured(page);
    await mockConfig(page, false);
    await mockLinkedIds(page);
    await mockCorrespondents(page);
    await mockTags(page);
    // Routes registered later win: the list glob (`**/paperless/documents**`) also matches
    // `/documents/9001`, so the detail mock must come after it
    await mockDocuments(page);
    await mockDocumentDetail(page, MOCK_DOC.id);

    await page.goto(`${routeUrl('invoicePaperlessReview')}?documentId=${MOCK_DOC.id}`);

    const invoicesPage = new InvoicesPage(page);
    const dialog = invoicesPage.createDialog;
    await expect(dialog.dialog).toBeVisible();
    // The document of the link is picked and pre-fills the form (Notes = the title)
    await expect(dialog.documentChip()).toContainText(MOCK_DOC.title);
    await dialog.expandMoreDetails();
    await expect(dialog.notes).toHaveValue(MOCK_DOC.title);
    // AI is off: no link to the review page
    await expect(dialog.readWithAi).toHaveCount(0);
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('invoices'));
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

    await expect(reviewPage.heading).toHaveText('New invoice');
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
      // #2204: the sign-in page remembers the legacy URL as the deep link (`next`)
      await expect(page).toHaveURL(
        (url) => url.pathname === '/login' && url.searchParams.get('next') === '/work-items',
      );
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
