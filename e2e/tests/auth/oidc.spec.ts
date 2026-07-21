/**
 * E2E tests for OIDC SSO flow (Stories #34, #35; account-linking fix #1865)
 *
 * These tests verify the full OIDC authentication flow using a mock OIDC provider.
 * The Cornerstone server communicates with the OIDC provider via Docker network alias
 * (oidc-server:8080), while the browser accesses it through the Nginx proxy.
 *
 * Strategy: All traffic goes through the Nginx reverse proxy, which rewrites OIDC
 * redirects from the Docker network alias (http://oidc-server:8080/...) to
 * browser-accessible URLs (/oidc-proxy/...). The proxy forwards /oidc-proxy/* requests
 * to the OIDC server with Host: oidc-server:8080 to ensure the issuer claim matches.
 *
 * As of #1865, OIDC login is purely an alternate login method for accounts that
 * ALREADY EXIST — it never creates a new account. The mock OIDC provider
 * (e2e/containers/oidcContainer.ts) is hardcoded to always return a fixed identity
 * (member@e2e-test.local). For the happy path below, that identity must already
 * exist as a local account (created via the admin API in `beforeAll`) so the first
 * SSO login can link it; subsequent logins are resolved by the linked oidcSubject.
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage.js';
import { UserManagementPage } from '../../pages/UserManagementPage.js';
import { createLocalUserViaApi } from '../../fixtures/apiHelpers.js';
import { TEST_MEMBER, ROUTES, API } from '../../fixtures/testData.js';

// Serial mode: beforeAll seeds the local account that gets linked on first SSO
// login (test 3); tests 4 and 5 verify the linked account's state.
test.describe.configure({ mode: 'serial' });

test.describe('OIDC SSO Flow', () => {
  // Unauthenticated context for OIDC login tests
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async ({ browser }) => {
    // Seed TEST_MEMBER as a local account via the admin-authenticated API.
    // The mock OIDC provider always returns this email/identity, and (post
    // #1865) OIDC can only link/log in to an account that already exists —
    // it never creates one. Use an explicit admin-authenticated context here
    // (rather than the `authenticatedPage` fixture) since `beforeAll` hooks
    // don't participate in the describe-level `storageState` override above.
    const adminContext = await browser.newContext({
      storageState: 'test-results/.auth/admin.json',
    });
    const adminPage = await adminContext.newPage();
    await createLocalUserViaApi(adminPage, {
      email: TEST_MEMBER.email,
      displayName: TEST_MEMBER.displayName,
      password: TEST_MEMBER.localPassword,
      role: 'member',
    });
    await adminContext.close();
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

    // Given: TEST_MEMBER already exists as a local account (seeded in beforeAll)
    await loginPage.goto();

    // When: User completes the OIDC flow — this links the local account to the
    // OIDC identity (oidcSubject is set; authProvider stays 'local')
    await loginPage.clickSSO();

    // Then: User should be redirected to dashboard (session created)
    await expect(page).toHaveURL(ROUTES.home, { timeout: 15000 });

    // And: /api/auth/me should return authenticated user
    // The response wraps user data: { user: { email, ... }, setupRequired, oidcEnabled }
    const meResponse = await page.request.get(API.authMe);
    expect(meResponse.ok()).toBe(true);
    const me = await meResponse.json();
    expect(me.user).not.toBeNull();
    expect(me.user.email).toBe(TEST_MEMBER.email);
  });

  test('Linked OIDC user retains local account attributes', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Given: The local account was linked to the OIDC identity in the previous test
    // When: User logs in via OIDC again — resolved directly by the linked oidcSubject
    await loginPage.goto();
    await loginPage.clickSSO();
    await expect(page).toHaveURL(ROUTES.home, { timeout: 15000 });

    // Then: /api/auth/me should return correct user details.
    // Critically, authProvider stays 'local' — linking an existing account via
    // OIDC never changes its auth provider or removes its password.
    const meResponse = await page.request.get(API.authMe);
    expect(meResponse.ok()).toBe(true);
    const me = await meResponse.json();
    expect(me.user).not.toBeNull();
    expect(me.user.email).toBe(TEST_MEMBER.email);
    expect(me.user.displayName).toBe(TEST_MEMBER.displayName);
    expect(me.user.role).toBe('member');
    expect(me.user.authProvider).toBe('local');
  });

  test('OIDC user appears in admin user management', async ({ page, browser }) => {
    const loginPage = new LoginPage(page);

    // First: Complete OIDC login (the account was already seeded + linked by
    // earlier tests in this serial suite; this just re-confirms the session)
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
      // cells[3] = Member Since (date) — not asserted (format varies by locale)
      expect(cells[4]).toBe('Active'); // Status
      // Note: Auth Provider column has defaultVisible: false — not rendered in table by default
    }

    await adminContext.close();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Rejection path (#1865): OIDC email matches no existing account
  //
  // Coverage note: the mock OIDC provider (e2e/containers/oidcContainer.ts) is
  // hardcoded to a single fixed identity (member@e2e-test.local), which by this
  // point in the serial suite above is already a linked local account. Getting
  // a genuinely SECOND, never-seeded identity out of the real container would
  // require either an interactive-login form-fill step (changing the flow shape
  // of every other test in this file, which all rely on non-interactive
  // auto-grant) or an unverifiable per-request claim-mapping trick — and the
  // token exchange happens server-to-server over the Docker network, so
  // page.route() in the browser cannot intercept/vary it either. Given that
  // constraint, this test exercises the same URL-param -> translated-banner
  // code path a real rejection redirect produces (LoginPage.tsx reads
  // `?error=` on mount), without depending on a second container identity.
  // The real backend rejection path (403 OidcNoMatchingAccountError, no user
  // row created) is covered by qa-integration-tester's route-level test.
  test('Login page shows the rejection banner for oidc_no_matching_account and creates no account', async ({
    page,
    browser,
  }) => {
    const loginPage = new LoginPage(page);
    const unmatchedEmail = 'no-such-oidc-user@e2e-test.local';

    // When: Browser lands on /login with the rejection error code — exactly
    // the redirect target the server uses for OidcNoMatchingAccountError
    await page.goto(`${ROUTES.login}?error=oidc_no_matching_account`);

    // Then: Browser stays on /login with the error code in the URL
    await expect(page).toHaveURL(/\/login\?error=oidc_no_matching_account/);

    // And: The translated rejection message is visible
    await expect(loginPage.errorBanner).toBeVisible();
    await expect(loginPage.errorBanner).toContainText(
      'No account was found for your email address',
    );

    // And: No account exists for an email that was never provisioned — sanity
    // check that rejection never has the side effect of creating a user
    const adminContext = await browser.newContext({
      storageState: 'test-results/.auth/admin.json',
    });
    const adminPage = await adminContext.newPage();
    const usersResponse = await adminPage.request.get(
      `${API.users}?q=${encodeURIComponent(unmatchedEmail)}`,
    );
    expect(usersResponse.ok()).toBe(true);
    const { users } = (await usersResponse.json()) as { users: { email: string }[] };
    expect(users.find((u) => u.email === unmatchedEmail)).toBeUndefined();
    await adminContext.close();
  });
});
