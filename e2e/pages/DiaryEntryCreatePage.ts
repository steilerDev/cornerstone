/**
 * Page Object Model for the Diary Entry Create page (/diary/new)
 *
 * The page renders a type selector only (one-step flow as of #1435):
 *
 * - h1 "New Diary Entry"
 * - A grid of 5 type cards: data-testid="type-card-{type}"
 *   types: daily_log | site_visit | delivery | issue | general_note
 * - Each card is a <button>; clicking it fires POST /api/diary-entries
 *   (status: 'draft') and navigates to /diary/:id/edit (replace history)
 * - A "← Back to Diary" button (navigates to /diary)
 *
 * Note: The two-step form flow (type selector → body textarea → blur → draft)
 * was removed in #1435. Type-card click is now the sole draft-creation trigger.
 * All subsequent editing (body, metadata, photos) happens on the edit page.
 *
 * Key DOM observations from source:
 * - Type card buttons: data-testid="type-card-{type}"
 * - Clicking a card fires POST /api/diary-entries and navigates to /diary/:id/edit
 * - Callers should await page.waitForURL(/diary\/.+\/edit$/) after selectType()
 * - Error banner (class styles.errorBanner) shown if the POST fails
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

  // Error display (shown if POST fails)
  readonly errorBanner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Heading
    this.heading = page.getByRole('heading', { level: 1, name: 'New Diary Entry', exact: true });

    // Type selector — "← Back to Diary" button
    this.backToDiaryButton = page.getByRole('button', { name: /← Back to Diary/i });

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
   * Clicking the card fires POST /api/diary-entries and navigates to /diary/:id/edit.
   * Callers should await page.waitForURL(/diary\/.+\/edit$/) after this method returns.
   * No explicit timeout — uses project-level actionTimeout.
   */
  async selectType(type: ManualDiaryEntryType): Promise<void> {
    await this.typeCard(type).waitFor({ state: 'visible' });
    await this.typeCard(type).click();
    // Type-card click fires POST /api/diary-entries and navigates to /diary/:id/edit.
    // Callers should await page.waitForURL(/diary\/.+\/edit$/).
  }
}
