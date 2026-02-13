/**
 * Page Object Model for the Profile page (/profile)
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
  }

  async goto(): Promise<void> {
    await this.page.goto(ROUTES.profile);
  }

  async getProfileInfo(): Promise<ProfileInfo> {
    // Extract info from the info grid
    const infoRows = await this.profileInfoSection.locator('.infoRow').all();
    const info: Partial<ProfileInfo> = {};

    for (const row of infoRows) {
      const label = await row.locator('.infoLabel').textContent();
      const value = await row.locator('.infoValue').textContent();
      if (label && value) {
        if (label.includes('Email')) {
          info.email = value;
        } else if (label.includes('Role')) {
          info.role = value;
        } else if (label.includes('Authentication')) {
          info.authProvider = value;
        } else if (label.includes('Member Since')) {
          info.memberSince = value;
        }
      }
    }

    return info as ProfileInfo;
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
    const isVisible = await this.displayNameSuccessBanner.isVisible();
    return isVisible ? await this.displayNameSuccessBanner.textContent() : null;
  }

  async getDisplayNameErrorBanner(): Promise<string | null> {
    const isVisible = await this.displayNameErrorBanner.isVisible();
    return isVisible ? await this.displayNameErrorBanner.textContent() : null;
  }

  async getPasswordSuccessBanner(): Promise<string | null> {
    const isVisible = await this.passwordSuccessBanner.isVisible();
    return isVisible ? await this.passwordSuccessBanner.textContent() : null;
  }

  async getPasswordErrorBanner(): Promise<string | null> {
    const isVisible = await this.passwordErrorBanner.isVisible();
    return isVisible ? await this.passwordErrorBanner.textContent() : null;
  }

  async isOidcUser(): Promise<boolean> {
    return await this.oidcMessage.isVisible();
  }

  async getOidcMessage(): Promise<string | null> {
    const isVisible = await this.oidcMessage.isVisible();
    return isVisible ? await this.oidcMessage.textContent() : null;
  }
}
