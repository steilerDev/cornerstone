/**
 * Page Object Model for the Household Item Create page (/household-items/new)
 *
 * EPIC-04 Story 4.4: Create & Edit Form
 *
 * The page renders:
 * - A header with a back button ("← Back to Household Items", a <button>)
 *   and h1 "New Household Item"
 * - A form with household item fields:
 *   - #name (text, required) — shows validation error when empty on submit
 *   - #description (textarea)
 *   - #category (select) — options: furniture, appliances, fixtures, decor, electronics, outdoor, storage, other
 *   - #status (select) — options: planned, purchased, scheduled, arrived
 *   - #quantity (number, min 1)
 *   - #vendorId (select)
 *   - #url (text)
 *   - #room (text)
 *   - #orderDate, #earliestDeliveryDate, #latestDeliveryDate, #actualDeliveryDate (date inputs)
 *   - Tags: TagPicker component
 * - Submit button: text "Create Item" / "Creating..."
 * - Cancel button: text "Cancel"
 * - Error banner for server-side errors
 *
 * Key DOM observations from source code:
 * - Back button is a <button> with onClick navigate('/household-items')
 * - Submit button is type="submit", disabled during isSubmitting
 * - On success, navigates to /household-items/:id (the detail page)
 */

import type { Page, Locator } from '@playwright/test';

export const HOUSEHOLD_ITEM_CREATE_ROUTE = '/household-items/new';

export interface HouseholdItemFormData {
  name?: string;
  description?: string;
  category?: string;
  status?: string;
  quantity?: string;
  vendorId?: string;
  url?: string;
  room?: string;
  orderDate?: string;
  earliestDeliveryDate?: string;
  latestDeliveryDate?: string;
  actualDeliveryDate?: string;
}

export class HouseholdItemCreatePage {
  readonly page: Page;

  // Header
  readonly heading: Locator;
  readonly backButton: Locator;

  // Form fields
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly categorySelect: Locator;
  readonly statusSelect: Locator;
  readonly quantityInput: Locator;
  readonly vendorSelect: Locator;
  readonly urlInput: Locator;
  readonly roomInput: Locator;
  readonly orderDateInput: Locator;
  readonly earliestDeliveryDateInput: Locator;
  readonly latestDeliveryDateInput: Locator;
  readonly actualDeliveryDateInput: Locator;

  // Form actions
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  // Error/validation display
  readonly errorBanner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.heading = page.getByRole('heading', {
      level: 1,
      name: 'New Household Item',
      exact: true,
    });
    this.backButton = page.getByRole('button', { name: /← Back to Household Items/i });

    // Form fields
    this.nameInput = page.locator('#name');
    this.descriptionInput = page.locator('#description');
    this.categorySelect = page.locator('#category');
    this.statusSelect = page.locator('#status');
    this.quantityInput = page.locator('#quantity');
    this.vendorSelect = page.locator('#vendorId');
    this.urlInput = page.locator('#url');
    this.roomInput = page.locator('#room');
    this.orderDateInput = page.locator('#orderDate');
    this.earliestDeliveryDateInput = page.locator('#earliestDeliveryDate');
    this.latestDeliveryDateInput = page.locator('#latestDeliveryDate');
    this.actualDeliveryDateInput = page.locator('#actualDeliveryDate');

    // Form actions
    this.submitButton = page.getByRole('button', { name: /Create Item|Creating\.\.\./i });
    this.cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });

    // Errors
    this.errorBanner = page.locator('[class*="errorBanner"]');
  }

  /**
   * Navigate to the household item create page and wait for the heading.
   */
  async goto(): Promise<void> {
    await this.page.goto(HOUSEHOLD_ITEM_CREATE_ROUTE);
    await this.heading.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Fill multiple form fields at once.
   */
  async fillForm(data: HouseholdItemFormData): Promise<void> {
    if (data.name !== undefined) {
      await this.nameInput.fill(data.name);
    }
    if (data.description !== undefined) {
      await this.descriptionInput.fill(data.description);
    }
    if (data.category !== undefined) {
      await this.categorySelect.selectOption(data.category);
    }
    if (data.status !== undefined) {
      await this.statusSelect.selectOption(data.status);
    }
    if (data.quantity !== undefined) {
      await this.quantityInput.fill(data.quantity);
    }
    if (data.url !== undefined) {
      await this.urlInput.fill(data.url);
    }
    if (data.room !== undefined) {
      await this.roomInput.fill(data.room);
    }
    if (data.orderDate !== undefined) {
      await this.orderDateInput.fill(data.orderDate);
    }
    if (data.earliestDeliveryDate !== undefined) {
      await this.earliestDeliveryDateInput.fill(data.earliestDeliveryDate);
    }
    if (data.latestDeliveryDate !== undefined) {
      await this.latestDeliveryDateInput.fill(data.latestDeliveryDate);
    }
    if (data.actualDeliveryDate !== undefined) {
      await this.actualDeliveryDateInput.fill(data.actualDeliveryDate);
    }
  }

  /**
   * Submit the form and wait for navigation to the detail page.
   * Returns the new item's ID extracted from the URL.
   */
  async submitAndWaitForDetail(): Promise<string> {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/household-items') &&
        resp.request().method() === 'POST' &&
        resp.status() === 201,
    );
    await this.submitButton.click();
    await responsePromise;
    await this.page.waitForURL('**/household-items/**');
    // Extract the ID from the URL path
    const url = this.page.url();
    const match = url.match(/\/household-items\/([^/]+)$/);
    return match ? match[1] : '';
  }

  /**
   * Submit the form without waiting for navigation (used for error cases).
   */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
