/**
 * Page Object Model for the New purchase dialog (/project/household-items/new), #2212.
 *
 * The create page is gone: `/project/household-items/new` opens the ObjectForm dialog over the
 * page the user came from (or over the Purchases list on a deep link). From 768px it is a
 * Modal, below a full-screen Sheet; both are role="dialog" named "New purchase".
 *
 * Fields (ids kept from the page):
 * - Essentials: #name (required), #category (required, select), #status, #quantity, the area
 *   picker (label for="area"), #vendorId (a company SearchPicker with the
 *   inline "New company ‹text›" row since #2213; its create flow is a child step of this dialog)
 * - Behind "More details": #description, #url, #orderDate, #earliestDeliveryDate,
 *   #latestDeliveryDate, #actualDeliveryDate
 *
 * Behaviour:
 * - Category defaults to the first category once the options load.
 * - Save is `object-form-save`; validation errors are inline field errors (`#name-error`, ...).
 * - On success the URL is replaced with the new item (`/project/household-items/:id`).
 */

import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { EntityPickerControl } from './components/EntityPickerControl.js';
import { CompanyPickerControl } from './components/CompanyPickerControl.js';
import { ObjectFormDialog } from './components/ObjectFormDialog.js';

export const HOUSEHOLD_ITEM_CREATE_ROUTE = routeUrl('householdItemNew');

export interface HouseholdItemFormData {
  name?: string;
  description?: string;
  category?: string;
  status?: string;
  quantity?: string;
  /** Company name to pick in the company picker. */
  vendorName?: string;
  url?: string;
  /** areaId — value of the AreaPicker select (area ID from /api/areas). */
  areaId?: string;
  orderDate?: string;
  earliestDeliveryDate?: string;
  latestDeliveryDate?: string;
  actualDeliveryDate?: string;
}

export class HouseholdItemCreatePage {
  readonly page: Page;
  readonly form: ObjectFormDialog;

  // Header
  readonly dialog: Locator;
  /** The dialog's h2 "New purchase". */
  readonly heading: Locator;

  // Form fields
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  /** The category chooser (#category): an EntityPicker; the first category is preselected. */
  readonly categoryPicker: EntityPickerControl;
  readonly statusSelect: Locator;
  readonly quantityInput: Locator;
  /** The company picker's text input (#vendorId); only present while no company is selected. */
  readonly vendorSelect: Locator;
  /** The company picker control (input, dropdown, create row, clear button). */
  readonly vendorPicker: CompanyPickerControl;
  /** The picker's selected-company chip (replaces the input once a company is chosen). */
  readonly vendorSelectedDisplay: Locator;
  readonly urlInput: Locator;
  /** AreaPicker select (aria-label="Select an area") */
  readonly areaSelect: Locator;
  readonly orderDateInput: Locator;
  readonly earliestDeliveryDateInput: Locator;
  readonly latestDeliveryDateInput: Locator;
  readonly actualDeliveryDateInput: Locator;

  // Form actions
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly moreDetailsToggle: Locator;

  // Error/validation display
  /** Save-error banner (role="alert"); validation errors are inline per field. */
  readonly errorBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.form = new ObjectFormDialog(page, 'New purchase');
    this.dialog = this.form.dialog;
    this.heading = this.form.heading;

    this.nameInput = this.form.field('name');
    this.descriptionInput = this.form.field('description');
    this.categoryPicker = new EntityPickerControl(page, 'category', this.dialog);
    this.statusSelect = this.form.field('status');
    this.quantityInput = this.form.field('quantity');
    this.vendorSelect = this.form.field('vendorId');
    this.vendorPicker = new CompanyPickerControl(page, 'vendorId', this.dialog);
    this.vendorSelectedDisplay = this.dialog
      .locator('label[for="vendorId"]')
      .locator('xpath=..')
      .locator('[class*="selectedDisplay"]');
    this.urlInput = this.form.field('url');
    this.areaSelect = this.dialog.getByLabel('Select an area');
    this.orderDateInput = this.form.field('orderDate');
    this.earliestDeliveryDateInput = this.form.field('earliestDeliveryDate');
    this.latestDeliveryDateInput = this.form.field('latestDeliveryDate');
    this.actualDeliveryDateInput = this.form.field('actualDeliveryDate');

    this.submitButton = this.form.saveButton;
    this.cancelButton = this.form.cancelButton;
    this.moreDetailsToggle = this.form.moreToggle;

    this.errorBanner = this.form.errorBanner;
  }

  /** Open the dialog by deep link (the Purchases list renders behind it) and wait for it. */
  async goto(): Promise<void> {
    await this.page.goto(HOUSEHOLD_ITEM_CREATE_ROUTE);
    await this.form.waitForOpen();
  }

  /** Open the "More details" disclosure. */
  async expandMoreDetails(): Promise<void> {
    await this.form.expandMoreDetails();
  }

  /**
   * Choose a category by its (display) name, e.g. "Furniture". The first category is preselected,
   * so a chip is cleared first; the picker is then searched and the one match picked by keyboard.
   */
  async chooseCategory(name: string): Promise<void> {
    if ((await this.categoryPicker.input.count()) === 0)
      await this.categoryPicker.clearButton.click();
    await this.categoryPicker.pick(name, new RegExp(`^${name}$`));
  }

  /** Inline error text under a field (`#<name>-error`). */
  fieldError(name: string): Locator {
    return this.form.fieldError(name);
  }

  /**
   * Fill multiple form fields at once. "More details" is opened first when a non-essential
   * field is given.
   */
  async fillForm(data: HouseholdItemFormData): Promise<void> {
    const needsMore =
      data.description !== undefined ||
      data.url !== undefined ||
      data.orderDate !== undefined ||
      data.earliestDeliveryDate !== undefined ||
      data.latestDeliveryDate !== undefined ||
      data.actualDeliveryDate !== undefined;
    if (needsMore) await this.expandMoreDetails();

    if (data.name !== undefined) await this.nameInput.fill(data.name);
    if (data.description !== undefined) await this.descriptionInput.fill(data.description);
    if (data.category !== undefined) await this.chooseCategory(data.category);
    if (data.status !== undefined) await this.statusSelect.selectOption(data.status);
    if (data.quantity !== undefined) await this.quantityInput.fill(data.quantity);
    if (data.vendorName !== undefined) {
      await this.vendorSelect.fill(data.vendorName);
      await this.vendorPicker.dropdown
        .getByRole('option', { name: data.vendorName, exact: true })
        .click();
    }
    if (data.url !== undefined) await this.urlInput.fill(data.url);
    if (data.areaId !== undefined) await this.areaSelect.selectOption(data.areaId);
    if (data.orderDate !== undefined) await this.orderDateInput.fill(data.orderDate);
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
    // Wait for navigation to the detail page — exclude /new to avoid
    // resolving immediately on the dialog's own URL.
    await this.page.waitForURL((url) => {
      const path = url.pathname;
      return path.startsWith(`${routeUrl('householdItems')}/`) && !path.endsWith('/new');
    });
    const match = new URL(this.page.url()).pathname.match(/\/project\/household-items\/([^/]+)$/);
    return match?.[1] ?? '';
  }

  /** Click Cancel and wait for the dialog to close. */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.form.waitForClosed();
  }

  /** Click Save without waiting for navigation (used for error cases). */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
