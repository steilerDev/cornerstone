/**
 * Page Object Model for the Documents panel (#2233 / P4.1).
 *
 * The panel is a `Sheet` (side sheet from 768 px, full screen below) rendered once per host by
 * `useDocumentsPanel`. It carries `role="dialog"` only while open, so the dialog locator below
 * is unique even on pages with one (inert) panel per row.
 *
 * Hosts and their trigger test ids:
 *   - Task / Purchase / Invoice detail pages: `documents-panel-button` ("Documents (n)")
 *   - Financing cards: `financing-source-docs-<id>` / `financing-grant-docs-<id>` (+ a `-link`
 *     sibling opening the panel in the Link document picker); Funding source and Grant pages:
 *     the `summary-fact-documents` strip fact
 *
 * List view: `documents-list` of `linked-document-<id>` cards, each with a "Details" toggle
 * (`document-details-<id>`) and a ⋯ menu (`document-menu-<id>` wrapper; items Open in Paperless
 * `document-open-<id>`, Itemize `document-itemize-<id>`, Unlink `document-unlink-<id>`).
 * Picker view ("Link document"): the Paperless document browser; Back is `documents-back`.
 * Read-only (Paperless off, links kept): `documents-paperless-off` notice, no Link document.
 */

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { PaperlessPickerModal } from './PaperlessPickerModal.js';

export const DOCUMENTS_BUTTON_TEST_ID = 'documents-panel-button';

export class DocumentsPanel {
  readonly page: Page;

  /** The open panel (list or picker view). Role dialog exists only while the sheet is open. */
  readonly dialog: Locator;

  /** The sheet title: "Documents (n)" in the list view, "Link document" in the picker view. */
  readonly title: Locator;

  /** Close (×) button of the sheet. */
  readonly closeButton: Locator;

  /** The `<ul>` of linked documents (absent when there are none). */
  readonly list: Locator;

  /** One entry per linked document card. */
  readonly rows: Locator;

  /** Footer "Link document" button (full mode, list view). */
  readonly linkDocumentButton: Locator;

  /** "Browse all" footer link (hidden until the Documents page route is served). */
  readonly browseAll: Locator;

  /** Picker-view back button ("‹ Documents"). */
  readonly pickerBack: Locator;

  /** Read-only notice (Paperless off, links kept). */
  readonly notice: Locator;

  /** Admin-only Integrations link inside the notice. */
  readonly integrationsLink: Locator;

  /** The document browser shown by the picker view. */
  readonly picker: PaperlessPickerModal;

  /** Invoice picker only: "Document type (optional)" select. */
  readonly pickerTypeSelect: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dialog = page.getByRole('dialog', { name: /^(Documents \(\d+\)|Link document)$/ });
    this.title = this.dialog.getByRole('heading', { level: 2 });
    this.closeButton = this.dialog.getByTestId('documents-panel-close');
    this.list = this.dialog.getByTestId('documents-list');
    this.rows = this.dialog.locator('[data-testid^="linked-document-"]');
    this.linkDocumentButton = this.dialog.getByTestId('documents-link-document');
    this.browseAll = page.getByTestId('documents-browse-all');
    this.pickerBack = this.dialog.getByTestId('documents-back');
    this.notice = this.dialog.getByTestId('documents-paperless-off');
    this.integrationsLink = this.dialog.getByTestId('documents-integrations-link');
    this.picker = new PaperlessPickerModal(page, 'Link document');
    this.pickerTypeSelect = this.dialog.getByLabel('Document type (optional)');
  }

  /** A "Documents (n)" trigger by test id (default: the single-panel pages). */
  button(testId: string = DOCUMENTS_BUTTON_TEST_ID): Locator {
    return this.page.getByTestId(testId);
  }

  /** Click the trigger and wait for the sheet. */
  async open(testId: string = DOCUMENTS_BUTTON_TEST_ID): Promise<void> {
    const button = this.button(testId);
    await button.click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  /** The card whose title contains `title`. */
  row(title: string | RegExp): Locator {
    return this.rows.filter({ hasText: title });
  }

  /** The ⋯ trigger of a card (accessible name "Actions for <title>"). */
  rowMenuTrigger(title: string): Locator {
    return this.row(title).getByRole('button', { name: `Actions for ${title}` });
  }

  /** The popover menu item (menus render in a portal, outside the dialog). */
  menuItem(name: string): Locator {
    return this.page.getByRole('menuitem', { name });
  }

  /** Open a card's ⋯ menu and choose Unlink (no confirmation: an Undo toast follows). */
  async unlink(title: string): Promise<void> {
    await this.rowMenuTrigger(title).click();
    await this.menuItem('Unlink').click();
  }

  /** Footer "Link document": switches the sheet to the picker view. */
  async openPicker(): Promise<void> {
    await this.linkDocumentButton.click();
    await this.pickerBack.waitFor({ state: 'visible' });
  }

  /** Back to the list from the picker (Back button). */
  async backToList(): Promise<void> {
    await this.pickerBack.click();
    await this.linkDocumentButton.waitFor({ state: 'visible' });
  }

  /** Close with the × button and wait for the sheet to leave. */
  async close(): Promise<void> {
    await this.closeButton.click();
    await expect(this.dialog).toHaveCount(0);
  }

  /** True when the page itself scrolls horizontally (a layout overflow). */
  async hasHorizontalOverflow(): Promise<boolean> {
    return this.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  }
}
