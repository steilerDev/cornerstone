/**
 * E2E tests for viewing the Account page's Profile section (Story #36, reworked in #2214)
 *
 * The facts are a description list (Email, Role, Sign-in method, Member since). The E2E app has
 * single sign-on configured, so the local admin sees the Sign-in method row.
 */

import { test, expect } from '../../fixtures/auth.js';
import { ProfilePage } from '../../pages/ProfilePage.js';
import { TEST_ADMIN } from '../../fixtures/testData.js';

test.describe('View Profile', () => {
  test('All profile fields displayed', { tag: '@smoke' }, async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is authenticated

    // When: User navigates to the Account page
    await profilePage.goto();

    // Then: The Profile section is a labelled "Your details" section with all facts
    await expect(profilePage.heading).toBeVisible();
    await expect(profilePage.profileSection).toBeVisible();
    await expect(
      profilePage.profileSection.getByRole('heading', {
        level: 2,
        name: 'Your details',
        exact: true,
      }),
    ).toBeVisible();

    const profileInfo = await profilePage.getProfileInfo();

    // Verify all fields have values
    expect(profileInfo.email).toBeTruthy();
    expect(profileInfo.role).toBeTruthy();
    expect(profileInfo.signInMethod).toBeTruthy();
    expect(profileInfo.memberSince).toBeTruthy();
  });

  test('Facts are a description list: each label is a dt with a dd value', async ({ page }) => {
    const profilePage = new ProfilePage(page);
    await profilePage.goto();

    await expect(profilePage.profileSection.locator('dl')).toHaveCount(1);
    await expect(profilePage.profileSection.locator('dt')).toHaveText([
      'Email',
      'Role',
      'Sign-in method',
      'Member since',
    ]);
    await expect(profilePage.profileSection.locator('dd')).toHaveCount(4);
  });

  test('Admin sees "Administrator" role label', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is an admin
    await profilePage.goto();

    // When: User views profile info
    const profileInfo = await profilePage.getProfileInfo();

    // Then: Role should show "Administrator"
    expect(profileInfo.role).toBe('Administrator');
  });

  test('Email matches admin email', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is the test admin
    await profilePage.goto();

    // When: User views profile info
    const profileInfo = await profilePage.getProfileInfo();

    // Then: Email should match TEST_ADMIN email
    expect(profileInfo.email).toBe(TEST_ADMIN.email);
  });

  test('Sign-in method shows "Email and password" for the local admin', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: A local account on an instance that has single sign-on configured
    await profilePage.goto();

    // When: User views profile info
    const profileInfo = await profilePage.getProfileInfo();

    // Then: The sign-in method reads "Email and password"
    expect(profileInfo.signInMethod).toBe('Email and password');
  });

  test('Member since shows valid date', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is authenticated
    await profilePage.goto();

    // When: User views profile info
    const profileInfo = await profilePage.getProfileInfo();

    // Then: Member since should be a valid date string
    // App renders dates in "MMM D, YYYY" format (e.g. "Mar 1, 2026")
    expect(profileInfo.memberSince).toBeTruthy();
    expect(profileInfo.memberSince).toMatch(/[A-Z][a-z]{2} \d{1,2}, \d{4}/);
  });

  test('Display name input sits in the Profile section, prefilled with the saved name', async ({
    page,
  }) => {
    const profilePage = new ProfilePage(page);
    await profilePage.goto();

    await expect(profilePage.profileSection.locator('#displayName')).toBeVisible();
    await expect(profilePage.displayNameInput).toHaveValue(/\S/);
    await expect(profilePage.saveDisplayNameButton).toBeVisible();
    // Nothing changed yet: Save is aria-disabled (not natively disabled)
    await expect(profilePage.saveDisplayNameButton).toHaveAttribute('aria-disabled', 'true');
    await expect(profilePage.saveDisplayNameButton).not.toHaveAttribute('disabled');
  });
});
