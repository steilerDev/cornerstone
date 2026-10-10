/**
 * E2E page identity for Tasks, Purchases and Milestones (Story #2202 / EPIC-21, D-11)
 *
 * Every page states what it is: one h1, a browser-tab title `<page or object> · <section> ·
 * <house name>`, a breadcrumb trail of parents only, and one origin-aware "Back to <origin>"
 * link that replaces the old swapping back / "To Schedule" buttons.
 *
 * Scenarios:
 * - E1  (AC1/AC2) h1 and exact tab title for every route of the page table
 * - E2  (AC2)     renaming a task inline updates the tab title without a reload
 *                 (the German title/h1 check lives in i18n/i18n.spec.ts, which owns a
 *                 dedicated user: the locale is a server-side preference)
 * - E3  (AC3)     breadcrumbs are parents only; list/view pages have none
 * - E4  (AC4)     Back from a task opened in the Gantt returns to the exact Schedule URL
 * - E5  (AC4/6)   Back from a task / purchase / milestone opened in the Calendar returns to
 *                 the exact Calendar URL (calendar purchases pass origin, milestones open
 *                 their page)
 * - E6  (AC4)     no Back from the parent list
 * - E7  (AC4)     object origin ("Back to <milestone>"), survives a reload, absent on a
 *                 fresh navigation; Home origin from a dashboard card
 * - E8  (AC5)     filters and tab switches replace history; nothing pushes on mount
 * - E9  (phone)   one visible element in the breadcrumb row, 44px touch target
 * - E10 (D-11)    /schedule?view=calendar lands on /schedule/calendar in one replace
 * - E11           create-flow origin: Back to Schedule survives create; Back never returns
 *                 to the empty form
 *
 * Projects: E1-E8, E10, E11 run on desktop; E9 runs on mobile; tablet is skipped (the logic is
 * viewport independent, the responsive part is E9).
 *
 * Data: synthetic names created through the API, removed in afterAll. The E2E database is
 * shared and settings-manage.spec.ts sets/clears the house name concurrently, so where the exact
 * title matters `GET /api/settings` is mocked with a complete HouseholdSettingsResponse.
 * No users are created (login rate limit).
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createHouseholdItemViaApi,
  createMilestoneViaApi,
  createWorkItemViaApi,
  deleteHouseholdItemViaApi,
  deleteMilestoneViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { installRouteLog, readRouteLog } from '../../fixtures/routeLog.js';
import { ROUTES } from '../../fixtures/testData.js';
import { BreadcrumbsBar } from '../../pages/BreadcrumbsBar.js';
import { HouseholdItemsPage } from '../../pages/HouseholdItemsPage.js';
import { TimelinePage } from '../../pages/TimelinePage.js';
import { WorkItemCreatePage } from '../../pages/WorkItemCreatePage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';

const HOUSE = 'Synthetic House 2202';

const runId = Date.now().toString(36);
const NAMES = {
  task: `PI task ${runId}`,
  purchase: `PI purchase ${runId}`,
  milestone: `PI milestone ${runId}`,
  renameFrom: `PI rename from ${runId}`,
  renameTo: `PI rename to ${runId}`,
  created: `PI created ${runId}`,
};

const seed = { workItemId: '', householdItemId: '', milestoneId: 0 };

/** Today as YYYY-MM-DD (the same convention the other calendar specs use). */
const today = new Date().toISOString().slice(0, 10);

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

function onProject(...names: string[]): boolean {
  return names.includes(test.info().project.name);
}

/** Pathname + one search param of the current URL, for exact "same page again" checks. */
function locationOf(page: Page): { pathname: string; search: URLSearchParams } {
  const url = new URL(page.url());
  return { pathname: url.pathname, search: url.searchParams };
}

test.describe('Page identity: Tasks, Purchases, Milestones (#2202)', () => {
  test.beforeAll(async ({ browser }) => {
    if (!onProject('desktop', 'mobile')) return;
    const context = await browser.newContext({ storageState: 'test-results/.auth/admin.json' });
    const page = await context.newPage();
    try {
      seed.workItemId = await createWorkItemViaApi(page, {
        title: NAMES.task,
        startDate: today,
        endDate: today,
      });
      seed.householdItemId = await createHouseholdItemViaApi(page, {
        name: NAMES.purchase,
        earliestDeliveryDate: today,
        latestDeliveryDate: today,
        actualDeliveryDate: today,
      });
      seed.milestoneId = await createMilestoneViaApi(page, {
        title: NAMES.milestone,
        targetDate: today,
      });
      // The task is linked to the milestone: the milestone page then offers a task link (E7)
      const linked = await page.request.post(`/api/milestones/${seed.milestoneId}/work-items`, {
        data: { workItemId: seed.workItemId },
      });
      expect(linked.ok(), `link task to milestone failed: ${linked.status()}`).toBeTruthy();
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!onProject('desktop', 'mobile')) return;
    const context = await browser.newContext({ storageState: 'test-results/.auth/admin.json' });
    const page = await context.newPage();
    try {
      if (seed.milestoneId) await deleteMilestoneViaApi(page, seed.milestoneId);
      if (seed.householdItemId) await deleteHouseholdItemViaApi(page, seed.householdItemId);
      if (seed.workItemId) await deleteWorkItemViaApi(page, seed.workItemId);
    } finally {
      await context.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Desktop: E1-E8, E10, E11
  // ───────────────────────────────────────────────────────────────────────────

  test.describe('desktop', () => {
    test.beforeEach(() => {
      test.skip(!onProject('desktop'), 'logic is viewport independent; E9 covers the phone');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E1 — h1 and tab title for every route of the page table
    // ─────────────────────────────────────────────────────────────────────────

    interface IdentityCase {
      name: string;
      path: () => string;
      /** null: the h1 is intentionally not asserted (Home / Companies keep their own). */
      h1: (() => string) | string | null;
      title: (() => string) | string;
    }

    const CASES: IdentityCase[] = [
      {
        name: 'Tasks list',
        path: () => routeUrl('workItems'),
        h1: 'Tasks',
        title: `Tasks · ${HOUSE}`,
      },
      {
        name: 'New task',
        path: () => routeUrl('workItemNew'),
        h1: 'New task',
        title: `New task · Tasks · ${HOUSE}`,
      },
      {
        name: 'Task page',
        path: () => routeUrl('workItem', { id: seed.workItemId }),
        h1: () => NAMES.task,
        title: () => `${NAMES.task} · Tasks · ${HOUSE}`,
      },
      {
        name: 'Purchases list',
        path: () => routeUrl('householdItems'),
        h1: 'Purchases',
        title: `Purchases · ${HOUSE}`,
      },
      {
        name: 'New purchase',
        path: () => routeUrl('householdItemNew'),
        h1: 'New purchase',
        title: `New purchase · Purchases · ${HOUSE}`,
      },
      {
        name: 'Purchase page',
        path: () => routeUrl('householdItem', { id: seed.householdItemId }),
        h1: () => NAMES.purchase,
        title: () => `${NAMES.purchase} · Purchases · ${HOUSE}`,
      },
      {
        name: 'Edit purchase',
        path: () => routeUrl('householdItemEdit', { id: seed.householdItemId }),
        h1: 'Edit purchase',
        title: `Edit purchase · Purchases · ${HOUSE}`,
      },
      {
        name: 'Milestones list',
        path: () => routeUrl('milestones'),
        h1: 'Milestones',
        title: `Milestones · Tasks · ${HOUSE}`,
      },
      {
        name: 'New milestone',
        path: () => routeUrl('milestoneNew'),
        h1: 'New milestone',
        title: `New milestone · Tasks · ${HOUSE}`,
      },
      {
        name: 'Milestone page',
        path: () => routeUrl('milestone', { id: seed.milestoneId }),
        h1: () => NAMES.milestone,
        title: () => `${NAMES.milestone} · Tasks · ${HOUSE}`,
      },
      {
        name: 'Schedule (Gantt)',
        path: () => routeUrl('scheduleGantt'),
        h1: 'Schedule',
        title: `Schedule · Tasks · ${HOUSE}`,
      },
      {
        name: 'Calendar',
        path: () => routeUrl('scheduleCalendar'),
        h1: 'Calendar',
        title: `Calendar · Tasks · ${HOUSE}`,
      },
      {
        name: 'Home (title only; its h1 is owned by #2230)',
        path: () => ROUTES.home,
        h1: null,
        title: `Home · ${HOUSE}`,
      },
      {
        name: 'Companies (title only; its h1 is owned by #2213)',
        path: () => ROUTES.settingsVendors,
        h1: null,
        title: `Companies · ${HOUSE}`,
      },
    ];

    for (const c of CASES) {
      test(`E1: ${c.name} has the right h1 and tab title`, async ({ page }) => {
        await mockHouseName(page);
        await page.goto(c.path());

        const h1 = typeof c.h1 === 'function' ? c.h1() : c.h1;
        const title = typeof c.title === 'function' ? c.title() : c.title;

        if (h1 !== null) {
          const headings = page.getByRole('heading', { level: 1 });
          await expect(headings).toHaveCount(1);
          await expect(headings).toHaveText(h1);
        }
        await expect(page).toHaveTitle(title);
      });
    }

    test('E1: not-found pages keep the typed h1 and a section title', async ({ page }) => {
      await mockHouseName(page);

      await page.goto(routeUrl('workItem', { id: 'pi-missing-task' }));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Task not found');
      await expect(page).toHaveTitle(`Task not found · Tasks · ${HOUSE}`);

      await page.goto(routeUrl('householdItem', { id: 'pi-missing-purchase' }));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Purchase not found');
      await expect(page).toHaveTitle(`Purchase not found · Purchases · ${HOUSE}`);

      await page.goto(routeUrl('milestone', { id: 999999999 }));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Milestone not found');
      await expect(page).toHaveTitle(`Milestone not found · Tasks · ${HOUSE}`);
    });

    test('E1: without a house name the title falls back to the product name', async ({ page }) => {
      await page.route('**/api/settings', async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ settings: { householdName: null, householdAddress: null } }),
        });
      });
      await page.goto(routeUrl('workItems'));
      await expect(page).toHaveTitle('Tasks · Cornerstone');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E2 — the title follows a rename
    // ─────────────────────────────────────────────────────────────────────────

    test('E2: renaming a task inline updates the h1 and the tab title without a reload', async ({
      page,
    }) => {
      let renameId: string | null = null;
      try {
        renameId = await createWorkItemViaApi(page, { title: NAMES.renameFrom });
        await mockHouseName(page);
        const detail = new WorkItemDetailPage(page);
        await detail.goto(renameId);
        await expect(page).toHaveTitle(`${NAMES.renameFrom} · Tasks · ${HOUSE}`);

        await detail.heading.click();
        const titleInput = page.locator('input[class*="titleInput"]');
        await titleInput.fill(NAMES.renameTo);
        await titleInput.press('Enter');

        await expect(page.getByRole('heading', { level: 1 })).toHaveText(NAMES.renameTo);
        await expect(page).toHaveTitle(`${NAMES.renameTo} · Tasks · ${HOUSE}`);
      } finally {
        if (renameId) await deleteWorkItemViaApi(page, renameId);
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E3 — breadcrumbs: parents only
    // ─────────────────────────────────────────────────────────────────────────

    test('E3: a task page shows the "Tasks" parent and never its own name', async ({ page }) => {
      const bc = new BreadcrumbsBar(page);
      await page.goto(routeUrl('workItem', { id: seed.workItemId }));

      await expect(bc.nav).toBeVisible();
      await bc.expectTrail(['Tasks']);
      await expect(bc.nav).not.toContainText(NAMES.task);

      await bc.trailLink('Tasks').click();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('workItems'));
    });

    test('E3: a purchase page shows "Purchases" and never its own name', async ({ page }) => {
      const bc = new BreadcrumbsBar(page);
      await page.goto(routeUrl('householdItem', { id: seed.householdItemId }));

      await bc.expectTrail(['Purchases']);
      await expect(bc.nav).not.toContainText(NAMES.purchase);
    });

    test('E3: a milestone page shows "Tasks" then "Milestones", in that order', async ({
      page,
    }) => {
      const bc = new BreadcrumbsBar(page);
      await page.goto(routeUrl('milestone', { id: seed.milestoneId }));

      await bc.expectTrail(['Tasks', 'Milestones']);
      await expect(bc.nav).not.toContainText(NAMES.milestone);

      await bc.trailLink('Milestones').click();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('milestones'));
    });

    test('E3: the edit-purchase trail ends in the purchase name', async ({ page }) => {
      const bc = new BreadcrumbsBar(page);
      await page.goto(routeUrl('householdItemEdit', { id: seed.householdItemId }));

      await bc.expectTrail(['Purchases', NAMES.purchase]);

      await bc.trailLink(NAMES.purchase).click();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('householdItem', { id: seed.householdItemId }),
      );
    });

    test('E3: the create pages show their parents', async ({ page }) => {
      const bc = new BreadcrumbsBar(page);

      await page.goto(routeUrl('workItemNew'));
      await bc.expectTrail(['Tasks']);

      await page.goto(routeUrl('householdItemNew'));
      await bc.expectTrail(['Purchases']);

      await page.goto(routeUrl('milestoneNew'));
      await bc.expectTrail(['Tasks', 'Milestones']);
    });

    for (const [label, route] of [
      ['Tasks list', () => routeUrl('workItems')],
      ['Purchases list', () => routeUrl('householdItems')],
      ['Milestones list', () => routeUrl('milestones')],
      ['Schedule', () => routeUrl('scheduleGantt')],
      ['Calendar', () => routeUrl('scheduleCalendar')],
    ] as const) {
      test(`E3: ${label} is a view, so it has no trail and no Back`, async ({ page }) => {
        const bc = new BreadcrumbsBar(page);
        await page.goto(route());
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        await bc.expectNoTrail();
        await bc.expectNoBack();
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // E4 — Back to the Schedule
    // ─────────────────────────────────────────────────────────────────────────

    test('E4: a task opened from the Gantt offers "Back to Schedule" and returns to the exact URL', async ({
      page,
    }) => {
      const timeline = new TimelinePage(page);
      const bc = new BreadcrumbsBar(page);
      const startPath = `${routeUrl('scheduleGantt')}?filter=work-items,household-items`;

      await page.goto(startPath);
      await timeline.waitForLoaded();
      const before = locationOf(page);
      expect(before.search.get('filter')).toBe('work-items,household-items');

      const row = timeline.ganttSidebarRow(seed.workItemId);
      await row.waitFor({ state: 'visible' });
      await row.click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('workItem', { id: seed.workItemId }),
      );
      await bc.expectBack('Schedule');
      await bc.expectTrail(['Tasks']);

      await bc.backLink.click();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === before.pathname &&
          url.searchParams.get('filter') === 'work-items,household-items',
      );
      await expect(timeline.heading).toBeVisible();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E5 — Back to the Calendar (tasks, purchases and milestones)
    // ─────────────────────────────────────────────────────────────────────────

    const CALENDAR_START = `${routeUrl('scheduleCalendar')}?calendarMode=week`;

    async function expectBackOnCalendar(page: Page): Promise<void> {
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === routeUrl('scheduleCalendar') &&
          url.searchParams.get('calendarMode') === 'week',
      );
      await expect(
        page.getByRole('heading', { level: 1, name: 'Calendar', exact: true }),
      ).toBeVisible();
    }

    test('E5: a purchase opened from the Calendar offers "Back to Calendar" (D-11)', async ({
      page,
    }) => {
      const timeline = new TimelinePage(page);
      const bc = new BreadcrumbsBar(page);

      await page.goto(CALENDAR_START);
      await timeline.calendarView.waitFor({ state: 'visible' });

      const chip = timeline.calendarPurchases.filter({ hasText: NAMES.purchase }).first();
      await expect(chip).toBeVisible();
      await chip.click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('householdItem', { id: seed.householdItemId }),
      );
      await bc.expectBack('Calendar');
      await bc.expectTrail(['Purchases']);

      await bc.backLink.click();
      await expectBackOnCalendar(page);
    });

    test('E5: a task opened from the Calendar offers "Back to Calendar"', async ({ page }) => {
      const timeline = new TimelinePage(page);
      const bc = new BreadcrumbsBar(page);

      await page.goto(CALENDAR_START);
      await timeline.calendarView.waitFor({ state: 'visible' });

      const segment = timeline.calendarItemByTitle(NAMES.task).first();
      await expect(segment).toBeVisible();
      await segment.click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('workItem', { id: seed.workItemId }),
      );
      await bc.expectBack('Calendar');

      await bc.backLink.click();
      await expectBackOnCalendar(page);
    });

    test('E5: a milestone opened from the Calendar opens its page with trail and Back', async ({
      page,
    }) => {
      const timeline = new TimelinePage(page);
      const bc = new BreadcrumbsBar(page);

      await page.goto(CALENDAR_START);
      await timeline.calendarView.waitFor({ state: 'visible' });

      const marker = timeline.calendarMilestones.filter({ hasText: NAMES.milestone }).first();
      await expect(marker).toBeVisible();
      await marker.click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('milestone', { id: seed.milestoneId }),
      );
      await bc.expectTrail(['Tasks', 'Milestones']);
      await bc.expectBack('Calendar');

      await bc.backLink.click();
      await expectBackOnCalendar(page);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E6 — no Back from the parent list
    // ─────────────────────────────────────────────────────────────────────────

    test('E6: a task opened from the Tasks list has no Back link, only the "Tasks" trail', async ({
      page,
    }) => {
      const list = new WorkItemsPage(page);
      const bc = new BreadcrumbsBar(page);

      await page.goto(`${routeUrl('workItems')}?q=${encodeURIComponent(NAMES.task)}`);
      await list.waitForLoaded();
      await list.workItemRow(NAMES.task).click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('workItem', { id: seed.workItemId }),
      );
      await bc.expectTrail(['Tasks']);
      await bc.expectNoBack();
    });

    test('E6: a purchase opened from the Purchases list has no Back link', async ({ page }) => {
      const list = new HouseholdItemsPage(page);
      const bc = new BreadcrumbsBar(page);

      await page.goto(`${routeUrl('householdItems')}?q=${encodeURIComponent(NAMES.purchase)}`);
      await list.heading.waitFor({ state: 'visible' });
      await page.getByText(NAMES.purchase).first().click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('householdItem', { id: seed.householdItemId }),
      );
      await bc.expectTrail(['Purchases']);
      await bc.expectNoBack();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E7 — object origin, reload, fresh navigation, Home
    // ─────────────────────────────────────────────────────────────────────────

    test('E7: a task opened from a milestone offers "Back to <milestone>", kept on reload and gone on a fresh visit', async ({
      page,
    }) => {
      const bc = new BreadcrumbsBar(page);

      await page.goto(routeUrl('milestone', { id: seed.milestoneId }));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(NAMES.milestone);

      await page.getByRole('main').getByRole('link', { name: NAMES.task }).first().click();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('workItem', { id: seed.workItemId }),
      );
      await bc.expectBack(NAMES.milestone);

      // History state survives a reload ...
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(NAMES.task);
      await bc.expectBack(NAMES.milestone);

      // ... a fresh navigation (a copied link) has no origin
      await page.goto(page.url());
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(NAMES.task);
      await bc.expectNoBack();
      await bc.expectTrail(['Tasks']);
    });

    test('E7: a milestone opened from Home offers "Back to Home"', async ({ page }) => {
      const bc = new BreadcrumbsBar(page);

      await page.goto(ROUTES.home);
      const card = page.getByTestId('milestone-row').filter({ hasText: NAMES.milestone });
      await page
        .getByTestId('milestone-row')
        .first()
        .or(page.getByTestId('milestone-empty'))
        .waitFor({ state: 'visible' });
      test.skip(
        (await card.count()) === 0,
        'the seeded milestone is not among the dashboard upcoming milestones (shared database)',
      );

      await card.getByRole('link').first().click();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('milestone', { id: seed.milestoneId }),
      );
      await bc.expectBack('Home');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E8 — history: filters and tabs replace, nothing pushes on mount
    // ─────────────────────────────────────────────────────────────────────────

    test('E8: searching the Tasks list replaces the URL and never pushes', async ({ page }) => {
      const list = new WorkItemsPage(page);
      await installRouteLog(page);

      await page.goto(routeUrl('workItems'));
      await list.waitForLoaded();
      await list.search(NAMES.task);

      const log = await readRouteLog(page);
      expect(log.filter((entry) => entry.kind === 'pushState')).toEqual([]);
      expect(log.filter((entry) => entry.kind === 'replaceState').length).toBeGreaterThan(0);
    });

    test('E8: toggling a Schedule entity filter replaces the URL and never pushes', async ({
      page,
    }) => {
      const timeline = new TimelinePage(page);
      await installRouteLog(page);

      await page.goto(routeUrl('scheduleGantt'));
      await timeline.waitForLoaded();
      await page.getByTestId('entity-filter-milestones').click();
      await expect(page).toHaveURL((url) => url.searchParams.has('filter'));

      const log = await readRouteLog(page);
      expect(log.filter((entry) => entry.kind === 'pushState')).toEqual([]);
      expect(log.filter((entry) => entry.kind === 'replaceState').length).toBeGreaterThan(0);
    });

    const MOUNT_CASES: Array<[string, () => string]> = [
      ['a task page', () => routeUrl('workItem', { id: seed.workItemId })],
      ['a purchase page', () => routeUrl('householdItem', { id: seed.householdItemId })],
      ['a milestone page', () => routeUrl('milestone', { id: seed.milestoneId })],
      ['the Gantt', () => routeUrl('scheduleGantt')],
      ['the Calendar', () => routeUrl('scheduleCalendar')],
    ];
    for (const [label, route] of MOUNT_CASES) {
      test(`E8: opening ${label} pushes nothing after load`, async ({ page }) => {
        await installRouteLog(page);
        await page.goto(route());
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.waitForLoadState('networkidle');

        const log = await readRouteLog(page);
        expect(log.filter((entry) => entry.kind === 'pushState')).toEqual([]);
      });
    }

    test('E8: switching Schedule to Calendar replaces, so Back leaves the Schedule entirely', async ({
      page,
    }) => {
      const timeline = new TimelinePage(page);
      await installRouteLog(page);

      await page.goto(ROUTES.home);
      await expect(page).toHaveURL((url) => url.pathname === ROUTES.home);

      await page.goto(routeUrl('scheduleGantt'));
      await timeline.waitForLoaded();
      await timeline.calendarViewButton.click();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('scheduleCalendar'));

      const log = await readRouteLog(page);
      expect(log.filter((entry) => entry.kind === 'pushState')).toEqual([]);
      expect(log.filter((entry) => entry.kind === 'replaceState').length).toBeGreaterThan(0);

      await page.goBack();
      await expect(page).toHaveURL((url) => url.pathname === ROUTES.home);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E10 — D-11 query map
    // ─────────────────────────────────────────────────────────────────────────

    test('E10: /schedule?view=calendar lands on /schedule/calendar in one replace', async ({
      page,
    }) => {
      await installRouteLog(page);
      await page.goto('/schedule?view=calendar');

      await expect(page).toHaveURL(/\/schedule\/calendar$/);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Calendar', exact: true }),
      ).toBeVisible();

      const log = await readRouteLog(page);
      const pathnames = log.map((entry) => new URL(entry.url).pathname);
      expect(log.filter((entry) => entry.kind === 'pushState')).toEqual([]);
      expect(log.filter((entry) => entry.kind === 'replaceState')).toHaveLength(1);
      expect(pathnames).not.toContain(routeUrl('scheduleGantt'));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // E11 — create flow keeps the origin and leaves no empty form behind
    // ─────────────────────────────────────────────────────────────────────────

    test('E11: a task created from the Schedule shows "Back to Schedule" and Back never returns to the empty form', async ({
      page,
    }) => {
      const timeline = new TimelinePage(page);
      const createPage = new WorkItemCreatePage(page);
      const bc = new BreadcrumbsBar(page);
      let createdId: string | null = null;

      try {
        await page.goto(routeUrl('scheduleGantt'));
        await timeline.waitForLoaded();
        await timeline.addButton.click();
        await page.getByTestId('timeline-add-work-item').click();

        await expect(createPage.heading).toBeVisible();
        await bc.expectBack('Schedule');
        await bc.expectTrail(['Tasks']);

        await createPage.fillTitle(NAMES.created);
        await createPage.submitButton.click();

        await expect(page).toHaveURL(/\/project\/work-items\/(?!new$)[^/]+$/);
        createdId = new URL(page.url()).pathname.split('/').pop() ?? null;
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(NAMES.created);
        await bc.expectBack('Schedule');

        await page.goBack();
        await expect(page).toHaveURL((url) => url.pathname === routeUrl('scheduleGantt'));
        await expect(timeline.heading).toBeVisible();
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Phone: E9
  // ───────────────────────────────────────────────────────────────────────────

  test.describe('phone', () => {
    test.beforeEach(() => {
      test.skip(!onProject('mobile'), 'phone rules only apply to the mobile project');
    });

    test('E9: with an origin the phone row shows one element: "Back to Calendar", 44px tall', async ({
      page,
    }) => {
      const timeline = new TimelinePage(page);
      const bc = new BreadcrumbsBar(page);

      await page.goto(`${routeUrl('scheduleCalendar')}?calendarMode=week`);
      await timeline.calendarView.waitFor({ state: 'visible' });
      const chip = timeline.calendarPurchases.filter({ hasText: NAMES.purchase }).first();
      await chip.scrollIntoViewIfNeeded();
      await chip.click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('householdItem', { id: seed.householdItemId }),
      );
      await bc.expectBack('Calendar');
      // The trail is not shown next to Back on a phone
      await expect(bc.nav).toBeHidden();
      await expect(bc.row.getByRole('link')).toHaveCount(1);

      const box = await bc.backLink.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    });

    test('E9: without an origin the phone row shows one element: "‹ Tasks", 44px tall', async ({
      page,
    }) => {
      const list = new WorkItemsPage(page);
      const bc = new BreadcrumbsBar(page);

      await page.goto(`${routeUrl('workItems')}?q=${encodeURIComponent(NAMES.task)}`);
      await list.waitForLoaded();
      await list.workItemRow(NAMES.task).click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('workItem', { id: seed.workItemId }),
      );
      await bc.expectNoBack();
      await expect(bc.row.getByRole('link')).toHaveCount(1);
      const link = bc.trailLink('Tasks');
      await expect(link).toBeVisible();
      await expect(link).toHaveText('‹Tasks');

      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    });

    test('E9: a two-level trail shows only the nearest parent on a phone', async ({ page }) => {
      const bc = new BreadcrumbsBar(page);
      await page.goto(routeUrl('milestone', { id: seed.milestoneId }));

      await bc.expectTrail(['Tasks', 'Milestones']);
      await expect(bc.trailLink('Milestones')).toBeVisible();
      await expect(bc.row.getByRole('link')).toHaveCount(1);
    });
  });
});
