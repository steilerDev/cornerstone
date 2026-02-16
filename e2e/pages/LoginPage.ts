/**
 * Page Object Model for the Login page (/login)
 */

import type { Page, Locator } from '@playwright/test';
import { ROUTES } from '../fixtures/testData.js';

export class LoginPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly description: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly ssoButton: Locator;
  readonly errorBanner: Locator;
  readonly divider: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Sign In' });
    this.description = page.getByText('Sign in to your Cornerstone account.');
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.signInButton = page.getByRole('button', { name: /Sign In|Signing In/ });
    this.ssoButton = page.getByRole('button', { name: 'Login with SSO' });
    this.errorBanner = page.locator('[role="alert"]').first();
    this.divider = page.getByText('or', { exact: true });
  }

  async goto(): Promise<void> {
    await this.page.goto(ROUTES.login);
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  async clickSSO(): Promise<void> {
    await this.ssoButton.click();
  }

  async getErrorBanner(): Promise<string | null> {
    try {
      await this.errorBanner.waitFor({ state: 'visible', timeout: 5000 });
      return await this.errorBanner.textContent();
    } catch {
      return null;
    }
  }

  async isSSOButtonVisible(): Promise<boolean> {
    return await this.ssoButton.isVisible();
  }

  async expectRedirectToDashboard(): Promise<void> {
    await this.page.waitForURL(ROUTES.home);
  }

  async isSignInButtonDisabled(): Promise<boolean> {
    return await this.signInButton.isDisabled();
  }
}
