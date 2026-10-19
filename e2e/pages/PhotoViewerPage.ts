/**
 * Page Object Model for the PhotoViewer modal and the embedded PhotoAnnotator.
 *
 * The PhotoViewer is rendered as a portal directly into `document.body` (via
 * `createPortal`), so all locators use `page.*` scope (not scoped to a parent).
 *
 * Key data-testid attributes (from PhotoViewer.tsx and ToolPalette.tsx):
 *
 * PhotoViewer chrome:
 *   - photo-viewer          — outermost div wrapper
 *   - photo-viewer-close    — close button (×)
 *   - photo-viewer-prev     — "previous" navigation (only when multiple photos)
 *   - photo-viewer-next     — "next" navigation (only when multiple photos)
 *
 * PhotoViewer info bar (visible only when NOT annotating):
 *   - photo-viewer-annotate          — pencil icon button; opens annotator
 *   - photo-viewer-view-original     — eye toggle; only rendered when annotatedAt is set
 *   - photo-viewer-clear-annotations — trash icon; only rendered when annotatedAt is set
 *
 * PhotoAnnotator toolbar (ToolPalette):
 *   - tool-select      — Select tool button (aria-pressed)
 *   - tool-rectangle   — Rectangle tool button (aria-pressed)
 *   - tool-highlight   — Highlight tool button (aria-pressed)
 *   - tool-arrow       — Arrow tool button (aria-pressed)
 *   - tool-line        — Line tool button (aria-pressed)
 *   - tool-ellipse     — Ellipse tool button (aria-pressed)
 *   - tool-text        — Text tool button (aria-pressed)
 *   - tool-callout     — Callout tool button (aria-pressed)
 *   - tool-measurement — Measurement tool button (aria-pressed)
 *   - tool-freehand    — Freehand tool button (aria-pressed)
 *   - annotator-undo   — Undo button
 *   - annotator-redo   — Redo button
 *
 * PhotoAnnotator inline text input:
 *   - annotator-inline-input — floating text <input> for Text/Callout/Measurement
 *
 * PhotoAnnotator action bar:
 *   - annotator-save   — Save button
 *   - annotator-cancel — Cancel button
 *
 * Shape state (Konva canvas — NOT SVG DOM nodes):
 *   All committed shapes are exposed as JSON on the [role="application"] container via
 *   `data-annotator-shapes`. Read via `getAnnotatorShapes()`. Shape types mirror the
 *   AnnotationShape union from useUndoStack.ts:
 *     rectangle, highlight, arrow, line, ellipse, text, measurement, freehand
 */

import type { Page, Locator } from '@playwright/test';

// ── Annotator shape types (mirror of client/src/.../useUndoStack.ts) ─────────
// SOURCE: client/src/components/photos/PhotoAnnotator/useUndoStack.ts — keep in sync
// Local copies so e2e/ does not import from client/ source.

export interface RectangleShape {
  type: 'rectangle';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  strokeWidth: number;
}

export interface HighlightShape {
  type: 'highlight';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface ArrowShape {
  type: 'arrow';
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

export interface LineShape {
  type: 'line';
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

export interface EllipseShape {
  type: 'ellipse';
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  stroke: string;
  strokeWidth: number;
}

export interface TextShape {
  type: 'text';
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
}

export interface MeasurementShape {
  type: 'measurement';
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
  color: string;
}

export interface FreehandShape {
  type: 'freehand';
  id: string;
  points: [number, number][];
  stroke: string;
  strokeWidth: number;
}

export type AnnotationShape =
  | RectangleShape
  | HighlightShape
  | ArrowShape
  | LineShape
  | EllipseShape
  | TextShape
  | MeasurementShape
  | FreehandShape;

export type AnnotatorToolName =
  | 'select'
  | 'rectangle'
  | 'highlight'
  | 'arrow'
  | 'line'
  | 'ellipse'
  | 'text'
  | 'measurement'
  | 'freehand';

export class PhotoViewerPage {
  readonly page: Page;

  // ── Viewer chrome ────────────────────────────────────────────────────────────

  /** Root container div of the PhotoViewer portal */
  readonly modal: Locator;

  /** Close button (×) — hidden while annotating */
  readonly closeButton: Locator;

  /**
   * The displayed image inside the viewer (NOT the annotator's base image).
   * Only rendered when NOT in annotation mode.
   */
  readonly photoImage: Locator;

  /**
   * "Previous" navigation button — only rendered when there are multiple photos and
   * the viewer is NOT in annotation mode.
   */
  readonly prevButton: Locator;

  /**
   * "Next" navigation button — only rendered when there are multiple photos and
   * the viewer is NOT in annotation mode.
   */
  readonly nextButton: Locator;

  // ── Photo details panel (PhotoDetailsPanel, #2226) ───────────────────────────

  /**
   * The "Details" text button in the info bar (data-testid="photo-viewer-details").
   * Only rendered below 768px, where it opens the details bottom sheet. Absent from the DOM on
   * desktop/tablet, where the panel is a side column.
   */
  readonly detailsButton: Locator;

  /**
   * The details panel (the `<aside>`, data-testid="photo-details"): side column from 768px,
   * the content of the bottom sheet below. On phones it is only in the DOM while the sheet is
   * open.
   */
  readonly detailsPanel: Locator;

  /** The "Edit tags" button (data-testid="photo-details-edit-tags"). */
  readonly editTagsButton: Locator;

  /** The edit form (Area, Orientation, Caption, Save tags, Cancel). */
  readonly detailsForm: Locator;

  /** The "Tags saved" status line shown in read mode after a save. */
  readonly tagsSavedNote: Locator;

  /** Read-mode caption value (data-testid="photo-details-caption-value"). */
  readonly captionValue: Locator;

  // ── Info bar actions (only visible when NOT annotating) ──────────────────────

  /**
   * "Annotate" button (pencil + visible text since #2225) - opens the PhotoAnnotator. Disabled
   * means `aria-disabled="true"` (not the `disabled` attribute): the click does nothing.
   */
  readonly annotateButton: Locator;

  /** The visible reason shown in the info bar while Annotate is disabled (aria-describedby). */
  readonly annotateReason: Locator;

  /**
   * Eye icon toggle — only rendered when `currentPhoto.annotatedAt` is set.
   * aria-pressed="false" → showing annotated; aria-pressed="true" → showing original.
   */
  readonly viewOriginalButton: Locator;

  /**
   * Trash icon button — only rendered when `currentPhoto.annotatedAt` is set.
   * Clicking opens the clear-confirmation Modal.
   */
  readonly clearAnnotationsButton: Locator;

  // ── PhotoAnnotator toolbar (ToolPalette) ─────────────────────────────────────

  /**
   * The toolbar container (role="toolbar", aria-label matching "annotation tools").
   * Visible only while in annotation mode.
   */
  readonly toolPalette: Locator;

  /** Select tool button (aria-pressed=true when active) */
  readonly selectToolButton: Locator;

  /** Rectangle tool button */
  readonly rectangleToolButton: Locator;

  /** Highlight tool button */
  readonly highlightToolButton: Locator;

  /** Arrow tool button */
  readonly arrowToolButton: Locator;

  /** Line tool button */
  readonly lineToolButton: Locator;

  /** Ellipse tool button */
  readonly ellipseToolButton: Locator;

  /** Text tool button */
  readonly textToolButton: Locator;

  /** Measurement tool button */
  readonly measurementToolButton: Locator;

  /** Freehand tool button */
  readonly freehandToolButton: Locator;

  // ── PhotoAnnotator drawing surface ───────────────────────────────────────────

  /**
   * The [role="application"] container div — used to read `data-annotator-shapes`.
   * NOTE: This is the outer flex container. For mouse interaction coordinates,
   * use `getKonvaStageBox()` which returns the Konva canvas bounding box.
   */
  readonly svgOverlay: Locator;

  /**
   * The first Konva canvas element inside the annotator.
   * Mouse events must target this element (or use its bounding box) so that
   * Konva's `getPointerPosition()` maps viewport coordinates to stage-space
   * coordinates correctly. The [role="application"] container is a flex-centered
   * wrapper that may be much larger than the canvas when the photo is small.
   */
  readonly konvaCanvas: Locator;

  // ── PhotoAnnotator inline text input ────────────────────────────────────────

  /**
   * Floating <input type="text"> for Text/Callout/Measurement label entry.
   * Only rendered when an inline text input is open.
   */
  readonly inlineInput: Locator;

  // ── PhotoAnnotator action bar ────────────────────────────────────────────────

  /** Save button — triggers bake + PUT /api/photos/:id/annotation */
  readonly saveButton: Locator;

  /** Cancel button — discards and returns to view mode */
  readonly cancelButton: Locator;

  /** Undo button */
  readonly undoButton: Locator;

  /** Redo button */
  readonly redoButton: Locator;

  // ── Details panel editor fields ───────────────────────────────────────────────

  /**
   * The area picker input in the editor (label "Area"). Only an <input> while no area is
   * selected; with an area selected the SearchPicker shows a chip instead
   * (`getAreaSelectedDisplayText()`).
   */
  readonly areaPickerInput: Locator;

  /** The orientation picker input in the editor (label "Orientation"); same chip rule. */
  readonly orientationPickerInput: Locator;

  /**
   * SearchPicker portal dropdown — portals to document.body.
   * Shared between area and orientation pickers (only one open at a time).
   */
  readonly pickerDropdown: Locator;

  /** The caption textarea in the editor (data-testid="photo-details-caption"). */
  readonly captionField: Locator;

  /** The "Save tags" button in the editor. */
  readonly saveTagsButton: Locator;

  /** The editor's Cancel button. */
  readonly cancelTagsButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Viewer root
    this.modal = page.getByTestId('photo-viewer');
    this.closeButton = page.getByTestId('photo-viewer-close');

    // Navigation buttons (only rendered with multiple photos, outside annotation mode)
    this.prevButton = page.getByTestId('photo-viewer-prev');
    this.nextButton = page.getByTestId('photo-viewer-next');

    // Details panel (side column, or inside the phone sheet)
    this.detailsButton = page.getByTestId('photo-viewer-details');
    this.detailsPanel = page.getByTestId('photo-details');
    this.editTagsButton = page.getByTestId('photo-details-edit-tags');
    this.detailsForm = page.getByTestId('photo-details-form');
    this.tagsSavedNote = page.getByTestId('photo-details-saved');
    this.captionValue = page.getByTestId('photo-details-caption-value');

    // Editor fields
    this.areaPickerInput = this.detailsForm.getByLabel('Area', { exact: true });
    this.orientationPickerInput = this.detailsForm.getByLabel('Orientation', { exact: true });
    this.pickerDropdown = page.locator('[data-search-picker-dropdown]');
    this.captionField = page.getByTestId('photo-details-caption');
    this.saveTagsButton = page.getByTestId('photo-details-save-tags');
    this.cancelTagsButton = page.getByTestId('photo-details-cancel');

    // The viewer shows an <img> for the photo when NOT annotating.
    // The PhotoAnnotator also has an <img> (base image) inside the SVG area when annotating.
    // We scope to the viewer container and pick the first <img> to avoid ambiguity.
    this.photoImage = this.modal.locator('img').first();

    // Info bar
    this.annotateButton = page.getByTestId('photo-viewer-annotate');
    this.annotateReason = this.modal.locator('[class*="annotateReason"]');
    this.viewOriginalButton = page.getByTestId('photo-viewer-view-original');
    this.clearAnnotationsButton = page.getByTestId('photo-viewer-clear-annotations');

    // ToolPalette — the toolbar role is "toolbar" with translated aria-label.
    // Match by role to avoid relying on translation key exactness.
    this.toolPalette = page.getByRole('toolbar');

    // Tool buttons
    this.selectToolButton = page.getByTestId('tool-select');
    this.rectangleToolButton = page.getByTestId('tool-rectangle');
    this.highlightToolButton = page.getByTestId('tool-highlight');
    this.arrowToolButton = page.getByTestId('tool-arrow');
    this.lineToolButton = page.getByTestId('tool-line');
    this.ellipseToolButton = page.getByTestId('tool-ellipse');
    this.textToolButton = page.getByTestId('tool-text');
    this.measurementToolButton = page.getByTestId('tool-measurement');
    this.freehandToolButton = page.getByTestId('tool-freehand');

    // Annotator container (role="application") — used for data-annotator-shapes reads
    this.svgOverlay = page.locator('[role="application"]');

    // Konva canvas element — used for mouse coordinate calculations.
    // The [role="application"] is a flex-centered container; the actual Konva Stage
    // canvas is a child element with the exact stage dimensions. All drawing helpers
    // use this element's bounding box so Konva's getPointerPosition() maps correctly.
    this.konvaCanvas = this.svgOverlay.locator('canvas').first();

    // Inline text input for Text/Callout/Measurement
    this.inlineInput = page.getByTestId('annotator-inline-input');

    // Annotator action bar
    this.saveButton = page.getByTestId('annotator-save');
    this.cancelButton = page.getByTestId('annotator-cancel');
    this.undoButton = page.getByTestId('annotator-undo');
    this.redoButton = page.getByTestId('annotator-redo');
  }

  // ── Helper methods ───────────────────────────────────────────────────────────

  /**
   * Returns the bounding box of the Konva canvas element (stage coordinates origin).
   *
   * IMPORTANT: Always use this instead of `svgOverlay.boundingBox()` for mouse
   * interaction coordinates. The [role="application"] div is a flex-centered
   * container that may be much larger than the actual Konva canvas (e.g. when the
   * photo is 100×100 but the viewer is 800×600). Konva's `getPointerPosition()`
   * computes stage-space coordinates as `(clientX - stageContainer.left, clientY - stageContainer.top)`,
   * so mouse events must land within the canvas bounds to register correctly.
   */
  async getKonvaStageBox(): Promise<{ x: number; y: number; width: number; height: number }> {
    const box = await this.konvaCanvas.boundingBox();
    if (!box) throw new Error('Konva canvas not visible');
    return box;
  }

  /**
   * Activate a named annotation tool by clicking its button.
   * Waits for the button to reflect aria-pressed="true" before returning.
   */
  async activateTool(toolName: AnnotatorToolName): Promise<void> {
    const toolButtonMap: Record<AnnotatorToolName, Locator> = {
      select: this.selectToolButton,
      rectangle: this.rectangleToolButton,
      highlight: this.highlightToolButton,
      arrow: this.arrowToolButton,
      line: this.lineToolButton,
      ellipse: this.ellipseToolButton,
      text: this.textToolButton,
      measurement: this.measurementToolButton,
      freehand: this.freehandToolButton,
    };
    const button = toolButtonMap[toolName];
    await button.click();
    await button.and(this.page.locator('[aria-pressed="true"]')).waitFor({ state: 'visible' });
  }

  /**
   * Draw a rectangle on the Konva canvas by simulating pointer events.
   * Coordinates are percentages of the Konva canvas bounding box (0–1).
   */
  async drawRectangle(
    startXPct = 0.2,
    startYPct = 0.2,
    endXPct = 0.6,
    endYPct = 0.6,
  ): Promise<void> {
    const box = await this.getKonvaStageBox();

    const startX = box.x + box.width * startXPct;
    const startY = box.y + box.height * startYPct;
    const endX = box.x + box.width * endXPct;
    const endY = box.y + box.height * endYPct;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, endY, { steps: 5 });
    await this.page.mouse.up();
  }

  /**
   * Draw a line from (startXPct, startYPct) to (endXPct, endYPct) using pointer events.
   *
   * IMPORTANT: The Konva annotator commits the shape only if both:
   *   abs(endX - startX) > MIN_SIZE AND abs(endY - startY) > MIN_SIZE (both in stage px).
   * For a 100×100 canvas, MIN_SIZE = 5 — so both axes must differ by > 5px.
   * Always use a diagonal drag (both X and Y differ) to ensure the shape commits.
   * Default params produce a 45° diagonal on the left half of the canvas.
   */
  async drawLine(startXPct = 0.2, startYPct = 0.2, endXPct = 0.7, endYPct = 0.7): Promise<void> {
    const box = await this.getKonvaStageBox();

    const startX = box.x + box.width * startXPct;
    const startY = box.y + box.height * startYPct;
    const endX = box.x + box.width * endXPct;
    const endY = box.y + box.height * endYPct;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, endY, { steps: 5 });
    await this.page.mouse.up();
  }

  /**
   * Draw an ellipse by dragging from (startXPct, startYPct) to (endXPct, endYPct).
   *
   * IMPORTANT: The Konva annotator commits the shape only if both:
   *   abs(endX - startX) > MIN_SIZE AND abs(endY - startY) > MIN_SIZE (both in stage px).
   * For a 100×100 canvas, MIN_SIZE = 5 — so both axes must differ by > 5px.
   * Default params produce an ellipse spanning 40% of each axis.
   */
  async drawEllipse(startXPct = 0.2, startYPct = 0.2, endXPct = 0.6, endYPct = 0.6): Promise<void> {
    const box = await this.getKonvaStageBox();

    const startX = box.x + box.width * startXPct;
    const startY = box.y + box.height * startYPct;
    const endX = box.x + box.width * endXPct;
    const endY = box.y + box.height * endYPct;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, endY, { steps: 5 });
    await this.page.mouse.up();
  }

  /**
   * Place a Text shape: click at the given position, then type text and press Enter.
   * Returns after the inline input is committed and the text shape appears.
   */
  async placeText(xPct = 0.3, yPct = 0.3, text = 'Hello'): Promise<void> {
    const box = await this.getKonvaStageBox();

    const clickX = box.x + box.width * xPct;
    const clickY = box.y + box.height * yPct;

    await this.page.mouse.click(clickX, clickY);
    // Inline input should open
    await this.inlineInput.waitFor({ state: 'visible' });
    await this.inlineInput.fill(text);
    await this.page.keyboard.press('Enter');
    await this.inlineInput.waitFor({ state: 'hidden' });
  }

  /**
   * Discard a Text placement by pressing Escape (when inline input is open).
   */
  async discardTextInput(): Promise<void> {
    await this.inlineInput.waitFor({ state: 'visible' });
    await this.page.keyboard.press('Escape');
    await this.inlineInput.waitFor({ state: 'hidden' });
  }

  /**
   * Draw a measurement line, type a label, and press Enter to commit.
   * Optionally pass empty string to test empty-label commit.
   */
  async drawMeasurement(
    startXPct = 0.2,
    startYPct = 0.5,
    endXPct = 0.7,
    endYPct = 0.5,
    label = '5m',
  ): Promise<void> {
    const box = await this.getKonvaStageBox();

    const startX = box.x + box.width * startXPct;
    const startY = box.y + box.height * startYPct;
    const endX = box.x + box.width * endXPct;
    const endY = box.y + box.height * endYPct;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, endY, { steps: 5 });
    await this.page.mouse.up();

    // Inline input appears at midpoint
    await this.inlineInput.waitFor({ state: 'visible' });
    if (label !== '') {
      await this.inlineInput.fill(label);
    }
    await this.page.keyboard.press('Enter');
    await this.inlineInput.waitFor({ state: 'hidden' });
  }

  /**
   * Draw a freehand stroke using pointer events (drag path).
   */
  async drawFreehand(
    startXPct = 0.1,
    startYPct = 0.5,
    waypoints: Array<[number, number]> = [
      [0.3, 0.3],
      [0.5, 0.5],
      [0.7, 0.3],
    ],
  ): Promise<void> {
    const box = await this.getKonvaStageBox();

    const startX = box.x + box.width * startXPct;
    const startY = box.y + box.height * startYPct;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();

    for (const [xPct, yPct] of waypoints) {
      await this.page.mouse.move(box.x + box.width * xPct, box.y + box.height * yPct, {
        steps: 3,
      });
    }

    await this.page.mouse.up();
  }

  /**
   * Draw a freehand stroke on all viewports using Playwright mouse events.
   *
   * Previously this method dispatched synthetic PointerEvents to the SVG overlay,
   * which was a workaround for the old SVG-based annotator where page.mouse.* did
   * not reliably fire on WebKit/hasTouch. The Konva-based annotator uses
   * onMouseDown/Move/Up on the Konva Stage, which Playwright's page.mouse.* fires
   * correctly on all viewports and browsers. The synthetic PointerEvent approach
   * is not needed and is incorrect for Konva (Konva registers mouse listeners on
   * the canvas container div, not the outer [role="application"] parent).
   *
   * Coordinates are percentages of the Konva canvas bounding box (0–1). Each
   * segment is subdivided into 3 steps to give FreehandTool enough intermediate
   * points for simplifyPolyline to retain ≥ 2 points after RDP.
   */
  async drawFreehandTouch(
    startXPct = 0.1,
    startYPct = 0.5,
    waypoints: Array<[number, number]> = [
      [0.3, 0.3],
      [0.5, 0.5],
      [0.7, 0.3],
    ],
  ): Promise<void> {
    const box = await this.getKonvaStageBox();

    const startX = box.x + box.width * startXPct;
    const startY = box.y + box.height * startYPct;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();

    for (const [xPct, yPct] of waypoints) {
      await this.page.mouse.move(box.x + box.width * xPct, box.y + box.height * yPct, {
        steps: 3,
      });
    }

    await this.page.mouse.up();
  }

  /**
   * Draw a line (or measurement) drag on all viewports using Playwright mouse events.
   *
   * Previously this method dispatched synthetic PointerEvents to work around React
   * state batching on the SVG-based annotator. The Konva-based annotator uses
   * onMouseDown/Move/Up on the Konva Stage (not React pointer handlers), which
   * Playwright's page.mouse.* fires correctly on all viewports. Using steps: 5 in
   * the intermediate move ensures the tool's onMouseMove fires multiple times before
   * mouseup, giving Konva's draftShape update time to propagate.
   *
   * Coordinates are percentages of the Konva canvas bounding box (0–1).
   */
  async drawLineTouch(
    startXPct = 0.15,
    startYPct = 0.5,
    endXPct = 0.75,
    endYPct = 0.5,
  ): Promise<void> {
    const box = await this.getKonvaStageBox();

    const startX = box.x + box.width * startXPct;
    const startY = box.y + box.height * startYPct;
    const endX = box.x + box.width * endXPct;
    const endY = box.y + box.height * endYPct;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, endY, { steps: 5 });
    await this.page.mouse.up();
  }

  /**
   * Save the current annotation. Returns after the PUT response completes.
   * The annotator closes on success.
   */
  async saveAnnotation(): Promise<void> {
    await this.saveButton.click();
    // Wait for the tool palette to disappear (annotator closed)
    await this.toolPalette.waitFor({ state: 'hidden' });
  }

  /**
   * Enter a text label into the inline input and commit with Enter.
   */
  async enterTextLabel(text: string): Promise<void> {
    await this.inlineInput.waitFor({ state: 'visible' });
    await this.inlineInput.fill(text);
    await this.page.keyboard.press('Enter');
    await this.inlineInput.waitFor({ state: 'hidden' });
  }

  /**
   * Returns the current committed shapes from the annotator's state model.
   *
   * Reads the `data-annotator-shapes` JSON attribute from the [role="application"]
   * canvas container. Updated reactively by PhotoAnnotator.tsx whenever
   * `undoStack.shapes` changes (after every commit/undo/redo/clear).
   *
   * Returns an empty array if the annotator is not open or no shapes committed.
   *
   * @example
   * await expect.poll(async () => {
   *   const shapes = await viewer.getAnnotatorShapes();
   *   return shapes.some(s => s.type === 'rectangle');
   * }, { timeout: 15_000 }).toBe(true);
   */
  async getAnnotatorShapes(): Promise<AnnotationShape[]> {
    const attr = await this.svgOverlay.getAttribute('data-annotator-shapes');
    if (!attr) return [];
    return JSON.parse(attr) as AnnotationShape[];
  }

  // ── Details panel helpers ────────────────────────────────────────────────────

  /**
   * Make the details panel visible: on phones (< 768px) open the Details sheet if it is not
   * open; on desktop/tablet the side column is always shown, so this only waits for it.
   */
  async openDetails(): Promise<void> {
    const { expect } = await import('@playwright/test');
    await expect(this.modal).toBeVisible();
    const phone = (this.page.viewportSize()?.width ?? 1280) < 768;
    if (phone && !(await this.detailsPanel.isVisible())) {
      await this.detailsButton.click();
    }
    await expect(this.detailsPanel).toBeVisible();
  }

  /** Phones only: close the Details sheet so the viewer behind it is reachable again. */
  async closeDetailsIfPhone(): Promise<void> {
    const { expect } = await import('@playwright/test');
    const phone = (this.page.viewportSize()?.width ?? 1280) < 768;
    if (phone && (await this.detailsPanel.isVisible())) {
      // The sheet's Close button, not Escape: Escape in the sheet also closes the viewer (defect)
      await this.page
        .getByTestId('photo-viewer-details-sheet')
        .getByRole('button', { name: 'Close dialog' })
        .click();
      await expect(this.detailsPanel).toHaveCount(0);
    }
  }

  /** Open the details panel and enter the tag editor (Edit tags) unless it is already open. */
  async openTagsEditor(): Promise<void> {
    const { expect } = await import('@playwright/test');
    await this.openDetails();
    if (!(await this.detailsForm.isVisible())) {
      await this.editTagsButton.click();
    }
    await expect(this.detailsForm).toBeVisible();
  }

  /**
   * Pick an option in a picker field of the open editor. A picker holding a value shows a chip
   * with "Clear selection" instead of an input, so clear it first when the input is missing.
   */
  async pickInEditor(label: 'Area' | 'Orientation', optionText: string | RegExp): Promise<void> {
    const field = this.detailsForm
      .locator('label', { hasText: new RegExp(`^${label}$`) })
      .locator('xpath=..');
    const input = field.locator('input');
    if ((await input.count()) === 0) {
      await field.getByRole('button', { name: 'Clear selection' }).click();
    }
    await input.click();
    await this.pickerDropdown.getByRole('option', { name: optionText }).first().click();
  }

  /**
   * Open the area picker dropdown in the editor.
   * Handles both fresh open (click input) and `showItemsOnFocus` (input focuses and
   * shows all items immediately).
   */
  async openAreaPicker(): Promise<void> {
    await this.areaPickerInput.click();
    const { expect } = await import('@playwright/test');
    await expect(this.pickerDropdown).toBeVisible();
  }

  /**
   * Open the orientation picker dropdown in the editor.
   */
  async openOrientationPicker(): Promise<void> {
    await this.orientationPickerInput.click();
    const { expect } = await import('@playwright/test');
    await expect(this.pickerDropdown).toBeVisible();
  }

  /**
   * Search for text in the currently-open area picker input.
   * Assumes the input is already focused/visible.
   *
   * Waits 400ms after filling to let SearchPicker's 300ms debounce fire and the
   * results re-render settle before returning. Without this wait, callers that
   * immediately invoke `getDropdownOptions()` read stale results, causing
   * intermittent failures on shards 3/6/11/15 under CI load.
   */
  async searchAreaPicker(query: string): Promise<void> {
    await this.areaPickerInput.fill(query);
    await this.page.waitForTimeout(400);
  }

  /**
   * Clear the area picker search (empty the input to restore full tree).
   *
   * Clearing to '' also triggers the 300ms debounce — wait 400ms so the full
   * tree re-renders before callers read `getDropdownOptions()`.
   */
  async clearAreaPickerSearch(): Promise<void> {
    await this.areaPickerInput.fill('');
    await this.page.waitForTimeout(400);
  }

  /**
   * Search for text in the orientation picker input.
   *
   * The orientation picker uses the same SearchPicker debounce (300ms) followed
   * by a server-side fetch. Wait 400ms to let the debounce fire and the
   * re-render settle before returning.
   */
  async searchOrientationPicker(query: string): Promise<void> {
    await this.orientationPickerInput.fill(query);
    await this.page.waitForTimeout(400);
  }

  /**
   * Read all visible dropdown option rows from the currently-open picker dropdown.
   *
   * Returns an array of `{ label: string, secondary: string | null }` objects.
   * `label` is the primary option text (`.resultTitle` span content).
   * `secondary` is the secondary line text (`.resultSecondary` span, or null if absent).
   *
   * NOTE: Only reads regular (non-special) options rendered as `role="option"`.
   */
  async getDropdownOptions(): Promise<Array<{ label: string; secondary: string | null }>> {
    const dropdown = this.pickerDropdown;
    const options = dropdown.locator('[role="option"]');
    const count = await options.count();
    const results: Array<{ label: string; secondary: string | null }> = [];
    for (let i = 0; i < count; i++) {
      const option = options.nth(i);
      const titleSpan = option.locator('[class*="resultTitle"]');
      const secondarySpan = option.locator('[class*="resultSecondary"]');
      const label = (await titleSpan.textContent())?.trim() ?? '';
      const secondaryText =
        (await secondarySpan.count()) > 0
          ? ((await secondarySpan.first().textContent())?.trim() ?? null)
          : null;
      results.push({ label, secondary: secondaryText || null });
    }
    return results;
  }

  /**
   * Select a dropdown option by its primary label text (exact substring match).
   * Clicks the matching `role="option"` element.
   */
  async selectDropdownOption(labelSubstring: string): Promise<void> {
    const option = this.pickerDropdown
      .locator('[role="option"]')
      .filter({
        hasText: labelSubstring,
      })
      .first();
    await option.click();
  }

  /**
   * Return the selected display chip text for the area picker (when an area is selected
   * and the SearchPicker switches to selectedDisplay mode). The chip shows the bare area name
   * without em-dash prefix.
   */
  async getAreaSelectedDisplayText(): Promise<string | null> {
    const section = this.detailsForm.locator('label', { hasText: /^Area$/ }).locator('xpath=..');
    const selectedDisplay = section.locator('[class*="selectedDisplay"]').first();
    return (await selectedDisplay.textContent())?.trim() ?? null;
  }

  /** Return the selected display chip text for the orientation picker. */
  async getOrientationSelectedDisplayText(): Promise<string | null> {
    const section = this.detailsForm
      .locator('label', { hasText: /^Orientation$/ })
      .locator('xpath=..');
    const selectedDisplay = section.locator('[class*="selectedDisplay"]').first();
    return (await selectedDisplay.textContent())?.trim() ?? null;
  }

  /**
   * Click "Save tags" and wait for a successful PATCH response (registered before the click).
   * The panel returns to read mode afterwards.
   */
  async saveTags(photoId: string): Promise<void> {
    const patchDone = this.page.waitForResponse(
      (resp) =>
        resp.url().endsWith(`/api/photos/${photoId}`) &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
    );
    await this.saveTagsButton.click();
    await patchDone;
  }

  /**
   * Open the editor, fill the caption and save it via "Save tags". Returns after the PATCH 200
   * response, so the updated photo has propagated into the parent's photos array.
   */
  async saveCaption(caption: string, photoId: string): Promise<void> {
    await this.openTagsEditor();
    await this.captionField.fill(caption);
    await this.saveTags(photoId);
  }
}
