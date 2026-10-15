/**
 * Component POM for the shared `SearchPicker` (server-searching chooser).
 *
 * The input is replaced by a "selected" chip once a value is chosen (except in add mode,
 * `clearOnSelect`, where the input stays, empties and keeps focus). The dropdown is portaled to
 * the body (`[data-search-picker-dropdown]`); its rows are `role="option"` buttons. The picker
 * searches 300ms after typing and ignores ArrowDown while it loads, so the keyboard path
 * (`pick`) retries until the option holds focus, then activates it with Enter.
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class SearchPickerControl {
  readonly page: Page;
  readonly inputId: string;
  readonly input: Locator;
  readonly dropdown: Locator;
  /** The "Clear selection" button; scope it to the picker's host when the page has several. */
  readonly clearButton: Locator;

  constructor(page: Page, inputId: string, scope?: Locator) {
    this.page = page;
    this.inputId = inputId;
    this.input = (scope ?? page).locator(`#${inputId}`);
    this.dropdown = page.locator('[data-search-picker-dropdown]');
    this.clearButton = (scope ?? page).getByRole('button', {
      name: 'Clear selection',
      exact: true,
    });
  }

  /** A result row whose text contains `text` (the row also holds secondary text). */
  option(text: string | RegExp): Locator {
    return this.dropdown.getByRole('option').filter({ hasText: text });
  }

  /**
   * The selected chip. A selected picker has no input, so the chip is found through the label
   * that points at the input id, one level up.
   */
  selectedDisplay(): Locator {
    return this.page
      .locator(`label[for="${this.inputId}"]`)
      .locator('xpath=..')
      .locator('[class*="selectedDisplay"]');
  }

  /**
   * Type into the picker and wait for its dropdown. The field is emptied first: filling the text
   * it already holds fires no input event, so a closed dropdown would never reopen.
   */
  async type(text: string): Promise<void> {
    await this.input.fill('');
    await this.input.fill(text);
    await this.dropdown.waitFor({ state: 'visible' });
  }

  /**
   * Search `text`, move to the single matching row with ArrowDown (never `.focus()`: the keyboard
   * path is what users take) and activate it with Enter. `rowText` defaults to `text`. See
   * `pickByKeyboard`.
   */
  async pick(text: string, rowText: string | RegExp = text): Promise<void> {
    await this.type(text);
    await pickByKeyboard(this.page, this.input, rowText);
  }
}

/**
 * Choose the one row whose text contains `rowText` from the open dropdown, by keyboard.
 *
 * The list is first waited to settle (the unfiltered list shown before the 300ms search answers
 * holds other rows, and swapping it would swallow the keys; `ignore` rows such as a special
 * "Other..." entry or the create row are not counted). Then ArrowDown moves focus down the list
 * until the row holds it and Enter activates it; the whole key path repeats until the dropdown has
 * closed, because a re-render between the arrow and the Enter can swallow the key.
 */
export async function pickByKeyboard(
  page: Page,
  input: Locator,
  rowText: string | RegExp,
  ignore: string | RegExp = /^New company /,
): Promise<void> {
  const dropdown = page.locator('[data-search-picker-dropdown]');
  const options = dropdown.getByRole('option');
  const row = options.filter({ hasText: rowText });
  await expect(row).toHaveCount(1);
  await expect(options.filter({ hasNotText: rowText }).filter({ hasNotText: ignore })).toHaveCount(
    0,
  );
  const rowFocused = () => row.evaluate((el) => el === document.activeElement).catch(() => false);
  await expect(async () => {
    if (!(await dropdown.isVisible())) return;
    for (let step = 0; step < 6 && !(await rowFocused()); step++) {
      if (await page.evaluate(() => document.activeElement === document.body)) await input.click();
      await page.keyboard.press('ArrowDown');
    }
    expect(await rowFocused()).toBe(true);
    await page.keyboard.press('Enter');
    await expect(dropdown).toBeHidden();
  }).toPass();
}
