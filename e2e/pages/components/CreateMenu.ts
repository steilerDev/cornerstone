/**
 * Component POM for the New menu (#2212).
 *
 * - From 1024px: the top-bar "New v" button (`top-bar-new`, aria-haspopup="menu") opens the
 *   `create-menu` panel with rows `create-menu-<id>`.
 * - Below 1024px: the bottom bar's plus (`bottom-bar-new`, aria-haspopup="dialog") opens the
 *   `create-sheet` dialog named "New" with rows `create-sheet-<id>`.
 *
 * Row ids, in order: diaryEntry, task, purchase, invoice, offer, company, milestone; fundingSource
 * and grant follow (after a separator) on Money pages only.
 */

import type { Page, Locator } from '@playwright/test';

export type CreateEntryId =
  | 'diaryEntry'
  | 'task'
  | 'purchase'
  | 'invoice'
  | 'offer'
  | 'company'
  | 'milestone'
  | 'fundingSource'
  | 'grant';

/** Rows shown everywhere, in menu order. */
export const GENERAL_CREATE_ENTRIES: readonly CreateEntryId[] = [
  'diaryEntry',
  'task',
  'purchase',
  'invoice',
  'offer',
  'company',
  'milestone',
];
/** Rows shown on Money pages only, after the general rows. */
export const MONEY_CREATE_ENTRIES: readonly CreateEntryId[] = ['fundingSource', 'grant'];

/** English row labels (common.createMenu.entry.*). */
export const CREATE_ENTRY_LABELS: Readonly<Record<CreateEntryId, string>> = {
  diaryEntry: 'Diary entry',
  task: 'Task',
  purchase: 'Purchase',
  invoice: 'Invoice',
  offer: 'Offer',
  company: 'Company',
  milestone: 'Milestone',
  fundingSource: 'Funding source',
  grant: 'Grant',
};

export class CreateMenu {
  readonly page: Page;
  /** Desktop trigger (top bar, >= 1024px). */
  readonly trigger: Locator;
  /** Desktop panel. */
  readonly menu: Locator;
  /** Compact trigger (bottom bar plus, < 1024px). */
  readonly plusButton: Locator;
  /** Compact sheet panel; carries role="dialog" only while open. */
  readonly sheet: Locator;
  readonly sheetDialog: Locator;
  readonly sheetClose: Locator;

  constructor(page: Page) {
    this.page = page;
    this.trigger = page.getByTestId('top-bar-new');
    this.menu = page.getByTestId('create-menu');
    this.plusButton = page.getByTestId('bottom-bar-new');
    this.sheet = page.getByTestId('create-sheet');
    this.sheetDialog = page.getByRole('dialog', { name: 'New', exact: true });
    this.sheetClose = page.getByTestId('create-sheet-close');
  }

  /** True below the shell breakpoint, where the plus + sheet replace the top-bar menu. */
  isCompact(): boolean {
    return (this.page.viewportSize()?.width ?? Number.MAX_SAFE_INTEGER) < 1024;
  }

  /** The trigger that exists at the current width. */
  activeTrigger(): Locator {
    return this.isCompact() ? this.plusButton : this.trigger;
  }

  /** The open surface at the current width (menu panel or sheet dialog). */
  surface(): Locator {
    return this.isCompact() ? this.sheetDialog : this.menu;
  }

  /** A row by entry id at the current width. */
  row(id: CreateEntryId): Locator {
    return this.page.getByTestId(`${this.isCompact() ? 'create-sheet' : 'create-menu'}-${id}`);
  }

  /** Every row of the open surface, in DOM order. */
  rows(): Locator {
    return this.isCompact()
      ? this.sheetDialog.locator('a[data-testid^="create-sheet-"]')
      : this.menu.getByRole('menuitem');
  }

  /** Open with the pointer / tap and wait until the surface is up and settled. */
  async open(): Promise<void> {
    await this.activeTrigger().click();
    await this.surface().waitFor({ state: 'visible' });
    if (this.isCompact()) {
      await this.sheet.evaluate((el) =>
        Promise.all(el.getAnimations().map((animation) => animation.finished)),
      );
    }
  }

  /** Open the menu, then choose one entry (click / tap). */
  async choose(id: CreateEntryId): Promise<void> {
    await this.open();
    await this.row(id).click();
  }
}
