---
name: photo-annotator-patterns
description: Styling/a11y patterns for PhotoAnnotator (toolbar, shapes, dark-surface overlays, fit-to-container scaling)
metadata:
  type: project
---

Patterns for `client/src/components/photos/PhotoAnnotator/`. Consult before specifying or reviewing changes to this component.

- Tool palette: `role="toolbar"` wrapper; each button `.toolButton` / `.toolButtonActive`; `min-width/height: 44px`; `aria-pressed`; inline SVG icons (24×24, `stroke="currentColor"`); HighlightIcon uses `fill="currentColor"` (established precedent)
- Annotator dark-surface rgba values: `rgba(0,0,0,0.6)`, `rgba(255,255,255,0.4)` etc. in PhotoAnnotator.module.css are intentional photo-overlay hardcodes (pre-existing pattern); do NOT flag as token violations
- Font-size radiogroup: `role="radiogroup"` + `role="radio"` + `aria-checked`; buttons use `.fontSizeButton`/`.fontSizeButtonActive`; hover inside `prefers-reduced-motion` block (consistent with toolButton + strokeButton pattern)
- Inline text input (Story #1476): `.inlineTextInput` positioned absolute over canvas; focus managed via `requestAnimationFrame`; `aria-label` via `t('editText'|'editCallout')`; `z-index: 1000` is pre-existing (should be `var(--z-modal)`, refinement item); inline style should NOT duplicate CSS module's `min-width`/`z-index`
- TextIcon uses SVG `<text>` element (not stroked path) — inconsistent with stroke icon family; flag for polish pass
- Annotation colors in `ANNOTATION_COLORS` are intentionally hardcoded hex (not tokens) — marks must be theme-invariant; document this in any spec touching that file
- Draft shape visual: `stroke-dasharray: 6 4`, `opacity: 0.8`, `pointer-events: none` — use for ALL new shape types
- Arrow committed: `<line>` + `<marker>` with `fill="context-stroke"` so one defs entry covers all colors; arrowhead on commit only (not during draft)
- Ellipse selection handles: 4 cardinal points (N/S/E/W) not 8; Arrow/Line: 2 endpoint handles
- `context-stroke` SVG2 fill on marker = no dark mode override needed for arrowhead
- Mobile: `.toolGroup` gets `width:100%` + bottom border at `<640px` via existing media query — no new CSS needed for new buttons
- Fit-to-container scaling (fix #1705): `fitScale = min(containerW/intrinsicW, containerH/intrinsicH, 1.0)`; Stage gets `width={intrinsicW*fitScale}` `height={intrinsicH*fitScale}` `scaleX/Y={fitScale}`; KonvaImage keeps `width={intrinsicW}` `height={intrinsicH}`; cap at 1.0 prevents upscaling small photos
- `touch-action: none` on `.canvasArea` and `.svgOverlay` only — correctly scoped to canvas area; does NOT affect scroll outside the annotator
- `sizeDropdownSelect:focus-visible` uses `outline: 2px solid var(--color-focus-ring)` (inconsistent with `box-shadow: var(--shadow-focus)` convention) — pre-existing refinement item

See also [[annotator-a11y-audit]] for the Story #1478 audit findings (active-button contrast, ToolPalette min-height, color swatch touch targets, missing live-region announcements).
