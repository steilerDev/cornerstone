/**
 * E2E tests for admin-created users (#2122): SSO-only accounts without a password and
 * local accounts, created through the Add User modal on /settings/users.
 *
 * AC3 (first SSO login links the pending account) cannot be driven here: the mock IdP
 * always returns member@e2e-test.local, which oidc.spec.ts already uses. It is covered
 * by the server unit/integration tests.
 *
 * Login budget: at most 3 login attempts per file (scenario 2 uses two, scenario 3 one).
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { UserManagementPage } from '../../pages/UserManagementPage.js';
import { LoginPage } from '../../pages/LoginPage.js';
import { createSsoOnlyUserViaApi, deleteUserViaApi } from '../../fixtures/apiHelpers.js';
import { API, ROUTES } from '../../fixtures/testData.js';

const PASSWORD = 'e2e-create-user-pw-123!';
const PENDING_LABEL = 'OIDC (awaiting first sign-in)';

async function findUserId(page: Page, email: string): Promise<string | null> {
  const response = await page.request.get(`${API.users}?q=${encodeURIComponent(email)}`);
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { users: { id: string; email: string }[] };
  return body.users.find((u) => u.email === email)?.id ?? null;
}

test.describe('Admin creates users', () => {
  // Scenarios share the SSO-only account created in scenario 1.
  test.describe.configure({ mode: 'serial' });

  let ssoEmail: string;
  let localEmail: string;
  const createdEmails: string[] = [];

  test.beforeEach(async ({ testPrefix }, testInfo) => {
    const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.parallelIndex}`;
    ssoEmail ??= `${testPrefix}-sso-only-${Date.now()}-${suffix}@e2e-test.local`.toLowerCase();
    localEmail ??= `${testPrefix}-local-${Date.now()}-${suffix}@e2e-test.local`.toLowerCase();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'test-results/.auth/admin.json' });
    try {
      const page = await context.newPage();
      for (const email of createdEmails) {
        const id = await findUserId(page, email);
        if (id) await deleteUserViaApi(page, id);
      }
    } finally {
      await context.close();
    }
  });

  test('Create an SSO-only user shows the pending auth label', async ({ page, testPrefix }) => {
    const users = new UserManagementPage(page);
    await users.goto();

    // When: admin opens Add User and ticks "Single sign-on only"
    await users.openCreateModal();
    await expect(users.createSsoOnlyCheckbox).toBeVisible();
    await expect(users.createPasswordInput).toBeVisible();
    await users.createSsoOnlyCheckbox.check();

    // Then: password fields are removed from the DOM
    await expect(users.createPasswordInput).toHaveCount(0);
    await expect(users.createConfirmPasswordInput).toHaveCount(0);

    // When: the form is completed and submitted
    createdEmails.push(ssoEmail);
    await users.createEmailInput.fill(ssoEmail);
    await users.createDisplayNameInput.fill(`${testPrefix} SSO Only`);
    await users.createRoleSelect.selectOption('member');
    await users.createSubmitButton.click();

    // Then: dialog closes and the Auth Provider cell shows the pending label
    await expect(users.createModal).toBeHidden();
    await expect(await users.getAuthProviderCell(ssoEmail)).toHaveText(PENDING_LABEL);
  });

  test('Local login is refused for an SSO-only user, same error as unknown email', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      const loginPage = new LoginPage(page);

      // When: login with the SSO-only email
      await loginPage.goto();
      await loginPage.login(ssoEmail, PASSWORD);
      await expect(loginPage.errorBanner).toBeVisible();
      const firstText = (await loginPage.errorBanner.textContent())?.trim() ?? '';
      expect(firstText.length).toBeGreaterThan(0);

      // And: login with an email that was never registered
      await loginPage.goto();
      await loginPage.login(`never-registered-${Date.now()}@e2e-test.local`, PASSWORD);

      // Then: identical error text, still on /login
      await expect(loginPage.errorBanner).toHaveText(firstText);
      await expect(page).toHaveURL(new RegExp(`${ROUTES.login}$`));
    } finally {
      await context.close();
    }
  });

  test('Create a local user with a password shows Local and can log in', async ({
    page,
    browser,
    testPrefix,
  }) => {
    const users = new UserManagementPage(page);
    await users.goto();

    // When: admin creates a local user (checkbox left unchecked)
    createdEmails.push(localEmail);
    await users.createUser({
      email: localEmail,
      displayName: `${testPrefix} Local User`,
      password: PASSWORD,
    });

    // Then: dialog closed (createUser waits) and row shows "Local"
    await expect(await users.getAuthProviderCell(localEmail)).toHaveText('Local');

    // And: the credentials work against the login API from a fresh context
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const response = await context.request.post(API.login, {
        data: { email: localEmail, password: PASSWORD },
      });
      expect(response.status()).toBe(200);
    } finally {
      await context.close();
    }
  });

  test('Validation errors and duplicate email keep the dialog open', async ({ page }) => {
    const users = new UserManagementPage(page);
    await users.goto();
    await users.openCreateModal();

    // Short password
    await users.createEmailInput.fill(`validation-${Date.now()}@e2e-test.local`);
    await users.createDisplayNameInput.fill('Validation User');
    await users.createPasswordInput.fill('a'.repeat(11));
    await users.createConfirmPasswordInput.fill('a'.repeat(11));
    await users.createSubmitButton.click();
    await expect(users.createPasswordError).toHaveText('Password must be at least 12 characters');
    await expect(users.createModal).toBeVisible();

    // Mismatched confirm
    await users.createPasswordInput.fill(PASSWORD);
    await users.createConfirmPasswordInput.fill(`${PASSWORD}x`);
    await users.createSubmitButton.click();
    await expect(users.createConfirmPasswordError).toHaveText('Passwords do not match');
    await expect(users.createModal).toBeVisible();

    // Duplicate email (scenario 1's SSO-only account)
    await users.createEmailInput.fill(ssoEmail);
    await users.createConfirmPasswordInput.fill(PASSWORD);
    await users.createSubmitButton.click();
    await expect(users.createEmailError).toHaveText(
      'This email address is already used by another account.',
    );
    await expect(users.createModal).toBeVisible();
  });

  test('API contract: password with oidc and over-long display name are rejected', async ({
    page,
  }) => {
    const withPassword = await page.request.post(API.users, {
      data: {
        email: `contract-a-${Date.now()}@e2e-test.local`,
        displayName: 'Contract A',
        role: 'member',
        authProvider: 'oidc',
        password: PASSWORD,
      },
    });
    expect(withPassword.status()).toBe(400);
    const withPasswordBody = (await withPassword.json()) as { error: { code: string } };
    expect(withPasswordBody.error.code).toBe('VALIDATION_ERROR');

    const tooLong = await page.request.post(API.users, {
      data: {
        email: `contract-b-${Date.now()}@e2e-test.local`,
        displayName: 'x'.repeat(101),
        role: 'member',
        password: PASSWORD,
      },
    });
    expect(tooLong.status()).toBe(400);
  });

  test('API helper creates a pending SSO-only user', async ({ page, testPrefix }) => {
    const email = `${testPrefix}-helper-${Date.now()}@e2e-test.local`.toLowerCase();
    const user = await createSsoOnlyUserViaApi(page, {
      email,
      displayName: `${testPrefix} Helper`,
    });
    try {
      const users = new UserManagementPage(page);
      await users.goto();
      await expect(await users.getAuthProviderCell(email)).toHaveText(PENDING_LABEL);
    } finally {
      await deleteUserViaApi(page, user.id);
    }
  });

  test(
    'Responsive: Add User and checkbox are reachable with a 44px touch target on mobile',
    { tag: '@responsive' },
    async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'Mobile project only');
      const users = new UserManagementPage(page);
      await users.goto();

      await expect(users.addUserButton).toBeVisible();
      await users.openCreateModal();
      await expect(users.createEmailInput).toBeVisible();
      await expect(users.createDisplayNameInput).toBeVisible();
      await expect(users.createSsoOnlyCheckbox).toBeVisible();
      await users.createSsoOnlyRow.scrollIntoViewIfNeeded();
      const box = await users.createSsoOnlyRow.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    },
  );

  test('Keyboard: Space toggles SSO-only, focus stays, Escape returns focus to Add User', async ({
    page,
  }) => {
    const users = new UserManagementPage(page);
    await users.goto();
    await users.openCreateModal();

    await users.createRoleSelect.focus();
    await page.keyboard.press('Tab');
    await expect(users.createSsoOnlyCheckbox).toBeFocused();
    await page.keyboard.press('Space');

    await expect(users.createSsoOnlyCheckbox).toBeChecked();
    await expect(users.createPasswordInput).toHaveCount(0);
    await expect(users.createSsoOnlyCheckbox).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(users.createModal).toBeHidden();
    await expect(users.addUserButton).toBeFocused();
  });
});
