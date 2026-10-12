/**
 * E2E tests for the Settings > Account re-layout (Story #2214, EPIC-21)
 *
 * Four sections in order: Your details, Calendar & contacts sync, Preferences, Password.
 *
 * Scenarios (AC ids from the spec):
 * - AC1/AC2 order: sections in order at every viewport; contents of each section
 * - AC1 sign-in row: single sign-on account vs local account (mocked `GET /api/auth/me`)
 * - Responsive sizes (UX spec section 10): column widths, 44px touch targets, stacked actions,
 *   no sideways scroll at 375 and 320, no breadcrumb trail
 * - Preferences, theme: Theme select applies at once and shows in the avatar menu / More sheet
 * - AC4 browser language: a German browser sees German on first visit, "System (browser language)"
 * - AC3: Settings opens Project setup; Account is its view
 * - Hash: `/settings/profile#calendar-sync` focuses and scrolls to the sync heading
 *
 * Preference writes are mocked so the shared test user's stored theme and language are never
 * changed for parallel tests. Token endpoints are mocked (10 POSTs an hour). Synthetic data only.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { ProfilePage } from '../../pages/ProfilePage.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { ROUTES } from '../../fixtures/testData.js';

/** Mock `GET /api/auth/me` for this page only (complete payload, synthetic user). */
async function mockAuthMe(
  page: Page,
  options: {
    authProvider: 'local' | 'oidc';
    oidcEnabled: boolean;
    oidcLinked?: boolean;
    displayName?: string;
    email?: string;
  },
): Promise<void> {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'e2e-synthetic-user',
          email: options.email ?? 'builder@example.test',
          displayName: options.displayName ?? 'Sample Builder',
          role: 'admin',
          authProvider: options.authProvider,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          oidcLinked: options.oidcLinked ?? options.authProvider === 'oidc',
        },
        setupRequired: false,
        oidcEnabled: options.oidcEnabled,
      }),
    });
  });
}

/**
 * Mock the preference endpoints: reads return no stored preference, writes echo success. Keeps
 * the shared E2E user's stored theme and language untouched. Returns the list of written bodies.
 */
async function mockPreferences(page: Page): Promise<{ key: string; value: string }[]> {
  const writes: { key: string; value: string }[] = [];
  await page.route('**/api/users/me/preferences**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ preferences: [] }),
      });
      return;
    }
    const body = request.postDataJSON() as { key?: string; value?: string } | null;
    if (body?.key !== undefined && body.value !== undefined) {
      writes.push({ key: body.key, value: body.value });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        preference: {
          key: body?.key ?? 'unknown',
          value: body?.value ?? '',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    });
  });
  return writes;
}

test.describe('Account page layout', { tag: '@responsive' }, () => {
  test('AC1/AC2: the four sections appear in order with their contents', async ({ page }) => {
    const profilePage = new ProfilePage(page);
    await profilePage.goto();

    for (const section of [
      profilePage.profileSection,
      profilePage.syncSection,
      profilePage.preferencesSection,
      profilePage.passwordSection,
    ]) {
      await expect(section).toBeVisible();
    }

    // Visual and DOM order: Profile, Calendar & contacts sync, Preferences, Password
    const tops: number[] = [];
    for (const section of [
      profilePage.profileSection,
      profilePage.syncSection,
      profilePage.preferencesSection,
      profilePage.passwordSection,
    ]) {
      const box = await section.boundingBox();
      if (!box) throw new Error('section has no box');
      tops.push(box.y);
    }
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(new Set(tops).size).toBe(4);

    // One labelled h2 per section, in the same order
    await expect(page.locator('main h2')).toHaveText([
      'Your details',
      'Calendar & contacts sync',
      'Preferences',
      'Password',
    ]);
    for (const section of [
      profilePage.profileSection,
      profilePage.syncSection,
      profilePage.preferencesSection,
      profilePage.passwordSection,
    ]) {
      await expect(section).toHaveAttribute('aria-labelledby', /.+/);
    }

    // Profile: facts and the display name field
    await expect(profilePage.profileSection.locator('dt', { hasText: 'Email' })).toBeVisible();
    await expect(profilePage.profileSection.locator('dt', { hasText: 'Role' })).toBeVisible();
    await expect(
      profilePage.profileSection.locator('dt', { hasText: 'Member since' }),
    ).toBeVisible();
    await expect(profilePage.profileSection.locator('#displayName')).toBeVisible();

    // Preferences: both selects, no Save button
    await expect(profilePage.preferencesSection.locator('select')).toHaveCount(2);
    await expect(profilePage.preferencesSection.locator('#languageSelect')).toBeVisible();
    await expect(profilePage.preferencesSection.locator('#themeSelect')).toBeVisible();
    await expect(profilePage.preferencesSection.getByRole('button')).toHaveCount(0);
    await expect(profilePage.themeSelect.locator('option')).toHaveText(['Light', 'Dark', 'System']);

    // Password: the form for the local admin
    await expect(profilePage.passwordSection.locator('#currentPassword')).toBeVisible();
    await expect(profilePage.oidcMessage).toHaveCount(0);

    // Account is a navigation view: no breadcrumb trail
    await expect(page.locator('nav[aria-label="You are here"]')).toHaveCount(0);
  });

  test('AC1: a single sign-on account sees the sign-in row and the note, not the form', async ({
    page,
  }) => {
    await mockAuthMe(page, { authProvider: 'oidc', oidcEnabled: true });
    const profilePage = new ProfilePage(page);
    await profilePage.goto();

    const info = await profilePage.getProfileInfo();
    expect(info.email).toBe('builder@example.test');
    expect(info.signInMethod).toBe('Single sign-on');
    await expect(profilePage.displayNameInput).toHaveValue('Sample Builder');

    await expect(profilePage.oidcMessage).toBeVisible();
    await expect(profilePage.passwordSection.locator('#currentPassword')).toHaveCount(0);
    await expect(profilePage.changePasswordButton).toHaveCount(0);
    // The note is static text, not a live region
    await expect(
      profilePage.passwordSection.locator('[role="status"], [role="alert"]'),
    ).toHaveCount(0);
  });

  test('AC1: a local account without single sign-on has no sign-in row', async ({ page }) => {
    await mockAuthMe(page, { authProvider: 'local', oidcEnabled: false });
    const profilePage = new ProfilePage(page);
    await profilePage.goto();

    const info = await profilePage.getProfileInfo();
    expect(info.signInMethod).toBeNull();
    await expect(profilePage.profileSection.locator('dt')).toHaveText([
      'Email',
      'Role',
      'Member since',
    ]);
    await expect(profilePage.passwordSection.locator('#currentPassword')).toBeVisible();
    await expect(profilePage.oidcMessage).toHaveCount(0);
  });

  test('AC1: a local account linked to single sign-on keeps its password form', async ({
    page,
  }) => {
    await mockAuthMe(page, { authProvider: 'local', oidcEnabled: true, oidcLinked: true });
    const profilePage = new ProfilePage(page);
    await profilePage.goto();

    const info = await profilePage.getProfileInfo();
    expect(info.signInMethod).toBe('Email, password and single sign-on');
    await expect(profilePage.passwordSection.locator('#currentPassword')).toBeVisible();
    await expect(profilePage.oidcMessage).toHaveCount(0);
  });

  test('Preferences, theme: the Theme select applies at once and the shell menu agrees', async ({
    page,
  }) => {
    const writes = await mockPreferences(page);
    const profilePage = new ProfilePage(page);
    const shell = new AppShellPage(page);
    await profilePage.goto();

    // When: User picks Dark in the Theme select
    await profilePage.themeSelect.focus();
    await profilePage.themeSelect.selectOption('dark');

    // Then: The theme applies immediately and the select keeps focus
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(profilePage.themeSelect).toHaveValue('dark');
    await expect(profilePage.themeSelect).toBeFocused();
    await expect.poll(() => writes).toContainEqual({ key: 'theme', value: 'dark' });

    // And: The avatar menu (desktop) or the More sheet (phone and tablet) shows Dark selected
    if (shell.isCompact()) {
      await shell.openMoreSheet();
      await expect(shell.themeOption('dark')).toBeChecked();
      await shell.closeMoreSheet();
    } else {
      await shell.openUserMenu();
      await expect(shell.themeOption('dark')).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('Escape');
      await expect(shell.userMenu).toBeHidden();
    }

    // When: User picks System again
    await profilePage.themeSelect.selectOption('system');

    // Then: Dark is no longer forced
    await expect(profilePage.themeSelect).toHaveValue('system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => writes).toContainEqual({ key: 'theme', value: 'system' });
  });

  test('Preferences, language: the select lists English, Deutsch and the browser option', async ({
    page,
  }) => {
    await mockPreferences(page);
    const profilePage = new ProfilePage(page);
    await profilePage.goto();

    await expect(profilePage.languageSelect.locator('option')).toHaveText([
      'English',
      'Deutsch',
      'System (browser language)',
    ]);
    await expect(profilePage.languageSelect.locator('option[value="de"]')).toHaveAttribute(
      'lang',
      'de',
    );
  });

  test('Hash: #calendar-sync focuses the sync heading and scrolls it into view', async ({
    page,
  }) => {
    const profilePage = new ProfilePage(page);

    await page.goto(`${ROUTES.profile}#calendar-sync`);

    await expect(profilePage.syncHeading).toBeFocused();
    await expect(profilePage.syncHeading).toBeInViewport();
    await expect(profilePage.syncHeading).toHaveText('Calendar & contacts sync');
  });

  test('Without the hash the sync heading does not take focus', async ({ page }) => {
    const profilePage = new ProfilePage(page);
    await profilePage.goto();

    await expect(profilePage.syncHeading).not.toBeFocused();
  });
});

test.describe('Account page responsive sizes (UX spec section 10)', { tag: '@responsive' }, () => {
  // Column widths from the UX spec: 343 at a 375px phone, 640 on tablet and desktop
  for (const [width, expected] of [
    [375, 343],
    [768, 640],
    [1280, 640],
  ] as const) {
    test(`the sections column is ${expected}px wide at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const profilePage = new ProfilePage(page);
      await profilePage.goto();

      const column = profilePage.profileSection.locator('..');
      const box = await column.boundingBox();
      if (!box) throw new Error('sections column has no box');
      expect(Math.abs(box.width - expected)).toBeLessThanOrEqual(1);
      // Every section fills the column
      for (const section of [
        profilePage.profileSection,
        profilePage.syncSection,
        profilePage.preferencesSection,
        profilePage.passwordSection,
      ]) {
        const sectionBox = await section.boundingBox();
        if (!sectionBox) throw new Error('section has no box');
        expect(Math.abs(sectionBox.width - box.width)).toBeLessThanOrEqual(1);
      }

      await expect(page.locator('nav[aria-label="You are here"]')).toHaveCount(0);
    });
  }

  for (const width of [375, 320]) {
    test(`no sideways scroll at ${width}px, with a token on screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const profilePage = new ProfilePage(page);
      await profilePage.mockTokenEndpoints('e2e-synthetic-token-' + '0'.repeat(40), true);
      await profilePage.goto();
      await profilePage.regenerateTokenButton.click();
      await profilePage.regenerateDialog.confirm();
      await expect(profilePage.tokenDisplay).toBeVisible();

      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
    });
  }

  test('phone: every control is at least 44px tall and the sync actions are stacked', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    const profilePage = new ProfilePage(page);
    await profilePage.mockTokenEndpoints('e2e-synthetic-token-0001', true);
    await profilePage.goto();

    // Stacked actions: equal x, equal full width
    const actions = [
      profilePage.downloadProfileLink,
      profilePage.regenerateTokenButton,
      profilePage.revokeTokenButton,
    ];
    const boxes = [];
    for (const action of actions) {
      await expect(action).toBeVisible();
      const box = await action.boundingBox();
      if (!box) throw new Error('action has no box');
      boxes.push(box);
    }
    const [download, regenerate, revoke] = boxes;
    if (!download || !regenerate || !revoke) throw new Error('missing action box');
    for (const box of boxes) {
      expect(Math.abs(box.x - download.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.width - download.width)).toBeLessThanOrEqual(1);
    }
    expect(regenerate.y).toBeGreaterThan(download.y);
    expect(revoke.y).toBeGreaterThan(regenerate.y);

    // Bring up Copy and Hide as well, then measure everything interactive inside the page
    await profilePage.regenerateTokenButton.click();
    await profilePage.regenerateDialog.confirm();
    await expect(profilePage.copyButton).toBeVisible();

    const controls = profilePage.page
      .getByRole('main')
      .locator(
        'button, select, input:not([type="hidden"]), a[data-testid="account-sync-download"]',
      );
    const count = await controls.count();
    expect(count).toBeGreaterThan(8);
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      if (!(await control.isVisible())) continue;
      const box = await control.boundingBox();
      if (!box) continue;
      const label = await control.evaluate(
        (el) => el.getAttribute('data-testid') ?? el.getAttribute('id') ?? el.tagName,
      );
      expect(box.height, `control ${label} is at least 44px tall`).toBeGreaterThanOrEqual(43.5);
    }
  });

  test('desktop and tablet: sync actions sit in one row, not stacked', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const profilePage = new ProfilePage(page);
    await profilePage.mockTokenEndpoints('e2e-synthetic-token-0001', true);
    await profilePage.goto();

    const regenerate = await profilePage.regenerateTokenButton.boundingBox();
    const revoke = await profilePage.revokeTokenButton.boundingBox();
    if (!regenerate || !revoke) throw new Error('action buttons have no box');
    expect(Math.abs(regenerate.y - revoke.y)).toBeLessThanOrEqual(1);
    expect(revoke.x).toBeGreaterThan(regenerate.x);
  });
});

test.describe('Account page navigation (AC3)', { tag: '@responsive' }, () => {
  test('AC3: Settings opens Project setup and Account is its view', async ({ page }) => {
    const shell = new AppShellPage(page);
    await page.goto(ROUTES.home);
    await shell.navigateTo('settingsManage');

    await expect(page).toHaveURL((url) => url.pathname === ROUTES.manage);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Project setup', exact: true }),
    ).toBeVisible();

    await shell.revealViews();
    await expect(shell.viewLink('settingsProfile')).toContainText('Account');
    await shell.viewLink('settingsProfile').click();

    await expect(page).toHaveURL((url) => url.pathname === ROUTES.profile);
    const profilePage = new ProfilePage(page);
    await expect(profilePage.heading).toBeVisible();
    await expect(profilePage.profileSection).toBeVisible();
  });
});

test.describe('Account page in a German browser (AC4)', { tag: '@responsive' }, () => {
  test.use({ locale: 'de-DE' });

  test('AC4: first visit is German and the language select says "system"; switching works', async ({
    page,
  }) => {
    // The shared session may carry a stored locale; drop it once per tab (not on reload)
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem('e2e-locale-cleared')) {
          localStorage.removeItem('locale');
          sessionStorage.setItem('e2e-locale-cleared', '1');
        }
      } catch {
        // storage unavailable: nothing to clear
      }
    });
    await mockPreferences(page);
    const profilePage = new ProfilePage(page);

    await page.goto(ROUTES.profile);

    // German UI without any choice made
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveText('Konto');
    await expect(profilePage.languageSelect).toHaveValue('system');

    // Switching to English updates the page in place...
    await profilePage.languageSelect.selectOption('en');
    await expect(h1).toHaveText('Account');
    await expect(profilePage.languageSelect).toHaveValue('en');
    await expect(profilePage.languageSelect.locator('option[value="system"]')).toHaveText(
      'System (browser language)',
    );

    // ...and sticks after a reload
    await page.reload();
    await expect(h1).toHaveText('Account');
  });
});
