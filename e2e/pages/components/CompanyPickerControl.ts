/**
 * Component POM for a company EntityPicker (kind `company` or `who`) with the inline "New company ‹text›" row (#2213).
 *
 * Used for the Paperless review (`#vendor-picker`), the Edit details dialog (`#vendorId`), the
 * diary daily log (`#daily-log-vendor`), the New invoice dialog (`#vendorId`) and the
 * purchase form and purchase edit page (`#vendorId`), the cost line form (`#budget-vendor`), the
 * task page Who and where card (via `EntityPickerControl`) and the New task dialog (`#assignment`, the Who
 * kind: a "Companies" group, then "Household members"; one pick only). `pick(name)` chooses an existing company by keyboard. The dropdown is
 * portaled to the body (`[data-search-picker-dropdown]`),
 * the create row is the last `role="option"` and appears only when no result's label equals the
 * typed text (folded). The created company opens in the shared ObjectForm (test id
 * `company-create-form`) with its name prefilled; Save selects the company and focuses the
 * picker's "Clear selection" button, Cancel focuses the picker input again.
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { ObjectFormDialog } from './ObjectFormDialog.js';
import { EntityPickerControl } from './EntityPickerControl.js';

/** How long one attempt waits for the search to filter the list before the query is retyped. */
const SEARCH_SETTLE_MS = 3_000;

export class CompanyPickerControl extends EntityPickerControl {
  /** The New company form opened by the create row (not the `/companies/new` route dialog). */
  readonly form: ObjectFormDialog;

  constructor(page: Page, inputId: string | Locator, scope?: Locator) {
    super(page, inputId, scope);
    this.form = new ObjectFormDialog(page, 'New company', 'company-create-form');
  }

  /**
   * Move to the create row with ArrowDown (never `.focus()`: the keyboard path is what users
   * take) and return once it is focused. The picker searches 300ms after typing and ignores
   * ArrowDown while it loads, so each attempt first waits for the search to have filtered the
   * list (`text` matches no company, so the create row then stands alone). When the filter did
   * not apply within the settle window the query is typed again (a lost or stale search answer)
   * instead of arrowing through the unfiltered list; then the key press is retried until the
   * create row holds focus.
   */
  async arrowToCreateOption(text: string): Promise<void> {
    const option = this.createOption('company', text);
    const options = this.dropdown.getByRole('option');
    await expect(async () => {
      try {
        await expect(options).toHaveCount(1, { timeout: SEARCH_SETTLE_MS });
        await expect(option).toBeVisible();
      } catch (error) {
        await this.input.fill('');
        await this.input.fill(text);
        throw error;
      }
      const focused = await option
        .evaluate((el) => el === document.activeElement)
        .catch(() => false);
      if (!focused) {
        if (await this.page.evaluate(() => document.activeElement === document.body)) {
          await this.input.click();
        }
        await this.page.keyboard.press('ArrowDown');
      }
      expect(
        await option.evaluate((el) => el === document.activeElement),
        `the "New company ${text}" row should hold focus after ArrowDown`,
      ).toBe(true);
    }, `could not reach the "New company ${text}" row with the keyboard`).toPass();
  }

  /**
   * Type, arrow to the create row and activate it with Enter; waits for the form. A search answer
   * that re-renders the list between the arrow and the Enter can swallow the key, so the whole
   * keyboard path is repeated until the form is open.
   */
  async openCreateForm(text: string): Promise<void> {
    await this.type(text);
    await expect(async () => {
      if (await this.form.dialog.isVisible()) return;
      await this.arrowToCreateOption(text);
      await this.page.keyboard.press('Enter');
      await expect(this.form.dialog).toBeVisible();
    }, `the New company form did not open for "${text}"`).toPass();
    await this.form.waitForOpen();
  }
}
