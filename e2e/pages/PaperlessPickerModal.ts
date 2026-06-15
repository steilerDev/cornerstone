/**
 * Page Object Model for the InvoicePaperlessPickerModal component.
 *
 * Rendered when Paperless is configured+reachable AND autoItemizeEnabled=true,
 * and the user clicks "New Invoice" on the Invoices list page.
 *
 * DOM observations from InvoicePaperlessPickerModal.tsx:
 * - Modal title: "Select Invoice Document"
 *   (budget.json key: invoices.pickerModal.title)
 * - Correspondent SearchPicker: id="correspondent-picker"
 *   placeholder="Filter by correspondent…" (documents.json: browser.correspondentPlaceholder)
 *   SearchPicker portal dropdown: [data-search-picker-dropdown] in document.body
 * - DocumentBrowser in modal mode with defaultHideLinked=true
 * - Hide-linked toggle: checkbox labelled by "Hide already-linked documents"
 *   (documents.json: browser.hideLinked)
 * - Document cards: DocumentCard components — each rendered as a button
 *   aria-label contains the document title (documents.json: documentCard.documentLabel)
 * - "Open in Paperless" anchor per document:
 *   aria-label="Open '{title}' in Paperless" (documents.json: documentCard.openInPaperlessAriaLabel)
 *   href={paperlessUrl}/documents/{id}/details, target="_blank"
 * - Footer button "Enter invoice manually"
 *   aria-label="Create invoice manually without selecting a document"
 *   (budget.json key: invoices.pickerModal.manualEntryAriaLabel)
 * - Modal close: standard close button inside the Modal component
 */

import type { Page, Locator } from '@playwright/test';

export class PaperlessPickerModal {
  readonly page: Page;

  /** The modal dialog element */
  readonly modal: Locator;

  /** "Enter invoice manually" footer escape button */
  readonly manualEntryButton: Locator;

  /** Correspondent SearchPicker input (id="correspondent-picker") */
  readonly correspondentInput: Locator;

  /** Clear button on correspondent SearchPicker (appears when a value is selected) */
  readonly correspondentClearButton: Locator;

  /** Portal dropdown rendered by SearchPicker in document.body */
  readonly correspondentPortalDropdown: Locator;

  /** Hide-linked checkbox (label text: "Hide already-linked documents") */
  readonly hideLinkedToggle: Locator;

  /** Modal close button (X button in the Modal header) */
  readonly closeButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Modal is identified by its title heading "Select Invoice Document"
    this.modal = page.getByRole('dialog', { name: /Select Invoice Document/i });

    // Manual entry escape button
    this.manualEntryButton = this.modal.getByRole('button', {
      name: /Create invoice manually without selecting a document/i,
    });

    // Correspondent SearchPicker input — id="correspondent-picker" inside the modal
    this.correspondentInput = this.modal.locator('#correspondent-picker');

    // Clear button appears next to SearchPicker when a value is selected
    this.correspondentClearButton = this.modal.getByRole('button', {
      name: 'Clear selection',
      exact: true,
    });

    // SearchPicker portals its dropdown to document.body (not inside modal)
    this.correspondentPortalDropdown = page.locator('[data-search-picker-dropdown]');

    // Hide-linked checkbox — label wraps the checkbox and label text
    this.hideLinkedToggle = this.modal.getByRole('checkbox', {
      name: /Hide already-linked documents/i,
    });

    // Modal close button — aria-label from Modal component
    this.closeButton = this.modal.getByRole('button', { name: /Close/i });
  }

  /**
   * Wait for the modal to appear and be fully visible.
   */
  async waitForVisible(): Promise<void> {
    await this.modal.waitFor({ state: 'visible' });
  }

  /**
   * Select a correspondent by typing in the SearchPicker and clicking the option.
   * @param name - The correspondent name to select
   */
  async selectCorrespondent(name: string): Promise<void> {
    await this.correspondentInput.fill(name);
    await this.correspondentPortalDropdown.waitFor({ state: 'visible' });
    await this.correspondentPortalDropdown.getByRole('option', { name }).click();
  }

  /**
   * Clear the currently selected correspondent.
   * The clear button only appears after a selection has been made in the same session.
   */
  async clearCorrespondent(): Promise<void> {
    await this.correspondentClearButton.click();
  }

  /**
   * Click a document card by its title to trigger document selection.
   * The DocumentBrowser renders documents as a grid of cards (role="button").
   * @param title - The document title to select
   */
  async selectDocument(title: string): Promise<void> {
    // DocumentBrowser renders document cards — find by accessible name (aria-label contains title)
    const card = this.modal.getByRole('button', { name: new RegExp(title, 'i') }).first();
    await card.waitFor({ state: 'visible' });
    await card.click();
  }

  /**
   * Click the "Enter invoice manually" escape button.
   * This closes the picker and opens the manual create modal.
   */
  async clickManualEntry(): Promise<void> {
    await this.manualEntryButton.click();
  }

  /**
   * Click the modal close button.
   */
  async close(): Promise<void> {
    await this.closeButton.click();
    await this.modal.waitFor({ state: 'hidden' });
  }

  /**
   * Return the hide-linked toggle locator for assertions.
   */
  getHideLinkedToggle(): Locator {
    return this.hideLinkedToggle;
  }

  /**
   * Get the "Open in Paperless" anchor for a document by title.
   * aria-label="Open '{title}' in Paperless"
   * @param title - The document title
   */
  getOpenInPaperlessLink(title: string): Locator {
    return this.modal.getByRole('link', { name: new RegExp(`Open '?${title}'? in Paperless`, 'i') });
  }

  /**
   * Get a document card locator by title (for assertions, not interaction).
   */
  getDocumentCard(title: string): Locator {
    return this.modal.getByRole('button', { name: new RegExp(title, 'i') }).first();
  }
}
