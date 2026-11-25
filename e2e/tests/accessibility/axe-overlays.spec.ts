/**
 * E2E: axe-core on the overlays (Story #2261, AC4): the shared Modal (the New task dialog),
 * the command search, the user menu (desktop) and the More and New sheets (phone, tablet).
 * Light and dark, desktop, tablet and mobile. Steps that do not exist at a width are skipped.
 */

import { test } from '../../fixtures/auth.js';
import { expectNoAxeViolations } from '../../fixtures/a11y.js';
import { enableDarkTheme } from '../../fixtures/darkMode.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { CreateMenu } from '../../pages/components/CreateMenu.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import type { Page } from '@playwright/test';

/** Scan the open overlay in light, then switch to dark and scan again. */
async function scanBothThemes(page: Page, label: string, include?: string): Promise<void> {
  await expectNoAxeViolations(page, { label: `${label} light`, include });
  await enableDarkTheme(page);
  await expectNoAxeViolations(page, { label: `${label} dark`, include });
}

test.describe('Axe: overlays', { tag: '@responsive' }, () => {
  test('the New task dialog (shared Modal)', async ({ page }, testInfo) => {
    await page.goto(routeUrl('workItemNew'));
    await page.getByRole('dialog', { name: 'New task', exact: true }).waitFor();
    await scanBothThemes(page, `New task dialog ${testInfo.project.name}`, '[role="dialog"]');
  });

  test('the command search', async ({ page }, testInfo) => {
    const appShell = new AppShellPage(page);
    await page.goto(routeUrl('home'));
    await appShell.openSearch();
    await scanBothThemes(page, `command search ${testInfo.project.name}`, '[role="dialog"]');
  });

  test('the user menu (desktop)', async ({ page }, testInfo) => {
    const appShell = new AppShellPage(page);
    await page.goto(routeUrl('home'));
    test.skip(appShell.isCompact(), 'the user menu is in the top bar from 1024px');
    await appShell.openUserMenu();
    await scanBothThemes(page, `user menu ${testInfo.project.name}`);
  });

  test('the More sheet (below 1024px)', async ({ page }, testInfo) => {
    const appShell = new AppShellPage(page);
    await page.goto(routeUrl('home'));
    test.skip(!appShell.isCompact(), 'the More sheet exists below 1024px');
    await appShell.openMoreSheet();
    await scanBothThemes(page, `More sheet ${testInfo.project.name}`);
  });

  test('the New sheet (below 1024px)', async ({ page }, testInfo) => {
    const appShell = new AppShellPage(page);
    const create = new CreateMenu(page);
    await page.goto(routeUrl('home'));
    test.skip(!appShell.isCompact(), 'the New sheet exists below 1024px');
    await create.plusButton.click();
    await create.sheetDialog.waitFor();
    await scanBothThemes(page, `New sheet ${testInfo.project.name}`);
  });
});
