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

  // ── Metadata sidepanel toggle (mobile only) ──────────────────────────────────

  /**
   * The metadata toggle button (data-testid="photo-metadata-toggle").
   *
   * On mobile (max-width: 767px) this element is in the DOM exactly once:
   *   - Panel CLOSED: rendered outside the sidepanel as a floating launcher
   *   - Panel OPEN:   rendered inside `#photo-metadata-sidepanel .header`
   *
   * On desktop/tablet (≥768px) it has `display: none` and is NOT visible.
   *
   * The toggle carries:
   *   - `aria-expanded` = "false" | "true"
   *   - `aria-controls` = "photo-metadata-sidepanel"
   *   - `aria-label` = localised "Photo metadata" text
   */
  readonly metadataToggle: Locator;

  // ── Info bar actions (only visible when NOT annotating) ──────────────────────

  /** Pencil icon button — opens the PhotoAnnotator */
  readonly annotateButton: Locator;

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

  // ── Metadata sidepanel pickers ────────────────────────────────────────────────

  /**
   * The area picker input inside the metadata sidepanel.
   * id="photo-area" — only present as an <input> when no area is selected (SearchPicker
   * in search mode). When an area is pre-loaded (selectedDisplay state), use
   * `getAreaSelectedDisplay()` instead.
   */
  readonly areaPickerInput: Locator;

  /**
   * The orientation picker input inside the metadata sidepanel.
   * id="photo-orientation" — only present as an <input> when no orientation is selected.
   */
  readonly orientationPickerInput: Locator;

  /**
   * SearchPicker portal dropdown — portals to document.body.
   * Shared between area and orientation pickers (only one open at a time).
   */
  readonly pickerDropdown: Locator;

  // ── Metadata sidepanel caption + save ────────────────────────────────────────

  /**
   * The caption textarea inside the metadata sidepanel.
   * id="photo-caption" (from PhotoMetadataSidepanel.tsx).
   * Always present in the sidepanel (not conditional on selection state).
   */
  readonly captionField: Locator;

  /**
   * The Save button in the metadata sidepanel.
   * data-testid="photo-metadata-save" — only rendered when `hasChanges` is true
   * (i.e., caption/area/orientation differs from the current photo values).
   */
  readonly saveMetadataButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Viewer root
    this.modal = page.getByTestId('photo-viewer');
    this.closeButton = page.getByTestId('photo-viewer-close');

    // Navigation buttons (only rendered with multiple photos, outside annotation mode)
    this.prevButton = page.getByTestId('photo-viewer-prev');
    this.nextButton = page.getByTestId('photo-viewer-next');

    // Sidepanel picker inputs
    this.areaPickerInput = page.locator('#photo-area');
    this.orientationPickerInput = page.locator('#photo-orientation');
    this.pickerDropdown = page.locator('[data-search-picker-dropdown]');

    // Sidepanel caption and save
    this.captionField = page.locator('#photo-caption');
    this.saveMetadataButton = page.getByTestId('photo-metadata-save');

    // Metadata toggle (one element in DOM at a time — floats when closed, in header when open)
    this.metadataToggle = page.getByTestId('photo-metadata-toggle');

    // The viewer shows an <img> for the photo when NOT annotating.
    // The PhotoAnnotator also has an <img> (base image) inside the SVG area when annotating.
    // We scope to the viewer container and pick the first <img> to avoid ambiguity.
    this.photoImage = this.modal.locator('img').first();

    // Info bar
    this.annotateButton = page.getByTestId('photo-viewer-annotate');
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

  // ── Metadata sidepanel picker helpers ────────────────────────────────────────

  /**
   * Open the sidepanel on mobile viewports (viewportWidth ≤ 767px) if not already open.
   * On desktop/tablet the sidepanel is always visible; this is a no-op.
   */
  async openSidepanelIfMobile(): Promise<void> {
    const toggle = this.metadataToggle;
    // Only visible on mobile (display:none on ≥768px). Use `isVisible()` not `isAttached()`.
    const toggleVisible = await toggle.isVisible();
    if (toggleVisible) {
      const expanded = await toggle.getAttribute('aria-expanded');
      if (expanded !== 'true') {
        await toggle.click();
        const { expect } = await import('@playwright/test');
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      }
    }
  }

  /**
   * Open the area picker dropdown in the sidepanel.
   * Handles both fresh open (click input) and `showItemsOnFocus` (input focuses and
   * shows all items immediately).
   */
  async openAreaPicker(): Promise<void> {
    await this.areaPickerInput.click();
    const { expect } = await import('@playwright/test');
    await expect(this.pickerDropdown).toBeVisible();
  }

  /**
   * Open the orientation picker dropdown in the sidepanel.
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
   * and the SearchPicker switches to selectedDisplay mode).
   * The chip shows the bare area name without em-dash prefix.
   *
   * Scoped using the `label[for="photo-area"]` anchor, which is stable across CSS changes.
   */
  async getAreaSelectedDisplayText(): Promise<string | null> {
    const sidepanel = this.page.locator('#photo-metadata-sidepanel');
    // The section div contains `label[for="photo-area"]` — scope to it via XPath nearest ancestor
    // Strategy: find the `label[for="photo-area"]` then get its parent .section div,
    // then find the selectedDisplay inside it. We use XPath `..` to walk up one level.
    const areaLabel = sidepanel.locator('label[for="photo-area"]');
    // Section is the parent of the label (one div up)
    const areaSection = areaLabel.locator('xpath=..').locator('[class*="areaPicker"]');
    const selectedDisplay = areaSection.locator('[class*="selectedDisplay"]').first();
    return (await selectedDisplay.textContent())?.trim() ?? null;
  }

  /**
   * Return the selected display chip text for the orientation picker.
   */
  async getOrientationSelectedDisplayText(): Promise<string | null> {
    const sidepanel = this.page.locator('#photo-metadata-sidepanel');
    const orientLabel = sidepanel.locator('label[for="photo-orientation"]');
    const orientSection = orientLabel.locator('xpath=..').locator('[class*="areaPicker"]');
    const selectedDisplay = orientSection.locator('[class*="selectedDisplay"]').first();
    return (await selectedDisplay.textContent())?.trim() ?? null;
  }

  /**
   * Click the Save button in the sidepanel and wait for a successful PATCH response.
   * Returns after the save completes.
   *
   * @param photoId - The photo ID used to match the PATCH response URL.
   */
  async saveSidepanel(photoId: string): Promise<void> {
    const sidepanel = this.page.locator('#photo-metadata-sidepanel');
    const saveButton = sidepanel.getByRole('button', { name: 'Save', exact: true });
    const patchDone = this.page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/photos/${photoId}`) &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
    );
    await saveButton.click();
    await patchDone;
  }

  /**
   * Fill the caption field with the given text and save via the sidepanel Save button.
   *
   * Registers a `waitForResponse` for the PATCH to `/api/photos/:id` BEFORE clicking
   * save (per the project pattern — register before the triggering action). Returns
   * after the PATCH 200 response is received, ensuring the updated photo is propagated
   * back into the parent's photos array before the caller asserts navigation behaviour.
   *
   * NOTE: The Save button (`data-testid="photo-metadata-save"`) is only rendered when
   * the sidepanel detects `hasChanges`. It appears as soon as the caption value differs
   * from the current photo's caption. Wait for it to be visible before clicking.
   *
   * @param caption  — the caption text to fill
   * @param photoId  — the photo ID used to match the PATCH response URL
   */
  async saveCaption(caption: string, photoId: string): Promise<void> {
    await this.openSidepanelIfMobile();
    await this.captionField.fill(caption);
    // Register the waiter BEFORE clicking to avoid missing fast responses.
    const patchDone = this.page.waitForResponse(
      (resp) =>
        resp.url().endsWith(`/api/photos/${photoId}`) &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
    );
    const { expect } = await import('@playwright/test');
    await expect(this.saveMetadataButton).toBeVisible();
    await this.saveMetadataButton.click();
    await patchDone;
  }
}
