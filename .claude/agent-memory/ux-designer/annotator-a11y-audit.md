---
name: annotator-a11y-audit
description: Photo Annotator a11y/UX audit findings from Story #1478 — HIGH/MEDIUM/LOW findings and confirmed-working patterns
metadata:
  type: project
---

## HIGH Findings (Story #1478 Audit)

**H1 — Active button border contrast fails WCAG 1.4.11**
- `border-color: var(--color-primary)` (#3b82f6) on `--color-primary-bg` (#dbeafe) = 2.25:1 — fails 3:1 minimum
- Fix: `border-color: var(--color-primary-active)` (#1d4ed8, 6.67:1 on white) + `border-width: 2px`
- Applies to `.toolButtonActive`, `.strokeButtonActive`, `.fontSizeButtonActive`
- Dark mode passes (blue-400 on transparent over slate-800 ≈ 4.5:1)

**H2 — 7 of 9 shape types missing live-region announcement**
- Keys exist in i18n (`shapeAddedRectangle` etc.) but never wired to `liveRegionRef.current.textContent`
- Only `shapeAddedMeasurement` (line 167) and `shapeAddedFreehand` (line 542) are announced
- Also missing: `shapeDeleted`, `undoPerformed`, `redoPerformed` — keys exist, never used
- Fix: hook COMMIT_DRAFT dispatch in `handlePointerUp` (same pattern as freehand); announce after text/callout inline input commit; announce delete and undo/redo

**H3 — Color swatches 24×24px fail WCAG 2.5.5 (44px minimum)**
- Fix: `padding: 10px; box-sizing: content-box` on `.swatchButton` — 24px visual + 20px padding each side = 44px tap area

## MEDIUM Findings

**M1 — `height: 56px` hard-clips wrapped content; should be `min-height: 56px`**
When font-size group is visible (text/callout/measurement tool), total content > viewport width, wraps to second row, clips under 56px.

**M2 — `role="toolbar"` has no roving tabindex**
All 14+ buttons in natural tab order. Must implement: only active tool in tab order, Left/Right arrows move between tool buttons.

**M3 — Escape key double-fires (PhotoViewer + PhotoAnnotator both have window listeners)**
PhotoViewer handles it first (correct). PhotoAnnotator's handler is redundant and potentially fragile. Remove Escape from PhotoAnnotator; PhotoViewer owns annotator lifecycle.

**M4 — Selection state change not announced**
No `shapeSelected` i18n key exists. Add `"shapeSelected": "{{type}} selected"` + wire live-region after `SELECT_SHAPE` dispatch.

**M5 — `color: white` in `.inlineTextInput` must be `color: var(--color-text-inverse)`**
Action bar and overlay use `rgba(0,0,0,*)` backgrounds (documented exceptions). Text on those surfaces must use `var(--color-text-inverse)` not keyword `white`.

## LOW Findings

**L1** — `document.querySelector('[data-testid="tool-select"]')` used to focus first button; use a scoped ref instead.

**L2** — Save button `aria-label` doesn't update to `t('saving')` during save (visible text changes but label doesn't). Either remove `aria-label` or make it dynamic: `aria-label={isSaving ? t('saving') : t('save')}`.

**L3** — `TextIcon` uses `<text>` SVG element — inconsistent with stroke-path icon family. Replace with stroked-path T (deferred polish).

**L4** — Explicit `font-family` in `.inlineTextInput` — remove; rely on global `index.css` stack.

## Confirmed Working (no action)

All tool buttons: `aria-label` via `t()`, `aria-pressed`, `min-width/height: 44px`, `box-shadow: var(--shadow-focus)`, dark mode via tokens, `prefers-reduced-motion` guards. Color swatches: `aria-checked` + non-color ring indicator. Inline input: auto-focus via `requestAnimationFrame`, Escape/Enter handling, `aria-label`. Focus return: PhotoViewer restores to `annotateBtnRef` on save/cancel. Annotation colors: intentionally hardcoded hex. Action bar dark overlay: documented exception.
