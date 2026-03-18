/**
 * Page Object Model for the Profile page (/settings/profile)
 */

import type { Page, Locator } from '@playwright/test';
import { ROUTES } from '../fixtures/testData.js';

interface ProfileInfo {
  email: string;
  role: string;
  authProvider: string;
  memberSince: string;
}

export class ProfilePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly profileInfoSection: Locator;
  readonly displayNameSection: Locator;
  readonly passwordSection: Locator;

  // Display name form
  readonly displayNameInput: Locator;
  readonly saveDisplayNameButton: Locator;
  readonly displayNameSuccessBanner: Locator;
  readonly displayNameErrorBanner: Locator;

  // Password form (local auth only)
  readonly currentPasswordInput: Locator;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly changePasswordButton: Locator;
  readonly passwordSuccessBanner: Locator;
  readonly passwordErrorBanner: Locator;

  // OIDC message
  readonly oidcMessage: Locator;

  // DAV Access Card
  readonly davSection: Locator;
  readonly generateTokenButton: Locator;
  readonly regenerateTokenButton: Locator;
  readonly revokeTokenButton: Locator;
  readonly tokenDisplay: Locator;
  readonly downloadProfileLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Profile' });
    this.profileInfoSection = page
      .getByRole('heading', { level: 2, name: 'Profile Information' })
      .locator('..');
    this.displayNameSection = page
      .getByRole('heading', { level: 2, name: 'Display Name' })
      .locator('..');
    this.passwordSection = page
      .getByRole('heading', { level: 2, name: /Password|Change Password/ })
      .locator('..');

    // Display name form
    this.displayNameInput = page.locator('#displayName');
    this.saveDisplayNameButton = page.getByRole('button', { name: /Save Changes|Saving/ }).first();
    this.displayNameSuccessBanner = this.displayNameSection
      .locator('[role="alert"]')
      .filter({ hasText: 'successfully' });
    this.displayNameErrorBanner = this.displayNameSection
      .locator('[role="alert"]')
      .filter({ hasNotText: 'successfully' });

    // Password form
    this.currentPasswordInput = page.locator('#currentPassword');
    this.newPasswordInput = page.locator('#newPassword');
    this.confirmPasswordInput = page.locator('#confirmPassword');
    this.changePasswordButton = page.getByRole('button', {
      name: /Change Password|Changing Password/,
    });
    this.passwordSuccessBanner = this.passwordSection
      .locator('[role="alert"]')
      .filter({ hasText: 'successfully' });
    this.passwordErrorBanner = this.passwordSection
      .locator('[role="alert"]')
      .filter({ hasNotText: 'successfully' });

    // OIDC message
    this.oidcMessage = page.getByText('Your credentials are managed by your identity provider.');

    // DAV Access Card — rendered by DavAccessCard component
    this.davSection = page
      .getByRole('heading', { level: 2, name: 'DAV Access (Calendar & Contacts)' })
      .locator('..');
    this.generateTokenButton = page.getByRole('button', { name: 'Generate Token', exact: true });
    this.regenerateTokenButton = page.getByRole('button', {
      name: 'Regenerate Token',
      exact: true,
    });
    this.revokeTokenButton = page.getByRole('button', { name: 'Revoke Token', exact: true });
    // The token is shown in a <code> element inside the token display box
    this.tokenDisplay = page.locator('[class*="tokenValue"]');
    this.downloadProfileLink = page.getByRole('link', {
      name: 'Download iOS/macOS Profile',
      exact: true,
    });
  }

  async goto(): Promise<void> {
    await this.page.goto(ROUTES.profile);
    await this.heading.waitFor({ state: 'visible', timeout: 15000 });
  }

  async getProfileInfo(): Promise<ProfileInfo> {
    // Extract info using text-based selectors (CSS module classes are hashed in production)
    const section = this.profileInfoSection;

    const getValueForLabel = async (labelText: string): Promise<string> => {
      // Find the span containing the label text, then get its sibling span's text
      const labelLocator = section.getByText(labelText, { exact: true });
      // The value span is the next sibling of the label span within the same row div
      const row = labelLocator.locator('..');
      const spans = row.locator('span');
      // The second span in the row is the value
      const valueSpan = spans.nth(1);
      return (await valueSpan.textContent()) ?? '';
    };

    return {
      email: await getValueForLabel('Email'),
      role: await getValueForLabel('Role'),
      authProvider: await getValueForLabel('Authentication'),
      memberSince: await getValueForLabel('Member Since'),
    };
  }

  async updateDisplayName(name: string): Promise<void> {
    await this.displayNameInput.fill(name);
    await this.saveDisplayNameButton.click();
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ): Promise<void> {
    await this.currentPasswordInput.fill(currentPassword);
    await this.newPasswordInput.fill(newPassword);
    await this.confirmPasswordInput.fill(confirmPassword);
    await this.changePasswordButton.click();
  }

  async getDisplayNameSuccessBanner(): Promise<string | null> {
    try {
      await this.displayNameSuccessBanner.waitFor({ state: 'visible' });
      return await this.displayNameSuccessBanner.textContent();
    } catch {
      return null;
    }
  }

  async getDisplayNameErrorBanner(): Promise<string | null> {
    try {
      await this.displayNameErrorBanner.waitFor({ state: 'visible' });
      return await this.displayNameErrorBanner.textContent();
    } catch {
      return null;
    }
  }

  async getPasswordSuccessBanner(): Promise<string | null> {
    try {
      await this.passwordSuccessBanner.waitFor({ state: 'visible' });
      return await this.passwordSuccessBanner.textContent();
    } catch {
      return null;
    }
  }

  async getPasswordErrorBanner(): Promise<string | null> {
    try {
      await this.passwordErrorBanner.waitFor({ state: 'visible' });
      return await this.passwordErrorBanner.textContent();
    } catch {
      return null;
    }
  }

  async isOidcUser(): Promise<boolean> {
    return await this.oidcMessage.isVisible();
  }

  async getOidcMessage(): Promise<string | null> {
    const isVisible = await this.oidcMessage.isVisible();
    return isVisible ? await this.oidcMessage.textContent() : null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DAV helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate a new DAV token by clicking the "Generate Token" button.
   * Waits for the POST /api/users/me/dav/token response, then returns the
   * token text shown in the token display code element.
   */
  async generateToken(): Promise<string> {
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/api/users/me/dav/token') && r.request().method() === 'POST',
    );
    await this.generateTokenButton.click();
    await responsePromise;
    await this.tokenDisplay.waitFor({ state: 'visible' });
    return (await this.tokenDisplay.textContent()) ?? '';
  }

  /**
   * Regenerate the DAV token by clicking "Regenerate Token".
   * Waits for the API response and returns the new token text.
   */
  async regenerateToken(): Promise<string> {
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/api/users/me/dav/token') && r.request().method() === 'POST',
    );
    await this.regenerateTokenButton.click();
    await responsePromise;
    await this.tokenDisplay.waitFor({ state: 'visible' });
    return (await this.tokenDisplay.textContent()) ?? '';
  }

  /**
   * Revoke the DAV token by clicking "Revoke Token" and accepting the confirm dialog.
   * Waits for the DELETE /api/users/me/dav/token response.
   */
  async revokeToken(): Promise<void> {
    this.page.once('dialog', (dialog) => void dialog.accept());
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/api/users/me/dav/token') && r.request().method() === 'DELETE',
    );
    await this.revokeTokenButton.click();
    await responsePromise;
  }

  /**
   * Returns true if the DAV token is currently active (the "Regenerate Token"
   * button is visible, meaning status.hasToken is true).
   */
  async isDavTokenActive(): Promise<boolean> {
    return await this.regenerateTokenButton.isVisible();
  }

  /**
   * Ensure no DAV token is active for the authenticated user.
   * Calls DELETE /api/users/me/dav/token directly via the API — used in test setup.
   */
  async clearDavTokenViaApi(): Promise<void> {
    await this.page.request.delete('/api/users/me/dav/token');
  }
}
