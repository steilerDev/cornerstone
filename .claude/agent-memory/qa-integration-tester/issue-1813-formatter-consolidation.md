---
name: issue-1813-formatter-consolidation
description: QA notes for Issue #1813 (formatter consolidation) — LocaleProvider-wrap test pattern, CODE_BUG found in BudgetSourcesPage.tsx, ts-jest client-project diagnostic gap, dead-code finding in SignatureCapture.tsx
metadata:
  type: project
---

## Issue #1813 — formatter consolidation (formatDate monthStyle, formatPercent digits, +5 new formatters)

**Why:** repo sweep found 14 raw `toLocaleDateString`/`Intl` call sites bypassing `formatters.ts`; issue routed them
through `useFormatters()`/new pure functions (`formatWeekdayShort`, `formatWeekdayMonthDay`, `formatFileSize`,
`formatHours`, `formatDateTimeWithZone`).

### Pattern: "shadow render" wrapper for LocaleProvider (reuse for any component using useFormatters())

When a production component switches to `useFormatters()`, every existing test in its `.test.tsx` file that calls
bare `render(<Component />)` starts throwing `useLocale must be used within a LocaleProvider` — even innocuous
tests unrelated to the formatter change. Fix by shadowing the RTL import, not touching every call site:

```tsx
import { render as rtlRender, screen } from '@testing-library/react';
import { LocaleProvider } from '<path-to>/contexts/LocaleContext.js';
function render(ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) {
  return rtlRender(<LocaleProvider>{ui}</LocaleProvider>, options);
}
```
Works even when `ui` already contains `<MemoryRouter>` — LocaleProvider just wraps whatever is passed.
For files using the shared `renderWithRouter` from `client/src/test/testUtils.tsx`, do NOT edit that shared util
(16 consumers) — instead define a local `renderWithRouter` override combining `<LocaleProvider><MemoryRouter>`.

Always add `localStorage.clear()` in `beforeEach`/`afterEach` once any test in the file does
`localStorage.setItem('locale', 'de')` — jsdom localStorage persists across tests in the same file/worker.

**Locale-variant test gotcha**: once a component renders translated strings (`t()`), switching `locale=de` changes
**all** translated accessible names/labels/button text, not just the formatter output under test. Query
locale-dependent components by stable CSS class (`container.querySelector('.acceptButton')`,
`container.querySelector('canvas')`) rather than `getByRole('button', {name: '...'})` /
`getByLabelText('...')` in any test that sets `locale=de`, or the query itself will fail before you even get
to the formatter assertion.

### CODE_BUG found and reported: BudgetSourcesPage.tsx `formatPercent` ReferenceError

`client/src/pages/BudgetSourcesPage/BudgetSourcesPage.tsx` — `SourceBarChart` destructures the prop as
`formatPercent: _formatPercent` (line 95) but the diff introduced two call sites (lines 183–184) that reference
the bare identifier `formatPercent`, which doesn't exist in that scope. Confirmed via
`npx tsc -p client/tsconfig.json --noEmit` (TS2552 "Cannot find name 'formatPercent'. Did you mean
'_formatPercent'?") **and** at runtime: a test that hovers a `.segment` div (`fireEvent.mouseEnter`) to trigger
the tooltip render throws `ReferenceError: formatPercent is not defined`. The bug was latent/undetected by the
108 pre-existing tests because none of them ever hover a segment. Test written and left in place (documents
correct expected behavior); it will pass once the fix lands (rename destructure to `formatPercent`, or use
`_formatPercent` at the two call sites). Fix belongs to `frontend-developer`, not QA.

### ts-jest gap (client project only): does NOT catch this class of TS error at test-run time

`npx jest BudgetSourcesPage.test.tsx` passed 108/108 *before* my hover test was added, despite the file having a
real TS2552 compile error the whole time. The client project's `jest.config.ts` ts-jest transform uses an
**inline** `tsconfig` object (`module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', ...`), not a path
to `client/tsconfig.json` — this produces isolatedModules-like behavior that does NOT do full-program
type-checking, so scope-resolution errors like "cannot find name" silently pass through as valid JS at runtime
(the bare `formatPercent` identifier survives transpilation and only throws `ReferenceError` if the code path
actually executes). **Always run `npx tsc -p client/tsconfig.json --noEmit`** (or the equivalent server/shared
tsconfig) as a supplementary check when reviewing frontend-developer changes — `npx jest --coverage` alone will
not surface this bug class unless a test happens to exercise the exact broken line. CI's separate `npm run
typecheck` step *does* catch it (uses the real tsconfig.json), so this is CI-safe but Jest-blind locally.

### Discovered dead code (out of scope, not touched): SignatureCapture.tsx lines 113–127

The "load existing signature image" `useEffect` (`if (!canvas || !signature) { setHasStrokes(false); return; }`
then `canvas.getContext('2d')` ... `img.onload` draws onto canvas) can never execute its body: the component's
signature-present render branch (`if (signature) return (...)`) renders a plain `<img>` tag, never a `<canvas>`
element, so `canvasRef.current` is always `null` whenever `signature` is truthy — the effect always takes the
early-return path. Confirmed via coverage: these lines stay uncovered (7 stmts) regardless of test scenario,
capping `SignatureCapture.tsx` statement coverage at ~89% (line coverage 95.75%, funcs 96.66%). Not part of
Issue #1813's diff — flagged as a discovered follow-up, not fixed (QA does not modify production code).

### File-size mock pattern for locale-aware Intl mocks (BackupsPage.test.tsx)

When a component's `formatters.js` module is *fully* `jest.unstable_mockModule`'d (not a partial mock), and you
need a locale-switchable mock function (e.g. `formatFileSize`), declare a mutable `let mockFormattersLocale =
'en-US';` **above** the `jest.unstable_mockModule(...)` call and reference it inside the factory closure — reset
it in `beforeEach`. The factory function isn't invoked until the dynamic `import()` inside `beforeEach` runs, by
which point the `let` has already initialized, so closure capture works correctly despite declaration-order
looking suspicious.

### Follow-up CI fix (PR #1845, branch fix/1813-formatters-locale): consumer-blast-radius gap

The initial sweep missed 3 suites that mock `formatters.js`/`LocaleContext.js` per-file via
`jest.unstable_mockModule` rather than through the shared `render` wrapper or `testUtils.tsx` — CI failed on:
- `GanttChart.test.tsx`: `GanttHeader` (rendered by `GanttChart`) started statically importing the new
  `formatWeekdayMonthDay` as a bare top-level named export (NOT via `useFormatters()`), so the file's existing
  `jest.unstable_mockModule('../../lib/formatters.js', ...)` block needed a new top-level key added alongside
  `formatCurrency`/`formatDate`/`formatPercent` — outside the `useFormatters` mock's return object.
- `DocumentBrowser.test.tsx` and `DiaryEntryEditPage.test.tsx`: a descendant started calling `useLocale()`
  directly (not via `formatters.js`), so these files needed a *new* `jest.unstable_mockModule('.../LocaleContext.js', ...)`
  block added (mirroring the standard shape: `locale`/`resolvedLocale: 'en'`, `currency: 'EUR'`,
  `setLocale`/`syncWithServer: jest.fn()`, passthrough `LocaleProvider`) — `formatters.js` itself stayed unmocked
  in both.

**Lesson**: when a component gains `useFormatters()` or a new static formatter/locale import, the
consumer-blast-radius sweep must include every ancestor→descendant render chain, not just direct importers —
search for `jest.unstable_mockModule('.../formatters.js'` AND `'.../LocaleContext.js'` across the whole client
tree, and check whether the *specific new symbol* is exported at the mock's top level vs. nested inside the
`useFormatters` return, since a component can consume the same module both ways in different files.

### Canvas mocking pattern for jsdom (new SignatureCapture.test.tsx, closed prior test-file-parity gap)

jsdom has no real 2D canvas context (project policy forbids native `canvas` npm package). Stub
`HTMLCanvasElement.prototype.getContext` to return a plain object of `jest.fn()`s (`scale, fillRect, clearRect,
beginPath, moveTo, lineTo, stroke, save, restore, fillText, drawImage` + writable style props), stub `.toDataURL`
to return a fixed string, and stub `Element.prototype.getBoundingClientRect`. Save/restore all three in
`beforeEach`/`afterEach`. `fireEvent.mouseDown` + `fireEvent.mouseMove` on the canvas sets `hasStrokes=true`
(the component's `handleMouseMove` early-returns before `setHasStrokes(true)` if `ctx` is falsy — this is why the
stub must return a truthy object, not `null`). To test locale-specific burned text
(`ctx.fillText` call args), use `jest.useFakeTimers({ now: new Date(...) })` to pin `new Date()` inside
`handleAccept`, pick a month where en/de diverge (May → Mai), and assert on
`mockCtx.fillText.mock.calls[...]`.
