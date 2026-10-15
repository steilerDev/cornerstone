/**
 * Component POM for a company SearchPicker with the inline "New company ‹text›" row (#2213).
 *
 * Used for the Paperless review (`#vendor-picker`), the invoice edit modal (`#edit-vendor`), the
 * diary daily log (`#daily-log-vendor`), the invoice create modal (`#invoice-vendor`) and the
 * purchase form and purchase edit page (`#vendorId`), the cost line form (`#budget-vendor`), the
 * task detail assignment (`#work-item-assignment`) and the New task dialog (`#assignment`, which
 * also lists people). `pick(name)` chooses an existing company by keyboard. The dropdown is
 * portaled to the body (`[data-search-picker-dropdown]`),
 * the create row is the last `role="option"` and appears only when no result's label equals the
 * typed text (folded). The created company opens in the shared ObjectForm (test id
 * `company-create-form`) with its name prefilled; Save selects the company and focuses the
 * picker's "Clear selection" button, Cancel focuses the picker input again.
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { ObjectFormDialog } from './ObjectFormDialog.js';
import { SearchPickerControl } from './SearchPickerControl.js';

export class CompanyPickerControl extends SearchPickerControl {
  /** The New company form opened by the create row (not the `/companies/new` route dialog). */
  readonly form: ObjectFormDialog;

  constructor(page: Page, inputId: string, scope?: Locator) {
    super(page, inputId, scope);
    this.form = new ObjectFormDialog(page, 'New company', 'company-create-form');
  }

  /** The create row. Pass the typed text for an exact label match. */
  createOption(text?: string): Locator {
    const name = text === undefined ? /New company/ : new RegExp(`New company ${escape(text)}$`);
    return this.dropdown.getByRole('option', { name });
  }

  /**
   * Move to the create row with ArrowDown (never `.focus()`: the keyboard path is what users
   * take) and return once it is focused. The picker searches 300ms after typing and ignores
   * ArrowDown while it loads, so the key press is retried until the create row holds focus.
   */
  async arrowToCreateOption(text: string): Promise<void> {
    const option = this.createOption(text);
    await expect(option).toBeVisible();
    // `text` matches no company, so once the search has answered the create row stands alone.
    // Until then the dropdown still lists the unfiltered results and ignores ArrowDown.
    await expect(this.dropdown.getByRole('option')).toHaveCount(1);
    await expect(async () => {
      const focused = await option
        .evaluate((el) => el === document.activeElement)
        .catch(() => false);
      if (!focused) {
        if (await this.page.evaluate(() => document.activeElement === document.body)) {
          await this.input.click();
        }
        await this.page.keyboard.press('ArrowDown');
      }
      expect(await option.evaluate((el) => el === document.activeElement)).toBe(true);
    }).toPass();
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
    }).toPass();
    await this.form.waitForOpen();
  }
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
