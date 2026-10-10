/**
 * E2E: the Phase 0 exit sweep, every page of the route map (Story #2205 / EPIC-21, AC6).
 *
 * One test per page the app serves today. Each checks, in the real build:
 *  - exactly one h1 with the page's name,
 *  - the browser-tab title `<h1> · [<section> · ]<house name>`,
 *  - the breadcrumb row: present on non-view pages (they have parents), absent on views,
 *  - exactly one highlighted sidebar entry (the expected one), none on the 404 page.
 *
 * Completeness: the table is checked against the route map. A page added to
 * `shared/src/routes/routeMap.ts` without a row here fails the first test, so the sweep cannot
 * silently fall behind. The two exemptions are Paperless+AI pages that redirect away when the
 * integration is off, which is the case in the E2E environment (covered by their own suites).
 *
 * Documented exemptions inside the table (their h1s belong to other stories):
 *  - Home (#2230) and Companies (#2213): the title is checked, the h1 is not.
 *
 * `home` and `companies`/`company` are interim routes that redirect one hop (`/` to the
 * overview, `/companies` to the vendors pages); the sweep waits for the final URL before it
 * reads anything.
 *
 * Desktop only (the logic is viewport independent). `GET /api/settings` is mocked with a complete
 * HouseholdSettingsResponse because other specs set the house name concurrently. Data is
 * synthetic, created through the API in beforeAll and removed in afterAll. No users are created.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { ROUTE_MAP, routeUrl } from '../../../shared/src/routes/index.js';
import {
  createAreaViaApi,
  createDiaryEntryViaApi,
  createHouseholdItemViaApi,
  createMilestoneViaApi,
  createOrientationViaApi,
  createVendorViaApi,
  createWorkItemViaApi,
  deleteAreaViaApi,
  deleteDiaryEntryViaApi,
  deleteHouseholdItemViaApi,
  deleteMilestoneViaApi,
  deleteOrientationViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
  uploadDiaryPhotoViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { BreadcrumbsBar } from '../../pages/BreadcrumbsBar.js';

const HOUSE = 'E2E House';
const runId = Date.now().toString(36);
const NAMES = {
  task: `E2E Sweep ${runId} task`,
  purchase: `E2E Sweep ${runId} purchase`,
  milestone: `E2E Sweep ${runId} milestone`,
  diary: `E2E Sweep ${runId} diary`,
  company: `E2E Sweep ${runId} company`,
  area: `E2E Sweep ${runId} Area`,
  orientation: `E2E Sweep ${runId} North`,
  invoiceNumber: `SW-${runId}`,
};
const INVOICE_H1 = `${NAMES.company} · ${NAMES.invoiceNumber}`;
const SPOT_H1 = `${NAMES.area} · ${NAMES.orientation}`;

const now = new Date();
const today = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-');

const seed = {
  workItemId: '',
  householdItemId: '',
  milestoneId: 0,
  diaryId: '',
  vendorId: '',
  invoiceId: '',
  areaId: '',
  orientationId: '',
};

/** Ids of served pages that the sweep deliberately skips (Paperless+AI gate redirects). */
const EXEMPT_IDS = ['invoicePaperlessReview', 'invoiceAutoItemize'];

const MISSING_PATH = `/does-not-exist-${runId}`;

interface SweepRow {
  /** Route-map id. */
  id: string;
  /** URL to visit. */
  path: () => string;
  /** Where an interim redirect lands (defaults to `path`). */
  finalPath?: () => string;
  /** The single h1; null = not asserted (documented exemption). */
  h1: string | null;
  /** Title override for the exempt rows; otherwise `<h1> · [<section> · ]<house>`. */
  title?: RegExp;
  /** Breadcrumb row expected (non-view pages). The 404 page renders none. */
  crumbs: boolean;
  /** Test id of the one highlighted sidebar entry; null = none (404). */
  active: string | null;
}

const TASKS = 'sidebar-section-tasks';
const PURCHASES = 'sidebar-section-purchases';
const MONEY = 'sidebar-section-money';
const DIARY = 'sidebar-section-diary';
const PHOTOS = 'sidebar-section-photos';
const SETTINGS = 'sidebar-section-settings';
const HOME = 'sidebar-section-home';
const COMPANIES = 'sidebar-section-companies';

const ROWS: SweepRow[] = [
  // Tasks
  { id: 'workItems', path: () => routeUrl('workItems'), h1: 'Tasks', crumbs: false, active: TASKS },
  {
    id: 'workItemNew',
    path: () => routeUrl('workItemNew'),
    h1: 'New task',
    crumbs: true,
    active: TASKS,
  },
  {
    id: 'workItem',
    path: () => routeUrl('workItem', { id: seed.workItemId }),
    h1: NAMES.task,
    crumbs: true,
    active: TASKS,
  },
  {
    id: 'milestones',
    path: () => routeUrl('milestones'),
    h1: 'Milestones',
    crumbs: false,
    active: 'sidebar-view-milestones',
  },
  {
    id: 'milestoneNew',
    path: () => routeUrl('milestoneNew'),
    h1: 'New milestone',
    crumbs: true,
    active: 'sidebar-view-milestones',
  },
  {
    id: 'milestone',
    path: () => routeUrl('milestone', { id: seed.milestoneId }),
    h1: NAMES.milestone,
    crumbs: true,
    active: 'sidebar-view-milestones',
  },
  {
    id: 'scheduleGantt',
    path: () => routeUrl('scheduleGantt'),
    h1: 'Schedule',
    crumbs: false,
    active: 'sidebar-view-scheduleGantt',
  },
  {
    id: 'scheduleCalendar',
    path: () => routeUrl('scheduleCalendar'),
    h1: 'Calendar',
    crumbs: false,
    active: 'sidebar-view-scheduleCalendar',
  },
  // Purchases
  {
    id: 'householdItems',
    path: () => routeUrl('householdItems'),
    h1: 'Purchases',
    crumbs: false,
    active: PURCHASES,
  },
  {
    id: 'householdItemNew',
    path: () => routeUrl('householdItemNew'),
    h1: 'New purchase',
    crumbs: true,
    active: PURCHASES,
  },
  {
    id: 'householdItem',
    path: () => routeUrl('householdItem', { id: seed.householdItemId }),
    h1: NAMES.purchase,
    crumbs: true,
    active: PURCHASES,
  },
  {
    id: 'householdItemEdit',
    path: () => routeUrl('householdItemEdit', { id: seed.householdItemId }),
    h1: 'Edit purchase',
    crumbs: true,
    active: PURCHASES,
  },
  // Money
  {
    id: 'budgetOverview',
    path: () => routeUrl('budgetOverview'),
    h1: 'Money',
    crumbs: false,
    active: MONEY,
  },
  {
    id: 'invoices',
    path: () => routeUrl('invoices'),
    h1: 'Invoices',
    crumbs: false,
    active: 'sidebar-view-invoices',
  },
  {
    id: 'invoice',
    path: () => routeUrl('invoice', { id: seed.invoiceId }),
    h1: INVOICE_H1,
    crumbs: true,
    active: 'sidebar-view-invoices',
  },
  {
    id: 'budgetSources',
    path: () => routeUrl('budgetSources'),
    h1: 'Funding sources',
    crumbs: true,
    active: 'sidebar-view-budgetSources',
  },
  {
    id: 'budgetSubsidies',
    path: () => routeUrl('budgetSubsidies'),
    h1: 'Grants',
    crumbs: true,
    active: 'sidebar-view-budgetSubsidies',
  },
  {
    id: 'bankReport',
    path: () => routeUrl('bankReport'),
    h1: 'Bank report',
    crumbs: true,
    active: 'sidebar-view-bankReport',
  },
  // Site diary
  { id: 'diary', path: () => routeUrl('diary'), h1: 'Site diary', crumbs: false, active: DIARY },
  {
    id: 'diaryEntryNew',
    path: () => routeUrl('diaryEntryNew'),
    h1: 'New diary entry',
    crumbs: true,
    active: DIARY,
  },
  {
    id: 'diaryEntry',
    path: () => routeUrl('diaryEntry', { id: seed.diaryId }),
    h1: NAMES.diary,
    crumbs: true,
    active: DIARY,
  },
  {
    id: 'diaryEntryEdit',
    path: () => routeUrl('diaryEntryEdit', { id: seed.diaryId }),
    h1: 'Edit diary entry',
    crumbs: true,
    active: DIARY,
  },
  // Photos
  { id: 'photos', path: () => routeUrl('photos'), h1: 'Photos', crumbs: false, active: PHOTOS },
  {
    id: 'photoSpot',
    path: () => routeUrl('photoSpot', { areaKey: seed.areaId, orientationKey: seed.orientationId }),
    h1: SPOT_H1,
    // The spot viewer owns its "Back to Photos" link (page-identity-diary-settings E3); it
    // renders no shared breadcrumb row unless opened from elsewhere
    crumbs: false,
    active: PHOTOS,
  },
  // Settings
  {
    id: 'settingsManage',
    path: () => routeUrl('settingsManage'),
    h1: 'Project setup',
    crumbs: false,
    active: SETTINGS,
  },
  {
    id: 'settingsProfile',
    path: () => routeUrl('settingsProfile'),
    h1: 'Account',
    crumbs: false,
    active: 'sidebar-view-settingsProfile',
  },
  {
    id: 'settingsUsers',
    path: () => routeUrl('settingsUsers'),
    h1: 'Users',
    crumbs: false,
    active: 'sidebar-view-settingsUsers',
  },
  {
    id: 'settingsBackups',
    path: () => routeUrl('settingsBackups'),
    h1: 'Backups',
    crumbs: false,
    active: 'sidebar-view-settingsBackups',
  },
  // Home (h1 owned by #2230): `/` redirects one hop to the overview
  {
    id: 'home',
    path: () => routeUrl('home'),
    finalPath: () => routeUrl('dashboard'),
    h1: null,
    title: new RegExp(`^Home · ${HOUSE}$`),
    crumbs: false,
    active: HOME,
  },
  {
    id: 'dashboard',
    path: () => routeUrl('dashboard'),
    h1: null,
    title: new RegExp(`^Home · ${HOUSE}$`),
    crumbs: false,
    active: HOME,
  },
  // Companies (h1s owned by #2213): `/companies` redirects one hop to the vendors pages
  {
    id: 'companies',
    path: () => routeUrl('companies'),
    finalPath: () => routeUrl('vendors'),
    h1: null,
    title: new RegExp(`^Companies · ${HOUSE}$`),
    crumbs: false,
    active: COMPANIES,
  },
  {
    id: 'company',
    path: () => routeUrl('company', { id: seed.vendorId }),
    finalPath: () => routeUrl('vendor', { id: seed.vendorId }),
    h1: null,
    title: new RegExp(` · Companies · ${HOUSE}$`),
    crumbs: true,
    active: COMPANIES,
  },
  {
    id: 'vendors',
    path: () => routeUrl('vendors'),
    h1: null,
    title: new RegExp(`^Companies · ${HOUSE}$`),
    crumbs: false,
    active: COMPANIES,
  },
  {
    id: 'vendor',
    path: () => routeUrl('vendor', { id: seed.vendorId }),
    h1: null,
    title: new RegExp(` · Companies · ${HOUSE}$`),
    crumbs: true,
    active: COMPANIES,
  },
  // 404: no highlighted entry and no breadcrumb row
  {
    id: 'notFound',
    path: () => MISSING_PATH,
    h1: 'Page not found',
    crumbs: false,
    active: null,
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function onDesktop(): boolean {
  return test.info().project.name === 'desktop';
}

/** Mocks `GET /api/settings` (complete HouseholdSettingsResponse) so the house name is known. */
async function mockHouseName(page: Page): Promise<void> {
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ settings: { householdName: HOUSE, householdAddress: null } }),
    });
  });
}

/** Ids of the pages the app serves today (the route map's own definition of "a page"). */
function servedPageIds(): string[] {
  const entries = ROUTE_MAP as unknown as ReadonlyArray<{
    id?: string;
    kind: string;
    stage: string;
    section: string;
    interim?: string;
  }>;
  return entries
    .filter(
      (e) =>
        e.id !== undefined &&
        e.stage !== 'planned' &&
        e.section !== 'Auth' &&
        (e.kind === 'page' || e.interim === 'page'),
    )
    .map((e) => e.id as string);
}

test.describe('Page identity sweep: every page of the route map (#2205)', () => {
  test.beforeAll(async ({ browser }) => {
    if (!onDesktop()) return;
    const context = await browser.newContext({ storageState: 'test-results/.auth/admin.json' });
    const page = await context.newPage();
    try {
      seed.workItemId = await createWorkItemViaApi(page, {
        title: NAMES.task,
        startDate: today,
        endDate: today,
      });
      seed.householdItemId = await createHouseholdItemViaApi(page, { name: NAMES.purchase });
      seed.milestoneId = await createMilestoneViaApi(page, {
        title: NAMES.milestone,
        targetDate: today,
      });
      seed.areaId = await createAreaViaApi(page, { name: NAMES.area });
      seed.orientationId = await createOrientationViaApi(page, { name: NAMES.orientation });
      seed.diaryId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: today,
        title: NAMES.diary,
        body: `E2E Sweep ${runId} body`,
      });
      await uploadDiaryPhotoViaApi(page, seed.diaryId, {
        areaId: seed.areaId,
        orientationId: seed.orientationId,
      });
      seed.vendorId = await createVendorViaApi(page, { name: NAMES.company });
      const invoice = await page.request.post(`${API.vendors}/${seed.vendorId}/invoices`, {
        data: {
          amount: 1200,
          date: '2026-03-01',
          status: 'pending',
          invoiceNumber: NAMES.invoiceNumber,
        },
      });
      expect(invoice.ok(), `POST invoice failed: ${invoice.status()}`).toBeTruthy();
      seed.invoiceId = ((await invoice.json()) as { invoice: { id: string } }).invoice.id;
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!onDesktop()) return;
    const context = await browser.newContext({ storageState: 'test-results/.auth/admin.json' });
    const page = await context.newPage();
    try {
      if (seed.invoiceId && seed.vendorId) {
        await page.request.delete(`${API.vendors}/${seed.vendorId}/invoices/${seed.invoiceId}`);
      }
      if (seed.vendorId) await deleteVendorViaApi(page, seed.vendorId).catch(() => undefined);
      if (seed.diaryId) await deleteDiaryEntryViaApi(page, seed.diaryId).catch(() => undefined);
      if (seed.areaId) await deleteAreaViaApi(page, seed.areaId).catch(() => undefined);
      if (seed.orientationId) {
        await deleteOrientationViaApi(page, seed.orientationId).catch(() => undefined);
      }
      if (seed.milestoneId) {
        await deleteMilestoneViaApi(page, seed.milestoneId).catch(() => undefined);
      }
      if (seed.householdItemId) {
        await deleteHouseholdItemViaApi(page, seed.householdItemId).catch(() => undefined);
      }
      if (seed.workItemId) await deleteWorkItemViaApi(page, seed.workItemId).catch(() => undefined);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(() => {
    test.skip(!onDesktop(), 'logic is viewport independent');
  });

  test('completeness: every served page of the route map has a sweep row', () => {
    const expected = servedPageIds()
      .filter((id) => !EXEMPT_IDS.includes(id))
      .sort();
    const covered = ROWS.map((row) => row.id).sort();
    // A page in the route map without a row fails here; a row for a page that no longer exists too
    expect(
      expected.filter((id) => !covered.includes(id)),
      'route-map pages missing from the sweep',
    ).toEqual([]);
    expect(
      covered.filter((id) => !expected.includes(id)),
      'sweep rows for pages the route map does not serve',
    ).toEqual([]);
    // The exemptions must still be real, served pages (otherwise the list is stale)
    expect(EXEMPT_IDS.filter((id) => !servedPageIds().includes(id))).toEqual([]);
  });

  for (const row of ROWS) {
    test(`${row.id}: one h1, a tab title, the right breadcrumb row and one highlighted entry`, async ({
      page,
    }) => {
      const appShell = new AppShellPage(page);
      const crumbs = new BreadcrumbsBar(page);
      await mockHouseName(page);

      await page.goto(row.path());
      // Interim routes redirect one hop: read nothing until the final URL is there
      const finalPath = (row.finalPath ?? row.path)();
      await expect(page).toHaveURL((url) => url.pathname === finalPath);

      // The h1 first (the title is set in an effect after the page has rendered)
      const headings = page.getByRole('heading', { level: 1 });
      if (row.h1 !== null) {
        await expect(headings).toHaveCount(1);
        await expect(headings).toHaveText(row.h1);
      }
      const title =
        row.title ?? new RegExp(`^${escapeRegExp(row.h1 ?? '')} · (.* · )?${escapeRegExp(HOUSE)}$`);
      await expect(page).toHaveTitle(title);

      // Breadcrumb row: parents of non-view pages; views and the 404 page have none
      await expect(crumbs.row).toHaveCount(row.crumbs ? 1 : 0);

      // Exactly one highlighted entry, none on the 404 page
      if (row.active === null) {
        await expect(appShell.activeEntries).toHaveCount(0);
      } else {
        await expect(appShell.activeEntries).toHaveCount(1);
        await expect(appShell.activeEntries).toHaveAttribute('data-testid', row.active);
      }
    });
  }
});
