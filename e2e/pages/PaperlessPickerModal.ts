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
 * - Document grid: id="document-grid", role="list"
 *   aria-busy="true"  → loading state (skeletons rendered)
 *   aria-busy="false" → documents loaded and card buttons present
 *   NOTE: the grid element is only mounted after hook.status resolves from null
 *   (while status=null a separate infoState div is shown instead of the grid)
 * - Document cards: DocumentCard components — root div with role="button"
 *   aria-label contains the document title (documents.json: documentCard.documentLabel)
 *   No nested buttons inside the card — "Open in Paperless" is role="link"
 * - "Open in Paperless" anchor per document:
 *   aria-label="Open '{title}' in Paperless" (documents.json: documentCard.openInPaperlessAriaLabel)
 *   href={paperlessUrl}/documents/{id}/details, target="_blank"
 * - Footer button "Enter invoice manually"
 *   aria-label="Create invoice manually without selecting a document"
 *   (budget.json key: invoices.pickerModal.manualEntryAriaLabel)
 * - Modal close: standard close button inside the Modal component
 */

import { expect } from '@playwright/test';
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

  /**
   * The document grid inside DocumentBrowser (id="document-grid", role="list").
   * aria-busy="true"  while loading (status check or documents fetch in flight).
   * aria-busy="false" when documents are ready and card buttons are in the DOM.
   * NOTE: the grid element is only mounted after hook.status resolves from null;
   * callers must use waitForDocumentsLoaded() before accessing card locators.
   */
  readonly documentGrid: Locator;

  /** Document cards (listitems) currently rendered in the grid. */
  readonly documentItems: Locator;

  /** Infinite-scroll footer (testIdPrefix="paperless-documents"). */
  readonly footer: Locator;

  /** Zero-height IntersectionObserver sentinel inside the footer (aria-hidden). */
  readonly sentinel: Locator;

  /** "Load more" / "Retry" button; label switches with footer status. */
  readonly loadMoreButton: Locator;

  /** End-of-list message; receives focus when the last batch loads while Load more was focused. */
  readonly endOfListMessage: Locator;

  /** Footer error banner (FormError, role="alert") shown when an appended batch fails. */
  readonly footerError: Locator;

  /**
   * @param page - Playwright page
   * @param dialogName - Accessible name of the hosting dialog. Defaults to the invoice picker
   *   ("Select Invoice Document"); pass 'Add Document' for the LinkedDocumentsSection picker.
   */
  constructor(page: Page, dialogName: RegExp | string = /Select Invoice Document/i) {
    this.page = page;

    // Modal is identified by its title heading (default: "Select Invoice Document")
    this.modal = page.getByRole('dialog', { name: dialogName });

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

    // Document grid rendered by DocumentBrowser inside the modal
    // id="document-grid" is constant (GRID_ID in DocumentBrowser.tsx)
    this.documentGrid = this.modal.locator('#document-grid');
    this.documentItems = this.documentGrid.getByRole('listitem');

    // Infinite-scroll footer — data-testid prefix "paperless-documents" (DocumentBrowser.tsx)
    this.footer = this.modal.getByTestId('paperless-documents-footer');
    this.sentinel = this.modal.getByTestId('paperless-documents-sentinel');
    this.loadMoreButton = this.modal.getByTestId('paperless-documents-load-more-button');
    this.endOfListMessage = this.modal.getByTestId('paperless-documents-end-of-list');
    this.footerError = this.footer.getByRole('alert');
  }

  /**
   * Scroll the grid's nearest scrollable ancestor (the picker's own scroller: `.pickerBody` in
   * LinkedDocumentsSection, `.modalBody` in InvoicePaperlessPickerModal) to its bottom, which
   * brings the footer sentinel within the observer's lookahead. No-op when nothing scrolls.
   */
  async scrollToBottom(): Promise<void> {
    await this.documentGrid.evaluate((grid) => {
      let node: HTMLElement | null = grid.parentElement;
      while (node && node !== document.body) {
        const overflowY = getComputedStyle(node).overflowY;
        if (
          (overflowY === 'auto' || overflowY === 'scroll') &&
          node.scrollHeight > node.clientHeight
        ) {
          node.scrollTop = node.scrollHeight;
          return;
        }
        node = node.parentElement;
      }
      // No inner scroller (e.g. a full-screen modal on mobile): the document itself scrolls
      window.scrollTo(0, document.body.scrollHeight);
    });
  }

  /**
   * Wait for the modal to appear and be fully visible.
   */
  async waitForVisible(): Promise<void> {
    await this.modal.waitFor({ state: 'visible' });
  }

  /**
   * Wait for the DocumentBrowser document grid to finish loading.
   *
   * DocumentBrowser has two async loading stages before cards are available:
   *   1. Status check (hook.status === null) — shows infoState div, grid is NOT in DOM yet
   *   2. Document fetch (hook.isLoading) — grid is in DOM with aria-busy="true", shows skeletons
   *
   * This method waits for the grid to be visible AND aria-busy="false", which guarantees
   * real DocumentCard elements are rendered and clickable. Must be called before any
   * interaction with or assertion on document cards.
   */
  async waitForDocumentsLoaded(): Promise<void> {
    // Step 1: wait for the grid element to appear in the DOM and become visible.
    // This covers stage 1 (status check) since the grid isn't mounted until status resolves.
    // NOTE: the grid only mounts after usePaperless Phase 1 (status check) completes and the
    // first documents batch resolves. Tags are fetched independently (no longer in a
    // Promise.all with documents), so a failing tags request does not blank the grid — but
    // register /api/paperless/status, /api/paperless/documents and /api/paperless/tags before
    // opening the picker anyway to avoid unmocked requests hitting the real server.
    await this.documentGrid.waitFor({ state: 'visible' });
    // Step 2: wait for the loading state to clear (aria-busy transitions from "true" to "false").
    // This covers stage 2 (document fetch). 10s timeout is generous for a mocked endpoint.
    await expect(this.documentGrid).toHaveAttribute('aria-busy', 'false', { timeout: 10000 });
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
   * The DocumentBrowser renders document cards as divs with role="button".
   * aria-label is built by: t('documentCard.documentLabel', { title, date })
   * which includes the title and optionally an appended date string.
   *
   * IMPORTANT: DocumentBrowser has two async loading stages before cards appear:
   *   1. Paperless status check — grid element is not in the DOM yet
   *   2. Documents fetch    — grid is in the DOM but aria-busy="true" (skeletons shown)
   * This method calls waitForDocumentsLoaded() before locating the card to guarantee
   * the grid exists and real card buttons are rendered.
   *
   * @param title - The document title to match (case-insensitive regex)
   */
  async selectDocument(title: string): Promise<void> {
    // Wait for the document grid to finish both loading stages
    await this.waitForDocumentsLoaded();
    // DocumentCard root div has role="button" and aria-label containing the title.
    // No nested role="button" elements inside DocumentCard (the "Open in Paperless" anchor
    // uses role="link"), so getByRole('button', { name: /title/i }) is unambiguous.
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
    return this.modal.getByRole('link', {
      name: new RegExp(`Open '?${title}'? in Paperless`, 'i'),
    });
  }

  /**
   * Get a document card locator by title (for assertions, not interaction).
   */
  getDocumentCard(title: string): Locator {
    return this.modal.getByRole('button', { name: new RegExp(title, 'i') }).first();
  }
}
