---
name: story-1901-ai-report-content
description: Story #1901 (AI-generated report usage descriptions + cover letter) — Blocker bug #1915, mocked-provider service-test seam, fake-timer leak fix, ripple-effect llmEnabled additions.
metadata:
  type: project
---

# Story #1901 — AI report content generation (2026-07-31)

## CRITICAL finding: Blocker bug #1915 (backend, still open at session end)

`server/src/services/reportContentGenerationService.ts` line 9 imports non-existent schema
exports:
```ts
import { invoices, work_items, household_items } from '../db/schema.js';
```
The actual exports are camelCase (`workItems`, `householdItems`) — `work_items`/`household_items`
only exist as the SQL table names passed to `sqliteTable(...)`, not as JS/TS identifiers. Confirmed
via `npx tsc -p server/tsconfig.json --noEmit` (2 × TS2724) — not a test-harness artifact.

**Blast radius is the entire server**, not just reports: `app.ts` statically imports
`routes/sourceReports.js` → `reportContentGenerationService.js` at module-load time, so this bad
import poisons the whole ESM module graph. `buildApp()` fails for EVERY test file that calls it —
confirmed by `server/src/plugins/config.test.ts` and `server/src/routes/config.test.ts` (neither
touches reports code) both failing with the identical `SyntaxError: ... does not provide an export
named 'household_items'`. Filed as https://github.com/steilerDev/cornerstone/issues/1915.

Wrote `server/src/services/reportContentGenerationService.test.ts` (14 tests) and
`server/src/routes/sourceReports.generateContent.test.ts` (~20 tests) fully against the intended
behavior per the GH issue #1901 acceptance criteria and the (correct, already-updated) API Contract
wiki page — both fail at import time until #1915 lands. Did NOT weaken either file or touch
production code. Re-run both once the fix merges — no test-file changes should be needed.

## Test-seam choice: mock getProvider(), not globalThis.fetch, for the new service test

Unlike `invoiceAutoItemizeService.test.ts` (which stubs `globalThis.fetch` end-to-end),
`reportContentGenerationService.test.ts` mocks the whole `./budgetExtraction/index.js` module via
`jest.unstable_mockModule` and asserts directly on the `GenerateReportContentLlmInput` object
handed to the mocked `provider.generateReportContent(input)`. This is deliberate: the interesting
logic in this service is DB-row → prompt-input assembly (filtering, truncation, includedTotal
rounding, linked-item enrichment) — mocking the provider lets tests assert on that input precisely
instead of parsing rendered prompt text out of a fetch-call body. Wire-level LLM behavior
(response_format shaping, wire-format array→Record conversion, truncation, finishReason handling)
is separately and fully covered by `openAICompatibleProvider.test.ts`'s new
`generateReportContent()` describe blocks — don't duplicate that here.
`getSourceReport()` itself runs for real against a seeded in-memory SQLite DB (same pattern as
`sourceReportService.test.ts`) since re-testing its own DB logic isn't this file's job either.

Route-level test (`sourceReports.generateContent.test.ts`) uses the real `invoiceAutoItemize.test.ts`
pattern instead (real `buildApp()` + stub `globalThis.fetch` for the LLM call) since that's an
integration test of the full request→response cycle, matching the QA spec's explicit instruction
to reuse that seam.

## Bug-fix regression tests added (pre-existing hardcode bug, now fixed in prod code this story)

`providerProfiles.ts`'s anthropic branch used to hardcode `EXTRACTED_LINES_SCHEMA` into every
`response_format.json_schema` regardless of caller — fixed this story by making `responseSchema` a
required `RequestBodyInput` field. Added 3 permanent regression tests in `providerProfiles.test.ts`
(`describe('anthropic schema selection is call-site-specific (Story #1901 bug fix)')`) that pin
`extract()`/`summarizeMerge()`/`generateReportContent()` each getting their OWN schema name
(`extracted_lines`/`merge_result`/`report_content`) on the anthropic profile — guards against the
hardcode regressing. Existing `common` fixture in that file now needs
`responseSchema: EXTRACTED_LINES_SCHEMA` added (required field) — every pre-existing
`buildRequestBody({...common, provider})` call site was otherwise a tsc error.

## Fake-timer leak fix pattern (applies to ANY multi-test file with one fake-timer test)

`jest.isMockFunction(setInterval)` is NOT a reliable way to detect whether Jest's modern fake timers
are active — it does not reliably return true, so an `afterEach` guarded by it never calls
`jest.useRealTimers()`, and fake timers leak into every subsequent test in the file. Symptom: all
LATER tests in the same file fail with `renderPage()` producing an empty `<body><div /></body>` —
looks like a total render crash but is actually silently-stuck effects/promises under leaked fake
timers. Fix: call `jest.useRealTimers()` unconditionally in `afterEach` (no-op when real timers are
already active) rather than trying to detect fake-timer state first.

For the elapsed-seconds counter test itself: enable fake timers AFTER real-timer UI navigation
(`userEvent` needs real timers to avoid hanging) but BEFORE the click that triggers the
`isGeneratingAi`-keyed `useEffect`'s `setInterval` — order matters, since an interval created before
`jest.useFakeTimers()` remains a real interval unaffected by `advanceTimersByTime`. Use
`fireEvent.click` (not `userEvent.click`) for that specific click once fake timers are active, then
`act(() => jest.advanceTimersByTime(3000))`. Mock the async call
(`mockGenerateReportContent.mockReturnValue(new Promise(() => {}))`) to a never-resolving promise so
`isGeneratingAi` stays true for the whole test. Mirrors the existing
`AutoItemizePage.test.tsx` "elapsed counter increments with fake timers" test — same recipe.

## Ripple-effect: llmEnabled added to AppConfig (required field, not optional)

`AppConfig.llmEnabled: boolean` (alias of `autoItemizeEnabled`) is a required field — every
object literal typed `: AppConfig` or built via a `makeConfig()`-style factory needs it or `tsc`
fails (TS2741/2739-style "missing property"). Grep `": AppConfig {"` AND `"AppConfig =>"` /
`"AppConfig)"` to find ALL factories — the exact-string grep alone missed 2 files
(`backupService.test.ts`, `draftCleanupService.test.ts`) that use an arrow-function factory shape
instead of a named-function-returning-AppConfig shape. Also check `loadConfig()`'s own
`toEqual({...})` snapshot-style assertions in `plugins/config.test.ts` (4 occurrences) and the
route's exact-shape assertion (`Object.keys(body).sort()`) in `routes/config.test.ts` — both need
the new key added or they fail on the now-larger object. Client-side counterpart: any strictly-typed
`AppConfigResponse` mock (`LocaleContext.test.tsx` in this case, 5 occurrences across the file, one
with a differently-shaped closing brace `} as AppConfigResponse)` that a `replace_all` on the common
`});` pattern missed — always re-grep after a bulk edit to catch outliers).

## Existing-test breakage found (not spec-listed, but was pre-existing at session start)

`ReportWizardPage.test.tsx` (uncommitted-at-session-start file) was ALREADY broken before I wrote
anything: production code added `fetchConfig()` to the init `Promise.all` and imports
`generateReportContent` by name from `sourceReportsApi.js`, but the test file's
`jest.unstable_mockModule('../../lib/sourceReportsApi.js', ...)` mock didn't export that name
(`SyntaxError: does not provide an export named 'generateReportContent'`) and there was no
`configApi.js` mock at all (would have made the real `fetch('/api/config')` call reject in jsdom,
failing the whole init `Promise.all` and leaving `budgetSources` empty). Fixed by adding a
`configApi.js` mock (default `llmEnabled: false`) and `generateReportContent` to the existing
sourceReportsApi mock, plus a `mockFetchConfig.mockResolvedValue(...)` default in `beforeEach`. All
61 pre-existing tests passed immediately once fixed — this was a mock-shape drift from concurrent
production changes, not a logic bug. General lesson: when a spec says "extend/verify existing test
X", always actually RUN it first before assuming it already passes.

## Coverage notes

- `applyAiContent.ts`: 94.44% stmts (1 unreachable `if (!row) continue` sparse-array guard, same
  `noUncheckedIndexedAccess` pattern documented elsewhere — not a real gap).
- `ReportWizardPage.tsx` (modified file, not new): 98.01% stmts / 100% funcs / 99.38% lines across
  both test files combined. Only gap: lines 520-522, the client-side `EMPTY_SELECTION` guard inside
  `runAiGeneration` — unreachable via the UI since step 3's Next button is already disabled whenever
  ALL invoices are excluded (same condition `runAiGeneration` re-checks), so this is dead/defensive
  code, not a real gap to chase.
- `openAICompatibleProvider.ts`, `providerProfiles.ts`, `sourceReportsApi.ts`, `Step4Settings.tsx`:
  100% (or the pre-existing-file ceiling for the former, unrelated to this story's additions).
