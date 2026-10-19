/**
 * Page Object Model for Settings > Project setup (#2215, EPIC-21).
 *
 * One page (`/settings/manage`) of sections, in this order: House, Cost categories, Purchase
 * categories, Photo orientations, then
 * "Managed on other pages" (Trades and Areas pointer rows). A section is a `#anchor` target.
 * The old `?tab=` links are rewritten to anchors by history replace.
 *
 * Section test ids: `project-setup-house`, `-cost-categories`, `-purchase-categories`,
 * `-photo-orientations`, `-pointers`. Anchors (heading ids
 * `<anchor>-heading`): `house`, `cost-categories`, `purchase-categories`, `orientations`,
 * `pointers`.
 *
 * The three reference lists share the `ReferenceList` component, wrapped here by
 * `ReferenceListControl` (`costCategories`, `purchaseCategories`, `orientations`):
 * - rows are `li` elements named by their item (row test ids carry the record id, so rows are
 *   located by name); the handle is `Reorder <name>` (a button), the menu `Actions for <name>`;
 * - the ⋯ menu (portalled to the body) has Edit, Move up, Move down, Delete;
 * - the New/Edit dialog is a Modal from 768px and a bottom Sheet below (role `dialog`, found by
 *   the name field it holds); an unsaved close opens a discard `alertdialog`;
 * - a delete opens the shared ConfirmDialog (`<prefix>-delete-dialog`); a category still in use
 *   turns it into a blocked state (lead sentence, no Delete button, no counts).
 */

import type { Locator, Page } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';

export const PROJECT_SETUP_URL = routeUrl('settingsManage');

export type ReferenceListKey = 'costCategories' | 'purchaseCategories' | 'orientations';

/** Per list: section test id, test-id prefix of its controls, heading anchor. */
export const REFERENCE_LISTS = {
  costCategories: {
    sectionTestId: 'project-setup-cost-categories',
    prefix: 'cost-categories',
    anchor: 'cost-categories',
    title: 'Cost categories',
    newLabel: 'New cost category',
    editLabel: 'Edit cost category',
  },
  purchaseCategories: {
    sectionTestId: 'project-setup-purchase-categories',
    prefix: 'purchase-categories',
    anchor: 'purchase-categories',
    title: 'Purchase categories',
    newLabel: 'New purchase category',
    editLabel: 'Edit purchase category',
  },
  orientations: {
    sectionTestId: 'project-setup-photo-orientations',
    prefix: 'photo-orientations',
    anchor: 'orientations',
    title: 'Photo orientations',
    newLabel: 'New orientation',
    editLabel: 'Edit orientation',
  },
} as const;

export interface ReferenceListValues {
  name: string;
  description?: string;
  /** Hex like `#336699`; `null` ticks "No color". Omitted = leave the dialog as it is. */
  color?: string | null;
}

export class ReferenceListControl {
  readonly page: Page;
  readonly key: ReferenceListKey;
  readonly prefix: string;
  readonly section: Locator;
  readonly heading: Locator;
  readonly newButton: Locator;
  readonly items: Locator;
  readonly reorderError: Locator;
  readonly retryButton: Locator;
  readonly dialog: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly colorInput: Locator;
  readonly noColor: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly discardDialog: ConfirmDialogControl;
  readonly deleteDialog: ConfirmDialogControl;

  constructor(page: Page, key: ReferenceListKey) {
    const config = REFERENCE_LISTS[key];
    this.page = page;
    this.key = key;
    this.prefix = config.prefix;
    this.section = page.getByTestId(config.sectionTestId);
    this.heading = page.locator(`#${config.anchor}-heading`);
    this.newButton = page.getByTestId(`${config.prefix}-new`);
    this.items = this.section.getByRole('listitem');
    this.reorderError = page.getByTestId(`${config.prefix}-reorder-error`);
    this.retryButton = page.getByTestId(`${config.prefix}-retry`);
    this.dialog = page
      .getByRole('dialog')
      .filter({ has: page.getByTestId(`${config.prefix}-name`) });
    this.nameInput = page.getByTestId(`${config.prefix}-name`);
    this.descriptionInput = page.getByTestId(`${config.prefix}-description`);
    this.colorInput = page.getByTestId(`${config.prefix}-color`);
    this.noColor = page.getByTestId(`${config.prefix}-no-color`);
    this.saveButton = page.getByTestId(`${config.prefix}-save`);
    this.cancelButton = page.getByTestId(`${config.prefix}-cancel`);
    this.discardDialog = new ConfirmDialogControl(page, `${config.prefix}-discard`);
    this.deleteDialog = new ConfirmDialogControl(page, `${config.prefix}-delete-dialog`);
  }

  /** The visible panel: the Modal's content box (>= 768px) or the Sheet itself (below). */
  dialogPanel(): Locator {
    const width = this.page.viewportSize()?.width ?? 1280;
    return width < 768 ? this.dialog : this.dialog.locator(':scope > div').nth(1);
  }

  /** The row with exactly this name. */
  row(name: string): Locator {
    return this.items.filter({ has: this.page.getByText(name, { exact: true }) });
  }

  /** The reorder handle of the row. */
  handle(name: string): Locator {
    return this.page.getByRole('button', { name: `Reorder ${name}`, exact: true });
  }

  /** The ⋯ trigger of the row. */
  menuTrigger(name: string): Locator {
    return this.page.getByRole('button', { name: `Actions for ${name}`, exact: true });
  }

  /** A menu item of the open ⋯ menu (the menu is portalled to the body). */
  menuItem(label: 'Edit' | 'Move up' | 'Move down' | 'Delete'): Locator {
    return this.page.getByRole('menuitem', { name: label, exact: true });
  }

  /** The filled swatch of the row (`data-color` is set only when the item has a color). */
  swatch(name: string): Locator {
    return this.row(name).locator('[data-color]');
  }

  /** The names in the list, in order, optionally limited to those that pass `filter`. */
  async orderOfNames(filter?: (name: string) => boolean): Promise<string[]> {
    const names = await this.items
      .locator('[title]')
      .evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
    return filter ? names.filter(filter) : names;
  }

  async openMenu(name: string): Promise<void> {
    await this.menuTrigger(name).click();
    await this.menuItem('Edit').waitFor({ state: 'visible' });
  }

  async clickMenuItem(
    name: string,
    label: 'Edit' | 'Move up' | 'Move down' | 'Delete',
  ): Promise<void> {
    await this.openMenu(name);
    await this.menuItem(label).click();
  }

  async openNewDialog(): Promise<void> {
    await this.newButton.click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  /** Fill the open dialog (does not save). */
  async fillDialog(values: Partial<ReferenceListValues>): Promise<void> {
    if (values.name !== undefined) await this.nameInput.fill(values.name);
    if (values.description !== undefined) await this.descriptionInput.fill(values.description);
    if (values.color === null) {
      if (!(await this.noColor.isChecked())) await this.noColor.check();
    } else if (values.color !== undefined) {
      if (await this.noColor.isChecked()) await this.noColor.uncheck();
      await this.colorInput.fill(values.color);
    }
  }

  /** Click Save and wait for the dialog to close (on success). */
  async save(): Promise<void> {
    await this.saveButton.click();
    await this.dialog.waitFor({ state: 'hidden' });
  }

  async create(values: ReferenceListValues): Promise<void> {
    await this.openNewDialog();
    await this.fillDialog(values);
    await this.save();
    await this.row(values.name).waitFor({ state: 'visible' });
  }

  async edit(name: string, values: Partial<ReferenceListValues>): Promise<void> {
    await this.clickMenuItem(name, 'Edit');
    await this.dialog.waitFor({ state: 'visible' });
    await this.fillDialog(values);
    await this.save();
  }

  /** Open the delete confirmation of a row (does not confirm). */
  async openDelete(name: string): Promise<void> {
    await this.clickMenuItem(name, 'Delete');
    await this.deleteDialog.waitForOpen();
  }

  async delete(name: string): Promise<void> {
    await this.openDelete(name);
    await this.deleteDialog.confirmAndWaitClosed();
    await this.row(name).waitFor({ state: 'detached' });
  }

  /** Keyboard pick-up on a handle: focus it, Space picks up, arrow keys move, Space drops. */
  async focusHandle(name: string): Promise<void> {
    await this.handle(name).focus();
  }
}

export class ProjectSetupPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly house: Locator;
  readonly houseName: Locator;
  readonly houseAddress: Locator;
  readonly languageSelect: Locator;
  readonly appLanguageLink: Locator;
  readonly houseSave: Locator;
  readonly houseSaved: Locator;
  readonly houseSaveError: Locator;
  readonly pointers: Locator;
  readonly pointerTrades: Locator;
  readonly pointerAreas: Locator;
  readonly statusRegion: Locator;
  readonly costCategories: ReferenceListControl;
  readonly purchaseCategories: ReferenceListControl;
  readonly orientations: ReferenceListControl;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Project setup', exact: true });
    this.house = page.getByTestId('project-setup-house');
    this.houseName = page.getByTestId('project-setup-house-name');
    this.houseAddress = page.getByTestId('project-setup-house-address');
    this.languageSelect = page.getByTestId('project-setup-language');
    this.appLanguageLink = page.getByTestId('project-setup-app-language-link');
    this.houseSave = page.getByTestId('project-setup-house-save');
    this.houseSaved = this.house.locator('[role="status"]');
    this.houseSaveError = this.house.locator('[role="alert"]');
    this.pointers = page.getByTestId('project-setup-pointers');
    this.pointerTrades = page.getByTestId('project-setup-pointer-trades');
    this.pointerAreas = page.getByTestId('project-setup-pointer-areas');
    this.statusRegion = page.getByTestId('project-setup-status');
    this.costCategories = new ReferenceListControl(page, 'costCategories');
    this.purchaseCategories = new ReferenceListControl(page, 'purchaseCategories');
    this.orientations = new ReferenceListControl(page, 'orientations');
  }

  /** Open the page (optionally at a section anchor, e.g. `orientations`). */
  async goto(anchor?: string): Promise<void> {
    await this.page.goto(anchor ? `${PROJECT_SETUP_URL}#${anchor}` : PROJECT_SETUP_URL);
    await this.waitForLoaded();
  }

  /** Heading visible and the three lists past their loading skeletons. */
  async waitForLoaded(): Promise<void> {
    await this.heading.waitFor({ state: 'visible' });
    await this.house.waitFor({ state: 'visible' });
    for (const list of [this.costCategories, this.purchaseCategories, this.orientations]) {
      await list.heading.waitFor({ state: 'visible' });
      await list.newButton.waitFor({ state: 'visible' });
    }
    await this.languageSelect.waitFor({ state: 'visible' });
  }

  /** The section test ids in page order. */
  sectionsInOrder(): Locator[] {
    return [
      this.house,
      this.costCategories.section,
      this.purchaseCategories.section,
      this.orientations.section,
      this.pointers,
    ];
  }
}
