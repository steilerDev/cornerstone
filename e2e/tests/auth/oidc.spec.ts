/**
 * E2E tests for OIDC SSO flow (Stories #34, #35)
 *
 * These tests verify the full OIDC authentication flow using a mock OIDC provider.
 * The Cornerstone server communicates with the OIDC provider via Docker network alias
 * (oidc-server:8080), while the browser uses Playwright route interception to rewrite
 * those URLs to localhost:${mappedPort}.
 */

import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import { LoginPage } from '../../pages/LoginPage.js';
import { UserManagementPage } from '../../pages/UserManagementPage.js';
import { TEST_MEMBER, ROUTES, API } from '../../fixtures/testData.js';
import type { ContainerState } from '../../containers/setup.js';

// Serial mode: test 3 creates the OIDC user, tests 4 and 5 verify it
test.describe.configure({ mode: 'serial' });

test.describe('OIDC SSO Flow', () => {
  // Unauthenticated context for OIDC login tests
  test.use({ storageState: { cookies: [], origins: [] } });

  let oidcHostPort: string;

  test.beforeAll(async () => {
    // Read the OIDC issuer URL from the container state file
    const stateJson = await readFile('e2e/test-results/.state/containers.json', 'utf-8');
    const state: ContainerState = JSON.parse(stateJson);
    // Extract host:port from the issuer URL (e.g., "http://localhost:12345/default" → "localhost:12345")
    const issuerUrl = new URL(state.oidcIssuerUrl);
    oidcHostPort = issuerUrl.host;
  });

  test.beforeEach(async ({ page }) => {
    // Intercept requests to the Docker network alias (oidc-server:8080)
    // and rewrite them to the host-mapped port (localhost:${mappedPort})
    await page.route(/oidc-server:8080/, async (route) => {
      const originalUrl = route.request().url();
      const rewrittenUrl = originalUrl.replace('oidc-server:8080', oidcHostPort);
      await route.continue({ url: rewrittenUrl });
    });
  });

  test('Login page shows SSO button when OIDC is enabled', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Given: OIDC is configured on the server
    // When: User navigates to login page
    await loginPage.goto();

    // Then: SSO button should be visible
    await expect(loginPage.ssoButton).toBeVisible();
    // And: The divider between local login and SSO should be visible
    await expect(loginPage.divider).toBeVisible();
  });

  test('SSO button triggers redirect to OIDC provider', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Given: User is on the login page
    await loginPage.goto();
    await expect(loginPage.ssoButton).toBeVisible();

    // When: User clicks "Login with SSO"
    await loginPage.clickSSO();

    // Then: Browser should be redirected through the OIDC flow
    // With interactiveLogin: false, the mock server auto-grants and redirects back
    // The final destination should be the app (not /login anymore)
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
  });

  test('Full OIDC flow creates session', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Given: User is on the login page
    await loginPage.goto();

    // When: User completes the OIDC flow
    await loginPage.clickSSO();

    // Then: User should be redirected to dashboard (session created)
    await expect(page).toHaveURL(ROUTES.home, { timeout: 15000 });

    // And: /api/auth/me should return authenticated user
    const meResponse = await page.request.get(API.authMe);
    expect(meResponse.ok()).toBe(true);
    const me = await meResponse.json();
    expect(me.email).toBe(TEST_MEMBER.email);
  });

  test('Auto-provisioned OIDC user has correct attributes', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Given: OIDC user was created in the previous test
    // When: User logs in via OIDC again
    await loginPage.goto();
    await loginPage.clickSSO();
    await expect(page).toHaveURL(ROUTES.home, { timeout: 15000 });

    // Then: /api/auth/me should return correct user details
    const meResponse = await page.request.get(API.authMe);
    expect(meResponse.ok()).toBe(true);
    const me = await meResponse.json();
    expect(me.email).toBe(TEST_MEMBER.email);
    expect(me.displayName).toBe(TEST_MEMBER.displayName);
    expect(me.role).toBe('member');
    expect(me.authProvider).toBe('oidc');
  });

  test('OIDC user appears in admin user management', async ({ page, browser }) => {
    const loginPage = new LoginPage(page);

    // First: Complete OIDC login to ensure user exists
    await loginPage.goto();
    await loginPage.clickSSO();
    await expect(page).toHaveURL(ROUTES.home, { timeout: 15000 });

    // Now: Login as admin in a separate context (with stored auth state)
    const adminContext = await browser.newContext({
      storageState: 'test-results/.auth/admin.json',
    });
    const adminPage = await adminContext.newPage();

    // When: Admin navigates to user management
    const userManagementPage = new UserManagementPage(adminPage);
    await userManagementPage.goto();

    // Then: OIDC user should appear in the user table
    const oidcRow = await userManagementPage.getUserRow(TEST_MEMBER.email);
    expect(oidcRow).not.toBeNull();

    if (oidcRow) {
      const cells = await oidcRow.locator('td').allTextContents();
      expect(cells[0]).toContain(TEST_MEMBER.displayName); // Name
      expect(cells[1]).toBe(TEST_MEMBER.email); // Email
      expect(cells[2]).toBe('Member'); // Role
      expect(cells[3]).toBe('OIDC'); // Auth Provider
      expect(cells[4]).toBe('Active'); // Status
    }

    await adminContext.close();
  });
});
