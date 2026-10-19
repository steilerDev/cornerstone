/**
 * E2E: the Phase 1 exit checks (Story #2219 [P1.12] / EPIC-21).
 *
 *   X2.  Folded search: 'Fussboden'/'Fußboden' and 'Mueller'/'Müller' find each other's spelling
 *        through GET /api/search (task titles). Desktop only (API level).
 *   X3a. Phone: the top bar's search button is reachable (visible, in the viewport, >= 44x44)
 *        on EVERY page the route map serves.
 *   X3b. Phone: from a deep page (a task's detail) a company's Call link is two taps away:
 *        tap 1 = the search button, then type the name; the Call link is already visible,
 *        >= 44px tall and inside the viewport (tap 2 would be the Call link itself).
 *   X4.  Live: every served page, loaded with no dialog open, has at most ONE primary button
 *        and at most ONE search field inside <main> (outside dialogs). One test per page, so
 *        every violating page is reported with its elements.
 *
 * Completeness: the path table must cover every served page of the route map, so a new page
 * fails `completeness` until it is added. Synthetic data only, created through the API in
 * beforeAll and removed in afterAll.
 */

import { test, expect } from '../../fixtures/auth.js';
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
import { CommandSearchPanel } from '../../pages/components/CommandSearchPanel.js';

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const now = new Date();
const today = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-');

const NAMES = {
  task: `E2E P1Exit ${runId} task`,
  purchase: `E2E P1Exit ${runId} purchase`,
  milestone: `E2E P1Exit ${runId} milestone`,
  diary: `E2E P1Exit ${runId} diary`,
  company: `E2E P1Exit ${runId} company`,
  area: `E2E P1Exit ${runId} Area`,
  orientation: `E2E P1Exit ${runId} North`,
  invoiceNumber: `PX-${runId}`,
};
const PHONE = '555-0199';

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

/** Served pages the checks skip (Paperless+AI gate redirects when the integration is off). */
const EXEMPT_IDS = ['invoicePaperlessReview', 'invoiceAutoItemize'];
/** Create URLs that render their list with an ObjectForm dialog open: not "no dialog open". */
const DIALOG_ROUTE_IDS = ['workItemNew', 'milestoneNew', 'householdItemNew', 'companyNew'];

const MISSING_PATH = `/does-not-exist-${runId}`;

const PATHS: Record<string, () => string> = {
  workItems: () => routeUrl('workItems'),
  workItemNew: () => routeUrl('workItemNew'),
  workItem: () => routeUrl('workItem', { id: seed.workItemId }),
  milestones: () => routeUrl('milestones'),
  milestoneNew: () => routeUrl('milestoneNew'),
  milestone: () => routeUrl('milestone', { id: seed.milestoneId }),
  scheduleGantt: () => routeUrl('scheduleGantt'),
  scheduleCalendar: () => routeUrl('scheduleCalendar'),
  householdItems: () => routeUrl('householdItems'),
  householdItemNew: () => routeUrl('householdItemNew'),
  householdItem: () => routeUrl('householdItem', { id: seed.householdItemId }),
  householdItemEdit: () => routeUrl('householdItemEdit', { id: seed.householdItemId }),
  budgetOverview: () => routeUrl('budgetOverview'),
  invoices: () => routeUrl('invoices'),
  invoice: () => routeUrl('invoice', { id: seed.invoiceId }),
  budgetSources: () => routeUrl('budgetSources'),
  budgetSubsidies: () => routeUrl('budgetSubsidies'),
  bankReport: () => routeUrl('bankReport'),
  diary: () => routeUrl('diary'),
  diaryEntryNew: () => routeUrl('diaryEntryNew'),
  diaryEntry: () => routeUrl('diaryEntry', { id: seed.diaryId }),
  diaryEntryEdit: () => routeUrl('diaryEntryEdit', { id: seed.diaryId }),
  photos: () => routeUrl('photos'),
  photoSpot: () =>
    routeUrl('photoSpot', { areaKey: seed.areaId, orientationKey: seed.orientationId }),
  settingsManage: () => routeUrl('settingsManage'),
  settingsProfile: () => routeUrl('settingsProfile'),
  settingsUsers: () => routeUrl('settingsUsers'),
  settingsBackups: () => routeUrl('settingsBackups'),
  settingsIntegrations: () => routeUrl('settingsIntegrations'),
  home: () => routeUrl('home'),
  dashboard: () => routeUrl('dashboard'),
  areas: () => routeUrl('areas'),
  history: () => routeUrl('history'),
  companies: () => routeUrl('companies'),
  companyNew: () => routeUrl('companyNew'),
  company: () => routeUrl('company', { id: seed.vendorId }),
  notFound: () => MISSING_PATH,
};

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
    .map((e) => e.id as string)
    .filter((id) => !EXEMPT_IDS.includes(id));
}

const PAGE_IDS = servedPageIds();

test.describe('Phase 1 exit checks (#2219)', { tag: '@responsive' }, () => {
  test.beforeAll(async ({ browser }) => {
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
        body: `E2E P1Exit ${runId} body`,
      });
      await uploadDiaryPhotoViaApi(page, seed.diaryId, {
        areaId: seed.areaId,
        orientationId: seed.orientationId,
      });
      seed.vendorId = await createVendorViaApi(page, { name: NAMES.company, phone: PHONE });
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

  test('completeness: the path table covers every served page of the route map', () => {
    expect(
      PAGE_IDS.filter((id) => !(id in PATHS)),
      'served pages without a path',
    ).toEqual([]);
    expect(
      Object.keys(PATHS).filter((id) => !PAGE_IDS.includes(id)),
      'paths for pages the route map does not serve',
    ).toEqual([]);
  });

  test.describe('X2: folded search finds both spellings', () => {
    test.beforeEach(({ testPrefix: _testPrefix }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'API-level check: desktop only');
    });

    const pairs: Array<[string, string]> = [
      ['Fußboden', 'Fussboden'],
      ['Müller', 'Mueller'],
    ];
    for (const [umlaut, ascii] of pairs) {
      test(`${ascii} / ${umlaut}: either spelling finds both tasks`, async ({ page }) => {
        const token = Math.random().toString(36).slice(2, 10);
        const ids: string[] = [];
        try {
          ids.push(await createWorkItemViaApi(page, { title: `${umlaut} ${token}` }));
          ids.push(await createWorkItemViaApi(page, { title: `${ascii} ${token}` }));

          for (const q of [`${umlaut.toLowerCase()} ${token}`, `${ascii.toLowerCase()} ${token}`]) {
            const params = new URLSearchParams({ q, types: 'work_item', limit: '20' });
            const response = await page.request.get(`${API.search}?${params.toString()}`);
            expect(response.status(), `GET search q="${q}"`).toBe(200);
            const body = (await response.json()) as {
              groups: Array<{ type: string; items: Array<{ id: string }> }>;
            };
            const found = body.groups.find((g) => g.type === 'work_item')?.items.map((i) => i.id);
            expect(found, `results for "${q}"`).toEqual(expect.arrayContaining(ids));
          }
        } finally {
          for (const id of ids) await deleteWorkItemViaApi(page, id);
        }
      });
    }
  });

  test.describe('X3: a company number is two taps from any phone screen', () => {
    test.beforeEach(({ testPrefix: _testPrefix }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'Phone only');
    });

    for (const id of PAGE_IDS) {
      test(`X3a (${id}): the search button is reachable`, async ({ page }) => {
        const search = new CommandSearchPanel(page);
        await page.goto(PATHS[id]!());

        if (id === 'photoSpot') {
          // The phone photo viewer is full screen (#2226): the shell bars are not rendered, Back
          // leads to Photos, whose top bar has the search button.
          const back = page.getByTestId('spot-viewer-back');
          await expect(back).toBeVisible();
          await expect(search.topBarButton).toHaveCount(0);
          await back.click();
          await expect(page).toHaveURL((u) => u.pathname === routeUrl('photos'));
        }

        await expect(search.topBarButton).toBeVisible();
        const box = await search.topBarButton.boundingBox();
        const viewport = page.viewportSize();
        expect(box, 'search button box').not.toBeNull();
        expect(viewport, 'viewport').not.toBeNull();
        expect(box!.width, 'width').toBeGreaterThanOrEqual(44);
        expect(box!.height, 'height').toBeGreaterThanOrEqual(44);
        expect(box!.x, 'left').toBeGreaterThanOrEqual(0);
        expect(box!.y, 'top').toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, 'right').toBeLessThanOrEqual(viewport!.width);
        expect(box!.y + box!.height, 'bottom').toBeLessThanOrEqual(viewport!.height);
      });
    }

    test('X3b: from a task detail, tap Search and the company Call link is already there', async ({
      page,
    }) => {
      const search = new CommandSearchPanel(page);
      await page.goto(routeUrl('workItem', { id: seed.workItemId }));
      await expect(page.getByRole('heading', { level: 1, name: NAMES.task })).toBeVisible();

      // Tap 1: the search button; then type the company's name
      await search.topBarButton.tap();
      await search.waitForOpen();
      await search.search(NAMES.company);

      // Tap 2 would be the Call link itself: it is visible, tall enough and on screen
      const call = search.call(seed.vendorId);
      await expect(call).toBeVisible();
      await expect(call).toHaveAttribute('href', `tel:${PHONE.replace(/-/g, '')}`);
      const box = await call.boundingBox();
      const viewport = page.viewportSize();
      expect(box, 'Call link box').not.toBeNull();
      expect(box!.height, 'Call link height').toBeGreaterThanOrEqual(44);
      expect(box!.y, 'top').toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height, 'bottom').toBeLessThanOrEqual(viewport!.height);
    });
  });

  test.describe('X4: one primary button and one search field per page', () => {
    for (const id of PAGE_IDS.filter((p) => !DIALOG_ROUTE_IDS.includes(p))) {
      test(`X4 (${id})`, async ({ page }) => {
        await page.goto(PATHS[id]!());
        await expect(page.getByRole('main')).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        // Let loading placeholders finish so late header actions are counted
        await expect(page.locator('main [aria-busy="true"], main [class*="skeleton"]')).toHaveCount(
          0,
        );

        const found = await page.evaluate(() => {
          const visible = (el: Element): boolean =>
            el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
          const outsideDialogs = (el: Element): boolean =>
            el.closest('[role="dialog"], [role="alertdialog"]') === null;
          const describe = (el: Element): string => {
            const text = (el.getAttribute('aria-label') ?? el.textContent ?? '')
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 40);
            return `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}" testid="${
              el.getAttribute('data-testid') ?? ''
            }"> ${text}`;
          };
          const pick = (selector: string): string[] =>
            Array.from(document.querySelectorAll(`main ${selector}`))
              .filter((el) => visible(el) && outsideDialogs(el))
              .map(describe);
          return {
            primaries: pick('[class*="btnPrimary"]'),
            otherPrimaries: pick(
              '[class*="primaryButton"], [class*="primaryAction"]:is(button, a)',
            ),
            searches: pick('[data-page-search], input[type="search"]'),
          };
        });

        expect
          .soft(found.primaries.length, `primary buttons on ${id}: ${found.primaries.join(' | ')}`)
          .toBeLessThanOrEqual(1);
        expect
          .soft(found.searches.length, `search fields on ${id}: ${found.searches.join(' | ')}`)
          .toBeLessThanOrEqual(1);
        if (found.otherPrimaries.length > 0) {
          test.info().annotations.push({
            type: 'other-primary-classes',
            description: found.otherPrimaries.join(' | '),
          });
        }
      });
    }
  });
});
