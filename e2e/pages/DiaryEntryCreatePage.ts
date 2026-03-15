/**
 * Page Object Model for the Diary Entry Create page (/diary/new)
 *
 * The page renders in two steps:
 *
 * Step 1 — Type selector:
 * - h1 "New Diary Entry"
 * - A grid of 5 type cards: data-testid="type-card-{type}"
 *   types: daily_log | site_visit | delivery | issue | general_note
 * - Each card is a <button> that sets the type and transitions to step 2
 * - A "← Back to Diary" button (navigates to /diary)
 *
 * Step 2 — Form:
 * - h1 "New Diary Entry" (same heading, retained)
 * - A "← Back" button (transitions back to type selector)
 * - DiaryEntryForm component with:
 *   Common fields:
 *   - #entry-date (date input, required)
 *   - #title (text input, optional)
 *   - #body (textarea, required)
 *   daily_log-specific:
 *   - #weather (select)
 *   - #temperature (number input)
 *   - #workers (number input)
 *   site_visit-specific:
 *   - #inspector-name (text input, required for site_visit)
 *   - #inspection-outcome (select, required for site_visit)
 *   delivery-specific:
 *   - #vendor (text input)
 *   - #delivery-confirmed (checkbox)
 *   - material-input (text, name="material-input") + Add button
 *   issue-specific:
 *   - #severity (select, required for issue)
 *   - #resolution-status (select, required for issue)
 * - Cancel button ("Cancel") — returns to type selector
 * - Submit button ("Create Entry" / "Creating...") — type="submit"
 * - Error banner (class styles.errorBanner) for server errors
 * - Validation error text (role="alert") per field
 *
 * Key DOM observations from source code:
 * - Type card buttons: data-testid="type-card-{type}"
 * - Clicking a type card immediately transitions to step 2 (handleTypeSelect)
 * - The "Cancel" button in step 2 goes back to the type selector, not /diary
 * - On success, navigates to /diary/:id/edit (UAT fix #843: navigate to edit page after creation)
 * - The material input uses name="material-input" (not an id)
 * - The "Add" button for materials is type="submit" inside a nested <form>
 */

import type { Page, Locator } from '@playwright/test';

export const DIARY_CREATE_ROUTE = '/diary/new';

export type ManualDiaryEntryType =
  | 'daily_log'
  | 'site_visit'
  | 'delivery'
  | 'issue'
  | 'general_note';

export class DiaryEntryCreatePage {
  readonly page: Page;

  // Header
  readonly heading: Locator;

  // Type selector step
  readonly backToDiaryButton: Locator;

  // Form step — navigation
  readonly backToTypeButton: Locator;

  // Common form fields
  readonly entryDateInput: Locator;
  readonly titleInput: Locator;
  readonly bodyTextarea: Locator;

  // daily_log-specific fields
  readonly weatherSelect: Locator;
  readonly temperatureInput: Locator;
  readonly workersInput: Locator;

  // site_visit-specific fields
  readonly inspectorNameInput: Locator;
  readonly outcomeSelect: Locator;

  // delivery-specific fields
  readonly vendorInput: Locator;
  readonly deliveryConfirmedCheckbox: Locator;
  readonly materialInput: Locator;
  readonly addMaterialButton: Locator;

  // issue-specific fields
  readonly severitySelect: Locator;
  readonly resolutionStatusSelect: Locator;

  // Form actions
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  // Error display
  readonly errorBanner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Heading — same h1 text on both steps
    this.heading = page.getByRole('heading', { level: 1, name: 'New Diary Entry', exact: true });

    // Type selector — "← Back to Diary" button
    this.backToDiaryButton = page.getByRole('button', { name: /← Back to Diary/i });

    // Form step — "← Back" button (returns to type selector)
    this.backToTypeButton = page.getByRole('button', { name: /← Back$/i });

    // Common form fields (by id — set on the input elements)
    this.entryDateInput = page.locator('#entry-date');
    this.titleInput = page.locator('#title');
    this.bodyTextarea = page.locator('#body');

    // daily_log fields
    this.weatherSelect = page.locator('#weather');
    this.temperatureInput = page.locator('#temperature');
    this.workersInput = page.locator('#workers');

    // site_visit fields
    this.inspectorNameInput = page.locator('#inspector-name');
    this.outcomeSelect = page.locator('#inspection-outcome');

    // delivery fields
    this.vendorInput = page.locator('#vendor');
    this.deliveryConfirmedCheckbox = page.locator('#delivery-confirmed');
    this.materialInput = page.locator('[name="material-input"]');
    this.addMaterialButton = page.getByRole('button', { name: 'Add', exact: true });

    // issue fields
    this.severitySelect = page.locator('#severity');
    this.resolutionStatusSelect = page.locator('#resolution-status');

    // Form actions
    // Submit button text is "Create Entry" / "Creating..." while submitting
    this.submitButton = page.getByRole('button', { name: /Create Entry|Creating\.\.\./i });
    // Cancel button in the form step (returns to type selector)
    this.cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });

    // Error banner for server-side errors
    this.errorBanner = page.locator('[class*="errorBanner"]');
  }

  /**
   * Navigate to the diary entry create page (type selector step).
   * Waits for the heading to be visible.
   * No explicit timeout — uses project-level actionTimeout.
   */
  async goto(): Promise<void> {
    await this.page.goto(DIARY_CREATE_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Get the type card locator for the given entry type.
   * data-testid="type-card-{type}"
   */
  typeCard(type: ManualDiaryEntryType): Locator {
    return this.page.getByTestId(`type-card-${type}`);
  }

  /**
   * Count the type selector cards currently visible on the page.
   */
  async typeCardCount(): Promise<number> {
    return this.page.locator('[data-testid^="type-card-"]').count();
  }

  /**
   * Select an entry type from the type selector step.
   * Clicking the card transitions immediately to the form step.
   * Waits for the body textarea to become visible (confirms form step loaded).
   * No explicit timeout — uses project-level actionTimeout.
   */
  async selectType(type: ManualDiaryEntryType): Promise<void> {
    await this.typeCard(type).waitFor({ state: 'visible' });
    await this.typeCard(type).click();
    // Wait for the form step — body textarea is always rendered
    await this.bodyTextarea.waitFor({ state: 'visible' });
  }

  /**
   * Submit the "Create Entry" form.
   * Does NOT wait for navigation — callers should await the URL change
   * or API response themselves.
   */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * Get all validation error texts currently rendered (role="alert").
   * Returns an array of visible error message strings.
   */
  async getValidationErrors(): Promise<string[]> {
    const alerts = this.page.locator('[role="alert"]');
    const count = await alerts.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await alerts.nth(i).textContent();
      if (text) texts.push(text.trim());
    }
    return texts;
  }
}
