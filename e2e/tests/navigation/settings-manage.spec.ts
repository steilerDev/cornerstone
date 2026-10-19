/**
 * E2E tests for Settings > Project setup (#2215, EPIC-21; formerly the six-tab Manage page)
 *
 * /settings/manage is one page of sections, in this order: House, Cost categories, Purchase
 * categories, Photo orientations, then
 * "Managed on other pages" (Trades, Areas). Each section is a `#anchor`; the six old `?tab=` links
 * land on their section by history replace.
 *
 * This file covers:
 * - AC1 layout: h1, sections in order, no tab row, no breadcrumb trail, no Back link
 * - Pointers: Trades opens the Trades sheet on Companies; the Areas pointer row (always shown)
 * - AC3 `?tab=` links: anchor, `tab` removed, heading focused, Back leaves in one step
 * - House (singleton settings): load, dirty-gated save, persistence, clearing, save failure
 * - AC4 'Language of your entries': value from the API, no write on load, persists, restored
 * - AC5 responsive sizes (UX spec section 10, Style Guide P1-P10) and dark mode
 *
 * List behaviour of the three reference lists (create, edit, delete, reorder) lives in
 * budget/budget-categories.spec.ts (cost and purchase categories) and orientations.spec.ts.
 *
 * Data isolation: /api/settings is a household-wide SINGLETON. The House describe holds the
 * Playwright `lock: 'household-settings'` (cross-project, cross-worker) and snapshots and
 * restores the values in `finally`. Areas are independently named per test (`testPrefix`).
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { BreadcrumbsBar } from '../../pages/BreadcrumbsBar.js';
import { ProfilePage } from '../../pages/ProfilePage.js';
import { ProjectSetupPage } from '../../pages/ProjectSetupPage.js';
import { VendorsPage } from '../../pages/VendorsPage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Household settings API helpers
// ─────────────────────────────────────────────────────────────────────────────

interface HouseholdSettingsApiData {
  householdName: string | null;
  householdAddress: string | null;
  entriesLanguage: 'de' | 'en';
}

async function fetchHouseholdSettingsViaApi(page: Page): Promise<HouseholdSettingsApiData> {
  const response = await page.request.get('/api/settings');
  if (!response.ok()) throw new Error(`GET /api/settings returned ${response.status()}`);
  const body = (await response.json()) as { settings: HouseholdSettingsApiData };
  return body.settings;
}

async function patchHouseholdSettingsViaApi(
  page: Page,
  data: Partial<HouseholdSettingsApiData>,
): Promise<void> {
  const response = await page.request.patch('/api/settings', { data });
  if (!response.ok()) throw new Error(`PATCH /api/settings returned ${response.status()}`);
}

/** Restore the snapshot (the language is only sent when it differs, as the app does). */
async function restoreHouseholdSettings(
  page: Page,
  original: HouseholdSettingsApiData,
): Promise<void> {
  await patchHouseholdSettingsViaApi(page, original);
}

// ─────────────────────────────────────────────────────────────────────────────
// AC1: layout
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Project setup — layout (AC1)', { tag: '@responsive' }, () => {
  test(
    'Project setup loads with the "Project setup" heading and every section',
    { tag: '@smoke' },
    async ({ page }) => {
      const setup = new ProjectSetupPage(page);
      await setup.goto();

      await expect(setup.heading).toBeVisible();
      await expect(setup.house).toBeVisible();
      await expect(setup.costCategories.section).toBeVisible();
      await expect(setup.purchaseCategories.section).toBeVisible();
      await expect(setup.orientations.section).toBeVisible();
      await expect(setup.pointers).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Cost categories', exact: true }),
      ).toBeVisible();
    },
  );

  test('Sections are in order, with no tab row, no breadcrumb trail and no Back link', async ({
    page,
  }) => {
    const setup = new ProjectSetupPage(page);
    await setup.goto();

    // House < Cost < Purchase < Photo orientations < pointers, by vertical position
    const ys: number[] = [];
    for (const section of setup.sectionsInOrder()) {
      const box = await section.boundingBox();
      if (!box) throw new Error('a section has no box');
      ys.push(box.y);
    }
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i], `section ${i} starts below section ${i - 1}`).toBeGreaterThan(ys[i - 1]!);
    }

    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(page.locator('nav[aria-label="You are here"]')).toHaveCount(0);
    const breadcrumbs = new BreadcrumbsBar(page);
    await breadcrumbs.expectNoTrail();
    await expect(breadcrumbs.backLink).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  test('The Settings sidebar group lists Settings and its views', async ({ page }) => {
    const appShell = new AppShellPage(page);
    const setup = new ProjectSetupPage(page);
    await setup.goto();

    // #2205: Project setup is the Settings entry itself, so it is the highlighted one
    await expect(appShell.sectionLink('settings')).toHaveText('Settings');
    await expect(appShell.sectionLink('settings')).toHaveAttribute('aria-current', 'page');
    // Below 1024px the Account view lives in the title menu: open it first (no-op on desktop)
    await appShell.revealViews();
    await expect(appShell.viewLink('settingsProfile')).toHaveCount(1);
    await expect(appShell.viewLink('settingsProfile')).toContainText('Account');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pointers (Managed on other pages)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Project setup — pointers', { tag: '@responsive' }, () => {
  test('The Trades pointer opens the Trades sheet on the Companies page', async ({ page }) => {
    const setup = new ProjectSetupPage(page);
    await setup.goto();

    await expect(setup.pointerTrades).toContainText('Trades');
    await expect(setup.pointerTrades).toContainText('Managed on Companies');
    await expect(setup.pointerTrades).toHaveAttribute(
      'href',
      routeUrl('companies', undefined, { trades: 1 }),
    );

    await setup.pointerTrades.click();
    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('companies') && url.searchParams.get('trades') === '1',
    );
    await new VendorsPage(page).tradesSheet.waitForOpen();
  });

  test('Areas: the pointer row is always shown and opens the Areas page', async ({ page }) => {
    const setup = new ProjectSetupPage(page);
    await setup.goto();

    await expect(setup.pointerAreas).toBeVisible();
    await expect(setup.pointerAreas).toHaveAttribute('href', routeUrl('areas'));
    await setup.pointerAreas.click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('areas'));
    await expect(page.getByRole('heading', { level: 1, name: 'Areas', exact: true })).toBeVisible();
  });

  test('The House section links to the app language in Account', async ({ page }) => {
    const setup = new ProjectSetupPage(page);
    await setup.goto();

    await expect(setup.appLanguageLink).toHaveText('Set the app language in Account');
    await setup.appLanguageLink.click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('settingsProfile'));
    await expect(new ProfilePage(page).profileSection).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3: the old ?tab= links
// ─────────────────────────────────────────────────────────────────────────────

/** `?tab=` value, the anchor it lands on, and the element that takes focus. */
const TAB_LINKS: ReadonlyArray<readonly [string, string, string]> = [
  ['household', '#house', 'house-heading'],
  ['budget-categories', '#cost-categories', 'cost-categories-heading'],
  ['hi-categories', '#purchase-categories', 'purchase-categories-heading'],
  ['orientations', '#orientations', 'orientations-heading'],
  ['trades', '#trades', 'trades'],
];

test.describe('Project setup — old ?tab= links (AC3)', { tag: '@responsive' }, () => {
  for (const [tab, anchor, focusId] of TAB_LINKS) {
    test(`?tab=${tab} lands on ${anchor}, focuses it, and Back leaves in one step`, async ({
      page,
    }) => {
      // The page before Project setup, so one Back has somewhere to go
      await page.goto(routeUrl('dashboard'));
      // Let the app finish booting: leaving mid-boot aborts its session check and bounces to /login
      await expect(page.getByRole('main')).toBeVisible();
      await page.goto(routeUrl('settingsManage', undefined, { tab }));
      await new ProjectSetupPage(page).heading.waitFor({ state: 'visible' });

      await expect(page).toHaveURL(
        (url) =>
          url.pathname === routeUrl('settingsManage') &&
          url.hash === anchor &&
          !url.searchParams.has('tab'),
      );
      await expect(page.locator(`#${focusId}`)).toBeFocused();
      await expect(page.locator(`#${focusId}`)).toBeInViewport();

      // The rewrite replaced the entry: one step back is the page before
      await page.goBack();
      await expect(page).not.toHaveURL((url) => url.pathname === routeUrl('settingsManage'));
    });
  }

  test('An unknown ?tab=foo is dropped and the page stays at the top', async ({ page }) => {
    await page.goto(routeUrl('settingsManage', undefined, { tab: 'foo' }));
    const setup = new ProjectSetupPage(page);
    await setup.heading.waitFor({ state: 'visible' });

    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('settingsManage') && url.search === '' && url.hash === '',
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('A section hash scrolls that section into view', async ({ page }) => {
    const setup = new ProjectSetupPage(page);
    await setup.goto('orientations');
    await expect(setup.orientations.heading).toBeFocused();
    await expect(setup.orientations.heading).toBeInViewport();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// House (name, address) — singleton settings
// ─────────────────────────────────────────────────────────────────────────────

// Serial mode only orders tests within one project's worker; the lock stops the
// desktop/tablet/mobile projects and other workers racing on the singleton row.
test.describe('Project setup — House', { tag: '@responsive', lock: 'household-settings' }, () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('settings persistence', () => {
    test('Fill name and address, save, reload — values persist', async ({ page, testPrefix }) => {
      const original = await fetchHouseholdSettingsViaApi(page);
      const name = `${testPrefix} House`;
      const address = `${testPrefix} 123 Sample Street, Springfield`;
      const setup = new ProjectSetupPage(page);

      try {
        await setup.goto();
        await setup.houseName.fill(name);
        await setup.houseAddress.fill(address);
        await expect(setup.houseSave).not.toHaveAttribute('aria-disabled', 'true');

        const responsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/api/settings') &&
            resp.request().method() === 'PATCH' &&
            resp.status() === 200,
        );
        await setup.houseSave.click();
        await responsePromise;

        await expect(setup.houseSaved).toHaveText('House details saved.');
        // Saved values match the form again: Save is inert until the next edit
        await expect(setup.houseSave).toHaveAttribute('aria-disabled', 'true');

        await page.reload();
        await setup.house.waitFor({ state: 'visible' });
        await expect(setup.houseName).toHaveValue(name);
        await expect(setup.houseAddress).toHaveValue(address);
      } finally {
        await restoreHouseholdSettings(page, original);
      }
    });

    test('Clear both fields, save, reload — values are empty', async ({ page, testPrefix }) => {
      const original = await fetchHouseholdSettingsViaApi(page);
      const setup = new ProjectSetupPage(page);

      try {
        await patchHouseholdSettingsViaApi(page, {
          householdName: `${testPrefix} Pre-clear Name`,
          householdAddress: `${testPrefix} Pre-clear Address`,
        });

        await setup.goto();
        await expect(setup.houseName).toHaveValue(`${testPrefix} Pre-clear Name`);

        await setup.houseName.fill('');
        await setup.houseAddress.fill('');
        const responsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/api/settings') &&
            resp.request().method() === 'PATCH' &&
            resp.status() === 200,
        );
        await setup.houseSave.click();
        await responsePromise;
        await expect(setup.houseSaved).toBeVisible();

        await page.reload();
        await setup.house.waitFor({ state: 'visible' });
        await expect(setup.houseName).toHaveValue('');
        await expect(setup.houseAddress).toHaveValue('');
      } finally {
        await restoreHouseholdSettings(page, original);
      }
    });

    test('Save is inert until a field is edited (dirty-gated)', async ({ page }) => {
      const setup = new ProjectSetupPage(page);
      await setup.goto();

      await expect(setup.houseSave).toHaveAttribute('aria-disabled', 'true');
      await setup.houseName.fill('Temporary dirty value');
      await expect(setup.houseSave).not.toHaveAttribute('aria-disabled', 'true');
    });

    test('Save failure shows an error banner and keeps the entered values', async ({
      page,
      testPrefix,
    }) => {
      const setup = new ProjectSetupPage(page);
      await setup.goto();

      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'PATCH') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
            }),
          });
        } else {
          await route.continue();
        }
      });

      const failName = `${testPrefix} Should Not Persist`;
      await setup.houseName.fill(failName);
      await setup.houseSave.click();

      await expect(setup.houseSaveError).toBeVisible();
      await expect(setup.houseName).toHaveValue(failName);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AC4: Language of your entries
  // ───────────────────────────────────────────────────────────────────────────

  test.describe('Language of your entries (AC4)', () => {
    test('Shows the value from the API and loading the page writes nothing', async ({ page }) => {
      const writes: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/api/settings') && request.method() !== 'GET') {
          writes.push(`${request.method()} ${request.url()}`);
        }
      });
      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              settings: { householdName: null, householdAddress: null, entriesLanguage: 'de' },
            }),
          });
        } else {
          await route.continue();
        }
      });

      const setup = new ProjectSetupPage(page);
      await setup.goto();

      await expect(setup.languageSelect).toHaveValue('de');
      await expect(page.getByLabel('Language of your entries')).toBeVisible();
      // Give a stray write time to show up, then assert none happened
      await expect(setup.houseSave).toHaveAttribute('aria-disabled', 'true');
      expect(writes, 'loading Project setup must not PATCH the settings').toEqual([]);
    });

    test('Change the language, save, reload — it is kept; restored at the end', async ({
      page,
      testPrefix,
    }) => {
      const original = await fetchHouseholdSettingsViaApi(page);
      const other = original.entriesLanguage === 'de' ? 'en' : 'de';
      const setup = new ProjectSetupPage(page);
      const orientationName = `${testPrefix} Language Probe`;
      const orientationResponse = await page.request.post('/api/orientations', {
        data: { name: orientationName },
      });
      expect(orientationResponse.ok(), 'POST orientation').toBeTruthy();
      const orientationId = ((await orientationResponse.json()) as { orientation: { id: string } })
        .orientation.id;

      try {
        await setup.goto();
        await setup.languageSelect.selectOption(other);
        const responsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/api/settings') &&
            resp.request().method() === 'PATCH' &&
            resp.status() === 200,
        );
        await setup.houseSave.click();
        const response = await responsePromise;
        expect(response.request().postDataJSON()).toMatchObject({ entriesLanguage: other });
        await expect(setup.houseSaved).toBeVisible();

        // Your own entries now carry the language (hyphenation); the app language is untouched
        await expect(
          setup.orientations.row(orientationName).locator(`[lang="${other}"]`),
        ).toBeVisible();

        await page.goto(page.url());
        await setup.waitForLoaded();
        await expect(setup.languageSelect).toHaveValue(other);
      } finally {
        await restoreHouseholdSettings(page, original);
        await page.request.delete(`/api/orientations/${orientationId}`);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5: responsive sizes (UX spec section 10, Style Guide P1-P10)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Project setup — responsive', { tag: '@responsive' }, () => {
  test('Renders without horizontal overflow at the current viewport', async ({ page }) => {
    const setup = new ProjectSetupPage(page);
    await setup.goto();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test('Phone 375px: no sideways scroll, the sections column is 343px wide', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'explicit phone widths run once');
    await page.setViewportSize({ width: 375, height: 800 });
    const setup = new ProjectSetupPage(page);
    await setup.goto();

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      'scrollWidth <= clientWidth',
    ).toBe(true);
    const column = setup.house.locator('..');
    const box = await column.boundingBox();
    if (!box) throw new Error('sections column has no box');
    expect(Math.abs(box.width - 343), `column width ${box.width}`).toBeLessThanOrEqual(1);
    for (const section of setup.sectionsInOrder()) {
      const sectionBox = await section.boundingBox();
      if (!sectionBox) throw new Error('section has no box');
      expect(Math.abs(sectionBox.width - box.width)).toBeLessThanOrEqual(1);
    }
  });

  test('Phone 320px: no sideways scroll', async ({ browser }) => {
    test.skip(test.info().project.name !== 'mobile', 'explicit phone widths run once');
    const context = await browser.newContext({
      viewport: { width: 320, height: 640 },
      storageState: 'test-results/.auth/admin.json',
    });
    const page = await context.newPage();
    try {
      const setup = new ProjectSetupPage(page);
      await setup.goto();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        'scrollWidth <= clientWidth',
      ).toBe(true);
    } finally {
      await context.close();
    }
  });

  test('Phone: handle and ⋯ are 44x44, a row is at least 52px, New is at least 44px tall', async ({
    page,
    testPrefix,
  }) => {
    test.skip(test.info().project.name !== 'mobile', 'explicit phone widths run once');
    await page.setViewportSize({ width: 375, height: 800 });
    const name = `${testPrefix} Size Probe`;
    const created = await page.request.post('/api/orientations', { data: { name } });
    expect(created.ok(), 'POST orientation').toBeTruthy();
    const id = ((await created.json()) as { orientation: { id: string } }).orientation.id;

    try {
      const setup = new ProjectSetupPage(page);
      await setup.goto();
      const list = setup.orientations;
      await list.row(name).scrollIntoViewIfNeeded();

      for (const control of [list.handle(name), list.menuTrigger(name)]) {
        const box = await control.boundingBox();
        if (!box) throw new Error('control has no box');
        expect(Math.round(box.width), 'touch target width').toBe(44);
        expect(Math.round(box.height), 'touch target height').toBe(44);
      }
      const rowBox = await list.row(name).boundingBox();
      expect(rowBox!.height, 'row height').toBeGreaterThanOrEqual(52);
      const newBox = await list.newButton.boundingBox();
      expect(newBox!.height, 'New button height').toBeGreaterThanOrEqual(44);
    } finally {
      await page.request.delete(`/api/orientations/${id}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Project setup — dark mode', () => {
  test('Rows and swatches have a visible edge against the card in dark mode', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      colorScheme: 'dark',
      storageState: 'test-results/.auth/admin.json',
    });
    const page = await context.newPage();

    try {
      const setup = new ProjectSetupPage(page);
      await setup.goto();
      await setup.costCategories.items.first().waitFor({ state: 'visible' });

      const colors = await setup.costCategories.section.evaluate((section) => {
        const row = section.querySelector('li') as HTMLElement;
        const swatch = row.querySelector('[aria-hidden="true"][data-color], span[class*="swatch"]');
        const rowStyle = getComputedStyle(row);
        const swatchStyle = swatch ? getComputedStyle(swatch) : null;
        return {
          card: getComputedStyle(section).backgroundColor,
          rowBorder: rowStyle.borderTopColor,
          rowBackground: rowStyle.backgroundColor,
          swatchBorder: swatchStyle?.borderTopColor ?? null,
        };
      });
      expect(colors.rowBorder, 'row border differs from the card').not.toBe(colors.card);
      expect(colors.swatchBorder, 'swatch has an edge').not.toBeNull();
      expect(colors.swatchBorder, 'swatch edge differs from the row').not.toBe(
        colors.rowBackground,
      );
      await expect(setup.house).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
