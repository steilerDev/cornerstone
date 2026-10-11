/**
 * Component POM for the shared StatusMenu (#2209).
 *
 * `testId` is the host's id: `work-item-status`, `purchase-status`, `milestone-status`,
 * `invoice-status-badge`, `deposit-status-<id>` / `deposit-status-mobile-<id>`.
 * The trigger is a chip button (or a plain Badge when no transition exists). From 1024 px
 * the surface is an anchored popover (role "menu" / "dialog"); below it is the bottom Sheet,
 * which slides in - wait for the animation to settle before clicking.
 */

import type { Page, Locator } from '@playwright/test';

export class StatusMenuControl {
  readonly page: Page;
  readonly testId: string;
  readonly trigger: Locator;
  readonly panel: Locator;

  constructor(page: Page, testId: string) {
    this.page = page;
    this.testId = testId;
    this.trigger = page.getByTestId(testId);
    this.panel = page.getByTestId(`${testId}-panel`);
  }

  option(to: string): Locator {
    return this.page.getByTestId(`${this.testId}-option-${to}`);
  }

  get dateToday(): Locator {
    return this.page.getByTestId(`${this.testId}-date-today`);
  }

  get datePlanned(): Locator {
    return this.page.getByTestId(`${this.testId}-date-planned`);
  }

  get datePick(): Locator {
    return this.page.getByTestId(`${this.testId}-date-pick`);
  }

  get dateInput(): Locator {
    return this.page.getByTestId(`${this.testId}-date-input`);
  }

  get dateSet(): Locator {
    return this.page.getByTestId(`${this.testId}-date-set`);
  }

  get back(): Locator {
    return this.page.getByTestId(`${this.testId}-back`);
  }

  /** Open the surface and wait until it is interactive (sheet slide-in settled). */
  async open(): Promise<void> {
    await this.trigger.click();
    await this.waitForSurface();
  }

  async waitForSurface(): Promise<void> {
    await this.panel.waitFor({ state: 'visible' });
    await this.panel.evaluate((el) =>
      Promise.all(el.getAnimations().map((animation) => animation.finished)),
    );
  }

  /** Wait for the surface to close after an apply (the trigger collapses). */
  async waitForClosed(): Promise<void> {
    await this.page.locator(`[data-testid="${this.testId}"][aria-expanded="false"]`).waitFor();
  }

  /** Open and click a row that has no date step (reverse moves, invoice Mark paid). */
  async pickRow(to: string): Promise<void> {
    await this.open();
    await this.option(to).click();
  }

  /** Open, choose the row, then answer the date step with Today. */
  async chooseToday(to: string): Promise<void> {
    await this.pickRow(to);
    await this.dateToday.click();
  }

  /** Open, choose the row, then answer the date step with the "As planned" / "On target" chip. */
  async choosePlanned(to: string): Promise<void> {
    await this.pickRow(to);
    await this.datePlanned.click();
  }

  /** Open, choose the row, reveal the date field, type an ISO date and press Set date. */
  async choosePickedDate(to: string, isoDate: string): Promise<void> {
    await this.pickRow(to);
    await this.datePick.click();
    await this.dateInput.fill(isoDate);
    await this.dateSet.click();
  }
}
