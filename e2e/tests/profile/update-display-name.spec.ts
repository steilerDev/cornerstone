/**
 * E2E tests for updating the display name (Story #36, reworked in #2214)
 *
 * The display name form lives inside the Profile section. Validation runs on submit and shows a
 * field-level error (no banner); Save is aria-disabled (never natively disabled) while busy or
 * when nothing changed, so focus never falls to the body.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { ProfilePage } from '../../pages/ProfilePage.js';
import { TEST_ADMIN } from '../../fixtures/testData.js';

/** Restore the shared admin's name and wait for the save to finish. */
async function restoreName(profilePage: ProfilePage): Promise<void> {
  await profilePage.updateDisplayName(TEST_ADMIN.displayName);
  await expect(profilePage.displayNameSuccessBanner).toBeVisible();
}

function recordPatches(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && new URL(req.url()).pathname === '/api/users/me') {
      seen.push(req.url());
    }
  });
  return seen;
}

test.describe('Update Display Name', { lock: 'admin-account' }, () => {
  // The `admin-account` lock (held by edit-user, update-display-name and user-list specs)
  // prevents these from running concurrently across workers and projects; serial mode only
  // orders tests in-project.
  // Serialize tests within this describe block — they all modify the shared admin
  // user's display name and must not run in parallel with each other.
  test.describe.configure({ mode: 'serial' });
  test('Update display name successfully', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is on profile page
    await profilePage.goto();

    // When: User changes display name and saves
    const newName = 'Updated Admin';
    await profilePage.updateDisplayName(newName);

    // Then: Success banner should appear inside the Profile section
    const successBanner = await profilePage.getDisplayNameSuccessBanner();
    expect(successBanner).toBeTruthy();
    expect(successBanner?.toLowerCase()).toContain('success');

    // And: Display name input should show new value
    await expect(profilePage.displayNameInput).toHaveValue(newName);

    // And: Save keeps focus (it is aria-disabled now, not natively disabled)
    await expect(profilePage.saveDisplayNameButton).toBeFocused();
    await expect(profilePage.saveDisplayNameButton).toHaveAttribute('aria-disabled', 'true');

    // Restore original name for subsequent tests
    await restoreName(profilePage);
  });

  test('Success banner appears after save', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User is on profile page
    await profilePage.goto();

    // When: User updates display name
    await profilePage.updateDisplayName('Test Name');

    // Then: Success banner should be visible
    await expect(profilePage.displayNameSuccessBanner).toBeVisible();

    // And: Editing the field clears the banner
    await profilePage.displayNameInput.fill('Test Name 2');
    await expect(profilePage.displayNameSuccessBanner).toBeHidden();

    // Restore original name
    await restoreName(profilePage);
  });

  test('Validation: empty name shows a field-level error and focuses the input', async ({
    page,
  }) => {
    const profilePage = new ProfilePage(page);
    const patches = recordPatches(page);

    // Given: User is on profile page
    await profilePage.goto();

    // When: User tries to save an empty display name
    await profilePage.displayNameInput.fill('');
    await profilePage.saveDisplayNameButton.click();

    // Then: A field-level error is shown, wired to the input, and focus goes to the input
    await expect(profilePage.displayNameErrorField).toBeVisible();
    await expect(profilePage.displayNameErrorField).toHaveAttribute('role', 'alert');
    await expect(profilePage.displayNameInput).toHaveAttribute('aria-invalid', 'true');
    await expect(profilePage.displayNameInput).toHaveAttribute(
      'aria-describedby',
      'displayName-error',
    );
    await expect(profilePage.displayNameInput).toBeFocused();

    // And: No banner and no request
    await expect(profilePage.displayNameSuccessBanner).toBeHidden();
    await expect(profilePage.displayNameErrorBanner).toHaveCount(1); // only the field error
    expect(patches).toEqual([]);

    // And: Typing clears the error
    await profilePage.displayNameInput.fill('x');
    await expect(profilePage.displayNameErrorField).toBeHidden();
  });

  test('Save sends nothing when the name is unchanged', async ({ page }) => {
    const profilePage = new ProfilePage(page);
    const patches = recordPatches(page);
    await profilePage.goto();

    // aria-disabled buttons are "not enabled" to Playwright, so force the click
    await expect(profilePage.saveDisplayNameButton).toHaveAttribute('aria-disabled', 'true');
    await profilePage.saveDisplayNameButton.click({ force: true });
    // Enter in the field submits the form too
    await profilePage.displayNameInput.press('Enter');

    await expect(profilePage.displayNameInput).toBeFocused();
    await expect(profilePage.displayNameSuccessBanner).toBeHidden();
    expect(patches).toEqual([]);
  });

  test('Display name persists after page reload', async ({ page }) => {
    const profilePage = new ProfilePage(page);

    // Given: User updates display name
    await profilePage.goto();
    const testName = 'Persistent Test Name';
    await profilePage.updateDisplayName(testName);
    await expect(profilePage.displayNameSuccessBanner).toBeVisible();

    // When: User reloads the page
    await page.reload();

    // Then: New display name should still be shown
    await expect(profilePage.displayNameInput).toHaveValue(testName);

    // Restore original name
    await restoreName(profilePage);
  });
});
