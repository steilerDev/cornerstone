/**
 * Component POM for the command search (#2211).
 *
 * - From 1024px it is a palette `Modal` (dialog named "Search everywhere", 640px panel, 56px
 *   input row); below 1024px it is the full-screen `Sheet` (`command-search-sheet`, with a Close
 *   button `command-search-sheet-close`). Both carry role="dialog" with the same name.
 * - Open it with the keyboard (`ControlOrMeta+k`, or `/` where no list owns it), the top bar's
 *   Search button (`top-bar-search`) or a list's "Search everywhere for ‹text›" row
 *   (`search-everywhere-row`).
 * - The input is an ARIA combobox; options are `role="option"` rows. Item rows carry
 *   `command-search-option-<type>-<id>`, "Go to" rows `command-search-dest-<route>` (the route
 *   id can repeat for filtered views of one route, so never assume it is unique), "Show n more"
 *   rows `command-search-more-<type>`. Focus stays in the input; the active row is
 *   `aria-activedescendant`.
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/** Result types that have a group (`command-search-group-<type>`). */
export type SearchGroupType =
  | 'work_item'
  | 'milestone'
  | 'household_item'
  | 'invoice'
  | 'vendor'
  | 'diary_entry'
  | 'area'
  | 'budget_line'
  | 'paperless_document';

export const SEARCH_DIALOG_NAME = 'Search everywhere';

export class CommandSearchPanel {
  readonly page: Page;
  /** The dialog (palette modal or full-screen sheet). */
  readonly dialog: Locator;
  readonly input: Locator;
  readonly inputRow: Locator;
  readonly listbox: Locator;
  readonly results: Locator;
  readonly status: Locator;
  readonly clear: Locator;
  readonly retry: Locator;
  readonly empty: Locator;
  readonly documentsUnavailable: Locator;
  readonly footer: Locator;
  readonly gotoGroup: Locator;
  /** The full-screen sheet (below 1024px) and its Close button. */
  readonly sheet: Locator;
  readonly sheetClose: Locator;
  /** The top bar's Search button (desktop and compact). */
  readonly topBarButton: Locator;
  /** A list's "Search everywhere for ‹text›" row. */
  readonly everywhereRow: Locator;

  constructor(page: Page) {
    this.page = page;
    // Language-neutral: the dialog that holds the search input (its name is "Search everywhere"
    // in English; use SEARCH_DIALOG_NAME for English-only assertions on the accessible name)
    this.dialog = page
      .getByRole('dialog')
      .filter({ has: page.getByTestId('command-search-input') });
    this.input = page.getByTestId('command-search-input');
    this.inputRow = page.getByTestId('command-search-input-row');
    this.listbox = page.getByTestId('command-search-listbox');
    this.results = page.getByTestId('command-search-results');
    this.status = page.getByTestId('command-search-status');
    this.clear = page.getByTestId('command-search-clear');
    this.retry = page.getByTestId('command-search-retry');
    this.empty = page.getByTestId('command-search-empty');
    this.documentsUnavailable = page.getByTestId('command-search-documents-unavailable');
    this.footer = page.getByTestId('command-search-footer');
    this.gotoGroup = page.getByTestId('command-search-group-goto');
    this.sheet = page.getByTestId('command-search-sheet');
    this.sheetClose = page.getByTestId('command-search-sheet-close');
    this.topBarButton = page.getByTestId('top-bar-search');
    this.everywhereRow = page.getByTestId('search-everywhere-row');
  }

  /** The result row of one item. */
  option(type: SearchGroupType, id: string): Locator {
    return this.page.getByTestId(`command-search-option-${type}-${id}`);
  }

  /** Every item row of a group. */
  options(type: SearchGroupType): Locator {
    return this.group(type).locator(`[data-testid^="command-search-option-${type}-"]`);
  }

  /** "Go to" rows of one route id (can repeat: filtered views of one route). */
  dest(route: string): Locator {
    return this.page.getByTestId(`command-search-dest-${route}`);
  }

  /** A "Go to" row by its accessible name ("Go to ‹label›"). */
  destByLabel(label: string): Locator {
    return this.dialog.getByRole('option', { name: `Go to ${label}`, exact: true });
  }

  group(type: SearchGroupType): Locator {
    return this.page.getByTestId(`command-search-group-${type}`);
  }

  /** The group's "Show n more" row. */
  more(type: SearchGroupType): Locator {
    return this.page.getByTestId(`command-search-more-${type}`);
  }

  /** The Call link beside a company row. */
  call(id: string): Locator {
    return this.page.getByTestId(`command-search-call-${id}`);
  }

  /** The row `aria-activedescendant` points at. */
  activeOption(): Locator {
    return this.listbox.locator('[role="option"][aria-selected="true"]');
  }

  /** The DOM id of the active descendant (null while none is active). */
  async activeDescendant(): Promise<string | null> {
    return this.input.getAttribute('aria-activedescendant');
  }

  /** Open with the keyboard shortcut and wait until the input has focus. */
  async openWithShortcut(): Promise<void> {
    await this.page.keyboard.press('ControlOrMeta+k');
    await this.waitForOpen();
  }

  /** Open with the top bar's Search button. */
  async openFromTopBar(): Promise<void> {
    await this.topBarButton.click();
    await this.waitForOpen();
  }

  /** Wait until the dialog is up, settled (sheet slide-in done) and the input is focused. */
  async waitForOpen(): Promise<void> {
    await this.dialog.waitFor({ state: 'visible' });
    await expect(this.input).toBeFocused();
    await this.dialog.evaluate((el) =>
      Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => null))),
    );
  }

  /**
   * Type a query and wait for the matching `/api/search` response (the field is debounced).
   * Register-before-fill so a fast response is never missed.
   */
  async search(query: string): Promise<void> {
    const trimmed = query.trim();
    const response = this.page.waitForResponse((r) => {
      if (!r.url().includes('/api/search')) return false;
      return new URL(r.url()).searchParams.get('q') === trimmed;
    });
    await this.input.fill(query);
    await response;
  }

  /** Close with Escape and wait until the dialog is gone. */
  async closeWithEscape(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.dialog.waitFor({ state: 'hidden' });
  }
}
