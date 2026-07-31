---
name: story-1900-editable-report-preview
description: Story #1900 editable report content (reportContent/*, EditableField, ReportContentEditor) — 3 confirmed production bugs, all fixed across 3 rounds (Retry button took 2 fix attempts to land for real), 1 still-open CSS-only bug (undetectable via jsdom), coverage-tool line-vs-statement gotcha, dual-tree (desktop+mobile) query-scoping pattern.
metadata:
  type: project
---

Story #1900 (2026-07-31) refactored the report wizard's PDF pipeline from raw-report-driven
pdfmake generation to an editable-content pipeline: `client/src/lib/reportContent/{types,
buildReportContent, applyOverrides}.ts` derive/override a `ReportContent` object once;
`reportPdf/{overviewPdf,coverLetterPdf,merge}.ts` were rewritten to consume it (no more data
derivation in that layer); `EditableField` + `ReportContentEditor` render it; `ReportWizardPage`
moved from continuous debounced auto-regeneration to on-demand generation (Preview/Download/
Paperless each call `generateReportPdf` fresh, only on click).

**3 confirmed production bugs found via test-writing** (all reported as findings, tests left
failing per the correct-test-must-not-be-weakened protocol — do not "fix" these tests without
confirming the underlying code was actually fixed first):

1. **Status badge never gets its color class.** `ReportContentEditor.tsx`'s `statusBadgeVariants`
   map is keyed by the raw status (`pending`/`paid`/`claimed`/`quotation`), but `<Badge
   value={row.statusText} .../>` passes the already-TRANSLATED text (`row.statusText` comes
   pre-translated from `buildReportContent.ts`). `variants[value]` never matches, so
   `variant?.className` is always undefined — badges always render with only the generic `.badge`
   class, no status color, regardless of actual status. Test: `ReportContentEditor.test.tsx`.
2. **Mobile responsive layout is entirely missing, not just "incomplete."** The frontend agent
   self-reported this as "structure in place but not fully implemented" — actual state is worse:
   `ReportContentEditor.module.css` defines `.mobileCardList`/`.mobileCard`/`.mobileCardRow` rules
   scoped to `@media (max-width: 767px)` and hides `.table` there, but the `.tsx` never renders any
   element using those classes. Below 767px the table just disappears with **nothing** replacing
   it — dead CSS, not partial implementation. Test: `ReportContentEditor.test.tsx`.
3. **Preview PDF failure is silently swallowed — the modal never opens on failure.**
   `handlePreviewPdf` in `ReportWizardPage.tsx` only calls `setShowPdfPreviewModal(true)` on the
   *success* path (after the `if (!result) { setActionError(...); return; }` early-return).
   `actionError` state IS set on failure, but since the whole preview `<Modal>` JSX is gated by
   `{showPdfPreviewModal && (...)}`, the FormError showing that error text never mounts anywhere.
   User experience: click Preview PDF, it fails, the button just stops spinning, nothing else
   happens — no error, no retry affordance. Spec text ("set url or actionError") implies the modal
   should open either way. Severity: Major. Test: `ReportWizardPage.test.tsx` (2 tests — the
   failure-banner test and the Retry-button test both fail from this one root cause).

Also a smaller **spec deviation** (not a user-facing bug, but worth tracking): the PDF preview
modal never renders `skippedDocuments` inside itself — implementation spec section E said "PDF
Modal ... + skip note inside modal," but the actual JSX only renders the skip list at the page
level (below `ReportContentEditor`), never inside `{showPdfPreviewModal && (<Modal>...)}`.

**i18n**: `client/src/i18n/i18n.parity.test.ts` failed — ALL 18 `sourceReports.editable.*` keys
plus `sourceReports.coverLetter.dateLabel` (a 19th key, used at `ReportContentEditor.tsx:92`, not
in the original 18-key translator spec but genuinely referenced) are present in `en/budget.json`
but **entirely absent** from `de/budget.json` (still `{}` for the `editable` section) — despite the
task briefing claiming "de translations have landed." Translator work for this story had not
actually happened at QA time. Report as a finding for translator, don't silently skip.

**Testing patterns learned:**

- **Inline JSX callback props split "line coverage" from "branch coverage" in a confusing way.**
  A line like `onChange={(value) => onFieldChange('key', value)}` has TWO statements sharing one
  line: (1) creating the arrow-function closure — covered whenever the JSX renders at all; (2) the
  arrow body's call expression — covered only when the callback actually FIRES. Istanbul's text
  reporter lists the whole line as uncovered if either statement is uncovered, so a component with
  N independently-labelled EditableFields (cover letter: sender/recipient/reference/subject/body;
  table: usage/attachmentsNote per row) needs a dedicated "fire onChange AND onReset for every
  field" pass (`it.each` over field keys) even after the "does it render/wire correctly" behavioral
  tests already pass — don't assume rendering assertions imply the callback-body lines are hit.
- **`getByText` normalizes whitespace, so leading/trailing-space translation strings (e.g.
  `editedSuffix: " (edited)"`) must be queried without the surrounding space** (`getByText(
  '(edited)')`, not `getByText(' (edited)')`), or query via `container.querySelector` /
  `getAllByRole` on the parent instead.
- **Badge status-lookup pattern**: when a component builds a `BadgeVariantMap` keyed by a raw enum
  and the `value` prop passed to `<Badge>` doesn't match those keys, `identity-obj-proxy`'s CSS
  module mock (used project-wide, see `jest.config.ts`) makes `styles.statusPaid === 'statusPaid'`
  — so `expect(badge.className).toContain(styles.statusPaid)` is a clean, real assertion of the bug
  (not a false negative from CSS module hashing), unlike in a real webpack build.
- **`useCallback`-wrapped page handlers passing a "raw" vs "adjusted" object matters for
  assertions.** `ReportWizardPage.tsx`'s `generatePdfFromContent()` computes `effectiveReport =
  applyLineExclusions(report, excludedLineIds)` but then calls `generateReportPdf(report, ...)`
  with the RAW (unadjusted) `report` as the first arg — `effectiveReport` is only used to derive
  `includedInvoiceIds`. This is NOT a bug: `report` in the new architecture is only read by
  `merge.ts` for its document-fetch/embed loop (never for `allocatedAmount`), and the actual
  adjusted amounts live in `effectiveContent.rows[].allocatedAmountValueText` (built via
  `buildReportContent(effectiveReport, ...)` inside the page's own `baselineContent` useMemo). A
  test asserting the line-exclusion adjustment must check the 3rd arg (`effectiveContent`), not the
  1st (`report`) — checking the 1st arg for the adjusted amount will (correctly) fail and look like
  a bug when it isn't.
- **Toggling a line-exclusion checkbox to full-exclusion during a "Discard and Continue" test can
  strand the wizard** (excludedInvoiceIds === all invoices disables step 3's Next button) — if a
  guarded-update test uses an invoice-exclusion checkbox as its "dirty-triggering upstream change,"
  remember to re-toggle it back before continuing forward navigation in the same test.
- Reused the established real-render pattern (`realRender.test.ts`): build fixtures via the real
  `buildReportContent`/`applyOverrides`, not raw report objects, when testing override propagation
  end-to-end — picking a target row/field with a genuinely unique baseline value (not the shared
  `'—'` placeholder used by every row lacking budget-line descriptions) is required before asserting
  "the old baseline string is gone" — otherwise the assertion is a false negative/ambiguous match
  against other rows' legitimately-unrelated `'—'` cells.

Coverage achieved (all 95%+ stmts/lines, branch in the 85-100% range with documented
unreachable-by-construction gaps — e.g. `sender.split('\n')[0]?.trim() ?? ''` can never actually hit
its `??` fallback since `.split()` always returns ≥1 element): `buildReportContent.ts` 100/92.14,
`applyOverrides.ts` 96.77/92.1, `EditableField.tsx` 100/100, `ReportContentEditor.tsx` 100/100,
`overviewPdf.ts` 100/98.07, `coverLetterPdf.ts` 100/100, `merge.ts` 100/93.75,
`ReportWizardPage.tsx` 98.65 stmt/100 line/100 func/88.62 branch, `Step5Actions.tsx` 100/96.29.

Test file count/location: `reportContent/{buildReportContent,applyOverrides}.test.ts` (new),
`EditableField/EditableField.test.tsx` (new), `reports/ReportContentEditor.test.tsx` (new),
`reportPdf/{overviewPdf,coverLetterPdf,merge}.test.ts` (full rewrite for new signatures),
`reportPdf/realRender.test.ts` (extended), `ReportWizardPage/{ReportWizardPage,
Step5Actions}.test.tsx` (full rewrite / extension).

---

## Re-verification round (2026-07-31, same day, fix-batch follow-up)

Dev-team-lead reported a batch of 8 fixes landed (frontend + translator). Outcome after re-testing
all 5 target files:

**Confirmed genuinely fixed (regression-guard tests now pass, renamed off "BUG:" titles):**
1. Status badge coloring — `Badge value={row.status}` (raw) now matches `statusBadgeVariants`
   correctly. `ReportContentRow` gained a new `status: string | null` field (raw value, separate
   from the pre-translated `statusText`) in `types.ts`/`buildReportContent.ts` specifically for
   this. `row.statusText` is now only a truthiness gate, never rendered directly.
2. Mobile card list — `ReportContentEditor.tsx` now renders `.mobileCardList`/`.mobileCard` rows
   with real content (all fields, visible labels), not dead CSS.
3. Preview PDF failure — `handlePreviewPdf` now opens the modal BEFORE calling
   `generatePdfFromContent()`, so a failure shows the modal with a `FormError` inside it (was:
   nothing happened at all).
4. Download failure — `handleDownload`'s `!result`/catch paths now call
   `showToast('error', t('sourceReports.downloadFailed'))` (new key, verified present in en+de).
5. Skip note also renders inside the PDF preview modal now (in addition to the page level) — both
   instances render simultaneously once a generation with skips completes.

**NOT actually fixed — still-open, DEEPER bug found on this pass** (do not trust the "modal opens
before generation" framing to mean Retry works): `ReportWizardPage.tsx`'s modal body is
`actionError ? <FormError/> : modalPreviewUrl ? <ReportPdfPreview hasError={!!actionError} .../> :
<p>loading</p>`. Every `actionError`-truthy case is routed to the plain `<FormError>` branch
*before* `<ReportPdfPreview>` is ever considered — so the `hasError` prop passed into
`ReportPdfPreview` is ALWAYS `false` whenever it actually mounts. `ReportPdfPreview`'s own
`hasError` branch (with its "Retry" button, defined in `ReportPdfPreview.tsx`) is dead code,
structurally unreachable via this ternary. A failed Preview PDF click shows a static `FormError`
banner with **no retry affordance inside the modal at all** — user must close and re-click Preview
PDF from the page. Left as a documented failing test in `ReportWizardPage.test.tsx` (only 1
intentionally-failing test in the whole 407-test scope after this round).

**NEW bug found this round (CSS-only, undetectable via jsdom unit tests):**
`ReportContentEditor.module.css` never got the base `.mobileCardList { display: none; }` rule that
`ReportInvoiceList.module.css` and `WizardStepper.module.css` both have (their pattern: base rule
sets `display:none`, then `@media (max-width: 767px)` flips it to `display:flex`/etc., and flips
`.table`/`.stepper` to `display:none` in the same block). `ReportContentEditor.module.css` only has
`.table { display: none; }` inside the media query — `.mobileCardList` has NO base rule at all, so
on a real desktop/tablet browser (>767px) it defaults to `display: block` and renders VISIBLY
beneath the desktop table, duplicating every row's content on screen. Cannot be caught by a jsdom
unit test (no real CSS cascade computed here — `identity-obj-proxy` only maps class names, doesn't
evaluate media queries) — flag for e2e-test-engineer's responsive-viewport coverage or a manual
frontend fix; confirmed by direct comparison of the three `.module.css` files' media-query
structure, not by any test run.

**Dual-tree (desktop table + mobile card list) query-scoping pattern** — applies whenever a
component renders both trees unconditionally (CSS-only responsive, no JS viewport branch): every
`getByText`/`getByDisplayValue`/`getByRole` query for row-level content matches TWICE unless scoped
with `within(container.querySelector('table.table'))` or `within(container.querySelector('.' +
styles.mobileCardList))`. This is the SAME established pattern as `WizardStepper.test.tsx`
(`.stepperMobile` vs `.stepper`) — check for it whenever a `.module.css` file has a bare `.table {
display: none }` (or similar) inside a single `@media` block with no counterpart base rule elsewhere.

**Cross-test mock-queue-pollution trap**: in `ReportWizardPage.test.tsx`, several tests use
`mockGenerateReportPdf.mockRejectedValueOnce(...)` and the file's `beforeEach` only calls
`jest.clearAllMocks()` (clears call history, NOT queued `.mockImplementationOnce`/`mockRejectedValueOnce`
entries — only `mockReset()`/`resetAllMocks()` do that). If an earlier test throws BEFORE it reaches
the code that consumes its queued rejection (e.g., a `getByDisplayValue` ambiguity error thrown
before the button click), that queued rejection silently leaks into whichever LATER test next calls
the same mock — producing a confusing, seemingly-unrelated failure in a completely different
`describe` block (in this round: it made the unrelated "Paperless upload failure" test see the
generic fallback error instead of the ApiClientError-specific one, and made a "shows a
skipped-document note" test see stale state). Symptom to watch for: a test fails when run as part of
the full file but passes in isolation (`-t "test name"`) — that's the tell. Fix root cause (the
earlier test's assertion/query, not the polluted one) and the "unrelated" failure usually resolves
itself.

**Async-continuation-vs-mock-call-count race**: `await waitFor(() => expect(mockX).toHaveBeenCalledTimes(1))`
only proves the mock function was INVOKED — it does NOT prove the `await`-continuation code after
that call (e.g. `const result = await generateReportPdf(...); ...; downloadPdf(result.blob, ...)`)
has finished running. Asserting a DOWNSTREAM effect (`mockDownloadPdf` was called) synchronously
right after that `waitFor` is a race — wrap the downstream assertion in its own `waitFor` instead of
chaining two separate `waitFor`s where the second's precondition doesn't actually guarantee the
first's postcondition.

---

## Final re-verification round (2026-07-31, same day, Retry-button fix confirmed)

Frontend fixed the deeper Retry bug from the previous round: the modal body's ternary changed from
`actionError ? <FormError/> : modalPreviewUrl ? <ReportPdfPreview hasError={!!actionError} .../> :
<p>loading</p>` to `modalPreviewUrl || actionError ? <ReportPdfPreview hasError={!!actionError}
onRetry={handlePreviewPdf} .../> : <p>loading</p>` — the `<FormError>` branch inside the modal is
gone entirely, so every `actionError`-truthy case now reaches `ReportPdfPreview`, whose `hasError`
branch (with its real "Retry" button, wired to `onRetry={handlePreviewPdf}`) is finally reachable.
Confirmed by reading the modal JSX directly (not just trusting the fix claim) before re-running
tests — the prior round's lesson (don't trust a "fix landed" without re-reading the actual ternary)
paid off again here: this time the ternary really was rewritten correctly.

Re-ran the previously-pinned "BUG (STILL OPEN...)" test unmodified first — it now passes for real
(all 123 tests in the ReportWizardPage scope, including this one, passed with zero test-file
changes). Renamed the test off its "BUG:" title to a regression-guard title and updated the file's
top-of-file doc comment (previously said 4/5 fixed, 1 still broken — now says all 5/5 fixed). No
other `FormError` assertions existed inside modal-scoped tests that needed reconciling — the file's
only other `FormError` usage is the unrelated step-3 fetch-retry test, which is a different feature
(page-level fetch error banner, not the PDF preview modal) and was untouched by this fix.

Final full-scope run (`ReportWizardPage` + `ReportContentEditor.test.tsx` + `reportPdf/*`): 13 suites,
266 tests, all green. Coverage on `ReportWizardPage.tsx` alone: 98.65% stmts / 88.62% branch / 100%
funcs / 100% lines — comfortably above the 95% statement target (uncovered lines are pre-existing,
mostly `useCallback` dependency-array closures and unmounted-cleanup branches, not Retry-path related).
Prettier + ESLint clean on the touched test file. Story #1900 QA scope is now fully closed — zero
intentionally-failing tests remain in this story's files (the CSS-only `.mobileCardList` bug from the
previous round is still open but is a frontend/e2e concern, not a unit-test-detectable one; the i18n
`de/budget.json` gap from the first round should also be independently re-checked by translator/QA
before closing the story, not assumed fixed by this round).
