/**
 * E2E tests for viewing profile (Story #36)
 */

import { test, expect } from '../../fixtures/auth.js';
import { ProfilePage } from '../../pages/ProfilePage.js';
import { TEST_ADMIN } from '../../fixtures/testData.js';

test.describe('View Profile', () => {
  test('All profile fields displayed', { tag: '@smoke' }, async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is authenticated

    // When: User navigates to profile page
    await profilePage.goto();

    // Then: All profile fields should be visible
    await expect(profilePage.heading).toBeVisible();
    await expect(profilePage.profileInfoSection).toBeVisible();

    const profileInfo = await profilePage.getProfileInfo();

    // Verify all fields have values
    expect(profileInfo.email).toBeTruthy();
    expect(profileInfo.role).toBeTruthy();
    expect(profileInfo.authProvider).toBeTruthy();
    expect(profileInfo.memberSince).toBeTruthy();
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

  test('Authentication provider shows "Local"', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is a local auth user (not OIDC)
    await profilePage.goto();

    // When: User views profile info
    const profileInfo = await profilePage.getProfileInfo();

    // Then: Auth provider should show "Local Account"
    expect(profileInfo.authProvider).toBe('Local Account');
  });

  test('Member Since shows valid date', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is authenticated
    await profilePage.goto();

    // When: User views profile info
    const profileInfo = await profilePage.getProfileInfo();

    // Then: Member Since should be a valid date string
    // App renders dates in "MMM D, YYYY" format (e.g. "Mar 1, 2026")
    expect(profileInfo.memberSince).toBeTruthy();
    expect(profileInfo.memberSince).toMatch(/[A-Z][a-z]{2} \d{1,2}, \d{4}/);
  });
});
