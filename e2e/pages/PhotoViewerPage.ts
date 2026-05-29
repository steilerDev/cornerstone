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
   * SVG overlay on which pointer events are dispatched to draw shapes.
   * role="application", aria-label matching i18n key "canvas".
   * Shapes appear as children of this element.
   */
  readonly svgOverlay: Locator;

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

  constructor(page: Page) {
    this.page = page;

    // Viewer root
    this.modal = page.getByTestId('photo-viewer');
    this.closeButton = page.getByTestId('photo-viewer-close');

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

    // SVG canvas — role="application" inside the annotator canvas area
    this.svgOverlay = page.locator('[role="application"]');

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
   * Draw a rectangle on the SVG overlay by simulating pointer events.
   * Coordinates are percentages of the SVG bounding box (0–1).
   */
  async drawRectangle(
    startXPct = 0.2,
    startYPct = 0.2,
    endXPct = 0.6,
    endYPct = 0.6,
  ): Promise<void> {
    const svgBox = await this.svgOverlay.boundingBox();
    if (!svgBox) throw new Error('SVG overlay not visible');

    const startX = svgBox.x + svgBox.width * startXPct;
    const startY = svgBox.y + svgBox.height * startYPct;
    const endX = svgBox.x + svgBox.width * endXPct;
    const endY = svgBox.y + svgBox.height * endYPct;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, endY, { steps: 5 });
    await this.page.mouse.up();
  }

  /**
   * Draw a line from (startXPct, startYPct) to (endXPct, endYPct) using pointer events.
   * Optionally hold Shift for angle-snap (45° increments).
   */
  async drawLine(
    startXPct = 0.2,
    startYPct = 0.5,
    endXPct = 0.7,
    endYPct = 0.5,
    shiftSnap = false,
  ): Promise<void> {
    const svgBox = await this.svgOverlay.boundingBox();
    if (!svgBox) throw new Error('SVG overlay not visible');

    const startX = svgBox.x + svgBox.width * startXPct;
    const startY = svgBox.y + svgBox.height * startYPct;
    const endX = svgBox.x + svgBox.width * endXPct;
    const endY = svgBox.y + svgBox.height * endYPct;

    if (shiftSnap) {
      await this.page.keyboard.down('Shift');
    }
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, endY, { steps: 5 });
    await this.page.mouse.up();
    if (shiftSnap) {
      await this.page.keyboard.up('Shift');
    }
  }

  /**
   * Draw an ellipse by dragging from (startXPct, startYPct) to (endXPct, endYPct).
   * Optionally hold Shift for circle-snap.
   */
  async drawEllipse(
    startXPct = 0.2,
    startYPct = 0.2,
    endXPct = 0.6,
    endYPct = 0.6,
    shiftSnap = false,
  ): Promise<void> {
    const svgBox = await this.svgOverlay.boundingBox();
    if (!svgBox) throw new Error('SVG overlay not visible');

    const startX = svgBox.x + svgBox.width * startXPct;
    const startY = svgBox.y + svgBox.height * startYPct;
    const endX = svgBox.x + svgBox.width * endXPct;
    const endY = svgBox.y + svgBox.height * endYPct;

    if (shiftSnap) {
      await this.page.keyboard.down('Shift');
    }
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, endY, { steps: 5 });
    await this.page.mouse.up();
    if (shiftSnap) {
      await this.page.keyboard.up('Shift');
    }
  }

  /**
   * Place a Text shape: click at the given position, then type text and press Enter.
   * Returns after the inline input is committed and the text shape appears.
   */
  async placeText(xPct = 0.3, yPct = 0.3, text = 'Hello'): Promise<void> {
    const svgBox = await this.svgOverlay.boundingBox();
    if (!svgBox) throw new Error('SVG overlay not visible');

    const clickX = svgBox.x + svgBox.width * xPct;
    const clickY = svgBox.y + svgBox.height * yPct;

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
    const svgBox = await this.svgOverlay.boundingBox();
    if (!svgBox) throw new Error('SVG overlay not visible');

    const startX = svgBox.x + svgBox.width * startXPct;
    const startY = svgBox.y + svgBox.height * startYPct;
    const endX = svgBox.x + svgBox.width * endXPct;
    const endY = svgBox.y + svgBox.height * endYPct;

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
    const svgBox = await this.svgOverlay.boundingBox();
    if (!svgBox) throw new Error('SVG overlay not visible');

    const startX = svgBox.x + svgBox.width * startXPct;
    const startY = svgBox.y + svgBox.height * startYPct;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();

    for (const [xPct, yPct] of waypoints) {
      await this.page.mouse.move(svgBox.x + svgBox.width * xPct, svgBox.y + svgBox.height * yPct, {
        steps: 3,
      });
    }

    await this.page.mouse.up();
  }

  /**
   * Draw a freehand stroke on touch/mobile viewports using synthetic PointerEvents.
   *
   * On WebKit with hasTouch=true, `page.mouse.*` calls do not reliably propagate
   * `pointerdown`/`pointermove`/`pointerup` events to React's onPointer* handlers.
   * Instead, we dispatch PointerEvents directly on the SVG element via
   * `svgOverlay.evaluate(...)`, which fires them synchronously in the browser
   * context regardless of viewport type. Each segment between waypoints is
   * subdivided into 3 steps so that FreehandTool.onPointerMove captures enough
   * intermediate points for simplifyPolyline to retain ≥ 2 points after RDP.
   *
   * This helper is safe to call on desktop viewports as well — the synthetic
   * dispatch targets the element's event listeners directly, bypassing the
   * mouse-model entirely.
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
    const svgBox = await this.svgOverlay.boundingBox();
    if (!svgBox) throw new Error('SVG overlay not visible');

    const points: Array<[number, number]> = [
      [svgBox.x + svgBox.width * startXPct, svgBox.y + svgBox.height * startYPct],
      ...waypoints.map(([x, y]): [number, number] => [
        svgBox.x + svgBox.width * x,
        svgBox.y + svgBox.height * y,
      ]),
    ];

    // Phase 1: dispatch pointerdown and let React flush the SET_DRAFT state update.
    // If all events fire in one synchronous JS task, React batches the state updates
    // so handlePointerMove sees stale state (draftShape === null) and returns early.
    // Splitting into two evaluate calls — with an rAF yield in between — lets React
    // commit the SET_DRAFT before pointermove events arrive.
    await this.svgOverlay.evaluate((el: Element, pt: [number, number]) => {
      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          clientX: pt[0],
          clientY: pt[1],
          bubbles: true,
          cancelable: true,
        }),
      );
    }, points[0]);

    // Yield one animation frame so React flushes the SET_DRAFT state update
    // before pointermove events arrive.
    await this.page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );

    // Phase 2: dispatch pointermove (subdivided per segment) + pointerup.
    await this.svgOverlay.evaluate((el: Element, pts: Array<[number, number]>) => {
      const dispatch = (type: string, x: number, y: number) => {
        el.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      };

      // Walk each segment, subdividing into 3 steps to give FreehandTool
      // enough intermediate points to survive RDP simplification (≥ 2 points).
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        for (let s = 1; s <= 3; s++) {
          dispatch('pointermove', x0 + (x1 - x0) * (s / 3), y0 + (y1 - y0) * (s / 3));
        }
      }

      // Fire pointerup at the last point
      dispatch('pointerup', pts[pts.length - 1][0], pts[pts.length - 1][1]);
    }, points);
  }

  /**
   * Draw a line (or measurement) drag on touch/mobile viewports using synthetic PointerEvents.
   *
   * Mirrors drawFreehandTouch but for a simple two-point drag (start → end).
   * Subdivides the segment into 5 steps to ensure the tool's onPointerMove
   * handler receives intermediate events. Safe to call on desktop viewports.
   */
  async drawLineTouch(
    startXPct = 0.15,
    startYPct = 0.5,
    endXPct = 0.75,
    endYPct = 0.5,
  ): Promise<void> {
    const svgBox = await this.svgOverlay.boundingBox();
    if (!svgBox) throw new Error('SVG overlay not visible');

    const startX = svgBox.x + svgBox.width * startXPct;
    const startY = svgBox.y + svgBox.height * startYPct;
    const endX = svgBox.x + svgBox.width * endXPct;
    const endY = svgBox.y + svgBox.height * endYPct;

    // Three-phase dispatch to work around React state batching:
    // MeasurementTool reads state.draftShape.x2/y2 in onPointerUp (via React state,
    // not a module-level variable). All events within one synchronous evaluate()
    // call are batched by React, so onPointerUp would see stale x2=startX
    // (distance === 0 → discard). Three separate evaluate() calls with rAF yields
    // ensure each phase flushes before the next one reads state.

    // Phase 1: pointerdown → rAF → React commits SET_DRAFT (x2=startX, y2=startY)
    await this.svgOverlay.evaluate(
      (el: Element, pt: [number, number]) => {
        el.dispatchEvent(
          new PointerEvent('pointerdown', {
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            clientX: pt[0],
            clientY: pt[1],
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      [startX, startY] as [number, number],
    );
    await this.page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );

    // Phase 2: pointermove (5 steps) → rAF → React commits final x2=endX, y2=endY
    await this.svgOverlay.evaluate(
      (el: Element, coords: [number, number, number, number]) => {
        const [sx, sy, ex, ey] = coords;
        const dispatch = (type: string, x: number, y: number) => {
          el.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 1,
              pointerType: 'touch',
              isPrimary: true,
              clientX: x,
              clientY: y,
              bubbles: true,
              cancelable: true,
            }),
          );
        };
        // Subdivide into 5 steps so the tool's onPointerMove fires multiple times
        for (let s = 1; s <= 5; s++) {
          dispatch('pointermove', sx + (ex - sx) * (s / 5), sy + (ey - sy) * (s / 5));
        }
      },
      [startX, startY, endX, endY] as [number, number, number, number],
    );
    await this.page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );

    // Phase 3: pointerup — state.draftShape.x2/y2 now reflects the final endpoint
    await this.svgOverlay.evaluate(
      (el: Element, pt: [number, number]) => {
        el.dispatchEvent(
          new PointerEvent('pointerup', {
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            clientX: pt[0],
            clientY: pt[1],
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      [endX, endY] as [number, number],
    );
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
}
