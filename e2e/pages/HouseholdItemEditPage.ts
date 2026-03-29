/**
 * Page Object Model for the Household Item Edit page (/project/household-items/:id/edit)
 *
 * The page renders:
 * - A back button "← Back to Item" (navigates to /project/household-items/:id)
 * - An h1 heading "Edit Household Item"
 * - An error banner for load failures
 * - A form with:
 *   - #name (required text input)
 *   - #description (optional textarea)
 *   - #category (required select) — populated from HouseholdItemCategoryEntity list
 *   - #quantity (optional number input, min=1)
 *   - AreaPicker component — NOT a plain select, uses SearchPicker (labelKey)
 *   - #vendorId (optional select from vendor list)
 *   - #url (optional URL input)
 * - Submit button: "Save Changes" / "Saving..."
 * - Cancel button: navigates back to the detail page
 * - Validation error messages: role="alert" under individual fields
 *
 * Key DOM observations from source code (HouseholdItemEditPage.tsx):
 * - Route: /project/household-items/:id/edit
 * - h1 text: t('edit.title') = "Edit Household Item"
 * - Back button: class="backButton", text = t('edit.backButton') = "← Back to Item"
 * - Error banner for load: class="errorBanner" (no role="alert" on the load error itself)
 * - Field validation errors: id="hi-edit-name-error", id="hi-edit-category-error",
 *   id="hi-edit-quantity-error" — each has role="alert"
 * - On success: showToast + navigate to /project/household-items/:id
 * - On not found: renders a not-found banner (no form)
 */

import type { Page, Locator } from '@playwright/test';

export class HouseholdItemEditPage {
  readonly page: Page;

  // Navigation
  readonly backButton: Locator;

  // Page heading
  readonly heading: Locator;

  // Error banner (load failure, non-field errors)
  readonly errorBanner: Locator;

  // Form fields
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly categorySelect: Locator;
  readonly quantityInput: Locator;
  readonly vendorSelect: Locator;
  readonly urlInput: Locator;

  // Validation error messages per field
  readonly nameError: Locator;
  readonly categoryError: Locator;
  readonly quantityError: Locator;

  // Form action buttons
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  // Not-found state
  readonly notFoundHeading: Locator;

  constructor(page: Page) {
    this.page = page;

    // Back button — class="backButton", text "← Back to Item"
    this.backButton = page.getByRole('button', { name: /Back to Item/i });

    // h1 heading
    this.heading = page.getByRole('heading', {
      level: 1,
      name: 'Edit Household Item',
      exact: true,
    });

    // Error banner for load failure (div.errorBanner, no role="alert" on this one)
    this.errorBanner = page.locator('[class*="errorBanner"]').first();

    // Form fields — using IDs from the JSX
    this.nameInput = page.locator('#name');
    this.descriptionInput = page.locator('#description');
    this.categorySelect = page.locator('#category');
    this.quantityInput = page.locator('#quantity');
    // Area picker uses AreaPicker component — no plain #area id; not a standard select.
    // Tests should use URL-based navigation or interact with AreaPicker via role/text.
    this.vendorSelect = page.locator('#vendorId');
    this.urlInput = page.locator('#url');

    // Field-level validation errors — each has role="alert"
    this.nameError = page.locator('#hi-edit-name-error');
    this.categoryError = page.locator('#hi-edit-category-error');
    this.quantityError = page.locator('#hi-edit-quantity-error');

    // Submit and cancel buttons
    this.submitButton = page.getByRole('button', { name: /Save Changes|Saving\.\.\./i });
    this.cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });

    // Not-found heading (shown when 404 response on load)
    this.notFoundHeading = page.getByRole('heading', {
      level: 1,
      name: 'Household Item Not Found',
      exact: true,
    });
  }

  /**
   * Navigate to the edit page for the given household item ID.
   * Waits for the form heading to become visible (confirms the form loaded).
   */
  async goto(id: string): Promise<void> {
    await this.page.goto(`/project/household-items/${id}/edit`);
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Fill the edit form. Only provided fields are updated.
   * Category must be the option value (category ID from HouseholdItemCategoryEntity).
   * Vendor must be the option value (vendor ID) or empty string to clear.
   */
  async fillForm(data: {
    name?: string;
    description?: string;
    categoryId?: string;
    quantity?: number;
    vendorId?: string;
    url?: string;
  }): Promise<void> {
    if (data.name !== undefined) {
      await this.nameInput.clear();
      await this.nameInput.fill(data.name);
    }
    if (data.description !== undefined) {
      await this.descriptionInput.clear();
      await this.descriptionInput.fill(data.description);
    }
    if (data.categoryId !== undefined) {
      await this.categorySelect.selectOption(data.categoryId);
    }
    if (data.quantity !== undefined) {
      await this.quantityInput.fill(String(data.quantity));
    }
    if (data.vendorId !== undefined) {
      await this.vendorSelect.selectOption(data.vendorId);
    }
    if (data.url !== undefined) {
      await this.urlInput.clear();
      await this.urlInput.fill(data.url);
    }
  }

  /**
   * Submit the edit form. Registers waitForResponse for PATCH before clicking submit.
   * On success, navigates to the household item detail page.
   *
   * @param itemId - The household item ID, used to match the PATCH response URL.
   */
  async submit(itemId: string): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/household-items/${itemId}`) &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
    );
    await this.submitButton.click();
    await responsePromise;
    // After success the page navigates to /project/household-items/:id
    await this.page.waitForURL(`**/project/household-items/${itemId}`);
  }

  /**
   * Cancel the edit by clicking the Cancel button.
   * Navigates back to the detail page.
   */
  async cancel(itemId: string): Promise<void> {
    await this.cancelButton.click();
    await this.page.waitForURL(`**/project/household-items/${itemId}`);
  }

  /**
   * Get the current value of the name input.
   */
  async getNameValue(): Promise<string> {
    return await this.nameInput.inputValue();
  }

  /**
   * Get the current selected value of the category select.
   */
  async getCategoryValue(): Promise<string> {
    return await this.categorySelect.inputValue();
  }
}
