/**
 * Page Object Model for the Milestone Create page (/project/milestones/new)
 *
 * The page renders:
 * - A header with:
 *   - A <Link> back link ("← Milestones") to /project/milestones (NOT a <button>)
 *   - h1 "Project" (t('milestones.page.title') = "Project")
 * - A SubNav with project tabs
 * - A <form> card with h2 "Create Milestone" (t('milestones.create.title'))
 * - Form fields:
 *   - #title (text, required) — data-testid="milestone-title-input"
 *   - #targetDate (date, required) — data-testid="milestone-target-date-input"
 *   - #description (textarea) — data-testid="milestone-description-input"
 * - Submit button: data-testid="create-milestone-button"
 *   text: t('milestones.create.submit') = "Create Milestone" / t('milestones.create.submitting') = "Creating..."
 * - Cancel: a <Link> to /project/milestones with text t('milestones.create.cancel') = "Cancel"
 * - Error banner (role="alert", class errorBanner) for validation/server errors
 *
 * Key DOM observations from source code:
 * - Back link ("← Milestones") is a <Link> (anchor element), not a <button>
 * - Cancel is also a <Link> (anchor), not a <button>
 * - Submit is a type="submit" <button> disabled during isSubmitting
 * - On success, navigates to /project/milestones/:id (the newly created milestone's detail page)
 * - Client-side validation: empty title → setError(t('milestones.create.form.title.error'))
 *   = "Title is required." — shown as role="alert" errorBanner, NOT inline field error
 * - Client-side validation: empty targetDate → t('milestones.create.form.targetDate.error')
 *   = "Target date is required." — also shown as role="alert" errorBanner
 */

import type { Page, Locator } from '@playwright/test';

export const MILESTONE_CREATE_ROUTE = '/project/milestones/new';

export interface MilestoneFormData {
  title?: string;
  targetDate?: string;
  description?: string;
}

export class MilestoneCreatePage {
  readonly page: Page;

  // Header
  readonly heading: Locator; // h1 "Project"
  readonly formHeading: Locator; // h2 "Create Milestone"
  readonly backLink: Locator; // "← Milestones" anchor

  // Form fields
  readonly titleInput: Locator;
  readonly targetDateInput: Locator;
  readonly descriptionInput: Locator;

  // Form actions
  readonly submitButton: Locator;
  readonly cancelLink: Locator; // "Cancel" anchor (not a button)

  // Error display
  readonly errorBanner: Locator; // role="alert", shown for both validation and server errors

  constructor(page: Page) {
    this.page = page;

    // PageLayout h1 = t('milestones.page.title') = "Project"
    this.heading = page.getByRole('heading', { level: 1, name: 'Project', exact: true });
    // Form h2 = t('milestones.create.title') = "Create Milestone"
    this.formHeading = page.getByRole('heading', { level: 2, name: 'Create Milestone', exact: true });
    // Back link is a <Link> = <a> element with text "← Milestones"
    this.backLink = page.getByRole('link', { name: '← Milestones', exact: true });

    // Form fields (by id — matches label htmlFor)
    this.titleInput = page.locator('#title');
    this.targetDateInput = page.locator('#targetDate');
    this.descriptionInput = page.locator('#description');

    // Submit button: stable via data-testid
    this.submitButton = page.getByTestId('create-milestone-button');

    // Cancel is a <Link> (anchor) with text "Cancel"
    this.cancelLink = page.getByRole('link', { name: 'Cancel', exact: true });

    // Error banner: role="alert" + class errorBanner (CSS Modules hashed)
    this.errorBanner = page.locator('[role="alert"][class*="errorBanner"]');
  }

  /**
   * Navigate to the milestone create page.
   * Waits for the form heading to be visible as the readiness signal.
   */
  async goto(): Promise<void> {
    await this.page.goto(MILESTONE_CREATE_ROUTE);
    await this.formHeading.waitFor({ state: 'visible' });
  }

  /**
   * Fill only the title field.
   */
  async fillTitle(title: string): Promise<void> {
    await this.titleInput.fill(title);
  }

  /**
   * Fill multiple form fields at once.
   * Only provided fields are filled; others are left at their defaults.
   */
  async fillForm(data: MilestoneFormData): Promise<void> {
    if (data.title !== undefined) {
      await this.titleInput.fill(data.title);
    }
    if (data.targetDate !== undefined) {
      await this.targetDateInput.fill(data.targetDate);
    }
    if (data.description !== undefined) {
      await this.descriptionInput.fill(data.description);
    }
  }

  /**
   * Submit the form by clicking the "Create Milestone" button.
   * Does NOT wait for navigation — caller must do that.
   */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * Get the error banner text. Returns null if not visible.
   * Uses a 3s probe timeout — intentionally short since we only call this
   * after an action that might have produced an error.
   */
  async getErrorBannerText(): Promise<string | null> {
    try {
      await this.errorBanner.waitFor({ state: 'visible', timeout: 3000 });
      return await this.errorBanner.textContent();
    } catch {
      return null;
    }
  }
}
