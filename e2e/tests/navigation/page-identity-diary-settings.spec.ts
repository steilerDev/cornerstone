/**
 * E2E page identity for Site diary, Photos, Settings and the system pages (Story #2204 / EPIC-21)
 *
 * Every page states what it is: one h1, a browser-tab title `<page or object> · <section> ·
 * <house name>`, a breadcrumb trail of parents only, and (where the page was opened from
 * somewhere other than its parent) one origin-aware "Back to <origin>" link that replaces the old
 * "← Back to Diary / Entry / spots" buttons.
 *
 * Scenarios:
 * - E1  (AC1)  Site diary: list, New diary entry, entry (titled and untitled), Edit; exact h1 and
 *              tab title, trail, no Back; Cancel returns to the entry in ONE history step
 * - E1b (phone) the entry page shows one element in the breadcrumb row: "‹ Site diary"
 * - E2         origin: Recent diary card and the Add menu on Home give "Back to Home"; the
 *              origin survives a reload, is gone on a fresh visit, and through the draft the type
 *              picker is replaced (Back never returns to it)
 * - E3  (AC1)  Photos: h1/title, the viewer's "Photos" link keeps the query, the viewer title,
 *              "Open diary entry" gives "Back to <spot>"
 * - E4  (AC1)  Settings (Project setup / Account / Users / Backups), Page not found; no "You are
 *              here" trail. The member's "No access" title is asserted in admin/member-access.spec.ts
 *              (E1), which already owns a real member account (no extra login here)
 * - E5  (AC2)  Project setup tabs replace history and nothing is written on load (D-10)
 *
 * The German h1/title check lives in i18n/i18n.spec.ts, which owns a dedicated user: the locale
 * is a server-side preference. Deep links through sign-in (E6/E8) and SSO (E7) live in
 * auth/deep-link-sign-in.spec.ts and auth/oidc.spec.ts.
 *
 * Projects: E1, E2, E4, E5 run on desktop; E1b runs on mobile; E3 runs on desktop and mobile
 * (layout agnostic: the spot link is a table cell or a card); tablet is skipped (the logic is
 * viewport independent).
 *
 * Data: synthetic names created through the API, removed in afterAll. The E2E database is shared
 * and settings-manage.spec.ts sets/clears the house name concurrently, so where the exact title
 * matters `GET /api/settings` is mocked with a complete HouseholdSettingsResponse. No users are
 * created and no extra logins happen (login rate limit).
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createAreaViaApi,
  createDiaryEntryViaApi,
  createOrientationViaApi,
  deleteAreaViaApi,
  deleteDiaryEntryViaApi,
  deleteOrientationViaApi,
  uploadDiaryPhotoViaApi,
} from '../../fixtures/apiHelpers.js';
import { installRouteLog, readRouteLog } from '../../fixtures/routeLog.js';
import { ROUTES } from '../../fixtures/testData.js';
import { BreadcrumbsBar } from '../../pages/BreadcrumbsBar.js';
import { DashboardPage } from '../../pages/DashboardPage.js';
import { DiaryEntryCreatePage } from '../../pages/DiaryEntryCreatePage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { DiaryEntryEditPage } from '../../pages/DiaryEntryEditPage.js';
import { DiaryPage } from '../../pages/DiaryPage.js';
import { NotFoundPage } from '../../pages/NotFoundPage.js';
import { PhotoSpotViewerPage } from '../../pages/PhotoSpotViewerPage.js';
import { PhotosPage } from '../../pages/PhotosPage.js';

const HOUSE = 'Synthetic House 2204';

const runId = Date.now().toString(36);
const NAMES = {
  titled: `PI diary ${runId}`,
  photoEntry: `PI photo entry ${runId}`,
  area: `PI Area ${runId}`,
  orientation: `PI North ${runId}`,
};

/** Far-future dates keep the seeded entries on top of the Recent diary card (newest first). */
const TITLED_DATE = '2090-01-02';
const PHOTO_DATE = '2090-01-01';

/** Today as local YYYY-MM-DD, and the label an untitled entry of today gets ("Oct 10"). */
const now = new Date();
const today = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-');
const todayLabel = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const seed = {
  titledId: '',
  untitledId: '',
  photoEntryId: '',
  areaId: '',
  orientationId: '',
};

/** Mocks `GET /api/settings` (complete HouseholdSettingsResponse) so the house name is known. */
async function mockHouseName(page: Page): Promise<void> {
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ settings: { householdName: HOUSE, householdAddress: null } }),
    });
  });
}

/**
 * Mocks `GET /api/users/me/preferences` with an empty list so no card is hidden: other specs
 * write `dashboard.hiddenCards` on the shared admin and would hide the Recent diary card.
 */
async function mockNoPreferences(page: Page): Promise<void> {
  await page.route('**/api/users/me/preferences', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ preferences: [] }),
    });
  });
}

function onProject(...names: string[]): boolean {
  return names.includes(test.info().project.name);
}

/** The single h1 of the page (also asserts there is exactly one). */
async function expectOneH1(page: Page, text: string): Promise<void> {
  const headings = page.getByRole('heading', { level: 1 });
  await expect(headings).toHaveCount(1);
  await expect(headings).toHaveText(text);
}

test.describe('Page identity: Site diary, Photos, Settings (#2204)', () => {
  test.beforeAll(async ({ browser }) => {
    if (!onProject('desktop', 'mobile')) return;
    const context = await browser.newContext({ storageState: 'test-results/.auth/admin.json' });
    const page = await context.newPage();
    try {
      seed.titledId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: TITLED_DATE,
        title: NAMES.titled,
        body: `PI body ${runId}`,
      });
      seed.untitledId = await createDiaryEntryViaApi(page, {
        entryType: 'daily_log',
        entryDate: today,
        body: `PI untitled body ${runId}`,
      });
      seed.areaId = await createAreaViaApi(page, { name: NAMES.area });
      seed.orientationId = await createOrientationViaApi(page, { name: NAMES.orientation });
      seed.photoEntryId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: PHOTO_DATE,
        title: NAMES.photoEntry,
        body: `PI photo body ${runId}`,
      });
      await uploadDiaryPhotoViaApi(page, seed.photoEntryId, {
        areaId: seed.areaId,
        orientationId: seed.orientationId,
      });
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!onProject('desktop', 'mobile')) return;
    const context = await browser.newContext({ storageState: 'test-results/.auth/admin.json' });
    const page = await context.newPage();
    try {
      for (const id of [seed.titledId, seed.untitledId, seed.photoEntryId]) {
        if (id) await deleteDiaryEntryViaApi(page, id).catch(() => undefined);
      }
      if (seed.areaId) await deleteAreaViaApi(page, seed.areaId).catch(() => undefined);
      if (seed.orientationId) {
        await deleteOrientationViaApi(page, seed.orientationId).catch(() => undefined);
      }
    } finally {
      await context.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Desktop: E1, E2, E4, E5
  // ───────────────────────────────────────────────────────────────────────────

  test.describe('desktop', () => {
    test.beforeEach(() => {
      test.skip(!onProject('desktop'), 'logic is viewport independent; E1b/E3 cover the phone');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E1 — Site diary
    // ─────────────────────────────────────────────────────────────────────────

    test(
      'E1: the Site diary list has the right h1 and tab title and no trail',
      { tag: '@smoke' },
      async ({ page }) => {
        const bc = new BreadcrumbsBar(page);
        await mockHouseName(page);
        await page.goto(ROUTES.diary);

        await expectOneH1(page, 'Site diary');
        await expect(page).toHaveTitle(`Site diary · ${HOUSE}`);
        await bc.expectNoTrail();
        await bc.expectNoBack();
        await expect(page.getByRole('navigation', { name: 'You are here' })).toHaveCount(0);
      },
    );

    test('E1: New diary entry has the right h1, tab title, the Site diary trail and no Back button', async ({
      page,
    }) => {
      const create = new DiaryEntryCreatePage(page);
      await mockHouseName(page);
      await create.goto();

      await expectOneH1(page, 'New diary entry');
      await expect(page).toHaveTitle(`New diary entry · Site diary · ${HOUSE}`);
      await create.breadcrumbs.expectTrail(['Site diary']);
      await create.breadcrumbs.expectNoBack();
    });

    test('E1: a titled entry shows its title as h1, tab title and object name', async ({
      page,
    }) => {
      const detail = new DiaryEntryDetailPage(page);
      await mockHouseName(page);
      await detail.goto(seed.titledId);

      await expectOneH1(page, NAMES.titled);
      await expect(page).toHaveTitle(`${NAMES.titled} · Site diary · ${HOUSE}`);
      await detail.breadcrumbs.expectTrail(['Site diary']);
      await detail.breadcrumbs.expectNoBack();
    });

    test('E1: an untitled daily log is named "Daily log · <month day>"', async ({ page }) => {
      const detail = new DiaryEntryDetailPage(page);
      await mockHouseName(page);
      await detail.goto(seed.untitledId);

      const expected = `Daily log · ${todayLabel}`;
      await expectOneH1(page, expected);
      await expect(page).toHaveTitle(`${expected} · Site diary · ${HOUSE}`);
    });

    test('E1: an unknown entry says so in the h1 and the tab title', async ({ page }) => {
      const detail = new DiaryEntryDetailPage(page);
      await mockHouseName(page);
      await detail.goto('00000000-0000-4000-8000-000000002204');

      await expectOneH1(page, 'Diary entry not found');
      await expect(page).toHaveTitle(`Diary entry not found · Site diary · ${HOUSE}`);
      await expect(detail.backToDiaryLink).toBeVisible();
    });

    test('E1: Edit shows "Edit diary entry" with the entry in the trail; Cancel returns in one step', async ({
      page,
    }) => {
      const list = new DiaryPage(page);
      const detail = new DiaryEntryDetailPage(page);
      const edit = new DiaryEntryEditPage(page);
      await mockHouseName(page);

      // List -> entry -> Edit, so the history holds exactly: list, entry, edit
      await page.goto(`${ROUTES.diary}?q=${encodeURIComponent(NAMES.titled)}`);
      await list.entryCard(seed.titledId).click();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('diaryEntry', { id: seed.titledId }),
      );
      await expectOneH1(page, NAMES.titled);
      await detail.editButton.click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('diaryEntryEdit', { id: seed.titledId }),
      );
      await expectOneH1(page, 'Edit diary entry');
      await expect(page).toHaveTitle(`Edit diary entry · Site diary · ${HOUSE}`);
      await edit.breadcrumbs.expectTrail(['Site diary', NAMES.titled]);
      // The entry itself is the nearest parent, so there is no Back link next to the trail
      await edit.breadcrumbs.expectNoBack();

      await edit.cancelButton.click();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('diaryEntry', { id: seed.titledId }),
      );
      await expectOneH1(page, NAMES.titled);

      // One history step: Back leaves the entry for the list (it does not return to the edit page)
      await page.goBack();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('diary'));
      await expectOneH1(page, 'Site diary');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E2 — origin: "Back to Home"
    // ─────────────────────────────────────────────────────────────────────────

    test('E2: an entry opened from the Recent diary card on Home offers "Back to Home"', async ({
      page,
    }) => {
      const bc = new BreadcrumbsBar(page);
      await mockHouseName(page);
      await mockNoPreferences(page);
      await page.goto(ROUTES.home);

      // The desktop grid and the mobile sections both mount the card: use the visible link
      const link = page.getByTestId(`recent-diary-${seed.titledId}`).filter({ visible: true });
      await expect(link).toBeVisible();
      await link.click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('diaryEntry', { id: seed.titledId }),
      );
      await expectOneH1(page, NAMES.titled);
      await bc.expectBack('Home');
      await bc.expectTrail(['Site diary']);

      // The origin lives in history state: it survives a reload ...
      await page.reload();
      await expectOneH1(page, NAMES.titled);
      await bc.expectBack('Home');

      // ... and is gone when the same URL is opened fresh
      await page.goto(page.url());
      await expectOneH1(page, NAMES.titled);
      await bc.expectNoBack();

      // Back returns to Home
      await page.goBack();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('dashboard'));
    });

    test('E2: New diary entry from the Home Add menu keeps "Back to Home" through the draft and never returns to the type picker', async ({
      page,
    }) => {
      const dashboard = new DashboardPage(page);
      const create = new DiaryEntryCreatePage(page);
      const edit = new DiaryEntryEditPage(page);
      let draftId: string | null = null;
      await mockHouseName(page);
      await mockNoPreferences(page);

      try {
        await dashboard.goto();
        await dashboard.openAddDropdown();
        await dashboard.addDiaryEntryButton.click();

        await expect(page).toHaveURL((url) => url.pathname === routeUrl('diaryEntryNew'));
        await expectOneH1(page, 'New diary entry');
        await create.breadcrumbs.expectBack('Home');

        // Picking a type creates the draft and REPLACES the picker
        await create.selectType('general_note');
        await expect(page).toHaveURL(/\/diary\/[^/]+\/edit$/);
        draftId = /\/diary\/([^/]+)\/edit$/.exec(new URL(page.url()).pathname)?.[1] ?? null;
        await edit.heading.waitFor({ state: 'visible' });
        await expectOneH1(page, 'New diary entry');
        await edit.breadcrumbs.expectTrail(['Site diary']);
        await edit.breadcrumbs.expectBack('Home');

        // The type picker is no longer in history: Back goes straight to Home
        await page.goBack();
        await expect(page).toHaveURL((url) => url.pathname === routeUrl('dashboard'));
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId).catch(() => undefined);
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E4 — Settings and system pages
    // ─────────────────────────────────────────────────────────────────────────

    const SETTINGS_CASES = [
      { name: 'Project setup', path: () => ROUTES.manage, h1: 'Project setup' },
      { name: 'Account', path: () => ROUTES.profile, h1: 'Account' },
      { name: 'Users', path: () => ROUTES.userManagement, h1: 'Users' },
      { name: 'Backups', path: () => ROUTES.backups, h1: 'Backups' },
    ] as const;

    for (const c of SETTINGS_CASES) {
      test(`E4: Settings > ${c.name} has the right h1, a Settings tab title and no trail`, async ({
        page,
      }) => {
        const bc = new BreadcrumbsBar(page);
        await mockHouseName(page);
        await page.goto(c.path());

        await expectOneH1(page, c.h1);
        await expect(page).toHaveTitle(`${c.h1} · Settings · ${HOUSE}`);
        await bc.expectNoTrail();
        await expect(page.getByRole('navigation', { name: 'You are here' })).toHaveCount(0);
      });
    }

    test('E4: an unknown URL shows "Page not found" with a "Go to Home" link', async ({ page }) => {
      const notFound = new NotFoundPage(page);
      await mockHouseName(page);
      await page.goto('/pi-does-not-exist');

      await expectOneH1(page, 'Page not found');
      await expect(page).toHaveTitle(`Page not found · ${HOUSE}`);
      await expect(notFound.dashboardLink).toBeVisible();

      await notFound.clickDashboardLink();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('dashboard'));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E5 — Project setup tabs (D-10)
    // ─────────────────────────────────────────────────────────────────────────

    test('E5: Project setup writes nothing on load, tab changes replace history, Back leaves the page', async ({
      page,
    }) => {
      await installRouteLog(page);
      await mockHouseName(page);

      await page.goto(ROUTES.diary);
      await expectOneH1(page, 'Site diary');
      await page.goto(ROUTES.manage);
      await expectOneH1(page, 'Project setup');
      await expect(page.getByRole('tab', { name: 'Areas' })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      // Nothing was pushed or replaced on load, and the URL gained no ?tab=
      expect(await readRouteLog(page)).toEqual([]);
      expect(new URL(page.url()).search).toBe('');

      for (const tab of ['Trades', 'Orientations', 'Household']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute(
          'aria-selected',
          'true',
        );
      }
      await expect(page).toHaveURL(/\?tab=household$/);

      const log = await readRouteLog(page);
      expect(log.length).toBeGreaterThanOrEqual(3);
      expect(
        log.filter((entry) => entry.kind !== 'replaceState'),
        'tab changes must replace, never push',
      ).toEqual([]);

      // One step back leaves the page for the previous one
      await page.goBack();
      await expect(page).toHaveURL(/\/diary$/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E3 — Photos (desktop and phone)
  // ───────────────────────────────────────────────────────────────────────────

  test.describe('photos', () => {
    test.beforeEach(() => {
      test.skip(!onProject('desktop', 'mobile'), 'tablet is skipped');
    });

    test('E3: the Photos page has the right h1 and tab title and no trail', async ({ page }) => {
      const photos = new PhotosPage(page);
      const bc = new BreadcrumbsBar(page);
      await mockHouseName(page);
      await photos.goto();

      await expectOneH1(page, 'Photos');
      await expect(page).toHaveTitle(`Photos · ${HOUSE}`);
      await bc.expectNoTrail();
    });

    test('E3: the viewer link reads "Photos" and keeps the query; the tab title names the spot', async ({
      page,
    }) => {
      const photos = new PhotosPage(page);
      const viewer = new PhotoSpotViewerPage(page);
      const spot = `${NAMES.area} · ${NAMES.orientation}`;
      await mockHouseName(page);

      // Open the viewer from the Photos page with a query on it
      await page.goto(`${routeUrl('photos')}?pi=2204`);
      await photos.heading.waitFor({ state: 'visible' });
      await photos.spotLink(seed.areaId, seed.orientationId).click();

      await expect(viewer.position).toHaveText('1 of 1');
      await expect(viewer.backLink).toHaveText('Photos');
      await expect(viewer.backLink).toHaveAttribute('href', `${routeUrl('photos')}?pi=2204`);
      await expect(page).toHaveTitle(`${spot} · Photos · ${HOUSE}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(spot);

      // The link returns to /photos with the previous query
      await viewer.backLink.click();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('photos') && url.searchParams.get('pi') === '2204',
      );
    });

    test('E3: "Open diary entry" offers "Back to <spot>" and returns to the viewer', async ({
      page,
    }) => {
      const viewer = new PhotoSpotViewerPage(page);
      const detail = new DiaryEntryDetailPage(page);
      const spot = `${NAMES.area} · ${NAMES.orientation}`;
      await mockHouseName(page);

      await viewer.goto(seed.areaId, seed.orientationId);
      await expect(viewer.position).toHaveText('1 of 1');
      await viewer.diaryLink.click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('diaryEntry', { id: seed.photoEntryId }),
      );
      await expectOneH1(page, NAMES.photoEntry);
      await detail.breadcrumbs.expectBack(spot);

      await detail.breadcrumbs.backLink.click();
      await expect(viewer.position).toHaveText('1 of 1');
      await expect(page).toHaveTitle(`${spot} · Photos · ${HOUSE}`);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Phone: E1b
  // ───────────────────────────────────────────────────────────────────────────

  test.describe('phone', () => {
    test.beforeEach(() => {
      test.skip(!onProject('mobile'), 'phone rules only apply to the mobile project');
    });

    test('E1b: an entry opened from the list shows one element in the breadcrumb row: "‹ Site diary"', async ({
      page,
    }) => {
      const list = new DiaryPage(page);
      const bc = new BreadcrumbsBar(page);
      await mockHouseName(page);

      await page.goto(`${ROUTES.diary}?q=${encodeURIComponent(NAMES.titled)}`);
      await list.entryCard(seed.titledId).click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('diaryEntry', { id: seed.titledId }),
      );
      await expectOneH1(page, NAMES.titled);
      await bc.expectNoBack();
      await bc.expectTrail(['Site diary']);
      await expect(bc.row.getByRole('link')).toHaveCount(1);

      const box = await bc.trailLink('Site diary').boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    });
  });
});
