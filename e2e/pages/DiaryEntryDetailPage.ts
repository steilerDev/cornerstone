/**
 * Page Object Model for the Diary Entry Detail page (/diary/:id)
 *
 * The page renders:
 * - A top bar with:
 *   - "← Back" button (aria-label="Go back") that calls navigate(-1)
 *   - For non-automatic entries: action buttons —
 *     - "Edit" link (<Link to="/diary/:id/edit">, class styles.editButton)
 *     - "Delete" button (type="button", class styles.deleteButton) — opens delete modal
 * - A card container with:
 *   - A DiaryEntryTypeBadge (size="lg")
 *   - An optional h1 entry title (class styles.title) — only rendered when entry.title is set
 *   - Meta row: formatted entry date, formatted createdAt time, author display name,
 *     "Automatic" badge (when isAutomatic)
 *   - Body text (class styles.body)
 *   - Optional DiaryMetadataSummary section (class styles.metadataSection)
 *   - Optional photo count paragraph (class styles.photoLabel) when photoCount > 0
 *   - Optional source entity section with a link (class styles.sourceSection)
 *   - Timestamps footer (Created / Updated)
 * - A "Back to Diary" link (shared.btnSecondary) navigating to /diary
 * - Error state: bannerError div + "Back to Diary" link — shown when 404 or other API error
 * - Delete confirmation modal (role="dialog", aria-labelledby="delete-modal-title"):
 *   - "Delete Diary Entry" heading
 *   - Confirmation text
 *   - Optional error banner (role="alert") if delete fails
 *   - "Cancel" button (closes modal)
 *   - "Delete Entry" / "Deleting..." confirm button (hidden when deleteError is set)
 *
 * Key DOM observations from source code:
 * - Back button: aria-label="Go back" — use getByLabel('Go back')
 * - Edit button: <Link> (anchor), use getByRole('link', { name: 'Edit' })
 * - Delete button (page): <button>, use getByRole('button', { name: 'Delete' })
 * - Action buttons (Edit + Delete) only rendered for non-automatic entries
 * - Entry title: only rendered if entry.title is non-null/non-empty
 * - "Back to Diary" is a <Link> (anchor), not a <button>
 * - Error div uses shared.bannerError CSS class
 * - Metadata section: data-testid on inner components (daily-log-metadata, site-visit-metadata,
 *   issue-metadata) set by DiaryMetadataSummary component
 * - Outcome badge: data-testid="outcome-{pass|fail|conditional}" (DiaryOutcomeBadge)
 * - Severity badge: data-testid="severity-{low|medium|high|critical}" (DiarySeverityBadge)
 * - Delete modal: conditionally rendered, role="dialog"
 * - Confirm delete button: class styles.confirmDeleteButton, hidden after deleteError
 */

import type { Page, Locator } from '@playwright/test';

export const DIARY_ENTRY_DETAIL_ROUTE = '/diary';

export class DiaryEntryDetailPage {
  readonly page: Page;

  // Navigation
  readonly backButton: Locator;
  readonly backToDiaryLink: Locator;

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

  // Photo count
  readonly photoSection: Locator;

  // Source entity section
  readonly sourceSection: Locator;

  // Timestamps footer
  readonly timestamps: Locator;

  // Error banner (shown on 404 / API error)
  readonly errorBanner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Back button: <button type="button" aria-label="Go back">← Back</button>
    this.backButton = page.getByLabel('Go back');

    // "Back to Diary" link at bottom of page — a <Link> element
    this.backToDiaryLink = page.getByRole('link', { name: 'Back to Diary' });

    // "Edit" is a <Link> rendered as an anchor — only visible for non-automatic entries
    this.editButton = page.getByRole('link', { name: 'Edit', exact: true });

    // "Delete" is a <button> in the top bar — opens the delete modal
    // Note: "Delete Entry" is the button inside the modal — use exact match to distinguish
    this.deleteButton = page.getByRole('button', { name: 'Delete', exact: true });

    // Delete confirmation modal (role="dialog")
    this.deleteModal = page.getByRole('dialog');
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

    // Photo count section
    this.photoSection = page.locator('[class*="photoSection"]');

    // Source entity section
    this.sourceSection = page.locator('[class*="sourceSection"]');

    // Timestamps footer
    this.timestamps = page.locator('[class*="timestamps"]');

    // Error banner
    this.errorBanner = page.locator('[class*="bannerError"]');
  }

  /**
   * Navigate to the detail page for the given diary entry ID.
   * Waits for either the back button (success) or the error banner (error state).
   * No explicit timeout — uses project-level actionTimeout.
   */
  async goto(id: string): Promise<void> {
    await this.page.goto(`${DIARY_ENTRY_DETAIL_ROUTE}/${id}`);
    await Promise.race([
      this.backButton.waitFor({ state: 'visible' }),
      this.errorBanner.waitFor({ state: 'visible' }),
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
