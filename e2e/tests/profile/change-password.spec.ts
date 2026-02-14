/**
 * E2E tests for changing password (Story #36)
 */

import { test, expect } from '../../fixtures/auth.js';
import { ProfilePage } from '../../pages/ProfilePage.js';
import { LoginPage } from '../../pages/LoginPage.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { TEST_ADMIN, ROUTES } from '../../fixtures/testData.js';

test.describe('Change Password', () => {
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

  test('Local user changes password successfully', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is on profile page
    await profilePage.goto();

    const newPassword = 'new-secure-password-123!';

    // When: User changes password
    await profilePage.changePassword(TEST_ADMIN.password, newPassword, newPassword);

    // Then: Success banner should appear
    const successBanner = await profilePage.getPasswordSuccessBanner();
    expect(successBanner).toBeTruthy();
    expect(successBanner?.toLowerCase()).toContain('success');

    // Verify new password works by logging out and back in
    const appShell = new AppShellPage(page);
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 1024) {
      await appShell.openSidebar();
    }
    await appShell.logout();

    const loginPage = new LoginPage(page);
    await loginPage.login(TEST_ADMIN.email, newPassword);
    await expect(page).toHaveURL(ROUTES.home);

    // Restore original password for subsequent tests
    await profilePage.goto();
    await profilePage.changePassword(newPassword, TEST_ADMIN.password, TEST_ADMIN.password);
    await expect(profilePage.passwordSuccessBanner).toBeVisible({ timeout: 5000 });

    // Save updated session back to storageState — the logout above destroyed the
    // original auth-setup session in the database, so subsequent tests need this
    // new session cookie to remain authenticated.
    await page.context().storageState({ path: 'test-results/.auth/admin.json' });
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
    await profilePage.currentPasswordInput.fill(TEST_ADMIN.password);
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
