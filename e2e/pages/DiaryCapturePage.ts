/**
 * Page Object Model for the capture screen (#2221): `/diary/new` (new entry), `/diary/:id/edit`
 * (draft, saved entry) and its locked states. It replaces the retired `DiaryEntryCreatePage`
 * (type-card picker) and `DiaryEntryEditPage` (form + `PhotoUpload` + metadata modal).
 *
 * ── API (keep stable: E2E-2 migrates ~20 specs onto it) ───────────────────────────────────────
 *
 * Navigation       goto({ date?, areaId?, start? }) · gotoEdit(id) · gotoLocked(id)
 *                  waitForDraft() -> id of the draft (waits for /diary/<id>/edit)
 * Page             heading · breadcrumbs · lockedMessage (EmptyState of a signed/automatic entry)
 *                  notFoundMessage
 * Photos           takePhotosButton · chooseButton · libraryInput · cameraInput · dropZone
 *                  chooseFromLibrary(files) · takePhotosViaApp(files) · addFiles(files)  (no tap)
 *                  strip · tiles · tile(i) · tileOpen/tileSelect/tileRemove/tileRetry(i)
 *                  tileLabel(i) · tileState(i) · waitForUploaded(n) · removeTile(i)
 *                  selectTile(i) · selectAll() · clearSelection() · tagsApplyText
 *                  waitingNotice · waitingCount · retryNowButton · orphans · orphansContinue ·
 *                  orphansDiscard
 * Tags (page)      areaChip(name) · orientationChip(name) · otherAreaChip · newAreaChip ·
 *                  noOrientationChip · otherOrientationChip · newOrientationChip
 *                  setArea(name) · setOrientation(name) · pickAreaInDialog(name)
 *                  newTagDialog (ObjectFormDialog, test id tag-create-form)
 * Photo sheet      sheet.{dialog,previous,next,done,annotate,remove,caption,areaInput,
 *                  orientationInput} · sheet.setArea(name) · annotator.{dialog,draw()}
 * Camera           camera.{dialog,shutter,exit,topBar,useCameraApp,waiting,lowResHint,
 *                  lowResUseApp,lowResDismiss,allowHint,removeLast,errorPanel,errorUseApp,
 *                  errorClose,status,areaChip(name),orientationChip(name)} (#2227: `exit` is the
 *                  top-bar button, "Close" with no shots, "Review (n)" after, "Saving photos…"
 *                  while it waits; there is no "Done" and no counter pill)
 *                  camera.shotCount() (parses `exit`) · openCamera() · shoot(n) · closeCamera()
 *                  startFromPlus('photo' | 'diaryEntry') (counted: ＋ and the tile / row)
 * Date             dateChip('today'|'yesterday'|'pick') · dateInput · pickDate(iso) · dateHint
 * Title / text     titleChip(title) · titleInput · textArea · typeTitle(text) · typeText(text)
 *                  setTitleChip(title) · lookupRows · addToThatButton
 * Type             typeChip(type) · moreTypeTrigger · moreTypeOption(type) · selectType(type)
 *                  switchDialog (ConfirmDialogControl)
 * Site details     companyChip(name) · otherCompanyChip · workersChip(label) · workersExact
 *                  startChip(label) · startNow · startOther · startInput · endChip(label) ·
 *                  endNow · endInput · duration · inspectorInput · outcomeChip(value) ·
 *                  severityChip(value) · statusChip(value) · materialInput · weatherChip(value) ·
 *                  moreDetails (toggle) · openMoreDetails() · addSignatureButton ·
 *                  signatureCanvas · acceptSignatureButton · drawSignature() · signedNote
 * Vendor signature (E2E-2) vendorSignerRadio · removeSignatureButton · signatureError ·
 *                  signerSection · signatureCompanyInput/Chip · signatureOtherCompanyInput ·
 *                  signatoryNameInput · chooseSignatureCompany(name | 'Other...')
 * Company picker (E2E-2) openCompanyPicker() · companyPicker (CompanyPickerControl: pick(name),
 *                  openCreateForm(text), form) — the "Other company…" dialog
 * Sticky bar       saveButton · cancelButton · savedText · statusRegion · saveReason
 *                  saveEntry() · saveChanges()
 * Menu             menuButton · discardItem · discardDialog · cancelDialog (ConfirmDialogControl)
 *                  discardEntry() (menu -> Discard entry -> confirm)
 * Toasts           toasts (ToastRegion)
 * Tap counter      taps (number) · resetTaps() · tap(locator). EVERY user-intent method goes
 *                  through tap(); typing (typeTitle/typeText) is not a tap. The native file
 *                  picker counts files + 1 (one tap per picked photo plus Add, #2227), on top of
 *                  the tap that opens it. Raw locators do not count.
 *
 * Test ids come from the built components: capture-* (CaptureScreen), photo-strip-<key>-*
 * (PhotoStrip), capture-tag-chips / camera-tag-chips (TagChips idPrefix), rapid-camera-*
 * (RapidCamera), photo-sheet-* (PhotoTagSheet), photos-waiting-notice (PhotosWaitingNotice),
 * date-chips-* (DateChips), sticky-action-bar (StickyActionBar).
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import type { CapturePhotoFile } from '../fixtures/capturePhotos.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';
import { CreateMenu } from './components/CreateMenu.js';
import { CompanyPickerControl } from './components/CompanyPickerControl.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';
import { ObjectFormDialog } from './components/ObjectFormDialog.js';
import { pickByKeyboard } from './components/SearchPickerControl.js';
import { ToastRegion } from './components/ToastRegion.js';

export type CaptureEntryType = 'daily_log' | 'site_visit' | 'delivery' | 'issue' | 'general_note';

export const DIARY_CAPTURE_NEW_ROUTE = routeUrl('diaryEntryNew');

/** The h1 of a new entry for a given "Weekday, d Mon" text. */
export const CAPTURE_TITLE_NEW = (date: string): string => `New entry · ${date}`;

export class DiaryCapturePage {
  readonly page: Page;

  /** Number of taps made through this POM since construction or the last `resetTaps()`. */
  taps = 0;

  readonly breadcrumbs: BreadcrumbsBar;
  readonly toasts: ToastRegion;

  readonly heading: Locator;
  readonly lockedMessage: Locator;
  readonly notFoundMessage: Locator;

  // Photos
  readonly takePhotosButton: Locator;
  readonly chooseButton: Locator;
  readonly libraryInput: Locator;
  readonly cameraInput: Locator;
  readonly dropZone: Locator;
  readonly strip: Locator;
  readonly tiles: Locator;
  readonly tagsApplyText: Locator;
  readonly selectAllButton: Locator;
  readonly clearSelectionButton: Locator;
  readonly waitingNotice: Locator;
  readonly waitingCount: Locator;
  readonly retryNowButton: Locator;
  readonly orphans: Locator;
  readonly orphansContinue: Locator;
  readonly orphansDiscard: Locator;

  // Tags (page)
  readonly tagChips: Locator;
  readonly newTagDialog: ObjectFormDialog;

  // Date
  readonly dateInput: Locator;
  readonly dateHint: Locator;

  // Title / text
  readonly titleInput: Locator;
  readonly textArea: Locator;
  readonly lookupRows: Locator;
  readonly addToThatButton: Locator;

  // Type
  readonly moreTypeTrigger: Locator;
  readonly switchDialog: ConfirmDialogControl;

  // Site details
  readonly otherCompanyChip: Locator;
  readonly workersExact: Locator;
  readonly startInput: Locator;
  readonly endInput: Locator;
  readonly duration: Locator;
  readonly inspectorInput: Locator;
  readonly materialInput: Locator;
  readonly moreDetails: Locator;
  readonly addSignatureButton: Locator;
  readonly signatureCanvas: Locator;
  readonly acceptSignatureButton: Locator;
  readonly signedNote: Locator;
  /** E2E-2 additions: the vendor signer option, the pending-signature remove button and error. */
  readonly vendorSignerRadio: Locator;
  readonly removeSignatureButton: Locator;
  readonly signatureError: Locator;
  /** Vendor-signer block of the pending signature (signer type, company, signatory). */
  readonly signerSection: Locator;
  readonly signatureCompanyInput: Locator;
  readonly signatureCompanyChip: Locator;
  readonly signatureOtherCompanyInput: Locator;
  readonly signatoryNameInput: Locator;
  /** The "Other company…" picker dialog (company SearchPicker with the New company row). */
  readonly companyPicker: CompanyPickerControl;

  // Sticky bar
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly savedText: Locator;
  readonly statusRegion: Locator;
  readonly saveReason: Locator;

  // Menu
  readonly menuButton: Locator;
  readonly discardItem: Locator;
  readonly discardDialog: ConfirmDialogControl;
  readonly cancelDialog: ConfirmDialogControl;

  readonly camera: CameraControls;
  readonly sheet: PhotoSheetControls;
  readonly annotator: AnnotatorControls;

  constructor(page: Page) {
    this.page = page;
    this.breadcrumbs = new BreadcrumbsBar(page);
    this.toasts = new ToastRegion(page);

    this.heading = page.getByRole('heading', { level: 1 });
    this.lockedMessage = page.getByTestId('capture-page').locator('[class*="emptyState"]').first();
    this.notFoundMessage = this.lockedMessage;

    this.takePhotosButton = page.getByTestId('capture-take-photos');
    this.chooseButton = page.getByTestId('capture-choose-photos');
    this.libraryInput = page.getByTestId('capture-library-input');
    this.cameraInput = page.getByTestId('capture-camera-input');
    this.dropZone = page.getByTestId('capture-drop-zone');
    this.strip = page.getByTestId('photo-strip');
    this.tiles = this.strip.locator('[data-tile-key]');
    this.tagsApplyText = page.getByTestId('capture-tags-apply');
    this.selectAllButton = page.getByRole('button', { name: 'Select all', exact: true });
    this.clearSelectionButton = page.getByRole('button', { name: 'Clear selection', exact: true });
    this.waitingNotice = page.getByTestId('photos-waiting-notice');
    this.waitingCount = page.getByTestId('photos-waiting-notice-count');
    this.retryNowButton = page.getByTestId('photos-waiting-notice-retry');
    this.orphans = page.getByTestId('capture-orphans');
    this.orphansContinue = this.orphans.getByRole('button', { name: 'Continue', exact: true });
    this.orphansDiscard = this.orphans.getByRole('button', { name: 'Discard', exact: true });

    this.tagChips = page.getByTestId('capture-tag-chips');
    this.newTagDialog = new ObjectFormDialog(page, 'New area', 'tag-create-form');

    this.dateInput = page.getByTestId('date-chips-input');
    this.dateHint = page.getByTestId('date-chips').getByText('Photos use this date.');

    this.titleInput = page.getByTestId('capture-title-input');
    this.textArea = page.getByTestId('capture-text-input');
    this.lookupRows = page.getByTestId('capture-lookup');
    this.addToThatButton = page.getByTestId('capture-add-to-that');

    this.moreTypeTrigger = page.locator('[data-entry-more]');
    this.switchDialog = new ConfirmDialogControl(page, 'capture-switch');

    this.otherCompanyChip = page.getByTestId('capture-company').getByRole('button', {
      name: 'Other company…',
      exact: true,
    });
    this.workersExact = page.getByLabel('Number of workers', { exact: true });
    this.startInput = page.getByTestId('capture-start-input');
    this.endInput = page.getByTestId('capture-end-input');
    this.duration = page.getByTestId('capture-duration');
    this.inspectorInput = page.locator('#capture-field-inspector');
    this.materialInput = page.getByTestId('capture-materials').getByRole('textbox');
    this.moreDetails = page.getByTestId('capture-more-details');
    this.addSignatureButton = page.getByRole('button', { name: '+ Add Signature', exact: true });
    this.signatureCanvas = page.getByLabel('Signature canvas');
    this.acceptSignatureButton = page.getByRole('button', {
      name: 'Accept Signature',
      exact: true,
    });
    this.signedNote = page.getByText('Saving locks this entry because it is signed.');
    this.vendorSignerRadio = page.getByRole('radio', { name: 'Vendor' });
    this.removeSignatureButton = page.getByRole('button', { name: 'Remove Signature' });
    this.signatureError = page.getByText(
      'Accept or remove the unfinished signature before saving.',
    );
    this.signerSection = page.locator('[class*="signerSection"]');
    this.signatureCompanyInput = this.signerSection.getByRole('textbox', {
      name: 'Vendor',
      exact: true,
    });
    this.signatureCompanyChip = this.signerSection.locator('[class*="selectedDisplay"]');
    this.signatureOtherCompanyInput = this.signerSection.getByRole('textbox', {
      name: 'Enter vendor name',
      exact: true,
    });
    this.signatoryNameInput = this.signerSection.getByPlaceholder(
      'Name of person signing on behalf of vendor',
    );
    this.companyPicker = new CompanyPickerControl(
      page,
      page.locator('input[aria-label="Choose a company"]'),
    );

    this.saveButton = page.getByTestId('capture-save');
    this.cancelButton = page.getByTestId('capture-cancel');
    this.savedText = page.getByTestId('sticky-action-bar').getByText(/^Saved\s/);
    this.statusRegion = page.getByTestId('sticky-action-bar-status');
    this.saveReason = this.saveButton.locator('xpath=following-sibling::span[1]');

    this.menuButton = page.getByRole('button', { name: 'More actions', exact: true });
    this.discardItem = page.getByTestId('capture-discard');
    this.discardDialog = new ConfirmDialogControl(page, 'capture-discard');
    this.cancelDialog = new ConfirmDialogControl(page, 'capture-cancel-dialog');

    this.camera = new CameraControls(this);
    this.sheet = new PhotoSheetControls(this);
    this.annotator = new AnnotatorControls(this);
  }

  // ── Tap counter ───────────────────────────────────────────────────────────────────────────

  resetTaps(): void {
    this.taps = 0;
  }

  /** Click and count one tap. */
  async tap(locator: Locator): Promise<void> {
    await locator.click();
    this.taps += 1;
  }

  // ── Navigation ────────────────────────────────────────────────────────────────────────────

  /** Open `/diary/new`; optional `date` (YYYY-MM-DD) and `areaId` query pre-selects. */
  /**
   * Open the capture screen. `start` is the Log now tile query (#2222): `photo` may open the
   * camera dialog over the page, so only the screen itself is awaited then.
   */
  async goto(
    options: { date?: string; areaId?: string; start?: 'photo' | 'note' | 'delivery' } = {},
  ): Promise<void> {
    const query: Record<string, string> = {};
    if (options.date) query.date = options.date;
    if (options.areaId) query.areaId = options.areaId;
    if (options.start) query.start = options.start;
    const search = new URLSearchParams(query).toString();
    await this.page.goto(search ? `${DIARY_CAPTURE_NEW_ROUTE}?${search}` : DIARY_CAPTURE_NEW_ROUTE);
    if (options.start === 'photo') {
      await this.page.getByTestId('capture-screen').waitFor({ state: 'visible' });
    } else {
      await this.waitForForm();
    }
  }

  async gotoEdit(id: string): Promise<void> {
    await this.page.goto(routeUrl('diaryEntryEdit', { id }));
    await this.waitForForm();
  }

  /** Open an edit URL that renders an EmptyState (signed or automatic entry, unknown id). */
  async gotoLocked(id: string): Promise<void> {
    await this.page.goto(routeUrl('diaryEntryEdit', { id }));
    await this.lockedMessage.waitFor({ state: 'visible' });
  }

  async waitForForm(): Promise<void> {
    await this.page.getByTestId('capture-screen').waitFor({ state: 'visible' });
    await this.chooseButton.waitFor({ state: 'visible' });
  }

  /** Wait for the URL to become `/diary/<id>/edit` (a draft was created) and return the id. */
  async waitForDraft(): Promise<string> {
    await this.page.waitForURL(/\/diary\/[^/]+\/edit$/);
    return this.draftIdFromUrl();
  }

  /** Id of the entry on `/diary/<id>` (entry page) or `/diary/<id>/edit`. */
  entryIdFromUrl(): string {
    const match = /\/diary\/([^/?#]+)/.exec(this.page.url());
    if (!match?.[1] || match[1] === 'new') throw new Error(`No entry in URL: ${this.page.url()}`);
    return match[1];
  }

  draftIdFromUrl(): string {
    const match = /\/diary\/([^/]+)\/edit/.exec(this.page.url());
    if (!match?.[1]) throw new Error(`Not on a capture edit URL: ${this.page.url()}`);
    return match[1];
  }

  // ── Photos ────────────────────────────────────────────────────────────────────────────────

  /**
   * Tap "Choose from library" (1), then pick `files` in the native picker: one tap per photo plus
   * Add = files + 1 (#2227, plan 5.6).
   */
  async chooseFromLibrary(files: CapturePhotoFile[]): Promise<void> {
    const chooser = this.page.waitForEvent('filechooser');
    await this.tap(this.chooseButton);
    await (await chooser).setFiles(files);
    this.taps += files.length + 1;
  }

  /**
   * Tap "Take photos" when it opens the native camera input (no viewfinder) and pick `files`
   * (that input takes one file); the picker counts files + 1.
   */
  async takePhotosViaApp(files: CapturePhotoFile[]): Promise<void> {
    const chooser = this.page.waitForEvent('filechooser');
    await this.tap(this.takePhotosButton);
    await (await chooser).setFiles(files);
    this.taps += files.length + 1;
  }

  /** Set files on the hidden library input directly (not a tap). */
  async addFiles(files: CapturePhotoFile[]): Promise<void> {
    await this.libraryInput.setInputFiles(files);
  }

  tile(index: number): Locator {
    return this.tiles.nth(index);
  }
  tileOpen(index: number): Locator {
    return this.tile(index).locator('[data-open-button]');
  }
  tileSelect(index: number): Locator {
    return this.tile(index).locator('input[type="checkbox"]');
  }
  tileRemove(index: number): Locator {
    return this.tile(index).locator('[data-testid$="-remove"]');
  }
  tileRetry(index: number): Locator {
    return this.tile(index).locator('[data-testid$="-retry"]');
  }

  /** Accessible name of a tile: "Photo 1 of 3, Kitchen, Front, annotated, ...". */
  async tileLabel(index: number): Promise<string> {
    return (await this.tileOpen(index).getAttribute('aria-label')) ?? '';
  }

  /** `data-state` of a tile: waiting | uploading | uploaded | failed | blocked. */
  tileState(index: number): Locator {
    return this.tile(index);
  }

  /** Wait until `count` tiles exist and every one is uploaded. */
  async waitForUploaded(count: number): Promise<void> {
    await expect(this.tiles).toHaveCount(count);
    await expect(this.strip.locator('[data-tile-key][data-state="uploaded"]')).toHaveCount(count);
  }

  async removeTile(index: number): Promise<void> {
    await this.tap(this.tileRemove(index));
  }

  async selectTile(index: number): Promise<void> {
    await this.tap(this.tileSelect(index));
  }

  async selectAll(): Promise<void> {
    await this.tap(this.selectAllButton);
  }

  async clearSelection(): Promise<void> {
    await this.tap(this.clearSelectionButton);
  }

  // ── Tags (page chips) ─────────────────────────────────────────────────────────────────────

  private areaGroup(scope: Locator): Locator {
    return scope.getByRole('group', { name: 'Area', exact: true });
  }
  private orientationGroup(scope: Locator): Locator {
    return scope.getByRole('group', { name: 'Orientation', exact: true });
  }

  areaChip(name: string): Locator {
    return this.areaGroup(this.tagChips).getByRole('button', { name, exact: true });
  }
  orientationChip(name: string): Locator {
    return this.orientationGroup(this.tagChips).getByRole('button', { name, exact: true });
  }
  get otherAreaChip(): Locator {
    return this.areaChip('Other area…');
  }
  get newAreaChip(): Locator {
    return this.areaChip('New area');
  }
  get noOrientationChip(): Locator {
    return this.orientationChip('No orientation');
  }
  get otherOrientationChip(): Locator {
    return this.orientationChip('Other orientation…');
  }
  get newOrientationChip(): Locator {
    return this.orientationChip('New orientation');
  }

  /** Tap an Area chip. */
  async setArea(name: string): Promise<void> {
    await this.tap(this.areaChip(name));
  }

  /** Tap an Orientation chip. */
  async setOrientation(name: string): Promise<void> {
    await this.tap(this.orientationChip(name));
  }

  /** Other area… -> pick `name` in the picker dialog (3 taps). */
  async pickAreaInDialog(name: string): Promise<void> {
    await this.tap(this.otherAreaChip);
    const dialog = this.page.getByTestId('capture-area-picker');
    const input = dialog.getByRole('combobox').or(dialog.locator('input')).first();
    await input.fill(name);
    await pickByKeyboard(this.page, input, name);
    this.taps += 1;
  }

  // ── Date ──────────────────────────────────────────────────────────────────────────────────

  dateChip(which: 'today' | 'yesterday' | 'pick'): Locator {
    return this.page.getByTestId(`date-chips-${which}`);
  }

  /** Pick chip -> set the native date input (2 taps). */
  async pickDate(iso: string): Promise<void> {
    await this.tap(this.dateChip('pick'));
    await this.dateInput.fill(iso);
    this.taps += 1;
  }

  // ── Title / text ──────────────────────────────────────────────────────────────────────────

  titleChip(title: string): Locator {
    return this.page.getByTestId(`capture-title-chip-${title}`);
  }

  async setTitleChip(title: string): Promise<void> {
    await this.tap(this.titleChip(title));
  }

  /** Type into Title (not a tap). Uses key presses so every character fires an input event. */
  async typeTitle(text: string): Promise<void> {
    await this.titleInput.click();
    await this.titleInput.pressSequentially(text);
  }

  async typeText(text: string): Promise<void> {
    await this.textArea.fill(text);
  }

  // ── Type ──────────────────────────────────────────────────────────────────────────────────

  typeChip(type: 'daily_log' | 'site_visit' | 'delivery'): Locator {
    return this.page.getByTestId(`capture-type-${type}`);
  }

  moreTypeOption(type: 'issue' | 'general_note'): Locator {
    return this.page.getByTestId(`capture-type-${type}`);
  }

  /** Daily log / Site visit / Delivery chip, or Defect / Note through the More menu. */
  async selectType(type: CaptureEntryType): Promise<void> {
    if (type === 'issue' || type === 'general_note') {
      await this.tap(this.moreTypeTrigger);
      await this.tap(this.moreTypeOption(type));
    } else {
      await this.tap(this.typeChip(type));
    }
  }

  // ── Site details ──────────────────────────────────────────────────────────────────────────

  companyChip(name: string): Locator {
    return this.page.getByTestId('capture-company').getByRole('button', { name, exact: true });
  }
  workersChip(label: string): Locator {
    return this.page
      .getByTestId('capture-workers')
      .getByRole('button', { name: label, exact: true });
  }
  startChip(label: string): Locator {
    return this.page.getByTestId('capture-start').getByRole('button', { name: label, exact: true });
  }
  get startNow(): Locator {
    return this.startChip('Now');
  }
  get startOther(): Locator {
    return this.startChip('Other time');
  }
  endChip(label: string): Locator {
    return this.page.getByTestId('capture-end').getByRole('button', { name: label, exact: true });
  }
  get endNow(): Locator {
    return this.endChip('Now');
  }
  outcomeChip(value: 'pass' | 'conditional' | 'fail'): Locator {
    return this.page.getByTestId(`capture-outcome-${value}`);
  }
  severityChip(value: 'low' | 'medium' | 'high' | 'critical'): Locator {
    return this.page.getByTestId(`capture-severity-${value}`);
  }
  statusChip(value: 'open' | 'in_progress' | 'resolved'): Locator {
    return this.page.getByTestId(`capture-status-${value}`);
  }
  weatherChip(value: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'stormy' | 'other'): Locator {
    return this.page.getByTestId(`capture-weather-${value}`);
  }

  /** Open "More details" (1 tap); no-op when already open. */
  async openMoreDetails(): Promise<void> {
    if ((await this.moreDetails.getAttribute('aria-expanded')) !== 'true') {
      await this.tap(this.moreDetails);
    }
    await expect(this.moreDetails).toHaveAttribute('aria-expanded', 'true');
  }

  /**
   * Choose a company for the pending vendor signature through the picker's search (keyboard
   * path), or with `'Other...'` the free-text entry.
   */
  async chooseSignatureCompany(name: string): Promise<void> {
    await this.signatureCompanyInput.fill('');
    await this.signatureCompanyInput.fill(name);
    await this.page.locator('[data-search-picker-dropdown]').waitFor({ state: 'visible' });
    // "Other..." is always listed first, so it is not an extra row to wait out
    await pickByKeyboard(this.page, this.signatureCompanyInput, name, /Other\.\.\./);
  }

  /** Tap "Other company…" and wait for the company picker dialog. */
  async openCompanyPicker(): Promise<void> {
    await this.tap(this.otherCompanyChip);
    await this.companyPicker.input.waitFor({ state: 'visible' });
  }

  /** Draw a stroke on the (first) signature canvas and accept it. */
  async drawSignature(): Promise<void> {
    const canvas = this.signatureCanvas.first();
    await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Signature canvas has no bounding box');
    await this.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3, { steps: 5 });
    await this.page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7, { steps: 5 });
    await this.page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, { steps: 5 });
    await this.page.mouse.up();
    await this.tap(this.acceptSignatureButton);
  }

  // ── Sticky bar / menu ─────────────────────────────────────────────────────────────────────

  /** Tap "Save entry" and wait for the entry page. */
  async saveEntry(): Promise<void> {
    await this.tap(this.saveButton);
    await this.page.waitForURL(/\/diary\/(?!new$)[^/]+$/);
  }

  /** Tap "Save changes" (saved-entry edit). The caller asserts where it lands. */
  async saveChanges(): Promise<void> {
    await this.tap(this.saveButton);
  }

  /** More actions -> Discard entry -> Discard. */
  async discardEntry(): Promise<void> {
    await this.tap(this.menuButton);
    await this.tap(this.discardItem);
    await this.discardDialog.waitForOpen();
    await this.discardDialog.confirm();
  }

  // ── Camera ────────────────────────────────────────────────────────────────────────────────

  /** Tap "Take photos" and wait for the live viewfinder (shutter enabled). */
  async openCamera(): Promise<void> {
    await this.tap(this.takePhotosButton);
    await this.camera.dialog.waitFor({ state: 'visible' });
    await this.camera.waitForLive();
  }

  /**
   * Tap the shutter `count` times, waiting for "(n)" in the exit label after each shot (locale-agnostic: "Prüfen (n)" in German) (150 ms cooldown).
   * `n` counts the shots being written too, so it moves at the press.
   */
  async shoot(count: number): Promise<void> {
    const start = await this.camera.shotCount();
    for (let i = 1; i <= count; i++) {
      const total = start + i;
      // The shutter ignores a press within 150 ms of the previous shot: retry an ignored press.
      // It is still one tap for the counter.
      try {
        await expect(async () => {
          await this.camera.shutter.click();
          await expect(this.camera.exit).toHaveText(new RegExp(`\\(${total}\\)$`), {
            timeout: 1000,
          });
        }).toPass({ intervals: [200], timeout: 20_000 });
      } catch (error) {
        const video = await this.page
          .getByTestId('rapid-camera-video')
          .evaluate((el: HTMLVideoElement) => ({
            readyState: el.readyState,
            width: el.videoWidth,
            paused: el.paused,
            tracks: (el.srcObject as MediaStream | null)
              ?.getTracks()
              .map((track) => track.readyState),
          }))
          .catch(() => 'no video element');
        throw new Error(`Shot ${total} never registered; video: ${JSON.stringify(video)}`, {
          cause: error,
        });
      }
      this.taps += 1;
    }
  }

  /**
   * Tap "Remove last photo". It is an aria-disabled no-op while a shot is still being written, and
   * a click does not wait for that, so wait until it is enabled first (one tap).
   */
  async removeLastShot(): Promise<void> {
    await expect(this.camera.removeLast).not.toHaveAttribute('aria-disabled', 'true');
    await this.tap(this.camera.removeLast);
  }

  /** Tap the top-bar exit ("Close" / "Review (n)") and wait for the camera to go away. */
  async closeCamera(): Promise<void> {
    await this.tap(this.camera.exit);
    await this.camera.dialog.waitFor({ state: 'hidden' });
  }

  /**
   * Phone / tablet ＋ sheet (below 1024px), counted: ＋ (1), then the Log now Photo tile (1; the
   * camera opens with no further tap, shutter ready) or the "Diary entry" row (1; the capture
   * screen). The page must already be loaded (a `goto` is never counted).
   */
  async startFromPlus(mode: 'photo' | 'diaryEntry'): Promise<void> {
    const menu = new CreateMenu(this.page);
    await this.tap(menu.plusButton);
    await menu.sheetDialog.waitFor({ state: 'visible' });
    // Wait for the sheet animation as CreateMenu.open does: a moving target misses the click.
    await menu.sheet.evaluate((el) =>
      Promise.all(el.getAnimations().map((animation) => animation.finished)),
    );
    if (mode === 'photo') {
      await this.tap(menu.quickLogTile('photo'));
      await this.camera.dialog.waitFor({ state: 'visible' });
      await this.camera.waitForLive();
    } else {
      await this.tap(menu.row('diaryEntry'));
      await this.waitForForm();
    }
  }
}

class CameraControls {
  readonly dialog: Locator;
  readonly stage: Locator;
  readonly shutter: Locator;
  readonly exit: Locator;
  readonly topBar: Locator;
  readonly useCameraApp: Locator;
  readonly waiting: Locator;
  readonly lowResHint: Locator;
  readonly lowResUseApp: Locator;
  readonly lowResDismiss: Locator;
  readonly allowHint: Locator;
  readonly removeLast: Locator;
  readonly errorPanel: Locator;
  readonly errorUseApp: Locator;
  readonly errorClose: Locator;
  readonly status: Locator;
  readonly chips: Locator;

  constructor(private readonly owner: DiaryCapturePage) {
    const page = owner.page;
    this.stage = page.getByTestId('rapid-camera');
    // Located by its content, not its English name: the German run reads "Kamera".
    this.dialog = page.getByRole('dialog').filter({ has: this.stage });
    this.shutter = page.getByTestId('rapid-camera-shutter');
    this.exit = page.getByTestId('rapid-camera-review');
    this.topBar = this.exit.locator('..');
    this.useCameraApp = page.getByTestId('rapid-camera-use-app');
    this.waiting = page.getByTestId('rapid-camera-waiting');
    this.lowResHint = page.getByTestId('rapid-camera-lowres');
    this.lowResUseApp = page.getByTestId('rapid-camera-lowres-use-app');
    this.lowResDismiss = page.getByTestId('rapid-camera-lowres-dismiss');
    this.allowHint = page.getByTestId('rapid-camera-allow-hint');
    this.removeLast = page.getByTestId('rapid-camera-remove-last');
    this.errorPanel = page.getByTestId('rapid-camera-error');
    this.errorUseApp = page.getByTestId('rapid-camera-error-use-app');
    this.errorClose = page.getByTestId('rapid-camera-error-close');
    this.status = page.getByTestId('rapid-camera-status');
    this.chips = page.getByTestId('camera-tag-chips');
  }

  areaChip(name: string): Locator {
    return this.chips.getByRole('group', { name: 'Area', exact: true }).getByRole('button', {
      name,
      exact: true,
    });
  }

  orientationChip(name: string): Locator {
    return this.chips
      .getByRole('group', { name: 'Orientation', exact: true })
      .getByRole('button', { name, exact: true });
  }

  /**
   * Wait for the shutter to be enabled. Production keeps it aria-disabled until the first video
   * frame (loadeddata / playing / readyState >= 2, or a 1500 ms fallback), so enabled means a
   * press produces a shot.
   */
  async waitForLive(): Promise<void> {
    await expect(this.shutter).not.toHaveAttribute('aria-disabled', 'true');
  }

  /** Shots in the exit label ("Review (3)" or "Prüfen (3)" -> 3; "Close" or "Saving photos…" -> 0). */
  async shotCount(): Promise<number> {
    const text = ((await this.exit.textContent()) ?? '').trim();
    return Number.parseInt(/\((\d+)\)$/.exec(text)?.[1] ?? '0', 10);
  }

  async setArea(name: string): Promise<void> {
    await this.owner.tap(this.areaChip(name));
  }

  async setOrientation(name: string): Promise<void> {
    await this.owner.tap(this.orientationChip(name));
  }
}

class PhotoSheetControls {
  readonly dialog: Locator;
  readonly previous: Locator;
  readonly next: Locator;
  readonly done: Locator;
  readonly annotate: Locator;
  readonly remove: Locator;
  readonly caption: Locator;
  readonly areaInput: Locator;
  readonly orientationInput: Locator;

  constructor(private readonly owner: DiaryCapturePage) {
    const page = owner.page;
    this.dialog = page.getByRole('dialog', { name: /^Photo \d+ of \d+$/ });
    this.previous = page.getByTestId('photo-sheet-previous');
    this.next = page.getByTestId('photo-sheet-next');
    this.done = page.getByTestId('photo-sheet-done');
    this.annotate = page.getByTestId('photo-sheet-annotate');
    this.remove = page.getByTestId('photo-sheet-remove');
    this.caption = page.getByTestId('photo-sheet-caption');
    this.areaInput = this.dialog.getByLabel('Area', { exact: true });
    this.orientationInput = this.dialog.getByLabel('Orientation', { exact: true });
  }

  async open(index: number): Promise<void> {
    await this.owner.tap(this.owner.tileOpen(index));
    await this.dialog.waitFor({ state: 'visible' });
  }

  async close(): Promise<void> {
    await this.owner.tap(this.done);
    await this.dialog.waitFor({ state: 'hidden' });
  }

  /** Choose an area in the sheet's picker. */
  async setArea(name: string): Promise<void> {
    // A chosen area replaces the input with a chip: clear it first.
    const clear = this.dialog.getByRole('button', { name: 'Clear selection', exact: true });
    if ((await clear.count()) > 0) await clear.first().click();
    // Empty first: filling the text the field already holds fires no input event.
    await this.areaInput.fill('');
    await this.areaInput.fill(name);
    await this.owner.page.locator('[data-search-picker-dropdown]').waitFor({ state: 'visible' });
    // The picker is nullable: its "No area" row is always listed.
    await pickByKeyboard(this.owner.page, this.areaInput, name, /^No area/);
  }
}

class AnnotatorControls {
  readonly dialog: Locator;
  readonly save: Locator;
  readonly canvas: Locator;

  constructor(private readonly owner: DiaryCapturePage) {
    const page = owner.page;
    this.dialog = page.getByTestId('photo-annotate-dialog');
    this.save = page.getByTestId('annotator-save');
    this.canvas = this.dialog.locator('canvas').first();
  }

  /** Rectangle tool is the default: draw one across the canvas's own bounding box, then Save. */
  async draw(): Promise<void> {
    await this.canvas.waitFor({ state: 'visible' });
    await this.owner.page.getByTestId('tool-rectangle').click();
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Annotator canvas has no bounding box');
    const { page } = this.owner;
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 8 });
    await page.mouse.up();
    await this.save.click();
    await this.dialog.waitFor({ state: 'hidden' });
  }
}
