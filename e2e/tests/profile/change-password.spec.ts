/**
 * E2E tests for changing password (Story #36)
 */

import { test, expect } from '../../fixtures/auth.js';
import { ProfilePage } from '../../pages/ProfilePage.js';
import { LoginPage } from '../../pages/LoginPage.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { ROUTES } from '../../fixtures/testData.js';
import { createLocalUserViaApi, deleteUserViaApi } from '../../fixtures/apiHelpers.js';

test.describe('Change Password', { tag: '@responsive' }, () => {
  // Serialize tests within this describe block to keep serial state expectations stable
  // (e.g., "Local user sees password change form" runs before the change test).
  test.describe.configure({ mode: 'serial' });

  test('Local user sees password change form', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is a local auth user (not OIDC)
    await profilePage.goto();

    // Then: Password change form should be visible
    await expect(profilePage.passwordSection).toBeVisible();
    await expect(profilePage.currentPasswordInput).toBeVisible();
    await expect(profilePage.newPasswordInput).toBeVisible();
    await expect(profilePage.confirmPasswordInput).toBeVisible();
    await expect(profilePage.changePasswordButton).toBeVisible();

    // And: OIDC message should NOT be visible
    const isOidcUser = await profilePage.isOidcUser();
    expect(isOidcUser).toBe(false);
  });

  test('Local user changes password successfully', async ({ page, browser, testPrefix }) => {
    // Create a dedicated user so that the password-change flow does NOT mutate the
    // shared TEST_ADMIN credentials, eliminating 401 races across parallel workers.
    const dedicatedEmail = `pwchange-${testPrefix}@e2e-test.local`;
    const originalPassword = 'pw-orig-123!';
    const newPassword = 'pw-new-secure-456!';

    // Use the main page fixture (has admin session) to create the dedicated user.
    const dedicatedUser = await createLocalUserViaApi(page, {
      email: dedicatedEmail,
      displayName: 'E2E PwChange User',
      password: originalPassword,
    });

    // Use an isolated browser context so the logout/re-login cycle does NOT
    // touch the shared storageState session used by parallel tests.
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const scopedPage = await context.newPage();

    try {
      // Log in as the dedicated user
      const loginPage = new LoginPage(scopedPage);
      await loginPage.goto();
      await loginPage.login(dedicatedEmail, originalPassword);
      await expect(scopedPage).toHaveURL(ROUTES.home);

      const profilePage = new ProfilePage(scopedPage);

      // Given: User is on profile page
      await profilePage.goto();

      // When: User changes password
      await profilePage.changePassword(originalPassword, newPassword, newPassword);

      // Then: Success banner should appear
      const successBanner = await profilePage.getPasswordSuccessBanner();
      expect(successBanner).toBeTruthy();
      expect(successBanner?.toLowerCase()).toContain('success');

      // Verify new password works by logging out and back in
      const appShell = new AppShellPage(scopedPage);
      const viewport = scopedPage.viewportSize();
      if (viewport && viewport.width < 1024) {
        await appShell.openSidebar();
      }
      await appShell.logout();

      await loginPage.login(dedicatedEmail, newPassword);
      await expect(scopedPage).toHaveURL(ROUTES.home);
    } finally {
      await context.close();
      // Delete the dedicated user using the main admin page fixture.
      await deleteUserViaApi(page, dedicatedUser.id);
    }
  });

  test('Wrong current password shows error', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is on profile page
    await profilePage.goto();

    // When: User enters wrong current password
    await profilePage.changePassword('wrong-password', 'new-password-123!', 'new-password-123!');

    // Then: Error message should appear (server returns "Current password is incorrect")
    const errorBanner = await profilePage.getPasswordErrorBanner();
    expect(errorBanner).toBeTruthy();
    expect(errorBanner?.toLowerCase()).toContain('incorrect');
  });

  test('New passwords must match validation', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is on profile page
    await profilePage.goto();

    // When: User enters mismatched passwords
    await profilePage.currentPasswordInput.fill('e2e-secure-password-123!');
    await profilePage.newPasswordInput.fill('new-password-123!');
    await profilePage.confirmPasswordInput.fill('different-password-123!');
    await profilePage.changePasswordButton.click();

    // Then: Should show validation error or button disabled
    const isDisabled = await profilePage.changePasswordButton.isDisabled();
    const errorBanner = await profilePage.getPasswordErrorBanner();

    // Either client-side validation prevents submit OR server returns error
    expect(isDisabled || errorBanner).toBeTruthy();
  });

  test('Password form requires all fields', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is on profile page
    await profilePage.goto();

    // When: User tries to submit with empty fields
    await profilePage.changePasswordButton.click();

    // Then: Submit button should be disabled or remain on page
    const url = page.url();
    expect(url).toContain(ROUTES.profile);
  });

  /**
   * TODO: OIDC user test requires an OIDC-authenticated user session.
   * This will be testable after the oidc.spec.ts tests run and create an OIDC user.
   *
   * Expected behavior:
   * - OIDC user sees message: "Your credentials are managed by your identity provider."
   * - No password change form visible
   */
});
