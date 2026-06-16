/**
 * Page Object Model for the Orientations settings tab.
 *
 * The Orientations tab lives at /settings/manage?tab=orientations (ManagePage.tsx).
 *
 * Key DOM observations from source (ManagePage.tsx OrientationsTab):
 * - Tab panel: div[role="tabpanel"][id="orientations-panel"]
 * - Tab button: role="tab", text "Orientations" (from settings:manage.tabs.orientations)
 * - Success banner: div[class*="successBanner"][role="alert"]
 * - Create form:
 *   - h2 "Create orientation" (settings:manage.orientations.createTitle)
 *   - input#orientationName (name)
 *   - input#orientationDescription (description)
 *   - input#orientationSortOrder (sort order, type=number)
 *   - submit button text "Create orientation" (disabled when name is empty)
 *   - inline create error: div[class*="errorBanner"][role="alert"]
 * - Existing list:
 *   - h2 "Orientations (N)" (settings:manage.orientations.existingTitle)
 *   - EmptyState when no orientations (settings:manage.orientations.emptyState)
 *   - List items: div[class*="itemRow"] — each contains:
 *     - div[class*="itemInfo"] wrapping div[class*="itemDetails"] + span[class*="itemSortOrder"]
 *     - div[class*="itemDetails"] contains: span[class*="itemName"], span[class*="itemDescription"]
 *     - span[class*="itemName"] — orientation name
 *     - span[class*="itemDescription"] — description (only when non-null)
 *     - span[class*="itemSortOrder"] — sort order badge (#N)
 *     - button with aria-label "Edit {name}" (settings:manage.orientations.edit)
 *     - button with aria-label "Delete {name}" (settings:manage.orientations.delete)
 * - Edit form (inline, replaces row):
 *   - input#edit-name-{id}
 *   - input#edit-description-{id}
 *   - input#edit-sortOrder-{id}
 *   - Save button (text "Save"), Cancel button (text "Cancel")
 *   - Edit error: div[class*="errorBanner"][role="alert"]
 * - Delete confirmation modal (role="dialog"):
 *   - h2 "Delete orientation"
 *   - confirm button class*="confirmDeleteButton"
 *   - cancel button text "Cancel"
 */

import type { Page, Locator } from '@playwright/test';

export const ORIENTATIONS_URL = '/settings/manage?tab=orientations';
const PANEL_ID = 'orientations-panel';

export class OrientationsPage {
  readonly page: Page;
  readonly panel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.panel = page.locator(`#${PANEL_ID}`);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Navigation
  // ──────────────────────────────────────────────────────────────────────

  /** Navigate directly to the Orientations tab via URL. */
  async goto(): Promise<void> {
    await this.page.goto(ORIENTATIONS_URL);
    await this.page
      .getByRole('heading', { level: 1, name: 'Manage', exact: true })
      .waitFor({ state: 'visible' });
    // Ensure the panel is rendered
    await this.panel.waitFor({ state: 'visible' });
  }

  /** Click the Orientations tab from the ManagePage. */
  async clickOrientationsTab(): Promise<void> {
    await this.page.getByRole('tab', { name: 'Orientations', exact: true }).click();
    await this.panel.waitFor({ state: 'visible' });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Create form
  // ──────────────────────────────────────────────────────────────────────

  get createFormHeading(): Locator {
    return this.panel.getByRole('heading', { level: 2, name: 'Create orientation', exact: true });
  }

  get nameInput(): Locator {
    return this.panel.locator('#orientationName');
  }

  get descriptionInput(): Locator {
    return this.panel.locator('#orientationDescription');
  }

  get sortOrderInput(): Locator {
    return this.panel.locator('#orientationSortOrder');
  }

  get createButton(): Locator {
    return this.panel.getByRole('button', { name: 'Create orientation', exact: true });
  }

  /** Locator for the inline create-error alert. */
  get createError(): Locator {
    // The create error banner lives inside the create <section>.
    // We scope to the first errorBanner inside the panel to avoid picking up
    // edit-form error banners.
    return this.panel.locator('[class*="errorBanner"][role="alert"]').first();
  }

  /** Locator for the success/status alert banner. */
  get successMessage(): Locator {
    return this.panel.locator('[class*="successBanner"][role="alert"]');
  }

  /**
   * Fill the create form and submit. Returns after the POST 201 response.
   * @param name       Required orientation name
   * @param description Optional description
   * @param sortOrder  Optional sort order (integer)
   * @returns The created orientation id extracted from the POST response body.
   */
  async createOrientation(name: string, description?: string, sortOrder?: number): Promise<string> {
    await this.nameInput.fill(name);

    if (description !== undefined) {
      await this.descriptionInput.fill(description);
    }

    if (sortOrder !== undefined) {
      await this.sortOrderInput.fill(String(sortOrder));
    }

    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/orientations') &&
        resp.request().method() === 'POST' &&
        resp.status() === 201,
    );

    await this.createButton.click();
    const response = await responsePromise;
    const body = (await response.json()) as { orientation: { id: string } };
    return body.orientation.id;
  }

  // ──────────────────────────────────────────────────────────────────────
  // List
  // ──────────────────────────────────────────────────────────────────────

  /** Locator for the EmptyState component when no orientations exist. */
  get emptyState(): Locator {
    return this.panel.getByText('No orientations yet.', { exact: false });
  }

  /**
   * Locator for an orientation list row identified by its name.
   *
   * Bug #1687 (fix: CSS class names aligned) — OrientationsTab now uses `styles.itemRow` and
   * `styles.itemsList` (matching Areas/Trades tabs). We anchor on `[class*="itemName"]` for
   * name-based lookup — this is stable regardless of row-level class changes.
   */
  getOrientationRow(name: string): Locator {
    return this.panel.locator('[class*="itemName"]').filter({ hasText: name });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Edit
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Click Edit on the orientation row with the given name, then apply updates.
   * @param name    The current orientation name (identifies the row)
   * @param updates Fields to update (only provided fields are changed)
   * @returns After the PATCH 200 response.
   */
  async editOrientation(
    name: string,
    updates: { name?: string; description?: string; sortOrder?: number },
  ): Promise<void> {
    // Click the Edit button found by aria-label (unique per orientation name)
    await this.panel.getByRole('button', { name: `Edit ${name}`, exact: true }).click();

    // The inline edit form replaces the row display. Disambiguate from the create form (also a
    // <form> in the panel) by filtering on the edit inputs' id prefix.
    const editForm = this.panel
      .locator('form')
      .filter({ has: this.page.locator('[id^="edit-name-"]') });

    if (updates.name !== undefined) {
      await editForm.locator('[id^="edit-name-"]').fill(updates.name);
    }
    if (updates.description !== undefined) {
      await editForm.locator('[id^="edit-description-"]').fill(updates.description);
    }
    if (updates.sortOrder !== undefined) {
      await editForm.locator('[id^="edit-sortOrder-"]').fill(String(updates.sortOrder));
    }

    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/orientations/') &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
    );
    await editForm.getByRole('button', { name: 'Save', exact: true }).click();
    await responsePromise;
  }

  /**
   * Click Delete on the orientation row, then confirm in the modal.
   * @param name The orientation name whose Delete button to click.
   * @returns After the DELETE 204 response.
   */
  async deleteOrientation(name: string): Promise<void> {
    await this.panel.getByRole('button', { name: `Delete ${name}`, exact: true }).click();

    const modal = this.page.locator('[role="dialog"]');
    await modal.waitFor({ state: 'visible' });

    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/orientations/') && resp.request().method() === 'DELETE',
    );
    await modal.locator('[class*="confirmDeleteButton"]').click();
    await responsePromise;
    await modal.waitFor({ state: 'hidden' });
  }
}
