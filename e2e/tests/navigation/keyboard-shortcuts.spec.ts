/**
 * E2E: keyboard shortcut registry and help overlay (#2253).
 *
 * Scenarios:
 * - K1 (AC2) `?` opens the one overlay from Home (three groups, `?` and `g s` rows); Esc closes
 *   it; desktop: the avatar row opens it and Esc refocuses the avatar
 * - K2 (AC4) `g s` opens the Schedule, `g t` the Tasks list
 * - K3 (AC3) nothing fires with focus in a text field
 * - K4 (AC5/AC6) the footer switch turns single-key shortcuts off, marks their rows, leaves
 *   Mod+K alone and survives a reload (desktop: it is driven from the avatar menu)
 * - K4b (AC6) with the switch off, `e` is inert and Delete still opens the delete confirmation
 * - K5 (AC7) a task page lists its own keys in the one overlay; Esc closes it
 *
 * Every first key press is retried inside `toPass()`, guarded so it cannot double-fire: the shell
 * listeners attach after the page mounts. Playwright gives every test a fresh browser context,
 * so the localStorage off switch never leaks between tests; the tests that turn it off still
 * restore it.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
import { ROUTES } from '../../fixtures/testData.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { CommandSearchPanel } from '../../pages/components/CommandSearchPanel.js';
import { KeyboardShortcutsDialog } from '../../pages/components/KeyboardShortcutsDialog.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';

const isDesktop = (page: Page): boolean => (page.viewportSize()?.width ?? 0) >= 1024;

/** Press `g` then `letter` until the URL matches; stops pressing once the path changed. */
async function pressGoTo(page: Page, letter: string, pathname: string): Promise<void> {
  await expect(async () => {
    if (new URL(page.url()).pathname !== pathname) {
      await page.keyboard.press('g');
      await page.keyboard.press(letter);
    }
    await expect(page).toHaveURL((url) => url.pathname === pathname, { timeout: 1500 });
  }).toPass();
}

test.describe('Keyboard shortcuts', { tag: '@responsive' }, () => {
  test('K1: ? opens the one overlay with its three groups; Esc closes it', async ({ page }) => {
    const help = new KeyboardShortcutsDialog(page);
    await page.goto(ROUTES.home);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await help.openWithKey();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(help.groupHeading('On this page')).toBeVisible();
    await expect(help.groupHeading('Everywhere')).toBeVisible();
    await expect(help.groupHeading('Go to')).toBeVisible();
    await expect(help.emptyPageNote).toBeVisible();
    await expect(help.row('?')).toContainText('Show keyboard shortcuts');
    await expect(help.row('g s')).toContainText('Go to Schedule');
    await expect(help.row('g s').locator('kbd')).toHaveCount(2);
    await expect(help.row('g s')).toContainText('then');

    await help.close();
  });

  test('K1: the avatar menu row opens it; Esc returns focus to the avatar (desktop)', async ({
    page,
  }) => {
    test.skip(!isDesktop(page), 'the avatar menu is a desktop-bar control');
    const appShell = new AppShellPage(page);
    const help = new KeyboardShortcutsDialog(page);
    await page.goto(ROUTES.home);
    await expect(appShell.userMenuTrigger).toBeVisible();

    await help.openFromUserMenu();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(help.dialog).toHaveCount(0);
    await expect(appShell.userMenuTrigger).toBeFocused();
  });

  test('K2: g s opens the Schedule and g t the Tasks list', async ({ page }) => {
    await page.goto(ROUTES.home);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await pressGoTo(page, 's', routeUrl('scheduleGantt'));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await pressGoTo(page, 't', routeUrl('workItems'));
    await new WorkItemsPage(page).waitForLoaded();
  });

  test('K3: nothing fires with focus in a text field', async ({ page }) => {
    const tasks = new WorkItemsPage(page);
    const help = new KeyboardShortcutsDialog(page);
    await page.goto(routeUrl('workItems'));
    await tasks.waitForLoaded();

    // Prove the shell listeners are attached first, then leave the overlay
    await help.openWithKey();
    await help.close();

    await tasks.searchInput.focus();
    await page.keyboard.type('?gs/');
    await expect(help.dialog).toHaveCount(0);
    await expect(tasks.searchInput).toHaveValue('?gs/');
    expect(new URL(page.url()).pathname).toBe(routeUrl('workItems'));
  });

  test('K4: the switch turns single-key shortcuts off, marks rows and survives a reload', async ({
    page,
  }) => {
    test.skip(!isDesktop(page), 'driven from the avatar menu row (desktop)');
    const tasks = new WorkItemsPage(page);
    const help = new KeyboardShortcutsDialog(page);
    const search = new CommandSearchPanel(page);
    await page.goto(routeUrl('workItems'));
    await tasks.waitForLoaded();

    try {
      await help.openFromUserMenu();
      await expect(help.singleKeySwitch).toBeChecked();
      await expect(help.row('n')).toBeVisible();
      await expect(help.row('n')).not.toHaveAttribute('data-off', /.*/);
      await help.singleKeySwitch.focus();
      await page.keyboard.press('Space');
      await expect(help.singleKeySwitch).not.toBeChecked();

      for (const key of ['/', 'n', '?', 'g s']) {
        await expect(help.row(key)).toHaveAttribute('data-off', 'true');
        await expect(help.offBadge(key)).toHaveText('Turned off');
      }
      for (const key of ['Escape', 'Mod+k']) {
        await expect(help.row(key)).not.toHaveAttribute('data-off', /.*/);
        await expect(help.offBadge(key)).toHaveCount(0);
      }
      await help.close();

      // The shell is mounted (the overlay just worked): single-key shortcuts are now inert
      await page.locator('main').click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('?');
      await page.keyboard.press('g');
      await page.keyboard.press('s');
      await page.keyboard.press('n');
      await page.keyboard.press('/');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(tasks.searchInput).not.toBeFocused();
      expect(new URL(page.url()).pathname).toBe(routeUrl('workItems'));

      // Mod+K is a chord and keeps working
      await search.openWithShortcut();
      await page.keyboard.press('Escape');
      await expect(search.dialog).toHaveCount(0);

      // The choice survives a reload
      await page.reload();
      await tasks.waitForLoaded();
      await help.openFromUserMenu();
      await expect(help.singleKeySwitch).not.toBeChecked();
      await expect(help.row('g s')).toHaveAttribute('data-off', 'true');

      // Back on: the rows are no longer marked and `?` works again
      await help.singleKeySwitch.focus();
      await page.keyboard.press('Space');
      await expect(help.singleKeySwitch).toBeChecked();
      await expect(help.row('g s')).not.toHaveAttribute('data-off', /.*/);
      await help.close();
      await help.openWithKey();
      await help.close();
    } finally {
      await page.evaluate(() => localStorage.removeItem('singleKeyShortcuts'));
    }
  });

  test('K4b: with the switch off, e is inert and Delete still opens the confirmation', async ({
    page,
    testPrefix,
  }) => {
    test.skip(!isDesktop(page), 'driven from the avatar menu row (desktop)');
    const help = new KeyboardShortcutsDialog(page);
    const detail = new WorkItemDetailPage(page);
    let id: string | null = null;
    try {
      id = await createWorkItemViaApi(page, { title: `${testPrefix} K4b Off` });
      await detail.goto(id);

      await help.openFromUserMenu();
      await help.singleKeySwitch.focus();
      await page.keyboard.press('Space');
      await expect(help.singleKeySwitch).not.toBeChecked();
      await expect(help.row('e')).toHaveAttribute('data-off', 'true');
      await expect(help.row('Delete')).not.toHaveAttribute('data-off', /.*/);
      await help.close();

      await page.locator('main').click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('e');
      await expect(detail.detailsCard.form).toHaveCount(0);

      await expect(async () => {
        if (!(await detail.deleteDialog.dialog.isVisible())) {
          await page.keyboard.press('Delete');
        }
        await expect(detail.deleteDialog.dialog).toBeVisible({ timeout: 1000 });
      }).toPass();
      await detail.cancelDelete();
    } finally {
      await page.evaluate(() => localStorage.removeItem('singleKeyShortcuts'));
      if (id) await deleteWorkItemViaApi(page, id);
    }
  });

  test('K5: a task page lists its own shortcuts in the one overlay', async ({
    page,
    testPrefix,
  }) => {
    const help = new KeyboardShortcutsDialog(page);
    const detail = new WorkItemDetailPage(page);
    let id: string | null = null;
    try {
      id = await createWorkItemViaApi(page, { title: `${testPrefix} K5 Keys` });
      await detail.goto(id);

      await help.openWithKey();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      await expect(help.groupHeading('On this page')).toBeVisible();
      await expect(help.emptyPageNote).toHaveCount(0);
      await expect(help.row('e')).toContainText('Edit the task details');
      await expect(help.row('Delete')).toContainText('Delete the task');
      await expect(help.row('Backspace')).toHaveCount(0);

      await help.close();
      await expect(page.locator('body')).not.toBeFocused();
    } finally {
      if (id) await deleteWorkItemViaApi(page, id);
    }
  });
});
