/**
 * E2E tests for OIDC SSO flow (Stories #34, #35)
 *
 * The test infrastructure includes a mock OIDC server (navikt/mock-oauth2-server)
 * with interactiveLogin: true, which presents a login form for authentication.
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage.js';
import { ProfilePage } from '../../pages/ProfilePage.js';
import { UserManagementPage } from '../../pages/UserManagementPage.js';
import { ROUTES, TEST_MEMBER } from '../../fixtures/testData.js';

test.describe('OIDC SSO Flow', () => {
  // Clear auth state for these tests
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Login page shows SSO button when OIDC enabled', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Given: User is on the login page
    await loginPage.goto();

    // Then: SSO button should be visible
    await expect(loginPage.ssoButton).toBeVisible();
    await expect(loginPage.divider).toBeVisible(); // "or" divider
  });

  test('SSO button triggers redirect to OIDC provider', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Given: User is on the login page
    await loginPage.goto();

    // When: User clicks SSO button
    await loginPage.clickSSO();

    // Then: Should redirect to OIDC server
    await page.waitForURL(/oidc-server/, { timeout: 10000 });
    expect(page.url()).toContain('oidc-server');
  });

  test('Full OIDC flow creates session', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Given: User is on the login page
    await loginPage.goto();

    // When: User clicks SSO button
    await loginPage.clickSSO();

    // Wait for redirect to OIDC server
    await page.waitForURL(/oidc-server/, { timeout: 10000 });

    // Fill in the mock OIDC server's login form
    // The mock server with interactiveLogin: true accepts any credentials
    // The username becomes the 'sub' claim
    await page.getByPlaceholder('Username').fill(TEST_MEMBER.email);
    await page.getByRole('button', { name: /login|sign in/i }).click();

    // Then: Should redirect back to app and establish session
    await expect(page).toHaveURL(ROUTES.home, { timeout: 10000 });
  });

  test('New OIDC user is auto-provisioned', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const profilePage = new ProfilePage(page);

    // Given: User completes OIDC flow
    await loginPage.goto();
    await loginPage.clickSSO();
    await page.waitForURL(/oidc-server/, { timeout: 10000 });
    await page.getByPlaceholder('Username').fill(TEST_MEMBER.email);
    await page.getByRole('button', { name: /login|sign in/i }).click();
    await expect(page).toHaveURL(ROUTES.home, { timeout: 10000 });

    // When: User navigates to profile
    await profilePage.goto();

    // Then: Profile should show OIDC as auth provider
    const profileInfo = await profilePage.getProfileInfo();
    expect(profileInfo.authProvider.toLowerCase()).toContain('oidc');

    // And: Should show OIDC user message (no password change)
    const isOidcUser = await profilePage.isOidcUser();
    expect(isOidcUser).toBe(true);
  });

  test('OIDC user appears in user management', async ({ page, context }) => {
    const loginPage = new LoginPage(page);

    // Given: User completes OIDC flow
    await loginPage.goto();
    await loginPage.clickSSO();
    await page.waitForURL(/oidc-server/, { timeout: 10000 });
    await page.getByPlaceholder('Username').fill(TEST_MEMBER.email);
    await page.getByRole('button', { name: /login|sign in/i }).click();
    await expect(page).toHaveURL(ROUTES.home, { timeout: 10000 });

    // When: Admin views user management (use admin storage state in new page)
    const adminPage = await context.newPage();
    // Load admin storage state from file
    const { readFileSync } = await import('fs');
    const storageState = JSON.parse(readFileSync('test-results/.auth/admin.json', 'utf-8'));
    await adminPage.context().addCookies(storageState.cookies);
    const userManagementPage = new UserManagementPage(adminPage);
    await userManagementPage.goto();

    // Then: OIDC user should appear in the list
    const userRow = await userManagementPage.getUserRow(TEST_MEMBER.email);
    expect(userRow).not.toBeNull();

    await adminPage.close();
  });
});
