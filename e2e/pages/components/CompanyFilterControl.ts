/**
 * Component POM for a DataTable company column filter (entity filter on Tasks, Purchases and
 * Invoices). The header button "Filter by Vendor" opens a `role="dialog"` popover named alike
 * that holds a single-select SearchPicker (search the server, no create row). The selected company
 * shows as a chip with a "Clear selection" button; the choice is the `filterParamKey` URL param.
 *
 * Table headers are not shown on phone cards, so callers skip this control below 768px.
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class CompanyFilterControl {
  readonly page: Page;
  readonly paramKey: string;
  /** The column header's "Filter by Vendor" button. */
  readonly button: Locator;
  /** The open popover. */
  readonly popover: Locator;
  readonly input: Locator;
  readonly dropdown: Locator;
  readonly selectedChip: Locator;
  readonly clearButton: Locator;

  constructor(page: Page, paramKey: string, columnLabel = 'Vendor') {
    this.page = page;
    this.paramKey = paramKey;
    const name = `Filter by ${columnLabel}`;
    this.button = page.getByRole('button', { name, exact: true });
    this.popover = page.getByRole('dialog', { name, exact: true });
    this.input = this.popover.locator('input');
    this.dropdown = page.locator('[data-search-picker-dropdown]');
    this.selectedChip = this.popover.locator('[class*="selectedDisplay"]');
    this.clearButton = this.popover.getByRole('button', { name: 'Clear selection', exact: true });
  }

  /** Open the popover from the header button (no-op when it is open). */
  async open(): Promise<void> {
    if (await this.popover.isVisible()) return;
    await this.button.waitFor({ state: 'visible' });
    await this.button.click();
    await expect(this.popover).toBeVisible();
  }

  /**
   * Open the filter, type the company name and click its row. The picker lists the unfiltered
   * results on focus and swaps in the searched ones 300ms after typing, so the click waits until
   * exactly one row carries the name.
   */
  async choose(name: string): Promise<void> {
    await this.open();
    // A chosen company replaces the input: clear it first
    if (await this.selectedChip.isVisible()) await this.clearButton.click();
    await this.input.fill(name);
    const row = this.dropdown.getByRole('option').filter({ hasText: name });
    await expect(row).toHaveCount(1);
    await row.click();
    await expect(this.selectedChip).toContainText(name);
  }

  /**
   * Close the popover with Escape. While the picker's list is open the first Escape closes only
   * that list, so the key is repeated until the popover is gone.
   */
  async closeWithEscape(): Promise<void> {
    await expect(async () => {
      if (await this.popover.isVisible()) await this.page.keyboard.press('Escape');
      await expect(this.popover).toBeHidden({ timeout: 1000 });
    }).toPass();
  }

  /** The URL carries this filter's param with `value` (any value when omitted). */
  async expectParam(value?: string): Promise<void> {
    await expect(async () => {
      const current = new URL(this.page.url()).searchParams.get(this.paramKey);
      if (value === undefined) expect(current).not.toBeNull();
      else expect(current).toBe(value);
    }).toPass();
  }

  async expectNoParam(): Promise<void> {
    await expect(async () => {
      expect(new URL(this.page.url()).searchParams.has(this.paramKey)).toBe(false);
    }).toPass();
  }
}
