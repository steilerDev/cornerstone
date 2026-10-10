/**
 * E2E phone and tablet shell (Story #2207 / EPIC-21, P1.2a)
 *
 * Below 1024px the shell is: a compact top bar (Back / "‹ parent" link, scrolled-past-heading
 * title, search), a bottom bar (Home, Site diary, New, Photos, More), the More sheet (sections
 * and the user block) and, on a section's views, the h1 as a title menu ("Tasks v") that lists
 * the section's views. The drawer, the floating menu button and the overlay are gone.
 *
 * Scenarios (all but S10 run below 1024px only; the tablet and mobile projects cover them):
 * - S1  (AC2, AC3) bar slots in order, label size, touch size, 64px row; Home current; New opens
 *                  /diary/new where Site diary (not New) is current
 * - S2  (AC6)      More is highlighted on a page that lives in the sheet (Tasks)
 * - S3  (AC4)      the sheet: closed = inert, hidden, no dialog role; open = rows in groups, user
 *                  block order, new-tab links, version; focus; Escape/backdrop/Close; a tap on a
 *                  row navigates and leaves the sheet closed
 * - S4  (AC2, AC4) theme and language inside the sheet; German labels still fit the bar
 * - S5             one Log out per viewport (sheet), with the sign-out request and /login
 * - S6  (AC1)      top bar: 56px, house name, Back / parent link, scrolled title, search, history
 *                  Back, landmarks
 * - S7  (AC5)      title menu: views, replace history, member sees Project setup and Account only
 * - S8  (AC6)      nothing is hidden under the bottom bar
 * - S9  (AC7)      tablets use the same shell, with a centred, width-capped sheet
 * - S10 (AC7)      the 1023/1024 boundary on every project
 * - S11            Keyboard shortcuts appears for a hardware keyboard and opens the help dialog
 *
 * The file uses the same `isolatedUserPerWorker` value as i18n.spec.ts and user-menu.spec.ts, so
 * it shares that worker's member user (theme and language are per-user server preferences) and
 * adds no user, no login and no extra worker group. Sign-out is mocked at the network layer so
 * the shared session survives; the real sign-out is covered by auth/login-logout.spec.ts.
 *
 * Pinch-zoom stays pinned by responsive/visual-defects.spec.ts; the on-screen keyboard hiding
 * the bar is unit-tested (Playwright cannot raise an on-screen keyboard).
 */

import { test, expect } from '../../fixtures/isolatedUser.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
import { ROUTES } from '../../fixtures/testData.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';

test.use({
  isolatedUserPerWorker: { emailPrefix: 'i18n-switch', displayName: 'E2E i18n User' },
});

test.describe.configure({ mode: 'serial' });

const LOG_OUT = /^(Log out|Abmelden)$/;

/** Restore the defaults this file may change (theme system, English), server side. */
async function resetPreferences(page: Page): Promise<void> {
  await page.request.patch('/api/users/me/preferences', {
    data: { key: 'theme', value: 'system' },
  });
  await page.request.patch('/api/users/me/preferences', {
    data: { key: 'locale', value: 'en' },
  });
}

/** Resolves when the next preference write has been answered (gate before a fresh page). */
function nextPreferenceSaved(page: Page) {
  return page.waitForResponse(
    (r) => r.url().includes('/api/users/me/preferences') && r.request().method() === 'PATCH',
  );
}

function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => window.history.length);
}

function hasSidewaysScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/** Add a tall block at the end of main so the page scrolls on any viewport. */
async function addScrollSpacer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.setAttribute('data-e2e-spacer', 'true');
    spacer.style.height = '3000px';
    document.querySelector('main')?.append(spacer);
  });
}

test.describe('Phone and tablet shell', { tag: '@responsive' }, () => {
  test.afterEach(async ({ page }) => {
    await resetPreferences(page);
  });

  test.describe('below 1024px', () => {
    test.beforeEach(({ page }) => {
      test.skip(
        (page.viewportSize()?.width ?? 0) >= 1024,
        'the bottom bar and More sheet exist below 1024px only; S10 covers the boundary',
      );
    });

    test('S1: the bar reads Home, Site diary, New, Photos, More; New opens /diary/new', async ({
      page,
    }) => {
      const appShell = new AppShellPage(page);
      await page.goto(ROUTES.home);
      await expect(appShell.bottomBar).toBeVisible();

      await expect(appShell.bottomBar.locator('[data-testid^="bottom-bar-"]')).toHaveText([
        'Home',
        'Site diary',
        'New',
        'Photos',
        'More',
      ]);

      // Every label is visible at 12px and every slot is a 44px touch target
      for (const [id, label] of [
        ['home', 'Home'],
        ['diary', 'Site diary'],
        ['new', 'New'],
        ['photos', 'Photos'],
        ['more', 'More'],
      ] as const) {
        const slot = appShell.bottomBarSlot(id);
        const text = slot.getByText(label, { exact: true });
        await expect(text).toBeVisible();
        await expect(text).toHaveCSS('font-size', '12px');
        const box = await slot.boundingBox();
        expect(box, `${id} slot has a box`).not.toBeNull();
        expect(box?.width ?? 0, `${id} slot width`).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0, `${id} slot height`).toBeGreaterThanOrEqual(44);
      }

      // The bar's content row is 64px
      const row = await appShell.bottomBar.locator('ul').boundingBox();
      expect(row?.height).toBe(64);

      // On Home, Home is the page's entry
      await expect(appShell.bottomBarSlot('home')).toHaveAttribute('aria-current', 'page');

      // New opens the diary entry form; there Site diary (not New) is the current slot
      await appShell.bottomBarSlot('new').click();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('diaryEntryNew'));
      await expect(appShell.bottomBarSlot('diary')).toHaveAttribute('aria-current', 'page');
      await expect(appShell.bottomBarSlot('new')).not.toHaveAttribute('aria-current', /.+/);
    });

    test('S2: More is highlighted on a page that lives in the sheet', async ({ page }) => {
      const appShell = new AppShellPage(page);
      await page.goto(routeUrl('workItems'));
      await expect(
        page.getByRole('heading', { level: 1, name: 'Tasks', exact: true }),
      ).toBeVisible();

      await expect(appShell.moreButton).toHaveAttribute('aria-current', 'true');
      await expect(appShell.moreSheetRow('tasks')).toHaveAttribute('aria-current', 'page');
      // Exactly one entry of the shell is the page's entry, and none is in the bar
      await expect(appShell.activeEntries).toHaveCount(1);
      await expect(appShell.bottomBar.locator('[aria-current="page"]')).toHaveCount(0);
    });

    test('S3: the closed sheet is inert, hidden and has no dialog role', async ({ page }) => {
      const appShell = new AppShellPage(page);
      await page.goto(ROUTES.home);
      await expect(appShell.bottomBar).toBeVisible();

      await expect(appShell.moreSheet).toHaveAttribute('data-open', 'false');
      await expect(appShell.moreSheet).toHaveAttribute('inert', '');
      await expect(appShell.moreSheet).toBeHidden();
      await expect(appShell.moreSheet).not.toHaveAttribute('role', /.+/);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(appShell.moreButton).toHaveAttribute('aria-expanded', 'false');
    });

    test('S3: the open sheet lists the sections in groups and the user block in order', async ({
      page,
    }) => {
      const appShell = new AppShellPage(page);
      await page.goto(ROUTES.home);
      await expect(appShell.bottomBar).toBeVisible();
      await appShell.openMoreSheet();

      await expect(appShell.moreSheet).toHaveAttribute('role', 'dialog');
      await expect(appShell.moreSheet).not.toHaveAttribute('inert', /.*/);
      await expect(appShell.moreButton).toHaveAttribute('aria-expanded', 'true');

      // Areas, History (route-map stage planned) and Documents (Paperless) appear once served;
      // an empty group renders no list and no separator.
      await expect(appShell.moreSheet.locator('[data-testid^="more-sheet-section-"]')).toHaveText([
        'Tasks',
        'Purchases',
        'Money',
        'Companies',
        'Settings',
      ]);
      await expect(appShell.moreSheet.getByRole('navigation').getByRole('list')).toHaveCount(2);

      // User block, top to bottom: Account, Theme, Language, Help, About (GitHub), Log out
      const order = [
        'more-sheet-account',
        'more-sheet-theme-light',
        'more-sheet-language-en',
        'more-sheet-help',
        'more-sheet-about',
        'more-sheet-github',
        'more-sheet-logout',
      ];
      const tops: number[] = [];
      for (const id of order) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box, `${id} has a box`).not.toBeNull();
        tops.push(box?.y ?? 0);
      }
      expect(tops).toEqual([...tops].sort((a, b) => a - b));

      // Help and GitHub open in a new tab (never followed); the version is not a semver guess
      await expect(page.getByTestId('more-sheet-help')).toHaveAttribute('target', '_blank');
      await expect(page.getByTestId('more-sheet-github')).toHaveAttribute('target', '_blank');
      await expect(
        page.getByTestId('more-sheet-about').getByText(/^Cornerstone v\S+$/),
      ).toBeVisible();
      await expect(page.getByTestId('more-sheet-logout')).toHaveText('Log out');
    });

    test('S3: focus moves into the sheet and wraps; Escape, backdrop and Close dismiss it', async ({
      page,
    }) => {
      const appShell = new AppShellPage(page);
      await page.goto(ROUTES.home);
      await expect(appShell.bottomBar).toBeVisible();
      await appShell.openMoreSheet();

      // Focus lands on the first row; Shift+Tab reaches Close, and once more wraps to Log out
      await expect(appShell.moreSheetRow('tasks')).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(appShell.moreSheetClose).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(page.getByTestId('more-sheet-logout')).toBeFocused();

      // Escape closes and returns focus to More
      await page.keyboard.press('Escape');
      await expect(appShell.moreSheet).toHaveAttribute('data-open', 'false');
      await expect(appShell.moreButton).toBeFocused();

      // The backdrop closes it
      await appShell.openMoreSheet();
      await appShell.moreSheetBackdrop.click({ position: { x: 5, y: 5 } });
      await expect(appShell.moreSheet).toHaveAttribute('data-open', 'false');
      await expect(appShell.moreSheet).toBeHidden();

      // So does the Close button
      await appShell.openMoreSheet();
      await appShell.moreSheetClose.click();
      await expect(appShell.moreSheet).toHaveAttribute('data-open', 'false');
      await expect(appShell.moreButton).toBeFocused();
    });

    test('S3: tapping a row navigates and leaves the sheet closed and inert', async ({ page }) => {
      const appShell = new AppShellPage(page);
      await page.goto(ROUTES.home);
      await expect(appShell.bottomBar).toBeVisible();
      await appShell.openMoreSheet();

      await appShell.moreSheetRow('purchases').click();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('householdItems'));
      await expect(appShell.moreSheet).toHaveAttribute('data-open', 'false');
      await expect(appShell.moreSheet).toHaveAttribute('inert', '');
      await expect(appShell.moreSheet).toBeHidden();
      await expect(appShell.moreSheetRow('purchases')).toHaveAttribute('aria-current', 'page');
    });

    test('S4: Dark applies at once, keeps the sheet open and persists', async ({ page }) => {
      const appShell = new AppShellPage(page);
      await page.goto(ROUTES.home);
      await expect(appShell.bottomBar).toBeVisible();
      await appShell.openMoreSheet();
      await expect(appShell.themeOption('system')).toBeChecked();

      // Gate on the server write so the fresh page below cannot race it
      const saved = nextPreferenceSaved(page);
      await appShell.themeOption('dark').click();
      await saved;

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(appShell.moreSheet).toHaveAttribute('data-open', 'true');
      await expect(appShell.themeOption('dark')).toBeChecked();

      // Fresh visit: a new page in the same context (never a same-URL goto)
      const fresh = await page.context().newPage();
      try {
        await fresh.goto(ROUTES.home);
        await expect(fresh.locator('html')).toHaveAttribute('data-theme', 'dark');
      } finally {
        await fresh.close();
      }
    });

    test('S4: Deutsch relabels the bar and the long German label still fits its slot', async ({
      page,
    }) => {
      const appShell = new AppShellPage(page);
      await page.goto(ROUTES.home);
      await expect(appShell.bottomBar).toBeVisible();
      await appShell.openMoreSheet();
      await expect(appShell.languageOption('en')).toBeChecked();

      const saved = nextPreferenceSaved(page);
      await appShell.languageOption('de').click();
      await saved;
      await expect(appShell.languageOption('de')).toBeChecked();
      await expect(appShell.bottomBar.locator('[data-testid^="bottom-bar-"]')).toHaveText([
        'Start',
        'Bautagebuch',
        'Neu',
        'Fotos',
        'Mehr',
      ]);
      await appShell.closeMoreSheet();

      // The longest label is never truncated, at a phone and at a tablet width
      for (const width of [390, 810]) {
        await page.setViewportSize({ width, height: 900 });
        const slot = appShell.bottomBarSlot('diary');
        const label = slot.getByText('Bautagebuch', { exact: true });
        await expect(label).toBeVisible();
        await expect(label).toHaveText('Bautagebuch');
        await expect(label).not.toHaveCSS('text-overflow', 'ellipsis');
        const labelBox = await label.boundingBox();
        const slotBox = await slot.boundingBox();
        expect(
          labelBox?.width ?? Infinity,
          `label fits its slot at ${width}px`,
        ).toBeLessThanOrEqual((slotBox?.width ?? 0) + 0.5);
        expect(await hasSidewaysScroll(page), `no sideways scroll at ${width}px`).toBe(false);
      }
    });

    test('S5: the sheet holds the only Log out, and it signs out', async ({ page }) => {
      const appShell = new AppShellPage(page);

      // Mock the network layer only: the shared session must survive (login rate limit)
      const logoutCalls: string[] = [];
      await page.route(
        (url) => url.pathname === '/api/auth/logout',
        async (route) => {
          logoutCalls.push(route.request().method());
          await route.fulfill({ status: 204 });
        },
      );
      await page.route(
        (url) => url.pathname === routeUrl('login'),
        async (route) => {
          if (route.request().resourceType() !== 'document') {
            await route.fallback();
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<!doctype html><html lang="en"><title>Sign in</title><body>Sign in</body></html>',
          });
        },
      );

      await page.goto(ROUTES.home);
      await expect(appShell.bottomBar).toBeVisible();
      await expect(appShell.desktopUserMenuTrigger).toHaveCount(0);
      await expect(page.getByRole('button', { name: LOG_OUT })).toHaveCount(0);

      await appShell.openMoreSheet();
      await expect(
        page
          .getByRole('button', { name: LOG_OUT })
          .or(page.getByRole('menuitem', { name: LOG_OUT })),
      ).toHaveCount(1);

      await page.getByTestId('more-sheet-logout').click();
      await page.waitForURL((url) => url.pathname === routeUrl('login'));
      expect(logoutCalls).toEqual(['POST']);
    });

    test('S6: the compact top bar is 56px, shows the house name and a disabled search', async ({
      page,
    }) => {
      const appShell = new AppShellPage(page);
      await page.goto(routeUrl('workItems'));
      await expect(
        page.getByRole('heading', { level: 1, name: 'Tasks', exact: true }),
      ).toBeVisible();

      const bar = await appShell.topBar.boundingBox();
      expect(bar?.height).toBe(56);

      // The house name is the only text in the bar; the slot is empty on a view
      await expect(appShell.topBarHouseName).toBeVisible();
      await expect(appShell.topBarHouseName).not.toHaveText('');
      await expect(page.getByTestId('top-bar-slot')).toBeEmpty();
      await expect(page.getByTestId('top-bar-search')).toHaveAttribute('aria-disabled', 'true');
      await expect(appShell.topBarTitle).toHaveAttribute('data-visible', 'false');
    });

    test.describe('with a seeded task', () => {
      let taskId = '';
      let taskTitle = '';

      test.beforeEach(async ({ page, testPrefix }) => {
        taskTitle = `${testPrefix} Shell task ${Date.now().toString(36)}`;
        await page.goto(ROUTES.home);
        taskId = await createWorkItemViaApi(page, { title: taskTitle });
      });

      test.afterEach(async ({ page }) => {
        if (taskId) await deleteWorkItemViaApi(page, taskId);
        taskId = '';
      });

      test('S6: a task shows the parent link, the title after scrolling, and the landmarks', async ({
        page,
      }) => {
        // Fresh visit in a new page of the same context (never a same-URL goto)
        const fresh = await page.context().newPage();
        try {
          const freshShell = new AppShellPage(fresh);
          await fresh.goto(routeUrl('workItem', { id: taskId }));
          await expect(fresh.getByRole('heading', { level: 1 })).toContainText(taskTitle);

          const parent = fresh.getByTestId('breadcrumbs-parent');
          await expect(parent).toBeVisible();
          await expect(parent).toHaveAccessibleName('Back to Tasks');
          await expect(parent).toHaveText('‹Tasks');

          // The title appears only once the h1 has scrolled under the bar
          await expect(freshShell.topBarTitle).toHaveAttribute('data-visible', 'false');
          await expect(freshShell.topBarTitle).toHaveText('');
          await addScrollSpacer(fresh);
          await fresh.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await expect(freshShell.topBarTitle).toHaveAttribute('data-visible', 'true');
          await expect(freshShell.topBarTitle).toContainText(taskTitle);

          // One banner, one main navigation, one "You are here"
          await expect(fresh.getByRole('banner')).toHaveCount(1);
          await expect(
            fresh.getByRole('navigation', { name: 'Main navigation', exact: true }),
          ).toHaveCount(1);
          await expect(
            fresh.getByRole('navigation', { name: 'You are here', exact: true }),
          ).toHaveCount(1);
        } finally {
          await fresh.close();
        }
      });

      test('S6: Back returns to the list through history, not by pushing a new entry', async ({
        page,
      }) => {
        const tasks = new WorkItemsPage(page);
        await page.goto(routeUrl('workItems'));
        await tasks.waitForLoaded();
        await tasks.search(taskTitle);

        // List -> task is an in-app click, so the previous in-app path is the list
        await page
          .locator('main')
          .getByRole('link', { name: taskTitle })
          .filter({ visible: true })
          .click();
        await expect(page).toHaveURL(
          (url) => url.pathname === routeUrl('workItem', { id: taskId }),
        );
        const parent = page.getByTestId('breadcrumbs-parent');
        await expect(parent).toHaveAccessibleName('Back to Tasks');
        const onTask = await historyLength(page);

        await parent.click();
        await expect(page).toHaveURL((url) => url.pathname === routeUrl('workItems'));
        expect(await historyLength(page), 'Back must not push a history entry').toBe(onTask);

        // The task is still ahead of us in history
        await page.goForward();
        await expect(page).toHaveURL(
          (url) => url.pathname === routeUrl('workItem', { id: taskId }),
        );
      });

      test('S7: a task detail h1 is plain text, not a menu', async ({ page }) => {
        await page.goto(routeUrl('workItem', { id: taskId }));
        const heading = page.getByRole('heading', { level: 1 });
        await expect(heading).toContainText(taskTitle);
        await expect(heading.getByTestId('view-menu-trigger')).toHaveCount(0);
      });
    });

    test('S6: Back from a Money view goes to Money, not to Home (history rule)', async ({
      page,
    }) => {
      const appShell = new AppShellPage(page);
      await page.goto(ROUTES.home);
      await expect(appShell.bottomBar).toBeVisible();

      await appShell.openSection('money');
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('budgetOverview'));
      await appShell.openView('budgetSources');
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('budgetSources'));

      await page.getByTestId('breadcrumbs-parent').click();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('budgetOverview'));
    });

    test('S7: the Schedule h1 is a menu of the Tasks views; picking one replaces history', async ({
      page,
    }) => {
      const appShell = new AppShellPage(page);
      await page.goto(routeUrl('scheduleGantt'));
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading.getByTestId('view-menu-trigger')).toBeVisible();

      await appShell.revealViews();
      await expect(appShell.viewMenu.getByRole('menuitem')).toHaveCount(4);
      await expect(appShell.viewMenu.getByRole('menuitem')).toContainText([
        'Tasks',
        'Schedule',
        'Calendar',
        'Milestones',
      ]);
      await expect(appShell.viewLink('scheduleGantt')).toHaveAttribute('aria-current', 'page');
      expect(await hasSidewaysScroll(page)).toBe(false);

      const before = await historyLength(page);
      await appShell.viewLink('scheduleCalendar').click();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('scheduleCalendar'));
      await expect(appShell.viewMenu).toBeHidden();
      expect(await historyLength(page), 'a view switch replaces the entry').toBe(before);
    });

    test('S7 (D-23): a member sees Project setup and Account only in Settings', async ({
      page,
    }) => {
      const appShell = new AppShellPage(page);
      await page.goto(ROUTES.profile);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await appShell.revealViews();
      await expect(appShell.viewMenu.getByRole('menuitem')).toHaveCount(2);
      await expect(appShell.viewMenu.getByRole('menuitem')).toContainText([
        'Project setup',
        'Account',
      ]);
      await expect(appShell.viewLink('settingsUsers')).toHaveCount(0);
      await expect(appShell.viewLink('settingsBackups')).toHaveCount(0);
    });

    test('S8: nothing sits under the bottom bar when scrolled to the bottom', async ({ page }) => {
      const appShell = new AppShellPage(page);
      const tasks = new WorkItemsPage(page);
      await page.goto(routeUrl('workItems'));
      await tasks.waitForLoaded();
      await expect(appShell.bottomBar).toBeVisible();

      await addScrollSpacer(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

      // main's wrapper reserves the bar's 64px
      await expect(page.locator('main').locator('xpath=..')).toHaveCSS('padding-bottom', '64px');

      const main = await page.locator('main').boundingBox();
      const bar = await appShell.bottomBar.boundingBox();
      expect(main, 'main has a box').not.toBeNull();
      expect(bar, 'bar has a box').not.toBeNull();
      const mainBottom = (main?.y ?? 0) + (main?.height ?? 0);
      expect(mainBottom).toBeLessThanOrEqual((bar?.y ?? 0) + 0.5);
    });

    test('S9: tablets use the same shell, with a centred sheet capped in width', async ({
      page,
    }) => {
      const appShell = new AppShellPage(page);
      await page.setViewportSize({ width: 810, height: 1080 });
      await page.goto(ROUTES.home);

      await expect(appShell.bottomBar).toBeVisible();
      await expect(page.locator('aside')).toHaveCount(0);

      // The five slots form a cluster of at most 640px
      const first = await appShell.bottomBarSlot('home').boundingBox();
      const last = await appShell.bottomBarSlot('more').boundingBox();
      const cluster = (last?.x ?? 0) + (last?.width ?? 0) - (first?.x ?? 0);
      expect(cluster).toBeLessThanOrEqual(640.5);

      await appShell.openMoreSheet();
      const sheet = await appShell.moreSheet.boundingBox();
      expect(sheet?.width ?? Infinity).toBeLessThanOrEqual(512.5);
      const centre = (sheet?.x ?? 0) + (sheet?.width ?? 0) / 2;
      expect(Math.abs(centre - 405)).toBeLessThanOrEqual(1);
    });

    test('S11: a hardware keyboard reveals Keyboard shortcuts, which closes the sheet first', async ({
      page,
    }) => {
      const appShell = new AppShellPage(page);
      await page.goto(ROUTES.home);
      await expect(appShell.bottomBar).toBeVisible();

      // A key pressed outside an editable field marks a physical keyboard
      await page.keyboard.press('Shift');
      await appShell.openMoreSheet();
      const shortcuts = page.getByTestId('more-sheet-shortcuts');
      await expect(shortcuts).toBeVisible();

      await shortcuts.click();
      await expect(appShell.moreSheet).toHaveAttribute('data-open', 'false');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toHaveCount(1);
      await expect(dialog).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(appShell.moreButton).toBeFocused();
    });
  });

  test('S10: the shell switches exactly at 1024px', async ({ page }) => {
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.home);

    // 1023px: bottom bar, no sidebar
    await page.setViewportSize({ width: 1023, height: 800 });
    await expect(appShell.bottomBar).toBeVisible();
    await expect(page.locator('aside')).toHaveCount(0);
    await expect(appShell.desktopUserMenuTrigger).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'Main navigation', exact: true }),
    ).toHaveCount(1);
    await expect(page.getByRole('banner')).toHaveCount(1);

    // 1024px: sidebar and avatar, no bottom bar
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.locator('aside')).toBeVisible();
    await expect(appShell.desktopUserMenuTrigger).toBeVisible();
    await expect(appShell.bottomBar).toHaveCount(0);
    await expect(appShell.moreSheet).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'Main navigation', exact: true }),
    ).toHaveCount(1);
    await expect(page.getByRole('banner')).toHaveCount(1);
  });
});
