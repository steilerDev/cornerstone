/**
 * Page Object Model for the Diary Entry page (/diary/:id), re-laid out in #2225.
 *
 * Order on the page (manual entries):
 * 1. Breadcrumbs, then the actions bar: "Edit" (`diary-entry-edit`) and "Add photos"
 *    (`diary-entry-add-photos`) - both link to /diary/:id/edit - and the "..." menu
 *    (`diary-entry-more`, aria-label "More actions for this entry") holding "Delete"
 *    (`diary-entry-delete`). Signed entries are locked: no Edit / Add photos, only the menu.
 * 2. The card: photos first (PhotoGrid, or the dashed `diary-entry-no-photos` placeholder; a
 *    visually hidden h2 "Photos, n"), then the meta line (type badge `diary-type-badge-<type>` ·
 *    date · "by <name>"), the h1 title (fallback "<Type> · <date>"), the text, "Site details"
 *    (`diary-entry-site-details`, a <dl> carrying `daily-log-metadata` / `site-visit-metadata` /
 *    `delivery-metadata` / `issue-metadata`, plus `outcome-*`, `severity-*`, `defect-status`),
 *    signatures (only when present), the Areas chips (`diary-entry-areas`, each
 *    `diary-entry-area-<id>` opening the area), the "Related to" source link, and a collapsed
 *    History <details> (`diary-entry-history`, Created / Updated).
 * - Not found: h1 "Diary entry not found" + "Back to Site diary"; other API errors: bannerError.
 * - Delete: the shared ConfirmDialog (role="alertdialog", testid prefix `diary-delete`).
 * - System events (automatic entries) keep the read-only `system-event-<id>` detail row and have
 *   no actions bar.
 */

import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';

export const DIARY_ENTRY_DETAIL_ROUTE = routeUrl('diary');

export class DiaryEntryDetailPage {
  readonly page: Page;

  // Navigation
  readonly breadcrumbs: BreadcrumbsBar;
  readonly backToDiaryLink: Locator;
  /** The entry's single h1 (also present, with a placeholder text, while loading / not found). */
  readonly heading: Locator;
  /** Present only once the entry has loaded (replaces the old top-bar Back button as the gate). */
  readonly loaded: Locator;

  // Edit / delete action buttons (only visible for non-automatic entries)
  readonly editButton: Locator;
  readonly addPhotosButton: Locator;
  /** The "..." trigger of the actions menu. */
  readonly moreMenu: Locator;
  /** The "Delete" item inside the open actions menu. */
  readonly deleteItem: Locator;
  /** Alias of `deleteItem`: open the menu first (`openDeleteModal()` does). */
  readonly deleteButton: Locator;

  // Delete confirmation modal
  readonly deleteModal: Locator;
  readonly confirmDeleteButton: Locator;
  readonly cancelDeleteButton: Locator;

  // Entry content
  readonly entryTitle: Locator;
  readonly entryBody: Locator;
  readonly entryDate: Locator;
  readonly entryAuthor: Locator;

  /** The meta line: type badge · date · "by <name>". */
  readonly metaLine: Locator;
  readonly typeBadge: Locator;

  // Site details (outer container)
  readonly metadataSection: Locator;

  // Type-specific metadata test ids (the <dl> inside Site details (SiteDetails))
  readonly dailyLogMetadata: Locator;
  readonly siteVisitMetadata: Locator;
  readonly deliveryMetadata: Locator;
  readonly issueMetadata: Locator;

  // Photo section
  readonly photoSection: Locator;
  readonly photoHeading: Locator;
  readonly photoEmptyState: Locator;

  // Signature section
  readonly signatureSection: Locator;

  // Source entity section
  readonly sourceSection: Locator;

  // Area chips and the collapsed History disclosure
  readonly areasSection: Locator;
  readonly historySection: Locator;
  readonly historySummary: Locator;
  // Timestamps (inside History)
  readonly timestamps: Locator;

  // Error banner (shown on 404 / API error)
  readonly errorBanner: Locator;

  /** The event row of a system event (automatic entry), by entry id. */
  systemEventRow(id: string): Locator {
    return this.page.getByTestId(`system-event-${id}`);
  }

  /** The link row of a system event. */
  systemEventLink(id: string): Locator {
    return this.page.getByTestId(`system-event-${id}-link`);
  }

  constructor(page: Page) {
    this.page = page;

    this.breadcrumbs = new BreadcrumbsBar(page);
    this.heading = page.getByRole('heading', { level: 1 });
    // A manual entry shows its type badge; a system event (#2223) shows its event row instead.
    this.typeBadge = page.locator('[data-testid^="diary-type-badge-"]').first();
    this.loaded = this.typeBadge.or(page.locator('[data-testid^="system-event-"]').first());

    // "Back to Site diary" link in the not-found / error states — a <Link> element in main.
    // Scoped to main: below 1024px the compact top bar carries a link with the same name (#2207)
    this.backToDiaryLink = page
      .locator('main')
      .getByRole('link', { name: 'Back to Site diary', exact: true });

    // "Edit" is a <Link> rendered as an anchor — only visible for non-automatic entries
    this.editButton = page.getByTestId('diary-entry-edit');
    this.addPhotosButton = page.getByTestId('diary-entry-add-photos');

    // "Delete" lives in the "..." menu (#2225) - opens the delete dialog
    this.moreMenu = page.getByTestId('diary-entry-more');
    this.deleteItem = page.getByTestId('diary-entry-delete');
    this.deleteButton = this.deleteItem;

    // Delete confirmation: the shared ConfirmDialog (role="alertdialog", title "Delete <title>?")
    this.deleteModal = page
      .getByRole('alertdialog')
      .filter({ has: page.getByTestId('diary-delete-cancel') });
    this.confirmDeleteButton = this.deleteModal.getByTestId('diary-delete-confirm');
    this.cancelDeleteButton = this.deleteModal.getByTestId('diary-delete-cancel');

    // Entry title h1 (conditional — only rendered when entry.title is set)
    this.entryTitle = page
      .locator('[class*="title"]')
      .filter({ has: page.locator('h1') })
      .or(page.getByRole('heading', { level: 1 }));

    this.entryBody = page.locator('[class*="body"]').first();
    this.metaLine = page.locator('[class*="meta"]').filter({ has: this.typeBadge }).first();
    this.entryDate = this.metaLine.locator('[class*="date"]');
    this.entryAuthor = this.metaLine.getByText(/^by /);

    // Site details container
    this.metadataSection = page.getByTestId('diary-entry-site-details');

    // Type-specific metadata wrappers (the <dl> inside Site details)
    this.dailyLogMetadata = page.getByTestId('daily-log-metadata');
    this.siteVisitMetadata = page.getByTestId('site-visit-metadata');
    this.deliveryMetadata = page.getByTestId('delivery-metadata');
    this.issueMetadata = page.getByTestId('issue-metadata');

    // Photo section — the full section with heading and content.
    // Use first() to avoid strict-mode violation: [class*="photoSection"] also matches
    // photoSectionHeader which is a child of photoSection in the same DOM tree.
    this.photoSection = page.locator('section[class*="photoSection"]');
    // Photo heading: visually hidden h2 "Photos, N"
    this.photoHeading = page.getByRole('heading', { level: 2, name: /^Photos, \d+/ });
    // Photo empty state - the dashed placeholder when no photos are attached
    this.photoEmptyState = page.getByTestId('diary-entry-no-photos');

    // Signature section — rendered when entry.metadata.signatures is non-empty.
    // Use first() as a precaution if multiple signatures are present.
    this.signatureSection = page.locator('[class*="signatureSection"]').first();

    // Source entity section
    this.sourceSection = page.locator('[class*="sourceSection"]');

    this.areasSection = page.getByTestId('diary-entry-areas');
    this.historySection = page.getByTestId('diary-entry-history');
    this.historySummary = this.historySection.locator('summary');
    this.timestamps = this.historySection;

    // Error banner
    this.errorBanner = page.locator('[class*="bannerError"]');
  }

  /**
   * Navigate to the detail page for the given diary entry ID.
   * Waits for either the loaded entry, the not-found h1 or the error banner.
   * No explicit timeout — uses project-level actionTimeout.
   */
  async goto(id: string): Promise<void> {
    await this.page.goto(`${DIARY_ENTRY_DETAIL_ROUTE}/${id}`);
    await Promise.race([
      this.loaded.waitFor({ state: 'visible' }),
      this.errorBanner.waitFor({ state: 'visible' }),
      this.backToDiaryLink.waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Get the text of the entry title heading, or null if it is not rendered.
   * The title is only rendered when entry.title is non-null in the API response.
   */
  async getEntryTitleText(): Promise<string | null> {
    try {
      const h1 = this.page.getByRole('heading', { level: 1 });
      await h1.waitFor({ state: 'visible' });
      return await h1.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Get the outcome badge locator for a specific inspection outcome.
   * data-testid="outcome-{pass|fail|conditional}" (inside Site details)
   */
  outcomeBadge(outcome: 'pass' | 'fail' | 'conditional'): Locator {
    return this.page.getByTestId(`outcome-${outcome}`);
  }

  /**
   * Get the severity badge locator for a specific severity level.
   * data-testid="severity-{low|medium|high|critical}" (inside Site details)
   */
  severityBadge(severity: 'low' | 'medium' | 'high' | 'critical'): Locator {
    return this.page.getByTestId(`severity-${severity}`);
  }

  /**
   * Open the delete confirmation modal: "..." menu, then "Delete".
   * Waits for the modal to become visible.
   */
  async openDeleteModal(): Promise<void> {
    await this.moreMenu.click();
    await this.deleteItem.click();
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  /**
   * Confirm the deletion inside the modal.
   * Waits for the API DELETE response before returning.
   */
  async confirmDelete(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/diary-entries/') && resp.request().method() === 'DELETE',
    );
    await this.confirmDeleteButton.click();
    await responsePromise;
  }
}
