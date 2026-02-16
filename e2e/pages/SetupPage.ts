/**
 * Page Object Model for the Setup page (/setup)
 */

import type { Page, Locator } from '@playwright/test';
import { ROUTES } from '../fixtures/testData.js';

interface SetupFormData {
  email: string;
  displayName: string;
  password: string;
  confirmPassword: string;
}

export class SetupPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly description: Locator;
  readonly emailInput: Locator;
  readonly displayNameInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly errorBanner: Locator;
  readonly passwordHint: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Initial Setup' });
    this.description = page.getByText('Create the admin account to get started with Cornerstone.');
    this.emailInput = page.getByLabel('Email');
    this.displayNameInput = page.getByLabel('Display Name');
    this.passwordInput = page.getByLabel('Password', { exact: true });
    this.confirmPasswordInput = page.getByLabel('Confirm Password');
    this.submitButton = page.getByRole('button', { name: /Create Admin Account|Creating Account/ });
    this.errorBanner = page.locator('[role="alert"]').first();
    this.passwordHint = page.getByText('Minimum 12 characters');
  }

  async goto(): Promise<void> {
    await this.page.goto(ROUTES.setup);
  }

  async fillForm(data: SetupFormData): Promise<void> {
    await this.emailInput.fill(data.email);
    await this.displayNameInput.fill(data.displayName);
    await this.passwordInput.fill(data.password);
    await this.confirmPasswordInput.fill(data.confirmPassword);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async getFieldError(fieldId: string): Promise<string | null> {
    const errorLocator = this.page.locator(`#${fieldId}-error`);
    const isVisible = await errorLocator.isVisible();
    return isVisible ? await errorLocator.textContent() : null;
  }

  async getErrorBanner(): Promise<string | null> {
    const isVisible = await this.errorBanner.isVisible();
    return isVisible ? await this.errorBanner.textContent() : null;
  }

  async expectSuccessRedirect(): Promise<void> {
    await this.page.waitForURL(ROUTES.login);
  }

  async isSubmitButtonDisabled(): Promise<boolean> {
    return await this.submitButton.isDisabled();
  }
}
