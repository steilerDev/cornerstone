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
 *   - annotator-undo   — Undo button
 *   - annotator-redo   — Redo button
 *
 * PhotoAnnotator action bar:
 *   - annotator-save   — Save button
 *   - annotator-cancel — Cancel button
 */

import type { Page, Locator } from '@playwright/test';

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

  // ── PhotoAnnotator drawing surface ───────────────────────────────────────────

  /**
   * SVG overlay on which pointer events are dispatched to draw shapes.
   * role="application", aria-label matching i18n key "canvas".
   * Shapes appear as <rect> children of this element.
   */
  readonly svgOverlay: Locator;

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

    // SVG canvas — role="application" inside the annotator canvas area
    this.svgOverlay = page.locator('[role="application"]');

    // Annotator action bar
    this.saveButton = page.getByTestId('annotator-save');
    this.cancelButton = page.getByTestId('annotator-cancel');
    this.undoButton = page.getByTestId('annotator-undo');
    this.redoButton = page.getByTestId('annotator-redo');
  }
}
