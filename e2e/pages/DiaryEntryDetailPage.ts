/**
 * Page Object Model for the Diary Entry Detail page (/diary/:id)
 *
 * The page renders:
 * - A top bar with:
 *   - (#2204) no Back button: the shared breadcrumb row above (trail "Site diary", optional "Back to <origin>")
 *   - The top bar is only rendered for non-automatic or signed entries
 *   - For non-automatic and non-signed entries: action buttons —
 *     - "Edit" link (<Link to="/diary/:id/edit">, class styles.editButton)
 *     - "Delete" button (type="button", class styles.deleteButton) — opens delete modal
 *   - For signed entries: only "Delete" button
 * - A card container with:
 *   - A DiaryEntryTypeBadge (size="lg")
 *   - An optional h1 entry title (class styles.title) — only rendered when entry.title is set
 *   - Meta row: formatted entry date, "Automatic" badge (when isAutomatic)
 *   - Body text (class styles.body)
 *   - Optional DiaryMetadataSummary section (class styles.metadataSection)
 *   - Optional signature sections (when metadata.signatures is non-empty)
 *   - Optional photo count paragraph (class styles.photoLabel) when photoCount > 0
 *   - Optional source entity section with a link (class styles.sourceSection)
 *   - Timestamps footer (Created / Updated)
 * - Not found: h1 "Diary entry not found" + "Back to Site diary" link; other API errors: bannerError + the same link
 * - Delete confirmation modal (shared Modal, role="dialog", name "Delete Diary Entry"):
 *   - "Delete Diary Entry" heading
 *   - Confirmation text
 *   - Optional error banner (role="alert") if delete fails
 *   - "Cancel" button (closes modal)
 *   - "Delete Entry" / "Deleting..." confirm button (hidden when deleteError is set)
 *
 * Key DOM observations from source code:
 * - Loaded marker: the type badge container (only rendered once the entry has loaded)
 * - Edit button: <Link> (anchor), use getByRole('link', { name: 'Edit' })
 * - Delete button (page): <button>, use getByRole('button', { name: 'Delete' })
 * - Action buttons visibility depends on entry.isAutomatic and entry.isSigned
 * - Entry title: only rendered if entry.title is non-null/non-empty
 * - "Back to Site diary" is a <Link> (anchor), not a <button>
 * - Error div uses shared.bannerError CSS class
 * - Metadata section: data-testid on inner components (daily-log-metadata, site-visit-metadata,
 *   issue-metadata) set by DiaryMetadataSummary component
 * - Outcome badge: data-testid="outcome-{pass|fail|conditional}" (DiaryOutcomeBadge)
 * - Severity badge: data-testid="severity-{low|medium|high|critical}" (DiarySeverityBadge)
 * - Delete modal: conditionally rendered, role="dialog"
 * - Confirm delete button: class styles.confirmDeleteButton, hidden after deleteError
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
  readonly automaticBadge: Locator;

  // Metadata section (outer container)
  readonly metadataSection: Locator;

  // Type-specific metadata test ids (inner wrappers from DiaryMetadataSummary)
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

  // Timestamps footer
  readonly timestamps: Locator;

  // Error banner (shown on 404 / API error)
  readonly errorBanner: Locator;

  constructor(page: Page) {
    this.page = page;

    this.breadcrumbs = new BreadcrumbsBar(page);
    this.heading = page.getByRole('heading', { level: 1 });
    this.loaded = page.locator('[class*="typeBadgeContainer"]').first();

    // "Back to Site diary" link in the not-found / error states — a <Link> element
    this.backToDiaryLink = page.getByRole('link', { name: 'Back to Site diary', exact: true });

    // "Edit" is a <Link> rendered as an anchor — only visible for non-automatic entries
    this.editButton = page.getByRole('link', { name: 'Edit', exact: true });

    // "Delete" is a <button> in the top bar — opens the delete modal
    // Note: "Delete Entry" is the button inside the modal — use exact match to distinguish
    this.deleteButton = page.getByRole('button', { name: 'Delete', exact: true });

    // Delete confirmation modal (role="dialog")
    this.deleteModal = page.getByRole('dialog', { name: 'Delete Diary Entry' });
    // Confirm inside the modal: "Delete Entry" / "Deleting..."
    this.confirmDeleteButton = this.deleteModal.getByRole('button', {
      name: /Delete Entry|Deleting\.\.\./i,
    });
    // Cancel inside the modal
    this.cancelDeleteButton = this.deleteModal.getByRole('button', { name: 'Cancel', exact: true });

    // Entry title h1 (conditional — only rendered when entry.title is set)
    this.entryTitle = page
      .locator('[class*="title"]')
      .filter({ has: page.locator('h1') })
      .or(page.getByRole('heading', { level: 1 }));

    this.entryBody = page.locator('[class*="body"]').first();
    this.entryDate = page.locator('[class*="date"]').first();
    this.entryAuthor = page.locator('[class*="author"]').first();
    this.automaticBadge = page.locator('[class*="badge"]').filter({ hasText: 'Automatic' });

    // Metadata section container
    this.metadataSection = page.locator('[class*="metadataSection"]');

    // Type-specific metadata wrappers (from DiaryMetadataSummary)
    this.dailyLogMetadata = page.getByTestId('daily-log-metadata');
    this.siteVisitMetadata = page.getByTestId('site-visit-metadata');
    this.deliveryMetadata = page.getByTestId('delivery-metadata');
    this.issueMetadata = page.getByTestId('issue-metadata');

    // Photo section — the full section with heading and content.
    // Use first() to avoid strict-mode violation: [class*="photoSection"] also matches
    // photoSectionHeader which is a child of photoSection in the same DOM tree.
    this.photoSection = page.locator('[class*="photoSection"]').first();
    // Photo heading: "Photos (N)" — always rendered; h2 element avoids ambiguity
    this.photoHeading = page.locator('h2[class*="photoHeading"]');
    // Photo empty state — rendered when no photos are attached
    this.photoEmptyState = page.locator('[class*="photoEmptyState"]').first();

    // Signature section — rendered when entry.metadata.signatures is non-empty.
    // Use first() as a precaution if multiple signatures are present.
    this.signatureSection = page.locator('[class*="signatureSection"]').first();

    // Source entity section
    this.sourceSection = page.locator('[class*="sourceSection"]');

    // Timestamps footer
    this.timestamps = page.locator('[class*="timestamps"]');

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
   * data-testid="outcome-{pass|fail|conditional}" (DiaryOutcomeBadge component)
   */
  outcomeBadge(outcome: 'pass' | 'fail' | 'conditional'): Locator {
    return this.page.getByTestId(`outcome-${outcome}`);
  }

  /**
   * Get the severity badge locator for a specific severity level.
   * data-testid="severity-{low|medium|high|critical}" (DiarySeverityBadge component)
   */
  severityBadge(severity: 'low' | 'medium' | 'high' | 'critical'): Locator {
    return this.page.getByTestId(`severity-${severity}`);
  }

  /**
   * Get the photo count badge locator for an entry card on the LIST page.
   * data-testid="photo-count-{id}" — visible on DiaryEntryCard when photoCount > 0.
   * Used from diary-list tests, not on the detail page.
   */
  photoCountBadge(entryId: string): Locator {
    return this.page.getByTestId(`photo-count-${entryId}`);
  }

  /**
   * Open the delete confirmation modal by clicking the "Delete" button in the top bar.
   * Waits for the modal to become visible.
   */
  async openDeleteModal(): Promise<void> {
    await this.deleteButton.click();
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
