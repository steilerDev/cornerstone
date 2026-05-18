---
name: pr-1490-measurement-freehand
description: PR #1490 design review findings — measurement and freehand annotator tools
metadata:
  type: project
---

## PR #1490 Review Findings — Measurement & Freehand Tools (APPROVED via comment)

Cannot approve own PRs — used `--comment` with would-have-been approval note.

### Key patterns confirmed correct

- MeasurementIcon / FreehandIcon both comply: 24×24, `stroke="currentColor"`, `strokeWidth="2"`, `fill="none"` on SVG root
- FreehandIcon uses `strokeLinejoin="round"` on `<path>` — correct
- Selection overlays use `var(--color-primary)` + `var(--color-bg-primary)` — semantic tokens, automatic dark mode
- `TICK = strokeWidth * 4` proportional tick sizing — visually balanced
- Label offset: `-nx/ny * fontSize * 0.6` perpendicular above midpoint — geometrically sound
- Freehand bounding box selection (no per-point handles) — correct UX for polyline
- Live region: `t('shapeAddedMeasurement')` and `t('shapeAddedFreehand')` — correct i18n pattern
- `stroke-dasharray: 'none'` is a pre-existing pattern across all shapes in render.ts — not a new issue

### Medium finding for refinement (#1478)

`render.ts:240`: `labelAttrs` returns `{ display: 'none' }` when label is empty, but callers guard with `{result.children && ...}` so the attrs are never actually used. Dead code smell — future caller could misuse. Recommend returning null discriminant instead.

### `MeasurementShape` interface (useUndoStack.ts)

Has both `stroke` (line/tick color) and `color` (text fill) — same dual-property pattern as `CalloutShape`. render.ts correctly uses each.

**Why:** [[photo-annotator-patterns]]
