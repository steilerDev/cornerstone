/**
 * E2E user menu (Story #2206 / EPIC-21, P1.1, E3)
 *
 * The avatar in the desktop top bar opens a menu with Account, Theme, Language, Keyboard
 * shortcuts, Help, About (version, GitHub) and Log out. Log out itself is exercised by
 * auth/login-logout.spec.ts through the viewport-aware AppShellPage.logout().
 *
 * Scenarios (desktop only; a dedicated member user because theme and language are per-user
 * server preferences):
 * - E3.1 header (name, role) and the order of the entries
 * - E3.2 Theme: Dark applies at once, the menu stays open, the choice persists to a fresh page
 * - E3.3 Language: Deutsch re-renders the open menu in German, English switches back
 * - E3.4 Keyboard shortcuts lists the current page's keys; Home has none; Escape refocuses
 * - E3.5 Help and GitHub are new-tab links (never followed); the version line
 * - E3.6 Account opens Settings > Account and closes the menu; on that page it replaces
 *
 * The option value below deliberately equals the one in i18n/i18n.spec.ts: an identical
 * `isolatedUserPerWorker` value shares that worker's user, so this file adds no user, no login
 * and no extra worker group.
 */

import { test, expect } from '../../fixtures/isolatedUser.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { ROUTES } from '../../fixtures/testData.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';

test.use({
  isolatedUserPerWorker: { emailPrefix: 'i18n-switch', displayName: 'E2E i18n User' },
});

test.describe.configure({ mode: 'serial' });

const USER_NAME = 'E2E i18n User';
const HELP_URL = 'https://cornerstone.steiler.dev/';
const GITHUB_URL = 'https://github.com/steilerDev/cornerstone';

/** Restore the defaults this file may change (theme system, English), server side. */
async function resetPreferences(page: Page): Promise<void> {
  await page.request.patch('/api/users/me/preferences', {
    data: { key: 'theme', value: 'system' },
  });
  await page.request.patch('/api/users/me/preferences', {
    data: { key: 'locale', value: 'en' },
  });
}

test.describe('User menu', () => {
  test.beforeEach(({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1024, 'the user menu is a desktop-bar control');
  });

  test.afterEach(async ({ page }) => {
    await resetPreferences(page);
  });

  test('E3.1: header shows name and role; entries are in order', async ({ page }) => {
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.home);
    await appShell.openUserMenu();

    await expect(appShell.userMenu.getByText(USER_NAME, { exact: true })).toBeVisible();
    await expect(appShell.userMenu.getByText('Member', { exact: true })).toBeVisible();

    await expect(appShell.userMenu.locator('[role="menuitem"], [role="menuitemradio"]')).toHaveText(
      [
        /Account/,
        /Light/,
        /Dark/,
        /System/,
        /English/,
        /Deutsch/,
        /Keyboard shortcuts/,
        /Help/,
        /GitHub/,
        /Log out/,
      ],
    );
  });

  test('E3.2: Dark applies at once, keeps the menu open and persists', async ({ page }) => {
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.home);
    await appShell.openUserMenu();
    await expect(appShell.themeOption('system')).toHaveAttribute('aria-checked', 'true');

    // Gate on the server write so the fresh page below cannot race it
    const saved = page.waitForResponse(
      (r) => r.url().includes('/api/users/me/preferences') && r.request().method() === 'PATCH',
    );
    await appShell.themeOption('dark').click();
    await saved;

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(appShell.userMenu).toBeVisible();
    await expect(appShell.themeOption('dark')).toHaveAttribute('aria-checked', 'true');

    // Fresh visit: a new page in the same context (never a same-URL goto)
    const fresh = await page.context().newPage();
    try {
      await fresh.goto(ROUTES.home);
      await expect(fresh.locator('html')).toHaveAttribute('data-theme', 'dark');
    } finally {
      await fresh.close();
    }
  });

  test('E3.3: Deutsch re-renders the open menu in German; English switches back', async ({
    page,
  }) => {
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.home);
    await appShell.openUserMenu();
    await expect(appShell.languageOption('en')).toHaveAttribute('aria-checked', 'true');

    await appShell.languageOption('de').click();
    await expect(appShell.userMenu).toBeVisible();
    await expect(appShell.languageOption('de')).toHaveAttribute('aria-checked', 'true');
    // Glossary canon: Account -> Konto
    await expect(page.getByTestId('user-menu-account')).toContainText('Konto');

    await appShell.languageOption('en').click();
    await expect(appShell.languageOption('en')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('user-menu-account')).toContainText('Account');
  });

  test("E3.4: Keyboard shortcuts lists the page's keys; Escape returns focus to the avatar", async ({
    page,
  }) => {
    const appShell = new AppShellPage(page);
    const tasks = new WorkItemsPage(page);

    await page.goto(routeUrl('workItems'));
    await tasks.waitForLoaded();
    await appShell.openUserMenu();
    await page.getByTestId('user-menu-shortcuts').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    for (const key of ['n', '/', '?']) {
      await expect(
        dialog
          .locator('kbd')
          .filter({ hasText: new RegExp(`^${key === '?' || key === '/' ? '\\' + key : key}$`) }),
      ).toBeVisible();
    }
    // #2209: a fixed "Everywhere" section lists the global undo shortcut
    await expect(dialog.getByRole('heading', { name: 'Everywhere' })).toBeVisible();
    await expect(dialog).toContainText('Undo the last change');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(appShell.userMenuTrigger).toBeFocused();

    // Home registers no shortcuts of its own
    await page.goto(ROUTES.home);
    await expect(appShell.userMenuTrigger).toBeVisible();
    await appShell.openUserMenu();
    await page.getByTestId('user-menu-shortcuts').click();
    await expect(page.getByRole('dialog')).toContainText('This page has no shortcuts of its own.');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(appShell.userMenuTrigger).toBeFocused();
  });

  test('E3.5: Help and GitHub open in a new tab; the version is shown', async ({ page }) => {
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.home);
    await appShell.openUserMenu();

    const help = page.getByTestId('user-menu-help');
    await expect(help).toHaveAttribute('href', HELP_URL);
    await expect(help).toHaveAttribute('target', '_blank');
    await expect(help).toHaveAttribute('rel', /noopener/);

    const github = page.getByTestId('user-menu-github');
    await expect(github).toHaveAttribute('href', GITHUB_URL);
    await expect(github).toHaveAttribute('target', '_blank');
    await expect(github).toHaveAttribute('rel', /noopener/);

    // The stamped version differs per build (semver in releases, `pr-<n>` in PR CI, `0.0.0-dev`
    // locally), so only the "v" prefix and a non-empty value are asserted on the About group
    await expect(
      appShell.userMenu.getByRole('group', { name: 'About' }).getByText(/^v\S+$/),
    ).toBeVisible();
  });

  test('E3.6: Account opens Settings > Account, closes the menu, and replaces on that page', async ({
    page,
  }) => {
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.home);
    await appShell.openUserMenu();
    await page.getByTestId('user-menu-account').click();

    await expect(page).toHaveURL((url) => url.pathname === routeUrl('settingsProfile'));
    await expect(appShell.userMenu).toBeHidden();

    // Same URL: the entry replaces instead of pushing
    await expect(appShell.userMenuTrigger).toBeVisible();
    const before = await page.evaluate(() => history.length);
    await appShell.openUserMenu();
    await page.getByTestId('user-menu-account').click();
    await expect(appShell.userMenu).toBeHidden();
    expect(await page.evaluate(() => history.length)).toBe(before);
  });
});
