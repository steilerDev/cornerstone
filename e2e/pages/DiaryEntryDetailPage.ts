/**
 * Page Object Model for the Diary Entry Detail page (/diary/:id)
 *
 * The page renders:
 * - A "← Back" button (type="button", class styles.backButton) that calls navigate(-1)
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
 *
 * Key DOM observations from source code:
 * - Back button: type="button", title="Go back" — use getByTitle or getByText('← Back')
 * - Entry title: only rendered if entry.title is non-null/non-empty
 * - "Back to Diary" is a <Link> (anchor), not a <button>
 * - Error div uses shared.bannerError CSS class
 * - Metadata section: data-testid on inner components (daily-log-metadata, site-visit-metadata,
 *   issue-metadata) set by DiaryMetadataSummary component
 * - Outcome badge: data-testid="outcome-{pass|fail|conditional}" (DiaryOutcomeBadge)
 * - Severity badge: data-testid="severity-{low|medium|high|critical}" (DiarySeverityBadge)
 */

import type { Page, Locator } from '@playwright/test';

export const DIARY_ENTRY_DETAIL_ROUTE = '/diary';

export class DiaryEntryDetailPage {
  readonly page: Page;

  // Navigation
  readonly backButton: Locator;
  readonly backToDiaryLink: Locator;

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

    // Entry title h1 (conditional — only rendered when entry.title is set)
    this.entryTitle = page.locator('[class*="title"]').filter({ has: page.locator('h1') }).or(
      page.getByRole('heading', { level: 1 }),
    );

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
}
