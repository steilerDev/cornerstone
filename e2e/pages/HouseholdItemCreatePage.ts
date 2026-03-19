/**
 * Page Object Model for the Household Item Create page (/project/household-items/new)
 *
 * EPIC-04 Story 4.4: Create & Edit Form
 * Updated in EPIC-18: room field removed, replaced by AreaPicker (select with aria-label="Select an area");
 *                     tags removed; categories updated (hic-outdoor + hic-storage removed, hic-equipment added)
 *
 * The page renders:
 * - A header with a back button ("← Back to Household Items", a <button>)
 *   and h1 "New Household Item"
 * - A form with household item fields:
 *   - #name (text, required) — shows validation error when empty on submit
 *   - #description (textarea)
 *   - #category (select) — options loaded from API via fetchHouseholdItemCategories()
 *   - #status (select) — options: planned, purchased, scheduled, arrived
 *   - #quantity (number, min 1)
 *   - AreaPicker (select, aria-label="Select an area") — replaces the old #room text input
 *   - #vendorId (select)
 *   - #url (text)
 *   - #orderDate, #earliestDeliveryDate, #latestDeliveryDate, #actualDeliveryDate (date inputs)
 * - Submit button: text "Create Item" / "Creating..."
 * - Cancel button: text "Cancel"
 * - Error banner for server-side errors
 *
 * Key DOM observations from source code:
 * - Back button is a <button> with onClick navigate('/project/household-items')
 * - Submit button is type="submit", disabled during isSubmitting
 * - On success, navigates to /project/household-items/:id (the detail page)
 */

import type { Page, Locator } from '@playwright/test';

export const HOUSEHOLD_ITEM_CREATE_ROUTE = '/project/household-items/new';

export interface HouseholdItemFormData {
  name?: string;
  description?: string;
  category?: string;
  status?: string;
  quantity?: string;
  vendorId?: string;
  url?: string;
  /** areaId — value of the AreaPicker select (area ID from /api/areas). room field removed in EPIC-18. */
  areaId?: string;
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
  /** AreaPicker select — replaces the old room text input (EPIC-18) */
  readonly areaSelect: Locator;
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
    // AreaPicker renders a <select> with aria-label="Select an area" (no id attribute)
    this.areaSelect = page.getByLabel('Select an area');
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
    if (data.areaId !== undefined) {
      await this.areaSelect.selectOption(data.areaId);
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
      { timeout: 30000 },
    );
    await this.submitButton.click();
    await responsePromise;
    // Wait for navigation to the detail page — exclude /new to avoid
    // resolving immediately on the create page URL.
    await this.page.waitForURL(
      (url) => {
        const path = url.pathname;
        return path.startsWith('/project/household-items/') && !path.endsWith('/new');
      },
      { timeout: 30000 },
    );
    // Extract the ID from the URL path
    const url = this.page.url();
    const match = url.match(/\/project\/household-items\/([^/]+)$/);
    return match ? match[1] : '';
  }

  /**
   * Submit the form without waiting for navigation (used for error cases).
   */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
