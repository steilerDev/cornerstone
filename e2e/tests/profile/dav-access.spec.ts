/**
 * E2E tests for the "Calendar & contacts sync" section of the Account page
 * (Story #933, reworked in #2214)
 *
 * UAT Scenarios covered:
 * - Scenario 1: [smoke] The sync section is present on the Account page
 * - Scenario 2: Generate a token - token code appears, "Regenerate token" visible
 * - Scenario 3: Token shown only once - after navigating away, code is hidden
 * - Scenario 4: Regenerate token - asks "Create a new token?" first, then shows a new token
 * - Scenario 5: Download Apple profile link visible after token is generated
 * - Scenario 6: Revoke token - "Generate token" shown again, no Download link
 * - Scenario 6b (#2209): Revoke asks in the ConfirmDialog (no native confirm); Cancel keeps the token
 * - Scenario 7: Legacy feeds return 404 - GET /feeds/cal.ics returns HTTP 404
 * - Scenarios 8.x (#2214, mocked token endpoints, the real one allows 10 POSTs an hour): focus
 *   moves Generate -> Copy, Hide -> Regenerate, Regenerate/Revoke dialogs, Copy announcement
 */

import { test, expect } from '../../fixtures/auth.js';
import { ProfilePage } from '../../pages/ProfilePage.js';
import { ROUTES } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared setup/teardown: ensure a clean token state before each test.
// Revoke any existing token so tests start from a known baseline.
// ─────────────────────────────────────────────────────────────────────────────

// Real token generation on the shared admin: the lock keeps parallel workers and projects from
// revoking each other's token mid-test.
test.describe('Calendar & contacts sync', { lock: 'admin-dav-token' }, () => {
  test.beforeEach(async ({ page }) => {
    // Unconditionally attempt to revoke any existing token.
    // A 204 or 404 are both acceptable — we only care that no token is active.
    await page.request.delete('/api/users/me/dav/token');
  });

  test.afterEach(async ({ page }) => {
    // Clean up: revoke token created during the test so the shared DB stays tidy.
    await page.request.delete('/api/users/me/dav/token');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 1 (smoke): the sync section is present
  // ─────────────────────────────────────────────────────────────────────────

  test(
    '[smoke] Calendar & contacts sync section is visible on the Account page',
    { tag: '@smoke' },
    async ({ page }) => {
      const profilePage = new ProfilePage(page);

      // Given: User is authenticated
      // When: User navigates to the Account page
      await profilePage.goto();

      // Then: The section heading is visible
      await expect(profilePage.syncSection).toBeVisible();
      await expect(
        profilePage.syncSection.getByRole('heading', {
          level: 2,
          name: 'Calendar & contacts sync',
          exact: true,
        }),
      ).toBeVisible();

      // And: The "Generate token" button is present (no token active yet)
      await expect(profilePage.generateTokenButton).toBeVisible();
      await expect(profilePage.generateTokenButton).toHaveText('Generate token');

      // And: Plain words only - no protocol jargon in the section's labels
      await expect(profilePage.syncSection).not.toContainText(/DAV|OIDC/);
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 2: Generate a token
  // ─────────────────────────────────────────────────────────────────────────

  test('Generate token — token code appears and Regenerate button shown', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is on the Account page with no active token
    await profilePage.goto();
    await expect(profilePage.generateTokenButton).toBeVisible();

    // When: User clicks "Generate token"
    const tokenText = await profilePage.generateToken();

    // Then: A non-empty token code is displayed
    expect(tokenText.length).toBeGreaterThan(0);

    // And: The token display code element is visible
    await expect(profilePage.tokenDisplay).toBeVisible();

    // And: "Regenerate token" button is now visible (hasToken = true)
    await expect(profilePage.regenerateTokenButton).toBeVisible();

    // And: "Generate token" button is gone
    await expect(profilePage.generateTokenButton).not.toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 3: Token shown only once — hidden after navigation
  // ─────────────────────────────────────────────────────────────────────────

  test('Token code is hidden after navigating away and back', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User generates a token
    await profilePage.goto();
    await profilePage.generateToken();
    await expect(profilePage.tokenDisplay).toBeVisible();

    // When: User navigates away
    await page.goto(ROUTES.home);
    await page.waitForURL((url) => url.pathname === ROUTES.home);

    // And: User navigates back to the Account page
    await profilePage.goto();

    // Then: The token code element is no longer displayed
    await expect(profilePage.tokenDisplay).not.toBeVisible();

    // But: The status still shows the token is active (Regenerate button visible)
    await expect(profilePage.regenerateTokenButton).toBeVisible();

    // And: The "Token active since ..." message is present in the sync section
    await expect(profilePage.syncSection).toContainText(/Token active since/);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 4: Regenerate token — confirm first, then a new token is displayed
  // ─────────────────────────────────────────────────────────────────────────

  test('Regenerate token — confirms, then a new token code is displayed', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: A token was previously generated
    await profilePage.goto();
    const firstToken = await profilePage.generateToken();
    expect(firstToken.length).toBeGreaterThan(0);

    // When: User clicks "Regenerate token" and confirms
    const newToken = await profilePage.regenerateToken();

    // Then: A new token code is displayed
    await expect(profilePage.tokenDisplay).toBeVisible();
    expect(newToken.length).toBeGreaterThan(0);
    expect(newToken).not.toBe(firstToken);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 5: Download Apple profile link is visible after token generation
  // ─────────────────────────────────────────────────────────────────────────

  test('Download Apple profile link is present after token is generated', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: No active token — Download link should not be shown
    await profilePage.goto();
    await expect(profilePage.downloadProfileLink).not.toBeVisible();

    // When: User generates a token
    await profilePage.generateToken();

    // Then: The "Download Apple profile" link appears
    await expect(profilePage.downloadProfileLink).toBeVisible();
    await expect(profilePage.downloadProfileLink).toHaveText('Download Apple profile');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 6: Revoke token
  // ─────────────────────────────────────────────────────────────────────────

  test('Revoke token — Generate token button shown, Download link gone', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: A token is active
    await profilePage.goto();
    await profilePage.generateToken();
    await expect(profilePage.regenerateTokenButton).toBeVisible();

    // When: User revokes the token
    await profilePage.revokeToken();

    // Then: The "Generate token" button is back
    await expect(profilePage.generateTokenButton).toBeVisible();

    // And: "Regenerate token" is gone
    await expect(profilePage.regenerateTokenButton).not.toBeVisible();

    // And: The "Download Apple profile" link is no longer shown
    await expect(profilePage.downloadProfileLink).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6b (#2209) and 8.x (#2214): mocked token endpoints, no real generation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Calendar & contacts sync — dialogs and focus (mocked token endpoints)', () => {
  test('Revoke token asks in the ConfirmDialog; Cancel keeps the token', async ({ page }) => {
    const profilePage = new ProfilePage(page);
    const nativeDialogs: string[] = [];
    page.on('dialog', (native) => {
      nativeDialogs.push(native.message());
      void native.dismiss();
    });

    // Given: A token is active
    await profilePage.mockTokenEndpoints('e2e-synthetic-token-0001', true);
    await profilePage.goto();
    await expect(profilePage.regenerateTokenButton).toBeVisible();

    // When: User clicks Revoke token
    await profilePage.revokeTokenButton.click();

    // Then: The dialog explains the consequence, with Cancel focused
    await expect(profilePage.revokeDialog.dialog).toHaveAccessibleName('Revoke calendar access?');
    await expect(profilePage.revokeDialog.confirmButton).toHaveText('Revoke');
    await expect(profilePage.revokeDialog.cancelButton).toBeFocused();

    // And: Cancel keeps the token
    await profilePage.revokeDialog.cancel();
    await expect(profilePage.regenerateTokenButton).toBeVisible();
    expect(nativeDialogs).toEqual([]);
  });

  test('Generate moves focus to Copy; Hide token moves it to Regenerate', async ({ page }) => {
    const profilePage = new ProfilePage(page);
    const mock = await profilePage.mockTokenEndpoints();
    await profilePage.goto();

    // When: User generates a token
    await profilePage.generateTokenButton.click();

    // Then: The token shows once and focus moves to Copy (never to the body)
    await expect(profilePage.tokenDisplay).toHaveText(mock.token);
    await expect(profilePage.copyButton).toBeFocused();

    // When: User hides the token
    await profilePage.hideTokenButton.click();

    // Then: The token is gone and focus is on Regenerate
    await expect(profilePage.tokenDisplay).toHaveCount(0);
    await expect(profilePage.regenerateTokenButton).toBeFocused();
    expect(mock.posts()).toBe(1);
  });

  test('The token sits in its own live region; Copy and Hide are outside it', async ({ page }) => {
    const profilePage = new ProfilePage(page);
    await profilePage.mockTokenEndpoints();
    await profilePage.goto();
    await profilePage.generateTokenButton.click();
    await expect(profilePage.tokenDisplay).toBeVisible();

    const region = profilePage.syncSection.locator('[role="status"][aria-atomic="true"]');
    await expect(region).toHaveCount(1);
    await expect(region).toContainText('Copy this token now. It is shown only once.');
    await expect(region.getByTestId('account-sync-token')).toBeVisible();
    await expect(region.locator('button')).toHaveCount(0);
    // Copy has its visible label as its name (no aria-label override)
    await expect(profilePage.copyButton).not.toHaveAttribute('aria-label', /.+/);
    await expect(profilePage.copyButton).toHaveText('Copy');
  });

  test('Regenerate asks "Create a new token?"; Cancel sends nothing and keeps focus', async ({
    page,
  }) => {
    const profilePage = new ProfilePage(page);
    const mock = await profilePage.mockTokenEndpoints('e2e-synthetic-token-0001', true);
    await profilePage.goto();

    // When: User clicks Regenerate token
    await profilePage.regenerateTokenButton.click();

    // Then: The dialog states the consequence in plain words, Cancel focused
    await expect(profilePage.regenerateDialog.dialog).toHaveAccessibleName('Create a new token?');
    await expect(profilePage.regenerateDialog.dialog).toContainText(
      'Apps using the current token stop syncing until you update them.',
    );
    await expect(profilePage.regenerateDialog.confirmButton).toHaveText('Create new token');
    await expect(profilePage.regenerateDialog.cancelButton).toBeFocused();

    // When: User cancels
    await profilePage.regenerateDialog.cancel();

    // Then: No token was requested and focus is somewhere sensible, never the body
    expect(mock.posts()).toBe(0);
    await expect(profilePage.tokenDisplay).toHaveCount(0);
    await expect(page.locator('body')).not.toBeFocused();
    await expect(profilePage.regenerateTokenButton).toBeFocused();
  });

  test('Regenerate confirm shows the new token and focuses Copy', async ({ page }) => {
    const profilePage = new ProfilePage(page);
    const mock = await profilePage.mockTokenEndpoints('e2e-synthetic-token-0002', true);
    await profilePage.goto();

    await profilePage.regenerateTokenButton.click();
    await profilePage.regenerateDialog.confirm();

    await expect(profilePage.regenerateDialog.dialog).toBeHidden();
    await expect(profilePage.tokenDisplay).toHaveText('e2e-synthetic-token-0002');
    await expect(profilePage.copyButton).toBeFocused();
    expect(mock.posts()).toBe(1);
  });

  test('Revoke confirm returns focus to the section heading and shows Generate token', async ({
    page,
  }) => {
    const profilePage = new ProfilePage(page);
    await profilePage.mockTokenEndpoints('e2e-synthetic-token-0001', true);
    await profilePage.goto();

    await profilePage.revokeTokenButton.click();
    await profilePage.revokeDialog.confirm();
    await expect(profilePage.revokeDialog.dialog).toBeHidden();

    await expect(profilePage.generateTokenButton).toBeVisible();
    await expect(profilePage.syncHeading).toBeFocused();
  });

  test('Copy token reads "Copied" and announces "Token copied"', async ({ page }, testInfo) => {
    const profilePage = new ProfilePage(page);
    if (testInfo.project.name === 'desktop') {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    await profilePage.mockTokenEndpoints();
    await profilePage.goto();
    await profilePage.generateTokenButton.click();
    await expect(profilePage.copyButton).toBeFocused();

    // The announcer is always mounted, empty and not atomic
    await expect(profilePage.copyStatus).toBeEmpty();
    await expect(profilePage.copyStatus).toHaveAttribute('role', 'status');
    await expect(profilePage.copyStatus).not.toHaveAttribute('aria-atomic', /.*/);

    await profilePage.copyButton.click();

    await expect(profilePage.copyButton).toHaveText('Copied');
    await expect(profilePage.copyStatus).toHaveText('Token copied');
    // ...and it resets by itself
    await expect(profilePage.copyButton).toHaveText('Copy');
    await expect(profilePage.copyStatus).toBeEmpty();
  });

  test('Busy buttons stay focusable: aria-disabled, never natively disabled', async ({ page }) => {
    const profilePage = new ProfilePage(page);
    // Hold the POST so the busy state can be observed
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/users/me/dav/token', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        await gate;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ token: 'e2e-synthetic-token-0003' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ hasToken: false }),
        });
      }
    });
    await profilePage.goto();

    await profilePage.generateTokenButton.click();

    await expect(profilePage.generateTokenButton).toHaveText('Generating...');
    await expect(profilePage.generateTokenButton).toHaveAttribute('aria-disabled', 'true');
    await expect(profilePage.generateTokenButton).not.toHaveAttribute('disabled');
    await expect(profilePage.generateTokenButton).toBeFocused();
    release();
    await expect(profilePage.tokenDisplay).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Legacy feeds return 404
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Legacy feed routes (Scenario 7)', () => {
  test('GET /feeds/cal.ics returns HTTP 404', async ({ page }) => {
    // Given: User is authenticated (session cookie from fixture)

    // When: A request is made directly to the legacy cal.ics feed URL
    const response = await page.request.get('/feeds/cal.ics');

    // Then: The server responds with 404 (legacy feed removed)
    expect(response.status()).toBe(404);
  });
});
