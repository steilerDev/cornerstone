/**
 * E2E tests for login and logout flows (Stories #30, #32)
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { TEST_ADMIN, ROUTES } from '../../fixtures/testData.js';

test.describe('Login and Logout', { tag: '@responsive' }, () => {
  // Clear auth state for these tests
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Successful login redirects to dashboard', { tag: '@smoke' }, async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Given: User is on the login page
    await loginPage.goto();

    // When: User enters valid credentials and submits
    await loginPage.login(TEST_ADMIN.email, TEST_ADMIN.password);

    // Then: User should be redirected to dashboard
    await expect(page).toHaveURL(ROUTES.home);
  });

  test('Wrong password shows generic error', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Given: User is on the login page
    await loginPage.goto();

    // When: User enters valid email but wrong password
    await loginPage.login(TEST_ADMIN.email, 'wrong-password-123!');

    // Then: Generic error message should appear
    const error = await loginPage.getErrorBanner();
    expect(error).toBeTruthy();
    expect(error?.toLowerCase()).toContain('invalid');
  });

  test('Non-existent email shows same generic error', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Given: User is on the login page
    await loginPage.goto();

    // When: User enters non-existent email
    await loginPage.login('nonexistent@example.com', 'some-password');

    // Then: Same generic error message (no info leakage about account existence)
    const error = await loginPage.getErrorBanner();
    expect(error).toBeTruthy();
    expect(error?.toLowerCase()).toContain('invalid');
  });

  test('Logout clears session and redirects to /login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const appShell = new AppShellPage(page);

    // Given: User is logged in
    await loginPage.goto();
    await loginPage.login(TEST_ADMIN.email, TEST_ADMIN.password);
    await expect(page).toHaveURL(ROUTES.home);

    // Open sidebar if on mobile/tablet viewport
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 1024) {
      await appShell.openSidebar();
    }

    // When: User clicks Logout
    await appShell.logout();

    // Then: Should redirect to login page
    await expect(page).toHaveURL(ROUTES.login);
  });

  test('After logout, protected routes redirect to /login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const appShell = new AppShellPage(page);

    // Given: User logs in then logs out
    await loginPage.goto();
    await loginPage.login(TEST_ADMIN.email, TEST_ADMIN.password);
    await expect(page).toHaveURL(ROUTES.home);

    // Open sidebar if on mobile/tablet viewport
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 1024) {
      await appShell.openSidebar();
    }

    await appShell.logout();
    await expect(page).toHaveURL(ROUTES.login);

    // When: User tries to access protected route
    await page.goto(ROUTES.home);

    // Then: Should be redirected back to login
    await expect(page).toHaveURL(ROUTES.login);
  });
});
