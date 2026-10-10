/**
 * E2E desktop top bar (Story #2206 / EPIC-21, P1.1)
 *
 * From 1024px a sticky top bar holds the breadcrumb row (exactly one "You are here"), the
 * Search / New / bell placeholders and the user menu. Below 1024px the bar is hidden and the
 * sidebar footer keeps theme, Log out, version and GitHub until #2207.
 *
 * Scenarios:
 * - E1 (AC1)          bar contents on a task opened from the Schedule (so Back exists);
 *                     the trail leaves main; Home shows an empty slot in a 56px bar
 * - E2 (AC4, @resp.)  no button or link in the bar, the sidebar or the menu FAB paints the
 *                     primary colour, on desktop and with the drawer open on tablet/mobile
 * - E4 (AC3, @resp.)  one Log out per viewport: desktop = user menu only (sidebar footer is
 *                     display:none), tablet/mobile = drawer button only (no bar)
 * - E5 (AC5)          keyboard: Tab order through the bar, visible focus, menu-button pattern
 * - E6 (D1)           the bar stays at the top after scrolling; no document scroll on Schedule
 * - E7 (@resp.)       tablet/mobile: the bar is hidden and the trail renders inside main
 *
 * E3 (the user menu itself) lives in user-menu.spec.ts, which owns a dedicated member user.
 * The viewport-aware log-out helper (AppShellPage.logout) is covered by login-logout.spec.ts.
 *
 * Data: one synthetic task per test (testPrefix), removed in afterEach. No users, no logins.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
import { ROUTES } from '../../fixtures/testData.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { BreadcrumbsBar } from '../../pages/BreadcrumbsBar.js';
import { TimelinePage } from '../../pages/TimelinePage.js';

const today = new Date().toISOString().slice(0, 10);
const LOG_OUT = /^(Log out|Abmelden)$/;

function isDesktop(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 1024;
}

/** Every accessible element named "Log out" in the page (button in the sidebar, row in the menu). */
function logOutControls(page: Page) {
  return page
    .getByRole('button', { name: LOG_OUT })
    .or(page.getByRole('menuitem', { name: LOG_OUT }));
}

test.describe('Top bar (desktop)', () => {
  test.beforeEach(({ page }) => {
    test.skip(!isDesktop(page), 'the top bar exists from 1024px only; E4/E7 cover the rest');
  });

  test.describe('with a seeded task', () => {
    let taskId = '';
    let taskTitle = '';

    test.beforeEach(async ({ page, testPrefix }) => {
      taskTitle = `${testPrefix} TopBar task ${Date.now().toString(36)}`;
      await page.goto(ROUTES.home);
      taskId = await createWorkItemViaApi(page, {
        title: taskTitle,
        startDate: today,
        endDate: today,
      });
    });

    test.afterEach(async ({ page }) => {
      if (taskId) await deleteWorkItemViaApi(page, taskId);
      taskId = '';
    });

    /** Open the seeded task from the Gantt so the page offers "Back to Schedule". */
    async function openTaskFromSchedule(page: Page): Promise<void> {
      const timeline = new TimelinePage(page);
      await page.goto(routeUrl('scheduleGantt'));
      await timeline.waitForLoaded();
      const row = timeline.ganttSidebarRow(taskId);
      await row.waitFor({ state: 'visible' });
      await row.click();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('workItem', { id: taskId }));
    }

    test('E1: the bar holds the one breadcrumb row, Search, New, the bell and the avatar', async ({
      page,
    }) => {
      const appShell = new AppShellPage(page);
      const bc = new BreadcrumbsBar(page);
      await openTaskFromSchedule(page);

      const banner = page.getByRole('banner');
      await expect(banner).toHaveCount(1);
      await expect(banner).toBeVisible();

      // The row lives in the bar, with Back and the parents-only trail
      await expect(appShell.topBar.getByTestId('breadcrumbs')).toBeVisible();
      await bc.expectBack('Schedule');
      await bc.expectTrail(['Tasks']);
      await expect(page.locator('main').getByTestId('breadcrumbs')).toHaveCount(0);
      await expect(page.getByRole('navigation', { name: 'You are here' })).toHaveCount(1);

      // Search with its platform hint (Chromium on Linux)
      const search = banner.getByRole('button', { name: 'Search', exact: true });
      await expect(search).toBeVisible();
      await expect(search).toContainText('Search');
      await expect(search.locator('kbd')).toHaveText('Ctrl K');

      const newButton = banner.getByRole('button', { name: 'New', exact: true });
      const bell = banner.getByRole('button', { name: 'Needs attention', exact: true });
      await expect(newButton).toBeVisible();
      await expect(bell).toBeVisible();
      await expect(appShell.userMenuTrigger).toHaveAccessibleName(/^Account menu for /);

      // Placeholders: named and focusable, but inert
      await expect(search).toHaveAttribute('aria-disabled', 'true');
      await expect(newButton).toHaveAttribute('aria-disabled', 'true');
      await expect(bell).toHaveAttribute('aria-disabled', 'true');
    });

    test('E5: keyboard order, visible focus and the menu-button pattern', async ({ page }) => {
      const appShell = new AppShellPage(page);
      const bc = new BreadcrumbsBar(page);
      await openTaskFromSchedule(page);
      await expect(appShell.topBar).toBeVisible();
      await expect(bc.trailLink('Tasks')).toBeVisible();

      // The sidebar's last stop is the Settings link (the footer controls are display:none)
      await appShell.sectionLink('settings').focus();
      await expect(appShell.sectionLink('settings')).toBeFocused();

      const stops = [
        bc.backLink,
        bc.trailLink('Tasks'),
        page.getByTestId('top-bar-search'),
        page.getByTestId('top-bar-new'),
        page.getByTestId('top-bar-attention'),
        appShell.userMenuTrigger,
      ];
      for (const stop of stops) {
        await page.keyboard.press('Tab');
        await expect(stop).toBeFocused();
        await expect(stop).not.toHaveAccessibleName('');
        // A visible focus indicator (the focus recipe is a box-shadow ring; poll covers the
        // short transition)
        await expect
          .poll(() => stop.evaluate((el) => getComputedStyle(el).boxShadow))
          .not.toBe('none');
      }

      // Menu-button pattern on the avatar (focus is already there)
      await page.keyboard.press('Enter');
      await expect(appShell.userMenu).toBeVisible();
      await expect(page.getByTestId('user-menu-account')).toBeFocused();

      await page.keyboard.press('ArrowDown');
      await expect(appShell.themeOption('light')).toBeFocused();

      await page.keyboard.press('End');
      await expect(page.getByTestId('user-menu-logout')).toBeFocused(); // never activated

      await page.keyboard.press('Escape');
      await expect(appShell.userMenu).toBeHidden();
      await expect(appShell.userMenuTrigger).toBeFocused();

      // ArrowUp on the closed trigger opens with the last row focused
      await page.keyboard.press('ArrowUp');
      await expect(appShell.userMenu).toBeVisible();
      await expect(page.getByTestId('user-menu-logout')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(appShell.userMenu).toBeHidden();
      await expect(appShell.userMenuTrigger).toBeFocused();

      // Tab closes the menu and moves on: focus leaves the bar for main
      await page.keyboard.press('Enter');
      await expect(appShell.userMenu).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(appShell.userMenu).toBeHidden();
      await expect(appShell.topBar.locator(':focus')).toHaveCount(0);
      await expect(page.locator('main').locator(':focus')).toHaveCount(1);

      // A click on the page closes it as well
      await appShell.openUserMenu();
      await page.locator('main').click({ position: { x: 1, y: 1 } });
      await expect(appShell.userMenu).toBeHidden();
    });
  });

  test('E1: on a view the slot is empty and the bar keeps its 56px height', async ({ page }) => {
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.home);
    await expect(appShell.topBar).toBeVisible();
    await expect(page.getByTestId('top-bar-slot').getByTestId('breadcrumbs')).toHaveCount(0);
    await expect
      .poll(async () => Math.abs(((await appShell.topBar.boundingBox())?.height ?? 0) - 56))
      .toBeLessThanOrEqual(1);
  });

  test('E6: the bar stays at the top after scrolling', async ({ page }) => {
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.home);
    await expect(appShell.topBar).toBeVisible();

    await page.evaluate(() => {
      const filler = document.createElement('div');
      filler.style.height = '3000px';
      document.querySelector('main')?.append(filler);
      window.scrollTo(0, 1500);
    });
    // Gate: the document really scrolled (a bar inside the scroller would not prove anything)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await expect(appShell.topBar).toBeVisible();
    await expect
      .poll(async () => (await appShell.topBar.boundingBox())?.y ?? Number.NaN)
      .toBeCloseTo(0, 0);
  });

  test('E6: the Schedule page fits the viewport once the bar is subtracted', async ({ page }) => {
    const timeline = new TimelinePage(page);
    await page.goto(routeUrl('scheduleGantt'));
    await timeline.waitForLoaded();
    await expect
      .poll(() =>
        page.evaluate(() => (document.scrollingElement?.scrollHeight ?? 0) - window.innerHeight),
      )
      .toBeLessThanOrEqual(1);
  });
});

test.describe('Top bar across viewports', { tag: '@responsive' }, () => {
  test('E2: no control in the bar, the sidebar or the menu button paints the primary colour', async ({
    page,
  }) => {
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.home);
    await expect(appShell.sectionLink('home')).toBeAttached();
    await appShell.openSidebarIfDrawer();
    if (isDesktop(page)) await expect(appShell.topBar).toBeVisible();

    const primaryPainted = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--color-primary)';
      document.body.append(probe);
      const primary = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const controls = document.querySelectorAll(
        'header button, header a, aside button, aside a, [data-testid="menu-fab"]',
      );
      return Array.from(controls)
        .filter((el) => el.checkVisibility() && getComputedStyle(el).backgroundColor === primary)
        .map((el) => `${el.tagName} ${el.getAttribute('data-testid') ?? el.textContent ?? ''}`);
    });
    expect(primaryPainted).toEqual([]);
  });

  test('E4: exactly one Log out per viewport, nothing else left in the sidebar footer', async ({
    page,
  }) => {
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.home);
    await expect(appShell.sectionLink('home')).toBeAttached();

    if (isDesktop(page)) {
      // AC3: the footer holds only the Settings entry
      await expect(appShell.settingsNav.getByRole('link')).toHaveCount(1);
      await expect(appShell.sidebar.getByRole('button')).toHaveCount(0);
      await expect(appShell.sidebar.getByRole('link', { name: /GitHub/i })).toHaveCount(0);
      await expect(page.getByText(/Cornerstone v/)).toBeHidden();
      await expect(page.getByRole('button', { name: /switch to .* mode/i })).toHaveCount(0);
      await expect(page.getByTestId('sidebar-footer-legacy')).toBeHidden();

      // One Log out, and only once the user menu is open
      await expect(logOutControls(page)).toHaveCount(0);
      await appShell.openUserMenu();
      await expect(logOutControls(page)).toHaveCount(1);
      await expect(appShell.userMenu.getByRole('menuitem', { name: LOG_OUT })).toBeVisible();
    } else {
      await appShell.openSidebar();
      await expect(appShell.topBar).toBeHidden();
      await expect(page.getByRole('banner')).toHaveCount(0);
      await expect(
        appShell.sidebar.getByRole('button', { name: /switch to .* mode/i }),
      ).toBeVisible();
      await expect(appShell.sidebar.getByRole('button', { name: LOG_OUT })).toBeVisible();
      await expect(appShell.sidebar.getByRole('link', { name: 'GitHub' })).toBeVisible();
      await expect(appShell.sidebar.getByText(/Cornerstone v/)).toBeVisible();
      await expect(logOutControls(page)).toHaveCount(1);
    }
  });

  test.describe('with a seeded task', () => {
    let taskId = '';

    test.beforeEach(async ({ page, testPrefix }) => {
      await page.goto(ROUTES.home);
      taskId = await createWorkItemViaApi(page, {
        title: `${testPrefix} TopBar narrow ${Date.now().toString(36)}`,
      });
    });

    test.afterEach(async ({ page }) => {
      if (taskId) await deleteWorkItemViaApi(page, taskId);
      taskId = '';
    });

    test('E7: below 1024px the bar is hidden and the trail renders inside main', async ({
      page,
    }) => {
      test.skip(isDesktop(page), 'covered by E1 on desktop');
      const appShell = new AppShellPage(page);
      await page.goto(routeUrl('workItem', { id: taskId }));

      const inMain = page.locator('main').getByTestId('breadcrumbs');
      await expect(inMain).toBeVisible();
      await expect(inMain).toHaveCount(1);
      await expect(appShell.topBar).toBeHidden();
      await expect(page.getByTestId('top-bar-slot').getByTestId('breadcrumbs')).toHaveCount(0);
    });
  });
});
