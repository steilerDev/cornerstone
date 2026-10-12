/**
 * E2E tests for changing password (Story #36, labels and focus rules reworked in #2214)
 */

import type { Locator } from '@playwright/test';
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

    // Then: The confirm field shows the error and takes focus; the server was not asked
    await expect(page.locator('#confirmPassword-error')).toHaveText('Passwords do not match');
    await expect(profilePage.confirmPasswordInput).toHaveAttribute('aria-invalid', 'true');
    await expect(profilePage.confirmPasswordInput).toBeFocused();
    await expect(profilePage.passwordErrorBanner).toHaveCount(1); // the field error only
  });

  test('Password form requires all fields; focus goes to the first invalid field', async ({
    page,
  }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is on profile page
    await profilePage.goto();

    // When: User submits with empty fields
    await profilePage.changePasswordButton.click();

    // Then: Every empty field reports its error, and focus is on the first (current password)
    await expect(page.locator('#currentPassword-error')).toHaveText('Current password is required');
    await expect(page.locator('#newPassword-error')).toHaveText('New password is required');
    await expect(page.locator('#confirmPassword-error')).toHaveText(
      'Please confirm your new password',
    );
    await expect(profilePage.currentPasswordInput).toBeFocused();
    await expect(page).toHaveURL((url) => url.pathname === ROUTES.profile);
  });

  test('A too-short new password focuses the new password field', async ({ page }) => {
    const profilePage = new ProfilePage(page);
    await profilePage.goto();

    await profilePage.currentPasswordInput.fill('e2e-secure-password-123!');
    await profilePage.newPasswordInput.fill('short');
    await profilePage.confirmPasswordInput.fill('short');
    await profilePage.changePasswordButton.click();

    await expect(page.locator('#newPassword-error')).toHaveText(
      'New password must be at least 12 characters',
    );
    await expect(profilePage.newPasswordInput).toBeFocused();
  });

  test('Change password is a secondary button; the hint states the minimum length', async ({
    page,
  }) => {
    const profilePage = new ProfilePage(page);
    await profilePage.goto();

    await expect(
      profilePage.passwordSection.getByText('Use at least 12 characters.'),
    ).toBeVisible();
    await expect(profilePage.changePasswordButton).toHaveText('Change password');
    // Secondary, not the page's primary action (the primary is Save in the Profile section)
    const background = (locator: Locator) =>
      locator.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await background(profilePage.changePasswordButton)).not.toBe(
      await background(profilePage.saveDisplayNameButton),
    );
  });

  // The single sign-on note for SSO-only accounts is covered in account-layout.spec.ts
  // (mocked `GET /api/auth/me`), because no real SSO user exists in this suite.
});
