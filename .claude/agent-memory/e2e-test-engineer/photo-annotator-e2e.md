---
name: photo-annotator-e2e
description: Photo Annotator E2E test patterns, tool interactions, POM helpers — Bug #1482 fixed 2026-05-29
metadata:
  type: project
---

# Photo Annotator E2E — Story #1478

## POM: PhotoViewerPage.ts

Extended in Story #1478 to cover all 10 tools. New locators:

- `arrowToolButton` → `data-testid="tool-arrow"`
- `lineToolButton` → `data-testid="tool-line"`
- `ellipseToolButton` → `data-testid="tool-ellipse"`
- `textToolButton` → `data-testid="tool-text"`
- `calloutToolButton` → `data-testid="tool-callout"`
- `measurementToolButton` → `data-testid="tool-measurement"`
- `freehandToolButton` → `data-testid="tool-freehand"`
- `inlineInput` → `data-testid="annotator-inline-input"`

New POM helper methods: `activateTool(name)`, `drawRectangle()`, `drawLine()`, `drawEllipse()`, `placeText()`, `drawCallout()`, `drawMeasurement()`, `drawFreehand()`, `drawFreehandTouch()`, `saveAnnotation()`, `enterTextLabel()`.

## SVG Element Types per Tool

| Tool        | SVG element in committed state         |
| ----------- | -------------------------------------- |
| rectangle   | `<rect data-shapeid>`                  |
| highlight   | `<rect data-shapeid>` (fill, opacity)  |
| arrow       | `<line data-shapeid>` + marker-end     |
| line        | `<line data-shapeid>` no marker-end    |
| ellipse     | `<ellipse data-shapeid>`               |
| text        | `<text data-shapeid>`                  |
| callout     | `<g data-shapeid>` with rect+line+text |
| measurement | `<g data-shapeid>` with lines + text   |
| freehand    | `<polyline data-shapeid>`              |

## Bug #1482 — FIXED (2026-05-29, commit 0184aaaf)

DiaryEntryDetailPage now passes `onPhotoAnnotated` to PhotoViewer. After a
successful PUT /annotation, PhotoViewer calls `onPhotoAnnotated(updatedPhoto)`
which updates `currentPhoto` state immediately — no page reload or re-navigation
required.

**Removed from test file:**

- `buildAnnotatedPhotosMockBody()` helper function
- `reopenViewerWithAnnotatedPhoto()` helper function
- `photosApiGlob` local variables
- `page.route()` GET /api/photos mocks
- Close-viewer + re-navigate-with-mock flow

**New pattern (Scenarios 1 and 21):** After PUT 200, assert in-place:

```ts
await expect(viewer.viewOriginalButton).toBeVisible();
await expect(viewer.clearAnnotationsButton).toBeVisible();
```

After DELETE 204 (clear), assert in-place:

```ts
await expect(viewer.viewOriginalButton).not.toBeVisible();
await expect(viewer.clearAnnotationsButton).not.toBeVisible();
```

## Tool Interactions

- **Line Shift-snap**: hold Shift during drag → snaps to 45° increments. Test by
  dragging ~5° off horizontal with Shift; check `|y1 - y2| < 2` in SVG attrs.
- **Ellipse Shift-snap**: hold Shift → equal radii (circle). Check `|rx - ry| < 1`.
- **Text placement**: click SVG → `annotator-inline-input` appears → fill → Enter commits.
  Escape discards (no `<text data-shapeid>` committed).
- **Callout two-phase**: drag box (Phase 1 → pointerUp), click for tail (Phase 2 → pointerUp
  opens inline input). Box size must be ≥ 20×16 image pixels or it's discarded.
- **Measurement**: drag line → pointerUp opens inline input at midpoint. Enter commits
  with label (text shown). Escape also commits (preserves line, empty label → `display:none`).
- **Freehand**: drag → pointerUp commits simplified polyline. Works via `page.mouse` on
  all viewports (pointer events fire on mobile WebKit too).

## Color Palette

Color swatches use `role="radio"` inside `role="radiogroup"`. Order: red, yellow,
green, blue, black, white. Check `aria-checked="true"` on active swatch, and
`stroke` attribute on committed rect shape.

## Timeouts

- Tools that require Save (canvas toBlob + PUT): 25–30s
- Multi-tool lifecycle with Clear: 60s on @responsive
- @responsive tests on tablet/mobile: 40s base

## CRITICAL: waitFor vs expect.toBeVisible timeout difference

`locator.waitFor({ state: 'visible' })` uses `actionTimeout` (5 s globally).
`expect(locator).toBeVisible()` uses `expect.timeout` (7 s on desktop project).

On a 2-vCPU CI shard running testcontainers, shape commits via `undoStack.commit()`
(a useState setter called inside a useReducer) require TWO async React renders before
the shape appears in the DOM. This takes > 5 s on loaded shards.

**Rule**: All shape appearance assertions after drawing MUST use either:

- `expect(locator).toBeVisible()` (uses expect.timeout: 7 s), OR
- `waitFor({ state: 'visible', timeout: 15_000 })` with try/catch diagnostic logging

**Arrow test passes, line test fails** because arrow uses `expect(...)` and line used
bare `waitFor({state:'visible'})`. Selector correctness is not the issue — the shape
DOES appear, just after the 5s actionTimeout fires.

**Fixed in PR #1491**: Added explicit `timeout: 15_000` to all `waitFor({ state: 'visible' })`
calls in photoAnnotation.spec.ts that assert shape appearance after drawing. Added
try/catch + SVG innerHTML logging to the 3 CI-failing tests (line draw, line shift-snap,
callout smoke) for future diagnosis if failures recur.

**DO NOT** record `waitFor({ state: 'visible' })` without explicit timeout for shape
appearance in SVG — always use `{ timeout: 15_000 }` for annotator shape commits.

## Test Count

- Scenarios 1–3: from Story #1473 (foundation); all ACTIVE
- Scenarios 4–20, 23: 18 scenarios, all `test.fixme` (Konva canvas migration pending)
- Scenario 21: ACTIVE (Bug #1482 fix removed fixme)
- Scenario 22: ACTIVE (tool palette aria-pressed — no canvas shape assertions)
- @smoke tags: scenarios 1, 16, 21 (scenario 12 callout was removed)
- @responsive tags: scenarios 16, 17, 21
- 5 active tests total; 17 fixme tests

**Why:** `@responsive` runs on tablet+mobile projects (grep: `/@responsive/`).
`@smoke` runs in the fast CI E2E Smoke Tests job.

## Konva Canvas Migration (PR #1526 — refactor/photo-annotator-konva)

The annotator was rewritten from SVG to Konva (`<canvas>`). All SVG shape locators
(`g/line/rect/ellipse/polyline/text[data-shapeid]`) no longer exist in the DOM.
Shapes have no DOM representation — Konva renders them onto the canvas element.

**All 21 SVG-coupled tests marked `test.fixme()`** in `photoAnnotation.spec.ts`.

**2 tests kept active** (no SVG shape locator assertions):

- Scenario 2: Cancel annotation — asserts toolPalette gone, no PUT fired (no shape DOM check)
- Scenario 22: Tool palette UI state — asserts aria-pressed on tool buttons only

**Fixme breakdown:**

- Scenarios 1, 4–21, 23: `test.fixme(...)` with "TODO: rewrite for Konva canvas — ..."
- All smoke-tagged fixme tests: 1, 12, 16, 21 (smoke tag kept in fixme metadata)

**Rewrite strategy when Konva tests are reimplemented:**

- Use `page.evaluate()` with Konva's `stage.findOne()` API, or
- Use pixel-diff / visual regression (screenshot comparison), or
- Use Konva's internal stage JSON (`stage.toJSON()`) to inspect shape state
- The canvas element has `role="application"` — the wrapper is queryable, but shapes inside are not DOM nodes.
- `svgOverlay.boundingBox()` still works for getting canvas bounds for interaction coordinates.
- Interaction helpers (drawRectangle, drawLine, etc.) still work via page.mouse — the canvas receives pointer events.
- inlineInput (`data-testid="annotator-inline-input"`) is a real HTML input overlay — still queryable.
