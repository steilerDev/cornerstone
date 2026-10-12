/**
 * Page Object Model for the Account page (/settings/profile, #2214)
 *
 * Four sections in page order: Your details (the Profile section), Calendar & contacts sync,
 * Preferences, Password. Each section carries a `data-testid` (account-profile,
 * account-sync, account-preferences, account-password).
 */

import type { Page, Locator } from '@playwright/test';
import { ROUTES } from '../fixtures/testData.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';

interface ProfileInfo {
  email: string;
  role: string;
  /** "Sign-in method" value; null when the row is not shown (no single sign-on involved). */
  signInMethod: string | null;
  memberSince: string;
}

export class ProfilePage {
  readonly page: Page;
  readonly heading: Locator;

  // Sections (in page order)
  readonly profileSection: Locator;
  readonly syncSection: Locator;
  readonly preferencesSection: Locator;
  readonly passwordSection: Locator;

  // Profile: display name form
  readonly displayNameInput: Locator;
  readonly displayNameErrorField: Locator;
  readonly saveDisplayNameButton: Locator;
  readonly displayNameSuccessBanner: Locator;
  readonly displayNameErrorBanner: Locator;

  // Preferences
  readonly languageSelect: Locator;
  readonly themeSelect: Locator;

  // Password form (local auth only)
  readonly currentPasswordInput: Locator;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly changePasswordButton: Locator;
  readonly passwordSuccessBanner: Locator;
  readonly passwordErrorBanner: Locator;

  // Single sign-on note (replaces the password form)
  readonly oidcMessage: Locator;

  // Calendar & contacts sync (rendered by DavAccessCard)
  /** The section's h2 (`#calendar-sync`): the deep-link target and the dialog focus-return point. */
  readonly syncHeading: Locator;
  readonly generateTokenButton: Locator;
  readonly regenerateTokenButton: Locator;
  readonly revokeTokenButton: Locator;
  readonly copyButton: Locator;
  readonly hideTokenButton: Locator;
  /** Visually hidden "Token copied" live region (always mounted, not atomic). */
  readonly copyStatus: Locator;
  /** Regenerate confirmation (testid prefix dav-regenerate, role alertdialog). */
  readonly regenerateDialog: ConfirmDialogControl;
  /** Revoke confirmation (testid prefix dav-revoke, role alertdialog). */
  readonly revokeDialog: ConfirmDialogControl;
  readonly tokenDisplay: Locator;
  readonly downloadProfileLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Account', exact: true });

    this.profileSection = page.getByTestId('account-profile');
    this.syncSection = page.getByTestId('account-sync');
    this.preferencesSection = page.getByTestId('account-preferences');
    this.passwordSection = page.getByTestId('account-password');

    // Profile: display name form
    this.displayNameInput = page.locator('#displayName');
    this.displayNameErrorField = page.locator('#displayName-error');
    this.saveDisplayNameButton = page.getByTestId('account-display-name-save');
    this.displayNameSuccessBanner = this.profileSection
      .locator('[role="status"]')
      .filter({ hasText: 'successfully' });
    this.displayNameErrorBanner = this.profileSection.locator('[role="alert"]');

    // Preferences
    this.languageSelect = page.locator('#languageSelect');
    this.themeSelect = page.locator('#themeSelect');

    // Password form
    this.currentPasswordInput = page.locator('#currentPassword');
    this.newPasswordInput = page.locator('#newPassword');
    this.confirmPasswordInput = page.locator('#confirmPassword');
    this.changePasswordButton = page.getByTestId('account-password-submit');
    this.passwordSuccessBanner = this.passwordSection
      .locator('[role="status"]')
      .filter({ hasText: 'successfully' });
    this.passwordErrorBanner = this.passwordSection.locator('[role="alert"]');

    // Single sign-on note
    this.oidcMessage = page.getByText('Your password is managed by your single sign-on provider.');

    // Calendar & contacts sync
    this.syncHeading = page.locator('#calendar-sync');
    this.generateTokenButton = page.getByTestId('account-sync-generate');
    this.regenerateTokenButton = page.getByTestId('account-sync-regenerate');
    this.revokeTokenButton = page.getByTestId('account-sync-revoke');
    this.copyButton = page.getByTestId('account-sync-copy');
    this.hideTokenButton = page.getByTestId('account-sync-hide');
    this.copyStatus = page.getByTestId('account-sync-copy-status');
    this.regenerateDialog = new ConfirmDialogControl(page, 'dav-regenerate');
    this.revokeDialog = new ConfirmDialogControl(page, 'dav-revoke');
    this.tokenDisplay = page.getByTestId('account-sync-token');
    this.downloadProfileLink = page.getByTestId('account-sync-download');
  }

  async goto(): Promise<void> {
    await this.page.goto(ROUTES.profile);
    await this.heading.waitFor({ state: 'visible', timeout: 15000 });
  }

  /** The `dd` value of a fact row in the Profile section, by exact `dt` label (null if absent). */
  async getFact(label: string): Promise<string | null> {
    const term = this.profileSection.locator('dt').filter({ hasText: new RegExp(`^${label}$`) });
    if ((await term.count()) === 0) return null;
    return (await term.locator('xpath=following-sibling::dd[1]').textContent()) ?? '';
  }

  async getProfileInfo(): Promise<ProfileInfo> {
    await this.profileSection.waitFor({ state: 'visible' });
    return {
      email: (await this.getFact('Email')) ?? '',
      role: (await this.getFact('Role')) ?? '',
      signInMethod: await this.getFact('Sign-in method'),
      memberSince: (await this.getFact('Member since')) ?? '',
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
  // Calendar & contacts sync helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate a new token by clicking "Generate token".
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
   * Regenerate the token: click "Regenerate token", confirm "Create a new token?", wait for
   * the POST and return the new token text.
   */
  async regenerateToken(): Promise<string> {
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/api/users/me/dav/token') && r.request().method() === 'POST',
    );
    await this.regenerateTokenButton.click();
    await this.regenerateDialog.confirm();
    await responsePromise;
    await this.tokenDisplay.waitFor({ state: 'visible' });
    return (await this.tokenDisplay.textContent()) ?? '';
  }

  /**
   * Revoke the token by clicking "Revoke token" and confirming the ConfirmDialog
   * ("Revoke calendar access?", #2209 - no native window.confirm any more).
   * Waits for the DELETE /api/users/me/dav/token response.
   */
  async revokeToken(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/api/users/me/dav/token') && r.request().method() === 'DELETE',
    );
    await this.revokeTokenButton.click();
    await this.revokeDialog.confirm();
    await responsePromise;
    await this.revokeDialog.dialog.waitFor({ state: 'hidden' });
  }

  /**
   * Mock the token endpoints so a test needs no real generation (POST is limited to 10 per
   * hour). The GET status starts at `hasToken: false` and flips to an active token after the
   * mocked POST. Returns the synthetic token and a counter of POSTs seen.
   */
  async mockTokenEndpoints(
    token = 'e2e-synthetic-token-0001',
    initiallyActive = false,
  ): Promise<{ token: string; posts: () => number }> {
    let active = initiallyActive;
    let posts = 0;
    await this.page.route('**/api/users/me/dav/token', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        posts += 1;
        active = true;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ token }),
        });
      } else if (method === 'DELETE') {
        active = false;
        await route.fulfill({ status: 204 });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            active
              ? { hasToken: true, createdAt: '2026-01-15T09:00:00.000Z' }
              : { hasToken: false },
          ),
        });
      }
    });
    return { token, posts: () => posts };
  }

  /**
   * Returns true if a token is currently active (the "Regenerate token" button is visible,
   * meaning status.hasToken is true).
   */
  async isDavTokenActive(): Promise<boolean> {
    return await this.regenerateTokenButton.isVisible();
  }

  /**
   * Ensure no token is active for the authenticated user.
   * Calls DELETE /api/users/me/dav/token directly via the API — used in test setup.
   */
  async clearDavTokenViaApi(): Promise<void> {
    await this.page.request.delete('/api/users/me/dav/token');
  }
}
