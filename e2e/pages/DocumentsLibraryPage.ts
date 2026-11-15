/**
 * Page Object Model for the Documents page (/documents, #2252, EPIC-21 P5.8): the Paperless
 * library on the shared `ObjectList` template (prefix `documents-library`) with a details side
 * panel (`?doc=<paperless id>`).
 *
 * The page renders (all verified in `client/src/pages/DocumentsPage/`):
 * - h1 "Documents (n)" and NO primary action (documents are created in Paperless). Search, Filters,
 *   Sort come from the template; Group by does not exist. Row parts (both surfaces): `row`,
 *   `title` (an anchor that pushes `?doc=`). Table columns: Title, Type, Tags, Document date,
 *   Linked (Added, Last modified and Archive no. are offered by Columns...); the Linked badge says
 *   "Linked". Cards (below 768 px list width) carry Type, date and tags as facts.
 * - Filters: Type select `documents-library-filter-type`, Tags checkboxes
 *   `documents-library-filter-tag-<tag id>`, Hide already linked `documents-library-filter-unlinked-1`.
 *   URL params: `q`, `type`, `tags` (comma-joined ids), `unlinked=1`, `sortBy`, `sortOrder`, `doc`.
 *   The list's API query uses `query`, `documentType`, `tags`, `excludeLinked=true`.
 * - Details panel `documents-library-sheet`: a docked `<aside>` from 1440 px (no focus trap), a
 *   side sheet from 768 px and a bottom sheet below (role dialog) - always located by test id.
 *   Body `documents-library-sheet-body`: metadata `dl`, "Content Preview" (h3), the "Open in
 *   Paperless" link and the "Linked to" RelatedList (`documents-library-linked-to`, h3, header
 *   action "Link to...", rows with a link and a Remove item named Unlink).
 * - Notes: `documents-library-filter-note` (filter tag), `documents-library-unavailable` ("That
 *   document is not available"). Unreachable Paperless: `documents-library-unreachable` with
 *   `documents-library-retry` and `documents-library-integrations-link`.
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { ObjectListControl } from './components/ObjectListControl.js';
import { RelatedListControl } from './components/RelatedListControl.js';

export const DOCUMENTS_ROUTE = routeUrl('documents');
const PREFIX = 'documents-library';

export class DocumentsLibraryPage {
  readonly page: Page;
  readonly olist: ObjectListControl;

  readonly heading: Locator;
  readonly searchInput: Locator;

  readonly filterNote: Locator;
  readonly unavailableNote: Locator;

  readonly unreachable: Locator;
  readonly retryButton: Locator;
  readonly integrationsLink: Locator;

  readonly typeSelect: Locator;
  readonly hideLinkedCheckbox: Locator;

  readonly sheet: Locator;
  readonly sheetHeading: Locator;
  readonly sheetClose: Locator;
  readonly sheetBody: Locator;
  readonly sheetRetry: Locator;
  readonly openInPaperless: Locator;
  readonly contentPreviewHeading: Locator;
  readonly thumbnail: Locator;

  readonly linkedTo: RelatedListControl;
  readonly linkedToHeading: Locator;
  /** The header "Link to..." button (or the empty state's button of the same name). */
  readonly linkToButton: Locator;
  /** The task/purchase picker's text input (open after "Link to..."). */
  readonly linkToInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.olist = new ObjectListControl(
      page,
      PREFIX,
      'Documents',
      (url) => url.pathname === '/api/paperless/documents',
      false,
    );

    this.heading = page.getByRole('heading', { level: 1, name: /^Documents( \(\d+\))?$/ });
    this.searchInput = this.olist.searchInput;

    this.filterNote = page.getByTestId(`${PREFIX}-filter-note`);
    this.unavailableNote = page.getByTestId(`${PREFIX}-unavailable`);

    this.unreachable = page.getByTestId(`${PREFIX}-unreachable`);
    this.retryButton = page.getByTestId(`${PREFIX}-retry`);
    this.integrationsLink = page.getByTestId(`${PREFIX}-integrations-link`);

    this.typeSelect = page.getByTestId(`${PREFIX}-filter-type`);
    this.hideLinkedCheckbox = page.getByTestId(`${PREFIX}-filter-unlinked-1`);

    this.sheet = page.getByTestId(`${PREFIX}-sheet`);
    this.sheetHeading = this.sheet.getByRole('heading', { level: 2 });
    this.sheetClose = page.getByTestId(`${PREFIX}-sheet-close`);
    this.sheetBody = page.getByTestId(`${PREFIX}-sheet-body`);
    this.sheetRetry = page.getByTestId(`${PREFIX}-sheet-retry`);
    this.openInPaperless = this.sheetBody.getByRole('link', {
      name: 'Open in Paperless (opens in a new tab)',
      exact: true,
    });
    this.contentPreviewHeading = this.sheetBody.getByRole('heading', {
      level: 3,
      name: 'Content Preview',
    });
    this.thumbnail = this.sheetBody.locator('img');

    this.linkedTo = new RelatedListControl(page, `${PREFIX}-linked-to`);
    this.linkedToHeading = this.linkedTo.root.getByRole('heading', { level: 3 });
    this.linkToButton = this.linkedTo.addAction('Link to…');
    this.linkToInput = this.linkedTo.root.locator('input[type="text"]');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Page
  // ───────────────────────────────────────────────────────────────────────────

  async goto(query = ''): Promise<void> {
    await this.page.goto(
      query ? `${DOCUMENTS_ROUTE}?${query.replace(/^\?/, '')}` : DOCUMENTS_ROUTE,
    );
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Wait for the first batch (rows, empty state or load failure). */
  async waitForLoaded(): Promise<void> {
    await this.olist.waitForLoaded();
  }

  /** The heading's number "(n)"; null while there is none. */
  async headingCount(): Promise<number | null> {
    const text = (await this.heading.innerText()).replace(/\s+/g, ' ');
    const match = /\((\d+)\)/.exec(text);
    return match ? Number(match[1]) : null;
  }

  /** Whether the details panel docks beside the page (1440 px and wider). */
  isDocked(): boolean {
    return (this.page.viewportSize()?.width ?? 0) >= 1440;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // List
  // ───────────────────────────────────────────────────────────────────────────

  titles(): Promise<string[]> {
    return this.olist.getTitles();
  }

  titleLink(id: number | string): Locator {
    return this.olist.titleLink(String(id));
  }

  row(id: number | string): Locator {
    return this.olist.row(String(id));
  }

  /** The "Linked" badge of a row. */
  linkedBadge(id: number | string): Locator {
    return this.row(id).getByText('Linked', { exact: true });
  }

  /** Type a search and wait for the URL and the list request that carries it as `query`. */
  async search(query: string): Promise<void> {
    if ((await this.searchInput.inputValue()) === query) return;
    const answered = this.page.waitForResponse((resp) => {
      if (resp.request().method() !== 'GET' || resp.status() !== 200) return false;
      const url = new URL(resp.url());
      return url.pathname === '/api/paperless/documents' && url.searchParams.get('query') === query;
    });
    await this.searchInput.fill(query);
    await this.page.waitForURL((url) => url.searchParams.get('q') === query);
    await answered;
    await expect(this.olist.listSection).not.toHaveAttribute('aria-busy', 'true');
  }

  async clearSearch(): Promise<void> {
    const answered = this.page.waitForResponse((resp) => {
      if (resp.request().method() !== 'GET' || resp.status() !== 200) return false;
      const url = new URL(resp.url());
      return url.pathname === '/api/paperless/documents' && !url.searchParams.has('query');
    });
    await this.searchInput.clear();
    await this.page.waitForURL((url) => !url.searchParams.has('q'));
    await answered;
    await expect(this.olist.listSection).not.toHaveAttribute('aria-busy', 'true');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Filters
  // ───────────────────────────────────────────────────────────────────────────

  tagCheckbox(tagId: number): Locator {
    return this.page.getByTestId(`${PREFIX}-filter-tag-${tagId}`);
  }

  /** Open the Filters surface, run `change`, and wait for the list's next answer. */
  private async changeFilter(change: () => Promise<void>): Promise<void> {
    await this.olist.openFilters();
    const answered = this.page.waitForResponse(
      (resp) =>
        resp.request().method() === 'GET' &&
        new URL(resp.url()).pathname === '/api/paperless/documents',
    );
    await change();
    await answered;
    await expect(this.olist.listSection).not.toHaveAttribute('aria-busy', 'true');
  }

  async selectType(value: string): Promise<void> {
    await this.changeFilter(async () => {
      await this.typeSelect.selectOption(value);
    });
  }

  async toggleTag(tagId: number): Promise<void> {
    await this.changeFilter(async () => {
      await this.tagCheckbox(tagId).click();
    });
  }

  async toggleHideLinked(): Promise<void> {
    await this.changeFilter(async () => {
      await this.hideLinkedCheckbox.click();
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Details panel
  // ───────────────────────────────────────────────────────────────────────────

  /** The `dd` of a metadata row by its `dt` label ("Correspondent", "Archive #"...). */
  fact(label: string): Locator {
    return this.sheetBody.locator(`dt:text-is("${label}") + dd`);
  }

  /** Open a document's panel from its row title and wait until its details have loaded. */
  async openDocument(id: number | string): Promise<void> {
    await this.titleLink(id).click();
    await this.waitForSheetLoaded(id);
  }

  async waitForSheetLoaded(id: number | string): Promise<void> {
    await this.page.waitForURL((url) => url.searchParams.get('doc') === String(id));
    await this.sheet.waitFor({ state: 'visible' });
    await this.sheetBody.locator('dl').waitFor({ state: 'visible' });
    await this.linkedToHeading.waitFor({ state: 'visible' });
  }

  /** Close with the panel's Close button. */
  async closeSheet(): Promise<void> {
    await this.sheetClose.click();
    await expect(this.sheet).toBeHidden();
  }

  /** The "Linked to" rows' titles (link text), in order. */
  async linkedToTitles(): Promise<string[]> {
    const links = this.linkedTo.root.locator(`[data-testid^="${PREFIX}-linked-to-link-"]`);
    return (await links.allTextContents()).map((text) => text.trim());
  }
}
